import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BINDING,
  INSTALL_SCRIPT,
  REMOVE_SCRIPT,
} from "../core/shortcutListener";
import * as sc from "./shortcuts";

const sendCommand = vi.fn(
  async (..._a: unknown[]): Promise<unknown> => undefined,
);
const onEvent = vi.fn();
let stored: unknown;

beforeEach(() => {
  sendCommand.mockReset();
  sendCommand.mockImplementation(async (...a: unknown[]) => {
    if (a[1] === "Page.getFrameTree")
      return { frameTree: { frame: { id: "F" } } };
    if (a[1] === "Page.createIsolatedWorld") return { executionContextId: 7 };
  });
  stored = {
    version: 1,
    savedCodes: [
      { id: "a", name: "One", value: "SC-1", shortcut: 1 },
      { id: "b", name: "Two", value: "SC-2", shortcut: 2 },
      { id: "c", name: "None", value: "SC-3" },
    ],
  };
  vi.stubGlobal("chrome", {
    debugger: { sendCommand, onEvent: { addListener: onEvent } },
    storage: { local: { get: async () => ({ settings: stored }) } },
  });
});

const call = (
  tabId: number | undefined,
  method: string,
  params?: object,
  run = vi.fn(async () => {}),
) => sc.onShortcutEvent({ tabId }, method, params, run).then(() => run);
const bound = (payload: unknown, name: string = BINDING) => ({ name, payload });

describe("installShortcuts / removeShortcuts", () => {
  it("installs the binding and the script, in order", async () => {
    await sc.installShortcuts(5);
    const t = { tabId: 5 };
    expect(sendCommand.mock.calls).toEqual([
      [t, "Runtime.evaluate", { expression: REMOVE_SCRIPT }],
      [t, "Runtime.enable"],
      [
        t,
        "Runtime.addBinding",
        { name: BINDING, executionContextName: "wedge" },
      ],
      [
        t,
        "Page.addScriptToEvaluateOnNewDocument",
        { source: INSTALL_SCRIPT, worldName: "wedge" },
      ],
      [t, "Page.getFrameTree"],
      [t, "Page.createIsolatedWorld", { frameId: "F", worldName: "wedge" }],
      [t, "Runtime.evaluate", { expression: INSTALL_SCRIPT, contextId: 7 }],
    ]);
  });

  it("removes the listener and swallows errors", async () => {
    sendCommand.mockRejectedValueOnce(new Error("gone"));
    await expect(sc.removeShortcuts(5)).resolves.toBeUndefined();
    expect(sendCommand).toHaveBeenCalledWith({ tabId: 5 }, "Runtime.evaluate", {
      expression: REMOVE_SCRIPT,
    });
  });
});

describe("onShortcutEvent", () => {
  it("runs the saved code with that shortcut on the tab", async () => {
    const run = await call(9, "Runtime.bindingCalled", bound("2"));
    expect(run).toHaveBeenCalledWith(9, "SC-2");
  });

  it("ignores everything else", async () => {
    const cases: [number | undefined, string, object | undefined][] = [
      [9, "Page.frameNavigated", bound("2")],
      [9, "Runtime.bindingCalled", bound("2", "other")],
      [9, "Runtime.bindingCalled", bound("0")],
      [9, "Runtime.bindingCalled", bound("x")],
      [9, "Runtime.bindingCalled", bound(2)],
      [9, "Runtime.bindingCalled", bound("5")],
      [9, "Runtime.bindingCalled", undefined],
      [undefined, "Runtime.bindingCalled", bound("2")],
    ];
    for (const [id, m, p] of cases)
      expect(await call(id, m, p)).not.toHaveBeenCalled();
  });
});

describe("registerShortcuts", () => {
  it("listens to debugger events and scans the saved code", async () => {
    const run = vi.fn(async () => {});
    sc.registerShortcuts(run);
    onEvent.mock.calls[0]![0](
      { tabId: 4 },
      "Runtime.bindingCalled",
      bound("1"),
    );
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith(4, "SC-1"));
  });
});
