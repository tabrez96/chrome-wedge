// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("./tokens.css", import.meta.url),
  "utf8",
).toLowerCase();

const uxColours =
  `0E1426 151D33 E8ECF5 9AA4BC 2A3552 3E4A6B 222B45 E0393E FFFFFF FF6B5E 6EE0A6 0F2E22 1F5A3F 23A86A F5C46B 33250D FF9A9C 3A1619 6B7591`.split(
    " ",
  );

describe("tokens.css", () => {
  it("contains every UX colour", () => {
    for (const hex of uxColours) {
      expect(css, hex).toContain(`#${hex.toLowerCase()}`);
    }
  });
});
