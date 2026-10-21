"""口座の作り方の動画（武将なし版・2026年10月21日）から、サイトでは使えない「口座を開くページは、概要欄のリンクから」の場面だけを抜く。
koza_cut.py と同じやり方：抜く場面の手前のキーフレームまでは元の映像をそのまま使い、そこから後ろだけを元と同じ設定（x264・固定QP＝元の PPS の初期QP）で
作り直してつなぐ。声は、映像と同じ所（どちらも声のない所）で切って、ごく短く重ねてつなぐ。
・抜く所：前の場面（ここまでの道のり）が消えたあと、「概要欄のリンクから」の場面が出始めるコマ（A）から、
  次の場面（これで完了！）が出始めるコマ（B）の手前まで。どちらも、そのコマから吹き出しが替わる。
使い方：python3 koza_cut2.py 受け取った動画のフォルダ 表紙のフォルダ 書き出すフォルダ
  受け取った動画のフォルダ … 受け渡しページの asset（<asset id>.mp4）を置いたフォルダ
  表紙のフォルダ … 受け渡しページの videos/rakuten.jpg・sbi.jpg・esmart.jpg を置いたフォルダ
  書き出すフォルダ … videos/rakuten.mp4・sbi.mp4・esmart.mp4（と表紙の .jpg）ができる。サイトの videos/ にそのまま置く"""
import subprocess, pathlib, json, sys, shutil

SRC = pathlib.Path(sys.argv[1]).resolve()
COVERS = pathlib.Path(sys.argv[2]).resolve()
OUT = pathlib.Path(sys.argv[3]).resolve()
WORK = OUT / "_work"
FPS = 30
X264 = ("ref=10:deblock=1,1:me=hex:subme=8:psy-rd=0.40,0.00:trellis=2:8x8dct=1:bframes=5:b-pyramid=normal:"
        "b-adapt=1:b-bias=0:direct=auto:weightb=1:weightp=2:keyint=250:min-keyint=25:scenecut=40:rc-lookahead=50:"
        "mbtree=1:qcomp=0.60:qpmin=0:qpmax=69:qpstep=4:aq-mode=1:aq-strength=0.60:open-gop=0:threads=6")
# (サイトでの名前, 受け取った動画, キーフレームK, 抜き始めA, 戻りB)  数字はコマ（1/30秒）
CUTS = [
    ("rakuten", "ccc2afbf2bf72bb480638482d69c7eb7.mp4", 11906, 12080, 12198),
    ("sbi",     "132941391dd67e594177b05797748507.mp4", 11250, 11399, 11517),
    ("esmart",  "39d26630944290f1bc5df4cb44182cb6.mp4", 11000, 11070, 11188),
]
XFADE = 0.03   # 声のつなぎ目を重ねる長さ（秒）


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


(OUT / "videos").mkdir(parents=True, exist_ok=True)
WORK.mkdir(exist_ok=True)
for name, file, kf, af, bf in CUTS:
    src = SRC / file
    K, A, B = kf / FPS, af / FPS, bf / FPS
    print(f"== {name}: K={K:.3f} A={A:.3f} B={B:.3f}（{bf - af}コマ・{B - A:.3f}秒を抜く）")
    # 1) K より前は、元の映像をそのまま
    for f in WORK.glob(f"{name}_seg*.mp4"):
        f.unlink()
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-map", "0:v", "-c", "copy", "-f", "segment", "-segment_times", f"{K - 0.02:.6f}",
         "-reset_timestamps", "1", "-segment_format", "mp4", WORK / f"{name}_seg%d.mp4"])
    head = WORK / f"{name}_seg0.mp4"
    assert frames(head) == kf, (name, frames(head), kf)
    QP = pic_init_qp(nal_headers(src)[8])
    print("   元の初期QP:", QP)
    # 2) K から後ろ：抜く場面を除いて、元と同じ設定で作り直す
    flt = (f"[0:v]split[a][b];[a]trim=start_frame=0:end_frame={af - kf},setpts=PTS-STARTPTS[v1];"
           f"[b]trim=start_frame={bf - kf},setpts=PTS-STARTPTS[v2];[v1][v2]concat=n=2:v=1:a=0,fps={FPS}[v]")
    tail = WORK / f"{name}_tail.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-ss", f"{K:.6f}", "-i", src, "-filter_complex", flt, "-map", "[v]", "-c:v", "libx264",
         "-profile:v", "high", "-pix_fmt", "yuv420p", "-colorspace", "bt470bg", "-color_range", "tv", "-qp", QP, "-x264-params", X264, tail])
    h1, h2 = nal_headers(head), nal_headers(tail)
    print("   SPS same:", h1.get(7) == h2.get(7), "| PPS same:", h1.get(8) == h2.get(8))
    assert h1.get(7) == h2.get(7) and h1.get(8) == h2.get(8), "SPS/PPS がちがうので、そのままつなげない"
    # 3) つなぐ
    lst = WORK / f"{name}_list.txt"
    lst.write_text(f"file '{head}'\nfile '{tail}'\n")
    video = WORK / f"{name}_video.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
    # 4) 声：映像と同じ所で切って、短く重ねてつなぐ（元と同じモノラル 64kbps）
    d = XFADE
    aflt = (f"[0:a]atrim=end={A + d / 2:.6f},asetpts=PTS-STARTPTS[a1];[0:a]atrim=start={B - d / 2:.6f},asetpts=PTS-STARTPTS[a2];"
            f"[a1][a2]acrossfade=d={d}:c1=tri:c2=tri[a]")
    audio = WORK / f"{name}_audio.m4a"
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", aflt, "-map", "[a]", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "48000", audio])
    # 5) 映像と声を合わせる（再生がすぐ始まるよう faststart）
    out = OUT / "videos" / f"{name}.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a", "-c", "copy", "-movflags", "+faststart", out])
    shutil.copyfile(COVERS / f"{name}.jpg", OUT / "videos" / f"{name}.jpg")
    # 確かめる：最後まで読めるか・コマ数・長さ
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-f", "null", "-"], capture_output=True, text=True)
    n_out, n_src = frames(out), frames(src)
    info = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,duration", "-of", "json", out]).stdout)
    print(f"   decode errors: {dec.stderr.strip()[:300] or 'none'}")
    print(f"   frames {n_out} (expected {n_src - (bf - af)}) | size {int(info['format']['size']):,} B | duration {float(info['format']['duration']):.3f}s |",
          ", ".join(f"{s['codec_type']} {float(s['duration']):.3f}" for s in info["streams"]))
    assert n_out == n_src - (bf - af) and not dec.stderr.strip()
