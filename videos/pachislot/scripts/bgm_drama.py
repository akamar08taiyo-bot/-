#!/usr/bin/env python3
"""会話劇の音楽（短い合図の曲）をコードで作曲・合成する（権利フリー）。 python3 -I scripts/bgm_drama.py --ep ep01
→ public/<回>/audio/music/<曲>.wav。どこで鳴らすかは script.json の music（[曲, 始め, 終わり, dB, フェードイン, フェードアウト]）。

生活音を消さないよう、音楽は少なく、細く。実在の機種の楽曲には似せない。
  drone  … 冒頭の細い低音ひとつ（D の低い持続音。わずかにうなる）
  travel … 移動で初めて広がる短い曲（D の I–V–vi–IV。爪弾きのアルペジオ、柔らかいパッド、ベース。80BPM）
  ending … 終わりの表示の下で、ゆっくりした和音（ローズ風）
"""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import SR, t_, midi, pluck, epiano, bass, fft_filter, convolve, reverb_ir, place, noise
from common import episode

EP = episode()
OUT = os.path.join(EP.pub, 'audio', 'music')
os.makedirs(OUT, exist_ok=True)


def save(name, x, peak=0.8):
    x = x / (np.abs(x).max() + 1e-9) * peak
    f = int(0.05 * SR)
    x[:, -f:] *= np.linspace(1, 0, f)
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype('<i2').tobytes())
    print(name, f'{x.shape[1] / SR:.1f}s')


def verb(x, wet=0.3, dur=2.4, decay=0.9):
    l = convolve(x[0], reverb_ir(dur, decay, 5))[: x.shape[1]]
    r = convolve(x[1], reverb_ir(dur, decay, 6))[: x.shape[1]]
    return x + wet * np.stack([l, r])


def pad(notes, dur, att=1.5, rel=2.0, bright=900):
    """柔らかいパッド（少しずらした2本の波をローパス）"""
    t = t_(dur)
    y = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for d in (-0.12, 0.12):
            ph = 2 * np.pi * (f + d) * t
            y += (np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)) / len(notes)
    y = fft_filter(y, hi=bright)
    e = np.minimum(t / att, 1) * np.minimum((dur - t) / rel, 1)
    return y * np.clip(e, 0, 1)


# drone：細い低音ひとつ
D = 44.0
t = t_(D)
x = np.sin(2 * np.pi * midi(38) * t) + 0.35 * np.sin(2 * np.pi * midi(50) * t + 1) + 0.12 * np.sin(2 * np.pi * midi(57) * t + 2)
x += 0.25 * np.sin(2 * np.pi * (midi(38) + 0.18) * t)  # わずかなうなり
x += 0.03 * np.sin(2 * np.pi * midi(74) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t))
x = fft_filter(x, hi=700) * np.minimum(t / 6.0, 1) * np.minimum((D - t) / 6.0, 1)
save('drone', verb(np.stack([x, x * 0.97]), wet=0.25), peak=0.7)

# travel：移動の短い曲
BPM = 80
BEAT = 60 / BPM
BAR = 4 * BEAT
CH = [  # (アルペジオの音, ベースの根音, パッド)
    ([62, 66, 69, 74], 38, [62, 66, 69]),  # D
    ([61, 64, 69, 73], 37, [61, 64, 69]),  # A/C#
    ([59, 62, 66, 71], 35, [59, 62, 66]),  # Bm
    ([59, 62, 67, 71], 43, [59, 62, 67]),  # G
]
order = [0, 1, 2, 3, 0, 1, 2, 3, 3, 0]
N = len(order) * BAR + 3.0
buf = np.zeros((2, int(N * SR)))
pat = [0, 2, 1, 3, 2, 1, 3, 2]  # 8分のアルペジオ
for b, ci in enumerate(order):
    notes, root, pd = CH[ci]
    t0 = b * BAR
    lvl = 0.55 if b < 2 else 1.0  # 最初の2小節は控えめに入る
    for k, idx in enumerate(pat):
        n = pluck(midi(notes[idx]), 1.6, bright=0.62, seed=b * 10 + k)
        place(buf, n, t0 + k * BEAT / 2 + 0.004 * (k % 2), 0.32 * lvl, pan=-0.25 + 0.5 * (idx / 3))
    if b >= 1:
        place(buf, bass(midi(root), BAR * 0.48), t0, 0.5)
        place(buf, bass(midi(root), BAR * 0.46), t0 + 2 * BEAT, 0.38)
    place(buf, pad(pd, BAR + 1.2, att=1.2, rel=1.2), t0, 0.22 * lvl, pan=0)
end_t = len(order) * BAR
place(buf, pluck(midi(74), 3.0, bright=0.6, seed=99), end_t, 0.35)
place(buf, pad([62, 66, 69, 74], 3.0, att=0.3, rel=2.6), end_t, 0.22)
save('travel', verb(buf, wet=0.22, dur=2.0, decay=0.7), peak=0.75)

# ending：終わりの表示の下の和音
seq = [[59, 62, 66, 69], [55, 59, 62, 66], [50, 57, 62, 66], [52, 57, 59, 64]]  # Bm7 Gmaj7 D Asus
L = 4.0
buf = np.zeros((2, int((len(seq) * L + 4) * SR)))
for i, ch in enumerate(seq):
    for j, m in enumerate(ch):
        place(buf, epiano(midi(m), 4.0, vel=0.55), i * L + j * 0.18, 0.28, pan=-0.3 + 0.2 * j)
    place(buf, pad([m - 12 for m in ch[:2]], L + 1.0, att=1.0, rel=1.5, bright=600), i * L, 0.18)
save('ending', verb(buf, wet=0.3, dur=2.6, decay=1.0), peak=0.7)
