#!/usr/bin/env python3
"""Refine lyric timing by asking Gemini about short overlapping clips.

usage: python3 scripts/align_chunks.py <audio> [--rough work/align_raw.json] [--win 8] [--hop 4]

Long-file timestamps from audio LLMs drift; on an 8 s clip they are much tighter.
Each clip is sent with the phrases that the rough pass placed near it; Gemini returns
which phrases start inside the clip and when (relative to the clip). Estimates from
overlapping clips are fused (median, edge estimates down-weighted) into
work/align_chunks.json.
"""
import argparse, base64, json, os, statistics, subprocess, sys, tempfile, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('audio')
ap.add_argument('--rough', default=os.path.join(ROOT, 'work', 'align_raw.json'))
ap.add_argument('--model', default='gemini-3.8-flash')
ap.add_argument('--win', type=float, default=8.0)
ap.add_argument('--hop', type=float, default=4.0)
ap.add_argument('--out', default=os.path.join(ROOT, 'work', 'align_chunks.json'))
args = ap.parse_args()

lyrics = json.load(open(os.path.join(ROOT, 'src', 'data', 'lyrics.json'), encoding='utf-8'))
order, text_of = [], {}
for s in lyrics['sections']:
    for l in s['lines']:
        for i, p in enumerate(l['phrases']):
            pid = f"{l['id']}#{i}"
            order.append(pid)
            text_of[pid] = p
rough = {p['id']: p for p in json.load(open(args.rough, encoding='utf-8'))['phrases']}

dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', args.audio]))
tmp = tempfile.mkdtemp()

schema = {"type": "OBJECT", "properties": {"found": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
    "id": {"type": "STRING"}, "start": {"type": "NUMBER"}, "end": {"type": "NUMBER"}}, "required": ["id", "start", "end"]}}},
    "required": ["found"]}


def rough_start(pid):
    # interpolate a rough start for ids the rough pass skipped
    if pid in rough:
        return rough[pid]['start']
    i = order.index(pid)
    prev = next((rough[q]['start'] for q in reversed(order[:i]) if q in rough), 0.0)
    nxt = next((rough[q]['start'] for q in order[i + 1:] if q in rough), dur)
    return (prev + nxt) / 2


def ask(c0):
    c1 = min(dur, c0 + args.win)
    clip = os.path.join(tmp, f"c{c0:06.2f}.wav")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{c0}', '-t', f'{c1 - c0}', '-i', args.audio, '-ac', '1', '-ar', '16000', clip], check=True)
    cand = [pid for pid in order if c0 - 6 <= rough_start(pid) <= c1 + 6]
    prompt = (
        f"This is a {c1 - c0:.2f}-second clip of a fast Japanese rap song. Candidate lyric phrases (in sung order) are below; "
        "only some of them are audible in this clip, and a phrase may be cut off at the clip edges.\n"
        "For each phrase whose FIRST syllable is sung inside this clip, return its id, the start time (first consonant onset) and end time "
        "(last syllable release) in seconds relative to the start of THIS clip, 2 decimals. If the end falls after the clip, use the clip length. "
        "Do not return phrases whose beginning is not in the clip. Listen carefully: the rap is very fast.\n\n"
        + "\n".join(f"{pid}: {text_of[pid]}" for pid in cand)
    )
    body = {"contents": [{"role": "user", "parts": [
        {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(open(clip, 'rb').read()).decode()}},
        {"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema, "temperature": 0}}
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{args.model}:generateContent",
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "x-goog-api-key": os.environ.get('GEMINI_API_KEY', 'proxy-injected')})
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.load(r)
            found = json.loads(''.join(p.get('text', '') for p in resp['candidates'][0]['content']['parts']))['found']
            return c0, c1, found
        except Exception as e:  # noqa: BLE001
            print(f"clip {c0}: retry {attempt + 1} ({e})", file=sys.stderr)
    return c0, c1, []


starts = []
c = 0.0
while c < dur - 1:
    starts.append(round(c, 2))
    c += args.hop
with ThreadPoolExecutor(max_workers=6) as ex:
    results = list(ex.map(ask, starts))

est = {pid: [] for pid in order}
ends = {pid: [] for pid in order}
for c0, c1, found in results:
    for f in found:
        if f['id'] not in est:
            continue
        rel = f['start']
        edge = min(rel, (c1 - c0) - rel)
        w = 1.0 if edge > 0.6 else 0.3
        est[f['id']].append((c0 + rel, w, c0))
        if f['end'] < (c1 - c0) - 0.05:
            ends[f['id']].append(c0 + f['end'])

fused = []
for pid in order:
    xs = est[pid]
    if not xs:
        fused.append({'id': pid, 'start': None, 'n': 0, 'spread': None, 'rough': round(rough_start(pid), 2)})
        continue
    good = [x for x, w, _ in xs if w == 1.0] or [x for x, _, _ in xs]
    s = statistics.median(good)
    fused.append({'id': pid, 'start': round(s, 3), 'end': round(statistics.median(ends[pid]), 3) if ends[pid] else None,
                  'n': len(xs), 'spread': round(max(good) - min(good), 3), 'all': [round(x, 2) for x, _, _ in xs],
                  'rough': round(rough_start(pid), 2)})
json.dump({'duration': dur, 'phrases': fused, 'clips': [{'c0': a, 'c1': b, 'found': f} for a, b, f in results]},
          open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for f in fused:
    print(f"{f['id']:10s} start={f['start']!s:>7} n={f['n']} spread={f['spread']!s:>6} rough={f['rough']:6.2f}  {text_of[f['id']]}")
