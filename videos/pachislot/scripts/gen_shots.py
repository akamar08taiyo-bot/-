#!/usr/bin/env python3
"""カット表（episodes/<回>/shots.json）の場面画を Gemini で作り、版ごとに記録する（横長 16:9 の回用）。

  python3 -I scripts/gen_shots.py --ep ep01                  # まだ絵の無いカットを全部（並行 --jobs）
  python3 -I scripts/gen_shots.py --ep ep01 S03-3 S04-1      # 指定カットを作り直す（版を1つ進める）
  python3 -I scripts/gen_shots.py --ep ep01 S03-3 --extra "直したい点"
  python3 -I scripts/gen_shots.py --ep ep01 --publish        # 採用版（shots.json の pick、なければ最新版）を public へ

公開用の JPEG には imgfx の masks（文字・リールの出目を読めなくするぼかし）を焼き込み、カード・メモの後ろに敷く
ぼかした絵（<絵>_b<px>.jpg）も作る（書き出しのたびに CSS でぼかすと重いため。scripts/imgfx.py）。
引き継ぎの採用場面画は episodes/<回>/adopted/A0x.png に置き、同じように public へ出す。

指示文は、作風（style）＋参照画像の説明＋そのカットの人物（cast）＋場所（locs）＋カットの指示（prompt）＋守ること（rules）。
img を書いたカット（使い回し・引き継ぎの採用場面画 A01〜A05）は作らない。
出力: episodes/<回>/gen/<ID>_v<n>.png と ledger.json、public/<回>/img/<ID>.jpg（画面で使う絵）
"""
import argparse, concurrent.futures as cf, glob, json, os, re, sys, threading, time
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gapi
from common import ROOT, episode
from imgfx import apply_masks, blurred
from PIL import Image

EP = episode()
P = json.load(open(os.path.join(EP.dir, 'shots.json'), encoding='utf-8'))
GEN = EP.gen
IMG = os.path.join(EP.pub, 'img')
os.makedirs(GEN, exist_ok=True)
os.makedirs(IMG, exist_ok=True)
ap = argparse.ArgumentParser()
ap.add_argument('ids', nargs='*')
ap.add_argument('--extra', default='')
ap.add_argument('--jobs', type=int, default=5)
ap.add_argument('--model', default='gemini-3-pro-image')
ap.add_argument('--size', default='2K')
ap.add_argument('--publish', action='store_true', help='作らずに、採用版を public/<回>/img へ書き出すだけ')
a = ap.parse_args()

gen_shots = {s['id']: s for s in P['shots'] if 'prompt' in s}
lock = threading.Lock()
led_path = os.path.join(GEN, 'ledger.json')


def versions(sid):
    return sorted(glob.glob(os.path.join(GEN, f'{sid}_v*.png')), key=lambda p: int(re.findall(r'_v(\d+)\.png$', p)[0]))


def prompt_of(s, extra=''):
    refs = [P['refs'][r] for r in s.get('refs', [])]
    ref_txt = ' '.join(f'Reference image {i + 1} is {r["desc"]}.' for i, r in enumerate(refs))
    cast = '\n'.join(P['cast'][c] for c in s.get('cast', [])) or 'No people appear in this shot except hands or figures explicitly described.'
    text = (f"{P['style']}\n\n{ref_txt}\n\nCharacters in this shot:\n{cast}\n\nSetting: {P['locs'][s['loc']]}\n\n"
            f"Shot: {s['prompt']}\n\n{P['rules']}")
    if extra:
        text += '\n\nRevision notes: ' + extra
    return text, [os.path.join(ROOT, r['path']) for r in refs]


FX = P.get('imgfx', {})
ADOPTED = os.path.join(EP.dir, 'adopted')


def source(img):
    """絵の元（作った絵は採用版、引き継ぎの採用場面画は adopted/）"""
    if img in gen_shots:
        vs = versions(img)
        if not vs:
            return None
        return os.path.join(GEN, f"{img}_v{gen_shots[img]['pick']}.png") if gen_shots[img].get('pick') else vs[-1]
    path = os.path.join(ADOPTED, f'{img}.png')
    return path if os.path.exists(path) else None


def publish(img):
    """画面用の JPEG（masks を焼き込む）と、その絵を使うカードの後ろのぼかし版を作る"""
    src = source(img)
    if not src:
        return None
    im = apply_masks(Image.open(src).convert('RGB'), FX.get(img, {}).get('masks'))
    out = os.path.join(IMG, f'{img}.jpg')
    im.save(out, 'JPEG', quality=90)
    for px in sorted({s['blur'] for s in P['shots'] if s.get('blur') and s.get('img', s['id']) == img}):
        blurred(im, px).save(os.path.join(IMG, f'{img}_b{px}.jpg'), 'JPEG', quality=88)
    return out


def make(sid):
    s = gen_shots[sid]
    text, refs = prompt_of(s, a.extra)
    n = 1
    while True:  # 並行して走らせても同じ版番号を取り合わないよう、ファイルを先に確保する
        out = os.path.join(GEN, f'{sid}_v{n}.png')
        try:
            os.close(os.open(out, os.O_CREAT | os.O_EXCL))
            break
        except FileExistsError:
            n += 1
    t0 = time.time()
    try:
        usage, notes = gapi.image(text, out, refs=refs, model=a.model, aspect='16:9', size=a.size)
    except Exception as e:
        os.remove(out)
        print(f'{sid} 失敗: {e}', flush=True)
        return
    dt = time.time() - t0
    im = Image.open(out)
    if im.format != 'PNG':
        im.save(out, 'PNG')
    with lock:
        led = json.load(open(led_path)) if os.path.exists(led_path) else {'records': []}
        led['records'].append({'id': f'{sid}_v{n}', 'model': a.model, 'size': a.size, 'px': list(im.size),
                               'refs': [os.path.relpath(r, ROOT) for r in refs], 'extra': a.extra,
                               'seconds': round(dt, 1), 'usage': usage, 'model_text': notes,
                               'created_utc': datetime.now(timezone.utc).isoformat(), 'prompt': text})
        json.dump(led, open(led_path, 'w'), ensure_ascii=False, indent=1)
    publish(sid)
    print(f'{sid}_v{n} {im.size[0]}x{im.size[1]} {dt:.0f}s', flush=True)


if a.publish:
    imgs = sorted({s.get('img', s['id']) for s in P['shots']})
    done = [img for img in imgs if publish(img)]
    missing = [img for img in imgs if img not in done]
    print(f'public/{EP.id}/img に {len(done)} 枚', ('まだ無い: ' + ' '.join(missing)) if missing else '')
    sys.exit(0)

todo = a.ids or [sid for sid in gen_shots if not versions(sid)]
unknown = [sid for sid in todo if sid not in gen_shots]
if unknown:
    sys.exit('作るカットではありません（img の使い回しか、shots.json に無い）: ' + ' '.join(unknown))
print(f'{len(todo)} 枚を作ります（並行 {a.jobs}）', flush=True)
with cf.ThreadPoolExecutor(max(1, a.jobs)) as ex:
    list(ex.map(make, todo))
