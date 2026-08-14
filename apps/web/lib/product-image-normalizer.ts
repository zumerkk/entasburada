import sharp, { type Sharp } from "sharp";

export const PRODUCT_IMAGE_CANVAS_SIZE = 1200;
export const PRODUCT_IMAGE_CONTENT_SIZE = 1080;
export const PRODUCT_IMAGE_BACKGROUND = "#ffffff";
export const ENTAS_CATALOG_IMAGE_CANVAS_SIZE = 2160;

export interface NormalizedProductImage {
  buffer: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
}

export interface ProductImageMetadata {
  format: string | undefined;
  width: number;
  height: number;
}

export interface ProductImageCropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ProductImageContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export async function readProductImageMetadata(input: Buffer | string): Promise<ProductImageMetadata> {
  const metadata = await sharp(input, { failOn: "none", limitInputPixels: 200_000_000 }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Product image dimensions could not be read.");
  }
  return { format: metadata.format, width: metadata.width, height: metadata.height };
}

export async function normalizeProductImage(input: Buffer | string): Promise<NormalizedProductImage> {
  const sourceMetadata = await readProductImageMetadata(input);
  let buffer: Buffer;
  try {
    buffer = await createOutputPipeline(input, true).toBuffer();
  } catch {
    buffer = await createOutputPipeline(input, false).toBuffer();
  }

  return {
    buffer,
    sourceWidth: sourceMetadata.width,
    sourceHeight: sourceMetadata.height,
    width: PRODUCT_IMAGE_CANVAS_SIZE,
    height: PRODUCT_IMAGE_CANVAS_SIZE
  };
}

export async function cropAndNormalizeProductImage(
  input: Buffer | string,
  region: ProductImageCropRegion
): Promise<NormalizedProductImage> {
  const cropped = await sharp(input, { failOn: "none", limitInputPixels: 200_000_000 })
    .extract(region)
    .png()
    .toBuffer();
  return normalizeProductImage(cropped);
}

export async function cropProductImageToPng(
  input: Buffer | string,
  region: ProductImageCropRegion
): Promise<Buffer> {
  return sharp(input, { failOn: "none", limitInputPixels: 200_000_000 })
    .extract(region)
    .png()
    .toBuffer();
}

/**
 * Builds a high-resolution, brand-safe ecommerce card without changing the
 * supplied product pixels.  The source is only rotated, whitespace-trimmed,
 * proportionally resized and lightly sharpened; no generative pixels are used.
 */
export async function createEntasCatalogProductImage(input: Buffer | string): Promise<NormalizedProductImage> {
  const sourceMetadata = await readProductImageMetadata(input);
  const smallestEdge = Math.min(sourceMetadata.width, sourceMetadata.height);
  const contentSize = smallestEdge < 100 ? 1200 : smallestEdge < 220 ? 1480 : 1720;
  let product = sharp(input, { failOn: "none", limitInputPixels: 200_000_000 })
    .rotate()
    .flatten({ background: PRODUCT_IMAGE_BACKGROUND });
  try {
    product = product.trim({ background: PRODUCT_IMAGE_BACKGROUND, threshold: 14 });
  } catch {
    // Some unusual PDF image encodings do not expose trim statistics. The
    // untrimmed original is still safe to place on the white canvas.
  }
  const productBuffer = await product
    .resize({
      width: contentSize,
      height: contentSize,
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3
    })
    .sharpen({ sigma: smallestEdge < 220 ? 0.35 : 0.25 })
    .png()
    .toBuffer();
  const productMetadata = await sharp(productBuffer).metadata();
  const productWidth = productMetadata.width || contentSize;
  const productHeight = productMetadata.height || contentSize;
  const left = Math.round((ENTAS_CATALOG_IMAGE_CANVAS_SIZE - productWidth) / 2);
  const top = Math.round((ENTAS_CATALOG_IMAGE_CANVAS_SIZE - productHeight) / 2 - 24);
  const frame = Buffer.from(`<svg width="${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}" height="${ENTAS_CATALOG_IMAGE_CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <rect width="2160" height="2160" fill="#ffffff"/>
    <rect x="44" y="44" width="2072" height="2072" rx="28" fill="none" stroke="#123047" stroke-width="5"/>
    <path d="M72 76 H628" stroke="#0f9f9a" stroke-width="12" stroke-linecap="round"/>
    <text x="2042" y="2070" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" letter-spacing="2" fill="#123047" fill-opacity="0.20">ENTAŞBURADA</text>
    <text x="118" y="2070" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" letter-spacing="1.5" fill="#0f9f9a" fill-opacity="0.42">RESMÎ KATALOG GÖRSELİ</text>
  </svg>`);
  const buffer = await sharp(frame)
    .composite([{ input: productBuffer, left, top }])
    .webp({ quality: 90, alphaQuality: 100, effort: 5, smartSubsample: true })
    .toBuffer();

  return {
    buffer,
    sourceWidth: sourceMetadata.width,
    sourceHeight: sourceMetadata.height,
    width: ENTAS_CATALOG_IMAGE_CANVAS_SIZE,
    height: ENTAS_CATALOG_IMAGE_CANVAS_SIZE
  };
}

export async function readProductImageContentBounds(input: Buffer | string, sampleSize = 240): Promise<ProductImageContentBounds> {
  const { data, info } = await sharp(input, { failOn: "none", limitInputPixels: 200_000_000 })
    .flatten({ background: PRODUCT_IMAGE_BACKGROUND })
    .resize({ width: sampleSize, height: sampleSize, fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
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

function createOutputPipeline(input: Buffer | string, trimWhitespace: boolean): Sharp {
  let pipeline = sharp(input, { failOn: "none", limitInputPixels: 200_000_000 })
    .rotate()
    .flatten({ background: PRODUCT_IMAGE_BACKGROUND });
  if (trimWhitespace) {
    pipeline = pipeline.trim({ background: PRODUCT_IMAGE_BACKGROUND, threshold: 14 });
  }

  const outerPadding = (PRODUCT_IMAGE_CANVAS_SIZE - PRODUCT_IMAGE_CONTENT_SIZE) / 2;
  return pipeline
    .resize({
      width: PRODUCT_IMAGE_CONTENT_SIZE,
      height: PRODUCT_IMAGE_CONTENT_SIZE,
      fit: "contain",
      background: PRODUCT_IMAGE_BACKGROUND,
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3
    })
    .extend({
      top: outerPadding,
      right: outerPadding,
      bottom: outerPadding,
      left: outerPadding,
      background: PRODUCT_IMAGE_BACKGROUND
    })
    .sharpen({ sigma: 0.45 })
    .webp({ quality: 90, alphaQuality: 100, effort: 4, smartSubsample: true });
}
