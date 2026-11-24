export type FocusProbeResult =
  | { kind: "editable"; label: string }
  | { kind: "password" }
  | { kind: "none" }
  | { kind: "unreachable" };

export const FALLBACK_LABEL = "the focused field";

// Runs inside the page via Function.prototype.toString: it must not use
// imports, module-level values or anything outside its own body.
export function focusProbe(): FocusProbeResult {
  const clean = (s: string | null): string =>
    (s ?? "").replace(/\s+/g, " ").trim();

  let el: Element | null = document.activeElement;
  while (el) {
    if (el.localName === "iframe" || el.localName === "frame") {
      let inner: Document | null = null;
      try {
        inner = (el as HTMLIFrameElement).contentDocument;
      } catch {
        inner = null;
      }
      if (!inner) return { kind: "unreachable" };
      el = inner.activeElement;
      continue;
    }
    const sr = (el as HTMLElement).shadowRoot;
    if (sr && sr.activeElement) {
      el = sr.activeElement;
      continue;
    }
    break;
  }
  if (!el) return { kind: "none" };

  const attr = el.getAttribute("contenteditable");
  const native = (el as HTMLElement).isContentEditable;
  // jsdom has no isContentEditable: fall back to the attribute values that enable editing.
  const contentEditable =
    typeof native === "boolean"
      ? native
      : attr !== null &&
        ["", "true", "plaintext-only"].indexOf(attr.toLowerCase()) >= 0;

  const name = el.localName;
  let isField = false;
  if (name === "input") {
    const type = (el as HTMLInputElement).type;
    if (type === "password") return { kind: "password" };
    if (["text", "search", "email", "url", "tel", "number"].indexOf(type) < 0) {
      return { kind: "none" };
    }
    isField = true;
  } else if (name === "textarea") {
    isField = true;
  } else if (!contentEditable) {
    return { kind: "none" };
  }

  if (isField) {
    const f = el as HTMLInputElement;
    if (f.disabled || f.readOnly || el.matches(":disabled")) {
      return { kind: "none" };
    }
    const labels = f.labels;
    if (labels) {
      for (let i = 0; i < labels.length; i++) {
        const clone = labels[i]!.cloneNode(true) as Element;
        const inner = clone.querySelectorAll("input, textarea, select, button");
        for (let j = 0; j < inner.length; j++) inner[j]!.remove();
        const text = clean(clone.textContent);
        if (text) return { kind: "editable", label: text };
      }
    }
  }

  const label =
    clean(el.getAttribute("aria-label")) ||
    clean(el.getAttribute("placeholder")) ||
    "the focused field";
  return { kind: "editable", label };
}

// Runs inside the page like focusProbe. Blurs the focused element (through
// same-origin iframes and open shadow roots) so keys land on document.body.
export function releaseFocus(): void {
  const chain: HTMLElement[] = [];
  let el: Element | null = document.activeElement;
  for (let i = 0; el && i < 32; i++) {
    if (el !== document.body) chain.push(el as HTMLElement);
    let next: Element | null = null;
    if (el.localName === "iframe" || el.localName === "frame") {
      try {
        next = (el as HTMLIFrameElement).contentDocument?.activeElement ?? null;
      } catch {
        next = null;
      }
    } else {
      next = (el as HTMLElement).shadowRoot?.activeElement ?? null;
    }
    if (next && next.localName === "body") next = null;
    el = next;
  }
  for (let i = chain.length - 1; i >= 0; i--) chain[i]!.blur();
}
