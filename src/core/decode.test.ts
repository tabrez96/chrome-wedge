import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { decodeBarcode, toLuminance } from "./decode";
import { FORMATS, type BarcodeFormat } from "./settings";

type Entry = {
  file: string;
  format: BarcodeFormat | null;
  value: string | null;
};

const DIR = resolve("test/fixtures/barcodes");
const index: Entry[] = JSON.parse(
  readFileSync(resolve(DIR, "index.json"), "utf8"),
);
const barcodes = index.filter((e) => e.format !== null);
const others = index.filter((e) => e.format === null);

function load(file: string) {
  return PNG.sync.read(readFileSync(resolve(DIR, file)));
}

describe("decodeBarcode", () => {
  it("fixture index lists 12 barcodes and 3 non-barcodes", () => {
    expect(barcodes).toHaveLength(12);
    expect(others).toHaveLength(3);
  });

  it.each(barcodes)("decodes $file with its own format as default", (e) => {
    const { data, width, height } = load(e.file);
    expect(decodeBarcode(data, width, height, e.format!)).toEqual({
      kind: "decoded",
      format: e.format,
      value: e.value,
    });
  });

  const differentDefault = {
    code128: "upca",
    ean13: "code128",
    upca: "code128",
  } as const;
  it.each(barcodes.filter((e) => e.file.endsWith("-clean.png")))(
    "decodes $file when the default format is different",
    (e) => {
      const { data, width, height } = load(e.file);
      const result = decodeBarcode(
        data,
        width,
        height,
        differentDefault[e.format!],
      );
      expect(result).toEqual({
        kind: "decoded",
        format: e.format,
        value: e.value,
      });
    },
  );

  it("reads UPC-A as EAN-13 with a leading 0 when EAN-13 is the default", () => {
    const { data, width, height } = load("upca-clean.png");
    expect(decodeBarcode(data, width, height, "ean13")).toEqual({
      kind: "decoded",
      format: "ean13",
      value: "0036000291452",
    });
  });

  describe.each(others)("returns unreadable for $file", (e) => {
    it.each(FORMATS)("with default %s", (format) => {
      const { data, width, height } = load(e.file);
      expect(decodeBarcode(data, width, height, format)).toEqual({
        kind: "unreadable",
      });
    });
  });

  it("returns unreadable for bad dimensions", () => {
    const { data, width, height } = load("code128-clean.png");
    const unreadable = { kind: "unreadable" };
    expect(decodeBarcode(data, 0, height, "code128")).toEqual(unreadable);
    expect(decodeBarcode(data, width, -1, "code128")).toEqual(unreadable);
    expect(decodeBarcode(data, 1.5, height, "code128")).toEqual(unreadable);
    expect(decodeBarcode(data.subarray(4), width, height, "code128")).toEqual(
      unreadable,
    );
  });

  it("decodes a barcode with a transparent background", () => {
    const { data, width, height } = load("code128-clean.png");
    const copy = new Uint8Array(data);
    for (let i = 0; i < copy.length; i += 4) {
      if (copy[i] === 255) copy[i + 3] = 0;
    }
    expect(decodeBarcode(copy, width, height, "code128")).toEqual({
      kind: "decoded",
      format: "code128",
      value: "WEDGE-12345",
    });
  });
});

describe("toLuminance", () => {
  it("composites transparent pixels onto white", () => {
    const y = (px: number[]) => [...toLuminance(new Uint8Array(px), 1, 1)];
    expect(y([0, 0, 0, 0])).toEqual([255]);
    expect(y([0, 0, 0, 255])).toEqual([0]);
    expect(y([255, 0, 0, 255])).toEqual([76]);
  });
});
