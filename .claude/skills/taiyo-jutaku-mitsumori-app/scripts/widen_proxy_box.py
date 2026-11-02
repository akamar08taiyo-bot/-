"""
委任状（苅田町・行橋市。特定福祉用具と住宅改修の原本の「委任状」のシート）の受任者の欄（事業所名称及び代表者氏名：会社名・営業所・所長名の3行）を、
結合 C15:H17（3行・上ぞろえ）から C14:H18（5行・縦の中央）に広げる。枠の線・字・字の大きさは変えない。
3行の 12pt の游ゴシックは、Excel では行（18.75pt）3つにぎりぎりで、3行目（所長名）が欄の下で切れる・字体によっては4行目に送られて見えなくなる
（ユーザーの指示「委任状の…社長名であったりだとか…はみ出し」2026-11-02）。C18 の空白だけの文字は消す（結合の中に入るので）。
印刷は「1ページに合わせる」（縦横とも1ページ。縮めるだけで大きくはしない）にする：表の幅は A4 の余白の内側にぎりぎりで、
パソコンの字体によっては列の幅が広くなり、表の右の線が2枚目に分かれる（LibreOffice で画像にしたとき右の線が切れた）。
usage: python3 -I widen_proxy_box.py <原本.xltx|xlsx>...（その場で書きかえる。もう広げてあれば何もしない）
"""
import re
import shutil
import sys
import zipfile


def sheet_path(z, name):
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    rid = re.search(r'<sheet [^>]*name="%s"[^>]*r:id="([^"]*)"' % re.escape(name), wb).group(1)
    rel = re.search(r'<Relationship [^>]*Id="%s"[^>]*>' % rid, rels).group(0)
    return 'xl/' + re.search(r'Target="([^"]*)"', rel).group(1).replace('/xl/', '').lstrip('/')


def fit_page(x):
    """印刷を「1ページに合わせる」（縦横とも1ページ）にする"""
    if 'fitToPage="1"' in x:
        return x
    assert '<sheetPr' not in x, 'sheetPr がある原本は手で直す'
    x = re.sub(r'(<worksheet\b[^>]*>)', r'\1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>', x, count=1)
    return re.sub(r'<pageSetup\b', '<pageSetup fitToWidth="1" fitToHeight="1"', x, count=1)


def replace_part(z, path, part, xml):
    items = [(info, z.read(info.filename)) for info in z.infolist()]
    z.close()
    with zipfile.ZipFile(path + '.new', 'w') as out:
        for info, data in items:
            out.writestr(info, xml.encode() if info.filename == part else data, compress_type=info.compress_type)
    shutil.move(path + '.new', path)


def widen(path):
    z = zipfile.ZipFile(path)
    sp = sheet_path(z, '委任状')
    x = z.read(sp).decode()
    st = z.read('xl/styles.xml').decode()
    if '<mergeCell ref="C14:H18"/>' in x:
        if 'fitToPage="1"' not in x:
            replace_part(z, path, sp, fit_page(x))
            print(path, '1ページに合わせる')
        else:
            print(path, 'もう広げてある')
        return
    assert x.count('<mergeCell ref="C15:H17"/>') == 1, path
    c15 = re.search(r'<c r="C15" s="(\d+)" t="s"><v>(\d+)</v></c>', x)
    style, value = c15.group(1), c15.group(2)
    # 縦の中央にした書式を足す（C15 の書式はほかの欄でも使っているかもしれないので、写して足す）
    xfs_block = re.search(r'<cellXfs count="(\d+)">(.*?)</cellXfs>', st, re.S)
    xfs = re.findall(r'<xf [^>]*?(?:/>|>.*?</xf>)', xfs_block.group(2), re.S)
    base = xfs[int(style)]
    assert 'vertical="top"' in base, base
    new_xf = base.replace('vertical="top"', 'vertical="center"')
    new_id = len(xfs)
    st = st.replace(xfs_block.group(0), '<cellXfs count="%d">%s%s</cellXfs>' % (new_id + 1, xfs_block.group(2), new_xf))
    # 文字を C14 へ（14行目の B14 のうしろに）、C15 は書式だけ、C18 の空白の文字は消す、結合を広げる
    x = x.replace(c15.group(0), '<c r="C15" s="%s"/>' % style)
    row14 = re.search(r'(<row r="14"[^>]*>.*?<c r="B14"[^>]*?(?:/>|>.*?</c>))', x, re.S)
    x = x.replace(row14.group(1), row14.group(1) + '<c r="C14" s="%d" t="s"><v>%s</v></c>' % (new_id, value), 1)
    x = re.sub(r'<c r="C18"(?: s="\d+")? t="s"><v>\d+</v></c>', '', x)
    x = x.replace('<mergeCell ref="C15:H17"/>', '<mergeCell ref="C14:H18"/>')
    x = fit_page(x)
    items = [(info, z.read(info.filename)) for info in z.infolist()]
    z.close()
    with zipfile.ZipFile(path + '.new', 'w') as out:
        for info, data in items:
            if info.filename == sp:
                data = x.encode()
            elif info.filename == 'xl/styles.xml':
                data = st.encode()
            out.writestr(info, data, compress_type=info.compress_type)
    shutil.move(path + '.new', path)
    print(path, 'C15:H17 → C14:H18（縦の中央）')


for p in sys.argv[1:]:
    widen(p)
