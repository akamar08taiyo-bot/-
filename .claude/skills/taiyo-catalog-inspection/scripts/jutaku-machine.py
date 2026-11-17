# 機械照合部：TOTO・マツ六の押せる枠の品番を、PDF の文字（位置つき）と照らす
#  ① 枠の品番が、枠の近くの PDF の文字にそのまま含まれるか（● と色の記号のつなぎを考える）
#  ② PDF の文字にある品番の形の語のうち、どの枠にもないもの（取りこぼしの候補）
#  ③ マツ六：商品コード（040-7301 の形）の行なのに、品番の枠がない行（2026-11-09 に約120行見つかった。品番の形が
#     P34NV-400-00・DX14C・35LB4R・EL5060-1M-NS・AF-1 のように前の決まりに当たらず、②の候補にも出なかった）
#  ④ TOTO：カタログの品番索引（p.101・102）にない枠の品番（PDF の文字の欠け「TS139CEE1」・略した「CL10R」・「タイプ番号」を見つけた）と、
#     索引にあるのにどのページにも枠のない品番（「2m：EWT22AG32」「◆CES9710C#NW1」の前に字の付いたもの）
#  ⑤ 矢崎化工：色の記号のない枠（写真・取付図・説明の囲みの札）で、同じページに色つきの同じ品番の枠（表の行）があるもの。手引きの21で外す枠の候補
#     （2026-11-17 の検品2回目で p.12・16・24・29・40・41・47・49・53 に見つかった。施工例の図の札＝このページの表にない品番は残す）
#  ⑥ TOTO：PDF の文字に「品番＃色」（全角の＃）・「品番 注2週」（受注生産の札）の形があるのに、その品番の枠がないもの（p.78 の背もたれの表の行）
# 使い方：python3 jutaku-machine.py <S>（<S>/insp/jutaku/data.json は jutaku-dump.ts で、いまのアプリのデータから作り直してから）
import json, re, sys, unicodedata
S = sys.argv[1]
D = json.load(open(f'{S}/insp/jutaku/data.json'))
TEXT = {'toto': json.load(open(f'{S}/toto/all/toto-text.json')), 'matsu6': json.load(open(f'{S}/m6/all/matsu6-text.json'))}
TOK = {'toto': r'[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(?:-[A-Z0-9]{1,6})*(?:#[A-Z0-9]{1,6})?',
       'matsu6': r'[A-Z]{1,4}-(?:[A-Z]-)?[A-Z]{0,2}\d{1,4}[A-Z0-9]{0,6}(?:-[A-Z0-9]{1,4})?'}
SHOHIN = re.compile(r'^\d{3}-\d{4}$')
n = lambda s: unicodedata.normalize('NFKC', s).replace(' ', '')
report = {}
for book in ('toto', 'matsu6'):
    pages = {p['page']: p for p in TEXT[book]}
    app = {p['page']: p for p in D[book]}
    bad, miss, rows = [], [], []
    for p in D[book]:
        tp = pages.get(p['page'])
        if not tp:
            bad.append((p['page'], '*', 'PDF の文字なし')); continue
        items = tp['items']
        for code, x, y, w, h in p['codes']:
            cx, cy = x + w / 2, y + h / 2
            near = [it for it in items if abs((it[2] + it[4] / 2) - cy) < 0.012 and it[1] < x + w + 0.01 and it[1] + it[3] > x - 0.01]
            joined = ''.join(n(it[0]) for it in sorted(near, key=lambda it: it[1])).replace('●', '').replace('×', '×')
            base = n(code).split('#')[0]
            if base not in joined:
                bad.append((p['page'], code, joined[:80]))
        have = set(n(c[0]) for c in p['codes'])
        have_base = set(h.split('#')[0] for h in have)
        for it in items:
            for m in re.finditer(TOK[book], n(it[0])):
                t = m.group(0)
                if t in have or t.split('#')[0] in have_base or any(h.startswith(t) for h in have):
                    continue
                miss.append((p['page'], t, n(it[0])[:60]))
    if book == 'matsu6':
        # ③ 商品コードの行（右 30% まで・すぐ上の商品名の行）に枠がない
        for pg, tp in pages.items():
            boxes = app.get(pg, {'codes': []})['codes']
            for it in tp['items']:
                if not SHOHIN.match(it[0].strip()):
                    continue
                x, y = it[1], it[2]
                if any(abs(b[2] - y) < 0.004 and -0.002 <= b[1] - x <= 0.30 for b in boxes) or any(0.006 < y - b[2] <= 0.022 and 0 <= b[1] - x <= 0.15 for b in boxes):
                    continue
                right = sorted([c for c in tp['items'] if abs(c[2] - y) < 0.004 and 0 < c[1] - x <= 0.30], key=lambda c: c[1])
                rows.append((pg, it[0], ' | '.join(c[0][:20] for c in right[:4])))
    index_missing, not_in_index = [], []
    if book == 'toto':
        idx = set()
        for pg in (101, 102):
            for it in pages[pg]['items']:
                idx.update(m.group(0) for m in re.finditer(r'[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(?:-[A-Z0-9]{1,6})*', it[0]))
        allcodes = {(p['page'], c[0]) for p in D[book] for c in p['codes']}
        bases = {c.split('#')[0] for _, c in allcodes}
        not_in_index = sorted({(pg, c) for pg, c in allcodes if c.split('#')[0] not in idx})
        index_missing = sorted(k for k in idx if k not in bases)
    report[book] = {'bad': bad, 'miss': miss, 'shohinRowsWithoutBox': rows, 'notInIndex': not_in_index, 'indexWithoutBox': index_missing}
    print(book, '①枠の品番が近くの文字にない', len(bad), '／ ②文字にあるのに枠がない品番の形の語', len(miss),
          '／ ③商品コードの行に枠がない', len(rows), '／ ④索引にない枠の品番', len(not_in_index), '・索引にあるのに枠がない', len(index_missing))
# ⑤ 矢崎化工の札（色の記号のない枠）と、同じページの色つきの表の行
YCOLOR = re.compile(r' (?!(?:SET|T)$)(?:[A-Z]{1,3}\d?|\d{1,2}[\uFF66-\uFF9F]{2,5}(?: [A-Z]{1,3}\d?)?)$')
labels = []
for p in D['yazaki']:
    names = [c[0] for c in p['codes']]
    for c in p['codes']:
        if not YCOLOR.search(c[0]) and any(n2.startswith(c[0] + ' ') and YCOLOR.search(n2) for n2 in names):
            labels.append((p['page'], c[0], round(c[1], 3), round(c[2], 3)))
report['yazaki'] = {'labelWithRow': labels}
print('yazaki ⑤札で、同じページの色つきの表の行にも枠がある', len(labels))
# ⑥ TOTO の全角の＃・注2週 の付いた品番に枠がない
wide = []
have = {(p['page'], c[0]) for p in D['toto'] for c in p['codes']}
for tp in TEXT['toto']:
    for it in tp['items']:
        m = re.match(r'^\s*(' + TOK['toto'].replace('(?:#', '(?:[#＃]') + r')\s*(?:注\d+週)?\s*$', it[0])
        if m and ('＃' in it[0] or '週' in it[0]) and (tp['page'], m.group(1).replace('＃', '#')) not in have:
            wide.append((tp['page'], it[0]))
report['toto']['wideHashOrBadgeWithoutBox'] = wide
print('toto ⑥全角の＃・注2週 の付いた品番に枠がない', len(wide))
json.dump(report, open(f'{S}/insp/jutaku/machine.json', 'w'), ensure_ascii=False, indent=1)
