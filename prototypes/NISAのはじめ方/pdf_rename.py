"""特典2のPDF（NISA-complete-guide.pdf）の名前を「ゼロからわかる NISA完全攻略ガイド」に変える。
・表紙：旧題の2行（はじめての／完全ガイド）の文字を消し、「ゼロからわかる」（NISAの上）・「完全攻略」・「ガイド」を入れる。NISA はそのまま
・各ページ上の帯（4〜41ページ）：旧題の文字を消し、同じ位置・大きさ・色で新しい名前を入れる
  （28〜31ページは以前に作り直したページなので、元の HTML の帯の文字を変えて作り直す）
・文書の題（メタデータ）も新しい名前に
文字は四角でかくすのではなく、PDFの中から消すので、文字検索でも古い名前は出ない。
使い方：python3 pdf_rename.py 元のPDF 書き出すPDF 差し替えページのHTML（pages.html）"""
import sys, pathlib, datetime
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, NameObject
from playwright.sync_api import sync_playwright

SRC, OUT, PAGES_HTML = (pathlib.Path(a).resolve() for a in sys.argv[1:4])
WORK = OUT.parent / "_pdf_rename_work"
WORK.mkdir(exist_ok=True)
NEW = "ゼロからわかる NISA完全攻略ガイド"
FONT_CSS = PAGES_HTML.parent / "node_modules/@fontsource/noto-sans-jp"
W, H = 595.276, 841.89
GREEN, CREAM, ORANGE = "#143e35", "#f7f5ef", "#e99a55"   # 元のPDFの色（rg の値から）

def overlay_html(svg_body):
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="{(FONT_CSS / '400.css').as_uri()}"><link rel="stylesheet" href="{(FONT_CSS / '700.css').as_uri()}">
<style>@page {{ size: {W}pt {H}pt; margin: 0; }} html, body {{ margin: 0; padding: 0; background: transparent; }}
svg {{ display: block; width: {W}pt; height: {H}pt; font-family: "Noto Sans JP", sans-serif; }}</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">{svg_body}</svg></body></html>"""

# 帯：右端 551.276pt・ベースライン 35pt（上から）・8pt・濃い緑（元の ReportLab のページと同じ）
HEADER = f'<text x="551.276" y="35" text-anchor="end" font-size="8" font-weight="400" fill="{GREEN}">{NEW}</text>'
# 表紙：NISA の上に「ゼロからわかる」、旧題の2行の位置（ベースライン 270・320）に「完全攻略」「ガイド」
COVER = (f'<text x="50" y="136" font-size="26" font-weight="700" fill="{ORANGE}">ゼロからわかる</text>'
         f'<text x="50" y="270" font-size="35" font-weight="700" fill="{CREAM}">完全攻略</text>'
         f'<text x="50" y="320" font-size="35" font-weight="700" fill="{CREAM}">ガイド</text>')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    pg = b.new_page()
    for name, body in (("header", HEADER), ("cover", COVER)):
        f = WORK / f"{name}.html"
        f.write_text(overlay_html(body), encoding="utf-8")
        pg.goto(f.as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready")
        pg.pdf(path=str(WORK / f"{name}.pdf"), prefer_css_page_size=True, print_background=False)
    # 28〜31ページ：以前の差し替えページの HTML の帯を新しい名前にして作り直す
    html = PAGES_HTML.read_text(encoding="utf-8")
    old_hr = '<div class="hr">NISA はじめての完全ガイド</div>'
    assert html.count(old_hr) == 4, html.count(old_hr)
    (PAGES_HTML.parent / "pages-renamed.html").write_text(html.replace(old_hr, f'<div class="hr">{NEW}</div>'), encoding="utf-8")
    pg.goto((PAGES_HTML.parent / "pages-renamed.html").as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready")
    pg.pdf(path=str(WORK / "pages28-31.pdf"), prefer_css_page_size=True, print_background=True)
    b.close()

def drop_text_blocks(page, reader, targets):
    """BT〜ET のうち、最初の Tm が targets（(x, y) の組）のどれかに当たるものを消す。消した数を返す"""
    cs = ContentStream(page.get_contents(), reader)
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
        out.append(ops[i]); i += 1
    cs.operations = out
    page.replace_contents(cs)
    return dropped

src = PdfReader(str(SRC))
header = PdfReader(str(WORK / "header.pdf")).pages[0]
cover = PdfReader(str(WORK / "cover.pdf")).pages[0]
redo = PdfReader(str(WORK / "pages28-31.pdf"))
assert len(redo.pages) == 5, len(redo.pages)   # pages.html は 28〜31 と 45 の5ページ
w = PdfWriter()
for n, page in enumerate(src.pages, 1):
    if 28 <= n <= 31:
        w.add_page(redo.pages[n - 28])
        continue
    page = w.add_page(page)   # 書き出し側のページにしてから、中身を変える
    if n == 1:
        assert drop_text_blocks(page, w, [(50, 571.89), (50, 521.89)]) == 2
        page.merge_page(cover)
    elif 4 <= n <= 27 or 32 <= n <= 41:
        assert drop_text_blocks(page, w, [(448.901, 806.89)]) == 1, n
        page.merge_page(header)
meta = dict(src.metadata or {})
meta["/Title"] = NEW
meta["/ModDate"] = datetime.datetime.now(datetime.timezone.utc).strftime("D:%Y%m%d%H%M%S+00'00'")
w.add_metadata(meta)
w.compress_identical_objects()
with open(OUT, "wb") as f:
    w.write(f)
print("wrote", OUT, OUT.stat().st_size, "bytes")
