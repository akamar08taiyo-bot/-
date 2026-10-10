#!/usr/bin/env python3
"""Lyria で曲を1つ作る（generateContent）。最初の音声を --out に保存（mp3）。

  python3 lyria.py --model lyria-3.5 --prompt "Instrumental only, ..." --out M1.mp3   # 約2分半
  python3 lyria.py --model lyria-3-clip-preview --prompt "..." --out M0.mp3          # 30秒
"""
import json, os, sys, urllib.request, urllib.error, argparse, base64, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gapi import BASE, HEADERS
ap = argparse.ArgumentParser()
ap.add_argument("--model", default="lyria-3-clip-preview")
ap.add_argument("--prompt", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
body = {"contents": [{"role": "user", "parts": [{"text": a.prompt}]}]}
url = f"{BASE}/models/{a.model}:generateContent"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=HEADERS)
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
            fn = a.out if n == 0 else a.out + f".{n}"
            open(fn, "wb").write(base64.b64decode(inl["data"])); n += 1
            print("audio", inl.get("mimeType"), fn)
        elif "text" in p: texts.append(p["text"])
print(f"{time.time()-t:.1f}s parts={n} text={' '.join(texts)[:300]!r} usage={d.get('usageMetadata')}")
if n == 0: sys.exit(2)
