import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  PRODUCT_IMAGE_CANVAS_SIZE,
  PRODUCT_IMAGE_CONTENT_SIZE,
  cropAndNormalizeProductImage,
  normalizeProductImage,
  readProductImageContentBounds
} from "./product-image-normalizer";

describe("product image normalizer", () => {
  it("centers a wide product on a square canvas without cropping", async () => {
    const source = await sharp({
      create: { width: 1600, height: 240, channels: 3, background: "#0b7a53" }
    }).png().toBuffer();

    const result = await normalizeProductImage(source);
    const metadata = await sharp(result.buffer).metadata();
    const bounds = await nonWhiteBounds(result.buffer);

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(PRODUCT_IMAGE_CANVAS_SIZE);
    expect(metadata.height).toBe(PRODUCT_IMAGE_CANVAS_SIZE);
    expect(bounds.width).toBeGreaterThanOrEqual(PRODUCT_IMAGE_CONTENT_SIZE - 4);
    expect(bounds.height).toBeLessThan(190);
    expect(bounds.left).toBeGreaterThanOrEqual(55);
    expect(bounds.right).toBeLessThanOrEqual(1145);
  });

  it("centers a tall product on the same square canvas", async () => {
    const source = await sharp({
      create: { width: 180, height: 1400, channels: 3, background: "#f97316" }
    }).png().toBuffer();

    const result = await normalizeProductImage(source);
    const metadata = await sharp(result.buffer).metadata();
    const bounds = await nonWhiteBounds(result.buffer);

    expect(metadata.width).toBe(PRODUCT_IMAGE_CANVAS_SIZE);
    expect(metadata.height).toBe(PRODUCT_IMAGE_CANVAS_SIZE);
    expect(bounds.height).toBeGreaterThanOrEqual(PRODUCT_IMAGE_CONTENT_SIZE - 4);
    expect(bounds.width).toBeLessThan(160);
    expect(bounds.top).toBeGreaterThanOrEqual(55);
    expect(bounds.bottom).toBeLessThanOrEqual(1145);
  });

  it("crops the requested product region before applying the square canvas", async () => {
    const source = await sharp({
      create: { width: 600, height: 300, channels: 3, background: "#ffffff" }
    })
      .composite([
        { input: await sharp({ create: { width: 220, height: 180, channels: 3, background: "#0ea5e9" } }).png().toBuffer(), left: 30, top: 60 },
        { input: await sharp({ create: { width: 220, height: 180, channels: 3, background: "#f97316" } }).png().toBuffer(), left: 350, top: 60 }
      ])
      .png()
      .toBuffer();

    const result = await cropAndNormalizeProductImage(source, { left: 0, top: 20, width: 300, height: 260 });
    const stats = await sharp(result.buffer).removeAlpha().stats();

    expect(result.width).toBe(PRODUCT_IMAGE_CANVAS_SIZE);
    expect(result.height).toBe(PRODUCT_IMAGE_CANVAS_SIZE);
    expect(stats.channels[2]!.mean).toBeGreaterThan(stats.channels[0]!.mean);
  });

  it("detects an implausibly thin content strip inside a normalized product image", async () => {
    const source = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "#ffffff" }
    })
      .composite([
        {
          input: await sharp({ create: { width: 1080, height: 90, channels: 3, background: "#111827" } }).png().toBuffer(),
          left: 60,
          top: 555
        }
      ])
      .webp()
      .toBuffer();

    const bounds = await readProductImageContentBounds(source);

    expect(bounds.width / bounds.height).toBeGreaterThan(8);
  });
});

async function nonWhiteBounds(buffer: Buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (data[offset]! > 245 && data[offset + 1]! > 245 && data[offset + 2]! > 245) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  return {
    left,
    right,
    top,
    bottom,
    width: right >= left ? right - left + 1 : 0,
    height: bottom >= top ? bottom - top + 1 : 0
  };
}
