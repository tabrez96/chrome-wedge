import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerScan, scan } from "./scan";

type Listener = (...args: unknown[]) => unknown;
type Cmd = [unknown, string, Record<string, unknown>?];

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

let probe: unknown;
let host: string;
let listener: Listener | undefined;
let fake: ReturnType<typeof makeFake>;

function makeFake() {
  return {
    storage: { session: area(), local: area() },
    debugger: {
      sendCommand: vi.fn(async (...a: unknown[]): Promise<unknown> => {
        const [, method, params] = a as Cmd;
        if (method === "Runtime.evaluate") {
          const value = params?.expression === "location.host" ? host : probe;
          return { result: { value } };
        }
        return {};
      }),
    },
    runtime: {
      id: "ext",
      onMessage: { addListener: (f: Listener) => (listener = f) },
    },
  };
}

const ok = { kind: "editable", label: "Code" };
const dispatched = () =>
  fake.debugger.sendCommand.mock.calls
    .map((c) => c as unknown as Cmd)
    .filter((c) => c[1] === "Input.dispatchKeyEvent")
    .map((c) => c[2] as { type: string; key: string; text?: string });
const seq = () => dispatched().map((p) => `${p.type} ${p.key}`);
const stored = () =>
  fake.storage.session.m.get("tab:7") as { lastResult?: unknown };
const setSettings = (s: Record<string, unknown>) =>
  fake.storage.local.m.set("settings", {
    allowedSites: ["wedge.test"],
    keyDelayMs: 0,
    ...s,
  });

beforeEach(() => {
  fake = makeFake();
  probe = ok;
  host = "wedge.test";
  vi.stubGlobal("chrome", fake as unknown as typeof chrome);
  fake.storage.session.m.set("tab:7", {
    state: "attached",
    host: "wedge.test",
  });
  setSettings({});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("scan", () => {
  it("sends keyDown with text and keyUp for each key, then Enter, and stores the result", async () => {
    const r = await scan(7, "ab");
    expect(r).toMatchObject({ kind: "sent", keys: 2, fieldLabel: "Code" });
    expect(seq().join()).toBe(
      "keyDown a,keyUp a,keyDown b,keyUp b,keyDown Enter,keyUp Enter",
    );
    expect(dispatched()[0]?.text).toBe("a");
    expect(stored().lastResult).toEqual(r);
  });

  it("sends keys to the page when nothing editable is focused", async () => {
    probe = { kind: "none" };
    expect(await scan(7, "a")).toMatchObject({
      kind: "sent",
      fieldLabel: null,
      keys: 1,
    });
    const calls = fake.debugger.sendCommand.mock.calls.map(
      (c) => c as unknown as Cmd,
    );
    const blur = calls.findIndex((c) =>
      String((c[2] as { expression?: string })?.expression).includes("blur"),
    );
    const first = calls.findIndex((c) => c[1] === "Input.dispatchKeyEvent");
    expect(blur).toBeGreaterThan(-1);
    expect(blur).toBeLessThan(first);
  });

  it("refuses when releasing focus lands it on a password field", async () => {
    const values: unknown[] = [
      host,
      { kind: "none" },
      undefined,
      { kind: "password" },
    ];
    fake.debugger.sendCommand.mockImplementation(async (...a: unknown[]) => {
      const [, method] = a as Cmd;
      return method === "Runtime.evaluate"
        ? { result: { value: values.shift() } }
        : {};
    });
    expect(await scan(7, "a")).toEqual({ kind: "refused" });
    expect(dispatched()).toEqual([]);
  });

  it("returns no-field when releasing focus lands it in a cross-origin frame", async () => {
    const values: unknown[] = [
      host,
      { kind: "none" },
      undefined,
      { kind: "unreachable" },
    ];
    fake.debugger.sendCommand.mockImplementation(async (...a: unknown[]) => {
      const [, method] = a as Cmd;
      return method === "Runtime.evaluate"
        ? { result: { value: values.shift() } }
        : {};
    });
    expect(await scan(7, "a")).toEqual({ kind: "no-field" });
    expect(dispatched()).toEqual([]);
  });

  it("reports the field when releasing focus lands it in an editable field", async () => {
    const values: unknown[] = [
      host,
      { kind: "none" },
      undefined,
      { kind: "editable", label: "Code" },
    ];
    fake.debugger.sendCommand.mockImplementation(async (...a: unknown[]) => {
      const [, method] = a as Cmd;
      return method === "Runtime.evaluate"
        ? { result: { value: values.shift() } }
        : {};
    });
    expect(await scan(7, "a")).toMatchObject({
      kind: "sent",
      fieldLabel: "Code",
    });
    expect(dispatched().length).toBeGreaterThan(0);
  });

  it("does not release focus when a field is focused", async () => {
    await scan(7, "a");
    const exprs = fake.debugger.sendCommand.mock.calls.map((c) =>
      String(((c as unknown as Cmd)[2] as { expression?: string })?.expression),
    );
    expect(exprs.some((e) => e.includes("blur"))).toBe(false);
  });

  it("returns refused, no-field or invalid without typing", async () => {
    probe = { kind: "password" };
    expect(await scan(7, "a")).toEqual({ kind: "refused" });
    probe = { kind: "unreachable" };
    expect(await scan(7, "a")).toEqual({ kind: "no-field" });
    probe = undefined;
    expect(await scan(7, "a")).toEqual({ kind: "no-field" });
    expect(await scan(7, "")).toEqual({ kind: "invalid", error: "empty" });
    expect(dispatched()).toEqual([]);
  });

  it("returns site-off when the tab is not switched on or its host is not allowed", async () => {
    expect(await scan(8, "a")).toEqual({ kind: "site-off" });
    expect(fake.debugger.sendCommand).not.toHaveBeenCalled();
    host = "evil.test";
    expect(await scan(7, "a")).toEqual({ kind: "site-off" });
    expect(dispatched()).toEqual([]);
  });

  it("returns detached for a lost session and error for other failures", async () => {
    fake.storage.session.m.set("tab:7", { state: "detached", host: "x" });
    expect(await scan(7, "a")).toEqual({ kind: "detached" });
    expect(fake.debugger.sendCommand).not.toHaveBeenCalled();
    fake.storage.session.m.set("tab:7", { state: "attached", host: "x" });
    fake.debugger.sendCommand.mockRejectedValue(
      new Error("Debugger is not attached to the tab with id: 7."),
    );
    expect(await scan(7, "a")).toEqual({ kind: "detached" });
    fake.debugger.sendCommand.mockResolvedValue({
      exceptionDetails: { text: "boom" },
    });
    expect(await scan(7, "a")).toEqual({ kind: "error", message: "boom" });
    fake.debugger.sendCommand.mockRejectedValue("plain");
    expect(await scan(7, "a")).toEqual({ kind: "error", message: "plain" });
  });

  it("runs a second scan on the same tab only after the first finishes", async () => {
    const [a, b] = await Promise.all([scan(7, "a"), scan(7, "b")]);
    expect([a.kind, b.kind]).toEqual(["sent", "sent"]);
    const order = dispatched().map((p) => p.key);
    expect(order.join()).toBe("a,a,Enter,Enter,b,b,Enter,Enter");
    fake.debugger.sendCommand.mockRejectedValueOnce(new Error("boom"));
    const [c, d] = await Promise.all([scan(7, "a"), scan(7, "b")]);
    expect([c.kind, d.kind]).toEqual(["error", "sent"]);
  });
});

describe("registerScan", () => {
  it("answers scan messages only", async () => {
    registerScan();
    const reply = vi.fn();
    const scanMsg = { type: "scan", tabId: 7, value: "a" };
    expect(listener?.(scanMsg, { id: "ext" }, reply)).toBe(true);
    await vi.waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "sent" }),
      ),
    );
    for (const [m, s] of [
      [{ type: "session-get", tabId: 7 }, { id: "ext" }],
      [scanMsg, { id: "evil" }],
      ["junk", { id: "ext" }],
    ] as const)
      expect(listener?.(m, s, reply)).toBe(false);
  });
});
