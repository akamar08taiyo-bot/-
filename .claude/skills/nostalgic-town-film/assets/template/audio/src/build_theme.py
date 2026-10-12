# テーマ曲入り版：環境音（ambience.wav）＋テーマ曲（music.wav）→ mix_theme.wav
# 曲は Suno の歌なしの曲（suno_theme.py が並べたもの）。生活の音を埋めないよう、曲は環境音より少し小さく置き、
# 曲が鳴っている所だけ環境音をわずかに下げる。チャイム・あいさつ・「ピ。」・笑い声の所は曲を下げる。全体を -14 LUFS に
import json, os, sys
from pathlib import Path
import numpy as np
import soundfile as sf
sys.path.insert(0, str(Path(__file__).parent))
import pyloudnorm as pyln
from dsp import SR, master

MUSIC_VS_AMB = -1.5  # 曲の大きさ（環境音のラウドネスとの差、dB）。作者の指示「暮らしの音を埋めない」
AMB_DUCK = -2.5      # 曲が鳴っている所で環境音を下げる量（dB）
RIDE_CAP = 1.0       # 曲が環境音より大きくなりすぎる所だけ曲を下げる：3秒ごとの大きさで「環境音＋この dB」を超えた分（最大 RIDE_MAX）
RIDE_MAX = -6.0
DUCKS = {            # 出来事の所で曲を下げる量（dB）と、前後の幅（秒）。チャイムは t〜t_end
    'town_chime': (-12.0, 0.8, 1.5), 'voice': (-12.0, 0.8, 9.5), 'outro_voice': (-12.0, 0.8, 9.5),
    'robot_pi': (-8.0, 0.6, 0.6), 'laugh': (-4.0, 0.3, 2.5),
}

meter = pyln.Meter(SR)

def lufs(x):
    return meter.integrated_loudness(x if x.ndim == 2 else np.stack([x, x], 1))

out_dir = Path(__file__).resolve().parents[2] / 'audio' / 'out'
amb, _ = sf.read(out_dir / 'ambience.wav')
mus, _ = sf.read(out_dir / 'music.wav')
if mus.ndim == 1: mus = np.stack([mus, mus], 1)
n = min(len(amb), len(mus)); amb = amb[:n]; mus = mus[:n]

# 曲の有無（50ms ごとの音量）→ なめらかな包絡線（1.5秒で上げ下げ）→ 環境音を少し下げる
hop = int(0.05 * SR)
rms = np.sqrt(np.mean(mus[: len(mus) // hop * hop].reshape(-1, hop, 2) ** 2, axis=(1, 2)))
active = (20 * np.log10(rms + 1e-9) > -50).astype(float)
k = int(1.5 / 0.05)
sm = np.convolve(active, np.ones(k) / k, mode='same')
g = np.repeat(10 ** (AMB_DUCK * sm / 20), hop)
g = np.pad(g, (0, len(amb) - len(g)), mode='edge')[:, None]

# 出来事の所で曲を下げる（声・チャイム・「ピ。」を聞かせる）
T = json.loads((out_dir.parents[1] / 'src' / 'timeline.json').read_text())
tt = np.arange(len(mus)) / SR
duck_db = np.zeros(len(mus))
st = 0.0
for sh in T['shots']:
    for ev in sh.get('events', []):
        if ev['type'] not in DUCKS: continue
        db, pre, post = DUCKS[ev['type']]
        a = st + ev['t'] - pre
        b = st + ev['t_end'] + post if ev.get('t_end') else st + ev['t'] + post
        ramp = np.clip(np.minimum((tt - a) / pre, (b + 1.0 - tt) / 1.0), 0, 1)  # pre 秒で下げ、1秒で戻す
        duck_db = np.minimum(duck_db, db * ramp)
    st += sh['dur'] - T['crossfade']
mus = mus * (10 ** (duck_db / 20))[:, None]

mus_l = lufs(mus)
amb_l = lufs(amb)
mus = mus * 10 ** ((amb_l + MUSIC_VS_AMB - mus_l) / 20)

# 曲の乗りすぎをならす：3秒の窓（0.5秒ごと）で曲と環境音（下げた後）の大きさを比べ、曲が RIDE_CAP を超えた分だけ下げる。
# 5秒でならして、ゆっくり動かす（音量が揺れて聞こえないように）。曲が小さい所は上げない（音の少ない所は作者の意図）
mst = pyln.Meter(SR, block_size=0.4)
def st_lufs(x):
    try: return mst.integrated_loudness(x)
    except Exception: return -99.0
ab = amb * g; win = int(3 * SR); hp = int(0.5 * SR)
cent, cut = [], []
for i in range(0, len(mus) - win, hp):
    lm = st_lufs(mus[i:i + win]); la = st_lufs(ab[i:i + win])
    cent.append(i + win // 2); cut.append(float(np.clip(RIDE_CAP - (lm - la), RIDE_MAX, 0.0)) if lm > -45 and la > -60 else 0.0)
cut = np.convolve(np.array(cut), np.ones(10) / 10, mode='same')
ride = np.interp(np.arange(len(mus)), cent, cut)
mus = mus * (10 ** (ride / 20))[:, None]
print('ride: max cut', round(float(ride.min()), 1), 'dB; cut > 2 dB for', round(float((ride < -2).sum() / SR), 1), 's')
mix = master(amb * g + mus, ceiling_db=-3.2)
if os.environ.get('STEMS'):  # 点検用：最終の音量での曲と環境音（リミッター前の倍率で近似）
    k = 10 ** ((lufs(mix) - lufs(amb * g + mus)) / 20); d = Path(os.environ['STEMS']); d.mkdir(parents=True, exist_ok=True)
    sf.write(d / 'stem_music.wav', (mus * k).astype(np.float32), SR, subtype='FLOAT'); sf.write(d / 'stem_amb.wav', (amb * g * k).astype(np.float32), SR, subtype='FLOAT')  # AAC にした後のトゥルーピークが -1 dBTP を超えないよう、上限を低めに
tmp = out_dir / 'mix_theme.tmp.wav'  # 書き出し中のファイルを他の工程（assemble.py）が読まないよう、書き終えてから置き換える
sf.write(tmp, mix.astype(np.float32), SR, subtype='FLOAT'); os.replace(tmp, out_dir / 'mix_theme.wav')
print('ambience', round(amb_l, 1), 'music', round(mus_l, 1), '->', round(amb_l + MUSIC_VS_AMB, 1), '; theme mix', round(lufs(mix), 1),
      'LUFS; peak', round(20 * np.log10(np.max(np.abs(mix))), 2), 'dBFS')
