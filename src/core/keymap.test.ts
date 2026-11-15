// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ENTER, TAB, keyForChar } from "./keymap";

describe("keyForChar", () => {
  it("maps all 95 printable ASCII characters with a code and virtual key", () => {
    for (let c = 0x20; c <= 0x7e; c++) {
      const ch = String.fromCharCode(c);
      const k = keyForChar(ch);
      expect(k.key).toBe(ch);
      expect(k.text).toBe(ch);
      expect(typeof k.code).toBe("string");
      expect(typeof k.windowsVirtualKeyCode).toBe("number");
    }
  });

  it("maps lower and upper case letters to the same key, Shift for upper", () => {
    expect(keyForChar("a")).toStrictEqual({
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      text: "a",
    });
    expect(keyForChar("Z")).toStrictEqual({
      key: "Z",
      code: "KeyZ",
      windowsVirtualKeyCode: 90,
      text: "Z",
      modifiers: 8,
    });
    for (let c = 65; c <= 90; c++) {
      const upper = keyForChar(String.fromCharCode(c));
      const lower = keyForChar(String.fromCharCode(c + 32));
      expect(upper.code).toBe(lower.code);
      expect(upper.windowsVirtualKeyCode).toBe(lower.windowsVirtualKeyCode);
      expect(upper.windowsVirtualKeyCode).toBe(c);
    }
  });

  it("maps digits and their shifted symbols", () => {
    expect(keyForChar("0")).toStrictEqual({
      key: "0",
      code: "Digit0",
      windowsVirtualKeyCode: 48,
      text: "0",
    });
    expect(keyForChar("!")).toStrictEqual({
      key: "!",
      code: "Digit1",
      windowsVirtualKeyCode: 49,
      text: "!",
      modifiers: 8,
    });
    expect(keyForChar("(")).toStrictEqual({
      key: "(",
      code: "Digit9",
      windowsVirtualKeyCode: 57,
      text: "(",
      modifiers: 8,
    });
    expect(keyForChar(")")).toStrictEqual({
      key: ")",
      code: "Digit0",
      windowsVirtualKeyCode: 48,
      text: ")",
      modifiers: 8,
    });
  });

  it.each([
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
  ])("maps punctuation pair %s %s", (plain, shifted, code, vk) => {
    expect(keyForChar(plain)).toStrictEqual({
      key: plain,
      code,
      windowsVirtualKeyCode: vk,
      text: plain,
    });
    expect(keyForChar(shifted)).toStrictEqual({
      key: shifted,
      code,
      windowsVirtualKeyCode: vk,
      text: shifted,
      modifiers: 8,
    });
  });

  it("maps space", () => {
    expect(keyForChar(" ")).toStrictEqual({
      key: " ",
      code: "Space",
      windowsVirtualKeyCode: 32,
      text: " ",
    });
  });

  it("gives non-ASCII characters key and text only", () => {
    for (const ch of ["é", "€", "😀", "\t"]) {
      expect(keyForChar(ch)).toStrictEqual({ key: ch, text: ch });
    }
  });

  it("rejects anything but one character", () => {
    expect(() => keyForChar("")).toThrow(RangeError);
    expect(() => keyForChar("ab")).toThrow(RangeError);
  });

  it("returns a copy", () => {
    const first = keyForChar("a");
    first.key = "changed";
    expect(keyForChar("a").key).toBe("a");
  });

  it("defines Enter and Tab", () => {
    expect(ENTER).toStrictEqual({
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
    expect(TAB).toStrictEqual({
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
  });
});
