# -*- coding: utf-8 -*-
"""日本×世界 データ比較ショート動画レンダラー（カウントダウン構成）.

台本集（scripts_data.py）から 1080x1920 / 9:16 の縦型ショート動画を書き出す。

視聴維持率のための構成:
  1. フック        : 答えを言わずに問いかけるだけ（「日本は何位だと思う？」）
  2. カウントダウン : 15→1 と数字が減っていく。1が来るまで終わらないと分かる形
  3. 伏せ札        : 日本（台本⑤は全国最長の県）の行は「？？？」のまま置いておく
  4. 進捗バー      : 残りがどれだけかを常に見せて離脱を抑える
  5. 答え合わせ    : 最後に伏せ札をその場でめくる
  6. クロージング  : 順位・出典・次への誘導

台本集の「共通仕様」に合わせた設計:
  - 解像度・比率  : 1080x1920（9:16）
  - セーフゾーン  : 画面下 250px / 右端 120px にはテロップを置かない
  - 尺            : 15〜30秒に収まる3ゾーン構成（短い／普通・平均／長い）
  - テロップ      : 極太ゴシック（Noto Sans CJK JP Black）＋太縁取り・画面中央に大きく
  - 注記          : 調査年・換算条件の注記を常時フッターに表示

使い方:
    python3 render_shorts.py                 # 6本すべて書き出し
    python3 render_shorts.py 01_sleep        # ID を指定して1本だけ
    python3 render_shorts.py --overlay       # 背景透過の合成用（MOV / QuickTime Animation）
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
CX = (W - SAFE_RIGHT) // 2              # テロップの中心（右のUI列を避ける）

ROWS_TOP = 470
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
T_HOOK = 2.5
T_CHANT = 0.95             # ゾーン頭のチャント（「短い、短い、短い！」）
T_ROW = 1.0                # 1行あたりの表示間隔
T_ZONE_HOLD = 0.9          # ゾーン最後の余韻
T_REVEAL = 2.2             # 伏せ札をめくる答え合わせ
T_OUTRO = 3.0
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


def pulse(t: float, period: float = 0.9) -> float:
    """0→1→0 を繰り返す。伏せ札の点滅用。"""
    return 0.5 - 0.5 * math.cos(2 * math.pi * (t % period) / period)


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


def fit_size(s: str, max_w: int, size: int, min_size: int = 24) -> int:
    """max_w に収まるまでフォントサイズを落とす。"""
    while size > min_size and font(size).getlength(s) > max_w:
        size -= 2
    return size


# ---------------------------------------------------------------- 構成の組み立て

def build_sequence(script):
    """ゾーンと行をカウントダウン順に並べ替え、各行に残り番号を振る。

    - zone_order で、答え（日本／台本⑤は全国最長の県）が入るゾーンを必ず最後に回す
    - そのうえで答えの行をゾーンの末尾へ移す
    この2つで、どの台本でもカウントダウンの「1」が日本に重なる。
    countdown_reverse=True の台本はゾーン内の行順も反転させる。
    """
    zones = script["zones"]
    order = script.get("zone_order") or list(range(len(zones)))
    rev = script.get("countdown_reverse", False)
    answer = script["answer_name"]
    total = sum(len(z["rows"]) for z in zones)

    seq, k = [], 0
    for zi in order:
        z = zones[zi]
        rows = list(reversed(z["rows"])) if rev else list(z["rows"])
        tail = [r for r in rows if r[0] == answer]
        if tail:
            rows = [r for r in rows if r[0] != answer] + tail
        items = []
        for name, v, note in rows:
            k += 1
            items.append({"name": name, "v": v, "note": note, "num": total - k + 1,
                          "index": k})
        seq.append({"word": z["word"], "caption": z["caption"], "items": items})
    return seq, total


def answer_position(script, seq):
    """伏せ札（日本＝答え）がどのゾーンの何行目か。"""
    target = script["answer_name"]
    for zi, z in enumerate(seq):
        for ri, it in enumerate(z["items"]):
            if it["name"] == target:
                return zi, ri
    return len(seq) - 1, len(seq[-1]["items"]) - 1


def build_timeline(script):
    """[(種別, index, 長さ)] とトータル秒を返す。"""
    seq, _ = build_sequence(script)
    seg = [("hook", -1, T_HOOK)]
    for i, z in enumerate(seq):
        seg.append(("zone", i, T_CHANT + len(z["items"]) * T_ROW + T_ZONE_HOLD))
    seg.append(("reveal", -1, T_REVEAL))
    seg.append(("outro", -1, T_OUTRO))
    return seg, sum(s[2] for s in seg)


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
    src, cav = script["source"], script["caveat"]
    draw.line([(PANEL_X0, 1535), (PANEL_X0 + 90, 1535)], fill=accent, width=5)
    text(draw, (PANEL_X0, 1578), src, fit_size(src, PANEL_W, 27, 18),
         fill=TEXT_DIM, anchor="lm", stroke=4)
    text(draw, (PANEL_X0, 1624), cav, fit_size(cav, PANEL_W, 27, 18),
         fill=TEXT_DIM, anchor="lm", stroke=4)


def draw_topbar(draw, script, accent, progress, revealed, answer_value, t,
                total_rows=0, alpha=1.0):
    """タイトル・伏せ札ティザー・進捗バー。カウントダウン中ずっと出しておく。"""
    title = script["title"]
    size = fit_size(title, PANEL_W, 42, 22)
    text(draw, (CX, 110), title, size, fill=mix(BG_BOTTOM, TEXT_DIM, alpha),
         anchor="mm", stroke=5)

    # 「日本は ？？？」＝最後まで残る引っかかり
    label = script["teaser_label"]
    val = answer_value if revealed else "？？？"
    lsz = fit_size(label, 360, 40, 24)
    vsz = fit_size(val, 330, 44, 24)
    gap = 18
    tw = font(lsz).getlength(label) + gap + font(vsz).getlength(val)
    bx0, bx1 = CX - tw / 2 - 34, CX + tw / 2 + 34
    chip = mix(BG_BOTTOM, JAPAN if revealed else accent, (0.30 if revealed else 0.16) * alpha)
    draw.rounded_rectangle([bx0, 150, bx1, 218], radius=26, fill=chip,
                           outline=mix(BG_BOTTOM, JAPAN if revealed else accent, alpha),
                           width=4 if revealed else 3)
    x = CX - tw / 2
    text(draw, (x, 184), label, lsz, fill=mix(BG_BOTTOM, TEXT, alpha), anchor="lm", stroke=5)
    x += font(lsz).getlength(label) + gap
    vcol = JAPAN if revealed else mix(accent, TEXT, 0.25 + 0.55 * pulse(t, 0.8))
    text(draw, (x, 184), val, vsz, fill=mix(BG_BOTTOM, vcol, alpha), anchor="lm", stroke=5)

    # 進捗バー（残りがどれだけかを見せて離脱を抑える）
    draw.rounded_rectangle([PANEL_X0, 246, PANEL_X1, 256], radius=5,
                           fill=mix(BG_BOTTOM, (60, 74, 110), alpha))
    fw = int(PANEL_W * max(0.0, min(1.0, progress)))
    if fw > 10:
        draw.rounded_rectangle([PANEL_X0, 246, PANEL_X0 + fw, 256], radius=5,
                               fill=mix(BG_BOTTOM, accent, alpha))

    # 数字が世界順位ではなく「この動画のカウントダウン」だと分かるようにしておく
    if total_rows:
        line = (f"全{total_rows}{script['count_noun']}カウントダウン"
                f"｜{script['countdown_label']}")
        text(draw, (CX, 286), line, fit_size(line, PANEL_W, 29, 18),
             fill=mix(BG_BOTTOM, TEXT_DIM, alpha), anchor="mm", stroke=4)


def draw_chant(draw, word: str, accent, tl: float):
    """「短い、短い、短い！」を3拍で出す。"""
    parts, seps = [word, word, word + "！"], ["、", "、", ""]
    size = 80
    widths = [font(size).getlength(p + s) for p, s in zip(parts, seps)]
    x = CX - sum(widths) / 2
    y = 376
    for i, (p, s) in enumerate(zip(parts, seps)):
        t0 = i * 0.22
        k = ease_out_back((tl - t0) / 0.30) if tl >= t0 else 0.0
        if k <= 0.01:
            x += widths[i]
            continue
        draw.text((x, y), p + s, font=font(max(12, int(size * min(1.0, k)))),
                  fill=accent if i == 2 else TEXT, anchor="lm",
                  stroke_width=8, stroke_fill=STROKE)
        x += widths[i]


def row_geometry(n: int):
    h = min(ROW_MAX_H, int((ROWS_BOTTOM - ROWS_TOP - (n - 1) * ROW_GAP) / n))
    total = n * h + (n - 1) * ROW_GAP
    top = ROWS_TOP + (ROWS_BOTTOM - ROWS_TOP - total) // 2
    return top, h


def draw_row(draw, y, h, num, name, value_str, note, frac, accent,
             is_answer, masked, appear, unit_pad, t, pop=0.0):
    """1行＝カウントダウン番号・名前・値・バー。masked のあいだは「？？？」。"""
    e = ease_out(appear)
    dx = int((1.0 - e) * -140)
    x0, x1 = PANEL_X0 + dx, PANEL_X1 + dx
    fade = e
    r = 28 if h >= 84 else max(12, h // 3)

    base = mix(BG_BOTTOM, PANEL_BG_JP if (is_answer and not masked) else PANEL_BG, fade)
    draw.rounded_rectangle([x0, y, x1, y + h], radius=r, fill=base)

    if masked:
        # 値が分かると意味がないので、バーは出さずに点滅する枠だけ
        p = pulse(t, 0.9)
        draw.rounded_rectangle([x0, y, x1, y + h], radius=r,
                               outline=mix(base, accent, (0.45 + 0.55 * p) * fade), width=5)
    else:
        bw = int((x1 - x0) * max(0.07, min(1.0, frac)) * e)
        if bw > r * 2:
            draw.rounded_rectangle(
                [x0, y, x0 + bw, y + h], radius=r,
                fill=mix(base, JAPAN if is_answer else accent, 0.46 if is_answer else 0.34))
        if is_answer:
            glow = mix(base, TEXT, fade * (1.0 if pop <= 0 else 0.6 + 0.4 * pulse(t, 0.5)))
            draw.rounded_rectangle([x0, y, x1, y + h], radius=r, outline=glow, width=6)

    # カウントダウン番号
    nb_w = 96
    nb = [x0 + 14, y + 12, x0 + 14 + nb_w, y + h - 12]
    draw.rounded_rectangle(nb, radius=20,
                           fill=mix(base, accent, 0.22 * fade))
    text(draw, ((nb[0] + nb[2]) / 2, (nb[1] + nb[3]) / 2), str(num),
         fit_size(str(num), nb_w - 16, 54, 28),
         fill=mix(base, accent, fade), anchor="mm", stroke=5)

    name_x = x0 + 14 + nb_w + 26
    avail = x1 - name_x - unit_pad
    name_col = mix(base, TEXT, fade)
    val_col = mix(base, JAPAN if is_answer else accent, fade)

    if masked:
        text(draw, (name_x, y + h * 0.52), "？？？", fit_size("？？？", avail, 58, 26),
             fill=mix(base, TEXT, 0.55 * fade), anchor="lm", stroke=6)
        text(draw, (x1 - 34, y + h * 0.52), "？？？",
             fit_size("？？？", unit_pad - 12, 52, 26),
             fill=mix(base, accent, (0.5 + 0.5 * pulse(t, 0.9)) * fade), anchor="rm", stroke=6)
        return

    nsz = fit_size(name, avail, 58, 24)
    if note:
        text(draw, (name_x, y + h * 0.40), name, nsz, fill=name_col, anchor="lm", stroke=6)
        text(draw, (name_x + 2, y + h * 0.72), note, fit_size(note, avail, 30, 18),
             fill=mix(base, JAPAN if is_answer else accent, fade * 0.95), anchor="lm", stroke=4)
    else:
        text(draw, (name_x, y + h * 0.52), name, nsz, fill=name_col, anchor="lm", stroke=6)

    text(draw, (x1 - 34, y + h * 0.52), value_str,
         fit_size(value_str, unit_pad - 12, 56, 26), fill=val_col, anchor="rm", stroke=6)


def zone_unit_pad(script, items):
    longest = max(font(56).getlength(fmt_value(script["unit"], it["v"])) for it in items)
    return int(min(longest, PANEL_W * 0.46)) + 52


def draw_zone_rows(draw, script, zone, accent, shown, t,
                   answer_ri=-1, reveal_pop=-1.0, count_up_from=None):
    """ゾーン1画面分の行。shown は「何行目まで出ているか（小数で進行中）」。"""
    items = zone["items"]
    unit = script["unit"]
    bmin, bmax = script["bar_min"], script["bar_max"]
    top, h = row_geometry(len(items))
    unit_pad = zone_unit_pad(script, items)

    for i, it in enumerate(items):
        t0 = i * T_ROW
        if count_up_from is None:
            local = shown - t0
        else:
            local = 99.0
        if local <= 0:
            break
        appear = min(1.0, local / 0.42)
        cu = min(1.0, local / 0.50)
        start = max(bmin * 0.9, it["v"] * 0.82)
        shown_v = start + (it["v"] - start) * ease_out(cu)
        frac = (it["v"] - bmin) / float(bmax - bmin) if bmax > bmin else 1.0
        is_answer = (i == answer_ri)
        masked = is_answer and (reveal_pop < 0.0)
        draw_row(draw, top + i * (h + ROW_GAP), h, it["num"], it["name"],
                 fmt_value(unit, shown_v), it["note"] if cu >= 1.0 else "",
                 frac, accent, is_answer, masked, appear, unit_pad, t,
                 pop=reveal_pop if is_answer else 0.0)


# ---------------------------------------------------------------- セクション

def draw_hook(draw, script, accent, tl):
    k = ease_out(tl / 0.40)
    main = script["hook_main"]
    ms = max(20, int(fit_size(main, PANEL_W, 104, 46) * (0.86 + 0.14 * k)))
    text(draw, (CX, 690), main, ms, fill=mix(BG_TOP, TEXT, k), anchor="mm", stroke=10)

    k2 = ease_out((tl - 0.32) / 0.40)
    if k2 > 0:
        sub = script["hook_sub"]
        text(draw, (CX, 830), sub, fit_size(sub, PANEL_W, 56, 28),
             fill=mix(BG_TOP, TEXT_DIM, k2), anchor="mm", stroke=7)

    k3 = ease_out_back((tl - 0.72) / 0.45) if tl > 0.72 else 0.0
    if k3 > 0:
        teaser = script["hook_teaser"]
        ts = fit_size(teaser, PANEL_W - 110, 66, 30)
        tw = font(ts).getlength(teaser)
        f = min(1.0, k3)
        draw.rounded_rectangle([CX - (tw / 2 + 44) * f, 985, CX + (tw / 2 + 44) * f, 1105],
                               radius=28, fill=mix(BG_TOP, accent, 0.90))
        if k3 > 0.55:
            text(draw, (CX, 1045), teaser, ts, fill=(12, 16, 30), anchor="mm", stroke=0)

    k4 = ease_out((tl - 1.25) / 0.45) if tl > 1.25 else 0.0
    if k4 > 0:
        note = "答えは最後に発表"
        text(draw, (CX, 1210), note, 44, fill=mix(BG_TOP, TEXT, 0.85 * k4),
             anchor="mm", stroke=7)


def draw_zone(draw, script, seq, zi, accent, tl, total_rows, answer_zi, answer_ri):
    zone = seq[zi]
    done_before = sum(len(z["items"]) for z in seq[:zi])
    shown_rows = max(0.0, min(len(zone["items"]), (tl - T_CHANT) / T_ROW + 1.0))
    progress = (done_before + shown_rows) / total_rows

    draw_topbar(draw, script, accent, progress, False, "", tl,
                total_rows=total_rows, alpha=min(1.0, tl / 0.3))
    draw_chant(draw, zone["word"], accent, tl)
    draw_zone_rows(draw, script, zone, accent, tl - T_CHANT, tl,
                   answer_ri=answer_ri if zi == answer_zi else -1)

    if zone["caption"]:
        t0 = T_CHANT + len(zone["items"]) * T_ROW - 0.2
        k = min(1.0, max(0.0, (tl - t0) / 0.35))
        if k > 0:
            cap = zone["caption"]
            text(draw, (CX, ROWS_BOTTOM - 8), cap, fit_size(cap, PANEL_W, 38, 22),
                 fill=mix(BG_BOTTOM, accent, k), anchor="mm", stroke=5)

    draw_footer(draw, script, accent)


def draw_reveal(draw, script, seq, accent, tl, answer_zi, answer_ri, answer_value,
                total_rows):
    """伏せ札をその場でめくる。前半は「答えは…」、0.5秒でひっくり返す。"""
    zone = seq[answer_zi]
    opened = tl >= 0.5
    draw_topbar(draw, script, accent, 1.0, opened, answer_value, tl,
                total_rows=total_rows)

    if not opened:
        head = "答えは…"
        sz = int(80 * (0.9 + 0.1 * pulse(tl, 0.5)))
        text(draw, (CX, 376), head, sz, fill=mix(TEXT, accent, pulse(tl, 0.6)),
             anchor="mm", stroke=8)
    else:
        line = f"{script['outro_lead']} {script['outro_big']}"
        k = ease_out_back(min(1.0, (tl - 0.5) / 0.35))
        sz = max(20, int(fit_size(line, PANEL_W, 74, 32) * min(1.0, k)))
        text(draw, (CX, 376), line, sz, fill=JAPAN, anchor="mm", stroke=9)

    draw_zone_rows(draw, script, zone, accent, 99.0, tl,
                   answer_ri=answer_ri,
                   reveal_pop=(tl - 0.5) if opened else -1.0,
                   count_up_from=0)
    draw_footer(draw, script, accent)


def draw_outro(draw, script, accent, tl):
    k = ease_out(tl / 0.35)
    lead = script["outro_lead"]
    text(draw, (CX, 640), lead, fit_size(lead, PANEL_W, 52, 28),
         fill=mix(BG_TOP, TEXT_DIM, k), anchor="mm", stroke=7)

    k2 = ease_out_back(min(1.0, (tl - 0.20) / 0.45)) if tl > 0.20 else 0.0
    if k2 > 0:
        big = script["outro_big"]
        sz = max(20, int(fit_size(big, PANEL_W, 126, 54) * min(1.0, k2)))
        text(draw, (CX, 770), big, sz, fill=JAPAN, anchor="mm", stroke=11)

    k3 = ease_out(min(1.0, (tl - 0.55) / 0.40)) if tl > 0.55 else 0.0
    if k3 > 0:
        sub = script["outro_sub"]
        text(draw, (CX, 920), sub, fit_size(sub, PANEL_W, 62, 30),
             fill=mix(BG_TOP, TEXT, k3), anchor="mm", stroke=8)

    k4 = ease_out(min(1.0, (tl - 0.95) / 0.40)) if tl > 0.95 else 0.0
    if k4 > 0:
        cta = "他の国・他のデータも投稿中"
        cs = fit_size(cta, PANEL_W - 120, 46, 26)
        tw = font(cs).getlength(cta)
        draw.rounded_rectangle([CX - tw / 2 - 40, 1330, CX + tw / 2 + 40, 1440],
                               radius=26, fill=mix(BG_TOP, accent, 0.85 * k4))
        text(draw, (CX, 1385), cta, cs, fill=(12, 16, 30), anchor="mm", stroke=0)

    draw_footer(draw, script, accent)


def draw_cover(draw, script, accent, total_rows):
    """フィードに出るサムネイル。中身は見せず「？？？」で引っかける。"""
    title = script["title"]
    text(draw, (CX, 300), title, fit_size(title, PANEL_W, 52, 26),
         fill=TEXT_DIM, anchor="mm", stroke=6)
    draw.line([(CX - 130, 356), (CX + 130, 356)], fill=accent, width=6)

    main = script["hook_main"]
    text(draw, (CX, 560), main, fit_size(main, PANEL_W, 118, 48),
         fill=TEXT, anchor="mm", stroke=12)

    q = "？？？"
    qs = fit_size(q, PANEL_W - 120, 210, 80)
    qw = font(qs).getlength(q)
    draw.rounded_rectangle([CX - qw / 2 - 60, 760, CX + qw / 2 + 60, 1030],
                           radius=44, fill=mix(BG_BOTTOM, accent, 0.22),
                           outline=accent, width=8)
    text(draw, (CX, 900), q, qs, fill=accent, anchor="mm", stroke=10)

    line = f"全{total_rows}{script['count_noun']}カウントダウン"
    text(draw, (CX, 1160), line, fit_size(line, PANEL_W, 52, 26),
         fill=TEXT, anchor="mm", stroke=8)
    tail = script["countdown_label"]
    ts = fit_size(tail, PANEL_W - 110, 54, 26)
    tw = font(ts).getlength(tail)
    draw.rounded_rectangle([CX - tw / 2 - 42, 1250, CX + tw / 2 + 42, 1360],
                           radius=26, fill=accent)
    text(draw, (CX, 1305), tail, ts, fill=(12, 16, 30), anchor="mm", stroke=0)

    draw_footer(draw, script, accent)


def render_cover(script, out_dir: str) -> str:
    seq, total_rows = build_sequence(script)
    accent = ACCENTS.get(seq[0]["word"], ACCENT_DEFAULT)
    img = background(accent, False).copy()
    draw_cover(ImageDraw.Draw(img), script, accent, total_rows)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{script['id']}_cover.png")
    img.save(path)
    print(f"  {script['id']}: サムネイル -> {path}", flush=True)
    return path


# ---------------------------------------------------------------- フレーム生成

def render_frame(script, ctx, t, overlay: bool) -> Image.Image:
    seq, total_rows, segments, answer_zi, answer_ri, answer_value = ctx

    acc = 0.0
    kind, idx, dur, tl = segments[-1][0], segments[-1][1], segments[-1][2], 0.0
    for k, i, d in segments:
        if t < acc + d:
            kind, idx, dur, tl = k, i, d, t - acc
            break
        acc += d
    else:
        tl = t - (acc - segments[-1][2])
    tl = max(0.0, min(dur, tl))

    if kind == "zone":
        accent = ACCENTS.get(seq[idx]["word"], ACCENT_DEFAULT)
    elif kind == "hook":
        accent = ACCENTS.get(seq[0]["word"], ACCENT_DEFAULT)
    elif kind == "reveal":
        accent = ACCENTS.get(seq[answer_zi]["word"], ACCENT_DEFAULT)
    else:
        accent = JAPAN

    img = background(accent, overlay).copy()
    draw = ImageDraw.Draw(img)

    if kind == "hook":
        draw_hook(draw, script, accent, tl)
    elif kind == "zone":
        draw_zone(draw, script, seq, idx, accent, tl, total_rows, answer_zi, answer_ri)
    elif kind == "reveal":
        draw_reveal(draw, script, seq, accent, tl, answer_zi, answer_ri, answer_value,
                    total_rows)
    else:
        draw_outro(draw, script, accent, tl)

    # セクション切り替えのフラッシュ＋答え合わせの一発
    flash = 0.0
    if tl < T_FLASH and t > 0.001:
        flash = (1.0 - tl / T_FLASH) ** 2 * 0.42
    if kind == "reveal" and 0.5 <= tl < 0.5 + T_FLASH:
        flash = max(flash, (1.0 - (tl - 0.5) / T_FLASH) ** 2 * 0.55)
    if flash > 0.002:
        if overlay:
            img = Image.alpha_composite(
                img, Image.new("RGBA", (W, H), tuple(accent) + (int(flash * 210),)))
        else:
            img = Image.blend(img, Image.new("RGB", (W, H), tuple(accent)), flash)
    return img


def build_context(script):
    seq, total_rows = build_sequence(script)
    segments, _ = build_timeline(script)
    azi, ari = answer_position(script, seq)
    # カウントダウンの「1」は必ず答え（日本）に重なっている前提で作っている
    assert seq[azi]["items"][ari]["num"] == 1, (
        f"{script['id']}: 答えがカウント1に来ていない "
        f"（num={seq[azi]['items'][ari]['num']}）")
    answer_value = fmt_value(script["unit"], seq[azi]["items"][ari]["v"])
    if script["answer_name"] != "日本":
        answer_value = f"{script['answer_name']} {answer_value}"
    return seq, total_rows, segments, azi, ari, answer_value


# ---------------------------------------------------------------- 書き出し

def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def render(script, out_dir: str, fps: int, overlay: bool) -> str:
    ctx = build_context(script)
    _, total = build_timeline(script)
    n_frames = int(round(total * fps))
    os.makedirs(out_dir, exist_ok=True)

    if overlay:
        # QuickTime Animation (RLE)。可逆でアルファを確実に保持し、主要な編集ソフトが読める。
        # VP9 のアルファ付きWebMは ffmpeg のビルドによってアルファが落ちるため使わない。
        path = os.path.join(out_dir, f"{script['id']}_overlay.mov")
        vcodec = ["-c:v", "qtrle", "-pix_fmt", "argb"]
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
            img = render_frame(script, ctx, f / fps, overlay)
            if img.mode != mode:
                img = img.convert(mode)
            proc.stdin.write(img.tobytes())
            if f % 120 == 0:
                print(f"  {script['id']}: {100.0 * f / n_frames:5.1f}%", flush=True)
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
                    help="背景透過のオーバーレイ（MOV / QuickTime Animation）を書き出す")
    ap.add_argument("--cover", action="store_true",
                    help="サムネイル用のPNGだけ書き出す（動画は作らない）")
    args = ap.parse_args()

    targets = [s for s in SCRIPTS if not args.ids or s["id"] in args.ids]
    if not targets:
        sys.exit(f"該当する台本IDがありません: {args.ids}")

    for s in targets:
        if args.cover:
            render_cover(s, args.out)
            continue
        _, total = build_timeline(s)
        print(f"[{s['id']}] {s['title']}  想定尺 {total:.1f}秒", flush=True)
        render(s, args.out, args.fps, args.overlay)


if __name__ == "__main__":
    main()
