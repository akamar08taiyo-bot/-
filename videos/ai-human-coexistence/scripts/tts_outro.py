# 終わりのあいさつ（参照動画の締めくくりの型：視聴への感謝と再会のあいさつ）。文面はオリジナル
import base64, json, urllib.request, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
root = Path(__file__).resolve().parent.parent
out = root / 'audio' / 'src' / 'outro'
TEXT = 'つぎまちの一日に、最後までお付き合いいただき、ありがとうございました。また、この町でお会いしましょう。'  # 町名は読み違い防止でひらがな
STYLE = 'Say slowly and gently, in a calm warm voice'
VOICES = ['Charon', 'Algieba', 'Iapetus', 'Schedar']
def run(v):
    body = {'contents': [{'parts': [{'text': f'{STYLE}: {TEXT}'}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': v}}}}}
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    part = d['candidates'][0]['content']['parts'][0]['inlineData']
    pcm = base64.b64decode(part['data'])
    rate = int(part['mimeType'].split('rate=')[1].split(';')[0]) if 'rate=' in part.get('mimeType', '') else 24000
    p = out / f'{v}.wav'
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return v, round(len(pcm) / 2 / rate, 2)
with ThreadPoolExecutor(4) as ex:
    for res in ex.map(run, VOICES):
        print(res)
