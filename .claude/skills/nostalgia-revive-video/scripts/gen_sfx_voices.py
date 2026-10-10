#!/usr/bin/env python3
"""環境音に混ぜる「言葉が聞こえる音」を TTS で作る（テレビ・ラジオの声、店や祭りの歓声・呼び込み）。

  PROJ=作品フォルダ python3 gen_sfx_voices.py [--only tv_morning_voice crowd_kids_01 ...]   → assets/sfx/<名前>.wav

scenes.json の sfx_voices（storyboard.py の SFX_VOICES）を読む：
  {"tv_morning_voice": {"voice": "Aoede", "text": "おはようございます。…", "profile": "...", "scene": "...", "notes": "..."}, ...}
sfx.py は assets/sfx/ の決まった名前を読む：
  tv_morning_voice / tv_baseball_voice … 朝の番組・野球中継（テレビのスピーカー越しの音にする）
  crowd_<種類>_<番号>（例 crowd_kids_01, crowd_fest_03）… ざわめきの中に、遠く・小さく散らして混ぜる
台本どおりに読んだかは文字起こしで確かめる（英語の混入・指示文の読み上げを弾く）。
"""
import json, os, subprocess, sys, argparse, re
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--force", action="store_true")
a = ap.parse_args()
V = {k: v for k, v in D.get("sfx_voices", {}).items() if not a.only or k in a.only}
out_dir = os.path.join(ROOT, "assets/sfx"); os.makedirs(out_dir, exist_ok=True)
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)

def run(k):
    v = V[k]; out = os.path.join(out_dir, f"{k}.wav")
    if os.path.exists(out) and not a.force and not a.only: return f"{k}: exists"
    prompt = (f"# AUDIO PROFILE: {v.get('profile', 'A Japanese person.')}\n## SCENE: {v.get('scene', '')}\n"
              f"### DIRECTOR NOTES: {v.get('notes', 'Speak naturally.')} Do not read these notes aloud.\n#### TRANSCRIPT\n{v['text']}")
    for t in range(3):
        r = subprocess.run([sys.executable, os.path.join(HERE, "tts.py"), "--voice", v["voice"], "--text", prompt, "--out", out], capture_output=True, text=True)
        if "HTTP 402" in r.stdout + r.stderr: return f"{k}: 402（クレジット切れ）"
        if not os.path.exists(out): continue
        pf = os.path.join(ROOT, "work", f"p_tr_{k}.txt"); tf = os.path.join(ROOT, "work", f"tr_{k}.txt")
        open(pf, "w").write("Transcribe ALL speech verbatim. Output only the transcript, nothing else.")
        subprocess.run([sys.executable, os.path.join(HERE, "gem.py"), "--image", out, "--prompt-file", pf, "--out", tf, "--think", "low"], capture_output=True)
        heard = open(tf, encoding="utf-8").read().strip() if os.path.exists(tf) else ""
        if heard and not re.search(r"[A-Za-z]{3,}", heard): return f"{k}: ok {heard!r}"
        print(f"{k}: retry ({heard!r})", flush=True)
    return f"{k}: NG"
with ThreadPoolExecutor(4) as ex:
    for r in ex.map(run, list(V)): print(r, flush=True)
