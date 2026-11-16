export const SETTINGS_VERSION = 1;
export const KEY_DELAY_MIN_MS = 0;
export const KEY_DELAY_MAX_MS = 500;
export const DEFAULT_KEY_DELAY_MS = 10;
export const MAX_SAVED_CODES = 9;
export const MAX_SCAN_LENGTH = 256;
export const MAX_PREFIX_LENGTH = 32;
export const MAX_NAME_LENGTH = 40;

export const SUFFIXES = ["enter", "tab", "none"] as const;
export type Suffix = (typeof SUFFIXES)[number];
export const FORMATS = ["code128", "ean13", "upca"] as const;
export type BarcodeFormat = (typeof FORMATS)[number];
export type Shortcut = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SavedCode = {
  id: string;
  name: string;
  value: string;
  shortcut: Shortcut | null;
};

export type Settings = {
  version: typeof SETTINGS_VERSION;
  prefix: string;
  suffix: Suffix;
  keyDelayMs: number;
  defaultFormat: BarcodeFormat;
  allowedSites: string[];
  savedCodes: SavedCode[];
  firstRunDone: boolean;
};

// A fresh object each call, so callers never share the arrays.
export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    prefix: "",
    suffix: "enter",
    keyDelayMs: DEFAULT_KEY_DELAY_MS,
    defaultFormat: "code128",
    allowedSites: [],
    savedCodes: [],
    firstRunDone: false,
  };
}

// CR, LF, U+2028, U+2029 (written as escapes so the regex is visible).
const LINE_BREAK = /[\r\n\u2028\u2029]/;
const LINE_BREAKS = /[\r\n\u2028\u2029]/g;

const length = (s: string): number => [...s].length;

export type ScanValueError = "empty" | "too-long" | "line-break";

// The value is not trimmed: spaces can be part of a code.
export function checkScanValue(value: string): ScanValueError | null {
  if (value === "") return "empty";
  if (LINE_BREAK.test(value)) return "line-break";
  if (length(value) > MAX_SCAN_LENGTH) return "too-long";
  return null;
}

export function clampKeyDelay(ms: unknown): number {
  if (typeof ms !== "number" || !Number.isFinite(ms))
    return DEFAULT_KEY_DELAY_MS;
  return Math.min(KEY_DELAY_MAX_MS, Math.max(KEY_DELAY_MIN_MS, Math.round(ms)));
}

// The delay field's text as a whole number of ms, or null if it isn't one from 0 to 500.
export function parseKeyDelay(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const ms = Number(t);
  return ms >= KEY_DELAY_MIN_MS && ms <= KEY_DELAY_MAX_MS ? ms : null;
}

export function clampPrefix(prefix: unknown): string {
  if (typeof prefix !== "string") return "";
  return [...prefix.replace(LINE_BREAKS, "")]
    .slice(0, MAX_PREFIX_LENGTH)
    .join("");
}

export type SavedCodeError = ScanValueError | "shortcut-taken" | "too-many";

// Checks an added or edited row against the codes already saved.
export function checkSavedCode(
  code: SavedCode,
  existing: readonly SavedCode[],
): SavedCodeError | null {
  const valueError = checkScanValue(code.value);
  if (valueError) return valueError;
  const others = existing.filter((c) => c.id !== code.id);
  if (others.length === existing.length && existing.length >= MAX_SAVED_CODES) {
    return "too-many";
  }
  if (
    code.shortcut !== null &&
    others.some((c) => c.shortcut === code.shortcut)
  ) {
    return "shortcut-taken";
  }
  return null;
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

// MIGRATIONS[n] upgrades a version-n object to version n + 1.
export const MIGRATIONS: Record<number, Migration> = {};

export function migrate(
  raw: Record<string, unknown>,
  target: number = SETTINGS_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): Record<string, unknown> {
  let v =
    typeof raw.version === "number" && Number.isInteger(raw.version)
      ? raw.version
      : target;
  if (v >= target) return { ...raw, version: target };
  let out = raw;
  while (v < target) {
    const m = migrations[v];
    if (!m) return { version: target }; // unknown old version: use defaults
    out = m(out);
    v++;
  }
  return { ...out, version: target };
}
