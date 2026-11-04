# 久留米市・大分市の特定福祉用具の原本（アプリに入れる .xlsx）を、いただいた様式から作る（2026-11-04。ユーザーがいただいた市の様式）：
#   久留米市：介護保険居宅介護（介護予防）福祉用具購入費支給申請書（第１号様式。R6fukusiyougusinnseisyo.xls の「申請書 」のシート。
#     記載例の2つのシートは入れない＝記載例の名前・番号を残さない）＋ 委任状（介護保険福祉用具購入費受領委任払用。第６号様式）と
#     請求書（第７号様式）（seikyuusyoininjouyougu.pdf の1・2ページ）＋ 委任状（久留米市提出用。teisyutuyou.pdf）。
#     PDF の様式は pdf_form_xlsx.py で同じ形のシートにする（北九州市と同じ作り）。アプリが書く欄の番地は kurumeCells.ts に書き出す。
#   大分市：介護保険居宅介護（介護予防）福祉用具購入費支給申請書（第12号様式。fukusiyogusinsei.xlsx）＋ 委任状（住宅改修の大分市の原本 oita.xltx の
#     「委任状」のシート＝いただいた ininjyo.xlsx。続柄の選択肢のある新しい版。住宅改修と同じ様式）。
# アプリが字を書く欄で、原本では結合していない所（久留米市の住所・購入金額合計・支払額、大分市の福祉用具が必要な理由）は、罫線はそのままで結合する。
# usage: python3 make_kurume_oita_tokutei.py <久留米 申請書.xls> <久留米 委任状・請求書.pdf> <久留米 委任状（提出用）.pdf> <大分 第12号様式.xlsx> <住宅改修 oita.xltx> <出力フォルダ>
#   環境変数 KO_CELLS_TS=<…/kurumeCells.ts> で欄の番地の TS を書く
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
shinsei_xls, seikyu_pdf, teisyutu_pdf, oita_xlsx, oita_jutaku, out_dir = [os.path.abspath(p) for p in sys.argv[1:7]]
work = tempfile.mkdtemp(prefix='ko-tokutei-')


# ---------------------------------------------------------------- PDF の様式 → シート（pdf_form_xlsx.py）

def F(name, box, **kw):
    return {'name': name, 'box': [round(v, 2) for v in box], **kw}


MINCHO = {'font': 'ＭＳ 明朝', 'fonts': {'MS-Mincho': 'ＭＳ 明朝', 'Century': 'Century'}}
# 委任状（受領委任払用）：受任者（販売業者）の所在地・電話番号・販売業者名称及び代表者氏名、保険給付額、委任者（被保険者）の住所（「久留米市」のうしろ）。
# 日付・委任者の氏名は自署（ほかの保険者の委任状と同じ）。電話番号の「（　）」は外し、1つの欄に「0930-26-9640」と書く
proxy = {'name': '委任状（受領委任払用）', 'pdf': seikyu_pdf, 'segs': [[0, None, None]], **MINCHO,
         'drop': [[332, 218, 347, 233, 0], [384, 218, 399, 233, 0]],
         'fields': [F('sellerAddress', [222, 132, 518, 214], size=11, wrap=True),
                    F('sellerTel', [286, 217, 518, 233], size=11, shrink=True),
                    F('seller', [222, 262, 518, 352], size=11, wrap=True),
                    F('benefit', [148, 437, 428, 463], h='right', size=14, shrink=True),
                    F('address', [257, 603, 442, 618], size=11, shrink=True)]}  # 下線（619pt）の上まで（下線を欄の中に入れると結合で消える）
# 請求書：金額（11マス。頭に￥）・請求する者（販売業者）の〒・住所・氏名（名称と代表者）・電話・件名の被保険者氏名。日付・口座は書かない
DIGIT_X0, DIGIT_W = 151.9, 31.92
claim_fields = [F(f'd{k}', [DIGIT_X0 + DIGIT_W * k + 1, 123.5, DIGIT_X0 + DIGIT_W * (k + 1) - 1, 156], h='center', size=14) for k in range(11)]
zip_a = [196.7 + (248.2 - 196.7) / 3 * k for k in range(4)]
zip_b = [266.3 + (334.5 - 266.3) / 4 * k for k in range(5)]
claim_fields += [F(f'z{k}', [zip_a[k] + 0.8, 251, zip_a[k + 1] - 0.8, 277], h='center', size=12) for k in range(3)]
claim_fields += [F(f'z{3 + k}', [zip_b[k] + 0.8, 251, zip_b[k + 1] - 0.8, 277], h='center', size=12) for k in range(4)]
claim_fields += [F('sellerAddress', [190, 281, 520, 300], size=11, shrink=True),
                 F('seller', [190, 332, 520, 358], size=11, shrink=True),
                 F('telA', [182, 364, 233, 380], h='center', size=11, shrink=True),
                 F('telB', [245, 364, 296, 380], h='center', size=11, shrink=True),
                 F('telC', [308, 364, 380, 380], h='center', size=11, shrink=True),
                 F('name', [231, 426, 480, 442], size=11, shrink=True)]
claim = {'name': '請求書', 'pdf': seikyu_pdf, 'segs': [[1, None, None]], **MINCHO, 'fields': claim_fields}
# 委任状（久留米市提出用）：来庁する人（担当）・事業所名等・所在地・連絡先（設定の営業所）と、委任者の住所。
# 委任する手続きの「居宅介護(介護予防)福祉用具購入費支給申請」はアプリが丸で囲む。日付・氏名は自署
teisyutu = {'name': '委任状（提出用）', 'pdf': teisyutu_pdf, 'segs': [[0, None, None]],
            'font': 'HG丸ｺﾞｼｯｸM-PRO', 'fonts': {'HGMaruGothicMPRO': 'HG丸ｺﾞｼｯｸM-PRO', 'MS-Mincho': 'ＭＳ 明朝', 'Century': 'Century'},
            'fields': [F('visitor', [191, 150, 540, 182.5], size=12, shrink=True),
                       F('office', [191, 186.5, 540, 219], size=12, shrink=True),
                       F('sellerAddress', [191, 223, 540, 255], size=11, wrap=True),
                       F('sellerTel', [191, 259, 540, 291.5], size=12, shrink=True),
                       F('address', [172, 529, 472, 544.6], size=11, shrink=True)]}  # 下線（545pt）の上まで
pdf_sheets = [proxy, claim, teisyutu]
spec = {'out': os.path.join(work, 'pdf.xlsx'), 'map': os.path.join(work, 'pdf.map.json'), 'sheets': pdf_sheets}
with open(os.path.join(work, 'spec.json'), 'w', encoding='utf-8') as f:
    json.dump(spec, f, ensure_ascii=False, indent=1)
subprocess.run([sys.executable, '-I', os.path.join(HERE, 'pdf_form_xlsx.py'), os.path.join(work, 'spec.json')], check=True)
mapping = json.load(open(spec['map'], encoding='utf-8'))

# ---------------------------------------------------------------- LibreOffice で1つのブックに

import uno  # noqa: E402
from com.sun.star.beans import PropertyValue  # noqa: E402
from com.sun.star.table import CellRangeAddress  # noqa: E402

PORT = 2113
profile = tempfile.mkdtemp(prefix='lo-profile-')
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', f'-env:UserInstallation=file://{profile}', f'--accept=socket,host=127.0.0.1,port={PORT};urp;'],
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

try:
    from com.sun.star.table.CellHoriJustify import LEFT, RIGHT
    from com.sun.star.table.CellVertJustify import CENTER

    def page(doc, sheet, name, margins, area, scale_to_page=True):
        styles = doc.StyleFamilies.getByName('PageStyles')
        if not styles.hasByName(name):
            styles.insertByName(name, doc.createInstance('com.sun.star.style.PageStyle'))
        st = styles.getByName(name)
        st.Width, st.Height, st.IsLandscape = 21000, 29700, False
        st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin = [round(m) for m in margins]
        st.HeaderIsOn = False
        st.FooterIsOn = False
        st.CenterHorizontally = False
        if scale_to_page:
            st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
        sheet.PageStyle = name
        rr = sheet.getCellRangeByName(area).RangeAddress
        a = CellRangeAddress()
        a.Sheet, a.StartColumn, a.StartRow, a.EndColumn, a.EndRow = rr.Sheet, rr.StartColumn, rr.StartRow, rr.EndColumn, rr.EndRow
        sheet.setPrintAreas((a,))

    def field(sheet, area, pt=None, h=LEFT):
        r = sheet.getCellRangeByName(area)
        r.merge(True)
        r.HoriJustify = h
        r.VertJustify = CENTER
        if pt:
            r.CharHeight = pt

    def col_name(n):
        s = ''
        while n:
            n, k = divmod(n - 1, 26)
            s = chr(65 + k) + s
        return s

    # ---------------- 久留米市
    doc = load(shinsei_xls)
    sheets = doc.Sheets
    for name in list(sheets.ElementNames):
        if name.startswith('記載例'):
            sheets.removeByName(name)  # 記載例（見本の名前・番号の入ったシート）は入れない
    assert sheets.Count == 1, sheets.ElementNames
    s = sheets.getByIndex(0)
    s.Name = '申請書'
    # 住所（「久留米市」のうしろ）・購入金額合計・支払額は、結合していない空いた所に書く → 1つの欄に（罫線はそのまま）
    field(s, 'I10:AM10', 12)
    field(s, 'H20:U21', 12, RIGHT)
    field(s, 'L22:U22', 12, RIGHT)
    # 原本は 91% の倍率。字体の幅のちがう PC（LibreOffice では4枚に分かれた）でも1ページに入るよう「1ページに合わせる」（余白は原本のまま）
    st = doc.StyleFamilies.getByName('PageStyles').getByName(s.PageStyle)
    st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
    src = load(spec['out'])
    for k, sh in enumerate(pdf_sheets):
        sheets.importSheet(src, sh['name'], 1 + k)
    src.close(True)
    # 持ってきたシートの印刷の設定（取り込むと外れる）：PDF の様式の位置と同じ余白で A4 の1ページ
    for sh in pdf_sheets:
        m = mapping[sh['name']]
        xb, yb = m['xb'], m['yb']
        margins = (max(250, xb[0] * PT), max(250, (595.3 - xb[-1]) * PT), max(250, yb[0] * PT), max(250, (841.89 - yb[-1]) * PT))
        page(doc, sheets.getByName(sh['name']), 'KU' + str(pdf_sheets.index(sh)), margins, f'A1:{col_name(m["cols"])}{m["rows"]}')
    kurume_out = os.path.join(out_dir, 'kurume.xlsx')
    doc.storeToURL(uno.systemPathToFileUrl(kurume_out), (prop('FilterName', 'Calc MS Excel 2007 XML'),))
    doc.close(True)

    # ---------------- 大分市
    doc = load(oita_xlsx)
    sheets = doc.Sheets
    s = sheets.getByIndex(0)
    s.Name = '支給申請書'
    src = load(oita_jutaku)
    sheets.importSheet(src, '委任状', 1)
    src.close(True)
    # 申請書：原本は 92% の倍率。字体の幅のちがう PC でも1ページに入るよう「1ページに合わせる」（余白は原本のまま）
    st = doc.StyleFamilies.getByName('PageStyles').getByName(s.PageStyle)
    st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
    # 印刷範囲：原本は標準の印刷範囲の名前がなく（Print_Area_0）、用紙の外（AU 列）の点線の丸まで印刷して小さくなる → 様式の A1:AT67。
    # 用紙の外の丸（前の版の名残り）は消す
    rr = s.getCellRangeByName('A1:AT67').RangeAddress
    a = CellRangeAddress()
    a.Sheet, a.StartColumn, a.StartRow, a.EndColumn, a.EndRow = rr.Sheet, rr.StartColumn, rr.StartRow, rr.EndColumn, rr.EndRow
    s.setPrintAreas((a,))
    right = s.getCellRangeByName('AU1').Position.X
    dp = s.DrawPage
    for i in reversed(range(dp.Count)):
        if dp.getByIndex(i).Position.X >= right:
            dp.remove(dp.getByIndex(i))
    # 委任状：住宅改修の大分市の原本と同じ余白（左 3.3・右 1.8・上下 1.9cm）
    page(doc, sheets.getByName('委任状'), 'OTproxy', (3300, 1800, 1900, 1900), 'A1:H27')
    oita_out = os.path.join(out_dir, 'oita.xlsx')
    doc.storeToURL(uno.systemPathToFileUrl(oita_out), (prop('FilterName', 'Calc MS Excel 2007 XML'),))
    doc.close(True)
finally:
    try:
        desktop.terminate()
    except Exception:
        pass
    proc.wait(timeout=30)


# ---------------------------------------------------------------- 仕上げ：作った人の名前などを外す・番地の TS

def clean(path):
    tmp = path + '.tmp'
    zin = zipfile.ZipFile(path)
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
    os.replace(tmp, path)


for p in (kurume_out, oita_out):
    clean(p)

cells_ts = os.environ.get('KO_CELLS_TS')
if cells_ts:
    def cells_of(sheet):
        out = {k: v.split(':')[0] for k, v in mapping[sheet]['fields'].items()}
        if sheet == '委任状（提出用）':
            # 委任する手続きの「・ 居宅介護(介護予防)福祉用具購入費支給申請」の文字の欄（アプリが丸で囲む）
            hits = [it['ref'].split(':')[0] for it in mapping[sheet]['items'] if '福祉用具購入費支給申請' in it['text']]
            assert len(hits) == 1, hits
            out['kind'] = hits[0]
        return out
    body = ',\n'.join(f'  {key}: {json.dumps(cells_of(sh["name"]), ensure_ascii=False)}' for key, sh in zip(('proxy', 'claim', 'teisyutu'), pdf_sheets))
    with open(cells_ts, 'w', encoding='utf-8') as f:
        f.write('// 久留米市の特定福祉用具の原本（kurume.xlsx）の、PDF の様式から作ったシートの欄の番地。スキルの scripts/make_kurume_oita_tokutei.py が原本と一緒に書く\n'
                '// （手で直さない。原本を作り直すと番地が変わるので、原本とこのファイルはいつも一緒に置きかえる）\n'
                f'export const KU_SHEETS = {json.dumps(["申請書", *[s["name"] for s in pdf_sheets]], ensure_ascii=False)} as const;\n'
                f'export const KU_CELLS = {{\n{body},\n}} as const;\n')
print('kurume', kurume_out)
print('oita', oita_out)
print('work', work)
