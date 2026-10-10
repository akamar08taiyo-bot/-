#!/usr/bin/env python3
"""音のミックス：BGM・環境音・効果音・セリフを scenes.json の時刻どおりに並べ、-14 LUFS に整える。

  python3 pipeline/mix.py            → work/mix_raw.wav, out/電池の夏_audio.wav
"""
import json, os, sys, subprocess, wave, re, hashlib
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sfx
from sfx import SR, rng, fade, place, reverb, lp, hp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
SC = D["scenes"]; TOTAL = D["total"]
N = int((TOTAL + 1.0) * SR)

MUSIC = {"M0": "M0.mp3", "M1": "M1.mp3", "M2": "M2_box.wav", "M3": "M3.mp3", "M4": "M4.mp3", "M5": "M5_amb.wav"}
VOICE = {"L1": "L1_raw.wav", "L3": "L3_raw.wav", "L4": "L4_raw.wav"}
# 区間ごとの音量（dB, 基準に対して）
MUSIC_GAIN = {"M0": -1.0, "M1": 0.0, "M2": -1.5, "M3": 0.0, "M4": 0.0, "M5": -6.0}
AMB_GAIN_STORY = -1.0
AMB_GAIN_AFTER = +4.0

def db(x): return 10 ** (x / 20)

def decode(path):
    """ffmpeg で 48kHz ステレオ float に"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)

def kweight_rms_db(x):
    """K特性に近い重み（高域少し強調・低域カット）でのRMS"""
    y = hp(x, 100, 2)
    return 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-12)

def seed_of(*a):
    return int(hashlib.md5("/".join(map(str, a)).encode()).hexdigest()[:8], 16)

def scene_end(i):
    return SC[i + 1]["start"] if i + 1 < len(SC) else TOTAL

def xfade_after(i):
    return SC[i + 1]["xfade"] if i + 1 < len(SC) else 2.0

def is_after(i):
    return SC[i]["part"] == "余韻"

# ───────── BGM ─────────
def music_bus():
    bus = np.zeros((N, 2))
    runs = []
    i = 0
    while i < len(SC):
        k = SC[i]["bgm"]; j = i
        while j + 1 < len(SC) and SC[j + 1]["bgm"] == k: j += 1
        if k: runs.append((k, i, j))
        i = j + 1
    report = []
    for (k, a, b) in runs:
        t0 = SC[a]["start"]; t1 = scene_end(b)
        x = decode(os.path.join(ROOT, "assets/music", MUSIC[k]))
        # 曲の音量をそろえる（K重みRMS -24dB）
        x = x * db(-24 - kweight_rms_db(x)) * db(MUSIC_GAIN.get(k, 0))
        if k == "M0":
            seg = fade(x, 0.4, 2.5)  # 30秒の小品を最後まで（自然に終わらせる）
            place(bus, seg, int((t0 + 0.6) * SR))
            report.append((k, t0 + 0.6, t0 + 0.6 + len(seg) / SR)); continue
        tail = 3.5
        if k == "M1":  # タイトルの白い転換の手前から重ねて、無音の谷を浅く
            t0 -= 1.2
        need = int((t1 - t0 + tail) * SR)
        if len(x) < need:  # 足りなければ4秒のクロスフェードでつなぐ
            reps = [x]
            while sum(len(r) for r in reps) < need + 4 * SR: reps.append(x)
            y = reps[0]
            for r in reps[1:]:
                c = 4 * SR
                y = np.concatenate([y[:-c], y[-c:] * np.linspace(1, 0, c)[:, None] + r[:c] * np.linspace(0, 1, c)[:, None], r[c:]])
            x = y
        seg = x[:need]
        fi = 4.0 if k in ("M1", "M5") else 3.0
        seg = fade(seg, fi, 4.0)
        place(bus, seg, int(t0 * SR))
        report.append((k, t0, t1 + tail))
    return bus, report

# ───────── 環境音 ─────────
def amb_bus():
    bus = np.zeros((N, 2))
    names = sorted({n for s in SC for n in s["amb"]})
    count = 0
    for name in names:
        i = 0
        while i < len(SC):
            if name not in SC[i]["amb"]: i += 1; continue
            j = i
            while j + 1 < len(SC) and name in SC[j + 1]["amb"]: j += 1
            t0 = SC[i]["start"]; t1 = scene_end(j)
            fin = SC[i]["xfade"] if i > 0 else 1.5
            fout = xfade_after(j)
            dur = (t1 - t0) + fout + 0.2
            x = sfx.AMB[name](dur, seed_of(name, SC[i]["id"]))
            g = AMB_GAIN_AFTER if is_after(i) else AMB_GAIN_STORY
            x = fade(x.astype(np.float64), fin, fout) * db(g)
            place(bus, x, int(t0 * SR))
            count += 1
            i = j + 1
    return bus, count

# ───────── 効果音 ─────────
def sfx_bus():
    bus = np.zeros((N, 2))
    n = 0
    for s in SC:
        for (name, off, g) in s["sfx"]:
            x = sfx.ONE[name](rng(seed_of(name, s["id"], off)))
            x = x.astype(np.float64) * db(g + 12)
            place(bus, x, int((s["start"] + off) * SR))
            n += 1
    return bus, n

# ───────── セリフ ─────────
def load_voice(path):
    x = decode(path)[:, 0]
    # 前後の無音を切る（-45dB）
    env = np.convolve(np.abs(x), np.ones(480) / 480, mode="same")
    on = np.where(env > db(-56))[0]
    x = x[max(0, on[0] - 12000): min(len(x), on[-1] + 9600)] if len(on) else x
    x = hp(x, 90, 2)
    x = x * db(-20 - 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12))
    return x

def voice_bus():
    bus = np.zeros((N, 2)); spans = []
    for s in SC:
        lid = s.get("line")
        if not lid or lid not in VOICE: continue
        info = D["lines"][lid]
        v = load_voice(os.path.join(ROOT, "assets/voice", VOICE[lid]))
        st = np.stack([v, v], axis=1) * 0.92
        st = reverb(st, 0.6 if lid == "L4" else 0.9, 0.12 if lid == "L4" else 0.16, damp=6000)
        t = s["start"] + info["at"]
        place(bus, st, int(t * SR))
        spans.append((lid, t, t + len(v) / SR, info["who"], info["text"]))
    return bus, spans

def duck_env(spans, depth_db, pre=0.35, post=0.6, ramp=0.3):
    g = np.zeros(N)
    for (_, a, b, *_r) in spans:
        i0 = int((a - pre - ramp) * SR); i1 = int((a - pre) * SR); i2 = int((b + post) * SR); i3 = int((b + post + ramp) * SR)
        i0 = max(0, i0)
        g[i0:i1] = np.maximum(g[i0:i1], np.linspace(0, 1, max(1, i1 - i0))[: i1 - i0])
        g[i1:i2] = 1
        g[i2:i3] = np.maximum(g[i2:i3], np.linspace(1, 0, max(1, i3 - i2))[: i3 - i2])
    return db(depth_db * g)[:, None]

def leveler(x, t_after, amount=0.5, max_cut=7.0, max_boost=4.0, win=3.0, smooth=2.5):
    """ゆっくり効く音量の平準化：3秒窓のラウドネスが目標より大きい所は差の半分だけ下げ、小さい所は少し上げる。
    物語パートと余韻パートで目標を分ける（余韻は2dB静かに）。"""
    k = hp(x, 100, 2).mean(axis=1) ** 2
    cs = np.concatenate([[0.0], np.cumsum(k)])
    n = len(k); h = int(win * SR / 2)
    idx = np.arange(n)
    lo = np.clip(idx - h, 0, n); hi = np.clip(idx + h, 0, n)
    L = 10 * np.log10((cs[hi] - cs[lo]) / np.maximum(hi - lo, 1) + 1e-12)
    ia = int(t_after * SR)
    valid = L > -70
    tgt_story = np.median(L[:ia][valid[:ia]]); tgt_after = tgt_story - 2.0
    tgt = np.where(idx < ia, tgt_story, tgt_after)
    g = np.clip((tgt - L) * amount, -max_cut, max_boost)
    g[~valid] = 0.0
    # 2.5秒の移動平均でなめらかに
    cg = np.concatenate([[0.0], np.cumsum(g)]); h2 = int(smooth * SR / 2)
    lo2 = np.clip(idx - h2, 0, n); hi2 = np.clip(idx + h2, 0, n)
    g = (cg[hi2] - cg[lo2]) / np.maximum(hi2 - lo2, 1)
    return x * (10 ** (g / 20))[:, None], (round(float(tgt_story), 1), round(float(g.min()), 1), round(float(g.max()), 1))

def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())

def ebur128(path):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    summ = r[r.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    LRA = float(re.search(r"LRA:\s+(-?[\d.]+) LU", summ).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1))
    return I, LRA, TP

def limiter(x, ceiling_db=-1.5, release=0.08):
    """先読み付きの簡易ピークリミッター（サンプルピーク基準＋4倍オーバーサンプリングの近似は ffmpeg で確認）"""
    c = db(ceiling_db)
    pk = np.max(np.abs(x), axis=1)
    need = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    # 先読み 5ms の最小値フィルタ＋なめらかな戻り
    la = int(0.005 * SR)
    from scipy.ndimage import minimum_filter1d
    padded = np.concatenate([need, np.ones(la)])
    g = minimum_filter1d(padded, size=la + 1, origin=-(la // 2))[: len(need)]
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g); cur = 1.0
    # 戻りだけ遅くする（ブロック処理で近似）
    B = 256
    for k in range(0, len(g), B):
        blk = g[k:k + B]
        m = blk.min()
        cur = min(m, cur * (a ** B) + (1 - a ** B) * 1.0) if m < cur else cur + (min(1.0, m) - cur) * (1 - a ** B)
        out[k:k + B] = np.minimum(blk, cur)
    return x * out[:, None]

def cached(name, fn, key):
    h = hashlib.md5(json.dumps(key, sort_keys=True).encode() + open(os.path.join(ROOT, "pipeline/sfx.py"), "rb").read()).hexdigest()[:12]
    p = os.path.join(ROOT, "work", f"bus_{name}_{h}.npy")
    if os.path.exists(p):
        return np.load(p), "cache"
    x, info = fn()
    np.save(p, x.astype(np.float32))
    return x, info

def main():
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    mus, mrep = music_bus(); print("music runs:", [(k, round(a, 1), round(b, 1)) for k, a, b in mrep])
    amb, na = cached("amb", amb_bus, [(s["id"], s["start"], s["dur"], s["xfade"], s["amb"], s["part"]) for s in SC] + [AMB_GAIN_STORY, AMB_GAIN_AFTER]); print("ambience segments:", na)
    fxb, nf = cached("sfx", sfx_bus, [(s["id"], s["start"], s["sfx"]) for s in SC]); print("one-shots:", nf)
    voc, spans = voice_bus(); print("lines:", [(l, round(a, 2), round(b, 2)) for l, a, b, *_ in spans])
    mix = mus * duck_env(spans, -7) + amb * duck_env(spans, -4) + fxb * duck_env(spans, -5) + voc
    mix = hp(mix, 28, 2)
    t_after = next(s_["start"] for s_ in SC if s_["part"] == "余韻")
    mix, linfo = leveler(mix, t_after); print("leveler (target, min gain, max gain):", linfo)
    raw = os.path.join(ROOT, "work/mix_raw.wav")
    pk = np.max(np.abs(mix)); pre = 0.5 / pk if pk > 0.5 else 1.0
    write_wav(raw, mix * pre)
    I, LRA, TP = ebur128(raw)
    print(f"raw: I={I} LUFS LRA={LRA} TP={TP}")
    gain = db(-14.0 - I) * pre
    out = limiter(mix * gain, -3.0)
    final = os.path.join(ROOT, "out/電池の夏_audio.wav")
    write_wav(final, out)
    I2, LRA2, TP2 = ebur128(final)
    print(f"final: I={I2} LUFS LRA={LRA2} TP={TP2}")
    json.dump(dict(music=mrep, lines=spans, loud=dict(I=I2, LRA=LRA2, TP=TP2)), open(os.path.join(ROOT, "work/mix_report.json"), "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
