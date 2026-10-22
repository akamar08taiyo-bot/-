#!/usr/bin/env python3
"""
2枚のシートの様式（例：住宅改修理由書の P1・P2）を、1枚のシートの2ページにまとめた原本（.xltx）を作る。
ユーザーの指示（2026-10-22）「渡したエクセルシートは、２つのタブになっていますが、１つのタブで２ページにする」。

やり方（列の作りがちがうシートを1枚にするため）：
  1. 2枚のシートの列の境目を画素（幅×7）で集める。2枚目は1枚目と同じ横幅になるよう伸ばす（印刷で同じ大きさに見えるように）。
  2. 近い境目（SNAP 画素以内）は1つにそろえ、両方の境目を合わせた列の並びを作る。
  3. もとの結合は、新しい列に広げる（書式はまたがる欄のすべてに写す。結合の中の線は出ないので、もとの罫線のまま見える）。
     結合していない1つの欄が新しい列の2つ以上にまたがるときは、結合しない（結合すると文字がとなりへはみ出せず切れる）。
     書式は左の欄・まん中・右の欄で罫線を分けて写す（左の線は左の欄だけ、右の線は右の欄だけ）。中央・右寄せの文字の欄だけは結合する。
  4. 2枚目の行は1枚目の下に続け、そのあいだで改ページ。印刷は A4 横で、2ページとも入る同じ倍率（`print_scale`）。
     「1ページに合わせる」にすると Excel は手で入れた改ページを使わないので、倍率で決める。
  5. 図形（矢印・かっこ）は、新しい列と行に置き直す。
外部リンク・#REF! の名前・作った人の名前・ファイルの場所は消す。前の申請の名残り（■・丸）は --riyu で消す。

usage: python3 merge-sheets.py <入力.xltx> <出力.xltx> [--riyu]
"""
import re
import sys
import zipfile

SNAP = 6.0  # 画素。これより近い列の境目は1つにする
PX = 8.0  # 列の幅 1 あたりの画素（既定の字体 ＭＳ Ｐゴシック 11pt の数字の幅。shinsei.ts の MDW と同じ）
SCALE_PX = 9.0  # 印刷の倍率を決めるときの、列の幅 1 あたりの画素（広めに）
EMU_PX = 9525
EMU_PT = 12700


def col_num(s):
    n = 0
    for ch in s:
        n = n * 26 + ord(ch) - 64
    return n


def col_name(n):
    s = ''
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def split_ref(ref):
    m = re.match(r'([A-Z]+)(\d+)$', ref)
    return col_num(m.group(1)), int(m.group(2))


def col_widths(sheet_xml, last_col, default=9.0):
    widths = {}
    for m in re.finditer(r'<col ([^>]*)/>', sheet_xml):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        for c in range(int(a['min']), min(int(a['max']), last_col) + 1):
            widths[c] = float(a.get('width', default))
    return [widths.get(c, default) for c in range(1, last_col + 1)]


def col_style(sheet_xml):
    m = re.search(r'<col [^>]*style="(\d+)"', sheet_xml)
    return m.group(1) if m else None


def parse_sheet(xml):
    dim = re.search(r'<dimension ref="[A-Z]+\d+:([A-Z]+)(\d+)"', xml)
    last_col, last_row = col_num(dim.group(1)), int(dim.group(2))
    rows = []
    for m in re.finditer(r'<row ([^>]*?)(?:/>|>(.*?)</row>)', xml, re.S):
        attrs = dict(re.findall(r'([\w:]+)="([^"]*)"', m.group(1)))
        cells = []
        for c in re.finditer(r'<c ([^>]*?)(?:/>|>(.*?)</c>)', m.group(2) or '', re.S):
            ca = dict(re.findall(r'([\w:]+)="([^"]*)"', c.group(1)))
            cells.append((ca, c.group(2)))
        rows.append((attrs, cells))
    merges = re.findall(r'<mergeCell ref="([^"]+)"', xml)
    default_ht = float(re.search(r'defaultRowHeight="([\d.]+)"', xml).group(1))
    return {'last_col': last_col, 'last_row': last_row, 'rows': rows, 'merges': merges, 'default_ht': default_ht}


def boundaries(widths, scale=1.0):
    b = [0.0]
    for w in widths:
        b.append(b[-1] + w * PX * scale)
    return b


def union(b1, b2):
    """2つの境目の並びを合わせる。b2 の境目は、b1 の近い境目にそろえる。返り値：新しい境目・b1/b2 の各境目の新しい番号"""
    pts = list(b1)
    for x in b2:
        if min(abs(x - y) for y in pts) > SNAP:
            pts.append(x)
    pts.sort()
    # 近すぎる点（b2 どうし）をまとめる
    merged = [pts[0]]
    for x in pts[1:]:
        if x - merged[-1] > SNAP:
            merged.append(x)
        elif x in b1 and merged[-1] not in b1:
            merged[-1] = x
    idx = lambda x: min(range(len(merged)), key=lambda i: abs(merged[i] - x))
    return merged, [idx(x) for x in b1], [idx(x) for x in b2]


class Styles:
    """styles.xml の書式（cellXfs）と罫線（borders）。罫線の左・右を外した書式を足す"""

    def __init__(self, xml):
        self.xml = xml
        self.xfs = re.findall(r'<xf [^>]*?(?:/>|>.*?</xf>)', re.search(r'<cellXfs[^>]*>(.*?)</cellXfs>', xml, re.S).group(1), re.S)
        self.borders = re.findall(r'<border\b[^>]*?(?:/>|>.*?</border>)', re.search(r'<borders[^>]*>(.*?)</borders>', xml, re.S).group(1), re.S)
        self.added_xfs = []
        self.added_borders = []
        self.memo = {}

    def align(self, s):
        m = re.search(r'<alignment [^>]*horizontal="(\w+)"', self.xfs[int(s)])
        return m.group(1) if m else 'general'

    def has_lr(self, s):
        b = int(re.search(r'borderId="(\d+)"', self.xfs[int(s)]).group(1))
        return bool(re.search(r'<(left|right) [^>]*style=', self.all_borders()[b]))

    def all_borders(self):
        return self.borders + self.added_borders

    def all_xfs(self):
        return self.xfs + self.added_xfs

    def part(self, s, part):
        """書式 s の、左（first）・まん中（mid）・右（last）の欄の書式の番号"""
        if part == 'only' or s is None:
            return s
        key = (s, part)
        if key in self.memo:
            return self.memo[key]
        xf = self.all_xfs()[int(s)]
        b = int(re.search(r'borderId="(\d+)"', xf).group(1))
        border = self.all_borders()[b]
        drop = {'first': ['right'], 'mid': ['left', 'right'], 'last': ['left']}[part]
        for side in drop:
            border = re.sub(rf'<{side}\b[^>]*/>|<{side}\b[^>]*>.*?</{side}>', f'<{side}/>', border, flags=re.S)
        if border == self.all_borders()[b]:
            self.memo[key] = s
            return s
        self.added_borders.append(border)
        nb = len(self.all_borders()) - 1
        nxf = re.sub(r'borderId="\d+"', f'borderId="{nb}"', xf)
        if 'applyBorder=' not in nxf:
            nxf = nxf.replace('<xf ', '<xf applyBorder="1" ', 1)
        self.added_xfs.append(nxf)
        self.memo[key] = str(len(self.all_xfs()) - 1)
        return self.memo[key]

    def out(self):
        x = self.xml
        if self.added_borders:
            x = re.sub(r'<borders count="\d+"([^>]*)>(.*?)</borders>', lambda m: f'<borders count="{len(self.all_borders())}"{m.group(1)}>{m.group(2)}{"".join(self.added_borders)}</borders>', x, flags=re.S)
        if self.added_xfs:
            x = re.sub(r'<cellXfs count="\d+"([^>]*)>(.*?)</cellXfs>', lambda m: f'<cellXfs count="{len(self.all_xfs())}"{m.group(1)}>{m.group(2)}{"".join(self.added_xfs)}</cellXfs>', x, flags=re.S)
        return x


def print_scale(heights_pt, width_px, margins):
    """A4 横の印刷で、どのページも1ページに入る倍率（%）。heights_pt はページごとの行の高さの合計、width_px はシートの幅"""
    m = dict(re.findall(r'(\w+)="([\d.]+)"', margins))
    page_w, page_h = 297 / 25.4 * 72, 210 / 25.4 * 72  # pt
    avail_w = page_w - (float(m['left']) + float(m['right'])) * 72
    avail_h = page_h - (float(m['top']) + float(m['bottom'])) * 72
    k = min(avail_w / (width_px * 0.75), *(avail_h / h for h in heights_pt), 1.0)
    return int(k * 100 * 0.98)  # 少し余裕（字の幅の違い）


def remap_drawing(dxml, b_old, new_b, row_off, removed_names):
    """図形の置き場所（from・to の列と列内の位置）を新しい列に置き直す。行は row_off 足す"""
    out = []
    for a in re.findall(r'<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b.*?</xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>', dxml, re.S):
        name = re.search(r'<xdr:cNvPr [^>]*name="([^"]*)"', a)
        if name and name.group(1) in removed_names:
            continue

        def fix(m):
            tag, col, coff, row, roff = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), m.group(5)
            px = b_old[col] + coff / EMU_PX
            i = max(k for k in range(len(new_b)) if new_b[k] <= px + 1e-6)
            i = min(i, len(new_b) - 2)
            return f'<xdr:{tag}><xdr:col>{i}</xdr:col><xdr:colOff>{round((px - new_b[i]) * EMU_PX)}</xdr:colOff><xdr:row>{row + row_off}</xdr:row><xdr:rowOff>{roff}</xdr:rowOff></xdr:{tag}>'

        a = re.sub(r'<xdr:(from|to)><xdr:col>(\d+)</xdr:col><xdr:colOff>(-?\d+)</xdr:colOff><xdr:row>(\d+)</xdr:row><xdr:rowOff>(-?\d+)</xdr:rowOff></xdr:\1>', fix, a)
        out.append(a)
    return out


def main(src, dst, riyu):
    z = zipfile.ZipFile(src)
    files = {n: z.read(n) for n in z.namelist()}
    txt = lambda n: files[n].decode('utf-8')
    wb = txt('xl/workbook.xml')
    rels = txt('xl/_rels/workbook.xml.rels')
    sheets = re.findall(r'<sheet name="([^"]+)" sheetId="\d+" r:id="([^"]+)"/>', wb)
    assert len(sheets) == 2, sheets
    target = lambda rid: 'xl/' + re.search(rf'Id="{rid}"[^>]*Target="([^"]+)"', rels).group(1)
    paths = [target(rid) for _, rid in sheets]
    xmls = [txt(p) for p in paths]
    s1, s2 = parse_sheet(xmls[0]), parse_sheet(xmls[1])
    w1, w2 = col_widths(xmls[0], s1['last_col']), col_widths(xmls[1], s2['last_col'])
    b1 = boundaries(w1)
    scale2 = b1[-1] / boundaries(w2)[-1]  # 2枚目を1枚目と同じ横幅に
    b2 = boundaries(w2, scale2)
    new_b, map1, map2 = union(b1, b2)
    new_w = [(new_b[i + 1] - new_b[i]) / PX for i in range(len(new_b) - 1)]
    print(f'列：1枚目 {len(w1)}・2枚目 {len(w2)}（{scale2:.3f}倍）→ {len(new_w)}', file=sys.stderr)

    styles = Styles(txt('xl/styles.xml'))
    row_off = s1['last_row']
    cells = {}  # (row, col) -> (attrs, inner)
    row_attrs = {}
    merges = []
    for k, (s, mp) in enumerate(((s1, map1), (s2, map2))):
        off = 0 if k == 0 else row_off
        span = lambda c: (mp[c - 1] + 1, mp[c])  # もとの列 c → 新しい列（1始まり、両端を含む）
        in_merge = set()
        for ref in s['merges']:
            a, b = ref.split(':')
            (c1, r1), (c2, r2) = split_ref(a), split_ref(b)
            for r in range(r1, r2 + 1):
                for c in range(c1, c2 + 1):
                    in_merge.add((r, c))
            merges.append((r1 + off, span(c1)[0], r2 + off, span(c2)[1]))
        for attrs, row_cells in s['rows']:
            r = int(attrs['r'])
            ra = {kk: v for kk, v in attrs.items() if kk not in ('r', 'spans')}
            if riyu:
                ra.pop('hidden', None)  # 理由書の原本は P2 の排泄の2行（トイレまでの移動・トイレ出入口の出入）が隠れていた。様式の項目なので出す
            row_attrs[r + off] = ra
            for ca, inner in row_cells:
                c, _ = split_ref(ca['r'])
                if riyu and k == 1 and ca['r'] == 'L5':
                    inner = None  # 隠れていた行にあった、閉じかっこのない「（」（④改修項目の上。名残り）
                    ca = {kk: v for kk, v in ca.items() if kk != 't'}
                a, b = span(c)
                merged = (r, c) in in_merge
                has_text = bool(inner and re.search(r'<v>', inner))
                # 中央・右寄せの文字の欄は結合（まん中・右にそろえたまま）。ほかは結合せず、罫線を左・まん中・右に分ける（文字がとなりへはみ出せるように）
                join = b > a and not merged and has_text and styles.align(ca.get('s', '0')) in ('center', 'right', 'centerContinuous')
                if join:
                    merges.append((r + off, a, r + off, b))
                for nc in range(a, b + 1):
                    na = {kk: v for kk, v in ca.items() if kk != 'r'}
                    if b > a and not merged and not join and 's' in na:
                        na['s'] = styles.part(na['s'], 'first' if nc == a else 'last' if nc == b else 'mid')
                    cells[(r + off, nc)] = (na, inner if nc == a else None)
                    if nc != a:
                        na.pop('t', None)
    last_row = row_off + s2['last_row']
    last_col = len(new_w)

    # 行（もとの行の高さ・書式）
    out_rows = []
    for r in range(1, last_row + 1):
        ra = row_attrs.get(r, {})
        if r > row_off and 'ht' not in ra:
            ra = {**ra, 'ht': str(s2['default_ht']), 'customHeight': '1'}  # 2枚目の決まった行の高さ
        if r <= row_off and 'ht' not in ra:
            ra = {**ra, 'ht': str(s1['default_ht']), 'customHeight': '1'}
        attr = ''.join(f' {k}="{v}"' for k, v in ra.items())
        cs = ''
        for c in range(1, last_col + 1):
            if (r, c) in cells:
                ca, inner = cells[(r, c)]
                a = f'r="{col_name(c)}{r}"' + ''.join(f' {k}="{v}"' for k, v in ca.items())
                cs += f'<c {a}>{inner}</c>' if inner else f'<c {a}/>'
        out_rows.append(f'<row r="{r}"{attr}>{cs}</row>' if cs else f'<row r="{r}"{attr}/>')

    heights = lambda s: sum(float(a.get('ht', s['default_ht'])) for a, _ in s['rows']) + s['default_ht'] * (s['last_row'] - len(s['rows']))
    # 倍率は字の幅を広めに（1あたり 9画素）数えて決める：LibreOffice（代わりの字体）では Excel より列が広くなり、88% では横にはみ出した
    width_px = new_b[-1] / PX * SCALE_PX
    scale = print_scale([heights(s1), heights(s2)], width_px, margins := re.search(r'<pageMargins[^>]*/>', xmls[0]).group(0))
    print(f'印刷の倍率 {scale}%（P1 {heights(s1):.0f}pt・P2 {heights(s2):.0f}pt・幅 {width_px:.0f}px）', file=sys.stderr)
    style = col_style(xmls[0])
    cols = ''.join(f'<col min="{i + 1}" max="{i + 1}" width="{w:.4f}"{f" style=\"{style}\"" if style else ""} customWidth="1"/>' for i, w in enumerate(new_w))
    mc = ''.join(f'<mergeCell ref="{col_name(c1)}{r1}:{col_name(c2)}{r2}"/>' for r1, c1, r2, c2 in merges if (r1, c1) != (r2, c2))
    head = re.search(r'^(.*?<worksheet[^>]*>)', xmls[0], re.S).group(1)
    sheet_fmt = re.search(r'<sheetFormatPr[^>]*/>', xmls[0]).group(0)
    phon = re.search(r'<phoneticPr[^>]*/>', xmls[0])
    sheet = (
        head
        + '<sheetPr/>'
        + f'<dimension ref="A1:{col_name(last_col)}{last_row}"/>'
        + '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>'
        + sheet_fmt
        + f'<cols>{cols}</cols>'
        + f'<sheetData>{"".join(out_rows)}</sheetData>'
        + f'<mergeCells count="{mc.count("<mergeCell ")}">{mc}</mergeCells>'
        + (phon.group(0) if phon else '')
        + f'<printOptions horizontalCentered="1"/>'
        + margins
        + f'<pageSetup paperSize="9" scale="{scale}" orientation="landscape"/>'
        + '<headerFooter alignWithMargins="0"/>'
        + f'<rowBreaks count="1" manualBreakCount="1"><brk id="{row_off}" max="16383" man="1"/></rowBreaks>'
        + '<drawing r:id="rId1"/>'
        + '</worksheet>'
    )

    # 図形：2枚の図形を1つの図形のファイルに（2枚目の図形は 2枚目の列で読んで、行を row_off 下げる）
    def drawing_of(i):
        r = txt(paths[i].replace('worksheets/', 'worksheets/_rels/') + '.rels')
        m = re.search(r'Target="\.\./drawings/([^"]+)"', r)
        return 'xl/drawings/' + m.group(1) if m else None

    removed = {'円/楕円 2', '円/楕円 3'} if riyu else set()  # 前の申請の丸（昭和・要介護の数字）
    d1, d2 = drawing_of(0), drawing_of(1)
    anchors = []
    head_d = None
    for i, d in enumerate((d1, d2)):
        if not d:
            continue
        dx = txt(d)
        head_d = head_d or re.search(r'^(.*?<xdr:wsDr[^>]*>)', dx, re.S).group(1)
        anchors += remap_drawing(dx, b1 if i == 0 else b2, new_b, 0 if i == 0 else row_off, removed)
    # 図形の番号（cNvPr id）を付け直す（2つのファイルで重なるので）
    nid = [1]

    def renum(m):
        nid[0] += 1
        return f'<xdr:cNvPr id="{nid[0]}"'

    drawing = re.sub(r'<xdr:cNvPr id="\d+"', renum, head_d + ''.join(anchors) + '</xdr:wsDr>')

    out = {}
    keep = lambda n: not (n.startswith('xl/externalLinks/') or n.startswith('xl/persons/') or n.startswith('xl/printerSettings/') or n.startswith('xl/worksheets/') or n.startswith('xl/drawings/'))
    for n, data in files.items():
        if keep(n):
            out[n] = data
    out['xl/worksheets/sheet1.xml'] = sheet.encode('utf-8')
    out['xl/worksheets/_rels/sheet1.xml.rels'] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'
    ).encode('utf-8')
    out['xl/drawings/drawing1.xml'] = drawing.encode('utf-8')

    name = '住宅改修理由書' if riyu else sheets[0][0]
    wb = re.sub(r'<sheets>.*?</sheets>', f'<sheets><sheet name="{name}" sheetId="1" r:id="rId1"/></sheets>', wb, flags=re.S)
    wb = re.sub(r'<externalReferences>.*?</externalReferences>', '', wb, flags=re.S)
    wb = re.sub(r'<definedNames>.*?</definedNames>', f'<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">{name}!$A$1:${col_name(last_col)}${last_row}</definedName></definedNames>', wb, flags=re.S)
    wb = re.sub(r'<mc:AlternateContent\b.*?</mc:AlternateContent>', '', wb, flags=re.S)  # ファイルの場所（作った人のフォルダ）
    wb = re.sub(r' activeTab="\d+"', '', wb)
    out['xl/workbook.xml'] = wb.encode('utf-8')
    out['xl/_rels/workbook.xml.rels'] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
    ).encode('utf-8')
    ct = txt('[Content_Types].xml')
    ct = re.sub(r'<Override PartName="/xl/(?:worksheets|drawings|externalLinks|persons)/[^"]+"[^>]*/>', '', ct)
    ct = re.sub(r'<Default Extension="bin"[^>]*/>', '', ct)
    ct = ct.replace(
        '</Types>',
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
    )
    out['[Content_Types].xml'] = ct.encode('utf-8')
    app = txt('docProps/app.xml')
    app = re.sub(r'<HeadingPairs>.*?</HeadingPairs>', '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>ワークシート</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>', app, flags=re.S)
    app = re.sub(r'<TitlesOfParts>.*?</TitlesOfParts>', f'<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>{name}</vt:lpstr></vt:vector></TitlesOfParts>', app, flags=re.S)
    out['docProps/app.xml'] = app.encode('utf-8')
    core = txt('docProps/core.xml')
    core = re.sub(r'<dc:creator>.*?</dc:creator>', '<dc:creator></dc:creator>', core)
    core = re.sub(r'<cp:lastModifiedBy>.*?</cp:lastModifiedBy>', '<cp:lastModifiedBy></cp:lastModifiedBy>', core)
    core = re.sub(r'<cp:lastPrinted>.*?</cp:lastPrinted>', '', core)
    out['docProps/core.xml'] = core.encode('utf-8')
    out['xl/styles.xml'] = styles.out().encode('utf-8')
    if riyu:
        out['xl/sharedStrings.xml'] = sanitize_riyu(out['xl/sharedStrings.xml'].decode('utf-8')).encode('utf-8')

    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as w:
        w.writestr('[Content_Types].xml', out.pop('[Content_Types].xml'))
        for n in sorted(out):
            w.writestr(n, out[n])


def sanitize_riyu(ss):
    """理由書の原本に残っていた前の申請の名残り（印・書き込み）を消す"""
    def text_of(si):
        return ''.join(re.findall(r'<t[^>]*>(.*?)</t>', re.sub(r'<rPh\b.*?</rPh>', '', si, flags=re.S), re.S))

    fixes = {
        '　■ 持ち家　　□ 借家　　□ 借間　': '　□ 持ち家　　□ 借家　　□ 借間　',  # 住宅状況
        '■女': '□女',  # 性別
        '■': '□',  # 福祉用具の利用状況（歩行器の改修前・改修後）
        '■　手摺取付': '□　手摺取付',  # 改修項目
        '□その他(トイレまでの移動)': '□その他(' + '　' * 12 + ')',  # 排泄のその他の書き込み
        '□時間転倒等の防止、安全の確保': '□転倒等の防止、安全の確保',  # 入浴の「時間」は書き込みの名残り（ほかの活動の同じ欄は「□転倒等の防止、安全の確保」）
    }
    done = set()

    def fix(m):
        si = m.group(0)
        t = text_of(si)
        if t not in fixes:
            return si
        done.add(t)
        new = fixes[t]
        # ふりがな（rPh）は字の位置が変わるので外す（字の数が同じ印の置きかえでも、そろえて外す）
        body = re.sub(r'<rPh\b.*?</rPh>', '', si, flags=re.S)
        first = re.search(r'<t[^>]*>.*?</t>', body, re.S)
        sp = ' xml:space="preserve"' if new != new.strip() else ''
        return re.sub(r'<r>.*</r>|<t[^>]*>.*?</t>', '', body, flags=re.S).replace('<si>', f'<si><t{sp}>{new}</t>', 1) if first else si

    out = re.sub(r'<si>.*?</si>', fix, ss, flags=re.S)
    missing = set(fixes) - done
    assert not missing, f'見つからない名残り: {missing}'
    return out


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0], args[1], '--riyu' in sys.argv)
