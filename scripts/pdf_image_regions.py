#!/usr/bin/env python3
import json
import sys

import pdfplumber


def clamp(value, minimum, maximum):
    return min(maximum, max(minimum, value))


def overlap_ratio(first, second):
    left = max(first["x"], second["x"])
    top = max(first["y"], second["y"])
    right = min(first["x"] + first["width"], second["x"] + second["width"])
    bottom = min(first["y"] + first["height"], second["y"] + second["height"])
    intersection = max(0, right - left) * max(0, bottom - top)
    smaller = min(first["width"] * first["height"], second["width"] * second["height"])
    return intersection / smaller if smaller else 0


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: pdf_image_regions.py <pdf> <page-number>")

    file_path = sys.argv[1]
    page_number = int(sys.argv[2])
    with pdfplumber.open(file_path) as pdf:
        page = pdf.pages[page_number - 1]
        page_width = float(page.width)
        page_height = float(page.height)
        regions = []

        for image in page.images:
            x0 = float(image.get("x0", 0))
            x1 = float(image.get("x1", 0))
            top = float(image.get("top", 0))
            bottom = float(image.get("bottom", 0))
            width = x1 - x0
            height = bottom - top
            if width < 12 or height < 12:
                continue
            if x0 < -2 or top < -2 or x1 > page_width * 1.02 or bottom > page_height * 1.02:
                continue

            normalized = {
                "x": round(clamp(x0 / page_width * 1000, 0, 999), 2),
                "y": round(clamp(top / page_height * 1000, 0, 999), 2),
                "width": round(clamp(width / page_width * 1000, 1, 1000), 2),
                "height": round(clamp(height / page_height * 1000, 1, 1000), 2),
            }
            if normalized["width"] * normalized["height"] > 820000:
                continue
            if any(overlap_ratio(normalized, existing) > 0.92 for existing in regions):
                continue
            regions.append(normalized)

    regions.sort(key=lambda region: (region["y"], region["x"]))
    print(json.dumps([{"index": index, "region": region} for index, region in enumerate(regions)]))


if __name__ == "__main__":
    main()
