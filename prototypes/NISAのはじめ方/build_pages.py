"""おかねの地図に、入口・証券会社えらび・申し込みサポートの3ページを組み立てる。
ヘッダーとフッターは既存ページ（brokers.html）から抜き出したものをそのまま使う。"""
import pathlib

HERE = pathlib.Path(__file__).parent
HEADER = (HERE / "_header.html").read_text(encoding="utf-8")
FOOTER = (HERE / "_footer.html").read_text(encoding="utf-8")
ARROW = ('<svg class="icon " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
         'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
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
<script defer src="app.js"></script>
<script defer src="broker-config.js"></script>
<script defer src="{script}"></script>
</head>
<body>
"""

PR_NOTE = """<div class="pr-note">
<strong>【PR】このページには広告（アフィリエイト）を含みます。</strong>
<p>{text}</p>
</div>"""

START = f"""<div class="narrow">
<header class="start-hero">
<h1>小学生でも分かる<br>NISAのはじめ方</h1>
<p>3つの無料特典で、お金の育ち方を見るところから、口座えらび・はじめての積立まで。<br>登録なしで、すぐに使えます。</p>
</header>
{PR_NOTE.format(text='証券会社えらびの結果は、このサイトで紹介している会社の中から、あなたの回答に合う会社を表示します。投資には元本割れの可能性があります。')}
<div class="resume-banner" id="resume" hidden>
<p id="resume-text"></p>
<a class="button" id="resume-link" href="support.html">続きから進める {ARROW}</a>
</div>
<ul class="prep-strip" aria-label="口座の申し込みに用意するもの">
<li>マイナンバーカード</li>
<li>スマホ</li>
<li>だいたい10分</li>
</ul>
<ol class="start-steps" aria-label="おすすめの順番">
<li>特典1で、毎月の積立で資産がどう育つかを見る</li>
<li>特典2で、NISAのしくみと始め方を知る</li>
<li>特典3で、証券会社を決めて申し込む</li>
</ol>
<div class="gift-list">
<article class="gift-card" id="gift-app">
<span class="gift-number">1</span>
<p class="gift-label">特典1・資産推移アプリ・約1分</p>
<h2>毎月の積立で、資産はどう育つ？</h2>
<p>目標の金額と毎月の積立額を入れて、期間のつまみを動かすだけ。自分で積み立てたお金と、投資で増えた分が、グラフでその場でわかります。再生ボタンで、0年から資産が育つ様子も見られます。入力した数字は、この端末の中だけで使われます。</p>
<p class="example-line">例：毎月3万円を30年 → 仮に年5%なら約2,497万円（元本1,080万円＋増えた分1,417万円）</p>
<p class="example-line">例：目標2,000万円 → 毎月3万円・年5%なら、26年8か月で届く計算</p>
<div class="gift-actions">
<a class="button" href="goal.html">資産推移アプリを開く {ARROW}</a>
<a class="button button-secondary" href="planner.html">くわしい家計プラン {ARROW}</a>
</div>
</article>
<article class="gift-card" id="gift-guide">
<span class="gift-number">2</span>
<p class="gift-label">特典2・NISAのはじめ方・45ページ</p>
<h2>NISAはじめての完全ガイド</h2>
<p>しくみ・口座の選び方・積立の始め方・下がった日の考え方・売るときまで、38の章にまとめました。むずかしい言葉は、最後の用語の辞典で引けます。</p>
<p class="example-line">まず読むならここ：「最初の30分でやること」→「口座開設から初回の積立まで」</p>
<div class="gift-actions">
<a class="button" href="downloads/NISA-complete-guide.pdf">PDFを開く {ARROW}</a>
<a class="button button-secondary" href="guide.html">Webで読む {ARROW}</a>
</div>
</article>
<article class="gift-card is-main" id="gift-broker">
<span class="gift-number">3</span>
<p class="gift-label">特典3・質問30秒＋申し込み約10分</p>
<h2>3つの質問で、証券会社が決まる</h2>
<p>使っているカード・よく買い物をする場所・大事にしたいことを答えるだけ。決まったら、申し込みが終わるまでチェックリストで一緒に進めます。</p>
<p class="example-line">例：楽天カード＋楽天市場をよく使う → 楽天カードでクレカ積立ができる楽天証券</p>
<div class="gift-actions">
<a class="button" href="choose.html">3つの質問に答える {ARROW}</a>
</div>
</article>
</div>
<p class="fine-print">このサイトは、特定の銘柄や商品をすすめるものではありません。試算は仮定にもとづくもので、将来の成果を約束しません。出典と編集方針は<a href="sources.html">出典・編集方針</a>、広告の考え方は<a href="about.html">このサイトについて</a>にあります。</p>
</div>"""

CHOOSE = f"""<div class="content-wide">
<div class="breadcrumb">
<a href="start.html">NISAのはじめ方</a>
<span aria-hidden="true">/</span>
<span>証券会社えらび</span>
</div>
<header class="page-heading">
<h1>3つの質問で、<br>証券会社が決まる。</h1>
<p>答えるのは、使っているカード・よく買い物をする場所・大事にしたいことだけ。30秒ほどで終わります。</p>
</header>
{PR_NOTE.format(text='結果は、このサイトで紹介している証券会社の中から、回答に合う会社を表示します。掲載順はおすすめ順位ではありません。')}
<section class="quiz" id="chooser">
<noscript><p>この診断はJavaScriptを使います。<a href="brokers.html">口座の比較</a>から選ぶこともできます。</p></noscript>
</section>
<section class="compare-mini" aria-labelledby="compare-title">
<h2 id="compare-title">紹介している証券会社</h2>
<p class="fine-print"><span id="checked-at"></span>時点の確認です。最新の条件は、各社の公式サイトで確かめてください。</p>
<div class="table-scroll" tabindex="0" role="region" aria-labelledby="compare-title">
<table id="broker-table">
<thead><tr><th scope="col">証券会社</th><th scope="col">クレカ積立できる主なカード</th><th scope="col">たまる主なポイント</th><th scope="col">リンク</th></tr></thead>
<tbody></tbody>
</table>
</div>
<p class="fine-print">このページでは、特定の銘柄や商品はすすめていません。何を買うかは、<a href="guide.html#chapter-13">ガイドの「株式・投資信託・ETFの違い」</a>や<a href="library.html#bonus-07">投資信託の費用・中身チェック</a>を見て、自分で決めてください。</p>
</section>
</div>"""

SUPPORT = f"""<div class="narrow">
<div class="breadcrumb">
<a href="start.html">NISAのはじめ方</a>
<span aria-hidden="true">/</span>
<a href="choose.html">証券会社えらび</a>
<span aria-hidden="true">/</span>
<span>申し込みサポート</span>
</div>
<header class="page-heading">
<h1 id="apply-title">NISA口座の申し込みを、最後まで一緒に。</h1>
<p>終わったらチェックを入れるだけ。途中でやめても、この端末に保存されるので、次に開くと続きからできます。</p>
</header>
{PR_NOTE.format(text='申し込みページへのボタンは、広告（アフィリエイト）のリンクの場合があります。申し込みの画面や必要な書類は、証券会社によって違います。')}
<div class="notice" id="pick-first" hidden>
<strong>まだ証券会社を決めていない人へ</strong>
<p><a href="choose.html">3つの質問で証券会社を決める</a>と、その会社の申し込みページのボタンが出ます。</p>
</div>
<div class="notice" id="broker-notes" hidden></div>
<ol class="timeline" aria-label="全体の流れ">
<li><b>今日</b>申し込み（約10分）</li>
<li><b>数日</b>審査を待つ</li>
<li><b>届いたら</b>ログインと設定（約15分）</li>
<li><b>完了</b>積立がスタート</li>
</ol>
<div class="apply-top">
<div class="apply-progress"><span id="apply-count">0 / 12 できた</span><progress id="apply-bar" max="12" value="0" aria-label="進み具合"></progress></div>
<p class="next-step" id="apply-next"></p>
</div>
<div id="apply">
<noscript><p>このチェックリストはJavaScriptを使います。<a href="guide.html#chapter-11">ガイドの「口座開設から初回の積立まで」</a>でも、同じ流れを読めます。</p></noscript>
</div>
<div class="done-card" id="apply-done" hidden>
<h2>おつかれさまでした！</h2>
<p>これで、NISAの積立がスタートです。毎日の値動きは見なくて大丈夫。年に1回だけ見直しましょう。</p>
<a class="button" href="library.html#bonus-10">年1回のNISA点検シート {ARROW}</a>
</div>
<div class="reset-area">
<button class="link-button" type="button" id="reset-open">進み具合を消す</button>
<div class="reset-confirm" id="reset-confirm" hidden>
<span>本当に消しますか？</span>
<button class="button" type="button" id="reset-yes">消す</button>
<button class="button button-secondary" type="button" id="reset-no">やめる</button>
</div>
</div>
<p class="fine-print">わからないときは、各社の公式サイトのヘルプやお問い合わせ窓口で確かめてください。このページでは、特定の銘柄や商品はすすめていません。</p>
</div>"""

def rate_buttons(target, values, unit="%"):
    return ('<div class="rate-presets">' + ''.join(
        f'<button type="button" data-rate-for="{target}" data-rate="{v}">{v}{unit}</button>' for v in values) + '</div>')


def field(fid, label, unit, value, hint="", mode="decimal"):
    small = f"<small>{hint}</small>" if hint else ""
    return (f'<label for="{fid}">{label} <span>{unit}</span></label>'
            f'<input id="{fid}" inputmode="{mode}" autocomplete="off" value="{value}">{small}')


def chips(target, values, unit="万円"):
    return ('<div class="sim-chips" role="group" aria-label="よく使う金額">' + ''.join(
        f'<button type="button" data-set="{target}" data-value="{v}">{v:,}{unit}</button>' for v in values) + '</div>')


def helper_field(fid, label, unit, value, mode="decimal"):
    return (f'<label for="{fid}">{label} <span>{unit}</span></label>'
            f'<input id="{fid}" inputmode="{mode}" autocomplete="off" value="{value}">')


GOAL = f"""<div class="content-wide">
<div class="breadcrumb">
<a href="start.html">NISAのはじめ方</a>
<span aria-hidden="true">/</span>
<span>資産推移アプリ</span>
</div>
<header class="page-heading">
<h1>毎月の積立で、<br>資産はどう育つ？</h1>
<p>目標の金額と毎月の積立額を入れて、期間のつまみを横に動かすだけ。自分で積み立てたお金と、投資で増えた分が、その場でグラフになります。入力した数字は、この端末の中だけで使われ、どこにも送られません。</p>
</header>

<div class="sim" id="sim">
<form class="sim-form" id="sim-form" novalidate>
<div class="sim-field">
<label class="sim-label" for="s-target"><b class="sim-step" aria-hidden="true">1</b>目標の金額</label>
<div class="sim-input"><input id="s-target" inputmode="decimal" autocomplete="off" value="2000" aria-describedby="s-target-hint"><span>万円</span></div>
{chips('s-target', [1000, 2000, 3000])}
<small id="s-target-hint">例：老後のために2,000万円。決まっていなければ、下の<a href="#fire">「FIREに必要な金額」</a>で計算できます。</small>
</div>
<div class="sim-field">
<label class="sim-label" for="s-monthly"><b class="sim-step" aria-hidden="true">2</b>毎月の積立額</label>
<div class="sim-input"><input id="s-monthly" inputmode="decimal" autocomplete="off" value="3" aria-describedby="s-monthly-hint s-perday"><span>万円</span></div>
<p class="sim-perday" id="s-perday"></p>
{chips('s-monthly', [1, 3, 5, 10])}
<small id="s-monthly-hint">毎月、むりなく投資に回せる金額。わからなければ、下の<a href="#budget">「いまの家計から」</a>で出せます。</small>
</div>
<div class="sim-field">
<p class="sim-label" id="s-rate-label">増える割合（1年あたり・仮）</p>
<div class="sim-chips" role="group" aria-labelledby="s-rate-label">
<button type="button" data-rate-main="3" aria-pressed="false">年3%</button>
<button type="button" data-rate-main="5" aria-pressed="true">年5%</button>
<button type="button" data-rate-main="7" aria-pressed="false">年7%</button>
</div>
<small>利回りは約束ではありません。低めの3%でも試してみましょう。</small>
</div>
<details class="sim-more">
<summary>くわしく設定する（今ある資産・年齢・割合）</summary>
<div class="sim-fields">
{helper_field('s-now', '今ある資産', '万円', '0')}<small>はじめに入れるお金や、すでに持っている投資の額</small>
{helper_field('s-age', '今の年齢', '歳', '35', mode='numeric')}<small>入れると、何歳のときかも出ます（空にすると出ません）</small>
{helper_field('s-rate', '増える割合（1年あたり）', '%', '5')}<small>0〜15%の間で入れられます</small>
</div>
</details>
<p class="form-errors" id="s-error" role="alert" hidden></p>
</form>

<div class="sim-side">
<section class="sim-card" aria-labelledby="s-when">
<p class="sim-when" id="s-when">―</p>
<p class="sim-total" id="s-total">―</p>
<ul class="sim-parts">
<li class="is-gain"><span class="sim-key" aria-hidden="true"></span><span>投資で増えた分（仮）</span><b id="s-gain">―</b></li>
<li class="is-principal"><span class="sim-key" aria-hidden="true"></span><span>自分で積み立てた元本</span><b id="s-principal">―</b></li>
</ul>
<div class="sim-goal" id="s-goal-box">
<p class="sim-goal-row"><span>目標 <b id="s-goal">―</b></span><span class="sim-goal-pct" id="s-goal-pct"></span></p>
<div class="sim-meter" aria-hidden="true"><span class="sim-meter-fill" id="s-meter"></span></div>
<p class="sim-goal-msg" id="s-goal-msg"></p>
<p class="sim-goal-fix" id="s-goal-fix" hidden><span id="s-goal-fix-text"></span><button type="button" class="sim-mini" id="s-goal-fix-btn"></button></p>
</div>
<div class="sim-compare" role="group" aria-labelledby="s-compare-label">
<span id="s-compare-label">くらべる</span>
<button type="button" data-compare="plus" aria-pressed="false">毎月あと1万円</button>
<button type="button" data-compare="range" aria-pressed="false">年3%〜7%</button>
</div>
<p class="sim-compare-text" id="s-compare-text" hidden></p>
<div class="sim-chart" id="s-chart-box">
<svg id="s-chart" height="240" role="img" aria-labelledby="s-chart-title s-chart-desc"><title id="s-chart-title">資産の推移のグラフ</title><desc id="s-chart-desc"></desc></svg>
<div class="sim-tip" id="s-tip" hidden></div>
</div>
<div class="sim-period">
<input type="range" id="s-years" min="1" max="40" step="1" value="30" aria-describedby="s-years-hint">
<p class="sim-period-row"><label for="s-years"><b class="sim-step" aria-hidden="true">3</b>投資する期間</label><output id="s-years-out" for="s-years">30年</output></p>
<button type="button" class="sim-play" id="s-play" aria-pressed="false"><svg class="sim-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M7 4.5v15l13-7.5z" fill="currentColor"/><path class="i-stop" d="M6 6h12v12H6z" fill="currentColor"/></svg><span id="s-play-label">0年から育つ様子を再生</span></button>
<p class="sim-hint" id="s-years-hint">つまみを左右に動かすと、グラフと金額がその場で変わります。グラフを横になぞっても動かせます。</p>
</div>
<div class="sim-checks">
<p class="sim-sub">チェックポイント</p>
<ol class="sim-checks-list" id="s-checks"></ol>
<p class="sim-speed" id="s-speed" hidden></p>
</div>
<p class="visually-hidden" id="s-live" aria-live="polite"></p>
</section>

<div class="sim-insights">
<section class="sim-blocks-card" aria-labelledby="s-blocks-title">
<h2 id="s-blocks-title">積み木で見ると</h2>
<p class="sim-blocks-legend"><span class="is-principal"><span class="sim-key" aria-hidden="true"></span>元本 <b id="s-blocks-p">―</b></span><span class="is-gain"><span class="sim-key" aria-hidden="true"></span>増えた分 <b id="s-blocks-g">―</b></span><span class="sim-blocks-unit" id="s-blocks-unit"></span></p>
<div class="sim-blocks" id="s-blocks" role="img" aria-label=""></div>
<p class="sim-blocks-note" id="s-blocks-note"></p>
</section>
<p class="sim-insight is-tax" id="s-tax" hidden></p>
<p class="sim-insight" id="s-late" hidden></p>
<ul class="goal-notes" id="s-notes"></ul>
</div>

<details class="sim-table">
<summary>表で見る（5年ごと）</summary>
<div class="table-scroll" tabindex="0" role="region" aria-label="5年ごとの資産の推移">
<table><thead><tr><th scope="col">時期</th><th scope="col">元本</th><th scope="col">増えた分</th><th scope="col">資産</th></tr></thead><tbody id="s-rows"></tbody></table>
</div>
</details>
</div>
</div>

<section class="sim-next" aria-labelledby="next-title">
<h2 id="next-title">次は、NISAのはじめ方へ</h2>
<p>NISAの口座で積み立てると、投資で増えた分に税金がかかりません。しくみと始め方は特典2、証券会社えらびと申し込みは特典3で、順番に案内します。</p>
<div class="inline-actions">
<a class="button" href="start.html#gift-guide">特典2　NISAのはじめ方を見る {ARROW}</a>
<a class="button button-secondary" href="choose.html">特典3　証券会社を選ぶ {ARROW}</a>
</div>
</section>

<section class="sim-helpers" aria-labelledby="helpers-title">
<h2 id="helpers-title">金額を決める手がかり</h2>
<details class="sim-helper" id="fire">
<summary>目標の金額：FIRE（働かなくても暮らせる）に必要な金額は？</summary>
<div class="sim-helper-body">
<div class="sim-fields">
{helper_field('f-cost', 'FIRE後の毎月の生活費', '万円', '20')}<small>家賃・食費・保険など、ひと月に使うお金</small>
{helper_field('f-wd', '毎年取り崩す割合', '%', '4')}<small>4%なら、必要な金額は年間の生活費の25倍</small>
{rate_buttons('f-wd', [3, 3.5, 4])}
</div>
<p class="sim-helper-result">必要な金額<b id="f-need">―</b></p>
<p class="result-caption" id="f-caption"></p>
<button type="button" class="button button-secondary sim-use" id="f-use">この金額を目標にする</button>
<p class="sim-help-note">「4%」は、資産の4%を毎年取り崩しても長持ちしやすいという、アメリカの過去のデータから生まれた目安です。日本の税金・物価・寿命では結果が変わるので、心配なら3〜3.5%で試してください。年金は入れていません。</p>
</div>
</details>
<details class="sim-helper" id="budget">
<summary>毎月の積立額：いまの家計から、毎月いくら回せる？</summary>
<div class="sim-helper-body">
<div class="sim-fields">
{helper_field('b-income', '手取りの月収', '万円', '25')}<small>税金や社会保険料が引かれたあとの金額</small>
{helper_field('b-cost', '毎月の支出', '万円', '20')}<small>家賃・食費・通信費・保険・こづかいなどの合計</small>
{helper_field('b-saved', '今の貯金', '万円', '50')}
{helper_field('b-guard', '生活防衛資金（生活費の何か月分）', 'か月', '6', mode='numeric')}<small>病気や失業に備えて、投資とは別に置いておくお金</small>
{rate_buttons('b-guard', [3, 6, 12], 'か月')}
</div>
<p class="sim-helper-result">投資に回せるのは<b id="b-can">―</b></p>
<p class="result-caption" id="b-plan"></p>
<button type="button" class="button button-secondary sim-use" id="b-use" hidden></button>
<ul class="goal-list" id="b-tips"></ul>
</div>
</details>
</section>

<section class="text-section">
<h2>計算の前提</h2>
<p>毎月の積立は月末に入れ、増える割合は毎月の複利（年5%なら、毎月5÷12%）で計算しています。税金・手数料・物価の上昇は入れていません。実際の値動きは毎年ちがい、元本を下回る年もあります。このアプリは、特定の商品をすすめるものではありません。</p>
<div class="inline-actions">
<a class="text-link" href="planner.html">家計をくわしく分けて考える（家計プラン） {ARROW}</a>
</div>
</section>
</div>"""

PAGES = {
    "goal.html": ("資産推移アプリ", "目標の金額と毎月の積立額を入れて、期間のつまみを動かすだけ。自分で積み立てたお金と、投資で増えた分の推移がグラフでわかります。入力はこの端末の中だけで使われます。", "goal.js", GOAL),
    "start.html": ("小学生でも分かる NISAのはじめ方", "3つの無料特典で、NISAの口座えらびから、はじめての積立まで。登録なしで使えます。", "start.js", START),
    "choose.html": ("3つの質問で決まる 証券会社えらび", "使っているカードや買い物の場所に答えるだけで、合いそうな証券会社がわかります。", "choose.js", CHOOSE),
    "support.html": ("NISA口座の申し込みサポート", "NISA口座の申し込みを、チェックリストで最後まで一緒に進めます。", "support.js", SUPPORT),
}


def build(out_dir):
    out = pathlib.Path(out_dir)
    for name, (title, desc, script, body) in PAGES.items():
        html = HEAD.format(title=title, desc=desc, script=script) + HEADER + '<main id="main">\n' + body + "\n</main>\n" + FOOTER + "\n</body>\n</html>\n"
        (out / name).write_text(html, encoding="utf-8")
        print("wrote", out / name)


if __name__ == "__main__":
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else HERE)
