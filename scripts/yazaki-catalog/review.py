# 矢崎化工カタログの押せる枠（src/sasaoka/yazakiCatalogData.ts）を目で確かめる・抜けた品番の枠を作る道具（2026-11-05 の全ページの点検で使った）。
# 読み取り（ocr.mjs → merge.py）は品番の抜け（表の 4000 の行・施工例の図の品番）や読み違い（EBT-55・AA-355-1）が多かったので、
# この点検で 188 個を手で足し・直した。merge.py で作り直すと消えるので、直すときはデータを直接直す。
#
#   python3 scripts/yazaki-catalog/review.py draw <ページの絵のフォルダ> <ページ> <出力.png> [y0 y1]
#       今の枠（赤）と品番（青）を描く。ページの絵は catalog-yazaki/yazaki-pNNN.jpg（または 300dpi の yazaki-pNNN.png）
#   python3 scripts/yazaki-catalog/review.py grid <ページの絵のフォルダ> <ページ> x0 x1 y0 y1 <出力.png>
#       切り抜きに 0.01 ごとの目盛り（ページの幅・高さの割合）。抜けた品番の書き始めの位置を読むのに使う
#   python3 scripts/yazaki-catalog/review.py snap <ページの絵のフォルダ> <入力.json> <出力.json>
#       入力 [{"page":12,"code":"HCT-4000 T USL","pt":[x,y]}] の点から、その品番の字のかたまり（同じ行のうしろの語も）を枠にする。
#       "box":[x,y,w,h] があればそのまま。"replace":"今の品番" で今の枠を置きかえ、"remove":"品番" で消す
#   python3 scripts/yazaki-catalog/review.py apply <出力.json> ...   → yazakiCatalogData.ts に書き込む
# 足したあとは snap の出力を draw で描き、全部の枠が品番の字の全部（色の記号・入り数の札「3ﾎﾞﾝｲﾘ」まで）を囲むことを目で確かめる
import json, math, os, re, sys
TS = os.path.join(os.path.dirname(__file__), '../../src/sasaoka/yazakiCatalogData.ts')
PAT = re.compile(r'^(\s*)\{page: (\d+), codes: (\[.*\])\}(,?)$')

def load():
    lines = open(TS, encoding='utf-8').read().split('\n')
    pages = {}
    for i, l in enumerate(lines):
        m = PAT.match(l)
        if m: pages[int(m.group(2))] = (i, json.loads(m.group(3)), m.group(1), m.group(4))
    return lines, pages

def dump(lines, pages):
    for p, (i, codes, ind, comma) in pages.items():
        lines[i] = f'{ind}{{page: {p}, codes: {json.dumps(codes, ensure_ascii=False)}}}{comma}'
    open(TS, 'w', encoding='utf-8').write('\n'.join(lines))

def image(folder, page):
    from PIL import Image
    for name in (f'yazaki-p{page:03d}.png', f'yazaki-p{page:03d}.jpg'):
        if os.path.exists(os.path.join(folder, name)): return Image.open(os.path.join(folder, name)).convert('RGB')
    sys.exit(f'ページの絵がない: {folder} p.{page}')

def font(size):
    from PIL import ImageFont
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)

def draw(folder, page, out, y0=0, y1=1, extra=()):
    from PIL import ImageDraw
    _, pages = load(); im = image(folder, page); W, H = im.size; s = W / 2482
    d = ImageDraw.Draw(im); f = font(max(10, int(24 * s)))
    for c, x, y, w, h in pages[page][1]:
        d.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline=(255, 0, 0), width=max(1, int(3 * s)))
        d.text((x * W, (y + h) * H + 2), c, fill=(0, 0, 230), font=f, stroke_width=2, stroke_fill=(255, 255, 180))
    for i, e in extra:
        if e.get('box'):
            x, y, w, h = e['box']
            d.rectangle([x * W - 3, y * H - 3, (x + w) * W + 3, (y + h) * H + 3], outline=(0, 170, 0), width=max(2, int(5 * s)))
            d.text((x * W, (y + h) * H + 4), f"{i}:{e['code']}", fill=(0, 110, 0), font=f, stroke_width=3, stroke_fill=(255, 255, 255))
    im.crop((0, int(y0 * H), W, int(y1 * H))).save(out); print(out)

def grid(folder, page, X0, X1, Y0, Y1, out):
    from PIL import ImageDraw
    _, pages = load(); im = image(folder, page); W, H = im.size
    d = ImageDraw.Draw(im, 'RGBA'); f = font(max(10, int(22 * W / 2482)))
    for c, x, y, w, h in pages[page][1]: d.rectangle([x * W, y * H, (x + w) * W, (y + h) * H], outline=(255, 0, 0), width=2)
    for k in range(int(X0 * 100), int(X1 * 100) + 1):
        d.line([(k / 100 * W, Y0 * H), (k / 100 * W, Y1 * H)], fill=(0, 0, 255, 170 if k % 5 == 0 else 80))
        if k % 5 == 0: d.text((k / 100 * W + 2, Y0 * H + 2), f'.{k:02d}', fill=(0, 0, 255), font=f)
    for k in range(int(Y0 * 200), int(Y1 * 200) + 1):
        d.line([(X0 * W, k / 200 * H), (X1 * W, k / 200 * H)], fill=(0, 140, 255, 160 if k % 2 == 0 else 80))
        if k % 2 == 0: d.text((X0 * W + 2, k / 200 * H + 1), f'{k / 200:.3f}', fill=(0, 100, 255), font=f)
    im.crop((int(X0 * W), int(Y0 * H), int(X1 * W), int(Y1 * H))).save(out); print(out)

def snap(folder, inp, outp):
    import numpy as np
    from scipy import ndimage as nd  # pip install scipy
    _, pages = load(); res = []
    for e in json.load(open(inp)):
        if e.get('box') or e.get('remove'): res.append(e); continue
        page = e['page']; cx, cy = e['pt']
        g = np.asarray(image(folder, page).convert('L')); H, W = g.shape; s = W / 2482
        x0, x1 = max(0, int((cx - 0.08) * W)), min(W, int((cx + 0.25) * W)); y0, y1 = max(0, int((cy - 0.025) * H)), min(H, int((cy + 0.025) * H))
        ink = (g[y0:y1, x0:x1] < 150).copy()
        for c, x, y, w, h in pages[page][1]:  # 今ある枠の字は除く（置きかえるときは、その枠の字も使う）
            if c == e.get('replace'): continue
            ink[max(0, int(y * H) - y0 - 3):max(0, int((y + h) * H) - y0 + 4), max(0, int(x * W) - x0 - 3):max(0, int((x + w) * W) - x0 + 4)] = False
        lab, n = nd.label(ink, structure=np.ones((3, 3)))
        keep = np.zeros(n + 1, bool)
        for i, sl in enumerate(nd.find_objects(lab), 1):
            keep[i] = sl[0].stop - sl[0].start <= 45 * s and sl[1].stop - sl[1].start <= 80 * s  # 線・枠は除く
        m = keep[lab]
        lab2, _ = nd.label(nd.binary_dilation(m, structure=np.ones((max(1, int(5 * s)), max(1, int(9 * s))))))
        words = []
        for i, sl in enumerate(nd.find_objects(lab2), 1):
            ys, xs = np.nonzero(m[sl] & (lab2[sl] == i))
            if len(ys) and 8 * s <= ys.max() - ys.min() + 1 <= 45 * s:
                words.append([sl[1].start + xs.min() + x0, sl[0].start + ys.min() + y0, sl[1].start + xs.max() + 1 + x0, sl[0].start + ys.max() + 1 + y0])
        px, py = cx * W, cy * H
        dist = lambda b: max(b[0] - px, 0, px - b[2]) + 2 * max(b[1] - py, 0, py - b[3])
        if not words or dist(min(words, key=dist)) > 25 * s: res.append(dict(e, box=None)); print('見つからない', e); continue
        b = list(min(words, key=dist)); h = b[3] - b[1]
        while True:  # 同じ行のうしろの語（T・色の記号・入り数の札）をつなぐ
            nxt = [w for w in words if w[0] > b[2] - 2 and w[0] - b[2] <= 1.4 * h and min(w[3], b[3]) - max(w[1], b[1]) > 0.4 * h]
            if not nxt: break
            w = min(nxt, key=lambda w: w[0])
            if w[2] - b[0] > len(e['code']) * 0.75 * h * 1.3: break
            b = [b[0], min(b[1], w[1]), w[2], max(b[3], w[3])]
        res.append(dict(e, box=[round(b[0] / W, 4), round(b[1] / H, 4), round((b[2] - b[0]) / W, 4), round((b[3] - b[1]) / H, 4)]))
    json.dump(res, open(outp, 'w'), ensure_ascii=False, indent=0)
    for page in sorted({e['page'] for e in res}):
        draw(folder, page, outp.replace('.json', f'-p{page:03d}.png'), extra=[(i, e) for i, e in enumerate(res) if e['page'] == page])

def apply(files):
    lines, pages = load()
    ctr = lambda b: (b[0] + b[2] / 2, b[1] + b[3] / 2)
    def near(codes, label, box):
        cs = [c for c in codes if c[0] == label]
        if not cs: return None
        c = min(cs, key=lambda c: math.dist(ctr(c[1:]), ctr(box)))
        return c if math.dist(ctr(c[1:]), ctr(box)) < 0.06 else None
    for f in files:
        for e in json.load(open(f)):
            codes = pages[e['page']][1]; box = [round(float(v), 4) for v in e['box']] if e.get('box') else None
            if not box: sys.exit(f'枠がない {e}')
            if e.get('remove') or e.get('replace'):
                c = near(codes, e.get('remove') or e['replace'], box)
                if not c: sys.exit(f'その品番の枠がない {e}')
                if e.get('remove'): codes.remove(c)
                else: c[:] = [e['code']] + box
                continue
            at = next((k for k, c in enumerate(codes) if c[2] > box[1] + 0.004), len(codes))
            codes.insert(at, [e['code']] + box)
    dump(lines, pages); print('書き込みました', TS)

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__ or 'usage: draw|grid|snap|apply')
    if a[0] == 'draw': draw(a[1], int(a[2]), a[3], *(float(v) for v in a[4:6]))
    elif a[0] == 'grid': grid(a[1], int(a[2]), *(float(v) for v in a[3:7]), a[7])
    elif a[0] == 'snap': snap(a[1], a[2], a[3])
    elif a[0] == 'apply': apply(a[1:])
