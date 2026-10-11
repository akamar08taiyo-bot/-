# YouTube のサムネイル（1280×720）を、原画に文字を重ねて作る
# 使い方: python3 -I scripts/make_thumbnail.py [名前 ...]   （省略時は全部）→ thumbnails/<名前>.jpg と一覧 thumbnails/sheet.jpg
# 文字は本編と同じ Zen Old Mincho（システムに入れたもの）。縦書きは raqm の vert を使う
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = Path(__file__).resolve().parent.parent
out = root / 'thumbnails'
FONT = {'bold': '/usr/local/share/fonts/zen/ZenOldMincho-Bold.ttf', 'regular': '/usr/local/share/fonts/zen/ZenOldMincho-Regular.ttf'}
W, H = 1280, 720
CREAM = (251, 246, 234)

# 各サムネイル：元絵、切り抜き（横位置の中心 0..1）、文字の暗がり、本文（縦書き or 横書き）、シリーズ名
SPECS = {
    'ch1_A': {'src': 'assets/gen/N14_v1.jpg', 'cx': 0.5, 'shade': ('top', 0.62, 0.42),
              'main': {'dir': 'h', 'lines': ['2080年の、昭和の夏。'], 'size': 96, 'x': 0.5, 'y': 0.1, 'align': 'center'},
              'label': {'text': 'AIと人間の共存　第一章', 'size': 28, 'x': 0.035, 'y': 0.035, 'align': 'left'}},
    'ch1_B': {'src': 'assets/gen/N10_v1.jpg', 'cx': 0.5, 'shade': ('right', 0.6, 0.45),
              'main': {'dir': 'v', 'lines': ['まだ来ない', '未来なのに、', '懐かしい。'], 'size': 82, 'x': 0.935, 'y': 0.075},
              'label': {'text': 'AIと人間の共存　第一章', 'size': 28, 'x': 0.035, 'y': 0.035, 'align': 'left'}},
    'ch2_A': {'src': 'thumbnails/src/K2A_v1.jpg', 'cx': 0.5, 'shade': ('top', 0.55, 0.45),
              'main': {'dir': 'h', 'lines': ['砂の向こうに、', 'あの夏があった。'], 'size': 92, 'x': 0.06, 'y': 0.12, 'align': 'left'},
              'label': {'text': 'AIと人間の共存　第二章「砂の向こうから来た男」', 'size': 28, 'x': 0.035, 'y': 0.035, 'align': 'left'}},
    'ch2_B': {'src': 'thumbnails/src/K2B_v2.jpg', 'cx': 0.5, 'shade': ('right', 0.62, 0.42),
              'main': {'dir': 'v', 'lines': ['昭和六十一年、', '最後の夏。'], 'size': 96, 'x': 0.93, 'y': 0.07},
              'label': {'text': 'AIと人間の共存　第二章', 'size': 28, 'x': 0.035, 'y': 0.915, 'align': 'left'}},
}


def load(src, cx):
    im = Image.open(root / src).convert('RGB')
    w, h = im.size
    cw = min(w, round(h * 16 / 9)); ch = round(cw * 9 / 16)
    x0 = max(0, min(w - cw, round(cx * w - cw / 2))); y0 = (h - ch) // 2
    return im.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS)


def shade(im, side, strength, reach):
    # 文字の側だけ、なめらかに暗くする（読みやすさのため。絵の雰囲気は残す）
    g = Image.new('L', (W, H), 0); px = g.load()
    for yy in range(H):
        for xx in range(0, W, 4):
            t = (yy / H) if side == 'top' else ((W - xx) / W) if side == 'right' else (xx / W)
            a = int(255 * strength * max(0.0, 1 - t / reach) ** 1.6)
            for k in range(4):
                if xx + k < W:
                    px[xx + k, yy] = a
    dark = Image.new('RGB', (W, H), (8, 10, 18))
    return Image.composite(dark, im, g)


def text_layer(draw_fn):
    # 影（ぼかした黒）＋細い縁取り＋クリーム色の文字
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(shadow), (0, 0, 0, 200), 6)
    shadow = shadow.filter(ImageFilter.GaussianBlur(9))
    fg = Image.new('RGBA', (W, H), (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(fg), CREAM + (255,), 0)
    return shadow, fg


def main_text(spec):
    f = ImageFont.truetype(FONT['bold'], spec['size'])
    lines = spec['lines']

    def draw(d, fill, extra):
        sw = 2 + extra
        if spec['dir'] == 'h':
            lh = spec['size'] * 1.32
            for i, line in enumerate(lines):
                tw = d.textlength(line, font=f) + 0.06 * spec['size'] * (len(line) - 1)
                x = spec['x'] * W - (tw / 2 if spec.get('align') == 'center' else 0)
                y = spec['y'] * H + i * lh
                for chr_ in line:  # 字間を少しあける
                    d.text((x, y), chr_, font=f, fill=fill, stroke_width=sw, stroke_fill=(20, 18, 24, fill[3]))
                    x += d.textlength(chr_, font=f) + 0.06 * spec['size']
        else:
            colw = spec['size'] * 1.3
            for i, line in enumerate(lines):  # 右の列から
                x = spec['x'] * W - spec['size'] / 2 - i * colw
                d.text((x, spec['y'] * H + (i * spec['size'] * 0.6)), line, font=f, fill=fill, direction='ttb', features=['vert'],
                       stroke_width=sw, stroke_fill=(20, 18, 24, fill[3]))
    return draw


def label_text(spec):
    f = ImageFont.truetype(FONT['regular'], spec['size'])

    def draw(d, fill, extra):
        tw = d.textlength(spec['text'], font=f)
        x = spec['x'] * W - (tw / 2 if spec.get('align') == 'center' else 0)
        y = spec['y'] * H
        d.text((x, y), spec['text'], font=f, fill=fill, stroke_width=1 + extra, stroke_fill=(20, 18, 24, fill[3]))
        d.line((x, y + spec['size'] * 1.45, x + tw, y + spec['size'] * 1.45), fill=fill, width=1)
    return draw


def make(name):
    s = SPECS[name]
    im = load(s['src'], s['cx'])
    if s.get('shade'):
        im = shade(im, *s['shade'])
    im = im.convert('RGBA')
    for fn in (main_text(s['main']), label_text(s['label'])):
        sh, fg = text_layer(fn)
        im = Image.alpha_composite(Image.alpha_composite(im, sh), fg)
    out.mkdir(exist_ok=True)
    p = out / f'{name}.jpg'
    im.convert('RGB').save(p, quality=90, optimize=True)
    return p


names = sys.argv[1:] or list(SPECS)
paths = [make(n) for n in names]
for p in paths:
    print(p.relative_to(root), round(p.stat().st_size / 1024), 'KB')
# 一覧（実寸の半分）と、スマホの一覧表示に近い小ささ（320×180）
tiles = [Image.open(p).resize((640, 360), Image.LANCZOS) for p in paths]
small = [Image.open(p).resize((320, 180), Image.LANCZOS) for p in paths]
sheet = Image.new('RGB', (1280 + 340, max(360 * ((len(tiles) + 1) // 2), 10 + 190 * len(small))), (24, 24, 28))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % 2) * 640, (i // 2) * 360))
for i, t in enumerate(small):
    sheet.paste(t, (1290, 10 + i * 190))
sheet.save(out / 'sheet.jpg', quality=85)
