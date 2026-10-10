#!/usr/bin/env python3
"""登場人物（と動物）の設定画を作る。全カットの参照画像になるので、ここで顔・髪・服をそろえておく。

  PROJ=作品フォルダ python3 gen_chars.py [--only haruto adult] [--look photo|anime]

scenes.json の chars を読む：
  file  … 保存先（assets/chars/xxx.png）
  desc  … 見た目の説明（英語。年齢・髪・服・持ち物まで具体的に）
  kind  … "person"（既定）/ "animal"
  base  … 先に作る別の人物ID。大人になった姿など「同じ人物」を作るときに、その設定画を参照させる
  base_note … base を参照させるときの指示（例：同じ人が39歳になった姿。顔の形・目・つむじは同じ）
base のない人物を先に並行で作り、base のある人物はあとで作る。
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--look")
ap.add_argument("--model", default="gemini-3-pro-image")
a = ap.parse_args()
LOOK = a.look or D.get("meta", {}).get("look", "photo")

SHEET = {
    ("photo", "person"): "Photographic character reference sheet for a film: three photographs side by side of the SAME person on a plain light grey studio backdrop with soft natural light — (1) full body standing front view, (2) full body standing side view, (3) head-and-shoulders close-up. Photorealistic, looks like 35mm color film, realistic skin texture, ordinary-looking person (not a celebrity). No text, no labels, no numbers.",
    ("photo", "animal"): "Photographic reference sheet for a film: three photographs side by side of the SAME animal on a plain light grey studio backdrop with soft natural light — (1) standing side view, (2) sitting front view, (3) close-up of the face. Photorealistic, 35mm color film look. No text, no labels.",
    ("anime", "person"): "Character design reference sheet for an original Japanese anime feature film: three views side by side of the SAME character on a plain light background — (1) full body front view, (2) full body side view, (3) head-and-shoulders close-up. Hand-painted detail, soft cel shading, warm natural light. Original design, not based on any existing anime character. No text, no labels, no numbers.",
    ("anime", "animal"): "Character design reference sheet for an original Japanese anime feature film: three views side by side of the SAME animal on a plain light background — standing side view, sitting front view, close-up of the face. Soft cel shading. Original design. No text, no labels.",
}

def job(cid):
    c = D["chars"][cid]
    out = os.path.join(ROOT, c["file"])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet = SHEET[(LOOK, c.get("kind", "person"))]
    cmd = [sys.executable, os.path.join(HERE, "genimg.py"), "--model", a.model, "--out", out]
    if c.get("base"):
        cmd += ["--ref", os.path.join(ROOT, D["chars"][c["base"]]["file"])]
        prompt = f"{sheet} {c.get('base_note', 'The attached photos show the same person; keep the face recognizable.')} {c['desc']}"
    else:
        prompt = f"{sheet} {c['desc']}"
    p = subprocess.run(cmd + ["--prompt", prompt], capture_output=True, text=True)
    return f"{cid}: " + (p.stdout + p.stderr).strip().replace("\n", " ")[:240]

ids = [k for k in D["chars"] if not a.only or k in a.only]
first = [k for k in ids if not D["chars"][k].get("base")]
later = [k for k in ids if D["chars"][k].get("base")]
with ThreadPoolExecutor(5) as ex:
    for r in ex.map(job, first): print(r, flush=True)
for k in later:   # 参照元ができてから
    print(job(k), flush=True)
