import type { PopupMessage, ScanResult, SessionReply } from "../core/messages";
import { decodeBarcode } from "../core/decode";
import {
  checkScanValue,
  type BarcodeFormat,
  type Suffix,
} from "../core/settings";
import { readSettings } from "../background/session";
import { imageToPixels, isAcceptedImage, type Pixels } from "./image";
import {
  describeImage,
  describeResult,
  describeSessionError,
  render,
  type ImageCard,
  type PopupView,
} from "./view";

export type PopupApi = {
  tabId(): Promise<number | null>;
  send<T>(msg: PopupMessage): Promise<T>;
  settings(): Promise<{
    suffix: Suffix;
    keyDelayMs: number;
    defaultFormat: BarcodeFormat;
  }>;
  readPixels(file: Blob): Promise<Pixels>;
  openHelp(): void;
  openSettings(): void;
};

const errorResult = (err: unknown): ScanResult => ({
  kind: "error",
  message: err instanceof Error ? err.message : String(err),
});

export async function initPopup(doc: Document, api: PopupApi): Promise<void> {
  const view: PopupView = {
    status: { state: "off", host: null },
    busy: false,
    result: null,
    suffix: "enter",
    keyDelayMs: 10,
    image: null,
  };
  const el = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const code = el<HTMLInputElement>("code");
  const switchEl = el<HTMLButtonElement>("switch");
  const update = (p: Partial<PopupView>) => {
    Object.assign(view, p);
    render(doc, view);
  };
  let tabId: number | null = null;
  let defaultFormat: BarcodeFormat = "code128";
  let latest = 0;
  const drop = el<HTMLElement>("drop");
  const fileInput = el<HTMLInputElement>("file");
  render(doc, view);

  const setImage = (card: ImageCard | null, p: Partial<PopupView> = {}) => {
    if (view.image) URL.revokeObjectURL(view.image.thumbUrl);
    update({ ...p, image: card });
  };

  const readFile = async (file: File) => {
    const token = ++latest;
    const unsupported = () =>
      setImage(null, {
        result: describeImage({ kind: "unsupported", fileName: file.name }),
      });
    if (!isAcceptedImage(file)) return unsupported();
    let pixels: Pixels;
    try {
      pixels = await api.readPixels(file);
    } catch {
      if (token === latest) unsupported();
      return;
    }
    if (token !== latest) return;
    const r = decodeBarcode(
      pixels.data,
      pixels.width,
      pixels.height,
      defaultFormat,
    );
    if (r.kind === "unreadable") {
      setImage(null, {
        result: describeImage({ kind: "unreadable", fileName: file.name }),
      });
      return;
    }
    code.value = r.value;
    setImage(
      {
        thumbUrl: URL.createObjectURL(file),
        format: r.format,
        value: r.value,
        fileName: file.name,
      },
      { result: describeImage({ kind: "decoded" }) },
    );
    code.focus();
  };

  // Turns the session on or off; returns true when the tab ended up switched on.
  const toggle = async (type: "session-on" | "session-off") => {
    if (tabId === null) return;
    switchEl.disabled = true;
    let reply: SessionReply;
    try {
      reply = await api.send<SessionReply>({ type, tabId });
    } catch (err) {
      update({ result: describeResult(errorResult(err)) });
      return;
    }
    if (reply.ok) {
      update({ status: reply.status, result: null });
      if (type === "session-on") code.focus();
    } else {
      update({ result: describeSessionError(reply) });
    }
  };

  el("scan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (view.busy || tabId === null || view.status.state === "off") return;
    const value = code.value;
    const error = checkScanValue(value);
    if (error) {
      update({ result: describeResult({ kind: "invalid", error }) });
      return;
    }
    update({ busy: true });
    const gen = latest;
    let r: ScanResult;
    try {
      r = await api.send<ScanResult>({ type: "scan", tabId, value });
    } catch (err) {
      r = errorResult(err);
    }
    const status: Partial<PopupView> = {
      busy: false,
      status:
        r.kind === "site-off"
          ? { ...view.status, state: "off" }
          : r.kind === "detached"
            ? { ...view.status, state: "detached" }
            : view.status,
    };
    const result = { ...status, result: describeResult(r) };
    // A newer image or edit made this result stale; keep the current
    // selection, but still show that typing stopped.
    if (gen === latest) setImage(null, result);
    else update(r.kind === "detached" ? result : status);
    code.focus();
  });
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    fileInput.click();
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.dataset.over = "true";
  });
  drop.addEventListener("dragleave", () => delete drop.dataset.over);
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    delete drop.dataset.over;
    const f = e.dataTransfer?.files[0];
    if (f) void readFile(f);
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (f) void readFile(f);
    fileInput.value = "";
  });
  code.addEventListener("input", () => {
    latest++;
    if (view.image && code.value !== view.image.value)
      setImage(null, { result: null });
  });
  switchEl.addEventListener("click", () =>
    toggle(view.status.state === "off" ? "session-on" : "session-off"),
  );
  el("reconnect").addEventListener("click", () => toggle("session-on"));
  el("help").addEventListener("click", () => api.openHelp());
  el("settings").addEventListener("click", () => api.openSettings());

  tabId = await api.tabId();
  const s = await api.settings();
  defaultFormat = s.defaultFormat;
  update({ suffix: s.suffix, keyDelayMs: s.keyDelayMs });
  if (tabId !== null) {
    try {
      const reply = await api.send<SessionReply>({
        type: "session-get",
        tabId,
      });
      if (reply.ok) update({ status: reply.status });
    } catch (err) {
      update({ result: describeResult(errorResult(err)) });
    }
  }
  // The autofocus attribute is unreliable in extension popups.
  code.focus();
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  void initPopup(document, {
    tabId: async () =>
      (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ??
      null,
    send: (msg) => chrome.runtime.sendMessage(msg),
    settings: readSettings,
    readPixels: imageToPixels,
    openHelp: () =>
      void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") }),
    openSettings: () => void chrome.runtime.openOptionsPage(),
  });
}
