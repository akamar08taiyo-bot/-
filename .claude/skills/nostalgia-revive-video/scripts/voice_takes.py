#!/usr/bin/env python3
"""セリフを何テイクか撮り、Gemini に聞き比べさせて一番自然なものを選ぶ（棒読み・芝居がかった声の改善）。

  PROJ=作品フォルダ python3 voice_takes.py C1 C2 --takes 3            → work/voice_takes/<ID>_<n>.wav と work/voice_takes/<ID>.md
  PROJ=作品フォルダ python3 voice_takes.py C1 --takes 3 --adopt         → 一番良いテイクを assets/voice/<ID>.wav に（元は <ID>_old.wav に残す）

今の声（assets/voice/<ID>.wav）もテイク0として一緒に採点する。指示を変えると別の所が悪くなることがある
（実例：「ささやくように」と書くと、子どもの声が低く大人びて年齢の点が9→2〜6に下がった）。

演技の指示は scenes.json の lines（storyboard.py の LINES）の profile / scene / notes。直したいときは notes を書き換えてから撮る。
採点は1テイクずつ独立に（台本どおりか・推定年齢・年齢の合い方・自然さ・感情）。合計の高いテイクを選ぶ。
子どもの役は AUDIO PROFILE に「with a light, high, childlike voice」と書くと子どもに聞こえやすい（書かないと同じ声でも18〜30歳に聞こえた）。
"""
import json, os, re, subprocess, sys, argparse, shutil
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
ap = argparse.ArgumentParser(); ap.add_argument("ids", nargs="+"); ap.add_argument("--takes", type=int, default=3); ap.add_argument("--adopt", action="store_true")
a = ap.parse_args()
out = os.path.join(ROOT, "work", "voice_takes"); os.makedirs(out, exist_ok=True)

def take(job):
    lid, k = job
    ln = D["lines"][lid]
    prompt = (f"# AUDIO PROFILE: {ln['profile']}\n## SCENE: {ln['scene']}\n### DIRECTOR NOTES: {ln['notes']} "
              f"Do not read these notes aloud.\n#### TRANSCRIPT\n{ln['text']}")
    f = os.path.join(out, f"{lid}_{k}.wav")
    r = subprocess.run([sys.executable, os.path.join(HERE, "tts.py"), "--voice", ln["voice"], "--text", prompt, "--out", f], capture_output=True, text=True)
    return f if os.path.exists(f) else None

def judge_one(lid, f):
    """1テイクずつ独立に採点する（並べて比べさせると、互いに引きずられて年齢の判定がぶれた）"""
    ln = D["lines"][lid]
    p = os.path.join(out, f"p_{os.path.basename(f)[:-4]}.txt")
    open(p, "w", encoding="utf-8").write(
        f"この音声は映像作品のセリフです。役：{ln['who']}（{ln['profile']}）／場面：{ln['scene']}／台本：「{ln['text']}」\n"
        "先入観なしで聞いて、JSONだけで答えてください：{\"heard\": \"聞こえたとおり\", \"script_ok\": true/false（台本の言葉どおりか。語尾の違いも×）, "
        "\"age_years\": 話し手の推定年齢（数値）, \"age_fit\": 0-10（役の年齢に聞こえるか）, \"natural\": 0-10（棒読み・芝居がかった感じがないほど高い）, "
        "\"emotion\": 0-10（場面の気持ちが伝わるか）, \"comment\": \"短く\"}")
    o = os.path.join(out, os.path.basename(f)[:-4] + ".json")
    subprocess.run([sys.executable, os.path.join(HERE, "gem.py"), "--image", f, "--prompt-file", p, "--out", o, "--json", "--think", "low"], capture_output=True)
    try:
        r = json.load(open(o, encoding="utf-8")); r["take"] = os.path.basename(f)[:-4]; return r
    except Exception:
        return {"take": os.path.basename(f)[:-4], "error": True}

def judge(lid, files):
    with ThreadPoolExecutor(4) as ex:
        return list(ex.map(lambda f: judge_one(lid, f), files))

jobs = [(lid, k) for lid in a.ids for k in range(1, a.takes + 1)]
with ThreadPoolExecutor(4) as ex: files = list(ex.map(take, jobs))
for lid in a.ids:
    fs = [f for (l, k), f in zip(jobs, files) if l == lid and f]
    cur = os.path.join(ROOT, "assets/voice", f"{lid}.wav")
    if os.path.exists(cur):   # 今の声もテイク0として一緒に聞き比べる（新しいテイクが良くなったとは限らない）
        base = os.path.join(out, f"{lid}_0.wav"); shutil.copy(cur, base); fs = [base] + fs
    res = judge(lid, fs)
    best = None; best_score = -1
    lines = [f"# {lid} {D['lines'][lid]['who']}「{D['lines'][lid]['text']}」"]
    for r in res if isinstance(res, list) else []:
        sc = (r.get("natural", 0) + r.get("emotion", 0) + r.get("age_fit", 0)) if r.get("script_ok") else -1
        lines.append(f"- {r.get('take')}: 自然さ{r.get('natural')} 感情{r.get('emotion')} 年齢の合い方{r.get('age_fit')}（推定{r.get('age_years')}歳） 台本{'○' if r.get('script_ok') else '×'} 「{r.get('heard')}」 {r.get('comment', '')}")
        if sc > best_score: best_score, best = sc, r.get("take")
    lines.append(f"→ 選んだテイク：{best}")
    open(os.path.join(out, f"{lid}.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines), flush=True)
    if a.adopt and best:
        src = os.path.join(out, best + ".wav"); dst = os.path.join(ROOT, "assets/voice", f"{lid}.wav")
        if os.path.exists(src):
            if os.path.exists(dst) and not os.path.exists(dst[:-4] + "_old.wav"): shutil.copy(dst, dst[:-4] + "_old.wav")
            shutil.copy(src, dst); print(f"adopted {best} -> {dst}")
