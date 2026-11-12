# 久留米市の住宅改修の原本（アプリに入れる .xltx）を、いただいた様式から LibreOffice で作る（2026-11-02。2026-11-12 に様式を足した）：
#   住宅改修事前承認申請書（jyuukaijizen.xls）＋ 住宅改修費支給申請書（第2号様式。juukai.xls）
#   ＋ 委任状（介護保険住宅改修費受領委任払用。第6号様式）・請求書（第7号様式）・委任状（久留米市提出用）
#   ＋ 平面図（苅田町の原本の「平面図  (2)」）
#   ＋ 完成後の状態を確認できる書類（jukai-joutaikakunin.xls。工事箇所ごとに1枚＝写真番号①〜⑧の8枚。工事前・工事後の写真）
#   ＋ 住宅改修承諾書１（賃貸用。tinntai1.doc）・確約書（kakuyakusyo.doc。被保険者が亡くなったとき）。この2つはアプリが字を書かない（手で書く）。
# 2026-11-12：ユーザーが久留米市の住宅改修の様式一式（Word・Excel）をくださったので、委任状・請求書・提出用の委任状・写真の用紙・承諾書・確約書を足した。
#   写真の用紙は、前は市の様式がないと思って行橋市の原本の工事写真添付用紙を写していたが、市の「完成後の状態を確認できる書類」にした。
#   委任状（受領委任払用）・請求書・委任状（提出用）は、特定福祉用具のアプリの久留米市の原本（kurume.xlsx。市の PDF の様式から作った同じ形のシート）を写し、
#   字だけを住宅改修の様式（seikyusyoinijoujukai.doc・ininnjyou.doc）に合わせる（福祉用具購入費 → 住宅改修費、受任者は「受領委任払い取扱事業者」など）。
#   いただいた Word は LibreOffice で描くと請求書の頭が委任状のページに入ってしまうので、同じ様式の特定福祉用具のシートの方が形がよい。
#   欄の番地は特定福祉用具の kurumeCells.ts と同じ（アプリの shinsei.ts の KURUME_PROXY・KURUME_CLAIM・KURUME_TEISYUTU）。
#   承諾書（賃貸用）・確約書は Word → PDF → pdf_form_xlsx.py（北九州市と同じ作り）。
# 理由書は国の様式（アプリの理由書のタブ）、工事費内訳書は「参考様式」なので見積書のタブ（苅田町・行橋市・みやこ町と同じ表）で作る。
# 改修予定費用・改修費用の欄（「円」の左の空いた所）は、アプリが金額を書けるように結合して右ぞろえにする（罫線はそのまま）。
# usage: python3 make_kurume_jutaku.py <jyuukaijizen.xls> <juukai.xls> <kanda.xltx> <特定福祉用具の kurume.xlsx> <jukai-joutaikakunin.xls>
#                                      <tinntai1.doc> <kakuyakusyo.doc> <出力.xltx>
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
jizen, shikyu, kanda, tokutei, photo_xls, chintai_doc, kakuyaku_doc, out = [os.path.abspath(p) for p in sys.argv[1:9]]
work = tempfile.mkdtemp(prefix='kr-jutaku-')

# ---------------------------------------------------------------- Word → PDF → シート（承諾書（賃貸用）・確約書。北九州市の make_kitakyushu_jutaku.py と同じやり方）
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
    return 'file://' + d  # 絶対パス（相対にすると LibreOffice が止まったまま終わらない）


def soffice(args, prof, env=None, timeout=300):
    subprocess.run(['soffice', f'-env:UserInstallation={prof}', '--headless', *args], check=True, timeout=timeout,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)


PLAIN = profile('plain', [])
IPA = profile('ipa', FONT_PAIRS)
empty_home = os.path.join(work, 'home')
os.makedirs(empty_home, exist_ok=True)


def word_pdf(doc, name):
    src = os.path.join(work, name + '.doc')
    shutil.copy(doc, src)
    soffice(['--convert-to', 'docx', '--outdir', work, src], PLAIN, env={**os.environ, 'HOME': empty_home})
    docx = os.path.join(work, name + '.docx')
    nogrid = os.path.join(work, name + '-ng.docx')
    # 「行数を指定（グリッド）」を外す：LibreOffice はグリッドに合わせて行を Word より高くし、1枚の様式が2枚にはみ出す
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


chintai_pdf = word_pdf(chintai_doc, 'chintai')
kakuyaku_pdf = word_pdf(kakuyaku_doc, 'kakuyaku')
pdf_sheets = [
    {'name': '承諾書（賃貸用）', 'pdf': chintai_pdf, 'segs': [[0, None, None]], 'font': 'ＭＳ 明朝', 'fonts': {'IPAGothic': 'ＭＳ 明朝', 'LiberationSerif': 'Century'}},
    {'name': '確約書', 'pdf': kakuyaku_pdf, 'segs': [[0, None, None]], 'font': 'ＭＳ ゴシック', 'fonts': {'IPAGothic': 'ＭＳ ゴシック', 'LiberationSerif': 'Century'}},
]
spec = {'out': os.path.join(work, 'pdf.xlsx'), 'map': os.path.join(work, 'pdf.map.json'), 'sheets': pdf_sheets}
with open(os.path.join(work, 'spec.json'), 'w', encoding='utf-8') as f:
    json.dump(spec, f, ensure_ascii=False, indent=1)
subprocess.run([sys.executable, '-I', os.path.join(HERE, 'pdf_form_xlsx.py'), os.path.join(work, 'spec.json')], check=True)
mapping = json.load(open(spec['map'], encoding='utf-8'))

# ---------------------------------------------------------------- LibreOffice で1つのブックに
import uno  # noqa: E402
from com.sun.star.beans import PropertyValue  # noqa: E402
from com.sun.star.table import CellRangeAddress  # noqa: E402

PORT = 2109
lo_profile = tempfile.mkdtemp(prefix='lo-profile-')
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', f'-env:UserInstallation=file://{lo_profile}', f'--accept=socket,host=127.0.0.1,port={PORT};urp;'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def prop(name, value):
    p = PropertyValue()
    p.Name, p.Value = name, value
    return p


ctx = None
for _ in range(60):
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        ctx = resolver.resolve(f'uno:socket,host=127.0.0.1,port={PORT};urp;StarOffice.ComponentContext')
        break
    except Exception:
        time.sleep(0.5)
if ctx is None:
    proc.kill()
    sys.exit('LibreOffice につながらない')
desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
load = lambda p: desktop.loadComponentFromURL(uno.systemPathToFileUrl(p), '_blank', 0, (prop('Hidden', True),))
PT = 2540 / 72  # pt → 1/100 mm

NUMS = '①②③④⑤⑥⑦⑧'
PHOTO = '完成後の状態を確認できる書類'
PHOTOS = [PHOTO + n for n in NUMS]
TK = ['委任状（受領委任払用）', '請求書', '委任状（提出用）']

try:
    from com.sun.star.table.CellHoriJustify import CENTER as H_CENTER, RIGHT
    from com.sun.star.table.CellVertJustify import CENTER

    doc = load(jizen)
    sheets = doc.Sheets
    sheets.getByIndex(0).Name = '事前承認申請書'
    styles = doc.StyleFamilies.getByName('PageStyles')

    def page(sheet, name, margins, area, center=False):
        if not styles.hasByName(name):
            styles.insertByName(name, doc.createInstance('com.sun.star.style.PageStyle'))
        st = styles.getByName(name)
        st.Width, st.Height, st.IsLandscape = 21000, 29700, False
        st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin = [round(m) for m in margins]
        st.HeaderIsOn = False
        st.FooterIsOn = False
        st.CenterHorizontally = center
        st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
        sheet.PageStyle = name
        if area:
            rr = sheet.getCellRangeByName(area).RangeAddress
            a = CellRangeAddress()
            a.Sheet, a.StartColumn, a.StartRow, a.EndColumn, a.EndRow = rr.Sheet, rr.StartColumn, rr.StartRow, rr.EndColumn, rr.EndRow
            sheet.setPrintAreas((a,))

    def bring(src_doc, name, new_name, pos):
        sheets.importSheet(src_doc, name, pos)
        imported = sheets.getByIndex(pos)
        imported.Name = new_name
        return imported

    def bring_file(path, name, new_name, pos):
        src = load(path)
        sh = bring(src, name, new_name, pos)
        src.close(True)
        return sh

    def source_page(src_doc, name):
        """持ってきたシートの元の余白（取り込むと外れるので、元のブックの用紙の設定から読む）と印刷範囲"""
        s = src_doc.Sheets.getByName(name)
        st = src_doc.StyleFamilies.getByName('PageStyles').getByName(s.PageStyle)
        areas = s.getPrintAreas()
        area = None
        if areas:
            a = areas[0]
            col = lambda n: (chr(65 + n) if n < 26 else chr(64 + n // 26) + chr(65 + n % 26))
            area = f'{col(a.StartColumn)}{a.StartRow + 1}:{col(a.EndColumn)}{a.EndRow + 1}'
        return (st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin), area, st.CenterHorizontally

    bring_file(shikyu, '支給申請書', '支給申請書', 1)

    # ---- 委任状（受領委任払用）・請求書・委任状（提出用）：特定福祉用具の原本のシートを写して、字を住宅改修の様式に
    tk = load(tokutei)
    tk_pages = {name: source_page(tk, name) for name in TK}
    for k, name in enumerate(TK):
        bring(tk, name, name, 2 + k)
    tk.close(True)
    proxy = sheets.getByName('委任状（受領委任払用）')
    proxy.getCellRangeByName('I5').String = '（介護保険住宅改修費受領委任払用）'
    # 受任者の下の「（販売業者）」（A18:H19 の1行）→「（受領委任／払い取扱／事業者）」の3行（いただいた Word と同じ）。左の欄の空いた行（A17:H21）を1つにする
    r = proxy.getCellRangeByName('A18:H19')
    r.merge(False)
    proxy.getCellRangeByName('A18').String = ''
    # 結合を外した A18 だけに残る右の罫線（結合の中の線）を消す
    from com.sun.star.table import BorderLine2  # noqa: E402
    a18 = proxy.getCellRangeByName('A18')
    a18.RightBorder = BorderLine2()
    r = proxy.getCellRangeByName('A17:H21')
    r.merge(True)
    proxy.getCellRangeByName('A17').String = '（受領委任\n払い取扱\n事業者）'
    r.HoriJustify = H_CENTER
    r.VertJustify = CENTER
    r.IsTextWrapped = True
    # 「販売業者名称／及び／代表者氏名」→「名称／及び／代表者氏名」（3行とも欄のまん中に）
    for ref, text in (('K22', '名　　称'), ('N24', '及び'), ('L26', '代表者氏名')):
        c = proxy.getCellRangeByName(ref)
        c.String = text
    for area in ('K22:V22', 'N24:R24', 'L26:U26'):
        proxy.getCellRangeByName(area).HoriJustify = H_CENTER
    for ref in ('I30', 'I33', 'I37'):
        c = proxy.getCellRangeByName(ref)
        c.String = c.String.replace('福祉用具購入費', '住宅改修費')
    proxy.getCellRangeByName('D57').String = '久留米市長　あて'
    claim = sheets.getByName('請求書')
    claim.getCellRangeByName('M40').String = '介護保険 居宅介護(介護予防)住宅改修費'

    bring_file(kanda, '平面図  (2)', '平面図', 5)

    # ---- 完成後の状態を確認できる書類（写真番号①〜⑧の8枚）
    src = load(photo_xls)
    photo_page = source_page(src, src.Sheets.getByIndex(0).Name)
    src_name = src.Sheets.getByIndex(0).Name
    for k, name in enumerate(PHOTOS):
        sh = bring(src, src_name, name, 6 + k)
        # 写真番号：工事箇所の行の右（原本にない欄。アプリはこの番号の箇所の写真を貼る。見積書・申請書の①②と同じ番号）
        n = sh.getCellRangeByName('M6:O6')
        n.merge(True)
        sh.getCellRangeByName('M6').String = '写真番号' + NUMS[k]
        n.HoriJustify = RIGHT
        n.VertJustify = CENTER
        n.CharHeight = 11
        # 見出しの「被保険者氏　　名」「被保険者　番　　号」は欄（B5・E5）の幅に入らず、折り返すと「被保険者氏／名」になってはみ出していた
        # （アプリのはみ出しの検査 e2e-fit.mjs）→「被保険者／氏　　名」の2行にして 10pt に
        for ref, text in (('B5', '被保険者\n氏　　名'), ('E5', '被保険者\n番　　号')):
            c = sh.getCellRangeByName(ref)
            c.String = text
            c.IsTextWrapped = True
            c.CharHeight = 10
    src.close(True)

    # ---- 承諾書（賃貸用）・確約書（PDF の様式から作ったシート）
    src = load(spec['out'])
    for k, sh in enumerate(pdf_sheets):
        bring(src, sh['name'], sh['name'], 6 + len(PHOTOS) + k)
    src.close(True)

    # 改修予定費用（事前 J30:AJ32）・改修費用（支給 J33:AJ35）：「円」の左の空いた所を1つの欄に（右ぞろえ・上下中央）
    for sheet_name, area in (('事前承認申請書', 'J30:AJ32'), ('支給申請書', 'J33:AJ35')):
        r = sheets.getByName(sheet_name).getCellRangeByName(area)
        r.merge(True)
        r.HoriJustify = RIGHT
        r.VertJustify = CENTER
        r.CharHeight = 14

    # 印刷の設定：持ってきたシートは原本の用紙の設定（余白・倍率）が外れてヘッダー・フッターが付くので、原本の余白で A4 縦・1ページに合わせる
    # 原本の余白（事前：上下左右 1.0cm、支給：上 0.74cm・ほか 1.0cm。印刷範囲は原本の A1:BG61・A1:BG70）
    page(sheets.getByName('事前承認申請書'), 'KRjizen', (1000, 1000, 1000, 1000), 'A1:BG61', True)
    page(sheets.getByName('支給申請書'), 'KRshikyu', (1000, 1000, 740, 1000), 'A1:BG70', True)
    for k, name in enumerate(TK):
        margins, area, center = tk_pages[name]
        page(sheets.getByName(name), f'KRtk{k}', margins, area, center)
    page(sheets.getByName('平面図'), 'KRplan', (1500, 1500, 2000, 2000), None, True)
    margins, _, _ = photo_page
    for name in PHOTOS:
        page(sheets.getByName(name), 'KRphoto', margins, 'A1:O14', True)  # 原本の印刷範囲（裏の空いた行は入れない）
    for k, sh in enumerate(pdf_sheets):
        m = mapping[sh['name']]
        xb, yb = m['xb'], m['yb']
        col = lambda n: (chr(64 + n) if n <= 26 else chr(64 + (n - 1) // 26) + chr(65 + (n - 1) % 26))
        page(sheets.getByName(sh['name']), f'KRpdf{k}', (max(250, xb[0] * PT), max(250, (595.3 - xb[-1]) * PT), max(250, yb[0] * PT), max(250, (841.89 - yb[-1]) * PT)),
             f'A1:{col(m["cols"])}{m["rows"]}')

    order = ['事前承認申請書', '支給申請書', *TK, '平面図', *PHOTOS, *[s['name'] for s in pdf_sheets]]
    for i, name in enumerate(order):
        sheets.moveByName(name, i)
    assert list(sheets.ElementNames) == order, sheets.ElementNames
    doc.storeToURL(uno.systemPathToFileUrl(out), (prop('FilterName', 'Calc MS Excel 2007 XML Template'),))
    doc.close(True)
    print('sheets', order)
finally:
    try:
        desktop.terminate()
    except Exception:
        pass
    proc.wait(timeout=30)

# 作った人の名前などを外す
tmp = out + '.tmp'
zin = zipfile.ZipFile(out)
zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    if item.filename == 'docProps/core.xml':
        t = data.decode()
        t = re.sub(r'<dc:creator>[^<]*</dc:creator>', '', t)
        t = re.sub(r'<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', '', t)
        data = t.encode()
    zout.writestr(item, data)
zout.close()
os.replace(tmp, out)
print('work', work)
