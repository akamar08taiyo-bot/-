# 北九州市の住宅改修の原本（アプリに入れる .xltx）を、市の Word の様式から作る（2026-10-29）：
#   介護保険住宅改修事前届出書（1枚目＝提出用・2枚目＝通知用）・介護保険居宅介護（予防）住宅改修費支給申請書（受領委任払用。表・裏）・
#   平面図（苅田町の原本の平面図と同じ形）・住宅改修内容報告書（写真）10枚（写真番号①〜⑩）・住宅改修完了報告書（写真）5枚（1枚に2つ＝①〜⑩）。
# 工事費見積書は市の様式（①工事費見積書）がアプリの見積書（苅田町・行橋市・みやこ町用）と同じ表なので、見積書のタブで作る。
# Word → PDF は LibreOffice（Word の「行数を指定」のグリッドを外すと Word と同じ所で改ページする。ＭＳ ゴシックは IPA ゴシックで描く）、
# PDF → Excel は pdf_form_xlsx.py（線と文字の位置から同じ形のシートにする）。アプリが書く欄（fields）は、見出しの文字の位置から決める。
# usage: python3 make_kitakyushu_jutaku.py <事前届出書.doc> <支給申請書.doc> <内容報告書.doc> <完了報告書.doc> <苅田町.xltx> <出力.xltx>
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pdf_form_xlsx as conv  # noqa: E402

todoke_doc, shikyu_doc, naiyo_doc, kanryo_doc, kanda_xltx, out = [os.path.abspath(p) for p in sys.argv[1:7]]
work = tempfile.mkdtemp(prefix='kk-jutaku-')

# ---------------------------------------------------------------- Word → PDF
FONT_PAIRS = [('ＭＳ ゴシック', 'IPAGothic'), ('MS Gothic', 'IPAGothic'), ('ＭＳ 明朝', 'IPAGothic'), ('MS Mincho', 'IPAGothic'), ('Mincho', 'IPAGothic'),
              ('ＭＳ Ｐゴシック', 'IPAPGothic'), ('MS PGothic', 'IPAPGothic'), ('ＭＳ Ｐ明朝', 'IPAPGothic'), ('HG丸ｺﾞｼｯｸM-PRO', 'IPAPGothic'), ('Century', 'Liberation Serif')]


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
# .doc → .docx は字体の置きかえ（ＭＳ ゴシック → IPA ゴシック）なしで：置きかえると、事前届出書のレイアウトが終わらなくなる
empty_home = os.path.join(work, 'home')
os.makedirs(empty_home, exist_ok=True)


def word_pdf(doc, name):
    src = os.path.join(work, name + '.doc')
    shutil.copy(doc, src)
    soffice(['--convert-to', 'docx', '--outdir', work, src], PLAIN, env={**os.environ, 'HOME': empty_home})
    docx = os.path.join(work, name + '.docx')
    nogrid = os.path.join(work, name + '-ng.docx')
    # 「行数を指定（グリッド）」を外す：LibreOffice はグリッドに合わせて行を Word より高くし、1枚の様式が2枚にはみ出す
    import re
    zin = zipfile.ZipFile(docx)
    zout = zipfile.ZipFile(nogrid, 'w', zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'word/document.xml':
            data = re.sub(r'<w:docGrid [^>]*/>', '', data.decode()).encode()
        zout.writestr(item, data)
    zout.close()
    soffice(['--convert-to', 'pdf', '--outdir', work, nogrid], IPA)
    return os.path.join(work, name + '-ng.pdf')


todoke = word_pdf(todoke_doc, 'todoke')
shikyu = word_pdf(shikyu_doc, 'shikyu')
naiyo = word_pdf(naiyo_doc, 'naiyo')
kanryo = word_pdf(kanryo_doc, 'kanryo')
# 平面図は苅田町の原本（Excel）の平面図のシートを PDF にして写す
kanda = os.path.join(work, 'kanda.xlsx')
shutil.copy(kanda_xltx, kanda)
soffice(['--convert-to', 'pdf', '--outdir', work, kanda], IPA)
kanda_pdf = os.path.join(work, 'kanda.pdf')

# ---------------------------------------------------------------- 欄の場所（見出しの文字から）


class Page:
    def __init__(self, sh):
        r = conv.analyze(sh)
        self.items = sorted(r['items'], key=lambda it: (round(it['top']), it['x0']))
        self.regs = r['regs']

    def find(self, text, n=0, exact=False, near=None):
        hits = [it for it in self.items if (it['text'] == text if exact else it['text'].startswith(text))]
        if near:
            hits = [it for it in hits if near[0] <= (it['x0'] + it['x1']) / 2 <= near[2] and near[1] <= it['cy'] <= near[3]]
        if len(hits) <= n:
            sys.exit(f'見出し「{text}」が見つからない')
        return hits[n]

    def after(self, it, text, exact=True):
        """同じ行で it の右にある text"""
        hits = [x for x in self.items if x['text'] == text and abs(x['cy'] - it['cy']) < 3 and x['x0'] >= it['x1'] - 0.5]
        return min(hits, key=lambda x: x['x0'])

    def region(self, x, y):
        best = None
        for r in self.regs:
            if r[0] <= x <= r[2] and r[1] <= y <= r[3] and (best is None or (r[2] - r[0]) * (r[3] - r[1]) < (best[2] - best[0]) * (best[3] - best[1])):
                best = r
        if best is None:
            sys.exit(f'({x:.0f}, {y:.0f}) に囲まれた欄がない')
        return best

    def boxes_right(self, it, n=10):
        """見出しの右に並ぶ n 個のマス（被保険者番号・事業者番号）"""
        lab = self.region((it['x0'] + it['x1']) / 2, it['cy'])
        row = sorted((r for r in self.regs if abs(r[1] - lab[1]) < 1 and abs(r[3] - lab[3]) < 1 and r[0] >= lab[2] - 1), key=lambda r: r[0])
        return row[:n]


def F(name, box, **kw):
    return {'name': name, 'box': [round(v, 2) for v in box], **kw}


def center(r):
    return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]


KIND_LABELS = ['□手すり取付', '□段差の解消', '□床材等の変更', '□引き戸等への', '□洋式便器等へ', '□付帯工事']


def todoke_fields(pg, notice):
    """事前届出書の欄（notice＝2枚目の通知用。左上は〒・住所・氏名の送り先の欄で、見出しがない）"""
    fs = []
    if notice:
        z = pg.find('〒')
        dash = pg.after(z, '－')
        fs += [F('zipA', [z['x1'] + 1, z['top'] - 1, dash['x0'] - 1, z['bottom'] + 1], h='center', size=10),
               F('zipB', [dash['x1'] + 1, z['top'] - 1, dash['x1'] + 60, z['bottom'] + 1], size=10),
               F('address', [z['x0'] - 40, z['bottom'] + 2, 266, z['bottom'] + 30], wrap=True, size=10.5, v='top'),
               F('name', [z['x0'] - 40, z['bottom'] + 34, 266, z['bottom'] + 70], h='center', size=14)]
    else:
        z = pg.find('(住所)')
        dash = pg.after(z, '－')
        R = pg.region(z['x0'], z['cy'])
        fs += [F('zipA', [z['x1'] + 1, z['top'] - 1, dash['x0'] - 1, z['bottom'] + 1], h='center', size=10),
               F('zipB', [dash['x1'] + 1, z['top'] - 1, dash['x1'] + 60, z['bottom'] + 1], size=10),
               F('address', [R[0] + 4, z['bottom'] + 1.5, R[2] - 2, R[3] - 1], wrap=True, size=10.5)]
        lab = pg.find('(被保険者氏名)')
        R = pg.region(lab['x0'], lab['cy'])
        fs.append(F('name', [R[0] + 4, lab['bottom'] + 1, R[2] - 4, R[3] - 1], h='center', size=14))
    tel = pg.find('電話番号')
    R = pg.region(tel['x0'] + 1, tel['cy'])
    d1 = pg.after(tel, '－')
    d2 = pg.after(d1, '－')
    fs += [F('telA', [tel['x1'] + 1, tel['top'] - 1, d1['x0'] - 1, tel['bottom'] + 1], h='center', size=10),
           F('telB', [d1['x1'] + 1, tel['top'] - 1, d2['x0'] - 1, tel['bottom'] + 1], h='center', size=10),
           F('telC', [d2['x1'] + 1, tel['top'] - 1, R[2] - 2, tel['bottom'] + 1], size=10)]
    for i, r in enumerate(pg.boxes_right(pg.find('被保険者番号', exact=True))):
        fs.append({'name': f'no{i}', 'at': center(r), 'h': 'center', 'size': 11})
    rel = pg.find('被保険者との関係（')
    R = pg.region(rel['x0'], rel['cy'])
    close = pg.after(rel, '）')
    fs += [F('owner', [R[0] + 3, R[1] + 1, rel['x0'] - 2, R[3] - 1], size=10.5, shrink=True),
           F('relation', [rel['x1'] + 0.5, rel['top'] - 1, close['x0'] - 0.5, rel['bottom'] + 1], h='center', size=9, shrink=True)]
    for k, label in enumerate(KIND_LABELS):
        it = pg.find(label)
        L = pg.region(it['x0'] + 1, it['cy'])
        P = pg.region(L[2] + 5, it['cy'])
        if k in (0, 1, 2, 3):
            o = pg.find('□洗面脱衣室', near=P)
            close = pg.after(o, '）')
            # 「□洗面脱衣室　□その他（」の欄（字の右に 3pt あけた所まで）のうしろから「）」の前まで
            fs.append(F(f'other{k}', [o['x1'] + 3.5, max(P[1] + 0.3, o['top'] - 1.5), close['x0'] - 0.5, min(P[3] - 0.3, o['bottom'] + 1.5)], size=10, shrink=True))
        if k == 5:
            small = pg.find('具体的な工事内容', near=P)
            fs.append(F('detail', [P[0] + 4, small['bottom'] + 0.5, P[2] - 2, P[3] - 0.5], size=8, wrap=True, v='top'))
    # 住宅改修施工予定業者
    rep = pg.find('代表者名', exact=True)
    P = pg.region(rep['x0'], rep['cy'])
    fs += [F('builder', [P[0] + 3, P[1] + 1, rep['x0'] - 3, P[3] - 1], size=11, shrink=True),
           F('builderRep', [rep['x1'] + 1, P[1] + 2, P[2] - 2, P[3] - 1], size=9, shrink=True)]
    for i, r in enumerate(pg.boxes_right(pg.find('事業者番号', exact=True))):
        fs.append({'name': f'biz{i}', 'at': center(r), 'h': 'center', 'size': 10})
    loc = pg.find('所在地', exact=True)
    P = pg.region(loc['x1'] + 12, loc['cy'])
    z = pg.find('〒', near=P)
    dz = pg.after(z, '-')
    mgr = pg.find('担当者名', near=P)
    tel = pg.find('電話番号', near=P)
    d1 = pg.after(tel, '－')
    d2 = pg.after(d1, '－')
    fs += [F('builderZipA', [z['x1'] + 0.5, z['top'] - 0.5, dz['x0'] - 0.5, z['bottom'] + 1], h='center', size=8),
           F('builderZipB', [dz['x1'] + 0.5, z['top'] - 0.5, dz['x1'] + 30, z['bottom'] + 1], size=8),
           F('builderAddress', [dz['x1'] + 32, z['top'] - 0.5, P[2] - 2, mgr['top'] - 1], size=9, shrink=True),
           F('manager', [mgr['x1'] + 1, mgr['top'] - 1, tel['x0'] - 2, P[3] - 0.5], size=8, shrink=True),
           F('builderTelA', [tel['x1'] + 1, tel['top'] - 1, d1['x0'] - 1, P[3] - 0.5], h='center', size=8),
           F('builderTelB', [d1['x1'] + 1, tel['top'] - 1, d2['x0'] - 1, P[3] - 0.5], h='center', size=8),
           F('builderTelC', [d2['x1'] + 1, tel['top'] - 1, P[2] - 2, P[3] - 0.5], size=8)]
    for key, label in (('cost', '工事費見積金額①'), ('benefit', '支給予定金額')):
        lab = pg.find(label)
        L = pg.region(lab['x0'] + 1, lab['cy'])
        V = pg.region(L[2] + 5, (L[1] + L[3]) / 2)
        yen = [it for it in pg.items if it['text'] == '円' and V[0] <= it['x0'] <= V[2] and V[1] <= it['cy'] <= V[3]][0]
        fs.append(F(key, [V[0] + 2, V[1] + 1, yen['x0'] - 1, V[3] - 1], h='right', size=11, shrink=True))
    return fs


def shikyu_fields(pg):
    fs = []
    kana = pg.find('フ　リ　ガ')
    L = pg.region(kana['x0'], kana['cy'])
    V = pg.region(L[2] + 5, (L[1] + L[3]) / 2)
    fs.append(F('kana', [V[0] + 3, V[1] + 1, V[2] - 3, V[3] - 1], size=10.5, shrink=True))
    lab = pg.find('被保険者氏名')
    L = pg.region(lab['x0'], lab['cy'])
    V = pg.region(L[2] + 5, (L[1] + L[3]) / 2)
    fs.append(F('name', [V[0] + 3, V[1] + 1, V[2] - 3, V[3] - 1], h='center', size=14, shrink=True))
    for key, label in (('start', '着　工　日'), ('end', '完　成　日')):
        lab = pg.find(label)
        era = pg.after(lab, '令和')
        y = pg.after(era, '年')
        m = pg.after(y, '月')
        d = pg.after(m, '日')
        R = pg.region(era['x0'], era['cy'])
        fs += [F(key + 'Y', [era['x1'] + 0.5, R[1] + 0.5, y['x0'] - 0.5, R[3] - 0.5], h='right', size=10.5),
               F(key + 'M', [y['x1'] + 0.5, R[1] + 0.5, m['x0'] - 0.5, R[3] - 0.5], h='right', size=10.5),
               F(key + 'D', [m['x1'] + 0.5, R[1] + 0.5, d['x0'] - 0.5, R[3] - 0.5], h='right', size=10.5)]
    for i, r in enumerate(pg.boxes_right(pg.find('被保険者番号', exact=True))):
        fs.append({'name': f'no{i}', 'at': center(r), 'h': 'center', 'size': 10})
    z = pg.find('〒')
    R = pg.region(z['x0'] + 1, z['cy'])
    tel = pg.find('電話番号')
    dash = pg.after(tel, '－')
    fs += [F('zip', [z['x1'] + 0.5, R[1] + 0.3, z['x1'] + 70, z['bottom'] + 1.5], size=8),
           F('address', [z['x1'] + 1, z['bottom'] + 2, tel['x0'] - 3, R[3] - 0.5], size=10.5, shrink=True),
           F('telA', [tel['x1'] + 1, tel['top'] - 1, dash['x0'] - 1, R[3] - 0.5], h='center', size=10),
           F('telB', [dash['x1'] + 1, tel['top'] - 1, R[2] - 2, R[3] - 0.5], size=10)]
    for key, label in (('cost', '合計金額'), ('benefit', '申 請 金 額')):
        lab = pg.find(label)
        V = pg.region(lab['x1'] + 2, lab['cy']) if key == 'benefit' else None
        if key == 'cost':
            L = pg.region(lab['x0'], lab['cy'])
            V = pg.region((L[0] + L[2]) / 2, L[3] + 4)
        else:
            L = pg.region(lab['x0'], lab['cy'])
            V = pg.region(L[2] + 5, (L[1] + L[3]) / 2)
        yen = [it for it in pg.items if it['text'] == '円' and V[0] <= it['x0'] <= V[2] and V[1] <= it['cy'] <= V[3]][0]
        fs.append(F(key, [V[0] + 2, V[1] + 1, yen['x0'] - 1, V[3] - 1], h='right', size=11, shrink=True))
    # 委任の欄（被保険者氏名は自署なので書かない）と申請の欄の事業者
    for n, key in ((0, 'builder'), (1, 'builder2')):
        lab = pg.find('事業者名', n=n)
        fs.append(F(key, [lab['x1'] + 3, lab['top'] - 0.5, 450, lab['bottom'] + 0.5], size=10.5, shrink=True))
    lab = pg.find('代表者名', exact=True)
    fs.append(F('builderRep', [lab['x1'] + 3, lab['top'] - 0.5, 450, lab['bottom'] + 0.5], size=10.5, shrink=True))
    lab = pg.find('代表者名(申請者)')
    fs.append(F('builderRep2', [lab['x1'] + 3, lab['top'] - 0.5, 450, lab['bottom'] + 0.5], size=10.5, shrink=True))
    lab = pg.find('住所', exact=True)
    fs.append(F('builderAddress', [lab['x1'] + 4, lab['top'] - 0.5, 480, lab['bottom'] + 0.5], size=10.5, shrink=True))
    lab = pg.find('電話番号', n=1)
    fs.append(F('builderTel', [lab['x1'] + 4, lab['top'] - 0.5, 330, lab['bottom'] + 0.2], size=10.5, shrink=True))
    lab = pg.find('事業者番号')
    R = pg.region(lab['x0'], lab['cy'])
    fs.append(F('biz', [lab['x1'] + 3, R[1] + 1, R[2] - 2, R[3] - 1], size=11))
    return fs


def photo_fields(pg, n, after_only):
    """写真の報告書：氏名・被保険者番号・写真番号（Ｎｏ．の欄）・写真の枠・改修場所・改修の内容（内容報告書）"""
    fs = []
    sama = pg.find('様邸　住宅改修')
    no_lab = pg.find('介護保険被保険者番号')
    fs += [F('name', [86, sama['top'] - 1, sama['x0'] - 2, sama['bottom'] + 1], h='right', size=10.5, shrink=True),
           F('insured', [no_lab['x1'] + 3, no_lab['top'] - 1, 517, no_lab['bottom'] + 1], size=10.5)]
    nos = [it for it in pg.items if it['text'] == 'Ｎｏ．']
    for k, lab in enumerate(nos):
        L = pg.region(lab['x0'] + 1, lab['cy'] + 15)
        fs.append(F(f'photo{k}', [L[0] + 1, lab['bottom'] + 1, L[2] - 1, L[3] - 1], h='center', size=14, value=chr(0x2460 + n + k)))
        frame = [L[2], L[1], 517, None]
        place = pg.find('改修場所', n=k)
        P = pg.region(place['x0'], place['cy'])
        frame[3] = P[1]
        if k == 0 and after_only:
            frame[1] = max(frame[1], 92.5)  # 本人確認の欄の下から
        fs.append(F(f'frame{k}', frame, merge=False))
        V = pg.region(P[0] + 2, P[3] + 4)
        fs.append(F(f'place{k}', list(V), h='center', size=10.5, wrap=True, shrink=True))
        if not after_only:
            memo = pg.region(P[2] + 5, P[3] + 4)
            fs.append(F(f'memo{k}', list(memo), size=9, wrap=True, v='top'))
    return fs


# ---------------------------------------------------------------- シート
GOTHIC = {'font': 'ＭＳ ゴシック', 'fonts': {'LiberationSerif': 'Century'}}
MARU = {'font': 'HG丸ｺﾞｼｯｸM-PRO', 'fonts': {'IPAGothic': 'ＭＳ 明朝', 'IPAPGothic': 'HG丸ｺﾞｼｯｸM-PRO'}}
sheets = []

s1 = {'name': '事前届出書', 'pdf': todoke, 'segs': [[0, None, 747.5]], **GOTHIC, 'bold': ['施工についての注意点'],
      'texts': [{'text': '様式①　提出用', 'box': [464, 754, 545, 766], 'size': 10.5}]}
s1['fields'] = todoke_fields(Page(s1), False)
sheets.append(s1)
s2 = {'name': '事前届出書（通知用）', 'pdf': todoke, 'segs': [[0, 745, 805.25], [1, 51.35, 702]], 'join': [[40, 268]], 'drop': [[455, 750, 545, 769, 0]],
      **GOTHIC, 'bold': ['施工についての注意点']}
s2['fields'] = todoke_fields(Page(s2), True)
sheets.append(s2)
# 支給申請書：LibreOffice で折り返した見出し（フリガナ・改修の内容…）は Word と同じ1行・2行に直す
s3 = {'name': '支給申請書', 'pdf': shikyu, 'segs': [[0, None, 812]], **GOTHIC, 'bold': ['介護保険居宅介護（予防）住宅改修費支給申請書（受領委任払用）'],
      'drop': [[63, 64, 138, 90, 0], [106, 139, 167, 182, 0]],
      'texts': [{'text': 'フ　リ　ガ　ナ', 'box': [66, 68, 136, 86], 'size': 10.5, 'h': 'center'},
                {'text': '改修の内容・', 'box': [108, 147, 166, 158], 'size': 10, 'h': 'center'},
                {'text': '箇所及び規模', 'box': [108, 160, 166, 171], 'size': 10, 'h': 'center'}]}
s3['fields'] = shikyu_fields(Page(s3))
sheets.append(s3)
# 裏：LibreOffice では委任状の枠の下に注意書きが重なるので、注意書きを枠の下に離す（Word の記入例と同じ）
s4 = {'name': '支給申請書（裏）', 'pdf': shikyu, 'segs': [[1, None, 373], [1, 372.6, 440, 8]], **GOTHIC, 'bold': ['委　　任　　状']}
sheets.append(s4)
# 平面図：苅田町の原本と同じ（表題の左に氏名、下に工事内容のテキストボックス、あいだに平面図の図）
pg7 = next(i for i in range(30) if '平面図' in ''.join(c['text'] for c in __import__('pdfplumber').open(kanda_pdf).pages[i].chars))
s5 = {'name': '平面図', 'pdf': kanda_pdf, 'segs': [[pg7, None, None]], 'font': 'ＭＳ Ｐゴシック', 'fonts': {'IPAPGothic': 'ＭＳ Ｐゴシック'}, 'drop': [[40, 400, 60, 500]]}
title = Page(s5).find('様邸')
s5['fields'] = [F('name', [45, title['top'] - 3, title['x0'] - 2, title['bottom'] + 3], h='right', size=20, shrink=True),
                F('plan', [45, 115, 549, 690], merge=False), F('legend', [45, 700, 549, 800], merge=False)]
sheets.append(s5)
for n in range(10):
    s = {'name': '内容報告書（写真）' + (f' ({n + 1})' if n else ''), 'pdf': naiyo, 'segs': [[0, None, None]], **MARU, 'bold': ['住宅改修内容報告書（写真）']}
    s['fields'] = photo_fields(Page(s), n, False)
    sheets.append(s)
for n in range(5):
    s = {'name': '完了報告書（写真）' + (f' ({n + 1})' if n else ''), 'pdf': kanryo, 'segs': [[0, None, None]], **MARU, 'bold': ['住宅改修完了報告書（写真）'],
         'clip': [[390, 85.5, 480, 93]], 'drop': [[400, 79, 470, 91]], 'texts': [{'text': '（署名又は押印）', 'box': [402, 76, 470, 85], 'size': 9}]}
    s['fields'] = photo_fields(Page(s), 2 * n, True)
    sheets.append(s)

spec = {'out': os.path.join(work, 'kk.xlsx'), 'map': os.path.join(work, 'kk.map.json'), 'sheets': sheets}
with open(os.path.join(work, 'spec.json'), 'w', encoding='utf-8') as f:
    json.dump(spec, f, ensure_ascii=False, indent=1)
subprocess.run([sys.executable, '-I', os.path.join(HERE, 'pdf_form_xlsx.py'), os.path.join(work, 'spec.json')], check=True)
# 原本（テンプレート）にする
src = zipfile.ZipFile(spec['out'])
dst = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
for item in src.infolist():
    data = src.read(item.filename)
    if item.filename == '[Content_Types].xml':
        data = data.replace(b'spreadsheetml.sheet.main+xml', b'spreadsheetml.template.main+xml')
    if item.filename.startswith('xl/worksheets/sheet'):
        # openpyxl は文字を「&#9633;」のような番号で書く → そのままの字に（ファイルが小さく、ほかの原本と同じ書き方に）
        import re
        data = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))) if int(m.group(1)) > 127 else m.group(0), data.decode()).encode()
    if item.filename == 'xl/_rels/workbook.xml.rels':
        # openpyxl は Target="/xl/worksheets/sheet1.xml"・Id をうしろに書く → ほかの原本（Excel・LibreOffice）と同じ Id・Type・Target（相対）の順に
        import re
        rels = data.decode()
        def norm(m):
            attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(0)))
            target = re.sub(r'^/xl/', '', attrs['Target'])
            return f'<Relationship Id="{attrs["Id"]}" Type="{attrs["Type"]}" Target="{target}"/>'
        data = re.sub(r'<Relationship [^>]*/>', norm, rels).encode()
    dst.writestr(item, data)
dst.close()
mapping = json.load(open(spec['map'], encoding='utf-8'))
fields = {name: r['fields'] for name, r in mapping.items()}
with open(os.path.splitext(out)[0] + '.fields.json', 'w', encoding='utf-8') as f:
    json.dump(fields, f, ensure_ascii=False, indent=1)


# アプリの欄の番地（src/sasaoka/shinsei/kitakyushuCells.ts）：結合した欄は左上の番地、写真・平面図の範囲は範囲のまま
def cells_of(sheet):
    out = {k: (v if k.startswith('frame') or k in ('plan', 'legend') else v.split(':')[0]) for k, v in fields[sheet].items()}
    items = mapping[sheet]['items']

    def ref(text):
        hits = [it['ref'].split(':')[0] for it in items if it['text'].startswith(text) and it['ref'] != 'shape']
        return hits

    if sheet.startswith('事前届出書'):
        out['mochiie'] = ref('□持家')[0]
        out['kinds'] = [ref(k)[0] for k in KIND_LABELS]
        out['places'] = ref('□玄関・屋外')
        out['places2'] = ref('□洗面脱衣室')
        assert len(out['places']) == 4 and len(out['places2']) == 4, sheet
    return out


SHEETS = {'todoke': '事前届出書', 'notice': '事前届出書（通知用）', 'shikyu': '支給申請書', 'plan': '平面図', 'naiyo': '内容報告書（写真）', 'kanryo': '完了報告書（写真）'}
cells_ts = os.environ.get('KK_CELLS_TS')
if cells_ts:
    body = ',\n'.join(f'  {key}: {json.dumps(cells_of(name), ensure_ascii=False)}' for key, name in SHEETS.items())
    with open(cells_ts, 'w', encoding='utf-8') as f:
        f.write('// 北九州市の住宅改修の原本（kitakyushu.xltx）の欄の番地。スキルの scripts/make_kitakyushu_jutaku.py が原本と一緒に書く（手で直さない。\n'
                '// 原本を作り直すと番地が変わるので、原本とこのファイルはいつも一緒に置きかえる）\n'
                f'export const KK_CELLS = {{\n{body},\n}} as const;\n')
    # 写真の報告書の番地はどの枚も同じ（同じ様式を写真番号だけ変えて10枚・5枚）
    for name in fields:
        if name.startswith('内容報告書'):
            assert fields[name] == fields['内容報告書（写真）'], name
        if name.startswith('完了報告書'):
            assert fields[name] == fields['完了報告書（写真）'], name
print('sheets', [s['name'] for s in sheets])
print('work', work)
