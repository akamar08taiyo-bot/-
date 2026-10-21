#!/usr/bin/env python3
"""場所の環境音（ベッド）をコードで合成する（権利フリー）。 python3 -I scripts/amb.py → public/shared/amb/<名前>.wav

どれも 60 秒で、終わりと始まりがつながる（ミックスで繰り返して使う）。ホールの音は「均した機械音」にとどめ、
実在の機種の楽曲・声・特徴的な効果音に似せない（短い電子音を無作為に薄く散らして響きに溶かすだけ）。

  night      … 港の夜（遠い波、秋の虫、遠い車）              van_night   … 夜の車内（扉を閉めた／外がこもる）
  morning    … 朝の駐車場（鳥、遠い車、風）                  van_morning … 朝の車内
  hall       … ホールの中（空調、均した機械音、ざわめき）      rest        … 休憩側の通路（ホールが少し遠い）
  lot        … 昼の駐車場（車通り、風、遠い鳥）              van_day     … 昼の車内（扉を開けた）
  road       … 走行（エンジン、タイヤ、風）                  station     … 給油所（設備のうなり、車通り）
  dusk       … 夕方の駐車場（車通り、遠い鳥、風）
"""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import SR, noise, fft_filter, convolve, reverb_ir

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'shared', 'amb')
os.makedirs(OUT, exist_ok=True)
DUR = 60.0
XF = 4.0  # つなぎ目のクロスフェード
N = int((DUR + XF) * SR)
t = np.arange(N) / SR


def stereo(l, r=None):
    return np.stack([l, l if r is None else r])


def slow(seed, rate=0.2, lo=0.3, hi=1.0):
    """ゆっくり揺れる倍率（lo〜hi）"""
    e = fft_filter(noise(N, seed), hi=rate)
    e = (e - e.min()) / (np.ptp(e) + 1e-9)
    return lo + (hi - lo) * e


def pan(x, p):
    """p: -1（左）〜1（右）"""
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)])


def put(buf, x, at):
    i = int(at * SR)
    j = min(buf.shape[-1], i + x.shape[-1])
    if j > i:
        buf[..., i:j] += x[..., : j - i]


def loopable(x):
    """最後の XF 秒を最初に重ねて、60 秒で途切れずに回るようにする"""
    n, f = int(DUR * SR), int(XF * SR)
    y = x[:, :n].copy()
    w = np.linspace(0, 1, f)
    y[:, :f] = x[:, :f] * w + x[:, n:n + f] * (1 - w)
    return y


def save(name, x, level_db):
    x = loopable(x)
    rms = np.sqrt(np.mean(x ** 2))
    x = x / (rms + 1e-12) * 10 ** (level_db / 20)
    peak = np.abs(x).max()
    if peak > 0.95:
        x *= 0.95 / peak
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype('<i2').tobytes())
    print(name, f'{level_db} dB rms')


def traffic(seed, level=1.0, passes=5):
    """遠い車通り（低いうなり＋ときどき通り過ぎる車）"""
    x = stereo(fft_filter(noise(N, seed), hi=220) * slow(seed + 1, 0.1, 0.5, 1.0) * 0.6,
               fft_filter(noise(N, seed + 2), hi=220) * slow(seed + 3, 0.1, 0.5, 1.0) * 0.6)
    rng = np.random.default_rng(seed)
    for k in range(passes):
        at = rng.uniform(0, DUR)
        d = rng.uniform(3.0, 6.0)
        n = int(d * SR)
        tt = np.arange(n) / SR
        car = fft_filter(noise(n, seed + 10 + k), lo=60, hi=900) * np.exp(-((tt - d / 2) / (d / 4)) ** 2)
        p = np.linspace(-0.8, 0.8, n) * rng.choice([-1, 1])
        put(x, np.stack([car * np.cos((p + 1) * np.pi / 4), car * np.sin((p + 1) * np.pi / 4)]) * rng.uniform(0.6, 1.2), at)
    return x * level


def wind(seed, level=1.0, lo=80, hi=700):
    return stereo(fft_filter(noise(N, seed), lo=lo, hi=hi) * slow(seed + 1, 0.15, 0.2, 1.0),
                  fft_filter(noise(N, seed + 2), lo=lo, hi=hi) * slow(seed + 3, 0.15, 0.2, 1.0)) * level


def waves(seed, level=1.0):
    """遠い波（ゆっくり寄せて引く低いざわめき）"""
    sw = 0.5 + 0.5 * np.sin(2 * np.pi * t / 7.5 + 1.0) ** 2
    return stereo(fft_filter(noise(N, seed), lo=60, hi=900) * sw, fft_filter(noise(N, seed + 1), lo=60, hi=900) * sw) * level


def insects(seed, level=1.0):
    """秋の虫：鈴のような高い音の震え（スズムシ風）と、コロコロと短く鳴く声（コオロギ風）"""
    x = np.zeros((2, N))
    rng = np.random.default_rng(seed)
    for v in range(5):
        f = rng.uniform(3900, 5600)
        p = rng.uniform(-0.8, 0.8)
        g = rng.uniform(0.4, 1.0)
        at = rng.uniform(0, 1.5)
        kind = v % 2
        while at < DUR + XF:
            if kind == 0:  # リーン：0.4〜0.9 秒、速い震え
                d = rng.uniform(0.4, 0.9)
                tt = np.arange(int(d * SR)) / SR
                y = np.sin(2 * np.pi * f * tt) * (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(45, 60) * tt)) \
                    * np.minimum(tt / 0.03, 1) * np.minimum((d - tt) / 0.08, 1)
                at_next = at + d + rng.uniform(0.6, 1.6)
            else:  # コロコロ：短い粒が 3〜6 回
                k = rng.integers(3, 7)
                d = k / 22
                tt = np.arange(int(d * SR)) / SR
                y = np.sin(2 * np.pi * f * 0.85 * tt) * np.maximum(np.sin(2 * np.pi * 22 * tt), 0) ** 2
                at_next = at + d + rng.uniform(0.5, 1.4)
            put(x, pan(y * g, p), at)
            at = at_next
    return x * level


def birds(seed, level=1.0, count=70):
    """朝の小鳥（下がる短いさえずりを 2〜4 回）"""
    x = np.zeros((2, N))
    rng = np.random.default_rng(seed)
    for k in range(count):
        at = rng.uniform(0, DUR + XF - 1)
        p = rng.uniform(-0.9, 0.9)
        g = rng.uniform(0.3, 1.0)
        f0 = rng.uniform(3400, 6200)
        for j in range(rng.integers(2, 5)):
            d = rng.uniform(0.04, 0.09)
            tt = np.arange(int(d * SR)) / SR
            f = f0 * (1 - 0.35 * tt / d) * rng.uniform(0.95, 1.05)
            y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d) ** 2
            put(x, pan(y * g, p), at + j * rng.uniform(0.09, 0.15))
    return x * level


def room_tone(seed, level=1.0):
    return stereo(fft_filter(noise(N, seed), lo=60, hi=400), fft_filter(noise(N, seed + 1), lo=60, hi=400)) * level


def muffle(x, hi=1500, gain=0.35):
    return np.stack([fft_filter(x[0], hi=hi), fft_filter(x[1], hi=hi)]) * gain


def hall(seed):
    """ホール：空調の低いうなり＋たくさんの台の均したざわめき＋薄く散らした電子音（響きに溶かす）＋人の気配"""
    ac = stereo(fft_filter(noise(N, seed), lo=30, hi=260), fft_filter(noise(N, seed + 1), lo=30, hi=260)) * 0.8
    wash = stereo(fft_filter(noise(N, seed + 2), lo=300, hi=3800) * slow(seed + 3, 0.5, 0.6, 1.0),
                  fft_filter(noise(N, seed + 4), lo=300, hi=3800) * slow(seed + 5, 0.5, 0.6, 1.0)) * 0.35
    rng = np.random.default_rng(seed)
    blips = np.zeros((2, N))
    for k in range(int(14 * (DUR + XF))):  # 1 秒に 14 個ほど。音程は無作為で、旋律にしない
        at = rng.uniform(0, DUR + XF - 0.3)
        d = rng.uniform(0.03, 0.16)
        tt = np.arange(int(d * SR)) / SR
        f = rng.uniform(520, 2600)
        y = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / d) * rng.uniform(0.1, 0.5)
        put(blips, pan(y, rng.uniform(-1, 1)), at)
    ir_l, ir_r = reverb_ir(1.6, 0.5, seed + 6), reverb_ir(1.6, 0.5, seed + 7)
    blips = np.stack([convolve(blips[0], ir_l)[:N], convolve(blips[1], ir_r)[:N]]) * 0.5
    murmur = np.zeros((2, N))
    for v in range(6):  # ひそひそ話（音節の速さで揺れる中域）
        m = fft_filter(noise(N, seed + 20 + v), lo=280, hi=1300) * np.maximum(fft_filter(noise(N, seed + 30 + v), hi=5), 0)
        murmur += pan(m, rng.uniform(-0.9, 0.9)) * 0.5
    return ac + wash + blips + murmur * 0.6


night = waves(1, 0.35) + insects(2, 0.5) + traffic(3, 0.25, 3) + wind(4, 0.15)
save('night', night, -34)
save('van_night', muffle(night, 1800, 1.0) + room_tone(5, 0.3), -40)
morning = birds(6, 0.6) + traffic(7, 0.5, 6) + wind(8, 0.3)
save('morning', morning, -34)
save('van_morning', muffle(morning, 2000, 1.0) + room_tone(9, 0.3), -40)
h = hall(10)
save('hall', h, -30)
save('rest', muffle(h, 1600, 1.0) + room_tone(11, 0.2), -34)
lot = traffic(12, 1.0, 9) + wind(13, 0.4) + birds(14, 0.15, 15)
save('lot', lot, -33)
save('van_day', muffle(lot, 2500, 1.0) + room_tone(15, 0.3), -38)
eng = sum(np.sin(2 * np.pi * 47 * k * t + k) / k for k in range(1, 10)) * (1 + 0.05 * np.sin(2 * np.pi * 0.3 * t))
road = stereo(fft_filter(eng, hi=320) * 0.5) + stereo(fft_filter(noise(N, 16), lo=40, hi=1100), fft_filter(noise(N, 17), lo=40, hi=1100)) * 0.6 \
    + wind(18, 0.25, 300, 2200)
save('road', road, -31)
hum = sum(np.sin(2 * np.pi * 100 * k * t) / k for k in range(1, 6))
save('station', stereo(fft_filter(hum, hi=600) * 0.15) + traffic(19, 1.0, 7) + wind(20, 0.3), -33)
save('dusk', traffic(21, 1.0, 7) + wind(22, 0.4) + birds(23, 0.1, 10), -34)
