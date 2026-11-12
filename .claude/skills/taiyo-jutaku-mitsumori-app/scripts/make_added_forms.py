# 住宅改修の原本に、あとからいただいた様式を1枚ずつ足す（2026-11-12。ユーザーがくださった様式）：
#   みやこ町：委任状（様式第6号（第9条関係）。介護保険福祉用具購入費及び住宅改修費に係る受領委任払い用。inin9.docx）→ miyako.xltx の
#             「住宅改修費支給申請書(受領委任払用)」のうしろに「委任状」
#   行橋市：請求書（16392.xlsx の「請求書  (委任)」＝事業所が請求するもの。「請求書 （本人）」は入れない）→ yukuhashi.xltx の「委任状」のうしろに「請求書」
#   福岡市：住宅改修にかかる承諾書（参考様式。syoudakusyo_202104.pdf）→ fukuoka.xltx の「完了届出書（受領委任用)」のうしろに「承諾書」
# Word・PDF の様式は pdf_form_xlsx.py で同じ形のシートにする（北九州市・久留米市と同じ作り）。行橋市の請求書は市の Excel のシートをそのまま使い、
# 金額の下線の所（I23:N23 など）だけ、アプリが金額を書けるように結合して右ぞろえにする（罫線はそのまま）。
# 入れる先の原本は LibreOffice で開き直さず、add-sheet.py で XML のままシートを足す（ほかのシートの番地・図形・書式は変わらない）。
# アプリが書く欄の番地は、最後に出す（shinsei.ts の MIYAKO_PROXY・YUKU_CLAIM・FUKUOKA_CONSENT に書く）。
# usage: python3 make_added_forms.py <inin9.docx> <16392.xlsx> <syoudakusyo_202104.pdf> <src/sasaoka/shinsei のフォルダ>（miyako・yukuhashi・fukuoka.xltx を書きかえる）
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
inin_docx, yk_xlsx, fk_pdf, shinsei_dir = [os.path.abspath(p) for p in sys.argv[1:5]]
work = tempfile.mkdtemp(prefix='added-forms-')

FONT_PAIRS = [('ＭＳ ゴシック', 'IPAGothic'), ('MS Gothic', 'IPAGothic'), ('ＭＳ 明朝', 'IPAGothic'), ('MS Mincho', 'IPAGothic'), ('Mincho', 'IPAGothic'),
              ('ＭＳ Ｐゴシック', 'IPAPGothic'), ('MS PGothic', 'IPAPGothic'), ('ＭＳ Ｐ明朝', 'IPAPGothic'), ('HG丸ｺﾞｼｯｸM-PRO', 'IPAPGothic'), ('Century', 'Liberation Serif')]


def profile(name, pairs):
    d = os.path.join(work, name)
    os.makedirs(os.path.join(d, 'user'), exist_ok=True)
    items = ['<item oor:path="/org.openoffice.Office.Common/Font/Substitution"><prop oor:name="Replacement" oor:op="fuse"><value>true</value></prop></item>']
    for i, (a, b) in enumerate(pairs):
        items.append(f'<item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs"><node oor:name="_{i}" oor:op="replace">'
                     f'<prop oor:name="Always" oor:op="fuse"><value>true</value></prop><prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop>'
                     f'<prop oor:name="ReplaceFont" oor:op="fuse"><value>{a}</value></prop><prop oor:name="SubstituteFont" oor:op="fuse"><value>{b}</value></prop></node></item>')
    with open(os.path.join(d, 'user', 'registrymodifications.xcu'), 'w', encoding='utf-8') as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" '
                'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' + '\n'.join(items) + '\n</oor:items>\n')
    return 'file://' + d  # 絶対パス（相対にすると LibreOffice が止まったまま終わらない）


IPA = profile('ipa', FONT_PAIRS)


def word_pdf(docx_path, name):
    """.docx → PDF（「行数を指定（グリッド）」を外す：LibreOffice はグリッドに合わせて行を Word より高くし、1枚の様式が2枚にはみ出す）"""
    nogrid = os.path.join(work, name + '-ng.docx')
    zin = zipfile.ZipFile(docx_path)
    zout = zipfile.ZipFile(nogrid, 'w', zipfile.ZIP_DEFLATED)
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'word/document.xml':
            data = re.sub(r'<w:docGrid [^>]*/>', '', data.decode()).encode()
        zout.writestr(item, data)
    zout.close()
    subprocess.run(['soffice', f'-env:UserInstallation={IPA}', '--headless', '--convert-to', 'pdf', '--outdir', work, nogrid], check=True, timeout=300,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return os.path.join(work, name + '-ng.pdf')


def F(name, box, **kw):
    return {'name': name, 'box': [round(v, 2) for v in box], **kw}


inin_pdf = word_pdf(inin_docx, 'miyako-inin')
MS = {'ＭＳ 明朝': 'ＭＳ 明朝', 'ＭＳ ゴシック': 'ＭＳ ゴシック', 'ＭＳ Ｐゴシック': 'ＭＳ Ｐゴシック', 'Century': 'Century'}
pdf_sheets = [
    # みやこ町の委任状：受任者（事業所）の所在地・電話番号・事業所名称及び代表者氏名、保険給付額、委任者（被保険者）の住所。日付・委任者の氏名は自署。
    # 電話番号の「（　）」は外し、1つの欄に「0930-00-0000」と書く（特定福祉用具の久留米市の委任状と同じ）
    {'name': '委任状', 'pdf': inin_pdf, 'segs': [[0, None, None]], 'font': 'ＭＳ 明朝', 'fonts': {'IPAGothic': 'ＭＳ 明朝'},
     'drop': [[339, 199, 351.5, 212, 0], [391.5, 199, 404, 212, 0]],
     'fields': [F('sellerAddress', [233, 150, 526, 197], size=11, wrap=True),
                F('sellerTel', [290, 199, 526, 213], size=11, shrink=True),
                F('seller', [233, 272, 526, 371], size=11, wrap=True),
                F('benefit', [151, 438, 435, 481], h='right', size=14, shrink=True),
                F('address', [212, 537, 520, 551], size=11, shrink=True)]},
    # 福岡市の承諾書（参考様式）：あて先の区（「福岡市　　区長」の間）、申請者氏名・申請者住所（下線の上まで）。住宅の所有者の住所・氏名・連絡先と日付は
    # 所有者が書く（自署）
    {'name': '承諾書', 'pdf': fk_pdf, 'segs': [[0, None, None]], 'font': 'ＭＳ 明朝', 'fonts': MS,
     'fields': [F('ward', [106, 158, 151, 174], h='center', size=12),
                F('name', [251, 419, 477, 435], size=12, shrink=True),
                F('address', [142, 485, 453, 501], size=12, shrink=True)]},
]
spec = {'out': os.path.join(work, 'pdf.xlsx'), 'map': os.path.join(work, 'pdf.map.json'), 'sheets': pdf_sheets}
with open(os.path.join(work, 'spec.json'), 'w', encoding='utf-8') as f:
    json.dump(spec, f, ensure_ascii=False, indent=1)
subprocess.run([sys.executable, '-I', os.path.join(HERE, 'pdf_form_xlsx.py'), os.path.join(work, 'spec.json')], check=True)
mapping = json.load(open(spec['map'], encoding='utf-8'))

# ---------------------------------------------------------------- 行橋市の請求書（市の Excel。LibreOffice で金額の欄を結合）
import uno  # noqa: E402
from com.sun.star.beans import PropertyValue  # noqa: E402

PORT = 2117
lo_profile = tempfile.mkdtemp(prefix='lo-profile-')
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', f'-env:UserInstallation=file://{lo_profile}', f'--accept=socket,host=127.0.0.1,port={PORT};urp;'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


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
yk_out = os.path.join(work, 'yk-claim.xlsx')
try:
    from com.sun.star.table.CellHoriJustify import RIGHT
    from com.sun.star.table.CellVertJustify import CENTER
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(yk_xlsx), '_blank', 0, (prop('Hidden', True),))
    sheets = doc.Sheets
    names = list(sheets.ElementNames)
    claim_name = next(n for n in names if '委任' in n)
    for n in names:
        if n != claim_name:
            sheets.removeByName(n)  # 本人が請求するもの（償還払い）は入れない
    s = sheets.getByIndex(0)
    s.Name = '請求書'
    # 公費負担額・個人負担額・総合計：下線の所（I〜N）を1つの欄に（右ぞろえ・上下中央）
    for area in ('I23:N23', 'I25:N25', 'I27:N27'):
        r = s.getCellRangeByName(area)
        r.merge(True)
        r.HoriJustify = RIGHT
        r.VertJustify = CENTER
    # 印刷：A4 縦・1ページに合わせる（原本は倍率 100% で、字体の幅のちがう PC で2枚に分かれる）
    st = doc.StyleFamilies.getByName('PageStyles').getByName(s.PageStyle)
    st.ScaleToPagesX, st.ScaleToPagesY = 1, 1
    doc.storeToURL(uno.systemPathToFileUrl(yk_out), (prop('FilterName', 'Calc MS Excel 2007 XML'),))
    doc.close(True)
finally:
    try:
        desktop.terminate()
    except Exception:
        pass
    proc.wait(timeout=30)

# ---------------------------------------------------------------- 原本に足す（XML のまま）
ADD = [
    ('miyako.xltx', spec['out'], '委任状', '委任状', '住宅改修費支給申請書(受領委任払用)'),
    ('yukuhashi.xltx', yk_out, '請求書', '請求書', '委任状'),
    ('fukuoka.xltx', spec['out'], '承諾書', '承諾書', '完了届出書（受領委任用)'),
]
for dst, src, src_name, new_name, after in ADD:
    path = os.path.join(shinsei_dir, dst)
    tmp = os.path.join(work, 'new-' + dst)
    subprocess.run([sys.executable, '-I', os.path.join(HERE, 'add-sheet.py'), src, path, tmp, src_name, new_name, after], check=True)
    shutil.copy(tmp, path)

for name, r in mapping.items():
    print(name, json.dumps({k: v.split(':')[0] for k, v in r['fields'].items()}, ensure_ascii=False))
print('work', work)
