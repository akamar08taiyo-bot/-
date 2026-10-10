#!/usr/bin/env python3
"""全編の短時間ラウドネス（3秒窓）の推移をグラフにする。パートの区切りと急上昇の箇所を表示。"""
import json, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
D = json.load(open("scenes.json", encoding="utf-8"))
r = subprocess.run(["ffmpeg", "-nostats", "-i", src, "-filter_complex", "[0:a]ebur128=framelog=info", "-f", "null", "-"], capture_output=True, text=True).stderr
pts = []
for m in re.finditer(r"t:\s*([\d.]+).*?S:\s*(-?[\d.]+)", r):
    pts.append((float(m.group(1)), float(m.group(2))))
W, H = 1800, 420; L, B = 60, 40
img = Image.new("RGB", (W, H), (16, 16, 20)); d = ImageDraw.Draw(img)
font = ImageFont.truetype("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", 15)
T = D["total"]
def X(t): return L + (W - L - 10) * t / T
def Y(v): return 10 + (H - B - 10) * (-(v + 8) / 40)  # -8..-48 LUFS
for v in (-10, -14, -20, -30, -40):
    d.line([(L, Y(v)), (W - 10, Y(v))], fill=(60, 60, 70) if v != -14 else (90, 70, 40)); d.text((4, Y(v) - 8), f"{v}", fill=(180, 180, 180), font=font)
seen = None
for s in D["scenes"]:
    if s["part"] != seen:
        d.line([(X(s["start"]), 10), (X(s["start"]), H - B)], fill=(70, 90, 120)); d.text((X(s["start"]) + 3, H - B + 4), s["part"], fill=(160, 190, 230), font=font); seen = s["part"]
prev = None
for t, v in pts:
    v = max(v, -48)
    if prev: d.line([prev, (X(t), Y(v))], fill=(250, 210, 90), width=1)
    prev = (X(t), Y(v))
d.text((L, H - 18), "短時間ラウドネス（3秒窓, LUFS）。茶色の線=-14。急な上昇（2秒で+8LU以上）=赤丸", fill=(220, 220, 220), font=font)
for i, (t, v) in enumerate(pts):
    lo = min(x[1] for x in pts[max(0, i - 20):i + 1])
    if v - lo >= 8 and v > -30 and t > 5:
        d.ellipse([X(t) - 5, Y(v) - 5, X(t) + 5, Y(v) + 5], outline=(255, 70, 70), width=2)
img.save(out); print(out, len(pts))
