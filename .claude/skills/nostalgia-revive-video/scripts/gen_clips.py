#!/usr/bin/env python3
"""motion の書かれたカットを Veo（画像→動画, 8秒）で動かす。既存はスキップ、--only で作り直し。費用に注意。

  PROJ=作品フォルダ python3 gen_clips.py [--only S07 ...] [--workers 3] [--res 1080p] [--dry] [--outdir work/clips_try]

--dry で、作る本数と費用の見積もりだけ表示する（先にユーザーへ伝える）。
--outdir に作ると render.py はまだ使わない。clip_check.py と目で確かめ、良いものだけ assets/clips/ に写す（おすすめ）。
動画の様式は scenes.json の meta.motion_style（過去）と meta.motion_style_present（現在）。
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--workers", type=int, default=3)
ap.add_argument("--res", default="1080p"); ap.add_argument("--model", default="veo-3.1-lite-generate-preview")
ap.add_argument("--dry", action="store_true"); ap.add_argument("--price", type=float, default=0.08, help="1秒あたりの目安（ドル）")
ap.add_argument("--outdir", default="assets/clips", help="保存先（作品フォルダからの相対）")
a = ap.parse_args()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
M = D.get("meta", {})
PRESENT = str(M.get("present_era", "2026"))
STYLE = M.get("motion_style", "Realistic 1990s 35mm color film look, natural subtle motion, no text, no subtitles, no logos.")
STYLE_NOW = M.get("motion_style_present", "Realistic modern digital look, natural subtle motion, no text, no logos.")
jobs = []
for s in D["scenes"]:
    if not s.get("motion") or not s.get("prompt"): continue
    if a.only and s["id"] not in a.only: continue
    src = s.get("img") or s["id"]
    out = os.path.join(ROOT, a.outdir, s["id"] + ".mp4")
    if os.path.exists(out) and not a.only: continue
    style = STYLE_NOW if str(s.get("era")) == PRESENT else STYLE
    jobs.append((s["id"], src, s["motion"] + " " + style, out))
print(f"{len(jobs)} clips × 8s ≈ ${len(jobs) * 8 * a.price:.2f}（{a.res}）")
if a.dry: sys.exit(0)
# Veo には fixes.json（ぼかし・日付）を当てた画像を渡す。元の画像を渡すと、ぼかしたロゴが動画の中に戻ってくる
os.environ["PROJ"] = ROOT; sys.argv = sys.argv[:1]; sys.path.insert(0, HERE)
import render
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
for k, (sid, src, prompt, out) in enumerate(jobs):
    img = os.path.join(ROOT, "work", f"veo_in_{sid}.png")
    render.load_scene_image(src, raw=True).convert("RGB").save(img)
    jobs[k] = (sid, img, prompt, out)
def run(j):
    sid, img, prompt, out = j
    for k in range(2):
        p = subprocess.run([sys.executable, os.path.join(HERE, "veo.py"), "--image", img, "--prompt", prompt, "--out", out, "--res", a.res, "--model", a.model], capture_output=True, text=True)
        if os.path.exists(out) or "HTTP 402" in p.stdout: break
    print(sid, (p.stdout + p.stderr).strip().replace("\n", " ")[:200], flush=True)
os.makedirs(os.path.join(ROOT, a.outdir), exist_ok=True)
with ThreadPoolExecutor(a.workers) as ex: list(ex.map(run, jobs))
print("done", len(jobs))
