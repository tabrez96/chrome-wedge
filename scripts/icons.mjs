import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync("design/brand/mark.svg");
mkdirSync("public/icons", { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  writeFileSync(`public/icons/icon-${size}.png`, png);
}
