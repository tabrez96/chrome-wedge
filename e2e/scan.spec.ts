import type { BrowserContext, Page } from "@playwright/test";
import path from "node:path";
import { expect, test } from "./fixtures";

const FIXTURE = "http://wedge.test/";
const OTHER = "http://other.test/";

test.beforeEach(async ({ context }) => {
  await context.route(/^http:\/\/(wedge|other)\.test\//, (r) =>
    r.fulfill({ path: path.resolve("e2e/fixtures/scan.html") }),
  );
});

type Key = { isTrusted: boolean; key: string; value: string };
const keys = (p: Page) =>
  p.evaluate(() => (window as unknown as { keys: Key[] }).keys);
const names = async (p: Page) => (await keys(p)).map((k) => k.key);

async function setup(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(FIXTURE);
  const other = await context.newPage();
  await other.goto(OTHER);
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  const tabOf = async (url: string) => {
    const id = await ext.evaluate(
      async (u) =>
        (await chrome.debugger.getTargets()).find((t) => t.url === u)?.tabId,
      url,
    );
    expect(typeof id).toBe("number");
    return id as number;
  };
  const send = (msg: unknown) =>
    ext.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const setSettings = (patch: Record<string, unknown>) =>
    ext.evaluate(async (p) => {
      const cur = (await chrome.storage.local.get("settings")).settings ?? {};
      await chrome.storage.local.set({ settings: { ...cur, ...p } });
    }, patch);
  const pageId = await tabOf(FIXTURE);
  const scan = async (value: string, field = "#code") => {
    await page.bringToFront();
    await page.focus(field);
    return send({ type: "scan", tabId: pageId, value });
  };
  await send({ type: "session-on", tabId: pageId });
  await setSettings({ keyDelayMs: 0 });
  return { page, other, ext, tabOf, send, setSettings, pageId, scan };
}

test("typed scan arrives trusted and ends with Enter; the none suffix sends no final key", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  expect(await t.scan("AB-12")).toEqual({
    kind: "sent",
    value: "AB-12",
    keys: 5,
    suffix: "enter",
    label: "Code",
  });
  expect(await names(t.page)).toEqual(["A", "B", "-", "1", "2", "Enter"]);
  expect((await keys(t.page)).every((k) => k.isTrusted)).toBe(true);
  expect(await t.page.inputValue("#code")).toBe("AB-12");
  await t.setSettings({ suffix: "none" });
  expect(await t.scan("7")).toMatchObject({ kind: "sent", suffix: "none" });
  expect((await names(t.page)).slice(-2)).toEqual(["Enter", "7"]);
});

test("prefix is typed first and the Tab suffix moves focus", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.setSettings({ prefix: "]C1", suffix: "tab", keyDelayMs: 0 });
  await t.scan("42");
  expect(await names(t.page)).toEqual(["]", "C", "1", "4", "2", "Tab"]);
  expect(await t.page.inputValue("#code")).toBe("]C142");
  expect(await t.page.evaluate(() => document.activeElement?.id)).toBe("next");
});

test("a focused password field is refused and stays empty", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  expect(await t.scan("secret", "#pw")).toEqual({ kind: "refused" });
  expect(await keys(t.page)).toEqual([]);
  expect(await t.page.inputValue("#pw")).toBe("");
});

test("nothing focused returns no-field", async ({ context, extensionId }) => {
  const t = await setup(context, extensionId);
  await t.page.bringToFront();
  await t.page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  expect(await t.send({ type: "scan", tabId: t.pageId, value: "1" })).toEqual({
    kind: "no-field",
  });
  expect(await keys(t.page)).toEqual([]);
});

test("a tab that is not switched on receives nothing", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  const otherId = await t.tabOf(OTHER);
  expect(await t.send({ type: "scan", tabId: otherId, value: "1" })).toEqual({
    kind: "site-off",
  });
  expect(await keys(t.other)).toEqual([]);
  expect(await keys(t.page)).toEqual([]);
});

test("two scans on one tab never interleave", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.setSettings({ keyDelayMs: 20 });
  await t.page.bringToFront();
  await t.page.focus("#code");
  const replies = await t.ext.evaluate(
    (id) =>
      Promise.all(
        ["1111", "2222"].map((value) =>
          chrome.runtime.sendMessage({ type: "scan", tabId: id, value }),
        ),
      ),
    t.pageId,
  );
  expect(replies.map((r) => r.kind)).toEqual(["sent", "sent"]);
  const got = (await names(t.page)).join(",");
  const a = "1,1,1,1,Enter";
  const b = "2,2,2,2,Enter";
  expect([`${a},${b}`, `${b},${a}`]).toContain(got);
});
