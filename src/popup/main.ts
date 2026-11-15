import type { PopupMessage, ScanResult, SessionReply } from "../core/messages";
import { checkScanValue, type Suffix } from "../core/settings";
import { readSettings } from "../background/session";
import {
  describeResult,
  describeSessionError,
  render,
  type PopupView,
} from "./view";

export type PopupApi = {
  tabId(): Promise<number | null>;
  send<T>(msg: PopupMessage): Promise<T>;
  settings(): Promise<{ suffix: Suffix; keyDelayMs: number }>;
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
  };
  const el = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const code = el<HTMLInputElement>("code");
  const switchEl = el<HTMLButtonElement>("switch");
  const update = (p: Partial<PopupView>) => {
    Object.assign(view, p);
    render(doc, view);
  };
  let tabId: number | null = null;
  render(doc, view);

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
    let r: ScanResult;
    try {
      r = await api.send<ScanResult>({ type: "scan", tabId, value });
    } catch (err) {
      r = errorResult(err);
    }
    update({
      busy: false,
      result: describeResult(r),
      status:
        r.kind === "site-off"
          ? { ...view.status, state: "off" }
          : r.kind === "detached"
            ? { ...view.status, state: "detached" }
            : view.status,
    });
    code.focus();
  });
  switchEl.addEventListener("click", () =>
    toggle(view.status.state === "off" ? "session-on" : "session-off"),
  );
  el("reconnect").addEventListener("click", () => toggle("session-on"));
  el("help").addEventListener("click", () => api.openHelp());
  el("settings").addEventListener("click", () => api.openSettings());

  tabId = await api.tabId();
  const s = await api.settings();
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
    openHelp: () =>
      void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") }),
    openSettings: () => void chrome.runtime.openOptionsPage(),
  });
}
