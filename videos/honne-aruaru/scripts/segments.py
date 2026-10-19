#!/usr/bin/env python3
"""行の中の「声のある区間」を表示する（語の頭に演出を合わせるための目安）。

  python3 -I scripts/segments.py --ep honne02 a5t ask

行の頭からの秒で [話している区間] を並べる。区間の切れ目＝読点や息つぎ。
ここで見た秒を script.json の marks（[行, 's', 秒]）に書く。
"""
import os, subprocess, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import episode

EP = episode()
SR = 48000
for lid in sys.argv[1:]:
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(EP.pub, 'audio', 'voice', f'{lid}.wav'),
                        '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    x = np.frombuffer(r.stdout, dtype=np.float32)
    hop = 240
    n = len(x) // hop
    db = 20 * np.log10(np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9)
    thr = db.max() - 30
    v = db > thr
    segs, i = [], 0
    while i < n:
        j = i
        while j < n and v[j] == v[i]:
            j += 1
        if v[i]:
            segs.append((i * hop / SR, j * hop / SR))
        i = j
    # 0.06 秒未満の切れ目はつなぐ
    merged = []
    for a, b in segs:
        if merged and a - merged[-1][1] < 0.06:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    print(f'{lid} ({len(x) / SR:.2f}s): ' + '  '.join(f'[{a:.2f}-{b:.2f}]' for a, b in merged))
