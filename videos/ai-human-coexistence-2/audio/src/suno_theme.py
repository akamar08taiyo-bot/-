# 作者が Suno で作った歌なしのテーマ曲（audio/suno/theme1〜4.m4a）を、完成した映像の区間に合わせて並べ、audio/out/music.wav を作る
# （プログラムで作曲した compose.py の曲の代わり。二重には重ねない。build_theme.py がこの music.wav を環境音と合わせる）
# 使い方: python3 -I audio/src/suno_theme.py [計画.json]   （省略時は audio/src/suno_plan.json）
# 決まり（作者の指示、2026年10月）
#   - 映像は曲に合わせて伸び縮みさせない。曲も速さ・高さを変えない（区間を選んで並べるだけ）
#   - つなぎ目は映像の1.2秒の重ねに合わせず、旋律の切れ目（音が引いた所）と次の旋律の頭（低音が入る所）で決める
#   - 違う旋律どうしを重ねない（重なるのは、前の曲の消えかけの響きと次の曲の頭だけ。重なりが大きいと警告を出す）
#   - 指定の区間は完全に無音（祭りなど）。その前で曲の余韻まで消しておく
#   - 冒頭の主題を後でもう一度使うときは、冒頭と同じ音源の同じ所を使う
# 計画の書き方（時刻は映像の秒）
#   {"tracks": {"t1": "../suno/theme1.m4a", ...},
#    "pieces": [{"at": 0.0, "src": "t1", "from": 0.0, "to": 15.5, "fade_in": 0.05, "fade_out": 0.55, "gain": 1.0, "note": "…"}, ...],
#    "fade_out": [{"t0": 315.0, "t1": 318.8}],   その区間で曲全体をゆっくり 0 へ（その後は元に戻る）
#    "mute": [[319.0, 364.2]]}                   その区間は完全に無音
#   at：曲の from 秒目が映像の何秒に来るか。from〜to を切り出し、頭 fade_in 秒・終わり fade_out 秒を等パワーの曲線でならす。gain は dB
import json, subprocess, sys
from pathlib import Path
import numpy as np
import soundfile as sf

here = Path(__file__).resolve().parent
root = here.parents[1]
plan_path = Path(sys.argv[1]) if len(sys.argv) > 1 else here / 'suno_plan.json'
plan = json.loads(plan_path.read_text(encoding='utf-8'))
T = json.loads((root / 'src' / 'timeline.json').read_text(encoding='utf-8'))
XF = T['crossfade']; total = sum(s['dur'] for s in T['shots']) - XF * (len(T['shots']) - 1)
SR = 48000


def load(p):
    p = (plan_path.parent / p).resolve()
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def curve(n, kind):
    x = np.linspace(0, 1, max(n, 1))
    return np.sin(x * np.pi / 2) if kind == 'in' else np.cos(x * np.pi / 2)


tracks = {k: load(v) for k, v in plan['tracks'].items()}
out = np.zeros((int(total * SR) + SR, 2))
layers = []  # 重なりの確認用：区間ごとの音量（0.1秒ごと）
log = []
for pc in plan['pieces']:
    y = tracks[pc['src']]
    a, b = pc['from'], min(pc['to'], len(y) / SR)
    seg = y[int(a * SR):int(b * SR)].copy()
    n_in, n_out = int(pc.get('fade_in', 0.05) * SR), int(pc.get('fade_out', 1.0) * SR)
    if n_in: seg[:n_in] *= curve(n_in, 'in')[:, None]
    if n_out: seg[-n_out:] *= curve(n_out, 'out')[:, None]
    seg *= 10 ** (pc.get('gain', 0) / 20)
    i0 = int(round(pc['at'] * SR)); i1 = min(len(out), i0 + len(seg))
    out[i0:i1] += seg[:i1 - i0]
    lay = np.zeros(len(out) // 4800 + 1); e = np.sqrt(np.mean(seg[:i1 - i0] ** 2, axis=1))
    for k in range(0, i1 - i0, 4800): lay[(i0 + k) // 4800] = e[k:k + 4800].mean()
    layers.append((pc, lay))
    log.append(f"{pc['at']:7.2f}〜{pc['at'] + (b - a):7.2f}s  {pc['src']} {a:7.2f}〜{b:7.2f}s  {pc.get('gain', 0):+.1f}dB  {pc.get('note', '')}")
# 違う曲の旋律が重なっていないか：両方とも -40 dBFS より大きい所が 0.6 秒を超えたら警告
for (p1, l1), (p2, l2) in zip(layers, layers[1:]):
    both = (20 * np.log10(l1 + 1e-9) > -40) & (20 * np.log10(l2 + 1e-9) > -40)
    if both.sum() * 0.1 > 0.6:
        log.append(f"  ! 重なり {both.sum() * 0.1:.1f}s: {p1.get('note', '')} / {p2.get('note', '')}")
# 指定の区間で曲を消す（余韻まで）。そのあと完全な無音区間
t = np.arange(len(out)) / SR
for f in plan.get('fade_out', []):
    g = np.ones(len(out))
    m = (t >= f['t0']) & (t <= f['t1'])
    g[m] = np.sin(np.clip((f['t1'] - t[m]) / (f['t1'] - f['t0']), 0, 1) * np.pi / 2)
    g[(t > f['t1']) & (t < f['t1'] + 0.5)] = 0.0  # 消した直後の 0.5 秒も 0（次の曲が始まる前の余韻を残さない）
    out *= g[:, None]
for m0, m1 in plan.get('mute', []):
    out[int(m0 * SR):int(m1 * SR)] = 0.0
out = out[:int(total * SR)]
outp = root / 'audio' / 'out' / 'music.wav'
sf.write(outp, out.astype(np.float32), SR, subtype='FLOAT')
print('\n'.join(log))
print('music.wav', round(total, 1), 's  (Suno の曲から', len(plan['pieces']), '区間)')
