# 久留米市の住宅改修の原本（アプリに入れる .xltx）を、いただいた様式から LibreOffice で作る（2026-11-02）：
#   住宅改修事前承認申請書（jyuukaijizen.xls）＋ 住宅改修費支給申請書（第2号様式。juukai.xls）
#   ＋ 平面図（苅田町の原本の「平面図  (2)」）＋ 工事写真添付用紙（行橋市の原本の「住改・写真 ①」〜の8枚。市の様式はなく、写真は日付入りであればよい）。
# 理由書は国の様式（アプリの理由書のタブ）、工事費内訳書は「参考様式」なので見積書のタブ（苅田町・行橋市・みやこ町と同じ表）で作る。
# 改修予定費用・改修費用の欄（「円」の左の空いた所）は、アプリが金額を書けるように結合して右ぞろえにする（罫線はそのまま）。
# usage: python3 make_kurume_jutaku.py <jyuukaijizen.xls> <juukai.xls> <kanda.xltx> <yukuhashi.xltx> <出力.xltx>
import os
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.table import CellRangeAddress

jizen, shikyu, kanda, yukuhashi, out = [os.path.abspath(p) for p in sys.argv[1:6]]
PORT = 2109
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

try:
    doc = load(jizen)
    sheets = doc.Sheets
    sheets.getByIndex(0).Name = '事前承認申請書'

    def bring(path, name, new_name, pos):
        src = load(path)
        sheets.importSheet(src, name, pos)
        src.close(True)
        imported = sheets.getByIndex(pos)
        imported.Name = new_name
        return imported

    bring(shikyu, '支給申請書', '支給申請書', 1)
    bring(kanda, '平面図  (2)', '平面図', 2)
    for k, name in enumerate(PHOTOS):
        bring(yukuhashi, name, name, 3 + k)

    # 改修予定費用（事前 J30:AJ32）・改修費用（支給 J33:AJ35）：「円」の左の空いた所を1つの欄に（右ぞろえ・上下中央）
    from com.sun.star.table.CellHoriJustify import RIGHT
    from com.sun.star.table.CellVertJustify import CENTER
    for sheet_name, area in (('事前承認申請書', 'J30:AJ32'), ('支給申請書', 'J33:AJ35')):
        r = sheets.getByName(sheet_name).getCellRangeByName(area)
        r.merge(True)
        r.HoriJustify = RIGHT
        r.VertJustify = CENTER
        r.CharHeight = 14

    # 印刷の設定：持ってきたシートは原本の用紙の設定（余白・倍率）が外れてヘッダー・フッターが付くので、原本の余白で A4 縦・1ページに合わせる
    styles = doc.StyleFamilies.getByName('PageStyles')

    def page(sheet, name, margins, area, center=False):
        if not styles.hasByName(name):
            styles.insertByName(name, doc.createInstance('com.sun.star.style.PageStyle'))
        st = styles.getByName(name)
        st.Width, st.Height, st.IsLandscape = 21000, 29700, False
        st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin = margins
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

    # 原本の余白（事前：上下左右 1.0cm、支給：上 0.74cm・ほか 1.0cm。印刷範囲は原本の A1:BG61・A1:BG70）
    page(sheets.getByName('事前承認申請書'), 'KRjizen', (1000, 1000, 1000, 1000), 'A1:BG61', True)
    page(sheets.getByName('支給申請書'), 'KRshikyu', (1000, 1000, 740, 1000), 'A1:BG70', True)
    page(sheets.getByName('平面図'), 'KRplan', (1500, 1500, 2000, 2000), None, True)
    for name in PHOTOS:
        page(sheets.getByName(name), 'KRphoto', (1500, 1000, 1200, 970), 'A1:P54', True)

    order = ['事前承認申請書', '支給申請書', '平面図', *PHOTOS]
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
