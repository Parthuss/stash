#!/usr/bin/env python3
"""Contact sheet of rendered slides at feed-like size, for content-qa and the Telegram preview.

  contact-sheet.py POSTDIR [--out preview.jpg] [--cols 4] [--width 360]
"""
import argparse
from pathlib import Path

from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("post", type=Path)
ap.add_argument("--out", type=Path)
ap.add_argument("--cols", type=int, default=4)
ap.add_argument("--width", type=int, default=360)  # about how wide a feed post shows on a phone
a = ap.parse_args()
files = sorted(p for p in a.post.glob("[0-9][0-9].png"))
if not files:
    raise SystemExit("no slides (01.png...) in " + str(a.post))
w, gap = a.width, 16
h = round(w * 1350 / 1080)
cols = min(a.cols, len(files))
rows = -(-len(files) // cols)
sheet = Image.new("RGB", (cols * w + (cols + 1) * gap, rows * h + (rows + 1) * gap), "#2a2840")
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h), Image.LANCZOS)
    sheet.paste(im, (gap + (i % cols) * (w + gap), gap + (i // cols) * (h + gap)))
out = a.out or a.post / "preview.jpg"
sheet.save(out, quality=88)
print(out)
