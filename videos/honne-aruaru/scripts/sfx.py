#!/usr/bin/env python3
"""効果音をコードで合成する（権利フリー）。 python3 -I scripts/sfx.py → public/shared/sfx/<名前>.wav（全部の回で共通）

  don    … 題字がドンと出る（低い打撃＋軽い残響）
  pop    … ①〜⑤の番号が出る（ポン）
  boso   … ボソッとつぶやく直前の小さな合図（ぽそっ）
  freeze … 「冷めるでしょ」の瞬間（凍る・ヒューッ）
  tehe   … オチの前（ポロロン↓、ちょっと間の抜けた）
  pikon  … 最後の問いかけ（ピコン）
  gaan   … 衝撃のひと言の直後（ガーン：不協和の和音の一撃）
  paper  … 紙がサッと出る
  stamp  … はんこをドンと押す
  coin   … へそくり（チャリン）
"""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import SR, t_, noise, fft_filter, convolve, reverb_ir, midi, pluck, glock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'shared', 'sfx')
os.makedirs(OUT, exist_ok=True)


def save(name, x, peak=0.8):
    if x.ndim == 1:
        x = np.stack([x, x])
    x = x / (np.abs(x).max() + 1e-9) * peak
    fade = int(0.01 * SR)
    x[:, -fade:] *= np.linspace(1, 0, fade)
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype('<i2').tobytes())
    print(name, f'{x.shape[1] / SR:.2f}s')


def with_verb(x, wet=0.25, dur=1.2, decay=0.35, seed=7):
    ir = reverb_ir(dur, decay, seed)
    l = convolve(x, ir)
    r = convolve(x, reverb_ir(dur, decay, seed + 1))
    dry = np.concatenate([x, np.zeros(len(l) - len(x))])
    return np.stack([dry + wet * l, dry + wet * r])


# don：題字の打撃
t = t_(0.9)
f = 40 + 70 * np.exp(-t * 18)
body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
hit = fft_filter(noise(len(t), 11), lo=80, hi=2500) * np.exp(-t * 40)
save('don', with_verb(body + 0.5 * hit, wet=0.18, decay=0.25), peak=0.9)

# pop：ポン（上がる正弦＋小さなクリック）
t = t_(0.22)
f = 620 + 520 * (1 - np.exp(-t * 60))
x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26) * np.minimum(t / 0.002, 1)
x += 0.15 * fft_filter(noise(len(t), 2), lo=2000, hi=8000) * np.exp(-t * 200)
save('pop', with_verb(x, wet=0.12, decay=0.15), peak=0.7)

# boso：ぽそっ（低めのこもった短音）
t = t_(0.18)
x = np.sin(2 * np.pi * 330 * t) * np.exp(-t * 30) * np.minimum(t / 0.004, 1)
x = fft_filter(x + 0.2 * noise(len(t), 4) * np.exp(-t * 60), hi=1800)
save('boso', x, peak=0.5)

# freeze：凍る（高い倍音のきらめき＋下がる風）
t = t_(1.9)
rng = np.random.default_rng(21)
sh = np.zeros_like(t)
for k in range(14):
    fk = rng.uniform(2600, 7200)
    on = rng.uniform(0.0, 0.5)
    e = np.where(t > on, np.exp(-(t - on) * rng.uniform(2.5, 5.0)), 0) * np.minimum(np.maximum(t - on, 0) / 0.01, 1)
    sh += np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * e / 14
wind = noise(len(t), 22)
cen = 1400 * np.exp(-t * 1.3) + 250
# 帯域を時間で動かす代わりに、3本の帯域を順に重ねる
w1 = fft_filter(wind, lo=900, hi=2600) * np.exp(-((t - 0.25) / 0.25) ** 2)
w2 = fft_filter(wind, lo=500, hi=1400) * np.exp(-((t - 0.6) / 0.3) ** 2)
w3 = fft_filter(wind, lo=250, hi=800) * np.exp(-((t - 1.0) / 0.4) ** 2)
x = 1.0 * sh + 0.55 * (w1 + w2 + w3) / 3
save('freeze', with_verb(x, wet=0.35, dur=1.6, decay=0.5), peak=0.75)

# tehe：ポロロン↓（間の抜けた下降アルペジオ）
x = np.zeros(int(1.4 * SR))
for i, m in enumerate([79, 76, 72, 67]):
    n = pluck(midi(m), 1.0, bright=0.75, seed=i)
    j = int(i * 0.085 * SR)
    x[j:j + len(n)] += n[: len(x) - j]
save('tehe', with_verb(x, wet=0.2, decay=0.3), peak=0.6)

# pikon：ピコン（2音）
x = np.zeros(int(0.7 * SR))
for i, (m, at) in enumerate([(88, 0.0), (93, 0.09)]):
    n = glock(midi(m), 0.6)
    j = int(at * SR)
    x[j:j + len(n)] += n[: len(x) - j]
save('pikon', with_verb(x, wet=0.15, decay=0.2), peak=0.6)

# gaan：ガーン（半音でぶつかる和音の一撃＋低い打撃。ノコギリ波を丸めて金管っぽく）
t = t_(1.6)
x = np.zeros_like(t)
for m in (45, 46, 52, 57, 58):
    f = midi(m)
    saw = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 12))
    x += saw * np.exp(-t * 2.2) * np.minimum(t / 0.012, 1)
x = fft_filter(x, hi=2400)
x += 0.8 * np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 20)) / SR) * np.exp(-t * 6)
save('gaan', with_verb(x, wet=0.3, dur=1.4, decay=0.4), peak=0.8)

# paper：紙がサッ（短い帯域ノイズの掃き）
t = t_(0.35)
n = noise(len(t), 31)
x = fft_filter(n, lo=1500, hi=7000) * np.exp(-((t - 0.09) / 0.06) ** 2)
x += 0.5 * fft_filter(n, lo=600, hi=2000) * np.exp(-((t - 0.16) / 0.05) ** 2)
save('paper', x, peak=0.6)

# stamp：はんこ（低いドン＋紙の当たる音）
t = t_(0.6)
x = np.sin(2 * np.pi * np.cumsum(70 + 120 * np.exp(-t * 40)) / SR) * np.exp(-t * 18)
x += 0.6 * fft_filter(noise(len(t), 41), lo=300, hi=3500) * np.exp(-t * 60)
save('stamp', with_verb(x, wet=0.12, decay=0.12), peak=0.85)

# coin：チャリン（高い金属音を2回）
x = np.zeros(int(1.2 * SR))
for at, f0 in ((0.0, 2637.0), (0.07, 3520.0)):
    tt = t_(1.0)
    y = sum(np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt * (6 + 3 * i)) / (1 + i)
            for i, r in enumerate((1.0, 2.76, 5.4, 8.9)))
    j = int(at * SR)
    x[j:j + len(y)] += y[: len(x) - j]
save('coin', with_verb(x, wet=0.18, decay=0.25), peak=0.55)
