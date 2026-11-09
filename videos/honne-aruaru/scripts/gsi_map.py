"""国土地理院の地理院タイルで「日本だけを明るく浮かび上がらせた」衛星写真の地図を作る（japan01 の冒頭）。
使い方: python3 -I scripts/gsi_map.py <出力.jpg> [作業フォルダ]
- 全国最新写真（シームレス）ズーム7 を並べて、色別標高図（同じ範囲）の色から陸を見分ける
- 日本の陸はそのまま少し明るく、海と外国はうす暗い紺にして、タイルの継ぎ目を目立たなくする
- タイルは 0.25 秒あけて取る（国土地理院のサーバーに負荷をかけない）
出典の書き方：「地図：国土地理院 地理院タイル（写真。ズームレベル7は世界衛星モザイク画像。色別標高図）を加工して作成。色別標高図の海域部は海上保安庁海洋情報部の資料を使用して作成」
  と、世界衛星モザイク画像の英文（NASA LP DAAC。README の「実写の回」）
"""
import math, os, subprocess, sys, time
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

OUT = sys.argv[1]
WORK = sys.argv[2] if len(sys.argv) > 2 else 'work/gsi'
os.makedirs(WORK, exist_ok=True)
Z = 7
LON0, LON1, LAT0, LAT1 = 128.3, 146.2, 30.2, 45.8


def tx(lon):
    return (lon + 180) / 360 * 2**Z


def ty(lat):
    r = math.radians(lat)
    return (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**Z


X0, X1, Y0, Y1 = int(tx(LON0)), int(tx(LON1)), int(ty(LAT1)), int(ty(LAT0))
BOX = (int((tx(LON0) - X0) * 256), int((ty(LAT1) - Y0) * 256), int((tx(LON1) - X0) * 256), int((ty(LAT0) - Y0) * 256))


def mosaic(layer, ext):
    canvas = Image.new('RGB', ((X1 - X0 + 1) * 256, (Y1 - Y0 + 1) * 256))
    for x in range(X0, X1 + 1):
        for y in range(Y0, Y1 + 1):
            f = os.path.join(WORK, f'{layer}_{Z}_{x}_{y}.{ext}')
            if not os.path.exists(f):
                time.sleep(0.25)
                r = subprocess.run(['curl', '-sS', '-m', '30', '-o', f, '-w', '%{http_code}', f'https://cyberjapandata.gsi.go.jp/xyz/{layer}/{Z}/{x}/{y}.{ext}'], capture_output=True, text=True)
                if r.stdout != '200':
                    os.path.exists(f) and os.remove(f)
                    continue
            canvas.paste(Image.open(f).convert('RGB'), ((x - X0) * 256, (y - Y0) * 256))
    return canvas.crop(BOX)


sat = mosaic('seamlessphoto', 'jpg')
rel = np.asarray(mosaic('relief', 'png'), dtype=np.int16)
R, G, B = rel[..., 0], rel[..., 1], rel[..., 2]
land = (B < 120) | ((R > 200) & (G > 200) & (B > 200))  # 色別標高図：陸は青が弱い（海は青、外国は灰青）
mask = Image.fromarray((land * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(2.5))
dark = Image.blend(Image.eval(sat, lambda v: int(v * 0.32)), Image.new('RGB', sat.size, (5, 14, 32)), 0.55)
lit = ImageEnhance.Color(ImageEnhance.Brightness(sat).enhance(1.2)).enhance(1.2)
out = Image.composite(lit, dark, mask)
edge = mask.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(3)).point(lambda v: min(255, v * 3))
out = Image.composite(Image.new('RGB', sat.size, (255, 236, 170)), out, edge.point(lambda v: int(v * 0.35)))
out.save(OUT, quality=93)
print(OUT, out.size)
