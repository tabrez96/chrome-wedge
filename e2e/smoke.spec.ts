import { expect, test } from "./fixtures";

test("service worker starts", async ({ context, extensionId }) => {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  expect(worker.url()).toBe(`chrome-extension://${extensionId}/background.js`);
});

test("popup loads the shared tokens", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).toBe("rgb(14, 20, 38)");
});
