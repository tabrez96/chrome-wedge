import * as s from "./session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: unknown[]) => unknown;

function area() {
  const m = new Map<string, unknown>();
  return {
    m,
    get: async (key: string) => (m.has(key) ? { [key]: m.get(key) } : {}),
    set: async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) m.set(k, v);
    },
    remove: async (key: string) => void m.delete(key),
  };
}

const target = (url: string) => ({
  tabId: 7,
  url,
  attached: false,
  id: "t",
  type: "page",
  title: "",
});
const HOST = "wedge.test";
const ON = { ok: true, status: { state: "attached", host: HOST } };
const OFF = { ok: true, status: { state: "off", host: HOST } };
const tab = () => fake.storage.session.m.get("tab:7");

let fake: ReturnType<typeof makeFake>;
function makeFake() {
  const l: { detach?: Listener; message?: Listener } = {};
  return {
    l,
    storage: { session: area(), local: area() },
    debugger: {
      attach: vi.fn(async (..._a: unknown[]) => {}),
      detach: vi.fn(async (..._a: unknown[]) => {}),
      sendCommand: vi.fn(async (..._a: unknown[]) => {}),
      getTargets: vi.fn(async () => [target("http://wedge.test/")]),
      onDetach: { addListener: (f: Listener) => (l.detach = f) },
    },
    runtime: {
      id: "ext",
      onMessage: { addListener: (f: Listener) => (l.message = f) },
    },
  };
}

const settings = () =>
  fake.storage.local.m.get("settings") as Record<string, unknown>;

beforeEach(() => {
  fake = makeFake();
  vi.stubGlobal("chrome", fake as unknown as typeof chrome);
});
afterEach(() => vi.unstubAllGlobals());

describe("switchOn", () => {
  it("attaches with 1.3, enables focus emulation, stores state and allows the host", async () => {
    expect(await s.switchOn(7)).toEqual(ON);
    expect(fake.debugger.attach).toHaveBeenCalledWith({ tabId: 7 }, "1.3");
    expect(fake.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    expect(tab()).toEqual({ state: "attached", host: HOST });
    expect(settings().allowedSites).toEqual([HOST]);
  });

  it("keeps other settings fields and does not duplicate the host", async () => {
    fake.storage.local.m.set("settings", {
      version: 1,
      suffix: "tab",
      allowedSites: [HOST],
    });
    await s.switchOn(7);
    expect(settings().allowedSites).toEqual([HOST]);
    expect(settings().suffix).toBe("tab");
  });

  it('is a no-op when attached and treats "already attached" as success', async () => {
    fake.debugger.attach.mockRejectedValueOnce(
      new Error("Another debugger is already attached to the tab"),
    );
    expect(await s.switchOn(7)).toEqual(ON);
    expect(await s.switchOn(7)).toEqual(ON);
    expect(fake.debugger.attach).toHaveBeenCalledTimes(1);
  });

  it("keeps both hosts when two tabs switch on together", async () => {
    fake.debugger.getTargets.mockResolvedValue([
      target(`http://${HOST}/`),
      { ...target("http://other.test/"), tabId: 8 },
    ]);
    await Promise.all([s.switchOn(7), s.switchOn(8)]);
    expect(settings().allowedSites).toEqual([HOST, "other.test"]);
  });

  it("refuses pages without a web host", async () => {
    fake.debugger.getTargets.mockResolvedValueOnce([
      target("chrome://newtab/"),
    ]);
    expect(await s.switchOn(7)).toMatchObject({
      ok: false,
      error: "unsupported-page",
    });
    expect(fake.debugger.attach).not.toHaveBeenCalled();
  });

  it("reports attach-failed and stores nothing on attach or focus emulation failure", async () => {
    fake.debugger.attach.mockRejectedValueOnce(new Error("boom"));
    expect(await s.switchOn(7)).toEqual({
      ok: false,
      error: "attach-failed",
      message: "boom",
    });
    fake.debugger.sendCommand.mockRejectedValueOnce(new Error("nope"));
    expect(await s.switchOn(7)).toMatchObject({
      ok: false,
      error: "attach-failed",
      message: "nope",
    });
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(fake.storage.session.m.size).toBe(0);
    expect(fake.storage.local.m.size).toBe(0);
  });
});

describe("switchOff", () => {
  it("detaches, clears state and removes the host", async () => {
    await s.switchOn(7);
    expect(await s.switchOff(7)).toEqual(OFF);
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(tab()).toBeUndefined();
    expect(settings().allowedSites).toEqual([]);
  });

  it("on a detached tab swallows the detach error", async () => {
    await s.switchOn(7);
    await s.onDetach({ tabId: 7 }, "canceled_by_user");
    fake.debugger.detach.mockRejectedValueOnce(new Error("Not attached"));
    expect((await s.switchOff(7)).ok).toBe(true);
    expect(settings().allowedSites).toEqual([]);
    expect(tab()).toBeUndefined();
  });
});

describe("onDetach", () => {
  it("canceled_by_user marks the tab detached and keeps the host", async () => {
    await s.switchOn(7);
    await s.onDetach({ tabId: 7 }, "canceled_by_user");
    expect(tab()).toEqual({ state: "detached", host: HOST });
    expect(settings().allowedSites).toEqual([HOST]);
  });

  it("target_closed clears the tab state", async () => {
    await s.switchOn(7);
    await s.onDetach({ tabId: 7 }, "target_closed");
    expect(tab()).toBeUndefined();
    expect(settings().allowedSites).toEqual([HOST]);
  });

  it("without a stored entry or tabId does nothing", async () => {
    await s.onDetach({ tabId: 7 }, "canceled_by_user");
    await s.onDetach({}, "canceled_by_user");
    await s.onDetach({}, "target_closed");
    expect(fake.storage.session.m.size).toBe(0);
  });
});

describe("getTabStatus", () => {
  it("reports off with the tab host when nothing is stored", async () => {
    expect(await s.getTabStatus(7)).toEqual({ state: "off", host: HOST });
  });

  it("state survives a worker restart", async () => {
    await s.switchOn(7);
    vi.resetModules();
    const again = await import("./session");
    expect(await again.getTabStatus(7)).toEqual(ON.status);
  });
});

describe("registerSession", () => {
  it("answers session messages and ignores scan, foreign senders and junk", async () => {
    s.registerSession();
    const reply = (msg: unknown) =>
      new Promise((res) =>
        expect(fake.l.message!(msg, { id: "ext" }, res)).toBe(true),
      );
    const handled = (msg: unknown, id = "ext") =>
      fake.l.message!(msg, { id }, vi.fn());
    expect(await reply({ type: "session-get", tabId: 7 })).toEqual(OFF);
    expect(await reply({ type: "session-on", tabId: 7 })).toEqual(ON);
    expect(await reply({ type: "session-off", tabId: 7 })).toEqual(OFF);
    expect(handled({ type: "scan", tabId: 7, value: "1" })).toBe(false);
    expect(handled({ type: "session-on", tabId: 7 }, "other")).toBe(false);
    expect(handled({ junk: true })).toBe(false);

    fake.storage.session.get = async () => {
      throw new Error("quota");
    };
    expect(await reply({ type: "session-on", tabId: 7 })).toEqual({
      ok: false,
      error: "internal",
      message: "quota",
    });

    fake.l.detach!({ tabId: 7 }, "target_closed");
  });
});
