# メーカーのカタログのページの文字（render.mjs の <頭>-text.json）から、品番とその位置を取り出して src/sasaoka/<頭>CatalogData.ts を書く。
# ・toto（TOTO の手すりカタログ。2026-11-04）：品番の形 YHB203・T110D3R・EWT10BU35Z・TS139J●（●は色を選ぶ）・T114HK7R#MWA。
#   色の記号はとなりの別の文字（「YHB203」「#NW1」）なので、同じ行のすぐ右にあればつなぐ。
# ・matsu6（マツ六の手すりカタログ Vol.8。2026-11-04）：品番の形 BJ-14WD・BJ-03ST・BJ-113DB・BJ-33。表は「商品コード（040-2714）｜品番」の並びなので、
#   同じ行のすぐ左の商品コードまで枠を広げる（どちらを押しても入る。部材リストの品番は「品番」の方）。
# 金額・商品名は書かない（金額は部材リストから）。文の中の品番と、略した品番（「T113BP21・BP22・BP23」の BP22）は押す枠にしない。
# usage: python3 -I scripts/maker-catalog/codes.py <text.json> <頭（toto・matsu6）> <出力の ts>
import json
import os
import re
import sys
import unicodedata

src, prefix, out = sys.argv[1:4]
pages = json.load(open(src, encoding='utf-8'))

TOKENS = {
    'toto': r'[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(?:-[A-Z0-9]{1,6})*(?:#[A-Z0-9]{1,6})?',
    # SAQ-I-400W も。2026-11-09 の検品で、ハイフンのうしろが英字で始まる品番（SAQ-OP8・ST-H1・SAP-N01W・MBL-WC53-S・BZD-F200）と
    # 入り数の付いた品番（MG-8 × 40P）も（ただし表の行＝同じ行の左に商品コードがあるときだけ。NEW_FORM）
    'matsu6': r'[A-Z]{1,4}-(?:[A-Z]-)?[A-Z]{0,2}\d{1,4}[A-Z0-9]{0,6}(?:-[A-Z0-9]{1,4})?(?: ?× ?\d+[A-Z]?)?',
}
# 前からの形（これに当たらない品番・5字より短い品番は、表の行のときだけ枠にする）
# 表の行の品番の語（前に「（2枚）」などのかっこ、うしろに ●・※ があってもよい）。数字だけ・寸法（×・mm）・TAIS（01265-）は品番にしない
ROW_CODE = re.compile(r'^(?:[（(][^）)]{0,8}[）)]\s*)?([A-Z0-9][A-Z0-9\-]{2,20}[A-Z0-9])\s*(?:[●※].*)?$')
HEAD_CODE = re.compile(r'^[A-Z]{1,4} ?\d{2,4}-\d{1,4}$')  # 商品名の行の品番（「SD 450-90」）
OLD_FORM = {'matsu6': re.compile(r'^[A-Z]{1,4}-(?:[A-Z]-)?\d{1,4}[A-Z0-9]{0,6}(?:-[A-Z0-9]{1,4})?$')}
TOKEN = TOKENS[prefix]
SHOHIN = re.compile(r'^\d{3}-\d{4}$')  # マツ六の商品コード
# 品番だけの文字（前にかっこ・長さ、うしろに ●・×本数・※・読点・かっこ閉じがついていてもよい）
# 2026-11-09：前の「◆」（施工例の品番の一覧）・「／」（並べた品番の2つめ）・「2m：」（長さごとの品番）も（TOTO の品番索引にあるのに枠がなかった）
# うしろに索引のページ番号までの点とページ番号（「T112CD6 ·····」「YH702 ····· 56,57,59」。前は点のある行だけ枠がなく、索引の品番の半分ほどが押せなかった。2026-11-09 の検品）
# うしろに金額（「TS134GLMY7 ¥（金額）」「T110D34 ¥（金額） ハンガーボルト…」。表の行の品番と金額が1つの文字になっているもの）、前に「φ35：」も
# 前に「19 」（表の番号）・「…タイプ） 」（行の頭が前の行から続いた品名）、うしろに「（L タイプ）」も（p.71 EWC730・p.43・p.36 の Lタイプの行）
# （「19 」「…タイプ） 」「（L タイプ）」は TOTO だけ。マツ六の「（2枚） AQ-SP10」は表の行の決まり（ROW_CODE）で読む方が枠の位置が合う）
_HEAD_T, _TAIL_T = (r'|\d{1,2}\s+|[^\s（(]{1,12}[）)]\s+', r'(?:[（(][^）)]{1,12}[）)])?') if prefix == 'toto' else ('', '')
ITEM = re.compile(r'^[（(]?\s*(?:[（(]\d+mm[)）]\s*|[（(]\d+\s*個入[)）]\s*|◆\s*|／|\d+m[：:]\s*|φ\d+[：:]\s*' + _HEAD_T + r')?(' + TOKEN + r')\s*(●)?(?:×\d+|※\d+|[、，,)）]|\s|R/L兼用|·)*(?:(?<=·)\s*\d{1,3}(?:,\d{1,3})*)?' + _TAIL_T + r'(?:[¥￥][\d,]+.*)?$')
COLOR = re.compile(r'^#[A-Z0-9]{1,6}$')
COLOR_HEAD = re.compile(r'^(#[A-Z0-9]{1,6})(?:です|[。、，,）)]|$)')

# ---- 2026-11-09 の検品部隊（第5部 品番の字）で見つかった、PDF の文字が絵とちがう所・品番でない所 ----
# PDF の文字が欠けている品番（絵で確かめた）。TOTO p.51「（1100mm）TS139CEE11●」は、PDF の文字では「TS139CEE1」（「1●」が欠けている）
TEXT_FIX = {('toto', 51, 'TS139CEE1'): 'TS139CEE11'}
# 品番のないページ（TOTO p.104 は裏表紙。「K11·19DS」はカタログの管理記号）
SKIP_PAGES = {'toto': {104}, 'matsu6': {21}}  # マツ六 p.21 は取付けの説明（ねじが使える商品の一覧だけ。売り物の表は p.22・p.23）
KEEP_EMPTY = {'matsu6': {3, 21}, 'toto': {68, 81, 93, 95, 96, 97, 98, 99, 104}}  # 押す枠はないが、カタログの窓で見られるようにページは残す（TOTO のイージーオーダーのページ・裏表紙）
# 品番でない所を囲んでいた枠（マツ六。検品の第6部で見つけ、絵で確かめた）：(ページ, 品番, y の下, y の上)。説明の見本・文の中・参照の表・写真の札
DROP = {'matsu6': [
    (3, 'BGP-01MO', 0, 1),  # 「商品スペックの見方」の見本（売り物は p.34）
    (29, 'AQ-01', 0.40, 0.44),  # 「※適応品番 AQ-01・02・05…」の文の中
    (32, 'P-34NV', 0, 1), (32, 'P-30V', 0, 1),  # 写真の上のシリーズ名の見出し（品番は表の P34NV-400-00 など）
    (39, 'BDE-15', 0.87, 0.92), (39, 'BDE-16', 0.87, 0.92),  # 「ロングスパン1400と併用できない部品」の参照の表
    (45, 'BD-26', 0.79, 0.83), (45, 'BD-29', 0.79, 0.83), (45, 'BD-19', 0.79, 0.83),  # 「35自立スタンド参考組み方」の図の字
    (47, 'BD-64', 0.37, 0.40), (47, 'BE-64', 0.37, 0.40),  # 施工上のご注意の文の中
    (5, 'BJ-09', 0.30, 0.35),  # スプリングベンダーの図の引き出し線の字（表の行は別にある）
    (10, 'BJ-32ST', 0.09, 0.13), (10, 'BJ-105DB', 0.09, 0.13),  # ご注意の文の中
    (28, 'AQ-01SB', 0.22, 0.25), (28, 'AQ-01MI', 0.22, 0.25),  # 仕上げの記号の説明の見本
    (57, 'BD-40', 0.37, 0.44), (57, 'BE-40', 0.37, 0.44), (57, 'BF-27', 0.37, 0.44), (57, 'BDS-02', 0.37, 0.44), (57, 'BES-02', 0.37, 0.44),
    (57, 'BDS-01', 0.37, 0.44), (57, 'BES-01', 0.37, 0.44), (57, 'BF-26', 0.37, 0.44), (57, 'BF-29', 0.37, 0.44), (57, 'BF-30', 0.37, 0.44),  # 組み合わせ寸法の表の参照
    (57, 'BES-02', 0.75, 0.78),  # 樹脂キャップの注記の中
    (65, 'BZU-08', 0.93, 0.96),  # 共通仕様の文の中（この品番はページにない）
    (67, 'BZK-01', 0.90, 0.95), (67, 'BZK-05', 0.90, 0.95), (67, 'BZK-03', 0.90, 0.95),  # ベースマットの表の「対応たよレール」の列（押すとマットでなく手すりが入っていた）
], 'toto': [
    (20, 'TS134', 0, 1),  # 「ほかの商品（TS134・135・136型など）には使用できません」の型の名前
    (79, 'T112H', 0, 1), (79, 'T113H', 0, 1),  # 注意書きの「はね上げ手すり（T112H型・T113H型）」
    *[(pg, c, 0, 1) for pg in (82, 83, 84, 86, 88, 90) for c in ('EWCS801', 'EWC73')],  # 固定金具の一覧の「（EWCS801・802型…）」「（EWC73型）」
    # 便器・洗浄弁・便座の品番（「手すりの取付できる便器」などの対応一覧・設置できない便器の注記・取付位置の見出し。手すりの部材ではない）
    *[(68, c, 0, 1) for c in ('U507C', 'U508C')],
    *[(73, c, 0, 1) for c in ('CS20AB', 'C743PVN', 'C480AN', 'CS210CN', 'TCF119', 'CS510BM', 'CS501')],
    *[(78, c, 0, 1) for c in ('CS20AB', 'C743PVN', 'C480AN', 'CS480CN', 'C14RS', 'C480N', 'CS510BM')],
    *[(79, c, 0, 1) for c in ('TEFV70UA', 'TEFV75UA', 'TEFV70E', 'TEVN10U', 'TEVN20U', 'TEVN10E', 'TEVN30U', 'TEVN35U', 'TEVN30E', 'TCF5831', 'TCF588', 'TCF4714', 'TCF6544', 'THE28A')],
    *[(81, c, 0, 1) for c in ('CS310B', 'CS300B')],
    (84, 'T110D26', 0.725, 0.735),  # 注記の文の中（「なお、T110D26（樹脂プラグ20個入り）は…」。同じページの別売品の表に枠がある）
    (35, 'EWT10BK35R', 0.825, 0.835),  # 「取り付けられる品番」の参照の一覧（同じページの表の行に枠がある。一覧のほかの品番は「EWT10BE35／32RA」の形で枠なし。再検品4）
    (38, 'EWT12BB35', 0.775, 0.79),  # 図の札「支柱（EWT12BB35）」（同じページの表の行に枠がある。再検品4）
]}
# TOTO の品番索引（p.101・102）。略した書き方（「(T114CL9R・CL10R)」の CL10R）を見分ける（左の品番の頭 T114 をつなぐと索引にある品番になる）
INDEX = set()
if prefix == 'toto':
    for p in pages:
        if p['page'] in (101, 102):
            for it in p['items']:
                INDEX.update(m.group(0) for m in re.finditer(r'[A-Z]{1,6}\d{1,5}[A-Z0-9]{0,10}(?:-[A-Z0-9]{1,6})*', it[0]))


# 字の幅を測る書体（taiyo-excel-export スキルの setup-fonts.sh で入る。ないときは 0.55・1 の見積もり）
try:
    from PIL import ImageFont
    FONT = ImageFont.truetype(os.path.expanduser('~/.fonts/BIZUDPGothic-Regular.ttf'), 100)
except Exception:
    FONT = None


# 枠の端が字の途中にかかっていたら、その字の端まで広げる（ページの絵 catalog-toto/ で見る。書体の幅の見積もりでも、索引の「EWCS811R ····· 79」の
# 終わりの R などが半字ほど切れた。2026-11-09 の再検品3）。広げるのは 1 字の幅まで。絵がなければそのまま
_IMG = {}


def widen_to_glyph(page, cx, y, cw, h):
    try:
        import numpy as np
        from PIL import Image
        path = os.path.join(os.path.dirname(os.path.abspath(out)), '../../catalog-toto', f'toto-p{page:03d}.jpg')
        if page not in _IMG:
            _IMG[page] = np.asarray(Image.open(path).convert('L'), dtype=np.int16) if os.path.exists(path) else None
        a = _IMG[page]
    except Exception:
        return cx, cw
    if a is None:
        return cx, cw
    H, W = a.shape
    y0, y1 = int(round(y * H)), int(round((y + h) * H))
    m = max(1, (y1 - y0) // 6)
    col = (a[y0 + m:y1 - m] < 170).any(axis=0)
    lim = max(2, int((y1 - y0) * 0.3))  # 半字まで。その中に字の切れ目がなければ（となりの字とくっついている）広げない
    x0, x1 = int(round(cx * W)), int(round((cx + cw) * W))
    if 0 < x0 < W and col[x0] and col[x0 - 1]:
        k = next((k for k in range(1, lim + 1) if x0 - k >= 0 and not col[x0 - k]), None)
        if k:
            x0 = x0 - k + 1
    if 0 < x1 < W - 1 and col[x1 - 1] and col[x1]:
        k = next((k for k in range(1, lim + 1) if x1 + k < W and not col[x1 + k]), None)
        if k:
            x1 = x1 + k
    return x0 / W, (x1 - x0) / W


def width_of(s):
    # 「·」は品番索引（p.101・102）のページ番号までの点（「T112CD6 ·····」）。字の半分ほどの幅（絵で測った）
    return sum(0.29 if c == '·' else 0.55 if ord(c) < 0x2000 else 1.0 for c in s)


def split_cells(items):
    """表の1行が1つの文字（「アルミ支柱␇2300mm␇EZ-03US」。␇ は区切り）になっているときは、区切りごとに分けて位置を見積もる"""
    out = []
    for it in items:
        s = it[0]
        if '\x07' not in s and '\t' not in s:
            out.append(it)
            continue
        x, y, w, h = it[1:5]
        tw = width_of(s) or 1
        pos = 0
        for part in re.split(r'[\x07\t]', s):
            pw = width_of(part)
            if part.strip():
                out.append([part, x + w * pos / tw, y, w * pw / tw, h])
            pos += pw + width_of('\x07')
    return out


data = []
total = 0
def join_split(items):
    """PDF の文字で1つの品番が2つに割れているもの（TOTO p.52「（2000mm） TS1」「39CE2●」・p.64「T1」「12H6R」）を、同じ行ですき間のないものだけつなぐ"""
    items = sorted(items, key=lambda it: (round(it[2], 3), it[1]))
    out = []
    for it in items:
        prev = out[-1] if out else None
        if (prev and abs(prev[2] - it[2]) < 0.004 and -0.005 <= it[1] - (prev[1] + prev[3]) <= 0.003
                and re.search(r'[A-Z0-9]$', prev[0]) and re.match(r'^[A-Z0-9]', it[0]) and re.search(r'(?:^|\s)[A-Z]{1,3}\d{0,2}$', prev[0])):
            out[-1] = [prev[0] + it[0], prev[1], prev[2], it[1] + it[3] - prev[1], max(prev[4], it[4])]
        else:
            out.append(list(it))
    return out


for p in pages:
    if p['page'] in SKIP_PAGES.get(prefix, set()):
        if p['page'] in KEEP_EMPTY.get(prefix, set()):
            data.append({'page': p['page'], 'codes': []})
        continue
    items = split_cells(join_split(p['items']) if prefix == 'toto' else p['items'])
    codes = []
    colors = [it for it in items if COLOR.match(it[0].strip())]
    for it in items:
        s = it[0]
        m = ITEM.match(s.strip())
        if not m and prefix == 'toto':
            # 品名と品番が1つの文字になったもの（TOTO p.82〜90 の固定金具必要個数一覧「L型手すり (T112CL9」。同じ行の T113BL9 には枠があった）
            m = re.match(r'^.+?\s*[（(]\s*(' + TOKEN + r')\s*[・、]?$', s.strip())
        if not m:
            continue
        code = re.sub(r' ?× ?', '×', m.group(1))
        x, y, w, h = it[1:5]
        # 表の行：同じ行の左（品番の 16% まで）に商品コード（040-7301 の形）。マツ六の表は「商品コード｜（長さ・色）｜品番」
        row = prefix == 'matsu6' and any(SHOHIN.match(c[0].strip()) and abs(c[2] - y) < 0.004 and -0.002 <= x - (c[1] + c[3]) <= 0.16 for c in items)
        short = len(code.split('#')[0]) < 5  # 略した品番・短い記号（マツ六の BJ-09 は 5 字なので残る）
        new_form = prefix in OLD_FORM and not OLD_FORM[prefix].match(code)
        if (short or new_form) and not row:  # AF-1・ST-1・BP-1・SAQ-OP8 などは表の行のときだけ（文の中の「（SAP-OP3）」は外す）
            continue
        if not re.search(r'\d', code):
            continue
        if any(pg == p['page'] and c == code and y0 <= y <= y1 for pg, c, y0, y1 in DROP.get(prefix, [])):
            continue
        # TOTO の「タイプ番号」（イージーオーダーの見本。「タイプ番号は品番ではありません」）は押す枠にしない：同じ文字の中か、同じ行のすぐ左に「タイプ番号」
        if prefix == 'toto' and ('タイプ番号' in s or any('タイプ番号' in c[0] and abs(c[2] - y) < 0.006 and 0 <= x - (c[1] + c[3]) <= 0.03 for c in items)):
            continue
        printed = m.group(1)  # 枠の位置は印刷された字（直す前・空白のある「MG-8 × 40P」のまま）で測る（前は直したあとの字で探して見つからず、枠が右へずれた。2026-11-09 の再検品）
        code = TEXT_FIX.get((prefix, p['page'], code), code)
        # 略した品番（「（T114CL9R・CL10R）」の CL10R）：同じ行のすぐ左の「（品番」の頭をつなぐと索引にある品番になるものは、略した書き方なので押す枠にしない
        # （前からの決まり。2026-11-09 にいったん T114CL10R につないだが、同じ表の CL10・CP22 などほかの略した品番には枠がなく、そろわなかった。再検品の指摘）
        if INDEX and code not in INDEX:
            left = [c for c in items if abs(c[2] - y) < 0.004 and 0 <= x - (c[1] + c[3]) <= 0.02 and (c[0].strip()[:1] in '（(' or re.search(r'[（(]\s*' + TOKEN, c[0]))]
            if any((mm := re.search(TOKEN, c[0])) and any(mm.group(0)[:k] + code in INDEX for k in range(1, len(mm.group(0)))) for c in left):
                continue
        # 品番の前に字があれば、その分だけ枠を右へ（字の幅は半角 0.55・全角 1 で見積もる）
        # 「◆ TCF5841AUPR#NW1」の ◆ のうしろの空白は PDF の文字にだけあって、絵では幅がない（数えると枠が半字右へずれた。TOTO p.56。2026-11-09 の再検品）
        sw = re.sub(r'(?<=◆)\s+', '', s)
        lead = sw[: max(sw.find(printed), 0)]
        tw = width_of(sw) or 1
        cx = x + w * width_of(lead) / tw
        cw = w * width_of(printed) / tw
        # TOTO：品番の前後に日本語・金額・「（L タイプ）」・表の番号がつながった文字は、字の幅を 0.55・1 と決めて見積もると半字〜1字ずれた
        # （2026-11-09 の再検品3。p.43「トタイプ） EWT22AF35」の E・p.36「EWT10BE35LA（L タイプ）」の A が枠の外）。
        # 書体（BIZ UDPゴシック）で字の幅を測り、品番が文字の頭なら左の端・終わりなら右の端にそろえる（表の番号の札など、書体のちがう字の分がずれない）
        if prefix == 'toto' and FONT and sw.strip() != printed:
            fw = FONT.getlength(sw) or 1
            cw = w * FONT.getlength(printed) / fw
            tail = sw[len(lead) + len(printed):]
            if not lead.strip():
                cx = x + w * FONT.getlength(lead) / fw
            elif not tail.strip():
                cx = x + w - w * FONT.getlength(tail) / fw - cw
            else:
                cx = x + w * FONT.getlength(lead) / fw
            cx, cw = widen_to_glyph(p['page'], cx, y, cw, h)
        # 写真の札（TOTO p.64「写真は」の次の行の「T112HK7R」「#NW1です。」）：すぐ上の行か同じ行の左が「写真は」で終わる。
        # 同じページの表の行に同じ品番があれば外す（下で。手引きの21）
        caption = prefix == 'toto' and any(c[0].strip().endswith('写真は') and (0 < y - c[2] <= h * 1.8 and abs(c[1] - x) < 0.01 or abs(c[2] - y) < 0.004 and 0 <= x - (c[1] + c[3]) <= 0.01) for c in items)
        # マツ六：同じ行のすぐ左（すき間 6% まで）の商品コードまで枠を広げる
        if prefix == 'matsu6':
            left = [c for c in items if SHOHIN.match(c[0].strip()) and abs(c[2] - y) < 0.004 and 0 <= cx - (c[1] + c[3]) <= 0.06]
            if left:
                c = max(left, key=lambda c: c[1])
                cw = cx + cw - c[1]
                cx = c[1]
        # すぐ右の色の記号（同じ行・すき間 1% まで）をつなぐ
        if '#' not in code and prefix == 'toto':
            for c in colors:
                if abs(c[2] - y) < 0.004 and -0.002 <= c[1] - (cx + cw) <= 0.01:
                    code += c[0].strip()
                    cw = c[1] + c[3] - cx
                    break
        # 2行に割れた品番（「写真は T112HK7R／#NW1です。」）：次の行の同じ左の位置の色の記号をつなぐ（枠は1行目のまま）
        if '#' not in code and prefix == 'toto':
            for c in items:
                mm = COLOR_HEAD.match(c[0].strip())
                if mm and abs(c[1] - cx) < 0.004 and 0 < c[2] - y <= h * 1.6:
                    code += mm.group(1)
                    break
        codes.append([code, round(cx, 4), round(y, 4), round(max(cw, 0.01), 4), round(h, 4), row or ('caption' if caption else False)])
    if prefix == 'toto':
        bases = [c[0].split('#')[0] for c in codes if c[5] != 'caption']
        codes = [c for c in codes if c[5] != 'caption' or c[0].split('#')[0] not in bases]
        codes = [c[:5] + [False] for c in codes]
    # 表の行の品番（2026-11-09 の検品）：商品コード（040-7301）の行で、品番の形（TOKEN）に当たらない品番（P34NV-400-00・DX14C・35LB4R・EL5060-1M-NS・
    # LW-YI-600 など）も、同じ行の右（25% まで）のいちばん近い「英字と数字のまじった語」を品番にする（前はこの形を読めず、約120行に枠がなかった）
    if prefix == 'matsu6':
        have = [(c[2], c[1]) for c in codes]
        for it in items:
            if not SHOHIN.match(it[0].strip()):
                continue
            x, y = it[1], it[2]
            if any(abs(cy - y) < 0.004 and -0.002 <= cx - x <= 0.25 for cy, cx in have):
                continue
            right = sorted([c for c in items if abs(c[2] - y) < 0.004 and 0 < c[1] - x <= 0.25], key=lambda c: c[1])
            # 行に品番がなく、すぐ上の商品名の行に品番がある（p.60「木製踏台　SD 450-90」／その下に 013-7301）：その品番
            if not right:
                above = [c for c in items if 0.006 < y - c[2] <= 0.022 and 0 <= c[1] - x <= 0.15 and HEAD_CODE.match(c[0].strip())]
                if above:
                    c = min(above, key=lambda c: c[1])
                    code = re.sub(r'\s+', '', c[0].strip())
                    codes.append([code, round(c[1], 4), round(c[2], 4), round(c[3], 4), round(c[4], 4), True])
                    have.append((c[2], c[1]))
                    continue
            # となり合う語（すき間 0.5% まで）は1つにつないだものも候補にする（p.31「LW-O」「Ⅰ-600」→ LW-OI-600。Ⅰ はローマ数字なので NFKC で I に）
            joined = []
            for i, c in enumerate(right):
                if i + 1 < len(right) and right[i + 1][1] - (c[1] + c[3]) < 0.005 and not SHOHIN.match(right[i + 1][0].strip()):
                    d = right[i + 1]
                    joined.append([c[0].strip() + d[0].strip(), c[1], c[2], d[1] + d[3] - c[1], c[4]])
                joined.append(c)
            for c in joined:
                t = unicodedata.normalize('NFKC', c[0].strip())
                if SHOHIN.match(t):
                    break  # となりの列の商品コード（この行の品番はない）
                mm = ROW_CODE.match(t)
                if not mm:
                    continue
                code = mm.group(1)
                if not (re.search(r'[A-Z]', code) and re.search(r'\d', code)) or re.match(r'^\d{5}-', code):
                    continue
                if any(pg == p['page'] and cc == code and y0 <= c[2] <= y1 for pg, cc, y0, y1 in DROP.get(prefix, [])):
                    break
                lead = t[: t.find(code)]
                tw = width_of(t) or 1
                cx = c[1] + c[3] * width_of(lead) / tw
                cw = c[3] * width_of(code) / tw
                if cx - (x + it[3]) <= 0.06:  # 商品コードまで枠を広げる（前からの決まりと同じ）
                    cw = cx + cw - x
                    cx = x
                codes.append([code, round(cx, 4), round(c[2], 4), round(max(cw, 0.01), 4), round(c[4], 4), True])
                have.append((c[2], cx))
                break
    # 写真の札（p.71 の BZD-01〜13）・注記の中の品番（p.50 の「※適応品番 BE-13」）：同じページの表の行に「この品番＋色の記号」（BZD-01WD・BE-13B）が
    # あって、自分は表の行でないものは外す（押すと色の決まっていない品番が入っていた）
    if prefix == 'matsu6':
        rows_codes = [c[0] for c in codes if c[5]]
        codes = [c for c in codes if c[5] or not any(r != c[0] and r.startswith(c[0]) and re.fullmatch(r'[A-Z]{1,4}', r[len(c[0]):]) for r in rows_codes)]
        # 同じページの表の行に同じ品番があるのに、表の行でない枠（写真の札・カラーの説明の見本「（例）BD-01B」・図の字）も外す（2026-11-09 の検品）
        codes = [c for c in codes if c[5] or c[0] not in rows_codes]
    codes = [c[:5] for c in codes]
    # 同じ所の同じ品番は1つに
    seen = set()
    uniq = []
    for c in codes:
        k = (c[0], round(c[1], 2), round(c[2], 2))
        if k in seen:
            continue
        seen.add(k)
        uniq.append(c)
    if uniq or p['page'] in KEEP_EMPTY.get(prefix, set()):
        data.append({'page': p['page'], 'codes': uniq})
        total += len(uniq)

name = prefix.upper()
with open(out, 'w', encoding='utf-8') as f:
    title = {'toto': 'TOTO', 'matsu6': 'マツ六'}[prefix]
    f.write(f'// {title} の手すりカタログ（いただいた PDF）の品番と位置（ページの幅・高さの割合）。scripts/maker-catalog/ の render.mjs → codes.py で作った（makerCatalogs.ts）。\n')
    f.write('// 金額・商品名は持たない（ユーザーの指示「リポジトリに仕入れや定価は残さない」。商品名・定価・仕切は部材リストの同じ品番から）。\n')
    if prefix == 'toto':
        f.write('// 「#NW1」などは色の記号（押すと部材リストの色ちがいから選ぶ）。「●」の品番（色を選ぶ品番）は ● を除いた形\n')
    else:
        f.write('// 枠は「商品コード（040-2714）｜品番（BJ-14WD）」の両方にかかる。部材リストと合わせるのは品番\n')
    f.write(f'export const {name}_PAGES: {{page: number; codes: [string, number, number, number, number][]}}[] = [\n')
    for p in data:
        f.write('  ' + json.dumps(p, ensure_ascii=False, separators=(', ', ': ')).replace('"page"', 'page').replace('"codes"', 'codes') + ',\n')
    f.write('];\n')
print(f'{len(data)} ページ・{total} の品番')
