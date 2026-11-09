"""国土地理院の地理院タイル（写真）で、広い範囲の衛星写真の地図を縦長（1536×2752）に作る。どの国も強調しない明るさにそろえる。
使い方:
  python3 -I scripts/gsi_area_map.py <出力.jpg> --lon 66 156 --lat -45 46 [--zoom 5] [--blur <ぼかした版.jpg>] [--pin 名前:経度,緯度 ...]
- 写真のタイル（seamlessphoto）は、ズームレベル2〜8では「世界衛星モザイク画像」になる。その場合は国土地理院の出典に加えて、
  地理院タイル一覧の備考の英文（NASA LP DAAC）も書く（README の「実写の回」）。
- --pin を付けると、その場所が絵の上のどこか（0〜1）を出す（カメラの x・y や、地図の印 pin に使う）。
- タイルは 0.25 秒あけて取る（国土地理院のサーバーに負荷をかけない）。取ったタイルは作業フォルダにためて使い回す。
"""
import argparse, math, os, subprocess, time
from PIL import Image, ImageEnhance, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--lon', nargs=2, type=float, required=True)
ap.add_argument('--lat', nargs=2, type=float, required=True)
ap.add_argument('--zoom', type=int, default=5)
ap.add_argument('--blur')
ap.add_argument('--pin', nargs='*', default=[])
ap.add_argument('--work', default='work/gsi_area')
a = ap.parse_args()
os.makedirs(a.work, exist_ok=True)
Z = a.zoom
LON0, LON1 = a.lon
LAT0, LAT1 = sorted(a.lat)  # LAT0 が南、LAT1 が北


def tx(lon):
    return (lon + 180) / 360 * 2**Z


def ty(lat):
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**Z


X0, X1, Y0, Y1 = int(tx(LON0)), int(tx(LON1)), int(ty(LAT1)), int(ty(LAT0))
canvas = Image.new('RGB', ((X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256), (6, 15, 33))
for x in range(X0, X1 + 1):
    for y in range(Y0, Y1 + 1):
        f = os.path.join(a.work, f'sp_{Z}_{x}_{y}.jpg')
        if not os.path.exists(f):
            time.sleep(0.25)
            r = subprocess.run(['curl', '-sS', '-m', '30', '-o', f, '-w', '%{http_code}', f'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{Z}/{x}/{y}.jpg'], capture_output=True, text=True)
            if r.stdout != '200':
                print('タイルなし', x, y, r.stdout)
                os.path.exists(f) and os.remove(f)
                continue
        canvas.paste(Image.open(f).convert('RGB'), ((x - X0) * 256, (y - Y0) * 256))
# 世界衛星モザイク画像には、データの無い海が灰色（52,52,52）で入っているので、海の色で埋める
import numpy as np
arr = np.asarray(canvas).astype(np.int16)
gray = (np.abs(arr - 52).max(axis=2) <= 6) & ((arr.max(axis=2) - arr.min(axis=2)) <= 3)
nodata = Image.fromarray((gray * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
canvas = Image.composite(Image.new('RGB', canvas.size, (11, 17, 36)), canvas, nodata)
bx0, by0 = (tx(LON0) - X0) * 256, (ty(LAT1) - Y0) * 256
box = (int(bx0), int(by0), int((tx(LON1) - X0) * 256), int((ty(LAT0) - Y0) * 256))
m = canvas.crop(box)
m = ImageEnhance.Brightness(ImageEnhance.Color(m).enhance(0.9)).enhance(0.8)  # どの国も強調しない
IW, IH = 1536, 2752
s = IW / m.size[0]
mw, mh = IW, int(m.size[1] * s)
m = m.resize((mw, mh), Image.LANCZOS)
top = (IH - mh) // 2 - 40
bg = Image.new('RGB', (IW, IH), (6, 15, 33))
alpha = Image.new('L', (mw, mh), 255)
fade = 160
for yy in range(min(fade, mh)):
    v = int(255 * yy / fade)
    alpha.paste(v, (0, yy, mw, yy + 1))
    alpha.paste(v, (0, mh - 1 - yy, mw, mh - yy))
bg.paste(m, (0, max(top, 0)), alpha)
bg.save(a.out, quality=92)
print(a.out, 'map', m.size, 'top', top)
if a.blur:
    ImageEnhance.Brightness(bg.filter(ImageFilter.GaussianBlur(6))).enhance(0.85).save(a.blur, quality=88)
    print(a.blur)
for p in a.pin:
    name, ll = p.split(':')
    lon, lat = map(float, ll.split(','))
    px = ((tx(lon) - X0) * 256 - box[0]) * s
    py = max(top, 0) + ((ty(lat) - Y0) * 256 - box[1]) * s
    print(f'{name}: x {px / IW:.3f}, y {py / IH:.3f}')
