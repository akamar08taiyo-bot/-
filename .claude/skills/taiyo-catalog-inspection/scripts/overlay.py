import json, os, sys
from PIL import Image, ImageDraw, ImageFont
S = sys.argv[1]
P = json.load(open(f'{S}/listnew/products.json', encoding='utf-8'))
items = json.load(open(f'{S}/insp/crops.json', encoding='utf-8'))
K = 300 / 72
font = ImageFont.truetype('/root/.fonts/BIZUDPGothic-Regular.ttf', 34)
out = f'{S}/insp/overlay'; os.makedirs(out, exist_ok=True)
by_page = {}
for it, p in zip(items, P):
    assert it['key'] == p['key']
    by_page.setdefault(p['page'], []).append((it['id'], p))
tiles = {}
for page, lst in sorted(by_page.items()):
    im = Image.open(f'{S}/insp/pages/kaientai-p{page:03d}.png').convert('RGB')
    d = ImageDraw.Draw(im)
    for pid, p in lst:
        b = p['box']
        d.rectangle((b['x'] * K, b['y'] * K, (b['x'] + b['w']) * K, (b['y'] + b['h']) * K), outline=(230, 0, 0), width=5)
        tx, ty = b['x'] * K + 8, b['y'] * K + 8
        tw = d.textlength(pid, font=font)
        d.rectangle((tx - 4, ty - 2, tx + tw + 6, ty + 40), fill=(255, 255, 210), outline=(230, 0, 0))
        d.text((tx, ty), pid, font=font, fill=(200, 0, 0))
    W, H = im.size
    files = []
    for r in range(3):
        for c in range(2):
            x0 = max(0, c * W // 2 - 60); x1 = min(W, (c + 1) * W // 2 + 60)
            y0 = max(0, r * H // 3 - 60); y1 = min(H, (r + 1) * H // 3 + 60)
            name = f'{out}/p{page}-{"上中下"[r]}{"左右"[c]}.png'
            im.crop((x0, y0, x1, y1)).save(name); files.append(name)
    tiles[page] = files
json.dump(tiles, open(f'{S}/insp/overlay.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('pages', len(tiles))
