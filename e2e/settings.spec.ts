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
  const settings = await context.newPage();
  const openSettings = () =>
    settings.goto(`chrome-extension://${extensionId}/settings.html`);
  return {
    id,
    settings,
    openSettings,
    send: (msg: unknown) =>
      ext.evaluate((m) => chrome.runtime.sendMessage(m), msg),
    // Succeeds only while this extension holds the session.
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

test("adding a host saves the normalised host and survives a reload", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.openSettings();
  await t.settings
    .getByRole("textbox", { name: "Site host" })
    .fill("HTTPS://Pos.Example.com:3000/till");
  await t.settings.getByRole("button", { name: "Add site" }).click();
  await expect(t.settings.locator("#save-status")).toHaveText(
    "✓ Changes saved",
  );
  expect(await t.sites()).toEqual(["pos.example.com:3000"]);
  await t.settings.reload();
  await expect(t.settings.locator(".site-host")).toHaveText([
    "pos.example.com:3000",
  ]);
});

test("an invalid host shows the error and leaves storage unchanged", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.openSettings();
  await t.settings
    .getByRole("textbox", { name: "Site host" })
    .fill("not a host!");
  await t.settings.getByRole("button", { name: "Add site" }).click();
  await expect(
    t.settings.getByText("Enter a host like localhost:3000 or pos.example.com"),
  ).toBeVisible();
  expect(await t.sites()).toEqual([]);
});

test("removing a site detaches the tab on it", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.send({ type: "session-on", tabId: t.id });
  expect(await t.isAttached()).toBe(true);
  await t.openSettings();
  await t.settings.getByRole("button", { name: "Remove wedge.test" }).click();
  await expect.poll(t.isAttached).toBe(false);
  expect(await t.sites()).not.toContain("wedge.test");
});

test("a site switched on from the popup appears without a reload", async ({
  context,
  extensionId,
}) => {
  const t = await setup(context, extensionId);
  await t.openSettings();
  await expect(t.settings.locator("#sites-empty")).toBeVisible();
  await t.send({ type: "session-on", tabId: t.id });
  await expect(
    t.settings.getByRole("button", { name: "Remove wedge.test" }),
  ).toBeVisible();
});
