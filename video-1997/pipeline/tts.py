#!/usr/bin/env python3
"""Gemini TTS: one line -> 24kHz mono wav."""
import json, sys, urllib.request, urllib.error, argparse, base64, time, wave
ap = argparse.ArgumentParser()
ap.add_argument("--model", default="gemini-3.8-flash-tts")
ap.add_argument("--voice", default="Puck")
ap.add_argument("--text", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
body = {"contents": [{"role": "user", "parts": [{"text": a.text}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": a.voice}}}}}
url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
t = time.time()
for attempt in range(3):
    try:
        with urllib.request.urlopen(req, timeout=300) as r: d = json.load(r)
        break
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:500].replace("\n", " "), file=sys.stderr)
        if attempt < 2 and e.code >= 500: time.sleep(5); continue
        sys.exit(1)
inl = d["candidates"][0]["content"]["parts"][0]["inlineData"]
raw = base64.b64decode(inl["data"]); mt = inl.get("mimeType", "")
if raw[:4] == b"RIFF":
    open(a.out, "wb").write(raw)
    with wave.open(a.out) as w: dur = w.getnframes() / w.getframerate(); rate = w.getframerate()
else:
    rate = 24000
    if "rate=" in mt: rate = int(mt.split("rate=")[1].split(";")[0])
    with wave.open(a.out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(raw)
    dur = len(raw) / 2 / rate
print(f"saved {a.out} {dur:.2f}s rate={rate} mime={mt} {time.time()-t:.1f}s")
