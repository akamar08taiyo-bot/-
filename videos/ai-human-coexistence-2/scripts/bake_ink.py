# 画面の中の紙・柱・板に書いてある文字を、クリップに焼き込む。手やめくれたページが重なると、文字はその下に隠れる
# 使い方: python3 -I scripts/bake_ink.py <ID> [--preview 2,6.5,10]
#   timeline.json の shots[].ink のうち "bake": true のものを焼き込み、memory: true なら昭和の色（色あせ・粒子・周辺減光）をかける
#   元のスロー映像は work/raw/<ID>.mp4 に移して残し、public/clips/<ID>.mp4（と最初・最後のコマ）を作り直す
#   --preview：指定の秒（クリップの時刻）のコマだけを work/bake/<ID>_<秒>.jpg に書き出す（動画は作らない）
#
# ink の書き方（Remotion の fx/Ink.tsx と同じ形に、焼き込み用の項目を足したもの）
#   quad：最初のコマでの四隅（割合、紙の左上→右上→右下→左下）。track："<ID>@<名前>"（track_plane.py の平面追跡）
#   aspect：紙の縦横比（幅/高さ）。items：いつも書いてある文字。pages：時間で入れ替わる文字 [{t0, t1, items}]、fade：入れ替えの秒
#   文字（item）：text, x, y（上端）, size（紙の高さに対する割合）, font（maru/pencil/pen/robot/mincho/print/chalk/scratch）,
#     color, opacity, rot（度）, align（left/center/right）, spacing（em）, shaky（0..1：年をとった手のふるえ）, line（行の高さの倍率）
#     text に改行を入れると複数行。kind:"line"（x0,y0,x1,y1,width）で線、kind:"stamp"（x,y,size,text,t）ではんこ
#   blend：multiply（既定）/ normal / screen。patch：{color, feather, inset, mode:"blur"}（下の模様を隠す紙。normal で先に塗る）
#     mode:"clone"：regions [[sx0,sy0,sx1,sy1,dx0,dy0], ...]（紙の座標）で、きれいな所を写して模様を消す。ref：写す元のコマ（秒の一覧）
#   occlude：{d0, d1, grow, ref, wl, open}：基準の紙（ref：秒の一覧か "median"）との色の差が d0〜d1 を超えた所は隠す（手・めくれたページ）
#     wl：明るさの差の重み、open：この大きさより細い差（Veo が動かす傷・罫線）は無視する（紙の座標の低解像度 px）
#     mode:"paper"：基準の紙（ref の秒）から線やはんこ（暗い所）を消して、なめらかにした紙で隠す
#     rects [[x0,y0,x1,y1], ...]：隠す範囲（紙の座標の割合。省略時は inset で全体）
#     relight：基準の紙と今のコマの明るさの比をかける（手の影がかかっても紙が浮かない）。grain：粒子（0..255 の標準偏差）
#   occlude.refs [{until, ref}, ...]：時刻ごとに基準のコマを変える（はんこを押す前と後など）。until 秒より前はその ref
#   occlude.mode:"chroma"：明るさの比と、明るさでわった色の差で見分ける（影は隠さず、手やはんこの台だけを隠す）
#     c0, c1：色の差のしきい値（既定 6, 12）、r_lo, r_hi：明るさの比の下限・上限（既定 0.45, 1.4）
#     shadow（既定 true）：暗くなって青みがかった所（s_lo〜s_hi、s_db、s_da）は影とみなして隠さない
#   t0, t1：全体の出る・消える時刻（クリップの時刻）
#
# カットの "shade": [{x, y, rx, ry, k, soft}] … 楕円の所を暗くする（夜の場面で、顔を暗がりに沈めてシルエットにする）。
#   x, y は中心、rx, ry は半径（画面の割合）、k は明るさの倍率（0.2 なら 2割）、soft はぼかしの幅（半径に対する割合）
#   skin: true なら、楕円の中の肌の色の所だけを暗くする（夜空に暗い輪が出ない）
# カットの "grade": "<ffmpeg のフィルター>" … 焼き込みの最後にかける色の調整（例：夜を深くする curves）。memory の色より先にかかる
import argparse, json, math, os, shutil, subprocess
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
W, H, FPS = 1920, 1080, 30
FONT = {
    'maru': ('/usr/local/share/fonts/hand/HachiMaruPop-Regular.ttf', '#3d3a46', 0.82),
    'pencil': ('/usr/local/share/fonts/hand/Yomogi-Regular.ttf', '#3b3b42', 0.8),
    'pen': ('/usr/local/share/fonts/hand/KleeOne-Regular.ttf', '#1e2a48', 0.84),
    'robot': ('/usr/local/share/fonts/zen/ZenMaruGothic-Bold.ttf', '#30363f', 0.8),
    'mincho': ('/usr/local/share/fonts/zen/ZenOldMincho-Bold.ttf', '#2a1e16', 0.86),
    'print': ('/usr/local/share/fonts/zen/ZenMaruGothic-Bold.ttf', '#4a3d86', 0.85),
    'chalk': ('/usr/local/share/fonts/hand/KleeOne-Regular.ttf', '#f3f0e6', 0.86),
    'scratch': ('/usr/local/share/fonts/hand/Yomogi-Regular.ttf', '#e6dccb', 0.72),
}
# 昭和の回想の色：暖かく褪せた色、黒を少し浮かせる、粒子、周辺減光
MEMORY_GRADE = ("colorbalance=rs=0.05:gs=0.01:bs=-0.07:rm=0.04:bm=-0.05:rh=0.02:bh=-0.05,"
                "eq=saturation=0.8:contrast=0.93,curves=all='0/0.05 0.5/0.51 1/0.95',"
                "noise=c0s=12:c0f=t+u,vignette=angle=PI/4.6")


def hexrgb(c):
    c = c.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def fade_window(t, t0, t1, fin, fout):
    a = 1.0 if fin <= 0 else min(1.0, max(0.0, (t - t0) / fin))
    b = 1.0 if fout <= 0 else min(1.0, max(0.0, (t1 - t) / fout))
    return a * b


def hash1(n):
    x = math.sin(n * 127.1 + 311.7) * 43758.5453123
    return x - math.floor(x)


# ---------- 文字を紙の座標に描く（RGBA、色は item ごと） ----------
def draw_item(layer, it, BW, BH):
    kind = it.get('kind', 'text')
    if kind == 'glare':
        yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
        th = math.radians(it.get('angle', 62))
        dd = (xx / BW - 0.5) * math.cos(th) + (yy / BH - 0.5) * math.sin(th) - it.get('pos', -0.1)
        al = it.get('opacity', 0.35) * np.exp(-(dd / it.get('width', 0.16)) ** 2) + it.get('haze', 0.08)
        fe = it.get('feather', 0.06)  # 縁で消す（四隅が少しずれても四角が見えないように）
        edge = np.minimum(np.minimum(xx, BW - xx) / (fe * BW), np.minimum(yy, BH - yy) / (fe * BH))
        al = al * np.clip(edge, 0, 1)
        paint(layer, np.clip(al, 0, 1).astype(np.float32), hexrgb(it.get('color', '#fff2dc')))
        return
    if kind == 'line':
        col = hexrgb(it.get('color', '#3b3b42')); op = it.get('opacity', 0.75)
        m = Image.new('L', (BW, BH), 0)
        ImageDraw.Draw(m).line((it['x0'] * BW, it['y0'] * BH, it['x1'] * BW, it['y1'] * BH), fill=255, width=max(1, int(it.get('width', 0.004) * BH)))
        paint(layer, np.asarray(m, np.float32) / 255 * op, col)
        return
    path, dcol, dop = FONT[it.get('font', 'pen')]
    fs = max(6, int(it['size'] * BH))
    font = ImageFont.truetype(path, fs)
    col = hexrgb(it.get('color', dcol)); op = it.get('opacity', dop)
    sh = it.get('shaky', 0.0); sp = it.get('spacing', 0.04) * fs
    seed = it.get('seed', len(it['text']) * 3.1 + it['x'] * 17 + it['y'] * 29)
    lines = it['text'].split('\n')
    lh = fs * it.get('line', 1.45)
    # 行ごとに一文字ずつ置く（ふるえ：位置・角度・大きさを少しずつずらす）
    pad = int(fs * 0.8)
    widths = [sum(font.getlength(ch) + sp for ch in ln) - sp for ln in lines]
    bw = int(max(widths) + 2 * pad); bh = int(lh * (len(lines) - 1) + fs * 1.4 + 2 * pad)
    m = Image.new('L', (bw, bh), 0)
    k = 0
    for li, ln in enumerate(lines):
        x = pad + (0 if it.get('align', 'left') == 'left' else (max(widths) - widths[li]) * (0.5 if it.get('align') == 'center' else 1.0))
        y = pad + li * lh
        for ch in ln:
            adv = font.getlength(ch) + sp
            if ch.strip():
                r1 = (hash1(seed + k * 7.13) - 0.5) * 2; r2 = (hash1(seed + k * 3.71 + 1.3) - 0.5) * 2; r3 = (hash1(seed + k * 5.29 + 2.7) - 0.5) * 2
                cs = int(fs * 1.6)
                g = Image.new('L', (cs, cs), 0)
                f2 = ImageFont.truetype(path, max(6, int(fs * (1 + r3 * 0.08 * sh))))
                ImageDraw.Draw(g).text((cs * 0.2, cs * 0.12), ch, font=f2, fill=255)
                if sh:
                    g = g.rotate(r1 * 9 * sh, resample=Image.BICUBIC, center=(cs * 0.5, cs * 0.5))
                ox = x - cs * 0.2 + r2 * 0.05 * sh * fs; oy = y - cs * 0.12 + r3 * 0.09 * sh * fs
                m.paste(Image.fromarray(np.maximum(np.asarray(m.crop((int(ox), int(oy), int(ox) + cs, int(oy) + cs))), np.asarray(g))), (int(ox), int(oy)))
            x += adv; k += 1
    if it.get('rot'):
        m = m.rotate(-it['rot'], resample=Image.BICUBIC, expand=True)
    # 置く位置：x は align の基準点、y は文字の上端
    ax = it['x'] * BW - (pad if it.get('align', 'left') == 'left' else bw / 2 if it.get('align') == 'center' else bw - pad)
    ay = it['y'] * BH - pad
    if it.get('rot'):
        ax -= (m.size[0] - bw) / 2; ay -= (m.size[1] - bh) / 2
    full = Image.new('L', (BW, BH), 0)
    full.paste(m, (int(ax), int(ay)))
    paint(layer, np.asarray(full, np.float32) / 255 * op, col)


def draw_stamp(layer, st, BW, BH):
    d = st['size'] * BH
    S = int(d * 1.6)
    m = Image.new('L', (S, S), 0); dr = ImageDraw.Draw(m)
    c = S / 2; r = d / 2; wdt = max(2, int(d * 0.07))
    dr.ellipse((c - r, c - r, c + r, c + r), outline=255, width=wdt)
    path = FONT['mincho'][0]
    lines = st['text'].split('\n')
    fs = int(d * (0.42 if len(lines) == 1 else 0.3))
    f = ImageFont.truetype(path, fs)
    tot = fs * 1.05 * len(lines)
    for i, ln in enumerate(lines):
        tw = f.getlength(ln)
        dr.text((c - tw / 2, c - tot / 2 + i * fs * 1.05 - fs * 0.12), ln, font=f, fill=255)
    m = m.rotate(st.get('rot', -8), resample=Image.BICUBIC, center=(c, c))
    a = np.asarray(m, np.float32) / 255
    rng = np.random.default_rng(7)
    tex = cv2.GaussianBlur(rng.random(a.shape).astype(np.float32), (0, 0), max(0.6, d * 0.012))
    a = a * np.clip(0.55 + (tex - 0.5) * 2.2, 0.35, 1.0)  # 朱肉のかすれ
    full = np.zeros((BH, BW), np.float32)
    x0 = int(st['x'] * BW - S / 2); y0 = int(st['y'] * BH - S / 2)
    xs, ys = max(0, x0), max(0, y0); xe, ye = min(BW, x0 + S), min(BH, y0 + S)
    full[ys:ye, xs:xe] = a[ys - y0:ye - y0, xs - x0:xe - x0]
    paint(layer, full * st.get('opacity', 0.86), hexrgb(st.get('color', '#c8402e')))


def paint(layer, alpha, col):
    # layer：premultiplied RGBA（float32）。alpha の所に col を「普通に」重ねる
    a = alpha[..., None]
    layer[..., :3] = layer[..., :3] * (1 - a) + col / 255.0 * a
    layer[..., 3:] = layer[..., 3:] * (1 - a) + a


def render_items(items, BW, BH):
    layer = np.zeros((BH, BW, 4), np.float32)
    for it in items:
        if it.get('kind') == 'stamp':
            continue
        draw_item(layer, it, BW, BH)
    return layer


# ---------- 追跡：コマごとの四隅（px） ----------
def corners_for(ink, tracks, n, cid):
    q = np.array(ink['quad'], np.float32).reshape(4, 2) * [W, H]
    if ink.get('track') and ink['track'] in tracks:
        tr = np.array(tracks[ink['track']], np.float32).reshape(-1, 4, 2)
    elif cid in tracks:
        m = np.array(tracks[cid], np.float32)
        tr = np.stack([np.stack([m[:, 0] * x - m[:, 1] * y + m[:, 2], m[:, 1] * x + m[:, 0] * y + m[:, 3]], -1) for x, y in q], 1)
    else:
        tr = np.repeat(q[None], n, 0)
    if len(tr) < n:
        tr = np.concatenate([tr, np.repeat(tr[-1:], n - len(tr), 0)])
    return tr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('id')
    ap.add_argument('--preview', default='')
    a = ap.parse_args()
    cid = a.id
    tl = json.loads((root / 'src' / 'timeline.json').read_text())
    shot = next(s for s in tl['shots'] if s['id'] == cid)
    inks = [k for k in shot.get('ink', []) if k.get('bake')]
    memory = bool(shot.get('memory'))
    shade = None
    if shot.get('shade'):
        # 楕円ごとに、重み（中心で 1、外で 0）と、囲む四角を用意する。skin:true の楕円は、コマごとに肌の色の所だけを暗くする
        shade = []
        for e in shot['shade']:
            x0_ = max(0, int((e['x'] - e['rx'] * (1 + e.get('soft', 0.6))) * W)); x1_ = min(W, int((e['x'] + e['rx'] * (1 + e.get('soft', 0.6))) * W) + 1)
            y0_ = max(0, int((e['y'] - e['ry'] * (1 + e.get('soft', 0.6))) * H)); y1_ = min(H, int((e['y'] + e['ry'] * (1 + e.get('soft', 0.6))) * H) + 1)
            yy, xx = np.mgrid[y0_:y1_, x0_:x1_].astype(np.float32)
            d = np.sqrt(((xx - e['x'] * W) / (e['rx'] * W)) ** 2 + ((yy - e['y'] * H) / (e['ry'] * H)) ** 2)
            soft = e.get('soft', 0.6)
            inside = np.clip((1 + soft - d) / soft, 0, 1)
            inside = inside * inside * (3 - 2 * inside)
            shade.append((e, (y0_, y1_, x0_, x1_), inside))
    raw = root / 'work' / 'raw' / f'{cid}.mp4'
    pub = root / 'public' / 'clips' / f'{cid}.mp4'
    if not raw.exists():
        raw.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(pub), str(raw))
    tracks = json.loads((root / 'src' / 'track.json').read_text()) if (root / 'src' / 'track.json').exists() else {}
    cap = cv2.VideoCapture(str(raw))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frames_needed = None
    if a.preview:
        frames_needed = sorted({min(n - 1, int(round(float(s) * FPS))) for s in a.preview.split(',')})

    # 紙ごとの準備：紙の座標の大きさ、状態ごとの絵、基準の紙（隠すための）
    preps = []
    for ink in inks:
        tr = corners_for(ink, tracks, n, cid)
        aspect = ink.get('aspect', 1.6)
        # 画面上の最大の辺の長さの2倍を、紙の座標の幅にする（細かすぎず粗すぎず）
        e = np.linalg.norm(np.diff(np.concatenate([tr, tr[:, :1]], 1), axis=1), axis=2)
        scr = max(e[:, 0].max(), e[:, 2].max(), e[:, 1].max() * aspect, e[:, 3].max() * aspect)
        BW = int(np.clip(scr * 2.0, 240, 2400)); BH = int(BW / aspect)
        states = []  # (t0, t1, fade, layer)
        if ink.get('items'):
            states.append((ink.get('t0', -99), ink.get('t1', 999), 0.6, render_items(ink['items'], BW, BH)))
        for p in ink.get('pages', []):
            states.append((p['t0'], p['t1'], ink.get('fade', 0.8), render_items(p['items'], BW, BH)))
        stamps = [it for it in ink.get('items', []) if it.get('kind') == 'stamp'] + ([ink['stamp']] if ink.get('stamp') else [])
        stamp_layers = []
        for st in stamps:
            L = np.zeros((BH, BW, 4), np.float32); draw_stamp(L, st, BW, BH); stamp_layers.append((st['t'], L))
        patch = None
        if ink.get('patch'):
            pc = ink['patch']
            pa = np.zeros((BH, BW), np.float32)
            if pc.get('mode') == 'clone':
                for sx0, sy0, sx1, sy1, dx0, dy0 in pc['regions']:
                    w_, h_ = int((sx1 - sx0) * BW), int((sy1 - sy0) * BH)
                    pa[int(dy0 * BH):int(dy0 * BH) + h_, int(dx0 * BW):int(dx0 * BW) + w_] = 1
            elif pc.get('rects'):
                for rx0, ry0, rx1, ry1 in pc['rects']:
                    pa[int(ry0 * BH):int(ry1 * BH), int(rx0 * BW):int(rx1 * BW)] = 1
            else:
                ins = int(pc.get('inset', 0) * BW / 1000)
                pa[ins:BH - ins, ins:BW - ins] = 1
            fe = pc.get('feather', 6) * BW / 1000
            if fe > 0:
                pa = cv2.GaussianBlur(pa, (0, 0), fe)
            patch = (pa * pc.get('opacity', 1.0), pc)
        prep = dict(ink=ink, tr=tr, BW=BW, BH=BH, states=states, stamps=stamp_layers, patch=patch)
        # 基準の紙（低い解像度）：手やめくれたページを見分けるため
        oc = ink.get('occlude')
        if patch and patch[1].get('mode') in ('clone', 'paper'):
            prep['clone_idx'] = {min(n - 1, int(round(float(x) * FPS))) for x in patch[1].get('ref', [0])}
            prep['clone_stack'] = []
        if oc or (patch and (patch[1].get('mode') == 'blur' or patch[1].get('relight'))):
            pw = 192; ph = max(16, int(pw / aspect))
            prep['pw'], prep['ph'] = pw, ph
            segs = (oc or {}).get('refs') or [{'ref': (oc or {}).get('ref', 'median')}]
            prep['segs'] = []
            for sg in segs:
                r_ = sg['ref']
                idx = set(range(0, n, 5)) if r_ == 'median' else {min(n - 1, int(round(float(x) * FPS))) for x in r_}
                prep['segs'].append({'until': sg.get('until', 1e9), 'idx': idx, 'stack': []})
            prep['ref_idx'] = set().union(*[sg['idx'] for sg in prep['segs']])
            prep['stack'] = []
        preps.append(prep)
    # 基準の紙に使うコマを、最初から順に一度だけ読む（シークは遅い）
    need = set().union(*[p.get('ref_idx', set()) | p.get('clone_idx', set()) for p in preps]) if preps else set()
    if need:
        fi = -1
        while fi < max(need):
            ok, fr = cap.read(); fi += 1
            if not ok:
                break
            for p in preps:
                if fi in p.get('ref_idx', ()):
                    pw, ph = p['pw'], p['ph']
                    Hp = cv2.getPerspectiveTransform(p['tr'][fi].astype(np.float32), np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]]))
                    wl_ = cv2.warpPerspective(fr, Hp, (pw, ph), flags=cv2.INTER_AREA)
                    for sg in p['segs']:
                        if fi in sg['idx']:
                            sg['stack'].append(wl_)
                if fi in p.get('clone_idx', ()):
                    Hh = cv2.getPerspectiveTransform(p['tr'][fi].astype(np.float32), np.float32([[0, 0], [p['BW'], 0], [p['BW'], p['BH']], [0, p['BH']]]))
                    p['clone_stack'].append(cv2.warpPerspective(fr, Hh, (p['BW'], p['BH']), flags=cv2.INTER_CUBIC))
    for prep in preps:
        if 'clone_stack' in prep:
            ref_hi = np.median(np.stack(prep.pop('clone_stack')), 0).astype(np.float32) / 255
            img = ref_hi.copy()
            if 'pw' in prep:  # 明るさの比の基準（隠す紙と同じコマ）
                u8_ = (ref_hi * 255).astype(np.uint8)
                prep['plate_low'] = cv2.resize(u8_, (prep['pw'], prep['ph']), interpolation=cv2.INTER_AREA)
            BW, BH = prep['BW'], prep['BH']
            sig = prep['patch'][1].get('match', 10) * BW / 500
            clean = cv2.medianBlur((ref_hi * 255).astype(np.uint8), 7).astype(np.float32) / 255  # 傷を消してから明るさを測る
            low = cv2.GaussianBlur(clean, (0, 0), sig)
            for sx0, sy0, sx1, sy1, dx0, dy0 in prep['patch'][1].get('regions', []):
                ys0, xs0 = int(sy0 * BH), int(sx0 * BW)
                src = ref_hi[ys0:int(sy1 * BH), xs0:int(sx1 * BW)]
                y_, x_ = int(dy0 * BH), int(dx0 * BW)
                h_, w_ = min(src.shape[0], BH - y_), min(src.shape[1], BW - x_)
                src_low = low[ys0:ys0 + h_, xs0:xs0 + w_]
                dst_low = low[y_:y_ + h_, x_:x_ + w_]
                img[y_:y_ + h_, x_:x_ + w_] = np.clip(src[:h_, :w_] - src_low + dst_low, 0, 1)
            if prep['patch'][1].get('mode') == 'paper':
                # 線やはんこ（まわりより暗い所）を消して、なめらかな紙にする
                pc_ = prep['patch'][1]
                u8 = (ref_hi * 255).astype(np.uint8)
                Lh = cv2.cvtColor(u8, cv2.COLOR_BGR2LAB)[..., 0]
                k_ = int(BW * 0.06) | 1
                localL = cv2.medianBlur(Lh, min(k_, 255))
                dark = (Lh.astype(np.int16) < localL.astype(np.int16) - pc_.get('dark', 10)).astype(np.uint8) * 255
                dark = cv2.dilate(dark, np.ones((5, 5), np.uint8))
                filled = cv2.inpaint(u8, dark, 7, cv2.INPAINT_TELEA)
                sm = pc_.get('smooth', 0.012) * BW
                img = cv2.GaussianBlur(filled.astype(np.float32) / 255, (0, 0), sm) if sm > 0 else filled.astype(np.float32) / 255
            prep['patch_img'] = img
        if 'stack' not in prep:
            continue
        BW, BH, patch = prep['BW'], prep['BH'], prep['patch']
        for sg in prep['segs']:
            sg['ref'] = np.median(np.stack(sg.pop('stack')), 0).astype(np.uint8)
            sg['ref_lab'] = cv2.cvtColor(sg['ref'], cv2.COLOR_BGR2LAB).astype(np.float32)
            sg['ref_bgr'] = sg['ref'].astype(np.float32) / 255
        prep.pop('stack', None)
        prep['ref'] = prep['segs'][0]['ref']
        prep['ref_lab'] = prep['segs'][0]['ref_lab']
        if patch and patch[1].get('mode') == 'blur':
            big = cv2.resize(prep['ref'], (BW, BH), interpolation=cv2.INTER_CUBIC)
            k = int(patch[1].get('blur', 40) * BW / 1000) | 1
            prep['patch_img'] = cv2.medianBlur(cv2.medianBlur(big, min(k, 255) | 1), min(k, 255) | 1).astype(np.float32) / 255
    cap.release()
    cap = cv2.VideoCapture(str(raw))

    out_tmp = pub.with_suffix('.tmp.mp4')
    enc = None
    if frames_needed is None:
        chain = [f for f in (shot.get('grade'), MEMORY_GRADE if memory else None) if f]
        vf = ['-vf', ','.join(chain)] if chain else []
        enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                *vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out_tmp)],
                               stdin=subprocess.PIPE)
    prev_dir = root / 'work' / 'bake'; prev_dir.mkdir(parents=True, exist_ok=True)
    fi = -1
    while True:
        ok, fr = cap.read(); fi += 1
        if not ok:
            break
        if frames_needed is not None and fi not in frames_needed:
            if fi > max(frames_needed):
                break
            continue
        t = fi / FPS
        out = fr.astype(np.float32) / 255
        if shade is not None:
            for e, (y0_, y1_, x0_, x1_), inside in shade:
                w_ = inside
                if e.get('skin'):
                    # 肌の色（赤〜黄の色相、ほどほどの彩度と明るさ）の所だけ。夜空や服は暗くしない
                    hsv = cv2.cvtColor(fr[y0_:y1_, x0_:x1_], cv2.COLOR_BGR2HSV).astype(np.float32)
                    h_, s_, v_ = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
                    warm = np.clip(1 - np.minimum(np.abs(h_ - 12), 180 - np.abs(h_ - 12)) / 14, 0, 1)
                    skin = warm * np.clip((s_ - 0.12) / 0.12, 0, 1) * np.clip((v_ - 0.10) / 0.12, 0, 1)
                    skin = cv2.GaussianBlur(cv2.dilate(skin, np.ones((5, 5), np.uint8)), (0, 0), 2.5)
                    w_ = inside * np.clip(skin * 1.4, 0, 1)
                out[y0_:y1_, x0_:x1_] *= (1 - (1 - e.get('k', 0.25)) * w_)[..., None]
        for p in preps:
            ink = p['ink']; BW, BH = p['BW'], p['BH']
            vis = fade_window(t, ink.get('t0', -99), ink.get('t1', 999), 0.6, 0.6)
            if vis <= 0:
                continue
            q = p['tr'][fi].astype(np.float32)
            # 隠す所（紙の座標）：基準の紙との色の差
            occ = None
            keep = None
            seg = None
            if 'segs' in p:
                seg = next((sg for sg in p['segs'] if t < sg['until']), p['segs'][-1])
                Hp = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [p['pw'], 0], [p['pw'], p['ph']], [0, p['ph']]]))
                cur_bgr = cv2.warpPerspective(fr, Hp, (p['pw'], p['ph']), flags=cv2.INTER_AREA)
            if ink.get('occlude'):
                oc = ink['occlude']
                cur = cv2.cvtColor(cur_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
                rl = seg['ref_lab']
                if oc.get('mode') == 'chroma':
                    ca = (cur[..., 1] - 128) / (cur[..., 0] + 20); cb = (cur[..., 2] - 128) / (cur[..., 0] + 20)
                    ra = (rl[..., 1] - 128) / (rl[..., 0] + 20); rb = (rl[..., 2] - 128) / (rl[..., 0] + 20)
                    dist = np.sqrt((ca - ra) ** 2 + (cb - rb) ** 2) * 100
                    dist = cv2.GaussianBlur(dist, (0, 0), 1.2)
                    if oc.get('open'):
                        k_ = int(oc['open'])
                        dist = cv2.morphologyEx(dist, cv2.MORPH_OPEN, np.ones((k_, k_), np.uint8))
                    c0, c1 = oc.get('c0', 6), oc.get('c1', 12)
                    keep = np.clip(1 - (dist - c0) / (c1 - c0), 0, 1)
                    r = (cur[..., 0] + 10) / (rl[..., 0] + 10)
                    r = cv2.GaussianBlur(r, (0, 0), 1.2)
                    if oc.get('shadow', True):
                        # 影：暗くなり（比が s_lo〜s_hi）、空の光で青くなる（黄みが減る）。影は隠さない
                        dna = cv2.GaussianBlur((ca - ra) * 100, (0, 0), 1.2); dnb = cv2.GaussianBlur((cb - rb) * 100, (0, 0), 1.2)
                        sh_ = ((r >= oc.get('s_lo', 0.5)) & (r <= oc.get('s_hi', 0.95)) & (dnb <= oc.get('s_db', 1.0)) & (np.abs(dna) <= oc.get('s_da', 3.0))).astype(np.float32)
                        keep = np.maximum(keep, cv2.GaussianBlur(sh_, (0, 0), 1.0))
                    rlo, rhi = oc.get('r_lo', 0.45), oc.get('r_hi', 1.4)
                    keep = np.minimum(keep, np.clip((r - (rlo - 0.1)) / 0.1, 0, 1) * np.clip(((rhi + 0.15) - r) / 0.15, 0, 1))
                else:
                    d = cur - rl
                    dist = np.sqrt((d[..., 0] * oc.get('wl', 0.6)) ** 2 + d[..., 1] ** 2 + d[..., 2] ** 2)
                    dist = cv2.GaussianBlur(dist, (0, 0), 1.2)
                    if oc.get('open'):
                        k_ = int(oc['open'])
                        dist = cv2.morphologyEx(dist, cv2.MORPH_OPEN, np.ones((k_, k_), np.uint8))
                    d0, d1 = oc.get('d0', 16), oc.get('d1', 30)
                    keep = np.clip(1 - (dist - d0) / (d1 - d0), 0, 1)
                g = int(oc.get('grow', 2))
                if g > 0:
                    keep = cv2.erode(keep, np.ones((2 * g + 1, 2 * g + 1), np.uint8))
                keep = cv2.GaussianBlur(keep, (0, 0), 1.0)
                occ = cv2.resize(keep, (BW, BH), interpolation=cv2.INTER_LINEAR)
                if frames_needed is not None and os.environ.get('BAKE_DEBUG'):
                    dbg = np.hstack([cur_bgr, cv2.cvtColor((keep * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)])
                    cv2.imwrite(str(root / 'work' / 'bake' / f'{cid}_keep{preps.index(p)}_{t:.1f}.png'), cv2.resize(dbg, (dbg.shape[1] * 3, dbg.shape[0] * 3), interpolation=cv2.INTER_NEAREST))
            ratio_hi = None
            if p['patch'] is not None and p['patch'][1].get('relight') and seg is not None:
                # 明るさの比（基準の紙 → 今）。線やはんこ（基準で暗い所）と、隠れている所は使わない
                if 'plate_low' in p:
                    rb_ = p['plate_low'].astype(np.float32) / 255
                    Lr = cv2.cvtColor(p['plate_low'], cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
                else:
                    rb_ = seg['ref_bgr']; Lr = seg['ref_lab'][..., 0]
                cb_ = cur_bgr.astype(np.float32) / 255
                m = (Lr > np.median(Lr) - 18).astype(np.float32) * (keep if keep is not None else 1)
                sg_ = p['patch'][1].get('relight_sigma', 4)
                den_m = cv2.GaussianBlur(m, (0, 0), sg_)
                num = cv2.GaussianBlur(cb_ * m[..., None], (0, 0), sg_)
                den = cv2.GaussianBlur(rb_ * m[..., None], (0, 0), sg_)
                ratio = np.clip(num / np.maximum(den, 1e-3), 0.3, 1.8)
                wide = cv2.GaussianBlur(ratio * den_m[..., None], (0, 0), sg_ * 4) / np.maximum(cv2.GaussianBlur(den_m, (0, 0), sg_ * 4), 1e-3)[..., None]
                fill = np.clip(den_m / 0.25, 0, 1)[..., None]
                ratio = ratio * fill + wide * (1 - fill)
                ratio_hi = cv2.resize(ratio, (BW, BH), interpolation=cv2.INTER_LINEAR)
            # 紙の座標 → 画面（はみ出しを避けるため、四隅を囲む範囲だけで計算）
            x0, y0 = np.floor(q.min(0)).astype(int) - 2; x1, y1 = np.ceil(q.max(0)).astype(int) + 2
            x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1)
            if x1 <= x0 or y1 <= y0:
                continue
            Hs = cv2.getPerspectiveTransform(np.float32([[0, 0], [BW, 0], [BW, BH], [0, BH]]), (q - np.float32([x0, y0])).astype(np.float32))
            roi = out[y0:y1, x0:x1]

            def warp(img):
                return cv2.warpPerspective(img, Hs, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            if p['patch'] is not None:
                pa, pc = p['patch']
                alpha = pa * vis * (occ if occ is not None else 1)
                if 'patch_img' in p:
                    colimg = p['patch_img']  # 基準の紙をぼかしたもの（BGR）
                else:
                    colimg = np.ascontiguousarray(np.broadcast_to((hexrgb(pc.get('color', '#e8dcc6')) / 255)[::-1], (BH, BW, 3))).astype(np.float32)
                if ratio_hi is not None:
                    colimg = colimg * ratio_hi
                if pc.get('grain'):
                    colimg = colimg + np.random.default_rng(fi).normal(0, pc['grain'] / 255, colimg.shape[:2])[..., None].astype(np.float32)
                A = warp(alpha.astype(np.float32))[..., None]
                C = warp(colimg)
                roi[:] = roi * (1 - A) + C * A
            # 文字の層：状態ごとの重みで混ぜる（premultiplied）
            acc = np.zeros((BH, BW, 4), np.float32)
            for (s0, s1, fd, L) in p['states']:
                w = fade_window(t, s0, s1, fd, fd)
                if w > 0:
                    acc += L * w
            for (st_t, L) in p['stamps']:
                w = min(1.0, max(0.0, (t - st_t) / 0.12))
                if w > 0:
                    acc = acc * (1 - L[..., 3:] * w) + L * w
            if acc[..., 3].max() <= 0:
                continue
            acc *= vis
            if occ is not None:
                acc *= occ[..., None]
            blur = ink.get('soft', 0.6) * BW / max(1, (x1 - x0))
            if blur > 0.3:
                acc = cv2.GaussianBlur(acc, (0, 0), blur)
            Wc = warp(acc)
            A = Wc[..., 3:]
            C = np.where(A > 1e-4, Wc[..., :3] / np.maximum(A, 1e-4), 0)[..., ::-1]  # RGB → BGR
            mode = ink.get('blend', 'multiply')
            if mode == 'multiply':
                roi[:] = roi * (1 - A + A * C)
            elif mode == 'screen':
                roi[:] = 1 - (1 - roi) * (1 - A * C)
            else:
                roi[:] = roi * (1 - A) + C * A
        img = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
        if enc is not None:
            enc.stdin.write(img.tobytes())
        else:
            pth = prev_dir / f'{cid}_{t:.1f}.jpg'
            cv2.imwrite(str(pth), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            chain = [f for f in (shot.get('grade'), MEMORY_GRADE.replace(':c0f=t+u', ':c0f=u') if memory else None) if f]
            if chain:
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(pth), '-vf', ','.join(chain), str(pth)], check=True)
            print('preview', pth.relative_to(root))
    if enc is not None:
        enc.stdin.close(); enc.wait()
        out_tmp.replace(pub)
        for name, args in (('first', ['-i', str(pub)]), ('last', ['-sseof', '-0.05', '-i', str(pub)])):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-frames:v', '1', '-q:v', '2', str(pub.with_name(f'{cid}_{name}.jpg'))], check=True)
        print(cid, 'baked', len(inks), 'ink planes', 'memory grade' if memory else '', 'shade' if shade is not None else '', 'grade' if shot.get('grade') else '', '->', pub.relative_to(root))


main()
