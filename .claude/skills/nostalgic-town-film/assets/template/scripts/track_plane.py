# 平らな物（紙・カード・ページ・柱・額の札）の四隅を、クリップの全コマで追いかける → src/track.json に "<ID>@<名前>" で追記
# 使い方: python3 -I scripts/track_plane.py <ID>@<名前> x1,y1,x2,y2,x3,y3,x4,y4 [--exclude x0,y0,x1,y1 ...] [--pad 0.0] [--smooth 5]
#   四隅は基準のコマ（--start、既定は最初のコマ）での位置（画面に対する割合、左上→右上→右下→左下）。timeline.json の ink.quad と同じ値を渡す
#   --exclude：特徴点を取らない四角（手など、紙と別に動く物）。割合で x0,y0,x1,y1（基準のコマでの位置）
#   --pad：特徴点を取る範囲を四隅より広げる（割合）。紙の外の机など、紙と一緒に動く物も使うとき
#   --smooth：四隅の動きをならすコマ数（ガウスの幅）。0 でならさない
#   --start <秒>：四隅を測ったコマの時刻。そこから後ろへも前へも追いかける（手が紙に重ならない、きれいなコマで測るとよい）
#   --apply <名前>=x1,y1,...,y4：同じ動きで別の四角も動かして "<ID>@<名前>" に書く（手で隠れがちな隣のページなど）
# カメラ全体の動き（track.py）と違い、物そのものの動き（手に持った紙の傾きなど）を射影変換で追う
import argparse, json
from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parent.parent
W, H = 1920, 1080
ap = argparse.ArgumentParser()
ap.add_argument('key')
ap.add_argument('quad')
ap.add_argument('--exclude', nargs='*', default=[])
ap.add_argument('--pad', type=float, default=0.0)
ap.add_argument('--smooth', type=float, default=4.0)
ap.add_argument('--apply', nargs='*', default=[])
ap.add_argument('--start', type=float, default=0.0)
a = ap.parse_args()
cid = a.key.split('@')[0]
q = np.array([float(v) for v in a.quad.split(',')], dtype=np.float32).reshape(4, 2) * [W, H]

# 全コマを灰色で読む（前へも追いかけるため）
cap = cv2.VideoCapture(str(next(c for c in (root / 'work' / 'raw' / f'{cid}.mp4', root / 'public' / 'clips' / f'{cid}.mp4') if c.exists())))
grays = []
while True:
    ok, fr = cap.read()
    if not ok:
        break
    grays.append(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY))
n = len(grays)
assert n, f'{cid}: clip missing'
start = min(n - 1, int(round(a.start * 30)))


def region_mask(H_now):
    # 四隅（＋pad）を今のコマに写した多角形から、除外の四角を抜いた範囲
    c = q.mean(axis=0)
    qq = c + (q - c) * (1 + a.pad * 2)
    poly = cv2.perspectiveTransform(qq.reshape(-1, 1, 2), H_now).reshape(-1, 2)
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [poly.astype(np.int32)], 255)
    for e in a.exclude:
        x0, y0, x1, y1 = [float(v) for v in e.split(',')]
        p = np.array([[x0 * W, y0 * H], [x1 * W, y0 * H], [x1 * W, y1 * H], [x0 * W, y1 * H]], np.float32)
        pp = cv2.perspectiveTransform(p.reshape(-1, 1, 2), H_now).reshape(-1, 2)
        cv2.fillPoly(m, [pp.astype(np.int32)], 0)
    return m


def detect(gray, H_now):
    pts = cv2.goodFeaturesToTrack(gray, maxCorners=500, qualityLevel=0.005, minDistance=6, mask=region_mask(H_now))
    return np.zeros((0, 2), np.float32) if pts is None else pts.reshape(-1, 2)


def run(order):
    # order：基準のコマから順に並べたコマ番号。各コマの「基準のコマ → そのコマ」の射影変換を返す
    Hc = np.eye(3)
    cur = detect(grays[order[0]], Hc)
    ref = cur.copy()
    out = {order[0]: np.eye(3)}
    prev = grays[order[0]]
    lost = 0
    for fi in order[1:]:
        g = grays[fi]
        if len(cur) >= 8:
            nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, cur.reshape(-1, 1, 2), None, winSize=(21, 21), maxLevel=3)
            back, st2, _ = cv2.calcOpticalFlowPyrLK(g, prev, nxt, None, winSize=(21, 21), maxLevel=3)
            fb = np.linalg.norm(back.reshape(-1, 2) - cur, axis=1)
            good = (st[:, 0] == 1) & (st2[:, 0] == 1) & (fb < 1.0)
            cur = nxt.reshape(-1, 2)[good]; ref = ref[good]
        if len(cur) >= 8:
            Hn, inl = cv2.findHomography(ref, cur, cv2.RANSAC, 2.5)
            if Hn is not None:
                Hc = Hn
                keep = inl[:, 0] == 1
                cur, ref = cur[keep], ref[keep]
        else:
            lost += 1
        if len(cur) < 120:
            # 足りなくなったら今のコマで取り直し、基準のコマでの位置に戻して加える
            new = detect(g, Hc)
            if len(new):
                back_ref = cv2.perspectiveTransform(new.reshape(-1, 1, 2), np.linalg.inv(Hc)).reshape(-1, 2)
                cur = np.vstack([cur, new]); ref = np.vstack([ref, back_ref])
        out[fi] = Hc.copy()
        prev = g
    return out, lost


fw, l1 = run(list(range(start, n)))
bw, l2 = run(list(range(start, -1, -1))) if start > 0 else ({}, 0)
Hs = [bw.get(i, fw.get(i)) for i in range(n)]
print(cid, 'frames', n, 'start', start)


# 四隅を写して、時間方向にならす
def track_corners(quad):
    c = np.array([cv2.perspectiveTransform(quad.reshape(-1, 1, 2), Hm).reshape(-1) for Hm in Hs])
    if a.smooth > 0:
        k = int(a.smooth * 3)
        ker = np.exp(-0.5 * (np.arange(-k, k + 1) / a.smooth) ** 2); ker /= ker.sum()
        padded = np.pad(c, ((k, k), (0, 0)), mode='edge')
        c = np.array([np.convolve(padded[:, j], ker, mode='valid') for j in range(8)]).T
    return c


out_path = root / 'src' / 'track.json'
tracks = json.loads(out_path.read_text()) if out_path.exists() else {}
corners = track_corners(q)
tracks[a.key] = [[round(float(v), 2) for v in c] for c in corners]
for spec in a.apply:
    name, vals = spec.split('=')
    q2 = np.array([float(v) for v in vals.split(',')], dtype=np.float32).reshape(4, 2) * [W, H]
    tracks[f'{cid}@{name}'] = [[round(float(v), 2) for v in c] for c in track_corners(q2.astype(np.float32))]
    print('also', f'{cid}@{name}')
out_path.write_text(json.dumps(tracks))
d = np.linalg.norm(corners[-1].reshape(4, 2) - corners[0].reshape(4, 2), axis=1)
print(a.key, len(corners), 'frames; corner drift px (first→last)', np.round(d, 1), 'lost frames', l1 + l2)
