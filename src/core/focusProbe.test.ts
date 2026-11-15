import { afterEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  FALLBACK_LABEL,
  focusProbe,
  type FocusProbeResult,
} from "./focusProbe";

function mount(html: string): void {
  document.body.innerHTML = html;
}

function focus(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector)!;
  el.focus();
  expect(document.activeElement).toBe(el);
  return el;
}

function stubActive(el: Element): void {
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    get: () => el,
  });
}

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).activeElement;
  (document.activeElement as HTMLElement | null)?.blur();
  document.body.innerHTML = "";
});

const none = { kind: "none" };

describe("editable fields", () => {
  it("text input with <label for>", () => {
    mount(`<label for="a">Barcode</label><input id="a">`);
    focus("#a");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Barcode" });
  });

  it("textarea", () => {
    mount(`<textarea></textarea>`);
    focus("textarea");
    expect(focusProbe().kind).toBe("editable");
  });

  it("contenteditable div", () => {
    mount(`<div contenteditable="true" tabindex="0"></div>`);
    focus("div");
    expect(focusProbe().kind).toBe("editable");
  });

  it("contenteditable=false", () => {
    mount(`<div contenteditable="false" tabindex="0"></div>`);
    focus("div");
    expect(focusProbe()).toStrictEqual(none);
  });

  it("contenteditable=inherit under a non-editable parent", () => {
    mount(`<div><div contenteditable="inherit" tabindex="0"></div></div>`);
    focus("div div");
    expect(focusProbe()).toStrictEqual(none);
  });

  it.each(["", "plaintext-only", "TRUE"])(
    "contenteditable=%j is editable",
    (value) => {
      mount(`<div contenteditable="${value}" tabindex="0"></div>`);
      focus("div");
      expect(focusProbe().kind).toBe("editable");
    },
  );

  it("body with contenteditable", () => {
    document.body.setAttribute("contenteditable", "true");
    document.body.setAttribute("tabindex", "0");
    document.body.focus();
    expect(focusProbe().kind).toBe("editable");
    document.body.removeAttribute("contenteditable");
    document.body.removeAttribute("tabindex");
  });

  it.each(["search", "email", "url", "tel", "number", "foo"])(
    "input type %s",
    (type) => {
      mount(`<input type="${type}">`);
      focus("input");
      expect(focusProbe().kind).toBe("editable");
    },
  );
});

describe("refused or unusable", () => {
  it("password", () => {
    mount(`<input type="password">`);
    focus("input");
    expect(focusProbe()).toStrictEqual({ kind: "password" });
  });

  it("password + readonly and disabled", () => {
    mount(`<input type="password" readonly>`);
    const el = focus("input") as HTMLInputElement;
    el.disabled = true;
    stubActive(el);
    expect(focusProbe()).toStrictEqual({ kind: "password" });
  });

  it("disabled input", () => {
    mount(`<input>`);
    const el = focus("input") as HTMLInputElement;
    el.disabled = true;
    stubActive(el);
    expect(focusProbe()).toStrictEqual(none);
  });

  it("disabled textarea", () => {
    mount(`<textarea></textarea>`);
    const el = focus("textarea") as HTMLTextAreaElement;
    el.disabled = true;
    stubActive(el);
    expect(focusProbe()).toStrictEqual(none);
  });

  it("input inside disabled fieldset", () => {
    mount(`<fieldset><input></fieldset>`);
    const el = focus("input");
    document.querySelector("fieldset")!.disabled = true;
    stubActive(el);
    expect(focusProbe()).toStrictEqual(none);
  });

  it("readonly input and textarea", () => {
    mount(`<input readonly>`);
    focus("input");
    expect(focusProbe()).toStrictEqual(none);
    mount(`<textarea readonly></textarea>`);
    focus("textarea");
    expect(focusProbe()).toStrictEqual(none);
  });

  it("checkbox and button", () => {
    mount(`<input type="checkbox">`);
    focus("input");
    expect(focusProbe()).toStrictEqual(none);
    mount(`<button>Go</button>`);
    focus("button");
    expect(focusProbe()).toStrictEqual(none);
  });

  it("nothing focused", () => {
    expect(document.activeElement).toBe(document.body);
    expect(focusProbe()).toStrictEqual(none);
  });

  it("no active element", () => {
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: () => null,
    });
    expect(focusProbe()).toStrictEqual(none);
  });
});

describe("label order", () => {
  const all = `aria-label="Aria" placeholder="Place"`;

  it("label beats aria-label beats placeholder", () => {
    mount(`<label for="a">Lab</label><input id="a" ${all}>`);
    focus("#a");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Lab" });
  });

  it("aria-label without label", () => {
    mount(`<input ${all}>`);
    focus("input");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Aria" });
  });

  it("placeholder without label and aria-label", () => {
    mount(`<input placeholder="Place">`);
    focus("input");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Place" });
  });

  it("fallback", () => {
    mount(`<input>`);
    focus("input");
    expect(focusProbe()).toStrictEqual({
      kind: "editable",
      label: FALLBACK_LABEL,
    });
  });

  it("whitespace-only label falls through", () => {
    mount(`<label for="a">  \n </label><input id="a" ${all}>`);
    focus("#a");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Aria" });
  });

  it("wrapping label excludes the field's own text", () => {
    mount(`<label>Notes <textarea>hello</textarea></label>`);
    focus("textarea");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Notes" });
  });

  it("contenteditable uses aria-label", () => {
    mount(`<div contenteditable tabindex="0" aria-label="Editor"></div>`);
    focus("div");
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Editor" });
  });
});

describe("shadow roots and frames", () => {
  it("open shadow root", () => {
    mount(`<div id="host"></div>`);
    const host = document.getElementById("host")!;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<input aria-label="Inner">`;
    root.querySelector("input")!.focus();
    stubActive(host);
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Inner" });
  });

  it("closed shadow root classifies the host", () => {
    mount(`<div id="host" tabindex="0"></div>`);
    const host = document.getElementById("host")!;
    host.attachShadow({ mode: "closed" });
    host.focus();
    expect(focusProbe()).toStrictEqual(none);
  });

  it("shadow root without focused element classifies the host", () => {
    mount(`<div id="host" tabindex="0"></div>`);
    const host = document.getElementById("host")!;
    host.attachShadow({ mode: "open" });
    host.focus();
    expect(focusProbe()).toStrictEqual(none);
  });

  it("same-origin iframe", () => {
    mount(`<iframe></iframe>`);
    const frame = document.querySelector("iframe")!;
    frame.contentDocument!.body.innerHTML = `<input placeholder="Framed">`;
    frame.contentDocument!.querySelector("input")!.focus();
    stubActive(frame);
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Framed" });
  });

  it("shadow root inside same-origin iframe", () => {
    mount(`<iframe></iframe>`);
    const frame = document.querySelector("iframe")!;
    const doc = frame.contentDocument!;
    doc.body.innerHTML = `<div id="host"></div>`;
    const host = doc.getElementById("host")!;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<input aria-label="Deep">`;
    root.querySelector("input")!.focus();
    Object.defineProperty(doc, "activeElement", { get: () => host });
    stubActive(frame);
    expect(focusProbe()).toStrictEqual({ kind: "editable", label: "Deep" });
  });

  it("cross-origin iframe (contentDocument null)", () => {
    mount(`<iframe></iframe>`);
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentDocument", { get: () => null });
    stubActive(frame);
    expect(focusProbe()).toStrictEqual(none);
  });

  it("cross-origin iframe (contentDocument throws)", () => {
    mount(`<iframe></iframe>`);
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentDocument", {
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    stubActive(frame);
    expect(focusProbe()).toStrictEqual(none);
  });
});

describe("serialised", () => {
  // The result is built in another realm; JSON drops its foreign prototypes.
  const run = (dom: JSDOM) =>
    JSON.parse(
      dom.window.eval(`JSON.stringify((${focusProbe.toString()})())`) as string,
    ) as FocusProbeResult;
  const make = (html: string) =>
    new JSDOM(html, { runScripts: "outside-only" });

  it("editable with label", () => {
    const dom = make(`<label for="a">Order</label><input id="a">`);
    dom.window.document.getElementById("a")!.focus();
    expect(run(dom)).toStrictEqual({ kind: "editable", label: "Order" });
  });

  it("password", () => {
    const dom = make(`<input id="a" type="password">`);
    dom.window.document.getElementById("a")!.focus();
    expect(run(dom)).toStrictEqual({ kind: "password" });
  });

  it("nothing focused", () => {
    expect(run(make(`<input>`))).toStrictEqual(none);
  });
});
