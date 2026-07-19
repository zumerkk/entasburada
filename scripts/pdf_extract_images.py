#!/usr/bin/env python3
"""Extract embedded images from a PDF page at their original quality.

Returns JSON with image metadata and base64-encoded bytes, allowing the
Node.js caller to save the highest-quality version of each product photo
instead of cropping from a rendered page bitmap.

Usage: pdf_extract_images.py <pdf-path> <page-number> [output-dir]
  If output-dir is provided, images are saved as files and paths returned.
  Otherwise, base64-encoded image data is returned inline.
"""

import base64
import json
import os
import sys

import fitz  # PyMuPDF


def clamp(value, minimum, maximum):
    return min(maximum, max(minimum, value))


def image_quality_score(width, height, color_space, bpc):
    """Compute a simple quality heuristic (0-100) for the extracted image."""
    area = width * height
    if area < 2_500:
        return 10
    if area < 10_000:
        return 30
    score = 50
    if area >= 40_000:
        score += 15
    if area >= 100_000:
        score += 10
    if bpc and bpc >= 8:
        score += 10
    if color_space and "RGB" in str(color_space).upper():
        score += 10
    if color_space and "CMYK" in str(color_space).upper():
        score += 8
    return min(100, score)


def extract_image_bytes(doc, xref, smask_xref):
    """Return the source image with its PDF soft mask applied when available."""
    if smask_xref and smask_xref > 0:
        try:
            base_pixmap = fitz.Pixmap(doc, xref)
            mask_pixmap = fitz.Pixmap(doc, smask_xref)
            if base_pixmap.width == mask_pixmap.width and base_pixmap.height == mask_pixmap.height:
                if base_pixmap.n > 4:
                    base_pixmap = fitz.Pixmap(fitz.csRGB, base_pixmap)
                combined = fitz.Pixmap(base_pixmap, mask_pixmap)
                return {
                    "image": combined.tobytes("png"),
                    "ext": "png",
                    "width": combined.width,
                    "height": combined.height,
                    "colorspace": combined.colorspace.name if combined.colorspace else "",
                    "bpc": 8,
                    "softMaskApplied": True,
                }
        except Exception:
            pass

    base_image = doc.extract_image(xref)
    if not base_image or not base_image.get("image"):
        return None
    return {**base_image, "softMaskApplied": False}


def main():
    if len(sys.argv) < 3:
        raise SystemExit(
            "usage: pdf_extract_images.py <pdf> <page-number> [output-dir]"
        )

    file_path = sys.argv[1]
    page_number = int(sys.argv[2])
    output_dir = sys.argv[3] if len(sys.argv) > 3 else None

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    doc = fitz.open(file_path)
    page = doc.load_page(page_number - 1)
    page_width = page.rect.width
    page_height = page.rect.height

    images_info = page.get_image_info(xrefs=True)
    soft_masks = {row[0]: row[1] for row in page.get_images(full=True)}
    results = []
    seen_xrefs = set()

    for idx, info in enumerate(images_info):
        xref = info.get("xref", 0)
        if xref <= 0:
            continue

        # Skip duplicate xrefs (same image placed multiple times)
        if xref in seen_xrefs:
            # Still add region info for placement tracking
            bbox = info.get("bbox", [0, 0, 0, 0])
            bw = bbox[2] - bbox[0]
            bh = bbox[3] - bbox[1]
            if bw < 15 or bh < 15:
                continue
            results.append({
                "index": len(results),
                "xref": xref,
                "duplicate": True,
                "region": {
                    "x": round(clamp(bbox[0] / page_width * 1000, 0, 999), 2),
                    "y": round(clamp(bbox[1] / page_height * 1000, 0, 999), 2),
                    "width": round(clamp(bw / page_width * 1000, 1, 1000), 2),
                    "height": round(clamp(bh / page_height * 1000, 1, 1000), 2),
                },
                "originalWidth": 0,
                "originalHeight": 0,
                "quality": 0,
            })
            continue

        seen_xrefs.add(xref)

        bbox = info.get("bbox", [0, 0, 0, 0])
        bw = bbox[2] - bbox[0]
        bh = bbox[3] - bbox[1]

        # Skip very small images (icons, logos, decorative elements)
        if bw < 15 or bh < 15:
            continue

        # Skip full-page background images
        if bw / page_width > 0.97 and bh / page_height > 0.97:
            continue

        try:
            base_image = extract_image_bytes(doc, xref, soft_masks.get(xref, 0))
        except Exception:
            continue

        if not base_image or not base_image.get("image"):
            continue

        image_bytes = base_image["image"]
        ext = base_image.get("ext", "png")
        img_width = base_image.get("width", 0)
        img_height = base_image.get("height", 0)
        color_space = base_image.get("colorspace", 0)
        bpc = base_image.get("bpc", 0)

        # Keep narrow product cutouts (for example stakes and nipples) while
        # still rejecting tiny decorative fragments.
        if img_width < 16 or img_height < 16:
            continue

        quality = image_quality_score(img_width, img_height, color_space, bpc)

        # Compute normalized region (0-1000 coordinate space)
        region = {
            "x": round(clamp(bbox[0] / page_width * 1000, 0, 999), 2),
            "y": round(clamp(bbox[1] / page_height * 1000, 0, 999), 2),
            "width": round(clamp(bw / page_width * 1000, 1, 1000), 2),
            "height": round(clamp(bh / page_height * 1000, 1, 1000), 2),
        }

        entry = {
            "index": len(results),
            "xref": xref,
            "duplicate": False,
            "region": region,
            "originalWidth": img_width,
            "originalHeight": img_height,
            "ext": ext,
            "colorSpace": str(color_space),
            "bpc": bpc,
            "sizeBytes": len(image_bytes),
            "quality": quality,
            "softMaskApplied": bool(base_image.get("softMaskApplied")),
        }

        if output_dir:
            # Save to file
            filename = f"img-{xref}-{idx}.{ext}"
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            entry["filePath"] = filepath
        else:
            # Return base64 inline
            entry["base64"] = base64.b64encode(image_bytes).decode("ascii")

        results.append(entry)

    doc.close()

    # Sort by position (top-to-bottom, left-to-right)
    results.sort(key=lambda r: (r["region"]["y"], r["region"]["x"]))

    # Re-index after sorting
    for i, r in enumerate(results):
        r["index"] = i

    print(json.dumps(results))


if __name__ == "__main__":
    main()
