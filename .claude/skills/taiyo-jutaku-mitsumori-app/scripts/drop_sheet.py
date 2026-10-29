# 原本（.xltx・.xlsx）から名前のシートを外す（ほかのシートの中身・欄の番地はそのまま）。
# ユーザーの指示「北九州市、福岡市など、住宅改修の要項をみて、もし平面図がいらない場合は、申請書一式の中から外す」2026-10-29 で、
# 北九州市の原本の「平面図」を外すために作った。シートのファイルと、そのシートだけが使う rels・図形（drawing）、[Content_Types].xml の項目、
# 印刷範囲などの定義名（localSheetId は外したシートより後ろを1つ前に）、docProps/app.xml のシートの名前の一覧を直す。
# usage: python3 -I drop_sheet.py <原本> <出力> <シート名> [<シート名> ...]
import posixpath
import re
import sys
import zipfile

src, dst, *drop = sys.argv[1:]
z = zipfile.ZipFile(src)
files = {n: z.read(n) for n in z.namelist()}
infos = {i.filename: i for i in z.infolist()}


def rels_of(part):
    d, b = posixpath.split(part)
    return posixpath.join(d, '_rels', b + '.rels')


def targets(part):
    """part の rels が指すファイル（相対の Target をパスに）"""
    r = rels_of(part)
    if r not in files:
        return []
    base = posixpath.dirname(part)
    out = []
    for t, mode in re.findall(r'Target="([^"]+)"(?:\s+TargetMode="([^"]+)")?', files[r].decode()):
        if mode == 'External':
            continue
        out.append(t.lstrip('/') if t.startswith('/') else posixpath.normpath(posixpath.join(base, t)))
    return out


wb = files['xl/workbook.xml'].decode()
wbrels = files['xl/_rels/workbook.xml.rels'].decode()
sheets = re.findall(r'<sheet\b[^>]*/>', wb)
names = [re.search(r'name="([^"]+)"', s).group(1) for s in sheets]
for name in drop:
    assert name in names, (name, names)
removed = set()
for name in drop:
    sheets = re.findall(r'<sheet\b[^>]*/>', wb)
    names = [re.search(r'name="([^"]+)"', s).group(1) for s in sheets]
    idx = names.index(name)
    tag = sheets[idx]
    rid = re.search(r'r:id="([^"]+)"', tag).group(1)
    rel = re.search(r'<Relationship\b[^>]*Id="%s"[^>]*/>' % rid, wbrels).group(0)
    part = 'xl/' + re.search(r'Target="([^"]+)"', rel).group(1).lstrip('/').removeprefix('xl/')
    # シートと、そのシートの rels が指すもの（図形・画像）のうち、ほかから使われていないもの
    gone = {part, rels_of(part)}
    todo = targets(part)
    while todo:
        t = todo.pop()
        if t in gone or t not in files:
            continue
        users = [p for p in files if p.endswith('.rels') and p not in gone and t in targets(p.replace('_rels/', '').removesuffix('.rels'))]
        if users:
            continue
        gone |= {t, rels_of(t)}
        todo += targets(t)
    removed |= gone
    wb = wb.replace(tag, '')
    wbrels = wbrels.replace(rel, '')

    # 定義名：そのシートのものは消し、後ろのシートの localSheetId を1つ前に
    def fix(m):
        lid = int(m.group(2))
        if lid == idx:
            return ''
        return m.group(0).replace(f'localSheetId="{lid}"', f'localSheetId="{lid - 1}"') if lid > idx else m.group(0)

    wb = re.sub(r'<definedName\b([^>]*?)localSheetId="(\d+)"[^>]*>.*?</definedName>', fix, wb)
    # ほかのシートを指す式に名前が出ていないか（出ていたら外せない）
    for p, data in files.items():
        if p.startswith('xl/worksheets/') and p.endswith('.xml') and p not in gone:
            assert f"'{name}'!" not in data.decode('utf-8', 'ignore') and f'{name}!' not in data.decode('utf-8', 'ignore'), (p, name)
wb = wb.replace('<definedNames></definedNames>', '')
# 選んでいるシート（activeTab）・最初に見せるシートが範囲の外にならないように
count = len(re.findall(r'<sheet\b[^>]*/>', wb))
wb = re.sub(r'(activeTab|firstSheet)="(\d+)"', lambda m: f'{m.group(1)}="{min(int(m.group(2)), count - 1)}"', wb)
files['xl/workbook.xml'] = wb.encode()
files['xl/_rels/workbook.xml.rels'] = wbrels.encode()
ct = files['[Content_Types].xml'].decode()
for p in removed:
    ct = re.sub(r'<Override PartName="/%s"[^>]*/>' % re.escape(p), '', ct)
files['[Content_Types].xml'] = ct.encode()
# docProps/app.xml：シートの名前の一覧（Excel が書いたものだけ。openpyxl は書かない）
if 'docProps/app.xml' in files:
    app = files['docProps/app.xml'].decode()
    for name in drop:
        m = re.search(r'<vt:lpstr>%s</vt:lpstr>' % re.escape(name), app)
        if not m:
            continue
        app = app.replace(m.group(0), '', 1)
        app = re.sub(r'(<TitlesOfParts>\s*<vt:vector size=")(\d+)', lambda x: f'{x.group(1)}{int(x.group(2)) - 1}', app)
        app = re.sub(r'(<vt:lpstr>ワークシート</vt:lpstr>\s*</vt:variant>\s*<vt:variant>\s*<vt:i4>)(\d+)', lambda x: f'{x.group(1)}{int(x.group(2)) - 1}', app)
    files['docProps/app.xml'] = app.encode()
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as out:
    for n in z.namelist():
        if n not in removed:
            out.writestr(infos[n], files[n])
print('removed', sorted(removed))
