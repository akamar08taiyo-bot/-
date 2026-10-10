#!/usr/bin/env python3
"""映像を1コマずつ描いて ffmpeg に流す。

  PROJ=作品フォルダ python3 render.py --stills [--only S01 S02]   # 各カットの中間コマを work/stills/ に（確認用）
  PROJ=作品フォルダ python3 render.py --at P02:1.2 P02:4.0 S12:7   # 指定カットの指定秒を一覧に → work/test_frames.jpg
  PROJ=作品フォルダ python3 render.py --frames 0 900               # 指定範囲だけ動画に（テスト）
  PROJ=作品フォルダ python3 render.py --workers 4                  # 全編 → work/video.mp4（細かく分けて並列）

時刻はすべて scenes.json の行（カット）基準。乱数はシード固定、時計・CSSアニメは使わない。
"""
import json, os, sys, math, argparse, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
# 作品フォルダ（scenes.json・assets・out・work がある所）。環境変数 PROJ（なければ今のフォルダ）
ROOT = os.environ.get("PROJ") or os.getcwd()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
def _load(rel):
    p = os.path.join(ROOT, rel)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
FIX = _load("fixes.json")                 # 画像の修正（ぼかし・切り取り・日付の描き込み）
LCD = _load("assets/overlay/lcd.json")    # 小さな画面の位置（detect_lcd.py）
FPS = D["fps"]; OW, OH = D["size"]
SC = D["scenes"]
TOTAL = D["total"]
NFR = int(round(TOTAL * FPS))
U = OW / 1920.0   # 文字・粒・雨などの大きさは 1920×1080 基準で書き、この倍率で合わせる
META = dict(title="", subtitle="", end_question="", afterglow_title="", afterglow_sub="", present_era="2026", past_era="1997")
META.update(D.get("meta", {}))
PRESENT = str(META["present_era"])   # この era のカットは「現在」の色（少し冷たく落ち着いた色）
FONT_TITLE = os.path.join(ROOT, "assets/fonts/ShipporiMincho_500Medium.ttf")
FONT_BODY = os.path.join(ROOT, "assets/fonts/ShipporiMincho_400Regular.ttf")
for _f in (FONT_TITLE, FONT_BODY):
    if not os.path.exists(_f):
        sys.exit(f"フォントがありません: {_f}\n  bash scripts/setup_fonts.sh {os.path.join(ROOT, 'assets/fonts')} を先に実行してください")

def ease(p):
    p = min(1.0, max(0.0, p))
    return 0.5 - 0.5 * math.cos(math.pi * p)

def smooth(a, b, x):
    if x <= a: return 0.0
    if x >= b: return 1.0
    t = (x - a) / (b - a)
    return t * t * (3 - 2 * t)

# ───────── ドット絵（オリジナルの電子ペット「ぴこ」。16×16、#=点） ─────────
# 新しい絵は SPR に16行の文字列で足し、ANIM に（秒, 絵の名前）の並びを足す。カットの overlay にその名前を書く。
SPR = {
 "idle": ["................", "................", ".....######.....", "....#......#....", "...#........#...", "..#..##..##..#..",
          "..#..##..##..#..", "..#..........#..", "..#...#..#...#..", "..#....##....#..", "...#........#...", "....########....",
          "....#.#..#.#....", "................", "................", "................"],
 "eat1": ["................", "................", ".....######.....", "....#......#....", "...#........#...", "..#..##..##..#..",
          "..#..##..##..#..", "..#..........#.#", "..#...####...###", "..#...#..#...###", "...#...##...#...", "....########....",
          "....#.#..#.#....", "................", "................", "................"],
 "eat2": ["................", "................", "................", ".....######.....", "....#......#....", "...#........#...",
          "..#..##..##..#..", "..#..........#..", "..#...####...#..", "..#....##....#..", "...#........#...", "....########....",
          "....#.#..#.#....", "................", "................", "................"],
 "heart": ["................", "................", ".....######.....", "....#......#....", "...#........#...", "..#..#....#..#..",
           "..#.#.#..#.#.#..", "..#..........#..", "..#...#..#...#..", "..#....##....#..", "...#........#...", "....########....",
           "....#.#..#.#....", "..##.##.........", "..#####.........", "...###.........."],
 "ghost1": ["......####......", ".....#....#.....", "......####......", ".....######.....", "....#......#....", "...#........#...",
            "..#..........#..", "..#..##..##..#..", "..#..........#..", "..#....##....#..", "..#..........#..", "..#..........#..",
            "..#.##.##.##.#..", "..##..#..#..##..", "................", "................"],
 "ghost2": ["................", "......####......", ".....#....#.....", "......####......", ".....######.....", "....#......#....",
            "...#........#...", "..#..........#..", "..#..##..##..#..", "..#..........#..", "..#....##....#..", "..#..........#..",
            "..#..........#..", "..#.##.##.##.#..", "..##..#..#..##..", "................"],
 "egg1": ["................", "................", "......####......", ".....#....#.....", "....#......#....", "....#..##..#....",
          "...#..####..#...", "...#........#...", "...#.##..##.#...", "...#.##..##.#...", "...#........#...", "....#......#....",
          ".....######.....", "................", "................", "................"],
 "egg2": ["................", "................", ".....####.......", "....#....#......", "...#......#.....", "...#..##..#.....",
          "..#..####..#....", "..#........#....", "..#.##..##.#....", "..#.##..##.#....", "..#........#....", "...#......#.....",
          "....######......", "................", "................", "................"],
 "egg3": ["................", "................", ".......####.....", "......#....#....", ".....#......#...", ".....#..##..#...",
          "....#..####..#..", "....#........#..", "....#.##..##.#..", "....#.##..##.#..", "....#........#..", ".....#......#...",
          "......######....", "................", "................", "................"],
}
ANIM = {
    "pet_eat":   [(0.0, "idle"), (1.6, "eat1"), (2.1, "eat2"), (2.6, "eat1"), (3.1, "eat2"), (3.6, "eat1"), (4.1, "heart"), (5.6, "idle")],
    "pet_ghost": [(0.0, "ghost1"), (0.7, "ghost2"), (1.4, "ghost1"), (2.1, "ghost2"), (2.8, "ghost1"), (3.5, "ghost2"), (4.2, "ghost1"), (4.9, "ghost2"), (5.6, "ghost1"), (6.3, "ghost2"), (7.0, "ghost1"), (7.7, "ghost2"), (8.4, "ghost1")],
    "pet_egg":   [(0.0, None), (2.2, "egg1"), (3.2, "egg2"), (3.7, "egg1"), (4.2, "egg3"), (4.7, "egg1"), (5.7, "egg2"), (6.2, "egg1"), (6.7, "egg3"), (7.2, "egg1")],
}

def sprite_img(name, px, alpha=235):
    rows = SPR[name]
    n = len(rows)
    im = Image.new("RGBA", (n * px + 4 * px, n * px + 4 * px), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink = (38, 46, 38)
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "#":
                # LCDの残像（右下に薄い影）
                d.rectangle([x * px + 2 * px + px // 3, y * px + 2 * px + px // 3, x * px + 2 * px + px - 1 + px // 3, y * px + 2 * px + px - 1 + px // 3], fill=ink + (40,))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c == "#":
                g = max(1, px // 10)
                d.rectangle([x * px + 2 * px, y * px + 2 * px, x * px + 2 * px + px - 1 - g, y * px + 2 * px + px - 1 - g], fill=ink + (alpha,))
    return im

def pet_frame(kind, t):
    seq = ANIM[kind]
    cur = None
    for (ts, name) in seq:
        if t >= ts: cur = name
    return cur

def apply_lcd(base, sid, kind, t):
    info = LCD.get(sid)
    if not info: return base
    name = pet_frame(kind, t)
    if name is None: return base
    W, H = base.size
    cx, cy = info["center"][0] * W, info["center"][1] * H
    sw = info["size"][0] * W if info["size"][0] == info["size"][0] else 100
    sh = info["size"][1] * H if info["size"][1] == info["size"][1] else 100
    side = min(sw, sh) * 0.80
    px = max(2, int(side / 16))
    spr = sprite_img(name, px)
    # 液晶の地色に合わせて少しだけ暗く
    spr = spr.rotate(info.get("rot", 0.0), resample=Image.BICUBIC, expand=True)   # ＋で反時計回り
    bob = 0
    out = base.copy()
    out.paste(spr, (int(cx - spr.width / 2), int(cy - spr.height / 2 + bob)), spr)
    return out

# ───────── 写真の日付（フィルムカメラ風のオレンジの数字） ─────────
SEG = {"0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcfgd"}

def seg_poly(x0, y0, x1, y1, th):
    """太さ th の線分を、端を斜めに切った六角形で"""
    if abs(x1 - x0) > abs(y1 - y0):  # 横
        y = (y0 + y1) / 2; h = th / 2
        return [(x0, y), (x0 + h, y - h), (x1 - h, y - h), (x1, y), (x1 - h, y + h), (x0 + h, y + h)]
    x = (x0 + x1) / 2; h = th / 2
    return [(x, y0), (x + h, y0 + h), (x + h, y1 - h), (x, y1), (x - h, y1 - h), (x - h, y0 + h)]

def seg_digit(d, x, y, w, h, ch, col, th):
    g = th * 0.35
    P = {"a": (x + g, y, x + w - g, y), "b": (x + w, y + g, x + w, y + h / 2 - g), "c": (x + w, y + h / 2 + g, x + w, y + h - g),
         "d": (x + g, y + h, x + w - g, y + h), "e": (x, y + h / 2 + g, x, y + h - g), "f": (x, y + g, x, y + h / 2 - g),
         "g": (x + g, y + h / 2, x + w - g, y + h / 2)}
    for sname in SEG.get(ch, ""):
        d.polygon(seg_poly(*P[sname], th), fill=col)

def datestamp(text="'97 8 3", scale=1.0):
    h = 70 * scale; w = 38 * scale; th = 10 * scale; gap = 18 * scale
    W = int((len(text) + 2) * (w + gap) + 60 * scale); Hh = int(h + 60 * scale)
    im = Image.new("RGBA", (W, Hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = (255, 146, 38, 255)
    x = 30 * scale; y = 30 * scale
    for ch in text:
        if ch == "'":
            d.polygon(seg_poly(x + w * 0.35, y, x + w * 0.35, y + h * 0.28, th * 0.9), fill=col)
            x += w * 0.75; continue
        if ch == " ":
            x += w * 1.25; continue
        # 少し斜体（フィルム写真の日付っぽく）
        seg_digit(d, x, y, w, h, ch, col, th)
        x += w + gap
    im = im.transform(im.size, Image.AFFINE, (1, 0.08, -0.08 * Hh / 2, 0, 1, 0), resample=Image.BICUBIC)
    core = im.filter(ImageFilter.GaussianBlur(0.9 * scale))
    glow = im.filter(ImageFilter.GaussianBlur(7 * scale))
    ga = np.asarray(glow).astype(np.float32); ga[..., 0] = 255; ga[..., 1] *= 0.55; ga[..., 2] *= 0.3; ga[..., 3] *= 0.9
    glow = Image.fromarray(ga.clip(0, 255).astype(np.uint8))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(glow); out.alpha_composite(core)
    return out

def draw_stamp(img, st):
    """画像の中の写真（手に持ったプリントなど）に日付を描き込む。fixes.json の "stamp"：
    {"text": "'97 8 3", "x": 0.77, "y": 0.81, "rot": 4.2, "scale": 1.25}（x,y は日付の中心、画像に対する割合）"""
    W, H = img.size
    im = datestamp(st.get("text", "'97 8 3"), scale=st.get("scale", 1.0) * W / 2752).rotate(st.get("rot", 0.0), resample=Image.BICUBIC, expand=True)
    img.alpha_composite(im, (int(st.get("x", 0.8) * W - im.width / 2), int(st.get("y", 0.85) * H - im.height / 2)))
    return img

# ───────── 画像の読み込みと修正 ─────────
_cache = {}
def load_scene_image(sid, raw=False):
    """修正済み・色調整済み・にじみ焼き込み済みのRGB画像（raw=True で色調整前のRGBA）"""
    key = (sid, raw)
    if key in _cache: return _cache[key]
    p = os.path.join(ROOT, "assets/img", sid + ".png")
    img = Image.open(p).convert("RGBA")
    W, H = img.size
    fx = FIX.get(sid, {})
    for (a, b, c, d, rad) in fx.get("blur", []):
        box = (int(a * W), int(b * H), int(c * W), int(d * H))
        reg = img.crop(box)
        bl = reg.filter(ImageFilter.GaussianBlur(rad))
        m = Image.new("L", reg.size, 0)
        ImageDraw.Draw(m).rectangle([6, 6, reg.size[0] - 6, reg.size[1] - 6], fill=255)
        m = m.filter(ImageFilter.GaussianBlur(5))
        img.paste(bl, box[:2], m)
    if fx.get("stamp"):
        img = draw_stamp(img, fx["stamp"])
    if raw:
        _cache[key] = img
        return img
    # カメラ窓が出力の1.12倍になるよう、先に高品質で縮小（動かしたときのチラつき防止と高速化）
    cx, cy, bw, bh = base_window(sid, W, H)
    f = min(1.0, OW * 1.12 / bw)
    rgb = img.convert("RGB")
    if f < 0.98:
        rgb = rgb.resize((int(W * f), int(H * f)), Image.LANCZOS)
    era = next((sc_["era"] for sc_ in SC if sc_["id"] == sid), META["past_era"])
    arr = np.asarray(rgb).astype(np.float32) / 255
    arr = grade(arr, era)
    arr = bloom_src(arr)
    rgb = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    _cache[key] = rgb
    return rgb

def base_window(sid, W, H):
    """カメラが動ける範囲（16:9に合わせる）"""
    x0, y0, x1, y1 = FIX.get(sid, {}).get("crop", [0, 0, 1, 1])
    x0 *= W; x1 *= W; y0 *= H; y1 *= H
    w, h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if w / h > 16 / 9: w = h * 16 / 9
    else: h = w * 9 / 16
    return cx, cy, w, h

MOVES = {
    #        z0    z1    dx0    dx1   dy0   dy1   （dx,dyは窓幅に対する割合）
    "in":   (1.00, 1.075, 0, 0, 0, 0),
    "out":  (1.075, 1.00, 0, 0, 0, 0),
    "in_slow": (1.00, 1.06, 0, 0, 0, 0),
    "out_slow": (1.06, 1.00, 0, 0, 0, 0),
    "up":   (1.08, 1.08, 0, 0, 0.032, -0.032),
    "pan_r": (1.09, 1.09, -0.035, 0.035, 0, 0),
    "pan_l": (1.09, 1.09, 0.035, -0.035, 0, 0),
    "pan_r_slow": (1.08, 1.08, -0.03, 0.03, 0, 0),
    "pan_l_slow": (1.08, 1.08, 0.03, -0.03, 0, 0),
    "none": (1.0, 1.0, 0, 0, 0, 0),
}

def camera_frame(img, sid, move, p):
    W, H = img.size
    cx, cy, bw, bh = base_window(sid, W, H)
    z0, z1, dx0, dx1, dy0, dy1 = MOVES.get(move, MOVES["in"])
    e = ease(p)
    z = z0 + (z1 - z0) * e
    w, h = bw / z, bh / z
    ccx = cx + (dx0 + (dx1 - dx0) * e) * bw
    ccy = cy + (dy0 + (dy1 - dy0) * e) * bh
    # はみ出さないように
    x0, _ = FIX.get(sid, {}).get("crop", [0, 0, 1, 1])[0:2]
    ccx = min(max(ccx, w / 2), W - w / 2); ccy = min(max(ccy, h / 2), H - h / 2)
    # 拡大・平行移動だけなので resize(box=...) が速くて正確（小数座標OK、縮小時はエイリアスも抑える）
    return img.resize((OW, OH), Image.BILINEAR, box=(ccx - w / 2, ccy - h / 2, ccx + w / 2, ccy + h / 2))

# ───────── 効果（光の粒・光の筋・雨・ゆらぎ） ─────────
def sprite_dot(r):
    s = int(r * 4) + 1
    y, x = np.mgrid[-s:s + 1, -s:s + 1]
    return np.exp(-(x * x + y * y) / (2 * r * r)).astype(np.float32)

DOTS = [sprite_dot(max(0.6, r * U)) for r in (1.2, 1.8, 2.6, 3.6)]

def fx_dust(frame, t, seed, warm=(1.0, 0.95, 0.82), n=46, strength=0.55):
    r = np.random.default_rng(seed)
    xs = r.uniform(0, OW, n); ys = r.uniform(0, OH, n)
    vx = r.uniform(-6, 10, n) * U; vy = r.uniform(-14, -3, n) * U
    ph = r.uniform(0, 6.28, n); sz = r.integers(0, len(DOTS), n); br = r.uniform(0.25, 1.0, n)
    col = np.array(warm, np.float32) * strength
    for i in range(n):
        x = (xs[i] + vx[i] * t + 18 * U * math.sin(t * 0.4 + ph[i])) % OW
        y = (ys[i] + vy[i] * t + 10 * U * math.sin(t * 0.3 + ph[i] * 2)) % OH
        tw = 0.55 + 0.45 * math.sin(t * 1.3 + ph[i] * 3)
        spr = DOTS[sz[i]]; k = spr.shape[0] // 2
        xi, yi = int(x), int(y)
        x0, x1 = max(0, xi - k), min(OW, xi + k + 1); y0, y1 = max(0, yi - k), min(OH, yi + k + 1)
        if x1 <= x0 or y1 <= y0: continue
        a = (spr[y0 - yi + k:y1 - yi + k, x0 - xi + k:x1 - xi + k] * float(br[i] * tw))[..., None] * col
        reg = frame[y0:y1, x0:x1]
        reg += a * (1.0 - reg)
    return frame

_RAYS = {}
def ray_tex(seed):
    if seed in _RAYS: return _RAYS[seed]
    r = np.random.default_rng(seed)
    y, x = np.mgrid[0:OH // 4, 0:OW // 4].astype(np.float32)
    sx, sy = (-0.1 * OW / 4, -0.25 * OH / 4) if r.random() < 0.5 else (1.1 * OW / 4, -0.25 * OH / 4)
    ang = np.arctan2(y - sy, x - sx)
    v = np.zeros_like(ang)
    for k in range(7):
        v += r.uniform(0.3, 1.0) * np.cos(ang * r.uniform(18, 42) + r.uniform(0, 6)) ** 8
    dist = np.sqrt((x - sx) ** 2 + (y - sy) ** 2)
    v *= np.exp(-dist / (OW / 4 * 0.9))
    v = v / (v.max() + 1e-6)
    im = Image.fromarray((v * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)).resize((OW, OH), Image.BILINEAR)
    _RAYS[seed] = np.asarray(im).astype(np.float32) / 255
    return _RAYS[seed]

_RAYC = {}
def fx_rays(frame, t, seed, strength=0.11):
    key = seed % 7
    if key not in _RAYC:
        _RAYC[key] = (ray_tex(key)[..., None] * np.array([1.0, 0.93, 0.78], np.float32)).astype(np.float32)
    k = strength * (0.75 + 0.25 * math.sin(t * 0.5 + seed))
    tmp = 1.0 - frame
    tmp *= _RAYC[key]
    tmp *= k
    frame += tmp
    return frame

_RAIN = {}
def rain_tex(seed):
    if seed in _RAIN: return _RAIN[seed]
    r = np.random.default_rng(seed)
    im = Image.new("L", (OW, OH * 2), 0); d = ImageDraw.Draw(im)
    for i in range(1400):
        x = r.uniform(0, OW); y = r.uniform(0, OH * 2); L = r.uniform(25, 70) * U; a = int(r.uniform(40, 140))
        d.line([(x, y), (x - L * 0.12, y + L)], fill=a, width=1)
    im = im.filter(ImageFilter.GaussianBlur(0.8))
    _RAIN[seed] = np.asarray(im).astype(np.float32) / 255
    return _RAIN[seed]

def fx_rain(frame, t, seed):
    out = frame
    for k, (sp, al) in enumerate(((1900, 0.22), (1250, 0.14))):
        tex = rain_tex(seed + k)
        off = int(t * sp * U) % OH
        layer = tex[OH - off:2 * OH - off] if off > 0 else tex[OH:2 * OH]
        if layer.shape[0] != OH: layer = tex[:OH]
        tmp = 0.85 - out
        tmp *= (layer * al)[..., None]
        out += tmp
    return out

def fx_flicker(frame, t, seed):
    r = np.random.default_rng(seed)
    bursts = r.uniform(0, 10, 7)
    cols = [np.array(c, np.float32) for c in ((1.0, 0.6, 0.4), (0.5, 0.9, 0.6), (0.6, 0.7, 1.0), (1.0, 0.9, 0.5))]
    g = np.zeros(3, np.float32)
    for i, b in enumerate(bursts):
        dt = t - b
        if 0 <= dt < 1.6: g += cols[i % 4] * 0.09 * math.exp(-dt * 2.2)
    return frame + g[None, None, :] * (1.0 - frame)

# ───────── 仕上げ（色・にじみ・周辺減光・粒子） ─────────
def vignette():
    y, x = np.mgrid[0:OH, 0:OW].astype(np.float32)
    r = np.sqrt(((x - OW / 2) / (OW / 2)) ** 2 + ((y - OH / 2) / (OH / 2)) ** 2)
    return (1 - 0.20 * np.clip(r - 0.45, 0, None) ** 1.6).astype(np.float32)[..., None]

VIG = vignette()
GRAIN = [np.random.default_rng(100 + i).normal(0, 1, (OH // 2, OW // 2)).astype(np.float32) for i in range(6)]
GRAIN_FULL = [(np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)[..., None] * 0.012).astype(np.float32) for g in GRAIN]

def grade(frame, era):
    if str(era) == PRESENT:
        # 現在：少し冷たく、落ち着いた色
        lum = frame.mean(axis=2, keepdims=True)
        frame = lum + (frame - lum) * 0.86
        frame = frame * np.array([0.98, 1.0, 1.03], np.float32)
    else:
        # 過去：ほんのり暖かく、黒を少し持ち上げる
        frame = frame * np.array([1.03, 1.0, 0.95], np.float32)
    return 0.035 + frame * 0.95

def bloom_src(arr, k=0.16):
    h, w = arr.shape[:2]
    small = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).resize((max(8, w // 8), max(8, h // 8)), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(6)).resize((w, h), Image.BILINEAR)
    b = np.asarray(small).astype(np.float32) / 255
    b = np.clip(b - 0.55, 0, 1) / 0.45
    return arr + b * k * (1 - arr)

def bloom(frame, k=0.16):
    small = Image.fromarray((np.clip(frame, 0, 1) * 255).astype(np.uint8)).resize((OW // 6, OH // 6), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(7)).resize((OW, OH), Image.BILINEAR)
    b = np.asarray(small).astype(np.float32) / 255
    b = np.clip(b - 0.55, 0, 1) / 0.45
    return frame + b * k * (1 - frame)

def finish(frame, fi, era):
    frame = frame * VIG
    frame += GRAIN_FULL[fi % len(GRAIN_FULL)]
    np.clip(frame, 0, 1, out=frame)
    return frame

# ───────── 文字 ─────────
def text_layer(lines, alpha):
    """lines: [(text, size, y(0..1), font, spacing)] → RGBA（白文字＋やわらかい影）"""
    im = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    sh = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im); ds = ImageDraw.Draw(sh)
    for (txt, size, y, fontp, sp, a) in lines:
        size = max(8, int(round(size * U))); sp = sp * U
        f = ImageFont.truetype(fontp, size)
        widths = [f.getbbox(ch)[2] - f.getbbox(ch)[0] if ch != " " else size * 0.35 for ch in txt]
        tw = sum(widths) + sp * (len(txt) - 1)
        x = (OW - tw) / 2
        for ch, w in zip(txt, widths):
            bb = f.getbbox(ch)
            d.text((x - bb[0], y * OH - size * 0.55), ch, font=f, fill=(255, 252, 244, int(255 * a)))
            ds.text((x - bb[0], y * OH - size * 0.55 + 2 * U), ch, font=f, fill=(20, 18, 14, int(150 * a)))
            x += w + sp
    sh = sh.filter(ImageFilter.GaussianBlur(5 * U))
    out = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    out.alpha_composite(sh); out.alpha_composite(im)
    arr = np.asarray(out).astype(np.float32) / 255
    arr[..., 3] *= alpha
    return arr

_TXT = {}
def cached_text(key, lines):
    if key not in _TXT: _TXT[key] = text_layer(lines, 1.0)
    return _TXT[key]

def over(frame, layer, alpha):
    a = layer[..., 3:4] * alpha
    return frame * (1 - a) + layer[..., :3] * a

def draw_text(frame, s, tl):
    kind = s.get("text")
    if kind == "title":
        a = smooth(1.6, 3.2, tl) * (1 - smooth(7.6, 9.4, tl))
        if a > 0:
            L = cached_text("title", [(META["subtitle"], 40, 0.39, FONT_BODY, 18, 0.95), (META["title"], 112, 0.50, FONT_TITLE, 26, 1.0)])
            frame = over(frame, L, a)
    elif kind == "end":
        a1 = smooth(0.8, 2.4, tl) * (1 - smooth(7.4, 8.9, tl))
        a2 = smooth(3.0, 4.6, tl) * (1 - smooth(7.4, 8.9, tl))
        if a1 > 0:
            frame = over(frame, cached_text("end1", [(META["title"], 96, 0.42, FONT_TITLE, 22, 1.0), (META["subtitle"], 34, 0.53, FONT_BODY, 16, 0.9)]), a1)
        if a2 > 0:
            frame = over(frame, cached_text("end2", [(META["end_question"], 38, 0.68, FONT_BODY, 6, 0.95)]), a2)
    elif kind == "afterglow":
        a = smooth(0.6, 2.0, tl) * (1 - smooth(4.2, 5.8, tl))
        if a > 0:
            frame = over(frame, cached_text("ag", [(META["afterglow_title"], 64, 0.47, FONT_TITLE, 18, 1.0), (META["afterglow_sub"], 30, 0.58, FONT_BODY, 6, 0.85)]), a)
    return frame


# ───────── 「プリント写真が色づいて動き出す」演出（reveal）と日英キャプション ─────────
_SPECK = {}
def specks(seed):
    if seed in _SPECK: return _SPECK[seed]
    r = np.random.default_rng(seed)
    im = Image.new("L", (OW, OH), 0); d = ImageDraw.Draw(im)
    for _ in range(140):
        x, y = r.uniform(0, OW), r.uniform(0, OH); rr = r.uniform(0.6, 2.2) * U
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=int(r.uniform(60, 200)))
    for _ in range(6):
        x = r.uniform(0, OW); y0 = r.uniform(0, OH * 0.5); L = r.uniform(80, 400) * U
        d.line([(x, y0), (x + r.uniform(-20, 20) * U, y0 + L)], fill=int(r.uniform(40, 110)), width=1)
    _SPECK[seed] = np.asarray(im.filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)[..., None] / 255
    return _SPECK[seed]

def print_look(frame, seed):
    """色あせた90年代のプリント：彩度を落とし、黄〜赤みに寄せ、黒を持ち上げ、ほこり"""
    lum = frame.mean(axis=2, keepdims=True)
    f = lum + (frame - lum) * 0.62
    f = f * np.array([1.06, 0.98, 0.82], np.float32) + np.array([0.06, 0.04, 0.02], np.float32)
    f = 0.08 + f * 0.86
    sp = specks(seed)
    f = f * (1 - sp * 0.55) + sp * 0.5
    return np.clip(f, 0, 1)

_STAMP = {}
def stamp_rgba(text):
    if text not in _STAMP:
        st = datestamp(text, scale=1.05 * U)
        _STAMP[text] = st
    return _STAMP[text]

def reveal_frame(vivid, s, t, seed):
    rv = s["reveal"]; hold = rv.get("hold", 2.4); trans = rv.get("trans", 2.0)
    r = ease(smooth(hold, hold + trans, t) if t > hold else 0.0)
    if r >= 0.999: return vivid
    pr = print_look(vivid, seed)
    content = pr * (1 - r) + vivid * r
    img = Image.fromarray((np.clip(content, 0, 1) * 255 + 0.5).astype(np.uint8)).convert("RGBA")   # 1を超えた値は uint8 で桁あふれして色が化ける
    # 日付（写真の右下）。色が戻るにつれて消える
    st = stamp_rgba(rv.get("date", ""))
    if rv.get("date"):
        a = 1 - r
        st2 = st.copy(); st2.putalpha(st2.getchannel("A").point(lambda v: int(v * a)))
        img.alpha_composite(st2, (int(OW * 0.955 - st.width), int(OH * 0.94 - st.height)))
    # 白い縁（プリントのふち）をつけて、少し傾けて小さく置く → だんだん画面いっぱいへ
    bw = int(OW * 0.022)
    card = Image.new("RGBA", (OW + 2 * bw, OH + 2 * bw), (246, 242, 232, 255))
    card.paste(img, (bw, bw))
    sc = 0.80 + (1.10 - 0.80) * r
    rot = -2.4 * (1 - r)
    cw, ch = card.size
    a = math.radians(rot); ca, sa = math.cos(a), math.sin(a)
    # 出力座標 → カード座標（中心基準の拡大＋回転の逆写像）
    k = 1 / sc
    A = k * ca; B = k * sa; C = cw / 2 - A * OW / 2 - B * OH / 2
    Dd = -k * sa; E = k * ca; F = ch / 2 - Dd * OW / 2 - E * OH / 2
    warped = card.transform((OW, OH), Image.AFFINE, (A, B, C, Dd, E, F), resample=Image.BILINEAR, fillcolor=(0, 0, 0, 0))
    wa = np.asarray(warped).astype(np.float32) / 255
    # 背景：暗い木の机のような色＋やわらかい影
    bg = np.empty((OH, OW, 3), np.float32); bg[:] = np.array([0.16, 0.12, 0.09], np.float32)
    sh = Image.fromarray((wa[..., 3] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14 * U))
    sha = np.asarray(sh).astype(np.float32)[..., None] / 255
    bg = bg * (1 - 0.55 * np.roll(np.roll(sha, int(10 * U), 0), int(8 * U), 1))
    out = bg * (1 - wa[..., 3:4]) + wa[..., :3] * wa[..., 3:4]
    return out

def draw_caption(frame, s, t):
    cap = s.get("caption")
    if not cap: return frame
    rv = s.get("reveal") or {}
    t0 = (rv.get("hold", 0) + rv.get("trans", 0) + 0.4) if rv else 0.8
    a = smooth(t0, t0 + 1.0, t) * (1 - smooth(t0 + 4.5, t0 + 5.5, t))
    if a <= 0: return frame
    key = "cap_" + s["id"]
    if key not in _TXT:
        im = Image.new("RGBA", (OW, OH), (0, 0, 0, 0)); shd = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
        d = ImageDraw.Draw(im); ds = ImageDraw.Draw(shd)
        fj = ImageFont.truetype(FONT_BODY, max(8, int(34 * U))); fe = ImageFont.truetype(FONT_BODY, max(8, int(22 * U)))
        x, y = int(OW * 0.055), int(OH * 0.84)
        for (txt, f, yy) in ((cap[0], fj, y), (cap[1], fe, y + int(48 * U))):
            ds.text((x + 2 * U, yy + 2 * U), txt, font=f, fill=(0, 0, 0, 170)); d.text((x, yy), txt, font=f, fill=(255, 250, 240, 235))
        shd = shd.filter(ImageFilter.GaussianBlur(4 * U))
        o = Image.new("RGBA", (OW, OH), (0, 0, 0, 0)); o.alpha_composite(shd); o.alpha_composite(im)
        _TXT[key] = np.asarray(o).astype(np.float32) / 255
    return over(frame, _TXT[key], a)


# ───────── 動画クリップ（Veo など）を1コマずつ読む ─────────
class ClipReader:
    """ffmpeg で順に読み、直近のコマだけ持つ（戻るときは開き直す）"""
    def __init__(self, path):
        self.path = path
        pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration",
                                        "-of", "json", path], capture_output=True, text=True).stdout)["streams"][0]
        self.w, self.h = pr["width"], pr["height"]
        a, b = map(int, pr["r_frame_rate"].split("/")); self.fps = a / b
        self.n = int(pr.get("nb_frames") or round(float(pr["duration"]) * self.fps))
        self.dur = self.n / self.fps
        self.proc = None; self.pos = -1; self.cache = {}
    def _open(self, start=0):
        if self.proc: self.proc.kill()
        self.proc = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{start / self.fps:.4f}", "-i", self.path, "-f", "rawvideo", "-pix_fmt", "rgb24",
                                      "-s", f"{OW}x{OH}", "-"], stdout=subprocess.PIPE)
        self.pos = start - 1; self.cache = {}
    def get(self, i):
        i = max(0, min(self.n - 1, i))
        if i in self.cache: return self.cache[i]
        if self.proc is None or i < self.pos - 2 or i > self.pos + 90: self._open(i)
        while self.pos < i:
            raw = self.proc.stdout.read(OW * OH * 3)
            if len(raw) < OW * OH * 3:  # 終わり：最後のコマを使う
                self.n = max(1, self.pos + 1); return self.cache.get(self.pos) if self.pos in self.cache else np.zeros((OH, OW, 3), np.uint8)
            self.pos += 1
            self.cache[self.pos] = np.frombuffer(raw, np.uint8).reshape(OH, OW, 3)
            for k in [k for k in self.cache if k < self.pos - 3]: del self.cache[k]
        return self.cache[i]

_CLIPS = {}
def clip_path(s):
    p = os.path.join(ROOT, "assets/clips", s["id"] + ".mp4")
    return p if os.path.exists(p) else None

def clip_frame(s, t, span):
    """カットの経過 t 秒 → クリップのコマ（スロー＋前後のコマを混ぜてなめらかに）。
    写真が動き出す演出では、プリントの間は最初のコマで止めておき、色が戻ると同時に動き出す"""
    rd = _CLIPS.get(s["id"])
    if rd is None:
        rd = _CLIPS[s["id"]] = ClipReader(clip_path(s))
    hold = s["reveal"].get("hold", 0) if s.get("reveal") else 0.0
    # fixes.json の "clip": {"start": 秒, "end": 秒} … クリップの先頭・後ろを使わない（使う範囲をカットの長さに合わせてスローにする）
    # 実例：最初の1秒でグローブが突然現れた（start）／後半で花火が消えて空が真っ暗・手の中のおもちゃが形を変えた（end）
    cl = FIX.get(s["id"], {}).get("clip", {}) if not s.get("reveal") else {}
    c0 = cl.get("start", 0.0)
    usable = max(0.5, min(rd.dur, cl.get("end", rd.dur)) - c0)
    if t <= hold:
        f = c0 * rd.fps
    else:
        speed = min(1.0, usable / max(0.1, span - hold))
        f = (c0 + (t - hold) * speed) * rd.fps
    i = int(f); w = f - i
    a = rd.get(i).astype(np.float32)
    if w > 0.02 and i + 1 < rd.n:
        a = a * (1 - w) + rd.get(i + 1).astype(np.float32) * w
    arr = a / 255
    src = s.get("img") or s["id"]
    blurs = FIX.get(src, {}).get("blur")
    if blurs:   # 静止画と同じ所をぼかす（動画AIは、ぼかした入力からでも文字を描き直すことがある）
        arr = blur_regions(arr, blurs, src_width(src))
    arr = grade(arr, s["era"])
    arr = bloom(arr)
    return np.clip(arr, 0, 1)

_SRCW = {}
def src_width(sid):
    """元の画像の幅（ぼかしの半径は元の画像の画素で書くので、動画のコマに当てるときに換算する）"""
    if sid not in _SRCW:
        p = os.path.join(ROOT, "assets/img", sid + ".png")
        _SRCW[sid] = Image.open(p).size[0] if os.path.exists(p) else OW
    return _SRCW[sid]

def blur_regions(arr, blurs, src_w=2752):
    """fixes.json の blur（画像に対する割合、半径は元画像の画素）を、出力の大きさのコマに当てる"""
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    for (x0, y0, x1, y1, rad) in blurs:
        box = (int(x0 * OW), int(y0 * OH), int(x1 * OW), int(y1 * OH))
        reg = im.crop(box)
        bl = reg.filter(ImageFilter.GaussianBlur(rad * OW / src_w))
        m = Image.new("L", reg.size, 0)
        e = max(2, int(6 * OW / src_w))
        ImageDraw.Draw(m).rectangle([e, e, reg.size[0] - e, reg.size[1] - e], fill=255)
        m = m.filter(ImageFilter.GaussianBlur(5 * OW / src_w))
        im.paste(bl, box[:2], m)
    return np.asarray(im).astype(np.float32) / 255

# ───────── 1カットの描画 ─────────
_BG = {}
def card_background(s):
    """画像のないカット（エンドカード・余韻の題字など）は、近くのカットをぼかした背景。
    bg に画像のカットIDを書けばそれを使う。なければ end は直前、それ以外は直後の画像つきカット"""
    key = s["id"]
    if key in _BG: return _BG[key]
    i = next(k for k, x in enumerate(SC) if x["id"] == key)
    src = s.get("bg")
    if not src:
        order = list(range(i - 1, -1, -1)) + list(range(i + 1, len(SC))) if s.get("text") == "end" else list(range(i + 1, len(SC))) + list(range(i - 1, -1, -1))
        k = next((k for k in order if SC[k]["prompt"]), None)
        if k is None:
            _BG[key] = np.zeros((OH, OW, 3), np.float32); return _BG[key]
        src = SC[k].get("img") or SC[k]["id"]
    img = load_scene_image(src)
    fr = camera_frame(img, src, "none", 1.0)
    fr = fr.filter(ImageFilter.GaussianBlur(18))
    arr = np.asarray(fr).astype(np.float32) / 255
    dark = s.get("text") == "afterglow"
    arr = arr * (0.72 if dark else 0.82) + (0.06 if dark else 0.12)
    _BG[key] = arr
    return arr

def render_scene(i, t):
    """カット i の、カット開始からの経過 t 秒のコマ（効果込み、仕上げ前）"""
    s = SC[i]
    nxt = SC[i + 1]["xfade"] if i + 1 < len(SC) else 0
    span = s["dur"] + nxt
    p = t / span if span > 0 else 0
    src = s.get("img") or s["id"]   # 差し込みカットは別カットの画像を使う
    if not s["prompt"]:
        frame = card_background(s).copy()
    elif clip_path(s):
        frame = clip_frame(s, t, span)
    else:
        img = load_scene_image(src)
        if s.get("overlay") in ANIM:
            img = apply_lcd(img, src, s["overlay"], t)
        fr = camera_frame(img, src, s["move"], p)
        frame = np.asarray(fr).astype(np.float32) / 255
    seed = 1000 + i * 17
    for f in s["fx"]:
        if f == "dust": frame = fx_dust(frame, t, seed, warm=(0.85, 0.9, 1.0) if str(s["era"]) == PRESENT else (1.0, 0.95, 0.82))
        elif f == "rays": frame = fx_rays(frame, t, seed)
        elif f == "rain": frame = fx_rain(frame, t, seed)
        elif f == "flicker": frame = fx_flicker(frame, t, seed)
    if s.get("reveal"):
        frame = reveal_frame(frame, s, t, seed)
    frame = draw_caption(frame, s, t)
    frame = draw_text(frame, s, t)
    return frame

def scene_at(T):
    """時刻 T に見えているカット（前のカットとのクロスフェード込み）"""
    idx = 0
    for k, s in enumerate(SC):
        if s["start"] <= T + 1e-9: idx = k
    return idx

def render_frame(fi):
    T = fi / FPS
    i = scene_at(T)
    s = SC[i]
    tl = T - s["start"]
    cur = render_scene(i, tl)
    xf = s["xfade"]
    if i > 0 and tl < xf:
        prev = render_scene(i - 1, T - SC[i - 1]["start"])
        a = ease(tl / xf)
        # 白に抜ける転換（現在→過去など）：カットに transition="white"
        if s.get("transition") == "white":
            wpk = math.sin(math.pi * min(1, tl / xf)) * 0.55
            mix = prev * (1 - a) + cur * a
            frame = mix + (1 - mix) * wpk
        else:
            frame = prev * (1 - a) + cur * a
    else:
        frame = cur
    # 冒頭は黒から、最後は黒へ
    if T < 1.5: frame = frame * ease(T / 1.5)
    if T > TOTAL - 4.0: frame = frame * ease((TOTAL - T) / 4.0)
    era = s["era"]
    return finish(frame, fi, era)

def to_bytes(frame):
    return (frame * 255 + 0.5).astype(np.uint8).tobytes()

def encode(f0, f1, out):
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-",
           "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p", "-g", str(FPS * 2), "-bf", "2",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fi in range(f0, f1):
        p.stdin.write(to_bytes(render_frame(fi)))
        if (fi - f0) % 300 == 0:
            print(f"[{os.getpid()}] {fi}/{f1}", flush=True)
    p.stdin.close(); p.wait()

def test_sheet(picks, out):
    """picks: ["P02:1.2", "S12:7", ...]（カットID:カット内の秒）→ 3列の一覧画像"""
    sc = {x["id"]: x for x in SC}
    font = ImageFont.truetype(FONT_BODY, 22)
    W, H = 640, 360
    rows = (len(picks) + 2) // 3
    sheet = Image.new("RGB", (W * 3 + 20, (H + 8) * rows), (0, 0, 0))
    for k, pk in enumerate(picks):
        sid, t = pk.split(":") if ":" in pk else (pk, None)
        s = sc[sid]
        t = float(t) if t is not None else s["dur"] * 0.55
        fr = render_frame(int((s["start"] + t) * FPS))
        im = Image.fromarray((fr * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
        x = (k % 3) * (W + 10); y = (k // 3) * (H + 8)
        sheet.paste(im, (x, y)); ImageDraw.Draw(sheet).text((x + 6, y + 4), f"{sid} t={t:g}", fill=(255, 255, 0), font=font)
        print(sid, t, flush=True)
    sheet = sheet.crop((0, 0, min(len(picks), 3) * (W + 10) - 10, sheet.height))   # 余った黒い枠を切る
    sheet.save(out, quality=85)
    print(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--at", nargs="+", help="カットID:秒 を一覧画像に（例 P02:1.2 P02:4 S12:7）")
    ap.add_argument("--frames", nargs=2, type=int)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--chunks", type=int, help="分割数（既定は workers×3。重い区間があっても全員が最後まで働くように細かく分ける）")
    ap.add_argument("--chunk", type=int, help="（内部用）担当チャンク番号")
    ap.add_argument("--only", nargs="*", help="--stills で特定カットだけ")
    a = ap.parse_args()
    work = os.path.join(ROOT, "work")
    os.makedirs(work, exist_ok=True)
    if a.at:
        test_sheet(a.at, os.path.join(work, "test_frames.jpg"))
        return
    if a.stills:
        os.makedirs(os.path.join(work, "stills"), exist_ok=True)
        for i, s in enumerate(SC):
            if a.only and s["id"] not in a.only: continue
            T = s["start"] + min(s["dur"] * 0.55, s["dur"] - 0.2)
            if s.get("text") == "title": T = s["start"] + 4.5
            if s.get("text") == "end": T = s["start"] + 5.0
            if s.get("text") == "afterglow": T = s["start"] + 3.0
            if s.get("reveal"): T = s["start"] + min(s["dur"] - 0.2, s["reveal"].get("hold", 2.4) + s["reveal"].get("trans", 2.0) + 1.5)
            if s.get("overlay") == "pet_egg": T = s["start"] + 4.4
            if s.get("overlay") == "pet_eat": T = s["start"] + 2.2
            fi = int(T * FPS)
            Image.fromarray((render_frame(fi) * 255).astype(np.uint8)).save(os.path.join(work, "stills", f"{s['id']}.jpg"), quality=90)
            print(s["id"], fi, flush=True)
        return
    if a.frames:
        encode(a.frames[0], a.frames[1], os.path.join(work, f"test_{a.frames[0]}_{a.frames[1]}.mp4"))
        return
    n = a.chunks or a.workers * 3
    bounds = [round(NFR * k / n) for k in range(n + 1)]
    if a.chunk is not None:
        encode(bounds[a.chunk], bounds[a.chunk + 1], os.path.join(work, f"part_{a.chunk:03d}.mp4"))
        return
    from concurrent.futures import ThreadPoolExecutor
    def run_chunk(k):
        out = os.path.join(work, f"part_{k:03d}.mp4")
        return subprocess.run([sys.executable, os.path.abspath(__file__), "--chunks", str(n), "--chunk", str(k)]).returncode
    with ThreadPoolExecutor(a.workers) as ex:
        rc = list(ex.map(run_chunk, range(n)))
    if any(rc): sys.exit(f"chunk failed: {[k for k, r in enumerate(rc) if r]}")
    lst = os.path.join(work, "parts.txt")
    open(lst, "w").write("".join(f"file 'part_{k:03d}.mp4'\n" for k in range(n)))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", os.path.join(work, "video.mp4")], check=True)
    print("video ->", os.path.join(work, "video.mp4"), NFR, "frames")

if __name__ == "__main__":
    main()
