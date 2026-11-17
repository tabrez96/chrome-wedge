import type { BrowserContext } from "@playwright/test";
import { expect, test } from "./fixtures";

const FIXTURE = "http://wedge.test/";

test.beforeEach(async ({ context }) => {
  await context.route(`${FIXTURE}**`, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Fixture</title><input aria-label='Code'>",
    }),
  );
});

const welcomePages = (context: BrowserContext, extensionId: string) =>
  context
    .pages()
    .filter(
      (p) => p.url() === `chrome-extension://${extensionId}/welcome.html`,
    );

async function switchOnFixture(context: BrowserContext, extensionId: string) {
  const page = await context.newPage();
  await page.goto(FIXTURE);
  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/popup.html`);
  const tabId = await ext.evaluate(
    async (url) =>
      (await chrome.debugger.getTargets()).find((t) => t.url === url)?.tabId,
    FIXTURE,
  );
  expect(typeof tabId).toBe("number");
  const reply = await ext.evaluate(
    (id) => chrome.runtime.sendMessage({ type: "session-on", tabId: id }),
    tabId as number,
  );
  return { ext, reply };
}

test("installing opens the welcome page", async ({ context, extensionId }) => {
  await expect.poll(() => welcomePages(context, extensionId).length).toBe(1);
});

test("Got it closes the welcome page and switching on does not reopen it", async ({
  context,
  extensionId,
}) => {
  await expect.poll(() => welcomePages(context, extensionId).length).toBe(1);
  const welcome = welcomePages(context, extensionId)[0]!;
  await welcome.waitForLoadState();
  await Promise.all([
    welcome.waitForEvent("close"),
    welcome.getByRole("button", { name: "Got it" }).click(),
  ]);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const stored = await popup.evaluate(
    async () =>
      (await chrome.storage.local.get("settings")).settings as {
        firstRunDone?: boolean;
      },
  );
  expect(stored.firstRunDone).toBe(true);
  await popup.close();

  const { reply } = await switchOnFixture(context, extensionId);
  expect(reply).toMatchObject({ ok: true });
  expect(welcomePages(context, extensionId)).toHaveLength(0);
});

test("switching on before Got it opens the welcome page next to the tab", async ({
  context,
  extensionId,
}) => {
  await expect.poll(() => welcomePages(context, extensionId).length).toBe(1);
  await welcomePages(context, extensionId)[0]!.close();
  expect(welcomePages(context, extensionId)).toHaveLength(0);

  const { reply } = await switchOnFixture(context, extensionId);
  expect(reply).toMatchObject({ ok: true });
  await expect.poll(() => welcomePages(context, extensionId).length).toBe(1);
});
