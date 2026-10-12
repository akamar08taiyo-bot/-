# 終わりのあいさつ（ナレーション）を Gemini TTS で何通りか作る → audio/src/outro/<声>.wav
# 使い方: python3 -I scripts/tts_outro.py "〇〇の一日に、最後までお付き合いいただき、ありがとうございました。また、この町でお会いしましょう。" [--voices Algieba,Charon,Iapetus,Schedar]
# 注意：
#  - 文に「Say slowly…:」のような英語の指示を前置きすると、その指示まで読み上げることがある。既定では指示を付けない。
#    --style を付けた場合は、最初の無音までを自動で切り落とす（指示の読み上げを消すため）。
#  - 漢字の地名は読み違えやすい（継町→つるみちょう等）。地名はひらがなで書く。
#  - できたものは audio_qa.py で聞き比べ（読み・自然さ）、一番よいものを使う。
import argparse, base64, json, subprocess, urllib.request, wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent)); import _gemini  # noqa: E402,F401  鍵の扱い（GEMINI_API_KEY）
root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('text'); ap.add_argument('--voices', default='Algieba,Charon,Iapetus,Schedar')
ap.add_argument('--style', default=''); ap.add_argument('--model', default='gemini-3.8-flash-tts')
a = ap.parse_args()
out = root / 'audio' / 'src' / 'outro'; out.mkdir(parents=True, exist_ok=True)
def run(v):
    text = f'{a.style}: {a.text}' if a.style else a.text
    body = {'contents': [{'parts': [{'text': text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': v}}}}}
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.loads(r.read())
    part = d['candidates'][0]['content']['parts'][0]['inlineData']
    pcm = base64.b64decode(part['data'])
    rate = int(part['mimeType'].split('rate=')[1].split(';')[0]) if 'rate=' in part.get('mimeType', '') else 24000
    raw = out / f'{v}_raw.wav'
    with wave.open(str(raw), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    dst = out / f'{v}.wav'
    start = 0.0
    if a.style:  # 指示の読み上げを切る：最初に 0.6 秒以上の無音が終わる所から
        log = subprocess.run(['ffmpeg', '-i', str(raw), '-af', 'silencedetect=n=-40dB:d=0.6', '-f', 'null', '-'], capture_output=True, text=True).stderr
        ends = [float(l.split('silence_end: ')[1].split(' ')[0]) for l in log.splitlines() if 'silence_end' in l]
        start = max(0.0, ends[0] - 0.1) if ends else 0.0
    # 前後の無音を詰め、終わりを 0.25 秒で閉じる
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(raw), '-af',
                    'afade=t=in:d=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=0.25,areverse', str(dst)], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(dst)], capture_output=True, text=True).stdout)
    return v, round(dur, 2)
with ThreadPoolExecutor(4) as ex:
    for res in ex.map(run, a.voices.split(',')):
        print(res)
