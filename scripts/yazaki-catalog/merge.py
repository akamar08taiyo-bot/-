# 150dpi と 300dpi の読み取り（ocr.mjs）を合わせて、品番と位置の一覧（src/sasaoka/yazakiCatalogData.ts）を作る。金額は入れない
# 使い方：python3 scripts/yazaki-catalog/merge.py all.jsonl all300.jsonl src/sasaoka/yazakiCatalogData.ts
import json, re, sys, unicodedata
CODE = re.compile(r'^[A-Z]{1,5}\d{0,2}-[0-9A-Z]{1,6}(-[0-9A-Z]{1,3})?$')
SUF = re.compile(r'^[A-Z]{1,4}$')
def norm(t):
    t = unicodedata.normalize('NFKC', t)
    for a in '一ー—–―‐':
        t = t.replace(a, '-')
    return t.strip().strip('|.,:;()（）[]「」')
def read(path, W, H):
    pages = {}
    for line in open(path, encoding='utf8'):
        d = json.loads(line)
        page = int(re.search(r'p(\d+)\.png', d['file']).group(1))
        words = [dict(w, t=norm(w['t'])) for w in d['words']]
        out = []
        for i, w in enumerate(words):
            t = w['t']
            if not CODE.match(t) or not re.search(r'\d', t) or re.match(r'^P[I1L]?\d', t) or re.search(r'-D\d\d$', t):
                continue
            b = dict(w['b']); h = b['y1'] - b['y0']; parts = [t]; conf = [w['c']]
            j = i + 1
            while j < len(words) and len(parts) < 4:
                n = words[j]; nt = n['t']; gap = n['b']['x0'] - b['x1']
                if n['line'] != w['line'] or gap < -2 or gap > h * 2.5 or not SUF.match(nt) or nt in ('NEW', 'I', 'MTRM'):
                    break
                parts.append(nt); conf.append(n['c'])
                b['x1'] = max(b['x1'], n['b']['x1']); b['y0'] = min(b['y0'], n['b']['y0']); b['y1'] = max(b['y1'], n['b']['y1'])
                j += 1
            out.append({'code': ' '.join(parts), 'x': b['x0'] / W, 'y': b['y0'] / H, 'w': (b['x1'] - b['x0']) / W, 'h': (b['y1'] - b['y0']) / H, 'conf': min(conf)})
        pages[page] = out
    return pages
key = lambda c: re.sub(r'[\s-]', '', c)
a = read(sys.argv[1], 1240, 1754)
b = read(sys.argv[2], 2480, 3508) if len(sys.argv) > 3 else {}
result = []
for page in sorted(set(a) | set(b)):
    cands = b.get(page, []) + a.get(page, [])  # 300dpi を先に（位置・字が細かい）
    kept = []
    for c in cands:
        ck = key(c['code'])
        near = [k for k in kept if abs(k['x'] - c['x']) < 0.03 and abs(k['y'] - c['y']) < 0.006 and (key(k['code']).startswith(ck) or ck.startswith(key(k['code'])))]
        if near:
            k = near[0]
            # 同じ所：長い方（色の記号まで読めた方）・自信の高い方
            if len(ck) > len(key(k['code'])):
                k.update(code=c['code'], w=max(k['w'], c['w']))
            k['seen'] = k.get('seen', 1) + 1
            continue
        kept.append(dict(c, seen=1))
    kept.sort(key=lambda k: (round(k['y'], 2), k['x']))
    result.append({'page': page, 'kept': kept})
# 確かな品番（自信が高い・2つの読み取りで同じ）の頭（色の記号の前）。自信の低い品番は、確かな品番と1字だけ読みちがえやすい字（8↔5・S↔5 など）で
# ちがうなら確かな方に直す。直せず自信もとても低いものは除く
CONF = {('8', '5'), ('S', '5'), ('3', '5'), ('6', '5'), ('9', '5'), ('O', '0'), ('D', '0'), ('I', '1'), ('L', '1'), ('B', '8'), ('Z', '2'), ('G', '6'), ('Z', '7'), ('O', 'C'), ('F', 'E'), ('M', 'A'), ('S', '3')}
CONF |= {(b, a) for a, b in CONF}
trusted = lambda k: k['conf'] >= 75 or k['seen'] > 1
bases = {k['code'].split(' ')[0] for p in result for k in p['kept'] if trusted(k)}
fixed = 0
for p in result:
    out = []
    for k in p['kept']:
        if not trusted(k):
            b, rest = k['code'].split(' ')[0], k['code'].split(' ')[1:]
            if b not in bases:
                cand = [t for t in bases if len(t) == len(b) and sum(x != y for x, y in zip(t, b)) == 1 and all(x == y or (x, y) in CONF for x, y in zip(t, b))]
                # 頭の1字を読み落としたもの（A-35EE → AA-35EE、ZG-1 → CZG-1）
                lead = [t for t in bases if len(t) == len(b) + 1 and t.endswith(b)]
                if len(cand) == 1:
                    k['code'] = ' '.join([cand[0]] + rest); fixed += 1
                elif len(lead) == 1:
                    k['code'] = ' '.join([lead[0]] + rest); fixed += 1
                elif k['conf'] < 40:
                    continue
        out.append(k)
    # 長い品番の一部だけを読んだもの（SCD6-4000 の中の D6-4000、CZG-1 の ZG-1）は、重なる長い品番があれば除く
    def inside(a, b):
        return a is not b and key(b['code']) != key(a['code']) and key(a['code'].split(' ')[0]) in key(b['code'].split(' ')[0]) and \
            a['x'] < b['x'] + b['w'] and b['x'] < a['x'] + a['w'] and abs(a['y'] - b['y']) < 0.008
    out = [k for k in out if not any(inside(k, o) for o in out)]
    p['codes'] = [[k['code'], round(k['x'], 4), round(k['y'], 4), round(k['w'], 4), round(k['h'], 4)] for k in out]
# 1度しか出ない品番で、頭の1〜2字を読み落としたもの（D6-4000 → SCD6-4000、ZG-1 → CZG-1）は、何度も出る品番に直す
count = {}
for p in result:
    for c in p['codes']:
        b = c[0].split(' ')[0]; count[b] = count.get(b, 0) + 1
for p in result:
    for c in p['codes']:
        parts = c[0].split(' '); b = parts[0]
        if count[b] > 1:
            continue
        lead = [t for t, n in count.items() if n > 1 and len(t) - len(b) in (1, 2) and t.endswith(b)]
        if len(lead) == 1:
            c[0] = ' '.join([lead[0]] + parts[1:]); fixed += 1
# 目で見て確かめた読みちがい（ページの絵と見比べた）
MANUAL = {'ZG-1': 'CZG-1', 'HLZ-P11': 'HL7-P11', 'E-50148': 'EC-5014B', 'CZD-1-1': 'CZD-120-1'}
for p in result:
    for c in p['codes']:
        parts = c[0].split(' ')
        if parts[0] in MANUAL:
            c[0] = ' '.join([MANUAL[parts[0]]] + parts[1:]); fixed += 1
print('fixed', fixed)
out = sys.argv[3] if len(sys.argv) > 3 else sys.argv[2]
with open(out, 'w', encoding='utf8') as f:
    f.write('// 矢崎化工カタログ（p.12〜81）の品番と位置（ページの幅・高さの割合）。いただいた PDF のページの絵を読み取って作った（yazakiCatalog.ts）。金額は入れない\n')
    f.write('// 作り方：PDF を pdftoppm で 150dpi と 300dpi の絵にし、tesseract.js（jpn）で読み、品番の形の語と、そのうしろの色の記号（USL・SGD など）をつなぐ。\n')
    f.write('// 2つの読み取りを合わせ、自信の低いものは両方で同じものだけ残す。ページの参照（P.12〜P.29）などは除く\n')
    f.write('export const YAZAKI_PAGES: {page: number; codes: [string, number, number, number, number][]}[] = [\n')
    for p in result:
        f.write('  {page: %d, codes: [%s]},\n' % (p['page'], ', '.join(json.dumps(c, ensure_ascii=False) for c in p['codes'])))
    f.write('];\n')
tot = sum(len(p['codes']) for p in result)
print('pages', len(result), 'codes', tot)
for p in result:
    print(p['page'], len(p['codes']), ' | '.join(c[0] for c in p['codes'])[:220])
