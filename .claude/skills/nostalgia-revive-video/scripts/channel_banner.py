#!/usr/bin/env python3
"""チャンネルバナー（2560×1440）を作り、スマホ・パソコン・テレビでの見え方を一覧にする。

YouTube のバナーは 2560×1440 で作るが、スマホとパソコンで見えるのは中央の帯だけ：
  スマホ：中央の 1546×423（x 507〜2053, y 508〜931）だけ。題字・添え書きは必ずこの中に置く
  パソコン：横いっぱい×同じ高さの帯（2560×423）／テレビ：全体
ユーザーが作ったバナー（全体の中央付近に題字がある）は、たいていスマホで題字が切れる。
文字入りの画像なら erase で元の文字を消し（OpenCV の inpaint）、帯の中に打ち直す。

  PROJ=作品 python3 channel_banner.py banner.json
  → out/チャンネル/バナー_<name>_2560x1440.jpg と out/チャンネル/バナーの見え方.jpg

banner.json の例（実例：video-1997/v2/チャンネルバナー.json）：
{
 "name": "記憶の路地裏",
 "bg": "work/banner/banner_src.png",
 "erase": [[500, 222, 1185, 350, 5], [580, 352, 1105, 410, 9]],
 "dark": 120,
 "scale": 1.08, "offset": [102, 0],
 "lines": [
  {"text": "記憶の路地裏", "font": "ShipporiMincho_800ExtraBold.ttf", "size": 104, "track": 10, "top": 522, "cx": 1291},
  {"text": "あの頃の記憶に、もう一度。", "font": "ShipporiMincho_700Bold.ttf", "size": 38, "track": 3, "top": 628, "cx": 1291}
 ],
 "color": [42, 21, 8], "glow": [255, 236, 196]
}
  erase  … 元の画像の画素で [x0, y0, x1, y1, 広げる幅]。その範囲の暗い画素（明るさ dark 未満）を文字とみなして消す
  scale / offset … 背景を 2560 幅に合わせたあと、さらに scale 倍して offset から 2560×1440 を切り出す
                   （太陽や人物の位置を帯の中で動かすのに使う。拡大しすぎるとテレビで足元が切れる）
  lines  … 1行ずつ。top は文字の上端の y、cx は中心の x（left を書くと左ぞろえ）。帯からはみ出すと止まる
太字の明朝は npm の @expo-google-fonts/shippori-mincho に 700Bold・800ExtraBold がある（setup_fonts.sh と同じ取り方）。
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = os.environ.get("PROJ") or os.getcwd()
if len(sys.argv) != 2: sys.exit(__doc__)
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
W, H = 2560, 1440
SAFE = (507, 508, 2053, 931)
FONTS = os.path.join(ROOT, "assets", "fonts")
P = lambda p: p if os.path.isabs(p) else os.path.join(ROOT, p)

src = Image.open(P(cfg["bg"])).convert("RGB")
if cfg.get("erase"):
    try:
        import cv2, numpy as np
    except ImportError:
        sys.exit("文字を消すには OpenCV が要ります：pip install opencv-python-headless")
    img = cv2.cvtColor(np.asarray(src), cv2.COLOR_RGB2BGR)
    L = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = np.zeros(L.shape, np.uint8)
    for (x0, y0, x1, y1, grow) in cfg["erase"]:
        m = (L[y0:y1, x0:x1] < cfg.get("dark", 120)).astype(np.uint8) * 255
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
        mask[y0:y1, x0:x1] = np.maximum(mask[y0:y1, x0:x1], m)
    out = cv2.inpaint(img, mask, 12, cv2.INPAINT_TELEA).astype(np.float32)
    soft = cv2.GaussianBlur(mask, (0, 0), 3).astype(np.float32)[..., None] / 255
    out += np.random.default_rng(7).normal(0, 3.0, out.shape).astype(np.float32) * soft   # 塗った所に細かい粒
    src = Image.fromarray(cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_BGR2RGB))
    print("消した画素：", int((mask > 0).sum()))

k = W / src.width * cfg.get("scale", 1.0)
big = src.resize((round(src.width * k), round(src.height * k)), Image.LANCZOS)
ox, oy = cfg.get("offset", [0, 0])
if big.width < ox + W or big.height < oy + H:
    sys.exit("scale と offset の組み合わせで、2560×1440 が背景からはみ出します")
img = big.crop((ox, oy, ox + W, oy + H)).convert("RGBA")
color = tuple(cfg.get("color", [42, 21, 8])) + (255,)
glow_rgb = tuple(cfg.get("glow", [255, 236, 196]))

for ln in cfg["lines"]:
    f = ImageFont.truetype(os.path.join(FONTS, ln["font"]), ln["size"])
    text, track = ln["text"], ln.get("track", 0)
    asc = min(f.getbbox(ch)[1] for ch in text)
    w = sum(f.getbbox(ch)[2] - f.getbbox(ch)[0] for ch in text) + track * (len(text) - 1)
    h = max(f.getbbox(ch)[3] for ch in text) - asc
    x = ln["left"] if "left" in ln else ln["cx"] - w / 2
    top = ln["top"]
    if not (SAFE[0] <= x and x + w <= SAFE[2] and SAFE[1] <= top and top + h <= SAFE[3]):
        sys.exit(f"「{text}」がスマホで見える範囲からはみ出します：{round(x)},{top}〜{round(x + w)},{top + h}（範囲 {SAFE}）")
    big_text = ln["size"] >= 60
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    ink = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ink)
    xx = x
    for ch in text:   # 字間つきで1字ずつ。後ろに淡い光（明るい空でも暗い所でも読めるように）
        bb = f.getbbox(ch)
        for dx, dy in ((0, 0), (2, 0), (-2, 0), (0, 2), (0, -2)):
            g.text((xx - bb[0] + dx, top - asc + dy), ch, font=f, fill=glow_rgb + ((170,) if big_text else (230,)))
        d.text((xx - bb[0], top - asc), ch, font=f, fill=color)
        xx += bb[2] - bb[0] + track
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(10 if big_text else 7)))
    img.alpha_composite(ink)
    print(f"「{text}」：{round(x)},{top}〜{round(x + w)},{top + h}")

od = os.path.join(ROOT, "out", "チャンネル"); os.makedirs(od, exist_ok=True)
out = os.path.join(od, f"バナー_{cfg['name']}_2560x1440.jpg")
img.convert("RGB").save(out, quality=92); print(out)

# 見え方：スマホ（iPhone の横幅）・パソコン・テレビ（全体。水色の枠＝スマホで見える範囲）
fp = os.path.join(FONTS, "ShipporiMincho_500Medium.ttf")
lab = ImageFont.truetype(fp, 30) if os.path.exists(fp) else ImageFont.load_default()
full = img.convert("RGB")
mob = full.crop(SAFE).resize((1170, round(1170 * 423 / 1546)), Image.LANCZOS)
desk = full.crop((0, SAFE[1], W, SAFE[3])).resize((1170, round(1170 * 423 / W)), Image.LANCZOS)
tv = full.resize((1170, 658), Image.LANCZOS)
ImageDraw.Draw(tv).rectangle([SAFE[0] * 1170 / W, SAFE[1] * 658 / H, SAFE[2] * 1170 / W, SAFE[3] * 658 / H], outline=(80, 200, 255), width=3)
rows = [("スマホ（いちばん多く見られる大きさ）", mob), ("パソコン", desk), ("テレビ（全体。水色の枠＝スマホで見える範囲）", tv)]
sheet = Image.new("RGB", (1210, sum(r.height + 56 for _, r in rows) + 10), (24, 24, 28)); d = ImageDraw.Draw(sheet); y = 10
for label, r in rows:
    d.text((20, y), label, fill=(255, 210, 120), font=lab); y += 44; sheet.paste(r, (20, y)); y += r.height + 12
sp = os.path.join(od, "バナーの見え方.jpg"); sheet.save(sp, quality=88); print(sp)
