import type { Shortcut } from "./settings";

export const BINDING = "__wedgeShortcut";
export const OFF_EVENT = "__wedgeShortcutOff";

export type KeyLike = {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  isTrusted: boolean;
};

// Runs inside the page via Function.prototype.toString: self-contained.
// Alt+Digit1..9 or Alt+Shift+Digit1..9, matched by event.code so macOS (where Alt+1 types "¡") works.
// Ctrl or Meta held (this includes AltGr on Windows, reported as Ctrl+Alt) → null. Synthetic events → null.
export function shortcutOf(e: KeyLike): Shortcut | null {
  if (!e.isTrusted || !e.altKey || e.ctrlKey || e.metaKey) return null;
  const m = /^Digit([1-9])$/.exec(e.code);
  return m ? (Number(m[1]) as Shortcut) : null;
}

// Runs inside the page via Function.prototype.toString: self-contained; `match` is shortcutOf passed in as source.
export function shortcutListener(
  match: (e: KeyboardEvent) => number | null,
  binding: string,
  offEvent: string,
): void {
  if (window !== window.top) return; // top frame only (focusProbe looks from the top document)
  const w = window as unknown as Record<string, unknown>;
  const send = w[binding];
  if (typeof send !== "function") return; // already installed in this document, or no binding
  delete w[binding]; // page scripts can't call it after this
  const onKey = (e: KeyboardEvent) => {
    const n = match(e);
    if (n === null) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    (send as (payload: string) => void)(String(n));
  };
  const off = () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener(offEvent, off);
  };
  window.addEventListener("keydown", onKey, true);
  window.addEventListener(offEvent, off);
}

export const INSTALL_SCRIPT = `(${shortcutListener.toString()})(${shortcutOf.toString()}, ${JSON.stringify(BINDING)}, ${JSON.stringify(OFF_EVENT)})`;
export const REMOVE_SCRIPT = `dispatchEvent(new Event(${JSON.stringify(OFF_EVENT)}))`;
