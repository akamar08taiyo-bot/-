# 販売見積書の原本（src/tokutei/print/mitsumori.xltx）の印の枠の上に、小さな横長の枠で「所長印」「担当印」を足したときの手順
# （2026-10-26。一度だけ動かしたもの。直し方の記録として残す。前の直しは edit-mitsumori-template.py）。
# ユーザーの指示：「□の印鑑欄の上に　小さく横□で囲み、左が所長印　右が担当印と記載する」。
#   python3 docs/tokutei/edit-mitsumori-stamp-labels.py src/tokutei/print/mitsumori.xltx
# 印の枠（グループ化 1。K17〜K20 の右の端）の外の大きさはほぼそのまま（上を 6pt だけ広げる＝担当の行の下まで）、
# 上の 12pt を名前の枠（細い線・7pt の字・まん中）、その下を印の枠（今までと同じ二重の線）にする。
# グループの中の位置（chOff・chExt）は外の位置と同じにして、中の図形を EMU のまま書く
import re
import sys
import zipfile

PT = 12700  # 1pt の EMU
path = sys.argv[1]
z = zipfile.ZipFile(path)
files = {n: z.read(n) for n in z.namelist()}
infos = {i.filename: i for i in z.infolist()}
drawing = files['xl/drawings/drawing1.xml'].decode()
assert '所長印' not in drawing, 'もう直してある'

# ---- グループの外の位置：上を 6pt 広げる（17行目の上から 7.5pt → 1.5pt）
grp_xfrm = re.search(r'<xdr:grpSpPr><a:xfrm>(.*?)</a:xfrm></xdr:grpSpPr>', drawing, re.S)
x = int(re.search(r'<a:off x="(\d+)"', grp_xfrm.group(1)).group(1))
y = int(re.search(r'<a:off x="\d+" y="(\d+)"', grp_xfrm.group(1)).group(1))
cx = int(re.search(r'<a:ext cx="(\d+)"', grp_xfrm.group(1)).group(1))
cy = int(re.search(r'<a:ext cx="\d+" cy="(\d+)"', grp_xfrm.group(1)).group(1))
grow = 6 * PT
y, cy = y - grow, cy + grow
drawing = drawing.replace(grp_xfrm.group(1), f'<a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/><a:chOff x="{x}" y="{y}"/><a:chExt cx="{cx}" cy="{cy}"/>', 1)
drawing = drawing.replace('<xdr:row>16</xdr:row><xdr:rowOff>95250</xdr:rowOff>', f'<xdr:row>16</xdr:row><xdr:rowOff>{95250 - grow}</xdr:rowOff>', 1)

# ---- 中の図形：左（所長印）・右（担当印）。すき間は前と同じ割合
old_w, old_gap, old_cx = 1028700, 47625, 2105025
gap = round(old_gap * cx / old_cx)
w = (cx - gap) // 2
label_h = 12 * PT
xs = [x, x + w + gap]
rects = re.findall(r'<xdr:sp macro="" textlink="">.*?</xdr:sp>', drawing, re.S)
assert len(rects) == 2
# 原本の2つの四角：左（x=5229225）・右（x=6305550）
by_x = sorted(rects, key=lambda r: int(re.search(r'<a:off x="(\d+)"', r).group(1)))
for r, left in zip(by_x, xs):
    nr = re.sub(r'<a:off x="\d+" y="\d+"/><a:ext cx="\d+" cy="\d+"/>', f'<a:off x="{left}" y="{y + label_h}"/><a:ext cx="{w}" cy="{cy - label_h}"/>', r, count=1)
    drawing = drawing.replace(r, nr, 1)


def label(id_, name, left, text):
    return (
        f'<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="{id_}" name="{name}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>'
        f'<xdr:spPr><a:xfrm><a:off x="{left}" y="{y}"/><a:ext cx="{w}" cy="{label_h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>'
        '<a:ln w="6350"><a:solidFill><a:sysClr val="windowText" lastClr="000000"><a:lumMod val="50000"/><a:lumOff val="50000"/></a:sysClr></a:solidFill></a:ln></xdr:spPr>'
        '<xdr:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/><a:lstStyle/>'
        f'<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ja-JP" altLang="en-US" sz="700"><a:solidFill><a:srgbClr val="333333"/></a:solidFill>'
        f'<a:latin typeface="BIZ UDP明朝 Medium"/><a:ea typeface="BIZ UDP明朝 Medium"/></a:rPr><a:t>{text}</a:t></a:r></a:p></xdr:txBody></xdr:sp>'
    )


ids = [int(i) for i in re.findall(r'<xdr:cNvPr id="(\d+)"', drawing)]
add = label(max(ids) + 1, '所長印の名前', xs[0], '所長印') + label(max(ids) + 2, '担当印の名前', xs[1], '担当印')
drawing = drawing.replace('</xdr:grpSp>', add + '</xdr:grpSp>', 1)
files['xl/drawings/drawing1.xml'] = drawing.encode()
with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as out:
    for n, data in files.items():
        info = infos[n]
        info.compress_type = zipfile.ZIP_DEFLATED
        out.writestr(info, data)
print('ok', x, y, cx, cy, w, gap)
