#!/usr/bin/env python3
"""Turn Gemini phrase estimates + signal analysis into src/data/timing.json.

usage: python3 scripts/build_timing.py <audio> [--align work/align_chunks.json] [--plot]

- phrase starts: Gemini clip estimates, snapped to the breath gap (vocal-band energy dip)
  just before them when a clear one exists nearby
- beat grid: librosa beat tracking, then a straight-line fit (fixed tempo)
- drum hits: kick (40-130 Hz) and snare (1.8-6 kHz) onsets from the percussive part
- cut: the instrumental drop-out before the punchline (large drop of percussive energy)
"""
import argparse, json, os
import numpy as np
import librosa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('audio')
ap.add_argument('--align', default=os.path.join(ROOT, 'work', 'align_chunks.json'))
ap.add_argument('--out', default=os.path.join(ROOT, 'src', 'data', 'timing.json'))
ap.add_argument('--plot', action='store_true')
ap.add_argument('--bpm', type=float, default=120.0, help='tempo hint for beat tracking')
args = ap.parse_args()

lyrics = json.load(open(os.path.join(ROOT, 'src', 'data', 'lyrics.json'), encoding='utf-8'))
align = json.load(open(args.align, encoding='utf-8'))
est = {p['id']: p for p in align['phrases']}

y, sr = librosa.load(args.audio, sr=22050, mono=True)
dur = len(y) / sr
HOP = 128
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
H, P = librosa.decompose.hpss(S, margin=(1.0, 3.0))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
t = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=HOP)
fps_a = sr / HOP


def band(M, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return (M[m] ** 2).sum(0)


def smooth(x, sec):
    n = max(1, int(sec * fps_a))
    return np.convolve(x, np.ones(n) / n, mode='same')


voc_db = 10 * np.log10(smooth(band(H, 300, 3500), 0.03) + 1e-9)
total_db = 10 * np.log10(smooth((S ** 2).sum(0), 0.05) + 1e-9)

# ---------- music end / vocal end ----------
loud = np.where(total_db > total_db.max() - 45)[0]
music_end = float(t[loud[-1]]) if len(loud) else dur

# ---------- phrase starts ----------
order = []
for s in lyrics['sections']:
    for l in s['lines']:
        for i, _ in enumerate(l['phrases']):
            order.append(f"{l['id']}#{i}")

raw = []
for pid in order:
    e = est.get(pid)
    raw.append(e['start'] if e and e.get('start') is not None else None)
# fill gaps by interpolation
for i, v in enumerate(raw):
    if v is None:
        prev = next((raw[j] for j in range(i - 1, -1, -1) if raw[j] is not None), 0.0)
        nxt = next((raw[j] for j in range(i + 1, len(raw)) if raw[j] is not None), music_end)
        raw[i] = (prev + nxt) / 2


def snap(x, before=0.35, after=0.2):
    """move x to the end of the best breath gap in [x-before, x+after] (deep and close wins)"""
    a, b = np.searchsorted(t, [x - before, x + after])
    if b - a < 5:
        return x, 0.0
    seg = voc_db[a:b]
    score = seg + 8.0 * np.abs(t[a:b] - x)
    k = int(np.argmin(score))
    # gap depth relative to the louder of the surrounding 0.25 s
    l0, r1 = np.searchsorted(t, [t[a + k] - 0.25, t[a + k] + 0.25])
    ref = min(np.percentile(voc_db[l0:a + k + 1], 80), np.percentile(voc_db[a + k:r1], 80))
    depth = ref - seg[k]
    if depth < 4.0:
        return x, depth
    # onset = first frame after the dip that recovers half the depth
    thr = seg[k] + depth * 0.5
    j = a + k
    while j < len(voc_db) - 1 and voc_db[j] < thr and t[j] < x + 0.3:
        j += 1
    return float(t[j]), depth


starts = []
for pid, x in zip(order, raw):
    first = pid.endswith('#0')
    s, depth = snap(x, 0.2, 0.15) if first else snap(x, 0.45, 0.3)
    starts.append(s)
# snapping must not squeeze neighbours: revert the larger move to the estimate
for _ in range(3):
    for i in range(1, len(starts)):
        exp_gap = raw[i] - raw[i - 1]
        if starts[i] - starts[i - 1] < 0.55 * exp_gap:
            j = i if abs(starts[i] - raw[i]) >= abs(starts[i - 1] - raw[i - 1]) else i - 1
            starts[j] = raw[j]
# keep strictly increasing with >= 0.25 s spacing
for i in range(1, len(starts)):
    if starts[i] < starts[i - 1] + 0.25:
        starts[i] = starts[i - 1] + 0.25

# ---------- beat grid ----------
oenv = librosa.onset.onset_strength(y=y, sr=sr)
tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, start_bpm=args.bpm, units='time')
beats = np.asarray(beats)
k = np.round((beats - beats[0]) / np.median(np.diff(beats)))
T, t0 = np.polyfit(k, beats, 1)
resid = beats - (t0 + T * k)
keep = np.abs(resid) < 0.06
T, t0 = np.polyfit(k[keep], beats[keep], 1)
while t0 - T > -0.02:
    t0 -= T
grid = [round(float(t0 + T * i), 4) for i in range(int((music_end - t0) / T) + 2) if t0 + T * i >= -0.02]

# ---------- drum hits ----------
def hits(lo, hi, delta, min_gap):
    env = band(P, lo, hi)
    env = np.log1p(env / (np.median(env) + 1e-9))
    o = np.maximum(0, np.diff(env, prepend=env[0]))
    o = smooth(o, 0.01)
    o = o / (np.percentile(o, 99.5) + 1e-9)
    pk = librosa.util.peak_pick(o, pre_max=int(0.03 * fps_a), post_max=int(0.03 * fps_a), pre_avg=int(0.1 * fps_a),
                                post_avg=int(0.1 * fps_a), delta=delta, wait=int(min_gap * fps_a))
    return [(round(float(t[p]), 3), round(float(min(1.0, o[p])), 3)) for p in pk]

kicks = hits(40, 130, 0.25, 0.18)
snares = hits(1800, 6000, 0.25, 0.18)

# ---------- cut before punchline ----------
perc_db = 10 * np.log10(smooth(band(P, 40, 8000), 0.08) + 1e-9)
punch_start = starts[order.index('punch-1#0')]
quiet = total_db < total_db.max() - 40
cut, outro_start = None, None
i = int(np.searchsorted(t, punch_start))
while i < len(t):
    if quiet[i]:
        j = i
        while j < len(t) and quiet[j]:
            j += 1
        if t[min(j, len(t) - 1)] - t[i] >= 0.12 and t[i] < music_end - 1.0:
            cut, outro_start = float(t[i]), float(t[min(j, len(t) - 1)])
            break
        i = j
    i += 1
if cut is None:  # instruments drop right before the punchline
    a, b = np.searchsorted(t, [punch_start - 2.5, punch_start + 0.1])
    d = np.diff(perc_db[a:b])
    cut = float(t[a + int(np.argmin(smooth(d, 0.05)))]) if b - a > 10 else punch_start - 0.6

# ---------- assemble ----------
pid_start = dict(zip(order, starts))
lines, sections = [], []
flat_lines = [(s, l) for s in lyrics['sections'] for l in s['lines']]
for idx, (s, l) in enumerate(flat_lines):
    ps = [pid_start[f"{l['id']}#{i}"] for i in range(len(l['phrases']))]
    nxt = pid_start[f"{flat_lines[idx + 1][1]['id']}#0"] if idx + 1 < len(flat_lines) else None
    e_last = est.get(f"{l['id']}#{len(l['phrases']) - 1}", {}).get('end')
    if nxt is None:
        end = cut if cut > ps[-1] else min(music_end, (e_last or ps[-1] + 1.8) + 0.1)
    else:
        end = nxt
    phrases = []
    for i, txt in enumerate(l['phrases']):
        pe = ps[i + 1] if i + 1 < len(ps) else end
        phrases.append({'text': txt, 'start': round(ps[i], 3), 'end': round(pe, 3)})
    lines.append({'id': l['id'], 'section': s['id'], 'text': l['text'], 'start': round(ps[0], 3), 'end': round(end, 3), 'phrases': phrases})

for s in lyrics['sections']:
    ls = [l for l in lines if l['section'] == s['id']]
    if ls:
        sections.append({'id': s['id'], 'label': s['label'], 'start': ls[0]['start'], 'end': ls[-1]['end']})
last_end = lines[-1]['end']
sections.append({'id': 'outro', 'label': 'OUTRO', 'start': round(max(last_end, cut), 3), 'end': round(music_end, 3)})
# make sections contiguous, and the first one start at 0
sections[0]['start'] = 0.0
for i in range(len(sections) - 1):
    sections[i]['end'] = sections[i + 1]['start']

timing = {
    'audio': os.path.basename(args.audio),
    'duration': round(min(dur, music_end + 0.6), 3),
    'musicEnd': round(music_end, 3),
    'bpm': round(60.0 / T, 3),
    'beat0': round(float(t0), 4),
    'beatT': round(float(T), 5),
    'beats': grid,
    'kicks': kicks,
    'snares': snares,
    'cut': round(cut, 3),
    'outroStart': round(outro_start if outro_start else cut, 3),
    'sections': sections,
    'lines': lines,
}
json.dump(timing, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"bpm {timing['bpm']} beat0 {timing['beat0']} | beats {len(grid)} kicks {len(kicks)} snares {len(snares)}")
print(f"cut {cut:.2f} outroStart {timing['outroStart']:.2f} punch {punch_start:.2f} musicEnd {music_end:.2f} duration {timing['duration']}")
for s in sections:
    print(f"  {s['id']:6s} {s['start']:6.2f} - {s['end']:6.2f}")
for pid, r, s in zip(order, raw, starts):
    print(f"  {pid:10s} {r:6.2f} -> {s:6.2f} ({s - r:+.2f})")

if args.plot:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n = int(np.ceil(music_end / 10))
    fig, axes = plt.subplots(n, 1, figsize=(22, 2.6 * n))
    for r, ax in enumerate(axes):
        a0, a1 = r * 10, r * 10 + 10
        m = (t >= a0) & (t < a1)
        ax.plot(t[m], voc_db[m], color='k', lw=0.7)
        for x, s_ in kicks:
            if a0 <= x < a1: ax.axvline(x, color='tab:blue', alpha=0.25 + 0.5 * s_, lw=1)
        for x, s_ in snares:
            if a0 <= x < a1: ax.axvline(x, color='tab:orange', alpha=0.25 + 0.5 * s_, lw=1, ls='--')
        for g in grid:
            if a0 <= g < a1: ax.axvline(g, color='gray', alpha=0.3, lw=0.5, ymax=0.1)
        for pid, rr, s_ in zip(order, raw, starts):
            if a0 <= s_ < a1:
                ax.axvline(s_, color='red', lw=1.6)
                ax.text(s_, ax.get_ylim()[1], pid, color='red', fontsize=8, va='top')
            if a0 <= rr < a1:
                ax.axvline(rr, color='green', lw=1, ls=':')
        if a0 <= cut < a1: ax.axvline(cut, color='magenta', lw=3)
        ax.set_xlim(a0, a1)
    plt.tight_layout()
    plt.savefig(os.path.join(ROOT, 'work', 'timing_check.png'), dpi=55)
