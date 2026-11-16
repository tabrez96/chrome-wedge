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

async function setup(
  overrides: Partial<Settings> = {},
  save: SettingsApi["save"] = vi.fn(async () => {}),
) {
  const api: SettingsApi = {
    load: async () => ({ ...defaultSettings(), ...overrides }),
    save,
  };
  await initSettings(document, api);
  return api;
}

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
    expect(document.body.textContent).not.toContain("Saved codes");
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
