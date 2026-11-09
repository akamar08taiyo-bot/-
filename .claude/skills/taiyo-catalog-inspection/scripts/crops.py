# 介援隊カタログの商品ごとの切り抜き（300dpi）。正解（アプリの読み取り）は書き込まない
import json, os, sys
from PIL import Image
S = sys.argv[1]
P = json.load(open(f'{S}/listnew/products.json', encoding='utf-8'))
K = 300 / 72
out = f'{S}/insp/crops'
os.makedirs(out, exist_ok=True)
by_page = {}
for p in P:
    by_page.setdefault(p['page'], []).append(p)
items = []
MAXPX = 1500
for page, prods in sorted(by_page.items()):
    im = Image.open(f'{S}/insp/pages/kaientai-p{page:03d}.png').convert('RGB')
    W, H = im.size
    for i, p in enumerate(prods, 1):
        pid = f'p{page}-{i:02d}'
        b = p['box']
        x0 = max(0, (b['x'] - 6) * K); y0 = max(0, (b['y'] - 6) * K)
        x1 = min(W, (b['x'] + b['w'] + 6) * K); y1 = min(H, (b['y'] + b['h'] + 6) * K)
        w, h = x1 - x0, y1 - y0
        nx = max(1, int(-(-w // MAXPX))); ny = max(1, int(-(-h // MAXPX)))
        tw, th = w / nx, h / ny
        files = []
        for yi in range(ny):
            for xi in range(nx):
                ox = 60 if nx > 1 else 0; oy = 60 if ny > 1 else 0
                cx0 = max(x0, x0 + xi * tw - ox); cy0 = max(y0, y0 + yi * th - oy)
                cx1 = min(x1, x0 + (xi + 1) * tw + ox); cy1 = min(y1, y0 + (yi + 1) * th + oy)
                name = f'{pid}' + (f'-{yi * nx + xi + 1}' if nx * ny > 1 else '') + '.png'
                im.crop((int(cx0), int(cy0), int(cx1), int(cy1))).save(f'{out}/{name}')
                files.append(f'{out}/{name}')
        items.append({'id': pid, 'page': page, 'key': p['key'], 'files': files, 'tiles': len(files)})
json.dump(items, open(f'{S}/insp/crops.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(items), 'files', sum(i['tiles'] for i in items), 'multi', sum(1 for i in items if i['tiles'] > 1))
