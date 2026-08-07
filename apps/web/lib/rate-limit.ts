import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  version: 1;
  entries: Record<string, RateLimitEntry>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const rootDir = findWorkspaceRoot(process.cwd());
const storePath = path.join(rootDir, "data", "security-rate-limits.json");
const lockPath = `${storePath}.lock`;
let mutationQueue: Promise<void> = Promise.resolve();

export async function consumeRateLimit(
  scope: string,
  identity: string,
  options: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  let result: RateLimitResult = { allowed: false, retryAfterSeconds: Math.ceil(options.windowMs / 1000) };
  const operation = mutationQueue.then(async () => {
    result = await withFileLock(async () => {
      const now = Date.now();
      const store = await readStore();
      const entries = Object.fromEntries(
        Object.entries(store.entries)
          .filter(([, entry]) => entry.resetAt > now)
          .sort(([, left], [, right]) => right.resetAt - left.resetAt)
          .slice(0, 5_000)
      );
      const key = `${safeScope(scope)}:${digestIdentity(identity)}`;
      const existing = entries[key];
      const entry = existing && existing.resetAt > now
        ? { count: existing.count + 1, resetAt: existing.resetAt }
        : { count: 1, resetAt: now + options.windowMs };
      entries[key] = entry;
      await writeStore({ version: 1, entries });
      return {
        allowed: entry.count <= options.limit,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      };
    });
  });
  mutationQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

export async function clearRateLimit(scope: string, identity: string): Promise<void> {
  const operation = mutationQueue.then(() => withFileLock(async () => {
    const store = await readStore();
    delete store.entries[`${safeScope(scope)}:${digestIdentity(identity)}`];
    await writeStore(store);
  }));
  mutationQueue = operation.catch(() => undefined);
  await operation;
}

async function withFileLock<T>(callback: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${process.pid}\t${token}\t${Date.now()}\n`);
      await handle.close();
      try {
        return await callback();
      } finally {
        const current = await readFile(lockPath, "utf8").catch(() => "");
        if (current.includes(`\t${token}\t`)) await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      const lock = await readFile(lockPath, "utf8").catch(() => "");
      const createdAt = Number(lock.trim().split("\t")[2]);
      if (Number.isFinite(createdAt) && Date.now() - createdAt > 30_000) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("Güvenlik hız sınırı deposuna erişilemiyor; istek güvenli biçimde reddedildi.");
}

async function readStore(): Promise<RateLimitStore> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as Partial<RateLimitStore>;
    return parsed.version === 1 && parsed.entries && typeof parsed.entries === "object"
      ? { version: 1, entries: parsed.entries }
      : { version: 1, entries: {} };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return { version: 1, entries: {} };
    throw error;
  }
}

async function writeStore(store: RateLimitStore): Promise<void> {
  const temporaryPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store)}\n`, { mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function digestIdentity(identity: string): string {
  return createHash("sha256").update(identity.trim().toLowerCase()).digest("base64url");
}

function safeScope(scope: string): string {
  return scope.replace(/[^a-z0-9:_-]/gi, "_").slice(0, 64);
}

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (
      existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      existsSync(path.join(current, "data", "catalog-store.json"))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}
