import {
  readSettings,
  updateSettings,
  type TypingSettings,
} from "../background/session";
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

  async function save(patch: Partial<TypingSettings>): Promise<void> {
    try {
      await api.save(patch);
      status.textContent = "✓ Changes saved";
      status.classList.remove("error");
    } catch {
      status.textContent = "Couldn't save your change.";
      status.classList.add("error");
    }
  }

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

  const s = await api.load();
  prefix.value = s.prefix;
  delay.value = String(s.keyDelayMs);
  format.value = s.defaultFormat;
  showSuffix(s.suffix);
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  void initSettings(document, { load: readSettings, save: updateSettings });
}
