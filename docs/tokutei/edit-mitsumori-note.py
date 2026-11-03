# 販売見積書の原本（src/tokutei/print/mitsumori.xltx）を直したときの手順（2026-11-03。一度だけ動かしたもの。直し方の記録として残す）。
# ユーザーの指示（御見積書のスクリーンショットに）：「消費税については、この部分では不要の為、代わりに備考欄にする（行数を増やす）」
# 「行数をつくり、１商品目と２商品目の間には１行開ける。３商品までは一度に入力できるようにする」
#   python3 docs/tokutei/edit-mitsumori-note.py src/tokutei/print/mitsumori.xltx
# 1. 御見積合計の右の「※※消費税について※※」の枠（H45:K51）を備考の欄に：見出し（H45:K46）を「備　　考」（下の備考の見出しと同じ字）にして、
#    説明の3行（H47〜H49「・左記の消費税は参考となります。」…）を消す。H47〜H51 の5行が備考の行（前の下の備考は3行）。書式（縮小して全体を表示）はそのまま
# 2. 下の備考（58〜62行：すき間・見出し・3行）は隠す（印刷の範囲 A1:K62 はそのまま。隠した行は印刷されない）
# 3. 明細は16行→20行（2026-10-25 に隠した 39〜42行を戻す。1ページ目の高さは下の備考を隠した分とほぼ同じ＝1ページ目は1枚のまま）。
#    3商品（品名3行）＋商品の間の1行＋介護保険の内訳が1ページ目に入る（アプリの estimateBook.ts の estimateLayout）
import re
import sys
import zipfile

path = sys.argv[1]
z = zipfile.ZipFile(path)
files = {n: z.read(n) for n in z.namelist()}
infos = {i.filename: i for i in z.infolist()}
sheet = files['xl/worksheets/sheet1.xml'].decode()
shared = files['xl/sharedStrings.xml'].decode()

sis = re.findall(r'<si>.*?</si>', shared, re.S)
def index_of(text):
    for i, x in enumerate(sis):
        if re.sub(r'<rPh.*?</rPh>', '', x).find(f'<t>{text}</t>') >= 0:
            return i
    raise SystemExit(f'not found: {text}')
note_head = index_of('備　　考')
tax_head = index_of('※※消費税について※※')

# ---- 1. 見出しを「備　　考」に、説明の3行を消す
before = sheet
sheet = sheet.replace(f'<c r="H45" s="232" t="s"><v>{tax_head}</v></c>', f'<c r="H45" s="232" t="s"><v>{note_head}</v></c>', 1)
assert sheet != before, 'H45'
removed = 0
for ref in ['H47', 'H48', 'H49']:
    m = re.search(rf'<c r="{ref}" s="(\d+)" t="s"><v>\d+</v></c>', sheet)
    assert m, ref
    sheet = sheet.replace(m.group(0), f'<c r="{ref}" s="{m.group(1)}"/>', 1)
    removed += 1
# 共有の文字の数（count＝使っている所の数。消費税についての見出し・説明の3行が減り、備考の見出しが1つ増える）
m = re.search(r'<sst [^>]*count="(\d+)"', shared)
shared = shared.replace(m.group(0), m.group(0).replace(f'count="{m.group(1)}"', f'count="{int(m.group(1)) - removed}"'), 1)


# ---- 2・3. 行を隠す・戻す
def set_hidden(xml, r, hide):
    m = re.search(rf'<row r="{r}"(?=[\s/>])[^>]*?>', xml)
    assert m, r
    tag = m.group(0)
    new = re.sub(r'\shidden="1"', '', tag)
    if hide:
        new = new.replace(f'<row r="{r}"', f'<row r="{r}" hidden="1"', 1)
    return xml.replace(tag, new, 1)


for r in [39, 40, 41, 42]:
    sheet = set_hidden(sheet, r, False)
for r in [58, 59, 60, 61, 62]:
    sheet = set_hidden(sheet, r, True)

files['xl/worksheets/sheet1.xml'] = sheet.encode()
files['xl/sharedStrings.xml'] = shared.encode()
with zipfile.ZipFile(path, 'w') as out:
    for name, data in files.items():
        out.writestr(infos[name], data)
print('ok')
