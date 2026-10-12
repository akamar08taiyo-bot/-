# 音づくりの小道具（numpy/scipy）。すべて決定的な乱数で生成する
import numpy as np
from scipy import signal

SR = 48000

def rng(seed):
    return np.random.default_rng(seed)

def t_axis(dur):
    return np.arange(int(dur * SR)) / SR

def fade(x, fin=0.02, fout=0.05):
    n = len(x)
    a = int(fin * SR); b = int(fout * SR)
    env = np.ones(n)
    if a > 0: env[:min(a, n)] = np.linspace(0, 1, min(a, n)) ** 2
    if b > 0: env[max(0, n - b):] *= np.linspace(1, 0, min(b, n)) ** 2
    return x * env if x.ndim == 1 else x * env[:, None]

def bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)

def lowpass(x, f, order=2):
    sos = signal.butter(order, f, btype='low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)

def highpass(x, f, order=2):
    sos = signal.butter(order, f, btype='high', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)

def pink(n, seed):
    w = rng(seed).standard_normal(n)
    f = np.fft.rfft(w)
    k = np.arange(len(f)); k[0] = 1
    f /= np.sqrt(k)
    y = np.fft.irfft(f, n)
    return y / (np.std(y) + 1e-9)

def brown(n, seed):
    w = rng(seed).standard_normal(n)
    y = np.cumsum(w)
    y = highpass(y, 15, 1)
    return y / (np.std(y) + 1e-9)

def smooth_noise(dur, rate, seed, lo=0.0, hi=1.0):
    # なめらかに揺れる 0..1 の包絡（rate Hz 程度の変化）
    n = int(dur * SR)
    k = max(4, int(dur * rate) + 4)
    pts = rng(seed).uniform(lo, hi, k)
    x = np.linspace(0, k - 3, n)
    i = np.floor(x).astype(int); f = x - i
    f = f * f * (3 - 2 * f)
    return pts[i] * (1 - f) + pts[i + 1] * f

def pan(mono, p):
    # p: -1(左)..1(右) スカラーまたは配列
    p = np.clip(p, -1, 1)
    l = np.cos((p + 1) * np.pi / 4); r = np.sin((p + 1) * np.pi / 4)
    return np.stack([mono * l, mono * r], axis=1)

def stereo_wide(mono_l, mono_r):
    return np.stack([mono_l, mono_r], axis=1)

def reverb_ir(dur, decay, seed, lp=6000, pre=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    r = rng(seed)
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)], axis=1) * np.exp(-t / decay)[:, None]
    ir = lowpass(ir, lp, 1)
    if pre > 0:
        ir = np.vstack([np.zeros((int(pre * SR), 2)), ir])
    ir[0] += 0
    return ir / np.sqrt(np.sum(ir ** 2) / 2)

def convolve_st(x, ir, wet=0.3):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], axis=1)
    return x * (1 - wet) + y * wet

def db(x):
    return 10 ** (x / 20)

def place(buf, snd, at):
    i = int(at * SR)
    if i >= len(buf): return
    if snd.ndim == 1: snd = np.stack([snd, snd], axis=1)
    j = min(len(buf), i + len(snd))
    if i < 0:
        snd = snd[-i:]; i = 0
    buf[i:j] += snd[:j - i]

def sine_tone(freq, dur, amp=1.0, phase=0.0):
    t = t_axis(dur)
    return amp * np.sin(2 * np.pi * freq * t + phase)

def bell(freq, dur, seed=0, partials=((1, 1.0, 1.0), (2.76, 0.45, 0.6), (5.4, 0.25, 0.4), (8.93, 0.12, 0.25)), decay=1.2):
    t = t_axis(dur)
    y = np.zeros_like(t)
    for ratio, amp, dk in partials:
        y += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / (decay * dk))
    return fade(y, 0.002, 0.05)


# --- 仕上げ（ラウドネスとピーク） ---
def loudness(x):
    import pyloudnorm as pyln
    try:
        return pyln.Meter(SR).integrated_loudness(x if x.ndim == 2 else np.stack([x, x], 1))
    except Exception:
        return -70.0


def limiter(x, ceiling_db=-1.5, hold=0.08, smooth=0.04):
    """先読みリミッター：ピークの前後 hold 秒の最小ゲインを取り、smooth 秒でならす。
    ならしの幅が最小値の幅より狭いので、どのピークでも上限を超えない（行き過ぎなし）。"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    c = 10 ** (ceiling_db / 20)
    a = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    need = np.minimum(1.0, c / np.maximum(a, 1e-12))
    g = minimum_filter1d(need, size=int(hold * SR) | 1, mode='nearest')
    g = uniform_filter1d(g, size=int(smooth * SR) | 1, mode='nearest')
    g = np.minimum(g, need)  # 念のため
    return x * (g[:, None] if x.ndim == 2 else g)


def master(x, target=-14.0, ceiling_db=-2.5):
    """ラウドネスを target LUFS にそろえ、ピークを ceiling_db に抑える（2回くり返して合わせ込む）"""
    for _ in range(3):
        x = x * 10 ** ((target - loudness(x)) / 20)
        x = limiter(x, ceiling_db)
    return x
