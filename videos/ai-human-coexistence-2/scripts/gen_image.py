# Gemini で画像を生成・記録する
# 使い方: python3 -I scripts/gen_image.py N01 [--model gemini-3-pro-image] [--refs a.jpg,b.jpg] [--extra "追加指示"] [--size 2K]
import argparse, base64, hashlib, json, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import _gemini  # noqa: E402,F401  鍵の扱い（GEMINI_API_KEY）

root = Path(__file__).resolve().parent.parent
gen = root / 'assets' / 'gen'
ap = argparse.ArgumentParser()
ap.add_argument('scene')
ap.add_argument('--model', default='gemini-3-pro-image')
ap.add_argument('--refs', default='')
ap.add_argument('--extra', default='')
ap.add_argument('--size', default='2K')
ap.add_argument('--tag', default='')
a = ap.parse_args()

P = json.loads((gen / 'prompts.json').read_text())
scene = next(s for s in P['scenes'] if s['id'] == a.scene)
# 共通ブロックは場面ごとに選べる（例：昭和の回想だけ別の共通ブロック）。指定がなければ common
common = P.get('commons', {}).get(scene.get('common', ''), P['common'])
text = common + '\n\nSpecific scene (' + scene['time'] + '):\n' + scene['prompt']
if not a.refs and scene.get('refs'):  # 場面に参照画像が書いてあれば、それを使う
    a.refs = ','.join(str((root / r).resolve()) for r in scene['refs'])
if a.extra:
    text += '\n\nRevision notes:\n' + a.extra
parts = []
refs = [r for r in a.refs.split(',') if r]
for r in refs:
    p = Path(r)
    mime = 'image/jpeg' if p.suffix.lower() in ('.jpg', '.jpeg') else 'image/png' if p.suffix.lower() == '.png' else 'image/webp'
    parts.append({'inlineData': {'mimeType': mime, 'data': base64.b64encode(p.read_bytes()).decode()}})
if refs:
    # ref_note：参照画像の使い方を場面ごとに書き換える（同じ構図にしたい「対」のカットなど）
    note = scene.get('ref_note') or 'The supplied images are style references from the same fictional world. Match their photographic quality, light and materials; do not copy their composition, objects or camera position.'
    text = note + '\n\n' + text
parts.append({'text': text})
body = {
    'contents': [{'role': 'user', 'parts': parts}],
    'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '16:9', 'imageSize': a.size}},
}
url = f'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent'
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=600) as res:
        d = json.loads(res.read())
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:1500]); sys.exit(1)
dt = time.time() - t0
img = None
notes = []
for c in d.get('candidates', []):
    for p in c.get('content', {}).get('parts', []):
        if 'inlineData' in p:
            img = base64.b64decode(p['inlineData']['data']); mime = p['inlineData'].get('mimeType')
        elif 'text' in p:
            notes.append(p['text'])
if img is None:
    print('NO IMAGE', json.dumps(d, ensure_ascii=False)[:2000]); sys.exit(2)
import fcntl
lock = open(gen / '.lock', 'w'); fcntl.flock(lock, fcntl.LOCK_EX)
n = 1
while any((gen / f'{a.scene}_v{n}{e}').exists() for e in ('.png', '.jpg')):
    n += 1
ext = '.png' if 'png' in (mime or 'png') else '.jpg'
out = gen / f'{a.scene}_v{n}{ext}'
out.write_bytes(img)
from PIL import Image
w, h = Image.open(out).size
led_path = gen / 'ledger.json'
led = json.loads(led_path.read_text()) if led_path.exists() else {'project': root.name, 'records': []}
led['records'].append({
    'id': f'{a.scene}_v{n}', 'file': out.name, 'model': a.model, 'size': a.size, 'dimensions_px': [w, h],
    'sha256': hashlib.sha256(img).hexdigest(), 'bytes': len(img), 'reference_files': [Path(r).name for r in refs],
    'extra': a.extra, 'tag': a.tag, 'seconds': round(dt, 1), 'created_utc': datetime.now(timezone.utc).isoformat(),
    'usage': d.get('usageMetadata'), 'model_text': notes, 'prompt': text,
})
led_path.write_text(json.dumps(led, ensure_ascii=False, indent=1))
print(f'{out.relative_to(root)} {w}x{h} {dt:.1f}s usage={d.get("usageMetadata")}')
