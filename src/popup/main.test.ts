// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PopupMessage } from "../core/messages";
import type { SavedCode } from "../core/settings";
import { PNG } from "pngjs";
import { initPopup, type PopupApi } from "./main";

const html = readFileSync("popup.html", "utf8");
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:thumb");
  URL.revokeObjectURL = vi.fn();
  document.body.innerHTML = new DOMParser().parseFromString(
    html,
    "text/html",
  ).body.innerHTML;
});

const q = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const sentReply = {
  kind: "sent",
  value: "4006381333931",
  keys: 13,
  suffix: "enter",
  label: "Item code",
};

const pngPixels = (name: string) => {
  const { data, width, height } = PNG.sync.read(
    readFileSync(`test/fixtures/barcodes/${name}`),
  );
  return { data: new Uint8ClampedArray(data), width, height };
};
let current = "";
const readFixture: PopupApi["readPixels"] = async () => pngPixels(current);
const settings =
  (defaultFormat = "code128", savedCodes: SavedCode[] = []) =>
  async () => ({
    suffix: "enter" as const,
    keyDelayMs: 10,
    defaultFormat,
    savedCodes,
  });
const codes: SavedCode[] = [
  { id: "a", name: "Coffee beans 1kg", value: "5012345678900", shortcut: 1 },
  { id: "b", name: "Pallet label", value: "PLT-004417-A", shortcut: null },
];
const fileOf = (name: string, type = "image/png") =>
  new File(["x"], name, { type });
const dropFile = (file: File) => {
  current = file.name;
  const e = new Event("drop", { cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: { files: [file] } });
  q("#drop").dispatchEvent(e);
};

async function open(
  state: "off" | "attached" | "detached" = "attached",
  scanReply: unknown = sentReply,
  opts: {
    defaultFormat?: string;
    readPixels?: PopupApi["readPixels"];
    savedCodes?: SavedCode[];
  } = {},
) {
  const send = vi.fn(async (msg: PopupMessage) => {
    if (msg.type === "scan") return scanReply;
    const next = msg.type === "session-off" ? "off" : "attached";
    return {
      ok: true,
      status: {
        state: msg.type === "session-get" ? state : next,
        host: "pos.example.test",
      },
    };
  });
  const api = {
    tabId: async () => 7,
    send,
    settings: settings(opts.defaultFormat, opts.savedCodes),
    readPixels: opts.readPixels ?? readFixture,
    openHelp: vi.fn(),
    openSettings: vi.fn(),
    openSavedCodes: vi.fn(),
  } as unknown as PopupApi;
  await initPopup(document, api);
  return { send, api };
}
const types = (send: { mock: { calls: unknown[][] } }) =>
  send.mock.calls.map((c) => (c[0] as PopupMessage).type);

describe("initPopup", () => {
  it("reads the tab status and focuses the input", async () => {
    await open();
    expect(q("#site-title").textContent).toBe("On for pos.example.test");
    expect(document.activeElement).toBe(q("#code"));
  });

  it("sends the scan on form submit and shows the sent line", async () => {
    const { send } = await open();
    q<HTMLInputElement>("#code").value = "4006381333931";
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() =>
      expect(q("#result").getAttribute("role")).toBe("status"),
    );
    expect(send).toHaveBeenCalledWith({
      type: "scan",
      tabId: 7,
      value: "4006381333931",
    });
    expect(q(".result-summary").textContent).toBe("Scanned 4006381333931");
  });

  it("sends the same scan when Scan is clicked", async () => {
    const { send } = await open();
    q<HTMLInputElement>("#code").value = "4006381333931";
    q("#scan").click();
    await vi.waitFor(() => expect(types(send)).toContain("scan"));
    expect(send).toHaveBeenCalledWith({
      type: "scan",
      tabId: 7,
      value: "4006381333931",
    });
  });

  it("does not send an empty code", async () => {
    const { send } = await open();
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() => expect(q("#result").hidden).toBe(false));
    expect(q(".result-summary").textContent).toBe("Type a code first");
    expect(types(send)).not.toContain("scan");
  });

  it("reports a rejected send as an error and clears busy", async () => {
    const { send } = await open();
    send.mockRejectedValueOnce(new Error("worker gone"));
    q<HTMLInputElement>("#code").value = "123";
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() =>
      expect(q(".result-detail").textContent).toBe("worker gone"),
    );
    expect(q<HTMLButtonElement>("#scan").disabled).toBe(false);
  });

  it.each([
    ["off", "session-on"],
    ["attached", "session-off"],
  ] as const)("switch click while %s sends %s", async (state, type) => {
    const { send } = await open(state);
    q("#switch").click();
    await vi.waitFor(() => expect(types(send)).toContain(type));
  });

  it("reconnects through session-on", async () => {
    const { send } = await open("detached");
    q("#reconnect").click();
    await vi.waitFor(() => expect(types(send)).toContain("session-on"));
  });

  it("opens help and settings", async () => {
    const { api } = await open();
    q("#help").click();
    q("#settings").click();
    expect(api.openHelp).toHaveBeenCalled();
    expect(api.openSettings).toHaveBeenCalled();
  });

  it("disables the input when the scan reply is site-off", async () => {
    await open("attached", { kind: "site-off" });
    q<HTMLInputElement>("#code").value = "123";
    q<HTMLFormElement>("#scan-form").requestSubmit();
    await vi.waitFor(() =>
      expect(q<HTMLInputElement>("#code").disabled).toBe(true),
    );
  });

  it("re-enables the switch and shows the error when session-on rejects", async () => {
    const { send } = await open("off");
    send.mockRejectedValueOnce(new Error("worker restarting"));
    q("#switch").click();
    await vi.waitFor(() =>
      expect(q("#result").textContent).toContain("worker restarting"),
    );
    expect(q<HTMLButtonElement>("#switch").disabled).toBe(false);
    expect(q("#result").getAttribute("role")).toBe("alert");
  });

  it("shows the error when the first session-get rejects", async () => {
    const send = vi.fn(async () => {
      throw new Error("no worker");
    });
    await initPopup(document, {
      tabId: async () => 7,
      send,
      settings: settings(),
      readPixels: readFixture,
      openHelp: vi.fn(),
      openSettings: vi.fn(),
      openSavedCodes: vi.fn(),
    } as unknown as PopupApi);
    expect(q("#result").textContent).toContain("no worker");
  });
});

describe("saved codes", () => {
  const rowScan = (id: string) =>
    q<HTMLButtonElement>(`.saved-scan[data-id="${id}"]`);

  it("a saved code's Scan sends its value and shows the sent line", async () => {
    const { send } = await open("attached", sentReply, { savedCodes: codes });
    q<HTMLInputElement>("#code").value = "typed";
    rowScan("b").click();
    await vi.waitFor(() =>
      expect(q(".result-summary").textContent).toBe("Scanned 4006381333931"),
    );
    expect(send).toHaveBeenCalledWith({
      type: "scan",
      tabId: 7,
      value: "PLT-004417-A",
    });
    expect(q<HTMLInputElement>("#code").value).toBe("typed");
  });

  it("a saved code scan keeps focus on its button", async () => {
    await open("attached", sentReply, { savedCodes: codes });
    rowScan("a").click();
    await vi.waitFor(() => expect(q("#result").hidden).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(rowScan("a")));
  });

  it("saved Scan buttons are disabled when the site is off", async () => {
    await open("off", sentReply, { savedCodes: codes });
    const btns = document.querySelectorAll<HTMLButtonElement>(".saved-scan");
    expect(btns).toHaveLength(2);
    expect([...btns].every((b) => b.disabled)).toBe(true);
  });

  it("Edit opens the saved codes settings", async () => {
    const { api } = await open();
    q("#saved-edit").click();
    expect(api.openSavedCodes).toHaveBeenCalledTimes(1);
  });

  it("shows the empty line with no saved codes", async () => {
    await open();
    expect(q("#saved-empty").hidden).toBe(false);
    expect(document.querySelector(".saved-row")).toBeNull();
  });

  it("shows at most nine saved codes", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      name: `Code ${i}`,
      value: `${i}`,
      shortcut: null,
    }));
    await open("attached", sentReply, { savedCodes: many });
    expect(document.querySelectorAll(".saved-row")).toHaveLength(9);
  });

  it("focus order follows the spec", async () => {
    await open("attached", sentReply, { savedCodes: codes });
    const order = [
      ...document.querySelectorAll<HTMLElement>(
        'button:not([hidden]), input:not([type=file]), [tabindex="0"]',
      ),
    ]
      .filter((e) => !e.closest("[hidden]"))
      .map((e) => e.id || `${e.className}:${e.dataset.id}`);
    expect(order).toEqual([
      "switch",
      "code",
      "scan",
      "drop",
      "secondary saved-scan:a",
      "secondary saved-scan:b",
      "saved-edit",
      "help",
      "settings",
    ]);
  });
});

describe("image drop", () => {
  const fixture = (name: string, type = "image/png") => {
    current = name;
    return fileOf(name, type);
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const drop = async (file: File) => {
    dropFile(file);
    await flush();
  };

  it("dropping a fixture barcode fills the input and shows the card, and sends nothing until Scan", async () => {
    const { send } = await open();
    await drop(fixture("code128-clean.png"));
    expect(q<HTMLInputElement>("#code").value).toBe("WEDGE-12345");
    expect(q("#drop-card").hidden).toBe(false);
    expect(q("#drop-empty").hidden).toBe(true);
    expect(q("#drop-format").textContent).toBe("Code 128 found");
    expect(q("#drop-file").textContent).toBe("code128-clean.png");
    expect(q(".result-summary").textContent).toBe("Ready to scan");
    expect(q("#result").getAttribute("role")).toBe("status");
    expect(types(send)).not.toContain("scan");
    q("#scan").click();
    await vi.waitFor(() => expect(types(send)).toContain("scan"));
    expect(send).toHaveBeenCalledWith({
      type: "scan",
      tabId: 7,
      value: "WEDGE-12345",
    });
  });

  it("a non-barcode image shows unreadable", async () => {
    await open();
    await drop(fixture("not-barcode-noise.png"));
    expect(q("#result").getAttribute("role")).toBe("alert");
    expect(q(".result-summary").textContent).toBe(
      "No barcode found in not-barcode-noise.png",
    );
    expect(q("#drop-card").hidden).toBe(true);
    expect(q<HTMLInputElement>("#code").value).toBe("");
  });

  it("unsupported or unreadable files show can't open", async () => {
    const readPixels = vi.fn(async () => {
      throw new Error("bad image");
    });
    await open("attached", sentReply, { readPixels });
    await drop(fixture("a.gif", "image/gif"));
    expect(q(".result-summary").textContent).toBe("Can't open a.gif");
    expect(readPixels).not.toHaveBeenCalled();
    await drop(fixture("broken.png"));
    expect(q(".result-summary").textContent).toBe("Can't open broken.png");
  });

  it("click, Enter and Space on the drop zone open the picker", async () => {
    await open();
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    q("#drop").click();
    for (const key of ["Enter", " "])
      q("#drop").dispatchEvent(new KeyboardEvent("keydown", { key }));
    expect(click).toHaveBeenCalledTimes(3);
    click.mockRestore();
  });

  it("choosing a file through the picker decodes it", async () => {
    await open();
    Object.defineProperty(q("#file"), "files", {
      value: [fixture("code128-clean.png")],
    });
    q("#file").dispatchEvent(new Event("change"));
    await flush();
    expect(q<HTMLInputElement>("#code").value).toBe("WEDGE-12345");
  });

  it("editing the input clears the card", async () => {
    await open();
    await drop(fixture("code128-clean.png"));
    q<HTMLInputElement>("#code").value = "other";
    q("#code").dispatchEvent(new Event("input"));
    expect(q("#drop-card").hidden).toBe(true);
    expect(q("#result").hidden).toBe(true);
  });

  it("typing while an image is still reading keeps the typed code", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const readPixels = () => gate.then(() => pngPixels("code128-clean.png"));
    await open("attached", sentReply, { readPixels });
    dropFile(fixture("code128-clean.png"));
    q<HTMLInputElement>("#code").value = "typed";
    q("#code").dispatchEvent(new Event("input"));
    finish();
    await flush();
    expect(q<HTMLInputElement>("#code").value).toBe("typed");
  });

  it.each([
    [sentReply, "Ready to scan"],
    [{ kind: "detached" }, "Typing stopped: the debugging bar was closed"],
  ])(
    "an image chosen while a scan is pending keeps its card (%#)",
    async (reply, summary) => {
      const { send } = await open();
      let finish!: (r: unknown) => void;
      send.mockImplementationOnce(() => new Promise((r) => (finish = r)));
      q<HTMLInputElement>("#code").value = "123";
      q("#scan").click();
      await drop(fixture("code128-clean.png"));
      finish(reply);
      await flush();
      expect(q("#drop-card").hidden).toBe(false);
      expect(q(".result-summary").textContent).toBe(summary);
    },
  );

  it("passes the default format to the decoder", async () => {
    await open("attached", sentReply, { defaultFormat: "ean13" });
    await drop(fixture("upca-clean.png"));
    expect(q("#drop-format").textContent).toBe("EAN-13 found");
  });
});
