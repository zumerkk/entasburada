import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_IMAGE_CANVAS_SIZE,
  normalizeProductImage,
  readProductImageMetadata
} from "../apps/web/lib/product-image-normalizer";

interface MigrationFailure {
  file: string;
  error: string;
}

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const writeChanges = args.includes("--write");
const force = args.includes("--force");
const rootDir = path.resolve(readOption("--root") ?? path.join(workspaceRoot, "apps/web/public/uploads/catalog-imports"));
const backupDirValue = readOption("--backup-dir");
const backupDir = backupDirValue ? path.resolve(backupDirValue) : null;
const catalogStoreValue = readOption("--catalog-store");
const catalogStorePath = catalogStoreValue ? path.resolve(catalogStoreValue) : null;
const reportPathValue = readOption("--report");
const reportPath = reportPathValue ? path.resolve(reportPathValue) : null;
const concurrency = clamp(Number(readOption("--concurrency") ?? "4"), 1, 12);

async function main(): Promise<void> {
  if (!existsSync(rootDir)) {
    throw new Error(`Image root does not exist: ${rootDir}`);
  }

  const files = catalogStorePath ? await collectReferencedProductImages(rootDir, catalogStorePath) : await collectProductImages(rootDir);
  let cursor = 0;
  let normalized = 0;
  let skipped = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;
  const failures: MigrationFailure[] = [];
  const startedAt = Date.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const filePath = files[index]!;
      const relativePath = path.relative(rootDir, filePath);

      try {
        const fileStat = await stat(filePath);
        const metadata = await readProductImageMetadata(filePath);
        bytesBefore += fileStat.size;

        if (!force && metadata.format === "webp" && metadata.width === PRODUCT_IMAGE_CANVAS_SIZE && metadata.height === PRODUCT_IMAGE_CANVAS_SIZE) {
          skipped += 1;
          bytesAfter += fileStat.size;
          continue;
        }

        if (writeChanges) {
          if (backupDir) await backupOriginal(filePath, relativePath, backupDir);
          const source = await readFile(filePath);
          const result = await normalizeProductImage(source);
          const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
          await writeFile(temporaryPath, result.buffer);
          await rename(temporaryPath, filePath);
          bytesAfter += result.buffer.length;
        } else {
          bytesAfter += fileStat.size;
        }

        normalized += 1;
        if (writeChanges && normalized % 100 === 0) {
          console.error(`[product-images] ${normalized}/${files.length} normalized`);
        }
      } catch (error) {
        failures.push({ file: relativePath, error: error instanceof Error ? error.message : "Unknown image error" });
      }
    }
  });

  await Promise.all(workers);
  const report = {
    ok: failures.length === 0,
    mode: writeChanges ? "write" : "dry-run",
    rootDir,
    backupDir,
    catalogStorePath,
    selection: catalogStorePath ? "catalog-references" : "all-product-images",
    scanned: files.length,
    normalized,
    skipped,
    failed: failures.length,
    canvas: `${PRODUCT_IMAGE_CANVAS_SIZE}x${PRODUCT_IMAGE_CANVAS_SIZE}`,
    bytesBefore,
    bytesAfter,
    durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
    failures: failures.slice(0, 50)
  };

  if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

async function collectReferencedProductImages(imageRoot: string, storePath: string): Promise<string[]> {
  const store = JSON.parse(await readFile(storePath, "utf8")) as { products?: Array<{ imageUrl?: string }> };
  const files = new Set<string>();
  for (const product of store.products ?? []) {
    const imageUrl = product.imageUrl?.split("?", 1)[0] ?? "";
    const prefix = "/uploads/catalog-imports/";
    if (!imageUrl.startsWith(prefix)) continue;
    const candidate = path.resolve(imageRoot, imageUrl.slice(prefix.length));
    if (candidate.startsWith(`${imageRoot}${path.sep}`) && existsSync(candidate)) files.add(candidate);
  }
  return [...files].sort((left, right) => left.localeCompare(right));
}

async function collectProductImages(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectProductImages(fullPath)));
      continue;
    }
    if (path.basename(path.dirname(fullPath)) === "products" && /\.(?:webp|png|jpe?g)$/i.test(entry.name) && !entry.name.includes(".tmp")) {
      files.push(fullPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function backupOriginal(filePath: string, relativePath: string, destinationRoot: string): Promise<void> {
  const destination = path.join(destinationRoot, relativePath);
  if (existsSync(destination)) return;
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(filePath, destination);
}

function readOption(name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
