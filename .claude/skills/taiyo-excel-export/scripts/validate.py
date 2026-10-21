# xlsx の各 XML パートを ECMA-376 の XSD で厳密に検証し、XSD では分からない Excel 固有のこと（結合セルの重なり・結合の中の値・行の高さ 409pt）も調べる。
# usage: python3 -I validate.py <xlsx>...   → 「ALL VALID」と「EXCEL CHECKS OK」が出れば合格（問題があれば終わりのコード 1）
# XSD の場所は環境変数 XLSX_XSD_DIR（既定 ~/.cache/taiyo-xsd）。無ければ先に sh fetch-xsd.sh を動かす。lxml が要る（pip install lxml）
# 役所などの原本（xltx）を書きかえた xlsx も調べられるように、XML でないもの（画像・printerSettings*.bin）は読まず、
# Excel の拡張（mc:Ignorable に並んだ名前空間の属性・要素。x14ac:dyDescent・xr:uid など）は外してから検査する
import sys, zipfile, re, os, posixpath
from lxml import etree

XSD = os.path.join(os.environ.get('XLSX_XSD_DIR') or os.path.expanduser('~/.cache/taiyo-xsd'), '')
if not os.path.exists(XSD + 'sml.xsd'):
    sys.exit(f'XSD が見つからない（{XSD}）。先に sh fetch-xsd.sh を動かす')
_cache = {}
def schema(name):
    if name not in _cache:
        _cache[name] = etree.XMLSchema(etree.parse(XSD + name))
    return _cache[name]

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
ROOTS = {
    NS + 'worksheet': 'sml.xsd',
    NS + 'workbook': 'sml.xsd',
    NS + 'styleSheet': 'sml.xsd',
    NS + 'sst': 'sml.xsd',
    NS + 'comments': 'sml.xsd',
    NS + 'calcChain': 'sml.xsd',
    '{http://schemas.openxmlformats.org/drawingml/2006/chart}chartSpace': 'dml-chart.xsd',
    '{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}wsDr': 'dml-spreadsheetDrawing.xsd',
    '{http://schemas.openxmlformats.org/package/2006/relationships}Relationships': 'opc-relationships.xsd',
    '{http://schemas.openxmlformats.org/officeDocument/2006/extended-properties}Properties': 'shared-documentPropertiesExtended.xsd',
}

def strip_extensions(doc):
    """mc:AlternateContent は Fallback に置きかえ、mc:Ignorable の名前空間の属性・要素を外す（XSD に無い Excel の拡張）"""
    for ac in list(doc.iter('{%s}AlternateContent' % MC)):
        parent = ac.getparent()
        if parent is None:
            continue
        fb = ac.find('{%s}Fallback' % MC)
        i = parent.index(ac)
        for k, child in enumerate(list(fb) if fb is not None else []):
            parent.insert(i + k, child)
        parent.remove(ac)
    ignorable = set()
    for el in doc.iter():
        if not isinstance(el.tag, str):
            continue
        val = el.attrib.pop('{%s}Ignorable' % MC, None)
        if val:
            for prefix in val.split():
                uri = el.nsmap.get(prefix)
                if uri:
                    ignorable.add(uri)
    if not ignorable:
        return
    for el in list(doc.iter()):
        if not isinstance(el.tag, str):
            continue
        if etree.QName(el).namespace in ignorable and el.getparent() is not None:
            el.getparent().remove(el)
            continue
        for a in list(el.attrib):
            if a.startswith('{') and a[1:a.index('}')] in ignorable:
                del el.attrib[a]
    # 拡張の要素を外して空になった <ext>・<extLst> も外す（XSD では中身が1つ以上要る）
    for tag in ('ext', 'extLst'):
        for el in list(doc.iter(NS + tag)):
            if len(el) == 0 and el.getparent() is not None:
                el.getparent().remove(el)

ok = True
for path in sys.argv[1:]:
    z = zipfile.ZipFile(path)
    names = z.namelist()
    if names[0] != '[Content_Types].xml':
        print('WARN first entry', path, names[0])
    ct = z.read('[Content_Types].xml').decode()
    for n in names:
        if not (n.endswith('.xml') or n.endswith('.rels')):
            continue  # 画像・printerSettings*.bin・vml などは XML として調べない
        try:
            doc = etree.fromstring(z.read(n))
        except Exception as e:
            print('XML ERROR', path, n, e); ok = False; continue
        if n.endswith('.xml') and not n.startswith('[') and not n.startswith('docProps/core'):
            if ('/' + n) not in ct:
                print('MISSING content type override', path, n); ok = False
        # <t xml:space="preserve"> は Excel 自身も書く正式な書き方（XSD 側に xml の名前空間の宣言が無いだけ）なので検証前に外す
        for t in doc.iter(NS + 't'):
            t.attrib.pop('{http://www.w3.org/XML/1998/namespace}space', None)
        strip_extensions(doc)
        xsd = ROOTS.get(doc.tag)
        if xsd:
            s = schema(xsd)
            if not s.validate(doc):
                ok = False
                for err in list(s.error_log)[:8]:
                    print('INVALID', path, n, 'line', err.line, err.message[:300])
        elif n not in ('[Content_Types].xml', 'docProps/core.xml'):
            print('  (no schema for)', n, doc.tag)
        # 関係（rels）の行き先があるか
        if n.endswith('.rels'):
            base = n.replace('_rels/', '').replace('.rels', '')
            d = base.rsplit('/', 1)[0] if '/' in base else ''
            for rel in doc:
                if rel.get('TargetMode') == 'External' or rel.get('Target', '').startswith('#'):
                    continue  # 外のリンクと、ブックの中の場所へのリンク（#シート名!A1）はファイルではない
                t = rel.get('Target')
                full = posixpath.normpath(posixpath.join(d, t)) if not t.startswith('/') else t[1:]
                if full not in names:
                    print('BROKEN REL', path, n, t, '->', full); ok = False
print('ALL VALID' if ok else 'PROBLEMS FOUND')

# --- Excel 固有のチェック（XSD では分からないもの）：結合セルの重なり・結合の中の値・行の高さ上限 ---
def colnum(s):
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - 64)
    return n
def parse_ref(ref):
    m = re.match(r'([A-Z]+)(\d+)$', ref)
    return int(m.group(2)), colnum(m.group(1))
bad = False
for path in sys.argv[1:]:
    z = zipfile.ZipFile(path)
    for n in z.namelist():
        if not re.match(r'xl/worksheets/sheet\d+\.xml$', n):
            continue
        try:
            doc = etree.fromstring(z.read(n))
        except Exception as e:
            print('XML ERROR', path, n, e); bad = True; continue
        merges = []
        for mc in doc.iter(NS + 'mergeCell'):
            a, b = mc.get('ref').split(':')
            (r1, c1), (r2, c2) = parse_ref(a), parse_ref(b)
            if r1 > r2 or c1 > c2:
                print('BAD MERGE ORDER', path, n, mc.get('ref')); bad = True
            merges.append((r1, c1, r2, c2, mc.get('ref')))
        for i in range(len(merges)):
            for j in range(i + 1, len(merges)):
                A, B = merges[i], merges[j]
                if not (A[2] < B[0] or B[2] < A[0] or A[3] < B[1] or B[3] < A[1]):
                    print('OVERLAPPING MERGES', path, n, A[4], B[4]); bad = True
        vals = {}
        for c in doc.iter(NS + 'c'):
            if c.find(NS + 'v') is not None or c.find(NS + 'f') is not None or c.find(NS + 'is') is not None:
                vals[parse_ref(c.get('r'))] = True
        for (r1, c1, r2, c2, ref) in merges:
            for (r, cc) in vals:
                if r1 <= r <= r2 and c1 <= cc <= c2 and (r, cc) != (r1, c1):
                    print('VALUE INSIDE MERGE (not top-left)', path, n, ref, r, cc); bad = True
        for row in doc.iter(NS + 'row'):
            ht = row.get('ht')
            if ht and float(ht) > 409:
                print('ROW TOO TALL', path, n, row.get('r'), ht); bad = True
print('EXCEL CHECKS OK' if not bad else 'EXCEL CHECK PROBLEMS')
sys.exit(0 if ok and not bad else 1)
