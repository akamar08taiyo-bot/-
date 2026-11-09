# 住宅改修カタログ：押す枠ごとに「カタログの字（切り抜き・拡大）」と「アプリの品番」を並べた見くらべ表（1枚24行）と、
# 枠を描いたページの絵（上下2つ）を作る
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
S = sys.argv[1]
D = json.load(open(f'{S}/insp/jutaku/data.json', encoding='utf-8'))
font = ImageFont.truetype('/root/.fonts/BIZUDPGothic-Regular.ttf', 30)
small = ImageFont.truetype('/root/.fonts/BIZUDPGothic-Regular.ttf', 22)
out = f'{S}/insp/jutaku'
manifest = {}
for book, pages in D.items():
    os.makedirs(f'{out}/{book}-sheets', exist_ok=True)
    os.makedirs(f'{out}/{book}-pages', exist_ok=True)
    rows = []
    for p in pages:
        im = Image.open(f'/home/user/-/catalog-{book}/{book}-p{p["page"]:03d}.jpg').convert('RGB')
        W, H = im.size
        for i, (code, x, y, w, h) in enumerate(p['codes']):
            x0 = max(0, int(x * W) - 24); y0 = max(0, int(y * H) - 14)
            x1 = min(W, int((x + w) * W) + 24); y1 = min(H, int((y + h) * H) + 14)
            crop = im.crop((x0, y0, x1, y1))
            # 枠そのものを赤で示す
            d = ImageDraw.Draw(crop)
            d.rectangle((int(x * W) - x0 - 4, int(y * H) - y0 - 4, int((x + w) * W) - x0 + 4, int((y + h) * H) - y0 + 4), outline=(230, 0, 0), width=1)
            crop = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
            rows.append({'no': len(rows) + 1, 'page': p['page'], 'code': code, 'crop': crop})
        # 枠を描いたページ（上半分・下半分、1.5倍）
        ov = im.copy(); d = ImageDraw.Draw(ov)
        for code, x, y, w, h in p['codes']:
            d.rectangle((x * W - 4, y * H - 4, (x + w) * W + 4, (y + h) * H + 4), outline=(230, 0, 0), width=2)
        for half, (a, b) in (('上', (0, H // 2 + 40)), ('下', (H // 2 - 40, H))):
            t = ov.crop((0, a, W, b)); t = t.resize((int(t.width * 1.5), int(t.height * 1.5)), Image.LANCZOS)
            t.save(f'{out}/{book}-pages/p{p["page"]:03d}-{half}.png')
    # 見くらべ表：2列×12行
    sheets = []
    PER = 24
    for si in range(0, len(rows), PER):
        chunk = rows[si:si + PER]
        colw = 760
        rh = [max(r['crop'].height, 70) + 16 for r in chunk]
        left = chunk[:12]; right = chunk[12:]
        hh = max(sum(max(r['crop'].height, 70) + 16 for r in col) for col in (left, right) if col) + 10
        sheet = Image.new('RGB', (colw * 2 + 20, hh), 'white')
        d = ImageDraw.Draw(sheet)
        for ci, col in enumerate((left, right)):
            yy = 5
            for r in col:
                X = ci * (colw + 20)
                c = r['crop']
                if c.width > 430:
                    c = c.resize((430, int(c.height * 430 / c.width)), Image.LANCZOS)
                d.text((X + 2, yy + 2), f'{r["no"]}', font=small, fill=(90, 90, 90))
                sheet.paste(c, (X + 60, yy))
                d.text((X + 500, yy + 4), f'p.{r["page"]}', font=small, fill=(90, 90, 90))
                d.text((X + 500, yy + 30), r['code'], font=font, fill=(0, 70, 160))
                yy += max(c.height, 70) + 16
                d.line((X, yy - 8, X + colw, yy - 8), fill=(200, 200, 200), width=1)
        name = f'{out}/{book}-sheets/sheet{si // PER + 1:03d}.png'
        sheet.save(name)
        sheets.append({'file': name, 'from': chunk[0]['no'], 'to': chunk[-1]['no']})
    manifest[book] = {'sheets': sheets, 'rows': [{k: r[k] for k in ('no', 'page', 'code')} for r in rows], 'pages': [p['page'] for p in pages]}
    print(book, 'rows', len(rows), 'sheets', len(sheets))
json.dump(manifest, open(f'{out}/manifest.json', 'w', encoding='utf-8'), ensure_ascii=False)
