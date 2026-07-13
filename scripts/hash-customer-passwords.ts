import { randomBytes, scryptSync } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

interface CustomerRecord {
  id: string;
  email: string;
  password: string;
  [key: string]: unknown;
}

const rootDir = path.resolve(import.meta.dirname, "..");
const customersPath = path.join(rootDir, "data", "customer-accounts.json");

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function main(): Promise<void> {
  const customers = JSON.parse(await readFile(customersPath, "utf8")) as CustomerRecord[];
  let migrated = 0;

  const next = customers.map((customer) => {
    if (typeof customer.password === "string" && customer.password && !customer.password.startsWith("scrypt$")) {
      migrated += 1;
      return { ...customer, password: hashPassword(customer.password) };
    }
    return customer;
  });

  if (migrated === 0) {
    console.log("Tüm şifreler zaten hashli; değişiklik yok.");
    return;
  }

  const tmpPath = `${customersPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(next, null, 2)}\n`);
  await rename(tmpPath, customersPath);
  console.log(`${migrated} hesap şifresi scrypt ile hashlendi.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
