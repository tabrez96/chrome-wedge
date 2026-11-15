import { describe, expect, it } from "vitest";
import { isPopupMessage } from "./messages";

describe("isPopupMessage", () => {
  it("accepts each session message and a scan with a string value", () => {
    for (const type of ["session-get", "session-on", "session-off"]) {
      expect(isPopupMessage({ type, tabId: 3 })).toBe(true);
    }
    expect(isPopupMessage({ type: "scan", tabId: 0, value: "123" })).toBe(true);
  });

  it("rejects null, non-objects, unknown types, bad tabId, scan without value", () => {
    expect(isPopupMessage(null)).toBe(false);
    expect(isPopupMessage("session-on")).toBe(false);
    expect(isPopupMessage({ type: "nope", tabId: 1 })).toBe(false);
    expect(isPopupMessage({ type: 5, tabId: 1 })).toBe(false);
    expect(isPopupMessage({ type: "session-on" })).toBe(false);
    expect(isPopupMessage({ type: "session-on", tabId: -1 })).toBe(false);
    expect(isPopupMessage({ type: "session-on", tabId: 1.5 })).toBe(false);
    expect(isPopupMessage({ type: "scan", tabId: 1 })).toBe(false);
    expect(isPopupMessage({ type: "scan", tabId: 1, value: 4 })).toBe(false);
  });
});
