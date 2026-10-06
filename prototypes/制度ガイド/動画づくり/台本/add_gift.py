"""制度ガイドの動画（16本）を、台本帳の plans.json（手書きの整形を保つ）に節として足し、台本の md を書く。
何度実行しても同じ結果になる。"""
import importlib.util
import json
import os

ROOT = "/home/user/-"
JS = os.path.join(ROOT, "reports/偉人編 損する制度シリーズ.plans.json")
MD = os.path.join(ROOT, "reports/制度ガイドの動画 台本.md")
HERE = os.path.dirname(os.path.abspath(__file__))

spec = importlib.util.spec_from_file_location("g", os.path.join(HERE, "gift_eps.py"))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
g.check()

q = lambda s: json.dumps(s, ensure_ascii=False)
WHO = {"all": "ほとんどの人", "kaishain": "会社員", "part": "パート", "jieigyo": "自営業", "nenkin": "年金", "kosodate": "子育て",
       "iryo": "通院・薬", "kaigo": "介護"}
SEC_PER_LINE = 3.6  # ふつうの速さ（早口にしない）


def seconds(ep):
    return int(round(len(ep["script"]) * SEC_PER_LINE / 5.0) * 5)


def who_text(ep):
    return "・".join(WHO[t] for t in ep["who"]) + "向け"


def plan(ep, i):
    no = f"ガイド{i:02d}"
    notes = [
        f"配役：{ep['cast']}。声が同じ組（兼続と龍馬・忠勝と謙信・利家と氏康・官兵衛と光秀）は同じ回に入れない。",
        "形：ショートではなく、無料プレゼントのページで流す動画。PRの札・順位・つかみの「？？？」・最後のギャグと「プロフィールのリンクから」は入れない。最後は「やることチェック」の場面で終える。早口にしない。",
        f"上の帯：シリーズ名「知らないと損する 制度ガイド」＋分類の札「{ep['badge']}」。注記「制度は2026年10月時点」"
        + ("（この回は法案の段階）" if ep["status"] == "法案" else "") + "。タイトルや画面に「プレゼント」「特典」は出さない。",
        f"入口ページでの置き場所：「{ep['badge']}」・{who_text(ep)}。",
        "出典：" + ep["sources"] + "。",
    ]
    return {
        "id": ep["id"], "kind": "short", "no": no, "when": ep["when"], "badge": ep["badge"], "seconds": seconds(ep),
        "name": ep["name"], "title": ep["name"], "telop": ep["telop"],
        "script": ep["script"], "ms_notes": notes, "caution": ep["caution"],
        "why": {"evidence": ep["added"], "now": f"入口ページ「動画で見る」の「{ep['badge']}」に入れる（{who_text(ep)}）。"},
    }


PLANS = [plan(ep, i) for i, ep in enumerate(g.EPISODES, 1)]


def fmt_plan(p, last):
    o = []
    A = o.append
    A("      {")
    A(f'        "id": {q(p["id"])}, "kind": {q(p["kind"])}, "no": {q(p["no"])}, "when": {q(p["when"])}, "badge": {q(p["badge"])}, "seconds": {p["seconds"]},')
    for key in ("name", "title", "telop"):
        A(f'        {q(key)}: {q(p[key])},')
    A('        "script": [')
    for i, l in enumerate(p["script"]):
        comma = "," if i < len(p["script"]) - 1 else ""
        A(f'          {{"time": {q(l["time"])}, "label": {q(l["label"])}, "text": {q(l["text"])}, "visual": {q(l["visual"])}}}{comma}')
    A("        ],")
    A('        "ms_notes": [')
    for i, n in enumerate(p["ms_notes"]):
        A(f'          {q(n)}{"," if i < len(p["ms_notes"]) - 1 else ""}')
    A("        ],")
    A(f'        "caution": {q(p["caution"])},')
    A('        "why": {')
    A('          "evidence": [')
    ev = p["why"]["evidence"]
    for i, e in enumerate(ev):
        A(f'            {q(e)}{"," if i < len(ev) - 1 else ""}')
    A("          ],")
    A(f'          "now": {q(p["why"]["now"])}')
    A("        }")
    A("      }" + ("" if last else ","))
    return "\n".join(o)


HEADING = "制度ガイドの動画（16本・ショートではない）"
LEAD = ("ショートの5本を、無料プレゼントのページ（制度ガイドの入口「動画で見る」）で流す動画として作り直す台本です。"
        "1本で1つの制度を、条件・注意・やることまで説明します。ショートで言い切れなかった点を足し、介護の「福祉用具の購入費」を1本足しました。"
        "タイトルや画面に「プレゼント」は出しません。")


def update_json():
    t = open(JS, encoding="utf-8").read()
    if '"id": "gift"' in t:
        s = t.index('    {"id": "gift"')
        e = t.index('    {"id": "next"')
        t = t[:s] + t[e:]
    sec = [f'    {{"id": "gift", "heading": {q(HEADING)}, "lead": {q(LEAD)}, "plans": [']
    sec += [fmt_plan(p, i == len(PLANS) - 1) for i, p in enumerate(PLANS)]
    sec.append("    ]},")
    anchor = '    {"id": "next", "heading"'
    assert t.count(anchor) == 1
    t = t.replace(anchor, "\n".join(sec) + "\n" + anchor)
    d = json.loads(t)
    old_lead = d["lead"]
    new_lead = ("「知らないと損する制度」を、偉人編（26人版）の型で作る台本です。第1弾の3本と第2弾「改正TOP5」の2本はショート、"
                "「制度ガイドの動画」16本は無料プレゼントのページで流す動画です。どれも配役・場面・読みまで入っています。"
                "「制作セッションに頼む文でコピー」を押して、「お金の動画制作」のセッションに貼れば、そのまま作り始められます。")
    t = t.replace(q(old_lead), q(new_lead), 1)
    d = json.loads(t)
    assert [p["id"] for p in d["sections"][2]["plans"]] == [p["id"] for p in PLANS]
    open(JS, "w", encoding="utf-8").write(t)
    return d


def md():
    o = ["# 制度ガイドの動画 台本（16本）", "",
         "（前提）作った日：2026年10月5日。ユーザーの希望「5本の動画を、ショートではなく無料プレゼント用の動画として作る。足した方がいいポイントは積極的に足す。ただしタイトルに『プレゼント用』は要らない」に合わせた台本です。"
         "制度の数字は、公式資料と報道で確かめました（出典は各回）。消費税1%と就業者負担軽減支援金は、10月5日時点で閣議決定の段階です。",
         "", "（できあがり）2026年10月6日に、16本とも動画になりました（54〜92秒）。入口のページ（https://claude.ai/artifact/6n3arH81sbf5GmaoSQbHaq ）の「動画で見る」で、いつの制度か・だれ向けかを選んで見られます。16本だけの一覧は https://claude.ai/artifact/TWWMBaps9ctGS1dLxPDtBp 。",
         "", "## 結論", "",
         "- **1本で1つの制度**：ショートの「5位・4位」のようにまとめず、制度ごとに分けた。いつから・だれ・いくら・やることを、条件と注意まで言う。",
         "- **足したポイント**：扶養の目安（税と健康保険は別）、生命保険料控除の子育て特例、iDeCoの70歳まで加入、こどもNISAの引き出し条件と18歳以降、セルフメディケーション税制、高額療養費の年間上限・マイナ保険証、パートの社会保険の会社負担の特例、年金の加給年金・在職老齢年金の注意、住宅改修の20万円の再利用、ほか。",
         "- **1本足した**：介護の回が「住宅改修」だけだったので「福祉用具の購入費（年10万円・指定のお店）」を足した。",
         "- **ショートとの違い**：PRの札・順位・つかみの「？？？」・最後のギャグと「プロフィールのリンクから」を入れない。最後は「やることチェック」。早口にしない。",
         "", "## 16本の一覧", "",
         "| キー | タイトル | いつの制度 | だれ向け | 行数・長さの目安 |", "|---|---|---|---|---|"]
    for p, ep in zip(PLANS, g.EPISODES):
        o.append(f"| {ep['id']} | {ep['name']} | {ep['badge']} | {who_text(ep)} | {len(ep['script'])}行・約{p['seconds']}秒 |")
    o += ["", "## 台本", ""]
    for p, ep in zip(PLANS, g.EPISODES):
        o += [f"### 【{p['no']}・{ep['id']}】{ep['name']}（{ep['when']}）", "",
              f"- **ポスターの文字**：{ep['telop']}", f"- **入口ページ**：{ep['badge']}・{who_text(ep)}" + ("・法案" if ep["status"] == "法案" else ""),
              f"- **配役**：{ep['cast']}", "",
              "| 行 | 話す人 | 字幕 | 場面・演出・読み |", "|---|---|---|---|"]
        o += [f"| {l['time']} | {l['label']} | {l['text']} | {l['visual']} |" for l in ep["script"]]
        o += ["", "**ショートから足したポイント**", ""] + [f"- {a}" for a in ep["added"]]
        o += ["", f"- 注意：{ep['caution']}", f"- 出典：{ep['sources']}", ""]
    open(MD, "w", encoding="utf-8").write("\n".join(o) + "\n")


if __name__ == "__main__":
    update_json()
    md()
    print("ok", len(PLANS), "本", sum(len(p["script"]) for p in PLANS), "行", "合計の目安", sum(p["seconds"] for p in PLANS), "秒")
