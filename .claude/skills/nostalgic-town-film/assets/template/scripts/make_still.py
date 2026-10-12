# 原画（assets/gen の静止画）から、止め絵のカット（差し込み・思い出の写真）を作る
# 使い方: python3 -I scripts/make_still.py <新しいID> <原画> [--crop x0,y0,x1] [--dur 6] [--raw]
#   --crop：原画の中の切り抜き（割合。左上 x0,y0 と右端 x1。高さは 16:9 になるように決まる）。省略時は全体
#   --dur：止め絵の長さ（秒）。押し寄せ（ゆっくり寄る）は timeline.json の push で付ける
#   --raw：字の焼き込みや思い出の色をあとでかける時。work/raw/<ID>.mp4 に書き、bake_ink.py で public/clips に作る
# 出力：public/clips/<ID>.mp4（または work/raw/<ID>.mp4）と、最初・最後のコマの jpg
# 2026年10月、第二章の作り直しで：Veo の動きが崩れるカットは、崩れない数秒だけを使い、残りは原画の止め絵で見せることにした。
#   止め絵は同じ構図のまま動き出すとコマ落ちに見えるので、差し込みは切り抜きで構図を変える（カードの寄り、額の寄りなど）
import argparse, subprocess
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('id'); ap.add_argument('image')
ap.add_argument('--crop'); ap.add_argument('--dur', type=float, default=6.0); ap.add_argument('--raw', action='store_true')
a = ap.parse_args()
src = Path(a.image) if Path(a.image).is_absolute() else root / a.image
im = Image.open(src).convert('RGB'); W, H = im.size
if a.crop:
    x0, y0, x1 = (float(v) for v in a.crop.split(','))
    cw = (x1 - x0) * W; ch = cw * 9 / 16
    box = (int(round(x0 * W)), int(round(y0 * H)), int(round(x0 * W + cw)), int(round(y0 * H + ch)))
    assert box[3] <= H + 1, f'切り抜きが下にはみ出す: {box}'
    im = im.crop(box)
im = im.resize((1920, 1080), Image.LANCZOS)
work = root / 'work' / 'stills'; work.mkdir(parents=True, exist_ok=True)
png = work / f'{a.id}.png'; im.save(png)
dst = (root / 'work' / 'raw' if a.raw else root / 'public' / 'clips') / f'{a.id}.mp4'
dst.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', str(png), '-t', f'{a.dur:.3f}', '-r', '30',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dst)], check=True)
pub = root / 'public' / 'clips'
for name in ('first', 'last'):
    im.save(pub / f'{a.id}_{name}.jpg', quality=92)
print(a.id, '<-', src.name, a.crop or 'full', f'{a.dur}s', '->', dst.relative_to(root))
