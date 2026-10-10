#!/usr/bin/env python3
"""Generate music with a Lyria model through generateContent; saves first audio part."""
import json, sys, urllib.request, urllib.error, argparse, base64, time
ap = argparse.ArgumentParser()
ap.add_argument("--model", default="lyria-3-clip-preview")
ap.add_argument("--prompt", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
body = {"contents": [{"role": "user", "parts": [{"text": a.prompt}]}]}
url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
t = time.time()
try:
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.load(r)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:800].replace("\n", " ")); sys.exit(1)
n = 0; texts = []
for c in d.get("candidates", []):
    for p in c.get("content", {}).get("parts", []):
        inl = p.get("inlineData")
        if inl:
            ext = {"audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/L16": "pcm"}.get(inl.get("mimeType", ""), "bin")
            fn = a.out if n == 0 else a.out + f".{n}"
            open(fn, "wb").write(base64.b64decode(inl["data"])); n += 1
            print("audio", inl.get("mimeType"), fn)
        elif "text" in p: texts.append(p["text"])
print(f"{time.time()-t:.1f}s parts={n} text={' '.join(texts)[:300]!r} usage={d.get('usageMetadata')}")
