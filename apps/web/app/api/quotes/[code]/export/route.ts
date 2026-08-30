import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { canAccessCommercialRecord } from "../../../../../lib/commercial-access";
import { getQuoteByTrackingCode } from "../../../../../lib/commercial-repository";
import { getCurrentCustomer } from "../../../../../lib/customer-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params;
  const [quote, customer] = await Promise.all([getQuoteByTrackingCode(code), getCurrentCustomer()]);
  if (!quote || !canAccessCommercialRecord(quote, customer)) return Response.json({ error: "Teklif bulunamadı." }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const body = format === "xlsx" ? await buildWorkbook(quote) : await buildPdf(quote);
  const responseBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new Response(responseBody, {
    headers: {
      "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFileName(quote.quoteNo)}-rev${quote.revisionNumber || 0}.${format}"`,
      "Cache-Control": "private, no-store"
    }
  });
}

async function buildWorkbook(quote: NonNullable<Awaited<ReturnType<typeof getQuoteByTrackingCode>>>): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ENTAŞBURADA";
  const sheet = workbook.addWorksheet("Teklif");
  sheet.addRow(["ENTAŞBURADA TEKLİF", quote.quoteNo, `Revizyon ${quote.revisionNumber || 0}`]);
  sheet.addRow(["Firma", quote.companyName]);
  sheet.addRow(["Proje", quote.projectName, quote.projectCode]);
  sheet.addRow(["Geçerlilik", new Date(quote.validUntil).toLocaleDateString("tr-TR")]);
  sheet.addRow([]);
  sheet.addRow(["SKU", "Ürün", "Marka", "Miktar", "Birim", "Birim fiyat", "Tutar", "Para birimi", "Müşteri kararı"]);
  for (const item of quote.items) {
    sheet.addRow([item.sku, item.productName, item.brand ?? "", item.quantity, item.unit, Number(item.quotedUnitPrice ?? 0), Number(item.lineTotal ?? 0), item.currency, decisionLabel(item.customerDecision)]);
  }
  sheet.addRow([]);
  sheet.addRow(["TOPLAM", "", "", "", "", "", Number(quote.totalAmount), quote.currency]);
  sheet.columns = [{ width: 18 }, { width: 42 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 18 }];
  sheet.getRow(1).font = { bold: true, size: 16 };
  sheet.getRow(6).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

async function buildPdf(quote: NonNullable<Awaited<ReturnType<typeof getQuoteByTrackingCode>>>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const write = (text: string, options: { bold?: boolean; size?: number; x?: number; color?: ReturnType<typeof rgb> } = {}) => {
    if (y < 70) { page = pdf.addPage([595, 842]); y = 790; }
    page.drawText(pdfSafe(text), { x: options.x ?? 42, y, size: options.size ?? 10, font: options.bold ? bold : regular, color: options.color ?? rgb(0.08, 0.19, 0.16) });
    y -= (options.size ?? 10) + 8;
  };
  write("ENTASBURADA B2B TEKLIF", { bold: true, size: 18 });
  write(`${quote.quoteNo} / Revizyon ${quote.revisionNumber || 0}`, { bold: true, size: 13, color: rgb(0.9, 0.32, 0.08) });
  write(`Firma: ${quote.companyName}`);
  write(`Yetkili: ${quote.authorizedPerson}`);
  write(`Proje: ${quote.projectName || "-"} ${quote.projectCode ? `(${quote.projectCode})` : ""}`);
  write(`Gecerlilik: ${new Date(quote.validUntil).toLocaleDateString("tr-TR")}`);
  write(`Sevkiyat: ${quote.allowPartialShipment ? "Kismi sevkiyata uygun" : "Tek sevkiyat"}`);
  y -= 10;
  write("URUN SATIRLARI", { bold: true, size: 12 });
  quote.items.forEach((item, index) => {
    write(`${index + 1}. ${item.productName}`, { bold: true });
    write(`${item.sku} | ${item.quantity} ${item.unit} | ${item.quotedUnitPrice ?? "-"} ${item.currency} | ${item.lineTotal ?? "-"} ${item.currency} | ${decisionLabel(item.customerDecision)}`, { size: 9, x: 52 });
  });
  y -= 8;
  write(`TOPLAM: ${quote.totalAmount} ${quote.currency}`, { bold: true, size: 15, color: rgb(0.9, 0.32, 0.08) });
  if (quote.messages[0]?.body) write(`Not: ${quote.messages[0].body}`, { size: 9 });
  return pdf.save();
}

function decisionLabel(value?: string) { return value === "ACCEPTED" ? "Kabul" : value === "REJECTED" ? "Red" : "Bekliyor"; }
function safeFileName(value: string) { return value.replace(/[^a-zA-Z0-9_-]+/g, "-"); }
function pdfSafe(value: string) {
  return value.replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g").replace(/[ıİ]/g, "i").replace(/[öÖ]/g, "o").replace(/[şŞ]/g, "s").replace(/[üÜ]/g, "u").slice(0, 170);
}
