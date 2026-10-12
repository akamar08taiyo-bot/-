# アップロードした束の置き場所（/_blob/…）を、out/video/<話>.json に書き入れる
# 使い方: python3 -I set_urls.py <話> < 対応表（各行「<ファイル名> <url>」）
import json, sys
from pathlib import Path
ep = sys.argv[1]
p = Path(__file__).resolve().parent / 'out' / 'video' / f'{ep}.json'
man = json.loads(p.read_text(encoding='utf-8'))
urls = dict(line.split() for line in sys.stdin if line.strip())
n = 0
for part in man['parts']:
    name = Path(part['path']).name
    if name in urls:
        part['url'] = urls[name]; n += 1
p.write_text(json.dumps(man, ensure_ascii=False), encoding='utf-8')
print(ep, n, 'urls set;', sum(1 for x in man['parts'] if not x.get('url')), 'parts without url (served as page files)')
