import { mkdirSync, writeFileSync } from "node:fs";
import bwipjs from "bwip-js/node";
import { Resvg } from "@resvg/resvg-js";
import { PNG } from "pngjs";

const OUT = new URL("../test/fixtures/barcodes/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const CODES = [
  { format: "code128", bcid: "code128", value: "WEDGE-12345" },
  { format: "ean13", bcid: "ean13", value: "4006381333931" },
  { format: "upca", bcid: "upca", value: "036000291452" },
];

type Entry = { file: string; format: string | null; value: string | null };
const index: Entry[] = [];

function barcodeSvg(bcid: string, value: string, bar: string, bg: string) {
  const svg = bwipjs
    .toSVG({
      bcid,
      text: value,
      scale: 2,
      height: 15,
      includetext: false,
      paddingwidth: 10,
      paddingheight: 10,
      barcolor: bar,
      backgroundcolor: bg,
    })
    .replace(/^<\?xml[^>]*\?>\s*/, "");
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const w = Number(box?.[1]);
  const h = Number(box?.[2]);
  return {
    inner: svg.replace(
      "<svg ",
      `<svg x="40" y="40" width="${w}" height="${h}" `,
    ),
    w,
    h,
  };
}

function page(inner: string, w: number, h: number, bg: string, deg: number) {
  const pw = w + 80;
  const ph = h + 80;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">` +
    `<rect width="100%" height="100%" fill="#${bg}"/>` +
    `<g transform="rotate(${deg} ${pw / 2} ${ph / 2})">${inner}</g></svg>`
  );
}

const variants = [
  { name: "clean", bar: "000000", bg: "FFFFFF", deg: 0, zoom: 1 },
  { name: "scaled", bar: "000000", bg: "FFFFFF", deg: 0, zoom: 2.5 },
  { name: "rotated", bar: "000000", bg: "FFFFFF", deg: 4, zoom: 1 },
  { name: "lowcontrast", bar: "777777", bg: "BBBBBB", deg: 0, zoom: 1 },
];

for (const code of CODES) {
  for (const v of variants) {
    const b = barcodeSvg(code.bcid, code.value, v.bar, v.bg);
    const svg = page(b.inner, b.w, b.h, v.bg, v.deg);
    const png = new Resvg(svg, {
      fitTo: { mode: "zoom", value: v.zoom },
    })
      .render()
      .asPng();
    const file = `${code.format}-${v.name}.png`;
    writeFileSync(new URL(file, OUT), png);
    index.push({ file, format: code.format, value: code.value });
  }
}

function writeRaw(file: string, fill: (png: PNG) => void) {
  const png = new PNG({ width: 240, height: 120 });
  fill(png);
  writeFileSync(new URL(file, OUT), PNG.sync.write(png));
  index.push({ file, format: null, value: null });
}

writeRaw("not-barcode-blank.png", (png) => png.data.fill(255));

writeRaw("not-barcode-noise.png", (png) => {
  let seed = 42;
  for (let i = 0; i < png.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const g = seed >>> 24;
    png.data[i] = g;
    png.data[i + 1] = g;
    png.data[i + 2] = g;
    png.data[i + 3] = 255;
  }
});

const shapes =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120">' +
  '<rect width="100%" height="100%" fill="#FFFFFF"/>' +
  '<circle cx="60" cy="60" r="35" fill="#336699"/>' +
  '<circle cx="110" cy="50" r="20" fill="#CC6633"/>' +
  '<rect x="150" y="30" width="70" height="60" fill="#444444"/></svg>';
writeFileSync(
  new URL("not-barcode-shapes.png", OUT),
  new Resvg(shapes).render().asPng(),
);
index.push({ file: "not-barcode-shapes.png", format: null, value: null });

writeFileSync(
  new URL("index.json", OUT),
  JSON.stringify(index, null, 2) + "\n",
);
