#!/usr/bin/env python3
"""Lyria で作れなかった区間の BGM を、コードで作曲・合成する（オリジナル曲。権利の心配がない）。

  PROJ=作品フォルダ python3 synth_music.py --box M2 --amb M5 [--amb-len 320]
    → assets/music/M2_box.wav（オルゴール。ト長調・84BPM・16小節×2）
    → assets/music/M5_amb.wav（アンビエントピアノ。ヘ長調・8秒ごとの和音・まばらな旋律）
mix.py は、その区間の Lyria の曲（M2.mp3 など）がなければ <キー>_*.wav を使う。
"""
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sfx import SR, reverb, lp, hp, rng, place, norm_rms, fade

HERE = os.path.dirname(os.path.abspath(__file__))
# 作品フォルダ（scenes.json・assets・out・work がある所）。環境変数 PROJ で切り替え
ROOT = os.environ.get("PROJ") or os.getcwd()
NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}

def hz(name):
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((NOTE[n] + 12 * (o + 1) - 69) / 12)

def wr(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())

# ───────── オルゴール ─────────
def tine(f, vel, r):
    d = max(1.2, 3.2 - (f - 400) / 900)
    L = int(d * SR); t = np.arange(L) / SR
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / (d * 0.33))
         + 0.12 * np.sin(2 * np.pi * 2.0 * f * t) * np.exp(-t / (d * 0.18))
         + 0.22 * np.sin(2 * np.pi * 4.07 * f * t + 0.3) * np.exp(-t / (d * 0.06))
         + 0.06 * np.sin(2 * np.pi * 6.3 * f * t) * np.exp(-t / (d * 0.03)))
    click = hp(r.standard_normal(int(0.004 * SR)), 3000) * 0.08
    s[:len(click)] += click
    return s * vel * np.minimum(1, t / 0.0015)

MEL = [  # 小節ごとの旋律（4拍、"-"=のばす "."=休み）
    ["B5", ".", "A5", "G5"], ["F#5", "-", "-", "."], ["G5", ".", "F#5", "E5"], ["E5", "-", "D5", "."],
    ["D5", ".", "G5", "B5"], ["A5", "-", "G5", "E5"], ["F#5", ".", "E5", "D5"], ["D5", "-", "-", "."],
    ["E5", ".", "G5", "C6"], ["B5", "-", "A5", "G5"], ["A5", ".", "C6", "B5"], ["A5", "-", "-", "."],
    ["G5", ".", "B5", "E6"], ["D6", "-", "C6", "B5"], ["A5", ".", "G5", "F#5"], ["G5", "-", "-", "."],
]
CHD = [["G3", "D4", "G4", "B4"], ["D3", "A3", "D4", "F#4"], ["E3", "B3", "E4", "G4"], ["C3", "G3", "C4", "E4"],
       ["G3", "D4", "G4", "B4"], ["A3", "E4", "A4", "C5"], ["D3", "A3", "D4", "F#4"], ["D3", "A3", "D4", "F#4"],
       ["C3", "G3", "C4", "E4"], ["B2", "D4", "G4", "B4"], ["A3", "E4", "A4", "C5"], ["D3", "A3", "D4", "F#4"],
       ["E3", "B3", "E4", "G4"], ["C3", "G3", "C4", "E4"], ["D3", "A3", "D4", "F#4"], ["G3", "D4", "G4", "B4"]]

def music_box(bpm=84, loops=2, seed=7):
    r = rng(seed)
    beat = 60 / bpm; bar = beat * 4
    total = bar * 16 * loops + 4
    out = np.zeros((int(total * SR), 2))
    for lp_i in range(loops):
        for b in range(16):
            t0 = (lp_i * 16 + b) * bar
            ch = CHD[b]
            arp = [ch[0], ch[1], ch[2], ch[3], ch[2], ch[1], ch[2], ch[3]]
            for k, nm in enumerate(arp):
                sw = 0.02 * beat if k % 2 else 0  # ほんの少し揺らす
                v = 0.32 if k == 0 else 0.2
                place(out, np.stack([tine(hz(nm), v * r.uniform(0.85, 1.1), r)] * 2, axis=1) * [1.0, 0.85], int((t0 + k * beat / 2 + sw) * SR))
            for k, nm in enumerate(MEL[b]):
                if nm in ("-", "."): continue
                f = hz(nm) * (2 if lp_i == 1 and b >= 8 else 1)  # 2回目の後半は1オクターブ上
                place(out, np.stack([tine(f, 0.42 * r.uniform(0.9, 1.05), r)] * 2, axis=1) * [0.85, 1.0], int((t0 + k * beat + r.uniform(0, 0.012)) * SR))
    # ぜんまいの小さな機械音
    mech = hp(r.standard_normal(len(out)), 2000) * 0.004
    out += np.stack([mech, mech], axis=1)
    out = reverb(out, 1.4, 0.32, damp=7000)
    return norm_rms(fade(out, 0.05, 4.0), -22)

# ───────── アンビエントピアノ ─────────
def piano_note(f, vel, r, dur=6.0):
    L = int(dur * SR); t = np.arange(L) / SR
    s = np.zeros(L); B = 0.00035
    for n in range(1, 9):
        fn = n * f * np.sqrt(1 + B * n * n)
        if fn > 9000: break
        a = np.exp(-0.62 * (n - 1)) * (1.0 if n == 1 else 0.9)
        tau = 2.6 / (1 + 0.35 * (n - 1)) * (440 / max(f, 110)) ** 0.25
        det = 1 + r.uniform(-0.0006, 0.0006)
        s += a * (np.sin(2 * np.pi * fn * t) + 0.6 * np.sin(2 * np.pi * fn * det * t)) * np.exp(-t / tau)
    ham = lp(r.standard_normal(int(0.02 * SR)), 1800) * 0.05
    s[:len(ham)] += ham
    s *= np.minimum(1, t / 0.006) * vel
    return lp(s, 3800 + 1500 * vel, 2)

def pad(freqs, dur, r):
    L = int(dur * SR); t = np.arange(L) / SR
    s = np.zeros(L)
    for f in freqs:
        for det in (-0.12, 0.0, 0.13):
            s += np.sin(2 * np.pi * (f + det) * t + r.uniform(0, 6)) * 0.33
    env = np.minimum(1, t / 2.5) * np.minimum(1, (dur - t) / 3.0).clip(0, 1)
    return lp(s * env, 1200, 2)

AMB_CH = [["F2", "A3", "C4", "E4"], ["A2", "E3", "G3", "C4"], ["Bb2", "D3", "F3", "A3"], ["C3", "E3", "G3", "D4"],
          ["D3", "F3", "A3", "C4"], ["Bb2", "F3", "A3", "D4"], ["G2", "Bb3", "D4", "F4"], ["C3", "F3", "G3", "C4"]]
AMB_MEL = [["A4", "C5", "E5", "F5"], ["G4", "C5", "E5", "A4"], ["F4", "A4", "D5", "C5"], ["G4", "D5", "E5", "C5"],
           ["F4", "A4", "C5", "D5"], ["F4", "A4", "D5", "Bb4"], ["F4", "G4", "Bb4", "D5"], ["E4", "G4", "C5", "F4"]]

def ambient(total=320.0, chord_len=8.0, seed=11):
    r = rng(seed)
    out = np.zeros((int((total + 8) * SR), 2))
    k = 0; t = 0.0
    while t < total:
        ci = k % len(AMB_CH)
        ch = AMB_CH[ci]
        p = pad([hz(n) for n in ch[1:]], chord_len + 3.0, r) * 0.045
        place(out, np.stack([p, p], axis=1), int(t * SR))
        bass = hp(piano_note(hz(ch[0]) * 2, 0.15, r, 7.0), 120, 2)  # 低音は1オクターブ上げて弱く（落ち着かせる）
        place(out, np.stack([bass * 0.9, bass], axis=1), int((t + 0.05) * SR))
        # まばらな旋律：1和音に2〜3音
        times = sorted(r.uniform(0.8, chord_len - 1.0, int(r.integers(2, 4))))
        for j, tt in enumerate(times):
            nm = AMB_MEL[ci][int(r.integers(0, 4))]
            nt = piano_note(hz(nm), r.uniform(0.16, 0.26), r, 6.0)
            pn = r.uniform(-0.35, 0.35)
            place(out, np.stack([nt * (1 - pn), nt * (1 + pn)], axis=1) * 0.8, int((t + tt) * SR))
        t += chord_len; k += 1
    out = reverb(out, 2.4, 0.42, damp=5000)
    out = hp(out, 70, 2)
    # 音量の上下を小さく（ゆっくりしたコンプレッサー）
    pw = (out ** 2).mean(axis=1)
    cs = np.concatenate([[0.0], np.cumsum(pw)])
    h = SR // 2
    lo = np.clip(np.arange(len(pw)) - h, 0, len(pw)); hi = np.clip(np.arange(len(pw)) + h, 0, len(pw))
    env = np.sqrt((cs[hi] - cs[lo]) / np.maximum(hi - lo, 1)) + 1e-6  # 1秒の移動平均（累積和で）
    target = np.median(env)
    g = np.clip((target / env) ** 0.5, 0.5, 1.6)
    out = out * g[:, None]
    return norm_rms(fade(out, 2.0, 8.0), -26)

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument("--box", help="オルゴールを使う区間のキー（例 M2）"); ap.add_argument("--amb", help="アンビエントピアノの区間のキー（例 M5）")
    ap.add_argument("--amb-len", type=float, default=320.0, help="アンビエントの長さ（秒）")
    a = ap.parse_args()
    if not (a.box or a.amb): ap.error("--box か --amb を指定してください")
    os.makedirs(os.path.join(ROOT, "assets/music"), exist_ok=True)
    if a.box:
        m2 = music_box()
        wr(os.path.join(ROOT, f"assets/music/{a.box}_box.wav"), m2)
        print(f"{a.box}_box", len(m2) / SR, "s")
    if a.amb:
        m5 = ambient(total=a.amb_len)
        wr(os.path.join(ROOT, f"assets/music/{a.amb}_amb.wav"), m5)
        print(f"{a.amb}_amb", len(m5) / SR, "s")
