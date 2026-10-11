#!/usr/bin/env python3
"""チャンネルのプロフィール画像（アイコン）を、作品の絵から作る。

  PROJ=作品フォルダ python3 channel_icon.py icon.json
      → out/アイコン/<name>.png（800×800）と、実際の表示の大きさで並べた確かめ用 out/アイコン_一覧.jpg

YouTube のアイコンは 800×800 推奨で、円に切り抜かれ、チャンネルページでは 100px 前後、
コメント欄では 24〜40px まで小さく表示される。小さくしても「何の絵か」が分かる、明るい一点のある絵がよい。
文字は小さいと読めないので、文字なし版も必ず作り、一覧で比べてから選ぶ。

icon.json の例：
[
 {"name": "A_路地の夜", "scene": "A05", "center": [0.44, 0.5], "size": 1.0},
 {"name": "B_名前入り", "scene": "A05", "center": [0.44, 0.5], "size": 1.0, "text": "記憶の路地裏", "text_x": 0.76},
 {"name": "C_明かりに寄る", "scene": "A05", "center": [0.30, 0.55], "size": 0.62}
]
  center … 切り抜く正方形の中心（画像に対する割合）
  size   … 正方形の一辺（画像の高さに対する割合。1.0 で高さいっぱい）
  text   … 名前（明朝）。text_dir="v" で縦書き（text_x＝列の中心、既定 0.76）、"h" で横書き（text_y＝行の中心、既定 0.80）
  glow   … 明かりのにじみの強さ（既定 0.35）
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
if len(sys.argv) != 2: sys.exit(__doc__)
ideas = json.load(open(sys.argv[1], encoding="utf-8"))
os.environ["PROJ"] = ROOT; sys.argv = sys.argv[:1]; sys.path.insert(0, HERE)
import render
FONT = os.path.join(ROOT, "assets/fonts/ShipporiMincho_500Medium.ttf")
S = 800
out_dir = os.path.join(ROOT, "out", "アイコン"); os.makedirs(out_dir, exist_ok=True)

def square(img, center, size):
    w, h = img.size
    side = int(min(w, h, size * h))
    cx, cy = int(center[0] * w), int(center[1] * h)
    x0 = min(max(0, cx - side // 2), w - side); y0 = min(max(0, cy - side // 2), h - side)
    return img.crop((x0, y0, x0 + side, y0 + side)).resize((S, S), Image.LANCZOS)

def glow(img, k):
    """明るい所のまわりを少しにじませる（小さく表示しても明かりが目に入るように）"""
    a = np.asarray(img).astype(np.float32) / 255
    b = np.asarray(img.filter(ImageFilter.GaussianBlur(18))).astype(np.float32) / 255
    b = np.clip(b - 0.45, 0, 1) / 0.55
    return Image.fromarray((np.clip(a + b * k * (1 - a), 0, 1) * 255).astype(np.uint8))

def round_vignette(img):
    """円の縁に向かって少し暗く（円に切り抜かれたとき、縁が明るく浮かないように）"""
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.sqrt((x - S / 2) ** 2 + (y - S / 2) ** 2) / (S / 2)
    v = 1 - 0.35 * np.clip((r - 0.62) / 0.38, 0, 1) ** 1.5
    a = np.asarray(img).astype(np.float32) * v[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def vertical_text(img, text, x_frac):
    img = img.convert("RGBA")
    n = len(text); fs = int(S * 0.62 / max(n, 1)); fs = min(fs, 96)
    f = ImageFont.truetype(FONT, fs)
    total = n * fs * 1.04; y = (S - total) / 2; x = x_frac * S
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0)); ds = ImageDraw.Draw(sh)
    tx = Image.new("RGBA", (S, S), (0, 0, 0, 0)); dt = ImageDraw.Draw(tx)
    for k, ch in enumerate(text):
        bb = f.getbbox(ch); cw = bb[2] - bb[0]
        px = x - cw / 2 - bb[0]; py = y + k * fs * 1.04 - bb[1] + (fs - (bb[3] - bb[1])) / 2
        if ch in "、。": px += fs * 0.55; py -= fs * 0.55   # 縦書きの句読点は右上へ
        ds.text((px + 2, py + 3), ch, font=f, fill=(6, 8, 14, 230))
        dt.text((px, py), ch, font=f, fill=(255, 246, 228, 255))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)))
    img.alpha_composite(tx)
    return img.convert("RGB")

def horizontal_text(img, text, y_frac):
    img = img.convert("RGBA")
    fs = 96
    while fs > 30:   # 円の中に収まる幅（その高さでの弦の長さの8割）まで小さくする
        f = ImageFont.truetype(FONT, fs); bb = f.getbbox(text)
        r = abs(y_frac - 0.5); chord = 2 * np.sqrt(max(0.0, 0.25 - r * r)) * S
        if bb[2] - bb[0] <= chord * 0.8: break
        fs -= 4
    x = (S - (bb[2] - bb[0])) / 2 - bb[0]; y = y_frac * S - (bb[3] + bb[1]) / 2
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0)); ImageDraw.Draw(sh).text((x + 2, y + 3), text, font=f, fill=(6, 8, 14, 230))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(6)))
    ImageDraw.Draw(img).text((x, y), text, font=f, fill=(255, 246, 228, 255))
    return img.convert("RGB")

made = []
for idea in ideas:
    base = render.load_scene_image(idea.get("scene"))
    img = square(base, idea.get("center", [0.5, 0.5]), idea.get("size", 1.0))
    img = glow(img, idea.get("glow", 0.35))
    img = round_vignette(img)
    if idea.get("text"):
        img = horizontal_text(img, idea["text"], idea.get("text_y", 0.80)) if idea.get("text_dir") == "h" \
            else vertical_text(img, idea["text"], idea.get("text_x", 0.76))
    p = os.path.join(out_dir, idea["name"] + ".png"); img.save(p); made.append((idea["name"], img)); print(p)

# 確かめ用：円に切り抜いて、実際の表示の大きさ（320・160・98・48・36px）で、暗い背景と明るい背景に並べる
sizes = [320, 160, 98, 48, 36]
def circ(im, s):
    im = im.resize((s, s), Image.LANCZOS); m = Image.new("L", (s * 4, s * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, s * 4 - 1, s * 4 - 1], fill=255)
    return im, m.resize((s, s), Image.LANCZOS)
row_h = 340; W = 30 + sum(s + 24 for s in sizes) + 10
sheet = Image.new("RGB", (W, row_h * 2 * len(made) + 10), (0, 0, 0)); d = ImageDraw.Draw(sheet)
lab = ImageFont.truetype(FONT, 22)
for k, (name, im) in enumerate(made):
    for j, bg in enumerate(((15, 15, 15), (255, 255, 255))):
        y0 = (k * 2 + j) * row_h
        d.rectangle([0, y0, W, y0 + row_h - 4], fill=bg)
        x = 20
        for s in sizes:
            c, m = circ(im, s); sheet.paste(c, (x, y0 + 10 + (320 - s) // 2), m); x += s + 24
        d.text((20, y0 + row_h - 34), f"{name}（{'暗い' if j == 0 else '明るい'}背景・320/160/98/48/36px）", fill=(255, 200, 80) if j == 0 else (120, 80, 0), font=lab)
sp = os.path.join(ROOT, "out", "アイコン_一覧.jpg"); sheet.save(sp, quality=90); print(sp)
