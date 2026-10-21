"""特典2のガイド動画 第1章（nisa_ch1_720.mp4）の最初の題の画面から、小さな見出し「おかねの地図の特典を、動画で」だけを消す。
・その1行の所（x 186〜553・y 166〜205）に、題が出る前のコマ（10コマ目）の同じ所の背景をかぶせる（17〜323コマ目＝0.57〜10.77秒）。
  出始めの17・18コマ目は、文字が下から動いてくるので、かぶせる所を下に広げる（y 166〜223。「ゼロからわかる」はその下）
・画質を落とさないよう、作り直すのは最初のキーフレームの区切り（500コマ目＝16.67秒）の手前までだけ。
  元と同じ x264 の設定・元の PPS の初期QPの固定QPで作ると、SPS/PPS が元と同じになり、後ろは元の映像をそのままつなげる（koza_cut.py と同じ考え）
・声は元のまま（長さは変わらない）
使い方：python3 guide_video_unbrand.py 元の動画 書き出す動画"""
import subprocess, pathlib, sys, json

SRC = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(sys.argv[2]).resolve()
WORK = OUT.parent / "_unbrand_work"
WORK.mkdir(parents=True, exist_ok=True)
FPS = 30
X, Y, W, H = 186, 166, 368, 40        # かぶせる所（「おかねの地図の特典を、動画で」の1行のまわり）
CLEAN_FRAME = 10                      # 題が出る前のコマ（背景だけ）
FIRST, LAST = 17, 323                 # 見出しが出ているコマ
H_IN, IN_LAST = 58, 18                # 出始め（17〜18コマ目）は高さ58にする
KF = 500                              # 作り直すのはここまで（キーフレーム）
X264 = ("ref=10:deblock=1,1:me=hex:subme=8:psy-rd=0.40,0.00:trellis=2:8x8dct=1:bframes=5:b-pyramid=normal:"
        "b-adapt=1:b-bias=0:direct=auto:weightb=1:weightp=2:keyint=250:min-keyint=25:scenecut=40:rc-lookahead=50:"
        "mbtree=1:qcomp=0.60:qpmin=0:qpmax=69:qpstep=4:aq-mode=1:aq-strength=0.60:open-gop=0:threads=6")


def run(cmd):
    r = subprocess.run(list(map(str, cmd)), capture_output=True, text=True)
    if r.returncode:
        print(" ".join(map(str, cmd)))
        print(r.stderr[-3000:])
        sys.exit(1)
    return r


def pic_init_qp(pps):
    """PPS（NALヘッダー込み）から pic_init_qp を読む（koza_cut.py と同じ）"""
    bits = "".join(f"{x:08b}" for x in pps[1:])
    pos = 0

    def ue():
        nonlocal pos
        z = 0
        while bits[pos] == "0":
            z += 1
            pos += 1
        pos += 1
        v = int(bits[pos:pos + z] or "0", 2) + (1 << z) - 1
        pos += z
        return v

    def u(n):
        nonlocal pos
        v = int(bits[pos:pos + n], 2)
        pos += n
        return v

    ue(); ue(); u(1); u(1)
    if ue() != 0:
        raise SystemExit("slice groups not supported")
    ue(); ue(); u(1); u(2)
    k = ue()
    return 26 + ((k + 1) // 2 if k % 2 else -(k // 2))


def nal_headers(path):
    """最初のアクセスユニットの SPS / PPS（バイト列）"""
    h = WORK / (path.stem + ".h264")
    run(["ffmpeg", "-v", "error", "-y", "-i", path, "-map", "0:v", "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-frames:v", "1", "-f", "h264", h])
    parts = [p for p in h.read_bytes().split(b"\x00\x00\x01") if p]
    out = {}
    for p in parts:
        t = p[0] & 0x1F
        if t in (7, 8) and t not in out:
            out[t] = p.rstrip(b"\x00")
    return out


def frames(path):
    return int(run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames",
                    "-of", "csv=p=0", path]).stdout.strip())


K = KF / FPS
# 1) KF から後ろは、元の映像をそのまま切り出す
for f in WORK.glob("seg*.mp4"):
    f.unlink()
run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-map", "0:v", "-c", "copy", "-f", "segment", "-segment_times", f"{K - 0.02:.6f}",
     "-reset_timestamps", "1", "-segment_format", "mp4", WORK / "seg%d.mp4"])
head_orig, tail = WORK / "seg0.mp4", WORK / "seg1.mp4"
assert frames(head_orig) == KF, frames(head_orig)
QP = pic_init_qp(nal_headers(SRC)[8])
print("元の初期QP:", QP)
# 2) かぶせる背景（題が出る前のコマの同じ所）
patch = WORK / "patch.png"
run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-vf", f"select=eq(n\\,{CLEAN_FRAME}),crop={W}:{H}:{X}:{Y}", "-frames:v", "1", patch])
patch_in = WORK / "patch_in.png"
run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-vf", f"select=eq(n\\,{CLEAN_FRAME}),crop={W}:{H_IN}:{X}:{Y}", "-frames:v", "1", patch_in])
# 3) KF より前を、背景をかぶせて元と同じ設定で作り直す
head = WORK / "head.mp4"
flt = (f"[0:v]trim=end_frame={KF},setpts=PTS-STARTPTS[v];[v][1:v]overlay={X}:{Y}:enable='between(n,{FIRST},{LAST})'[v2];"
       f"[v2][2:v]overlay={X}:{Y}:enable='between(n,{FIRST},{IN_LAST})'[o]")
run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-i", patch, "-i", patch_in, "-filter_complex", flt, "-map", "[o]", "-frames:v", KF,
     "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-colorspace", "bt470bg", "-color_range", "tv",
     "-qp", QP, "-x264-params", X264, head])
h1, h2 = nal_headers(head), nal_headers(tail)
print("SPS same:", h1.get(7) == h2.get(7), "| PPS same:", h1.get(8) == h2.get(8))
assert h1.get(7) == h2.get(7) and h1.get(8) == h2.get(8), "SPS/PPS がちがうので、そのままつなげない"
# 4) つなぐ → 元の声と合わせる
lst = WORK / "list.txt"
lst.write_text(f"file '{head}'\nfile '{tail}'\n")
video = WORK / "video.mp4"
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", SRC, "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", OUT])
# 5) 確かめる：最後まで読めるか・コマ数・長さ
dec = subprocess.run(["ffmpeg", "-v", "error", "-i", str(OUT), "-f", "null", "-"], capture_output=True, text=True)
info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,duration", "-of", "json", OUT]).stdout)
src_info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "json", SRC]).stdout)
n_out, n_src = frames(OUT), frames(SRC)
print("decode errors:", dec.stderr.strip()[:300] or "none")
print(f"frames {n_out} (元 {n_src}) | size {int(info['format']['size']):,} B (元 {int(src_info['format']['size']):,}) | "
      f"duration {float(info['format']['duration']):.3f}s (元 {float(src_info['format']['duration']):.3f}) | "
      + ", ".join(f"{s['codec_type']} {float(s['duration']):.3f}" for s in info["streams"]))
assert n_out == n_src and not dec.stderr.strip()
