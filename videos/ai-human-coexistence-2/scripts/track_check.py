# 追跡の確認: 電子版の位置（アンカー）を追跡行列で動かし、数コマに描いて並べる
# 使い方: python3 -I scripts/track_check.py <ID> <x0> <y0> <w> <出力.jpg>
import json, sys
from pathlib import Path
import cv2
import numpy as np
root = Path(__file__).resolve().parent.parent
cid, x0, y0, w, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
W, H = 1920, 1080
tr = json.loads((root / 'src' / 'track.json').read_text()).get(cid)
cap = cv2.VideoCapture(str(next(c for c in (root / 'work' / 'raw' / f'{cid}.mp4', root / 'public' / 'clips' / f'{cid}.mp4') if c.exists())))
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
picks = [0, n // 4, n // 2, 3 * n // 4, n - 1]
tiles = []
for fi in picks:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ok, fr = cap.read()
    if not ok:
        continue
    a, b, tx, ty = tr[min(fi, len(tr) - 1)] if tr else (1, 0, 0, 0)
    ax, ay = x0 * W, y0 * H
    x1, y1 = a * ax - b * ay + tx, b * ax + a * ay + ty
    s = (a * a + b * b) ** 0.5
    pw = w * W * s; ph = pw * 0.42
    cv2.rectangle(fr, (int(x1 - pw / 2), int(y1)), (int(x1 + pw / 2), int(y1 + ph)), (0, 255, 255), 3)
    cv2.circle(fr, (int(x1), int(y1)), 10, (0, 0, 255), -1)
    # 参照用に、最初のコマでの位置も細線で
    cv2.rectangle(fr, (int(ax - w * W / 2), int(ay)), (int(ax + w * W / 2), int(ay + w * W * 0.42)), (255, 255, 255), 1)
    cv2.putText(fr, f'{cid} f{fi}', (30, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 0, 255), 4)
    tiles.append(cv2.resize(fr, (960, 540)))
while len(tiles) < 6:
    tiles.append(np.zeros_like(tiles[0]))
grid = np.vstack([np.hstack(tiles[i:i + 2]) for i in range(0, 6, 2)])
cv2.imwrite(out, grid, [cv2.IMWRITE_JPEG_QUALITY, 80])
print('ok', out, n)
