import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Initialize S3 client. In development without env vars, it falls back to a local mock.
const isS3Configured = Boolean(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_BUCKET);

const s3 = isS3Configured
  ? new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT, // e.g. https://<account_id>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;

/**
 * Uploads a file buffer to S3 (or R2) and returns the public URL.
 * If S3 is not configured, saves the file to public/uploads locally.
 */
export async function uploadProductImage(buffer: Buffer, originalName: string, mimeType: string = "image/webp"): Promise<string> {
  const ext = extname(originalName) || ".webp";
  const uniqueName = `products/${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;

  if (s3 && process.env.S3_BUCKET) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: uniqueName,
          Body: buffer,
          ContentType: mimeType,
          ACL: "public-read", // Required depending on your bucket configuration
        })
      );
      // Return the public URL for the S3 object
      const publicUrl = process.env.NEXT_PUBLIC_S3_DOMAIN
        ? `${process.env.NEXT_PUBLIC_S3_DOMAIN}/${uniqueName}`
        : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "auto"}.amazonaws.com/${uniqueName}`;
      return publicUrl;
    } catch (error) {
      console.error("S3 Upload Error:", error);
      throw new Error(`Failed to upload image to S3: ${(error as Error).message}`);
    }
  } else {
    // Fallback: local public/uploads directory
    console.warn("S3 credentials not found in env. Falling back to local public/uploads.");
    const localDir = join(process.cwd(), "apps", "web", "public", "uploads", "products");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(localDir, { recursive: true });
    
    const localPath = join(localDir, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
    await writeFile(localPath, buffer);
    
    // Return relative URL for Next.js to serve
    return localPath.split("apps/web/public")[1] || `/uploads/products/${localPath.split("/").pop()}`;
  }
}
