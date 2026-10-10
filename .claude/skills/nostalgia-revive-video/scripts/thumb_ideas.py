#!/usr/bin/env python3
"""サムネイル案をまとめて作る（文字の大きさは自動で合わせる）。比べて選ぶための一覧画像も作る。

  PROJ=作品フォルダ python3 thumb_ideas.py ideas.json     → out/サムネ案/<name>.jpg と out/サムネ案_一覧.jpg

ideas.json の例：
[
 {"name": "A_これが幸せだった", "scene": "S25", "text": ["これが、幸せだった。"], "pos": "bottom"},
 {"name": "B_写真が動き出す", "scene": "P02", "text": ["何も特別じゃなかった、", "忘れられない夏休み"], "pos": "top", "split": true, "stamp": "'97 7 26"}
]
  text  … 1〜2行。1行目を大きく、2行目は少し小さく。画面幅の9割に収まるよう自動で縮める
  pos   … top / bottom（文字の位置。下に置くときは下側を少し暗くして読みやすくする）
  split … true で「左：色あせたプリント写真／右：今の色」の比較（蘇らせた系の定番）
  stamp … 写真の日付（オレンジの7セグ数字）を右下に
  crop  … [x0, y0, x1, y1]（画像に対する割合）で寄る
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
W, H = 1280, 720
out_dir = os.path.join(ROOT, "out", "サムネ案"); os.makedirs(out_dir, exist_ok=True)

def fit_font(text, max_w, size):
    while size > 24:
        f = ImageFont.truetype(FONT, size)
        if f.getbbox(text)[2] - f.getbbox(text)[0] <= max_w: return f
        size -= 4
    return ImageFont.truetype(FONT, size)

def base_image(idea):
    sid = idea["scene"]
    src = next((s.get("img") or s["id"] for s in render.SC if s["id"] == sid), sid)
    img = render.load_scene_image(src)
    if idea.get("crop"):
        x0, y0, x1, y1 = idea["crop"]; w, h = img.size
        img = img.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    img = img.resize((W, H), Image.LANCZOS).convert("RGB")
    if idea.get("split"):   # 左半分を色あせたプリントに
        arr = np.asarray(img).astype(np.float32) / 255
        old = render.print_look(np.asarray(img.resize((render.OW, render.OH))).astype(np.float32) / 255, 7)
        lum = old.mean(axis=2, keepdims=True)
        old = lum + (old - lum) * 0.35                                   # さらに色を抜いて、セピア寄りに
        old = old * np.array([1.08, 0.97, 0.80], np.float32) + 0.03
        old = Image.fromarray((np.clip(old, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
        mask = Image.new("L", (W, H), 0); ImageDraw.Draw(mask).rectangle([0, 0, W // 2, H], fill=255)
        img = Image.composite(old, img, mask)
        ImageDraw.Draw(img).line([(W // 2, 0), (W // 2, H)], fill=(250, 246, 236), width=4)   # 境目に白い線
    return img.convert("RGBA")

def draw_text(img, lines, pos):
    d = ImageDraw.Draw(img)
    sizes = [118, 74]
    fonts = [fit_font(t, int(W * 0.9), sizes[min(k, 1)]) for k, t in enumerate(lines)]
    heights = [f.getbbox(t)[3] - f.getbbox(t)[1] for f, t in zip(fonts, lines)]
    gap = 22; total = sum(heights) + gap * (len(lines) - 1)
    y = 60 if pos == "top" else H - 70 - total
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0)); sd = ImageDraw.Draw(shade)
    band = (0, max(0, y - 60), W, min(H, y + total + 60))
    for k in range(band[1], band[3]):   # 文字の後ろだけ、ふんわり暗く
        a = 1 - abs((k - (band[1] + band[3]) / 2) / ((band[3] - band[1]) / 2 + 1))
        sd.line([(0, k), (W, k)], fill=(8, 10, 18, int(95 * max(0, a))))
    img.alpha_composite(shade)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ds = ImageDraw.Draw(sh)
    yy = y
    for f, t, h in zip(fonts, lines, heights):
        bb = f.getbbox(t); x = (W - (bb[2] - bb[0])) / 2 - bb[0]
        ds.text((x, yy - bb[1] + 4), t, font=f, fill=(10, 14, 26, 210)); yy += h + gap
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(7)))
    d = ImageDraw.Draw(img); yy = y
    for f, t, h in zip(fonts, lines, heights):
        bb = f.getbbox(t); x = (W - (bb[2] - bb[0])) / 2 - bb[0]
        d.text((x, yy - bb[1]), t, font=f, fill=(255, 252, 244, 255)); yy += h + gap
    return img

made = []
for idea in ideas:
    img = base_image(idea)
    if idea.get("text"): img = draw_text(img, idea["text"], idea.get("pos", "bottom"))
    if idea.get("stamp"):
        st = render.datestamp(idea["stamp"], scale=1.0)
        img.alpha_composite(st, (W - st.width - 18, H - st.height - 6) if idea.get("pos", "bottom") == "top" else (W - st.width - 18, 8))
    p = os.path.join(out_dir, idea["name"] + ".jpg"); img.convert("RGB").save(p, quality=92); made.append((idea["name"], p)); print(p)
cols = 3; rows = (len(made) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 650, rows * 400), (20, 20, 24)); d = ImageDraw.Draw(sheet)
lab = ImageFont.truetype(FONT, 22)
for k, (name, p) in enumerate(made):
    im = Image.open(p).resize((640, 360), Image.LANCZOS); x = (k % cols) * 650 + 5; y = (k // cols) * 400 + 5
    sheet.paste(im, (x, y)); d.text((x, y + 364), name, fill=(255, 230, 140), font=lab)
sp = os.path.join(ROOT, "out", "サムネ案_一覧.jpg"); sheet.save(sp, quality=88); print(sp)
