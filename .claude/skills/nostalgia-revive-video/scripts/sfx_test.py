#!/usr/bin/env python3
"""合成した環境音・効果音を試聴用の wav にする／Gemini に目隠しで聞かせて「何の音に聞こえるか」を確かめる。

  PROJ=作品フォルダ python3 sfx_test.py day engawa chime5 coins        # work/sfx/<名前>.wav（環境音は12秒）
  PROJ=作品フォルダ python3 sfx_test.py --blind day rain_soft chime5     # 番号だけのファイルにして Gemini に聞かせる
                                                                      → work/sfx/blind.md（答え合わせ用の key は blind_key.json）
"""
import json, os, sys, wave, random, subprocess, argparse
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import sfx
ROOT = os.environ.get("PROJ") or os.getcwd()
ap = argparse.ArgumentParser(); ap.add_argument("names", nargs="+"); ap.add_argument("--blind", action="store_true"); ap.add_argument("--sec", type=float, default=12.0)
a = ap.parse_args()
out = os.path.join(ROOT, "work", "sfx"); os.makedirs(out, exist_ok=True)

def render(name):
    if name in sfx.AMB: x = sfx.AMB[name](a.sec, 1)
    elif name in sfx.ONE: x = sfx.ONE[name](sfx.rng(1))
    else: sys.exit(f"{name} は sfx.AMB / sfx.ONE にありません")
    x = np.asarray(x, np.float64); pk = np.max(np.abs(x)) + 1e-9
    x = x * min(1.0, 0.7 / pk)
    if len(x) < 2 * sfx.SR:   # 短い音は聞き分けにくいので、間をあけて3回くり返す
        gap = np.zeros((int(0.7 * sfx.SR), 2))
        x = np.concatenate([gap[:len(gap) // 2], x, gap, x, gap, x, gap[:len(gap) // 2]])
    return x

def wr(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sfx.SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

if not a.blind:
    for n in a.names:
        p = os.path.join(out, f"{n}.wav"); wr(p, render(n)); print(p)
    sys.exit(0)
order = a.names[:]; random.Random(7).shuffle(order)
files = []
for k, n in enumerate(order, 1):
    p = os.path.join(out, f"blind_{k:02d}.wav"); wr(p, render(n)); files.append(p)
json.dump({f"{k:02d}": n for k, n in enumerate(order, 1)}, open(os.path.join(out, "blind_key.json"), "w"), indent=1)
prompt = os.path.join(out, "p_blind.txt")
open(prompt, "w", encoding="utf-8").write(
    "添付の音声が何の音に聞こえるかを、先入観なしで答えてください。1行で：\n"
    "何の音に聞こえるか（できるだけ具体的に） | 本物らしさ(1-10) | 耳ざわりな点（キンキンする、ノイズっぽい、不自然な繰り返し、急に大きい、など。なければ「なし」） | メロディーがあれば曲名の心当たり")
# 1ファイルずつ聞く（まとめて渡すと番号の対応が崩れ、答えが抜けることがある）
from concurrent.futures import ThreadPoolExecutor
def ask(k):
    o = os.path.join(out, f"blind_{k:02d}.md")
    subprocess.run([sys.executable, os.path.join(HERE, "gem.py"), "--prompt-file", prompt, "--out", o, "--think", "low", "--image", files[k - 1]], capture_output=True, text=True)
    return k, (open(o, encoding="utf-8").read().strip() if os.path.exists(o) else "（答えなし）")
lines = []
with ThreadPoolExecutor(4) as ex:
    for k, ans in ex.map(ask, range(1, len(files) + 1)):
        lines.append(f"{k:02d}（正解：{order[k - 1]}） | {ans}")
open(os.path.join(out, "blind.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines))
