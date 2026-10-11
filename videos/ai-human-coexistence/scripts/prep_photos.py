# assets/sources.json の原画を動画用に整える → public/photos/<ID>.jpg（幅 2560、16:9 に中央トリム）
import json, sys
from pathlib import Path
from PIL import Image, ImageFilter

root = Path(__file__).resolve().parent.parent
src = json.loads((root / 'assets' / 'sources.json').read_text())['photos']
out = root / 'public' / 'photos'
out.mkdir(parents=True, exist_ok=True)
only = set(sys.argv[1:])
meta = {}
for key, info in src.items():
    if only and key not in only:
        continue
    im = Image.open(root / info['path']).convert('RGB')
    w, h = im.size
    # 16:9 に中央トリム
    tw = min(w, round(h * 16 / 9)); th = round(tw * 9 / 16)
    l = (w - tw) // 2; t = (h - th) // 2
    im = im.crop((l, t, l + tw, t + th))
    W, H = 2560, 1440
    if im.size != (W, H):
        up = W > im.size[0]
        im = im.resize((W, H), Image.LANCZOS)
        if up:
            im = im.filter(ImageFilter.UnsharpMask(radius=1.4, percent=35, threshold=2))
    im.save(out / f'{key}.jpg', quality=93, subsampling=0)
    meta[key] = {'from': info['path'], 'orig_size': [w, h], 'crop': [l, t, tw, th]}
    print(key, (w, h), '->', (W, H))
(root / 'public' / 'photos' / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
