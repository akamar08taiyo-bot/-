# ある原本（xlsx・xltx）のシートを、別の原本に新しいシートとして足す（2026-11-12。ユーザーがくださったみやこ町の委任状・行橋市の請求書・福岡市の承諾書を、
# 手で整えた住宅改修の原本 miyako.xltx・yukuhashi.xltx・fukuoka.xltx に足すために作った）。
# 入れる先の原本は LibreOffice で開き直さない（開き直すと図形・書式・共有の文字の番号が変わり、アプリの欄の番地や丸の位置がずれる恐れがある）。
# copy-sheet.py（同じ名前のシートの入れかえ）と同じやり方で、使う書式（フォント・塗り・罫線・数値の書式・セルの書式）は入れる先の styles.xml の末尾に足し
# （同じものがあればそれを使う）、共有の文字は sharedStrings.xml の末尾に足す。ほかの部品はそのまま（zip の中の順番・圧縮のしかたも）。
# 足すもの：シートのファイル（xl/worksheets/sheetN.xml）・workbook.xml の <sheet>・workbook.xml.rels・[Content_Types].xml・docProps/app.xml のシートの名前、
# 元のシートの印刷範囲・印刷タイトル（定義名。localSheetId は足した位置より後ろを1つうしろに）。
# 元のシートの rels のうち、図形（drawing。pdf_form_xlsx.py が欄に入らない字をテキストボックスにする）は写し、プリンターの設定は持ってこない。
# 画像の入った図形・表・コメントのあるシートには使えない（止まる）。
# usage: python3 -I add-sheet.py <元の原本> <入れる先の原本> <出力> <元のシート名> <新しいシート名> [<このシートのうしろに入れる>]
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape

src_path, dst_path, out_path, SRC_NAME, NEW_NAME = sys.argv[1:6]
AFTER = sys.argv[6] if len(sys.argv) > 6 else None
src = zipfile.ZipFile(src_path)
dst = zipfile.ZipFile(dst_path)


def sheet_entries(z):
    """[(名前, r:id, 場所)]（workbook.xml の順）"""
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    out = []
    for m in re.finditer(r'<sheet\b[^>]*/>', wb):
        tag = m.group(0)
        name = re.search(r'\sname="([^"]*)"', tag).group(1)
        rid = re.search(r'\sr:id="([^"]+)"', tag).group(1)
        rel = next(r for r in re.findall(r'<Relationship\b[^>]*/>', rels) if re.search(r'\sId="%s"' % re.escape(rid), r))
        target = re.search(r'Target="([^"]+)"', rel).group(1)
        out.append((name, rid, 'xl/' + target.lstrip('/').replace('xl/', '', 1)))
    return out


def unesc(s):
    return s.replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&apos;', "'").replace('&amp;', '&')


def items(xml, tag):
    m = re.search(r'<%s\b[^>]*>(.*?)</%s>' % (tag + 's', tag + 's'), xml, re.S)
    if not m:
        return []
    return re.findall(r'<%s\b[^>]*/>|<%s\b[^>]*>.*?</%s>' % (tag, tag, tag), m.group(1), re.S)


def append(xml, tag, new):
    """styles.xml の <fonts count> の末尾に足す（count も直す）"""
    if not new:
        return xml
    if not re.search(r'<%ss\b' % tag, xml):
        raise SystemExit('styles.xml に <%ss> がない' % tag)

    def repl(m):
        open_tag, body = m.group(1), m.group(2)
        n = len(re.findall(r'<%s\b' % tag, body)) + len(new)
        open_tag = re.sub(r'count="\d+"', 'count="%d"' % n, open_tag)
        return open_tag + body + ''.join(new) + '</%ss>' % tag
    return re.sub(r'(<%ss\b[^>]*>)(.*?)</%ss>' % (tag, tag), repl, xml, count=1, flags=re.S)


src_entries = sheet_entries(src)
dst_entries = sheet_entries(dst)
if any(n == NEW_NAME for n, _, _ in dst_entries):
    raise SystemExit('入れる先にもう「%s」がある' % NEW_NAME)
s_index = next(i for i, (n, _, _) in enumerate(src_entries) if unesc(n) == SRC_NAME)
s_sheet_path = src_entries[s_index][2]
s_rels = re.sub(r'([^/]+)$', r'_rels/\1.rels', s_sheet_path)
drawing = None  # (シートの中の r:id, 元の図形の場所)
if s_rels in src.namelist():
    rels_xml = src.read(s_rels).decode()
    if re.search(r'/(vmlDrawing|table|comments)"', rels_xml):
        raise SystemExit('表・コメントのあるシートは足せません')
    m = re.search(r'<Relationship\b[^>]*Type="[^"]*/drawing"[^>]*/>', rels_xml)
    if m:
        rid_d = re.search(r'\sId="([^"]+)"', m.group(0)).group(1)
        target = re.search(r'Target="([^"]+)"', m.group(0)).group(1)
        d_part = os.path.normpath(os.path.join(os.path.dirname(s_sheet_path), target)).replace(os.sep, '/')
        d_rels = re.sub(r'([^/]+)$', r'_rels/\1.rels', d_part)
        if d_rels in src.namelist():
            raise SystemExit('画像の入った図形のあるシートは足せません')
        drawing = (rid_d, d_part)
sheet = src.read(s_sheet_path).decode()
# openpyxl（pdf_form_xlsx.py）は文字を「&#27096;」のような番号で書く → そのままの字に（ほかの原本と同じ書き方。アプリは番号の字を読まない）
num_ref = lambda t: re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))) if int(m.group(1)) > 127 else m.group(0), t)
sheet = num_ref(sheet)
if re.search(r'<(conditionalFormatting|dataValidations|hyperlinks)\b', sheet):
    raise SystemExit('条件付き書式・入力規則・ハイパーリンクのあるシートは足せません')

s_styles = src.read('xl/styles.xml').decode()
d_styles = dst.read('xl/styles.xml').decode()
theme = lambda z: z.read([n for n in z.namelist() if n.startswith('xl/theme/') and n.endswith('.xml')][0]).decode()
minor = lambda t: (re.search(r'<a:minorFont>.*?<a:font script="Jpan" typeface="([^"]*)"', t, re.S) or [None, ''])[1]
same_theme = minor(theme(src)) == minor(theme(dst))

s_fonts, s_fills, s_borders = items(s_styles, 'font'), items(s_styles, 'fill'), items(s_styles, 'border')
s_cell_xfs = re.findall(r'<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>', re.search(r'<cellXfs\b[^>]*>(.*?)</cellXfs>', s_styles, re.S).group(1), re.S)
d_fonts, d_fills, d_borders = items(d_styles, 'font'), items(d_styles, 'fill'), items(d_styles, 'border')
d_cell_xfs = re.findall(r'<xf\b[^>]*/>|<xf\b[^>]*>.*?</xf>', re.search(r'<cellXfs\b[^>]*>(.*?)</cellXfs>', d_styles, re.S).group(1), re.S)
s_numfmts = {int(i): unesc(c) for i, c in re.findall(r'<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"', s_styles)}
d_numfmts = {int(i): unesc(c) for i, c in re.findall(r'<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"', d_styles)}
new = {'font': [], 'fill': [], 'border': [], 'xf': [], 'numFmt': []}


def place(kind, xml, have):
    """同じものがあればその番号、なければ足して番号を返す"""
    if xml in have:
        return have.index(xml)
    if xml in new[kind]:
        return len(have) + new[kind].index(xml)
    new[kind].append(xml)
    return len(have) + len(new[kind]) - 1


def numfmt(i):
    """数値の書式の番号：組み込み（164 より小さい）はそのまま、自分で決めた書式は入れる先の同じ書式か、新しい番号"""
    if i < 164:
        return i
    code = s_numfmts[i]
    for k, c in d_numfmts.items():
        if c == code:
            return k
    k = max([163, *d_numfmts.keys()]) + 1
    d_numfmts[k] = code
    new['numFmt'].append('<numFmt numFmtId="%d" formatCode="%s"/>' % (k, escape(code, {'"': '&quot;'})))
    return k


used = sorted(set(int(s) for s in re.findall(r'<c\b[^>]*\ss="(\d+)"', sheet)) | set(int(s) for s in re.findall(r'<(?:row|col)\b[^>]*\s(?:s|style)="(\d+)"', sheet)))
xf_map = {}
for i in used:
    xf = s_cell_xfs[i]
    f = int(re.search(r'fontId="(\d+)"', xf).group(1))
    fl = int(re.search(r'fillId="(\d+)"', xf).group(1))
    b = int(re.search(r'borderId="(\d+)"', xf).group(1))
    nf = int((re.search(r'numFmtId="(\d+)"', xf) or [None, '0'])[1])
    font = s_fonts[f]
    if not same_theme:
        font = re.sub(r'<scheme val="minor"/>', '', font)
    x = re.sub(r'fontId="\d+"', 'fontId="%d"' % place('font', font, d_fonts), xf)
    x = re.sub(r'fillId="\d+"', 'fillId="%d"' % place('fill', s_fills[fl], d_fills), x)
    x = re.sub(r'borderId="\d+"', 'borderId="%d"' % place('border', s_borders[b], d_borders), x)
    x = re.sub(r'numFmtId="\d+"', 'numFmtId="%d"' % numfmt(nf), x)
    x = re.sub(r'\sxfId="\d+"', ' xfId="0"', x)  # セルのスタイル（標準）は入れる先の標準
    if f != 0 or not same_theme:
        x = re.sub(r'\sapplyFont="[^"]*"', ' applyFont="1"', x) if re.search(r'\sapplyFont=', x) else x.replace('<xf ', '<xf applyFont="1" ', 1)
    xf_map[i] = place('xf', x, d_cell_xfs)

if new['numFmt']:
    if re.search(r'<numFmts\b', d_styles):
        d_styles = append(d_styles, 'numFmt', new['numFmt'])
    else:
        d_styles = d_styles.replace('<fonts', '<numFmts count="%d">%s</numFmts><fonts' % (len(new['numFmt']), ''.join(new['numFmt'])), 1)
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

# 共有の文字：使うものを入れる先の sharedStrings.xml の末尾に足す
s_sst = src.read('xl/sharedStrings.xml').decode() if 'xl/sharedStrings.xml' in src.namelist() else '<sst></sst>'
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
sheet = re.sub(r'\stabSelected="(?:1|true)"', '', sheet)
# プリンターの設定（rels）は持ってこない。図形（<drawing r:id>）の番号は残す
sheet = re.sub(r'(<(?!drawing\b)[^>]*?)\sr:id="[^"]*"', r'\1', sheet)
total = len(re.findall(r'<c\b[^>]*\st="s"', b''.join(dst.read(n) for n in dst.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)).decode())) + len(re.findall(r'<c\b[^>]*\st="s"', sheet))
d_sst = re.sub(r'</sst>\s*$', ''.join(add_si) + '</sst>', d_sst)
d_sst = re.sub(r'(<sst\b[^>]*?)\scount="\d+"', lambda m: m.group(1) + ' count="%d"' % total, d_sst, count=1)
d_sst = re.sub(r'(<sst\b[^>]*?)\suniqueCount="\d+"', lambda m: m.group(1) + ' uniqueCount="%d"' % (len(d_si) + len(add_si)), d_sst, count=1)

# 新しいシートの部品の名前・番号
n = max(int(re.search(r'sheet(\d+)\.xml$', p).group(1)) for _, _, p in dst_entries) + 1
part = 'xl/worksheets/sheet%d.xml' % n
d_wb = dst.read('xl/workbook.xml').decode()
d_rels = dst.read('xl/_rels/workbook.xml.rels').decode()
rid_n = max(int(x) for x in re.findall(r'\sId="rId(\d+)"', d_rels)) + 1
rid = 'rId%d' % rid_n
sheet_id = max(int(x) for x in re.findall(r'<sheet\b[^>]*\ssheetId="(\d+)"', d_wb)) + 1
pos = len(dst_entries) if AFTER is None else next(i for i, (nm, _, _) in enumerate(dst_entries) if unesc(nm) == AFTER) + 1
new_tag = '<sheet name="%s" sheetId="%d" r:id="%s"/>' % (escape(NEW_NAME, {'"': '&quot;'}), sheet_id, rid)
tags = re.findall(r'<sheet\b[^>]*/>', d_wb)
if pos < len(tags):
    d_wb = d_wb.replace(tags[pos], new_tag + tags[pos], 1)
else:
    d_wb = d_wb.replace(tags[-1], tags[-1] + new_tag, 1)
# 定義名：足した位置より後ろのシートの localSheetId を1つうしろに
d_wb = re.sub(r'(<definedName\b[^>]*\slocalSheetId=")(\d+)(")', lambda m: m.group(1) + str(int(m.group(2)) + (1 if int(m.group(2)) >= pos else 0)) + m.group(3), d_wb)
d_wb = re.sub(r'(<workbookView\b[^>]*\sactiveTab=")(\d+)(")', lambda m: m.group(1) + str(int(m.group(2)) + (1 if int(m.group(2)) >= pos else 0)) + m.group(3), d_wb)
d_wb = re.sub(r'(<workbookView\b[^>]*\sfirstSheet=")(\d+)(")', lambda m: m.group(1) + str(int(m.group(2)) + (1 if int(m.group(2)) >= pos else 0)) + m.group(3), d_wb)
# 元のシートの印刷範囲・印刷タイトル
s_wb = src.read('xl/workbook.xml').decode()
quoted = "'%s'" % NEW_NAME.replace("'", "''")
defs = []
for m in re.finditer(r'<definedName\b([^>]*)>(.*?)</definedName>', s_wb, re.S):
    attrs, body = m.group(1), m.group(2)
    if re.search(r'\slocalSheetId="%d"' % s_index, attrs) and re.search(r'name="_xlnm\.(Print_Area|Print_Titles)"', attrs):
        body = re.sub(r"(?:'[^']*(?:''[^']*)*'|[^'!,]+)!", lambda _: escape(quoted) + '!', unesc(body))
        defs.append('<definedName%s>%s</definedName>' % (re.sub(r'\slocalSheetId="\d+"', ' localSheetId="%d"' % pos, attrs), escape(body)))
if defs:
    if '<definedNames>' in d_wb or '<definedNames ' in d_wb:
        d_wb = re.sub(r'</definedNames>', ''.join(defs) + '</definedNames>', d_wb, count=1)
    else:
        d_wb = d_wb.replace('</sheets>', '</sheets><definedNames>%s</definedNames>' % ''.join(defs), 1)
d_rels = d_rels.replace('</Relationships>', '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/></Relationships>' % (rid, n), 1)
ct = dst.read('[Content_Types].xml').decode()
ct = ct.replace('</Types>', '<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' % part, 1)
extra = {}  # 足す部品（図形とシートの rels）
if drawing:
    k = max([0, *[int(x) for x in re.findall(r'xl/drawings/drawing(\d+)\.xml$', '\n'.join(dst.namelist()), re.M)]]) + 1
    d_new = 'xl/drawings/drawing%d.xml' % k
    extra[d_new] = num_ref(src.read(drawing[1]).decode()).encode()
    extra['xl/worksheets/_rels/sheet%d.xml.rels' % n] = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                                         '<Relationship Id="%s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing%d.xml"/>'
                                                         '</Relationships>' % (drawing[0], k)).encode()
    if 'PartName="/%s"' % d_new not in ct:
        ct = ct.replace('</Types>', '<Override PartName="/%s" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>' % d_new, 1)
app = dst.read('docProps/app.xml').decode() if 'docProps/app.xml' in dst.namelist() else None
if app:
    # シートの名前の一覧（TitlesOfParts）と、その数（HeadingPairs の「ワークシート」）
    m = re.search(r'(<TitlesOfParts>\s*<vt:vector size=")(\d+)("[^>]*>)(.*?)(</vt:vector>)', app, re.S)
    if m:
        names = re.findall(r'<vt:lpstr>.*?</vt:lpstr>', m.group(4), re.S)
        sheet_names = [escape(nm) for nm, _, _ in dst_entries]
        idx = [k for k, x in enumerate(names) if x[len('<vt:lpstr>'):-len('</vt:lpstr>')] in sheet_names]
        at = (idx[pos - 1] + 1) if pos > 0 and idx else (idx[0] if idx else len(names))
        names.insert(at, '<vt:lpstr>%s</vt:lpstr>' % escape(NEW_NAME))
        app = app[:m.start()] + m.group(1) + str(int(m.group(2)) + 1) + m.group(3) + ''.join(names) + m.group(5) + app[m.end():]
        app = re.sub(r'(<vt:lpstr>(?:ワークシート|Worksheets)</vt:lpstr>\s*</vt:variant>\s*<vt:variant>\s*<vt:i4>)(\d+)(</vt:i4>)', lambda k: k.group(1) + str(int(k.group(2)) + 1) + k.group(3), app, count=1)

out = zipfile.ZipFile(out_path, 'w')
for info in dst.infolist():
    data = dst.read(info.filename)
    if info.filename == 'xl/styles.xml':
        data = d_styles.encode()
    elif info.filename == 'xl/sharedStrings.xml':
        data = d_sst.encode()
    elif info.filename == 'xl/workbook.xml':
        data = d_wb.encode()
    elif info.filename == 'xl/_rels/workbook.xml.rels':
        data = d_rels.encode()
    elif info.filename == '[Content_Types].xml':
        data = ct.encode()
    elif info.filename == 'docProps/app.xml' and app:
        data = app.encode()
    out.writestr(info, data, compress_type=info.compress_type)
out.writestr(zipfile.ZipInfo(part, date_time=(1980, 1, 1, 0, 0, 0)), sheet.encode(), compress_type=zipfile.ZIP_DEFLATED)
for name, data in extra.items():
    out.writestr(zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0)), data, compress_type=zipfile.ZIP_DEFLATED)
out.close()
print(out_path, 'add', part, '<-', s_sheet_path, 'at', pos, 'xf', len(new['xf']), 'font', len(new['font']), 'fill', len(new['fill']), 'border', len(new['border']),
      'numFmt', len(new['numFmt']), 'strings', len(add_si), 'print', len(defs), 'drawing', bool(drawing), 'same_theme', same_theme)
