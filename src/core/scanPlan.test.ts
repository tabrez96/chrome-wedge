// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildScanPlan, type PlanStep } from "./scanPlan";

const waits = (steps: PlanStep[]) =>
  steps.flatMap((s) => (s.kind === "wait" ? [s.ms] : []));

describe("buildScanPlan", () => {
  it("builds the exact plan for prefix X, value A1, Enter, 10 ms", () => {
    expect(
      buildScanPlan({
        prefix: "X",
        value: "A1",
        suffix: "enter",
        keyDelayMs: 10,
      }),
    ).toStrictEqual([
      {
        kind: "key",
        params: {
          type: "keyDown",
          key: "X",
          code: "KeyX",
          windowsVirtualKeyCode: 88,
          text: "X",
          modifiers: 8,
        },
      },
      {
        kind: "key",
        params: {
          type: "keyUp",
          key: "X",
          code: "KeyX",
          windowsVirtualKeyCode: 88,
          modifiers: 8,
        },
      },
      { kind: "wait", ms: 10 },
      {
        kind: "key",
        params: {
          type: "keyDown",
          key: "A",
          code: "KeyA",
          windowsVirtualKeyCode: 65,
          text: "A",
          modifiers: 8,
        },
      },
      {
        kind: "key",
        params: {
          type: "keyUp",
          key: "A",
          code: "KeyA",
          windowsVirtualKeyCode: 65,
          modifiers: 8,
        },
      },
      { kind: "wait", ms: 10 },
      {
        kind: "key",
        params: {
          type: "keyDown",
          key: "1",
          code: "Digit1",
          windowsVirtualKeyCode: 49,
          text: "1",
        },
      },
      {
        kind: "key",
        params: {
          type: "keyUp",
          key: "1",
          code: "Digit1",
          windowsVirtualKeyCode: 49,
        },
      },
      { kind: "wait", ms: 10 },
      {
        kind: "key",
        params: {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          text: "\r",
        },
      },
      {
        kind: "key",
        params: {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        },
      },
    ]);
  });

  it("ends with Tab for suffix tab", () => {
    const steps = buildScanPlan({
      prefix: "",
      value: "A1",
      suffix: "tab",
      keyDelayMs: 10,
    });
    expect(steps.slice(-2)).toStrictEqual([
      {
        kind: "key",
        params: {
          type: "rawKeyDown",
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
        },
      },
      {
        kind: "key",
        params: {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
        },
      },
    ]);
  });

  it("ends with the last character for suffix none", () => {
    const steps = buildScanPlan({
      prefix: "",
      value: "A1",
      suffix: "none",
      keyDelayMs: 10,
    });
    expect(steps.at(-1)).toStrictEqual({
      kind: "key",
      params: {
        type: "keyUp",
        key: "1",
        code: "Digit1",
        windowsVirtualKeyCode: 49,
      },
    });
    const keys = steps.flatMap((s) => (s.kind === "key" ? [s.params.key] : []));
    expect(keys).not.toContain("Enter");
    expect(keys).not.toContain("Tab");
  });

  it("adds no waits when the delay is 0", () => {
    const steps = buildScanPlan({
      prefix: "",
      value: "A1",
      suffix: "enter",
      keyDelayMs: 0,
    });
    expect(steps.some((s) => s.kind === "wait")).toBe(false);
    expect(steps).toHaveLength(6);
  });

  it("clamps the delay", () => {
    const base = { prefix: "", value: "A1", suffix: "none" } as const;
    const high = waits(buildScanPlan({ ...base, keyDelayMs: 9999 }));
    expect(high).toStrictEqual([500]);
    const nan = waits(buildScanPlan({ ...base, keyDelayMs: NaN }));
    expect(nan).toStrictEqual([10]);
  });

  it("types an emoji as one key pair", () => {
    expect(
      buildScanPlan({
        prefix: "",
        value: "😀",
        suffix: "none",
        keyDelayMs: 10,
      }),
    ).toStrictEqual([
      { kind: "key", params: { type: "keyDown", key: "😀", text: "😀" } },
      { kind: "key", params: { type: "keyUp", key: "😀" } },
    ]);
  });

  it("returns an empty plan for nothing to type", () => {
    expect(
      buildScanPlan({ prefix: "", value: "", suffix: "none", keyDelayMs: 10 }),
    ).toStrictEqual([]);
  });
});
