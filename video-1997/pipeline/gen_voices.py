#!/usr/bin/env python3
"""セリフを Gemini TTS で作り、文字起こしで「台本どおりの言葉だけ」か確かめる（ずれたら作り直し）。

  PROJ=作品フォルダ python3 pipeline/gen_voices.py [--only G1 C1 ...]
  英語の構造化プロンプト（AUDIO PROFILE / SCENE / DIRECTOR NOTES / TRANSCRIPT）を使う。
  日本語で演技指示を書くと指示文まで読み上げてしまうため（v1 の検証で判明）。
"""
import json, os, subprocess, sys, argparse, re, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.path.dirname(HERE)
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--tries", type=int, default=3)
a = ap.parse_args()
os.makedirs(os.path.join(ROOT, "assets/voice"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)

def norm(t):
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"[\s、。…・,.!?！？「」『』ー〜~\-]", "", t)

def kata2hira(t):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in t)

def transcribe(path):
    p = os.path.join(ROOT, "work", "p_tr.txt")
    open(p, "w").write("Transcribe ALL speech in this audio verbatim, in any language (including any English). Output only the transcript in Japanese hiragana/katakana/kanji as spoken, nothing else.")
    out = os.path.join(ROOT, "work", "tr.txt")
    subprocess.run([sys.executable, os.path.join(HERE, "gem.py"), "--image", path, "--prompt-file", p, "--out", out, "--think", "low"], capture_output=True)
    return open(out, encoding="utf-8").read().strip() if os.path.exists(out) else ""

def similar(a, b):
    a, b = kata2hira(norm(a)), kata2hira(norm(b))
    # かな・漢字の表記ゆれは許す：長さが近く、英語（指示文の読み上げ）が混ざっていないこと
    return (not re.search(r"[A-Za-z]{3,}", a)) and abs(len(a) - len(b)) <= max(3, len(b) * 0.6)

report = {}
for lid, ln in D["lines"].items():
    if a.only and lid not in a.only: continue
    out = os.path.join(ROOT, "assets/voice", f"{lid}.wav")
    prompt = (f"# AUDIO PROFILE: {ln['profile']}\n## SCENE: {ln['scene']}\n### DIRECTOR NOTES: {ln['notes']} "
              f"Do not read these notes aloud.\n#### TRANSCRIPT\n{ln['text']}")
    ok = False
    for k in range(a.tries):
        r = subprocess.run([sys.executable, os.path.join(HERE, "tts.py"), "--voice", ln["voice"], "--text", prompt, "--out", out], capture_output=True, text=True)
        if not os.path.exists(out): continue
        tr = transcribe(out)
        ok = similar(tr, ln["text"])
        print(f"{lid} try{k+1} voice={ln['voice']} -> {tr!r} {'OK' if ok else 'NG'}", flush=True)
        if ok: break
    report[lid] = dict(ok=ok, voice=ln["voice"], text=ln["text"], heard=tr if os.path.exists(out) else None)
json.dump(report, open(os.path.join(ROOT, "work", "voices_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
