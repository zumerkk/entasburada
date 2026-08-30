import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseDelimitedMaterialList, parseMaterialListFile } from "./material-list-parser";

describe("malzeme listesi ayrıştırma", () => {
  it("Türkçe CSV başlıklarını, miktarı ve birimi okur", () => {
    const rows = parseDelimitedMaterialList([
      "Malzeme Kodu;Ürün Adı;Miktar;Birim;Hedef Fiyat;Not",
      "SKU-100;Paslanmaz fleks hortum;12;Adet;149,90;Acil"
    ].join("\n"));

    expect(rows).toEqual([{
      sku: "SKU-100",
      productName: "Paslanmaz fleks hortum",
      quantity: 12,
      unit: "Adet",
      targetPrice: "149,90",
      note: "Acil"
    }]);
  });

  it("tırnak içindeki ayırıcıları ve çift tırnakları korur", () => {
    const [row] = parseDelimitedMaterialList([
      "sku,ürün adı,adet,birim,hedef fiyat,not",
      'SKU-200,"1/2 flex, örgülü",3,Metre,250,"Saha ""A"" için"'
    ].join("\n"));

    expect(row?.productName).toBe("1/2 flex, örgülü");
    expect(row?.note).toBe('Saha "A" için');
    expect(row?.quantity).toBe(3);
  });

  it("başlıksız satırlarda varsayılan kolon sırasını ve güvenli miktarı kullanır", () => {
    const rows = parseDelimitedMaterialList("SKU-300\tBatarya\t0\t\t\t");

    expect(rows[0]).toMatchObject({
      sku: "SKU-300",
      productName: "Batarya",
      quantity: 1,
      unit: "Adet"
    });
  });

  it("XLSX çalışma kitabının ilk sayfasını okur", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Malzemeler");
    sheet.addRow(["SKU", "Ürün Adı", "Adet", "Birim"]);
    sheet.addRow(["SKU-XLSX", "PPRC dirsek 25 mm", 24, "Adet"]);
    const workbookBuffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(workbookBuffer as ArrayBuffer);
    const file = {
      name: "malzeme-listesi.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
      text: async () => ""
    } as File;

    await expect(parseMaterialListFile(file)).resolves.toEqual([{
      sku: "SKU-XLSX",
      productName: "PPRC dirsek 25 mm",
      quantity: 24,
      unit: "Adet",
      targetPrice: "",
      note: ""
    }]);
  });
});
