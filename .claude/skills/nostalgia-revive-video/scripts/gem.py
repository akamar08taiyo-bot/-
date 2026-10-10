#!/usr/bin/env python3
"""Gemini を1回呼ぶ（SSE ストリーミング）。動画・画像・音声の添付、Google 検索、URL 読み込み、JSON 出力に対応。

  python3 gem.py --prompt-file p.txt --out a.md                                  # 文章だけ
  python3 gem.py --youtube URL --start 0s --end 300s --prompt-file p.txt --out a.md   # YouTube を直接読ませる（冒頭5分程度まで）
  python3 gem.py --image x.png --image y.wav --prompt-file p.txt --out a.json --json   # 画像・音声を添付
  python3 gem.py --search --think low --prompt-file p.txt --out a.md               # Google 検索つき（出典は .grounding.json）
  python3 gem.py --url-context --prompt-file p.txt --out a.md                      # 本文中の URL を読ませる
  python3 gem.py --video out/作品_プレビュー540p.mp4 --low --prompt-file review.txt --out review.md   # 大きな動画は Files API で上げて読ませる（完成動画のレビュー）
"""
import json, os, sys, urllib.request, urllib.error, argparse, time, base64, mimetypes
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gapi import BASE, HEADERS

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="gemini-3.8-flash")
ap.add_argument("--youtube", help="YouTube の URL（file_data として添付）")
ap.add_argument("--image", action="append", default=[], help="添付するファイル（画像・音声・短い動画。何個でも。合計20MBまで）")
ap.add_argument("--video", action="append", default=[], help="Files API で上げてから添付する大きなファイル（完成動画など。2GBまで）")
ap.add_argument("--prompt-file", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--low", action="store_true", help="動画・画像を低解像度で読む（長い動画向け）")
ap.add_argument("--search", action="store_true", help="google_search ツールを使う")
ap.add_argument("--url-context", action="store_true", help="url_context ツールを使う")
ap.add_argument("--start"); ap.add_argument("--end"); ap.add_argument("--fps", type=float)
ap.add_argument("--json", action="store_true", help="application/json で返させる")
ap.add_argument("--think", help="思考レベル minimal/low/medium/high（検索つきは low が通りやすい）")
a = ap.parse_args()

def upload(path):
    """Files API（resumable）でファイルを上げ、処理が終わるまで待って file_uri を返す"""
    mt = mimetypes.guess_type(path)[0] or "video/mp4"
    size = os.path.getsize(path)
    key = {k: v for k, v in HEADERS.items() if k != "Content-Type"}
    req = urllib.request.Request(BASE.replace("/v1beta", "/upload/v1beta") + "/files", data=json.dumps({"file": {"display_name": os.path.basename(path)}}).encode(),
                                 headers={**HEADERS, "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
                                          "X-Goog-Upload-Header-Content-Length": str(size), "X-Goog-Upload-Header-Content-Type": mt})
    with urllib.request.urlopen(req, timeout=120) as r: up = r.headers["X-Goog-Upload-URL"]
    req = urllib.request.Request(up, data=open(path, "rb").read(), method="POST",
                                 headers={**key, "Content-Length": str(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"})
    with urllib.request.urlopen(req, timeout=1800) as r: f = json.load(r)["file"]
    while f.get("state") == "PROCESSING":
        time.sleep(5)
        with urllib.request.urlopen(urllib.request.Request(f"{BASE}/{f['name']}", headers=key), timeout=60) as r: f = json.load(r)
    if f.get("state") != "ACTIVE": sys.exit(f"upload failed: {f.get('state')}")
    print("uploaded", f["name"], f"{size / 1e6:.1f}MB")
    return f["uri"], f.get("mimeType", mt)

parts = []
for v in a.video:
    try:
        uri, mt = upload(v)
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:800].replace("\n", " ")); sys.exit(1)
    p = {"file_data": {"file_uri": uri, "mime_type": mt}}
    if a.fps: p["video_metadata"] = {"fps": a.fps}
    parts.append(p)
if a.youtube:
    p = {"file_data": {"file_uri": a.youtube}}
    vm = {}
    if a.start: vm["start_offset"] = a.start
    if a.end: vm["end_offset"] = a.end
    if a.fps: vm["fps"] = a.fps
    if vm: p["video_metadata"] = vm
    parts.append(p)
for f in a.image:
    mt = mimetypes.guess_type(f)[0] or "image/png"
    if mt == "audio/x-wav": mt = "audio/wav"
    parts.append({"inline_data": {"mime_type": mt, "data": base64.b64encode(open(f, "rb").read()).decode()}})
parts.append({"text": open(a.prompt_file, encoding="utf-8").read()})
body = {"contents": [{"role": "user", "parts": parts}]}
gc = {}
if a.low: gc["mediaResolution"] = "MEDIA_RESOLUTION_LOW"
if a.json: gc["responseMimeType"] = "application/json"
if a.think: gc["thinkingConfig"] = {"thinkingLevel": a.think}
if gc: body["generationConfig"] = gc
tools = []
if a.search: tools.append({"google_search": {}})
if a.url_context: tools.append({"url_context": {}})
if tools: body["tools"] = tools

url = f"{BASE}/models/{a.model}:streamGenerateContent?alt=sse"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=HEADERS)
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
                for k in ("groundingMetadata", "urlContextMetadata"):
                    if c.get(k): grounding.append({k: c[k]})
            usage = d.get("usageMetadata", usage)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:1500].replace("\n", " ")); sys.exit(1)
open(a.out, "w", encoding="utf-8").write("".join(out))
if grounding:
    json.dump(grounding, open(a.out + ".grounding.json", "w"), ensure_ascii=False, indent=1)
print(f"ok {time.time()-t:.1f}s usage={usage}")
