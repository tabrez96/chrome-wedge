import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BINDING,
  INSTALL_SCRIPT,
  OFF_EVENT,
  shortcutListener,
  shortcutOf,
  type KeyLike,
} from "./shortcutListener";

const key = (code: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  code,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  isTrusted: true,
  ...extra,
});

describe("shortcutOf", () => {
  it("returns 1..9 for Alt+Digit, with and without Shift", () => {
    for (let n = 1; n <= 9; n++) {
      expect(shortcutOf(key(`Digit${n}`))).toBe(n);
      expect(
        shortcutOf({ ...key(`Digit${n}`), shiftKey: true } as KeyLike),
      ).toBe(n);
    }
  });

  it("returns null for anything else", () => {
    expect(shortcutOf(key("Digit0"))).toBeNull();
    expect(shortcutOf(key("Numpad1"))).toBeNull();
    expect(shortcutOf(key("KeyA"))).toBeNull();
    expect(shortcutOf(key("Digit1", { altKey: false }))).toBeNull();
    expect(shortcutOf(key("Digit1", { ctrlKey: true }))).toBeNull();
    expect(shortcutOf(key("Digit1", { metaKey: true }))).toBeNull();
    expect(shortcutOf(key("Digit1", { isTrusted: false }))).toBeNull();
  });
});

const w = window as unknown as Record<string, unknown>;
const stub = (e: KeyboardEvent) => (e.altKey && e.code === "Digit3" ? 3 : null);
const press = (code: string, altKey = true) => {
  const e = new KeyboardEvent("keydown", {
    code,
    altKey,
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(e);
  return e;
};

afterEach(() => {
  window.dispatchEvent(new Event(OFF_EVENT));
  delete w[BINDING];
});

describe("shortcutListener", () => {
  it("calls the binding, prevents default and hides the event from the page", () => {
    const send = vi.fn();
    w[BINDING] = send;
    const seen = vi.fn();
    document.addEventListener("keydown", seen, true);
    shortcutListener(stub, BINDING, OFF_EVENT);
    const e = press("Digit3");
    expect(send).toHaveBeenCalledWith("3");
    expect(e.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    const other = press("KeyA");
    expect(other.defaultPrevented).toBe(false);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", seen, true);
  });

  it("deletes the binding and installs only once", () => {
    const send = vi.fn();
    w[BINDING] = send;
    shortcutListener(stub, BINDING, OFF_EVENT);
    expect(BINDING in w).toBe(false);
    shortcutListener(stub, BINDING, OFF_EVENT);
    press("Digit3");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("installs nothing without a binding", () => {
    const spy = vi.spyOn(window, "addEventListener");
    shortcutListener(stub, BINDING, OFF_EVENT);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stops after the off event", () => {
    const send = vi.fn();
    w[BINDING] = send;
    shortcutListener(stub, BINDING, OFF_EVENT);
    window.dispatchEvent(new Event(OFF_EVENT));
    const e = press("Digit3");
    expect(send).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("does nothing outside the top frame", () => {
    const send = vi.fn();
    w[BINDING] = send;
    const top = vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    shortcutListener(stub, BINDING, OFF_EVENT);
    top.mockRestore();
    expect(BINDING in w).toBe(true);
  });

  it("INSTALL_SCRIPT is self-contained: installs, ignores untrusted keys, removes the binding", () => {
    const send = vi.fn();
    w[BINDING] = send;
    new Function(INSTALL_SCRIPT)();
    expect(BINDING in w).toBe(false);
    const e = press("Digit1");
    expect(send).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});
