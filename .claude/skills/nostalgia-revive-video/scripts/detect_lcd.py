#!/usr/bin/env python3
"""画像の中の「小さな画面」（電子ペットの液晶など）の位置を取り、assets/overlay/lcd.json に書く。
render.py はこの位置にドット絵（overlay）を描く。

  PROJ=作品フォルダ python3 detect_lcd.py S03 --seed 0.565 0.50 [--tol 34] [--rot 4.0]

--seed  画面の内側の1点（画像に対する割合 x y）。画像を開いて、画面の真ん中あたりを指定する
--tol   色の許容差（画面の地色からこの差までを同じ画面とみなす）。広がりすぎたら下げる、足りなければ上げる
--rot   ドット絵の傾き（度、＋で反時計回り）。画面が傾いているときに目で合わせる
確認用に work/lcd_<ID>.jpg（検出範囲を赤枠で描いた拡大図）を書き出すので、必ず開いて確かめる。
"""
import json, os, sys, argparse
from collections import deque
import numpy as np
from PIL import Image, ImageDraw
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("id"); ap.add_argument("--seed", nargs=2, type=float, required=True)
ap.add_argument("--tol", type=float, default=34); ap.add_argument("--rot", type=float, default=0.0)
a = ap.parse_args()
im = np.asarray(Image.open(os.path.join(ROOT, "assets/img", a.id + ".png")).convert("RGB")).astype(np.int16)
H, W, _ = im.shape
x0, y0 = int(a.seed[0] * W), int(a.seed[1] * H)
ref = im[max(0, y0 - 2):y0 + 3, max(0, x0 - 2):x0 + 3].reshape(-1, 3).mean(0)
mask = np.abs(im - ref).sum(2) < a.tol
seen = np.zeros_like(mask); q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
while q:   # 塗りつぶし（つながった同じ色の範囲）
    y, x = q.popleft(); pts.append((y, x))
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        yy, xx = y + dy, x + dx
        if 0 <= yy < H and 0 <= xx < W and not seen[yy, xx] and mask[yy, xx]:
            seen[yy, xx] = True; q.append((yy, xx))
    if len(pts) > 400000: break
P = np.array(pts, float); ys, xs = P[:, 0], P[:, 1]
cx, cy = xs.mean(), ys.mean()
w = np.percentile(xs, 97) - np.percentile(xs, 3); h = np.percentile(ys, 97) - np.percentile(ys, 3)
info = dict(center=[round(float(cx) / W, 4), round(float(cy) / H, 4)], size=[round(float(w) / W, 4), round(float(h) / H, 4)], rot=a.rot, color=[int(c) for c in ref], px=len(pts))
path = os.path.join(ROOT, "assets/overlay/lcd.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
lcd = json.load(open(path)) if os.path.exists(path) else {}
lcd[a.id] = info
json.dump(lcd, open(path, "w"), indent=1)
print(a.id, info)
if len(pts) > 0.05 * W * H: print("※ 範囲が広すぎます。--tol を下げるか、--seed を画面の内側にずらしてください")
img = Image.open(os.path.join(ROOT, "assets/img", a.id + ".png")).convert("RGB"); d = ImageDraw.Draw(img)
d.rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], outline=(255, 0, 0), width=3)
d.ellipse([x0 - 5, y0 - 5, x0 + 5, y0 + 5], outline=(0, 255, 255), width=2)
m = max(w, h) * 1.6
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
img.crop((int(max(0, cx - m)), int(max(0, cy - m)), int(min(W, cx + m)), int(min(H, cy + m)))).save(os.path.join(ROOT, "work", f"lcd_{a.id}.jpg"), quality=90)
