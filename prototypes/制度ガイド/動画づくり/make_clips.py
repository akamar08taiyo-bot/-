"""clips.py の表から、短い動画（720x1280・H.264/AAC）とポスター（WebP）を書き出す。"""
import json, pathlib, subprocess, sys
from PIL import Image
from clips import CLIPS, FULL
from audio_level import env, db

HERE = pathlib.Path(__file__).parent
SRC = HERE / "src" / "videos"
OUT = HERE / "out"
(OUT / "clips").mkdir(parents=True, exist_ok=True)
(OUT / "posters").mkdir(parents=True, exist_ok=True)

def run(cmd):
    subprocess.run(cmd, check=True)

def poster(src, t, dst):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    im = Image.frombytes("RGB", (720, 1280), raw).resize((360, 640), Image.LANCZOS)
    im.save(dst, "WEBP", quality=80, method=6)

def seconds(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True)
    return round(float(out.stdout), 1)


def main(only):
    env_cache = {}
    # 長さは durations.json にも残す（動画のない所で入口のページを作っても、同じ秒数になるように）
    dpath = HERE / "durations.json"
    durations = json.loads(dpath.read_text(encoding="utf-8")) if dpath.exists() else {}
    for c in CLIPS:
        if only and c["id"] not in only:
            continue
        src = SRC / f"{c['src']}_duo.mp4"
        dur = round(c["end"] - c["start"], 2)
        # 終わりの音：最後に声（-17dBより大きい音）がある所から切れ目までを消す長さにする（0.04〜0.15秒）
        e = env_cache.setdefault(c["src"], env(str(src)))
        last = max([i for i in range(int((c["end"] - 0.3) * 100), int(c["end"] * 100)) if db(e[i]) > -17] or [0]) / 100
        fade = min(0.15, max(0.04, round(c["end"] - last - 0.01, 2)))
        af = []
        if c["start"] > 0:
            af.append("afade=t=in:st=0:d=0.03")
        af.append(f"afade=t=out:st={dur - fade:.2f}:d={fade:.2f}")
        dst = OUT / "clips" / f"{c['id']}.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{c['start']:.2f}", "-i", str(src), "-t", f"{dur:.2f}",
             "-af", ",".join(af), "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-g", "150",
             "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
             "-movflags", "+faststart", str(dst)])
        poster(src, c["poster"], OUT / "posters" / f"{c['id']}.webp")
        durations[c["id"]] = seconds(dst)
        print(c["id"], dur, "s", "fade", fade, dst.stat().st_size // 1024, "KB")

    if not only:
        for k in FULL:
            src = SRC / f"{k}_duo.mp4"
            im = Image.open(HERE / "src" / "thumbs" / f"{k}_duo.jpg").convert("RGB").resize((360, 640), Image.LANCZOS)
            im.save(OUT / "posters" / f"{k}.webp", "WEBP", quality=80, method=6)
            durations[k] = seconds(src)
    dpath.write_text(json.dumps(durations, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
