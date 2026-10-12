# Veo（画像→動画）で 8 秒の動きを作る
# 使い方: python3 -I scripts/veo.py <name> <image> "<prompt>" [--model veo-3.1-fast-generate-preview] [--res 1080p]
import argparse, base64, json, sys, time, urllib.request, hashlib
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import _gemini  # noqa: E402,F401  鍵の扱い（GEMINI_API_KEY）
root = Path(__file__).resolve().parent.parent
out_dir = root / 'assets' / 'veo'
ap = argparse.ArgumentParser()
ap.add_argument('name'); ap.add_argument('image'); ap.add_argument('prompt')
ap.add_argument('--model', default='veo-3.1-fast-generate-preview'); ap.add_argument('--res', default='1080p')
ap.add_argument('--neg', default='camera movement, zoom, cuts, text, subtitles, watermark, morphing, distortion, extra people, flicker')
a = ap.parse_args()
img = Path(a.image)
mime = 'image/png' if img.suffix.lower() == '.png' else 'image/jpeg'
body = {'instances': [{'prompt': a.prompt, 'image': {'bytesBase64Encoded': base64.b64encode(img.read_bytes()).decode(), 'mimeType': mime}}],
        'parameters': {'aspectRatio': '16:9', 'resolution': a.res, 'durationSeconds': 8, 'personGeneration': 'allow_adult'}}
if a.neg and 'lite' not in a.model:
    body['parameters']['negativePrompt'] = a.neg
base = 'https://generativelanguage.googleapis.com/v1beta'
def call(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, e.read().decode()[:2000]); sys.exit(1)
t0 = time.time()
op = call(f'{base}/models/{a.model}:predictLongRunning', body)
name = op['name']; print('operation', name, flush=True)
while True:
    time.sleep(10)
    st = call(f'{base}/{name}')
    if st.get('done'):
        break
if 'error' in st:
    print('ERROR', json.dumps(st['error'], ensure_ascii=False)); sys.exit(2)
resp = st.get('response', {})
samples = resp.get('generateVideoResponse', {}).get('generatedSamples', [])
if not samples:
    print('NO VIDEO', json.dumps(st, ensure_ascii=False)[:2000]); sys.exit(3)
uri = samples[0]['video']['uri']
with urllib.request.urlopen(urllib.request.Request(uri), timeout=300) as r:
    data = r.read()
n = 1
while (out_dir / f'{a.name}_v{n}.mp4').exists(): n += 1
out = out_dir / f'{a.name}_v{n}.mp4'
out.write_bytes(data)
lp = out_dir / 'ledger.json'
led = json.loads(lp.read_text()) if lp.exists() else {'records': []}
led['records'].append({'id': out.stem, 'model': a.model, 'resolution': a.res, 'input_image': img.name, 'prompt': a.prompt, 'negative': a.neg,
                       'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'seconds': round(time.time()-t0,1),
                       'created_utc': datetime.now(timezone.utc).isoformat()})
lp.write_text(json.dumps(led, ensure_ascii=False, indent=1))
print(out.relative_to(root), len(data), f'{time.time()-t0:.0f}s')
