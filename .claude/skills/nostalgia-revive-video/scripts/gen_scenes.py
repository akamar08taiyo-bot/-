#!/usr/bin/env python3
"""scenes.json の各カットの画像を生成する（既存はスキップ）。

  PROJ=作品フォルダ python3 gen_scenes.py --workers 5
  PROJ=作品フォルダ python3 gen_scenes.py --only S08 --extra "No arcade marquee text. No date stamp."   # 作り直し

full_prompt（storyboard.py が組み立てた指示文）のあるカットだけを作る。refs の人物の設定画を参照画像として添付する。
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--workers", type=int, default=4)
ap.add_argument("--model", default="gemini-3-pro-image"); ap.add_argument("--extra", default="", help="追加の指示（作り直しの理由を具体的に）")
a = ap.parse_args()
data = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
REF = {k: v["file"] for k, v in data.get("chars", {}).items()}
os.makedirs(os.path.join(ROOT, "assets/img"), exist_ok=True)
jobs = []
for s in data["scenes"]:
    if not s.get("full_prompt"): continue
    out = os.path.join(ROOT, "assets/img", s["id"] + ".png")
    if a.only:
        if s["id"] not in a.only: continue
    elif os.path.exists(out): continue
    jobs.append((s, out))
def run(job):
    s, out = job
    cmd = [sys.executable, os.path.join(HERE, "genimg.py"), "--model", a.model, "--prompt", s["full_prompt"] + (" " + a.extra if a.extra else ""), "--out", out]
    for r in s.get("refs", []): cmd += ["--ref", os.path.join(ROOT, REF[r])]
    p = subprocess.run(cmd, capture_output=True, text=True)
    msg = (p.stdout + p.stderr).strip().replace("\n", " ")[:300]
    print(f"{s['id']}: {msg}", flush=True)
with ThreadPoolExecutor(a.workers) as ex:
    list(ex.map(run, jobs))
print("done", len(jobs))
