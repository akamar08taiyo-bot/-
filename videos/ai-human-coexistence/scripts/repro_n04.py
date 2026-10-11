# N04 の採用版を、N04 生成台帳の実プロンプトどおりに旧版から再現する
# 使い方: python3 -I scripts/repro_n04.py <N04のID 例 S01_v2> <入力画像...>
import base64, hashlib, json, sys, time, urllib.request, fcntl
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
out_dir = root / 'assets' / 'n04_repro'
ledger_src = json.loads((root / 'assets' / 'n04' / 'generation_ledger.json').read_text())
target = sys.argv[1]
inputs = sys.argv[2:]
rec = next(r for r in ledger_src['records'] if r['id'] == target)

def part(p):
    p = Path(p)
    mime = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}[p.suffix.lower()]
    return {'inlineData': {'mimeType': mime, 'data': base64.b64encode(p.read_bytes()).decode()}}

parts = [part(p) for p in inputs] + [{'text': rec['prompt']}]
body = {'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '16:9', 'imageSize': '2K'}}}
req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent',
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
lock = open(out_dir / '.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
n = 1
while (out_dir / f'{target}r{n}.jpg').exists():
    n += 1
out = out_dir / f'{target}r{n}.jpg'
out.write_bytes(img)
w, h = Image.open(out).size
lp = out_dir / 'ledger.json'
led = json.loads(lp.read_text()) if lp.exists() else {'note': 'N04 採用版の再現。N04 生成台帳の実プロンプトをそのまま使い、手元にある旧版（アップロードされた webp）を入力にした。原本 PNG が届いたら原本を優先する。', 'records': []}
led['records'].append({'id': f'{target}r{n}', 'reproduces': target, 'file': out.name, 'inputs': [Path(p).name for p in inputs],
                       'model': 'gemini-3-pro-image', 'dimensions_px': [w, h], 'sha256': hashlib.sha256(img).hexdigest(),
                       'seconds': round(time.time() - t0, 1), 'created_utc': datetime.now(timezone.utc).isoformat(),
                       'usage': d.get('usageMetadata'), 'prompt_source': f'N04 generation_ledger.json sequence {rec["sequence"]}'})
lp.write_text(json.dumps(led, ensure_ascii=False, indent=1))
print(f'{out.relative_to(root)} {w}x{h} {time.time()-t0:.1f}s')
