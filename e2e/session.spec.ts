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

async function setup(context: BrowserContext, extensionId: string) {
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
  const id = tabId as number;
  return {
    id,
    send: (msg: unknown) =>
      ext.evaluate((m) => chrome.runtime.sendMessage(m), msg),
    // Succeeds only while this extension holds the session (getTargets().attached is always true under Playwright).
    isAttached: () =>
      ext.evaluate(
        (id) =>
          chrome.debugger
            .sendCommand({ tabId: id }, "Runtime.evaluate", { expression: "1" })
            .then(
              () => true,
              () => false,
            ),
        id,
      ),
    sites: () =>
      ext.evaluate(
        async (): Promise<string[]> =>
          (
            (await chrome.storage.local.get("settings")).settings as
              { allowedSites?: string[] } | undefined
          )?.allowedSites ?? [],
      ),
  };
}

const ON = { ok: true, status: { state: "attached", host: "wedge.test" } };

test("switching on attaches, allows the host and is a no-op the second time", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  expect(await t.send({ type: "session-on", tabId: t.id })).toEqual(ON);
  expect(await t.isAttached()).toBe(true);
  expect(await t.sites()).toContain("wedge.test");
  expect(await t.send({ type: "session-on", tabId: t.id })).toEqual(ON);
  expect(await t.isAttached()).toBe(true);
  expect(await t.send({ type: "session-get", tabId: t.id })).toEqual(ON);
});

test("switching off detaches and removes the host", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.send({ type: "session-on", tabId: t.id });
  expect(await t.send({ type: "session-off", tabId: t.id })).toEqual({
    ok: true,
    status: { state: "off", host: "wedge.test" },
  });
  expect(await t.isAttached()).toBe(false);
  expect(await t.sites()).not.toContain("wedge.test");
});
