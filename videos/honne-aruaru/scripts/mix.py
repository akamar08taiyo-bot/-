#!/usr/bin/env python3
"""声・BGM・効果音を時刻どおりに並べてミックスする。 python3 -I scripts/mix.py → work/mix.wav

- 効果音の時刻は画面（src/Video.tsx）と同じく台本の行基準（行の話し始め/終わり＋秒）
- BGM は声が出ている間だけ下げる（アタック 50ms・リリース 300ms）
- 仕上げの音量（-14 LUFS）は render.mjs の後の finish.py で合わせる
"""
import json, os, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
T = json.load(open(os.path.join(ROOT, 'src', 'timeline.json')))
L = {l['id']: l for l in T['lines']}
N = int(round(T['total'] * SR))
LEAD = -0.15

# (名前, 行, 's' or 'e', 秒, 音量) … Video.tsx の演出と同じ時刻
SFX = [
    ('don', 'hook', 's', -0.25, 0.42),       # 題字（0 秒）
    ('pop', 'a1', 's', LEAD, 0.32),          # ① 番号テロップ
    ('pop', 'a2', 's', LEAD, 0.32),          # ②
    ('pop', 'a3', 's', LEAD, 0.32),          # ③
    ('pop', 'a4', 's', LEAD, 0.32),          # ④
    ('pop', 'a5a', 's', LEAD, 0.38),         # ⑤（最後）
    ('freeze', 'a5t', 's', -0.25, 0.48),     # 冷めるでしょ
    ('tehe', 'twist', 's', LEAD, 0.26),      # オチ
    ('pikon', 'ask', 's', 0.62, 0.22),       # 買う
    ('pikon', 'ask', 's', 1.18, 0.22),       # 買わない
]


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
    put(voice, load(os.path.join(ROOT, 'public', 'audio', 'voice', f"{l['id']}.wav")), l['start'])

sfx = np.zeros((2, N), dtype=np.float32)
for name, lid, which, off, g in SFX:
    t = L[lid]['start' if which == 's' else 'end'] + off
    put(sfx, load(os.path.join(ROOT, 'public', 'audio', 'sfx', f'{name}.wav')), max(0.0, t), g)

bgm = load(os.path.join(ROOT, 'public', 'audio', 'bgm.wav'))
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
os.makedirs(os.path.join(ROOT, 'work'), exist_ok=True)


def write(name, x):
    with wave.open(os.path.join(ROOT, 'work', name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1).T * 32767).astype('<i2').tobytes())


write('mix.wav', mix)
# 確認用の素材別トラック（同じ倍率で）
scale = min(1.0, 0.98 / peak)
for name, x in (('stem_voice.wav', voice), ('stem_sfx.wav', sfx), ('stem_bgm.wav', bgm * BGM_GAIN * duck)):
    write(name, x * scale)
print(f'work/mix.wav {N / SR:.2f}s peak={peak:.2f}')
