#!/usr/bin/env python3
"""環境音・効果音をコードで合成する（権利フリー、乱数はシード固定で毎回同じ音になる）。

AMB[name](dur, seed) -> (n, 2) float32 ステレオ 48kHz
ONE[name](seed)      -> (n, 2) float32
"""
import numpy as np
from scipy import signal

SR = 48000
F32 = np.float32


# ───────── 基本部品 ─────────
def rng(seed):
    return np.random.default_rng(seed)

def n_of(d):
    return int(round(d * SR))

def t_of(n):
    return np.arange(n) / SR

from functools import lru_cache

@lru_cache(maxsize=4096)
def _sos(kind, a, b, order):
    if kind == "band":
        return signal.butter(order, [a, b], btype="band", fs=SR, output="sos")
    return signal.butter(order, a, btype=kind, fs=SR, output="sos")

def sos_bp(lo, hi, order=4):
    return _sos("band", float(round(lo)), float(round(min(hi, SR / 2 - 100))), order)

def bp(x, lo, hi, order=4):
    return signal.sosfilt(sos_bp(lo, hi, order), x, axis=0)

def lp(x, fc, order=4):
    return signal.sosfilt(_sos("low", float(round(min(fc, SR / 2 - 100))), 0.0, order), x, axis=0)

def hp(x, fc, order=2):
    return signal.sosfilt(_sos("high", float(round(fc)), 0.0, order), x, axis=0)

def colored(n, r, slope):
    """slope: 0=white, -1=pink, -2=brown（周波数領域で形を作る）"""
    spec = r.standard_normal(n // 2 + 1) + 1j * r.standard_normal(n // 2 + 1)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    spec *= f ** (slope / 2)
    x = np.fft.irfft(spec, n)
    return x / (np.std(x) + 1e-9)

def smooth_rand(n, r, rate_hz, lo=0.0, hi=1.0):
    """ゆっくり変わるランダム曲線（点の間をコサイン補間）"""
    k = max(2, int(n / SR * rate_hz) + 3)
    pts = r.random(k)
    pos = np.arange(n) / max(1, n - 1) * (k - 1)
    i = np.minimum(pos.astype(int), k - 2)
    f = pos - i
    w = (1 - np.cos(np.pi * f)) / 2
    y = pts[i] * (1 - w) + pts[i + 1] * w
    return lo + (hi - lo) * y

def pan(mono, p):
    """p: -1(左)..+1(右)"""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)

def stereo_noise_bed(mono_l, mono_r):
    return np.stack([mono_l, mono_r], axis=1)

def db(x):
    return 10 ** (x / 20)

def fade(x, fi=0.0, fo=0.0):
    n = len(x)
    g = np.ones(n)
    a = min(n, n_of(fi)); b = min(n, n_of(fo))
    if a > 0: g[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b > 0: g[n - b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x * (g[:, None] if x.ndim == 2 else g)

def place(buf, x, at):
    """buf に x を at サンプル位置から加算（はみ出しは切る）"""
    if at >= len(buf): return
    if at < 0:
        x = x[-at:]; at = 0
    m = min(len(x), len(buf) - at)
    if m > 0: buf[at:at + m] += x[:m]

def _comb(x, D, g):
    """y[n] = x[n] + g*y[n-D] をDサンプルずつのブロックで計算"""
    y = x.copy()
    for k in range(D, len(x), D):
        e = min(k + D, len(x))
        y[k:e] += g * y[k - D:e - D]
    return y

def _allpass(x, D, g):
    """y[n] = -g*x[n] + x[n-D] + g*y[n-D]"""
    y = -g * x
    y[D:] += x[:-D]
    for k in range(D, len(x), D):
        e = min(k + D, len(x))
        y[k:e] += g * y[k - D:e - D]
    return y

def reverb(x, size=1.0, mix=0.3, damp=4500, seed=0):
    """簡易リバーブ（Schroeder: comb×4 + allpass×2、左右で遅延を変える）"""
    mono_in = x.mean(axis=1) if x.ndim == 2 else x
    out = []
    fb = min(0.9, 0.72 + 0.08 * size)
    for ch, offs in enumerate((0.0, 1.9)):
        y = np.zeros_like(mono_in)
        for d_ms in (29.7, 37.1, 41.1, 43.7):
            D = max(1, int((d_ms * (0.7 + 0.3 * size) + offs) * SR / 1000))
            y += _comb(mono_in, D, fb)
        y /= 4
        for d_ms in (5.0, 1.7):
            D = max(1, int((d_ms + offs * 0.3) * SR / 1000))
            y = _allpass(y, D, 0.7)
        y = lp(y, damp, 2)
        out.append(y)
    wet = np.stack(out, axis=1)
    wet *= (np.std(mono_in) + 1e-12) / (np.std(wet) + 1e-12)
    dry = x if x.ndim == 2 else np.stack([x, x], axis=1)
    return dry * (1 - mix) + wet * mix

def norm_rms(x, target_db):
    r = np.sqrt(np.mean(x ** 2)) + 1e-12
    return x * (db(target_db) / r)


# ───────── 生き物 ─────────
def cicada_minmin_voice(n, r, dist=1.0):
    """ミンミンゼミ1匹：「ミーンミンミンミンミー」を休みを入れて繰り返す"""
    out = np.zeros(n)
    t = 0 + int(r.random() * SR * 4)
    f0 = r.uniform(4200, 5600)
    while t < n:
        k = int(r.integers(5, 11))  # ミン の回数
        rate = r.uniform(2.6, 3.4)  # 1秒あたり
        L = int((0.6 + k / rate + 0.8) * SR)
        tt = np.arange(L) / SR
        # 音色：トーン＋帯域ノイズ
        vib = 1 + 0.015 * np.sin(2 * np.pi * 6 * tt)
        ph = 2 * np.pi * np.cumsum(f0 * vib) / SR
        tone = 0.6 * np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
        nz = bp(r.standard_normal(L), f0 * 0.7, min(f0 * 1.6, 20000), 2)
        car = tone + 0.8 * nz / (np.std(nz) + 1e-9)
        # 包絡：立ち上がり「ミーン」→ ミン×k → 「ミー」
        env = np.zeros(L)
        a = int(0.6 * SR)
        env[:a] = np.linspace(0, 1, a) ** 0.7
        for i in range(k):
            s = a + int(i / rate * SR)
            w = int(0.62 / rate * SR)
            seg = np.sin(np.linspace(0, np.pi, w)) ** 0.6
            env[s:s + w] = np.maximum(env[s:s + w], seg[: max(0, min(w, L - s))])
        tail = a + int(k / rate * SR)
        tl = L - tail
        if tl > 0: env[tail:] = np.maximum(env[tail:], np.linspace(0.8, 0, tl) ** 1.5)
        env *= 0.5 + 0.5 * smooth_rand(L, r, 0.5)
        seg = car * env
        m = min(L, n - t)
        out[t:t + m] += seg[:m]
        t += L + int(r.uniform(1.0, 5.0) * SR)
    out = lp(out, 9000 / dist, 2)
    return out

def cicada_abura_bed(n, r):
    """アブラゼミの「ジリジリ」：ざらついた帯域ノイズを速く震わせる"""
    nz = colored(n, r, 0)
    nz = bp(nz, 2500, 7500, 2)
    flutter = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * np.cumsum(r.uniform(35, 70, n) / SR)))
    flutter = lp(flutter, 400, 1)
    swell = smooth_rand(n, r, 0.12, 0.35, 1.0)
    return nz * (0.4 + 0.6 * flutter) * swell

def cicada_day(n, r, voices=3, abura=0.5):
    L = np.zeros(n); R = np.zeros(n)
    for i in range(voices):
        v = cicada_minmin_voice(n, rng(r.integers(1 << 30)), dist=r.uniform(1.0, 2.2))
        p = r.uniform(-0.8, 0.8)
        g = r.uniform(0.35, 0.8)
        L += v * g * np.cos((p + 1) * np.pi / 4); R += v * g * np.sin((p + 1) * np.pi / 4)
    if abura > 0:
        a1 = cicada_abura_bed(n, rng(r.integers(1 << 30))); a2 = cicada_abura_bed(n, rng(r.integers(1 << 30)))
        L += a1 * abura * 0.5; R += a2 * abura * 0.5
    x = np.stack([L, R], axis=1)
    return norm_rms(x, -30)

def higurashi(n, r, voices=3, density=1.0):
    """ヒグラシの「カナカナカナ…」：下がりながら弱まるトーンの連打"""
    out = np.zeros((n, 2))
    for v in range(voices):
        rv = rng(r.integers(1 << 30))
        dist = rv.uniform(1.0, 3.0)
        p = rv.uniform(-0.9, 0.9)
        t = int(rv.uniform(0, 6) * SR)
        f0 = rv.uniform(4300, 5200)
        while t < n:
            dur = rv.uniform(3.5, 6.5)
            L = int(dur * SR)
            tt = np.arange(L) / SR
            pitch = f0 * (1 - 0.10 * (tt / dur) ** 1.2)
            rate = 11.5 - 3.0 * (tt / dur)
            ph = 2 * np.pi * np.cumsum(pitch) / SR
            pulse_ph = 2 * np.pi * np.cumsum(rate) / SR
            puls = (0.5 + 0.5 * np.cos(pulse_ph)) ** 2.5
            alt = 1 + 0.06 * np.sign(np.sin(pulse_ph / 2))
            tone = np.sin(ph * alt) + 0.3 * np.sin(2 * ph * alt) + 0.12 * rv.standard_normal(L)
            env = np.minimum(1, tt / 0.15) * (1 - tt / dur) ** 1.4
            seg = tone * puls * env
            seg = lp(seg, 9000 / dist, 2) / dist
            m = min(L, n - t)
            out[t:t + m] += pan(seg[:m], p)
            t += L + int(rv.uniform(4, 14) / density * SR)
    out = reverb(out, size=1.8, mix=0.35, damp=6000)
    return norm_rms(out, -31)

def crickets(n, r, density=1.0):
    """夜の虫：スズムシ「リーン」＋コオロギ「コロコロ」"""
    out = np.zeros((n, 2))
    tt = t_of(n)
    for v in range(int(5 * density) + 2):
        rv = rng(r.integers(1 << 30))
        f = rv.uniform(3900, 4800)
        p = rv.uniform(-1, 1)
        kind = rv.random()
        if kind < 0.5:  # スズムシ：0.4秒ほどのリーン、間を空けて
            gate = np.zeros(n)
            t = int(rv.uniform(0, 1.5) * SR)
            while t < n:
                L = int(rv.uniform(0.35, 0.55) * SR)
                w = np.sin(np.linspace(0, np.pi, L)) ** 0.5
                m = min(L, n - t); gate[t:t + m] += w[:m]
                t += L + int(rv.uniform(0.5, 1.4) * SR)
            trem = 0.55 + 0.45 * np.sin(2 * np.pi * rv.uniform(45, 60) * tt)
            s = np.sin(2 * np.pi * f * tt) * trem * gate
        else:  # コオロギ：短いパルスの列
            gate = np.zeros(n)
            t = int(rv.uniform(0, 1) * SR)
            while t < n:
                for k in range(int(rv.integers(3, 6))):
                    L = int(0.028 * SR)
                    w = np.sin(np.linspace(0, np.pi, L))
                    s0 = t + int(k * 0.045 * SR)
                    m = min(L, n - s0)
                    if m > 0: gate[s0:s0 + m] += w[:m]
                t += int(rv.uniform(0.6, 1.2) * SR)
            s = np.sin(2 * np.pi * (f * 0.9) * tt) * gate
        dist = rv.uniform(1, 3)
        out += pan(s / dist, p)
    out = reverb(out, size=1.2, mix=0.25)
    return norm_rms(out, -33)

def birds(n, r, density=1.0):
    """スズメ「チュンチュン」"""
    out = np.zeros((n, 2))
    t = int(r.uniform(0, 1.5) * SR)
    while t < n:
        p = r.uniform(-0.9, 0.9); dist = r.uniform(1, 3)
        for k in range(int(r.integers(1, 4))):
            L = int(r.uniform(0.05, 0.09) * SR)
            tt = np.arange(L) / SR
            f = r.uniform(3600, 5200) * (1 - 0.35 * tt / tt[-1]) * (1 + 0.05 * np.sin(2 * np.pi * 90 * tt))
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.linspace(0, np.pi, L)) ** 0.8
            place(out, pan(s / dist, p), t + int(k * r.uniform(0.11, 0.18) * SR))
        t += int(r.uniform(0.4, 2.8) / density * SR)
    out = reverb(out, size=1.0, mix=0.2)
    return norm_rms(out, -36)

# ───────── 風・水・天気 ─────────
def wind(n, r, strength=1.0):
    a = colored(n, r, -1.6); b = colored(n, rng(r.integers(1 << 30)), -1.6)
    g = smooth_rand(n, r, 0.25, 0.25, 1.0) ** 1.5
    lo = lp(np.stack([a, b], axis=1), 500 + 500 * strength, 2)
    hi = bp(np.stack([a, b], axis=1), 900, 3500, 2) * 0.25 * strength
    x = (lo + hi * g[:, None]) * g[:, None]
    return norm_rms(x, -34 + 6 * (strength - 1))

def grass_rustle(n, r):
    a = colored(n, r, -0.5); b = colored(n, rng(r.integers(1 << 30)), -0.5)
    x = bp(np.stack([a, b], axis=1), 1500, 7000, 2)
    g = smooth_rand(n, r, 0.4, 0.1, 1.0) ** 2
    return norm_rms(x * g[:, None], -40)

def rain(n, r, intensity=1.0):
    a = colored(n, r, -0.7); b = colored(n, rng(r.integers(1 << 30)), -0.7)
    bed = hp(np.stack([a, b], axis=1), 250, 2)
    bed = lp(bed, 6000 + 3000 * intensity, 2)
    # 雨粒
    drops = np.zeros((n, 2))
    cnt = int(n / SR * 60 * intensity)
    pos = r.integers(0, n, cnt)
    for p in pos:
        L = int(r.uniform(0.004, 0.012) * SR)
        f = r.uniform(1500, 6000)
        s = np.sin(2 * np.pi * f * np.arange(L) / SR) * np.exp(-np.arange(L) / (L / 4))
        place(drops, pan(s * r.uniform(0.2, 1.0), r.uniform(-1, 1)), p)
    x = bed * 0.8 + drops * 0.6
    if intensity > 1.2:
        x += lp(np.stack([colored(n, rng(r.integers(1 << 30)), -2)] * 2, axis=1), 180) * 0.6
    return norm_rms(x, -28 + 4 * (intensity - 1))

def drips(n, r, rate=1.5):
    out = np.zeros((n, 2))
    t = int(r.uniform(0, 1) * SR)
    while t < n:
        L = int(0.12 * SR)
        f = r.uniform(900, 2600)
        tt = np.arange(L) / SR
        s = np.sin(2 * np.pi * f * (1 + 0.6 * tt / tt[-1]) * tt) * np.exp(-tt / 0.025)
        place(out, pan(s * r.uniform(0.3, 1), r.uniform(-1, 1)), t)
        t += int(r.exponential(1 / rate) * SR) + 200
    return norm_rms(reverb(out, 0.8, 0.3), -38)

def thunder(n, r, dist=1.0):
    x = np.zeros(n)
    c = int(0.02 * SR)
    crack = colored(int(0.6 * SR), r, -1) * np.exp(-np.arange(int(0.6 * SR)) / SR / 0.12)
    x[c:c + len(crack)] += lp(crack, 3000 / dist, 2) * 0.6
    rum = colored(n, rng(r.integers(1 << 30)), -2)
    env = np.exp(-t_of(n) / (2.8 * dist)) * (0.6 + 0.4 * smooth_rand(n, r, 3))
    env *= np.minimum(1, t_of(n) / 0.15)
    x += lp(rum, 180 / dist + 60, 3) * env * 1.4
    st = np.stack([x, np.roll(x, int(0.012 * SR))], axis=1)
    return norm_rms(reverb(st, 2.0, 0.35, damp=2500), -22 - 6 * (dist - 1))

def thunder_bed(n, r, every=14.0):
    out = np.zeros((n, 2))
    t = int(r.uniform(2, every) * SR)
    while t < n:
        th = thunder(int(7 * SR), rng(r.integers(1 << 30)), dist=r.uniform(2.0, 3.0))
        place(out, th * 0.6, t)
        t += int(r.uniform(every * 0.7, every * 1.4) * SR)
    return out

def river(n, r):
    a = colored(n, r, -0.8); b = colored(n, rng(r.integers(1 << 30)), -0.8)
    x = bp(np.stack([a, b], axis=1), 250, 2500, 2)
    burb = 0.6 + 0.4 * lp(np.abs(colored(n, rng(r.integers(1 << 30)), 0)), 12, 1) / 0.8
    return norm_rms(x * burb[:, None], -36)

def sea(n, r):
    a = colored(n, r, -1.2); b = colored(n, rng(r.integers(1 << 30)), -1.2)
    x = lp(np.stack([a, b], axis=1), 1200, 2)
    tt = t_of(n)
    sw = (0.5 + 0.5 * np.sin(2 * np.pi * tt / 9.0 + r.uniform(0, 6))) ** 2
    return norm_rms(x * (0.25 + sw)[:, None], -36)

# ───────── 家・道具 ─────────
def fan(n, r):
    tt = t_of(n)
    hum = 0.25 * np.sin(2 * np.pi * 100 * tt) + 0.12 * np.sin(2 * np.pi * 200 * tt) + 0.05 * np.sin(2 * np.pi * 300 * tt)
    air = lp(colored(n, r, -1.2), 700, 2)
    blade = 1 + 0.08 * np.sin(2 * np.pi * 21 * tt)
    swing = 0.75 + 0.25 * np.sin(2 * np.pi * tt / 11.0)
    m = (air * blade * swing + hum * 0.15)
    x = np.stack([m * (0.8 + 0.2 * np.sin(2 * np.pi * tt / 11.0)), m * (0.8 - 0.2 * np.sin(2 * np.pi * tt / 11.0))], axis=1)
    return norm_rms(x, -40)

def room_tone(n, r):
    a = colored(n, r, -2); b = colored(n, rng(r.integers(1 << 30)), -2)
    return norm_rms(lp(np.stack([a, b], axis=1), 400, 2), -50)

def bell(f, d, r, partials=((1, 1), (2.76, 0.5), (5.4, 0.25), (8.93, 0.12)), decay=1.2):
    L = n_of(d); tt = t_of(L)
    s = np.zeros(L)
    for k, (m, a) in enumerate(partials):
        s += a * np.sin(2 * np.pi * f * m * tt + r.uniform(0, 6)) * np.exp(-tt / (decay / (1 + k * 0.6)))
    return s * np.minimum(1, tt / 0.002)

def wind_chime(n, r, every=6.0):
    """ガラスの風鈴「チリン」：舌が2〜4回あたる"""
    out = np.zeros((n, 2))
    f = r.uniform(2300, 2700)
    t = int(r.uniform(0.5, every) * SR)
    while t < n:
        for k in range(int(r.integers(1, 4))):
            s = bell(f * r.uniform(0.995, 1.005), 2.2, r, ((1, 1), (2.32, 0.45), (4.25, 0.25), (6.63, 0.1)), decay=1.1)
            place(out, pan(s * r.uniform(0.4, 1.0), 0.25), t + int(k * r.uniform(0.07, 0.16) * SR))
        t += int(r.uniform(every * 0.5, every * 1.6) * SR)
    return norm_rms(reverb(out, 0.9, 0.25), -33)

def clock_tick(n, r):
    out = np.zeros((n, 2))
    for i, t in enumerate(range(int(0.3 * SR), n, SR)):
        L = int(0.01 * SR)
        s = bp(r.standard_normal(L), 1400 if i % 2 else 1800, 3800, 2) * np.exp(-np.arange(L) / (L / 5))
        place(out, pan(s, -0.3), t)
    return norm_rms(reverb(out, 0.6, 0.35), -54)

# ───────── 人の気配（ことばにならないざわめき） ─────────
VOWELS = [(800, 1200), (300, 2300), (350, 1300), (500, 1900), (500, 900)]

def babble_voice(n, r, f0_base, rate=4.5, pause=0.35):
    out = np.zeros(n)
    t = int(r.uniform(0, 1.0) * SR)
    while t < n:
        L = int(r.uniform(0.09, 0.22) * SR)
        tt = np.arange(L) / SR
        f0 = f0_base * r.uniform(0.85, 1.25) * (1 + 0.1 * np.sin(np.pi * tt / tt[-1]))
        ph = 2 * np.pi * np.cumsum(f0) / SR
        src = signal.sawtooth(ph) + 0.15 * r.standard_normal(L)
        F1, F2 = VOWELS[int(r.integers(len(VOWELS)))]
        k = 1.15 if f0_base > 220 else 1.0  # 子どもは少し高め
        s = bp(src, F1 * k * 0.75, F1 * k * 1.3, 2) + 0.6 * bp(src, F2 * k * 0.85, F2 * k * 1.15, 2)
        s *= np.sin(np.linspace(0, np.pi, L)) ** 0.7
        m = min(L, n - t)
        out[t:t + m] += s[:m] * r.uniform(0.5, 1.0)
        t += L + int((r.exponential(1 / rate) + (r.random() < 0.15) * r.uniform(0.3, 1.5) * pause) * SR)
    return out

def murmur(n, r, voices=10, kids=0.6, room=1.2, level=-34):
    out = np.zeros((n, 2))
    for v in range(voices):
        rv = rng(r.integers(1 << 30))
        kid = rv.random() < kids
        f0 = rv.uniform(240, 330) if kid else rv.uniform(110, 210)
        s = babble_voice(n, rv, f0)
        out += pan(s * rv.uniform(0.3, 1.0), rv.uniform(-0.9, 0.9))
    out = lp(out, 3500, 2)
    out = reverb(out, room, 0.4)
    return norm_rms(out, level)

def tv_speaker(x):
    return bp(x, 250, 3800, 2)

def tv_baseball(n, r):
    crowd = murmur(n, r, voices=18, kids=0.2, room=2.0, level=-30)
    swell = smooth_rand(n, r, 0.15, 0.3, 1.0) ** 2
    ann = np.stack([babble_voice(n, rng(r.integers(1 << 30)), 125, rate=6.5, pause=0.6)] * 2, axis=1)
    x = crowd * swell[:, None] + norm_rms(ann, -30)
    x = tv_speaker(x)
    return norm_rms(reverb(x, 0.7, 0.3), -36)

def dishes(n, r):
    out = np.zeros((n, 2))
    t = int(r.uniform(0.5, 2) * SR)
    while t < n:
        s = bell(r.uniform(1800, 3200), 0.4, r, ((1, 1), (2.1, 0.5), (3.7, 0.3)), decay=0.12)
        place(out, pan(s * r.uniform(0.2, 0.6), r.uniform(-0.5, 0.5)), t)
        t += int(r.uniform(1.5, 4.5) * SR)
    return norm_rms(reverb(out, 0.6, 0.25), -42)

def taiko(n, r, bpm=96):
    out = np.zeros(n)
    beat = 60 / bpm
    pat = [1, 0, 1, 0, 1, 1, 0, 0]
    t = 0.0; i = 0
    while t * SR < n:
        if pat[i % len(pat)]:
            L = int(0.5 * SR); tt = np.arange(L) / SR
            f = 95 * (1 + 0.6 * np.exp(-tt / 0.03))
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.16)
            s[: int(0.004 * SR)] += r.standard_normal(int(0.004 * SR)) * 0.3
            place(out, s * (1.0 if i % 8 == 0 else 0.7), int(t * SR))
        t += beat / 2; i += 1
    st = np.stack([out, out], axis=1)
    return norm_rms(reverb(lp(st, 900), 2.2, 0.55, damp=1500), -40)

# ───────── おもちゃ・乗り物 ─────────
def motor_tone(L, r, f0=250.0, bright=1.0):
    tt = np.arange(L) / SR
    f = f0 * (1 + 0.01 * np.sin(2 * np.pi * 7 * tt))
    ph = 2 * np.pi * np.cumsum(f) / SR
    whine = signal.sawtooth(ph * 5.2) * 0.5 + signal.sawtooth(ph) * 0.3
    brush = bp(r.standard_normal(L), 2500, 7000, 2) * 0.35
    s = bp(whine, 300, 4500 * bright, 2) + brush
    return s

def motor_pass(L, r, f0=260.0, speed=1.0):
    """1台が目の前を通りすぎる（ドップラー）"""
    tt = np.arange(L) / SR
    c = L / SR / 2
    x = (tt - c) * 6 * speed
    dop = 1 + 0.06 * np.tanh(-x)
    ph = 2 * np.pi * np.cumsum(f0 * dop) / SR
    whine = signal.sawtooth(ph * 5.2) * 0.5 + signal.sawtooth(ph) * 0.3
    s = bp(whine, 300, 4800, 2) + bp(r.standard_normal(L), 2500, 7000, 2) * 0.3
    env = 1 / (1 + x ** 2)
    p = np.tanh(x * 0.8)
    return pan(s * env, 0.0) * np.stack([1 - 0.5 * p, 1 + 0.5 * p], axis=1) * 0.7

def rattles(n, r, rate=8.0):
    out = np.zeros((n, 2))
    t = 0
    while t < n:
        L = int(0.006 * SR)
        s = bp(r.standard_normal(L), 1500, 6000, 2) * np.exp(-np.arange(L) / (L / 4))
        place(out, pan(s * r.uniform(0.2, 1.0), r.uniform(-0.6, 0.6)), t)
        t += int(r.exponential(1 / rate) * SR) + 100
    return out

def track(n, r, cars=3):
    """店のコースを数台が周回"""
    out = np.zeros((n, 2))
    for c in range(cars):
        rc = rng(r.integers(1 << 30))
        lap = rc.uniform(1.6, 2.4)
        f0 = rc.uniform(230, 290)
        t = rc.uniform(0, lap)
        while t * SR < n:
            L = int(1.2 * SR)
            place(out, motor_pass(L, rc, f0, rc.uniform(0.8, 1.3)) * rc.uniform(0.5, 1.0), int(t * SR))
            t += lap * rc.uniform(0.95, 1.05)
    out += rattles(n, r, 10) * 0.25
    return norm_rms(reverb(out, 0.7, 0.25), -32)

def bike(n, r):
    out = np.zeros((n, 2))
    t = 0
    rate = r.uniform(16, 22)
    while t < n:
        L = int(0.004 * SR)
        s = bp(r.standard_normal(L), 3000, 9000, 2) * np.exp(-np.arange(L) / (L / 4))
        place(out, pan(s, 0.1), t)
        t += int(SR / rate)
    hiss = bp(np.stack([colored(n, r, -0.5)] * 2, axis=1), 800, 4000, 2) * 0.15
    return norm_rms(out * 0.6 + hiss, -40)

def truck_idle(n, r, rpm=750):
    tt = t_of(n)
    fire = rpm / 60 * 2
    ph = 2 * np.pi * fire * tt
    s = sum((0.8 / k) * np.sin(k * ph + r.uniform(0, 6)) for k in range(1, 9))
    s += 0.3 * lp(colored(n, r, -1), 300)
    s *= 1 + 0.15 * np.sin(2 * np.pi * fire / 2 * tt)
    x = lp(np.stack([s, s], axis=1), 400, 2)
    return norm_rms(x, -36)

def truck_away(n, r):
    tt = t_of(n)
    rpm = 750 + 900 * np.clip((tt - 1.0) / 2.0, 0, 1)
    ph = 2 * np.pi * np.cumsum(rpm / 60 * 2) / SR
    s = sum((0.8 / k) * np.sin(k * ph) for k in range(1, 9)) + 0.3 * lp(colored(n, r, -1), 300)
    env = np.exp(-np.clip(tt - 3.0, 0, None) / 2.2)
    x = np.stack([s * env, s * env], axis=1)
    x = lp(x, 500, 2)
    return norm_rms(x, -34)

def crossing(n, r):
    """踏切の警報音＋2両編成の電車が通過"""
    out = np.zeros((n, 2))
    period = 0.52
    t = 0.0; i = 0
    stop = n / SR * 0.85
    while t < stop:
        f = 760 if i % 2 == 0 else 700
        s = bell(f, 0.5, r, ((1, 1), (2.0, 0.35), (3.01, 0.2), (4.2, 0.1)), decay=0.25)
        place(out, pan(s, -0.2), int(t * SR))
        t += period; i += 1
    out = norm_rms(reverb(out, 1.4, 0.35), -32)
    # 電車：レールの継ぎ目「ガタンゴトン」＋走行音
    tr = np.zeros((n, 2))
    t0 = n / SR * 0.35
    for k in range(10):
        for d in (0.0, 0.12, 1.0, 1.12):
            L = int(0.05 * SR)
            s = lp(r.standard_normal(L), 600, 2) * np.exp(-np.arange(L) / (L / 4))
            place(tr, pan(s, -0.6 + k * 0.12), int((t0 + k * 1.3 + d * 0.6) * SR))
    rumble = lp(colored(n, r, -2), 200, 2)
    tt = t_of(n)
    env = np.exp(-((tt - (t0 + 6.5)) / 5.0) ** 2)
    tr += np.stack([rumble * env, rumble * env], axis=1) * 0.6
    return out + norm_rms(tr, -34)

def distant_train(n, r):
    out = np.zeros((n, 2))
    t = int(r.uniform(4, 10) * SR)
    while t < n:
        L = int(12 * SR)
        seg = crossing(L, rng(r.integers(1 << 30)))
        place(out, lp(seg, 700, 2) * 0.5, t)
        t += int(r.uniform(25, 40) * SR)
    return out

# ───────── 夕方5時のチャイム「夕焼け小焼け」（作曲：草川信, 1948年没 → パブリックドメイン。歌詞は使わない） ─────────
# 出典の階名（ハ長調）: ソソソラ ソソソミ ドドレミレー / ミーミソ ラドドラ ソソラソドー / ドーレドラ ドドソソ ラソラソミー / ソミレド レレドレ ミソラソドー
YUYAKE = [
    ("G4", 1), ("G4", 1), ("G4", 1), ("A4", 1), ("G4", 1), ("G4", 1), ("G4", 1), ("E4", 1),
    ("C4", 1), ("C4", 1), ("D4", 1), ("E4", 1), ("D4", 3), (None, 1),
    ("E4", 2), ("E4", 1), ("G4", 1), ("A4", 1), ("C5", 1), ("C5", 1), ("A4", 1),
    ("G4", 1), ("G4", 1), ("A4", 1), ("G4", 1), ("C5", 3), (None, 1),
    ("C5", 2), ("D5", 1), ("C5", 1), ("A4", 1), ("C5", 1), ("C5", 1), ("G4", 1), ("G4", 1),
    ("A4", 1), ("G4", 1), ("A4", 1), ("G4", 1), ("E4", 2), (None, 1),
    ("G4", 1), ("E4", 1), ("D4", 1), ("C4", 1), ("D4", 1), ("D4", 1), ("C4", 1), ("D4", 1),
    ("E4", 1), ("G4", 1), ("A4", 1), ("G4", 1), ("C4", 4),
]
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

def note_hz(nm, transpose=0):
    k = NOTE[nm[0]] + 12 * (int(nm[1]) + 1) + transpose
    return 440 * 2 ** ((k - 69) / 12)

def chime5(r, bpm=100, transpose=2, phrases=2):
    """夕方の場面（2カット・約20秒）に収まるよう前半2フレーズ（〜鐘が鳴る、で主音に着地）"""
    beat = 60 / bpm
    notes = YUYAKE[: [14, 27, 41, len(YUYAKE)][phrases - 1]]
    total = sum(b for _, b in notes) * beat + 6
    n = n_of(total)
    out = np.zeros(n)
    t = 0.0
    for nm, b in notes:
        if nm:
            f = note_hz(nm, transpose)
            s = bell(f, min(3.5, b * beat + 2.0), r, ((1, 1), (2.0, 0.3), (3.0, 0.12), (4.07, 0.06)), decay=1.4)
            s += 0.25 * np.sin(2 * np.pi * f * t_of(len(s))) * np.exp(-t_of(len(s)) / 0.9)
            place(out, s * 0.5, int(t * SR))
        t += b * beat
    # 屋外スピーカー（ラッパ）の帯域＋町に反響
    out = bp(out, 350, 4200, 2)
    out = np.tanh(out * 1.8) / 1.8
    st = np.stack([out, np.roll(out, int(0.03 * SR)) * 0.9], axis=1)
    st = reverb(st, 3.0, 0.55, damp=3500)
    # 遠くのこだま
    echo = np.zeros_like(st)
    place(echo, st * 0.35, int(0.42 * SR))
    place(echo, st * 0.18, int(0.95 * SR))
    st = lp(st + echo, 5000, 2)
    return norm_rms(fade(st, 0.01, 4.0), -24)

# ───────── 単発音 ─────────
def beep(f, d, level=1.0):
    L = n_of(d); tt = t_of(L)
    s = signal.square(2 * np.pi * f * tt) * 0.5
    s = lp(s, 7000, 2) * np.minimum(1, tt / 0.002) * np.minimum(1, (d - tt) / 0.003)
    return s * level

def seq(parts):
    """[(f or None, 秒), ...] をつなぐ"""
    xs = []
    for f, d in parts:
        xs.append(beep(f, d) if f else np.zeros(n_of(d)))
    return np.concatenate(xs)

def pet(parts, level=-30):
    s = seq(parts)
    s = bp(s, 900, 8000, 2)
    return norm_rms(reverb(pan(s, 0.05), 0.4, 0.15), level)

def one_pet_alarm(r):
    a = [(4000, 0.06), (None, 0.05)] * 3 + [(None, 0.35)]
    return pet(a * 2, -32)

def one_pet_btn(r):
    return pet([(3900, 0.05)], -34)

def one_pet_eat(r):
    return pet([(2600, 0.09), (None, 0.03), (3100, 0.09), (None, 0.03), (3900, 0.14), (None, 0.25), (3100, 0.06), (None, 0.06), (3100, 0.06)], -34)

def one_pet_flat(r):
    return pet([(3100, 0.35), (None, 0.15), (2600, 0.35), (None, 0.15), (2000, 0.8)], -36)

def one_pet_birth(r):
    return pet([(3900, 0.06), (None, 0.5), (2600, 0.08), (None, 0.04), (3100, 0.08), (None, 0.04), (3500, 0.08), (None, 0.04), (3900, 0.22)], -32)

def one_bleeps(r):
    notes = [r.choice([880, 988, 1175, 1319, 1568]) for _ in range(5)]
    parts = []
    for f in notes:
        parts += [(f, 0.07), (None, 0.03)]
    s = bp(seq(parts), 300, 5000, 2)
    return norm_rms(pan(s, -0.1), -38)

def one_tin_lid(r):
    L = n_of(1.2); tt = t_of(L)
    scrape = bp(r.standard_normal(L), 1500, 6000, 2) * np.exp(-tt / 0.08) * 0.5
    modes = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / dcy) for f, a, dcy in ((1230, 1, 0.25), (2710, 0.6, 0.18), (4150, 0.35, 0.12), (5980, 0.2, 0.08)))
    s = scrape + modes * 0.6
    s[int(0.15 * SR):] += modes[: L - int(0.15 * SR)] * 0.4
    return norm_rms(reverb(pan(s, 0.1), 0.6, 0.25), -26)

def one_coins(r):
    out = np.zeros((n_of(1.0), 2))
    for k in range(3):
        s = bell(r.uniform(4000, 4600), 0.5, r, ((1, 1), (1.47, 0.6), (2.09, 0.4), (2.8, 0.25)), decay=0.18)
        place(out, pan(s, r.uniform(-0.2, 0.2)) * r.uniform(0.5, 1), int(k * r.uniform(0.09, 0.16) * SR))
    return norm_rms(reverb(out, 0.5, 0.2), -30)

def one_ramune(r):
    L = n_of(2.2); tt = t_of(L)
    pop = lp(r.standard_normal(L), 900, 2) * np.exp(-tt / 0.015) * 2
    marble = bell(3200, 2.2, r, ((1, 1), (2.6, 0.5), (4.9, 0.25)), decay=0.25)
    marble = np.roll(marble, int(0.03 * SR)) * 0.5
    fizz = np.zeros(L)
    for p in r.integers(int(0.05 * SR), L, 900):
        fizz[p] += r.uniform(-1, 1)
    fizz = hp(fizz, 3000) * np.exp(-tt / 0.7) * 0.6
    return norm_rms(reverb(pan(pop + marble + fizz, 0.1), 0.5, 0.2), -26)

def one_bike_bell(r):
    out = np.zeros((n_of(1.8), 2))
    for k in range(2):
        s = bell(2350, 1.2, r, ((1, 1), (2.42, 0.6), (3.9, 0.3), (5.6, 0.15)), decay=0.5)
        s = s * (1 + 0.3 * np.sin(2 * np.pi * 32 * t_of(len(s))))
        place(out, pan(s, 0.2), int(k * 0.28 * SR))
    return norm_rms(reverb(out, 0.9, 0.3), -30)

def one_motor_rev(r):
    L = n_of(2.6); tt = t_of(L)
    f0 = 120 + 150 * (1 - np.exp(-tt / 0.35))
    ph = 2 * np.pi * np.cumsum(f0) / SR
    s = bp(signal.sawtooth(ph * 5.2) * 0.5 + signal.sawtooth(ph) * 0.3, 250, 4500, 2)
    s += bp(r.standard_normal(L), 2500, 7000, 2) * 0.3
    s *= np.minimum(1, tt / 0.05) * np.minimum(1, (2.6 - tt) / 0.3)
    return norm_rms(reverb(pan(s, 0), 0.6, 0.2), -30)

def one_motor_pass(r):
    return norm_rms(reverb(motor_pass(n_of(1.6), r, 265, 1.0), 0.7, 0.25), -30)

def one_motor_whir(r):
    L = n_of(5.0); tt = t_of(L)
    f0 = 260 * (1 - np.exp(-tt / 0.25))
    ph = 2 * np.pi * np.cumsum(f0) / SR
    s = bp(signal.sawtooth(ph * 5.2) * 0.5 + signal.sawtooth(ph) * 0.3, 250, 4500, 2)
    s += bp(r.standard_normal(L), 2500, 7000, 2) * 0.25
    s *= np.minimum(1, tt / 0.03) * np.clip((5.0 - tt) / 2.0, 0, 1)
    return norm_rms(reverb(pan(s, 0), 0.6, 0.2), -30)

def one_flip(r):
    L = n_of(2.0); tt = t_of(L)
    clack = bp(r.standard_normal(L), 1200, 6000, 2) * np.exp(-tt / 0.01)
    clack2 = np.roll(clack, int(0.09 * SR)) * 0.5
    f0 = 260 * np.exp(-tt / 0.7)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    whir = bp(signal.sawtooth(ph * 5.2), 250, 4000, 2) * np.exp(-tt / 0.6) * 0.3
    return norm_rms(reverb(pan(clack + clack2 + whir, 0), 0.6, 0.25), -28)

def one_battery(r):
    L = n_of(0.3); tt = t_of(L)
    s = bp(r.standard_normal(L), 1500, 8000, 2) * np.exp(-tt / 0.006)
    s += 0.4 * np.sin(2 * np.pi * 2100 * tt) * np.exp(-tt / 0.02)
    return norm_rms(reverb(pan(s, 0), 0.4, 0.15), -30)

def one_switch(r):
    L = n_of(0.25); tt = t_of(L)
    s = bp(r.standard_normal(L), 1000, 6000, 2) * np.exp(-tt / 0.004)
    return norm_rms(pan(s, 0), -32)

def one_swing(r):
    out = np.zeros((n_of(2.5), 2))
    for k in range(2):
        L = n_of(0.35); tt = t_of(L)
        f = 900 + 300 * np.sin(np.pi * tt / tt[-1])
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.linspace(0, np.pi, L)) ** 2
        s += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2.01) / SR) * np.sin(np.linspace(0, np.pi, L)) ** 2
        place(out, pan(s, 0.3), int(k * 1.15 * SR))
    return norm_rms(reverb(out, 0.8, 0.25), -40)

def one_pencil(r):
    out = np.zeros((n_of(4.0), 2))
    t = 0
    while t < len(out) - SR // 2:
        L = int(r.uniform(0.08, 0.25) * SR)
        s = bp(r.standard_normal(L), 2500, 7500, 2) * np.sin(np.linspace(0, np.pi, L))
        place(out, pan(s * r.uniform(0.4, 1), 0.1), t)
        t += L + int(r.uniform(0.05, 0.3) * SR)
    return norm_rms(out, -42)

def one_thunder(r): return thunder(n_of(8), r, 1.2)
def one_thunder_far(r): return thunder(n_of(8), r, 2.5)
def one_chime5(r): return chime5(r)


# ───────── 環境音プリセット（名前 → 重ね合わせ） ─────────
def mk(*layers):
    def f(d, seed):
        n = n_of(d)
        r = rng(seed)
        out = np.zeros((n, 2))
        for fn, g in layers:
            x = fn(n, rng(r.integers(1 << 30)))
            out += x * db(g)
        return out.astype(F32)
    return f

def _lpf(fn, fc):
    return lambda n, r: lp(fn(n, r), fc, 2)

def fireworks(n, r):
    out = np.zeros((n, 2))
    t = int(r.uniform(0.3, 1.2) * SR)
    while t < n:
        L = n_of(5.0); tt = t_of(L)
        boom = lp(r.standard_normal(L), 160, 2) * np.exp(-tt / 0.35) * 2.0
        boom[: int(0.01 * SR)] += r.standard_normal(int(0.01 * SR)) * 0.4
        crack = np.zeros(L)
        for p in r.integers(int(0.4 * SR), int(2.8 * SR), 260):
            crack[p] += r.uniform(-1, 1) * 0.6
        crack = hp(crack, 2000) * np.exp(-np.clip(tt - 0.4, 0, None) / 1.0)
        s = pan(boom + crack * r.uniform(0.2, 0.7), r.uniform(-0.5, 0.5))
        place(out, s * r.uniform(0.5, 1.0), t)
        t += int(r.uniform(1.2, 3.2) * SR)
    return norm_rms(reverb(out, 2.5, 0.5, damp=2500), -30)

AMB = {
    "autumn_day": mk((lambda n, r: wind(n, r, 0.8), 0), (lambda n, r: birds(n, r, 0.5), -4), (room_tone, 0)),
    "room_2026": mk((room_tone, 0), (lambda n, r: lp(birds(n, r, 0.4), 3000), -6), (lambda n, r: wind(n, r, 0.6), -10)),
    "morning": mk((lambda n, r: birds(n, r, 1.2), 0), (lambda n, r: cicada_day(n, r, 2, 0.0), -8), (room_tone, 0)),
    "morning_quiet": mk((lambda n, r: birds(n, r, 0.6), -2), (lambda n, r: lp(cicada_day(n, r, 1, 0.0), 4000), -10), (room_tone, 0)),
    "morning_end": mk((lambda n, r: higurashi(n, r, 2, 0.6), -4), (lambda n, r: birds(n, r, 0.7), -2), (lambda n, r: wind(n, r, 0.7), -6)),
    "fan": mk((fan, 0)),
    "day": mk((lambda n, r: cicada_day(n, r, 3, 0.6), 0), (lambda n, r: birds(n, r, 0.3), -8)),
    "day_far": mk((_lpf(lambda n, r: cicada_day(n, r, 2, 0.5), 3500), -8)),
    "bike": mk((bike, 0), (lambda n, r: wind(n, r, 0.9), -6)),
    "shop": mk((fan, -2), (lambda n, r: murmur(n, r, 4, 0.9, 0.8, -38), 0), (_lpf(lambda n, r: cicada_day(n, r, 2, 0.4), 2500), -10)),
    "shop_quiet": mk((room_tone, 0), (clock_tick, 0), (_lpf(lambda n, r: cicada_day(n, r, 2, 0.4), 2500), -9), (fan, -6)),
    "shop_closed": mk((room_tone, 0), (clock_tick, -2), (_lpf(lambda n, r: higurashi(n, r, 2, 0.5), 3000), -8)),
    "track": mk((lambda n, r: track(n, r, 3), -2)),
    "engawa": mk((lambda n, r: cicada_day(n, r, 3, 0.5), -1), (lambda n, r: wind_chime(n, r, 6.5), 0), (fan, -5), (lambda n, r: wind(n, r, 0.5), -12)),
    "engawa_soft": mk((lambda n, r: cicada_day(n, r, 2, 0.4), -6), (lambda n, r: wind_chime(n, r, 4.0), -2)),
    "storm": mk((lambda n, r: wind(n, r, 1.6), 0), (grass_rustle, 2), (lambda n, r: thunder_bed(n, r, 9.0), -4)),
    "rain_heavy": mk((lambda n, r: rain(n, r, 1.6), 0), (lambda n, r: thunder_bed(n, r, 12.0), -4)),
    "rain_soft": mk((lambda n, r: rain(n, r, 0.8), 0), (lambda n, r: drips(n, r, 1.2), -2)),
    "thunder_bed": mk((lambda n, r: thunder_bed(n, r, 16.0), -6)),
    "after_rain": mk((lambda n, r: drips(n, r, 2.0), 0), (lambda n, r: higurashi(n, r, 3, 0.8), -2), (lambda n, r: birds(n, r, 0.4), -6)),
    "dusk": mk((lambda n, r: higurashi(n, r, 4, 1.0), 0), (lambda n, r: wind(n, r, 0.6), -8)),
    "dusk_late": mk((lambda n, r: higurashi(n, r, 2, 0.7), -2), (lambda n, r: crickets(n, r, 0.5), -6), (lambda n, r: wind(n, r, 0.6), -8)),
    "river": mk((river, 0)),
    "sea": mk((sea, 0)),
    "dinner": mk((tv_baseball, 0), (dishes, 0), (room_tone, 0), (lambda n, r: crickets(n, r, 0.5), -10)),
    "festival": mk((lambda n, r: murmur(n, r, 16, 0.5, 2.0, -34), 0), (taiko, 0), (lambda n, r: crickets(n, r, 0.6), -8)),
    "fireworks": mk((fireworks, 0), (lambda n, r: murmur(n, r, 10, 0.4, 2.5, -40), 0), (lambda n, r: crickets(n, r, 0.5), -10)),
    "night": mk((lambda n, r: crickets(n, r, 1.0), 0), (room_tone, 0)),
    "night_wind": mk((lambda n, r: crickets(n, r, 0.8), 0), (lambda n, r: wind(n, r, 0.7), -6)),
    "event": mk((lambda n, r: murmur(n, r, 14, 0.8, 1.6, -33), 0), (lambda n, r: track(n, r, 4), -3), (lambda n, r: cicada_day(n, r, 2, 0.3), -10)),
    "event_far": mk((_lpf(lambda n, r: murmur(n, r, 12, 0.8, 1.6, -33), 2000), -4), (_lpf(lambda n, r: track(n, r, 3), 2500), -8)),
    "truck_idle": mk((truck_idle, 0)),
    "truck_away": mk((truck_away, 0)),
    "autumn_wind": mk((lambda n, r: wind(n, r, 1.1), 0), (grass_rustle, 0), (lambda n, r: crickets(n, r, 0.4), -10)),
    "room_1997": mk((room_tone, 0), (_lpf(lambda n, r: crickets(n, r, 0.5), 3000), -8)),
    "distant_train": mk((distant_train, -2)),
    "chime_soft": mk((lambda n, r: wind_chime(n, r, 9.0), -4)),
    "crossing": mk((crossing, 0), (lambda n, r: higurashi(n, r, 2, 0.6), -8)),
}

ONE = {
    "pet_alarm": one_pet_alarm, "pet_btn": one_pet_btn, "pet_eat": one_pet_eat, "pet_flat": one_pet_flat,
    "pet_birth": one_pet_birth, "bleeps": one_bleeps, "tin_lid": one_tin_lid, "coins": one_coins,
    "ramune": one_ramune, "bike_bell": one_bike_bell, "motor_rev": one_motor_rev, "motor_pass": one_motor_pass,
    "motor_whir": one_motor_whir, "flip": one_flip, "battery": one_battery, "switch": one_switch,
    "swing": one_swing, "pencil": one_pencil, "thunder": one_thunder, "thunder_far": one_thunder_far,
    "chime5": one_chime5,
}

if __name__ == "__main__":
    # 試聴用：各音を書き出す
    import sys, wave, os
    outdir = sys.argv[1] if len(sys.argv) > 1 else "sfx_preview"
    os.makedirs(outdir, exist_ok=True)
    def wr(path, x):
        x = np.clip(x, -1, 1)
        with wave.open(path, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((x * 32767).astype(np.int16).tobytes())
    names = sys.argv[2:] if len(sys.argv) > 2 else list(AMB) + list(ONE)
    for k in names:
        x = AMB[k](12.0, 1) if k in AMB else ONE[k](rng(1))
        pk = np.max(np.abs(x)) + 1e-9
        wr(os.path.join(outdir, k + ".wav"), x / pk * 0.5)
        print(k, f"{len(x)/SR:.1f}s peak={20*np.log10(pk):.1f}dB")
