#!/usr/bin/env python3
"""画像を縮小して並べた一覧（目で見て確認する用）。 python3 -I scripts/img_sheet.py out.jpg a.png b.png ..."""
import sys
from PIL import Image, ImageDraw, ImageFont
out, files = sys.argv[1], sys.argv[2:]
W = 480
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    im = im.resize((W, int(im.height * W / im.width)))
    ims.append((f, im))
cols = min(5, len(ims))
rows = (len(ims) + cols - 1) // cols
H = max(im.height for _, im in ims) + 40
sheet = Image.new('RGB', (cols * (W + 10) + 10, rows * H + 10), 'white')
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 24)
for i, (f, im) in enumerate(ims):
    x, y = 10 + (i % cols) * (W + 10), 10 + (i // cols) * H
    sheet.paste(im, (x, y + 34))
    d.text((x, y), f.split('/')[-1], fill='black', font=font)
sheet.save(out, quality=90)
print(out, sheet.size)
