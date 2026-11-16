// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initWelcome, type WelcomeApi } from "./main";

const html = readFileSync("welcome.html", "utf8");
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
});

const gotIt = () => document.getElementById("got-it") as HTMLButtonElement;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(finish: () => Promise<void> = async () => {}) {
  const calls: string[] = [];
  const api: WelcomeApi = {
    finish: vi.fn(async () => {
      calls.push("finish");
      await finish();
    }),
    closeTab: vi.fn(async () => void calls.push("closeTab")),
    openSettings: vi.fn(),
  };
  initWelcome(document, api);
  return { api, calls };
}

describe("welcome", () => {
  it("renders the S02 copy", () => {
    const text = (sel: string) =>
      document.querySelector(sel)!.textContent!.replace(/\s+/g, " ").trim();
    expect(text("h1")).toBe(
      "Scans arrive as real keystrokes. Chrome will show a bar while it types.",
    );
    expect(document.querySelectorAll(".step")).toHaveLength(3);
    expect(text(".warning")).toContain("Leave this bar open.");
    expect(text(".safety")).toContain("never into password fields");
  });

  it("Got it marks first run done, then closes the tab", async () => {
    const { calls } = setup();
    gotIt().click();
    await flush();
    expect(calls).toEqual(["finish", "closeTab"]);
  });

  it("Got it keeps the tab open when saving fails", async () => {
    const { api } = setup(async () => {
      throw new Error("quota");
    });
    gotIt().click();
    await flush();
    expect(api.closeTab).not.toHaveBeenCalled();
    expect(gotIt().disabled).toBe(false);
  });

  it("Change typing settings opens settings", () => {
    const { api } = setup();
    document.getElementById("open-settings")!.click();
    expect(api.openSettings).toHaveBeenCalled();
  });
});
