"""字幕の吹き出しと順位の見出しの切り替わりの時刻を出す（PILだけで）。"""
import subprocess, sys
from PIL import Image, ImageChops, ImageStat

W, H, FPS = 180, 320, 10

def frames(path):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H},format=gray", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (W * H)
    return [Image.frombytes("L", (W, H), raw[i * W * H:(i + 1) * W * H]) for i in range(n)]

def changes(fr, y0, y1, thr):
    reg = [f.crop((0, y0, W, y1)) for f in fr]
    out = []
    for i in range(1, len(reg)):
        v = ImageStat.Stat(ImageChops.difference(reg[i], reg[i - 1])).mean[0]
        if v > thr:
            t = i / FPS
            if out and t - out[-1][0] < 0.35:
                if v > out[-1][1]:
                    out[-1] = (out[-1][0], v)
                continue
            out.append((t, v))
    return out

if __name__ == "__main__":
    fr = frames(sys.argv[1])
    print("frames", len(fr))
    print("title:", " ".join(f"{t:.1f}" for t, v in changes(fr, 37, 55, 6)))
    print("bubble:", " ".join(f"{t:.1f}" for t, v in changes(fr, 205, 245, 6)))
