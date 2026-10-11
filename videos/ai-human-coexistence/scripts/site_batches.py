# 視聴ページ（Artifact）に上げるファイルを、1回の公開の上限（64MB・255ファイル）に収まるように分ける
# 使い方: python3 -I scripts/site_batches.py → work/site/batch_<n>.json（Artifact の files に渡す形）
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
work = root / 'work'
LIMIT = 58 * 1024 * 1024
def entry(rel):
    ct = 'video/mp2t' if rel.endswith('.ts') else 'application/vnd.apple.mpegurl' if rel.endswith('.m3u8') else None
    src = str(Path('hls') / rel)
    return {'from': src, 'contentType': ct} if ct else src
first = {'poster.jpg': 'site/poster.jpg', 'hls/master.m3u8': {'from': 'hls/master.m3u8', 'contentType': 'application/vnd.apple.mpegurl'}}
for d in ('v', 'a_theme', 'a_asmr'):
    first[f'hls/{d}/index.m3u8'] = entry(f'{d}/index.m3u8')
size = sum((work / (v if isinstance(v, str) else v['from'])).stat().st_size for v in first.values())
segs = []
for d in ('a_theme', 'a_asmr', 'v'):
    segs += sorted((work / 'hls' / d).glob('*.ts'))
batches = [first]; cur = batches[0]; cur_size = size
for p in segs:
    rel = f'{p.parent.name}/{p.name}'
    s = p.stat().st_size
    if cur_size + s > LIMIT or len(cur) >= 250:
        cur = {}; batches.append(cur); cur_size = 0
    cur[f'hls/{rel}'] = entry(rel); cur_size += s
for i, b in enumerate(batches, 1):
    (work / 'site' / f'batch_{i}.json').write_text(json.dumps(b, ensure_ascii=False))
    total = sum((work / (v if isinstance(v, str) else v['from'])).stat().st_size for v in b.values())
    print(f'batch_{i}: {len(b)} files, {total / 1048576:.1f} MiB')
