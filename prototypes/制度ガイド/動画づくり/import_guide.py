"""制作セッションが動画一覧に公開した「制度ガイドの動画」（g01〜g16）を、入口ページに取りこむ準備をする。
先に Artifact の read で videos/gNN_duo.mp4 と thumbs/gNN_duo.jpg を guide_src/ に保存しておく。
このスクリプトは、長さを guide_ready.json に書き、カード用のポスター（360x640 の WebP）を out/posters/ に作る。
公開するときは、動画は動画一覧からサーバー側でコピーする（video/guide/gNN.mp4 ← videos/gNN_duo.mp4）。"""
import json
import pathlib
import subprocess
import sys

from PIL import Image

HERE = pathlib.Path(__file__).parent
SRC = HERE / "guide_src"
OUT = HERE / "out" / "posters"
READY = HERE / "guide_ready.json"


def seconds(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True)
    return round(float(out.stdout), 1)


def size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height,codec_name",
                          "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def main(ids):
    ready = json.loads(READY.read_text(encoding="utf-8")) if READY.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    for i in ids:
        mp4 = SRC / "videos" / f"{i}_duo.mp4"
        thumb = SRC / "thumbs" / f"{i}_duo.jpg"
        poster = SRC / "posters" / f"{i}_duo.jpg"
        if not mp4.exists():
            print(i, "動画がまだない"); continue
        info = size(mp4)
        ready[i] = seconds(mp4)
        pic = thumb if thumb.exists() else poster
        if pic.exists():
            Image.open(pic).convert("RGB").resize((360, 640), Image.LANCZOS).save(OUT / f"{i}.webp", "WEBP", quality=80, method=6)
        else:
            # 絵がないときは、動画の3秒目を使う
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "3", "-i", str(mp4), "-frames:v", "1", "-vf", "scale=360:640",
                                  "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
            Image.frombytes("RGB", (360, 640), raw).save(OUT / f"{i}.webp", "WEBP", quality=80, method=6)
        print(i, ready[i], "秒", info, "ポスター", "サムネ" if thumb.exists() else ("ポスター" if poster.exists() else "動画の3秒目"))
    READY.write_text(json.dumps(dict(sorted(ready.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:] or [f"g{n:02d}" for n in range(1, 17)])
