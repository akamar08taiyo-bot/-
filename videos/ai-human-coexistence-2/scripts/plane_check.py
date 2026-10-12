# 平面追跡の確認：追いかけた四隅を、クリップの6コマに描いて並べる
# 使い方: python3 -I scripts/plane_check.py <ID>@<名前> <出力.jpg> [x0,y0,x1,y1（拡大する範囲、割合）]
import json, sys
from pathlib import Path
import cv2
import numpy as np
root = Path(__file__).resolve().parent.parent
key, out = sys.argv[1], sys.argv[2]
box = [float(v) for v in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0, 0, 1, 1]
cid = key.split('@')[0]
tr = json.loads((root / 'src' / 'track.json').read_text())[key]
cap = cv2.VideoCapture(str(next(c for c in (root / 'work' / 'raw' / f'{cid}.mp4', root / 'public' / 'clips' / f'{cid}.mp4') if c.exists())))
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
picks = [0, n // 5, 2 * n // 5, 3 * n // 5, 4 * n // 5, n - 1]
tiles = []
for fi in picks:
    cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
    ok, fr = cap.read()
    if not ok:
        continue
    c = np.array(tr[min(fi, len(tr) - 1)]).reshape(4, 2)
    cv2.polylines(fr, [c.astype(np.int32)], True, (0, 255, 255), 2)
    cv2.circle(fr, tuple(c[0].astype(int)), 5, (0, 0, 255), -1)
    x0, y0, x1, y1 = [int(v * s) for v, s in zip(box, (1920, 1080, 1920, 1080))]
    crop = fr[y0:y1, x0:x1]
    crop = cv2.resize(crop, (640, int(640 * (y1 - y0) / (x1 - x0))))
    cv2.putText(crop, f'f{fi}', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
    tiles.append(crop)
rows = [np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)]
cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
print('ok', out, n)
