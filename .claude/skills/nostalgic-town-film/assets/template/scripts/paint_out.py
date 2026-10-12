# クリップの中の要らない物（例：C2 の屋上の大きすぎる子ども）を、最初のコマで作った「きれいな背景」（プレート）で隠す。
# 背景（建物）の動きは、建物の窓などの特徴点を最初のコマと今のコマで対応づけて、射影変換（ホモグラフィー）で追う。
#   2026年10月 C2：ECC の追い方では、船が島に近づいて建物が大きくなると、プレートがずれた。特徴点＋RANSAC に変えた
# 使い方: python3 -I scripts/paint_out.py <入力.mp4> <出力.mp4> <plate.png> <mask.png> --feat x0,y0,x1,y1
#     [--fixed x0,y0,x1,y1 ...] [--sky plate_sky.png]
#   plate.png・mask.png：入力の最初のコマと同じ大きさ。mask の白い所をプレートで置きかえる（ぼかしてよい）
#   --feat：動きを追う特徴点を取る範囲（最初のコマの画素）。隠す物の載っている建物の壁など、同じ面にある所
#   --fixed（何度でも）・--fixed-mask：カメラといっしょに動く物（船のマストなど）。そこは置きかえない（建物の動きでずらさない）
#   --sky：プレートのうち空の所（白）。空は貼らずに、今のコマのまわりの空から明るさの面を当てはめて塗る（色の継ぎ目を出さない）
import argparse, subprocess
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('plate'); ap.add_argument('mask')
ap.add_argument('--feat', required=True); ap.add_argument('--fixed', action='append', default=[]); ap.add_argument('--fixed-mask'); ap.add_argument('--sky')
a = ap.parse_args()
W, H = 1920, 1080
fx0, fy0, fx1, fy1 = (int(v) for v in a.feat.split(','))
plate = cv2.imread(a.plate).astype(np.float32)
mask = cv2.imread(a.mask, cv2.IMREAD_GRAYSCALE).astype(np.float32) / 255.0
sky = (cv2.imread(a.sky, cv2.IMREAD_GRAYSCALE) > 127).astype(np.uint8) if a.sky else np.zeros((H, W), np.uint8)
fixed = np.zeros((H, W), np.float32)
for e in a.fixed:
    x0, y0, x1, y1 = (int(v) for v in e.split(',')); fixed[y0:y1, x0:x1] = 1.0
if a.fixed_mask: fixed = np.maximum(fixed, (cv2.imread(a.fixed_mask, cv2.IMREAD_GRAYSCALE) > 127).astype(np.float32))
fixed = cv2.GaussianBlur(fixed, (0, 0), 1.5)
orb = cv2.ORB_create(4000, scaleFactor=1.15, nlevels=10, fastThreshold=8)
bf = cv2.BFMatcher(cv2.NORM_HAMMING)
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.src, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.dst], stdin=subprocess.PIPE)
k0 = d0 = None; Hm = np.eye(3); n = 0; bad = 0
yy, xx = np.mgrid[0:H, 0:W]
while True:
    buf = dec.stdout.read(W * H * 3)
    if len(buf) < W * H * 3: break
    fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    if k0 is None:
        fm = np.zeros((H, W), np.uint8); fm[fy0:fy1, fx0:fx1] = 255
        fm[(mask > 0.02) | (fixed > 0.02)] = 0
        k0, d0 = orb.detectAndCompute(g, fm)
    else:
        k1, d1 = orb.detectAndCompute(g, ((fixed < 0.02) * 255).astype(np.uint8))
        ok = False
        if d1 is not None and len(k1) > 20:
            ms = [m for m, m2 in (p for p in bf.knnMatch(d0, d1, k=2) if len(p) == 2) if m.distance < 0.78 * m2.distance]
            if len(ms) >= 25:
                src = np.float32([k0[m.queryIdx].pt for m in ms]); dst = np.float32([k1[m.trainIdx].pt for m in ms])
                Hn, inl = cv2.findHomography(src, dst, cv2.RANSAC, 2.0, maxIters=5000, confidence=0.999)
                if Hn is not None and inl.sum() >= 20:
                    Hm = Hn; ok = True
        bad += (not ok)
    pw = cv2.warpPerspective(plate, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    mw = cv2.warpPerspective(mask, Hm, (W, H), flags=cv2.INTER_LINEAR) * (1 - fixed)
    sw = cv2.warpPerspective(sky, Hm, (W, H), flags=cv2.INTER_NEAREST) > 0
    out = fr.astype(np.float32)
    hard = mw > 0.02
    ring = (cv2.dilate(hard.astype(np.uint8), np.ones((25, 25), np.uint8)) > 0) & ~hard
    if a.sky:  # 空：まわりの明るい空から、今のコマの明るさの面を当てはめる
        rs = ring & (g > 215) & (fixed < 0.02)
        if rs.sum() > 200:
            A = np.c_[xx[rs], yy[rs], np.ones(rs.sum())]
            ms_ = sw & hard
            for c in range(3):
                coef, *_ = np.linalg.lstsq(A, out[..., c][rs], rcond=None)
                pw[..., c][ms_] = coef[0] * xx[ms_] + coef[1] * yy[ms_] + coef[2]
    rn = ring & ~sw & (g <= 215)
    if rn.sum() > 50:  # 建物・手すり：まわりとの色の倍率を合わせる
        gain = (out[rn].mean(0) + 1) / (pw[rn].mean(0) + 1)
        pw[~sw] *= np.clip(gain, 0.9, 1.1)
    hard8 = (mw > 0.5).astype(np.uint8) * 255
    if hard8.any():  # ポアソン合成（まわりの色に合わせて、継ぎ目を消す）。その結果を、ぼかしたマスクで重ねる
        ys_, xs_ = np.nonzero(hard8); cx, cy = int((xs_.min() + xs_.max() + 1) // 2), int((ys_.min() + ys_.max() + 1) // 2)
        try:
            pw = cv2.seamlessClone(np.clip(pw, 0, 255).astype(np.uint8), fr, hard8, (cx, cy), cv2.NORMAL_CLONE).astype(np.float32)
        except cv2.error:
            pass
    out = out * (1 - mw[..., None]) + pw * mw[..., None]
    enc.stdin.write(np.clip(out, 0, 255).astype(np.uint8).tobytes()); n += 1
    if n % 30 == 0: print(n, 'frames; failed', bad, flush=True)
enc.stdin.close(); enc.wait(); dec.wait()
print('done', n, 'frames, tracking failed on', bad, '->', a.dst)
