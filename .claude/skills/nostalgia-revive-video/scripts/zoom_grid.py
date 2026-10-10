#!/usr/bin/env python3
"""画像を拡大して細かく見る（ロゴ・崩れた文字・手指の確認、fixes.json のぼかし範囲の決定）。

  PROJ=作品 python3 zoom_grid.py P02                       # 元の解像度のまま 3×2 に分けて work/zoom_P02_<行><列>.jpg
  PROJ=作品 python3 zoom_grid.py P02 --box 0.46 0.29 0.60 0.52 --scale 2
        # その範囲を2倍にして、1%ごとの目盛り（x=水色・上、y=黄色・左）を描く → work/zoom_P02_box.jpg
  PROJ=作品 python3 zoom_grid.py P02 --fixed ...            # fixes.json のぼかしを当てた後の画像で見る（直ったかの確認）

一覧の縮小表示では、小さなロゴ（実例：模型の箱の星マーク、1つ20〜40画素）は見えない。必ず元の解像度で見る。
目盛りの数字をそのまま fixes.json の blur [x0, y0, x1, y1, 半径] に使える。手や持ち物にかからないよう、範囲は細かく分ける。
"""
import argparse, json, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("id"); ap.add_argument("--tiles", default="3x2")
ap.add_argument("--box", nargs=4, type=float); ap.add_argument("--scale", type=float, default=2.0)
ap.add_argument("--fixed", action="store_true", help="fixes.json を当てた画像で見る")
a = ap.parse_args()
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
if a.fixed:
    os.environ["PROJ"] = ROOT; sys.argv = sys.argv[:1]; sys.path.insert(0, HERE)
    import render
    im = render.load_scene_image(a.id, raw=True).convert("RGB")
else:
    im = Image.open(os.path.join(ROOT, "assets/img", a.id + ".png")).convert("RGB")
W, H = im.size
tag = "_fixed" if a.fixed else ""
if a.box:
    x0, y0, x1, y1 = (int(a.box[0] * W), int(a.box[1] * H), int(a.box[2] * W), int(a.box[3] * H))
    cr = im.crop((x0, y0, x1, y1)); cr = cr.resize((int(cr.width * a.scale), int(cr.height * a.scale)), Image.LANCZOS)
    d = ImageDraw.Draw(cr)
    for k in range(int(a.box[0] * 100), int(a.box[2] * 100) + 1):
        X = (k / 100 * W - x0) * a.scale
        d.line([(X, 0), (X, cr.height)], fill=(0, 255, 255) if k % 5 == 0 else (0, 140, 140), width=1); d.text((X + 2, 2), str(k), fill=(0, 255, 255))
    for k in range(int(a.box[1] * 100), int(a.box[3] * 100) + 1):
        Y = (k / 100 * H - y0) * a.scale
        d.line([(0, Y), (cr.width, Y)], fill=(255, 255, 0) if k % 5 == 0 else (140, 140, 0), width=1); d.text((2, Y + 2), str(k), fill=(255, 255, 0))
    out = os.path.join(ROOT, "work", f"zoom_{a.id}{tag}_box.jpg"); cr.save(out, quality=92); print(out, cr.size)
else:
    nx, ny = map(int, a.tiles.split("x"))
    for j in range(ny):
        for i in range(nx):
            t = im.crop((int(i * W / nx), int(j * H / ny), int((i + 1) * W / nx), int((j + 1) * H / ny)))
            out = os.path.join(ROOT, "work", f"zoom_{a.id}{tag}_{j}{i}.jpg"); t.save(out, quality=90)
            print(out, f"x {i / nx:.3f}-{(i + 1) / nx:.3f}  y {j / ny:.3f}-{(j + 1) / ny:.3f}")
