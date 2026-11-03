# 飯塚市の住宅改修の原本（アプリに入れる .xltx）を、いただいた様式から LibreOffice で作る（2026-11-02）：
#   事前承認願書【受領委任払用】（6785.xls・様式第4号）＋ 所有者の承諾書（6790.xls）＋ 平面図（苅田町の原本の「平面図  (2)」。事前承認願書の添付書類に「□平面図」）
#   ＋ 改修前 写真添付用紙（事前申請用。6789.xls）を5枚 ＋ 支給申請書【受領委任払用】（6791.xls）＋ 改修前・改修後の写真（支給申請用。6793.xls）を5枚 ＋ 請求書【受領委任払用】（6794.xls）。
# 理由書は国の様式（アプリの理由書のタブ）、内訳書は見積書のタブ（苅田町・行橋市・みやこ町と同じ表）。
# いただいた「入力シート」付きのまとめた版（6796.xlsx）は、チェックボックスが Excel のコントロールで式も多いので使わない（中身は同じ様式）。
# 写真の用紙は、写真番号の欄（J6:T6）に ①〜⑤ を書き、撮影日の欄（年・月・日の小さな欄）を1つの欄（「　年　月　日」）にする（アプリが「令和8年11月2日」と書く）。
# 写真の用紙の裏面の注意事項（15行目から下）は、印刷の範囲から外す（表だけ）。請求書の被保険者番号の10マスは上下2行を結合して数字を真ん中に。
# usage: python3 make_iizuka_jutaku.py <6785.xls> <6791.xls> <6789.xls> <6793.xls> <6790.xls> <6794.xls> <kanda.xltx> <出力.xltx>
import os
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.table import CellRangeAddress

jizen, shikyu, photo_pre, photo_post, consent, invoice, kanda, out = [os.path.abspath(p) for p in sys.argv[1:9]]
PORT = 2110
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

NUMS = '①②③④⑤'
PRE = [f'事前写真{n}' for n in NUMS]
POST = [f'支給写真{n}' for n in NUMS]

try:
    from com.sun.star.table.CellHoriJustify import CENTER as H_CENTER
    from com.sun.star.table.CellVertJustify import CENTER as V_CENTER

    doc = load(jizen)
    sheets = doc.Sheets
    sheets.getByIndex(0).Name = '事前承認願書'

    def bring(src, name, new_name):
        pos = sheets.Count
        sheets.importSheet(src, name, pos)
        imported = sheets.getByIndex(pos)
        imported.Name = new_name
        return imported

    def once(path, name, new_name):
        src = load(path)
        sh = bring(src, name, new_name)
        src.close(True)
        return sh

    def one_cell(sh, area, text=None, size=None):
        """area の結合を外してから1つの欄に結合し、まん中に（text を入れる）"""
        r = sh.getCellRangeByName(area)
        a = r.RangeAddress
        # area の中の結合を外す（行ごと・列ごとに見る）
        for row in range(a.StartRow, a.EndRow + 1):
            for col in range(a.StartColumn, a.EndColumn + 1):
                c = sh.getCellByPosition(col, row)
                cur = sh.createCursorByRange(c)
                cur.collapseToMergedArea()
                ca = cur.RangeAddress
                if ca.EndColumn > ca.StartColumn or ca.EndRow > ca.StartRow:
                    cur.merge(False)
        for row in range(a.StartRow, a.EndRow + 1):
            for col in range(a.StartColumn, a.EndColumn + 1):
                sh.getCellByPosition(col, row).setString('')
        r.merge(True)
        r.HoriJustify = H_CENTER
        r.VertJustify = V_CENTER
        if text is not None:
            sh.getCellRangeByName(area.split(':')[0]).setString(text)
        if size:
            r.CharHeight = size

    once(consent, 'Sheet1', '承諾書')
    once(kanda, '平面図  (2)', '平面図')
    src = load(photo_pre)
    for k, name in enumerate(PRE):
        sh = bring(src, '事前', name)
        one_cell(sh, 'J6:T6', NUMS[k], 16)
        one_cell(sh, 'J5:T5', '　　　　年　　　月　　　日')
    src.close(True)
    once(shikyu, '原本【受】', '支給申請書')
    src = load(photo_post)
    for k, name in enumerate(POST):
        sh = bring(src, '支給', name)
        one_cell(sh, 'J6:T6', NUMS[k], 16)
        one_cell(sh, 'J5:T5', '　　　　年　　　月　　　日')
        one_cell(sh, 'J13:T13', '　　　　年　　　月　　　日')
    src.close(True)
    inv = once(invoice, 'Sheet1', '請求書')
    # 請求書の被保険者番号の10マス（R〜AA の 11・12行）は上下を結合して数字を真ん中に
    for col in 'R S T U V W X Y Z AA'.split():
        r = inv.getCellRangeByName(f'{col}11:{col}12')
        r.merge(True)
        r.HoriJustify = H_CENTER
        r.VertJustify = V_CENTER

    # 印刷の設定：持ってきたシートは原本の用紙の設定が外れてヘッダー・フッターが付くので、原本の余白で A4 縦・1ページに合わせる
    styles = doc.StyleFamilies.getByName('PageStyles')

    def page(sheet, name, margins, area, center=True):
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

    # 原本の余白（1/100mm）と印刷範囲。写真の用紙は表だけ（裏面の注意事項は外す）
    page(sheets.getByName('事前承認願書'), 'IZjizen', (900, 500, 500, 1100), 'B1:AB51')
    page(sheets.getByName('承諾書'), 'IZconsent', (1500, 1500, 2500, 1500), 'A1:I24')
    page(sheets.getByName('平面図'), 'IZplan', (1500, 1500, 2000, 2000), None)
    for name in PRE:
        page(sheets.getByName(name), 'IZphotoPre', (1500, 1100, 1500, 500), 'A1:T14')
    page(sheets.getByName('支給申請書'), 'IZshikyu', (1800, 1800, 1900, 1900), 'A1:AB40')
    for name in POST:
        page(sheets.getByName(name), 'IZphotoPost', (1300, 1100, 1700, 1500), 'A1:T21')
    page(sheets.getByName('請求書'), 'IZinvoice', (1778, 1778, 1905, 1905), 'A1:AB28')

    order = ['事前承認願書', '承諾書', '平面図', *PRE, '支給申請書', *POST, '請求書']
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
