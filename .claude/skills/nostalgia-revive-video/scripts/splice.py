#!/usr/bin/env python3
"""書き出し済みの動画の一部のコマだけを差し替える（全編を描き直さずに、直したカットだけ入れ替える）。

  1) 直したカットの範囲を描く：  PROJ=作品 python3 render.py --frames 1480 1808   → work/test_1480_1808.mp4
  2) 差し替える：               python3 splice.py --base work/video.mp4 --replace work/test_1480_1808.mp4:1480 --out work/video_fixed.mp4
     （--replace は何個でも。「ファイル:差し替え開始コマ」。base の先頭を0として数える。base が全編の一部なら --offset にその先頭コマ番号）
  3) 出来上がりのコマ数が base と同じかを表示する。問題なければ video_fixed.mp4 を video.mp4 に置き換えて finalize.py へ。

カットが見えているのは「そのカットの start − 0（前のカットとのクロスフェードはこのカットの start から）」〜「次のカットの start ＋ 次の xfade」。
その範囲を少し広めに（前後5コマほど）描いて差し替える。コマ単位で入れ替えるので、つなぎ目にずれは出ない。
"""
import argparse, json, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--replace", action="append", required=True, help="clip.mp4:開始コマ")
ap.add_argument("--offset", type=int, default=0, help="base の先頭が全編の何コマ目か（--replace の開始コマは全編の番号で書ける）")
ap.add_argument("--crf", default="17")
a = ap.parse_args()

def probe(p):
    s = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
                                   "-of", "json", p], capture_output=True, text=True).stdout)["streams"][0]
    n, d = map(int, s["r_frame_rate"].split("/"))
    return s["width"], s["height"], n / d, int(s["nb_frames"])

W, H, FPS, N = probe(a.base)
FB = W * H * 3
def reader(p):
    return subprocess.Popen(["ffmpeg", "-v", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
reps = []
for r in a.replace:
    p, s = r.rsplit(":", 1)
    w, h, f, n = probe(p)
    if (w, h) != (W, H): sys.exit(f"{p}: 大きさが違います {w}x{h}")
    reps.append((int(s) - a.offset, n, p))
reps.sort()
for (s1, n1, p1), (s2, n2, p2) in zip(reps, reps[1:]):
    if s1 + n1 > s2: sys.exit(f"差し替え範囲が重なっています: {p1} と {p2}")
if reps and reps[-1][0] + reps[-1][1] > N: sys.exit("差し替え範囲が base の長さを超えています")
base = reader(a.base)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{FPS:g}", "-i", "-",
                        "-c:v", "libx264", "-preset", "fast", "-crf", a.crf, "-pix_fmt", "yuv420p", "-g", str(int(round(FPS * 2))), "-bf", "2",
                        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", a.out], stdin=subprocess.PIPE)
cur = None; k = 0; used = 0
for i in range(N):
    fr = base.stdout.read(FB)
    if len(fr) < FB: sys.exit(f"base が {i} コマで終わりました")
    if cur is None and k < len(reps) and i == reps[k][0]:
        cur = reader(reps[k][2]); left = reps[k][1]; k += 1
    if cur is not None:
        rf = cur.stdout.read(FB)
        if len(rf) == FB: fr = rf; used += 1
        left -= 1
        if left == 0: cur.stdout.close(); cur.wait(); cur = None
    enc.stdin.write(fr)
enc.stdin.close(); enc.wait(); base.stdout.close(); base.wait()
print(f"{a.out}: {probe(a.out)[3]} frames（base {N}）、差し替え {used} コマ")
