# 大分市の住宅改修の原本（アプリに入れる .xltx）を、いただいた様式から LibreOffice で作る（2026-11-04。ユーザーがいただいた大分市の様式）：
#   介護保険居宅介護（介護予防）住宅改修費支給申請兼施工承認（変更）申請書（sinnseishoexe.xls）＋ 委任状（ininjyo.xlsx。続柄の選択肢のある新しい版。
#   kaigoininjyo.xlsx・kaigoininjyo.pdf は前の版）＋ 住宅改修が必要な理由書（表 riyuusyoomotemen.xls・裏 riyuusyouramen.xlsx）
#   ＋ 工事写真添付用紙（行橋市の原本の「住改・写真 ①」〜の8枚。申請書の注意「施工前の状態が確認できる書類等を添付」。市の写真の様式はない）。
# 平面図は添付書類にないので入れない（`business-rules.md` の「平面図が要らない保険者」）。見積書は見積書のタブ。
# アプリが字を書く欄（フリガナ・氏名・住所・電話・所有者・本人との関係・申請者の住所と電話・委任状の住所と受任者・理由書の事業所と作成者）は、
# 空いた所を1つの欄に結合する（罫線はそのまま）。改修工事施工者の欄は折り返す。
# 申請書・理由書の「□償還　□受領委任」は「■受領委任」にしておく（受領委任払いで出す。久留米市・飯塚市と同じ）。
# usage: python3 make_oita_jutaku.py <sinnseishoexe.xls> <ininjyo.xlsx> <riyuusyoomotemen.xls> <riyuusyouramen.xlsx> <yukuhashi.xltx> <出力.xltx>
import os
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.table import CellRangeAddress

shinsei, ininjo, riyu_front, riyu_back, yukuhashi, out = [os.path.abspath(p) for p in sys.argv[1:7]]
PORT = 2111
profile = tempfile.mkdtemp(prefix='lo-profile-')
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', f'-env:UserInstallation=file://{profile}', f'--accept=socket,host=127.0.0.1,port={PORT};urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


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

PHOTOS = ['住改・写真 ①', '住改・写真②', '住改・写真③', '住改・写真④', '住改・写真④ (3)', '住改・写真④ (4)', '住改・写真④ (5)', '住改・写真④ (2)']
SHINSEI = '支給申請兼施工承認申請書'
PROXY = '委任状'
FRONT = '理由書（表）'
BACK = '理由書（裏）'

try:
    from com.sun.star.table.CellHoriJustify import LEFT
    from com.sun.star.table.CellVertJustify import CENTER

    doc = load(shinsei)
    sheets = doc.Sheets
    sheets.getByIndex(0).Name = SHINSEI

    def bring(path, name, new_name, pos):
        src = load(path)
        sheets.importSheet(src, name if name else src.Sheets.getByIndex(0).Name, pos)
        src.close(True)
        imported = sheets.getByIndex(pos)
        imported.Name = new_name
        return imported

    bring(ininjo, None, PROXY, 1)
    bring(riyu_front, None, FRONT, 2)
    bring(riyu_back, None, BACK, 3)
    for k, name in enumerate(PHOTOS):
        bring(yukuhashi, name, name, 4 + k)

    def field(sheet_name, area, pt=None, wrap=False):
        r = sheets.getByName(sheet_name).getCellRangeByName(area)
        r.merge(True)
        r.HoriJustify = LEFT
        r.VertJustify = CENTER
        r.IsTextWrapped = wrap
        if pt:
            r.CharHeight = pt

    s = sheets.getByName(SHINSEI)
    s.getCellRangeByName('AN2').String = '　　　□償還　　　　■受領委任'
    s.getCellRangeByName('AR11').String = ''  # 電話番号の「ー」（1つの欄に「0930-23-1234」と書く）
    s.getCellRangeByName('AR11:AR12').merge(False)  # 「ー」の欄の結合を外さないと AO11:AY12 を結合できない（LibreOffice は重なる結合をしない）
    s.getCellRangeByName('AR40').String = ''  # 申請者の電話番号の「ー」（同じ）
    for area, pt, wrap in (('L3:AF3', None, False), ('L4:AF6', 14, False), ('L11:AJ12', None, True), ('AO11:AY12', None, False), ('L13:AF14', None, False), ('AN13:AY14', None, False), ('M39:AI39', None, False), ('AN40:AY40', None, False)):
        field(SHINSEI, area, pt, wrap)
    # 改修工事施工者の欄（2行の高さ）は折り返す（会社名・営業所を2行に）
    for r in (17, 19, 21, 23, 25, 27):
        s.getCellRangeByName(f'Z{r}:AI{r + 1}').IsTextWrapped = True

    for area in ('C6:H6', 'C22:H22', 'C23:H23'):  # 委任者の住所・受任者の氏名と住所
        field(PROXY, area)

    f = sheets.getByName(FRONT)
    f.getCellRangeByName('B3').String = '□償還　■受領委任'
    for area in ('H5:AC5', 'H6:AC7'):
        field(FRONT, area)

    # 印刷の設定：原本の余白・向き・1ページに合わせる（持ってきたシートは原本の設定が外れてヘッダー・フッターが付く）
    styles = doc.StyleFamilies.getByName('PageStyles')

    def page(sheet, name, margins, area, center=False, scale=None):
        if not styles.hasByName(name):
            styles.insertByName(name, doc.createInstance('com.sun.star.style.PageStyle'))
        st = styles.getByName(name)
        st.Width, st.Height, st.IsLandscape = 21000, 29700, False
        st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin = margins
        st.HeaderIsOn = False
        st.FooterIsOn = False
        st.CenterHorizontally = center
        if scale:
            st.PageScale = scale
        else:
            st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
        sheet.PageStyle = name
        if area:
            rr = sheet.getCellRangeByName(area).RangeAddress
            a = CellRangeAddress()
            a.Sheet, a.StartColumn, a.StartRow, a.EndColumn, a.EndRow = rr.Sheet, rr.StartColumn, rr.StartRow, rr.EndColumn, rr.EndRow
            sheet.setPrintAreas((a,))

    # 原本の余白（申請書：左 0.8・右 0・上 0.7・下 0.2cm、中央。委任状：左 3.3・右 1.8・上下 1.9cm。理由書（表）：左右 1.1・上 2.0・下 1.1cm。理由書（裏）：左右 1.91・上下 2.54cm・68%）
    page(s, 'OTshinsei', (800, 0, 700, 200), 'A1:BD79', True)
    page(sheets.getByName(PROXY), 'OTproxy', (3300, 1800, 1900, 1900), 'A1:H27')
    page(f, 'OTriyu1', (1100, 1100, 2000, 1100), 'A1:AC47')
    page(sheets.getByName(BACK), 'OTriyu2', (1910, 1910, 2540, 2540), 'A1:O48', False, 68)
    for name in PHOTOS:
        page(sheets.getByName(name), 'OTphoto', (1500, 1000, 1200, 970), 'A1:P54', True)

    order = [SHINSEI, PROXY, FRONT, BACK, *PHOTOS]
    for i, name in enumerate(order):
        sheets.moveByName(name, i)
    doc.storeToURL(uno.systemPathToFileUrl(out), (prop('FilterName', 'Calc MS Excel 2007 XML Template'),))
    doc.close(True)
    print('sheets', order)
finally:
    try:
        desktop.terminate()
    except Exception:
        pass
    proc.wait(timeout=30)
