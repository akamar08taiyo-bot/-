# 福岡市の住宅改修の原本（アプリに入れる .xltx）を、いただいた様式から LibreOffice で作る：
#   様式第21号（介護保険住宅改修費支給申請書）＋ 様式第22号の2（完了届出書【受領委任払用】。記載例のシートは入れない）
#   ＋ 平面図（苅田町の原本の「平面図  (2)」）＋ 写真貼付台紙（事前）・（完了）を5枚ずつ（1枚に写真番号2つ＝①〜⑩）。
# 写真貼付台紙の「改修の場所」のチェックボックス（フォームのコントロール）は外して、見出しの前に □ を書く（アプリで■にする）。
# usage: python3 make_fukuoka_jutaku.py <21号.xlsx> <22号の2.xlsx> <写真貼付台紙.xls> <苅田町.xltx> <出力.xltx>
import os
import subprocess
import sys
import tempfile
import time

import uno
from com.sun.star.beans import PropertyValue

app21, app22, photo_xls, kanda, out = [os.path.abspath(p) for p in sys.argv[1:6]]
PORT = 2107
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

try:
    doc = load(app21)
    sheets = doc.Sheets

    def bring(path, name, new_name, pos):
        src = load(path)
        sheets.importSheet(src, name, pos)
        src.close(True)
        imported = sheets.getByIndex(pos)
        imported.Name = new_name
        return imported

    done = bring(app22, '完了届出書（受領委任用)', '完了届出書（受領委任用)', 1)
    # 被保険者番号の P8〜R8 に入っていた 0 は消す（番号はアプリが10マスに書く。記載例も 0 ではない）
    for ref in ('P8', 'Q8', 'R8'):
        done.getCellRangeByName(ref).String = ''
    bring(kanda, '平面図  (2)', '平面図', 2)
    pre = bring(photo_xls, '写真貼付台紙（事前）', '写真貼付台紙（事前）', 3)
    post = bring(photo_xls, '写真貼付台紙 (完了)', '写真貼付台紙（完了）', 4)

    # 「改修の場所」：チェックボックス（コントロール）を外し、見出しの前に □（コントロールのあった所のすき間を1つ □ に）
    LABELS = {'D': None, 'G': None, 'J': None, 'N': None}

    def boxes(sheet):
        dp = sheet.DrawPage
        for i in range(dp.Count - 1, -1, -1):
            dp.remove(dp.getByIndex(i))
        for top in (6, 23):
            for ref in [f'D{top}', f'G{top}', f'J{top}', f'N{top}', f'D{top + 1}', f'F{top + 1}']:
                cell = sheet.getCellRangeByName(ref)
                text = cell.String
                if not text or text.lstrip('　 ').startswith('□'):
                    continue
                body = text.lstrip('　 ')
                lead = len(text) - len(body)
                cell.String = ('　' * max(0, lead - 1)) + '□' + body

    boxes(pre)
    boxes(post)
    # メモの欄（写真に書く内容をアプリが書く）：上から・折り返して
    for ref in ('B12', 'B29'):
        for sh in (pre, post):
            cell = sh.getCellRangeByName(ref)
            cell.IsTextWrapped = True
            cell.VertJustify = 1  # 上

    # 印刷の設定：シートを持ってくると原本の用紙の設定（余白・倍率）が外れ、ヘッダー・フッター（シート名・ページ）が付くので、
    # 原本の余白（mm）で A4 縦・1ページに合わせる・ヘッダー／フッターなしにする。印刷範囲も原本のとおり
    from com.sun.star.table import CellRangeAddress
    styles = doc.StyleFamilies.getByName('PageStyles')

    def page(sheet, name, margins, area, center=False):
        if not styles.hasByName(name):
            st = doc.createInstance('com.sun.star.style.PageStyle')
            styles.insertByName(name, st)
        st = styles.getByName(name)
        st.Width, st.Height, st.IsLandscape = 21000, 29700, False
        st.LeftMargin, st.RightMargin, st.TopMargin, st.BottomMargin = margins
        st.HeaderIsOn = False
        st.FooterIsOn = False
        st.CenterHorizontally = center
        st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
        sheet.PageStyle = name
        if area:
            r = sheet.getCellRangeByName(area).RangeAddress
            a = CellRangeAddress()
            a.Sheet, a.StartColumn, a.StartRow, a.EndColumn, a.EndRow = r.Sheet, r.StartColumn, r.StartRow, r.EndColumn, r.EndRow
            sheet.setPrintAreas((a,))

    page(sheets.getByName('完了届出書（受領委任用)'), 'FK22', (1700, 600, 700, 500), 'B1:AB46')
    page(sheets.getByName('平面図'), 'FKplan', (1500, 1500, 2000, 2000), None, True)
    page(pre, 'FKphoto', (500, 500, 1000, 1000), 'B1:Q38', True)
    page(post, 'FKphoto', (500, 500, 1000, 1000), 'B1:Q38', True)
    # 5枚ずつに増やし、写真番号（B9・B26）に ①②…⑩
    names = {'事前': ['写真貼付台紙（事前）'], '完了': ['写真貼付台紙（完了）']}
    for kind in ('事前', '完了'):
        base = names[kind][0]
        for n in range(2, 6):
            new = f'{base} ({n})'
            pos = sheets.ElementNames.index(names[kind][-1]) + 1
            sheets.copyByName(names[kind][-1], new, pos)
            names[kind].append(new)
        for k, name in enumerate(names[kind]):
            sh = sheets.getByName(name)
            sh.getCellRangeByName('B9').String = chr(0x2460 + 2 * k)
            sh.getCellRangeByName('B26').String = chr(0x2460 + 2 * k + 1)
    # 事前の5枚のあとに完了の5枚
    order = ['様式第21号', '完了届出書（受領委任用)', '平面図', *names['事前'], *names['完了']]
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
