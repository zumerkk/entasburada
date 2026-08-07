import { SaxesParser } from "saxes";
import { z } from "zod";

export const importedProductRowSchema = z.object({
  externalId: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(160).optional(),
  name: z.string().trim().min(1).max(300),
  brandName: z.string().trim().max(160).optional(),
  barcode: z.string().trim().max(80).optional(),
  manufacturerCode: z.string().trim().max(160).optional(),
  description: z.string().trim().max(10_000).optional(),
  unitType: z.string().trim().max(40).optional(),
  taxRate: z.string().regex(/^\d+([.,]\d+)?$/).optional(),
  currency: z.string().trim().max(8).optional(),
  quantity: z.string().regex(/^-?\d+([.,]\d+)?$/).optional(),
  imageUrl: z.string().url().max(2_048).optional(),
  sourceUrl: z.string().url().max(2_048).optional(),
  externalCategoryId: z.string().trim().max(160).optional(),
  categoryPath: z.array(z.string().trim().max(160)).max(10).optional(),
  categoryName: z.string().trim().max(160).optional(),
  listPrice: z.string().regex(/^\d+([.,]\d+)?$/).optional()
}).strict();

export type ImportedProductRow = z.infer<typeof importedProductRowSchema>;

export interface ImportIssue {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ImportPreview {
  totalRows: number;
  acceptedRows: ImportedProductRow[];
  issues: ImportIssue[];
  truncated: boolean;
}

export interface StreamProductXmlOptions {
  recordTags?: string[];
  previewLimit?: number;
}

export interface StreamProductXmlHandlers {
  onRow(row: ImportedProductRow, rowNumber: number): void | Promise<void>;
  onIssue?(issue: ImportIssue): void | Promise<void>;
}

const DEFAULT_RECORD_TAGS = new Set(["urun", "product", "item", "stok"]);

export function decodeXmlBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer);
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return decodeUtf16BigEndian(buffer.subarray(2));
  }

  const probe = buffer.subarray(0, Math.min(buffer.length, 200));
  let oddNulls = 0;
  let evenNulls = 0;

  for (let index = 0; index < probe.length; index += 1) {
    if (probe[index] === 0) {
      if (index % 2 === 0) {
        evenNulls += 1;
      } else {
        oddNulls += 1;
      }
    }
  }

  if (oddNulls > 20 && oddNulls > evenNulls * 2) {
    return new TextDecoder("utf-16le").decode(buffer);
  }

  if (evenNulls > 20 && evenNulls > oddNulls * 2) {
    return decodeUtf16BigEndian(buffer);
  }

  return new TextDecoder("utf-8").decode(buffer);
}

export async function parseProductXmlBufferPreview(
  buffer: Buffer,
  options: StreamProductXmlOptions = {}
): Promise<ImportPreview> {
  const decoded = decodeXmlBuffer(buffer);
  if (/<!DOCTYPE|<!ENTITY/i.test(decoded.slice(0, 64 * 1024))) {
    throw new Error("DTD ve XML entity tanımları güvenlik nedeniyle desteklenmez.");
  }
  return parseProductXmlPreview(toSingleChunk(decoded), options);
}

export async function parseProductXmlPreview(
  chunks: AsyncIterable<string | Buffer>,
  options: StreamProductXmlOptions = {}
): Promise<ImportPreview> {
  const acceptedRows: ImportedProductRow[] = [];
  const issues: ImportIssue[] = [];
  const previewLimit = options.previewLimit ?? 50;

  let totalRows = 0;

  await streamProductXml(chunks, {
    ...options,
    onRow(row) {
      totalRows += 1;
      if (acceptedRows.length < previewLimit) {
        acceptedRows.push(row);
      }
    },
    onIssue(issue) {
      totalRows = Math.max(totalRows, issue.rowNumber);
      issues.push(issue);
    }
  });

  return {
    totalRows,
    acceptedRows,
    issues,
    truncated: acceptedRows.length < totalRows
  };
}

export async function streamProductXml(
  chunks: AsyncIterable<string | Buffer>,
  handlers: StreamProductXmlHandlers & StreamProductXmlOptions
): Promise<void> {
  const recordTags = new Set(handlers.recordTags ?? DEFAULT_RECORD_TAGS);
  const parser = new SaxesParser({ xmlns: false });

  let rowNumber = 0;
  let currentRecord: Record<string, string> | null = null;
  let currentElement: string | null = null;
  const pendingTasks: Array<Promise<void>> = [];

  parser.on("opentag", (node) => {
    const name = normalizeName(node.name);

    if (recordTags.has(name)) {
      currentRecord = {};
      currentElement = null;
      return;
    }

    if (currentRecord) {
      currentElement = name;
      currentRecord[currentElement] = currentRecord[currentElement] ?? "";
    }
  });

  parser.on("text", (text) => {
    appendCurrentText(text);
  });

  parser.on("cdata", (text) => {
    appendCurrentText(text);
  });

  function appendCurrentText(text: string): void {
    if (currentRecord && currentElement) {
      currentRecord[currentElement] = `${currentRecord[currentElement] ?? ""}${text}`.trim();
    }
  }

  parser.on("closetag", (tag) => {
    const name = typeof tag === "string" ? normalizeName(tag) : normalizeName(tag.name);

    if (currentRecord && recordTags.has(name)) {
      rowNumber += 1;
      const mapped = mapXmlRecord(currentRecord);
      const parsed = importedProductRowSchema.safeParse(mapped);

      if (parsed.success) {
        const task = Promise.resolve(handlers.onRow(parsed.data, rowNumber));
        pendingTasks.push(task);
      } else {
        const field = parsed.error.issues[0]?.path.join(".");
        const issue: ImportIssue = {
          rowNumber,
          message: parsed.error.issues[0]?.message ?? "Satır doğrulanamadı."
        };
        if (field) {
          issue.field = field;
        }
        const task = Promise.resolve(handlers.onIssue?.(issue));
        pendingTasks.push(task);
      }

      currentRecord = null;
      currentElement = null;
      return;
    }

    if (currentElement === name) {
      currentElement = null;
    }
  });

  for await (const chunk of chunks) {
    parser.write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  parser.close();
  await Promise.all(pendingTasks);
}

export function mapXmlRecord(record: Record<string, string>): Partial<ImportedProductRow> {
  const categoryPath = [first(record, ["kategori1", "category1"]), first(record, ["kategori2", "category2"]), first(record, ["kategori", "category", "category_name"])]
    .map((value) => value.trim())
    .filter(Boolean);

  return stripUndefined({
    externalId: first(record, ["id", "kod", "sku", "external_id", "externalid"]),
    sku: optional(first(record, ["kod", "sku"])),
    name: first(record, ["isim", "adi", "name", "product_name", "productname"]),
    brandName: optional(first(record, ["marka", "brand", "brand_name"])),
    barcode: optional(first(record, ["barkod", "barcode"])),
    manufacturerCode: optional(first(record, ["ureticikodu", "manufacturer_code", "manufacturer_code"])),
    description: optional(first(record, ["aciklama", "description"])),
    unitType: optional(first(record, ["birim", "unit", "unit_type"])),
    taxRate: optional(first(record, ["kdvorani", "tax_rate", "taxrate"]))?.replace(",", "."),
    currency: optional(first(record, ["doviz", "currency"])),
    quantity: optional(first(record, ["miktar", "quantity", "stock", "stock_quantity"]))?.replace(",", "."),
    imageUrl: optional(first(record, ["resim", "image", "image_url", "imageurl"])),
    sourceUrl: optional(first(record, ["url", "source_url", "sourceurl"])),
    externalCategoryId: optional(first(record, ["kategori_id", "category_id", "categoryid"])),
    categoryPath: categoryPath.length ? categoryPath : undefined,
    categoryName: optional(first(record, ["kategori2", "kategori1", "kategori", "category", "category_name"])),
    listPrice: optional(first(record, ["fiyat", "price", "list_price", "listprice"]))?.replace(",", ".")
  });
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("tr-TR").replace(/-/g, "_");
}

function first(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value != null && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function optional(value: string): string | undefined {
  return value.trim() === "" ? undefined : value.trim();
}

async function* toSingleChunk(value: string): AsyncIterable<string> {
  yield value;
}

function decodeUtf16BigEndian(buffer: Buffer): string {
  const swapped = Buffer.allocUnsafe(buffer.length);
  for (let index = 0; index < buffer.length; index += 2) {
    swapped[index] = buffer[index + 1] ?? 0;
    swapped[index + 1] = buffer[index] ?? 0;
  }

  return new TextDecoder("utf-16le").decode(swapped);
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
