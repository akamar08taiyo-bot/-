"""PDF（特典2のガイド・特典12点）から「おかねの地図」の文字を消す。
・各ページ上の帯の左の「おかねの地図」と、ガイドの表紙の「おかねの地図」を、四角でかくすのではなく PDF の中から消す
  （文字検索でも出ない）。帯の右の題や、ほかの文字・絵はそのまま。
・ReportLab で作ったページ：ページの文字を読んで「おかねの地図」だけの文字のかたまりを探し、その BT〜ET を消す
  （最初の Tm がその位置のもの。pdf_rename.py と同じやり方）
・ガイドの 28〜31・45ページ（以前に HTML から作り直したページ）：文字が1字ずつ置かれていて上のやり方では探せないので、
  元の HTML（pdf_pages.html）の帯の「おかねの地図」を空にして作り直し、差しかえる（--guide-pages で HTML を渡す）。
  HTML と同じフォルダで `npm i @fontsource/noto-sans-jp` しておく。
・文書の作者（メタデータの Author＝おかねの地図）も消す。
使い方：python3 pdf_unbrand.py 書き出すフォルダ 元のPDF… [--guide-pages pdf_pages.html]"""
import sys, pathlib, datetime, re
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream

BRAND = "おかねの地図"
GUIDE = "NISA-complete-guide.pdf"
GUIDE_HTML_PAGES = [28, 29, 30, 31, 45]   # pdf_pages.html の5ページが、ガイドのこのページになる
NEW_TITLE = "ゼロからわかる NISA完全攻略ガイド"


def brand_positions(page):
    """「おかねの地図」だけの文字のかたまりの位置（Tm の x, y）"""
    pos = []

    def visit(text, cm, tm, font, size):
        if text.strip() == BRAND:
            pos.append((float(tm[4]), float(tm[5])))

    page.extract_text(visitor_text=visit)
    return pos


def drop_text_blocks(page, pdf, targets):
    """BT〜ET のうち、最初の Tm が targets（(x, y) の組）のどれかに当たるものを消す。消した数を返す（pdf_rename.py と同じ）"""
    cs = ContentStream(page.get_contents(), pdf)
    ops, out, i, dropped = cs.operations, [], 0, 0
    while i < len(ops):
        operands, op = ops[i]
        if op == b"BT":
            j = i
            while ops[j][1] != b"ET":
                j += 1
            tm = next((o for o, k in ops[i:j] if k == b"Tm"), None)
            if tm and any(abs(float(tm[4]) - x) < 0.01 and abs(float(tm[5]) - y) < 0.01 for x, y in targets):
                dropped += 1
                i = j + 1
                continue
        out.append(ops[i])
        i += 1
    cs.operations = out
    page.replace_contents(cs)
    return dropped


def render_guide_pages(html_path, work):
    """pdf_pages.html の帯から「おかねの地図」を消し（題は新しい名前に）、5ページのPDFにする"""
    from playwright.sync_api import sync_playwright
    html = html_path.read_text(encoding="utf-8")
    html = html.replace(f'<div class="hl">{BRAND}</div>', '<div class="hl"></div>')
    html = html.replace('<div class="hr">NISA はじめての完全ガイド</div>', f'<div class="hr">{NEW_TITLE}</div>')
    assert BRAND not in html and "はじめての完全ガイド" not in html
    tmp = html_path.parent / "pages-unbranded.html"   # フォントの node_modules と同じフォルダに置く
    tmp.write_text(html, encoding="utf-8")
    pdf = work / "guide-pages-unbranded.pdf"
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
        pg = b.new_page()
        pg.goto(tmp.as_uri())
        pg.wait_for_load_state("networkidle")
        pg.evaluate("document.fonts.ready")
        pg.pdf(path=str(pdf), prefer_css_page_size=True, print_background=True)
        b.close()
    pages = PdfReader(str(pdf)).pages
    assert len(pages) == len(GUIDE_HTML_PAGES), len(pages)
    return pages


def squeeze(text):
    return re.sub(r"\s+", "", text or "")


args = sys.argv[1:]
guide_html = None
if "--guide-pages" in args:
    k = args.index("--guide-pages")
    guide_html = pathlib.Path(args[k + 1]).resolve()
    del args[k:k + 2]
out_dir = pathlib.Path(args[0]).resolve()
out_dir.mkdir(parents=True, exist_ok=True)
for src in map(pathlib.Path, args[1:]):
    r = PdfReader(str(src))
    before = [squeeze(p.extract_text()) for p in r.pages]
    swap = {}
    if src.name == GUIDE:
        assert guide_html, "ガイドには --guide-pages で pdf_pages.html を渡す"
        swap = dict(zip(GUIDE_HTML_PAGES, render_guide_pages(guide_html, out_dir)))
    w = PdfWriter()
    removed = 0
    for n, page in enumerate(r.pages, 1):
        if n in swap:
            w.add_page(swap[n])
            continue
        targets = brand_positions(page)
        page = w.add_page(page)   # 書き出し側のページにしてから、中身を変える
        if targets:
            k = drop_text_blocks(page, w, targets)
            assert k == len(targets), (src.name, n, k, targets)
            removed += k
    meta = {k: v for k, v in (r.metadata or {}).items() if k != "/Author"}
    meta["/ModDate"] = datetime.datetime.now(datetime.timezone.utc).strftime("D:%Y%m%d%H%M%S+00'00'")
    w.add_metadata(meta)
    w.compress_identical_objects()
    out = out_dir / src.name
    with open(out, "wb") as f:
        w.write(f)
    # 確かめ：どのページにも「おかねの地図」がなく、ほかの文字は前と同じ・作者もない
    r2 = PdfReader(str(out))
    after = [squeeze(p.extract_text()) for p in r2.pages]
    assert len(after) == len(before), src.name
    left = [n for n, t in enumerate(after, 1) if BRAND in t]
    assert not left, (src.name, "まだある", left)
    diff = [n for n, (b, a) in enumerate(zip(before, after), 1) if b.replace(BRAND, "") != a]
    assert not diff, (src.name, "文字が変わったページ", diff)
    assert "/Author" not in (r2.metadata or {}), src.name
    print(f"{src.name}: {removed}か所を消し、{len(swap)}ページを作り直した（{len(r.pages)}ページ）→ {out}")
