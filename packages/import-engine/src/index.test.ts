import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { parseProductXmlBufferPreview, parseProductXmlPreview } from "./index";

describe("parseProductXmlPreview", () => {
  it("maps the supplier XML fields used in the brief", async () => {
    const xml = `
      <root>
        <urun>
          <id>EXT-1</id>
          <isim>18V Darbeli Matkap</isim>
          <marka>Proline</marka>
          <resim>https://cdn.example.com/matkap.jpg</resim>
          <url>https://supplier.example.com/p/ext-1</url>
          <kategori_id>42</kategori_id>
          <kategori>Elektrikli El Aletleri</kategori>
          <fiyat>1249,90</fiyat>
        </urun>
      </root>`;

    const preview = await parseProductXmlPreview(Readable.from([xml]));

    expect(preview.totalRows).toBe(1);
    expect(preview.issues).toHaveLength(0);
    expect(preview.acceptedRows[0]).toEqual(expect.objectContaining({
      externalId: "EXT-1",
      name: "18V Darbeli Matkap",
      brandName: "Proline",
      imageUrl: "https://cdn.example.com/matkap.jpg",
      sourceUrl: "https://supplier.example.com/p/ext-1",
      externalCategoryId: "42",
      categoryName: "Elektrikli El Aletleri",
      categoryPath: ["Elektrikli El Aletleri"],
      listPrice: "1249.90"
    }));
  });

  it("returns row-level issues without stopping the import preview", async () => {
    const xml = `
      <root>
        <urun><id></id><isim></isim><fiyat>abc</fiyat></urun>
        <urun><id>EXT-2</id><isim>Kesme Taşı</isim><fiyat>19.90</fiyat></urun>
      </root>`;

    const preview = await parseProductXmlPreview(Readable.from([xml]));

    expect(preview.totalRows).toBe(2);
    expect(preview.issues[0]?.rowNumber).toBe(1);
    expect(preview.acceptedRows[0]?.externalId).toBe("EXT-2");
  });

  it("detects UTF-16 EuroMix stock XML and maps stock fields", async () => {
    const xml = `<?xml version="1.0"?><rss><Stoklar><Stok><Kod>RBT 007</Kod><Adi>BORAL BLACK WHITE TEPE DUŞ SETİ</Adi><Marka>EUROMIX</Marka><Kategori1>DUŞ TAKIMLARI</Kategori1><Kategori2>ROBOT DUŞAR</Kategori2><UreticiKodu>DCWBT01</UreticiKodu><Barkod>1234590936916</Barkod><Aciklama></Aciklama><Birim>ADET</Birim><KdvOrani>20.00</KdvOrani><Doviz>USD</Doviz><Fiyat>54.7500</Fiyat><Miktar>11</Miktar><Resim>https://bayi.euro-mix.com.tr/Content/img/Stokpic/Normal/7546.png</Resim></Stok></Stoklar></rss>`;
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]);

    const preview = await parseProductXmlBufferPreview(buffer);

    expect(preview.totalRows).toBe(1);
    expect(preview.acceptedRows[0]).toEqual(expect.objectContaining({
      externalId: "RBT 007",
      sku: "RBT 007",
      name: "BORAL BLACK WHITE TEPE DUŞ SETİ",
      brandName: "EUROMIX",
      barcode: "1234590936916",
      manufacturerCode: "DCWBT01",
      unitType: "ADET",
      taxRate: "20.00",
      currency: "USD",
      quantity: "11",
      categoryName: "ROBOT DUŞAR",
      categoryPath: ["DUŞ TAKIMLARI", "ROBOT DUŞAR"],
      listPrice: "54.7500"
    }));
  });
});
