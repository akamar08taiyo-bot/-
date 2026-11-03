# 飯塚市の住宅改修の原本（アプリに入れる .xltx）を、いただいた様式から LibreOffice で作る（2026-11-02）：
#   事前承認願書【受領委任払用】（6785.xls・様式第4号）＋ 所有者の承諾書（6790.xls）＋ 平面図（苅田町の原本の「平面図  (2)」。事前承認願書の添付書類に「□平面図」）
#   ＋ 改修前 写真添付用紙（事前申請用。6789.xls）を5枚 ＋ 支給申請書【受領委任払用】（6791.xls）＋ 改修前・改修後の写真（支給申請用。6793.xls）を5枚 ＋ 請求書【受領委任払用】（6794.xls）。
#   ＋ 内訳書（6788.xls。ユーザーの答え「内訳書はいります」2026-11-03）：明細の行を15行×4ページ（60行）に増やし、見出し（2〜5行）を各ページの上にくり返す。
#   アプリが見積書の行を書き、使わない行は隠す（1ページ分の15行は残す）。A4 横・72%（原本と同じ倍率）・手動の改ページ（21・36・51行）。
# 理由書は国の様式（アプリの理由書のタブ）。
# いただいた「入力シート」付きのまとめた版（6796.xlsx）は、チェックボックスが Excel のコントロールで式も多いので使わない（中身は同じ様式）。
# 写真の用紙は、写真番号の欄（J6:T6）に ①〜⑤ を書き、撮影日の欄（年・月・日の小さな欄）を1つの欄（「　年　月　日」）にする（アプリが「令和8年11月2日」と書く）。
# 写真の用紙の裏面の注意事項（15行目から下）は、印刷の範囲から外す（表だけ）。請求書の被保険者番号の10マスは上下2行を結合して数字を真ん中に。
# usage: python3 make_iizuka_jutaku.py <6785.xls> <6791.xls> <6789.xls> <6793.xls> <6790.xls> <6794.xls> <6788.xls> <kanda.xltx> <出力.xltx>
import os
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.table import CellRangeAddress

jizen, shikyu, photo_pre, photo_post, consent, invoice, uchiwake, kanda, out = [os.path.abspath(p) for p in sys.argv[1:10]]
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
UW_LAST = 65  # 内訳書の明細の最後の行（6〜65行。15行×4ページ）
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
    # 内訳書：明細の行（6〜20行の15行）を 6〜65行の60行に（20行目の書式を写す。行の高さも同じ）。字は上下まん中、備考は折り返す
    uw = once(uchiwake, '原本', '内訳書')
    src_row = uw.getCellRangeByName('B20:N20').RangeAddress
    row_h = uw.Rows.getByIndex(19).Height
    for r in range(20, UW_LAST):
        dest = uw.getCellByPosition(1, r).CellAddress
        uw.copyRange(dest, src_row)
        uw.Rows.getByIndex(r).Height = row_h
    body = uw.getCellRangeByName(f'B6:N{UW_LAST}')
    body.VertJustify = V_CENTER
    uw.getCellRangeByName(f'N6:N{UW_LAST}').IsTextWrapped = True
    # 単価・金額は 3けたごとのコンマ（アプリが数で書く）
    from com.sun.star.lang import Locale
    nf = doc.NumberFormats
    key = nf.queryKey('#,##0', Locale(), False)
    if key == -1:
        key = nf.addNew('#,##0', Locale())
    for area in (f'G6:H{UW_LAST}', f'M6:M{UW_LAST}'):
        uw.getCellRangeByName(area).NumberFormat = key
    for r in (21, 36, 51):
        uw.Rows.getByIndex(r - 1).IsStartOfNewPage = True
    # 見出しの改修場所・改修の種類・部材の注意書きは、原本は全角の空白で字の位置を合わせた「均等割り付け」で、Excel 以外（アプリのプレビュー・LibreOffice）では
    # 欄からはみ出す。同じ字を改行で区切り、左寄せ・折り返しにする（はみ出しを出さない決まり。e2e-fit.mjs）
    from com.sun.star.table.CellHoriJustify import LEFT as H_LEFT0
    heads = {
        'B5': ('改修場所\n①玄関②廊下\n③居間④寝室\n⑤台所\n⑥脱衣室\n⑦浴室⑧トイレ\n⑨屋外\n⑩その他', 8),
        'C5': ('改修の種類\n①手すり\n②段差解消\n③滑り防止\n④引き戸等へ\n⑤洋式便器\n⑥付帯工事\n⑦スロープ等', 8),
        'J5': ('改修の種類\n①手すり\n②段差解消\n③滑り防止\n④引き戸等へ\n⑤洋式便器\n⑥付帯工事\n⑦スロープ等', 8),
        'D5': ('※部材・仕様・・（規格）を記入\n※付属品等など（付）記入\n※材料費（材）・施工費（手）を記入', 11),
    }
    for ref, (text, size) in heads.items():
        c = uw.getCellRangeByName(ref)
        c.setString(text)
        c.HoriJustify = H_LEFT0
        c.VertJustify = V_CENTER
        c.IsTextWrapped = True
        c.CharHeight = size
    # 施工業者名（K3:M3 の見出し）は K3:N3 の1つの欄にして、2行目（下線のすぐ上）にアプリが会社・営業所を書けるようにする
    k3 = uw.getCellRangeByName('K3:M3')
    k3.merge(False)
    k3n = uw.getCellRangeByName('K3:N3')
    k3n.merge(True)
    k3n.IsTextWrapped = True
    from com.sun.star.table.CellHoriJustify import LEFT as H_LEFT
    from com.sun.star.table.CellVertJustify import BOTTOM as V_BOTTOM
    k3n.HoriJustify = H_LEFT
    k3n.VertJustify = V_BOTTOM
    k3n.CharHeight = 10
    # 表の外（A列・1行目・O列から右）の書式（原本は白の塗りが IW 列まである）を消す。アプリのプレビューは書式のある欄までを1枚にするので、
    # 残すと用紙がとても横長になる（字が見えないほど小さく出た）
    for area in (f'A1:A{UW_LAST}', 'B1:N1', f'O1:AMJ{UW_LAST + 10}', f'A{UW_LAST + 1}:N{UW_LAST + 10}'):
        uw.getCellRangeByName(area).clearContents(1023)
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
    # 内訳書：A4 横・72%（原本と同じ。1ページに見出し＋15行）。見出し（2〜5行）を各ページの上にくり返す
    if not styles.hasByName('IZuchiwake'):
        styles.insertByName('IZuchiwake', doc.createInstance('com.sun.star.style.PageStyle'))
    st = styles.getByName('IZuchiwake')
    st.Width, st.Height, st.IsLandscape = 29700, 21000, True
    st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin = 1000, 1000, 1200, 1200
    st.HeaderIsOn = False
    st.FooterIsOn = False
    st.CenterHorizontally = True
    st.ScaleToPagesX, st.ScaleToPagesY = 0, 0
    st.PageScale = 72
    uw = sheets.getByName('内訳書')
    uw.PageStyle = 'IZuchiwake'
    rr = uw.getCellRangeByName(f'B2:N{UW_LAST}').RangeAddress
    a = CellRangeAddress()
    a.Sheet, a.StartColumn, a.StartRow, a.EndColumn, a.EndRow = rr.Sheet, rr.StartColumn, rr.StartRow, rr.EndColumn, rr.EndRow
    uw.setPrintAreas((a,))
    t = CellRangeAddress()
    t.Sheet, t.StartColumn, t.StartRow, t.EndColumn, t.EndRow = rr.Sheet, 0, 1, 0, 4
    uw.setTitleRows(t)
    uw.setPrintTitleRows(True)

    order = ['事前承認願書', '承諾書', '内訳書', '平面図', *PRE, '支給申請書', *POST, '請求書']
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
