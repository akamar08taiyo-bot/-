#!/usr/bin/env python3
"""全カットの画像を Gemini に検査させる（文字・ロゴ・実在ブランド・時代違い・縁・AIの破綻）。

  PROJ=作品フォルダ python3 check_images.py [--only S08 ...]  → work/imgcheck.json（問題のあるカットだけ表示）

指示文は work/p_imgcheck.txt（なければ scenes.json の meta.setting と時代から作る。作品に合わせて書き換えてよい）。
結果は目安。最後は自分の目で拡大して確かめる（小さなロゴ・崩れた文字は見落とされることがある）。
"""
import json, os, subprocess, sys, argparse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--workers", type=int, default=4)
a = ap.parse_args()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
M = D.get("meta", {})
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
prompt = os.path.join(ROOT, "work", "p_imgcheck.txt")
if not os.path.exists(prompt):
    past = M.get("past_era", "the past"); now = M.get("present_era", "the present day")
    setting = M.get("setting", f"a nostalgic film set in Japan in {past}")
    open(prompt, "w", encoding="utf-8").write(
        f"This is one frame for a realistic nostalgic film: {setting} (or {now} if it is clearly modern). Inspect it carefully and answer ONLY in JSON:\n"
        '{"text_or_logos": [list of any readable text, numbers, letters, brand names, logos or trademark-like marks you can see, with where they are (e.g. "bottom-right")],\n'
        ' "real_brands": [any recognizable real brands/products/characters (e.g. game titles, car makers, sportswear stripes)],\n'
        f' "anachronisms": [anything that would not exist in {past} (smartphones, flat TVs, modern cars...) — ignore if the image is meant to be {now}],\n'
        ' "border_or_frame": true/false (is there a white/black border, rounded photo corners, vignette frame or a printed date stamp?),\n'
        ' "ai_artifacts": [visible AI errors: malformed hands, extra fingers, distorted faces, melted objects],\n'
        ' "severity": "none" | "minor" | "major" (major = should be regenerated or hidden)}\n')
outp = os.path.join(ROOT, "work", "imgcheck.json")
res = json.load(open(outp)) if os.path.exists(outp) else {}
ids = [s["id"] for s in D["scenes"] if s.get("full_prompt") and (not a.only or s["id"] in a.only)]
def run(sid):
    src = os.path.join(ROOT, "assets/img", sid + ".png")
    if not os.path.exists(src): return sid, {"error": "no image"}
    small = os.path.join(ROOT, "work", f"chk_{sid}.jpg")
    Image.open(src).convert("RGB").resize((1376, 768)).save(small, quality=90)
    out = os.path.join(ROOT, "work", f"chk_{sid}.json")
    msg = ""
    for k in range(3):
        p = subprocess.run([sys.executable, os.path.join(HERE, "gem.py"), "--image", small, "--prompt-file", prompt, "--out", out, "--json", "--think", "low"], capture_output=True, text=True)
        msg = (p.stdout + p.stderr)[:200]
        try:
            return sid, json.load(open(out))
        except Exception:
            if "HTTP 402" in msg: break
    return sid, {"error": msg}
with ThreadPoolExecutor(a.workers) as ex:
    for sid, r in ex.map(run, ids):
        res[sid] = r
        sev = r.get("severity") if isinstance(r, dict) else None
        # severity は当てにならないことがある（実例：星マークのロゴを text_or_logos に挙げながら "none"）。
        # 文字・ブランド・縁の指摘があれば severity にかかわらず表示する
        flagged = isinstance(r, dict) and (r.get("text_or_logos") or r.get("real_brands") or r.get("border_or_frame"))
        if sev != "none" or flagged:
            print(sid, sev, json.dumps({k: v for k, v in r.items() if v and k != "severity"}, ensure_ascii=False)[:500], flush=True)
json.dump(res, open(outp, "w"), ensure_ascii=False, indent=1)
print("checked", len(ids), "errors:", [k for k, v in res.items() if isinstance(v, dict) and v.get("error")])
