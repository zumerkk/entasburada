import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../packages/database/src";
import { inspectPdf, extractPdfPageText, renderPdfPage, extractEmbeddedPdfImages, cropCatalogProductImage } from "../apps/web/lib/pdf-catalog-tools";
import { extractCatalogPageWithAi } from "../apps/web/lib/catalog-ai-extractor";
import { uploadProductImage } from "../apps/web/lib/storage";

const prisma = new PrismaClient();
const PDF_PATH = path.join(process.cwd(), "Pdfler", "SAYIM_2026_FIYAT_LISTESI.pdf");

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`🚀 SAYIM 2026 Import Başlıyor... (Dry-Run: ${isDryRun})`);

  // 1. PDF Bilgilerini Al
  const pdfInfo = await inspectPdf(PDF_PATH);
  console.log(`📄 PDF Bilgisi: ${pdfInfo.pageCount} sayfa.`);

  const allProducts = [];
  const jobId = "sayim-2026-import";

  // İlk 3 sayfayı örnek test olarak işleyelim (Tamamını işlemek 15-20 dk sürebilir)
  const maxPagesToProcess = 3; 

  for (let pageNum = 1; pageNum <= Math.min(pdfInfo.pageCount, maxPagesToProcess); pageNum++) {
    console.log(`\n⏳ Sayfa ${pageNum}/${pdfInfo.pageCount} işleniyor...`);
    
    const pageText = await extractPdfPageText(PDF_PATH, pageNum);
    const render = await renderPdfPage(jobId, PDF_PATH, pageNum);
    const embeddedImages = await extractEmbeddedPdfImages(jobId, PDF_PATH, pageNum);
    
    const imageCandidates = embeddedImages.map((img) => ({
      index: img.index,
      region: img.region
    }));

    const extraction = await extractCatalogPageWithAi({
      imageBase64: render.imageBase64,
      coordinateImageBase64: render.coordinateImageBase64,
      pageText,
      hints: {
        fileName: "SAYIM_2026_FIYAT_LISTESI.pdf",
        pageNumber: pageNum,
        pageCount: pdfInfo.pageCount,
        sourceName: "SAYIM",
        brandHint: "SAYIM",
        imageCandidates
      }
    });

    console.log(`✨ Sayfa ${pageNum} AI Çıkarımı: ${extraction.products.length} ürün tespit edildi.`);

    for (let i = 0; i < extraction.products.length; i++) {
      const p = extraction.products[i];
      let imageUrl = null;

      // Görsel Kırpma & Yükleme
      if (p.imageRegion || p.imageCandidateIndex !== null) {
        const embedded = p.imageCandidateIndex !== null ? embeddedImages[p.imageCandidateIndex] : undefined;
        const localPath = await cropCatalogProductImage({
          jobId,
          pageNumber: pageNum,
          productIndex: i,
          pageFilePath: render.filePath,
          region: p.imageRegion,
          embeddedImage: embedded
        });

        if (localPath) {
          const buffer = await readFile(path.join(process.cwd(), "apps", "web", "public", localPath));
          imageUrl = await uploadProductImage(buffer, `sayim-${p.sku || i}.webp`);
          console.log(`  🖼️ Görsel yüklendi: ${imageUrl}`);
        }
      }

      allProducts.push({
        sku: p.sku || `SAYIM-${pageNum}-${i}`,
        productName: p.name,
        brand: p.brand || extraction.pageBrand || "SAYIM",
        category: p.category || extraction.pageCategory || "Genel",
        listPrice: p.listPrice,
        currency: p.currency || extraction.pageCurrency || "TRY",
        taxRate: p.taxRate,
        stockStatus: p.stockStatus,
        technicalSpecs: p.technicalSpecs,
        imageUrl,
        confidence: p.confidence
      });
    }
  }

  // Dry-Run Raporu
  console.log(`\n📊 [DRY-RUN RAPORU]`);
  console.log(`- Toplam Ürün: ${allProducts.length}`);
  console.log(`- Görselli Ürün: ${allProducts.filter(p => p.imageUrl).length}`);
  console.log(`- Fiyatlı Ürün: ${allProducts.filter(p => p.listPrice !== null).length}`);

  if (isDryRun) {
    await writeFile("sayim-import-dry-run.json", JSON.stringify(allProducts, null, 2));
    console.log(`✅ Dry-run tamamlandı. Sonuçlar sayim-import-dry-run.json dosyasına kaydedildi.`);
    return;
  }

  // Veritabanına Yazma İşlemi (Prisma)
  console.log(`💾 Veritabanına yazılıyor...`);
  try {
    for (const prod of allProducts) {
      if (prod.confidence < 80) {
        console.warn(`  ⚠️ Düşük güven skorlu ürün atlanıyor: ${prod.productName}`);
        continue;
      }

      const category = await prisma.category.upsert({
        where: { slug: prod.category.toLowerCase().replace(/[^a-z0-9]/g, '-') },
        update: {},
        create: {
          slug: prod.category.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: prod.category,
        }
      });

      const brand = await prisma.brand.upsert({
        where: { slug: prod.brand.toLowerCase().replace(/[^a-z0-9]/g, '-') },
        update: {},
        create: {
          slug: prod.brand.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: prod.brand,
        }
      });

      const dbProduct = await prisma.product.upsert({
        where: { sku: prod.sku },
        update: {
          productName: prod.productName,
          categoryId: category.id,
          brandId: brand.id,
          technicalSpecifications: prod.technicalSpecs,
        },
        create: {
          sku: prod.sku,
          slug: `${prod.sku}-${prod.productName}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          productName: prod.productName,
          categoryId: category.id,
          brandId: brand.id,
          technicalSpecifications: prod.technicalSpecs,
        }
      });

      if (prod.imageUrl) {
        await prisma.productMedia.create({
          data: {
            productId: dbProduct.id,
            type: "IMAGE",
            url: prod.imageUrl,
            isCover: true,
          }
        });
      }
    }
    console.log("✅ Gerçek veritabanı yazma işlemi tamamlandı.");
  } catch (error) {
    console.error("❌ Veritabanına yazarken hata oluştu:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
