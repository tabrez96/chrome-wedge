import { parseShortcut } from "../core/savedCodes";
import {
  BINDING,
  INSTALL_SCRIPT,
  REMOVE_SCRIPT,
} from "../core/shortcutListener";
import { readSettings } from "./session";

type Run = (tabId: number, value: string) => Promise<unknown>;

const WORLD = "wedge";

// The binding and the listener live in an isolated world, so page scripts (and iframes) can't call the binding.
// Throws on failure: switchOn treats it like any other attach step.
export async function installShortcuts(tabId: number): Promise<void> {
  const t = { tabId };
  // A listener left by a cancelled session would swallow Alt+digit before the new one runs.
  await removeShortcuts(tabId);
  await chrome.debugger.sendCommand(t, "Runtime.enable");
  await chrome.debugger.sendCommand(t, "Runtime.addBinding", {
    name: BINDING,
    executionContextName: WORLD,
  });
  await chrome.debugger.sendCommand(
    t,
    "Page.addScriptToEvaluateOnNewDocument",
    { source: INSTALL_SCRIPT, worldName: WORLD },
  );
  const tree = (await chrome.debugger.sendCommand(t, "Page.getFrameTree")) as {
    frameTree: { frame: { id: string } };
  };
  const world = (await chrome.debugger.sendCommand(
    t,
    "Page.createIsolatedWorld",
    { frameId: tree.frameTree.frame.id, worldName: WORLD },
  )) as { executionContextId: number };
  await chrome.debugger.sendCommand(t, "Runtime.evaluate", {
    expression: INSTALL_SCRIPT,
    contextId: world.executionContextId,
  });
}

// Best effort, before detaching: the current document's listener would otherwise keep swallowing Alt+digit.
export async function removeShortcuts(tabId: number): Promise<void> {
  await chrome.debugger
    .sendCommand({ tabId }, "Runtime.evaluate", { expression: REMOVE_SCRIPT })
    .catch(() => {});
}

export async function onShortcutEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params: object | undefined,
  run: Run,
): Promise<void> {
  if (source.tabId === undefined || method !== "Runtime.bindingCalled") return;
  const p = params as { name?: unknown; payload?: unknown } | undefined;
  if (p?.name !== BINDING || typeof p.payload !== "string") return;
  const n = parseShortcut(p.payload);
  if (n === null) return;
  const code = (await readSettings()).savedCodes.find((c) => c.shortcut === n);
  if (code) await run(source.tabId, code.value);
}

export function registerShortcuts(run: Run): void {
  chrome.debugger.onEvent.addListener(
    (src, method, params) => void onShortcutEvent(src, method, params, run),
  );
}
