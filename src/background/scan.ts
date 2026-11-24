import {
  focusProbe,
  releaseFocus,
  type FocusProbeResult,
} from "../core/focusProbe";
import { isPopupMessage, type ScanResult } from "../core/messages";
import { buildScanPlan } from "../core/scanPlan";
import { checkScanValue } from "../core/settings";
import { readSettings, readTab, setLastResult } from "./session";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
// chrome.debugger reports a lost session as "Debugger is not attached to the tab with id: 7."
const isDetachError = (e: unknown) => errorMessage(e).includes("not attached");
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PROBE = `(${focusProbe.toString()})()`;
const RELEASE = `(${releaseFocus.toString()})()`;

async function evaluate<T>(tabId: number, expression: string): Promise<T> {
  const res = (await chrome.debugger.sendCommand(
    { tabId },
    "Runtime.evaluate",
    { expression, returnByValue: true },
  )) as
    | {
        result?: { value?: unknown };
        exceptionDetails?: { text?: string };
      }
    | undefined;
  if (res?.exceptionDetails)
    throw new Error(res.exceptionDetails.text ?? "Page script failed");
  return res?.result?.value as T;
}

async function runScan(tabId: number, value: string): Promise<ScanResult> {
  const invalid = checkScanValue(value);
  if (invalid) return { kind: "invalid", error: invalid };

  const tab = await readTab(tabId);
  if (!tab) return { kind: "site-off" };
  if (tab.state === "detached") return { kind: "detached" };

  const settings = await readSettings();
  try {
    const host = await evaluate<string>(tabId, "location.host");
    if (!settings.allowedSites.includes(host)) return { kind: "site-off" };

    const probe = await evaluate<FocusProbeResult | undefined>(tabId, PROBE);
    if (probe?.kind === "password") return { kind: "refused" };
    if (probe?.kind !== "editable" && probe?.kind !== "none")
      return { kind: "no-field" };
    let destination: FocusProbeResult = probe;
    if (probe.kind === "none") {
      await evaluate<void>(tabId, RELEASE);
      // A page blur handler can move focus into a password field.
      const afterRelease = await evaluate<FocusProbeResult | undefined>(
        tabId,
        PROBE,
      );
      if (afterRelease?.kind === "password") return { kind: "refused" };
      if (afterRelease?.kind !== "none" && afterRelease?.kind !== "editable")
        return { kind: "no-field" };
      destination = afterRelease;
    }

    const plan = buildScanPlan({
      prefix: settings.prefix,
      value,
      suffix: settings.suffix,
      keyDelayMs: settings.keyDelayMs,
    });
    for (const step of plan) {
      if (step.kind === "wait") await sleep(step.ms);
      else
        await chrome.debugger.sendCommand(
          { tabId },
          "Input.dispatchKeyEvent",
          step.params,
        );
    }
    return {
      kind: "sent",
      value,
      keys: [...(settings.prefix + value)].length,
      suffix: settings.suffix,
      fieldLabel: destination.kind === "editable" ? destination.label : null,
    };
  } catch (e) {
    return isDetachError(e)
      ? { kind: "detached" }
      : { kind: "error", message: errorMessage(e) };
  }
}

// One scan at a time per tab: a second scan waits for the one before it.
const queues = new Map<number, Promise<unknown>>();

export function scan(tabId: number, value: string): Promise<ScanResult> {
  const prev = queues.get(tabId) ?? Promise.resolve();
  const next = prev.then(async () => {
    const result = await runScan(tabId, value).catch((e): ScanResult => ({
      kind: "error",
      message: errorMessage(e),
    }));
    if (result.kind !== "invalid")
      await setLastResult(tabId, result).catch(() => {});
    return result;
  });
  queues.set(tabId, next);
  void next.finally(() => {
    if (queues.get(tabId) === next) queues.delete(tabId);
  });
  return next;
}

export function registerScan(): void {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      !isPopupMessage(msg) ||
      msg.type !== "scan"
    )
      return false;
    void scan(msg.tabId, msg.value).then(sendResponse);
    return true;
  });
}
