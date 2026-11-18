import { INSTALL_SCRIPT, REMOVE_SCRIPT } from "../core/shortcutListener";
import * as s from "./session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (...args: unknown[]) => unknown;

function area() {
  const m = new Map<string, unknown>();
  return {
    m,
    get: async (key: string | null) =>
      key === null
        ? Object.fromEntries(m)
        : m.has(key)
          ? { [key]: m.get(key) }
          : {},
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
  const l: {
    detach?: Listener;
    message?: Listener;
    event?: Listener;
    changed?: Listener;
    removed?: Listener;
  } = {};
  return {
    l,
    storage: {
      session: area(),
      local: area(),
      onChanged: { addListener: (f: Listener) => (l.changed = f) },
    },
    tabs: {
      get: vi.fn(async (id: number) => ({ id, index: 2, windowId: 1 })),
      create: vi.fn(async (..._a: unknown[]) => ({})),
      onRemoved: { addListener: (f: Listener) => (l.removed = f) },
    },
    debugger: {
      attach: vi.fn(async (..._a: unknown[]) => {}),
      detach: vi.fn(async (..._a: unknown[]) => {}),
      sendCommand: vi.fn(async (...a: unknown[]): Promise<unknown> => {
        if (a[1] === "Page.getFrameTree")
          return { frameTree: { frame: { id: "F" } } };
        if (a[1] === "Page.createIsolatedWorld")
          return { executionContextId: 7 };
      }),
      getTargets: vi.fn(async () => [target("http://wedge.test/")]),
      onDetach: { addListener: (f: Listener) => (l.detach = f) },
      onEvent: { addListener: (f: Listener) => (l.event = f) },
    },
    runtime: {
      id: "ext",
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      onMessage: { addListener: (f: Listener) => (l.message = f) },
    },
  };
}

const settings = () =>
  fake.storage.local.m.get("settings") as Record<string, unknown>;

const nav = (url: string, extra: Record<string, unknown> = {}) =>
  s.onDebuggerEvent({ tabId: 7 }, "Page.frameNavigated", {
    frame: { id: "f", url, ...extra },
  });
const sitesChange = (
  oldSites: string[] | undefined,
  newSites: string[] | undefined,
) => ({
  settings: {
    oldValue: oldSites && { version: 1, allowedSites: oldSites },
    newValue: newSites && { version: 1, allowedSites: newSites },
  },
});

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

  it("enables the Page domain", async () => {
    await s.switchOn(7);
    expect(fake.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      "Page.enable",
    );
  });

  it("installs the shortcut listener; a Runtime.addBinding failure detaches and reports attach-failed", async () => {
    expect(await s.switchOn(7)).toEqual(ON);
    expect(fake.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      "Runtime.addBinding",
      { name: "__wedgeShortcut", executionContextName: "wedge" },
    );
    expect(fake.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      "Runtime.evaluate",
      { expression: INSTALL_SCRIPT, contextId: 7 },
    );
    await s.switchOff(7);
    fake.debugger.detach.mockClear();
    fake.debugger.sendCommand.mockImplementation(async (...a: unknown[]) => {
      if (a[1] === "Runtime.addBinding") throw new Error("binding");
    });
    expect(await s.switchOn(7)).toEqual({
      ok: false,
      error: "attach-failed",
      message: "binding",
    });
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
  });

  it("removes the page listener before detaching when switch-on fails", async () => {
    fake.debugger.sendCommand.mockImplementation(async (...a: unknown[]) => {
      if (a[1] === "Page.getFrameTree") throw new Error("tree");
    });
    fake.debugger.sendCommand.mockClear();
    expect((await s.switchOn(7)).ok).toBe(false);
    const calls = fake.debugger.sendCommand.mock.calls;
    const last = calls[calls.length - 1];
    expect(last).toEqual([
      { tabId: 7 },
      "Runtime.evaluate",
      { expression: REMOVE_SCRIPT },
    ]);
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    const orders = fake.debugger.sendCommand.mock.invocationCallOrder;
    const removed = orders[orders.length - 1]!;
    const detached = fake.debugger.detach.mock.invocationCallOrder[0]!;
    expect(removed).toBeLessThan(detached);
  });

  it("Page.enable failure reports attach-failed and stores nothing", async () => {
    fake.debugger.sendCommand
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("page"));
    expect(await s.switchOn(7)).toEqual({
      ok: false,
      error: "attach-failed",
      message: "page",
    });
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(fake.storage.session.m.size).toBe(0);
  });

  it("detaches when the host was removed from settings while switching on", async () => {
    fake.debugger.getTargets
      .mockResolvedValueOnce([target("http://wedge.test/")])
      .mockImplementationOnce(async () => {
        fake.storage.local.m.set("settings", { version: 1, allowedSites: [] });
        return [target("http://wedge.test/")];
      });
    expect(await s.switchOn(7)).toEqual({
      ok: false,
      error: "attach-failed",
      message: "The page navigated while switching on.",
    });
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(fake.storage.session.m.has("tab:7")).toBe(false);
  });

  it("detaches when the page navigated to a disallowed host while switching on", async () => {
    fake.debugger.getTargets
      .mockResolvedValueOnce([target("http://wedge.test/")])
      .mockResolvedValueOnce([target("http://other.test/")]);
    expect(await s.switchOn(7)).toEqual({
      ok: false,
      error: "attach-failed",
      message: "The page navigated while switching on.",
    });
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(fake.storage.session.m.has("tab:7")).toBe(false);
  });

  it("detaches when the page became non-web while switching on", async () => {
    fake.debugger.getTargets
      .mockResolvedValueOnce([target("http://wedge.test/")])
      .mockResolvedValueOnce([target("chrome://newtab/")]);
    expect((await s.switchOn(7)).ok).toBe(false);
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
  });

  it("stores the new host when the page navigated to another allowed host while switching on", async () => {
    fake.storage.local.m.set("settings", {
      version: 1,
      allowedSites: ["other.test"],
    });
    fake.debugger.getTargets
      .mockResolvedValueOnce([target("http://wedge.test/")])
      .mockResolvedValueOnce([target("http://other.test/")]);
    expect(await s.switchOn(7)).toEqual({
      ok: true,
      status: { state: "attached", host: "other.test" },
    });
    expect(fake.debugger.detach).not.toHaveBeenCalled();
    expect(fake.storage.session.m.get("tab:7")).toEqual({
      state: "attached",
      host: "other.test",
    });
  });

  it("does not send lastResult in its reply", async () => {
    fake.storage.session.m.set("tab:7", {
      state: "attached",
      host: HOST,
      lastResult: { kind: "no-field" },
    });
    expect(await s.switchOn(7)).toEqual(ON);
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

describe("switchOn welcome", () => {
  const done = () =>
    fake.storage.local.m.set("settings", { version: 1, firstRunDone: true });

  it("opens welcome next to the tab while firstRunDone is false", async () => {
    expect(await s.switchOn(7)).toEqual(ON);
    expect(fake.tabs.create).toHaveBeenCalledTimes(1);
    expect(fake.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://ext/welcome.html",
      windowId: 1,
      index: 3,
      openerTabId: 7,
    });
  });

  it("does not open welcome once firstRunDone is true", async () => {
    done();
    expect(await s.switchOn(7)).toEqual(ON);
    expect(fake.tabs.create).not.toHaveBeenCalled();
  });

  it("does not open welcome when already attached", async () => {
    fake.storage.session.m.set("tab:7", { state: "attached", host: HOST });
    expect(await s.switchOn(7)).toEqual(ON);
    expect(fake.tabs.create).not.toHaveBeenCalled();
  });

  it("does not open welcome when switch-on fails", async () => {
    fake.debugger.attach.mockRejectedValueOnce(new Error("boom"));
    expect((await s.switchOn(7)).ok).toBe(false);
    fake.debugger.getTargets.mockResolvedValueOnce([
      target("chrome://newtab/"),
    ]);
    expect((await s.switchOn(7)).ok).toBe(false);
    expect(fake.tabs.create).not.toHaveBeenCalled();
  });

  it("a failure to open welcome does not block switch-on", async () => {
    fake.tabs.create.mockRejectedValueOnce(new Error("no tab"));
    expect(await s.switchOn(7)).toEqual(ON);
    expect(tab()).toEqual({ state: "attached", host: HOST });
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

describe("onDebuggerEvent", () => {
  it("main-frame navigation to a host that is not allowed detaches and clears the tab", async () => {
    await s.switchOn(7);
    await nav("http://other.test/");
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(tab()).toBeUndefined();
    expect(settings().allowedSites).toEqual([HOST]);
  });

  it("navigation to a non-web page detaches", async () => {
    await s.switchOn(7);
    await nav("chrome://newtab/");
    expect(tab()).toBeUndefined();
  });

  it("navigation to another allowed host stays on and updates the host", async () => {
    await s.switchOn(7);
    fake.storage.local.m.set("settings", {
      version: 1,
      allowedSites: [HOST, "other.test"],
    });
    await nav("http://other.test/x");
    expect(fake.debugger.detach).not.toHaveBeenCalled();
    expect(tab()).toEqual({ state: "attached", host: "other.test" });
  });

  it("same-host navigation and subframe navigation change nothing", async () => {
    await s.switchOn(7);
    await nav("http://wedge.test/next");
    await nav("http://other.test/", { parentId: "p" });
    expect(fake.debugger.detach).not.toHaveBeenCalled();
    expect(tab()).toEqual({ state: "attached", host: HOST });
  });

  it("ignores other methods, unknown tabs, missing tabId and malformed params", async () => {
    await s.onDebuggerEvent({ tabId: 7 }, "Page.loadEventFired", {});
    await nav("http://other.test/");
    await s.onDebuggerEvent({}, "Page.frameNavigated", {
      frame: { id: "f", url: "http://other.test/" },
    });
    await s.onDebuggerEvent({ tabId: 7 }, "Page.frameNavigated");
    await s.onDebuggerEvent({ tabId: 7 }, "Page.frameNavigated", {
      frame: { id: "f" },
    });
    expect(fake.debugger.detach).not.toHaveBeenCalled();
    expect(fake.storage.session.m.size).toBe(0);
  });
});

describe("onSettingsChanged", () => {
  const seed = () => {
    const m = fake.storage.session.m;
    m.set("tab:7", { state: "attached", host: HOST });
    m.set("tab:8", { state: "detached", host: HOST });
    m.set("tab:9", { state: "attached", host: "other.test" });
    m.set("tab:x", { state: "attached", host: HOST });
    m.set("misc", { host: HOST });
  };

  it("removing a host detaches and clears every tab on it", async () => {
    seed();
    await s.onSettingsChanged(
      sitesChange([HOST, "other.test"], ["other.test"]),
      "local",
    );
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 7 });
    expect(fake.debugger.detach).toHaveBeenCalledWith({ tabId: 8 });
    expect(fake.debugger.detach).not.toHaveBeenCalledWith({ tabId: 9 });
    const m = fake.storage.session.m;
    expect(m.has("tab:7") || m.has("tab:8")).toBe(false);
    expect(m.has("tab:9") && m.has("misc")).toBe(true);
  });

  it("ignores other areas, other keys, additions and first writes", async () => {
    seed();
    await s.onSettingsChanged(sitesChange([HOST], []), "session");
    await s.onSettingsChanged({ other: {} }, "local");
    await s.onSettingsChanged(sitesChange([HOST], [HOST, "x.test"]), "local");
    await s.onSettingsChanged(sitesChange(undefined, []), "local");
    expect(fake.debugger.detach).not.toHaveBeenCalled();
    expect(tab()).toBeDefined();
  });

  it("deleting the settings removes every host", async () => {
    seed();
    await s.onSettingsChanged(sitesChange([HOST], undefined), "local");
    expect(tab()).toBeUndefined();
  });
});

describe("onTabRemoved", () => {
  it("closing a tab clears its state, also when detached", async () => {
    await s.switchOn(7);
    await s.onDetach({ tabId: 7 }, "canceled_by_user");
    await s.onTabRemoved(7);
    expect(tab()).toBeUndefined();
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

describe("registerSession listeners", () => {
  it("wires navigation, settings and tab-close listeners", async () => {
    s.registerSession();
    expect(fake.l.event).toBeDefined();
    expect(fake.l.changed).toBeDefined();
    await s.switchOn(7);
    fake.l.removed!(7);
    await new Promise((r) => setTimeout(r, 0));
    expect(tab()).toBeUndefined();
    await s.switchOn(7);
    fake.l.event!({ tabId: 7 }, "Page.frameNavigated", {
      frame: { id: "f", url: "http://other.test/" },
    });
    fake.l.changed!(sitesChange([HOST], []), "local");
    await new Promise((r) => setTimeout(r, 0));
    expect(tab()).toBeUndefined();
  });
});

describe("setLastResult", () => {
  it("keeps the entry and does nothing for unknown tabs", async () => {
    await s.switchOn(7);
    await s.setLastResult(7, { kind: "no-field" });
    expect(tab()).toEqual({
      state: "attached",
      host: HOST,
      lastResult: { kind: "no-field" },
    });
    await s.setLastResult(9, { kind: "no-field" });
    expect(fake.storage.session.m.has("tab:9")).toBe(false);
  });
});

describe("setFirstRunDone", () => {
  it("setFirstRunDone sets the flag and keeps other settings", async () => {
    fake.storage.local.m.set("settings", {
      version: 1,
      allowedSites: ["a.test"],
    });
    await s.setFirstRunDone();
    expect(settings().firstRunDone).toBe(true);
    expect(settings().allowedSites).toEqual(["a.test"]);
  });
});

describe("updateSettings", () => {
  it("updateSettings keeps an allowed site added after the page loaded", async () => {
    fake.storage.local.m.set("settings", {
      version: 1,
      allowedSites: ["a.test"],
    });
    await s.updateSettings({ prefix: "X" });
    expect(settings().prefix).toBe("X");
    expect(settings().allowedSites).toEqual(["a.test"]);
  });

  it("updateSettings writes two quick patches without losing either", async () => {
    const first = s.updateSettings({ prefix: "P" });
    const second = s.updateSettings({ keyDelayMs: 50 });
    await Promise.all([first, second]);
    expect(settings().prefix).toBe("P");
    expect(settings().keyDelayMs).toBe(50);
  });
});

describe("updateAllowedSites", () => {
  it("updateAllowedSites runs queued updates in order without losing one", async () => {
    fake.storage.local.m.set("settings", { version: 1, prefix: "P" });
    await Promise.all([
      s.updateAllowedSites((sites) => [...sites, "a"]),
      s.updateAllowedSites((sites) => [...sites, "b"]),
    ]);
    expect(settings().allowedSites).toEqual(["a", "b"]);
    expect(settings().prefix).toBe("P");
  });
});

describe("updateSavedCodes", () => {
  it("updateSavedCodes keeps an allowed site added meanwhile and applies queued updates in order", async () => {
    fake.storage.local.m.set("settings", {
      version: 1,
      allowedSites: ["a.test"],
    });
    const code = (id: string) => ({ id, name: id, value: id, shortcut: null });
    await Promise.all([
      s.updateSavedCodes((c) => [...c, code("1")]),
      s.updateSavedCodes((c) => [...c, code("2")]),
    ]);
    expect(settings().allowedSites).toEqual(["a.test"]);
    expect(
      (settings().savedCodes as { id: string }[]).map((c) => c.id),
    ).toEqual(["1", "2"]);
  });
});

describe("switchOff shortcuts", () => {
  it("removes the listener before detaching", async () => {
    await s.switchOn(7);
    fake.debugger.sendCommand.mockClear();
    await s.switchOff(7);
    expect(fake.debugger.sendCommand.mock.calls[0]?.[1]).toBe(
      "Runtime.evaluate",
    );
    const evaluated = fake.debugger.sendCommand.mock.invocationCallOrder[0]!;
    const detached = fake.debugger.detach.mock.invocationCallOrder[0]!;
    expect(evaluated).toBeLessThan(detached);
  });
});
