# 住宅改修（TOTO）：押す枠の左右の端が、字の真ん中を切っていないかを数える（2026-11-09 の再検品3で作った）
# 使い方：PDF を 300dpi で描き直す（node scripts/maker-catalog/render.mjs <PDF> <S>/toto-hi toto 11 102 300）→
#   python3 jutaku-cutcheck.py <S> <totoCatalogData.ts> [くらべる ts …] → 端の前後 5 列すべてに墨がある枠の数と一覧（<S>/cutcheck.json）
# ●・×・表の線が品番の字にくっついている所も数に入る（目で見て、品番の字が全部枠の中なら問題なし）
import re, json, sys
import numpy as np
from PIL import Image
def load(f):
    out = {}
    for m in re.finditer(r'\{page: (\d+), codes: (\[.*?\])\}', open(f).read()):
        out[int(m.group(1))] = json.loads(m.group(2))
    return out
S = sys.argv[1] if len(sys.argv) > 1 else None
_c = {}
def page(pg):
    if pg not in _c: _c[pg] = np.asarray(Image.open(f'{S}/toto-hi/toto-p{pg:03d}.jpg').convert('L'), dtype=np.int16)
    return _c[pg]
def cuts(pg, x, y, w, h):
    a = page(pg); H, W = a.shape
    y0 = int(round(y * H)); y1 = int(round((y + h) * H)); m = max(1, (y1 - y0) // 6)
    band = a[y0 + m:y1 - m] < 170
    col = band.any(axis=0)
    def cut(e):
        e = int(round(e))
        return e - 2 >= 0 and e + 3 <= W and col[e - 2:e + 3].all()
    return cut(x * W), cut((x + w) * W)
if __name__ == '__main__':
    res = {}
    for name in sys.argv[2:]:
        d = load(name); L = R = n = 0; bad = []
        for pg, cs in d.items():
            if pg > 102: continue
            for c in cs:
                l, r = cuts(pg, *c[1:])
                n += 1; L += l; R += r
                if l or r: bad.append((pg, c[0], 'L' if l else '', 'R' if r else ''))
        res[name] = bad
        print(name.split('/')[-1], '枠', n, '左の端が字を切る', L, '右の端が字を切る', R)
    json.dump({k: v for k, v in res.items()}, open(f'{S}/cutcheck.json', 'w'), ensure_ascii=False)
