#!/usr/bin/env python3
"""ショート仕様（episodes/shorts/specs/*.json）の間を詰める（声の速さは ep01 の tempo を short_build が引き継ぐ）。
  - 最初の行の pre は 3.0 まで。他の行の pre（1.0 以上）は 0.8 倍。
  - gap（1.0 以上）は 0.75 倍（0.9 未満にはしない）。最後の行の gap（終わりの札）は残す。
  - 画面・効果音・環境音・音楽・カットの時刻は、新しい間に比例して内側へ。行の中の時刻は声が速くなった分だけ早める。
控えは episodes/shorts/specs_v1/ に置く。
"""
import glob, json, os, re, shutil

TEMPO = json.load(open('episodes/ep01/script.json')).get('tempo', {})
os.makedirs('episodes/shorts/specs_v1', exist_ok=True)

ANCH = re.compile(r'^(S\d+)\+([\d.]+)$')
LINE = re.compile(r'^([a-z0-9_]+)\.([se])([+-])([\d.]+)$')


def retime(spec):
    L = spec['lines']
    old = {l['id']: (float(l.get('pre', 0)), float(l.get('gap', 0))) for l in L}
    first = {}
    for l in L:
        first.setdefault(l['scene'], l['id'])
    new = {}
    for i, l in enumerate(L):
        pre, gap = old[l['id']]
        if i == 0:
            pre = min(pre, 3.0)
        elif pre >= 1.0:
            pre = round(pre * 0.8, 1)
        if i < len(L) - 1 and gap >= 1.0:
            gap = max(0.9, round(gap * 0.75, 1))
        new[l['id']] = (pre, gap)
        l['pre'], l['gap'] = pre, gap
    style = {l['id']: l['style'] for l in L}

    def scale(a):
        m = ANCH.match(a)
        if m:
            sc, off = m.group(1), float(m.group(2))
            fid = first.get(sc)
            if fid and old[fid][0] > 0 and off > new[fid][0]:
                return f'{sc}+{round(off * new[fid][0] / old[fid][0], 1)}'
            return a
        m = LINE.match(a)
        if not m or m.group(1) not in old:
            return a
        lid, se, sign, off = m.group(1), m.group(2), m.group(3), float(m.group(4))
        o_pre, o_gap = old[lid]
        n_pre, n_gap = new[lid]
        if se == 'e' and sign == '+' and off > n_gap and o_gap > 0:
            return f'{lid}.e+{round(off * n_gap / o_gap, 1)}'
        if se == 's' and sign == '-' and off > n_pre and o_pre > 0:
            return f'{lid}.s-{round(off * n_pre / o_pre, 1)}'
        if se == 's' and sign == '+':
            return f'{lid}.s+{round(off / TEMPO.get(style[lid], 1.0), 1)}'
        return a

    def walk(o):
        if isinstance(o, str):
            return scale(o) if (ANCH.match(o) or LINE.match(o)) else o
        if isinstance(o, list):
            return [walk(x) for x in o]
        if isinstance(o, dict):
            return {k: (v if k == 'lines' else walk(v)) for k, v in o.items()}
        return o

    return walk(spec)


for p in sorted(glob.glob('episodes/shorts/specs/sh*.json')):
    b = os.path.join('episodes/shorts/specs_v1', os.path.basename(p))
    if not os.path.exists(b):
        shutil.copy(p, b)
    spec = json.load(open(b))  # いつも控えから作る
    spec = retime(spec)
    json.dump(spec, open(p, 'w'), ensure_ascii=False, indent=1)
    L = spec['lines']
    print(os.path.basename(p), 'pre', round(sum(l['pre'] for l in L), 1), 'gap', round(sum(l['gap'] for l in L), 1))
