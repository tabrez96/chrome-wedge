import { describe, expect, it } from "vitest";
import { isAcceptedImage } from "./image";

describe("isAcceptedImage", () => {
  it("accepts PNG, JPEG and WebP only", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"])
      expect(isAcceptedImage({ type })).toBe(true);
    for (const type of ["image/gif", ""])
      expect(isAcceptedImage({ type })).toBe(false);
  });
});
