"""本の絵（book-cover.png）の上の「おかねの地図」の1行だけを消す（book_cover_clean.py と同じやり方）。
・文字とそのふちの画素だけを、まわりの緑からなめらかに埋める（文字のない所は元のまま）
・埋めた所には、表紙の上の文字のない帯（y 122〜176）の紙のざらつきを写す
・すぐ下の「ゼロからわかる」（橙）にはふれない
使い方：python3 book_cover_unbrand.py 元の画像 書き出す画像"""
from PIL import Image, ImageFilter
import numpy as np, sys

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
im = np.asarray(img).astype(float)
x0, x1, y0, y1 = 340, 700, 176, 248                 # 「おかねの地図」のまわり（「ゼロからわかる」は y 255 から下）
reg = im[y0:y1, x0:x1].copy()
h, w, _ = reg.shape
lum = reg.mean(axis=2)
bgl = np.median(lum)
core = lum > bgl + 25                               # 文字（クリーム色）
mask = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11))) > 0   # ふちのにじみまで
print("masked:", int(mask.sum()), "/", mask.size)
# なめらかな色で埋める（まわりの値をくり返し流し込む）
base = reg.copy()
base[mask] = reg[~mask].mean(axis=0)
for _ in range(2500):
    avg = (np.roll(base, 1, 0) + np.roll(base, -1, 0) + np.roll(base, 1, 1) + np.roll(base, -1, 1)) / 4
    base[mask] = avg[mask]
# 紙のざらつき：上の文字のない帯（y 122〜176, x 140〜930）の「なめらかな色からのずれ」を、上下を反転させながら並べて写す
band = im[122:176, 140:930]
band_smooth = np.asarray(Image.fromarray(band.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(float)
grain = band - band_smooth
tiles, flip = [], False
while sum(t.shape[0] for t in tiles) < h:
    tiles.append(grain[::-1] if flip else grain)
    flip = not flip
tex = np.concatenate(tiles, axis=0)[:h, (x0 - 140):(x0 - 140) + w]
filled = base + tex
# 境目をなじませる
alpha = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))).astype(float)[..., None] / 255
alpha = np.clip(alpha * 1.6, 0, 1)
reg_new = reg * (1 - alpha) + filled * alpha
res = im.copy()
res[y0:y1, x0:x1] = reg_new
Image.fromarray(res.clip(0, 255).round().astype(np.uint8)).save(out)
print("->", out)
