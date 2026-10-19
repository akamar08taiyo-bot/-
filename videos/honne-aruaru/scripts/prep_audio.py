#!/usr/bin/env python3
"""声を整えて並べ、行ごとの時刻（timeline.json）を作る。

  python3 -I scripts/prep_audio.py [--tempo 1.1]

1. 行の前後の無音を切る（頭 0.03 秒・お尻 0.08 秒だけ残す）
2. 行の中の長すぎる間（0.30 秒超）を 0.22 秒に詰める
3. 話す速さを style ごとの倍率に（script.json の tempo。ffmpeg atempo なので声の高さは変わらない）
4. 行ごとの音量をそろえる（ボソッとの行は少しだけ小さく）
5. script.json の gap どおりに並べ、public/audio/voice/<id>.wav と src/timeline.json を書く
"""
import argparse, json, os, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, 'script.json'), encoding='utf-8'))
ap = argparse.ArgumentParser()
ap.add_argument('--tempo', type=float, default=None, help='全行を同じ倍率に（省略時は script.json の tempo を style ごとに使う）')
a = ap.parse_args()
SR = 48000
OUT = os.path.join(ROOT, 'public', 'audio', 'voice')
os.makedirs(OUT, exist_ok=True)


def load(path):
    """ffmpeg で 48kHz モノラル float にして読む"""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def save(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def frames_db(x, hop=480):
    n = len(x) // hop
    rms = np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms)


def trim_and_tighten(x, thr_rel=-38.0, max_gap=0.30, keep_gap=0.22):
    hop = 480  # 10 ms
    db = frames_db(x, hop)
    thr = db.max() + thr_rel
    voiced = db > thr
    idx = np.where(voiced)[0]
    s, e = idx[0], idx[-1] + 1
    head, tail = int(0.03 * SR), int(0.08 * SR)
    seg = x[max(0, s * hop - head): min(len(x), e * hop + tail)]
    v = voiced[s:e]
    # 行の中の長い間を詰める
    out, i, n = [], 0, len(v)
    pos = head if s * hop - head >= 0 else s * hop
    cur = 0
    runs = []
    while i < n:
        j = i
        while j < n and v[j] == v[i]:
            j += 1
        runs.append((v[i], i, j))
        i = j
    off = max(0, s * hop - head)
    last = 0
    pieces = []
    for vv, i, j in runs:
        dur = (j - i) * hop / SR
        if not vv and dur > max_gap:
            a0 = s * hop + i * hop - off
            a1 = s * hop + j * hop - off
            cut0 = a0 + int(keep_gap / 2 * SR)
            cut1 = a1 - int(keep_gap / 2 * SR)
            pieces.append(seg[last:cut0])
            last = cut1
    pieces.append(seg[last:])
    # つなぎ目は 5ms でなじませる
    y = pieces[0]
    f = int(0.005 * SR)
    for p in pieces[1:]:
        if len(y) > f and len(p) > f:
            ramp = np.linspace(0, 1, f, dtype=np.float32)
            y = np.concatenate([y[:-f], y[-f:] * (1 - ramp) + p[:f] * ramp, p[f:]])
        else:
            y = np.concatenate([y, p])
    return y


def tempo(x, t):
    if abs(t - 1) < 1e-3:
        return x
    r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-af', f'atempo={t}', '-f', 'f32le', '-'], input=x.tobytes(), capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def speech_level(x):
    db = frames_db(x)
    loud = db[db > db.max() - 30]
    return 10 * np.log10(np.mean(10 ** (loud / 10)))


t = 0.25  # 最初の声までの間（絵が先に出る）
timeline = []
for ln in S['lines']:
    x = load(os.path.join(ROOT, 'assets', 'voice', f"{ln['id']}.wav"))
    x = trim_and_tighten(x)
    x = tempo(x, a.tempo or S.get('tempo', {}).get(ln['style'], 1.0))
    target = -20.0 - (2.0 if ln.get('aside') else 0.0)
    x = x * 10 ** ((target - speech_level(x)) / 20)
    peak = np.abs(x).max()
    if peak > 0.89:
        x = x * 0.89 / peak
    save(os.path.join(OUT, f"{ln['id']}.wav"), x)
    d = len(x) / SR
    timeline.append({'id': ln['id'], 'start': round(t, 3), 'end': round(t + d, 3), 'dur': round(d, 3)})
    t += d + ln.get('gap', 0.25)
total = t + S.get('tail', 1.5)
json.dump({'fps': S['fps'], 'total': round(total, 3), 'tempo': a.tempo, 'lines': timeline},
          open(os.path.join(ROOT, 'src', 'timeline.json'), 'w'), ensure_ascii=False, indent=1)
for x in timeline:
    print(f"{x['id']:8s} {x['start']:6.2f} - {x['end']:6.2f}  ({x['dur']:.2f}s)")
print(f'total {total:.2f}s  tempo {a.tempo}')
