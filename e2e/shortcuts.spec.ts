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

// The fixture records keydowns on document, never on window, so any window listener is ours.
const windowKeydownListeners = (ext: Page, tabId: number) =>
  ext.evaluate(async (id) => {
    const t = { tabId: id };
    // The listener lives in the isolated world "wedge"; createIsolatedWorld reuses it by name.
    const tree = (await chrome.debugger.sendCommand(
      t,
      "Page.getFrameTree",
    )) as {
      frameTree: { frame: { id: string } };
    };
    const world = (await chrome.debugger.sendCommand(
      t,
      "Page.createIsolatedWorld",
      { frameId: tree.frameTree.frame.id, worldName: "wedge" },
    )) as { executionContextId: number };
    const w = (await chrome.debugger.sendCommand(t, "Runtime.evaluate", {
      expression: "window",
      contextId: world.executionContextId,
    })) as { result: { objectId: string } };
    const r = (await chrome.debugger.sendCommand(
      t,
      "DOMDebugger.getEventListeners",
      {
        objectId: w.result.objectId,
      },
    )) as { listeners: { type: string }[] };
    return r.listeners.filter((l) => l.type === "keydown").length;
  }, tabId);

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
  const pageId = await tabOf(FIXTURE);
  await ext.evaluate((m) => chrome.runtime.sendMessage(m), {
    type: "session-on",
    tabId: pageId,
  });
  await ext.evaluate(async () => {
    const cur = (await chrome.storage.local.get("settings")).settings ?? {};
    await chrome.storage.local.set({
      settings: {
        ...cur,
        keyDelayMs: 0,
        savedCodes: [{ id: "a", name: "One", value: "SC-1", shortcut: 1 }],
      },
    });
  });
  const press = async (p: Page, combo: string) => {
    await p.bringToFront();
    await p.focus("#code");
    await p.keyboard.press(combo);
  };
  return { page, other, ext, tabOf, pageId, press };
}

test("Alt+1 on a switched-on tab sends saved code 1 as trusted keystrokes", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.press(t.page, "Alt+Digit1");
  await expect.poll(() => t.page.inputValue("#code")).toBe("SC-1");
  await expect
    .poll(async () => (await keys(t.page)).some((k) => k.key === "Enter"))
    .toBe(true);
  const got = (await keys(t.page)).filter((k) => k.key !== "Alt");
  expect(got.map((k) => k.key)).toEqual(["S", "C", "-", "1", "Enter"]);
  expect(got.every((k) => k.isTrusted)).toBe(true);
});

test("Alt+1 on a tab that is not switched on does nothing and no listener exists there", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.press(t.other, "Alt+Digit1");
  expect(await t.other.inputValue("#code")).toBe("");
  expect(await names(t.other)).toContain("1");
  const otherId = await t.tabOf(OTHER);
  await t.ext.evaluate(
    (id) => chrome.debugger.attach({ tabId: id }, "1.3"),
    otherId,
  );
  expect(await windowKeydownListeners(t.ext, otherId)).toBe(0);
  await t.ext.evaluate((id) => chrome.debugger.detach({ tabId: id }), otherId);
  expect(await windowKeydownListeners(t.ext, t.pageId)).toBe(1);
});

test("the shortcut survives a same-host navigation", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.page.goto(FIXTURE + "next");
  await t.press(t.page, "Alt+Digit1");
  await expect.poll(() => t.page.inputValue("#code")).toBe("SC-1");
  expect(await windowKeydownListeners(t.ext, t.pageId)).toBe(1);
});

test("Alt+Shift+1 also sends saved code 1", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.press(t.page, "Alt+Shift+Digit1");
  await expect.poll(() => t.page.inputValue("#code")).toBe("SC-1");
});
