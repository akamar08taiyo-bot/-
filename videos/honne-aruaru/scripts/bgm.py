#!/usr/bin/env python3
"""BGM をコードで作曲・合成する（権利フリー）。 python3 -I scripts/bgm.py → public/audio/bgm.wav

軽いウクレレ風ストラム＋ベース＋小さなドラム（96BPM、F の I–vi–IV–V）。
台本の流れに合わせて：「冷めるでしょ」の直前で止め（無音で決める）、オチから軽い編成で戻り、
最後の問いかけでグロッケンの短いフレーズを足して終わる。時刻は src/timeline.json の行から取る。
"""
import json, os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import SR, midi, pluck, glock, bass, kick, snap, shaker, place, convolve, reverb_ir, fft_filter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(os.path.join(ROOT, 'src', 'timeline.json')))
L = {l['id']: l for l in T['lines']}
TOTAL = T['total']
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORDS = [  # (ストラムの音, ベースの根音)
    ([65, 69, 72, 77], 41),  # F
    ([62, 65, 69, 74], 38),  # Dm
    ([62, 65, 70, 74], 46),  # Bb
    ([60, 64, 67, 72], 48),  # C
]
STRUM = [(0, 'D', 1.0), (1, 'D', 0.7), (1.5, 'U', 0.5), (2.5, 'U', 0.55), (3, 'D', 0.75), (3.5, 'U', 0.5)]


def section(start, end, drums=True, strum_gain=1.0, n=None):
    """start〜end 秒に、start を1拍目として曲を置いた (2, N) を返す"""
    N = n or int((TOTAL + 2) * SR)
    pl = np.zeros((2, N)); bs = np.zeros((2, N)); dr = np.zeros((2, N))
    rng = np.random.default_rng(int(start * 1000) + 17)  # 強弱と発音のわずかな揺れ（毎回同じになるよう固定）
    bar = 0
    while start + bar * BAR < end:
        b0 = start + bar * BAR
        notes, root = CHORDS[bar % 4]
        for beat, d, vel in STRUM:
            at = b0 + beat * BEAT
            if at >= end:
                continue
            order = notes if d == 'D' else notes[::-1]
            v = vel * rng.uniform(0.82, 1.08)
            spread = rng.uniform(0.009, 0.016)
            at += rng.uniform(-0.006, 0.006)
            for k, m in enumerate(order):
                x = pluck(midi(m), 0.9, bright=0.5 if d == 'D' else 0.42, seed=bar * 31 + k)
                place(pl, x, at + k * spread, gain=0.16 * v * strum_gain * rng.uniform(0.85, 1.0), pan=-0.25 + 0.15 * k)
        for beat, m in [(0, root), (2, root + 7), (3.5, root + (2 if bar % 4 != 3 else -1))]:
            at = b0 + beat * BEAT
            if at < end:
                place(bs, bass(midi(m), 0.55 if beat < 3.5 else 0.25), at, gain=0.42)
        if drums:
            for beat in (0, 2):
                place(dr, kick(), b0 + beat * BEAT, gain=0.55)
            if bar % 2 == 1:
                place(dr, kick(), b0 + 2.5 * BEAT, gain=0.35)
            for beat in (1, 3):
                place(dr, snap(seed=bar), b0 + beat * BEAT + rng.uniform(-0.004, 0.004),
                      gain=0.22 * rng.uniform(0.75, 1.05), pan=0.1)
            for e in range(8):
                place(dr, shaker(seed=bar * 8 + e), b0 + e * BEAT / 2 + rng.uniform(-0.004, 0.004),
                      gain=0.06 * (1.0 if e % 2 else 0.6) * rng.uniform(0.7, 1.1), pan=0.35)
        bar += 1
    # 区間の外は切る（終わりは 0.35 秒でフェード。残響はあとで足すので自然に残る）
    mix = np.stack([fft_filter(pl[0], hi=4200), fft_filter(pl[1], hi=4200)]) + bs + dr
    i0, i1 = int(start * SR), int(end * SR)
    mix[:, :i0] = 0
    fi = int(0.012 * SR)  # 入りの小さなクリックを防ぐ
    mix[:, i0:i0 + fi] *= np.linspace(0, 1, fi)
    f = int(0.35 * SR)
    if i1 < N:
        mix[:, i1:i1 + f] *= np.linspace(1, 0, f)
        mix[:, i1 + f:] = 0
    return mix


N = int((TOTAL + 2) * SR)
stop = L['a5b']['end'] + 0.12            # 「…指定してくる。」の直後で止める
restart = L['twist']['start'] - 0.05     # オチで戻る（軽い編成）
music = section(0.0, stop, drums=True, n=N)
music += section(restart, TOTAL + 0.2, drums=False, strum_gain=0.85, n=N)
# 最後の問いかけにグロッケンの短いフレーズ
g = np.zeros((2, N))
for k, (m, beat) in enumerate([(77, 0), (81, 0.5), (84, 1.0), (89, 2.0)]):
    place(g, glock(midi(m), 1.4), L['ask']['start'] + 0.1 + beat * BEAT, gain=0.12, pan=0.2)
music += g
# 部屋の響き
ir_l, ir_r = reverb_ir(1.6, 0.42, 3, lo=250, hi=5000), reverb_ir(1.6, 0.42, 4, lo=250, hi=5000)
pre = np.zeros(int(0.018 * SR))  # 少しだけ遅れて響く
wet = np.stack([convolve(music[0], np.concatenate([pre, ir_l])), convolve(music[1], np.concatenate([pre, ir_r]))])[:, :N]
music = music + 0.26 * wet
music = np.stack([fft_filter(music[0], lo=45, hi=7000), fft_filter(music[1], lo=45, hi=7000)])
# 終わりのフェード
end = int(TOTAL * SR)
fo = int(1.2 * SR)
music[:, end - fo:end] *= np.linspace(1, 0, fo) ** 1.5
music[:, end:] = 0
music = music[:, :end]
music /= np.abs(music).max() + 1e-9
music *= 0.7
os.makedirs(os.path.join(ROOT, 'public', 'audio'), exist_ok=True)
with wave.open(os.path.join(ROOT, 'public', 'audio', 'bgm.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((music.T * 32767).astype('<i2').tobytes())
print(f'bgm.wav {music.shape[1] / SR:.2f}s stop={stop:.2f} restart={restart:.2f}')
