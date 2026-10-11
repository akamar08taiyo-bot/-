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
        at = k * stagger + r.uniform(-0.015, 0.015)
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
