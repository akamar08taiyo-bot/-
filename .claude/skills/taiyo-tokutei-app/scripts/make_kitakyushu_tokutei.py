# 北九州市の特定福祉用具の原本（アプリに入れる .xlsx）を、市の様式から作る（2026-10-29）：
#   介護保険居宅介護（予防）福祉用具購入費支給申請書（受領委任払用。Word の様式。表＝申請書・裏＝委任状と注意）と、
#   いっしょに出す特定福祉用具概要書（介護保険用。Excel の様式。表＝概要書・裏＝記入上の注意事項）。
# Word・Excel → PDF は LibreOffice（Word の「行数を指定」のグリッドを外す。ＭＳ ゴシック・明朝は IPA ゴシックで描く）、
# PDF → Excel は pdf_form_xlsx.py（線と文字の位置から同じ形のシートにする。住宅改修の北九州市の申請書と同じ作り）。
# LibreOffice は Word より字の幅を広くとるので、1行に入らず折り返した見出しは、Word の様式（市の記入例）と同じ1行に直して置く（texts）。
# アプリが書く欄（fields）は、見出しの文字の位置から決め、欄のセルの番地を kitakyushuCells.ts に書き出す。
# usage: python3 make_kitakyushu_tokutei.py <支給申請書.doc> <概要書.xls> <出力.xlsx>
#   環境変数 KK_CELLS_TS=<…/kitakyushuCells.ts> で欄の番地の TS を書く。作業のフォルダは TMPDIR の下。
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdf_form_xlsx as conv  # noqa: E402

shikyu_doc, gaiyo_xls, out = [os.path.abspath(p) for p in sys.argv[1:4]]
work = tempfile.mkdtemp(prefix='kk-tokutei-')

# ---------------------------------------------------------------- Word・Excel → PDF
FONT_PAIRS = [('ＭＳ ゴシック', 'IPAGothic'), ('MS Gothic', 'IPAGothic'), ('ＭＳ 明朝', 'IPAGothic'), ('MS Mincho', 'IPAGothic'), ('Mincho', 'IPAGothic'),
              ('ＭＳ Ｐゴシック', 'IPAPGothic'), ('MS PGothic', 'IPAPGothic'), ('ＭＳ Ｐ明朝', 'IPAPGothic'), ('Century', 'Liberation Serif')]


def profile(name, pairs):
    d = os.path.join(work, name)
    os.makedirs(os.path.join(d, 'user'), exist_ok=True)
    items = ['<item oor:path="/org.openoffice.Office.Common/Font/Substitution"><prop oor:name="Replacement" oor:op="fuse"><value>true</value></prop></item>']
    for i, (a, b) in enumerate(pairs):
        items.append(f'<item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs"><node oor:name="_{i}" oor:op="replace">'
                     f'<prop oor:name="Always" oor:op="fuse"><value>true</value></prop><prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>'
                     f'<prop oor:name="ReplaceFont" oor:op="fuse"><value>{a}</value></prop><prop oor:name="SubstituteFont" oor:op="fuse"><value>{b}</value></prop></node></item>')
    with open(os.path.join(d, 'user', 'registrymodifications.xcu'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' + '\n'.join(items) + '\n</oor:items>\n')
    return 'file://' + d


def soffice(args, prof, env=None, timeout=300):
    subprocess.run(['soffice', f'-env:UserInstallation={prof}', '--headless', *args], check=True, timeout=timeout,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)


PLAIN = profile('plain', [])
IPA = profile('ipa', FONT_PAIRS)
empty_home = os.path.join(work, 'home')
os.makedirs(empty_home, exist_ok=True)
EMPTY_HOME = {**os.environ, 'HOME': empty_home}


def rezip(src, dst, change):
    zin = zipfile.ZipFile(src)
    zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        data = change(item.filename, data)
        zout.writestr(item, data)
    zout.close()


def word_pdf(doc, name):
    src = os.path.join(work, name + '.doc')
    shutil.copy(doc, src)
    # .doc → .docx は字体の置きかえなし・空の HOME で（住宅改修の北九州市の事前届出書は、置きかえるとレイアウトが終わらなかった）
    soffice(['--convert-to', 'docx', '--outdir', work, src], PLAIN, env=EMPTY_HOME)
    nogrid = os.path.join(work, name + '-ng.docx')
    # 「行数を指定（グリッド）」を外す：LibreOffice はグリッドに合わせて行を Word より高くし、1枚の様式が2枚にはみ出す
    rezip(os.path.join(work, name + '.docx'), nogrid,
          lambda n, d: re.sub(r'<w:docGrid [^>]*/>', '', d.decode()).encode() if n == 'word/document.xml' else d)
    soffice(['--convert-to', 'pdf', '--outdir', work, nogrid], IPA)
    return os.path.join(work, name + '-ng.pdf')


def excel_pdf(xls, name):
    src = os.path.join(work, name + '.xls')
    shutil.copy(xls, src)
    soffice(['--convert-to', 'xlsx', '--outdir', work, src], PLAIN, env=EMPTY_HOME)
    fixed = os.path.join(work, name + '-a4.xlsx')

    def change(n, d):
        t = d.decode()
        if n == 'xl/styles.xml':
            # LibreOffice は ＭＳ ゴシック（この PC にない字体）の名前を、代わりに描く字体の名前にして書く。原本の ＭＳ ゴシックに戻す
            t = t.replace('<name val="WenQuanYi Zen Hei"/><family val="2"/>', '<name val="ＭＳ ゴシック"/><family val="3"/><charset val="128"/>')
        if n == 'xl/worksheets/sheet1.xml':
            # 原本は表（1〜40行）と裏（41〜80行）を1つのシートに並べ、印刷の倍率で A4 に入れている。
            # 横を1ページに合わせ、39行のうしろ（裏の見出しの角丸の枠の上）で改ページして、表と裏を1ページずつにする
            t = t.replace('<pageSetUpPr fitToPage="false"/>', '<pageSetUpPr fitToPage="true"/>')
            t = re.sub(r'fitToHeight="\d+"', 'fitToHeight="0"', t)
            t = t.replace('</headerFooter>', '</headerFooter><rowBreaks count="1" manualBreakCount="1"><brk id="39" max="16383" man="true"/></rowBreaks>', 1) \
                if '</headerFooter>' in t else t
        return t.encode() if n.endswith('.xml') else d

    rezip(os.path.join(work, name + '.xlsx'), fixed, change)
    soffice(['--convert-to', 'pdf', '--outdir', work, fixed], IPA)
    return os.path.join(work, name + '-a4.pdf')


shikyu = word_pdf(shikyu_doc, 'shikyu')
gaiyo = excel_pdf(gaiyo_xls, 'gaiyo')

if os.environ.get('KK_DUMP'):
    print(shikyu, gaiyo)
    sys.exit(0)

# ---------------------------------------------------------------- 欄の場所（見出しの文字から）


class Page:
    def __init__(self, sh):
        r = conv.analyze(sh)
        self.items = sorted(r['items'], key=lambda it: (round(it['top']), it['x0']))
        self.regs = r['regs']

    def find(self, text, n=0, exact=False):
        hits = [it for it in self.items if (it['text'] == text if exact else it['text'].startswith(text))]
        if len(hits) <= n:
            sys.exit(f'見出し「{text}」が見つからない')
        return hits[n]

    def region(self, x, y):
        best = None
        for r in self.regs:
            if r[0] <= x <= r[2] and r[1] <= y <= r[3] and (best is None or (r[2] - r[0]) * (r[3] - r[1]) < (best[2] - best[0]) * (best[3] - best[1])):
                best = r
        if best is None:
            sys.exit(f'({x:.0f}, {y:.0f}) に囲まれた欄がない')
        return best

    def right_of(self, it):
        """見出しの欄の右どなりの欄"""
        L = self.region((it['x0'] + it['x1']) / 2, it['cy'])
        return self.region(L[2] + 3, it['cy'])

    def yen_in(self, R):
        return [it for it in self.items if it['text'] == '円' and R[0] <= it['x0'] <= R[2] and R[1] <= it['cy'] <= R[3]][0]

    def boxes_right(self, it, n=10):
        """見出しの右に並ぶ n 個のマス（被保険者番号）"""
        lab = self.region((it['x0'] + it['x1']) / 2, it['cy'])
        row = sorted((r for r in self.regs if abs(r[1] - lab[1]) < 1 and abs(r[3] - lab[3]) < 1 and r[0] >= lab[2] - 1), key=lambda r: r[0])
        return row[:n]


def F(name, box, **kw):
    return {'name': name, 'box': [round(v, 2) for v in box], **kw}


def center(r):
    return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]


# 申請内容の種目の見出し（様式の字）。番号は概要書の注意事項の (1)〜(9)（アプリの種目の番号）
KINDS = [(1, '腰掛便座'), (2, '自動排泄処理装置の'), (3, '入浴補助用具'), (4, '簡易浴槽'), (5, '移動用リフトつり具部分'),
         (6, '排泄予測支援機器'), (7, '固定用スロープ'), (8, '歩行器'), (9, '歩行補助つえ')]


def shikyu_fields(pg):
    fs = []
    lab = pg.find('事業者番号')
    R = pg.region(lab['x1'] + 5, lab['cy'])
    fs.append(F('provider', [R[0] + 2, R[1] + 1, R[2] - 2, R[3] - 1], h='center', size=12))
    V = pg.right_of(pg.find('ﾌ'))
    fs.append(F('kana', [V[0] + 3, V[1] + 1, V[2] - 3, V[3] - 1], size=10.5, shrink=True))
    V = pg.right_of(pg.find('被保険者氏名'))
    fs.append(F('name', [V[0] + 3, V[1] + 1, V[2] - 3, V[3] - 1], h='center', size=14, shrink=True))
    for i, r in enumerate(pg.boxes_right(pg.find('被保険者番号', exact=True))):
        fs.append({'name': f'no{i}', 'at': center(r), 'h': 'center', 'size': 11})
    tel = pg.find('電話番号')
    R = pg.region(tel['x0'], tel['cy'])
    fs += [F('address', [R[0] + 3, R[1] + 0.5, tel['x0'] - 3, R[3] - 0.5], size=10.5, wrap=True),
           F('tel', [tel['x1'] + 3, tel['top'] - 2, R[2] - 2, tel['bottom'] + 2], size=10.5, shrink=True)]
    # 申請内容：種目ごとの金額（税抜）・合計金額（消費税込）①・前回までの給付実績②・申請金額
    for no, label in KINDS:
        V = pg.right_of(pg.find(label))
        yen = pg.yen_in(V)
        fs.append(F(f'kind{no}', [V[0] + 2, V[1] + 0.5, yen['x0'] - 1, V[3] - 0.5], h='right', size=10.5, shrink=True))
    for key, label in (('total', '合計金額（消費税込）'), ('prev', '前回までの給付実績'), ('benefit', '申 請 金 額')):
        V = pg.right_of(pg.find(label))
        yen = pg.yen_in(V)
        fs.append(F(key, [V[0] + 2, V[1] + 0.5, yen['x0'] - 1, V[3] - 0.5], h='right', size=11 if key == 'benefit' else 10.5, shrink=True))
    V = pg.right_of(pg.find('福祉用具が'))
    note = pg.find('※選択制')
    fs.append(F('reason', [V[0] + 3, V[1] + 1, V[2] - 3, note['top'] - 1], size=10.5, wrap=True, v='top'))
    # 委任の欄（被保険者氏名は自署なので書かない）の事業者と、申請の欄の事業者（申請者）：設定の営業所
    for n, sfx in ((0, 'A'), (1, 'B')):
        for key, label in (('seller', '事業者名'), ('rep', '代表者名')):
            lab = pg.find(label, n=n, exact=True)
            fs.append(F(key + sfx, [150, lab['top'] - 0.5, 460, lab['bottom'] + 0.5], size=10.5, shrink=True))
    lab = pg.find('住所', exact=True)
    fs.append(F('sellerAddress', [150, lab['top'] - 0.5, 520, lab['bottom'] + 0.5], size=10.5, shrink=True))
    lab = pg.find('電話番号', n=1)
    fs.append(F('sellerTel', [150, lab['top'] - 0.5, 400, lab['bottom'] + 0.5], size=10.5, shrink=True))
    return fs


GAIYO_ROWS = 12  # 概要書の明細（原本の2行ずつ＝1つの商品）


def gaiyo_fields(pg):
    fs = []
    lab = pg.find('被保険者氏名')
    sama = pg.find('様', exact=True)
    fs.append(F('name', [lab['x0'] + 5, lab['bottom'] + 8, sama['x0'] - 3, sama['bottom'] + 1], h='center', size=12, shrink=True))
    lab = pg.find('（被保険者番号：')
    close = [it for it in pg.items if it['text'] == '）' and abs(it['cy'] - lab['cy']) < 2][0]
    fs.append(F('insured', [lab['x1'] + 1, lab['top'] - 1, close['x0'] - 1, lab['bottom'] + 1], h='center', size=9))
    for key, label in (('amount', '合　計'), ('tax', '消費税'), ('total', '総合計')):
        V = pg.right_of(pg.find(label))
        yen = pg.yen_in(V)
        fs.append(F(key, [V[0] + 2, V[1] + 0.5, yen['x0'] - 1, V[3] - 0.5], h='right', size=10, shrink=True))
    lab = pg.find('業者名')
    V = pg.right_of(lab)
    mgr = pg.find('（担当者）')
    fs += [F('seller', [V[0] + 3, V[1] + 1, V[2] - 2, mgr['top'] - 2], size=9, wrap=True),
           F('manager', [mgr['x1'] + 2, mgr['top'] - 2, V[2] - 2, V[3] - 1], size=9, shrink=True)]
    cols = [('kind', pg.find('種')), ('item', pg.find('品目、形式等')), ('about', pg.find('概')), ('yen', pg.find('金', exact=True))]
    head = pg.region(cols[0][1]['x0'], cols[0][1]['cy'])
    body = pg.region(cols[0][1]['x0'], head[3] + 5)
    h = (body[3] - body[1]) / GAIYO_ROWS
    for key, it in cols:
        C = pg.region(it['x0'], body[1] + 5)
        for r in range(GAIYO_ROWS):
            y0 = body[1] + h * r
            if key == 'yen':
                fs.append(F(f'{key}{r}', [C[0] + 2, y0 + 0.5, C[2] - 3, y0 + h - 0.5], h='right', size=10, shrink=True))
            else:
                fs.append(F(f'{key}{r}', [C[0] + 2, y0 + 0.5, C[2] - 2, y0 + h - 0.5], size=9, wrap=True))
    return fs


GOTHIC = {'font': 'ＭＳ ゴシック', 'fonts': {'LiberationSerif': 'Century'}}
TITLE = '介護保険居宅介護（予防）福祉用具購入費支給申請書（受領委任払用）'
# 表：1ページ目と、LibreOffice で2ページ目に押し出された決定入力の行（Word では1ページに入る。市の記入例も1ページ）をつなぐ。
# LibreOffice で折り返した見出し・字の間をあけた見出しは、Word の様式（記入例）と同じ1行に直す
s1 = {'name': '支給申請書', 'pdf': shikyu, 'segs': [[0, None, 797.7], [1, 29.3, 84.5]], **GOTHIC,
      'drop': [[55, 40.95, 540, 55, 0], [175, 54, 420, 68.05, 0],  # 表題
               [528, 273.5, 540, 284.85, 0],  # 申請金額の「円」（LibreOffice では右の罫線の上）
               [328, 69, 395, 91, 0],  # 福祉用具購入月
               [398, 91, 538.5, 112.05, 0],  # 領収書記載日の 年・月・日
               [108, 165, 192, 196.5, 0], [325, 213.5, 415, 232.5, 0], [108, 233, 192, 250.2, 0],  # 自動排泄処理装置の交換可能部分・合計金額①・移動用リフトつり具部分
               [136, 556, 246, 589, 0], [250, 552, 332.5, 592.95, 0], [249, 593, 332, 614.3, 0],  # 口座振込依頼欄の見出し
               [95, 667, 204, 710.2, 0], [64.5, 725, 144, 747.6, 0], [146, 725, 226, 747.6, 0], [64, 761, 275.5, 798.4, 0]],  # 市の記入欄
      'texts': [{'text': TITLE, 'box': [63, 44, 540, 66], 'size': 13, 'h': 'center'},
                {'text': '円', 'box': [523.5, 274.3, 533.5, 284.3], 'size': 10},
                {'text': '福祉用具購入月', 'box': [326.5, 68.8, 396.5, 89.8], 'size': 9.5, 'h': 'center'},
                {'text': '年', 'box': [442, 91, 456, 111.5], 'size': 10.5, 'h': 'center'},
                {'text': '月', 'box': [482, 91, 496, 111.5], 'size': 10.5, 'h': 'center'},
                {'text': '日', 'box': [522, 91, 536, 111.5], 'size': 10.5, 'h': 'center'},
                {'text': '自動排泄処理装置の', 'box': [107.5, 166, 193.5, 179.5], 'size': 9},
                {'text': '交換可能部分', 'box': [107.5, 180.5, 193.5, 194], 'size': 9},
                {'text': '合計金額（消費税込）①', 'box': [323.5, 214, 415.5, 231], 'size': 8},
                {'text': '移動用リフトつり具部分', 'box': [107, 233, 193.5, 249], 'size': 7.5},
                {'text': '銀行・信用金庫', 'box': [177, 556.5, 247, 564.5], 'size': 7.5},
                {'text': '信用組合・労働金庫', 'box': [177, 566, 247, 574], 'size': 7.5},
                {'text': '農業協同組合', 'box': [177, 575.5, 247, 583.5], 'size': 7.5},
                {'text': '本店・支店', 'box': [289, 556.5, 332.5, 564.5], 'size': 7.5, 'h': 'center'},
                {'text': '出張所', 'box': [289, 566, 332.5, 574], 'size': 7.5, 'h': 'center'},
                {'text': '本所・支所', 'box': [289, 575.5, 332.5, 583.5], 'size': 7.5, 'h': 'center'},
                {'text': '店　舗　コ　ー　ド', 'box': [248, 593, 333, 613.5], 'size': 9, 'h': 'center'},
                {'text': '令和　　年　　月　　日', 'box': [94.5, 671, 205, 687.5], 'size': 10},
                {'text': '令和　　年　　月　　日', 'box': [94.5, 689, 205, 705.5], 'size': 10},
                {'text': '支 払 方 法 変 更', 'box': [63.4, 724.6, 144.9, 746.5], 'size': 10, 'h': 'center'},
                {'text': '□有　□無', 'box': [144.9, 724.6, 226.8, 746.5], 'size': 10.5, 'h': 'center'},
                {'text': '今 回 の 給 付 対 象 金 額（１０割分）（Ｃ）', 'box': [63.5, 761, 276, 779.5], 'size': 9.5, 'h': 'center'},
                {'text': '（Ａ）＋（Ｂ）＞10万円の場合は、10万円－（Ｂ）のみ対象', 'box': [63.5, 780.5, 276, 797.2], 'size': 7.5, 'h': 'center'}]}
s1['fields'] = shikyu_fields(Page(s1))
# 裏：委任状と注意（委任状の「…ありません」の「ん」が枠の外に折り返したのを1行に）
s2 = {'name': '支給申請書（裏）', 'pdf': shikyu, 'segs': [[1, 170, 510]], **GOTHIC, 'bold': ['委　　任　　状'],
      'drop': [[300, 351, 538, 362.3, 1], [56, 361.5, 68, 372.5, 1]],
      'texts': [{'text': '※署名（自署）の場合は、押印する必要はありません', 'box': [302, 181.5, 519.5, 192.5], 'size': 9, 'h': 'right'}]}
# 概要書：ＭＳ Ｐゴシック（IPA ゴシックで描いた字）と、太字の ＭＳ ゴシック（LibreOffice が WenQuanYi で描いた字）
PGOTHIC = {'font': 'ＭＳ Ｐゴシック', 'fonts': {'WenQuanYiZenHei': 'ＭＳ ゴシック'}, 'boldFonts': ['WenQuanYiZenHei']}
s3 = {'name': '概要書', 'pdf': gaiyo, 'segs': [[0, None, None]], **PGOTHIC}
s3['fields'] = gaiyo_fields(Page(s3))
s4 = {'name': '概要書（裏）', 'pdf': gaiyo, 'segs': [[1, None, None]], **PGOTHIC}
sheets = [s1, s2, s3, s4]

spec = {'out': os.path.join(work, 'kk.xlsx'), 'map': os.path.join(work, 'kk.map.json'), 'sheets': sheets}
with open(os.path.join(work, 'spec.json'), 'w', encoding='utf-8') as f:
    json.dump(spec, f, ensure_ascii=False, indent=1)
subprocess.run([sys.executable, '-I', os.path.join(HERE, 'pdf_form_xlsx.py'), os.path.join(work, 'spec.json')], check=True)

# ---------------------------------------------------------------- 原本にする
src = zipfile.ZipFile(spec['out'])
dst = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
for item in src.infolist():
    data = src.read(item.filename)
    if item.filename.startswith('xl/worksheets/sheet'):
        # openpyxl は文字を「&#9633;」のような番号で書く → そのままの字に（ほかの原本と同じ書き方に）
        data = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))) if int(m.group(1)) > 127 else m.group(0), data.decode()).encode()
    if item.filename == 'xl/_rels/workbook.xml.rels':
        # openpyxl は Target="/xl/worksheets/sheet1.xml"・Id をうしろに書く → ほかの原本（Excel・LibreOffice）と同じ Id・Type・Target（相対）の順に
        def norm(m):
            attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(0)))
            target = re.sub(r'^/xl/', '', attrs['Target'])
            return f'<Relationship Id="{attrs["Id"]}" Type="{attrs["Type"]}" Target="{target}"/>'
        data = re.sub(r'<Relationship [^>]*/>', norm, data.decode()).encode()
    dst.writestr(item, data)
dst.close()
mapping = json.load(open(spec['map'], encoding='utf-8'))


# アプリの欄の番地（src/tokutei/shinsei/kitakyushuCells.ts）：結合した欄は左上の番地
def cells_of(sheet):
    out = {k: v.split(':')[0] for k, v in mapping[sheet]['fields'].items()}
    if sheet == '支給申請書':
        hits = [it['ref'].split(':')[0] for it in mapping[sheet]['items'] if '７０・８０・９０' in it['text']]
        assert len(hits) == 1, hits
        out['ratio'] = hits[0]
    return out


cells_ts = os.environ.get('KK_CELLS_TS')
if cells_ts:
    body = ',\n'.join(f'  {key}: {json.dumps(cells_of(name), ensure_ascii=False)}' for key, name in (('shikyu', '支給申請書'), ('gaiyo', '概要書')))
    with open(cells_ts, 'w', encoding='utf-8') as f:
        f.write('// 北九州市の特定福祉用具の原本（kitakyushu.xlsx）の欄の番地。スキルの scripts/make_kitakyushu_tokutei.py が原本と一緒に書く（手で直さない。\n'
                '// 原本を作り直すと番地が変わるので、原本とこのファイルはいつも一緒に置きかえる）\n'
                f'export const KK_SHEETS = {json.dumps([s["name"] for s in sheets], ensure_ascii=False)} as const;\n'
                f'export const KK_CELLS = {{\n{body},\n}} as const;\n')
print('sheets', [s['name'] for s in sheets])
print('work', work)
