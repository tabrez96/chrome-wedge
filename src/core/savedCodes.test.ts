import { describe, expect, it } from "vitest";
import {
  cleanName,
  parseShortcut,
  restoreCode,
  savedCodeMessage,
  withCode,
  withoutCode,
} from "./savedCodes";
import type { SavedCode } from "./settings";

const code = (
  id: string,
  shortcut: SavedCode["shortcut"] = null,
): SavedCode => ({
  id,
  name: id,
  value: `v${id}`,
  shortcut,
});

describe("savedCodeMessage", () => {
  it("returns the exact copy for each error", () => {
    expect(savedCodeMessage("empty", null)).toBe("Enter a code to save.");
    expect(savedCodeMessage("too-long", null)).toBe(
      "Codes can be up to 256 characters.",
    );
    expect(savedCodeMessage("line-break", null)).toBe(
      "Codes can't contain line breaks.",
    );
    expect(savedCodeMessage("shortcut-taken", 1)).toBe(
      "Alt+1 is already used by another code.",
    );
    expect(savedCodeMessage("too-many", null)).toBe(
      "You can save up to 9 codes. Delete one to add another.",
    );
  });
});

describe("cleanName", () => {
  it("trims, cuts at 40 code points and keeps empty", () => {
    expect(cleanName("  Milk  ")).toBe("Milk");
    expect(cleanName("😀".repeat(45))).toBe("😀".repeat(40));
    expect(cleanName("   ")).toBe("");
  });
});

describe("withCode / withoutCode", () => {
  it("appends a new id", () => {
    expect(withCode([code("a")], code("b")).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("replaces an existing id in place", () => {
    const next = { ...code("a"), value: "new" };
    expect(withCode([code("a"), code("b")], next)).toEqual([next, code("b")]);
  });
  it("removes only that id", () => {
    expect(withoutCode([code("a"), code("b")], "a")).toEqual([code("b")]);
  });
});

describe("restoreCode", () => {
  it("reinserts at the index", () => {
    const list = restoreCode([code("a"), code("c")], code("b"), 1);
    expect(list.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("clamps a too-large index", () => {
    expect(restoreCode([code("a")], code("b"), 9).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("drops a taken shortcut to null", () => {
    const list = restoreCode([code("a", 2)], code("b", 2), 0);
    expect(list[0]).toEqual({ ...code("b"), shortcut: null });
  });
  it("keeps a free shortcut", () => {
    expect(restoreCode([code("a", 1)], code("b", 2), 0)[0]!.shortcut).toBe(2);
  });
  it("is unchanged when full or the id is present", () => {
    const full = Array.from({ length: 9 }, (_, i) => code(String(i)));
    expect(restoreCode(full, code("x"), 0)).toEqual(full);
    expect(restoreCode([code("a")], code("a"), 0)).toEqual([code("a")]);
  });
});

describe("parseShortcut", () => {
  it("maps 1-9 to numbers and anything else to null", () => {
    expect(parseShortcut("1")).toBe(1);
    expect(parseShortcut("9")).toBe(9);
    for (const v of ["", "0", "10", "x"]) expect(parseShortcut(v)).toBeNull();
  });
});
