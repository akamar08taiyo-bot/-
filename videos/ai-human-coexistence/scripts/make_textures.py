# フィルム粒子・紙の質感テクスチャを作る（決定的シード）
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path

out = Path(__file__).resolve().parent.parent / 'public' / 'tex'
out.mkdir(parents=True, exist_ok=True)
rs = np.random.RandomState(20261011)
for i in range(8):
    n = rs.normal(0, 1, (512, 512)).astype(np.float32)
    img = Image.fromarray(np.clip(128 + n * 46, 0, 255).astype(np.uint8), 'L')
    img = img.filter(ImageFilter.GaussianBlur(0.65))
    a = np.asarray(img).astype(np.float32)
    a = (a - a.mean()) / (a.std() + 1e-6) * 40 + 128
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L').save(out / f'grain{i}.png')

# 紙の質感（ゆっくりした斑）
n = rs.normal(0, 1, (1024, 1024)).astype(np.float32)
img = Image.fromarray(np.clip(128 + n * 60, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(3))
a = np.asarray(img).astype(np.float32)
a = (a - a.mean()) / (a.std() + 1e-6) * 22 + 128
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L').save(out / 'paper.png')
print('ok')
