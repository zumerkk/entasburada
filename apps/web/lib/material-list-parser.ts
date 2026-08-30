import ExcelJS from "exceljs";

export interface MaterialListRow {
  sku: string;
  productName: string;
  quantity: number;
  unit: string;
  targetPrice: string;
  note: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 1_000;

export async function parseMaterialListFile(file: File): Promise<MaterialListRow[]> {
  if (file.size === 0) return [];
  if (file.size > MAX_FILE_SIZE) throw new Error("Malzeme listesi en fazla 5 MB olabilir.");

  const extension = file.name.toLocaleLowerCase("tr-TR").split(".").pop() ?? "";
  if (extension === "xlsx") {
    return parseWorkbook(Buffer.from(await file.arrayBuffer()));
  }
  if (["csv", "tsv", "txt"].includes(extension) || file.type.startsWith("text/")) {
    return parseDelimitedMaterialList(await file.text());
  }
  throw new Error("Yalnızca XLSX, CSV veya TSV malzeme listesi yükleyebilirsiniz.");
}

export function parseDelimitedMaterialList(text: string): MaterialListRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines[0] ?? "");
  return normalizeTable(lines.map((line) => splitDelimitedLine(line, delimiter)));
}

async function parseWorkbook(buffer: Buffer): Promise<MaterialListRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const table: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (table.length >= MAX_ROWS + 1) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cells[columnNumber - 1] = cellText(cell.value);
    });
    table.push(cells);
  });
  return normalizeTable(table);
}

function normalizeTable(table: string[][]): MaterialListRow[] {
  if (table.length === 0) return [];
  const first = (table[0] ?? []).map(normalizeHeader);
  const hasHeader = first.some((cell) => ["sku", "urun", "urun adi", "adet", "quantity", "miktar", "malzeme kodu"].includes(cell));
  const indexOf = (names: string[], fallback: number) => {
    const index = first.findIndex((cell) => names.includes(cell));
    return index === -1 ? fallback : index;
  };
  const skuIndex = hasHeader ? indexOf(["sku", "kod", "urun kodu", "malzeme kodu", "stok kodu", "barkod"], 0) : 0;
  const nameIndex = hasHeader ? indexOf(["urun", "urun adi", "malzeme", "malzeme adi", "product"], 1) : 1;
  const quantityIndex = hasHeader ? indexOf(["adet", "miktar", "quantity", "qty"], 2) : 2;
  const unitIndex = hasHeader ? indexOf(["birim", "unit"], 3) : 3;
  const priceIndex = hasHeader ? indexOf(["hedef fiyat", "target price", "fiyat"], 4) : 4;
  const noteIndex = hasHeader ? indexOf(["not", "aciklama", "description"], 5) : 5;

  return (hasHeader ? table.slice(1) : table)
    .slice(0, MAX_ROWS)
    .map((cells) => ({
      sku: clean(cells[skuIndex]),
      productName: clean(cells[nameIndex]),
      quantity: normalizeQuantity(cells[quantityIndex]),
      unit: clean(cells[unitIndex]) || "Adet",
      targetPrice: clean(cells[priceIndex]),
      note: clean(cells[noteIndex])
    }))
    .filter((row) => row.sku || row.productName);
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    if (char === '"' && line[index + 1] === '"' && quoted) {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells.slice(0, 30);
}

function detectDelimiter(line: string): string {
  const candidates = ["\t", ";", ","];
  return candidates.sort((left, right) => line.split(right).length - line.split(left).length)[0] ?? ",";
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

function normalizeHeader(value: string): string {
  return clean(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ı]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeQuantity(value: unknown): number {
  const parsed = Number(String(value ?? "1").replace(",", "."));
  return Number.isFinite(parsed) ? Math.min(999_999, Math.max(1, Math.trunc(parsed))) : 1;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}
