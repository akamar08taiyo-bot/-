"""Gemini API の呼び出し（クラウド環境ではキーがプロキシで自動付与。ローカルでは GEMINI_API_KEY を使う）。
キーは表示・出力しない。"""
import base64, json, os, time, urllib.error, urllib.request, wave

BASE = 'https://generativelanguage.googleapis.com/v1beta'
HEADERS = {'Content-Type': 'application/json'}
if os.environ.get('GEMINI_API_KEY'):
    HEADERS['x-goog-api-key'] = os.environ['GEMINI_API_KEY']


def call(model, body, timeout=600, tries=4):
    url = f'{BASE}/models/{model}:generateContent'
    data = json.dumps(body).encode()
    for k in range(tries):
        req = urllib.request.Request(url, data=data, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:600].replace('\n', ' ')
            if k < tries - 1 and (e.code >= 500 or e.code == 429):
                time.sleep(4 * (k + 1))
                continue
            raise RuntimeError(f'HTTP {e.code}: {msg}')
        except (urllib.error.URLError, TimeoutError) as e:
            if k < tries - 1:
                time.sleep(4 * (k + 1))
                continue
            raise


def text_of(d):
    out = []
    for c in d.get('candidates', []):
        for p in c.get('content', {}).get('parts', []):
            if 'text' in p and not p.get('thought'):
                out.append(p['text'])
    return ''.join(out).strip()


def part_file(path):
    ext = os.path.splitext(path)[1].lower()
    mime = {'.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.png': 'image/png',
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4'}[ext]
    return {'inlineData': {'mimeType': mime, 'data': base64.b64encode(open(path, 'rb').read()).decode()}}


def ask(prompt, files=(), model='gemini-3.8-flash', think='low', json_out=False):
    parts = [part_file(f) for f in files] + [{'text': prompt}]
    cfg = {'thinkingConfig': {'thinkingLevel': think}}
    if json_out:
        cfg['responseMimeType'] = 'application/json'
    d = call(model, {'contents': [{'role': 'user', 'parts': parts}], 'generationConfig': cfg})
    return text_of(d)


def tts(text, voice, out, model='gemini-3.8-flash-tts'):
    body = {'contents': [{'role': 'user', 'parts': [{'text': text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'],
                                 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
    d = call(model, body, timeout=300)
    inl = d['candidates'][0]['content']['parts'][0]['inlineData']
    raw = base64.b64decode(inl['data'])
    mt = inl.get('mimeType', '')
    if raw[:4] == b'RIFF':
        open(out, 'wb').write(raw)
    else:
        rate = 24000
        if 'rate=' in mt:
            rate = int(mt.split('rate=')[1].split(';')[0])
        with wave.open(out, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(raw)
    with wave.open(out) as w:
        return w.getnframes() / w.getframerate()


def image(prompt, out, refs=(), model='gemini-3-pro-image', aspect='9:16', size='2K'):
    parts = [part_file(r) for r in refs] + [{'text': prompt}]
    body = {'contents': [{'role': 'user', 'parts': parts}],
            'generationConfig': {'responseModalities': ['IMAGE'],
                                 'imageConfig': {'aspectRatio': aspect, 'imageSize': size}}}
    d = call(model, body, timeout=600)
    notes = []
    for c in d.get('candidates', []):
        for p in c.get('content', {}).get('parts', []):
            if 'inlineData' in p:
                open(out, 'wb').write(base64.b64decode(p['inlineData']['data']))
                return d.get('usageMetadata'), notes
            if 'text' in p:
                notes.append(p['text'])
    raise RuntimeError('no image: ' + json.dumps(d, ensure_ascii=False)[:800])
