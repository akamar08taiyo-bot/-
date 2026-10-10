#!/usr/bin/env python3
"""scenes.json の各カットの画像を生成（既存はスキップ）。--only で指定IDだけ作り直し。"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--workers", type=int, default=4)
ap.add_argument("--model", default="gemini-3-pro-image"); ap.add_argument("--extra", default="")
a = ap.parse_args()
data = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
REF = {"haruto": "assets/chars/haruto.png", "yusuke": "assets/chars/yusuke.png", "adult": "assets/chars/adult.png"}
jobs = []
for s in data["scenes"]:
    if not s.get("full_prompt"): continue
    out = os.path.join(ROOT, "assets/img", s["id"] + ".png")
    if a.only is not None and len(a.only) > 0:
        if s["id"] not in a.only: continue
    elif os.path.exists(out): continue
    jobs.append((s, out))
def run(job):
    s, out = job
    cmd = [sys.executable, os.path.join(ROOT, "pipeline/genimg.py"), "--model", a.model, "--prompt", s["full_prompt"] + (" " + a.extra if a.extra else ""), "--out", out]
    for r in s["refs"]: cmd += ["--ref", os.path.join(ROOT, REF[r])]
    p = subprocess.run(cmd, capture_output=True, text=True)
    msg = (p.stdout + p.stderr).strip().replace("\n", " ")[:300]
    print(f"{s['id']}: {msg}", flush=True)
with ThreadPoolExecutor(a.workers) as ex:
    list(ex.map(run, jobs))
print("done", len(jobs))
