# -*- coding: utf-8 -*-
"""日本×世界 データ比較ショート動画レンダラー.

台本集（scripts_data.py）から 1080x1920 / 9:16 の縦型ショート動画を書き出す。

台本集の「共通仕様」に合わせた設計:
  - 解像度・比率  : 1080x1920（9:16）
  - セーフゾーン  : 画面下 250px / 右端 120px にはテロップを置かない
  - 尺            : 15〜30秒に収まる3ゾーン構成（短い／普通・平均／長い）
  - テロップ      : 極太ゴシック（Noto Sans CJK JP Black）＋太縁取り・画面中央に大きく
  - 注記          : 調査年・換算条件の注記を常時フッターに表示

使い方:
    python3 render_shorts.py                 # 6本すべて書き出し
    python3 render_shorts.py 01_sleep        # ID を指定して1本だけ
    python3 render_shorts.py --overlay       # 背景透過の合成用オーバーレイ（WebM/VP9）
    python3 render_shorts.py --fps 30 --out out

必要なもの: Pillow, imageio-ffmpeg（同梱の ffmpeg を使用）, Noto Sans CJK JP Black
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scripts_data import SCRIPTS  # noqa: E402

# ---------------------------------------------------------------- 基本設定

W, H = 1080, 1920
FPS = 30

SAFE_BOTTOM = 250          # 画面下：いいね／コメントボタン・キャプション欄
SAFE_RIGHT = 120           # 右端：UIボタン列
MARGIN_X = 70
PANEL_X0 = MARGIN_X
PANEL_X1 = W - SAFE_RIGHT - 10          # 950
PANEL_W = PANEL_X1 - PANEL_X0           # 880

ROWS_TOP = 520
ROWS_BOTTOM = 1500
ROW_MAX_H = 180
ROW_GAP = 18

FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
FONT_INDEX = 0                           # 0 = Noto Sans CJK JP

# 配色
BG_TOP = (11, 16, 32)
BG_BOTTOM = (20, 27, 51)
PANEL_BG = (24, 33, 58)
PANEL_BG_JP = (33, 30, 55)
TEXT = (255, 255, 255)
TEXT_DIM = (163, 178, 209)
STROKE = (6, 9, 20)
JAPAN = (255, 77, 109)

ACCENTS = {
    "短い": (34, 211, 238),
    "安い": (34, 211, 238),
    "普通": (251, 191, 36),
    "長い": (251, 113, 133),
    "高い": (251, 113, 133),
}
ACCENT_DEFAULT = (129, 140, 248)

# タイミング（秒）
T_HOOK = 2.4
T_CHANT = 0.95             # ゾーン頭のチャント（「短い、短い、短い！」）
T_ROW = 1.15               # 1行あたりの表示間隔
T_ZONE_HOLD = 1.25         # ゾーン最後の余韻
T_OUTRO = 3.2
T_FLASH = 0.26             # セクション切り替えのフラッシュ

_font_cache: dict[int, ImageFont.FreeTypeFont] = {}


def font(size: int) -> ImageFont.FreeTypeFont:
    f = _font_cache.get(size)
    if f is None:
        f = ImageFont.truetype(FONT_PATH, size, index=FONT_INDEX)
        _font_cache[size] = f
    return f


# ---------------------------------------------------------------- ユーティリティ

def ease_out(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return 1.0 - (1.0 - x) ** 3


def ease_out_back(x: float) -> float:
    x = max(0.0, min(1.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def mix(a, b, t: float):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def fmt_value(unit: str, v: float) -> str:
    v = int(round(v))
    if unit == "hm":
        return f"{v // 60}時間{v % 60:02d}分"
    if unit == "usd":
        return f"{v:,}ドル"
    if unit == "hours":
        return f"{v:,}時間"
    if unit == "min":
        return f"{v}分"
    if unit == "yen":
        return f"{v:,}円"
    return str(v)


def text(draw, xy, s, size, fill=TEXT, anchor="mm", stroke=6, stroke_fill=STROKE):
    draw.text(xy, s, font=font(size), fill=fill, anchor=anchor,
              stroke_width=stroke, stroke_fill=stroke_fill)


def text_w(s, size, stroke=0) -> float:
    f = font(size)
    return f.getlength(s) + stroke * 2


def fit_size(s: str, max_w: int, size: int, min_size: int = 24) -> int:
    """max_w に収まるまでフォントサイズを落とす。"""
    while size > min_size and font(size).getlength(s) > max_w:
        size -= 2
    return size


# ---------------------------------------------------------------- 背景

_bg_cache: dict[tuple, Image.Image] = {}


def background(accent, overlay: bool) -> Image.Image:
    """縦グラデーション＋上部のアクセントグロー。ゾーンごとに1枚だけ作って使い回す。"""
    if overlay:
        return Image.new("RGBA", (W, H), (0, 0, 0, 0))
    key = tuple(accent)
    img = _bg_cache.get(key)
    if img is not None:
        return img

    base = Image.new("RGB", (W, H))
    px = base.load()
    grad = [mix(BG_TOP, BG_BOTTOM, y / (H - 1)) for y in range(H)]
    for y in range(H):
        c = grad[y]
        for x in range(W):
            px[x, y] = c

    # 上部中央のソフトグロー（小さく作って拡大）
    gw, gh = 108, 192
    glow = Image.new("L", (gw, gh), 0)
    gp = glow.load()
    cx, cy, rad = gw * 0.5, gh * 0.20, gw * 0.85
    for y in range(gh):
        for x in range(gw):
            d = math.hypot((x - cx), (y - cy) * 0.75) / rad
            gp[x, y] = int(max(0.0, 1.0 - d) ** 2 * 120)
    glow = glow.resize((W, H), Image.LANCZOS)
    base.paste(Image.new("RGB", (W, H), tuple(accent)), (0, 0), glow)

    # 下部のビネット
    vign = Image.new("L", (108, 192), 0)
    vp = vign.load()
    for y in range(192):
        v = int(max(0.0, (y - 120) / 72.0) ** 1.6 * 150)
        for x in range(108):
            vp[x, y] = v
    vign = vign.resize((W, H), Image.LANCZOS)
    base.paste(Image.new("RGB", (W, H), (4, 6, 14)), (0, 0), vign)

    _bg_cache[key] = base
    return base


# ---------------------------------------------------------------- パーツ描画

def draw_footer(draw, script, accent):
    """出典と注記。セーフゾーン（下250px）より上に必ず収める。"""
    src = script["source"]
    cav = script["caveat"]
    s1 = fit_size(src, PANEL_W, 27, 18)
    s2 = fit_size(cav, PANEL_W, 27, 18)
    draw.line([(PANEL_X0, 1535), (PANEL_X0 + 90, 1535)], fill=accent, width=5)
    text(draw, (PANEL_X0, 1578), src, s1, fill=TEXT_DIM, anchor="lm", stroke=4)
    text(draw, (PANEL_X0, 1624), cav, s2, fill=TEXT_DIM, anchor="lm", stroke=4)


def draw_title_bar(draw, script, accent, alpha=1.0):
    t = script["title"]
    size = fit_size(t, PANEL_W - 170, 46, 24)
    col = mix(BG_BOTTOM, TEXT, alpha)
    text(draw, (W // 2 - SAFE_RIGHT // 2, 150), t, size, fill=col, anchor="mm", stroke=5)
    bw = int(text_w(t, size) * 0.5) + 20
    cx = W // 2 - SAFE_RIGHT // 2
    draw.line([(cx - bw, 190), (cx + bw, 190)], fill=mix(BG_BOTTOM, accent, alpha), width=5)


def draw_chant(draw, word: str, accent, tl: float):
    """「短い、短い、短い！」を3拍で出す。"""
    parts = [word, word, word + "！"]
    seps = ["、", "、", ""]
    size = 84
    widths = [font(size).getlength(p + s) for p, s in zip(parts, seps)]
    total = sum(widths)
    x = (W - SAFE_RIGHT) / 2 - total / 2
    y = 380
    for i, (p, s) in enumerate(zip(parts, seps)):
        t0 = i * 0.22
        k = ease_out_back((tl - t0) / 0.30) if tl >= t0 else 0.0
        if k <= 0.01:
            x += widths[i]
            continue
        k = min(k, 1.15)
        sz = max(12, int(size * min(1.0, k)))
        col = accent if i == 2 else TEXT
        draw.text((x, y), p + s, font=font(sz), fill=col, anchor="lm",
                  stroke_width=8, stroke_fill=STROKE)
        x += widths[i]


def row_geometry(n: int):
    h = min(ROW_MAX_H, int((ROWS_BOTTOM - ROWS_TOP - (n - 1) * ROW_GAP) / n))
    total = n * h + (n - 1) * ROW_GAP
    top = ROWS_TOP + (ROWS_BOTTOM - ROWS_TOP - total) // 2
    return top, h


def draw_row(draw, y, h, name, value_str, note, frac, accent, is_jp, appear, unit_pad):
    """1行（国名・値・バー）。appear は 0→1 のスライドイン進捗。"""
    e = ease_out(appear)
    dx = int((1.0 - e) * -140)
    x0, x1 = PANEL_X0 + dx, PANEL_X1 + dx
    fade = e

    base = mix(BG_BOTTOM, PANEL_BG_JP if is_jp else PANEL_BG, fade)
    r = min(28, h // 3)
    draw.rounded_rectangle([x0, y, x1, y + h], radius=r, fill=base)

    # 値に比例したバー
    bw = int((x1 - x0) * max(0.07, min(1.0, frac)) * e)
    if bw > r * 2:
        bar_col = mix(base, JAPAN if is_jp else accent, 0.46 if is_jp else 0.34)
        draw.rounded_rectangle([x0, y, x0 + bw, y + h], radius=r, fill=bar_col)
    draw.rounded_rectangle([x0, y, x0 + 8, y + h], radius=4,
                           fill=mix(base, JAPAN if is_jp else accent, fade))

    if is_jp:
        draw.rounded_rectangle([x0, y, x1, y + h], radius=r,
                               outline=mix(base, TEXT, fade), width=5)

    name_col = mix(base, TEXT, fade)
    val_col = mix(base, JAPAN if is_jp else accent, fade)

    name_size = fit_size(name, (x1 - x0) - unit_pad - 68, 60, 26)
    if note:
        text(draw, (x0 + 34, y + h * 0.40), name, name_size, fill=name_col, anchor="lm", stroke=6)
        nsz = fit_size(note, (x1 - x0) - unit_pad - 68, 30, 18)
        text(draw, (x0 + 36, y + h * 0.72), note, nsz,
             fill=mix(base, JAPAN if is_jp else accent, fade * 0.95), anchor="lm", stroke=4)
    else:
        text(draw, (x0 + 34, y + h * 0.52), name, name_size, fill=name_col, anchor="lm", stroke=6)

    vsz = fit_size(value_str, unit_pad - 12, 56, 28)
    text(draw, (x1 - 34, y + h * 0.52), value_str, vsz, fill=val_col, anchor="rm", stroke=6)


# ---------------------------------------------------------------- タイムライン

def build_timeline(script):
    """[(種別, ゾーンindex, 長さ)] とトータル秒を返す。"""
    seg = [("hook", -1, T_HOOK)]
    for i, z in enumerate(script["zones"]):
        d = T_CHANT + len(z["rows"]) * T_ROW + T_ZONE_HOLD
        seg.append(("zone", i, d))
    seg.append(("outro", -1, T_OUTRO))
    return seg, sum(s[2] for s in seg)


def draw_hook(img, draw, script, accent, tl):
    k = ease_out(tl / 0.40)
    main = script["hook_main"]
    ms = fit_size(main, PANEL_W, 104, 46)
    ms = max(20, int(ms * (0.86 + 0.14 * k)))
    cx = (W - SAFE_RIGHT) // 2
    text(draw, (cx, 700), main, ms, fill=mix(BG_TOP, TEXT, k), anchor="mm", stroke=10)

    k2 = ease_out((tl - 0.32) / 0.40)
    if k2 > 0:
        sub = script["hook_sub"]
        ss = fit_size(sub, PANEL_W, 58, 30)
        text(draw, (cx, 840), sub, ss, fill=mix(BG_TOP, TEXT_DIM, k2), anchor="mm", stroke=7)

    k3 = ease_out_back((tl - 0.75) / 0.45)
    if k3 > 0:
        k3 = min(k3, 1.12)
        teaser = script["hook_teaser"]
        ts = fit_size(teaser, PANEL_W - 120, 72, 34)
        tw = font(ts).getlength(teaser)
        pad, hgt = 46, 130
        bx0 = cx - (tw / 2 + pad) * min(1.0, k3)
        bx1 = cx + (tw / 2 + pad) * min(1.0, k3)
        draw.rounded_rectangle([bx0, 1000 - hgt / 2, bx1, 1000 + hgt / 2], radius=28,
                               fill=mix(BG_TOP, accent, 0.90))
        if k3 > 0.55:
            text(draw, (cx, 1000), teaser, ts, fill=(12, 16, 30), anchor="mm", stroke=0)

    draw_footer(draw, script, accent)


def draw_zone(img, draw, script, zi, accent, tl):
    z = script["zones"][zi]
    rows = z["rows"]
    unit = script["unit"]
    bmin, bmax = script["bar_min"], script["bar_max"]

    draw_title_bar(draw, script, accent, alpha=min(1.0, tl / 0.3))
    draw_chant(draw, z["word"], accent, tl)

    # 「1 / 3」のゾーン表示
    text(draw, (PANEL_X1, 150), f"{zi + 1} / 3", 40, fill=mix(BG_BOTTOM, accent, min(1.0, tl / 0.3)),
         anchor="rm", stroke=5)

    top, h = row_geometry(len(rows))
    longest = max(font(56).getlength(fmt_value(unit, v)) for _, v, _ in rows)
    unit_pad = int(min(longest, PANEL_W * 0.52)) + 52

    for i, (name, v, note) in enumerate(rows):
        t0 = T_CHANT + i * T_ROW
        if tl < t0:
            break
        appear = min(1.0, (tl - t0) / 0.42)
        # カウントアップ
        cu = min(1.0, (tl - t0) / 0.50)
        start = max(bmin * 0.9, v * 0.82)
        shown = start + (v - start) * ease_out(cu)
        vs = fmt_value(unit, shown)
        frac = (v - bmin) / float(bmax - bmin) if bmax > bmin else 1.0
        y = top + i * (h + ROW_GAP)
        draw_row(draw, y, h, name, vs, note if cu >= 1.0 else "",
                 frac, accent, name == "日本", appear, unit_pad)

    if z["caption"]:
        t0 = T_CHANT + len(rows) * T_ROW - 0.2
        k = min(1.0, max(0.0, (tl - t0) / 0.35))
        if k > 0:
            cap = z["caption"]
            cs = fit_size(cap, PANEL_W, 38, 22)
            text(draw, ((W - SAFE_RIGHT) // 2, ROWS_BOTTOM - 8), cap, cs,
                 fill=mix(BG_BOTTOM, accent, k), anchor="mm", stroke=5)

    draw_footer(draw, script, accent)


def draw_outro(img, draw, script, accent, tl):
    cx = (W - SAFE_RIGHT) // 2
    k = ease_out(tl / 0.35)
    text(draw, (cx, 640), script["outro_lead"], fit_size(script["outro_lead"], PANEL_W, 52, 28),
         fill=mix(BG_TOP, TEXT_DIM, k), anchor="mm", stroke=7)

    k2 = ease_out_back(min(1.0, (tl - 0.20) / 0.45)) if tl > 0.20 else 0.0
    if k2 > 0:
        big = script["outro_big"]
        bs = fit_size(big, PANEL_W, 126, 54)
        bs = max(20, int(bs * min(1.0, k2)))
        text(draw, (cx, 770), big, bs, fill=JAPAN, anchor="mm", stroke=11)

    k3 = ease_out(min(1.0, (tl - 0.55) / 0.40)) if tl > 0.55 else 0.0
    if k3 > 0:
        sub = script["outro_sub"]
        ss = fit_size(sub, PANEL_W, 62, 30)
        text(draw, (cx, 920), sub, ss, fill=mix(BG_TOP, TEXT, k3), anchor="mm", stroke=8)

    k4 = ease_out(min(1.0, (tl - 0.95) / 0.40)) if tl > 0.95 else 0.0
    if k4 > 0:
        cta = "他の国・他のデータも投稿中"
        cs = fit_size(cta, PANEL_W - 120, 46, 26)
        tw = font(cs).getlength(cta)
        draw.rounded_rectangle([cx - tw / 2 - 40, 1330, cx + tw / 2 + 40, 1440], radius=26,
                               fill=mix(BG_TOP, accent, 0.85 * k4))
        text(draw, (cx, 1385), cta, cs, fill=(12, 16, 30), anchor="mm", stroke=0)

    draw_footer(draw, script, accent)


# ---------------------------------------------------------------- フレーム生成

def render_frame(script, segments, t, overlay: bool) -> Image.Image:
    acc = 0.0
    kind, zi, dur, tl = "outro", -1, T_OUTRO, 0.0
    for k, i, d in segments:
        if t < acc + d or (k, i) == segments[-1][:2]:
            kind, zi, dur, tl = k, i, d, t - acc
            break
        acc += d
    tl = max(0.0, min(dur, tl))

    if kind == "zone":
        accent = ACCENTS.get(script["zones"][zi]["word"], ACCENT_DEFAULT)
    elif kind == "hook":
        accent = ACCENTS.get(script["zones"][0]["word"], ACCENT_DEFAULT)
    else:
        accent = JAPAN

    img = background(accent, overlay).copy()
    draw = ImageDraw.Draw(img)

    if kind == "hook":
        draw_hook(img, draw, script, accent, tl)
    elif kind == "zone":
        draw_zone(img, draw, script, zi, accent, tl)
    else:
        draw_outro(img, draw, script, accent, tl)

    # セクション切り替えのフラッシュ
    if tl < T_FLASH and not (kind == "hook" and zi == -1 and t < 0.001):
        a = (1.0 - tl / T_FLASH) ** 2 * 0.42
        if a > 0.002:
            if overlay:
                flash = Image.new("RGBA", (W, H), tuple(accent) + (int(a * 210),))
                img = Image.alpha_composite(img, flash)
            else:
                img = Image.blend(img, Image.new("RGB", (W, H), tuple(accent)), a)

    return img


# ---------------------------------------------------------------- 書き出し

def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def render(script, out_dir: str, fps: int, overlay: bool) -> str:
    segments, total = build_timeline(script)
    n_frames = int(round(total * fps))
    os.makedirs(out_dir, exist_ok=True)

    if overlay:
        path = os.path.join(out_dir, f"{script['id']}_overlay.webm")
        vcodec = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0",
                  "-crf", "32", "-row-mt", "1", "-cpu-used", "5", "-auto-alt-ref", "0"]
        pix_in, mode = "rgba", "RGBA"
        audio_in, audio_enc = [], []
    else:
        path = os.path.join(out_dir, f"{script['id']}.mp4")
        vcodec = ["-c:v", "libx264", "-preset", "medium", "-crf", "20",
                  "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        pix_in, mode = "rgb24", "RGB"
        # 各SNSの処理系に合わせて無音トラックを入れておく
        audio_in = ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        audio_enc = ["-c:a", "aac", "-b:a", "128k", "-shortest"]

    cmd = [ffmpeg_exe(), "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", pix_in, "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           *audio_in, *vcodec, *audio_enc, "-r", str(fps), path]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for f in range(n_frames):
            t = f / fps
            img = render_frame(script, segments, t, overlay)
            if img.mode != mode:
                img = img.convert(mode)
            proc.stdin.write(img.tobytes())
            if f % 60 == 0:
                pct = 100.0 * f / n_frames
                print(f"  {script['id']}: {pct:5.1f}%  ({f}/{n_frames})", flush=True)
    finally:
        proc.stdin.close()
        rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed ({rc}) for {script['id']}")
    print(f"  {script['id']}: 完了 {total:.1f}秒 -> {path}", flush=True)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="書き出す台本ID（省略時は全部）")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--overlay", action="store_true",
                    help="背景透過のオーバーレイ（WebM/VP9・実写に重ねる用）を書き出す")
    args = ap.parse_args()

    targets = [s for s in SCRIPTS if not args.ids or s["id"] in args.ids]
    if not targets:
        sys.exit(f"該当する台本IDがありません: {args.ids}")

    for s in targets:
        _, total = build_timeline(s)
        print(f"[{s['id']}] {s['title']}  想定尺 {total:.1f}秒", flush=True)
        render(s, args.out, args.fps, args.overlay)


if __name__ == "__main__":
    main()
