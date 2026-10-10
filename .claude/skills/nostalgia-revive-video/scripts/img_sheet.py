#!/usr/bin/env python3
"""生成した画像を一覧にする（自分の目で全部見るため）。12枚ずつ work/review_<n>.jpg に。

  PROJ=作品フォルダ python3 img_sheet.py [--only S01 S02 ...] [--per 12] [--dir assets/img]
"""
import json, os, argparse
from PIL import Image, ImageDraw, ImageFont
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--per", type=int, default=12)
ap.add_argument("--dir", default="assets/img")
a = ap.parse_args()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
font_p = os.path.join(ROOT, "assets/fonts/ShipporiMincho_500Medium.ttf")
font = ImageFont.truetype(font_p, 22) if os.path.exists(font_p) else ImageFont.load_default()
ids = [s["id"] for s in D["scenes"] if (a.only and s["id"] in a.only) or (not a.only and s.get("full_prompt"))]
ids = [i for i in ids if os.path.exists(os.path.join(ROOT, a.dir, i + ".png"))]
jp = {s["id"]: s["jp"] for s in D["scenes"]}
W, H, cols = 600, 336, 3
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
for n in range(0, len(ids), a.per):
    chunk = ids[n:n + a.per]; rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (W + 8), rows * (H + 40)), (0, 0, 0)); d = ImageDraw.Draw(sheet)
    for k, sid in enumerate(chunk):
        im = Image.open(os.path.join(ROOT, a.dir, sid + ".png")).convert("RGB").resize((W, H), Image.LANCZOS)
        x = (k % cols) * (W + 8); y = (k // cols) * (H + 40)
        sheet.paste(im, (x, y)); d.text((x + 4, y + H + 6), f"{sid} {jp.get(sid, '')[:24]}", fill=(255, 230, 120), font=font)
    out = os.path.join(ROOT, "work", f"review_{n // a.per}.jpg"); sheet.save(out, quality=85); print(out, chunk)
