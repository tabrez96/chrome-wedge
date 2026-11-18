// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clampPrefix, defaultSettings, type Settings } from "../core/settings";
import { initSettings, type SettingsApi } from "./main";

const html = readFileSync("settings.html", "utf8");
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const suffixBtn = (v: string) =>
  document.querySelector<HTMLButtonElement>(`[data-suffix="${v}"]`)!;

let current: Partial<Settings> = {};
let changed: (s: Settings) => void = () => {};

async function setup(
  overrides: Partial<Settings> = {},
  save: SettingsApi["save"] = vi.fn(async () => {}),
  extra: Partial<SettingsApi> = {},
) {
  current = overrides;
  const api: SettingsApi = {
    load: async () => ({ ...defaultSettings(), ...current }),
    save,
    addSite: vi.fn(async () => {}),
    removeSite: vi.fn(async () => {}),
    saveCodes: vi.fn(async () => {}),
    newId: () => "new-id",
    onChange: (l) => (changed = l),
    ...extra,
  };
  await initSettings(document, api);
  return api;
}

const submitSite = (value: string) => {
  $<HTMLInputElement>("site-host").value = value;
  $<HTMLFormElement>("site-form").dispatchEvent(
    new Event("submit", { cancelable: true }),
  );
};
const rows = () =>
  [...document.querySelectorAll(".site-host")].map((e) => e.textContent);

function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("change"));
}

describe("settings page", () => {
  it("shows the stored typing settings", async () => {
    await setup({
      prefix: "]C1",
      suffix: "tab",
      keyDelayMs: 40,
      defaultFormat: "upca",
    });
    expect($<HTMLInputElement>("prefix").value).toBe("]C1");
    expect($<HTMLInputElement>("delay").value).toBe("40");
    expect($<HTMLSelectElement>("format").value).toBe("upca");
    expect(suffixBtn("tab").getAttribute("aria-pressed")).toBe("true");
    expect(suffixBtn("enter").getAttribute("aria-pressed")).toBe("false");
    expect($("save-status").textContent).toBe("");
    expect($("sites-card").querySelector("h2")!.textContent).toBe(
      "Allowed sites",
    );
    expect($("saved-codes").querySelector("h2")!.textContent).toBe(
      "Saved codes",
    );
  });

  it("prefix change saves the clamped prefix", async () => {
    const api = await setup();
    const raw = "A\nB" + "x".repeat(40);
    change($<HTMLInputElement>("prefix"), raw);
    expect(api.save).toHaveBeenCalledWith({ prefix: clampPrefix(raw) });
    expect($<HTMLInputElement>("prefix").value).toBe(clampPrefix(raw));
  });

  it("suffix buttons save and mark the pressed one", async () => {
    const api = await setup();
    suffixBtn("none").click();
    expect(api.save).toHaveBeenCalledWith({ suffix: "none" });
    expect(suffixBtn("none").getAttribute("aria-pressed")).toBe("true");
    expect(suffixBtn("enter").getAttribute("aria-pressed")).toBe("false");
  });

  it.each(["501", "2.5", "abc"])(
    "invalid delay %j shows the error and does not save",
    async (bad) => {
      const api = await setup();
      change($<HTMLInputElement>("delay"), bad);
      expect(api.save).not.toHaveBeenCalled();
      expect($("delay").getAttribute("aria-invalid")).toBe("true");
      expect($("delay-error").hidden).toBe(false);
      expect($("delay-error").textContent!.trim()).toBe(
        "Enter a whole number from 0 to 500.",
      );
    },
  );

  it("fixing the delay clears the error and saves the number", async () => {
    const api = await setup();
    change($<HTMLInputElement>("delay"), "-1");
    change($<HTMLInputElement>("delay"), "250");
    expect($("delay-error").hidden).toBe(true);
    expect($("delay").hasAttribute("aria-invalid")).toBe(false);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith({ keyDelayMs: 250 });
  });

  it("format change saves", async () => {
    const api = await setup();
    change($<HTMLSelectElement>("format"), "ean13");
    expect(api.save).toHaveBeenCalledWith({ defaultFormat: "ean13" });
  });

  it("header reports a failed save, then a successful one", async () => {
    const save = vi
      .fn<SettingsApi["save"]>()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValue(undefined);
    await setup({}, save);
    change($<HTMLSelectElement>("format"), "upca");
    await flush();
    expect($("save-status").textContent).toBe("Couldn't save your change.");
    expect($("save-status").classList.contains("error")).toBe(true);
    change($<HTMLSelectElement>("format"), "ean13");
    await flush();
    expect($("save-status").textContent).toBe("✓ Changes saved");
    expect($("save-status").classList.contains("error")).toBe(false);
  });
});

describe("allowed sites", () => {
  it("shows the empty state when there are no sites", async () => {
    await setup();
    expect($("sites-table").hidden).toBe(true);
    expect($("sites-empty").hidden).toBe(false);
    expect($("sites-empty").textContent!.trim()).toBe(
      "No sites yet. Scans won't be typed anywhere until you add one.",
    );
    expect($("site-host").getAttribute("placeholder")).toBe(
      "e.g. localhost:3000",
    );
  });

  it("lists stored sites in a table", async () => {
    await setup({ allowedSites: ["a.test", "b.test:81"] });
    expect(rows()).toEqual(["a.test", "b.test:81"]);
    expect($("sites-table").hidden).toBe(false);
    expect($("sites-empty").hidden).toBe(true);
    const labels = [...document.querySelectorAll(".link-danger")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Remove a.test", "Remove b.test:81"]);
  });

  it("adding normalises the host and saves it", async () => {
    const api = await setup();
    submitSite("HTTPS://Pos.Example.com:3000/till");
    await flush();
    expect(api.addSite).toHaveBeenCalledWith("pos.example.com:3000");
    expect($<HTMLInputElement>("site-host").value).toBe("");
    expect($("save-status").textContent).toBe("✓ Changes saved");
  });

  it.each(["", "not a host!", "localhost:99999"])(
    "invalid host %j shows the inline error and does not save",
    async (bad) => {
      const api = await setup();
      submitSite(bad);
      expect(api.addSite).not.toHaveBeenCalled();
      expect($("site-error").hidden).toBe(false);
      expect($("site-error").textContent!.trim()).toBe(
        "Enter a host like localhost:3000 or pos.example.com",
      );
      expect($("site-host").getAttribute("aria-invalid")).toBe("true");
    },
  );

  it("fixing the host clears the error", async () => {
    const api = await setup();
    submitSite("not a host!");
    submitSite("a.test");
    await flush();
    expect($("site-error").hidden).toBe(true);
    expect($("site-host").hasAttribute("aria-invalid")).toBe(false);
    expect(api.addSite).toHaveBeenCalledTimes(1);
  });

  it("Remove calls removeSite and re-renders from storage", async () => {
    const api = await setup({ allowedSites: ["a.test"] }, undefined, {
      removeSite: vi.fn(async () => {
        current = { allowedSites: [] };
      }),
    });
    document.querySelector<HTMLButtonElement>(".link-danger")!.click();
    await flush();
    expect(api.removeSite).toHaveBeenCalledWith("a.test");
    expect(rows()).toEqual([]);
    expect($("sites-empty").hidden).toBe(false);
    expect($("save-status").textContent).toBe("✓ Changes saved");
  });

  it("a failed add reports the error", async () => {
    await setup({}, undefined, {
      addSite: vi.fn().mockRejectedValue(new Error("quota")),
    });
    submitSite("a.test");
    await flush();
    expect($("save-status").textContent).toBe("Couldn't save your change.");
    expect($("save-status").classList.contains("error")).toBe(true);
  });

  it("re-renders the list when settings change elsewhere", async () => {
    await setup({ prefix: "X" });
    $<HTMLInputElement>("prefix").value = "typing";
    changed({ ...defaultSettings(), allowedSites: ["new.test"] });
    expect(rows()).toEqual(["new.test"]);
    expect($<HTMLInputElement>("prefix").value).toBe("typing");
  });
});
