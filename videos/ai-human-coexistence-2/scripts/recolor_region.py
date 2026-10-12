# 画像の一部の色だけを塗り替える（Gemini を使わない手元の修正）。実在の店に似た看板の色を、この町のオリジナルの色にするときなど
# 使い方: python3 -I scripts/recolor_region.py <元画像> <出力> --box x0,y0,x1,y1 --map 45-85:9:150:0.85 --map 95-125:12:120:0.55 [--note "..."]
#   --map 色相の範囲（OpenCV の 0〜180）:新しい色相:彩度の上限:明るさの倍率。彩度 90 以上の所だけを塗り替える
import argparse, hashlib, json
from datetime import datetime, timezone
from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--box', required=True)
ap.add_argument('--map', action='append', required=True)
ap.add_argument('--smin', type=int, default=90)
ap.add_argument('--note', default='')
a = ap.parse_args()
im = cv2.imread(a.src); H, W = im.shape[:2]
x0, y0, x1, y1 = [float(v) for v in a.box.split(',')]
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(np.float32)
region = np.zeros((H, W), np.float32); region[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = 1
out = hsv.copy()
for m in a.map:
    rng_, nh, smax, vk = m.split(':'); lo, hi = [int(v) for v in rng_.split('-')]
    mask = ((hsv[..., 0] >= lo) & (hsv[..., 0] <= hi) & (hsv[..., 1] >= a.smin)).astype(np.float32) * region
    mask = cv2.GaussianBlur(cv2.dilate(mask, np.ones((3, 3), np.uint8)), (0, 0), 1.2)
    tgt = hsv.copy(); tgt[..., 0] = float(nh); tgt[..., 1] = np.minimum(hsv[..., 1], float(smax)); tgt[..., 2] = hsv[..., 2] * float(vk)
    out = out * (1 - mask[..., None]) + tgt * mask[..., None]
res = cv2.cvtColor(np.clip(out, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
cv2.imwrite(a.dst, res, [cv2.IMWRITE_JPEG_QUALITY, 95])
# 原画の記録（ledger.json）にも残す
led_path = root / 'assets' / 'gen' / 'ledger.json'
if Path(a.dst).parent.resolve() == led_path.parent.resolve() and led_path.exists():
    led = json.loads(led_path.read_text())
    data = Path(a.dst).read_bytes()
    led['records'].append({'id': Path(a.dst).stem, 'file': Path(a.dst).name, 'operation': 'local_recolor', 'source': Path(a.src).name,
                           'box': a.box, 'maps': a.map, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                           'created_utc': datetime.now(timezone.utc).isoformat(), 'note': a.note})
    led_path.write_text(json.dumps(led, ensure_ascii=False, indent=1))
print('ok', a.dst)
