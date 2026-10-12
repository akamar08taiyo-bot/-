# 環境音（ベッド）と効果音（イベント）の生成器。すべてオリジナル合成
import numpy as np
from dsp import (SR, bandpass, bell, brown, convolve_st, db, fade, highpass, lowpass, pan, pink, reverb_ir, rng, smooth_noise, t_axis)

# ---------- ベッド（持続音） ----------

def sea(dur, seed=1, dark=900, level=1.0, swell_rate=0.13):
    n = int(dur * SR)
    out = np.zeros((n, 2))
    for c in range(2):
        b = brown(n, seed * 10 + c)
        sw = smooth_noise(dur, swell_rate, seed * 3 + c, 0.25, 1.0) ** 1.6
        lo = lowpass(b, dark, 2) * sw
        hi = bandpass(pink(n, seed * 7 + c), 1200, 5000, 2) * (sw ** 3) * 0.12
        out[:, c] = lo + hi
    return out * level * 0.32

def lapping(dur, seed=2, rate=0.45, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = r.uniform(0, 1.5)
    while tt < dur:
        L = r.uniform(0.25, 0.6)
        m = int(L * SR)
        e = np.exp(-np.arange(m) / SR / (L * 0.35)) * (1 - np.exp(-np.arange(m) / SR / 0.012))
        burst = bandpass(r.standard_normal(m), r.uniform(220, 380), r.uniform(900, 1500), 2) * e
        plop = np.sin(2 * np.pi * r.uniform(150, 260) * np.arange(m) / SR) * np.exp(-np.arange(m) / SR / 0.06) * 0.4
        s = pan(fade(burst + plop, 0.003, 0.05), r.uniform(-0.6, 0.6)) * r.uniform(0.4, 1.0)
        i = int(tt * SR); j = min(n, i + m); out[i:j] += s[:j - i]
        tt += r.exponential(1 / rate) + 0.3
    return out * level * 0.5

def wind(dur, seed=3, strength=1.0, lo=150, hi=900):
    n = int(dur * SR); out = np.zeros((n, 2))
    for c in range(2):
        p = pink(n, seed * 5 + c)
        g = smooth_noise(dur, 0.2, seed * 9 + c, 0.2, 1.0) ** 1.4
        out[:, c] = bandpass(p, lo, hi, 2) * g + bandpass(p, hi, hi * 3, 1) * g ** 2 * 0.15
    return out * strength * 0.18

def birds(dur, seed=4, density=0.35, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = r.uniform(0, 2)
    while tt < dur:
        p = r.uniform(-0.8, 0.8); base = r.uniform(3000, 5200); k = r.integers(2, 6)
        for q in range(k):
            L = r.uniform(0.04, 0.12); m = int(L * SR); x = np.arange(m) / SR
            f = base * (1 + r.uniform(-0.25, 0.25)) + np.linspace(0, r.uniform(-900, 900), m)
            y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * x / L) ** 2
            i = int((tt + q * r.uniform(0.09, 0.2)) * SR); j = min(n, i + m)
            if i < n: out[i:j] += pan(y, p)[:j - i] * r.uniform(0.3, 0.8)
        tt += r.exponential(1 / density) + 0.4
    out = lowpass(out, 7000, 2)
    return convolve_st(out, reverb_ir(1.2, 0.35, seed), 0.35) * level * 0.12

def gulls(dur, seed=5, density=0.12, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = r.uniform(0.5, 4)
    while tt < dur:
        p = r.uniform(-0.9, 0.9); k = r.integers(1, 4); f0 = r.uniform(1100, 1700)
        for q in range(k):
            L = r.uniform(0.22, 0.42); m = int(L * SR); x = np.arange(m) / SR
            f = f0 * (1 + 0.35 * np.exp(-x / 0.05)) * (1 - 0.12 * x / L)
            ph = 2 * np.pi * np.cumsum(f) / SR
            y = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * np.sin(np.pi * x / L) ** 1.5
            y += bandpass(r.standard_normal(m), 1500, 3500, 1) * 0.15 * np.sin(np.pi * x / L)
            i = int((tt + q * r.uniform(0.3, 0.5)) * SR); j = min(n, i + m)
            if i < n: out[i:j] += pan(y, p)[:j - i] * r.uniform(0.3, 0.8)
        tt += r.exponential(1 / density) + 1.0
    out = lowpass(out, 3800, 2)
    return convolve_st(out, reverb_ir(2.0, 0.6, seed), 0.45) * level * 0.08

def engine_putt(dur, seed=6, rate=5.2, level=1.0):
    t = t_axis(dur); r = rng(seed)
    pulse = (0.5 + 0.5 * np.sin(2 * np.pi * rate * t)) ** 6
    body = lowpass(r.standard_normal(len(t)), 180, 2) * pulse * 3 + np.sin(2 * np.pi * 52 * t) * pulse * 0.4
    body = lowpass(body, 400, 2)
    return pan(body, -0.1) * level * 0.25

def steam_hiss(dur, seed=7, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2))
    for c in range(2):
        g = smooth_noise(dur, 0.4, seed + c, 0.3, 1.0)
        out[:, c] = bandpass(pink(n, seed * 3 + c), 1800, 6000, 2) * g
    return out * level * 0.04

def murmur(dur, seed=8, voices=14, level=1.0, bright=2600):
    # 遠くのざわめき：母音のフォルマントを持つ短い音節を多数重ねてぼかす
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    for v in range(voices):
        f0 = r.uniform(110, 240); p = r.uniform(-0.9, 0.9); tt = r.uniform(0, 1.5); lv = r.uniform(0.4, 1.0)
        while tt < dur:
            L = r.uniform(0.09, 0.26); m = int(L * SR); x = np.arange(m) / SR
            f = f0 * (1 + 0.08 * np.sin(2 * np.pi * r.uniform(1, 3) * x) + r.uniform(-0.06, 0.06))
            ph = 2 * np.pi * np.cumsum(f) / SR
            src = np.sign(np.sin(ph)) * 0.3 + np.sin(ph) + 0.25 * r.standard_normal(m)
            F1 = r.uniform(300, 800); F2 = r.uniform(900, 2200)
            y = bandpass(src, F1 * 0.8, F1 * 1.25, 1) + 0.6 * bandpass(src, F2 * 0.85, F2 * 1.15, 1)
            y *= np.sin(np.pi * x / L) ** 1.2
            i = int(tt * SR); j = min(n, i + m)
            out[i:j] += pan(y, p)[:j - i] * lv
            tt += L + (r.uniform(0.02, 0.12) if r.random() < 0.8 else r.uniform(0.4, 1.4))
    out = lowpass(out, bright, 2)
    out = convolve_st(out, reverb_ir(1.6, 0.45, seed), 0.5)
    return out * level * 0.05

def cicadas(dur, kind='minmin', seed=9, level=1.0, far=False):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros((n, 2)); r = rng(seed)
    count = 3 if kind == 'minmin' else 2
    for k in range(count):
        p = r.uniform(-0.8, 0.8); lv = r.uniform(0.5, 1.0); fc = r.uniform(3600, 4400)
        carrier = bandpass(r.standard_normal(n), fc * 0.9, fc * 1.1, 2) + 0.6 * np.sin(2 * np.pi * fc * t)
        env = np.zeros(n)
        if kind == 'minmin':
            tt = r.uniform(0, 3)
            while tt < dur:
                # ミーン（膨らむ持続音）→ ミンミンミン（拍動）
                L = r.uniform(1.0, 1.6); i = int(tt * SR); m = int(L * SR)
                seg = np.sin(np.linspace(0, np.pi, m)) ** 0.7
                env[i:i + m] += seg[:max(0, min(m, n - i))]
                tt += L
                for q in range(r.integers(4, 8)):
                    m = int(0.18 * SR); i = int(tt * SR)
                    if i >= n: break
                    seg = np.sin(np.linspace(0, np.pi, m)) ** 1.5
                    env[i:i + m] += seg[:max(0, min(m, n - i))] * 0.9
                    tt += 0.26
                tt += r.uniform(1.0, 3.0)
            env = np.clip(env, 0, 1.2)
        else:  # abura：ジー（持続のざらつき）
            env = smooth_noise(dur, 0.15, seed + k, 0.4, 1.0) * (0.6 + 0.4 * (0.5 + 0.5 * np.sin(2 * np.pi * 90 * t)))
        out += pan(carrier * env, p) * lv
    out = lowpass(out, 6500 if not far else 4200, 2)
    if far:
        out = convolve_st(out, reverb_ir(1.2, 0.4, seed), 0.5) * 0.5
    return out * level * 0.03

def higurashi(dur, seed=10, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = r.uniform(0, 2)
    while tt < dur:
        p = r.uniform(-0.9, 0.9); f0 = r.uniform(4400, 5300); L = r.uniform(3.0, 5.0); lv = r.uniform(0.5, 1.0)
        rate = r.uniform(7, 9.5); q = 0
        while q / rate < L:
            ts = tt + q / rate; i = int(ts * SR); m = int(0.07 * SR)
            if i + m >= n: break
            x = np.arange(m) / SR
            decay = (1 - q / rate / L) ** 1.3
            f = f0 * (1 - 0.06 * q / rate / L)
            y = np.sin(2 * np.pi * f * x) * np.sin(np.pi * x / 0.07) ** 2 * decay
            out[i:i + m] += pan(y, p) * lv
            q += 1
        tt += L + r.uniform(1.5, 4.0)
    out = convolve_st(out, reverb_ir(1.5, 0.5, seed), 0.45)
    return out * level * 0.035

def suzumushi(dur, seed=11, level=1.0, count=4):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    for k in range(count):
        p = r.uniform(-0.9, 0.9); f = r.uniform(3900, 4600); lv = r.uniform(0.4, 1.0); tt = r.uniform(0, 2)
        while tt < dur:
            L = r.uniform(0.35, 0.7); i = int(tt * SR); m = int(L * SR)
            if i + m >= n: break
            x = np.arange(m) / SR
            trill = 0.6 + 0.4 * np.sin(2 * np.pi * r.uniform(28, 40) * x)
            y = np.sin(2 * np.pi * f * x) * trill * np.sin(np.pi * x / L) ** 0.8
            out[i:i + m] += pan(y, p) * lv
            tt += L + r.uniform(0.3, 1.2)
    out = convolve_st(out, reverb_ir(1.0, 0.3, seed), 0.35)
    return out * level * 0.02

def clock_tick(dur, seed=12, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    for k in range(int(dur)):
        m = int(0.03 * SR); x = np.arange(m) / SR
        y = bandpass(r.standard_normal(m), 1800 if k % 2 else 2300, 4200, 2) * np.exp(-x / 0.006)
        i = int((k + 0.3) * SR)
        if i + m < n: out[i:i + m] += pan(y, 0.35)
    return out * level * 0.06

def drips(dur, seed=13, rate=1.6, level=1.0):
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = r.uniform(0, 0.5)
    while tt < dur:
        m = int(0.12 * SR); x = np.arange(m) / SR
        f = r.uniform(900, 2600) * (1 + 0.4 * np.exp(-x / 0.01))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.025) + 0.2 * r.standard_normal(m) * np.exp(-x / 0.004)
        i = int(tt * SR)
        if i + m < n: out[i:i + m] += pan(y, r.uniform(-0.8, 0.8)) * r.uniform(0.2, 1.0)
        tt += r.exponential(1 / rate)
    out = convolve_st(out, reverb_ir(0.9, 0.25, seed), 0.3)
    trickle = bandpass(pink(n, seed + 3), 1200, 4500, 2) * smooth_noise(dur, 3.0, seed + 4, 0.3, 1.0)
    return (out * 0.12 + np.stack([trickle, trickle * 0.8], axis=1) * 0.015) * level

def hum(dur, seed=14, f=100, level=1.0):
    t = t_axis(dur)
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.2 * lowpass(rng(seed).standard_normal(len(t)), 300, 1)
    return pan(y, 0.0) * level * 0.01

# ---------- 祭り囃子（オリジナル） ----------

def taiko_hit(seed, big=True):
    m = int(0.8 * SR); x = np.arange(m) / SR; r = rng(seed)
    f = (78 if big else 110) * (1 + 0.5 * np.exp(-x / 0.03))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / (0.28 if big else 0.18))
    slap = bandpass(r.standard_normal(m), 300, 2500, 1) * np.exp(-x / 0.02) * 0.35
    return fade(body + slap, 0.001, 0.05)

def ka_hit(seed):
    m = int(0.12 * SR); x = np.arange(m) / SR
    y = bandpass(rng(seed).standard_normal(m), 1500, 5000, 2) * np.exp(-x / 0.012) + 0.4 * np.sin(2 * np.pi * 1800 * x) * np.exp(-x / 0.02)
    return y

def kane_hit(seed):
    return bell(1250, 0.6, seed, partials=((1, 1.0, 1.0), (2.4, 0.6, 0.5), (3.9, 0.4, 0.3), (6.1, 0.25, 0.2)), decay=0.25) * 0.5

def fue_note(freq, dur, seed):
    t = t_axis(dur); r = rng(seed)
    vib = 1 + 0.008 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    tone = np.sin(ph) + 0.12 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    breath = bandpass(r.standard_normal(len(t)), freq * 1.5, min(freq * 6, 12000), 1) * 0.08
    env = np.clip(t / 0.06, 0, 1) * np.clip((dur - t) / 0.08, 0, 1)
    return (tone + breath) * env

FUE = [  # 篠笛風のオリジナル旋律（民謡音階 D F G A C）。(半音, 拍)
    (14, 1), (12, 1), (9, 2), (12, 1), (14, 1), (17, 2), (14, 1), (12, 1), (9, 1), (7, 1), (9, 4),
    (5, 1), (7, 1), (9, 2), (12, 1), (9, 1), (7, 2), (5, 1), (7, 1), (9, 1), (7, 1), (2, 4),
]

def festival_music(dur, bpm=96, seed=15, flute=True):
    n = int(dur * SR); out = np.zeros((n, 2)); beat = 60 / bpm
    nb = int(dur / beat) + 1
    for b in range(nb):
        t0 = b * beat; pos = b % 4
        def put(snd, at, g, p):
            i = int(at * SR)
            if i < n:
                j = min(n, i + len(snd)); out[i:j] += pan(snd, p)[:j - i] * g
        if pos in (0, 1, 3):
            put(taiko_hit(seed + b), t0, 1.0 if pos == 0 else 0.8, -0.1)
        if pos == 2:
            put(ka_hit(seed + b), t0, 0.5, -0.1); put(ka_hit(seed + b + 999), t0 + beat / 2, 0.45, -0.1)
        put(kane_hit(seed + b), t0 + beat / 2, 0.25 if pos % 2 else 0.18, 0.4)
    if flute:
        base = 293.66 * 2  # D5
        tt = beat * 4; k = 0
        while tt < dur:
            semi, beats = FUE[k % len(FUE)]
            L = beats * beat
            snd = fue_note(base * 2 ** (semi / 12) / 2, L * 0.96, seed + k)
            i = int(tt * SR)
            if i < n:
                j = min(n, i + len(snd)); out[i:j] += pan(snd, 0.25)[:j - i] * 0.22
            tt += L; k += 1
    return out * 0.25

# ---------- イベント（単発音） ----------

def foghorn(seed=20):
    d = 3.2; t = t_axis(d)
    f = 138
    y = (np.sign(np.sin(2 * np.pi * f * t)) * 0.4 + np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t))
    env = np.clip(t / 0.5, 0, 1) * np.clip((d - t) / 1.2, 0, 1)
    y = lowpass(y * env, 700, 2)
    st = convolve_st(np.stack([y, y], 1), reverb_ir(4.0, 1.6, seed, lp=1500, pre=0.05), 0.75)
    return st * 0.3

def ferry_horn(seed=21):
    d = 2.0; t = t_axis(d); env = np.clip(t / 0.15, 0, 1) * np.clip((d - t) / 0.4, 0, 1)
    y = sum(np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) for f in (186, 232)) * env
    y = lowpass(y, 1200, 2)
    return convolve_st(np.stack([y, y], 1), reverb_ir(3.0, 1.2, seed, lp=1800, pre=0.04), 0.7) * 0.18

CHIME = [(4, 1), (7, 1), (12, 2), (11, 1), (9, 1), (7, 2), (5, 1), (9, 1), (7, 1), (4, 1), (2, 4),
         (4, 1), (7, 1), (9, 1), (12, 1), (14, 2), (12, 1), (9, 1), (7, 1), (9, 1), (7, 1), (4, 1), (2, 1), (4, 1), (0, 4)]

def town_chime(seed=22, unit=0.38):
    # 五時のチャイム（オリジナル旋律）。遠くの屋外スピーカーの響き
    total = sum(b for _, b in CHIME) * unit + 4
    n = int(total * SR); y = np.zeros(n); tt = 0.0
    for semi, b in CHIME:
        f = 523.25 * 2 ** (semi / 12)
        s = bell(f, 2.4, seed, partials=((1, 1.0, 1.0), (2.0, 0.35, 0.7), (3.0, 0.15, 0.5), (4.2, 0.08, 0.3)), decay=0.9)
        i = int(tt * SR); j = min(n, i + len(s)); y[i:j] += s[:j - i]; tt += b * unit
    y = bandpass(y, 320, 3400, 2)
    y = np.tanh(y * 1.6) / 1.6
    st = np.stack([y, y], 1)
    st = convolve_st(st, reverb_ir(5.0, 1.8, seed, lp=2600, pre=0.12), 0.7)
    return st * 0.22

def robot_pi(seed=23):
    d = 0.5; t = t_axis(d)
    env = np.clip(t / 0.015, 0, 1) * np.exp(-np.clip(t - 0.16, 0, None) / 0.05)
    y = (np.sin(2 * np.pi * 1568 * t) + 0.15 * np.sin(2 * np.pi * 3136 * t)) * env
    return convolve_st(np.stack([y, y], 1), reverb_ir(0.8, 0.25, seed, lp=5000), 0.25) * 0.12

def holo_on(seed=24):
    d = 1.6; out = np.zeros((int(d * SR), 2))
    for k, (f, at) in enumerate(((1318.5, 0.0), (1975.5, 0.07), (2637.0, 0.14))):
        s = bell(f, 1.2, seed + k, partials=((1, 1.0, 1.0), (2.0, 0.2, 0.5), (3.01, 0.1, 0.3)), decay=0.5)
        i = int(at * SR); out[i:i + len(s)] += pan(s, (k - 1) * 0.3)
    sweep = bandpass(rng(seed).standard_normal(len(out)), 2500, 9000, 2) * np.exp(-t_axis(d) / 0.18) * 0.15
    out += np.stack([sweep, sweep], 1)
    out = lowpass(out, 9000, 2)
    return convolve_st(out, reverb_ir(1.2, 0.35, seed, lp=8000), 0.35) * 0.05

def watering(dur=7.0, seed=25):
    n = int(dur * SR); t = np.arange(n) / SR; r = rng(seed)
    gurgle = 0.6 + 0.4 * smooth_noise(dur, 14, seed, 0, 1)
    y = bandpass(r.standard_normal(n), 900, 4200, 2) * gurgle
    env = np.clip(t / 0.4, 0, 1) * np.clip((dur - t) / 0.8, 0, 1)
    return pan(y * env, 0.3) * 0.05

# ---------- 改良版（Gemini の聴取評価を受けて作り直し） ----------
import soundfile as _sf
from pathlib import Path as _Path
from scipy import signal as _signal

def waves(dur, seed=31, level=1.0, period=(4.5, 7.5), bright=3200, calm=False):
    # 波：寄せて返す一つ一つの波を、明るさが変わる帯域ノイズで作る
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = -r.uniform(0, 3)
    while tt < dur:
        rise = r.uniform(1.4, 2.4); fall = r.uniform(2.2, 3.8); L = rise + fall; m = int(L * SR)
        x = np.arange(m) / SR
        env = np.where(x < rise, (x / rise) ** 2, np.exp(-(x - rise) / (fall * 0.45)))
        src = np.stack([pink(m, int(r.integers(1e6))), pink(m, int(r.integers(1e6)))], 1)
        low = bandpass(src, 180, 900, 2) * env[:, None]
        mid = bandpass(src, 700, bright, 2) * (env ** 1.6)[:, None] * 0.8
        fizz = bandpass(src, bright, min(bright * 2.6, 11000), 2) * (np.clip((x - rise) / 0.4, 0, 1) * np.exp(-(x - rise).clip(0) / 1.1))[:, None] * 0.35
        w = (low + mid + fizz) * r.uniform(0.5, 1.0) * (0.45 if calm else 1.0)
        p = r.uniform(-0.5, 0.5)
        w = w * np.array([1 - max(0, p), 1 + min(0, p)])
        i = int(tt * SR); a = max(0, -i); j = min(n, i + m)
        if j > max(i, 0): out[max(i, 0):j] += w[a:a + j - max(i, 0)]
        tt += r.uniform(*period)
    bed = np.stack([bandpass(pink(n, seed + 1), 250, 1500, 1), bandpass(pink(n, seed + 2), 250, 1500, 1)], 1) * 0.12
    return (out + bed) * level * 0.22

def foghorn2(seed=32):
    d = 3.6; t = t_axis(d); r = rng(seed)
    f = 118 * (1 - 0.06 * np.clip((t - 2.6) / 0.6, 0, 1))  # 終わりに少し下がる
    ph1 = 2 * np.pi * np.cumsum(f) / SR; ph2 = 2 * np.pi * np.cumsum(f * 1.004) / SR
    y = sum(a * (np.sin(k * ph1) + np.sin(k * ph2)) for k, a in ((1, 1.0), (2, 0.55), (3, 0.35), (4, 0.2), (5, 0.12)))
    y += bandpass(r.standard_normal(len(t)), 150, 1200, 1) * 0.15
    env = np.clip(t / 0.35, 0, 1) ** 2 * np.clip((d - t) / 0.9, 0, 1)
    y = lowpass(y * env, 900, 2)
    st = np.stack([y, y], 1)
    echo = np.zeros((int((d + 3) * SR), 2)); echo[:len(st)] += st
    for dl, g in ((0.55, 0.35), (1.3, 0.2), (2.1, 0.1)):
        i = int(dl * SR); echo[i:i + len(st)] += lowpass(st, 600, 1) * g
    return convolve_st(echo, reverb_ir(4.0, 1.4, seed, lp=1400, pre=0.03), 0.6) * 0.16

def holo_on2(seed=33):
    d = 1.4; out = np.zeros((int(d * SR), 2))
    for k, (f, at) in enumerate(((880.0, 0.0), (1174.7, 0.08), (1760.0, 0.16))):
        t = t_axis(1.1)
        s = (np.sin(2 * np.pi * f * t) + 0.12 * np.sin(4 * np.pi * f * t)) * np.clip(t / 0.03, 0, 1) * np.exp(-t / 0.35)
        i = int(at * SR); out[i:i + len(s)] += pan(s, (k - 1) * 0.25)
    out = lowpass(out, 4500, 2)
    return convolve_st(out, reverb_ir(1.2, 0.4, seed, lp=5000), 0.4) * 0.06

_CROWD = None
def _crowd_clips():
    global _CROWD
    if _CROWD is None:
        _CROWD = []
        for p in sorted((_Path(__file__).parent / 'crowd').glob('c*.wav')):
            y, sr = _sf.read(p)
            if y.ndim > 1: y = y.mean(1)
            y = _signal.resample_poly(y, SR // 1000, sr // 1000)
            a = np.abs(y); th = 0.02 * a.max()
            idx = np.where(a > th)[0]
            y = y[max(0, idx[0] - 200): idx[-1] + 2000]
            y = fade(y / (np.max(np.abs(y)) + 1e-9), 0.012, 0.08)
            _CROWD.append(y)
    return _CROWD

def crowd(dur, seed=34, density=1.6, level=1.0, far=False):
    # ざわめき：TTS の短い会話を重ね、距離感をつけてぼかす
    clips = _crowd_clips(); n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = -r.uniform(0, 1.5)
    while tt < dur:
        c = clips[int(r.integers(len(clips)))]
        g = db(r.uniform(-20, -9) if not far else r.uniform(-16, -4)); p = r.uniform(-0.9, 0.9)
        s = pan(c, p) * g
        i = int(tt * SR); a = max(0, -i); j = min(n, i + len(s))
        if j > max(i, 0): out[max(i, 0):j] += s[a:a + j - max(i, 0)]
        tt += r.exponential(1 / density)
    out = highpass(out, 180, 2)
    out = lowpass(out, 2600 if far else 4200, 2)
    out = convolve_st(out, reverb_ir(1.8, 0.55, seed, lp=4000, pre=0.02), 0.55 if far else 0.4)
    return out * level * (0.05 if far else 0.08)

def drums_far(dur, src_wav, seed=35, level=1.0):
    # Veo が作った太鼓の音（元の速さ）を繰り返して遠景にする
    y, sr = _sf.read(src_wav)
    if y.ndim == 1: y = np.stack([y, y], 1)
    y = _signal.resample_poly(y, SR // 1000, sr // 1000, axis=0)
    seg = y[int(0.3 * SR): int(7.6 * SR)]
    n = int(dur * SR); out = np.zeros((n, 2)); xf = int(0.8 * SR); pos = 0
    win_in = np.linspace(0, 1, xf)[:, None]; win_out = win_in[::-1]
    while pos < n:
        s = seg.copy(); s[:xf] *= win_in; s[-xf:] *= win_out
        j = min(n, pos + len(s)); out[pos:j] += s[:j - pos]; pos += len(s) - xf
    out = highpass(out, 90, 2)
    out = lowpass(out, 4800, 2)
    out = convolve_st(out, reverb_ir(2.0, 0.7, seed, lp=4500, pre=0.04), 0.35)
    return out * level * 0.35


def stamp(seed=41):
    # 回覧板の既読のはんこ：紙に押す「ポン」（低い胴鳴り＋紙と木の当たり）→ 小さな確認音
    r = rng(seed); d = 1.2; out = np.zeros((int(d * SR), 2))
    t = t_axis(0.25)
    thump = np.sin(2 * np.pi * (95 + 40 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.05)
    knock = bandpass(r.standard_normal(len(t)), 700, 3200, 2) * np.exp(-t / 0.012) * 0.6
    body = fade(thump + knock, 0.001, 0.05)
    out[:len(body)] += pan(body, 0.0)
    for k, (f, at) in enumerate(((1318.5, 0.16), (1760.0, 0.24))):
        tt = t_axis(0.6)
        s = np.sin(2 * np.pi * f * tt) * np.clip(tt / 0.01, 0, 1) * np.exp(-tt / 0.18) * 0.25
        i = int(at * SR); out[i:i + len(s)] += pan(s, 0.15 * (k * 2 - 1))
    return convolve_st(lowpass(out, 6000, 2), reverb_ir(0.8, 0.3, seed, lp=5000), 0.25) * 0.5


def chalk(n, stagger=0.11, seed=42):
    # 透明な電子黒板が鳴らすチョークの音：1文字ごとに「カツ」、ときどき短い「スー」
    r = rng(seed); d = n * stagger + 1.0; out = np.zeros((int(d * SR), 2))
    for k in range(n):
        at = max(0.0, k * stagger + r.uniform(-0.015, 0.015))
        for j in range(r.integers(1, 3)):  # 1文字に1〜2画
            L = int(r.uniform(0.012, 0.022) * SR)
            click = bandpass(r.standard_normal(L), 1800, 6500, 2) * np.exp(-np.arange(L) / (0.004 * SR))
            click += 0.5 * np.sin(2 * np.pi * r.uniform(1100, 1500) * np.arange(L) / SR) * np.exp(-np.arange(L) / (0.006 * SR))
            i = int((at + j * 0.045) * SR); out[i:i + L] += pan(fade(click * r.uniform(0.6, 1.0), 0.001, 0.004), r.uniform(-0.1, 0.1))
        if r.random() < 0.35:  # 横に引く音
            L = int(r.uniform(0.05, 0.09) * SR)
            scr = bandpass(r.standard_normal(L), 2500, 7000, 2) * np.hanning(L) * 0.25
            i = int((at + 0.03) * SR); out[i:i + L] += pan(scr, 0.0)
    return convolve_st(out, reverb_ir(0.9, 0.35, seed, lp=7000), 0.3) * 0.5


def broom(dur, seed=43, every=(2.0, 2.8)):
    # 竹ぼうきで石畳を掃く音：「サッ」という擦れ（高めの帯域の雑音に細かい穂先のざらつき）をゆっくり繰り返す
    r = rng(seed); n = int(dur * SR); out = np.zeros((n, 2)); at = r.uniform(0.3, 1.2)
    while at < dur - 0.6:
        L = int(r.uniform(0.32, 0.5) * SR); tt = np.arange(L) / SR
        env = np.clip(tt / 0.05, 0, 1) * np.clip((tt[-1] - tt) / 0.16, 0, 1)
        grain = 0.6 + 0.4 * np.abs(r.standard_normal(L)) ** 0.5
        s = bandpass(r.standard_normal(L), r.uniform(1400, 2200), 7500, 2) * env * grain * r.uniform(0.7, 1.0)
        i = int(at * SR); j = min(n, i + L); out[i:j] += pan(s[:j - i], r.uniform(-0.15, 0.15))
        at += r.uniform(*every)
    return convolve_st(out, reverb_ir(0.7, 0.3, seed, lp=6000), 0.25)


# ---------- 第二章で足した音 ----------

def phone_notify(seed=51):
    # 2026年のスマートフォンの通知：やわらかい二音（ロゴ音ではない、ありふれた形のオリジナル）
    out = np.zeros((int(0.9 * SR), 2))
    for k, (f, at) in enumerate(((1174.7, 0.0), (1568.0, 0.11))):
        tt = t_axis(0.6)
        s = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 4 * f * tt) * np.exp(-tt / 0.02)) * np.clip(tt / 0.004, 0, 1) * np.exp(-tt / 0.13)
        i = int(at * SR); out[i:i + len(s)] += pan(s, 0.1)
    return convolve_st(lowpass(out, 7000, 2), reverb_ir(0.5, 0.2, seed, lp=6000), 0.2) * 0.3


def sand(dur, seed=52, strength=1.0):
    # 風に舞う細かい砂：高い帯域のざらつきが、風の息に合わせて強まる
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    for c in range(2):
        g = smooth_noise(dur, 0.35, seed * 3 + c, 0.15, 1.0) ** 2.2
        hiss = bandpass(pink(n, seed * 5 + c), 2600, 9500, 2) * g
        grains = (r.random(n) < 0.004 * g) * r.uniform(-1, 1, n)  # 砂粒が当たる細かい音
        out[:, c] = hiss + bandpass(grains, 3000, 10000, 2) * 0.6
    return out * strength * 0.2


def siphon(dur, seed=53):
    # サイフォンのこぽこぽ：小さな泡の音（短く上がる音程）＋ 低い沸騰のゆらぎ
    n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    at = r.uniform(0, 0.2)
    while at < dur - 0.1:
        L = int(r.uniform(0.02, 0.045) * SR); tt = np.arange(L) / SR
        f0 = r.uniform(350, 950)
        s = np.sin(2 * np.pi * f0 * (tt + 6 * tt ** 2)) * np.exp(-tt / r.uniform(0.008, 0.016))
        i = int(at * SR); j = min(n, i + L); out[i:j] += pan(s[:j - i], r.uniform(-0.2, 0.2)) * r.uniform(0.3, 1.0)
        at += r.exponential(1 / 9.0) * (0.4 if r.random() < 0.3 else 1.0)
    boil = lowpass(brown(n, seed), 260, 2) * smooth_noise(dur, 0.8, seed, 0.5, 1.0) * 0.6
    out += np.stack([boil, boil], 1)
    return convolve_st(lowpass(out, 5000, 2), reverb_ir(0.6, 0.25, seed, lp=5000), 0.3) * 0.25


def cup_clink(seed=54):
    # カップと受け皿：陶器の短い「カチャ」（倍音が整数でない、すぐ消える音）を2回
    r = rng(seed); out = np.zeros((int(0.8 * SR), 2))
    for k, at in enumerate((0.0, r.uniform(0.09, 0.16))):
        tt = t_axis(0.4); s = np.zeros_like(tt)
        for f, a, d in ((2150, 1.0, 0.09), (3320, 0.6, 0.07), (5080, 0.35, 0.05), (7750, 0.2, 0.03)):
            s += a * np.sin(2 * np.pi * f * r.uniform(0.97, 1.03) * tt) * np.exp(-tt / d)
        s *= np.clip(tt / 0.0015, 0, 1) * (1.0 if k == 0 else 0.55)
        i = int(at * SR); out[i:i + len(s)] += pan(s, 0.25)
    return convolve_st(out, reverb_ir(0.7, 0.3, seed, lp=7000), 0.3) * 0.12


def monorail_pass(seed=55, dur=7.0):
    # 空中電車が瓦屋根の上を渡る：静かなモーターのうなり＋レールの風切り。左から右へ、近づいて遠ざかる
    t = t_axis(dur); env = np.exp(-((t - dur * 0.5) / (dur * 0.22)) ** 2)
    dop = 1 + 0.025 * np.tanh((dur * 0.5 - t) / 0.8)  # 近づくと少し高く、離れると低く
    ph = 2 * np.pi * np.cumsum(140 * dop) / SR
    hum = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph) + 0.08 * np.sin(6.4 * ph)) * env
    whoosh = bandpass(pink(len(t), seed), 250, 2200, 2) * env ** 1.5 * 1.4
    y = (hum * 0.35 + whoosh)
    out = np.stack([y * np.clip(1.2 - t / dur * 1.4, 0.15, 1), y * np.clip(t / dur * 1.4 - 0.2, 0.15, 1)], 1)
    return convolve_st(lowpass(out, 4000, 2), reverb_ir(1.6, 0.5, seed, lp=4000), 0.35) * 0.4


def holo_ticks(n, stagger=0.12, seed=56):
    # 空中のタブレットに文字が刻まれる、ごく小さな音（1文字ごと）
    r = rng(seed); d = n * stagger + 0.6; out = np.zeros((int(d * SR), 2))
    for k in range(n):
        L = int(0.012 * SR); tt = np.arange(L) / SR
        s = np.sin(2 * np.pi * r.uniform(2600, 3300) * tt) * np.exp(-tt / 0.003)
        i = int((k * stagger + r.uniform(-0.01, 0.01)) * SR)
        if i >= 0:
            out[i:i + L] += pan(s * r.uniform(0.5, 1.0), r.uniform(-0.2, 0.2))
    return convolve_st(out, reverb_ir(0.6, 0.25, seed, lp=8000), 0.3) * 0.15


def murmur_voice(dur, seed=57):
    # 窓ぎわの席で、タブレットに話しかける声（遠くて言葉は聞き取れない）
    clips = _crowd_clips(); r = rng(seed); n = int(dur * SR); out = np.zeros((n, 2)); at = 0.0
    while at < dur - 0.5:
        c = clips[int(r.integers(len(clips)))]
        i = int(at * SR); j = min(n, i + len(c)); out[i:j] += pan(c[:j - i], 0.35)
        at += len(c) / SR + r.uniform(0.15, 0.4)
    env = np.clip(t_axis(dur) / 0.2, 0, 1) * np.clip((dur - t_axis(dur)) / 0.4, 0, 1)
    out = lowpass(highpass(out, 200, 2), 750, 4) * env[:, None]
    return convolve_st(out, reverb_ir(0.9, 0.35, seed, lp=3000), 0.4) * 0.5


def can_kick(seed=58):
    # 缶蹴りの空き缶：蹴った「カーン」→ 石畳で2、3度はねて転がる
    r = rng(seed); d = 2.6; out = np.zeros((int(d * SR), 2))
    hits = [(0.0, 1.0, 0.5), (0.62, 0.45, 0.25), (0.95, 0.3, 0.18), (1.18, 0.2, 0.12)]
    for k, (at, a, dec) in enumerate(hits):
        tt = t_axis(dec * 3); s = np.zeros_like(tt)
        for f, pa, pd in ((620, 1.0, 1.0), (1430, 0.7, 0.8), (2210, 0.5, 0.6), (3170, 0.35, 0.45), (4400, 0.2, 0.3)):
            s += pa * np.sin(2 * np.pi * f * r.uniform(0.98, 1.02) * tt) * np.exp(-tt / (dec * pd))
        s += bandpass(r.standard_normal(len(tt)), 1500, 8000, 2) * np.exp(-tt / 0.006) * 1.2
        i = int(at * SR); out[i:i + len(s)] += pan(s * a, -0.2 + 0.15 * k)
    roll = bandpass(r.standard_normal(int(0.9 * SR)), 1800, 6000, 2) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 13 * t_axis(0.9)))) * np.linspace(0.25, 0, int(0.9 * SR))
    i = int(1.3 * SR); out[i:i + len(roll)] += pan(roll, 0.25)
    return convolve_st(out, reverb_ir(1.0, 0.4, seed, lp=7000), 0.35) * 0.25


def kids(dur, seed=59, density=1.4):
    # 遠くで遊ぶ子どもたちの声：ざわめきの声を速く高くして、言葉にならない遠い声に
    clips = _crowd_clips(); n = int(dur * SR); out = np.zeros((n, 2)); r = rng(seed)
    tt = -r.uniform(0, 1.0)
    while tt < dur:
        c = clips[int(r.integers(len(clips)))]
        c = _signal.resample_poly(c, 3, 4)  # 4/3 倍の速さと高さ
        s = pan(c, r.uniform(-0.9, 0.9)) * db(r.uniform(-14, -2))
        i = int(tt * SR); a = max(0, -i); j = min(n, i + len(s))
        if j > max(i, 0): out[max(i, 0):j] += s[a:a + j - max(i, 0)]
        tt += r.exponential(1 / density)
    out = lowpass(highpass(out, 250, 2), 2400, 2)
    return convolve_st(out, reverb_ir(1.6, 0.5, seed, lp=3500, pre=0.03), 0.6) * 0.06


def stamp_paper(seed=60):
    # 紙のカードにはんこを押す「ポン」（確認音なし）
    r = rng(seed); t = t_axis(0.3)
    thump = np.sin(2 * np.pi * (90 + 45 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.05)
    knock = bandpass(r.standard_normal(len(t)), 600, 3000, 2) * np.exp(-t / 0.01) * 0.7
    body = fade(thump + knock, 0.001, 0.05)
    return convolve_st(np.stack([body, body], 1), reverb_ir(0.8, 0.3, seed, lp=5000), 0.3) * 0.5


def sparkler(dur, seed=61):
    # 線香花火のパチパチ：ごく短い乾いた音が、2〜5個ずつ固まって鳴る＋細い火花のシュー
    r = rng(seed); n = int(dur * SR); out = np.zeros((n, 2)); t = r.uniform(0, 0.1)
    while t < dur:
        for j in range(int(r.integers(1, 6))):
            L = int(r.uniform(0.002, 0.006) * SR)
            c = bandpass(r.standard_normal(L), 2500, 11000, 2) * np.exp(-np.arange(L) / (0.0012 * SR))
            i = int((t + j * r.uniform(0.005, 0.03)) * SR)
            if i + L < n:
                out[i:i + L] += pan(c * r.uniform(0.3, 1.0), r.uniform(-0.3, 0.3))
        t += r.exponential(1 / 14)
    hiss = bandpass(pink(n, seed), 3000, 9000, 2) * 0.03 * smooth_noise(dur, 0.5, seed, 0.5, 1.0)
    out += np.stack([hiss, hiss], 1)
    return convolve_st(out, reverb_ir(0.5, 0.2, seed, lp=9000), 0.2) * 0.4


# ---------- 人の声（せりふにはしない）：遠くの話し声・子どもの声・笑い声 ----------
# 素材は audio/src/crowd/ の短い会話（TTS）。前置きの指示の読み上げを避けて、最初の 0.4 秒以上の間より後ろ（日本語の部分）だけを使う。
# 言葉として聞き取れないように、短く切って重ね、遠くの音にする
_VOICE = None
_KID_FILES = ('c00', 'c07', 'c08')  # 子どもの声（Leda・Zephyr）
_LAUGH_FILE = 'c12'                 # 「ふふ」と笑ってから話す声


def _segments(y, sr, gap=0.4, th_db=35):
    hop = int(0.02 * sr)
    e = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(0, len(y) - hop, hop)])
    db_ = 20 * np.log10(e + 1e-9); act = db_ > db_.max() - th_db
    segs, on = [], None
    for i, a in enumerate(act):
        if a and on is None: on = i
        if not a and on is not None: segs.append([on, i]); on = None
    if on is not None: segs.append([on, len(act)])
    merged = []
    for s in segs:
        if merged and (s[0] - merged[-1][1]) * 0.02 < 0.2: merged[-1][1] = s[1]
        else: merged.append(s)
    return [(a * hop, b * hop) for a, b in merged], hop


def _voice_bank():
    # {'kid': [日本語の部分], 'adult': [...], 'kid_grains': [母音の粒], 'adult_grains': [...]}
    global _VOICE
    if _VOICE is not None:
        return _VOICE
    bank = {'kid': [], 'adult': [], 'kid_grains': [], 'adult_grains': []}
    for p in sorted((_Path(__file__).parent / 'crowd').glob('c*.wav')):
        y, sr = _sf.read(p)
        if y.ndim > 1: y = y.mean(1)
        y = _signal.resample_poly(y, SR // 1000, sr // 1000)
        segs, hop = _segments(y, SR)
        # 前置き（最初の塊）のあと、0.4 秒以上の間が空いた所から後ろ
        start = None
        for k in range(1, len(segs)):
            if (segs[k][0] - segs[k - 1][1]) / SR >= 0.4:
                start = segs[k][0]; break
        if start is None:
            continue
        part = y[max(0, start - int(0.03 * SR)):]
        part = fade(part / (np.max(np.abs(part)) + 1e-9), 0.01, 0.08)
        kind = 'kid' if p.stem in _KID_FILES else 'adult'
        bank[kind].append(part)
        # 母音の粒：周期性が高く、音が大きい 90ms
        fl = int(0.09 * SR); best = []
        for i in range(0, len(part) - fl, int(0.03 * SR)):
            f = part[i:i + fl]
            en = np.sqrt(np.mean(f ** 2))
            if en < 0.12: continue
            f0 = f - f.mean(); ac = np.correlate(f0, f0, 'full')[fl - 1:]
            if ac[0] <= 0: continue
            ac = ac / ac[0]; lo, hi = SR // 900, SR // 120
            per = ac[lo:hi].max()
            if per > 0.7: best.append((per * en, i))
        for _, i in sorted(best, reverse=True)[:6]:
            bank[kind + '_grains'].append(part[i:i + fl].copy())
    _VOICE = bank
    return bank


def _shift(y, ratio):
    # 音程（と声の太さ）をまとめて変える：ratio > 1 で高く短く
    n = max(16, int(len(y) / ratio))
    return _signal.resample(y, n)


def _glide(y, r0, r1):
    # 音程をなめらかに動かしながら読む（r0 → r1、1 より大きいと高い）
    rate = np.linspace(r0, r1, len(y))
    pos = np.cumsum(rate); pos = pos[pos < len(y) - 1]
    return np.interp(pos, np.arange(len(y)), y)


_SOFT = None
def _soft_laugh():
    # 本物の「ふふ」：c12 の最初の 0.3〜1.55 秒（指示の代わりに笑ってから話している）
    global _SOFT
    if _SOFT is None:
        y, sr = _sf.read(_Path(__file__).parent / 'crowd' / f'{_LAUGH_FILE}.wav')
        if y.ndim > 1: y = y.mean(1)
        y = _signal.resample_poly(y, SR // 1000, sr // 1000)
        seg = y[int(0.26 * SR):int(1.56 * SR)]
        _SOFT = fade(seg / (np.max(np.abs(seg)) + 1e-9), 0.01, 0.15)
    return _SOFT


def laugh(seed=70, kind='kid', n=None, far=True, soft=None):
    # 笑い声。soft（既定は近い大人）：本物の「ふふ」を、声の高さだけ変えて使う
    # それ以外：母音の粒から「は・は・は」（息の音で始めて、粒ごとに音程を下げながら揺らす）。遠くで聞こえる笑い声向け
    r = rng(seed)
    if soft is None:
        soft = (not far) and kind != 'kid'
    if soft:
        ratio = {'kid': r.uniform(1.22, 1.32), 'woman': r.uniform(0.97, 1.05), 'man': r.uniform(0.78, 0.84)}[kind]
        y = _shift(_soft_laugh(), ratio)
        st = pan(y, r.uniform(-0.4, 0.4))
        st = lowpass(highpass(st, 150, 2), 2600 if far else 6000, 2)
        return convolve_st(st, reverb_ir(0.9, 0.3, seed, lp=5000), 0.45 if far else 0.2) * 0.5
    bank = _voice_bank()
    grains = bank['kid_grains'] if kind == 'kid' else bank['adult_grains']
    base = {'kid': r.uniform(1.12, 1.28), 'woman': r.uniform(1.0, 1.1), 'man': r.uniform(0.76, 0.86)}[kind]
    n = n or int(r.integers(3, 7))
    out = np.zeros(int(2.2 * SR)); t = 0.0
    g0 = int(r.integers(len(grains)))
    for k in range(n):
        g = grains[(g0 + int(r.integers(0, 3))) % len(grains)]
        top = base * (1.08 - 0.05 * k) * r.uniform(0.97, 1.03)
        s = _glide(g, top * r.uniform(1.02, 1.08), top * r.uniform(0.86, 0.93))  # 一つの「は」の中で下がる
        L = min(len(s), int(r.uniform(0.06, 0.11) * SR)); s = s[:L]
        env = np.minimum(1, np.arange(L) / (0.008 * SR)) * np.exp(-np.arange(L) / (r.uniform(0.04, 0.07) * SR))
        noise = bandpass(r.standard_normal(L), 700, 4200, 2) * np.std(s) * 0.45
        hlen = int(r.uniform(0.025, 0.045) * SR)
        h = bandpass(r.standard_normal(hlen), 900, 5000, 2) * np.std(s) * np.linspace(0.2, 0.6, hlen)
        syl = np.concatenate([h, (s + noise) * env])
        a = (1.0 - 0.13 * k) * r.uniform(0.8, 1.0)
        i = int(t * SR)
        if i + len(syl) >= len(out): break
        out[i:i + len(syl)] += syl * a
        t += len(syl) / SR + r.uniform(0.05, 0.11)
    out = fade(out[:int((t + 0.3) * SR)], 0.004, 0.1)
    st = pan(out, r.uniform(-0.6, 0.6))
    st = lowpass(highpass(st, 220, 2), 2400 if far else 4500, 2)
    return convolve_st(st, reverb_ir(1.1, 0.35, seed, lp=4000, pre=0.02), 0.45 if far else 0.25) * 0.5


def chatter(dur, seed=71, kind='adult', density=1.0, far=True, laughs=0.0):
    # 話し声：会話を 0.4〜1.2 秒に切って重ねる（言葉として聞こえないように）。laughs：1分あたりの笑い声の数
    r = rng(seed); bank = _voice_bank(); n = int(dur * SR); out = np.zeros((n, 2))
    src = bank['kid'] + [_shift(a, 1.28) for a in bank['adult'][:4]] if kind == 'kids' else bank['adult'] + (bank['kid'] if kind == 'mixed' else [])
    t = -r.uniform(0, 0.8)
    while t < dur:
        a = src[int(r.integers(len(src)))]
        L = int(r.uniform(0.4, 1.2) * SR)
        if len(a) <= L: frag = a
        else:
            i0 = int(r.integers(0, len(a) - L)); frag = a[i0:i0 + L]
        frag = _shift(frag, r.uniform(0.94, 1.08) * (1.0 if kind != 'kids' else r.uniform(1.0, 1.1)))
        frag = fade(frag, 0.04, 0.12)
        s = pan(frag, r.uniform(-0.8, 0.8)) * db(r.uniform(-12, -2))
        i = int(t * SR); a0 = max(0, -i); i = max(0, i); j = min(n, i + len(s) - a0)
        if j > i: out[i:j] += s[a0:a0 + j - i]
        t += r.exponential(1 / (1.6 * density)) + 0.15
    if laughs > 0:
        t = r.uniform(0.5, 3.0)
        while t < dur - 1.0:
            lk = 'kid' if kind == 'kids' else ('woman' if r.random() < 0.6 else 'man')
            s = laugh(seed=int(r.integers(1, 10**6)), kind=lk, far=far) * db(r.uniform(-6, 0))
            i = int(t * SR); j = min(n, i + len(s)); out[i:j] += s[:j - i] * 2.0
            t += r.exponential(60.0 / laughs) + 1.5
    out = highpass(out, 200, 2)
    out = lowpass(out, 1700 if far else 3200, 4)
    out = convolve_st(out, reverb_ir(1.6, 0.5, seed, lp=3500, pre=0.03), 0.55 if far else 0.35)
    return out * 0.12


def kids_play(dur, seed=72, density=1.2, laughs=6.0, far=True):
    # 遊んでいる子どもたち：話し声＋はしゃぐ声＋笑い声
    return chatter(dur, seed=seed, kind='kids', density=density, far=far, laughs=laughs)


def aircar_pass(seed=73, dur=6.0, ltr=True):
    # 空飛ぶ車が頭の上を渡る：いくつかのプロペラの柔らかいうなり（少しずつ違う高さ）＋空気を切る音。近づいて遠ざかる
    r = rng(seed); t = t_axis(dur); c = dur * 0.45
    env = np.exp(-((t - c) / (dur * 0.2)) ** 2)
    dop = 1 + 0.035 * np.tanh((c - t) / 0.6)  # 近づくと高く、離れると低く
    y = np.zeros(len(t))
    for f0 in (r.uniform(105, 125), r.uniform(150, 170), r.uniform(205, 230)):
        ph = 2 * np.pi * np.cumsum(f0 * dop) / SR
        am = 1 + 0.25 * np.sin(2 * np.pi * r.uniform(9, 14) * t)  # 羽根の回転のゆらぎ
        y += (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)) * am
    whine = np.sin(2 * np.pi * np.cumsum(r.uniform(900, 1100) * dop) / SR) * 0.05
    whoosh = bandpass(pink(len(t), seed), 300, 3000, 2) * 1.6
    y = (y * 0.18 + whine) * env + whoosh * env ** 1.6
    u = t / dur if ltr else 1 - t / dur
    out = np.stack([y * np.clip(1.2 - u * 1.4, 0.15, 1), y * np.clip(u * 1.4 - 0.2, 0.15, 1)], 1)
    return convolve_st(lowpass(out, 5000, 2), reverb_ir(1.8, 0.5, seed, lp=4500), 0.4) * 0.4
