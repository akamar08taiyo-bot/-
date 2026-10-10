#!/usr/bin/env python3
"""Generate one image with a Gemini image model. Optional reference images."""
import json, sys, urllib.request, urllib.error, argparse, base64, time, mimetypes
ap = argparse.ArgumentParser()
ap.add_argument("--model", default="gemini-3-pro-image")
ap.add_argument("--prompt", required=True)
ap.add_argument("--ref", action="append", default=[])
ap.add_argument("--aspect", default="16:9")
ap.add_argument("--size", default="2K")
ap.add_argument("--out", required=True)
a = ap.parse_args()
parts = []
for r in a.ref:
    mt = mimetypes.guess_type(r)[0] or "image/png"
    parts.append({"inline_data": {"mime_type": mt, "data": base64.b64encode(open(r, "rb").read()).decode()}})
parts.append({"text": a.prompt})
gc = {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": a.aspect}}
if a.size: gc["imageConfig"]["imageSize"] = a.size
body = {"contents": [{"role": "user", "parts": parts}], "generationConfig": gc}
url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
t = time.time()
for attempt in range(3):
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.load(r)
        break
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:600].replace("\n", " ")
        print("HTTP", e.code, msg, file=sys.stderr)
        if e.code in (429, 500, 502, 503) and attempt < 2:
            time.sleep(10 * (attempt + 1)); continue
        sys.exit(1)
saved = False; texts = []
for c in d.get("candidates", []):
    for p in c.get("content", {}).get("parts", []):
        inl = p.get("inlineData") or p.get("inline_data")
        if inl and not saved:
            open(a.out, "wb").write(base64.b64decode(inl["data"])); saved = True
        elif "text" in p:
            texts.append(p["text"])
print(("saved " + a.out) if saved else "NO IMAGE", f"{time.time()-t:.1f}s", d.get("usageMetadata", {}).get("candidatesTokenCount"), " ".join(texts)[:200])
if not saved:
    print(json.dumps(d)[:1000], file=sys.stderr); sys.exit(2)
