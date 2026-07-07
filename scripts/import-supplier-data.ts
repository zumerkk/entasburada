import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseProductXmlBufferPreview, type ImportedProductRow } from "@entas/import-engine";

interface SupplierSource {
  key: string;
  name: string;
  defaultBrand?: string;
  prefix: string;
  path: string;
  url?: string;
}

interface NormalizedSupplierProduct {
  sourceKey: string;
  sourceName: string;
  externalId: string;
  sku: string;
  barcode?: string;
  manufacturerCode?: string;
  productName: string;
  brandName: string;
  categoryPath: string[];
  categoryName?: string;
  unitType: string;
  taxRate: string;
  currency: string;
  listPrice: string;
  stockQuantity: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock" | "incoming";
  imageUrl?: string;
  sourceUrl?: string;
  priceVisibleToPublic: false;
}

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "data", "import-sources");
const resultDir = path.join(rootDir, "data", "import-results");

const sources: SupplierSource[] = [
  {
    key: "mirsan-efiyat",
    name: "Mirsan EFIYAT XML",
    defaultBrand: "MRSMAX",
    prefix: "MIR",
    path: path.join(sourceDir, "EFIYATkopyasi.xml")
  },
  {
    key: "euromix-stock",
    name: "EuroMix Stok XML",
    defaultBrand: "EUROMIX",
    prefix: "EMX",
    path: path.join(sourceDir, "EuromixStoklar.xml"),
    url: "https://bayi.euro-mix.com.tr/C79BE2D9-04CE-4B5B-A51C-7E8F78E25FE3/EuromixStoklar.xml"
  }
];

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await mkdir(sourceDir, { recursive: true });
  await mkdir(resultDir, { recursive: true });

  const products: NormalizedSupplierProduct[] = [];
  const sourceReports = [];

  for (const source of sources) {
    if (source.url) {
      await downloadSource(source.url, source.path);
    }

    const buffer = await readFile(source.path);
    const preview = await parseProductXmlBufferPreview(buffer, { previewLimit: Number.MAX_SAFE_INTEGER });
    const normalizedRows = preview.acceptedRows.map((row) => normalizeRow(row, source));

    products.push(...normalizedRows);
    sourceReports.push({
      key: source.key,
      name: source.name,
      path: path.relative(rootDir, source.path),
      url: source.url,
      totalRows: preview.totalRows,
      acceptedRows: preview.acceptedRows.length,
      issueCount: preview.issues.length,
      issues: preview.issues.slice(0, 50)
    });
  }

  const duplicateSkuMap = groupDuplicates(products.map((product) => product.sku).filter(Boolean));
  const duplicateBarcodeMap = groupDuplicates(products.map((product) => product.barcode).filter(Boolean) as string[]);

  const report = {
    generatedAt: new Date().toISOString(),
    sources: sourceReports,
    totals: {
      products: products.length,
      inStock: products.filter((product) => product.stockStatus === "in_stock").length,
      lowStock: products.filter((product) => product.stockStatus === "low_stock").length,
      outOfStock: products.filter((product) => product.stockStatus === "out_of_stock").length,
      pricedRows: products.filter((product) => Number(product.listPrice) > 0).length,
      zeroPriceRows: products.filter((product) => Number(product.listPrice) === 0).length,
      duplicateSkuCount: duplicateSkuMap.length,
      duplicateBarcodeCount: duplicateBarcodeMap.length
    },
    duplicateSkus: duplicateSkuMap.slice(0, 100),
    duplicateBarcodes: duplicateBarcodeMap.slice(0, 100)
  };

  await writeFile(path.join(resultDir, "supplier-products.json"), `${JSON.stringify(products, null, 2)}\n`);
  await writeFile(path.join(resultDir, "import-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(resultDir, "supplier-products.csv"), toCsv(products));

  console.log(JSON.stringify(report, null, 2));
}

async function downloadSource(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} indirilemedi: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
}

function normalizeRow(row: ImportedProductRow, source: SupplierSource): NormalizedSupplierProduct {
  const sku = sanitizeSku(row.sku ?? row.externalId, source.prefix);
  const quantity = toNumber(row.quantity ?? "0");
  const categoryPath = row.categoryPath?.length ? row.categoryPath : row.categoryName ? [row.categoryName] : ["Genel"];

  return stripUndefined({
    sourceKey: source.key,
    sourceName: source.name,
    externalId: row.externalId,
    sku,
    barcode: row.barcode,
    manufacturerCode: row.manufacturerCode,
    productName: row.name,
    brandName: normalizeText(row.brandName ?? source.defaultBrand ?? "MARKASIZ"),
    categoryPath: categoryPath.map(normalizeText),
    categoryName: normalizeText(row.categoryName ?? categoryPath.at(-1) ?? "Genel"),
    unitType: normalizeText(row.unitType ?? "ADET"),
    taxRate: row.taxRate ?? "20.00",
    currency: normalizeText(row.currency ?? "TRY"),
    listPrice: normalizeMoney(row.listPrice ?? "0"),
    stockQuantity: quantity,
    stockStatus: getStockStatus(quantity),
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    priceVisibleToPublic: false as const
  }) as NormalizedSupplierProduct;
}

function sanitizeSku(value: string, prefix: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean === "" ? `${prefix}-${crypto.randomUUID()}` : clean;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeMoney(value: string): string {
  const parsed = toNumber(value);
  return parsed.toFixed(4);
}

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStockStatus(quantity: number): NormalizedSupplierProduct["stockStatus"] {
  if (quantity <= 0) {
    return "out_of_stock";
  }

  if (quantity <= 10) {
    return "low_stock";
  }

  return "in_stock";
}

function groupDuplicates(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

function toCsv(rows: NormalizedSupplierProduct[]): string {
  const headers = [
    "sourceKey",
    "sku",
    "barcode",
    "productName",
    "brandName",
    "categoryName",
    "unitType",
    "taxRate",
    "currency",
    "listPrice",
    "stockQuantity",
    "stockStatus",
    "imageUrl"
  ];

  const lines = rows.map((row) => headers.map((header) => csvCell(row[header as keyof NormalizedSupplierProduct])).join(","));
  return `${headers.join(",")}\n${lines.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  if (Array.isArray(value)) {
    return csvCell(value.join(" > "));
  }

  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
