#!/usr/bin/env python3
"""motion の書かれたカットを Veo（画像→動画, 8秒）で動かす。既存はスキップ、--only で作り直し。
  PROJ=作品フォルダ python3 pipeline/gen_clips.py [--only S07 ...] [--workers 3] [--res 1080p]
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.path.dirname(HERE)
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--workers", type=int, default=3)
ap.add_argument("--res", default="1080p"); ap.add_argument("--model", default="veo-3.1-lite-generate-preview")
a = ap.parse_args()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
STYLE = "Realistic 1990s 35mm color film look, natural subtle motion, no text, no subtitles, no logos."
jobs = []
for s in D["scenes"]:
    if not s.get("motion") or not s.get("prompt"): continue
    if a.only and s["id"] not in a.only: continue
    out = os.path.join(ROOT, "assets/clips", s["id"] + ".mp4")
    if os.path.exists(out) and not a.only: continue
    style = STYLE if s["era"] != "2026" else "Realistic modern digital look, natural subtle motion, no text, no logos."
    jobs.append((s["id"], os.path.join(ROOT, "assets/img", s["id"] + ".png"), s["motion"] + " " + style, out))
def run(j):
    sid, img, prompt, out = j
    for k in range(2):
        p = subprocess.run([sys.executable, os.path.join(HERE, "veo.py"), "--image", img, "--prompt", prompt, "--out", out, "--res", a.res, "--model", a.model], capture_output=True, text=True)
        if os.path.exists(out): break
    print(sid, (p.stdout + p.stderr).strip().replace("\n", " ")[:200], flush=True)
os.makedirs(os.path.join(ROOT, "assets/clips"), exist_ok=True)
with ThreadPoolExecutor(a.workers) as ex: list(ex.map(run, jobs))
print("done", len(jobs))
