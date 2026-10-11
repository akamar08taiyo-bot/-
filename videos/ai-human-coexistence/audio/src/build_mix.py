# 全体の音を組み立てる：Veo の音（半速に伸ばしたもの）＋合成した環境音・効果音 → mix_asmr.wav / ambience.wav
import json, sys
from pathlib import Path
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
sys.path.insert(0, str(Path(__file__).parent))
import sounds as S
from dsp import SR, fade, highpass, lowpass, master

root = Path(__file__).resolve().parents[2]
T = json.loads((root / 'src' / 'timeline.json').read_text())
XF = T['crossfade']; CLIP = T['clipLen']
meter = pyln.Meter(SR)

def lufs(x):
    try:
        return meter.integrated_loudness(x if x.ndim == 2 else np.stack([x, x], 1))
    except Exception:
        return -70.0

def norm_to(x, target):
    l = lufs(x)
    if not np.isfinite(l) or l < -65: return x
    return x * 10 ** ((target - l) / 20)

starts = []; s = 0.0
for sh in T['shots']:
    starts.append(s); s += sh['dur'] - XF
TOTAL = starts[-1] + T['shots'][-1]['dur']
N = int(round(TOTAL * SR))
amb = np.zeros((N, 2))

def put(buf, snd, at):
    i = int(round(at * SR)); a = max(0, -i); i = max(0, i)
    j = min(len(buf), i + len(snd) - a)
    if j > i: buf[i:j] += snd[a:a + j - i]

BEDS = {  # 名前: (生成関数, 目標ラウドネス LUFS)
    'night_sea_calm': (lambda d, k: S.waves(d, seed=k, calm=True, period=(6, 9), bright=2200), -29),
    'pier_lapping': (lambda d, k: S.waves(d, seed=k + 7, calm=True, period=(3.5, 5.5), bright=2600), -36),
    'harbor_morning': (lambda d, k: S.waves(d, seed=k, calm=True, period=(5, 8), bright=2400), -36),
    'morning_birds': (lambda d, k: S.birds(d, seed=k, density=0.45), -36),
    'broom_sweep': (lambda d, k: S.broom(d, seed=k), -35),
    'ferry_deck': (lambda d, k: S.engine_putt(d, seed=k) + S.waves(d, seed=k + 3, period=(3, 5)), -28),
    'wind_sea': (lambda d, k: S.wind(d, seed=k, strength=1.0), -34),
    'onsen_steam': (lambda d, k: S.steam_hiss(d, seed=k), -38),
    'shop_street_day': (lambda d, k: S.crowd(d, seed=k, far=True, density=0.9), -40),
    'workshop': (lambda d, k: S.clock_tick(d, seed=k), -44),
    'cicadas_strong': (lambda d, k: S.cicadas(d, 'minmin', seed=k), -33),
    'cicadas_far': (lambda d, k: S.cicadas(d, 'minmin', seed=k, far=True), -38),
    'cicadas_outside': (lambda d, k: S.cicadas(d, 'minmin', seed=k, far=True), -38),
    'rooftop_wind': (lambda d, k: S.wind(d, seed=k, strength=0.8), -31),
    'distant_sea': (lambda d, k: S.waves(d, seed=k, calm=True, period=(6, 9), bright=2000), -35),
    'clock_tick': (lambda d, k: S.clock_tick(d, seed=k), -36),
    'higurashi': (lambda d, k: S.higurashi(d, seed=k), -33),
    'insects_start': (lambda d, k: S.suzumushi(d, seed=k, count=2), -38),
    'insects': (lambda d, k: S.suzumushi(d, seed=k, count=4), -35),
    'crickets': (lambda d, k: S.suzumushi(d, seed=k, count=4), -34),
    'insects_fade': (lambda d, k: S.suzumushi(d, seed=k, count=3), -36),
    'rain_after': (lambda d, k: S.drips(d, seed=k), -34),
    'dusk_bay': (lambda d, k: S.waves(d, seed=k, calm=True, period=(5.5, 8.5), bright=2300), -28),
    'town_murmur_far': (lambda d, k: S.crowd(d, seed=k, far=True, density=0.8), -38),
    'festival_stalls': (lambda d, k: S.crowd(d, seed=k, far=True, density=1.3), -27),
    'festival_music_far': (lambda d, k: S.drums_far(d, str(Path(__file__).parent / 'e2_taiko.wav'), seed=k), -30),
    'festival_crowd_soft': (lambda d, k: S.crowd(d, seed=k, far=True, density=1.0), -34),
    'night_sea': (lambda d, k: S.waves(d, seed=k, calm=True, period=(6, 9), bright=2200), -32),
}
def load_wav(path):
    from math import gcd
    from scipy.signal import resample_poly
    x, sr = sf.read(path)
    if x.ndim == 1: x = np.stack([x, x], 1)
    if sr != SR:
        g = gcd(SR, sr); x = resample_poly(x, SR // g, sr // g, axis=0)
    return x

EVENTS = {  # 名前: (生成関数, 目標 LUFS)
    'outro_voice': (lambda: load_wav(Path(__file__).parent / 'outro' / 'Algieba_cut.wav'), -21),
    'foghorn': (lambda: S.foghorn2(), -30),
    'town_chime': (lambda: S.town_chime(), -24),
    'ferry_horn': (lambda: S.ferry_horn(), -31),
    'robot_pi': (lambda: S.robot_pi(), -27),
    'watering': (lambda: S.watering(7.0), -33),
    'holo_on': (lambda: S.holo_on2(), -29),
    'stamp': (lambda: S.stamp(), -27),
}

def env_eq(n, fin, fout):
    # 等パワー（sin/cos）のフェード：重なった所で音量がへこまない
    e = np.ones(n)
    a = min(n, int(fin * SR)); b = min(n, int(fout * SR))
    if a: e[:a] = np.sin(np.linspace(0, np.pi / 2, a))
    if b: e[-b:] *= np.cos(np.linspace(0, np.pi / 2, b))
    return e[:, None]

def env_xf(n, fin, fout):
    e = np.ones(n)
    a = int(fin * SR); b = int(fout * SR)
    if a: e[:a] = np.linspace(0, 1, a) ** 1.0
    if b: e[-b:] *= np.linspace(1, 0, b) ** 1.0
    return e[:, None]

log = []
for k, (sh, st) in enumerate(zip(T['shots'], starts)):
    dur = sh['dur']; first = k == 0; last = k == len(T['shots']) - 1
    fin = 2.5 if first else XF; fout = 3.0 if last else XF
    # Veo の音
    g = sh.get('audio', {}).get('veo', 1.0)
    vp = root / 'work' / 'veoaudio' / f"{sh['id']}.wav"
    if g > 0 and vp.exists():
        v, sr = sf.read(vp)
        if v.ndim == 1: v = np.stack([v, v], 1)
        v = highpass(v, 30, 2)
        if sh['audio'].get('veo_lp'):
            v = lowpass(v, sh['audio']['veo_lp'], 4)  # 耳に刺さる高音を削る
        v = norm_to(v, -24) * g
        seg = np.zeros((int(dur * SR), 2))
        at = sh.get('clipAt', 0.0)
        i = int(at * SR); j = min(len(seg), i + len(v)); seg[i:j] += v[:j - i]
        if sh.get('hold') == 'reverse':
            rv = v[::-1]; i2 = i + len(v) - int(1.0 * SR)
            xf = np.linspace(0, 1, int(1.0 * SR))[:, None]
            rv = rv.copy(); rv[:len(xf)] *= xf
            j2 = min(len(seg), i2 + len(rv)); seg[i2:j2] += rv[:j2 - i2]
            seg[i2:i2 + len(xf)] *= 1  # 前半はそのまま
        if at > 0:
            seg[:i] += 0  # クリップ前は環境音のみ
        put(amb, seg * env_eq(len(seg), 2.5 if first else 2.0, 3.0 if last else 2.0), st)
        log.append((sh['id'], 'veo', round(lufs(v), 1)))
    # 環境音ベッド
    for b, name in enumerate(sh.get('audio', {}).get('beds', [])):
        fn, target = BEDS[name]
        pre = 0.0 if first else 1.0; post = 0.0 if last else 1.0
        L = dur + pre + post
        bed = fn(L + 0.5, 100 * k + b)[:int(L * SR)]
        bed = norm_to(bed, target + sh.get('audio', {}).get('bed_gain', 0))  # bed_gain：そのカットだけ環境音を持ち上げる（dB）
        if name == 'insects_fade':
            bed *= np.clip(np.linspace(1.4, -0.2, len(bed)), 0, 1)[:, None]
        put(amb, bed * env_eq(len(bed), 2.5 if first else XF + 2 * pre, 3.0 if last else XF + 2 * post), st - pre)
        log.append((sh['id'], name, target))
    # イベント
    for ev in sh.get('events', []):
        if ev['type'] == 'chalk':  # 黒板のチョークの音（文字数ぶん）
            put(amb, norm_to(S.chalk(ev.get('n', 10), seed=int(ev['t'] * 10)), -33 + ev.get('gain', 0)), st + ev['t'])
            continue
        if ev['type'] not in EVENTS: continue
        fn, target = EVENTS[ev['type']]
        snd = norm_to(fn(), target + ev.get('gain', 0))
        put(amb, snd, st + ev['t'])
    for h in sh.get('holo', []):
        fn, target = EVENTS['holo_on']
        put(amb, norm_to(fn(), target), st + h['t0'] + 0.05)

amb = highpass(amb, 25, 2)
out_dir = root / 'audio' / 'out'; out_dir.mkdir(parents=True, exist_ok=True)
sf.write(out_dir / 'ambience.wav', amb.astype(np.float32), SR)

mix = master(amb, target=float(sys.argv[1]) if len(sys.argv) > 1 else -16.0)  # ASMR 版は少し控えめ（-16 LUFS）
sf.write(out_dir / 'mix_asmr.wav', mix.astype(np.float32), SR, subtype='FLOAT')
print('total', round(TOTAL, 2), 's; ambience LUFS', round(lufs(amb), 1), '-> mix', round(lufs(mix), 1), 'peak', round(20 * np.log10(np.max(np.abs(mix))), 2), 'dBFS')
for row in log: pass
