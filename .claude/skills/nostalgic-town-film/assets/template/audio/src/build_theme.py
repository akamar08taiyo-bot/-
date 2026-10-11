# テーマ曲入り版：環境音（ambience.wav）＋テーマ曲（music.wav）→ mix_theme.wav
# 曲が鳴っている所だけ環境音を少し下げ（ダッキング）、全体を -14 LUFS / 上限 -1 dB にそろえる
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0, str(Path(__file__).parent))
import pyloudnorm as pyln
from dsp import SR, master

meter = pyln.Meter(SR)

def lufs(x):
    return meter.integrated_loudness(x if x.ndim == 2 else np.stack([x, x], 1))

def norm_to(x, target):
    return x * 10 ** ((target - lufs(x)) / 20)

out_dir = Path(__file__).resolve().parents[2] / 'audio' / 'out'
amb, _ = sf.read(out_dir / 'ambience.wav')
mus, _ = sf.read(out_dir / 'music.wav')
if mus.ndim == 1: mus = np.stack([mus, mus], 1)
n = min(len(amb), len(mus)); amb = amb[:n]; mus = mus[:n]
if len(mus) < len(amb): mus = np.pad(mus, ((0, len(amb) - len(mus)), (0, 0)))

# 曲の有無（50ms ごとの音量）→ なめらかな包絡線
hop = int(0.05 * SR)
rms = np.sqrt(np.mean(mus[: len(mus) // hop * hop].reshape(-1, hop, 2) ** 2, axis=(1, 2)))
active = (20 * np.log10(rms + 1e-9) > -50).astype(float)
k = int(1.5 / 0.05)  # 1.5秒で上げ下げ
sm = np.convolve(active, np.ones(k) / k, mode='same')
duck_db = -5.0 * sm
g = np.repeat(10 ** (duck_db / 20), hop)
g = np.pad(g, (0, len(amb) - len(g)), mode='edge')[:, None]

# 終わりのあいさつの間は曲をさらに下げる（声を聞かせる）
import json
T = json.loads((out_dir.parents[1] / 'src' / 'timeline.json').read_text())
st = 0.0
for sh in T['shots']:
    for ev in sh.get('events', []):
        if ev['type'] in ('voice', 'outro_voice'):
            a, b = st + ev['t'] - 0.8, st + ev['t'] + 9.5
            env = np.ones(len(mus)); tt = np.arange(len(mus)) / SR
            env -= (1 - 10 ** (-10 / 20)) * np.clip(np.minimum((tt - a) / 0.8, (b + 1.5 - tt) / 1.5), 0, 1)
            mus = mus * env[:, None]
    st += sh['dur'] - T['crossfade']

# 曲の音量のならし：4秒ごとの音量を見て、大きすぎる区間だけ下げる（最大 -7 dB、上げるのは +2 dB まで）。章ごとの編成の差で、
# 三章（フルート＋分散和音）だけ5 dB 以上大きかったため
win = int(4.0 * SR); hopn = int(1.0 * SR)
cent, lv = [], []
for i in range(0, len(mus) - win, hopn):
    seg = mus[i:i + win]
    r = np.sqrt(np.mean(seg ** 2)) + 1e-9
    cent.append(i + win // 2); lv.append(20 * np.log10(r))
cent = np.array(cent); lv = np.array(lv)
act = lv > -45
if act.any():
    ref = np.median(lv[act])
    gdb = np.where(act, np.clip(ref - lv, -7.0, 2.0), 0.0)
    gdb = np.convolve(gdb, np.ones(5) / 5, mode='same')  # 5秒でならす
    curve = np.interp(np.arange(len(mus)), cent, gdb)
    mus = mus * (10 ** (curve / 20))[:, None]

mus_l = lufs(mus)
amb_l = lufs(amb)
mus = mus * 10 ** ((amb_l + 2.5 - mus_l) / 20)  # 曲を環境音より 2.5 dB 上に
mix = master(amb * g + mus)
sf.write(out_dir / 'mix_theme.wav', mix.astype(np.float32), SR, subtype='FLOAT')
print('ambience', round(amb_l, 1), 'music', round(mus_l, 1), '-> theme mix', round(lufs(mix), 1), 'LUFS; peak', round(20 * np.log10(np.max(np.abs(mix))), 2), 'dBFS')
