"""プレビュー用：特典2の動画（章ごと）を、アーティファクトの上限（1ファイル15MB）に収まるよう3つに分ける。
作り直さずに（-c copy）、1/3・2/3あたりのキーフレームのうち、声が途切れている所で分ける。続けて再生すると元の1本と同じ。
使い方：python3 guide_split.py 元のフォルダ 書き出すフォルダ"""
import subprocess, sys, pathlib, json

SRC = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
LIMIT = 14_500_000

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-2000:]); sys.exit(1)
    return r.stdout

def loudness(f, t, w=0.5):
    """t のまわり（前後 w/2 秒）の音の大きさ（dB）。小さいほど、声が途切れている"""
    out = subprocess.run(["ffmpeg", "-v", "info", "-ss", f"{max(0, t - w / 2):.3f}", "-t", f"{w}", "-i", str(f), "-vn",
                          "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    for line in out.splitlines():
        if "mean_volume" in line:
            return float(line.split("mean_volume:")[1].split("dB")[0])
    return 0.0

for f in sorted(SRC.glob("nisa_ch*_720.mp4")):
    dur = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)]))
    keys = [float(x.strip(",")) for x in run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey",
                                   "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(f)]).split()]
    cuts = []
    for target in (dur / 3, dur * 2 / 3):
        cand = [k for k in keys if abs(k - target) <= 35]
        best = min(cand, key=lambda k: loudness(f, k))
        cuts.append(best)
    stem = f.stem
    for old in OUT.glob(f"{stem}_*.mp4"):
        old.unlink()
    run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-map", "0", "-c", "copy", "-f", "segment",
         "-segment_times", ",".join(f"{c - 0.02:.3f}" for c in cuts), "-reset_timestamps", "1",
         "-segment_format", "mp4", "-segment_format_options", "movflags=+faststart",
         "-segment_start_number", "1", str(OUT / f"{stem}_%d.mp4")])
    parts = sorted(OUT.glob(f"{stem}_*.mp4"))
    info = []
    for p in parts:
        d = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]))
        info.append((p.name, round(d, 2), p.stat().st_size))
    print(f"{f.name}: {dur:.2f}s cuts at {[round(c, 2) for c in cuts]} (loudness {[round(loudness(f, c), 1) for c in cuts]} dB)")
    for name, d, size in info:
        print(f"   {name}: {d}s {size:,} B {'OK' if size <= LIMIT else 'TOO BIG'}")
    print(f"   sum {sum(d for _, d, _ in info):.2f}s vs {dur:.2f}s")
