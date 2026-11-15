// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkSavedCode,
  checkScanValue,
  clampKeyDelay,
  clampPrefix,
  defaultSettings,
  migrate,
  type SavedCode,
} from "./settings";

const code = (
  id: string,
  shortcut: SavedCode["shortcut"] = null,
): SavedCode => ({
  id,
  name: id,
  value: "123",
  shortcut,
});

describe("defaultSettings", () => {
  it("matches the design data model", () => {
    expect(defaultSettings()).toEqual({
      version: 1,
      prefix: "",
      suffix: "enter",
      keyDelayMs: 10,
      defaultFormat: "code128",
      allowedSites: [],
      savedCodes: [],
      firstRunDone: false,
    });
  });

  it("returns fresh arrays each call", () => {
    expect(defaultSettings().allowedSites).not.toBe(
      defaultSettings().allowedSites,
    );
    expect(defaultSettings().savedCodes).not.toBe(defaultSettings().savedCodes);
  });
});

describe("checkScanValue", () => {
  it.each([
    ["", "empty"],
    ["a", null],
    ["a".repeat(256), null],
    ["a".repeat(257), "too-long"],
    ["a\nb", "line-break"],
    ["a\rb", "line-break"],
    ["a b", "line-break"],
    ["a b", "line-break"],
    [" 12 ", null],
    ["😀".repeat(256), null],
    ["😀".repeat(257), "too-long"],
  ])("%j -> %s", (value, expected) => {
    expect(checkScanValue(value)).toBe(expected);
  });
});

describe("clampKeyDelay", () => {
  it.each([
    [10, 10],
    [0, 0],
    [500, 500],
    [501, 500],
    [-1, 0],
    [12.6, 13],
    [NaN, 10],
    [Infinity, 10],
    ["20", 10],
    [undefined, 10],
  ])("%j -> %d", (ms, expected) => {
    expect(clampKeyDelay(ms)).toBe(expected);
  });
});

describe("clampPrefix", () => {
  it.each([
    ["]C1", "]C1"],
    ["a\nb", "ab"],
    ["a b c\r", "abc"],
    ["x".repeat(40), "x".repeat(32)],
    [5, ""],
  ])("%j -> %j", (prefix, expected) => {
    expect(clampPrefix(prefix)).toBe(expected);
  });
});

describe("checkSavedCode", () => {
  const nine = Array.from({ length: 9 }, (_, i) => code(`c${i}`));

  it("accepts a valid new code", () => {
    expect(checkSavedCode(code("new", 1), [code("a", 2)])).toBeNull();
  });

  it("returns the scan value error", () => {
    expect(checkSavedCode({ ...code("a"), value: "" }, [])).toBe("empty");
  });

  it("rejects a tenth code but allows editing one of nine", () => {
    expect(checkSavedCode(code("new"), nine)).toBe("too-many");
    expect(checkSavedCode(code("c3"), nine)).toBeNull();
  });

  it("rejects a shortcut used by another code", () => {
    expect(checkSavedCode(code("b", 1), [code("a", 1)])).toBe("shortcut-taken");
  });

  it("lets a code keep its own shortcut", () => {
    expect(checkSavedCode(code("a", 1), [code("a", 1)])).toBeNull();
  });

  it("never conflicts on a null shortcut", () => {
    expect(checkSavedCode(code("b"), [code("a")])).toBeNull();
  });
});

describe("migrate", () => {
  const table = {
    1: (o: Record<string, unknown>) => ({ ...o, a: 1 }),
    2: (o: Record<string, unknown>) => ({ ...o, b: 2 }),
  };

  it("passes the current version through", () => {
    expect(migrate({ version: 1, x: 1 })).toEqual({ version: 1, x: 1 });
  });

  it("reads a missing or garbage version as current", () => {
    expect(migrate({ x: 1 })).toEqual({ version: 1, x: 1 });
    expect(migrate({ version: "x", x: 1 })).toEqual({ version: 1, x: 1 });
  });

  it("reads a newer version as current", () => {
    expect(migrate({ version: 99 }).version).toBe(1);
  });

  it("runs each migration in order", () => {
    expect(migrate({ version: 1 }, 3, table)).toEqual({
      version: 3,
      a: 1,
      b: 2,
    });
  });

  it("falls back to defaults for an unknown old version", () => {
    expect(migrate({ version: 0, x: 1 }, 3, table)).toEqual({ version: 3 });
  });
});
