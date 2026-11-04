# メーカーのカタログのページの文字（render.mjs の <頭>-text.json）から、品番とその位置を取り出して src/sasaoka/<頭>CatalogData.ts を書く。
# いまは TOTO の手すりカタログ（2026-11-04 にいただいた PDF）。品番の形：YHB203・T110D3R・EWT10BU35Z・TS139J●（●は色を選ぶ）・T114HK7R#MWA。
# 色の記号はとなりの別の文字（「YHB203」「#NW1」）なので、同じ行のすぐ右にあればつなぐ。金額・商品名は書かない（金額は部材リストから）。
# 文の中の品番（「…の場合はTS139S6S ¥30,800を、」）と、略した品番（「T113BP21・BP22・BP23」の BP22）は押す枠にしない。
# usage: python3 -I scripts/maker-catalog/codes.py <text.json> <頭（toto）> <出力の ts>
import json
import re
import sys

src, prefix, out = sys.argv[1:4]
pages = json.load(open(src, encoding='utf-8'))

TOKEN = r'[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(?:-[A-Z0-9]{1,6})*(?:#[A-Z0-9]{1,6})?'
# 品番だけの文字（前にかっこ・長さ、うしろに ●・×本数・※・読点・かっこ閉じがついていてもよい）
ITEM = re.compile(r'^[（(]?\s*(?:[（(]\d+mm[)）]\s*)?(' + TOKEN + r')\s*(●)?(?:×\d+|※\d+|[、，,)）]|\s|R/L兼用)*$')
COLOR = re.compile(r'^#[A-Z0-9]{1,6}$')


def width_of(s):
    return sum(0.55 if ord(c) < 0x2000 else 1.0 for c in s)


data = []
total = 0
for p in pages:
    items = p['items']
    codes = []
    colors = [it for it in items if COLOR.match(it[0].strip())]
    for it in items:
        s = it[0]
        m = ITEM.match(s.strip())
        if not m:
            continue
        code = m.group(1)
        if len(code.split('#')[0]) < 5:  # 略した品番・短い記号
            continue
        if not re.search(r'\d', code):
            continue
        x, y, w, h = it[1:5]
        # 品番の前に字があれば、その分だけ枠を右へ（字の幅は半角 0.55・全角 1 で見積もる）
        lead = s[: s.find(code)]
        tw = width_of(s) or 1
        cx = x + w * width_of(lead) / tw
        cw = w * width_of(code) / tw
        # すぐ右の色の記号（同じ行・すき間 1% まで）をつなぐ
        if '#' not in code:
            for c in colors:
                if abs(c[2] - y) < 0.004 and -0.002 <= c[1] - (cx + cw) <= 0.01:
                    code += c[0].strip()
                    cw = c[1] + c[3] - cx
                    break
        codes.append([code, round(cx, 4), round(y, 4), round(max(cw, 0.01), 4), round(h, 4)])
    # 同じ所の同じ品番は1つに
    seen = set()
    uniq = []
    for c in codes:
        k = (c[0], round(c[1], 2), round(c[2], 2))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(c)
    if uniq:
        data.append({'page': p['page'], 'codes': uniq})
        total += len(uniq)

name = prefix.upper()
with open(out, 'w', encoding='utf-8') as f:
    f.write(f'// {name} の手すりカタログ（いただいた PDF）の品番と位置（ページの幅・高さの割合）。scripts/maker-catalog/ の render.mjs → codes.py で作った（makerCatalogs.ts）。\n')
    f.write('// 金額・商品名は持たない（ユーザーの指示「リポジトリに仕入れや定価は残さない」。商品名・定価・仕切は部材リストの同じ品番から）。\n')
    f.write('// 「#NW1」などは色の記号（押すと部材リストの色ちがいから選ぶ）。「●」の品番（色を選ぶ品番）は ● を除いた形\n')
    f.write(f'export const {name}_PAGES: {{page: number; codes: [string, number, number, number, number][]}}[] = [\n')
    for p in data:
        f.write('  ' + json.dumps(p, ensure_ascii=False, separators=(', ', ': ')).replace('"page"', 'page').replace('"codes"', 'codes') + ',\n')
    f.write('];\n')
print(f'{len(data)} ページ・{total} の品番')
