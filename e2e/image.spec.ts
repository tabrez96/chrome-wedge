import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

const dir = "test/fixtures/barcodes";

test("choosing a file fills the code and shows the card", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.setInputFiles("#file", `${dir}/code128-clean.png`);
  await expect(page.locator("#code")).toHaveValue("WEDGE-12345");
  await expect(page.locator("#drop-format")).toHaveText("Code 128 found");
  await expect(page.locator("#drop-thumb")).toBeVisible();
});

test("dropping an image decodes it", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const b64 = readFileSync(`${dir}/ean13-clean.png`).toString("base64");
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "ean13-clean.png", { type: "image/png" }));
    document
      .getElementById("drop")!
      .dispatchEvent(new DragEvent("drop", { dataTransfer: dt }));
  }, b64);
  await expect(page.locator("#code")).toHaveValue("4006381333931");
});

test("a non-barcode image shows the unreadable line", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.setInputFiles("#file", `${dir}/not-barcode-shapes.png`);
  await expect(page.locator("#result")).toContainText(
    "No barcode found in not-barcode-shapes.png",
  );
});
