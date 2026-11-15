// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PopupMessage } from "../core/messages";
import { initPopup, type PopupApi } from "./main";

const html = readFileSync("popup.html", "utf8");
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
});

const q = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const sentReply = {
  kind: "sent",
  value: "4006381333931",
  keys: 13,
  suffix: "enter",
  label: "Item code",
};

async function open(
  state: "off" | "attached" | "detached" = "attached",
  scanReply: unknown = sentReply,
) {
  const send = vi.fn(async (msg: PopupMessage) => {
    if (msg.type === "scan") return scanReply;
    const next = msg.type === "session-off" ? "off" : "attached";
    return {
      ok: true,
      status: {
        state: msg.type === "session-get" ? state : next,
        host: "pos.example.test",
      },
    };
  });
  const api = {
    tabId: async () => 7,
    send,
    settings: async () => ({ suffix: "enter" as const, keyDelayMs: 10 }),
    openHelp: vi.fn(),
    openSettings: vi.fn(),
  } as unknown as PopupApi;
  await initPopup(document, api);
  return { send, api };
}
const types = (send: { mock: { calls: unknown[][] } }) =>
  send.mock.calls.map((c) => (c[0] as PopupMessage).type);

describe("initPopup", () => {
  it("reads the tab status and focuses the input", async () => {
    await open();
    expect(q("#site-title").textContent).toBe("On for pos.example.test");
    expect(document.activeElement).toBe(q("#code"));
  });

  it("sends the scan on form submit and shows the sent line", async () => {
    const { send } = await open();
    q<HTMLInputElement>("#code").value = "4006381333931";
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() =>
      expect(q("#result").getAttribute("role")).toBe("status"),
    );
    expect(send).toHaveBeenCalledWith({
      type: "scan",
      tabId: 7,
      value: "4006381333931",
    });
    expect(q(".result-summary").textContent).toBe("Scanned 4006381333931");
  });

  it("sends the same scan when Scan is clicked", async () => {
    const { send } = await open();
    q<HTMLInputElement>("#code").value = "4006381333931";
    q("#scan").click();
    await vi.waitFor(() => expect(types(send)).toContain("scan"));
    expect(send).toHaveBeenCalledWith({
      type: "scan",
      tabId: 7,
      value: "4006381333931",
    });
  });

  it("does not send an empty code", async () => {
    const { send } = await open();
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() => expect(q("#result").hidden).toBe(false));
    expect(q(".result-summary").textContent).toBe("Type a code first");
    expect(types(send)).not.toContain("scan");
  });

  it("reports a rejected send as an error and clears busy", async () => {
    const { send } = await open();
    send.mockRejectedValueOnce(new Error("worker gone"));
    q<HTMLInputElement>("#code").value = "123";
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() =>
      expect(q(".result-detail").textContent).toBe("worker gone"),
    );
    expect(q<HTMLButtonElement>("#scan").disabled).toBe(false);
  });

  it.each([
    ["off", "session-on"],
    ["attached", "session-off"],
  ] as const)("switch click while %s sends %s", async (state, type) => {
    const { send } = await open(state);
    q("#switch").click();
    await vi.waitFor(() => expect(types(send)).toContain(type));
  });

  it("reconnects through session-on", async () => {
    const { send } = await open("detached");
    q("#reconnect").click();
    await vi.waitFor(() => expect(types(send)).toContain("session-on"));
  });

  it("opens help and settings", async () => {
    const { api } = await open();
    q("#help").click();
    q("#settings").click();
    expect(api.openHelp).toHaveBeenCalled();
    expect(api.openSettings).toHaveBeenCalled();
  });

  it("disables the input when the scan reply is site-off", async () => {
    await open("attached", { kind: "site-off" });
    q<HTMLInputElement>("#code").value = "123";
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() =>
      expect(q<HTMLInputElement>("#code").disabled).toBe(true),
    );
  });

  it("re-enables the switch and shows the error when session-on rejects", async () => {
    const { send } = await open("off");
    send.mockRejectedValueOnce(new Error("worker restarting"));
    q("#switch").click();
    await vi.waitFor(() =>
      expect(q("#result").textContent).toContain("worker restarting"),
    );
    expect(q<HTMLButtonElement>("#switch").disabled).toBe(false);
    expect(q("#result").getAttribute("role")).toBe("alert");
  });

  it("shows the error when the first session-get rejects", async () => {
    const send = vi.fn(async () => {
      throw new Error("no worker");
    });
    await initPopup(document, {
      tabId: async () => 7,
      send,
      settings: async () => ({ suffix: "enter" as const, keyDelayMs: 10 }),
      openHelp: vi.fn(),
      openSettings: vi.fn(),
    } as unknown as PopupApi);
    expect(q("#result").textContent).toContain("no worker");
  });
});
