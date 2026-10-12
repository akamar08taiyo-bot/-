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
    # 第二章で足したもの
    'sand_rise': (lambda d, k: S.sand(d, seed=k) + S.wind(d, seed=k + 1, strength=1.2), -30),  # 砂が舞い上がる（だんだん強く）
    'sand_fall': (lambda d, k: S.sand(d, seed=k) + S.wind(d, seed=k + 1, strength=1.2), -30),  # 砂がおさまる（はじめだけ）
    'siphon': (lambda d, k: S.siphon(d, seed=k), -40),
    'cafe_room': (lambda d, k: S.crowd(d, seed=k, far=True, density=0.35) + S.clock_tick(d, seed=k + 2) * 0.3, -41),
    'kids_far': (lambda d, k: S.kids(d, seed=k), -38),
    'sparkler': (lambda d, k: S.sparkler(d, seed=k), -34),
    # 人の声（せりふにはしない。短く切って重ねた、聞き取れない話し声と笑い声：sounds.py の chatter／kids_play）
    'shop_voices': (lambda d, k: S.chatter(d, seed=k, kind='adult', density=0.8, far=False, laughs=1.5), -39),  # 店の中の話し声
    'workers_chat': (lambda d, k: S.chatter(d, seed=k, kind='adult', density=0.55, far=True, laughs=3.0), -38),  # 職人たちの話し声と笑い
    'town_voices': (lambda d, k: S.chatter(d, seed=k, kind='mixed', density=0.6, far=True, laughs=1.5), -41),  # 遠くの話し声
    'kids_play': (lambda d, k: S.kids_play(d, seed=k, density=1.1, laughs=5.0, far=True), -37),  # 遊んでいる子どもたち（遠く）
    'kids_near': (lambda d, k: S.kids_play(d, seed=k, density=1.5, laughs=9.0, far=False), -32),  # すぐそばではしゃぐ子どもたち
    'classroom': (lambda d, k: S.chatter(d, seed=k, kind='kids', density=0.7, far=True, laughs=1.5), -39),  # 教室のざわめき
    'pier_crowd': (lambda d, k: S.chatter(d, seed=k, kind='mixed', density=1.2, far=True, laughs=0.5), -37),  # 桟橋の見送りの人たち
    'festival_voices': (lambda d, k: S.chatter(d, seed=k, kind='mixed', density=1.5, far=True, laughs=5.0), -34),  # 夜店のにぎわい
}
# だんだん強く／弱くするベッド（カットの長さに対する割合で）
RAMP = {'sand_rise': lambda u: np.clip(0.12 + 1.1 * u ** 1.6, 0, 1), 'sand_fall': lambda u: np.clip(1.0 - u * 4.5, 0.0, 1)}
def load_wav(path):
    from math import gcd
    from scipy.signal import resample_poly
    x, sr = sf.read(path)
    if x.ndim == 1: x = np.stack([x, x], 1)
    if sr != SR:
        g = gcd(SR, sr); x = resample_poly(x, SR // g, sr // g, axis=0)
    return x

EVENTS = {  # 名前: (生成関数, 目標 LUFS)

    'foghorn': (lambda: S.foghorn2(), -30),
    'town_chime': (lambda: S.town_chime(), -24),
    'ferry_horn': (lambda: S.ferry_horn(), -31),
    'robot_pi': (lambda: S.robot_pi(), -27),
    'watering': (lambda: S.watering(7.0), -33),
    'holo_on': (lambda: S.holo_on2(), -29),
    'stamp': (lambda: S.stamp(), -27),
    'stamp_paper': (lambda: S.stamp_paper(), -28),
    'phone_notify': (lambda: S.phone_notify(), -30),
    'cup_clink': (lambda: S.cup_clink(), -33),
    'monorail_pass': (lambda: S.monorail_pass(), -32),
    'can_kick': (lambda: S.can_kick(), -27),
    'aircar_pass': (lambda: S.aircar_pass(), -30),
}


def make_event(ev):
    # 引数つきのイベント：笑い声 {"type": "laugh", "kind": "kid|woman|man", "far": true, "soft": false, "seed": 3}
    if ev['type'] == 'laugh':
        snd = S.laugh(seed=ev.get('seed', int(ev['t'] * 100)), kind=ev.get('kind', 'kid'), far=ev.get('far', True), soft=ev.get('soft'), n=ev.get('n'))
        return norm_to(snd, (-30 if not ev.get('far', True) else -33) + ev.get('gain', 0))
    if ev['type'] == 'aircar_pass':
        return norm_to(S.aircar_pass(seed=ev.get('seed', 73), ltr=ev.get('ltr', True)), -30 + ev.get('gain', 0))
    if ev['type'] == 'chalk':  # 黒板のチョークの音（文字数ぶん）
        return norm_to(S.chalk(ev.get('n', 10), seed=int(ev['t'] * 10)), -33 + ev.get('gain', 0))
    if ev['type'] not in EVENTS:
        return None
    fn, target = EVENTS[ev['type']]
    return norm_to(fn(), target + ev.get('gain', 0))

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
FADE_IN = T.get('fadeIn', 2.5)  # 冒頭のフェードイン（秒）。冒頭につかみのカットがある作品は短くして、最初の一瞬から音を出す
SHOT = {sh['id']: sh for sh in T['shots']}


def veo_audio(sh):
    # そのカットの Veo の音（半速）：-24 LUFS にそろえて、カットの veo 倍率をかける。使わないカットは None
    g = sh.get('audio', {}).get('veo', 1.0)
    vp = root / 'work' / 'veoaudio' / f"{sh['id']}.wav"
    if g <= 0 or not vp.exists():
        return None
    v, sr = sf.read(vp)
    if v.ndim == 1: v = np.stack([v, v], 1)
    v = highpass(v, 30, 2)
    if sh['audio'].get('veo_lp'):
        v = lowpass(v, sh['audio']['veo_lp'], 4)  # 耳に刺さる高音を削る
    return norm_to(v, -24) * g


def make_bed(name, L, seed, gain=0.0, memory=False):
    fn, target = BEDS[name]
    bed = fn(L + 0.5, seed)[:int(L * SR)]
    bed = norm_to(bed, target + gain)  # gain：そのカットだけ環境音を持ち上げる（dB）
    if name == 'insects_fade':
        bed *= np.clip(np.linspace(1.4, -0.2, len(bed)), 0, 1)[:, None]
    if name in RAMP:
        bed *= RAMP[name](np.linspace(0, 1, len(bed)))[:, None]
    if memory:
        bed = lowpass(bed, 2600, 2)  # 昭和の回想：環境音も遠くこもらせる
    return bed


def bed_spec(b):
    # beds の要素は名前、または {"name": ..., "t0": 秒, "t1": 秒, "gain": dB}（カットの一部だけに鳴らす）
    return (b, None, None, 0.0) if isinstance(b, str) else (b['name'], b.get('t0'), b.get('t1'), b.get('gain', 0.0))


def place_events(evs, at):
    for ev in evs:
        if ev['type'] == 'voice':  # 声（終わりのあいさつ等）：audio/src からの相対パスを file で指定。-21 LUFS 基準
            vf = Path(__file__).parent / ev['file']
            if not vf.exists():  # まだ作っていない（scripts/tts_outro.py で作る）。声なしで続ける
                print(f"warning: 声 {ev['file']} がありません（scripts/tts_outro.py で作る）。声なしで組み立てます")
                continue
            put(amb, norm_to(load_wav(vf), -21 + ev.get('gain', 0)), at + ev['t'])
            continue
        snd = make_event(ev)
        if snd is not None:
            put(amb, snd, at + ev['t'])


for k, (sh, st) in enumerate(zip(T['shots'], starts)):
    dur = sh['dur']; first = k == 0; last = k == len(T['shots']) - 1
    if sh.get('hook'):
        # 冒頭のつかみ：区間ごとに、元のカットの Veo の音・環境音（無ければ元のカットのもの）・効果音を置き、つなぎ目は xf 秒で重ねる
        h = sh['hook']; xf = h['xf']; t = 0.0
        for j, sg in enumerate(h['segs']):
            src = SHOT[sg['src']]; L = sg['len']
            fin = FADE_IN if (first and j == 0) else xf
            fout = (3.0 if last else XF) if j == len(h['segs']) - 1 else xf
            v = veo_audio(src)
            if v is not None and sg.get('veo', 1.0) > 0:
                seg = v[int(sg['ss'] * SR):int((sg['ss'] + L) * SR)] * sg.get('veo', 1.0)
                put(amb, seg * env_eq(len(seg), fin, fout), st + t)
            for b, bb in enumerate(sg.get('beds', src.get('audio', {}).get('beds', []))):
                name, _, _, gain = bed_spec(bb)
                bed = make_bed(name, L, 100 * k + 10 * j + b, gain + src.get('audio', {}).get('bed_gain', 0), src.get('memory', False))
                put(amb, bed * env_eq(len(bed), fin, fout), st + t)
            place_events(sg.get('events', []), st + t)
            log.append((sh['id'], sg['src'], round(t, 2)))
            t += L - xf
        place_events(sh.get('events', []), st)
        continue
    fin = FADE_IN if first else XF; fout = 3.0 if last else XF
    # Veo の音
    v = veo_audio(sh)
    if v is not None:
        seg = np.zeros((int(dur * SR), 2))
        at = sh.get('clipAt', 0.0)
        i = int(at * SR); j = min(len(seg), i + len(v)); seg[i:j] += v[:j - i]
        if sh.get('hold') == 'reverse':
            rv = v[::-1]; i2 = i + len(v) - int(1.0 * SR)
            xf = np.linspace(0, 1, int(1.0 * SR))[:, None]
            rv = rv.copy(); rv[:len(xf)] *= xf
            j2 = min(len(seg), i2 + len(rv)); seg[i2:j2] += rv[:j2 - i2]
        put(amb, seg * env_eq(len(seg), FADE_IN if first else 2.0, 3.0 if last else 2.0), st)
        log.append((sh['id'], 'veo', round(lufs(v), 1)))
    # 環境音ベッド（前後に 1 秒ずつはみ出させて、となりのカットと重ねる）
    for b, bb in enumerate(sh.get('audio', {}).get('beds', [])):
        name, t0, t1, gain = bed_spec(bb)
        if t0 is None:
            pre = 0.0 if first else 1.0; post = 0.0 if last else 1.0
            L = dur + pre + post
            bed = make_bed(name, L, 100 * k + b, gain + sh.get('audio', {}).get('bed_gain', 0), sh.get('memory', False))
            put(amb, bed * env_eq(len(bed), FADE_IN if first else XF + 2 * pre, 3.0 if last else XF + 2 * post), st - pre)
        else:  # カットの一部だけ（t0〜t1 秒、1 秒で出入り）
            t1 = dur if t1 is None else t1
            bed = make_bed(name, t1 - t0, 100 * k + b, gain + sh.get('audio', {}).get('bed_gain', 0), sh.get('memory', False))
            put(amb, bed * env_eq(len(bed), 1.0, 1.0), st + t0)
        log.append((sh['id'], name, BEDS[name][1]))
    # イベント
    place_events(sh.get('events', []), st)
    for h in sh.get('holo', []):
        fn, target = EVENTS['holo_on']
        put(amb, norm_to(fn(), target), st + h['t0'] + 0.05)
    for v in sh.get('voice', []):  # 話すだけで書けるタブレット：出る音、話す声（聞き取れない）、文字が刻まれる音（src/fx/Voice.tsx と同じ時刻）
        fn, target = EVENTS['holo_on']
        put(amb, norm_to(fn(), target), st + v['t0'] + 0.05)
        rate = v.get('rate', 0.12); pause = v.get('pause', 0.7); t_ = v['t0'] + 1.3; t_first = t_
        for ln in v['lines']:
            n_ = len(ln.lstrip('　 '))
            put(amb, norm_to(S.holo_ticks(n_, rate, seed=int(t_ * 10)), -40), st + t_)
            t_ += n_ * rate + pause
        put(amb, norm_to(S.murmur_voice(t_ - pause - t_first + 0.6, seed=int(v['t0'] * 7)), -37), st + t_first - 0.3)

amb = highpass(amb, 25, 2)
out_dir = root / 'audio' / 'out'; out_dir.mkdir(parents=True, exist_ok=True)
sf.write(out_dir / 'ambience.wav', amb.astype(np.float32), SR)

mix = master(amb, target=float(sys.argv[1]) if len(sys.argv) > 1 else -16.0)  # ASMR 版は少し控えめ（-16 LUFS）
sf.write(out_dir / 'mix_asmr.wav', mix.astype(np.float32), SR, subtype='FLOAT')
print('total', round(TOTAL, 2), 's; ambience LUFS', round(lufs(amb), 1), '-> mix', round(lufs(mix), 1), 'peak', round(20 * np.log10(np.max(np.abs(mix))), 2), 'dBFS')
for row in log: pass
