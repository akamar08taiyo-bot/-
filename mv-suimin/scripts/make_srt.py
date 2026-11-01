#!/usr/bin/env python3
"""Write out/<name>.srt from src/data/timing.json (one cue per lyric line)."""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
name = sys.argv[1] if len(sys.argv) > 1 else 'mv-suimin'
timing = json.load(open(os.path.join(ROOT, 'src', 'data', 'timing.json'), encoding='utf-8'))


def ts(x):
    ms = int(round(x * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


cues = []
for l in timing['lines']:
    end = min(l['end'], timing['cut']) if l['section'] == 'final' else l['end']
    cues.append((l['start'], end, l['text']))
os.makedirs(os.path.join(ROOT, 'out'), exist_ok=True)
path = os.path.join(ROOT, 'out', f'{name}.srt')
with open(path, 'w', encoding='utf-8') as f:
    for i, (a, b, text) in enumerate(cues, 1):
        f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{text}\n\n")
print(path, len(cues), 'cues')
