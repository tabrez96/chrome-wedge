import type { ScanResult, SessionReply, TabStatus } from "../core/messages";
import { MAX_SCAN_LENGTH, type Suffix } from "../core/settings";

export type Tone = "success" | "warning" | "error";
export type ResultLine = {
  tone: Tone;
  summary: string;
  detail: string;
  reconnect: boolean;
};
export type PopupView = {
  status: TabStatus;
  busy: boolean; // a scan is in flight
  result: ResultLine | null;
  suffix: Suffix;
  keyDelayMs: number;
};

export const SUFFIX_NAMES: Record<Suffix, string> = {
  enter: "Enter",
  tab: "Tab",
  none: "nothing",
};

const line = (
  tone: Tone,
  summary: string,
  detail = "",
  reconnect = false,
): ResultLine => ({ tone, summary, detail, reconnect });

export function describeResult(r: ScanResult): ResultLine {
  switch (r.kind) {
    case "sent": {
      const keys = `${r.keys} ${r.keys === 1 ? "key" : "keys"}`;
      const plus = r.suffix === "none" ? "" : ` + ${SUFFIX_NAMES[r.suffix]}`;
      return line(
        "success",
        `Scanned ${r.value}`,
        `${keys}${plus} into “${r.label}”`,
      );
    }
    case "refused":
      return line(
        "error",
        "Not sent: that's a password field",
        "Click a text field on the page, then scan again.",
      );
    case "no-field":
      return line(
        "warning",
        "No field is focused",
        "Click the field you want to fill on the page, then scan again.",
      );
    case "detached":
      return line(
        "warning",
        "Typing stopped: the debugging bar was closed",
        "",
        true,
      );
    case "site-off":
      return line(
        "warning",
        "Not sent: this site is off",
        "Turn on the switch above to scan here.",
      );
    case "invalid":
      if (r.error === "empty") return line("warning", "Type a code first");
      if (r.error === "too-long")
        return line(
          "error",
          "Code is too long",
          `Codes can be up to ${MAX_SCAN_LENGTH} characters.`,
        );
      return line("error", "Codes can't contain line breaks");
    case "error":
      return line("error", "Something went wrong", r.message);
  }
}

export function describeSessionError(
  reply: Extract<SessionReply, { ok: false }>,
): ResultLine {
  if (reply.error === "unsupported-page")
    return line(
      "warning",
      "Can't scan on this page",
      "Open a website, then switch on.",
    );
  return line("error", "Couldn't switch on", reply.message);
}

const ICONS: Record<Tone, string> = { success: "✓", warning: "!", error: "×" };

export function render(doc: Document, view: PopupView): void {
  const $ = <T extends HTMLElement>(sel: string) => doc.querySelector(sel) as T;
  const { status, busy } = view;
  const on = status.state !== "off";
  const host = status.host;

  $("#site").dataset.on = String(on);
  const sw = $<HTMLButtonElement>("#switch");
  sw.setAttribute("aria-checked", String(on));
  sw.disabled = host === null;
  $("#site-title").textContent =
    host === null
      ? "Not available on this page"
      : `${on ? "On" : "Off"} for ${host}`;
  $("#site-hint").textContent =
    host === null
      ? "Open a website to scan into it"
      : on
        ? "Typing into the field you last clicked"
        : "Turn on to type scans into this site";

  $<HTMLInputElement>("#code").disabled = !on;
  const scan = $<HTMLButtonElement>("#scan");
  scan.disabled = !on || busy;
  scan.textContent = busy ? "Typing…" : "Scan";

  const shown =
    view.result ??
    (status.state === "detached" ? describeResult({ kind: "detached" }) : null);
  const result = $("#result");
  result.hidden = shown === null;
  if (shown) {
    result.dataset.tone = shown.tone;
    result.setAttribute("role", shown.tone === "success" ? "status" : "alert");
    $(".result-icon").textContent = ICONS[shown.tone];
    $(".result-summary").textContent = shown.summary;
    $(".result-detail").textContent = shown.detail;
    $(".result-detail").hidden = shown.detail === "";
    $(".result-action").hidden = !shown.reconnect;
  }

  const name = SUFFIX_NAMES[view.suffix];
  $("#hint-suffix").textContent = name;
  $("#footer-typing").textContent =
    `Ends with: ${name} · ${view.keyDelayMs} ms per key`;
}
