import type { ScanValueError, Suffix } from "./settings";

export type TabState = "off" | "attached" | "detached";
// host is null for pages that cannot be switched on (chrome://, file://, missing tab).
export type TabStatus = { state: TabState; host: string | null };

export type SessionError = "unsupported-page" | "attach-failed" | "internal";
export type SessionReply =
  | { ok: true; status: TabStatus }
  | { ok: false; error: SessionError; message: string };

export type PopupMessage =
  | { type: "session-get"; tabId: number }
  | { type: "session-on"; tabId: number }
  | { type: "session-off"; tabId: number }
  | { type: "scan"; tabId: number; value: string };

// Reply to "scan" (handled by src/background/scan.ts). Shared by the popup and the worker.
export type ScanResult =
  | {
      kind: "sent";
      value: string;
      keys: number;
      suffix: Suffix;
      fieldLabel: string | null;
    }
  | { kind: "refused" } // focused field is a password field
  | { kind: "no-field" } // focus is inside a cross-origin iframe
  | { kind: "site-off" } // tab not switched on, or its current host is not allowed
  | { kind: "detached" }
  | { kind: "invalid"; error: ScanValueError }
  | { kind: "error"; message: string };

const SESSION_TYPES = ["session-get", "session-on", "session-off"];

export function isPopupMessage(x: unknown): x is PopupMessage {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  if (!Number.isSafeInteger(m.tabId) || (m.tabId as number) < 0) return false;
  if (m.type === "scan") return typeof m.value === "string";
  return typeof m.type === "string" && SESSION_TYPES.includes(m.type);
}
