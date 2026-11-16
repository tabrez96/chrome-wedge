import { hostOfUrl } from "../core/hosts";
import {
  isPopupMessage,
  type ScanResult,
  type SessionReply,
  type TabStatus,
} from "../core/messages";
import { defaultSettings, migrate, type Settings } from "../core/settings";

export const PROTOCOL_VERSION = "1.3";
export const SETTINGS_KEY = "settings";
type Stored = {
  state: "attached" | "detached";
  host: string | null;
  lastResult?: ScanResult;
};
const tabKey = (tabId: number) => `tab:${tabId}`;

export async function readTab(tabId: number): Promise<Stored | null> {
  const got = await chrome.storage.session.get(tabKey(tabId));
  return (got[tabKey(tabId)] as Stored | undefined) ?? null;
}

async function writeTab(tabId: number, s: Stored): Promise<void> {
  await chrome.storage.session.set({ [tabKey(tabId)]: s });
}

// Keeps the result on the tab's entry; does nothing if the tab was switched off meanwhile.
export async function setLastResult(
  tabId: number,
  lastResult: ScanResult,
): Promise<void> {
  const s = await readTab(tabId);
  if (s) await writeTab(tabId, { ...s, lastResult });
}

async function clearTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tabKey(tabId));
}

// Our own detach() does not fire onDetach, so the entry is cleared here.
async function detachTab(tabId: number): Promise<void> {
  await chrome.debugger.detach({ tabId }).catch(() => {});
  await clearTab(tabId);
}

// Host of the tab's current URL; null if not http(s) or no such tab.
export async function hostOfTab(tabId: number): Promise<string | null> {
  const t = (await chrome.debugger.getTargets()).find((t) => t.tabId === tabId);
  return t ? hostOfUrl(t.url) : null;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

export async function readSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  return {
    ...defaultSettings(),
    ...migrate(isRecord(raw) ? raw : {}),
  } as Settings;
}

export async function setFirstRunDone(): Promise<void> {
  const current = await readSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, firstRunDone: true },
  });
}

// One update at a time, so two tabs can't overwrite each other's host.
let queue: Promise<unknown> = Promise.resolve();
const updateAllowedSites = (fn: (sites: string[]) => string[]) =>
  (queue = queue.catch(() => {}).then(() => writeAllowedSites(fn)));

async function writeAllowedSites(
  fn: (sites: string[]) => string[],
): Promise<void> {
  const current = await readSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, allowedSites: fn(current.allowedSites) },
  });
}

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export async function getTabStatus(tabId: number): Promise<TabStatus> {
  const s = await readTab(tabId);
  return s
    ? { state: s.state, host: s.host }
    : { state: "off", host: await hostOfTab(tabId) };
}

export async function switchOn(tabId: number): Promise<SessionReply> {
  const s = await readTab(tabId);
  if (s?.state === "attached")
    return { ok: true, status: { state: s.state, host: s.host } };
  const host = await hostOfTab(tabId);
  if (host === null) {
    return {
      ok: false,
      error: "unsupported-page",
      message: "This page can't receive scans.",
    };
  }
  try {
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
  } catch (e) {
    // Already holding the session (parallel switch-on or lost state): carry on.
    if (!errorMessage(e).includes("already attached")) {
      return { ok: false, error: "attach-failed", message: errorMessage(e) };
    }
  }
  try {
    await chrome.debugger.sendCommand(
      { tabId },
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
  } catch (e) {
    await chrome.debugger.detach({ tabId }).catch(() => {});
    return { ok: false, error: "attach-failed", message: errorMessage(e) };
  }
  await updateAllowedSites((sites) =>
    sites.includes(host) ? sites : [...sites, host],
  );
  await writeTab(tabId, { state: "attached", host });
  // A navigation before the entry was stored was missed by onDebuggerEvent.
  const current = await hostOfTab(tabId);
  if (
    current === null ||
    !(await readSettings()).allowedSites.includes(current)
  ) {
    await detachTab(tabId);
    return {
      ok: false,
      error: "attach-failed",
      message: "The page navigated while switching on.",
    };
  }
  if (current === host)
    return { ok: true, status: { state: "attached", host } };
  await writeTab(tabId, { state: "attached", host: current });
  return { ok: true, status: { state: "attached", host: current } };
}

export async function switchOff(tabId: number): Promise<SessionReply> {
  const host = (await readTab(tabId))?.host ?? (await hostOfTab(tabId));
  await chrome.debugger.detach({ tabId }).catch(() => {});
  if (host)
    await updateAllowedSites((sites) => sites.filter((h) => h !== host));
  await clearTab(tabId);
  return { ok: true, status: { state: "off", host } };
}

export async function onDetach(
  source: chrome.debugger.Debuggee,
  reason: string,
): Promise<void> {
  if (source.tabId === undefined) return;
  if (reason === "canceled_by_user") {
    const stored = await readTab(source.tabId);
    if (stored) await writeTab(source.tabId, { ...stored, state: "detached" });
    return;
  }
  await clearTab(source.tabId);
}

const sitesOf = (v: unknown): string[] =>
  isRecord(v) && Array.isArray(v.allowedSites)
    ? v.allowedSites.filter((h): h is string => typeof h === "string")
    : [];

export async function onDebuggerEvent(
  source: chrome.debugger.Debuggee,
  method: string,
  params?: object,
): Promise<void> {
  const tabId = source.tabId;
  if (tabId === undefined || method !== "Page.frameNavigated") return;
  const frame =
    isRecord(params) && isRecord(params.frame) ? params.frame : null;
  if (!frame || frame.parentId !== undefined || typeof frame.url !== "string")
    return;
  const stored = await readTab(tabId);
  if (!stored) return;
  const host = hostOfUrl(frame.url);
  if (host === null || !(await readSettings()).allowedSites.includes(host)) {
    await detachTab(tabId);
    return;
  }
  if (host !== stored.host) await writeTab(tabId, { ...stored, host });
}

export async function onSettingsChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): Promise<void> {
  if (areaName !== "local" || !(SETTINGS_KEY in changes)) return;
  const change = changes[SETTINGS_KEY];
  const kept = sitesOf(change.newValue);
  const removed = sitesOf(change.oldValue).filter((h) => !kept.includes(h));
  if (removed.length === 0) return;
  const all = await chrome.storage.session.get(null);
  const detaching: Promise<void>[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("tab:")) continue;
    const tabId = Number(key.slice(4));
    if (!Number.isInteger(tabId)) continue;
    if (
      isRecord(value) &&
      typeof value.host === "string" &&
      removed.includes(value.host)
    )
      detaching.push(detachTab(tabId));
  }
  await Promise.all(detaching);
}

export async function onTabRemoved(tabId: number): Promise<void> {
  await clearTab(tabId);
}

export function registerSession(): void {
  chrome.debugger.onDetach.addListener(
    (src, reason) => void onDetach(src, reason),
  );
  chrome.debugger.onEvent.addListener(
    (src, method, params) => void onDebuggerEvent(src, method, params),
  );
  chrome.storage.onChanged.addListener(
    (changes, area) => void onSettingsChanged(changes, area),
  );
  chrome.tabs.onRemoved.addListener((tabId) => void onTabRemoved(tabId));
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !isPopupMessage(msg)) return false;
    if (msg.type === "scan") return false;
    const reply =
      msg.type === "session-get"
        ? getTabStatus(msg.tabId).then((status) => ({ ok: true, status }))
        : msg.type === "session-on"
          ? switchOn(msg.tabId)
          : switchOff(msg.tabId);
    void reply.then(sendResponse, (e) =>
      sendResponse({ ok: false, error: "internal", message: errorMessage(e) }),
    );
    return true;
  });
}
