#!/usr/bin/env python3
"""ショートの画面の UI（上のアイコン・右のボタン列・下のタイトル欄）の目安を静止画に重ねて、文字が隠れないか見る。
  python3 -I scripts/safezone.py out.jpg a.png b.png ..."""
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
tiles = []
for f in files:
    im = Image.open(f).convert('RGBA')
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    d.rectangle([0, 0, 1080, 110], fill=(255, 0, 0, 70))            # 上のアイコン帯
    d.rectangle([930, 950, 1080, 1700], fill=(255, 0, 0, 70))       # 右のボタン列
    d.rectangle([0, 1560, 1080, 1920], fill=(255, 0, 0, 70))        # 下のタイトル・チャンネル名
    tiles.append(Image.alpha_composite(im, ov).convert('RGB').resize((432, 768)))
sheet = Image.new('RGB', (len(tiles) * 442 + 10, 788), 'white')
for i, t in enumerate(tiles):
    sheet.paste(t, (10 + i * 442, 10))
sheet.save(out, quality=88)
print(out)
