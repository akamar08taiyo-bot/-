#!/usr/bin/env python3
"""Veo（画像→動画）。predictLongRunning を投げて完了を待ち、mp4 を保存する。費用がかかる（1080p 8秒で約$0.64）。

  python3 veo.py --image in.png --prompt "..." --out clip.mp4 [--model veo-3.1-lite-generate-preview] [--seconds 8] [--res 1080p]
"""
import json, os, sys, time, base64, argparse, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gapi import BASE, HEADERS
ap = argparse.ArgumentParser()
ap.add_argument("--image"); ap.add_argument("--prompt", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--model", default="veo-3.1-lite-generate-preview"); ap.add_argument("--seconds", type=int, default=8)
ap.add_argument("--res", default="1080p"); ap.add_argument("--person", default="allow_adult")
a = ap.parse_args()
inst = {"prompt": a.prompt}
if a.image:
    mt = "image/png" if a.image.endswith(".png") else "image/jpeg"
    inst["image"] = {"bytesBase64Encoded": base64.b64encode(open(a.image, "rb").read()).decode(), "mimeType": mt}
body = {"instances": [inst], "parameters": {"aspectRatio": "16:9", "durationSeconds": a.seconds, "resolution": a.res, "personGeneration": a.person}}
def call(url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)
try:
    op = call(f"{BASE}/models/{a.model}:predictLongRunning", body)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:800].replace("\n", " ")); sys.exit(1)
name = op["name"]; t0 = time.time()
while True:
    time.sleep(10)
    st = call(f"{BASE}/{name}")
    if st.get("done"): break
    if time.time() - t0 > 900: print("timeout"); sys.exit(1)
if "error" in st: print("ERROR", json.dumps(st["error"])[:800]); sys.exit(1)
resp = st.get("response", {})
vids = resp.get("generateVideoResponse", {}).get("generatedSamples") or resp.get("generatedVideos") or []
if not vids:   # 安全フィルタで止められた場合など（理由が入っている）
    print("NO VIDEO", json.dumps(resp)[:1200]); sys.exit(2)
v = vids[0].get("video", vids[0])
if "bytesBase64Encoded" in v:
    open(a.out, "wb").write(base64.b64decode(v["bytesBase64Encoded"]))
else:
    req = urllib.request.Request(v.get("uri"), headers={k: x for k, x in HEADERS.items() if k != "Content-Type"})
    with urllib.request.urlopen(req, timeout=300) as r: open(a.out, "wb").write(r.read())
print(f"saved {a.out} {time.time()-t0:.0f}s")
