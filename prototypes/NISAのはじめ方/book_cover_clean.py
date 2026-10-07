"""本の絵（book-cover.png）の旧題の2行（はじめての／完全ガイド）だけを消す。
・文字とそのふちの画素だけを、まわりの緑からなめらかに埋める（文字のない所は元のまま）
・埋めた所には、表紙のほかの場所（おかねの地図とNISAの間の、文字のない帯）の紙のざらつきをそのまま写す
・元の画素との境目はぼかしてなじませる
使い方：python3 clean.py 元の画像 書き出す画像"""
from PIL import Image, ImageFilter
import numpy as np, sys
src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
im = np.asarray(img).astype(float)
x0, x1, y0, y1 = 228, 792, 492, 738                 # 2行のまわり
reg = im[y0:y1, x0:x1].copy()
h, w, _ = reg.shape
lum = reg.mean(axis=2)
bgl = np.median(lum)
core = lum > bgl + 25                               # 文字（クリーム色）
mask = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(13))) > 0   # ふちのにじみまで
print("masked:", int(mask.sum()), "/", mask.size)
# なめらかな色で埋める（まわりの値をくり返し流し込む）
base = reg.copy()
base[mask] = reg[~mask].mean(axis=0)
for _ in range(2500):
    avg = (np.roll(base, 1, 0) + np.roll(base, -1, 0) + np.roll(base, 1, 1) + np.roll(base, -1, 1)) / 4
    base[mask] = avg[mask]
# 紙のざらつき：文字のない帯（y 240〜304, x 100〜940）の「なめらかな色からのずれ」を、上下を反転させながら並べて写す
band = im[240:304, 100:940]
band_smooth = np.asarray(Image.fromarray(band.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(float)
grain = band - band_smooth
tiles, flip = [], False
while sum(t.shape[0] for t in tiles) < h:
    tiles.append(grain[::-1] if flip else grain); flip = not flip
tex = np.concatenate(tiles, axis=0)[:h, (x0 - 100):(x0 - 100) + w]
filled = base + tex
# 境目をなじませる
alpha = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))).astype(float)[..., None] / 255
alpha = np.clip(alpha * 1.6, 0, 1)
reg_new = reg * (1 - alpha) + filled * alpha
res = im.copy()
res[y0:y1, x0:x1] = reg_new
Image.fromarray(res.clip(0, 255).round().astype(np.uint8)).save(out)
print("->", out)
