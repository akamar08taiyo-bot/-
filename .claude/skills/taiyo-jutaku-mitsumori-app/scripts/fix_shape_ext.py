# 原本（.xltx・.xlsx）の図形の大きさ（a:ext の cx・cy）が数でないもの（pdf_form_xlsx.py の前の版で cy="left" などになった）を、
# 図形の置き場所（twoCellAnchor の from・to と、列の幅・行の高さ）から計算した大きさに直す（ほかはそのまま）。
# 2026-10-29 に北九州市の原本（住宅改修の kitakyushu.xltx・特定福祉用具の kitakyushu.xlsx）で見つけた。XSD の検査（validate.py）で INVALID になり、
# 本物の Excel では「修復」になるおそれがあった。
# usage: python3 -I fix_shape_ext.py <原本> <出力>
import posixpath
import re
import sys
import zipfile

EMU_PT = 12700
src, dst = sys.argv[1:3]
z = zipfile.ZipFile(src)
files = {n: z.read(n) for n in z.namelist()}


def sheet_of_drawing(drawing):
    """drawing を使うシートの XML"""
    for p, data in files.items():
        if not re.match(r'xl/worksheets/_rels/sheet\d+\.xml\.rels$', p):
            continue
        for t in re.findall(r'Target="([^"]+)"', data.decode()):
            if posixpath.normpath(posixpath.join('xl/worksheets', t)) == drawing:
                return files[p.replace('_rels/', '').removesuffix('.rels')].decode()
    raise KeyError(drawing)


def row_heights(xml):
    fmt = re.search(r'<sheetFormatPr\b[^>]*/>', xml)
    default_ht = float(re.search(r'defaultRowHeight="([\d.]+)"', fmt.group(0)).group(1)) if fmt else 15.0
    heights = {int(r): float(h) for r, h in re.findall(r'<row\b[^>]*\br="(\d+)"[^>]*\bht="([\d.]+)"', xml)}
    return lambda row: heights.get(row + 1, default_ht) * EMU_PT


fixed = 0
for p in list(files):
    if not re.match(r'xl/drawings/drawing\d+\.xml$', p):
        continue
    xml = files[p].decode()
    if not re.search(r'<a:ext cx="[^"\d][^"]*"|<a:ext cx="[^"]*" cy="[^"\d][^"]*"', xml):
        continue
    row_h = row_heights(sheet_of_drawing(p))

    def fix(m):
        global fixed
        anchor = m.group(0)
        fr, fro = map(int, re.search(r'<xdr:from>.*?<xdr:row>(\d+)</xdr:row><xdr:rowOff>(\d+)</xdr:rowOff>', anchor).groups())
        tr, tro = map(int, re.search(r'<xdr:to>.*?<xdr:row>(\d+)</xdr:row><xdr:rowOff>(\d+)</xdr:rowOff>', anchor).groups())
        cy = round(sum(row_h(r) for r in range(fr, tr)) - fro + tro)
        out, n = re.subn(r'(<a:ext cx="\d+") cy="[^"\d][^"]*"', lambda e: f'{e.group(1)} cy="{max(cy, 1)}"', anchor)
        fixed += n
        return out

    xml = re.sub(r'<xdr:twoCellAnchor\b.*?</xdr:twoCellAnchor>', fix, xml, flags=re.S)
    assert not re.search(r'<a:ext [^>]*c[xy]="[^"\d]', xml), p
    files[p] = xml.encode()
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as out:
    for info in z.infolist():
        out.writestr(info, files[info.filename])
print('fixed', fixed)
