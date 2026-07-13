import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

// public/ klasoru Next tarafindan build aninda dondurulur; calisma zamaninda
// kalici diske eklenen urun gorselleri bu route ile servis edilir.
const uploadsRoot = path.join(process.cwd(), "public", "uploads");

const contentTypes: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf"
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path: segments } = await context.params;
  const relative = path.normalize((segments ?? []).join("/"));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return new Response(null, { status: 404 });
  }

  const filePath = path.join(uploadsRoot, relative);
  if (!filePath.startsWith(uploadsRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return new Response(null, { status: 404 });
  }

  const contentType = contentTypes[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    return new Response(null, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": contentType,
      "content-length": String(statSync(filePath).size),
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
