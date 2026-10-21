#!/usr/bin/env python3
"""ショート（縦型 9:16）の台本とカット表を、短い仕様（episodes/shorts/specs/<id>.json）から組み立てる。

  python3 -I scripts/short_build.py sh01 [sh02 ...]   → episodes/<id>/script.json と shots.json

仕様に書くのは、その回だけのもの（題・行・カット・画面の文字・音の合図）。作風・人物・場所・参照画像は
episodes/shorts/common.json、声（cast・styles）は第1話の script.json から引き継ぐ。
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMON = json.load(open(os.path.join(ROOT, 'episodes', 'shorts', 'common.json'), encoding='utf-8'))
BASE = json.load(open(os.path.join(ROOT, 'episodes', 'ep01', 'script.json'), encoding='utf-8'))

for sid in sys.argv[1:]:
    spec = json.load(open(os.path.join(ROOT, 'episodes', 'shorts', 'specs', f'{sid}.json'), encoding='utf-8'))
    out = os.path.join(ROOT, 'episodes', sid)
    os.makedirs(out, exist_ok=True)
    script = {
        'id': sid, 'series': BASE['series'], 'season': '番外編', 'episode': spec['title'],
        'title': f"{BASE['series']} 番外編「{spec['title']}」",
        'format': 'vertical', 'fps': 30, 'len': [30, 180], 'tail': spec.get('tail', 0.8), 'srt': 'chunks',
        'source': spec.get('source', '番外編の創作実戦ログ。本編の帳簿とは別'),
        'voice': BASE['voice'], 'cast': {**BASE['cast'], **spec.get('cast', {})},
        'styles': {**BASE['styles'], **spec.get('styles', {})},
        'pauses': BASE.get('pauses', {'max': 0.55, 'keep': 0.42}), 'levels': BASE.get('levels', {}), 'tempo': BASE.get('tempo', {}),
        'lines': spec['lines'], 'screen': spec.get('screen', {}),
        'sfx': spec.get('sfx', []), 'beds': spec.get('beds', []), 'music': spec.get('music', []),
    }
    json.dump(script, open(os.path.join(out, 'script.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    shots = {k: COMMON[k] for k in ('aspect', 'style', 'rules', 'cast', 'locs', 'refs')}
    shots['locs'] = {**COMMON['locs'], **spec.get('locs', {})}
    shots['imgfx'] = spec.get('imgfx', {})
    shots['shots'] = spec['shots']
    json.dump(shots, open(os.path.join(out, 'shots.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(sid, len(spec['lines']), '行', len([s for s in spec['shots'] if 'prompt' in s]), '枚')
