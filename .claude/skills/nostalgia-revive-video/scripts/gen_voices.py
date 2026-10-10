#!/usr/bin/env python3
"""セリフを Gemini TTS で作り、文字起こしで「台本どおりの言葉だけ」か確かめる（ずれたら作り直す）。

  PROJ=作品フォルダ python3 gen_voices.py [--only G1 C1 ...]     → assets/voice/<ID>.wav, work/voices_report.json
  PROJ=作品フォルダ python3 gen_voices.py --age-check            → work/voice_check.md（年齢・性別の印象と役との合い方）

演技の指示は英語の構造化プロンプト（AUDIO PROFILE / SCENE / DIRECTOR NOTES / TRANSCRIPT）にする。
日本語で指示を書くと、指示文まで読み上げてしまうことがあるため。
"""
import json, os, subprocess, sys, argparse, re, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
ap = argparse.ArgumentParser(); ap.add_argument("--only", nargs="*"); ap.add_argument("--tries", type=int, default=3)
ap.add_argument("--age-check", action="store_true")
a = ap.parse_args()
os.makedirs(os.path.join(ROOT, "assets/voice"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)

def gem(files, prompt, out):
    p = os.path.join(ROOT, "work", "p_voice.txt")
    open(p, "w", encoding="utf-8").write(prompt)
    cmd = [sys.executable, os.path.join(HERE, "gem.py"), "--prompt-file", p, "--out", out, "--think", "low"]
    for f in files: cmd += ["--image", f]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return open(out, encoding="utf-8").read().strip() if r.returncode == 0 and os.path.exists(out) else ""

def norm(t):
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"[\s、。…・,.!?！？「」『』ー〜~\-]", "", t)

def kata2hira(t):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in t)

def similar(heard, script):
    h, s = kata2hira(norm(heard)), kata2hira(norm(script))
    # かな・漢字の表記ゆれは許す：長さが近く、英語（指示文の読み上げ）が混ざっていないこと
    return bool(h) and (not re.search(r"[A-Za-z]{3,}", h)) and abs(len(h) - len(s)) <= max(3, len(s) * 0.6)

if a.age_check:
    ids = [lid for lid in D["lines"] if os.path.exists(os.path.join(ROOT, "assets/voice", f"{lid}.wav")) and (not a.only or lid in a.only)]
    roles = "\n".join(f"- {lid}: {D['lines'][lid]['who']}（{D['lines'][lid].get('profile', '')}）" for lid in ids)
    same = {}
    for lid in ids: same.setdefault(D["lines"][lid]["who"], []).append(lid)
    groups = [v for v in same.values() if len(v) > 1]
    prompt = (f"添付の音声ファイルは順に {', '.join(ids)} です。想定している役は次のとおり：\n{roles}\n\n"
              "それぞれについて1行ずつ答えてください：\nID | 話者の推定年齢 | 性別の印象 | 聞こえたセリフ（一字一句） | 役との合い方（10点満点） | 不自然な点\n")
    if groups:
        prompt += "最後に、次の組がそれぞれ同じ人物の声に聞こえるかも答えてください：" + "、".join("/".join(g) for g in groups) + "\n"
    out = os.path.join(ROOT, "work", "voice_check.md")
    txt = gem([os.path.join(ROOT, "assets/voice", f"{lid}.wav") for lid in ids], prompt, out)
    print(txt or "（判定できませんでした。クレジット切れや通信エラーを確認）")
    sys.exit(0)

report = {}
for lid, ln in D["lines"].items():
    if a.only and lid not in a.only: continue
    out = os.path.join(ROOT, "assets/voice", f"{lid}.wav")
    prompt = (f"# AUDIO PROFILE: {ln['profile']}\n## SCENE: {ln['scene']}\n### DIRECTOR NOTES: {ln['notes']} "
              f"Do not read these notes aloud.\n#### TRANSCRIPT\n{ln['text']}")
    ok = False; heard = None
    for k in range(a.tries):
        r = subprocess.run([sys.executable, os.path.join(HERE, "tts.py"), "--voice", ln["voice"], "--text", prompt, "--out", out], capture_output=True, text=True)
        if r.returncode or not os.path.exists(out):
            print(lid, "TTS failed:", (r.stdout + r.stderr).strip()[:200]); continue
        heard = gem([out], "Transcribe ALL speech in this audio verbatim, in any language (including any English). Output only the transcript in Japanese hiragana/katakana/kanji as spoken, nothing else.",
                    os.path.join(ROOT, "work", "tr.txt"))
        ok = similar(heard, ln["text"])
        print(f"{lid} try{k+1} voice={ln['voice']} -> {heard!r} {'OK' if ok else 'NG'}", flush=True)
        if ok: break
    report[lid] = dict(ok=ok, voice=ln["voice"], text=ln["text"], heard=heard)
json.dump(report, open(os.path.join(ROOT, "work", "voices_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
