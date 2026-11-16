import { setFirstRunDone } from "../background/session";

export type WelcomeApi = {
  finish(): Promise<void>; // marks first run done
  closeTab(): Promise<void>;
  openSettings(): void;
};

export function initWelcome(doc: Document, api: WelcomeApi): void {
  const gotIt = doc.getElementById("got-it") as HTMLButtonElement;
  gotIt.addEventListener("click", async () => {
    gotIt.disabled = true;
    try {
      await api.finish();
      await api.closeTab();
    } catch {
      // Saving failed: the tab stays open and the button comes back.
    } finally {
      gotIt.disabled = false;
    }
  });
  doc
    .getElementById("open-settings")!
    .addEventListener("click", () => api.openSettings());
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  initWelcome(document, {
    finish: setFirstRunDone,
    closeTab: async () => {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
    },
    openSettings: () => void chrome.runtime.openOptionsPage(),
  });
}
