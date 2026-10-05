"""制度ガイドの3ページ（改正まとめ・診断・給付金一覧）を組み立てる。
データは reports/制度データ 2026-10.json から seido-data.js を作る。ヘッダーとフッターは既存サイトのもの。"""
import json
import pathlib

HERE = pathlib.Path(__file__).parent
DATA = next(p for p in [HERE.parents[1] / "reports" / "制度データ 2026-10.json", pathlib.Path("/home/user/-/reports/制度データ 2026-10.json")] if p.exists())
HEADER = (HERE / "_header.html").read_text(encoding="utf-8")
FOOTER = (HERE / "_footer.html").read_text(encoding="utf-8")
ARROW = ('<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
         '<path d="M4 12h16m-6-6 6 6-6 6"/></svg>')

HEAD = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex,nofollow">
<title>{title}｜おかねの地図</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#143E35">
<link rel="icon" href="assets/profile-icon.png">
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="start.css">
<link rel="stylesheet" href="gift.css">
<link rel="stylesheet" href="preview.css">
<script defer src="app.js"></script>
<script defer src="seido-data.js"></script>
<script defer src="sg-common.js"></script>
<script defer src="{script}"></script>
<script defer src="preview.js"></script>
</head>
<body>
"""

ASOF = "2026年10月5日時点"

def crumbs(here):
    return ('<div class="breadcrumb"><a href="index.html">無料プレゼント</a>'
            f'<span aria-hidden="true">/</span><span>{here}</span></div>')

def cta(title, text, links):
    btns = "".join(
        f'<a class="button{" button-secondary" if i else ""}" href="{h}">{t} {ARROW}</a>'
        for i, (t, h) in enumerate(links))
    return (f'<section class="sg-cta" aria-labelledby="cta-title"><h2 id="cta-title">{title}</h2>'
            f'<p>{text}</p><div class="sg-actions">{btns}</div></section>')

NOTE = ('<p class="sg-note">国税庁・日本年金機構・厚生労働省などの公表資料と報道をもとに、' + ASOF +
        'でまとめた目安です。「法案」「検討中」のものは内容が変わることがあります。手続きの前に、各窓口や公式サイトで確かめてください。'
        'このページに広告はありません。</p>')

PAGES = {
    "kaisei.html": dict(
        title="お金の制度改正まとめ（2026年11月〜2027年度）",
        desc="2026年11月から2027年度までに変わる、税金・年金・医療・子育てのお金のルールを、時期の順にまとめました。",
        script="kaisei.js",
        body=f"""<main id="main">
<div class="content-wide">
{crumbs('制度改正まとめ')}
<header class="sg-hero">
<h1>知らないと損する<br>お金の制度改正まとめ</h1>
<p>2026年11月から2027年度までに変わる、税金・年金・医療・子育てのお金のルール。いつから・だれに関係・やることを、時期の順に並べました。</p>
<p class="sg-asof">{ASOF}</p>
</header>
<ul class="legend" aria-label="決まった度合いの見方">
<li><span class="status is-kettei">決定</span>法律などで決まった</li>
<li><span class="status is-houan">法案（まだ決まっていない）</span>国会で審議中</li>
<li><span class="status is-kentou">検討中</span>案の段階</li>
</ul>
<div class="who-filter" id="who-filter" role="group" aria-label="だれに関係するかで絞りこむ"></div>
<p class="list-count" id="kaisei-count" aria-live="polite"></p>
<div id="kaisei-list"><noscript><p>この一覧はJavaScriptを使います。</p></noscript></div>
{cta('自分に関係するものだけ知りたいときは', 'タップで答える7〜8問で、あなたに関係する制度と、やることの一覧が出ます。',
     [('あなたに合う制度を診断', 'shindan.html'), ('給付金・手当の一覧', 'kyufu.html')])}
{NOTE}
</div>
</main>
"""),
    "shindan.html": dict(
        title="あなたに合う制度の診断",
        desc="年齢・働き方・家族・住まいについてタップで7〜8問に答えると、関係しそうな制度と、やることの一覧が出ます。",
        script="shindan.js",
        body=f"""<main id="main">
<div class="content-wide">
{crumbs('あなたに合う制度の診断')}
<header class="sg-hero">
<h1>タップで答えるだけ。<br>あなたに関係する制度がわかる。</h1>
<p>年齢・働き方・家族・住まいについて7〜8問。1分ほどで「やること」「知っておくこと」「決まったら確かめること」に分けて出ます。</p>
<p class="sg-asof">名前や年収の金額は聞きません。答えはこの端末の中だけで使います。</p>
</header>
<section class="dx" id="dx" aria-label="診断"><noscript><p>この診断はJavaScriptを使います。<a href="kaisei.html">制度改正まとめ</a>から探すこともできます。</p></noscript></section>
{cta('ぜんぶの制度を見たいときは', '時期の順に並べた改正のまとめと、だれ向けの給付金・手当の一覧もあります。',
     [('制度改正まとめ', 'kaisei.html'), ('給付金・手当の一覧', 'kyufu.html')])}
{NOTE}
</div>
</main>
"""),
    "kyufu.html": dict(
        title="国の給付金・手当の一覧（だれ向け）",
        desc="子育て・病気・介護・仕事・年金・住まいの6つに分けて、国の給付金・手当の金額・やること・窓口をまとめました。",
        script="kyufu.js",
        body=f"""<main id="main">
<div class="content-wide">
{crumbs('給付金・手当の一覧')}
<header class="sg-hero">
<h1>だれ向け？<br>国の給付金・手当の一覧</h1>
<p>子育て・病気・介護・仕事・年金・住まいの6つに分けて、いくら・やること・窓口をまとめました。申請しないともらえないものが多いので、当てはまる所から見てください。</p>
<p class="sg-asof">{ASOF}・国の制度（市区町村ごとの補助は、探し方をのせています）</p>
</header>
<div class="tab-row" id="kyufu-tabs" role="tablist" aria-label="だれ向けか"></div>
<section id="kyufu-panel" role="tabpanel" tabindex="0"><noscript><p>この一覧はJavaScriptを使います。</p></noscript></section>
{cta('あなたに当てはまるものだけ見たいときは', 'タップで答える7〜8問で、この一覧と改正のまとめから、関係しそうなものだけを出します。',
     [('あなたに合う制度を診断', 'shindan.html'), ('制度改正まとめ', 'kaisei.html')])}
{NOTE}
</div>
</main>
"""),
}


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    keep = {k: data[k] for k in ("checked", "who_tags", "items", "benefits", "benefit_tabs")}
    (HERE / "seido-data.js").write_text(
        "/* 制度データ（reports/制度データ 2026-10.json から自動で作る） */\nwindow.SEIDO_DATA = "
        + json.dumps(keep, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    for name, p in PAGES.items():
        html = HEAD.format(title=p["title"], desc=p["desc"], script=p["script"]) + HEADER + "\n" + p["body"] + FOOTER + "\n</body>\n</html>\n"
        (HERE / name).write_text(html, encoding="utf-8")
        print("wrote", name, len(html))


if __name__ == "__main__":
    main()
