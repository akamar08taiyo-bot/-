# 検品の書き取り（第1〜3部）とアプリの読み取りを機械でくらべ、食い違いを商品ごとに集める（審査部に回す）
import json, os, re, sys, unicodedata, glob
S = sys.argv[1]
P = json.load(open(f'{S}/listnew/products.json'))
items = json.load(open(f'{S}/insp/crops.json'))
app = {it['id']: p for it, p in zip(items, P)}
pageof = {it['id']: it['page'] for it in items}
def nf(s): return unicodedata.normalize('NFKC', str(s or ''))
def ck(s): return re.sub(r'[\s\-‐‑‒–—―ー－/／・.]', '', nf(s).upper())
def toks(s): return [t for t in re.split(r'[\s　・、，,／/()（）\[\]「」]+', nf(s)) if t]
def flat(s): return re.sub(r'[\s　()（）\[\]「」・、]', '', nf(s))
def load(pattern):
    out = {}
    for f in sorted(glob.glob(f'{S}/insp/out/{pattern}')):
        try:
            data = json.load(open(f))
        except Exception as e:
            print('読めない', f, e); continue
        if isinstance(data, dict):
            data = data.get('products') or data.get('items') or list(data.values())[0]
        for d in data:
            if isinstance(d, dict) and d.get('id'):
                out[d['id']] = d
    return out
D1 = {t: load(f'd1{t}-g*.json') for t in 'AB'}
D2 = {t: load(f'd2{t}-g*.json') for t in 'AB'}
D3 = load('d3-g*.json')
issues = {}
def add(pid, kind, detail, evidence):
    issues.setdefault(pid, []).append({'kind': kind, 'detail': detail, 'evidence': evidence})
missing_tx = []
for pid, p in app.items():
    av = p['variants']
    # 第1部 品番・色サイズ
    for t in 'AB':
        d = D1[t].get(pid)
        if not d:
            missing_tx.append((f'd1{t}', pid)); continue
        rows = d.get('rows') or []
        tc = {}
        for r in rows:
            tc.setdefault(ck(r.get('code')), []).append(r)
        acodes = {ck(v['code']) for v in av}
        for c, rs in tc.items():
            if c and c not in acodes and c not in {ck(o) for o in d.get('orderNumbers', [])}:
                add(pid, '品番', f'{t}班の書き取りにある品番「{rs[0].get("code")}」がアプリにない', {t: rs})
            if not c:
                add(pid, '品番', f'{t}班：品番のない行（{rs[0].get("words")}）', {t: rs})
        for v in av:
            c = ck(v['code'])
            if c not in tc:
                add(pid, '品番', f'アプリの品番「{v["code"]}」が{t}班の書き取りにない', {t: [r.get('code') for r in rows]})
                continue
            rs = tc[c]
            # 同じ品番の行数（色ちがい）
            same = [x for x in av if ck(x['code']) == c]
            if len(rs) > len(same):
                add(pid, '色・サイズ', f'品番「{v["code"]}」：{t}班は{len(rs)}行（色・サイズちがい）、アプリは{len(same)}行', {t: rs, 'app': [x['label'] for x in same]})
            words = ' '.join(nf(r.get('words', '')) for r in rs) if len(same) == 1 else None
            if words is not None:
                fw = flat(words)
                lab = v['label']
                extra = [w for w in toks(lab) if flat(w) and flat(w) not in fw]
                missing = [w for w in toks(words) if flat(w) and flat(w) not in flat(lab) and flat(w) not in flat(p['name'])]
                if extra:
                    add(pid, '色・サイズ', f'品番「{v["code"]}」：アプリの「{lab}」の {extra} が{t}班の書き取り「{words}」にない', {t: rs})
                if missing:
                    add(pid, '色・サイズ', f'品番「{v["code"]}」：{t}班の書き取り「{words}」の {missing} がアプリの「{lab}」にない', {t: rs})
        on = {ck(o) for o in d.get('orderNumbers', [])}
        ao = {ck(v['orderCode']) for v in av if v.get('orderCode')}
        if on and ao and on != ao:
            add(pid, '注文番号', f'{t}班 {sorted(d.get("orderNumbers"))} ／ アプリ {sorted({v["orderCode"] for v in av})}', {})
        if (d.get('crop') or 'ok') not in ('ok', 'OK', ''):
            add(pid, '切り抜き', f'{t}班：{d.get("crop")}', {})
    # 第2部 金額
    for t in 'AB':
        d = D2[t].get(pid)
        if not d:
            missing_tx.append((f'd2{t}', pid)); continue
        rows = d.get('rows') or []
        for i, v in enumerate(av):
            same = [r for r in rows if ck(r.get('code')) == ck(v['code'])]
            # 行（品番｜色）は検品のときのアプリの行。あとで色を足して分けた行（「マットタイプM」→「マットタイプM レッド」）は、頭が同じいちばん長い行の金額
            pre = sorted([r for r in same if flat(r.get('label', '')) and flat(v['label']).startswith(flat(r.get('label', '')))], key=lambda r: -len(flat(r.get('label', ''))))
            cand = [r for r in same if flat(r.get('label', '')) == flat(v['label'])] or pre[:1] or same
            if not cand:
                add(pid, '金額', f'{t}班：品番「{v["code"]} {v["label"]}」の行がない', {}); continue
            r = cand[0] if len(cand) == 1 else (rows[i] if i < len(rows) and ck(rows[i].get('code')) == ck(v['code']) else cand[0])
            if r.get('found') is False:
                add(pid, '金額', f'{t}班：品番「{v["code"]}」が絵に見つからない', {t: r}); continue
            got = r.get('taxExcluded') if r.get('taxExcluded') not in (None, '', 0) else (r.get('taxIncluded') if r.get('nonTaxable') else None)
            try:
                got = int(re.sub(r'[^\d]', '', str(got))) if got not in (None, '') else None
            except ValueError:
                got = None
            if got is None:
                add(pid, '金額', f'{t}班：品番「{v["code"]} {v["label"]}」の税抜（非課税）の金額が書かれていない', {t: r})
            elif got != v['listPrice']:
                add(pid, '金額', f'品番「{v["code"]} {v["label"]}」：{t}班 {got} ／ アプリ {v["listPrice"]}', {t: r})
            if bool(r.get('nonTaxable')) != bool(p['taxFree']):
                add(pid, '非課税', f'品番「{v["code"]}」：{t}班 非課税={bool(r.get("nonTaxable"))} ／ アプリ {p["taxFree"]}', {t: r})
            if r.get('from'):
                add(pid, '金額', f'品番「{v["code"]}」：{t}班「～」付きの金額', {t: r})
        for e in d.get('extra') or []:
            add(pid, '金額', f'{t}班：行にない金額付きの品番 {e}', {})
    # 第3部 TAIS・商品名・メーカー・印
    d = D3.get(pid)
    if not d:
        missing_tx.append(('d3', pid)); continue
    if flat(d.get('name')) != flat(p['name']):
        add(pid, '商品名', f'書き取り「{d.get("name")}」／ アプリ「{p["name"]}」', {})
    mk = lambda s: flat(s).replace('株式会社', '(株)').replace('㈱', '(株)').replace('有限会社', '(有)')
    if mk(d.get('maker')) != mk(p['maker']):
        add(pid, 'メーカー', f'書き取り「{d.get("maker")}」／ アプリ「{p["maker"]}」', {})
    badges = ' '.join(nf(b) for b in d.get('badges') or [])
    kb = '介・購入' in badges or '介･購入' in badges or '介購入' in flat(badges)
    if kb != bool(p['category']):
        add(pid, '種目・印', f'書き取りの印 {d.get("badges")} ／ アプリの種目「{p["category"] or "（対象外）"}」', {})
    if ('非課税' in badges) != bool(p['taxFree']):
        add(pid, '非課税', f'書き取りの印 {d.get("badges")} ／ アプリ 非課税={p["taxFree"]}', {})
    rows = d.get('rows') or []
    for i, v in enumerate(av):
        cand = [r for r in rows if ck(r.get('code')) == ck(v['code']) and flat(r.get('label', '')) == flat(v['label'])] or [r for r in rows if ck(r.get('code')) == ck(v['code'])]
        if not cand:
            add(pid, 'TAIS', f'品番「{v["code"]} {v["label"]}」の行がない', {}); continue
        r = cand[0]
        if ck(r.get('tais')) != ck(v['tais']):
            add(pid, 'TAIS', f'品番「{v["code"]} {v["label"]}」：書き取り「{r.get("tais")}」{r.get("taisNote") or ""} ／ アプリ「{v["tais"]}」', {'d3': r})
out = [{'id': pid, 'page': pageof[pid], 'name': app[pid]['name'], 'issues': iss} for pid, iss in issues.items()]
json.dump({'issues': out, 'missingTranscription': missing_tx}, open(f'{S}/insp/compare.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('商品', len(out), '件', sum(len(o['issues']) for o in out), Counter(i['kind'] for o in out for i in o['issues']))
print('書き取りのない商品', len(missing_tx), missing_tx[:10])
