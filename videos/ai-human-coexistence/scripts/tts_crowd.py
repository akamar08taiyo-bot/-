# 夏祭りのざわめき素材：短い会話を複数の声で Gemini TTS に読ませる
import base64, json, urllib.request, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
root = Path(__file__).resolve().parent.parent
out = root / 'audio' / 'src' / 'crowd'
LINES = [
    ('Leda', 'Say cheerfully like a small child at a summer festival, not too loud', 'わあ、金魚すくいだ。やってみたい！'),
    ('Aoede', 'Say casually and softly, chatting with a friend', 'かき氷、いちごにしようかなあ。'),
    ('Charon', 'Say warmly like an old man, relaxed', '今年も、人が多いねえ。'),
    ('Puck', 'Say casually', '花火って、何時からだっけ？'),
    ('Kore', 'Say lightly', '八時四十分だって。まだちょっとあるね。'),
    ('Zephyr', 'Say happily like a child', 'ロボさん、ありがとう！'),
    ('Orus', 'Say gently', 'その浴衣、よく似合ってるよ。'),
    ('Leda', 'Say softly with wonder', 'ほら見て、提灯がきれい。'),
    ('Zephyr', 'Say excitedly like a child', 'お母さん、わたあめ買って！'),
    ('Sulafat', 'Say nostalgically like an elderly woman', '懐かしいねえ、この太鼓の音。'),
    ('Fenrir', 'Say like a friendly festival stall vendor, lively', 'はい、いらっしゃい、いらっしゃい！'),
    ('Puck', 'Say casually to a friend', 'あっちで盆踊り、始まったみたいだよ。'),
    ('Aoede', 'Laugh softly and say', 'ふふ、それ、去年もやったよね。'),
    ('Charon', 'Say calmly', 'ゆっくり行こう。まだ時間はあるから。'),
]
def run(k):
    voice, style, text = LINES[k]
    body = {'contents': [{'parts': [{'text': f'{style}: {text}'}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    part = d['candidates'][0]['content']['parts'][0]['inlineData']
    pcm = base64.b64decode(part['data'])
    rate = 24000
    if 'rate=' in part.get('mimeType', ''):
        rate = int(part['mimeType'].split('rate=')[1].split(';')[0])
    p = out / f'c{k:02d}.wav'
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return k, voice, round(len(pcm) / 2 / rate, 2)
with ThreadPoolExecutor(6) as ex:
    for res in ex.map(run, range(len(LINES))):
        print(res)
