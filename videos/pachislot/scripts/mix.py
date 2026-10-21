#!/usr/bin/env python3
"""声・効果音・環境音・音楽を時刻どおりに並べてミックスする。 python3 -I scripts/mix.py --ep honne02 → work/<回>/mix.wav

- 効果音は script.json の sfx。書き方は2通り：
    [名前, 行, 's'=話し始め/'e'=話し終わり, 秒, 音量（倍率）]   … 行の代わりに '@名前' で marks（行の中の語の頭など）
    [名前, アンカー, dB]                                      … アンカーは S01+0／s01_1.s-3.2／s01_1.e+0.5／end-5
- 環境音（ベッド）は script.json の beds：[名前, 始め, 終わり, dB, フェードイン秒, フェードアウト秒]。
  public/shared/amb/<名前>.wav を繰り返して敷く（amb.py が作る）
- 音楽は script.json の music：[曲, 始め, 終わり, dB, フェードイン秒, フェードアウト秒]（public/<回>/audio/music、bgm_drama.py）。
  music が無い回は public/<回>/audio/bgm.wav を全編に（bgm.py）
- 声が出ている間は BGM・音楽を下げ（-5〜-6 dB）、環境音も一段下げる（-4 dB）。アタック 50ms・リリース 300ms
- 仕上げの音量（-14 LUFS）は render.mjs の後の finish.py で合わせる
"""
import os, subprocess, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, anchor, episode

EP = episode()
SR = 48000
S = EP.script()
T = EP.timeline()
L = {l['id']: l for l in T['lines']}
N = int(round(T['total'] * SR))
MARKS = S.get('marks', {})


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


def faded(x, fin, fout):
    n = x.shape[1]
    e = np.ones(n, dtype=np.float32)
    a, b = min(n, int(fin * SR)), min(n, int(fout * SR))
    if a:
        e[:a] = np.linspace(0, 1, a)
    if b:
        e[n - b:] *= np.linspace(1, 0, b)
    return x * e


def span_of(src, a0, a1):
    """src を a0〜a1 の長さに（足りなければ繰り返し、つなぎ目は 0.5 秒で重ねる）"""
    n = max(0, int(round((anchor(T, a1) - anchor(T, a0)) * SR)))
    if src.shape[1] >= n:
        return src[:, :n]
    xf = int(0.5 * SR)
    out = src.copy()
    while out.shape[1] < n:
        w = np.linspace(0, 1, xf)
        out[:, -xf:] = out[:, -xf:] * (1 - w) + src[:, :xf] * w
        out = np.concatenate([out, src[:, xf:]], axis=1)
    return out[:, :n]


voice = np.zeros((2, N), dtype=np.float32)
for l in T['lines']:
    put(voice, load(os.path.join(EP.pub, 'audio', 'voice', f"{l['id']}.wav")), l['start'])

cache = {}


def sfx_wav(name):
    if name not in cache:
        cache[name] = load(os.path.join(ROOT, 'public', 'shared', 'sfx', f'{name}.wav'))
    return cache[name]


sfx = np.zeros((2, N), dtype=np.float32)
for e in S.get('sfx', []):
    if len(e) == 3:  # [名前, アンカー, dB]
        name, a, db = e
        put(sfx, sfx_wav(name), max(0.0, anchor(T, a)), 10 ** (db / 20))
    else:
        name, lid, which, off, g = e
        put(sfx, sfx_wav(name), max(0.0, when(lid, which, off)), g)

beds = np.zeros((2, N), dtype=np.float32)
for name, a0, a1, db, fin, fout in S.get('beds', []):
    src = load(os.path.join(ROOT, 'public', 'shared', 'amb', f'{name}.wav'))
    put(beds, faded(span_of(src, a0, a1), fin, fout), anchor(T, a0), 10 ** (db / 20))

music = np.zeros((2, N), dtype=np.float32)
if S.get('music'):
    for cue, a0, a1, db, fin, fout in S['music']:
        src = load(os.path.join(EP.pub, 'audio', 'music', f'{cue}.wav'))
        n = int(round((anchor(T, a1) - anchor(T, a0)) * SR))
        put(music, faded(src[:, :n], fin, fout), anchor(T, a0), 10 ** (db / 20))
    music_duck_db = -6
else:
    bgm = load(os.path.join(EP.pub, 'audio', 'bgm.wav'))
    music = np.pad(bgm, ((0, 0), (0, max(0, N - bgm.shape[1]))))[:, :N] * 10 ** (-13 / 20)
    music_duck_db = -5

# 声の有無（アタック 50ms・リリース 300ms の包絡）
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
duck = lambda db: 1.0 - (1 - 10 ** (db / 20)) * env

music = music * duck(music_duck_db)
beds = beds * duck(-4)
mix = voice + sfx + beds + music
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
for name, x in (('stem_voice.wav', voice), ('stem_sfx.wav', sfx), ('stem_beds.wav', beds), ('stem_music.wav', music)):
    write(name, x * scale)
print(f'work/{EP.id}/mix.wav {N / SR:.2f}s peak={peak:.2f}')
