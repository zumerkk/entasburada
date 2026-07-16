import sharp from "sharp";

export const PRODUCT_IMAGE_CANVAS_SIZE = 1200;
export const PRODUCT_IMAGE_CONTENT_SIZE = 1080;
export const PRODUCT_IMAGE_BACKGROUND = "#ffffff";

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

function createOutputPipeline(input: Buffer | string, trimWhitespace: boolean): sharp.Sharp {
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
