// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { SavedCode } from "../core/settings";
import {
  describeImage,
  describeResult,
  describeSessionError,
  render,
  renderSavedCodes,
  type PopupView,
} from "./view";

const html = readFileSync("popup.html", "utf8");
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
});

const base: PopupView = {
  status: { state: "attached", host: "pos.example.test" },
  busy: false,
  result: null,
  suffix: "enter",
  keyDelayMs: 10,
  image: null,
};
const q = (s: string) => document.querySelector(s) as HTMLElement;
const sent = {
  kind: "sent",
  value: "5012345678900",
  keys: 13,
  suffix: "enter",
  label: "Item code",
} as const;

describe("describeResult", () => {
  it("describes a sent scan", () => {
    expect(describeResult(sent)).toEqual({
      tone: "success",
      summary: "Scanned 5012345678900",
      detail: "13 keys + Enter into “Item code”",
      reconnect: false,
    });
  });
  it.each([
    ["tab", 13, "13 keys + Tab into “Item code”"],
    ["none", 13, "13 keys into “Item code”"],
    ["enter", 1, "1 key + Enter into “Item code”"],
  ] as const)("suffix %s, %i keys", (suffix, keys, detail) => {
    expect(describeResult({ ...sent, suffix, keys }).detail).toBe(detail);
  });
  it.each([
    [
      { kind: "refused" },
      "error",
      "Not sent: that's a password field",
      "Click a text field on the page, then scan again.",
      false,
    ],
    [
      { kind: "no-field" },
      "warning",
      "No field is focused",
      "Click the field you want to fill on the page, then scan again.",
      false,
    ],
    [
      { kind: "detached" },
      "warning",
      "Typing stopped: the debugging bar was closed",
      "",
      true,
    ],
    [
      { kind: "site-off" },
      "warning",
      "Not sent: this site is off",
      "Turn on the switch above to scan here.",
      false,
    ],
    [
      { kind: "invalid", error: "empty" },
      "warning",
      "Type a code first",
      "",
      false,
    ],
    [
      { kind: "invalid", error: "too-long" },
      "error",
      "Code is too long",
      "Codes can be up to 256 characters.",
      false,
    ],
    [
      { kind: "invalid", error: "line-break" },
      "error",
      "Codes can't contain line breaks",
      "",
      false,
    ],
    [
      { kind: "error", message: "boom" },
      "error",
      "Something went wrong",
      "boom",
      false,
    ],
  ] as const)("%j", (r, tone, summary, detail, reconnect) => {
    expect(describeResult(r)).toEqual({ tone, summary, detail, reconnect });
  });
});

describe("describeSessionError", () => {
  it("explains unsupported pages", () => {
    const l = describeSessionError({
      ok: false,
      error: "unsupported-page",
      message: "x",
    });
    expect([l.tone, l.summary, l.detail]).toEqual([
      "warning",
      "Can't scan on this page",
      "Open a website, then switch on.",
    ]);
  });
  it("carries the message otherwise", () => {
    const l = describeSessionError({
      ok: false,
      error: "attach-failed",
      message: "denied",
    });
    expect([l.tone, l.summary, l.detail]).toEqual([
      "error",
      "Couldn't switch on",
      "denied",
    ]);
  });
});

describe("render", () => {
  it("site off", () => {
    render(document, {
      ...base,
      status: { state: "off", host: "shop.example.test" },
    });
    expect(q("#switch").getAttribute("aria-checked")).toBe("false");
    expect(q("#site-title").textContent).toBe("Off for shop.example.test");
    expect((q("#code") as HTMLInputElement).disabled).toBe(true);
    expect((q("#scan") as HTMLButtonElement).disabled).toBe(true);
    expect(q("#result").hidden).toBe(true);
  });
  it("ready", () => {
    render(document, base);
    expect(q("#switch").getAttribute("aria-checked")).toBe("true");
    expect(q("#site-title").textContent).toBe("On for pos.example.test");
    expect(q("#site-hint").textContent).toBe(
      "Typing into the field you last clicked",
    );
    expect((q("#code") as HTMLInputElement).disabled).toBe(false);
    expect((q("#scan") as HTMLButtonElement).disabled).toBe(false);
    expect(q("#result").hidden).toBe(true);
  });
  it("sent", () => {
    render(document, { ...base, result: describeResult(sent) });
    expect(q("#result").getAttribute("role")).toBe("status");
    expect(q("#result").dataset.tone).toBe("success");
    expect(q(".result-icon").textContent).toBe("✓");
  });
  it.each([
    [{ kind: "refused" }, "error", "×"],
    [{ kind: "no-field" }, "warning", "!"],
  ] as const)("%j alerts", (r, tone, icon) => {
    render(document, { ...base, result: describeResult(r) });
    expect(q("#result").getAttribute("role")).toBe("alert");
    expect(q("#result").dataset.tone).toBe(tone);
    expect(q(".result-icon").textContent).toBe(icon);
    expect(q(".result-action").hidden).toBe(true);
  });
  it("shows the detached line with Reconnect when result is null", () => {
    render(document, {
      ...base,
      status: { state: "detached", host: "pos.example.test" },
    });
    expect(q("#result").hidden).toBe(false);
    expect(q(".result-action").hidden).toBe(false);
    expect((q("#scan") as HTMLButtonElement).disabled).toBe(false);
  });
  it("busy", () => {
    render(document, { ...base, busy: true });
    expect((q("#scan") as HTMLButtonElement).disabled).toBe(true);
    expect(q("#scan").textContent).toBe("Typing…");
    expect((q("#code") as HTMLInputElement).disabled).toBe(false);
  });
  it("host null", () => {
    render(document, { ...base, status: { state: "off", host: null } });
    expect((q("#switch") as HTMLButtonElement).disabled).toBe(true);
    expect(q("#site-title").textContent).toBe("Not available on this page");
  });
  it("footer", () => {
    render(document, { ...base, suffix: "tab", keyDelayMs: 25 });
    expect(q("#footer-typing").textContent).toBe(
      "Ends with: Tab · 25 ms per key",
    );
    expect(q("#hint-suffix").textContent).toBe("Tab");
  });
  it("never uses innerHTML for page text", () => {
    render(document, {
      ...base,
      result: describeResult({ ...sent, label: "<b>x</b>" }),
    });
    expect(q(".result-detail").querySelector("b")).toBeNull();
  });
});

describe("markup", () => {
  it("keeps focus order switch → code → scan → drop → reconnect → saved Edit → help → settings", () => {
    const els = [
      ...document.querySelectorAll("button, input:not([hidden]), #drop"),
    ];
    expect(els.map((e) => e.id)).toEqual([
      "switch",
      "code",
      "scan",
      "drop",
      "reconnect",
      "saved-edit",
      "help",
      "settings",
    ]);
    expect(els.every((e) => Number(e.getAttribute("tabindex") ?? 0) <= 0)).toBe(
      true,
    );
    expect(q("#switch").getAttribute("role")).toBe("switch");
  });
});

describe("describeImage", () => {
  it.each([
    [{ kind: "decoded" }, "Ready to scan", "Press Scan or Enter to type it."],
    [
      { kind: "unreadable", fileName: "a.png" },
      "No barcode found in a.png",
      "Try a sharper, straight-on image. QR codes aren't supported yet.",
    ],
    [
      { kind: "unsupported", fileName: "a.gif" },
      "Can't open a.gif",
      "Choose a PNG, JPEG or WebP image.",
    ],
  ] as const)("describes %j", (outcome, summary, detail) => {
    expect(describeImage(outcome)).toMatchObject({ summary, detail });
  });
});

describe("renderSavedCodes", () => {
  const codes: SavedCode[] = [
    { id: "a", name: "Coffee beans 1kg", value: "5012345678900", shortcut: 1 },
    { id: "b", name: "", value: "PLT-004417-A", shortcut: null },
  ];
  const scanBtns = () =>
    document.querySelectorAll<HTMLButtonElement>(".saved-scan");

  it("shows a row per code with name, value and Alt+N", () => {
    renderSavedCodes(document, codes);
    const rows = document.querySelectorAll(".saved-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector(".saved-name")!.textContent).toBe(
      "Coffee beans 1kg",
    );
    expect(rows[0]!.querySelector(".saved-value")!.textContent).toBe(
      "5012345678900",
    );
    expect(rows[0]!.querySelector("kbd")!.textContent).toBe("Alt+1");
    expect(rows[1]!.querySelector("kbd")).toBeNull();
  });

  it("shows the empty line when there are no codes", () => {
    renderSavedCodes(document, []);
    expect(q("#saved-empty").hidden).toBe(false);
    expect(q("#saved-list").hidden).toBe(true);
    renderSavedCodes(document, codes);
    expect(q("#saved-empty").hidden).toBe(true);
    expect(q("#saved-list").hidden).toBe(false);
  });

  it("labels each Scan button with the code name, or the value", () => {
    renderSavedCodes(document, codes);
    expect(scanBtns()[0]!.getAttribute("aria-label")).toBe(
      "Scan Coffee beans 1kg",
    );
    expect(scanBtns()[1]!.getAttribute("aria-label")).toBe("Scan PLT-004417-A");
    expect(q(".saved-row + .saved-row .saved-name").textContent).toBe(
      "PLT-004417-A",
    );
  });

  it("renders names as text", () => {
    renderSavedCodes(document, [
      { id: "x", name: "<b>x</b>", value: "1", shortcut: null },
    ]);
    expect(document.querySelector(".saved-name b")).toBeNull();
    expect(q(".saved-name").textContent).toBe("<b>x</b>");
  });

  it("render disables saved Scan buttons when off or busy", () => {
    renderSavedCodes(document, codes);
    const disabled = (v: PopupView) => {
      render(document, v);
      return [...scanBtns()].map((b) => b.disabled);
    };
    expect(
      disabled({ ...base, status: { state: "off", host: "pos.example.test" } }),
    ).toEqual([true, true]);
    expect(disabled({ ...base, busy: true })).toEqual([true, true]);
    expect(disabled(base)).toEqual([false, false]);
  });
});
