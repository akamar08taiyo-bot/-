# ある原本（xlsx・xltx）のシートを、別の原本の同じ名前のシートと入れかえる（2026-10-27、特定福祉用具の申請書の「委任状」を住宅改修の苅田町・行橋市の原本へ。
# ユーザーの指示「住宅改修の申請書の中にも、特定福祉用具と全く同じ委任状をいれて」）。
# 使う書式（フォント・塗り・罫線・セルの書式）は入れる先の styles.xml の末尾に足し（同じものがあればそれを使う）、共有の文字は sharedStrings.xml の末尾に足して、番号をつけ直す。
# 入れる先のテーマの字体がちがえば（苅田町の住宅改修の原本はテーマが ＭＳ Ｐゴシック）、テーマの字（scheme minor）をやめて名前の字体にする。
# ほかの部品はそのまま（zip の中の順番・圧縮のしかたも。シートの rels・印刷の設定も入れる先のまま）。図形・画像・条件付き書式・数値の書式（numFmtId≠0）のあるシートには使えない（止まる）。
# usage: python3 -I copy-sheet.py <元の原本> <入れる先の原本> <出力> [シートの名前（既定 委任状）]
import re
import sys
import zipfile

src_path, dst_path, out_path = sys.argv[1:4]
NAME = sys.argv[4] if len(sys.argv) > 4 else '委任状'
src = zipfile.ZipFile(src_path)
dst = zipfile.ZipFile(dst_path)


def sheet_path(z, name):
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    rid = re.search(r'<sheet name="%s" sheetId="\d+" r:id="(rId\d+)"' % re.escape(name), wb).group(1)
    for rel in re.findall(r'<Relationship [^>]*/>', rels):
        if 'Id="%s"' % rid in rel:
            target = re.search(r'Target="([^"]+)"', rel).group(1)
            return 'xl/' + target.lstrip('/').replace('xl/', '', 1)
    raise SystemExit('no sheet ' + name)


def items(xml, tag):
    """<fonts>…</fonts> の中の1つずつの要素（文字のまま）"""
    body = re.search(r'<%s\b[^>]*>(.*?)</%s>' % (tag + 's', tag + 's'), xml, re.S).group(1)
    return re.findall(r'<%s\b[^>]*/>|<%s\b[^>]*>.*?</%s>' % (tag, tag, tag), body, re.S)


def append(xml, tag, new):
    """styles.xml の <fonts count> の末尾に足す（count も直す）"""
    if not new:
        return xml
    def repl(m):
        open_tag, body = m.group(1), m.group(2)
        n = len(re.findall(r'<%s\b' % tag, body)) + len(new)
        open_tag = re.sub(r'count="\d+"', 'count="%d"' % n, open_tag)
        return open_tag + body + ''.join(new) + '</%ss>' % tag
    return re.sub(r'(<%ss\b[^>]*>)(.*?)</%ss>' % (tag, tag), repl, xml, count=1, flags=re.S)


s_styles = src.read('xl/styles.xml').decode()
d_styles = dst.read('xl/styles.xml').decode()
d_theme = dst.read([n for n in dst.namelist() if n.startswith('xl/theme/') and n.endswith('.xml')][0]).decode()
s_theme = src.read([n for n in src.namelist() if n.startswith('xl/theme/') and n.endswith('.xml')][0]).decode()
minor = lambda t: re.search(r'<a:minorFont>.*?<a:font script="Jpan" typeface="([^"]*)"', t, re.S).group(1)
same_theme = minor(s_theme) == minor(d_theme)

s_sheet_path = sheet_path(src, NAME)
d_sheet_path = sheet_path(dst, NAME)
for z, p in ((src, s_sheet_path),):
    rels = p.replace('worksheets/', 'worksheets/_rels/') + '.rels'
    if rels in z.namelist() and re.search(r'/(drawing|vmlDrawing|table|comments)', z.read(rels).decode()):
        raise SystemExit('図形・表・コメントのあるシートは入れかえられません')
sheet = src.read(s_sheet_path).decode()

s_fonts, s_fills, s_borders = items(s_styles, 'font'), items(s_styles, 'fill'), items(s_styles, 'border')
# cellXfs だけの xf（cellStyleXfs の xf は除く）
s_cell_xfs = re.findall(r'<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>', re.search(r'<cellXfs\b[^>]*>(.*?)</cellXfs>', s_styles, re.S).group(1), re.S)
d_fonts, d_fills, d_borders = items(d_styles, 'font'), items(d_styles, 'fill'), items(d_styles, 'border')
d_cell_xfs = re.findall(r'<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>', re.search(r'<cellXfs\b[^>]*>(.*?)</cellXfs>', d_styles, re.S).group(1), re.S)

new = {'font': [], 'fill': [], 'border': [], 'xf': []}


def place(kind, xml, have):
    """同じものがあればその番号、なければ足して番号を返す"""
    if xml in have:
        return have.index(xml)
    if xml in new[kind]:
        return len(have) + new[kind].index(xml)
    new[kind].append(xml)
    return len(have) + len(new[kind]) - 1


used = sorted(set(int(s) for s in re.findall(r'\ss="(\d+)"', sheet)) | set(int(s) for s in re.findall(r'\sstyle="(\d+)"', sheet)))
xf_map = {}
for i in used:
    xf = s_cell_xfs[i]
    f = int(re.search(r'fontId="(\d+)"', xf).group(1))
    fl = int(re.search(r'fillId="(\d+)"', xf).group(1))
    b = int(re.search(r'borderId="(\d+)"', xf).group(1))
    assert re.search(r'numFmtId="0"', xf), xf  # 数値の書式はまだ移さない
    font = s_fonts[f]
    # テーマの字（scheme minor）は、テーマの字体がちがう原本では名前の字体にする（苅田町の住宅改修の原本はテーマが ＭＳ Ｐゴシック）
    if not same_theme:
        font = re.sub(r'<scheme val="minor"/>', '', font)
    nf = place('font', font, d_fonts)
    nfl = place('fill', s_fills[fl], d_fills)
    nb = place('border', s_borders[b], d_borders)
    x = re.sub(r'fontId="\d+"', 'fontId="%d"' % nf, xf)
    x = re.sub(r'fillId="\d+"', 'fillId="%d"' % nfl, x)
    x = re.sub(r'borderId="\d+"', 'borderId="%d"' % nb, x)
    if f != 0 or not same_theme:
        x = x if 'applyFont="1"' in x else x.replace('<xf ', '<xf applyFont="1" ', 1)
    xf_map[i] = place('xf', x, d_cell_xfs)

d_styles = append(d_styles, 'font', new['font'])
d_styles = append(d_styles, 'fill', new['fill'])
d_styles = append(d_styles, 'border', new['border'])
d_styles = re.sub(
    r'(<cellXfs\b[^>]*>)(.*?)</cellXfs>',
    lambda m: re.sub(r'count="\d+"', 'count="%d"' % (len(d_cell_xfs) + len(new['xf'])), m.group(1)) + m.group(2) + ''.join(new['xf']) + '</cellXfs>',
    d_styles,
    count=1,
    flags=re.S,
)

# 共有の文字：使うものを住宅改修の sharedStrings.xml の末尾に足す
s_sst = src.read('xl/sharedStrings.xml').decode()
d_sst = dst.read('xl/sharedStrings.xml').decode()
s_si = re.findall(r'<si>.*?</si>', s_sst, re.S)
d_si = re.findall(r'<si>.*?</si>', d_sst, re.S)
add_si = []
si_map = {}


def remap_cell(m):
    tag, body = m.group(1), m.group(2)
    tag = re.sub(r'\ss="(\d+)"', lambda k: ' s="%d"' % xf_map[int(k.group(1))], tag)
    if re.search(r'\st="s"', tag):
        def v(k):
            old = int(k.group(1))
            if old not in si_map:
                add_si.append(s_si[old])
                si_map[old] = len(d_si) + len(add_si) - 1
            return '<v>%d</v>' % si_map[old]
        body = re.sub(r'<v>(\d+)</v>', v, body)
    return tag + body


sheet = re.sub(r'(<c\b[^>]*?)(/>|>.*?</c>)', remap_cell, sheet, flags=re.S)
sheet = re.sub(r'(<(?:row|col)\b[^>]*?\s(?:s|style)=")(\d+)(")', lambda m: m.group(1) + str(xf_map[int(m.group(2))]) + m.group(3), sheet)
sheet = re.sub(r'\stabSelected="1"', '', sheet)  # 住宅改修の原本で選ばれているシートはそのまま
total = len(re.findall(r'<c\b[^>]*\st="s"', b''.join(dst.read(n) for n in dst.namelist() if n.startswith('xl/worksheets/sheet') and n != d_sheet_path).decode())) + len(re.findall(r'<c\b[^>]*\st="s"', sheet))
d_sst = re.sub(r'</sst>\s*$', ''.join(add_si) + '</sst>', d_sst)
d_sst = re.sub(r'(<sst\b[^>]*?)\scount="\d+"', lambda m: m.group(1) + ' count="%d"' % total, d_sst, count=1)
d_sst = re.sub(r'(<sst\b[^>]*?)\suniqueCount="\d+"', lambda m: m.group(1) + ' uniqueCount="%d"' % (len(d_si) + len(add_si)), d_sst, count=1)

out = zipfile.ZipFile(out_path, 'w')
for info in dst.infolist():
    data = dst.read(info.filename)
    if info.filename == 'xl/styles.xml':
        data = d_styles.encode()
    elif info.filename == 'xl/sharedStrings.xml':
        data = d_sst.encode()
    elif info.filename == d_sheet_path:
        data = sheet.encode()
    out.writestr(info, data, compress_type=info.compress_type)
out.close()
print(out_path, 'sheet', d_sheet_path, '<-', s_sheet_path, 'xf', len(new['xf']), 'font', len(new['font']), 'fill', len(new['fill']), 'border', len(new['border']), 'strings', len(add_si), 'same_theme', same_theme)
