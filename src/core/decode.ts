import {
  BarcodeFormat as ZxingFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  PlanarYUVLuminanceSource,
} from "@zxing/library";
import { FORMATS, type BarcodeFormat } from "./settings";

export type DecodeResult =
  | { kind: "decoded"; format: BarcodeFormat; value: string }
  | { kind: "unreadable" };

const UNREADABLE: DecodeResult = { kind: "unreadable" };

const TO_ZXING: Record<BarcodeFormat, ZxingFormat> = {
  code128: ZxingFormat.CODE_128,
  ean13: ZxingFormat.EAN_13,
  upca: ZxingFormat.UPC_A,
};

export function toLuminance(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i++) {
    const a = rgba[i * 4 + 3]!;
    // Composite over white so a transparent background reads as white.
    const over = (c: number) => (c * a + 255 * (255 - a)) / 255;
    const r = over(rgba[i * 4]!);
    const g = over(rgba[i * 4 + 1]!);
    const b = over(rgba[i * 4 + 2]!);
    out[i] = Math.round((299 * r + 587 * g + 114 * b) / 1000);
  }
  return out;
}

function tryFormats(
  bitmap: BinaryBitmap,
  formats: readonly BarcodeFormat[],
): DecodeResult {
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, formats.map((f) => TO_ZXING[f])],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  try {
    const result = new MultiFormatReader().decode(bitmap, hints);
    const format = FORMATS.find(
      (f) => TO_ZXING[f] === result.getBarcodeFormat(),
    );
    if (!format) return UNREADABLE;
    return { kind: "decoded", format, value: result.getText() };
  } catch {
    return UNREADABLE;
  }
}

export function decodeBarcode(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  defaultFormat: BarcodeFormat,
): DecodeResult {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    rgba.length !== width * height * 4
  ) {
    return UNREADABLE;
  }
  // The Y plane is exactly our luminance, which avoids RGBLuminanceSource's packed-pixel input.
  const source = new PlanarYUVLuminanceSource(
    toLuminance(rgba, width, height),
    width,
    height,
    0,
    0,
    width,
    height,
    false,
  );
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const first = tryFormats(bitmap, [defaultFormat]);
  return first.kind === "decoded" ? first : tryFormats(bitmap, FORMATS);
}
