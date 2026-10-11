# work/stills/last.txt の静止画を縮小して 1 枚のシートにする
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
files = [Path(p) for p in (root / 'work' / 'stills' / 'last.txt').read_text().split('\n') if p]
cols = int(sys.argv[1]) if len(sys.argv) > 1 else 2
tw, th = 960, 540
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 24)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * (th + 24)
    sheet.paste(im, (x, y + 24))
    d.text((x + 6, y + 4), f.stem, fill=(255, 255, 255))
out = root / 'work' / 'stills' / 'sheet.jpg'
sheet.save(out, quality=85)
print(out)
