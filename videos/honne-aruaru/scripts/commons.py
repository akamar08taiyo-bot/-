"""Wikimedia Commons の通常のページ（API ではない）から、ファイルの検索・ライセンス・作者・画像の URL を読む。
使い方:
  python3 -I commons.py search "<キーワード>" [ライセンスの分類 ...]   → ファイル名の一覧
  python3 -I commons.py info "File:xxx.jpg"                          → ライセンス・作者・元の URL（JSON）
リクエストの間は 1.5 秒あける（Wikimedia の負荷を上げない）。
"""
import html, json, re, subprocess, sys, time, urllib.parse

BASE = 'https://commons.wikimedia.org'


def get(url):
    time.sleep(1.5)
    r = subprocess.run(['curl', '-sS', '-m', '40', '-w', '\n%{http_code}', url], capture_output=True, text=True)
    body, _, code = r.stdout.rpartition('\n')
    return int(code or 0), body


def search(q, cats):
    out = []
    for cat in cats or [None]:
        qq = q + (f' incategory:{cat}' if cat else '')
        url = f'{BASE}/w/index.php?' + urllib.parse.urlencode({'title': 'Special:Search', 'ns6': 1, 'fulltext': 1, 'limit': 40, 'search': qq})
        code, s = get(url)
        if code != 200:
            print('search failed', code, qq, file=sys.stderr)
            continue
        for h, t in re.findall(r'class="mw-search-result-heading"><a href="([^"]+)" title="([^"]+)"', s):
            t = html.unescape(t)
            if t not in out and re.search(r'\.(jpe?g|png|tif)$', t, re.I):
                out.append(t)
    return out


def info(title):
    code, s = get(f'{BASE}/wiki/' + urllib.parse.quote(title.replace(' ', '_')))
    if code != 200:
        return {'title': title, 'error': code}
    U = r'(?:_|&#95;)'
    lic = re.findall(r'class="licensetpl' + U + r'short"[^>]*>(.*?)</span>', s)
    lic_url = re.findall(r'class="licensetpl' + U + r'link"[^>]*>(.*?)</span>', s)
    attr = re.findall(r'class="licensetpl' + U + r'attr"[^>]*>(.*?)</span>', s)
    author = re.search(r'id="fileinfotpl' + U + r'aut"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>', s, re.S)
    full = re.search(r'class="fullMedia"><bdi[^>]*><a href="([^"]+)"', s) or re.search(r'class="fullMedia"><p><a href="([^"]+)"', s)
    thumbs = re.findall(r'href="([^"]+)"[^>]*class="mw-thumbnail-link">([\d,]+) × ([\d,]+) pixels', s)
    strip = lambda x: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', x))).strip()
    return {
        'title': title,
        'page': f'{BASE}/wiki/' + urllib.parse.quote(title.replace(' ', '_')),
        'license': [strip(x) for x in lic][:3],
        'license_url': [strip(x) for x in lic_url][:3],
        'attribution': [strip(x) for x in attr][:2],
        'author': strip(author.group(1))[:200] if author else None,
        'full': html.unescape(full.group(1)) if full else None,
        'thumbs': [(html.unescape(u), int(w.replace(',', '')), int(h.replace(',', ''))) for u, w, h in thumbs],
    }


if __name__ == '__main__':
    if sys.argv[1] == 'search':
        for t in search(sys.argv[2], sys.argv[3:]):
            print(t)
    else:
        for t in sys.argv[2:]:
            print(json.dumps(info(t), ensure_ascii=False))
