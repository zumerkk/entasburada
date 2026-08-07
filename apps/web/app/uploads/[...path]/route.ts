import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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
  ".mp4": "video/mp4",
  ".pdf": "application/pdf"
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path: segments } = await context.params;
  const relative = path.normalize((segments ?? []).join("/"));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.includes("\0")) {
    return new Response(null, { status: 404 });
  }

  const candidatePath = path.resolve(uploadsRoot, relative);
  if (!candidatePath.startsWith(`${path.resolve(uploadsRoot)}${path.sep}`)) {
    return new Response(null, { status: 404 });
  }

  let filePath: string;
  let fileStat;
  try {
    const [realRoot, realFile] = await Promise.all([realpath(uploadsRoot), realpath(candidatePath)]);
    if (!realFile.startsWith(`${realRoot}${path.sep}`)) return new Response(null, { status: 404 });
    filePath = realFile;
    fileStat = await stat(filePath);
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!fileStat.isFile()) return new Response(null, { status: 404 });

  const contentType = contentTypes[path.extname(filePath).toLowerCase()];
  if (!contentType) {
    return new Response(null, { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": contentType,
      "content-length": String(fileStat.size),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      ...(contentType === "application/pdf"
        ? {
            "content-disposition": `attachment; filename="${path.basename(filePath).replace(/[^A-Za-z0-9._-]/g, "_")}"`,
            "content-security-policy": "default-src 'none'; sandbox"
          }
        : {})
    }
  });
}
