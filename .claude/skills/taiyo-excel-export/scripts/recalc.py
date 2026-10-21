# LibreOffice で式を計算し直し、ファイルに入れたキャッシュ値（開いた時点に見える値＝印刷・PDF と同じ値）と一致するか確かめる。
# usage: python3 recalc.py <xlsx>...   → 「checked N formulas, mismatches: 0」なら合格（ずれがあれば終わりのコード 1、LibreOffice が動かなければ 2）
# 要るもの：LibreOffice（soffice）と、その Python の uno（システムの python3 で import uno できること）、openpyxl（pip install openpyxl）。
# ほかに動いている LibreOffice とぶつからないように、使い捨ての設定フォルダと、環境変数 RECALC_PORT（既定 2099）の番号で起動して、終わったら止める
import sys, time, subprocess, os, shutil, tempfile
try:
    import uno, openpyxl
    from com.sun.star.beans import PropertyValue
except ImportError as e:
    sys.exit(f'要るものが無い：{e}（LibreOffice の python3-uno と openpyxl）')

def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

port = os.environ.get('RECALC_PORT', '2099')
profile = tempfile.mkdtemp(prefix='recalc-lo-')
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', f'-env:UserInstallation=file://{profile}',
                         f'--accept=socket,host=127.0.0.1,port={port};urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ctx = None
for _ in range(90):
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
        ctx = resolver.resolve(f'uno:socket,host=127.0.0.1,port={port};urp;StarOffice.ComponentContext'); break
    except Exception:
        time.sleep(0.5)
if ctx is None:
    proc.kill(); shutil.rmtree(profile, ignore_errors=True)
    sys.exit(f'LibreOffice（soffice）に {port} 番でつながらない。soffice が入っているか、ほかの soffice が同じ番号を使っていないか見る（RECALC_PORT で変えられる）')
desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
bad = 0; checked = 0
try:
    for path in sys.argv[1:]:
        cached = openpyxl.load_workbook(path, data_only=True)
        formulas = openpyxl.load_workbook(path)
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(path)), '_blank', 0, (prop('Hidden', True),))
        doc.calculateAll()
        for si, ws in enumerate(formulas.worksheets):
            sh = doc.Sheets.getByIndex(si)
            for row in ws.iter_rows():
                for c in row:
                    if isinstance(c.value, str) and c.value.startswith('='):
                        checked += 1
                        cell = sh.getCellByPosition(c.column - 1, c.row - 1)
                        want = cached.worksheets[si].cell(c.row, c.column).value
                        got = cell.getValue() if cell.getType().value == 'FORMULA' and cell.FormulaResultType2 == 1 else cell.getString()
                        if isinstance(want, (int, float)):
                            if not isinstance(got, (int, float)) or abs(got - want) > 1e-6 * max(1, abs(want)):
                                bad += 1; print('MISMATCH', os.path.basename(path), c.coordinate, c.value[:80], 'cached', want, 'LO', got)
                        elif str(got) != str(want):
                            bad += 1; print('MISMATCH', os.path.basename(path), c.coordinate, c.value[:80], 'cached', repr(want), 'LO', repr(got))
        doc.close(True)
finally:
    try:
        desktop.terminate()
    except Exception:
        pass
    try:
        proc.wait(timeout=30)
    except Exception:
        proc.kill()
    shutil.rmtree(profile, ignore_errors=True)
print(f'checked {checked} formulas, mismatches: {bad}')
sys.exit(1 if bad else 0)
