#!/usr/bin/env python3
"""
みんレポの日別ページをまとめて保存する（自分のPCで実行する用。標準ライブラリだけで動く）。

保存したHTMLは、スロット差枚アナライザー（slot.html）の「ファイルを選ぶ」で複数まとめて取り込める。

使い方
  # 1日分（ページURLを指定）
  python3 tools/minrepo_fetch.py https://min-repo.com/2625546/

  # 店舗のタグ一覧から期間を指定してまとめて保存
  python3 tools/minrepo_fetch.py --tag スペース666 --from 2026-09-01 --to 2026-09-30

保存先は既定で ./minrepo_html/（-o で変更）。
サイトに負担をかけないよう、1ページごとに数秒あけて取得する。利用規約の範囲で使うこと。
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import os
import re
import sys
import time
import urllib.parse
import urllib.request

BASE = "https://min-repo.com"
UA = "Mozilla/5.0 (personal data analysis script)"
TITLE_RE = re.compile(r"<title>([^<]*)</title>", re.I)
# 「2026/9/22(火) スペース666」または年なしの「9/22(火) スペース666」
DATE_RE = re.compile(r"(?:(\d{4})/)?(\d{1,2})/(\d{1,2})\s*\(")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as res:
        charset = res.headers.get_content_charset() or "utf-8"
        return res.read().decode(charset, errors="replace")


def page_date(text: str, fallback_year: int) -> dt.date | None:
    m = DATE_RE.search(text)
    if not m:
        return None
    year = int(m.group(1)) if m.group(1) else fallback_year
    try:
        return dt.date(year, int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def list_reports(tag: str, start: dt.date, end: dt.date, delay: float, max_pages: int) -> list[tuple[dt.date, str]]:
    """タグ一覧ページをたどり、期間内の日別ページURLを集める（新しい順に並んでいる前提）。"""
    found: dict[str, dt.date] = {}
    tag_url = f"{BASE}/tag/{urllib.parse.quote(tag)}/"
    for page in range(1, max_pages + 1):
        url = tag_url if page == 1 else f"{tag_url}page/{page}/"
        try:
            body = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"  一覧 {url} を取得できなかった: {e}", file=sys.stderr)
            break
        oldest_on_page: dt.date | None = None
        for m in re.finditer(r'<a[^>]+href="(https://min-repo\.com/\d+/)"[^>]*>([\s\S]*?)</a>', body):
            text = html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))
            d = page_date(text, end.year)
            # 年なし表記で end より未来になる場合は前年とみなす
            if d and d > end and not re.search(r"\d{4}/", text):
                d = d.replace(year=d.year - 1)
            if not d:
                continue
            oldest_on_page = d if oldest_on_page is None or d < oldest_on_page else oldest_on_page
            if start <= d <= end:
                found.setdefault(m.group(1), d)
        print(f"  一覧 {page}ページ目: 累計 {len(found)}件")
        if oldest_on_page is None or oldest_on_page < start:
            break
        time.sleep(delay)
    return sorted(((d, u) for u, d in found.items()), reverse=True)


def save(url: str, out_dir: str, fallback_year: int) -> str | None:
    body = fetch(url)
    title = TITLE_RE.search(body)
    d = page_date(title.group(1) if title else body[:3000], fallback_year)
    name = f"{d.isoformat() if d else 'unknown'}_{url.rstrip('/').rsplit('/', 1)[-1]}.html"
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description="みんレポの日別ページを保存する")
    ap.add_argument("urls", nargs="*", help="日別ページのURL（複数可）")
    ap.add_argument("--tag", help="店舗タグ名（例: スペース666）")
    ap.add_argument("--from", dest="start", help="開始日 YYYY-MM-DD")
    ap.add_argument("--to", dest="end", help="終了日 YYYY-MM-DD（省略時は今日）")
    ap.add_argument("-o", "--out", default="minrepo_html", help="保存先フォルダ")
    ap.add_argument("--delay", type=float, default=3.0, help="取得間隔（秒）")
    ap.add_argument("--max-pages", type=int, default=20, help="一覧をたどる最大ページ数")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    today = dt.date.today()
    targets: list[str] = list(args.urls)
    if args.tag:
        end = dt.date.fromisoformat(args.end) if args.end else today
        start = dt.date.fromisoformat(args.start) if args.start else end - dt.timedelta(days=30)
        print(f"{args.tag}: {start}〜{end} の日別ページを探す")
        targets += [u for _, u in list_reports(args.tag, start, end, args.delay, args.max_pages)]
    if not targets:
        ap.error("URL か --tag を指定してほしい")

    for i, url in enumerate(targets):
        try:
            path = save(url, args.out, today.year)
            print(f"[{i + 1}/{len(targets)}] {url} → {path}")
        except Exception as e:  # noqa: BLE001
            print(f"[{i + 1}/{len(targets)}] {url} の取得に失敗: {e}", file=sys.stderr)
        if i + 1 < len(targets):
            time.sleep(args.delay)
    print(f"\n完了。{args.out}/ のHTMLを slot.html の「ファイルを選ぶ」でまとめて取り込める。")


if __name__ == "__main__":
    main()
