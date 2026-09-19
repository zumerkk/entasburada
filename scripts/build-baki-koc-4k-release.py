#!/usr/bin/env python3
"""Baki Koç 2026 ürün görsellerini 4K (3840x3840) kalitesine yükselten katalog sürümü.

KF Kuzey 4K V6 yöntemi (scripts/build-kf-kuzey-4k-quality-release.py) izlenir:
PDF'ten çıkarılmış özgün ürün görseli (scripts/extract-baki-koc-pdf.py çıktısı,
beyaz zemin) Real-ESRGAN realesr-general-x4v3 ile 4 kat yeniden oluşturulur,
3000 px içerik alanına oturtulup hafif keskinleştirilir ve 3840 px beyaz tuvale
ortalanır. Ürün verisi 2026-09-18-baki-koc-v1 sürümüyle aynıdır; yalnız imageUrl
değişir. Aynı sourceKey/externalId kullanıldığından uygulama betiği mevcut
kayıtların görselini yerinde günceller.

SRVGGNetCompact mimarisi burada tanımlıdır (basicsr/realesrgan paketlerine ve
onların torchvision uyumsuzluğuna gerek kalmaz); ağırlıklar SHA-256 ile
doğrulanır ve yalnız tensör okuyan güvenli modda (weights_only) yüklenir.

Kullanım (PyTorch, OpenCV ve numpy gerekir):
  python3 scripts/build-baki-koc-4k-release.py --model realesr-general-x4v3.pth \\
    --images tmp/pdfs/baki-koc-2026/images
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parents[1]
BASE_RELEASE = ROOT / "deploy/catalog-releases/2026-09-18-baki-koc-v1"
RELEASE_VERSION = "2026-09-19-baki-koc-4k-v2"
ROWS_PATH = ROOT / "scripts/catalog-data/baki-koc-2026-09.json"
OUTPUT_IMAGE_PREFIX = "/uploads/catalog-imports/baki-koc-2026-09-4k/products"
SOURCE_KEY = "catalog-pdf-entas-bk-baki-koc-2026-09"
EXPECTED_PRODUCTS = 153
CANVAS_SIZE = 3840
CONTENT_MAX = 3000
SR_INPUT_MAX = 512
SR_PRE_PAD = 8
WEBP_QUALITY = 92
# Resmî realesr-general-x4v3.pth (KF Kuzey 4K V6 ile aynı ağırlıklar)
EXPECTED_MODEL_SHA256 = "8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292"


class SRVGGNetCompact(nn.Module):
    """Real-ESRGAN "general v3" ağı: konvolüsyon + PReLU gövdesi, PixelShuffle ve en yakın komşu artığı."""

    def __init__(self, num_in_ch: int = 3, num_out_ch: int = 3, num_feat: int = 64, num_conv: int = 32, upscale: int = 4):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList([nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)])
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1))
            self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = x
        for layer in self.body:
            out = layer(out)
        return self.upsampler(out) + F.interpolate(x, scale_factor=self.upscale, mode="nearest")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True, help="Resmî realesr-general-x4v3.pth ağırlıkları")
    parser.add_argument("--images", type=Path, default=ROOT / "tmp/pdfs/baki-koc-2026/images")
    parser.add_argument("--output", type=Path, default=ROOT / "deploy/catalog-releases" / RELEASE_VERSION)
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    parser.add_argument("--limit", type=int, default=0, help="Deneme için yalnız ilk N görsel (sürüm yazılmaz)")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_model(model_path: Path, device: torch.device) -> SRVGGNetCompact:
    if sha256_file(model_path) != EXPECTED_MODEL_SHA256:
        raise RuntimeError("Real-ESRGAN model özeti beklenen değerle eşleşmiyor.")
    checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
    state = checkpoint.get("params_ema") or checkpoint.get("params") or checkpoint
    model = SRVGGNetCompact()
    model.load_state_dict(state, strict=True)
    return model.eval().to(device)


def resize_max(image: np.ndarray, max_edge: int) -> np.ndarray:
    height, width = image.shape[:2]
    scale = max_edge / max(height, width)
    if abs(scale - 1.0) < 0.01:
        return image
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    return cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))), interpolation=interpolation)


@torch.inference_mode()
def super_resolve(model: SRVGGNetCompact, image_bgr: np.ndarray, device: torch.device) -> np.ndarray:
    rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    tensor = torch.from_numpy(np.transpose(rgb, (2, 0, 1))).unsqueeze(0).to(device)
    height, width = rgb.shape[:2]
    padded = F.pad(tensor, (0, SR_PRE_PAD, 0, SR_PRE_PAD), mode="reflect")
    output = model(padded)[:, :, : height * 4, : width * 4]
    result = output.squeeze(0).float().clamp_(0, 1).cpu().numpy()
    result = (np.transpose(result, (1, 2, 0)) * 255.0).round().astype(np.uint8)
    return cv2.cvtColor(result, cv2.COLOR_RGB2BGR)


def object_crop(image: np.ndarray) -> np.ndarray:
    """Beyaz zemindeki ürün kadrajı (çıkarma betiği zaten kırpar; güvenlik için yeniden hesaplanır)."""
    mask = np.any(image < 247, axis=2).astype(np.uint8)
    points = cv2.findNonZero(mask)
    if points is None:
        return image
    x, y, w, h = cv2.boundingRect(points)
    pad = 12
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(image.shape[1], x + w + pad), min(image.shape[0], y + h + pad)
    return image[y0:y1, x0:x1]


def subtle_sharpen(image: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(image, (0, 0), 1.2)
    return cv2.addWeighted(image, 1.14, blurred, -0.14, 0)


def create_card(product: np.ndarray) -> np.ndarray:
    prepared = subtle_sharpen(resize_max(product, CONTENT_MAX))
    prepared[np.all(prepared > 249, axis=2)] = 255
    canvas = np.full((CANVAS_SIZE, CANVAS_SIZE, 3), 255, dtype=np.uint8)
    height, width = prepared.shape[:2]
    x = (CANVAS_SIZE - width) // 2
    y = max(80, (CANVAS_SIZE - height) // 2 - 32)
    canvas[y : y + height, x : x + width] = prepared
    # KF 4K kartlarıyla aynı, zor seçilen marka etiketi
    label, font, scale, thickness = "ENTASBURADA", cv2.FONT_HERSHEY_DUPLEX, 1.55, 2
    (text_width, _), _ = cv2.getTextSize(label, font, scale, thickness)
    cv2.putText(canvas, label, (CANVAS_SIZE - text_width - 100, CANVAS_SIZE - 86), font, scale, (238, 240, 242), thickness, cv2.LINE_AA)
    return canvas


def code_key(code: str) -> str:
    table = str.maketrans({"Ç": "C", "Ğ": "G", "İ": "I", "I": "I", "Ö": "O", "Ş": "S", "Ü": "U", "ç": "C", "ğ": "G", "ı": "I", "ö": "O", "ş": "S", "ü": "U"})
    ascii_code = code.translate(table).upper()
    parts = [part for part in "".join(ch if ch.isalnum() else "-" for ch in ascii_code).split("-") if part]
    return "-".join(parts)


def main() -> int:
    args = parse_args()
    device = torch.device(args.device if args.device == "cpu" or torch.backends.mps.is_available() else "cpu")
    rows = json.loads(ROWS_PATH.read_text(encoding="utf-8"))["rows"]
    products = json.loads((BASE_RELEASE / "products.json").read_text(encoding="utf-8"))
    if len(rows) != EXPECTED_PRODUCTS or len(products) != EXPECTED_PRODUCTS:
        raise RuntimeError(f"Beklenen {EXPECTED_PRODUCTS} ürün yerine {len(rows)} satır / {len(products)} ürün var.")
    by_external_id = {product["externalId"]: product for product in products}
    if any(product["sourceKey"] != SOURCE_KEY for product in products):
        raise RuntimeError("Temel sürümde beklenmeyen kaynak anahtarı var.")

    output_dir = args.output.resolve()
    upload_dir = output_dir / OUTPUT_IMAGE_PREFIX.lstrip("/")
    upload_dir.mkdir(parents=True, exist_ok=True)
    model = load_model(args.model.resolve(), device)

    selected = rows[: args.limit] if args.limit else rows
    image_manifest = []
    started_at = time.time()
    for index, row in enumerate(selected, start=1):
        key = code_key(row["code"])
        product = by_external_id.get(key)
        if product is None:
            raise RuntimeError(f"{row['code']} ({key}) temel sürümde bulunamadı.")
        source_path = args.images / row["image"]
        source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
        if source is None:
            raise RuntimeError(f"Görsel okunamadı: {source_path}")
        crop = object_crop(source)
        restored = super_resolve(model, resize_max(crop, SR_INPUT_MAX), device)
        card = create_card(restored)
        output_name = f"bk-{key.lower()}.webp"
        output_path = upload_dir / output_name
        if not cv2.imwrite(str(output_path), card, [cv2.IMWRITE_WEBP_QUALITY, WEBP_QUALITY]):
            raise RuntimeError(f"Yazılamadı: {output_path}")
        check = cv2.imread(str(output_path), cv2.IMREAD_COLOR)
        if check is None or check.shape[:2] != (CANVAS_SIZE, CANVAS_SIZE):
            raise RuntimeError(f"Geçersiz 4K çıktı: {output_path}")
        product["imageUrl"] = f"{OUTPUT_IMAGE_PREFIX}/{output_name}"
        image_manifest.append({
            "code": row["code"],
            "source": row["image"],
            "sourceSize": [int(source.shape[1]), int(source.shape[0])],
            "srInputSize": [int(min(crop.shape[1], round(crop.shape[1] * SR_INPUT_MAX / max(crop.shape[:2])))), int(min(crop.shape[0], round(crop.shape[0] * SR_INPUT_MAX / max(crop.shape[:2]))))],
            "output": product["imageUrl"],
            "outputBytes": output_path.stat().st_size,
        })
        print(f"[{index:03d}/{len(selected)}] {row['code']} {source.shape[1]}x{source.shape[0]} -> {output_name} ({time.time() - started_at:.1f}s)", flush=True)

    if args.limit:
        print("Deneme modu tamamlandı; products.json ve manifest yazılmadı.")
        return 0

    (output_dir / "products.json").write_text(json.dumps(products, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = {
        "releaseVersion": RELEASE_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "baseRelease": BASE_RELEASE.name,
        "productCount": len(products),
        "imageCount": len(image_manifest),
        "normalizedCanvas": f"{CANVAS_SIZE}x{CANVAS_SIZE} WebP q{WEBP_QUALITY}",
        "totalImageBytes": sum(item["outputBytes"] for item in image_manifest),
        "method": "Real-ESRGAN realesr-general-x4v3 (x4, girdi en fazla 512 px) + 3000 px içerik + hafif keskinleştirme",
        "modelSha256": EXPECTED_MODEL_SHA256,
        "device": str(device),
        "images": image_manifest,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: manifest[key] for key in ("releaseVersion", "productCount", "imageCount", "totalImageBytes", "device")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
