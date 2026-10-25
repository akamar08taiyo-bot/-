# 販売見積書の原本（src/tokutei/print/mitsumori.xltx）を直したときの手順（2026-10-25。一度だけ動かしたもの。直し方の記録として残す）。
# ユーザーの指示：「見積もりの色がグレー系で暗いので、薄い水色系にする」「見積もりでは、担当名をいれる」「会社住所の下に、電話番号とFAX番号を記載する」
# 「見積もりの行数は4行ぐらい減らしていい」「会社名や社長名などの部分は、左寄せを統一して見やすくする」「税率の横に、備考を入れて、算出根拠をいれる」。
#   python3 docs/tokutei/edit-mitsumori-template.py src/tokutei/print/mitsumori.xltx
# 1. 灰色の塗り（fill 2＝背景色の15%暗い色）を薄い水色に
# 2. 税率（J）の右に「備考」の列（K）。名前の列（A・B）と金額（I）・税率（J）を細くして、全体の幅は前とほぼ同じ（印刷の大きさが変わらない）
#    表・合計の横の「消費税について」・備考の枠の右の端を K に。題名の枠（C1:H2）は1列右（D1:I2）にして、まん中のまま
# 3. 会社の欄（H8〜）は全部左寄せ・同じ字下げなし：会社名／営業所　所長　氏名／〒／住所／TEL／FAX／登録番号／担当（式をやめて、アプリが値を書く）
#    印の枠（グループ化 1）は2行下・右の端へ
# 4. 明細は20行→16行（39〜42行を隠す。合計の式の範囲 J23:J42 はそのまま。表の下の線は43行目の上の線）
import re
import sys
import zipfile

path = sys.argv[1]
z = zipfile.ZipFile(path)
files = {n: z.read(n) for n in z.namelist()}
infos = {i.filename: i for i in z.infolist()}
sheet = files['xl/worksheets/sheet1.xml'].decode()
styles = files['xl/styles.xml'].decode()
drawing = files['xl/drawings/drawing1.xml'].decode()
workbook = files['xl/workbook.xml'].decode()

# ---- 1. 塗り
styles = styles.replace('<fgColor theme="0" tint="-0.14999847407452621"/>', '<fgColor rgb="FFDDEEF9"/>', 1)
assert 'FFDDEEF9' in styles

# ---- 書式（cellXfs・borders）を足す道具
xfs_block = re.search(r'<cellXfs count="(\d+)">(.*?)</cellXfs>', styles, re.S)
xfs = re.findall(r'<xf [^>]*?(?:/>|>.*?</xf>)', xfs_block.group(2), re.S)
borders_block = re.search(r'<borders count="(\d+)">(.*?)</borders>', styles, re.S)
borders = re.findall(r'<border\b.*?</border>|<border/>', borders_block.group(2), re.S)
new_xfs = []
new_borders = []


def add_border(xml):
    new_borders.append(xml)
    return len(borders) + len(new_borders) - 1


def add_xf(xml):
    new_xfs.append(xml)
    return len(xfs) + len(new_xfs) - 1


def xf_of(i):
    return (xfs + new_xfs)[i]


def border_of(i):
    return (borders + new_borders)[i]


def with_right_thin(s):
    """右の線を細い線に（表の中の縦の線）"""
    xf = xf_of(s)
    b = int(re.search(r'borderId="(\d+)"', xf).group(1))
    bx = re.sub(r'<right\b[^>]*?(?:/>|>.*?</right>)', '<right style="thin"><color auto="1"/></right>', border_of(b), flags=re.S)
    return add_xf(re.sub(r'borderId="\d+"', f'borderId="{add_border(bx)}"', xf))


def with_align(s, align, font=None):
    xf = xf_of(s)
    if font is not None:
        xf = re.sub(r'fontId="\d+"', f'fontId="{font}"', xf)
    if '<alignment' in xf:
        xf = re.sub(r'<alignment\b[^>]*/>', align, xf)
    elif xf.endswith('/>'):
        xf = xf[:-2] + f' applyAlignment="1">{align}</xf>'
    else:
        xf = xf.replace('</xf>', f'{align}</xf>')
    return add_xf(xf)


# ---- セルの道具
def row_xml(r):
    return re.search(r'<row r="%d"[^>]*?(?:/>|>.*?</row>)' % r, sheet, re.S)


def cell_style(ref):
    m = re.search(r'<c r="%s"(?=[\s/>])[^>]*?\ss="(\d+)"' % ref, sheet)
    return int(m.group(1)) if m else None


def set_cell(ref, xml):
    """セルを置きかえる（なければ行に足す。列の順に）"""
    global sheet
    m = re.search(r'<c r="%s"(?=[\s/>])[^>]*?(?:/>|>.*?</c>)' % ref, sheet, re.S)
    if m:
        sheet = sheet[: m.start()] + xml + sheet[m.end():]
        return
    r = int(re.search(r'\d+', ref).group(0))
    rm = row_xml(r)
    body = rm.group(0)
    if body.endswith('/>'):
        body = body[:-2] + '>' + xml + '</row>'
    else:
        col = re.match(r'[A-Z]+', ref).group(0)
        cells = list(re.finditer(r'<c r="([A-Z]+)%d"' % r, body))
        after = [c for c in cells if (len(c.group(1)), c.group(1)) > (len(col), col)]
        at = after[0].start() if after else body.rindex('</row>')
        body = body[:at] + xml + body[at:]
    sheet = sheet[: rm.start()] + body + sheet[rm.end():]


def styled(ref, s):
    return f'<c r="{ref}" s="{s}"/>' if s is not None else f'<c r="{ref}"/>'


def inline(ref, s, text):
    return f'<c r="{ref}" s="{s}" t="inlineStr"><is><t>{text}</t></is></c>'


# ---- 2. 列の幅（文字の幅の単位）。前：A 13.75・B 14.25・I 15.5・J 12.375（合計 101.875）
widths = {1: 10.5, 2: 9, 3: 7.75, 4: 7.75, 5: 6.875, 6: 7.75, 7: 5.5, 8: 10.375, 9: 12, 10: 8, 11: 16.5}
cols = ''.join(f'<col min="{c}" max="{c}" width="{w}" style="26" customWidth="1"/>' for c, w in widths.items())
sheet = re.sub(r'<cols>.*?</cols>', f'<cols>{cols}<col min="12" max="16384" width="9" style="26"/></cols>', sheet, flags=re.S)

# K 列：どの行も J と同じ書式から（ほかは行ごとに下で直す）
k_style = {}
for r in range(1, 63):
    s = cell_style(f'J{r}')
    if s is not None:
        k_style[r] = s
# 表（22〜42行）：J の右の線を細く、K は J の書式（右の太い線）。明細の K は左寄せ・小さめ（9pt）・縮小して全体を表示
for r in range(22, 43):
    sj = cell_style(f'J{r}')
    if sj is None:
        continue
    set_cell(f'J{r}', re.sub(r'\ss="\d+"', f' s="{with_right_thin(sj)}"', re.search(r'<c r="J%d"(?=[\s/>])[^>]*?(?:/>|>.*?</c>)' % r, sheet, re.S).group(0)))
    k_style[r] = sj if r == 22 else with_align(sj, '<alignment horizontal="left" vertical="center" shrinkToFit="1"/>', font=24)
# 合計の横の「消費税について」（45〜51行）・備考（59〜62行）の枠：J は枠の中（I と同じ書式）、K が右の端
for r in list(range(45, 52)) + list(range(59, 63)):
    si, sj = cell_style(f'I{r}'), cell_style(f'J{r}')
    if sj is None:
        continue
    m = re.search(r'<c r="J%d"(?=[\s/>])[^>]*?(?:/>|>.*?</c>)' % r, sheet, re.S)
    set_cell(f'J{r}', re.sub(r'\ss="\d+"', f' s="{si}"', m.group(0)) if si is not None else styled(f'J{r}', None))
    k_style[r] = sj
for r, s in k_style.items():
    set_cell(f'K{r}', inline(f'K{r}', s, '備考') if r == 22 else styled(f'K{r}', s))

# 題名の枠：C1:H2 → D1:I2（列が細くなった分、1列右にしてまん中に）
for r in (1, 2):
    st = {c: cell_style(f'{c}{r}') for c in 'BCDEFGHI'}
    val = re.search(r'<c r="C1"[^>]*>(.*?)</c>', sheet, re.S).group(1) if r == 1 else ''
    for c, prev in zip('IHGFED', 'HGFEDC'):
        body = f'<c r="{c}{r}" s="{st[prev]}"' + (f' t="s">{val}</c>' if (r == 1 and c == 'D') else '/>')
        set_cell(f'{c}{r}', body)
    set_cell(f'C{r}', styled(f'C{r}', st['B']))

# ---- 3. 会社の欄：左寄せ・字下げなし。会社名・営業所は 11pt、ほかは 10pt
s_head = with_align(33, '<alignment horizontal="left" vertical="center"/>')  # 11pt
s_line = with_align(80, '<alignment horizontal="left" vertical="center"/>')  # 10pt
set_cell('H8', re.sub(r'\ss="\d+"', f' s="{s_head}"', re.search(r'<c r="H8"[^>]*?(?:/>|>.*?</c>)', sheet, re.S).group(0)))
set_cell('H9', inline('H9', s_head, '行橋営業所　所長　久保　匠史'))
set_cell('I9', styled('I9', 33))
lines = {11: '〒824-0043', 12: '福岡県行橋市大字流末1327番地', 13: 'TEL：0930-26-9640', 14: 'FAX：0930-26-9641', 15: '登録番号：T1290001044462', 16: ''}
for r, text in lines.items():
    set_cell(f'H{r}', inline(f'H{r}', s_line, text) if text else styled(f'H{r}', s_line))
    for c in 'IJ':
        if cell_style(f'{c}{r}') is not None:
            set_cell(f'{c}{r}', styled(f'{c}{r}', 33))
sheet = sheet.replace('<mergeCell ref="H11:I11"/>', '')

# ---- 4. 明細を16行に（39〜42行を隠す）。印の枠の下にすき間（20行目を高く）
for r in range(39, 43):
    m = row_xml(r)
    head = re.match(r'<row\b[^>]*>', m.group(0)).group(0)
    sheet = sheet.replace(head, head.replace(f'<row r="{r}" ', f'<row r="{r}" hidden="1" ', 1), 1)  # r は先頭のまま（アプリは <row r="…" で探す）
m = row_xml(20)
head = re.match(r'<row\b[^>]*>', m.group(0)).group(0)
sheet = sheet.replace(head, re.sub(r'(?<=\s)ht="[\d.]+"', 'ht="24"', head), 1)  # customHeight の "Height" に当てない

# 金額の欄の「共有の式」（I26:I42。親は I26）は、どの行もふつうの式に（隠した行の式も、親を書きかえると壊れるので）
sheet = sheet.replace('<f t="shared" ref="I26:I42" si="0">', '<f>', 1)
for r in range(27, 43):
    sheet = sheet.replace(f'<c r="I{r}" s="44" t="str"><f t="shared" si="0"/>', f'<c r="I{r}" s="44" t="str"><f>IF(F{r}*H{r},F{r}*H{r},&quot;&quot;)</f>', 1)
assert 't="shared"' not in sheet

# 結合・範囲・改ページ
for a, b in [('I4:J4', 'I4:K4'), ('I5:J5', 'I5:K5'), ('C1:H2', 'D1:I2'), ('H45:J46', 'H45:K46')] + [(f'H{r}:J{r}', f'H{r}:K{r}') for r in range(47, 52)] + [(f'A{r}:J{r}', f'A{r}:K{r}') for r in range(59, 63)]:
    assert f'<mergeCell ref="{a}"/>' in sheet, a
    sheet = sheet.replace(f'<mergeCell ref="{a}"/>', f'<mergeCell ref="{b}"/>')
sheet = re.sub(r'<mergeCells count="\d+">', lambda _: f'<mergeCells count="{sheet.count("<mergeCell ")}">', sheet)
sheet = sheet.replace('<dimension ref="A1:J62"/>', '<dimension ref="A1:K62"/>').replace('spans="1:10"', 'spans="1:11"')
sheet = sheet.replace('<brk id="10" max="1048575" man="1"/>', '<brk id="11" max="1048575" man="1"/>')
workbook = workbook.replace('見積書!$A$1:$J$62', '見積書!$A$1:$K$62')
assert '$K$62' in workbook

# ---- 印の枠と、印刷しない赤い枠（アプリの使い方のメモ）の位置
EMU = 9525
px = {c: int(8 * w + 0.5) for c, w in widths.items()}  # 列の幅（画素。MDW 8）
x_of = lambda c: sum(px[i] for i in range(1, c))  # 列 c（1始まり）の左の位置
# 印の枠：K の右の端から 4px 内側に右をそろえる。17行目の上から 10px（前は15行目）
grp_w = 1405877 / EMU
right = x_of(12) - 4
left = right - grp_w
c_from = max(c for c in range(1, 12) if x_of(c) <= left)
c_to = max(c for c in range(1, 12) if x_of(c) <= right)
grp = re.search(r'<xdr:twoCellAnchor><xdr:from>.*?</xdr:to><xdr:grpSp>', drawing, re.S)
anchor = (f'<xdr:twoCellAnchor><xdr:from><xdr:col>{c_from - 1}</xdr:col><xdr:colOff>{round((left - x_of(c_from)) * EMU)}</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:from>'
          f'<xdr:to><xdr:col>{c_to - 1}</xdr:col><xdr:colOff>{round((right - x_of(c_to)) * EMU)}</xdr:colOff><xdr:row>19</xdr:row><xdr:rowOff>190500</xdr:rowOff></xdr:to><xdr:grpSp>')
drawing = drawing[: grp.start()] + anchor + drawing[grp.end():]
heights = [22.5, 22.5, 3.75, 20.25, 20.25, 15, 15, 20.25, 17.25, 3, 15, 15, 18, 18, 15, 15]  # 1〜16行（pt）
top = sum(heights) * 96 / 72 + 10
drawing = drawing.replace('<a:off x="6233157" y="2962275"/>', f'<a:off x="{round(left * EMU)}" y="{round(top * EMU)}"/>', 1)
# 赤い枠：合計の金額（C〜F）・金額の列（I）・消費税について（H〜K）。メモの文字の枠は1列右
drawing = drawing.replace('<xdr:col>1</xdr:col><xdr:colOff>1066798</xdr:colOff>', f'<xdr:col>1</xdr:col><xdr:colOff>{(px[2] - 7) * EMU}</xdr:colOff>', 1)
drawing = drawing.replace('<xdr:col>8</xdr:col><xdr:colOff>1143000</xdr:colOff>', f'<xdr:col>8</xdr:col><xdr:colOff>{(px[9] - 4) * EMU}</xdr:colOff>', 1)
drawing = drawing.replace('<xdr:col>10</xdr:col><xdr:colOff>466724</xdr:colOff>', '<xdr:col>11</xdr:col><xdr:colOff>466724</xdr:colOff>', 1)
drawing = drawing.replace('<xdr:col>16</xdr:col><xdr:colOff>371475</xdr:colOff>', '<xdr:col>17</xdr:col><xdr:colOff>371475</xdr:colOff>', 1)
drawing = drawing.replace('<xdr:col>10</xdr:col><xdr:colOff>28575</xdr:colOff>', '<xdr:col>11</xdr:col><xdr:colOff>28575</xdr:colOff>', 1)

# ---- 書式の数を直して書き出す
styles = styles.replace(xfs_block.group(0), f'<cellXfs count="{len(xfs) + len(new_xfs)}">{xfs_block.group(2)}{"".join(new_xfs)}</cellXfs>')
borders_block = re.search(r'<borders count="(\d+)">(.*?)</borders>', styles, re.S)
styles = styles.replace(borders_block.group(0), f'<borders count="{len(borders) + len(new_borders)}">{borders_block.group(2)}{"".join(new_borders)}</borders>')
files['xl/worksheets/sheet1.xml'] = sheet.encode()
files['xl/styles.xml'] = styles.encode()
files['xl/drawings/drawing1.xml'] = drawing.encode()
files['xl/workbook.xml'] = workbook.encode()
# 計算の順の記録（calcChain）は式の場所が変わったので消す（Excel が作り直す）
files.pop('xl/calcChain.xml', None)
for n in ('[Content_Types].xml', 'xl/_rels/workbook.xml.rels'):
    files[n] = re.sub(rb'<(?:Override|Relationship)\b[^>]*calcChain[^>]*/>', b'', files[n])
with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as out:
    for n, data in files.items():
        info = infos[n]
        info.compress_type = zipfile.ZIP_DEFLATED
        out.writestr(info, data)
print('ok', len(new_xfs), 'styles', len(new_borders), 'borders')
