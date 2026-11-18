import {
  MAX_NAME_LENGTH,
  MAX_SAVED_CODES,
  MAX_SCAN_LENGTH,
  type SavedCode,
  type SavedCodeError,
  type Shortcut,
} from "./settings";

export function savedCodeMessage(
  error: SavedCodeError,
  shortcut: Shortcut | null,
): string {
  switch (error) {
    case "empty":
      return "Enter a code to save.";
    case "too-long":
      return `Codes can be up to ${MAX_SCAN_LENGTH} characters.`;
    case "line-break":
      return "Codes can't contain line breaks.";
    case "shortcut-taken":
      return `Alt+${shortcut} is already used by another code.`;
    case "too-many":
      return `You can save up to ${MAX_SAVED_CODES} codes. Delete one to add another.`;
  }
}

// Trims and cuts to MAX_NAME_LENGTH characters (code points, like the other limits). Empty is allowed.
export function cleanName(name: string): string {
  return [...name.trim()].slice(0, MAX_NAME_LENGTH).join("");
}

// Replaces the code with the same id, or appends it. Does not validate.
export function withCode(
  codes: readonly SavedCode[],
  code: SavedCode,
): SavedCode[] {
  return codes.some((c) => c.id === code.id)
    ? codes.map((c) => (c.id === code.id ? code : c))
    : [...codes, code];
}

export function withoutCode(
  codes: readonly SavedCode[],
  id: string,
): SavedCode[] {
  return codes.filter((c) => c.id !== id);
}

// Undo: puts the code back at `index` (clamped to the list length). Returns the list unchanged if the
// id is already present or the list is full. If its shortcut was taken meanwhile, restores it with shortcut null.
export function restoreCode(
  codes: readonly SavedCode[],
  code: SavedCode,
  index: number,
): SavedCode[] {
  if (codes.length >= MAX_SAVED_CODES || codes.some((c) => c.id === code.id))
    return [...codes];
  const taken =
    code.shortcut !== null && codes.some((c) => c.shortcut === code.shortcut);
  const restored = taken ? { ...code, shortcut: null } : code;
  const at = Math.max(0, Math.min(index, codes.length));
  return [...codes.slice(0, at), restored, ...codes.slice(at)];
}

// "1".."9" → Shortcut, anything else → null. Used to read the <select>.
export function parseShortcut(value: string): Shortcut | null {
  return /^[1-9]$/.test(value) ? (Number(value) as Shortcut) : null;
}
