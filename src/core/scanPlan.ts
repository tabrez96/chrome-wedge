import { clampKeyDelay, type Suffix } from "./settings";
import { ENTER, TAB, keyForChar, type KeyParams } from "./keymap";

export type KeyEventType = "keyDown" | "rawKeyDown" | "keyUp";
export type KeyEvent = KeyParams & { type: KeyEventType };
export type PlanStep =
  { kind: "key"; params: KeyEvent } | { kind: "wait"; ms: number };

export type ScanInput = {
  prefix: string;
  value: string;
  suffix: Suffix;
  keyDelayMs: number;
};

export function buildScanPlan(input: ScanInput): PlanStep[] {
  const keys: KeyParams[] = [...(input.prefix + input.value)].map(keyForChar);
  if (input.suffix === "enter") keys.push(ENTER);
  else if (input.suffix === "tab") keys.push(TAB);

  const delay = clampKeyDelay(input.keyDelayMs);
  const steps: PlanStep[] = [];
  keys.forEach((k, i) => {
    if (i > 0 && delay > 0) steps.push({ kind: "wait", ms: delay });
    steps.push({
      kind: "key",
      params: { type: k.text ? "keyDown" : "rawKeyDown", ...k },
    });
    const { text: _text, ...rest } = k;
    steps.push({ kind: "key", params: { type: "keyUp", ...rest } });
  });
  return steps;
}
