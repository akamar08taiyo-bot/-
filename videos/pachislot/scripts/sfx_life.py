#!/usr/bin/env python3
"""生活音（車中泊・ホール・移動）をコードで合成する（権利フリー）。 python3 -I scripts/sfx_life.py → public/shared/sfx/<名前>.wav

ドラマ用。誇張しない小さな音を、物の材質（金属・樹脂・布・紙・水）ごとに「鳴り（固有振動）＋こすれ（ノイズ）」で作る。
実在の機種の効果音・楽曲や、実在のスマホの通知音には似せない。乱数はすべて種を固定する（毎回同じ音になる）。

  lid … 小さい鍋の蓋を閉める        switch … 電気鍋のスイッチ（押して離す）   steam … 蓋を開けた湯気
  simmer … 鍋のふつふつ（3秒）       water_pour … 容器から鍋へ水を注ぐ         egg … 卵を割って落とす
  chopsticks … 箸を置く              bowl … 器を置く                           mug … マグを置く
  cloth … 服・寝袋の短い衣擦れ        cloth_long … 寝袋を畳む・広げる            bag_plastic … レジ袋
  zip … バッグのファスナー            pencil … 鉛筆で書く                       page … メモをめくる
  box_lid … 収納の蓋が引っ掛かって閉まる table_fold … 折り畳み台の脚           lantern … ランタンのスイッチ
  slide_door … 車の横扉を閉める       door … 車のドアを閉める                   seatbelt … シートベルト
  steps_gravel … 砂利の足音           steps_soft … ホールの床の足音             engine_start … 軽バンの始動とアイドル
  chair … ホールの椅子を引いて座る
  engine_off … エンジンを止める       blinker … ウインカー                       fuel … 給油機
  buttons … 台の停止ボタン3回         lever … レバー                             cup_water … 給水機から紙コップへ
  notify … 通知（柔らかい2音）         vibrate … スマホの振動                     typing … 画面を打つ
  car_pass … 遠くを車が通る           card … 編集カードが出る（ごく小さい紙の音）
"""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import SR, t_, noise, fft_filter, convolve, reverb_ir

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'shared', 'sfx')
os.makedirs(OUT, exist_ok=True)


def save(name, x, peak=0.7):
    if x.ndim == 1:
        x = np.stack([x, x])
    x = x / (np.abs(x).max() + 1e-9) * peak
    fade = int(0.01 * SR)
    x[:, -fade:] *= np.linspace(1, 0, fade)
    with wave.open(os.path.join(OUT, f'{name}.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x.T * 32767).astype('<i2').tobytes())
    print(name, f'{x.shape[1] / SR:.2f}s')


def room(x, wet=0.12, dur=0.5, decay=0.12, seed=3):
    """狭い車内・部屋の短い響き（ステレオ）"""
    l = convolve(x, reverb_ir(dur, decay, seed))
    r = convolve(x, reverb_ir(dur, decay, seed + 1))
    dry = np.concatenate([x, np.zeros(len(l) - len(x))])
    return np.stack([dry + wet * l, dry + wet * r])


def modal(dur, modes, seed=0, exc=0.004, exc_lo=500, exc_hi=9000):
    """固有振動の和（周波数, 減衰の時定数, 強さ）を短いノイズで叩く"""
    t = t_(dur)
    y = np.zeros_like(t)
    rng = np.random.default_rng(seed)
    for f, tau, g in modes:
        y += g * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    n = int(exc * SR)
    hit = np.zeros_like(t)
    hit[:n] = fft_filter(noise(n, seed + 100), lo=exc_lo, hi=exc_hi) * np.linspace(1, 0, n)
    return (y * np.minimum(t / 0.0008, 1) + 0.6 * hit)


def thud(dur=0.18, f0=110, seed=1, lp=700):
    t = t_(dur)
    body = np.sin(2 * np.pi * np.cumsum(f0 + 60 * np.exp(-t * 60)) / SR) * np.exp(-t * 28)
    return body + 0.5 * fft_filter(noise(len(t), seed), hi=lp) * np.exp(-t * 45)


def mod_env(n, rate=10.0, seed=0, depth=1.0):
    """ゆらぐ包絡（ローパスしたノイズ）"""
    e = fft_filter(noise(n, seed), hi=rate)
    e = (e - e.min()) / (np.ptp(e) + 1e-9)
    return (1 - depth) + depth * e


def crackle(n, density=600, seed=0, lo=1500, hi=9000):
    """まばらな小さい破裂（レジ袋・ナイロン・紙のパリパリ）"""
    rng = np.random.default_rng(seed)
    x = np.zeros(n)
    k = int(density * n / SR)
    idx = rng.integers(0, n, k)
    x[idx] = rng.standard_normal(k) * rng.uniform(0.2, 1.0, k)
    grain = noise(48, seed + 7) * np.exp(-np.arange(48) / 12)  # 1ms ほどの小さな鳴り（1点の針にしない）
    return fft_filter(np.convolve(x, grain)[:n], lo=lo, hi=hi)


def seq(total, parts):
    """[(秒, 波形, 倍率)] を並べる"""
    x = np.zeros(int(total * SR))
    for at, y, g in parts:
        i = int(at * SR)
        j = min(len(x), i + len(y))
        x[i:j] += g * y[: j - i]
    return x


def fade_io(x, a=0.02, b=0.05):
    n = len(x)
    e = np.ones(n)
    na, nb = int(a * SR), int(b * SR)
    e[:na] = np.linspace(0, 1, na)
    e[n - nb:] = np.linspace(1, 0, nb)
    return x * e


# --- 台所 ---
def clank(seed, g=1.0):
    return g * modal(0.25, [(1130, 0.05, 1.0), (2710, 0.035, 0.7), (4330, 0.02, 0.5), (6180, 0.012, 0.3)], seed=seed, exc=0.003, exc_lo=1500)


# 蓋：金属どうしが当たって、すぐ落ち着く（響かせない）
save('lid', room(seq(0.6, [(0.0, thud(0.1, 190, 1, 1200), 0.4), (0.0, clank(1), 1.0), (0.045, clank(2), 0.45),
                           (0.08, clank(3), 0.25), (0.105, clank(4), 0.12)]), wet=0.08), peak=0.5)

click = lambda s, f: modal(0.05, [(f, 0.006, 1.0), (f * 2.3, 0.004, 0.5)], seed=s, exc=0.002, exc_lo=2000)
save('switch', seq(0.2, [(0.0, click(3, 2900), 1.0), (0.07, click(4, 3300), 0.6)]), peak=0.45)

t = t_(1.4)
steam = fft_filter(noise(len(t), 5), lo=1800, hi=9000) * np.exp(-t * 2.5) * np.minimum(t / 0.05, 1)
save('steam', fade_io(steam, 0.02, 0.2), peak=0.35)

rng = np.random.default_rng(6)
x = 0.25 * fft_filter(noise(int(3.2 * SR), 7), lo=80, hi=500) * mod_env(int(3.2 * SR), 3, 8, 0.5)
for k in range(110):  # 小さな泡
    at = rng.uniform(0, 3.0)
    f = rng.uniform(320, 950)
    d = rng.uniform(0.012, 0.03)
    tt = t_(d)
    pop = np.sin(2 * np.pi * np.cumsum(f * (1 + 1.6 * tt / d)) / SR) * np.sin(np.pi * tt / d)
    x = x + seq(3.2, [(at, pop, rng.uniform(0.08, 0.3))])
save('simmer', fade_io(x, 0.2, 0.3), peak=0.35)

rng = np.random.default_rng(9)
n = int(2.6 * SR)
t = np.arange(n) / SR
stream = 0.35 * fft_filter(noise(n, 10), lo=200, hi=2200) * mod_env(n, 30, 11, 0.8)
for k in range(520):  # 注ぐ水の泡（水位が上がるにつれて少しずつ高く）
    at = rng.uniform(0.05, 2.3)
    f = rng.uniform(220, 700) * (1 + 0.35 * at / 2.3)
    d = rng.uniform(0.02, 0.05)
    tt = t_(d)
    b = np.sin(2 * np.pi * np.cumsum(f * (1 + 0.5 * tt / d)) / SR) * np.exp(-tt / (d / 4)) * np.minimum(tt / 0.002, 1)
    stream = stream + seq(2.6, [(at, b, rng.uniform(0.15, 0.6))])
stream *= np.minimum(t / 0.1, 1) * np.where(t > 2.3, np.exp(-(t - 2.3) * 12), 1)
save('water_pour', room(stream, wet=0.08), peak=0.4)

tok = modal(0.05, [(1650, 0.006, 1.0), (3400, 0.004, 0.5)], seed=12, exc=0.0015, exc_lo=1200)
shell = crackle(int(0.06 * SR), 5000, 13, 1500, 8000) * np.exp(-t_(0.06) * 50)
tt = t_(0.12)
bloop = np.sin(2 * np.pi * np.cumsum(520 - 260 * tt / 0.12) / SR) * np.exp(-tt * 30) * np.minimum(tt / 0.003, 1)
splash = fft_filter(noise(len(tt), 14), lo=300, hi=2500) * np.exp(-tt * 60)
save('egg', seq(0.75, [(0.0, tok, 1.0), (0.012, shell, 0.35), (0.32, shell, 0.5), (0.45, bloop, 0.9), (0.45, splash, 0.3)]), peak=0.45)

stick = modal(0.12, [(1850, 0.018, 1.0), (3700, 0.01, 0.4), (5200, 0.006, 0.2)], seed=15, exc=0.002)
save('chopsticks', seq(0.3, [(0.0, stick, 1.0), (0.045, stick, 0.55)]), peak=0.4)
save('bowl', room(seq(0.6, [(0.0, thud(0.12, 140, 16), 0.6), (0.0, modal(0.5, [(1040, 0.12, 1.0), (2610, 0.07, 0.5), (4150, 0.04, 0.3)], seed=17), 0.5)])), peak=0.45)
save('mug', room(seq(0.5, [(0.0, thud(0.1, 170, 18), 0.7), (0.0, modal(0.35, [(1220, 0.06, 1.0), (3120, 0.035, 0.45)], seed=19), 0.45)])), peak=0.45)

# --- 布・紙 ---
n = int(0.9 * SR)
cl = fft_filter(noise(n, 20), lo=300, hi=6000) * mod_env(n, 14, 21, 0.9) * np.sin(np.pi * np.arange(n) / n) ** 0.7
save('cloth', cl, peak=0.35)
n = int(2.3 * SR)
t = np.arange(n) / SR
cl2 = np.zeros(n)
for k, (c, w, g) in enumerate([(0.35, 0.22, 1.0), (1.0, 0.3, 0.8), (1.7, 0.25, 0.9)]):  # 寝袋を3回動かす
    cl2 += g * fft_filter(noise(n, 22 + k), lo=250, hi=4500) * np.exp(-((t - c) / w) ** 2) * mod_env(n, 12, 30 + k, 0.6)
cl2 += 0.12 * crackle(n, 250, 24, 1500, 7000) * mod_env(n, 6, 25, 0.8)
save('cloth_long', fade_io(cl2, 0.05, 0.2), peak=0.38)
n = int(1.6 * SR)
bag = crackle(n, 2600, 26, 1800, 11000) * mod_env(n, 7, 27, 0.95) + 0.25 * fft_filter(noise(n, 28), lo=2000, hi=9000) * mod_env(n, 7, 27, 0.95)
save('bag_plastic', fade_io(bag, 0.03, 0.15), peak=0.35)

rng = np.random.default_rng(29)
n = int(0.55 * SR)
zp = np.zeros(n)
pos = 0.0
while pos < 0.5:
    i = int(pos * SR)
    zp[i:i + 30] += rng.uniform(0.5, 1) * np.hanning(30)
    pos += 1 / rng.uniform(140, 210)
save('zip', fade_io(fft_filter(zp, lo=1500, hi=7000), 0.01, 0.05), peak=0.3)

rng = np.random.default_rng(31)
parts = []
at = 0.0
for k in range(8):  # 鉛筆の線（紙の目のざらつき＋細い擦れ）
    d = rng.uniform(0.07, 0.24)
    m = int(d * SR)
    tt = np.arange(m) / SR
    y = 0.6 * fft_filter(noise(m, 32 + k), lo=3000, hi=10000) + crackle(m, 6000, 50 + k, 2500, 10000)
    y *= np.minimum(tt / 0.012, 1) * np.minimum((d - tt) / 0.02, 1)
    parts.append((at, y, rng.uniform(0.6, 1.0)))
    at += d + rng.uniform(0.03, 0.12)
save('pencil', seq(at + 0.05, parts), peak=0.25)

t = t_(0.45)
pg = fft_filter(noise(len(t), 40), lo=900, hi=7000) * np.exp(-((t - 0.12) / 0.07) ** 2)
pg += 0.5 * fft_filter(noise(len(t), 41), lo=300, hi=1800) * np.exp(-((t - 0.2) / 0.05) ** 2)
save('page', pg, peak=0.35)
t = t_(0.4)
save('card', fft_filter(noise(len(t), 42), lo=1200, hi=6000) * np.exp(-((t - 0.1) / 0.06) ** 2), peak=0.18)

# --- 車内の道具 ---
n = int(0.35 * SR)
scrape = fft_filter(noise(n, 43), lo=400, hi=2500) * mod_env(n, 40, 44, 0.8) * np.sin(np.pi * np.arange(n) / n)
tock = seq(0.3, [(0.0, thud(0.1, 260, 45, 1500), 0.8), (0.0, modal(0.12, [(720, 0.02, 1.0), (1640, 0.012, 0.5)], seed=46), 0.4)])
seat = seq(0.4, [(0.0, thud(0.14, 180, 47, 1000), 1.0), (0.0, modal(0.2, [(690, 0.035, 1.0), (1580, 0.02, 0.5), (2900, 0.01, 0.2)], seed=48), 0.6)])
save('box_lid', room(seq(1.4, [(0.0, tock, 0.6), (0.18, scrape, 0.3), (0.75, seat, 1.0)]), wet=0.1), peak=0.5)
clack = modal(0.3, [(1480, 0.05, 1.0), (3820, 0.03, 0.6), (6050, 0.015, 0.3)], seed=47)
save('table_fold', room(seq(1.1, [(0.0, clack, 1.0), (0.4, clack, 0.8), (0.75, thud(0.12, 150, 48), 0.5)])), peak=0.45)
save('lantern', seq(0.15, [(0.0, click(49, 2200), 1.0), (0.05, click(50, 2600), 0.4)]), peak=0.35)

# --- 車 ---
n = int(0.6 * SR)
t = np.arange(n) / SR
roll = fft_filter(noise(n, 51), lo=90, hi=900) * (0.2 + 0.8 * t / 0.6) * mod_env(n, 35, 52, 0.5)
snapk = modal(0.3, [(620, 0.05, 0.8), (1450, 0.03, 0.6), (3100, 0.012, 0.4)], seed=54, exc=0.003, exc_lo=800)
latch = seq(0.7, [(0.0, thud(0.22, 70, 53, 300), 1.0), (0.0, snapk, 0.8), (0.06, modal(0.08, [(2400, 0.01, 1.0)], seed=57), 0.4)])
save('slide_door', room(seq(1.4, [(0.0, fade_io(roll, 0.08, 0.01), 0.35), (0.6, latch, 1.0)]), wet=0.12, dur=0.6, decay=0.12), peak=0.7)
save('door', room(seq(0.9, [(0.0, thud(0.3, 75, 55, 350), 1.0), (0.0, modal(0.3, [(540, 0.05, 0.5), (1300, 0.03, 0.3)], seed=56), 0.4)]), wet=0.15, dur=0.8, decay=0.2), peak=0.7)
n = int(0.6 * SR)
pull = fft_filter(noise(n, 57), lo=800, hi=5000) * mod_env(n, 40, 58, 0.6) * np.sin(np.pi * np.arange(n) / n)
buckle = modal(0.15, [(2500, 0.02, 1.0), (5100, 0.01, 0.5)], seed=59)
save('seatbelt', seq(1.0, [(0.0, pull, 0.6), (0.75, buckle, 1.0)]), peak=0.4)


def engine(rpm_curve, seed):
    """3気筒の軽エンジン。排気の脈（爆発ごとの低い破裂）を回転数の曲線どおりに並べる"""
    n = len(rpm_curve)
    fire = rpm_curve / 60 * 1.5
    ph = np.cumsum(fire) / SR
    x = np.zeros(n)
    idx = np.where(np.diff(np.floor(ph)) > 0)[0]
    rng = np.random.default_rng(seed)
    m = int(0.03 * SR)
    pulse = fft_filter(noise(m, seed), lo=40, hi=350) * np.exp(-np.arange(m) / SR * 120)
    for i in idx:
        j = min(n, i + m)
        x[i:j] += pulse[: j - i] * rng.uniform(0.8, 1.0)
    body = sum(np.sin(2 * np.pi * k * np.cumsum(fire) / SR) / k for k in range(2, 9))
    mech = fft_filter(noise(n, seed + 1), lo=900, hi=3000) * 0.05
    return fft_filter(x, hi=500) + 0.25 * fft_filter(body, hi=300) + mech


n = int(0.85 * SR)
t = np.arange(n) / SR
starter = (fft_filter(np.sin(2 * np.pi * 420 * t) + 0.5 * np.sin(2 * np.pi * 840 * t), hi=2000) * 0.4
           + 0.3 * fft_filter(noise(n, 60), lo=150, hi=1200)) * (0.55 + 0.45 * np.sin(2 * np.pi * 5 * t))
tt = t_(3.6)
rpm = 900 + 700 * np.exp(-((tt - 0.35) / 0.25) ** 2) * (tt < 1.2)
idle = engine(rpm, 61)
idle *= np.minimum(tt / 0.05, 1)
save('engine_start', fade_io(seq(4.4, [(0.0, starter, 1.0), (0.8, idle, 1.0)]), 0.01, 0.6), peak=0.6)
tt = t_(1.6)
idle2 = engine(np.full(len(tt), 880.0), 62) * np.where(tt > 1.0, np.exp(-(tt - 1.0) / 0.06), 1)
save('engine_off', seq(2.4, [(0.0, idle2, 1.0), (1.02, thud(0.3, 60, 63, 300), 0.5), (1.6, click(64, 1800), 0.15), (1.95, click(65, 1700), 0.1)]), peak=0.55)
tick = modal(0.05, [(1650, 0.008, 1.0), (3100, 0.005, 0.4)], seed=66, exc=0.002)
tock = modal(0.05, [(1250, 0.008, 1.0), (2600, 0.005, 0.4)], seed=67, exc=0.002)
save('blinker', seq(3.4, [(i * 0.34, tick if i % 2 == 0 else tock, 1.0) for i in range(10)]), peak=0.35)
n = int(3.4 * SR)
t = np.arange(n) / SR
hum = sum(np.sin(2 * np.pi * 120 * k * t) / k for k in range(1, 8))
flow = fft_filter(noise(n, 68), lo=300, hi=2500) * mod_env(n, 12, 69, 0.4)
fuel = fft_filter(hum, hi=900) * 0.25 + flow * 0.6
fuel *= np.minimum(t / 0.2, 1) * np.where(t > 3.0, np.exp(-(t - 3.0) * 30), 1)
save('fuel', seq(3.6, [(0.0, fuel, 1.0), (3.0, modal(0.2, [(1900, 0.03, 1.0), (4200, 0.015, 0.4)], seed=70), 0.6)]), peak=0.4)
n = int(3.0 * SR)
t = np.arange(n) / SR
whoosh = fft_filter(noise(n, 71), lo=60, hi=1400) * np.exp(-((t - 1.5) / 0.7) ** 2)
pan = np.clip((t - 0.4) / 2.2, 0, 1)
save('car_pass', np.stack([whoosh * np.cos(pan * np.pi / 2), whoosh * np.sin(pan * np.pi / 2)]), peak=0.35)

# --- ホール ---
press = lambda s: seq(0.12, [(0.0, modal(0.1, [(930, 0.018, 1.0), (2380, 0.01, 0.5)], seed=s), 1.0), (0.0, thud(0.06, 200, s + 1, 1200), 0.4)])
save('buttons', room(seq(0.9, [(0.0, press(72), 1.0), (0.27, press(74), 0.9), (0.55, press(76), 0.95)]), wet=0.1), peak=0.4)
spring = modal(0.35, [(410, 0.08, 1.0), (1120, 0.05, 0.5), (2300, 0.02, 0.2)], seed=78)
save('lever', room(seq(0.5, [(0.0, thud(0.08, 180, 79, 1500), 0.8), (0.0, spring, 0.5)]), wet=0.1), peak=0.4)
n = int(1.9 * SR)
t = np.arange(n) / SR
cup = fft_filter(noise(n, 80), lo=900, hi=5000) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t) ** 2)
cup += 0.3 * np.sin(2 * np.pi * np.cumsum(500 + 500 * t / 1.9) / SR) * fft_filter(noise(n, 81), hi=60)
save('cup_water', fade_io(cup, 0.05, 0.15), peak=0.3)
n = int(0.55 * SR)
drag = fft_filter(noise(n, 84), lo=150, hi=1400) * mod_env(n, 25, 85, 0.7) * np.sin(np.pi * np.arange(n) / n) ** 0.8
creak2 = modal(0.25, [(310, 0.05, 1.0), (760, 0.03, 0.4)], seed=86, exc=0.004, exc_lo=200, exc_hi=2000)
save('chair', room(seq(1.2, [(0.0, drag, 0.7), (0.62, thud(0.2, 120, 87, 600), 0.8), (0.64, creak2, 0.35)]), wet=0.1), peak=0.4)
n = int(1.4 * SR)
steps = seq(1.4, [(i * 0.42, fft_filter(noise(int(0.12 * SR), 82 + i), lo=60, hi=700) * np.exp(-t_(0.12) * 35), 1.0) for i in range(3)])
save('steps_soft', steps, peak=0.3)

# --- 外 ---
parts = []
rng = np.random.default_rng(90)
for i in range(6):  # 砂利を踏む：かかとで細かい石が鳴り、つま先でもう一度
    m = int(0.3 * SR)
    tt = np.arange(m) / SR
    env = np.minimum(tt / 0.008, 1) * np.exp(-tt * 22) + 0.45 * np.exp(-((tt - 0.13) / 0.04) ** 2)
    grit = crackle(m, 26000, 91 + i, 700, 9000) * env
    heel = fft_filter(noise(m, 100 + i), lo=50, hi=400) * np.exp(-tt * 45)
    parts.append((i * rng.uniform(0.5, 0.56), grit + 0.25 * heel, rng.uniform(0.75, 1.0)))
save('steps_gravel', seq(3.6, parts), peak=0.4)

# --- スマホ ---
def mallet(f, d=0.8):
    tt = t_(d)
    y = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 5) + 0.25 * np.sin(2 * np.pi * f * 3.93 * tt) * np.exp(-tt * 18)
    return y * np.minimum(tt / 0.003, 1)


save('notify', room(seq(1.1, [(0.0, mallet(1397), 0.8), (0.15, mallet(2093), 0.6)]), wet=0.12, decay=0.15), peak=0.32)
n = int(0.36 * SR)
t = np.arange(n) / SR
buzz = np.sign(np.sin(2 * np.pi * 165 * t)) * (0.7 + 0.3 * np.sin(2 * np.pi * 330 * t))
buzz = fft_filter(buzz, hi=1500) * np.minimum(t / 0.02, 1) * np.minimum((0.36 - t) / 0.02, 1)
save('vibrate', seq(1.0, [(0.0, buzz, 1.0), (0.55, buzz, 1.0)]), peak=0.35)
rng = np.random.default_rng(110)
taps = []
at = 0.0
for k in range(9):
    taps.append((at, modal(0.03, [(rng.uniform(1300, 1700), 0.005, 1.0)], seed=111 + k, exc=0.0015, exc_lo=800, exc_hi=4000), rng.uniform(0.5, 1.0)))
    at += rng.uniform(0.11, 0.24)
save('typing', seq(at + 0.05, taps), peak=0.22)
