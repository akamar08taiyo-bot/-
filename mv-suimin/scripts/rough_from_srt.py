#!/usr/bin/env python3
"""Rough phrase timing from a line-level SRT (e.g. the lyric track embedded in the song file).

usage: python3 scripts/rough_from_srt.py <lyrics.srt> [--out work/align_srt.json]

Each SRT cue whose text matches a lyric line gives that line's start (and the next cue's start as
its end). Phrases inside a line are placed by mora weight over the sung part of the cue; the punchline
line (split out of the final line in lyrics.json) is matched as the second half of that cue.
build_timing.py then snaps every phrase onto the nearest breath gap.
"""
import argparse, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument('srt')
ap.add_argument('--out', default=os.path.join(ROOT, 'work', 'align_srt.json'))
ap.add_argument('--sung', type=float, default=0.93, help='fraction of a cue that is sung')
args = ap.parse_args()


def secs(s):
    h, m, rest = s.split(':')
    sec, ms = rest.split(',')
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000


cues = []
for block in re.split(r'\n\s*\n', open(args.srt, encoding='utf-8').read().strip()):
    rows = block.strip().splitlines()
    if len(rows) < 3:
        continue
    a, b = [secs(x.strip()) for x in rows[1].split('-->')]
    text = ''.join(rows[2:]).strip()
    cues.append((a, b, text))
lyric_cues = [c for c in cues if not c[2].startswith('[')]


def morae(s):
    w = 0.0
    for ch in s:
        if ch in 'ゃゅょャュョぁぃぅぇぉァィゥェォ':
            w += 0.3
        elif re.match(r'[぀-ヿ]', ch):
            w += 1.0
        elif re.match(r'[一-鿿]', ch):
            w += 1.7
        elif re.match(r'[A-Za-z]', ch):
            w += 0.55
        elif ch == 'ー':
            w += 0.8
        else:
            w += 0.2
    return w


lyrics = json.load(open(os.path.join(ROOT, 'src', 'data', 'lyrics.json'), encoding='utf-8'))
items = []  # (id, text) per phrase, in order
for s in lyrics['sections']:
    for l in s['lines']:
        for i, p in enumerate(l['phrases']):
            items.append((f"{l['id']}#{i}", p))

norm = lambda s: re.sub(r'\s|　', '', s)
out = []
k = 0
for a, b, text in lyric_cues:
    target = norm(text)
    group = []
    acc = ''
    while k < len(items) and len(acc) < len(target):
        group.append(items[k])
        acc += norm(items[k][1])
        k += 1
    if acc != target:
        raise SystemExit(f"cue '{text}' does not match lyrics phrases {group}")
    weights = [morae(t) for _, t in group]
    span = (b - a) * args.sung
    pos = a
    for (pid, t), w in zip(group, weights):
        d = span * w / sum(weights)
        out.append({'id': pid, 'start': round(pos, 3), 'end': round(pos + d, 3)})
        pos += d
if k != len(items):
    raise SystemExit(f'unmatched phrases: {items[k:]}')
json.dump({'source': os.path.basename(args.srt), 'phrases': out}, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'wrote {args.out}: {len(out)} phrases')
