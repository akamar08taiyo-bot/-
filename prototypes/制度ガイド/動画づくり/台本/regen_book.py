"""台本帳（偉人編 損する制度シリーズ）のページを plans.json から作り直す。
make_copy_page.py の出力に、これまで手で直してきた言い方をあて、制度ガイドの動画（gift の節）は「ショート」でない言い方にする。
使い方：python3 regen_book.py 出力.html"""
import importlib.util
import json
import re
import sys

ROOT = "/home/user/-"
JS = f"{ROOT}/reports/偉人編 損する制度シリーズ.plans.json"
spec = importlib.util.spec_from_file_location("mcp", f"{ROOT}/.claude/skills/money-buzz-research/scripts/make_copy_page.py")
mcp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mcp)

SEP = "\n\n――――――――\n\n"
# 画面に出す秒数を、データと変えている回（制度編3は17行で約60秒）
SHOWN_SECONDS = {"ep3": 60}
GLOBAL = [
    ("見せ方 ", "場面・演出 "), ("〔見せ方：", "〔場面・演出："),
    ("money-shorts に頼む文でコピー", "制作セッションに頼む文でコピー"),
    ("をmoney-shortsに頼む文でコピー", "を制作セッションに頼む文でコピー"),
    ("money-shortsに頼む文", "制作セッションに頼む文"),
    ("money-shorts に渡すときの注記", "制作メモ（配役・登場の型・出典）"),
    ("■money-shortsに渡すときの注記", "■制作メモ"),
]
GIFT_PREFIX = ("偉人編（26人版）の絵と声で、次の「制度ガイドの動画」を作ってください。ショートではなく、無料プレゼントのページで流す動画です"
               "（PRの札・順位・つかみ・最後のギャグと「プロフィールのリンクから」は入れない。最後は「やることチェック」の場面。早口にしない）。"
               "作り方は引き継ぎ書の 7-2（common/newep.py）をもとに。数字は作る直前に確かめ直し、声を作る前に費用の目安を教えてください。投稿はしません。\n\n")


def plan_rules(sec_id, p):
    """1つの企画に使う置きかえ（画面とコピーの文の両方）。"""
    sec, n = p["seconds"], len(p.get("script", []))
    shown = SHOWN_SECONDS.get(p["id"], sec)
    r = [(f"ショート・{sec}秒", f"ショート・約{shown}秒")]
    if sec_id == "next":
        r.append((f"台本（{sec}秒）", "台本（骨組み）"))
    else:
        r.append((f"台本（{sec}秒）", f"台本（{n}行・約{shown}秒）"))
    if sec_id == "gift":
        r += [("ショート・約", "ガイド動画・約"), ("サムネイル枠内テロップ", "ポスターの文字"),
              ("なぜこの企画？（根拠・今出す理由）", "ショートから足したポイント・入口ページでの置き場所"),
              ("<strong>今出す理由：</strong>", "<strong>入口ページ：</strong>"),
              ('data-what="テロップ"', 'data-what="ポスターの文字"'), ("のテロップをコピー", "のポスターの文字をコピー")]
    return r


def sub(text, rules):
    for a, b in rules:
        text = text.replace(a, b)
    return text


def build(data):
    page = mcp.Page(data)
    html = page.render()
    plans = [(s["id"], p) for s in data["sections"] for p in s["plans"]]
    prefix = page.prefix

    # 1) コピーの文（COPY）
    m = re.search(r"const COPY = (\{.*?\});\n", html, re.S)
    copy = json.loads(m.group(1).replace("<\\/", "</"))
    for sec_id, p in plans:
        rules = GLOBAL + plan_rules(sec_id, p)
        for key in [k for k in copy if k.startswith(p["id"] + ".")]:
            t = copy[key]
            if sec_id == "gift" and key.endswith(".ms") and t.startswith(prefix):
                t = GIFT_PREFIX + t[len(prefix):]
            copy[key] = sub(t, rules)
    segs = copy["all"].split(SEP)
    assert len(segs) == len(plans), (len(segs), len(plans))
    copy["all"] = SEP.join(sub(s, GLOBAL + plan_rules(sec_id, p)) for s, (sec_id, p) in zip(segs, plans))
    new_json = json.dumps(copy, ensure_ascii=False).replace("</", "<\\/")
    html = html[:m.start(1)] + new_json + html[m.end(1):]

    # 2) 画面のカード
    for sec_id, p in plans:
        start = html.index(f'<article class="card" id="{p["id"]}">')
        end = html.index("</article>", start) + len("</article>")
        html = html[:start] + sub(html[start:end], GLOBAL + plan_rules(sec_id, p)) + html[end:]
    return sub(html, GLOBAL)


if __name__ == "__main__":
    data = json.load(open(sys.argv[2] if len(sys.argv) > 2 else JS, encoding="utf-8"))
    out = build(data)
    open(sys.argv[1], "w", encoding="utf-8").write(out)
    print("wrote", sys.argv[1], len(out))
