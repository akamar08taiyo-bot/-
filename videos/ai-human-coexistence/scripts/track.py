# クリップのカメラの動き（相似変換）をフレームごとに推定 → src/track.json に追記
# 使い方: python3 -I scripts/track.py A1 B2 ...
import json, sys
from pathlib import Path
import cv2
import numpy as np
root = Path(__file__).resolve().parent.parent
out_path = root / 'src' / 'track.json'
tracks = json.loads(out_path.read_text()) if out_path.exists() else {}
for cid in sys.argv[1:]:
    cap = cv2.VideoCapture(str(root / 'public' / 'clips' / f'{cid}.mp4'))
    ok, prev = cap.read()
    if not ok:
        print(cid, 'missing'); continue
    pg = cv2.cvtColor(prev, cv2.COLOR_BGR2GRAY)
    M = np.eye(3)
    mats = [[1.0, 0.0, 0.0, 0.0]]
    pts = cv2.goodFeaturesToTrack(pg, maxCorners=900, qualityLevel=0.01, minDistance=9)
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        if pts is None or len(pts) < 150:
            pts = cv2.goodFeaturesToTrack(pg, maxCorners=900, qualityLevel=0.01, minDistance=9)
        nxt, st, _ = cv2.calcOpticalFlowPyrLK(pg, g, pts, None, winSize=(21, 21), maxLevel=3)
        good0 = pts[st[:, 0] == 1]; good1 = nxt[st[:, 0] == 1]
        A, inl = cv2.estimateAffinePartial2D(good0, good1, method=cv2.RANSAC, ransacReprojThreshold=1.5, maxIters=3000)
        if A is None:
            A = np.array([[1, 0, 0], [0, 1, 0]], dtype=float)
        step = np.vstack([A, [0, 0, 1]])
        M = step @ M
        a, b, tx, ty = M[0, 0], M[1, 0], M[0, 2], M[1, 2]
        mats.append([round(float(a), 6), round(float(b), 6), round(float(tx), 3), round(float(ty), 3)])
        pts = good1.reshape(-1, 1, 2) if inl is None else good1[inl[:, 0] == 1].reshape(-1, 1, 2)
        pg = g
    tracks[cid] = mats
    last = mats[-1]
    print(cid, len(mats), 'frames; final scale %.4f shift (%.1f, %.1f)' % ((last[0] ** 2 + last[1] ** 2) ** 0.5, last[2], last[3]))
out_path.write_text(json.dumps(tracks))
