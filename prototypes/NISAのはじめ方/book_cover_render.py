"""消したあとの本の絵（cleaned.png）に、新しい名前を明朝体（Noto Serif JP）で入れる。
文字の実際の上端・下端（インク）を測って、元の2行と同じ位置・高さになるように2回に分けて合わせる。
使い方：python3 render.py 消したあとの画像 書き出す画像"""
import sys, json, pathlib
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

SRC, OUT = (pathlib.Path(a).resolve() for a in sys.argv[1:3])
FONT = pathlib.Path(__file__).resolve().parent / "node_modules/@fontsource/noto-serif-jp"
CREAM, ORANGE = "rgb(242,235,218)", "rgb(230,170,98)"
CX = 510                                    # 表紙の真ん中（元の2行の中心）
# 行：(文字, 文字の大きさ, 太さ, 色, 文字の上端の目標, 下端の目標)
LINES = [
    ("ゼロからわかる", 42, 600, ORANGE, 260, 297),
    ("完全攻略", 104, 600, CREAM, 508, 600),
    ("ガイド", 104, 600, CREAM, 624, 716),
]

def page(tops):
    divs = "".join(
        f'<div class="t" style="top:{t}px;font-size:{s}px;font-weight:{wt};color:{c}">{txt}</div>'
        for (txt, s, wt, c, _, _), t in zip(LINES, tops))
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="{(FONT / '600.css').as_uri()}">
<style>html,body{{margin:0;padding:0}} body{{width:1024px;height:1536px;position:relative;background:url('{SRC.as_uri()}') no-repeat 0 0/1024px 1536px}}
.t{{position:absolute;left:0;width:{CX * 2}px;text-align:center;line-height:1;white-space:nowrap;font-family:"Noto Serif JP",serif;letter-spacing:.04em;text-indent:.04em}}</style>
</head><body>{divs}</body></html>"""

def ink(img, y_from, y_to, color):
    """y_from〜y_to の間で、指定の色に近い画素がある行の、いちばん上と下"""
    a = np.asarray(img.convert("RGB")).astype(int)[y_from:y_to, 150:880]
    target = np.array(color)
    near = (np.abs(a - target).sum(axis=2) < 90)
    rows = np.where(near.sum(axis=1) > 0)[0]
    cols = np.where(near.sum(axis=0) > 0)[0]
    return (int(rows.min()) + y_from, int(rows.max()) + y_from, int(cols.min()) + 150, int(cols.max()) + 150) if rows.size else None

work = OUT.parent / "_render.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1024, "height": 1536}, device_scale_factor=1)
    # 1行ずつ、背景なしで描いて、文字の上端が div の上からどれだけ下にあるか（と高さ）を測る
    tops = []
    for i, (txt, s, wt, c, tt, tb) in enumerate(LINES):
        only = [(t if k == i else -9999) for k, t in enumerate([200] * len(LINES))]
        work.write_text(page(only).replace(f"background:url('{SRC.as_uri()}') no-repeat 0 0/1024px 1536px", "background:#000"), encoding="utf-8")
        pg.goto(work.as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT))
        a = np.asarray(Image.open(OUT).convert("L")).astype(int)
        rows = np.where((a > 60).sum(axis=1) > 0)[0]; cols = np.where((a > 60).sum(axis=0) > 0)[0]
        off, hgt = int(rows.min()) - 200, int(rows.max() - rows.min() + 1)
        print(f"  {txt}: ink offset {off}px, ink height {hgt}px (target {tb - tt + 1}), x {cols.min()}-{cols.max()}")
        tops.append(tt - off)
    work.write_text(page(tops), encoding="utf-8")
    pg.goto(work.as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT))
    b.close()
print("tops", tops, "wrote", OUT)
