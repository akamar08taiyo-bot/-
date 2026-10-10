#!/usr/bin/env python3
import json, sys, urllib.request, urllib.error, time
model, prompt, out = sys.argv[1], open(sys.argv[2], encoding="utf-8").read(), sys.argv[3]
body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "tools": [{"url_context": {}}]}
url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
t = time.time(); res = []; meta = []
try:
    with urllib.request.urlopen(req, timeout=600) as r:
        for raw in r:
            line = raw.decode().strip()
            if not line.startswith("data:"): continue
            d = json.loads(line[5:])
            for c in d.get("candidates", []):
                for p in c.get("content", {}).get("parts", []):
                    if "text" in p and not p.get("thought"): res.append(p["text"])
                if c.get("urlContextMetadata"): meta.append(c["urlContextMetadata"])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:800].replace("\n", " ")); sys.exit(1)
open(out, "w").write("".join(res)); print("ok", round(time.time()-t,1), json.dumps(meta, ensure_ascii=False)[:600])
