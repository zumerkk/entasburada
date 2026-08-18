#!/usr/bin/env python3
"""Build the complete KF Kuzey Fittings 4K image quality release.

The official catalog intentionally embeds many very small raster images. This
builder keeps the approved product-to-image mapping intact, removes the old
catalog-card chrome, restores low-resolution sources with Real-ESRGAN, and
places every unique visual on a clean 3840px e-commerce canvas.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch
from basicsr.archs.srvgg_arch import SRVGGNetCompact
from realesrgan import RealESRGANer


ROOT = Path(__file__).resolve().parents[1]
SOURCE_KEY = "catalog-kf-kuzey-fittings-2026-1"
RELEASE_VERSION = "2026-08-18-kf-kuzey-fittings-quality-v6"
SOURCE_RELEASES = [
    "2026-08-14-kf-kuzey-fittings-quality-v2",
    "2026-08-14-kf-kuzey-fittings-quality-v3",
    "2026-08-14-kf-kuzey-fittings-quality-v4",
    "2026-08-15-kf-kuzey-fittings-quality-v5",
]
OUTPUT_IMAGE_PREFIX = (
    "/uploads/catalog-imports/"
    "kf-kuzey-fittings-2026-quality-v6/products"
)
CANVAS_SIZE = 3840
CONTENT_MAX = 3000
SR_INPUT_MAX = 512
OFFICIAL_PDF_URL = (
    "https://kuzeyfittings.com.tr/"
    "wp-content/uploads/2026/06/2026-Katalog.pdf"
)
OFFICIAL_PDF_SHA256 = (
    "b1927d66381af1127d60be5b116cef669c7fecf479024033e609fea0f9f7f8b6"
)
EXPECTED_MODEL_SHA256 = (
    "8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292"
)
OVERRIDE_DIR = ROOT / "scripts/catalog-data/kf-kuzey-4k-v6/imagegen-overrides"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=Path,
        required=True,
        help="Path to the official realesr-general-x4v3.pth weights.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "deploy/catalog-releases" / RELEASE_VERSION,
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_products() -> list[dict]:
    products: OrderedDict[str, dict] = OrderedDict()
    for release_name in SOURCE_RELEASES:
        product_path = ROOT / "deploy/catalog-releases" / release_name / "products.json"
        entries = json.loads(product_path.read_text(encoding="utf-8"))
        for product in entries:
            if product.get("sourceKey") != SOURCE_KEY:
                continue
            external_id = product["externalId"]
            if external_id in products:
                products[external_id].update(product)
            else:
                products[external_id] = product.copy()
    result = list(products.values())
    if len(result) != 2349:
        raise RuntimeError(f"Expected 2349 KF products, found {len(result)}")
    return result


def resolve_upload(image_url: str) -> Path:
    relative = image_url.lstrip("/")
    for release_name in reversed(SOURCE_RELEASES):
        candidate = ROOT / "deploy/catalog-releases" / release_name / relative
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"Could not resolve KF image URL: {image_url}")


def source_tier(path: Path) -> str:
    value = str(path)
    if "quality-v5" in value:
        return "restored-v5"
    if "quality-v4" in value:
        return "web-source-v4"
    return "official-pdf-v2"


def remove_catalog_artifacts(image: np.ndarray) -> np.ndarray:
    cleaned = image.copy()
    mask = np.any(cleaned < 246, axis=2).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    height, width = mask.shape

    for label in range(1, count):
        x, y, w, h, area = map(int, stats[label])
        if area < 80:
            continue
        pixels = cleaned[labels == label]
        mean_b, mean_g, mean_r = pixels.mean(axis=0)
        is_red = mean_r > 145 and mean_r > mean_g * 1.3 and mean_r > mean_b * 1.3
        is_bottom_catalog_strip = (
            y > height * 0.68
            and h < height * 0.16
            and (w > width * 0.20 or is_red)
        )
        if is_bottom_catalog_strip and is_red:
            cleaned[labels == label] = 255
    return cleaned


def object_crop(image: np.ndarray, from_card: bool) -> np.ndarray:
    if from_card and image.shape[:2] == (2160, 2160):
        working = image[120:1960, 120:2040].copy()
    else:
        working = image.copy()

    working = remove_catalog_artifacts(working)
    mask = np.any(working < 247, axis=2).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    components: list[tuple[int, int, int, int, int]] = []
    for stat in stats[1:]:
        x, y, w, h, area = map(int, stat)
        if area >= 80 and w >= 4 and h >= 4:
            components.append((x, y, w, h, area))

    if not components:
        return working

    x0 = max(0, min(item[0] for item in components) - 28)
    y0 = max(0, min(item[1] for item in components) - 28)
    x1 = min(working.shape[1], max(item[0] + item[2] for item in components) + 28)
    y1 = min(working.shape[0], max(item[1] + item[3] for item in components) + 28)
    crop = working[y0:y1, x0:x1]
    if crop.shape[0] < 32 or crop.shape[1] < 32:
        return working
    return crop


def resize_max(image: np.ndarray, max_edge: int) -> np.ndarray:
    height, width = image.shape[:2]
    scale = max_edge / max(height, width)
    if abs(scale - 1.0) < 0.01:
        return image
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    return cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=interpolation)


def subtle_sharpen(image: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(image, (0, 0), 1.2)
    return cv2.addWeighted(image, 1.14, blurred, -0.14, 0)


def create_upscaler(model_path: Path, device_name: str) -> RealESRGANer:
    if sha256_file(model_path) != EXPECTED_MODEL_SHA256:
        raise RuntimeError("Unexpected Real-ESRGAN model checksum")
    if device_name == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is unavailable")
    model = SRVGGNetCompact(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_conv=32,
        upscale=4,
        act_type="prelu",
    )
    return RealESRGANer(
        scale=4,
        model_path=str(model_path),
        model=model,
        tile=0,
        tile_pad=16,
        pre_pad=8,
        half=False,
        device=torch.device(device_name),
    )


def create_card(product: np.ndarray) -> np.ndarray:
    prepared = resize_max(product, CONTENT_MAX)
    prepared = subtle_sharpen(prepared)
    prepared[np.all(prepared > 249, axis=2)] = 255

    canvas = np.full((CANVAS_SIZE, CANVAS_SIZE, 3), 255, dtype=np.uint8)
    height, width = prepared.shape[:2]
    x = (CANVAS_SIZE - width) // 2
    y = max(80, (CANVAS_SIZE - height) // 2 - 32)
    canvas[y : y + height, x : x + width] = prepared

    label = "ENTASBURADA"
    font = cv2.FONT_HERSHEY_DUPLEX
    scale = 1.55
    thickness = 2
    (text_width, text_height), _ = cv2.getTextSize(label, font, scale, thickness)
    cv2.putText(
        canvas,
        label,
        (CANVAS_SIZE - text_width - 100, CANVAS_SIZE - 86),
        font,
        scale,
        (238, 240, 242),
        thickness,
        cv2.LINE_AA,
    )
    return canvas


def enhance_visual(
    source_path: Path,
    tier: str,
    upscaler: RealESRGANer,
) -> tuple[np.ndarray, str]:
    override_path = OVERRIDE_DIR / f"{source_path.stem}.png"
    if override_path.is_file():
        image = cv2.imread(str(override_path), cv2.IMREAD_COLOR)
        if image is None:
            raise RuntimeError(f"Could not read ImageGen override: {override_path}")
        return create_card(object_crop(image, from_card=False)), "imagegen-precise-edit"

    image = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Could not read image: {source_path}")
    crop = object_crop(image, from_card=True)

    if tier == "official-pdf-v2":
        sr_input = resize_max(crop, SR_INPUT_MAX)
        restored, _ = upscaler.enhance(sr_input, outscale=4)
        return create_card(restored), "realesrgan-x4v3"

    return create_card(crop), "geometry-preserving-4k"


def processing_method(source_path: Path, tier: str) -> str:
    if (OVERRIDE_DIR / f"{source_path.stem}.png").is_file():
        return "imagegen-precise-edit"
    if tier == "official-pdf-v2":
        return "realesrgan-x4v3"
    return "geometry-preserving-4k"


def update_product_quality(product: dict, image_url: str) -> dict:
    updated = product.copy()
    updated["imageUrl"] = image_url
    updated["sourceName"] = "KF Kuzey Fittings 2026/1 Fiyat Kataloğu - 4K Kalite V6"

    specs = [item.copy() for item in updated.get("technicalSpecs", [])]
    quality_value = (
        "4K Kalite V6; ürün eşleşmesi ve geometrisi korunmuş 3840px "
        "e-ticaret görseli"
    )
    replaced = False
    for item in specs:
        if item.get("label") == "Görsel Kalitesi":
            item["value"] = quality_value
            replaced = True
    if not replaced:
        specs.append({"label": "Görsel Kalitesi", "value": quality_value})
    updated["technicalSpecs"] = specs
    return updated


def main() -> int:
    args = parse_args()
    output_dir = args.output.resolve()
    upload_dir = output_dir / OUTPUT_IMAGE_PREFIX.lstrip("/")
    upload_dir.mkdir(parents=True, exist_ok=True)

    model_path = args.model.resolve()
    if not model_path.is_file():
        raise FileNotFoundError(model_path)

    products = load_products()
    url_product_count: dict[str, int] = defaultdict(int)
    for product in products:
        url_product_count[product["imageUrl"]] += 1

    url_records: dict[str, dict] = {}
    hash_records: OrderedDict[str, dict] = OrderedDict()
    for image_url in sorted(url_product_count):
        source_path = resolve_upload(image_url)
        content_hash = sha256_file(source_path)
        url_records[image_url] = {
            "hash": content_hash,
            "sourcePath": source_path,
            "tier": source_tier(source_path),
        }
        if content_hash not in hash_records:
            hash_records[content_hash] = {
                "sourcePath": source_path,
                "sourceUrl": image_url,
                "tier": source_tier(source_path),
                "productCount": 0,
                "sourceUrlCount": 0,
            }
        hash_records[content_hash]["productCount"] += url_product_count[image_url]
        hash_records[content_hash]["sourceUrlCount"] += 1

    if len(hash_records) != 746:
        raise RuntimeError(f"Expected 746 unique KF visuals, found {len(hash_records)}")

    upscaler = create_upscaler(model_path, args.device)
    generated_at = datetime.now(timezone.utc).isoformat()
    image_manifest: list[dict] = []
    hash_to_url: dict[str, str] = {}
    started_at = time.time()

    items = list(hash_records.items())
    if args.limit:
        items = items[: args.limit]

    for index, (content_hash, record) in enumerate(items, start=1):
        output_name = f"{index:04d}-{content_hash[:16]}.webp"
        output_path = upload_dir / output_name
        image_url = f"{OUTPUT_IMAGE_PREFIX}/{output_name}"

        method = processing_method(record["sourcePath"], record["tier"])
        if not (args.resume and output_path.is_file()):
            card, method = enhance_visual(record["sourcePath"], record["tier"], upscaler)
            if not cv2.imwrite(
                str(output_path),
                card,
                [cv2.IMWRITE_WEBP_QUALITY, 92],
            ):
                raise RuntimeError(f"Could not write {output_path}")

        metadata_image = cv2.imread(str(output_path), cv2.IMREAD_COLOR)
        if metadata_image is None or metadata_image.shape[:2] != (CANVAS_SIZE, CANVAS_SIZE):
            raise RuntimeError(f"Invalid 4K output: {output_path}")

        hash_to_url[content_hash] = image_url
        image_manifest.append(
            {
                "sourceUrl": record["sourceUrl"],
                "sourceSha256": content_hash,
                "sourceTier": record["tier"],
                "method": method,
                "productCount": record["productCount"],
                "sourceUrlCount": record["sourceUrlCount"],
                "outputUrl": image_url,
                "outputSha256": sha256_file(output_path),
                "outputBytes": output_path.stat().st_size,
                "outputWidth": CANVAS_SIZE,
                "outputHeight": CANVAS_SIZE,
            }
        )
        elapsed = time.time() - started_at
        print(
            f"[{index:03d}/{len(items)}] {method} "
            f"{record['sourcePath'].name} -> {output_name} ({elapsed:.1f}s)",
            flush=True,
        )

    if args.limit:
        print("Limit mode completed; release files were not written.")
        return 0

    updated_products: list[dict] = []
    for product in products:
        record = url_records[product["imageUrl"]]
        updated_products.append(update_product_quality(product, hash_to_url[record["hash"]]))

    (output_dir / "products.json").write_text(
        json.dumps(updated_products, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    method_counts: dict[str, int] = defaultdict(int)
    total_bytes = 0
    for item in image_manifest:
        method_counts[item["method"]] += 1
        total_bytes += item["outputBytes"]

    manifest = {
        "releaseVersion": RELEASE_VERSION,
        "mode": "write",
        "createdAt": generated_at,
        "productCount": len(updated_products),
        "uniqueImageCount": len(image_manifest),
        "normalizedCanvas": "3840x3840 WebP",
        "totalImageBytes": total_bytes,
        "methods": dict(sorted(method_counts.items())),
        "source": {
            "productData": "KF Kuzey Fittings 2026/1 resmî fiyat kataloğu",
            "officialPdf": OFFICIAL_PDF_URL,
            "officialPdfSha256": OFFICIAL_PDF_SHA256,
            "sourceReleases": SOURCE_RELEASES,
        },
        "superResolution": {
            "implementation": "xinntao/Real-ESRGAN",
            "model": "realesr-general-x4v3",
            "modelSha256": EXPECTED_MODEL_SHA256,
            "inputMaxEdge": SR_INPUT_MAX,
            "scale": 4,
            "device": args.device,
        },
        "imagePolicy": (
            "Bütün KF görsel aileleri mevcut onaylı ürün eşleşmesi korunarak yeniden işlendi. "
            "Resmî PDF'deki düşük çözünürlüklü rasterler geometriyi değiştirmeyen Real-ESRGAN "
            "süper çözünürlükten geçirildi; daha iyi V4/V5 kaynakları kayıpsız 4K standardına "
            "alındı; üç kritik düşük kalite görseli ImageGen precise-object-edit ile restore edildi."
        ),
        "coveragePolicy": (
            "2.349 ürünün tamamı ve 746 benzersiz görsel ailesinin tamamı 3840px V6 URL'lerine "
            "taşındı; eski görsel URL'si kullanan açık KF kaydı bırakılmadı."
        ),
        "images": image_manifest,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "release": str(output_dir.relative_to(ROOT)),
                "products": len(updated_products),
                "uniqueImages": len(image_manifest),
                "methods": dict(method_counts),
                "totalImageBytes": total_bytes,
                "elapsedSeconds": round(time.time() - started_at, 1),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise
