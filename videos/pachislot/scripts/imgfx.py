"""絵に焼き込む効果（書き出しのたびに CSS でぼかすと重いので、公開用の JPEG を作るときに一度だけかける）。

  masks … [x0, y0, x1, y1, 種類]（0〜1）。種類 0 は普通のぼかし（絵の中の文字を読めなくする）、
          1 は縦に流れるぼかし（回っているリールに見せ、出目を読めなくする）。縁は少しぼかしてなじませる
  blurred … カード・メモの後ろに敷く、ぼかして少し暗くした絵
"""
import numpy as np
from PIL import Image, ImageFilter


def _alpha(w, h, box, feather=0.012):
    x0, y0, x1, y1 = box
    xs = np.linspace(0, 1, w)
    ys = np.linspace(0, 1, h)
    ax = np.clip(np.minimum((xs - (x0 - feather)) / (2 * feather), ((x1 + feather) - xs) / (2 * feather)), 0, 1)
    ay = np.clip(np.minimum((ys - (y0 - feather)) / (2 * feather), ((y1 + feather) - ys) / (2 * feather)), 0, 1)
    return (ay[:, None] * ax[None, :])[..., None]


def _vblur(a, length):
    """縦方向の箱ぼかしを2回（なめらかな縦の流れ）"""
    for _ in range(2):
        p = np.pad(a, ((length // 2, length - 1 - length // 2), (0, 0), (0, 0)), mode='edge')
        c = np.concatenate([np.zeros((1,) + p.shape[1:], dtype=p.dtype), np.cumsum(p, axis=0)], axis=0)
        a = (c[length:] - c[:-length]) / length
    return a


def apply_masks(im, masks):
    if not masks:
        return im
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    h, w = a.shape[:2]
    soft = np.asarray(im.convert('RGB').filter(ImageFilter.GaussianBlur(w * 0.007)), dtype=np.float32)
    reel = None
    for m in masks:
        kind = m[4] if len(m) > 4 else 0
        if kind == 1:
            if reel is None:
                reel = _vblur(np.asarray(im.convert('RGB').filter(ImageFilter.GaussianBlur(w * 0.0008)), dtype=np.float32), int(h * 0.05))
            src = reel
        else:
            src = soft
        al = _alpha(w, h, m[:4])
        a = a * (1 - al) + src * al
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def blurred(im, px, dim=0.8):
    """CSS の blur(px) brightness(dim) と同じ見た目（画面幅 1920 で px のぼかし）"""
    r = px * im.width / 1920
    out = im.convert('RGB').filter(ImageFilter.GaussianBlur(r))
    return Image.fromarray((np.asarray(out, dtype=np.float32) * dim).astype(np.uint8))
