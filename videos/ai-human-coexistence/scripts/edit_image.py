# Gemini で既存画像を部分修正する（他は変えない）
# 使い方: python3 -I scripts/edit_image.py <src> <SCENE_ID> "<instruction>" [--refs a,b]
import argparse, base64, hashlib, json, sys, time, urllib.request, fcntl
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
gen = root / 'assets' / 'gen'
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('scene'); ap.add_argument('instruction')
ap.add_argument('--refs', default=''); ap.add_argument('--model', default='gemini-3-pro-image'); ap.add_argument('--size', default='2K')
a = ap.parse_args()

def part(p):
    p = Path(p)
    mime = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}[p.suffix.lower()]
    return {'inlineData': {'mimeType': mime, 'data': base64.b64encode(p.read_bytes()).decode()}}

parts = [part(a.src)] + [part(r) for r in a.refs.split(',') if r]
text = ('Edit the FIRST supplied photograph narrowly. Keep the exact camera framing, composition, lighting, colors, people, '
        'materials and every other object unchanged, and keep it photorealistic. ' + a.instruction +
        (' Use the other supplied image(s) only as a design reference for that change.' if len(parts) > 1 else ''))
parts.append({'text': text})
body = {'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '16:9', 'imageSize': a.size}}}
req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent',
                             data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=600) as res:
        d = json.loads(res.read())
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:1500]); sys.exit(1)
img = None
for c in d.get('candidates', []):
    for p in c.get('content', {}).get('parts', []):
        if 'inlineData' in p:
            img = base64.b64decode(p['inlineData']['data'])
if img is None:
    print('NO IMAGE', json.dumps(d, ensure_ascii=False)[:1500]); sys.exit(2)
lock = open(gen / '.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
n = 1
while any((gen / f'{a.scene}_v{n}{e}').exists() for e in ('.png', '.jpg')):
    n += 1
out = gen / f'{a.scene}_v{n}.jpg'
out.write_bytes(img)
w, h = Image.open(out).size
led_path = gen / 'ledger.json'
led = json.loads(led_path.read_text())
led['records'].append({'id': f'{a.scene}_v{n}', 'file': out.name, 'operation': 'edit', 'source': Path(a.src).name, 'model': a.model,
                       'dimensions_px': [w, h], 'sha256': hashlib.sha256(img).hexdigest(), 'bytes': len(img),
                       'reference_files': [Path(r).name for r in a.refs.split(',') if r], 'seconds': round(time.time() - t0, 1),
                       'created_utc': datetime.now(timezone.utc).isoformat(), 'usage': d.get('usageMetadata'), 'prompt': text})
led_path.write_text(json.dumps(led, ensure_ascii=False, indent=1))
print(f'{out.relative_to(root)} {w}x{h} {time.time()-t0:.1f}s')
