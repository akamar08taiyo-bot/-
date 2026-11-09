# 機械照合部（介援隊）：アプリの品番・TAIS・注文番号・金額・メーカーが、そのページの文字（text.json）にあるか
import json, re, sys, unicodedata
S = sys.argv[1]
P = json.load(open(f'{S}/listnew/products.json'))
T = json.load(open('/home/user/tokutei/dist-tokutei/catalog/text.json'))
items = json.load(open(f'{S}/insp/crops.json'))
n = lambda s: unicodedata.normalize('NFKC', s)
flat = lambda s: re.sub(r'[\s　]', '', n(s))
probs = []
for it, p in zip(items, P):
    f = next(k for k in T if f'p{p["page"]:03d}' in k)
    page = flat(''.join(t[0] for t in T[f]))
    b = p['box']
    inbox = flat(''.join(t[0] for t in T[f] if b['x'] - 3 <= t[1] <= b['x'] + b['w'] + 3 and b['y'] - 3 <= t[2] <= b['y'] + b['h'] + 6))
    for v in p['variants']:
        if flat(v['code']) not in inbox:
            probs.append((it['id'], v['code'], '品番が枠の中の文字にない' + ('（ページにはある）' if flat(v['code']) in page else '（ページにもない）')))
        if v['tais'] and flat(v['tais']) not in inbox and flat(v['tais']).replace('-', '') not in inbox.replace('-', ''):
            probs.append((it['id'], v['code'], f'TAIS {v["tais"]} が枠の中の文字にない'))
        if v['orderCode'] and flat(v['orderCode']) not in inbox:
            probs.append((it['id'], v['code'], f'注文番号 {v["orderCode"]} が枠の中の文字にない'))
        lp = v['listPrice']
        if lp:
            s = f'{lp:,}'
            if s not in inbox:
                probs.append((it['id'], v['code'], '金額が枠の中の文字にない'))
    if p['maker']:
        mk = flat(p['maker']).replace('(株)', '').replace('(有)', '')
        if mk not in inbox:
            probs.append((it['id'], '', f'メーカー {p["maker"]} が枠の中の文字にない'))
    nm = flat(p['name'])
    if nm not in inbox:
        # 名前の語ごとに
        miss = [w for w in re.split(r'[\s　]+', n(p['name'])) if w and flat(w) not in inbox]
        if miss:
            probs.append((it['id'], '', f'商品名の語 {miss} が枠の中の文字にない'))
json.dump(probs, open(f'{S}/insp/machine-tk.json', 'w'), ensure_ascii=False, indent=0)
print(len(probs))
for x in probs: print(x)
