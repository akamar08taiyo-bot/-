#!/usr/bin/env python3
"""場面の絵を Gemini で作り、版ごとに記録する。

  python3 -I scripts/gen_image.py --ep honne01 sheet          # 人物の設定画（横長）
  python3 -I scripts/gen_image.py --ep honne02 S3 [--extra "直したい点"]

場面の絵は、人物の設定画（assets/characters/sheet_v<n> の最新版）を毎回参照させる（--refs で変えられる）。
指示文は episodes/<回>/prompts.json。
出力: episodes/<回>/gen/<ID>_v<n>.png と ledger.json（プロンプト・モデル・時間・使用量）
"""
import argparse, glob, json, os, re, sys, time
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gapi
from common import ROOT, episode

EP = episode()
GEN = EP.gen
os.makedirs(GEN, exist_ok=True)
P = json.load(open(os.path.join(EP.dir, 'prompts.json'), encoding='utf-8'))
# 人物の設定画は assets/characters/sheet_v<n> のいちばん新しい版（原本の .png が無ければ、リポジトリに入れてある .jpg）
_sheets = sorted(glob.glob(os.path.join(ROOT, 'assets', 'characters', 'sheet_v*.png')) + glob.glob(os.path.join(ROOT, 'assets', 'characters', 'sheet_v*.jpg')),
                 key=lambda p: (int(re.findall(r'_v(\d+)', p)[-1]), p.endswith('.png')))
SHEET = _sheets[-1] if _sheets else ''
ap = argparse.ArgumentParser()
ap.add_argument('id')
ap.add_argument('--refs', default=None, help='参照画像（カンマ区切り）。省略時は場面なら人物の設定画')
ap.add_argument('--extra', default='')
ap.add_argument('--model', default='gemini-3-pro-image')
ap.add_argument('--size', default='2K')
a = ap.parse_args()

refs = [r for r in (a.refs if a.refs is not None else ('' if a.id == 'sheet' else SHEET)).split(',') if r]
if a.id == 'sheet':
    text = f"{P['style']}\n\nCharacters:\n{P['characters']}\n\n{P['sheet']}"
    aspect = '16:9'
else:
    sc = next(s for s in P['scenes'] if s['id'] == a.id)
    text = f"{P['style']}\n\nCharacters:\n{P['characters']}\n\n{P['vertical']}\n\nScene:\n{sc['prompt']}"
    aspect = '9:16'
if refs and a.id == 'sheet':
    text = ('The attached image is the previous character design sheet. Keep exactly the same characters: same faces, '
            'hairstyles, glasses, earrings and outfits, in the same art style and colors, and add the new details '
            'described below. Do not add any text.\n\n' + text)
elif refs:
    text = ('The attached image is the character design sheet. Draw exactly the same characters: same faces, '
            'hairstyles, glasses, earrings and outfits, in the same art style and colors. Do not copy the sheet '
            'layout and do not add any text.\n\n' + text)
if a.extra:
    text += '\n\nRevision notes:\n' + a.extra

n = 1
while True:  # 並列に走らせても同じ版番号を取り合わないよう、ファイルを先に確保する
    out = os.path.join(GEN, f'{a.id}_v{n}.png')
    try:
        os.close(os.open(out, os.O_CREAT | os.O_EXCL))
        break
    except FileExistsError:
        n += 1
t0 = time.time()
usage, notes = gapi.image(text, out, refs=refs, model=a.model, aspect=aspect, size=a.size)
dt = time.time() - t0
from PIL import Image
im = Image.open(out)
if im.format != 'PNG':
    im.save(out, 'PNG')
w, h = im.size
led_path = os.path.join(GEN, 'ledger.json')
led = json.load(open(led_path)) if os.path.exists(led_path) else {'records': []}
led['records'].append({'id': f'{a.id}_v{n}', 'model': a.model, 'size': a.size, 'px': [w, h], 'refs': refs,
                       'extra': a.extra, 'seconds': round(dt, 1), 'usage': usage, 'model_text': notes,
                       'created_utc': datetime.now(timezone.utc).isoformat(), 'prompt': text})
json.dump(led, open(led_path, 'w'), ensure_ascii=False, indent=1)
print(f'{os.path.relpath(out, ROOT)} {w}x{h} {dt:.1f}s')
