import "server-only";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

/** Cross-process exclusion for the shared JSON commercial store. Never steals a live lock. */
export async function withCommercialFileLock<T>(
  dataDir: string,
  mutation: () => Promise<T>,
): Promise<T> {
  await mkdir(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, "commercial-mutation.lock");
  const deadline = Date.now() + 10_000;
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() >= deadline)
        throw new Error(
          "Sipariş deposu meşgul. Lütfen tekrar deneyin; sorun sürerse yöneticinize bildirin.",
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
      continue;
    }
    try {
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      );
      return await mutation();
    } finally {
      await handle.close();
      await unlink(lockPath);
    }
  }
}
