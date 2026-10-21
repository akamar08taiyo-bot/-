"""音の部品（効果音・BGM 用）。numpy だけで作る。すべて 48kHz。"""
import numpy as np

SR = 48000


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    e = np.minimum(t / max(a, 1e-4), 1.0) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-4))
    return e


def noise(n, seed=0):
    return np.random.default_rng(seed).standard_normal(n)


def fft_filter(x, lo=None, hi=None, slope=6.0):
    """周波数領域で帯域を切る（なだらかな肩）。lo/hi は Hz"""
    n = len(x)
    N = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, N)
    f = np.fft.rfftfreq(N, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * slope / 6))
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** (2 * slope / 6))
    return np.fft.irfft(X * g, N)[:n]


def convolve(x, h):
    n = len(x) + len(h) - 1
    N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[:n]


def reverb_ir(dur=1.4, decay=0.45, seed=7, lo=200, hi=7000):
    n = int(dur * SR)
    t = np.arange(n) / SR
    h = noise(n, seed) * np.exp(-t / decay)
    h = fft_filter(h, lo=lo, hi=hi)
    h[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return h / np.sqrt(np.sum(h ** 2))


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pluck(f, dur=1.2, bright=1.0, seed=0):
    """ウクレレ／ピチカート風（倍音ごとに減衰を変える）"""
    t = t_(dur)
    y = np.zeros_like(t)
    rng = np.random.default_rng(seed)
    for k in range(1, 12):
        fk = f * k * (1 + 0.0007 * k * k)
        if fk > 16000:
            break
        amp = (1 / k ** 1.15) * (bright ** (k - 1))
        y += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t * (2.2 + 1.6 * k))
    y *= np.minimum(t / 0.003, 1)
    return y


def epiano(f, dur=2.0, vel=1.0):
    """ローズ風（FM）"""
    t = t_(dur)
    idx = 1.6 * vel * np.exp(-t * 3.5)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    y += 0.18 * np.sin(2 * np.pi * f * 7.0 * t) * np.exp(-t * 14)  # 打鍵のきらめき
    y *= np.exp(-t * 1.1) * np.minimum(t / 0.004, 1)
    return y


def glock(f, dur=1.5):
    t = t_(dur)
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) \
        + 0.12 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 12)
    return y * np.exp(-t * 2.6) * np.minimum(t / 0.002, 1)


def bass(f, dur=0.6):
    t = t_(dur)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    e = np.minimum(t / 0.008, 1) * np.exp(-t * 2.2)
    rel = int(0.06 * SR)
    e[-rel:] *= np.linspace(1, 0, rel)
    return np.tanh(1.3 * y * e) * 0.8


def kick(dur=0.35):
    t = t_(dur)
    f = 48 + 90 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * np.minimum(t / 0.002, 1)


def snap(dur=0.22, seed=3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = fft_filter(noise(n, seed), lo=900, hi=6000) * np.exp(-t * 26)
    x += 0.3 * np.sin(2 * np.pi * 210 * t) * np.exp(-t * 30)
    return x / (np.abs(x).max() + 1e-9)


def shaker(dur=0.09, seed=5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = fft_filter(noise(n, seed), lo=5000, hi=12000) * np.minimum(t / 0.01, 1) * np.exp(-t * 45)
    return x / (np.abs(x).max() + 1e-9)


def place(buf, x, at, gain=1.0, pan=0.0):
    """stereo buf (2, N) の at 秒に x を置く。pan -1..1"""
    i = int(round(at * SR))
    if i < 0:
        x, i = x[-i:], 0
    if i >= buf.shape[1] or len(x) == 0:
        return
    j = min(buf.shape[1], i + len(x))
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += gain * l * x[: j - i]
    buf[1, i:j] += gain * r * x[: j - i]
