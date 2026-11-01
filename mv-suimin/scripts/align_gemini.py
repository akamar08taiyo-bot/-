#!/usr/bin/env python3
"""Align lyric phrases to a song with Gemini (audio understanding).

usage: python3 scripts/align_gemini.py <audio file> [--model gemini-3.8-flash] [--out work/align_raw.json]

Reads src/data/lyrics.json, sends the audio + lyrics to Gemini and asks for the
start/end second of every phrase. The raw answer is written to --out; run
scripts/build_timing.py afterwards to snap it onto onsets/beats and produce
src/data/timing.json.

The API key is not handled here: the request goes to generativelanguage.googleapis.com
with a placeholder key header (in this environment the proxy injects the real one;
elsewhere set GEMINI_API_KEY).
"""
import argparse, base64, json, mimetypes, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ap = argparse.ArgumentParser()
ap.add_argument('audio')
ap.add_argument('--model', default='gemini-3.8-flash')
ap.add_argument('--out', default=os.path.join(ROOT, 'work', 'align_raw.json'))
args = ap.parse_args()

lyrics = json.load(open(os.path.join(ROOT, 'src', 'data', 'lyrics.json'), encoding='utf-8'))
listing = []
for s in lyrics['sections']:
    for l in s['lines']:
        for i, p in enumerate(l['phrases']):
            listing.append(f"{l['id']}#{i} [{s['label']}] {p}")

prompt = (
    "You are a precise lyric-timing engineer. The attached audio is a Japanese rap song. "
    "Below is the full lyric, one phrase per row, with an id like 'v1-3#1'. The phrases are sung in this exact order.\n"
    "For EVERY id, return the time in seconds (2 decimals, measured from the very start of the file) when the vocal of that phrase "
    "begins (first consonant onset) and ends (last vowel release). Keep the order strictly increasing. "
    "Also return 'vocal_end' (when the last word ends) and 'music_end' (when all sound stops). "
    "If the song cuts the instruments right before the last phrase, return that cut time as 'cut'.\n\n"
    + "\n".join(listing)
)

schema = {
    "type": "OBJECT",
    "properties": {
        "phrases": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "id": {"type": "STRING"}, "start": {"type": "NUMBER"}, "end": {"type": "NUMBER"}},
            "required": ["id", "start", "end"]}},
        "vocal_end": {"type": "NUMBER"},
        "music_end": {"type": "NUMBER"},
        "cut": {"type": "NUMBER"},
    },
    "required": ["phrases", "vocal_end", "music_end"],
}

mime = mimetypes.guess_type(args.audio)[0] or 'audio/mpeg'
data = base64.b64encode(open(args.audio, 'rb').read()).decode()
body = {
    "contents": [{"role": "user", "parts": [
        {"inlineData": {"mimeType": mime, "data": data}},
        {"text": prompt},
    ]}],
    "generationConfig": {"responseMimeType": "application/json", "responseSchema": schema, "temperature": 0},
}
req = urllib.request.Request(
    f"https://generativelanguage.googleapis.com/v1beta/models/{args.model}:generateContent",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json", "x-goog-api-key": os.environ.get('GEMINI_API_KEY', 'proxy-injected')},
)
with urllib.request.urlopen(req, timeout=600) as r:
    resp = json.load(r)
text = ''.join(p.get('text', '') for p in resp['candidates'][0]['content']['parts'])
result = json.loads(text)
os.makedirs(os.path.dirname(args.out), exist_ok=True)
json.dump(result, open(args.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"wrote {args.out}: {len(result['phrases'])} phrases (expected {len(listing)})", file=sys.stderr)
for p in result['phrases']:
    print(f"{p['id']:10s} {p['start']:6.2f} - {p['end']:6.2f}")
print('vocal_end', result.get('vocal_end'), 'music_end', result.get('music_end'), 'cut', result.get('cut'))
