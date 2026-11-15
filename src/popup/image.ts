import type { BarcodeFormat } from "../core/settings";

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const FORMAT_NAMES: Record<BarcodeFormat, string> = {
  code128: "Code 128",
  ean13: "EAN-13",
  upca: "UPC-A",
};
export type Pixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
// Large photos are scaled down so decoding stays quick.
export const MAX_SIDE = 2048;

export const isAcceptedImage = (file: { type: string }): boolean =>
  ACCEPTED_TYPES.includes(file.type);

export async function imageToPixels(file: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = new OffscreenCanvas(width, height).getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}
