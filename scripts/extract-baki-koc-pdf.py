#!/usr/bin/env python3
"""Baki Koç 2026 fiyat listesi PDF'inden ürün satırlarını ve ana ürün görsellerini çıkarır.

Katalog düzeni sabittir: her sayfada en fazla üç ürün yuvası vardır. Her yuvada büyük
harfli ürün başlığı (bazı yuvalarda yan yana iki varyant başlığı), şeffaf zeminli ana
ürün görseli ve "Ürün Kodu / Ürün Adedi / Ürün Fiyatı / Ürün Ağırlık / Hammadde /
Kalınlık" tablosu bulunur. Tablo hücresinde iki satır varsa her satır bir varyanttır
(ör. "561" ve "561 - ÜÇG"); tek satırlık hücre varyantlar arasında paylaşılır.

Ana görsel sayfadaki kırpma yerine gömülü CMYK görsel + yumuşak maskeden üretilir ve
sayfadaki yönelimi (ayna/döndürme) korunarak beyaz zemine oturtulur; böylece başlık
şeritleri, tablo çizgileri ve teknik çizim kutuları ürün görseline karışmaz.

Kullanım (PyMuPDF ve Pillow gerekir):
  python3 scripts/extract-baki-koc-pdf.py "BAKİ KOÇ 2026 FİYAT LİSTESİ.pdf" \\
    --rows scripts/catalog-data/baki-koc-2026-09.json \\
    --images tmp/pdfs/baki-koc-2026/images
"""
import argparse
import json
import os
import re

import fitz
from PIL import Image, ImageChops

HEADER_LABELS = {"Ürün Kodu", "Ürün Adedi", "Ürün Fiyatı", "Ürün Ağırlık", "Hammadde", "Kalınlık"}
GROUP_COLOR = 0xE5B522
HEADING_COLOR = 0x2E2E2E
EXPECTED_PRODUCTS = 153


def lines_of(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = [span for span in line["spans"] if span["text"].strip()]
            if not spans:
                continue
            x0, y0, x1, y1 = line["bbox"]
            out.append({
                "text": re.sub(r"\s+", " ", "".join(span["text"] for span in spans).strip()),
                "x0": x0,
                "y0": y0,
                "cx": (x0 + x1) / 2,
                "cy": (y0 + y1) / 2,
                "size": spans[0]["size"],
                "color": spans[0]["color"],
            })
    return out


def parse_price(text):
    # Kaynakta "ɉ\x03112,00" ve "ɉ 1 30,00" gibi bozuk aralıklar var: yalnız rakam ve ayraç kalsın.
    raw = re.sub(r"[^0-9.,]", "", text).replace(".", "").replace(",", ".")
    return round(float(raw), 2)


def save_image(doc, image, path):
    xref = image["xref"]
    pix = fitz.Pixmap(doc, xref)
    if pix.alpha:
        pix = fitz.Pixmap(pix, 0)
    if pix.colorspace is None or pix.colorspace.n != 3:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    rgba = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("RGBA")
    smask = doc.extract_image(xref).get("smask", 0)
    if smask:
        mask_pix = fitz.Pixmap(doc, smask)
        if mask_pix.n != 1:
            mask_pix = fitz.Pixmap(fitz.csGRAY, mask_pix)
        mask = Image.frombytes("L", (mask_pix.width, mask_pix.height), mask_pix.samples)
        rgba.putalpha(mask if mask.size == rgba.size else mask.resize(rgba.size, Image.LANCZOS))

    # Görsel uzayı (u,v ∈ [0,1]) -> sayfa: (a·u + c·v + e, b·u + d·v + f)
    a, b, c, d, e, f = image["transform"]
    x0, y0, x1, y1 = image["bbox"]
    width_px, height_px = rgba.size
    density = max(2.0, width_px / max(1e-6, (a * a + b * b) ** 0.5), height_px / max(1e-6, (c * c + d * d) ** 0.5))
    out_size = (max(1, round((x1 - x0) * density)), max(1, round((y1 - y0) * density)))
    det = a * d - b * c
    ia, ib, ic, id_ = d / det, -c / det, -b / det, a / det
    ox, oy, k = x0 - e, y0 - f, 1.0 / density
    coefficients = (
        width_px * ia * k, width_px * ib * k, width_px * (ia * ox + ib * oy),
        height_px * ic * k, height_px * id_ * k, height_px * (ic * ox + id_ * oy),
    )
    placed = rgba.transform(out_size, Image.AFFINE, coefficients, resample=Image.BICUBIC, fillcolor=(255, 255, 255, 0))
    flat = Image.new("RGBA", placed.size, (255, 255, 255, 255))
    flat.alpha_composite(placed)
    flat = flat.convert("RGB")
    content = ImageChops.difference(flat, Image.new("RGB", flat.size, (255, 255, 255))).point(lambda value: 255 if value > 12 else 0).getbbox()
    if content:
        pad = 6
        flat = flat.crop((max(0, content[0] - pad), max(0, content[1] - pad), min(flat.width, content[2] + pad), min(flat.height, content[3] + pad)))
    flat.save(path)


def extract(pdf_path, image_dir):
    doc = fitz.open(pdf_path)
    rows = []
    for page_number in range(1, doc.page_count + 1):
        page = doc[page_number - 1]
        lines = lines_of(page)
        # 13, 24 ve 25. sayfalarda eski "PLASTİK ..." etiketi görünen "ORİJİNAL PLASTİK ..."
        # etiketinin altında kalmış; üst üste binen etiketlerden uzun (görünen) olanı seçilir.
        group_line = max((line for line in lines if line["color"] == GROUP_COLOR and line["size"] >= 11), key=lambda line: len(line["text"]), default=None)
        header_rows = sorted({round(line["y0"]) for line in lines if line["text"] == "Ürün Kodu"})
        if not group_line or not header_rows:
            continue
        # Ürün başlıkları büyük harflidir; görsel üstündeki "Mıknatıslı" gibi etiketler elenir.
        headings = [
            line for line in lines
            if line["color"] == HEADING_COLOR and 9.5 <= line["size"] <= 10.5 and not re.search(r"[a-zçğıöşü]", line["text"])
        ]
        images = []
        for info in page.get_image_info(xrefs=True):
            x0, y0, x1, y1 = info["bbox"]
            images.append({"xref": info["xref"], "bbox": (x0, y0, x1, y1), "area": (x1 - x0) * (y1 - y0), "transform": tuple(info["transform"])})

        previous_header = 60.0
        for slot, header_y in enumerate(header_rows):
            columns = sorted([line for line in lines if line["text"] in HEADER_LABELS and abs(line["y0"] - header_y) < 3], key=lambda line: line["cx"])
            by_column = {column["text"]: [] for column in columns}
            for value in (line for line in lines if line["color"] == 0 and 7.5 <= line["size"] <= 8.5 and header_y + 5 < line["cy"] < header_y + 40):
                by_column[min(columns, key=lambda column: abs(column["cx"] - value["cx"]))["text"]].append(value)
            for values in by_column.values():
                values.sort(key=lambda line: (round(line["cy"]), line["cx"]))
            codes = by_column.get("Ürün Kodu", [])
            slot_headings = sorted([line for line in headings if previous_header < line["y0"] < header_y], key=lambda line: (round(line["y0"] / 20), line["x0"]))
            slot_images = [image for image in images if previous_header < (image["bbox"][1] + image["bbox"][3]) / 2 < header_y]
            heroes = sorted(sorted(slot_images, key=lambda image: -image["area"])[: max(1, len(slot_headings))], key=lambda image: image["bbox"][0])
            if not codes or not heroes or not slot_headings:
                raise SystemExit(f"Sayfa {page_number} yuva {slot}: kod/görsel/başlık eksik")

            def cell(name, index):
                values = by_column.get(name, [])
                if not values:
                    return ""
                if len(values) == len(codes):
                    return values[index]["text"]
                if len(values) == 1:
                    return values[0]["text"]
                if len(codes) == 1:
                    return " ".join(value["text"] for value in values)
                return min(values, key=lambda value: abs(value["cy"] - codes[index]["cy"]))["text"]

            for index in range(len(codes)):
                one_heading_per_variant = len(slot_headings) == len(codes)
                if not one_heading_per_variant and len(slot_headings) != 1:
                    raise SystemExit(f"Sayfa {page_number} yuva {slot}: {len(slot_headings)} başlık / {len(codes)} varyant")
                heading = slot_headings[index if one_heading_per_variant else 0]["text"]
                hero_index = index if one_heading_per_variant and index < len(heroes) else 0
                image_name = f"p{page_number:02d}-s{slot}-h{hero_index}.png"
                image_path = os.path.join(image_dir, image_name)
                if not os.path.exists(image_path):
                    save_image(doc, heroes[hero_index], image_path)
                rows.append({
                    "pdfPage": page_number,
                    "catalogPage": page_number - 2,
                    "group": group_line["text"],
                    "name": heading,
                    "code": cell("Ürün Kodu", index),
                    "cartonQuantity": cell("Ürün Adedi", index),
                    "price": parse_price(cell("Ürün Fiyatı", index)),
                    "weight": cell("Ürün Ağırlık", index),
                    "material": cell("Hammadde", index),
                    "thickness": cell("Kalınlık", index),
                    "image": image_name,
                })
            previous_header = header_y
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--rows", required=True)
    parser.add_argument("--images", required=True)
    args = parser.parse_args()
    os.makedirs(args.images, exist_ok=True)
    rows = extract(args.pdf, args.images)
    codes = [row["code"] for row in rows]
    if len(rows) != EXPECTED_PRODUCTS or len(set(codes)) != len(codes):
        raise SystemExit(f"Beklenen {EXPECTED_PRODUCTS} benzersiz ürün yerine {len(rows)} satır / {len(set(codes))} kod çıktı.")
    with open(args.rows, "w", encoding="utf-8") as handle:
        json.dump({"source": os.path.basename(args.pdf), "extractedProducts": len(rows), "rows": rows}, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"rows": len(rows), "images": len({row["image"] for row in rows})}, ensure_ascii=False))


if __name__ == "__main__":
    main()
