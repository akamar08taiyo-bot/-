#!/usr/bin/env python3
"""絵がまだ無い場面に、灰色の仮の絵（場面名と顔の枠）を置く。画面の確認だけ先にするとき用。

  python3 -I scripts/placeholders.py --ep honne02

episodes/<回>/prompts.json の場面のうち public/<回>/img/<場面>.jpg が無いものを作る。
生成した絵で上書きする前提なので、git には入れない（作った絵を置いたら消える）。
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import episode

EP = episode()
P = json.load(open(os.path.join(EP.dir, 'prompts.json'), encoding='utf-8'))
F = json.load(open(os.path.join(EP.dir, 'faces.json')))
font = ImageFont.truetype('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 90)
small = ImageFont.truetype('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 48)
os.makedirs(os.path.join(EP.pub, 'img'), exist_ok=True)
for sc in P['scenes']:
    out = os.path.join(EP.pub, 'img', f"{sc['id']}.jpg")
    if os.path.exists(out):
        continue
    im = Image.new('RGB', (1536, 2752), (150, 146, 140))
    d = ImageDraw.Draw(im)
    for f in F.get(sc['id'], []):
        y0, x0, y1, x1 = [v / 1000 for v in f['box']]
        d.rectangle([x0 * 1536, y0 * 2752, x1 * 1536, y1 * 2752], outline=(255, 255, 255), width=8)
        d.text((x0 * 1536 + 10, y0 * 2752 + 10), f['who'], fill='white', font=small)
    d.text((120, 1300), f"{sc['id']}（生成待ちの仮の絵）", fill='white', font=font)
    im.save(out, quality=80)
    print('placeholder', os.path.relpath(out, EP.pub))
