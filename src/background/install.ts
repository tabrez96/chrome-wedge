export const WELCOME_PAGE = "welcome.html";

// Opens S02; next to the given tab (same window, one place to the right) when there is one.
export async function openWelcome(nextToTabId?: number): Promise<void> {
  const url = chrome.runtime.getURL(WELCOME_PAGE);
  if (nextToTabId === undefined) {
    await chrome.tabs.create({ url });
    return;
  }
  const tab = await chrome.tabs.get(nextToTabId);
  await chrome.tabs.create({
    url,
    windowId: tab.windowId,
    index: tab.index + 1,
    openerTabId: nextToTabId,
  });
}

// Only a fresh install shows S02; updates and Chrome updates do not.
export async function onInstalled(
  details: chrome.runtime.InstalledDetails,
): Promise<void> {
  if (details.reason !== "install") return;
  await openWelcome().catch(() => {});
}

export function registerInstall(): void {
  chrome.runtime.onInstalled.addListener((d) => void onInstalled(d));
}
