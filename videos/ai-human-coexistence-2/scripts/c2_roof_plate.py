# C2（島への船）の、団地の屋上に立つ子どもを消すための「きれいな背景」（プレート）を作る
# 作者の指摘（2026年10月）：屋上の人が、建物に比べて大きすぎる。原画の作り直しはできない（残高なし）ので、映像から消す。
#   Veo の動画では子どもが4人→6人に増え、屋上の左の植え込みの方まで広がるので、屋上の手すりの帯をまるごと置きかえる
# 使い方: python3 -I scripts/c2_roof_plate.py <C2 の等速クリップ> <出力フォルダ>
#   出力：plate.png（最初のコマから子どもと船のマストを消した背景）、mask.png（置きかえる所）、sky.png（そのうち空の所）、cmp.png（前後）
#   子どもの所：空は、まわりの空から明るさの面を当てはめて塗る。手すりと屋上の縁は、子どもと子どもの間（798〜818画素）の
#   まっすぐな手すりを、傾きと高さを合わせて写して並べる（右端は角の斜めの棒が入るので使わない）
#   マスト・ロープ（船の物＝カメラといっしょに動く）は、プレートからは消しておき、貼る時は置きかえない（paint_out.py の --fixed）
# このあと: python3 -I scripts/paint_out.py <C2> <出力> plate.png mask.png --feat 600,262,1010,700 --sky sky.png \
#            --fixed-mask mast.png（船のマスト・帆桁・ロープ）
import sys, subprocess
from pathlib import Path
import cv2
import numpy as np

clip, out = Path(sys.argv[1]), Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(clip), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True, check=True).stdout
f = np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3).copy()
H, W = f.shape[:2]
top = lambda x: 213 + 0.151 * (x - 756)   # 手すりの上の横棒（最初のコマで測った線）
flo = lambda x: 239 + 0.133 * (x - 752)   # 屋上の縁（床の線）
X0, X1 = 762, 937                         # 最初のコマで子どもがいる列（腕・足を含む）
yy, xx = np.mgrid[0:H, 0:W]
gray = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
plate = f.copy()
# 1) 子どもの所の空
kids = np.zeros((H, W), np.uint8)
cv2.fillPoly(kids, [np.array([[X0, 140], [X1 + 2, 140], [X1 + 2, int(flo(X1)) + 7], [X0, int(flo(X0)) + 7]], np.int32)], 255)
skyline = (yy < top(xx) - 3)
ring = (cv2.dilate(kids, np.ones((31, 31), np.uint8)) > 0) & (kids == 0) & skyline & (gray > 228)
A = np.c_[xx[ring], yy[ring], np.ones(ring.sum())]
m_sky = (kids > 0) & skyline
for c in range(3):
    coef, *_ = np.linalg.lstsq(A, f[..., c][ring].astype(float), rcond=None)
    plate[..., c][m_sky] = np.clip(coef[0] * xx[m_sky] + coef[1] * yy[m_sky] + coef[2], 0, 255)
# 2) 手すりと屋上の縁：子どもの間のまっすぐな手すりを写す
SRC0, SRC1 = 798, 818; period = SRC1 - SRC0
fx = f.astype(np.float32)
for x in range(X0, X1 + 3):
    xs = SRC0 + ((x - SRC0) % period)
    tt, ft = top(x), flo(x); ts, fs = top(xs), flo(xs)
    for y in range(int(tt) - 6, int(ft) + 8):
        ys = ts + (y - tt) * (fs - ts) / (ft - tt) if y <= ft else fs + (y - ft)
        y0 = int(np.floor(ys)); w = ys - y0
        plate[y, x] = np.clip((1 - w) * fx[y0, xs] + w * fx[y0 + 1, xs], 0, 255)
# 3) 船のマストとロープ（屋上の帯にかかる所）をプレートから消す。マストの後ろは、どのコマでも子どもかマストに隠れて見えないので、
#    すぐ左の植え込みと手すり（696〜730）を、傾きを合わせて右へ写して埋める。帆桁（横の棒）の帯だけは上下からなじませる
mast = np.zeros((H, W), np.uint8); mast[120:272, 731:757] = 255; mast[236:258, 668:818] = 255
for (xa, ya, xb, yb) in ((742, 150, 722, 272), (742, 150, 766, 272)):  # マストからのロープ
    cv2.line(mast, (xa, ya), (xb, yb), 255, 5)
fill = plate.astype(np.float32).copy(); SH = 34
for x in range(726, 772):
    xs = x - SH
    for y in range(120, 275):
        ys = y - (top(x) - top(xs)) if y < 236 else y
        y0 = int(np.floor(ys)); w = ys - y0
        fill[y, x] = (1 - w) * plate[y0, xs] + w * plate[y0 + 1, xs]
strip = np.zeros((H, W), np.uint8); strip[120:236, 726:772] = 255
strip = cv2.bitwise_and(strip, cv2.dilate(mast, np.ones((7, 7), np.uint8)))
sm = cv2.GaussianBlur(strip, (0, 0), 1.5).astype(np.float32)[..., None] / 255
plate = (plate * (1 - sm) + fill * sm).astype(np.uint8)
rest = cv2.bitwise_and(mast, cv2.bitwise_not(strip))  # 帆桁の帯・ロープの下の方
plate = cv2.inpaint(plate, rest, 7, cv2.INPAINT_TELEA)
# 帆桁の帯は、あとのコマ（島が動いて帆桁の後ろが見える 5.5 秒）を最初のコマの座標に戻して写す（ぼかしで埋めるより自然）
rawall = subprocess.run(['ffmpeg', '-v', 'error', '-ss', '5.5', '-i', str(clip), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True, check=True).stdout
late = np.frombuffer(rawall, np.uint8).reshape(1080, 1920, 3)
orb = cv2.ORB_create(4000, scaleFactor=1.15, nlevels=10, fastThreshold=8); bf = cv2.BFMatcher(cv2.NORM_HAMMING)
fm = np.zeros((H, W), np.uint8); fm[262:700, 600:1010] = 255; fm[mast > 0] = 0; fm[kids > 0] = 0
k0, d0 = orb.detectAndCompute(gray, fm); k1, d1 = orb.detectAndCompute(cv2.cvtColor(late, cv2.COLOR_BGR2GRAY), None)
ms = [m for m, m2 in (q for q in bf.knnMatch(d0, d1, k=2) if len(q) == 2) if m.distance < 0.78 * m2.distance]
Hl, _ = cv2.findHomography(np.float32([k0[m.queryIdx].pt for m in ms]), np.float32([k1[m.trainIdx].pt for m in ms]), cv2.RANSAC, 2.0)
back = cv2.warpPerspective(late, np.linalg.inv(Hl), (W, H))
spar = np.zeros((H, W), np.uint8); spar[236:258, 668:818] = 255
late_fixed = np.zeros((H, W), np.uint8); late_fixed[:, 726:762] = 255; late_fixed[232:262, 660:826] = 255
lf_back = cv2.warpPerspective(late_fixed, np.linalg.inv(Hl), (W, H)) > 0  # あとのコマでもマスト・帆桁に隠れている所は使わない
use = (spar > 0) & ~lf_back
um = cv2.GaussianBlur(use.astype(np.float32), (0, 0), 1.2)[..., None]
plate = (plate * (1 - um) + back * um).astype(np.uint8)
fixed = np.zeros((H, W), np.uint8); fixed[0:1080, 733:755] = 255; fixed[238:256, 668:818] = 255
for (xa, ya, xb, yb) in ((742, 150, 722, 272), (742, 150, 766, 272)):
    cv2.line(fixed, (xa, ya), (xb, yb), 255, 3)
# 4) 置きかえる帯（屋上の手すり・植え込み・その上の空）と、そのうちの空
zone = np.zeros((H, W), np.uint8)
xs_ = np.arange(630, 986)
cv2.fillPoly(zone, [np.array([[630, 132], [985, 132]] + [[int(x), int(flo(x)) + 9] for x in xs_[::-1]], np.int32)], 255)
pg = cv2.cvtColor(plate, cv2.COLOR_BGR2GRAY)
sky = ((zone > 0) & (yy < top(xx) - 2) & (pg > 215)).astype(np.uint8) * 255
soft = cv2.GaussianBlur(zone, (0, 0), 2.0)
cv2.imwrite(str(out / 'mast.png'), fixed); cv2.imwrite(str(out / 'plate.png'), plate); cv2.imwrite(str(out / 'mask.png'), soft); cv2.imwrite(str(out / 'sky.png'), sky)
cmp_ = np.hstack([f[90:300, 600:1010], plate[90:300, 600:1010]])
cv2.imwrite(str(out / 'cmp.png'), cv2.resize(cmp_, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_LANCZOS4))
print('plate', out / 'plate.png')
