# Veo クリップの点検シート：各クリップ 5 コマ（0.3/2/4/6/7.8 秒）を 1 行に
import subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent.parent
ids = sys.argv[2:]
out = root / 'work' / 'veo' / sys.argv[1]
ts = [0.3, 2.0, 4.0, 6.0, 7.8]
tw, th = 480, 270
sheet = Image.new('RGB', (tw * len(ts), (th + 18) * len(ids)), (18, 18, 18))
d = ImageDraw.Draw(sheet)
for r, cid in enumerate(ids):
    src = sorted((root / 'assets' / 'veo').glob(f'{cid}_v*.mp4'))[-1]
    for c, t in enumerate(ts):
        tmp = root / 'work' / 'veo' / f'_{cid}_{c}.jpg'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(src), '-frames:v', '1', '-vf', f'scale={tw}:{th}', str(tmp)], check=True)
        sheet.paste(Image.open(tmp), (c * tw, r * (th + 18) + 18))
    d.text((4, r * (th + 18) + 3), f'{cid}  ({src.name})  0.3s / 2s / 4s / 6s / 7.8s', fill=(255, 255, 255))
sheet.save(out, quality=86)
print(out)
