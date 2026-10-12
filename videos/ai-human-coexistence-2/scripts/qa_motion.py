# 映像精査の資料づくり：カットごとに「Veo の元の動画（等速）」と「本編で使ったスロー版」を並べ、動きの不自然さを見る
# 使い方: python3 -I scripts/qa_motion.py [ID ...]   （省略時は Veo の元動画があるカット全部）
# 出力: work/qa_motion/<ID>_A.jpg  元の動画を0.5秒ごとに16コマ（等速での動きと、形の崩れを見る）
#       work/qa_motion/<ID>_B.jpg  本編のスロー版で、いちばん動きの大きい所を8コマ続けて拡大（補間のゆがみ・二重写りを見る）
#       work/qa_motion/<ID>_C.jpg  同じ所を元の動画で4コマ続けて（等速ならどう動くか）
#       work/qa_motion/summary.json  伸ばした倍率（k）、元の動画の何秒目から使ったか、1秒ごとの動きの量、いちばん動く所
import json, subprocess, sys
from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parent.parent
T = json.loads((root / 'src' / 'timeline.json').read_text(encoding='utf-8'))
out = root / 'work' / 'qa_motion'; out.mkdir(parents=True, exist_ok=True)
FONT = cv2.FONT_HERSHEY_SIMPLEX


def frames(path, size=None):
    cap = cv2.VideoCapture(str(path)); fps = cap.get(cv2.CAP_PROP_FPS); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(cv2.resize(f, size, interpolation=cv2.INTER_AREA) if size else f)
    cap.release()
    return fr, fps


def pick(path, idx):
    # 高画質のコマは、要る番号だけを残す（全部読むと 1 カットで数 GB になり、並べて動かすとメモリが足りなくなった）
    want = set(int(i) for i in idx); got = {}; cap = cv2.VideoCapture(str(path)); i = 0
    while want - set(got):
        ok, f = cap.read()
        if not ok: break
        if i in want: got[i] = f
        i += 1
    cap.release()
    last = max(got) if got else None
    return [got.get(int(j), got[last] if last is not None else None) for j in idx]


def label(img, text):
    cv2.putText(img, text, (10, 30), FONT, 0.8, (0, 0, 0), 5, cv2.LINE_AA)
    cv2.putText(img, text, (10, 30), FONT, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    return img


def tile(imgs, cols):
    h, w = imgs[0].shape[:2]
    while len(imgs) % cols: imgs.append(np.zeros_like(imgs[0]))
    rows = [np.hstack(imgs[i:i + cols]) for i in range(0, len(imgs), cols)]
    return np.vstack(rows)


def crop(f, box):
    x0, y0, x1, y1 = box; H, W = f.shape[:2]
    return cv2.resize(f[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)], (480, 270), interpolation=cv2.INTER_AREA)


summary = {}
want = set(sys.argv[1:])
for sh in T['shots']:
    sid = sh['id']
    raw = root / 'assets' / 'veo' / f'{sid}_v1.mp4'
    slow = root / 'public' / 'clips' / f'{sid}.mp4'
    if (want and sid not in want) or not raw.exists() or not slow.exists():
        continue
    rf, rfps = frames(raw, (320, 180))
    sf, sfps = frames(slow, (320, 180))
    g = lambda f: cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    # スロー版の何秒目が、元の動画の何秒目か（縮小したコマの一致で探して、直線で当てはめる）
    rsm = np.stack([cv2.resize(g(f), (64, 36)).astype(np.float32) for f in rf])
    pts = []
    for ts in np.linspace(0.5, len(sf) / sfps - 0.5, 9):
        q = cv2.resize(g(sf[int(ts * sfps)]), (64, 36)).astype(np.float32)
        err = ((rsm - q) ** 2).mean(axis=(1, 2)); j = int(err.argmin())
        pts.append((ts, j / rfps, float(err[j])))
    a, b = np.polyfit([p[0] for p in pts], [p[1] for p in pts], 1)  # t_raw = a * t_slow + b
    k = 1 / a if a > 0 else None
    # 元の動画の動きの量（1コマごとのオプティカルフローの平均）
    mags, boxes = [], []
    for i in range(1, len(rf)):
        fl = cv2.calcOpticalFlowFarneback(g(rf[i - 1]), g(rf[i]), None, 0.5, 3, 15, 3, 5, 1.2, 0)
        m = np.linalg.norm(fl, axis=2); mags.append(float(m.mean())); boxes.append(m)
    mags = np.array(mags); sm = np.convolve(mags, np.ones(9) / 9, mode='same')
    pk = int(sm.argmax()); t_pk = (pk + 1) / rfps
    acc = sum(boxes[max(0, pk - 6):pk + 6]); thr = acc > np.percentile(acc, 92)
    ys, xs = np.nonzero(thr)
    if len(xs) > 20:
        cx, cy = xs.mean() / 320, ys.mean() / 180
    else:
        cx, cy = 0.5, 0.5
    bw = 0.42; bh = bw  # 幅・高さの 42% を切り出す（16:9 のまま）
    x0 = float(np.clip(cx - bw / 2, 0, 1 - bw)); y0 = float(np.clip(cy - bh / 2, 0, 1 - bh))
    box = (x0, y0, x0 + bw, y0 + bh)
    # A：元の動画を0.5秒ごとに16コマ
    ta = np.arange(0.25, 8.0, 0.5)
    fa = pick(raw, [min(len(rf) - 1, int(t * rfps)) for t in ta])
    A = [label(cv2.resize(f, (480, 270)), f'{sid} raw t={t:.2f}s') for f, t in zip(fa, ta)]
    cv2.imwrite(str(out / f'{sid}_A.jpg'), tile(A, 4), [cv2.IMWRITE_JPEG_QUALITY, 82])
    # B：本編のスロー版で、いちばん動く所から8コマ続けて（拡大）
    t_s = (t_pk - b) / a if a > 0 else 0
    i0 = int(np.clip(t_s * sfps - 4, 0, len(sf) - 9))
    fb = pick(slow, [i0 + n for n in range(8)])
    B = [label(crop(f, box), f'{sid} film +{n}f ({(i0 + n) / sfps:.2f}s)') for n, f in enumerate(fb)]
    cv2.imwrite(str(out / f'{sid}_B.jpg'), tile(B, 4), [cv2.IMWRITE_JPEG_QUALITY, 85])
    # C：同じ所を元の動画で4コマ続けて
    j0 = int(np.clip(t_pk * rfps - 2, 0, len(rf) - 5))
    fc = pick(raw, [j0 + n for n in range(4)])
    C = [label(crop(f, box), f'{sid} raw +{n}f ({(j0 + n) / rfps:.2f}s)') for n, f in enumerate(fc)]
    cv2.imwrite(str(out / f'{sid}_C.jpg'), tile(C, 4), [cv2.IMWRITE_JPEG_QUALITY, 85])
    per_sec = [round(float(mags[int(s * rfps):int((s + 1) * rfps)].mean()), 3) for s in range(int(len(mags) / rfps))]
    summary[sid] = dict(name=sh['name'], slow_factor=round(k, 2) if k else None, raw_start=round(float(b), 2),
                        film_dur=sh['dur'], clip=sh.get('clip'), motion_per_sec=per_sec, motion_mean=round(float(mags.mean()), 3),
                        peak_raw_s=round(t_pk, 2), peak_box=[round(v, 2) for v in box], match_err=round(float(np.mean([p[2] for p in pts])), 1))
    print(sid, summary[sid]['slow_factor'], summary[sid]['raw_start'], summary[sid]['motion_mean'], summary[sid]['peak_raw_s'])
for sid, d in summary.items():
    (out / f'{sid}.json').write_text(json.dumps(d, ensure_ascii=False), encoding='utf-8')
allsum = {p.stem: json.loads(p.read_text()) for p in sorted(out.glob('*.json')) if p.stem != 'summary'}
(out / 'summary.json').write_text(json.dumps(allsum, ensure_ascii=False, indent=1), encoding='utf-8')
