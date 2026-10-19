#!/usr/bin/env python3
"""声・BGM・効果音を時刻どおりに並べてミックスする。 python3 -I scripts/mix.py --ep honne02 → work/<回>/mix.wav

- 効果音は script.json の sfx（[名前, 行, 's'=話し始め/'e'=話し終わり, 秒, 音量]）。画面と同じ行基準。
  行の代わりに '@名前' と書くと script.json の marks（行の中の語の頭など）を使う
- BGM は声が出ている間だけ下げる（アタック 50ms・リリース 300ms）
- 仕上げの音量（-14 LUFS）は render.mjs の後の finish.py で合わせる
"""
import os, subprocess, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, episode

EP = episode()
SR = 48000
T = EP.timeline()
L = {l['id']: l for l in T['lines']}
N = int(round(T['total'] * SR))
SFX = EP.script().get('sfx', [])
MARKS = EP.script().get('marks', {})


def when(lid, which, off):
    if lid.startswith('@'):
        lid, which, moff = MARKS[lid[1:]]
        off += moff
    return L[lid]['start' if which == 's' else 'end'] + off


def load(path, ch=2):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, ch).T.copy()


def put(buf, x, at, gain=1.0):
    i = int(round(at * SR))
    if i < 0:
        x, i = x[:, -i:], 0
    j = min(buf.shape[1], i + x.shape[1])
    if j > i:
        buf[:, i:j] += gain * x[:, : j - i]


voice = np.zeros((2, N), dtype=np.float32)
for l in T['lines']:
    put(voice, load(os.path.join(EP.pub, 'audio', 'voice', f"{l['id']}.wav")), l['start'])

sfx = np.zeros((2, N), dtype=np.float32)
for name, lid, which, off, g in SFX:
    t = when(lid, which, off)
    put(sfx, load(os.path.join(ROOT, 'public', 'shared', 'sfx', f'{name}.wav')), max(0.0, t), g)

bgm = load(os.path.join(EP.pub, 'audio', 'bgm.wav'))
bgm = np.pad(bgm, ((0, 0), (0, max(0, N - bgm.shape[1]))))[:, :N]

# 声の有無で BGM を下げる（-5 dB）
hop = 480
mono = voice.mean(axis=0)
n = len(mono) // hop
rms = np.sqrt(np.mean(mono[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
active = (20 * np.log10(rms) > -45).astype(np.float32)
env = np.zeros_like(active)
a_att, a_rel = np.exp(-hop / (0.05 * SR)), np.exp(-hop / (0.30 * SR))
acc = 0.0
for i, v in enumerate(active):
    k = a_att if v > acc else a_rel
    acc = k * acc + (1 - k) * v
    env[i] = acc
env = np.repeat(env, hop)
env = np.pad(env, (0, N - len(env)), mode='edge')
duck = 1.0 - (1 - 10 ** (-5 / 20)) * env

BGM_GAIN = 10 ** (-13 / 20)
mix = voice + sfx + bgm * BGM_GAIN * duck
peak = np.abs(mix).max()
if peak > 0.98:
    mix *= 0.98 / peak
def write(name, x):
    with wave.open(os.path.join(EP.work, name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1).T * 32767).astype('<i2').tobytes())


write('mix.wav', mix)
# 確認用の素材別トラック（同じ倍率で）
scale = min(1.0, 0.98 / peak)
for name, x in (('stem_voice.wav', voice), ('stem_sfx.wav', sfx), ('stem_bgm.wav', bgm * BGM_GAIN * duck)):
    write(name, x * scale)
print(f'work/{EP.id}/mix.wav {N / SR:.2f}s peak={peak:.2f}')
