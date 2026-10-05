"""指定した時刻のフレームから、見出しと吹き出しの部分を切り出して1枚に並べる。"""
import subprocess, sys
from PIL import Image, ImageDraw, ImageFont

FONT = None
for p in ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
    try:
        FONT = ImageFont.truetype(p, 22); break
    except OSError:
        pass

def grab(path, t):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return Image.frombytes("RGB", (720, 1280), raw)

def tile(path, times, out, cols=3):
    cells = []
    for t in times:
        im = grab(path, t)
        top = im.crop((0, 140, 720, 230))
        bub = im.crop((0, 790, 720, 1000))
        c = Image.new("RGB", (720, 330), "white")
        c.paste(top, (0, 30)); c.paste(bub, (0, 120))
        d = ImageDraw.Draw(c)
        d.rectangle((0, 0, 720, 28), fill="black")
        d.text((8, 2), f"{t:.1f}s", fill="yellow", font=FONT)
        cells.append(c.resize((360, 165)))
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 364, rows * 169), "gray")
    for i, c in enumerate(cells):
        sheet.paste(c, ((i % cols) * 364, (i // cols) * 169))
    sheet.save(out)

if __name__ == "__main__":
    path, out = sys.argv[1], sys.argv[2]
    times = [float(x) for x in sys.argv[3:]]
    tile(path, times, out)
