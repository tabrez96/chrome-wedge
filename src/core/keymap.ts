// CDP Input.dispatchKeyEvent modifier bit for Shift.
export const SHIFT = 8;

// The key fields of an Input.dispatchKeyEvent call. Fields that do not apply are
// left out (not set to undefined), so tests can use toStrictEqual.
export type KeyParams = {
  key: string;
  code?: string;
  windowsVirtualKeyCode?: number;
  text?: string;
  modifiers?: number;
};

export const ENTER: KeyParams = {
  key: "Enter",
  code: "Enter",
  windowsVirtualKeyCode: 13,
  text: "\r",
};
export const TAB: KeyParams = {
  key: "Tab",
  code: "Tab",
  windowsVirtualKeyCode: 9,
};

const SHIFTED_DIGITS = ")!@#$%^&*(";

// [unshifted, shifted, code, virtual key code], US QWERTY.
const PUNCTUATION: [string, string, string, number][] = [
  ["`", "~", "Backquote", 192],
  ["-", "_", "Minus", 189],
  ["=", "+", "Equal", 187],
  ["[", "{", "BracketLeft", 219],
  ["]", "}", "BracketRight", 221],
  ["\\", "|", "Backslash", 220],
  [";", ":", "Semicolon", 186],
  ["'", '"', "Quote", 222],
  [",", "<", "Comma", 188],
  [".", ">", "Period", 190],
  ["/", "?", "Slash", 191],
];

const KEYS = new Map<string, KeyParams>();

function add(
  ch: string,
  code: string,
  windowsVirtualKeyCode: number,
  shifted: boolean,
): void {
  const params: KeyParams = {
    key: ch,
    code,
    windowsVirtualKeyCode,
    text: ch,
  };
  if (shifted) params.modifiers = SHIFT;
  KEYS.set(ch, params);
}

for (let c = 65; c <= 90; c++) {
  const upper = String.fromCharCode(c);
  add(upper.toLowerCase(), `Key${upper}`, c, false);
  add(upper, `Key${upper}`, c, true);
}
for (let d = 0; d <= 9; d++) {
  add(String(d), `Digit${d}`, 48 + d, false);
  add(SHIFTED_DIGITS.charAt(d), `Digit${d}`, 48 + d, true);
}
for (const [plain, shifted, code, vk] of PUNCTUATION) {
  add(plain, code, vk, false);
  add(shifted, code, vk, true);
}
add(" ", "Space", 32, false);

export function keyForChar(ch: string): KeyParams {
  if ([...ch].length !== 1) {
    throw new RangeError("keyForChar expects one character");
  }
  const entry = KEYS.get(ch);
  return entry ? { ...entry } : { key: ch, text: ch };
}
