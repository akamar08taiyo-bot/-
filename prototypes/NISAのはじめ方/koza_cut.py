"""口座の作り方の動画（YouTube用）から、サイトでは使えない「口座を開くページは、概要欄のリンクから」の場面だけを抜く。
画質を落とさないよう、抜く場面の手前のキーフレームまでは元の映像をそのまま使い、そこから後ろ（数秒）だけを元と同じ設定で作り直してつなぐ。
声は、つなぎ目が静かなところで切って、ごく短く重ねてつなぐ。"""
import subprocess, pathlib, json, sys, shutil

# 使い方：python3 koza_cut.py 元のフォルダ 書き出すフォルダ
#   元のフォルダ … 「お金のしくみ 動画一覧」の videos/koza_1〜3.mp4 と posters/koza_1〜3.jpg を置いたフォルダ
#   書き出すフォルダ … videos/rakuten.mp4・sbi.mp4・esmart.mp4（と表紙の .jpg）ができる。サイトの videos/ にそのまま置く
SRC = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(sys.argv[2]).resolve()
WORK = OUT / "_work"
FPS = 30
X264 = ("ref=10:deblock=1,1:me=hex:subme=8:psy-rd=0.40,0.00:trellis=2:8x8dct=1:bframes=5:b-pyramid=normal:"
        "b-adapt=1:b-bias=0:direct=auto:weightb=1:weightp=2:keyint=250:min-keyint=25:scenecut=40:rc-lookahead=50:"
        "mbtree=1:qcomp=0.60:qpmin=0:qpmax=69:qpstep=4:aq-mode=1:aq-strength=0.60:open-gop=0:threads=6")
# (元の番号, サイトでの名前, キーフレームK, 抜き始めA, 戻りB(映像), 戻りB(声)) 時間は秒（1/30秒の倍数）
CUTS = [
    (1, "rakuten", 11250, 11275, 11378, 11378),
    (2, "sbi",     11000, 11043, 11162, 11162),
    (3, "esmart",  10500, 10592, 10702, 10701),
]

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        print(" ".join(map(str, cmd))); print(r.stderr[-3000:]); sys.exit(1)
    return r

def pic_init_qp(pps):
    """PPS（NALヘッダー込み）から pic_init_qp を読む"""
    bits = "".join(f"{x:08b}" for x in pps[1:])
    pos = 0
    def ue():
        nonlocal pos
        z = 0
        while bits[pos] == "0":
            z += 1; pos += 1
        pos += 1
        v = int(bits[pos:pos + z] or "0", 2) + (1 << z) - 1
        pos += z
        return v
    def u(n):
        nonlocal pos
        v = int(bits[pos:pos + n], 2); pos += n
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
    run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-map", "0:v", "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-frames:v", "1", "-f", "h264", str(h)])
    data = h.read_bytes()
    parts = [p for p in data.split(b"\x00\x00\x01") if p]
    out = {}
    for p in parts:
        t = p[0] & 0x1F
        if t in (7, 8) and t not in out:
            out[t] = p.rstrip(b"\x00")
    return out

(OUT / "videos").mkdir(parents=True, exist_ok=True)
WORK.mkdir(exist_ok=True)
for n, name, kf, af, bf, baf in CUTS:
    src = SRC / "videos" / f"koza_{n}.mp4"
    K, A, B, BA = kf / FPS, af / FPS, bf / FPS, baf / FPS
    AA = A - (B - BA)  # 声を映像より少し早く戻すときは、その分だけ手前で切って、長さをそろえる
    print(f"== {name}: K={K:.3f} A={A:.3f} B={B:.3f} (声 {AA:.3f}→{BA:.3f})")
    # 1) K より前は、元の映像をそのまま
    for f in WORK.glob(f"{name}_seg*.mp4"): f.unlink()
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-map", "0:v", "-c", "copy", "-f", "segment",
         "-segment_times", f"{K - 0.02:.6f}", "-reset_timestamps", "1", "-segment_format", "mp4", str(WORK / f"{name}_seg%d.mp4")])
    head = WORK / f"{name}_seg0.mp4"
    QP = pic_init_qp(nal_headers(head)[8])
    print("   元の初期QP:", QP)
    # 2) K から後ろ：抜く場面を除いて、元と同じ設定で作り直す（2パス）
    flt = (f"[0:v]split[a][b];[a]trim=start_frame=0:end_frame={af - kf},setpts=PTS-STARTPTS[v1];"
           f"[b]trim=start_frame={bf - kf},setpts=PTS-STARTPTS[v2];[v1][v2]concat=n=2:v=1:a=0,fps={FPS}[v]")
    tail = WORK / f"{name}_tail.mp4"
    # 元の PPS の初期QPは 40。固定QP 40 で作ると同じ PPS になり、そのままつなげる（元の平均の細かさとほぼ同じ）
    common = ["-filter_complex", flt, "-map", "[v]", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
              "-colorspace", "bt470bg", "-color_range", "tv", "-qp", str(QP), "-x264-params", X264]
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{K:.6f}", "-i", str(src)] + common + [str(tail)])
    h1, h2 = nal_headers(head), nal_headers(tail)
    print("   SPS same:", h1.get(7) == h2.get(7), "| PPS same:", h1.get(8) == h2.get(8))
    if h1.get(7) != h2.get(7) or h1.get(8) != h2.get(8):
        print("   head SPS", h1.get(7).hex()); print("   tail SPS", h2.get(7).hex())
        print("   head PPS", h1.get(8).hex()); print("   tail PPS", h2.get(8).hex())
        sys.exit(1)
    # 3) つなぐ
    lst = WORK / f"{name}_list.txt"
    lst.write_text(f"file '{head}'\nfile '{tail}'\n")
    video = WORK / f"{name}_video.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(video)])
    # 4) 声：静かなところで切って、20ミリ秒だけ重ねてつなぐ
    d = 0.02
    aflt = (f"[0:a]atrim=end={AA + d / 2:.6f},asetpts=PTS-STARTPTS[a1];[0:a]atrim=start={BA - d / 2:.6f},asetpts=PTS-STARTPTS[a2];"
            f"[a1][a2]acrossfade=d={d}:c1=tri:c2=tri[a]")
    audio = WORK / f"{name}_audio.m4a"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", aflt, "-map", "[a]", "-c:a", "aac", "-b:a", "48k", "-ac", "1", "-ar", "48000", str(audio)])
    # 5) 映像と声を合わせる（再生がすぐ始まるよう faststart）
    out = OUT / "videos" / f"{name}.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c", "copy",
         "-movflags", "+faststart", str(out)])
    shutil.copyfile(SRC / "posters" / f"koza_{n}.jpg", OUT / "videos" / f"{name}.jpg")
    # 確かめる：最後まで読めるか・コマ数・長さ
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-f", "null", "-"], capture_output=True, text=True)
    frames = run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(out)]).stdout.strip()
    info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,duration", "-of", "json", str(out)]).stdout)
    src_frames = int(run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(src)]).stdout.strip())
    expect = src_frames - (bf - af)
    print(f"   decode errors: {dec.stderr.strip()[:300] or 'none'}")
    print(f"   frames {frames} (expected {expect}) | size {int(info['format']['size']):,} B | duration {float(info['format']['duration']):.3f}s |",
          ", ".join(f"{s['codec_type']} {float(s['duration']):.3f}" for s in info["streams"]))
