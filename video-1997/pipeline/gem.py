#!/usr/bin/env python3
"""Minimal Gemini caller using SSE streaming (key is injected by the proxy)."""
import json, sys, urllib.request, urllib.error, argparse, time

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="gemini-3.8-flash")
ap.add_argument("--youtube", help="YouTube URL to attach as file_data")
ap.add_argument("--image", action="append", default=[], help="local image to attach (png/jpg)")
ap.add_argument("--prompt-file", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--low", action="store_true", help="low media resolution")
ap.add_argument("--search", action="store_true", help="enable google_search tool")
ap.add_argument("--start"); ap.add_argument("--end"); ap.add_argument("--fps", type=float)
ap.add_argument("--json", action="store_true", help="ask for application/json output")
ap.add_argument("--think", help="thinking level: minimal/low/medium/high")
a = ap.parse_args()

import base64, mimetypes
parts = []
if a.youtube:
    p = {"file_data": {"file_uri": a.youtube}}
    vm = {}
    if a.start: vm["start_offset"] = a.start
    if a.end: vm["end_offset"] = a.end
    if a.fps: vm["fps"] = a.fps
    if vm: p["video_metadata"] = vm
    parts.append(p)
for img in a.image:
    mt = mimetypes.guess_type(img)[0] or "image/png"
    parts.append({"inline_data": {"mime_type": mt, "data": base64.b64encode(open(img, "rb").read()).decode()}})
parts.append({"text": open(a.prompt_file, encoding="utf-8").read()})
body = {"contents": [{"role": "user", "parts": parts}]}
gc = {}
if a.low: gc["mediaResolution"] = "MEDIA_RESOLUTION_LOW"
if a.json: gc["responseMimeType"] = "application/json"
if a.think: gc["thinkingConfig"] = {"thinkingLevel": a.think}
if gc: body["generationConfig"] = gc
if a.search: body["tools"] = [{"google_search": {}}]

url = f"https://generativelanguage.googleapis.com/v1beta/models/{a.model}:streamGenerateContent?alt=sse"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
t = time.time(); out = []; usage = None; grounding = []
try:
    with urllib.request.urlopen(req, timeout=900) as r:
        for raw in r:
            line = raw.decode("utf-8").strip()
            if not line.startswith("data:"): continue
            d = json.loads(line[5:])
            for c in d.get("candidates", []):
                for p in c.get("content", {}).get("parts", []):
                    if "text" in p and not p.get("thought"): out.append(p["text"])
                if c.get("groundingMetadata"): grounding.append(c["groundingMetadata"])
            usage = d.get("usageMetadata", usage)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:1500].replace("\n", " ")); sys.exit(1)
open(a.out, "w", encoding="utf-8").write("".join(out))
if grounding:
    json.dump(grounding, open(a.out + ".grounding.json", "w"), ensure_ascii=False, indent=1)
print(f"ok {time.time()-t:.1f}s usage={usage}")
