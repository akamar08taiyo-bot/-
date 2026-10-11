# Gemini に音を聴いてもらい、内容と問題点を JSON で返す（私は音を聞けないため）
# 使い方: python3 -I scripts/audio_qa.py <audio file> [context]
import base64, json, subprocess, sys, tempfile, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import _gemini  # noqa: E402,F401  鍵の扱い（GEMINI_API_KEY）
src = Path(sys.argv[1]); ctx = sys.argv[2] if len(sys.argv) > 2 else ''
tmp = Path(tempfile.mkdtemp()) / 'a.mp3'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-vn', '-ac', '1', '-ar', '32000', '-b:a', '96k', str(tmp)], check=True)
prompt = ('You are a meticulous sound engineer. Listen carefully to this audio clip' + (f' (it is meant to be: {ctx})' if ctx else '') + '. '
          'Return ONLY compact JSON with keys: "sounds" (list of short descriptions with approximate timestamps), '
          '"music" (true/false and what), "speech_or_voice" (true/false and what, include crowd chatter, singing, humming), '
          '"artifacts" (clicks, distortion, phasing, metallic or robotic smearing, abrupt cuts, harsh highs, hum — list with timestamps, or empty), '
          '"naturalness" (1-5), "loudness_balance" (short comment), "verdict" ("use", "use_low", or "discard") and "reason".')
body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/mp3', 'data': base64.b64encode(tmp.read_bytes()).decode()}}, {'text': prompt}]}],
        'generationConfig': {'temperature': 0.2, 'responseMimeType': 'application/json'}}
req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=300) as r:
    d = json.loads(r.read())
txt = ''.join(p.get('text', '') for p in d['candidates'][0]['content']['parts'])
print(txt)
