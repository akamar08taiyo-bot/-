#!/usr/bin/env python3
"""BGM を Lyria で生成（既存はスキップ）。"""
import subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMON = "Instrumental only, no vocals, no choir, no drums, no percussion. Soft dynamics, warm intimate recording, gentle reverb. "
M = {
 "M0": ("lyria-3-clip-preview", COMMON + "Solo felt piano, very sparse and quiet, slow 60 BPM, a simple tender nostalgic motif in D major with long pauses and reverb tails, like opening an old box of childhood memories."),
 "M1": ("lyria-3.5", COMMON + "Nostalgic Japanese anime film score for a bright summer morning in 1997 in a small seaside town: warm acoustic piano melody with a soft string ensemble and light glockenspiel accents, gentle and hopeful, 76 BPM, D major, flowing and calm, smooth ending."),
 "M2": ("lyria-3.5", COMMON + "Light, playful but calm Japanese anime film score for two boys spending a lazy summer afternoon tinkering with toy race cars on a veranda: acoustic piano, pizzicato strings, soft nylon acoustic guitar and a little celesta, 88 BPM, G major, cheerful and cozy, never loud."),
 "M3": ("lyria-3.5", COMMON + "Wistful nostalgic Japanese anime film score for a summer festival night and the last days of summer vacation: piano and warm legato strings, slow 70 BPM, B minor moving to D major, tender and bittersweet, gentle."),
 "M4": ("lyria-3.5", COMMON + "Emotional Japanese anime film score for a farewell between two childhood best friends at the end of summer, then a quiet memory decades later: solo piano opening, strings gradually swelling to a heartfelt but restrained climax around the middle, then resolving softly to solo piano at the end, 66 BPM, D major."),
 "M5a": ("lyria-3.5", COMMON + "Very calm ambient piano for relaxing, studying and sleeping, evoking a quiet summer evening in rural Japan in the 1990s: soft felt piano with long pauses, a faint warm string pad, slow 60 BPM, F major, minimal, peaceful and steady with no sudden changes."),
 "M5b": ("lyria-3.5", COMMON + "Very calm ambient piano for relaxing and studying, evoking a quiet late-summer night in a small Japanese seaside town in the 1990s: soft felt piano, sparse gentle melody, a faint warm pad, slow 58 BPM, D major, peaceful and steady with no sudden changes."),
}
def run(k):
    model, prompt = M[k]
    out = os.path.join(ROOT, "assets/music", k + ".mp3")
    if os.path.exists(out): return f"{k}: exists"
    for attempt in range(3):
        p = subprocess.run([sys.executable, os.path.join(ROOT, "pipeline/lyria.py"), "--model", model, "--prompt", prompt, "--out", out], capture_output=True, text=True)
        if os.path.exists(out): break
    return f"{k}: " + (p.stdout + p.stderr).strip().replace("\n", " ")[:200]
with ThreadPoolExecutor(3) as ex:
    for r in ex.map(run, list(M)): print(r, flush=True)
