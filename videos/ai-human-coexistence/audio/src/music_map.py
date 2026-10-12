# 作者の曲（Suno など、歌なし）を映像に並べる前の「曲の地図」づくり。耳で聞けない代わりに、数字と図で中身をつかむ
# 使い方: python3 -I audio/src/music_map.py <出力フォルダ> <曲1> [<曲2> ...] [--motif 曲番号:開始秒:終わり秒] [--near 曲番号:秒,秒,...]
#   例: python3 -I audio/src/music_map.py work/music_map audio/suno/theme{1,2,3,4}.m4a --motif 1:0:9.3
# 出力（出力フォルダ）
#   map.txt     曲ごとの調（全体と20秒ごと）、2秒ごとの表（音量 dB・明るさ c・低音の割合 b・高音の割合 h・音の立ち上がりの数 o）、
#               旋律の切れ目の候補（音量が前後より 5 dB 以上下がる谷と、その次の音の立ち上がり）
#   cqt<n>.jpg  音の高さ×時間の図（C2〜C8、45秒ごとに1段、5秒ごとの目盛り）。音の少ない所・低音の入り・持続音（笛や弦）が見える
#   motif.txt   --motif で指定した区間（ふつうは冒頭の主題）の旋律が、どの曲の何秒にまた出てくるか（似ている順）
#   near.txt    --near で指定した秒の前後 4 秒の、低音の立ち上がりと 0.25 秒ごとの音量（つなぎ目を決める時に）
# 楽器の見当（オルゴール・フルート・弦など）は YAMNet で付けられる（TensorFlow が要る。references/sound.md「作者の曲を使うとき」）
import argparse, subprocess
from pathlib import Path
import numpy as np
import librosa, cv2

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('tracks', nargs='+')
ap.add_argument('--motif'); ap.add_argument('--near', action='append', default=[])
a = ap.parse_args()
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
SR = 22050; HOP = 512
N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
KS_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def load(p, sr=SR, offset=0.0, duration=None):
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(offset), '-i', str(p)] + (['-t', str(duration)] if duration else []) + ['-f', 'f32le', '-ac', '1', '-ar', str(sr), '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, dtype=np.float32).astype(np.float64)


def key(ch):
    p = ch / (ch.sum() + 1e-9)
    best = max((np.corrcoef(p, np.roll(prof, i))[0, 1], f'{N[i]}{nm}') for i in range(12) for nm, prof in (('maj', KS_MAJ), ('min', KS_MIN)))
    return best[1]


def melody_chroma(y):
    C = np.abs(librosa.cqt(y, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz('C4'), n_bins=36))
    ch = np.zeros((12, C.shape[1]))
    for b in range(36): ch[b % 12] += C[b]
    return ch / (ch.max(0, keepdims=True) + 1e-9)


lines = []
for n, p in enumerate(a.tracks, 1):
    y = load(p)
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)); f = librosa.fft_frequencies(sr=SR, n_fft=2048)
    db = 20 * np.log10(librosa.feature.rms(S=S, frame_length=2048, hop_length=HOP)[0] + 1e-9)
    t = librosa.frames_to_time(np.arange(len(db)), sr=SR, hop_length=HOP)
    bass = S[f < 200].sum(0) / (S.sum(0) + 1e-9); hi = S[f > 2000].sum(0) / (S.sum(0) + 1e-9)
    cent = librosa.feature.spectral_centroid(S=S, sr=SR)[0]
    on = librosa.onset.onset_detect(y=y, sr=SR, hop_length=HOP, units='time', backtrack=True)
    ch = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    tempo, _ = librosa.beat.beat_track(y=y, sr=SR, hop_length=HOP)
    lines.append(f'== 曲{n} {Path(p).name}  {len(y) / SR:.1f}s  調 {key(ch.mean(1))}  テンポ {float(np.atleast_1d(tempo)[0]):.1f}')
    lines.append('   20秒ごとの調: ' + ' '.join(f'{s}:{key(ch[:, (t >= s) & (t < s + 20)].mean(1))}' for s in range(0, int(len(y) / SR), 20)))
    rows = []
    for s in np.arange(0, len(y) / SR, 2.0):
        m = (t >= s) & (t < s + 2)
        rows.append(f"{s:5.0f} {db[m].mean():5.1f} c{int(cent[m].mean()):4d} b{int(bass[m].mean() * 100):2d} h{int(hi[m].mean() * 100):2d} o{int(((on >= s) & (on < s + 2)).sum())}")
    lines += ['   ' + ' | '.join(rows[k:k + 5]) for k in range(0, len(rows), 5)]
    w = int(0.5 * SR / HOP); sm = np.convolve(db, np.ones(w) / w, mode='same'); W = int(3 * SR / HOP); cands = []
    for j in range(W, len(sm) - W, 4):
        seg = sm[j - W:j + W]
        if sm[j] == seg.min() and np.median(seg) - sm[j] > 5:
            nxt = on[(on > t[j]) & (on < t[j] + 1.2)]
            cands.append(f'{t[j]:.2f}s(-{np.median(seg) - sm[j]:.0f}dB→{nxt[0]:.2f})' if len(nxt) else f'{t[j]:.2f}s(-{np.median(seg) - sm[j]:.0f}dB)')
    lines.append('   旋律の切れ目の候補: ' + ' '.join(cands))
    # 音の高さ×時間の図
    C = np.abs(librosa.cqt(y, sr=SR, hop_length=256, fmin=librosa.note_to_hz('C2'), n_bins=72))
    D = np.clip((librosa.amplitude_to_db(C, ref=np.max) + 60) / 60, 0, 1)
    img = cv2.resize(cv2.applyColorMap((D[::-1] * 255).astype(np.uint8), cv2.COLORMAP_INFERNO), (C.shape[1], 288), interpolation=cv2.INTER_NEAREST)
    fps = SR / 256; Wd = int(45 * fps); rows_img = []
    for k in range(0, img.shape[1], Wd):
        r = img[:, k:k + Wd]
        if r.shape[1] < Wd: r = np.pad(r, ((0, 0), (0, Wd - r.shape[1]), (0, 0)))
        r = cv2.resize(r, (1800, 288))
        for s in range(0, 46, 5):
            x = int(s / 45 * 1800); cv2.line(r, (x, 0), (x, 8), (255, 255, 255), 1)
            cv2.putText(r, f'{k / fps + s:.0f}', (x + 2, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        for o in range(1, 6):
            yy = 288 - o * 48; cv2.line(r, (0, yy), (1800, yy), (90, 90, 90), 1); cv2.putText(r, f'C{o + 2}', (2, yy - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (200, 200, 200), 1)
        rows_img += [r, np.zeros((6, 1800, 3), np.uint8)]
    cv2.imwrite(str(out / f'cqt{n}.jpg'), np.vstack(rows_img), [cv2.IMWRITE_JPEG_QUALITY, 88])
(out / 'map.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('\n'.join(lines[:3 * len(a.tracks)]))

if a.motif:  # 主題がどこにまた出てくるか（移調はしない。同じ調で出てくる所を探す）
    i, t0, t1 = a.motif.split(':'); q = melody_chroma(load(a.tracks[int(i) - 1], offset=float(t0), duration=float(t1) - float(t0))); L = q.shape[1]
    res = []
    for n, p in enumerate(a.tracks, 1):
        c = melody_chroma(load(p)); fps = SR / HOP
        sc = np.array([((c[:, k:k + L] * q).sum() / (np.linalg.norm(c[:, k:k + L]) * np.linalg.norm(q) + 1e-9), k / fps) for k in range(0, c.shape[1] - L, 4)])
        top = []
        for j in np.argsort(-sc[:, 0]):
            if all(abs(sc[j, 1] - tt) > 6 for _, tt in top): top.append((sc[j, 0], sc[j, 1]))
            if len(top) >= 6: break
        res.append(f'曲{n}: ふつうの似かた {np.median(sc[:, 0]):.2f}／似ている所 ' + ' '.join(f'{tt:.1f}s({v:.2f})' for v, tt in top))
    (out / 'motif.txt').write_text('\n'.join(res) + '\n', encoding='utf-8'); print('\n'.join(res))

near = []
for spec in a.near:  # つなぎ目の候補の前後：低音の立ち上がりと 0.25 秒ごとの音量
    i, ts = spec.split(':'); p = a.tracks[int(i) - 1]
    for c0 in (float(x) for x in ts.split(',')):
        s0 = max(0.0, c0 - 4); y = load(p, offset=s0, duration=8)
        S = np.abs(librosa.stft(y, n_fft=4096, hop_length=256)); f = librosa.fft_frequencies(sr=SR, n_fft=4096)
        low = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[f < 250]), sr=SR, hop_length=256)
        pk = librosa.util.peak_pick(low, pre_max=20, post_max=20, pre_avg=40, post_avg=40, delta=np.percentile(low, 90) * 0.5, wait=40)
        db = 20 * np.log10(librosa.feature.rms(S=S, frame_length=4096, hop_length=256)[0] + 1e-9); q = int(0.25 * SR / 256)
        near.append(f'曲{i} {c0:.2f}s 付近  低音の立ち上がり: ' + ' '.join(f'{s0 + x:.2f}' for x in librosa.frames_to_time(pk, sr=SR, hop_length=256)))
        near.append('    ' + ' '.join(f'{s0 + k * 256 / SR:.2f}:{db[k:k + q].mean():.0f}' for k in range(0, len(db) - q, q)))
if near: (out / 'near.txt').write_text('\n'.join(near) + '\n', encoding='utf-8'); print('\n'.join(near))
