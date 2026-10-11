# 完成動画を Gemini に見てもらう（参照動画と並べて比較レビュー）
# 使い方: python3 -I scripts/review_video.py <完成動画.mp4> <出力.json>
# 480p の軽い版を作って Files API に上げ、参照動画（YouTube）と一緒に渡す
import json, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import _gemini  # noqa: E402,F401  鍵の扱い（GEMINI_API_KEY）
src, out = Path(sys.argv[1]), Path(sys.argv[2])
API = 'https://generativelanguage.googleapis.com'
tmp = Path(tempfile.mkdtemp()) / 'proxy.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-vf', 'scale=854:480', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
                '-c:a', 'aac', '-b:a', '96k', str(tmp)], check=True)
data = tmp.read_bytes()
# 再開可能アップロード（開始 → 本体）
req = urllib.request.Request(f'{API}/upload/v1beta/files', method='POST', data=json.dumps({'file': {'display_name': src.stem}}).encode(),
                             headers={'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
                                      'X-Goog-Upload-Header-Content-Length': str(len(data)), 'X-Goog-Upload-Header-Content-Type': 'video/mp4',
                                      'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=120) as r:
    up = r.headers['X-Goog-Upload-URL']
req = urllib.request.Request(up, method='POST', data=data, headers={'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize',
                                                                     'Content-Length': str(len(data))})
with urllib.request.urlopen(req, timeout=600) as r:
    f = json.loads(r.read())['file']
name = f['name']
while f.get('state') != 'ACTIVE':
    time.sleep(5)
    with urllib.request.urlopen(f'{API}/v1beta/{name}', timeout=60) as r:
        f = json.loads(r.read())
    if f.get('state') == 'FAILED':
        sys.exit('upload failed')
prompt = '''動画1は参照作品（YouTube「存在しない街の記憶」の一本）、動画2はそのテーマを真似て新しく作った作品「AIと人間の共存」です。
動画2を、映像編集者・音響技師として厳しくレビューしてください。日本語の JSON だけを返してください。
{"theme_fidelity": {"score":1-5, "notes": 参照作品の「架空なのに懐かしい」テーマ・空気感をどこまで受け継いでいるか},
 "originality": {"score":1-5, "notes": 参照作品の固有の場面・構図・看板・ロゴ・言い回しを写していないか},
 "visual_issues": [{"time":"mm:ss","issue": 形の崩れ・不自然な動き・ちらつき・黒コマ・文字の重なりなど}],
 "text": {"readability":1-5, "notes": テロップ・章題・空中の電子版の読みやすさと出方},
 "pacing": {"score":1-5, "notes": カットの長さ・テンポ・つなぎ},
 "audio": {"score":1-5, "notes": 環境音・曲・声の自然さ、急な音量変化},
 "best_moments": ["mm:ss 理由"],
 "top_fixes": [優先度の高い順に、具体的な直し方]}'''
body = {'contents': [{'role': 'user', 'parts': [
    {'fileData': {'fileUri': 'https://www.youtube.com/watch?v=tGJRlrAXIoE'}, 'videoMetadata': {'fps': 0.5}},
    {'fileData': {'fileUri': f['uri'], 'mimeType': 'video/mp4'}, 'videoMetadata': {'fps': 1}},
    {'text': prompt}]}],
    'generationConfig': {'temperature': 0.2, 'responseMimeType': 'application/json', 'mediaResolution': 'MEDIA_RESOLUTION_LOW'}}
for attempt in range(3):
    try:
        req = urllib.request.Request(f'{API}/v1beta/models/gemini-3.8-flash:generateContent', data=json.dumps(body).encode(),
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=900) as r:
            d = json.loads(r.read())
        break
    except Exception as e:
        print('retry', attempt, e); time.sleep(5)
txt = ''.join(p.get('text', '') for p in d['candidates'][0]['content']['parts'] if not p.get('thought'))
out.write_text(txt, encoding='utf-8')
print(json.dumps(json.loads(txt), ensure_ascii=False, indent=1))
# 後片付け（アップロードした動画を消す）
try:
    urllib.request.urlopen(urllib.request.Request(f'{API}/v1beta/{name}', method='DELETE'), timeout=60)
except Exception:
    pass
