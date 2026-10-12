# 全カットの点検：顔が映っていないか、実在のブランド・チェーン店に似た物がないか（作品の約束：顔は見せない・実在のブランドは出さない）
# 2026年10月：第二章 v10 で、原画の作り直しの途中に置いた止め絵（D2 の全体、前の B1v）に顔と実在のコンビニに似た看板が残っていたのを、
#   納品のあとで見つけた。人の目の点検だけでは見落とすので、書き出したカットを Gemini にも見せて、怪しいコマを挙げさせる
# 使い方: python3 -I scripts/qa_faces.py [ID ...]   （省略時は timeline の全カット。out/shots/<ID>.mp4 の 20%・50%・85% のコマ）
# 出力: work/qa_faces/<ID>.jpg（3コマ並べた画像）と work/qa_faces/report.json。怪しいカットは最後に一覧で出す（このあと必ず目で確かめる）
import base64, json, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import _gemini  # noqa: E402,F401  鍵の扱い（GEMINI_API_KEY）
from PIL import Image

root = Path(__file__).resolve().parent.parent
T = json.loads((root / 'src' / 'timeline.json').read_text(encoding='utf-8'))
ids = sys.argv[1:] or [s['id'] for s in T['shots']]
S = {s['id']: s for s in T['shots']}
out = root / 'work' / 'qa_faces'; out.mkdir(parents=True, exist_ok=True)
PROMPT = ('These are three frames from one shot of a calm, invented Japanese town film. The film has two strict rules: '
          '(1) no human face may be visible — people must be seen from behind, far away, or as hands only; a face counts as visible when eyes, nose '
          'or mouth can be made out, including a profile or a three-quarter view; tiny far-away passers-by whose features cannot be made out are fine; '
          'robots are not people. (2) No real-world brand, logo, chain-store trade dress (for example a convenience store, fast-food or coffee chain look), '
          'product, vehicle livery or famous character may appear or be strongly suggested. Invented shop names like つぎ家 or つぎマート are fine '
          'unless their colors and layout copy a real chain. Return ONLY compact JSON: {"faces": [{"frame": 1-3, "where": "...", "how_clear": "low|medium|high"}], '
          '"brands": [{"frame": 1-3, "where": "...", "resembles": "...", "strength": "low|medium|high"}]}. Use empty lists when nothing is found.')


def frames(sid):
    dur = S[sid]['dur']; ims = []
    for k in (0.2, 0.5, 0.85):
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{dur * k:.2f}', '-i', str(root / 'out' / 'shots' / f'{sid}.mp4'), '-frames:v', '1',
                              '-vf', 'scale=1280:-2', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '3', '-'], capture_output=True).stdout
        ims.append(raw)
    return ims


def check(sid):
    ims = [b for b in frames(sid) if b]
    if not ims: return sid, {'error': 'no frames'}
    import io
    pics = [Image.open(io.BytesIO(b)) for b in ims]
    sheet = Image.new('RGB', (sum(p.width for p in pics), max(p.height for p in pics)))
    x = 0
    for p in pics: sheet.paste(p, (x, 0)); x += p.width
    sheet.save(out / f'{sid}.jpg', quality=85)
    parts = [{'inlineData': {'mimeType': 'image/jpeg', 'data': base64.b64encode(b).decode()}} for b in ims] + [{'text': PROMPT}]
    body = {'contents': [{'role': 'user', 'parts': parts}], 'generationConfig': {'temperature': 0.1, 'responseMimeType': 'application/json'}}
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
                                 data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=300).read())
        return sid, json.loads(''.join(p.get('text', '') for p in d['candidates'][0]['content']['parts']))
    except Exception as e:  # noqa: BLE001
        return sid, {'error': str(e)[:200]}


rep = {}
with ThreadPoolExecutor(6) as ex:
    for sid, r in ex.map(check, ids):
        rep[sid] = r
(out / 'report.json').write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding='utf-8')
for sid, r in rep.items():
    f = [x for x in r.get('faces', []) if x.get('how_clear') in ('medium', 'high')]
    b = [x for x in r.get('brands', []) if x.get('strength') in ('medium', 'high')]
    if f or b or r.get('error'):
        print(sid, S[sid]['name'], '| faces:', f, '| brands:', b, r.get('error', ''))
print('checked', len(rep), 'shots ->', out / 'report.json')
