#!/usr/bin/env python3
import json
import sys

import pdfplumber


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: pdf_page_words.py <pdf> <page-number>")
    with pdfplumber.open(sys.argv[1]) as pdf:
        page = pdf.pages[int(sys.argv[2]) - 1]
        width = float(page.width)
        height = float(page.height)
        words = []
        for word in page.extract_words(x_tolerance=3, y_tolerance=3):
            text = str(word.get("text", "")).strip()
            if not text:
                continue
            x0 = float(word.get("x0", 0))
            x1 = float(word.get("x1", x0))
            top = float(word.get("top", 0))
            bottom = float(word.get("bottom", top))
            words.append({
                "text": text,
                "x": round(x0 / width * 1000, 2),
                "y": round(top / height * 1000, 2),
                "width": round((x1 - x0) / width * 1000, 2),
                "height": round((bottom - top) / height * 1000, 2),
            })
        print(json.dumps(words, ensure_ascii=False))


if __name__ == "__main__":
    main()
