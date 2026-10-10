#!/usr/bin/env python3
"""BGM を Lyria で作る（既存はスキップ）。曲の指示は scenes.json の music（storyboard.py の MUSIC）。

  PROJ=作品フォルダ python3 gen_music.py [--only M2 M5a]

ファイル名は assets/music/<キー>.mp3。M5a・M5b のように末尾に英字をつけると、mix.py が M5 の区間で順につなぐ。
prompt が "existing" の曲は作らない（手元の曲を使う）。Lyria が使えないときは synth_music.py。
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*")
a = ap.parse_args()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
M = {k: (v["model"], v["prompt"]) for k, v in D.get("music", {}).items() if v["prompt"] != "existing" and (not a.only or k in a.only)}
os.makedirs(os.path.join(ROOT, "assets/music"), exist_ok=True)

def run(k):
    model, prompt = M[k]
    out = os.path.join(ROOT, "assets/music", k + ".mp3")
    if os.path.exists(out) and not a.only: return f"{k}: exists"
    for attempt in range(3):
        p = subprocess.run([sys.executable, os.path.join(HERE, "lyria.py"), "--model", model, "--prompt", prompt, "--out", out], capture_output=True, text=True)
        if os.path.exists(out) or "HTTP 402" in p.stdout: break
    return f"{k}: " + (p.stdout + p.stderr).strip().replace("\n", " ")[:200]
with ThreadPoolExecutor(3) as ex:
    for r in ex.map(run, list(M)): print(r, flush=True)
