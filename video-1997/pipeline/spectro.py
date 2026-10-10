#!/usr/bin/env python3
"""完成音声の区間ごとのスペクトログラム（dBFS、黒=静か→黄=大きい）＋白線=0.25秒ごとのRMS"""
import wave, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
src = sys.argv[1]; out = sys.argv[2]
w = wave.open(src); sr = w.getframerate(); n = w.getnframes()
x = np.frombuffer(w.readframes(n), np.int16).reshape(-1, 2).astype(np.float32).mean(1) / 32768
font = ImageFont.truetype("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", 16)
segs = [("0:00 プロローグ", 0, 31), ("0:31 タイトル〜電子ペット", 31, 61), ("2:11 縁側（オルゴール・風鈴・セミ）", 131, 161),
        ("2:51 嵐〜夕立〜軒下", 163, 190), ("3:25 5時のチャイム〜セリフ〜夕飯", 205, 236), ("3:53 祭り〜花火", 233, 263),
        ("5:15 別れのセリフ", 312, 332), ("6:01 電池〜モーター〜セリフ", 359, 375), ("6:53 余韻 縁側→模型店", 413, 473)]
def cmap(v):
    # 黒→紺→赤紫→橙→黄
    stops = np.array([[0, 0, 0], [20, 20, 90], [140, 30, 120], [240, 120, 40], [255, 240, 120]], np.float32)
    p = np.clip(v, 0, 1) * (len(stops) - 1); i = np.minimum(p.astype(int), len(stops) - 2); f = (p - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)
rows = []
nfft, hop = 2048, 512
win = np.hanning(nfft); norm = win.sum() / 2
fq = np.fft.rfftfreq(nfft, 1 / sr); rowsf = np.geomspace(60, 18000, 300)[::-1]; idx = np.searchsorted(fq, rowsf)
for name, a, b in segs:
    y = x[int(a * sr):int(b * sr)]
    fr = np.lib.stride_tricks.sliding_window_view(y, nfft)[::hop] * win
    S = 20 * np.log10(np.abs(np.fft.rfft(fr, axis=1)) / norm + 1e-9).T
    img = cmap((S[idx] + 105) / 85)
    W = 1200
    im = Image.fromarray(img).resize((W, 300))
    canvas = Image.new("RGB", (W + 60, 330), (0, 0, 0)); canvas.paste(im, (60, 24))
    d = ImageDraw.Draw(canvas); d.text((64, 3), name, fill=(255, 255, 0), font=font)
    for hz in (100, 1000, 4000, 10000):
        yy = 24 + int(np.argmin(np.abs(rowsf - hz))); d.text((2, yy - 8), f"{hz // 1000}k" if hz >= 1000 else f"{hz}", fill=(200, 200, 200), font=font)
    step = sr // 4
    rms = [20 * np.log10(np.sqrt(np.mean(y[i:i + step] ** 2)) + 1e-9) for i in range(0, len(y) - step + 1, step)]
    pts = [(60 + int(k * W / len(rms)), 24 + int(np.clip(-rms_ * 5, 0, 299))) for k, rms_ in enumerate(rms)]
    d.line(pts, fill=(255, 255, 255), width=2)
    rows.append(canvas)
sheet = Image.new("RGB", (1260, 330 * len(rows)), (0, 0, 0))
for k, r in enumerate(rows): sheet.paste(r, (0, 330 * k))
sheet.save(out, quality=85); print(out, sheet.size)
