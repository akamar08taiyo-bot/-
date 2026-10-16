"""テスト用のメーカー仕切り表PDFを作る。
1) 日本語フォントを埋め込まない CID フォント（UniJIS-UCS2-H）… pdf.js が CMap を必要とする形
"""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

out = sys.argv[1]
pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
c = canvas.Canvas(out, pagesize=A4)
W, H = A4
c.setFont("HeiseiKakuGo-W5", 14)
c.drawString(40, H - 50, "株式会社サンプル精工　手すり部材 仕切価格表（2026年4月改定）")
c.setFont("HeiseiKakuGo-W5", 9)
cols = [40, 110, 330, 420]  # 品番, 商品名, 定価(右寄せの右端), 仕切(右寄せの右端)
y = H - 90
c.drawString(cols[0], y, "品番"); c.drawString(cols[1], y, "商品名")
c.drawRightString(cols[2] + 40, y, "定価"); c.drawRightString(cols[3] + 40, y, "仕切価格")
rows = [
    ("TS-35-600", "木製手すり 35φ 600mm", 4800, 3360),
    ("TS-35-2000", "木製手すり 35φ 2000mm", 14000, 9800),
    ("BK-E01", "エンドブラケット", 2100, 1470),
    ("BK-I02", "I型ブラケット", 1900, 1330),
    ("EC-35", "エンドキャップ 35φ", 500, 350),
    ("CN-L90", "L型コーナー（自在）", 3200, 2240),
]
for i, (code, name, teika, shikiri) in enumerate(rows):
    y -= 18
    c.drawString(cols[0], y, code)
    c.drawString(cols[1], y, name)
    c.drawRightString(cols[2] + 40, y, f"{teika:,}")
    c.drawRightString(cols[3] + 40, y, f"{shikiri:,}")
c.drawString(40, 40, "- 1 -")
c.showPage()
c.save()
print("wrote", out)
