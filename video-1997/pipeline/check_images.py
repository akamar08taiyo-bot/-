#!/usr/bin/env python3
"""全カットの画像を Gemini に検査させる（文字・ロゴ・実在ブランド・時代違い・縁・AIの破綻）。
  PROJ=作品フォルダ python3 pipeline/check_images.py [--only S08 ...]  → work/imgcheck.json
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.path.dirname(HERE)
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--workers", type=int, default=4)
a = ap.parse_args()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
prompt = os.path.join(ROOT, "work", "p_imgcheck.txt")
outp = os.path.join(ROOT, "work", "imgcheck.json")
res = json.load(open(outp)) if os.path.exists(outp) else {}
ids = [s["id"] for s in D["scenes"] if s.get("full_prompt") and (not a.only or s["id"] in a.only)]
def run(sid):
    src = os.path.join(ROOT, "assets/img", sid + ".png")
    small = os.path.join(ROOT, "work", f"chk_{sid}.jpg")
    Image.open(src).convert("RGB").resize((1376, 768)).save(small, quality=90)
    out = os.path.join(ROOT, "work", f"chk_{sid}.json")
    for k in range(3):
        p = subprocess.run([sys.executable, os.path.join(HERE, "gem.py"), "--image", small, "--prompt-file", prompt, "--out", out, "--json", "--think", "low"], capture_output=True, text=True)
        try:
            return sid, json.load(open(out))
        except Exception:
            continue
    return sid, {"error": (p.stdout + p.stderr)[:200]}
with ThreadPoolExecutor(a.workers) as ex:
    for sid, r in ex.map(run, ids):
        res[sid] = r
        sev = r.get("severity") if isinstance(r, dict) else None
        if sev != "none":
            print(sid, sev, json.dumps({k: v for k, v in r.items() if v and k != "severity"}, ensure_ascii=False)[:400], flush=True)
json.dump(res, open(outp, "w"), ensure_ascii=False, indent=1)
print("checked", len(ids))
