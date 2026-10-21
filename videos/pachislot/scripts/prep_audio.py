#!/usr/bin/env python3
"""声を整えて並べ、行ごとの時刻（timeline.json）を作る。

  python3 -I scripts/prep_audio.py --ep honne02 [--tempo 1.1]
  python3 -I scripts/prep_audio.py --ep honne02 --estimate   # 声がまだ無いとき：文字数から仮の時刻だけ作る

声が一部の行にしか無いときは、無い行だけ文字数から見積もる（timeline.json は仮の時刻の扱いになり、仕上げには使えない）。

1. 行の前後の無音を切る（頭 0.03 秒・お尻 0.08 秒だけ残す）
2. 行の中の長すぎる間（0.30 秒超）を 0.22 秒に詰める
3. 話す速さを style ごとの倍率に（script.json の tempo。ffmpeg atempo なので声の高さは変わらない）
4. 行ごとの音量をそろえる（ボソッとの行は少しだけ小さく。script.json の levels で style ごとに dB を足し引き）
5. phone: true の行は電話の声に（300〜3400Hz に絞り、軽く圧縮）
6. script.json の pre（行の前の間）と gap（行の後の間）どおりに並べ、public/<回>/audio/voice/<行>.wav と
   episodes/<回>/timeline.json を書く。行に scene があれば、場面の始まり（最初の行の pre の前）も scenes に書く

行の中の間を詰める長さは script.json の pauses（{"max": 0.30, "keep": 0.22} 秒が既定）。
"""
import argparse, json, os, re, subprocess, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import episode

EP = episode()
S = EP.script()
ap = argparse.ArgumentParser()
ap.add_argument('--tempo', type=float, default=None, help='全行を同じ倍率に（省略時は script.json の tempo を style ごとに使う）')
ap.add_argument('--estimate', action='store_true', help='声を使わず、文字数から仮の時刻を作る')
a = ap.parse_args()
SR = 48000
OUT = os.path.join(EP.pub, 'audio', 'voice')
os.makedirs(OUT, exist_ok=True)
# 仮の時刻に使う話す速さ（文字/秒、tempo をかけた後の実測に近い値）
EST_RATE = {'narr': 6.2, 'quote': 6.0, 'aside': 5.6, 'verdict': 4.6, 'twist': 6.0, 'ask': 5.4,
            'wife': 5.6, 'husband': 6.5, 'inner': 6.0, 'mil': 6.8, 'soft': 4.8}


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
    voiced = db > db.max() + thr_rel
    idx = np.where(voiced)[0]
    s, e = idx[0], idx[-1] + 1
    head, tail = int(0.03 * SR), int(0.08 * SR)
    off = max(0, s * hop - head)
    seg = x[off: min(len(x), e * hop + tail)]
    # 声のある区間・ない区間に分け、長すぎる間だけ keep_gap に詰める
    v = voiced[s:e]
    runs, i = [], 0
    while i < len(v):
        j = i
        while j < len(v) and v[j] == v[i]:
            j += 1
        runs.append((v[i], i, j))
        i = j
    pieces, last = [], 0
    for vv, i, j in runs:
        if not vv and (j - i) * hop / SR > max_gap:
            a0 = s * hop + i * hop - off
            a1 = s * hop + j * hop - off
            pieces.append(seg[last:a0 + int(keep_gap / 2 * SR)])
            last = a1 - int(keep_gap / 2 * SR)
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


PHONE_AF = 'highpass=f=300,highpass=f=300,lowpass=f=3400,lowpass=f=3400,acompressor=threshold=-20dB:ratio=3:attack=5:release=60'


def phone(x):
    """電話の向こうの声（帯域を絞って軽く圧縮）"""
    r = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-af', PHONE_AF, '-f', 'f32le', '-'], input=x.tobytes(), capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def breaks(x, min_gap=0.16):
    """行の中の息継ぎ（無音）の中ほどの時刻（秒）。字幕を文ごとに分けるときの目印"""
    db = frames_db(x)
    quiet = db < db.max() - 32
    out, i = [], 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - i) * 0.01 >= min_gap and i > 0 and j < len(quiet):
                out.append(round((i + j) / 2 * 0.01, 2))
            i = j
        else:
            i += 1
    return out


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


t = 0.25 if 'pre' not in S['lines'][0] else 0.0  # 最初の声までの間（絵が先に出る。pre があればそれに任せる）
timeline = []
scenes = {}
missing = []
P = S.get('pauses', {})
for ln in S['lines']:
    if ln.get('scene') and ln['scene'] not in scenes:
        scenes[ln['scene']] = round(t, 3)
    t += ln.get('pre', 0)
    if not a.estimate and not os.path.exists(os.path.join(EP.voice, f"{ln['id']}.wav")):
        missing.append(ln['id'])
    if a.estimate or ln['id'] in missing:
        n = len(re.sub(r'[、。？！「」…\s]', '', ln.get('speak', ln['text'])))
        d = n / EST_RATE.get(ln['style'], 6.0) + 0.25
    else:
        x = load(os.path.join(EP.voice, f"{ln['id']}.wav"))
        x = trim_and_tighten(x, max_gap=P.get('max', 0.30), keep_gap=P.get('keep', 0.22))
        x = tempo(x, a.tempo or S.get('tempo', {}).get(ln['style'], 1.0))
        if ln.get('phone'):
            x = phone(x)
        target = -20.0 - (2.0 if ln.get('aside') else 0.0) + S.get('levels', {}).get(ln['style'], 0.0)
        x = x * 10 ** ((target - speech_level(x)) / 20)
        peak = np.abs(x).max()
        if peak > 0.89:
            x = x * 0.89 / peak
        save(os.path.join(OUT, f"{ln['id']}.wav"), x)
        d = len(x) / SR
    item = {'id': ln['id'], 'start': round(t, 3), 'end': round(t + d, 3), 'dur': round(d, 3)}
    if not (a.estimate or ln['id'] in missing):
        item['breaks'] = breaks(x)
    timeline.append(item)
    t += d + ln.get('gap', 0.25)
total = t + S.get('tail', 1.5)
json.dump({'fps': S['fps'], 'total': round(total, 3), 'estimated': a.estimate or bool(missing), 'scenes': scenes, 'lines': timeline},
          open(EP.timeline_path, 'w'), ensure_ascii=False, indent=1)
for x in timeline:
    print(f"{x['id']:8s} {x['start']:6.2f} - {x['end']:6.2f}  ({x['dur']:.2f}s)")
print(f"total {total:.2f}s{'  （文字数からの仮の時刻）' if a.estimate else ''}")
if scenes:
    ends = list(scenes.values())[1:] + [total]
    print('scenes', '  '.join(f'{k} {v:.1f}s（{e - v:.1f}s）' for (k, v), e in zip(scenes.items(), ends)))
if missing:
    print('声が無いので文字数から見積もった行:', ' '.join(missing))
