import { hostOfUrl } from "../core/hosts";
import {
  isPopupMessage,
  type SessionReply,
  type TabStatus,
} from "../core/messages";
import { defaultSettings, migrate, type Settings } from "../core/settings";

export const PROTOCOL_VERSION = "1.3";
export const SETTINGS_KEY = "settings";
type Stored = { state: "attached" | "detached"; host: string | null };
const tabKey = (tabId: number) => `tab:${tabId}`;

async function readTab(tabId: number): Promise<Stored | null> {
  const got = await chrome.storage.session.get(tabKey(tabId));
  return (got[tabKey(tabId)] as Stored | undefined) ?? null;
}

async function writeTab(tabId: number, s: Stored): Promise<void> {
  await chrome.storage.session.set({ [tabKey(tabId)]: s });
}

async function clearTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tabKey(tabId));
}

// Host of the tab's current URL; null if not http(s) or no such tab.
export async function hostOfTab(tabId: number): Promise<string | null> {
  const t = (await chrome.debugger.getTargets()).find((t) => t.tabId === tabId);
  return t ? hostOfUrl(t.url) : null;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

// One update at a time, so two tabs can't overwrite each other's host.
let queue: Promise<unknown> = Promise.resolve();
const updateAllowedSites = (fn: (sites: string[]) => string[]) =>
  (queue = queue.catch(() => {}).then(() => writeAllowedSites(fn)));

async function writeAllowedSites(
  fn: (sites: string[]) => string[],
): Promise<void> {
  const raw = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  const current = {
    ...defaultSettings(),
    ...migrate(isRecord(raw) ? raw : {}),
  } as Settings;
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
  if (s?.state === "attached") return { ok: true, status: s };
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
  } catch (e) {
    await chrome.debugger.detach({ tabId }).catch(() => {});
    return { ok: false, error: "attach-failed", message: errorMessage(e) };
  }
  await updateAllowedSites((sites) =>
    sites.includes(host) ? sites : [...sites, host],
  );
  await writeTab(tabId, { state: "attached", host });
  return { ok: true, status: { state: "attached", host } };
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

export function registerSession(): void {
  chrome.debugger.onDetach.addListener(
    (src, reason) => void onDetach(src, reason),
  );
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
