import {
  readSettings,
  SETTINGS_KEY,
  updateAllowedSites,
  updateSettings,
  type TypingSettings,
} from "../background/session";
import { normaliseHost, withoutSite, withSite } from "../core/hosts";
import {
  clampPrefix,
  FORMATS,
  parseKeyDelay,
  SUFFIXES,
  type BarcodeFormat,
  type Settings,
  type Suffix,
} from "../core/settings";

export type SettingsApi = {
  load(): Promise<Settings>;
  save(patch: Partial<TypingSettings>): Promise<void>;
  addSite(host: string): Promise<void>;
  removeSite(host: string): Promise<void>;
  onChange(listener: (s: Settings) => void): void;
};

export async function initSettings(
  doc: Document,
  api: SettingsApi,
): Promise<void> {
  const byId = <T extends HTMLElement>(id: string) =>
    doc.getElementById(id) as T;
  const prefix = byId<HTMLInputElement>("prefix");
  const delay = byId<HTMLInputElement>("delay");
  const delayError = byId<HTMLElement>("delay-error");
  const format = byId<HTMLSelectElement>("format");
  const status = byId<HTMLElement>("save-status");
  const suffixButtons =
    doc.querySelectorAll<HTMLButtonElement>(".segmented button");

  const siteForm = byId<HTMLFormElement>("site-form");
  const hostInput = byId<HTMLInputElement>("site-host");
  const siteError = byId<HTMLElement>("site-error");
  const sitesTable = byId<HTMLElement>("sites-table");
  const sitesList = byId<HTMLElement>("sites-list");
  const sitesEmpty = byId<HTMLElement>("sites-empty");

  async function report(work: Promise<void>): Promise<void> {
    try {
      await work;
      status.textContent = "✓ Changes saved";
      status.classList.remove("error");
    } catch {
      status.textContent = "Couldn't save your change.";
      status.classList.add("error");
    }
  }
  const save = (patch: Partial<TypingSettings>) => report(api.save(patch));

  function renderSites(sites: readonly string[]): void {
    sitesList.replaceChildren();
    for (const host of sites) {
      const row = doc.createElement("tr");
      const name = doc.createElement("td");
      name.className = "site-host";
      name.textContent = host;
      const action = doc.createElement("td");
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "link-danger";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${host}`);
      remove.addEventListener("click", () => void removeSite(host));
      action.append(remove);
      row.append(name, action);
      sitesList.append(row);
    }
    sitesTable.hidden = sites.length === 0;
    sitesEmpty.hidden = sites.length !== 0;
  }

  // On failure the current list stays.
  async function refreshSites(): Promise<void> {
    try {
      renderSites((await api.load()).allowedSites);
    } catch {
      // Keep what is shown.
    }
  }

  async function removeSite(host: string): Promise<void> {
    await report(api.removeSite(host));
    await refreshSites();
  }

  siteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const host = normaliseHost(hostInput.value);
    if (host === null) {
      hostInput.setAttribute("aria-invalid", "true");
      siteError.hidden = false;
      return;
    }
    hostInput.removeAttribute("aria-invalid");
    siteError.hidden = true;
    hostInput.value = "";
    void report(api.addSite(host)).then(refreshSites);
  });

  function showSuffix(v: Suffix): void {
    for (const b of suffixButtons)
      b.setAttribute("aria-pressed", String(b.dataset.suffix === v));
  }

  prefix.addEventListener("change", () => {
    const v = clampPrefix(prefix.value);
    prefix.value = v;
    void save({ prefix: v });
  });

  for (const b of suffixButtons) {
    b.addEventListener("click", () => {
      const v = b.dataset.suffix as Suffix;
      if (!(SUFFIXES as readonly string[]).includes(v)) return;
      showSuffix(v);
      void save({ suffix: v });
    });
  }

  delay.addEventListener("change", () => {
    const ms = parseKeyDelay(delay.value);
    if (ms === null) {
      delay.setAttribute("aria-invalid", "true");
      delayError.hidden = false;
      return;
    }
    delay.removeAttribute("aria-invalid");
    delayError.hidden = true;
    delay.value = String(ms);
    void save({ keyDelayMs: ms });
  });

  format.addEventListener("change", () => {
    if ((FORMATS as readonly string[]).includes(format.value))
      void save({ defaultFormat: format.value as BarcodeFormat });
  });

  // Only the site list follows changes from elsewhere; typing fields stay as edited.
  api.onChange((s) => renderSites(s.allowedSites));

  const s = await api.load();
  renderSites(s.allowedSites);
  prefix.value = s.prefix;
  delay.value = String(s.keyDelayMs);
  format.value = s.defaultFormat;
  showSuffix(s.suffix);
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  void initSettings(document, {
    load: readSettings,
    save: updateSettings,
    addSite: (h) => updateAllowedSites((sites) => withSite(sites, h)),
    removeSite: (h) => updateAllowedSites((sites) => withoutSite(sites, h)),
    onChange: (listener) =>
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && SETTINGS_KEY in changes)
          void readSettings().then(listener);
      }),
  });
}
