#!/usr/bin/env python3
"""完成音声の区間ごとのスペクトログラム（dBFS、黒=静か→黄=大きい）＋白線=0.25秒ごとの音量。
耳で聞けない環境でも「どの帯域に何が鳴っているか」「急に大きくならないか」を目で確かめる。

  PROJ=作品フォルダ python3 spectro.py out/作品_audio.wav work/spectro.jpg            # 各パートの頭から30秒ずつ
  PROJ=作品フォルダ python3 spectro.py audio.wav out.jpg --seg "嵐:163:190" --seg "花火:233:263"
"""
import json, os, sys, wave, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("out"); ap.add_argument("--seg", action="append", default=[])
ap.add_argument("--len", type=float, default=30.0)
a = ap.parse_args()
w = wave.open(a.src); sr = w.getframerate(); n = w.getnframes(); ch = w.getnchannels()
x = np.frombuffer(w.readframes(n), np.int16).reshape(-1, ch).astype(np.float32).mean(1) / 32768
fp = os.path.join(ROOT, "assets/fonts/ShipporiMincho_400Regular.ttf")
font = ImageFont.truetype(fp, 16) if os.path.exists(fp) else ImageFont.load_default()
def mmss(t): return f"{int(t // 60)}:{int(t % 60):02d}"
segs = []
for sg in a.seg:
    name, s0, s1 = sg.rsplit(":", 2); segs.append((f"{mmss(float(s0))} {name}", float(s0), float(s1)))
if not segs:
    D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8")); seen = None
    for s in D["scenes"]:
        if s["part"] != seen:
            segs.append((f"{mmss(s['start'])} {s['part']}", s["start"], min(s["start"] + a.len, n / sr))); seen = s["part"]
def cmap(v):
    stops = np.array([[0, 0, 0], [20, 20, 90], [140, 30, 120], [240, 120, 40], [255, 240, 120]], np.float32)
    p = np.clip(v, 0, 1) * (len(stops) - 1); i = np.minimum(p.astype(int), len(stops) - 2); f = (p - i)[..., None]
    return (stops[i] * (1 - f) + stops[i + 1] * f).astype(np.uint8)
rows = []
nfft, hop = 2048, 512
win = np.hanning(nfft); norm = win.sum() / 2
fq = np.fft.rfftfreq(nfft, 1 / sr); rowsf = np.geomspace(60, 18000, 300)[::-1]; idx = np.searchsorted(fq, rowsf)
for name, s0, s1 in segs:
    y = x[int(s0 * sr):int(s1 * sr)]
    if len(y) < nfft * 2: continue
    fr = np.lib.stride_tricks.sliding_window_view(y, nfft)[::hop] * win
    S = 20 * np.log10(np.abs(np.fft.rfft(fr, axis=1)) / norm + 1e-9).T
    img = cmap((S[idx] + 105) / 85)
    Wd = 1200
    im = Image.fromarray(img).resize((Wd, 300))
    canvas = Image.new("RGB", (Wd + 60, 330), (0, 0, 0)); canvas.paste(im, (60, 24))
    d = ImageDraw.Draw(canvas); d.text((64, 3), name, fill=(255, 255, 0), font=font)
    for hz in (100, 1000, 4000, 10000):
        yy = 24 + int(np.argmin(np.abs(rowsf - hz))); d.text((2, yy - 8), f"{hz // 1000}k" if hz >= 1000 else f"{hz}", fill=(200, 200, 200), font=font)
    step = sr // 4
    rms = [20 * np.log10(np.sqrt(np.mean(y[i:i + step] ** 2)) + 1e-9) for i in range(0, len(y) - step + 1, step)]
    pts = [(60 + int(k * Wd / len(rms)), 24 + int(np.clip(-r_ * 5, 0, 299))) for k, r_ in enumerate(rms)]
    d.line(pts, fill=(255, 255, 255), width=2)
    rows.append(canvas)
sheet = Image.new("RGB", (1260, 330 * len(rows)), (0, 0, 0))
for k, r in enumerate(rows): sheet.paste(r, (0, 330 * k))
sheet.save(a.out, quality=85); print(a.out, sheet.size)
