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
{scripts}
</head>
<body>
"""

PR_NOTE = """<p class="pr-line">このページはPRを含みます。{text}</p>"""

# 特典の動画（できたら、YouTube などの URL か、サイトに置く動画ファイルの場所を入れる。空のあいだは、ページに出さない）
# 特典3の「口座の作り方」の動画は、証券会社ごとに broker-config.js の video に入れる
GIFT_VIDEOS = {
    "guide": "",  # 特典2：NISA完全攻略ガイドの動画
}


def video_link(key, label, cls="gift-alt"):
    url = GIFT_VIDEOS[key]
    if not url:
        return ""
    attrs = ' target="_blank" rel="noopener"' if url.startswith("http") else ""
    return f'<a class="{cls}" href="{url}"{attrs}>{label}</a>'


GUIDE_DESC = ("動画とPDF（45ページ）で、しくみから口座づくり・積立の始め方まで" if GIFT_VIDEOS["guide"]
              else "しくみから口座づくり・積立の始め方まで（PDF 45ページ）")
BROKER_DESC = "3つの質問で、あなたに合う証券会社が30秒でわかる"
GUIDE_ALTS = f'<p class="gift-alts">{video_link("guide", "動画で見る")}<a class="gift-alt" href="guide.html">Webで読む</a></p>'

START = f"""<div class="narrow">
<header class="start-hero">
<h1>小学生でも分かる<br>NISAのはじめ方</h1>
<p>無料特典3つ。登録なしで、すぐ使えます。</p>
</header>
<p class="pr-line">このページはPRを含みます。</p>
<div class="resume-banner" id="resume" hidden>
<p id="resume-text"></p>
<a class="button" id="resume-link" href="support.html">続きから進める {ARROW}</a>
</div>
<h2 class="visually-hidden">3つの無料特典</h2>
<ol class="gift-rows">
<li id="gift-app"><a class="gift-row" href="goal.html"><span class="gift-no" aria-hidden="true">1</span><span class="gift-text"><b>資産推移アプリ</b><span class="gift-desc">月3万円なら、65歳でいくら？ 目標の2,000万円には何歳で届く？</span></span>{ARROW}</a></li>
<li id="gift-guide"><a class="gift-row" href="downloads/NISA-complete-guide.pdf"><span class="gift-no" aria-hidden="true">2</span><span class="gift-text"><b>NISA完全攻略ガイド</b><span class="gift-desc">{GUIDE_DESC}</span></span>{ARROW}</a>{GUIDE_ALTS}</li>
<li id="gift-broker"><a class="gift-row" href="#quiz-tab"><span class="gift-no" aria-hidden="true">3</span><span class="gift-text"><b>証券会社えらび</b><span class="gift-desc">{BROKER_DESC}</span></span>{ARROW}</a></li>
</ol>
<section class="open-now" id="open" aria-labelledby="open-title">
<h2 id="open-title">NISA口座の申し込みは、スマホで約10分</h2>
<p class="open-q" id="brokers-label">おすすめの証券会社</p>
<p class="open-order">並びは、広告の条件や使いやすさなどをもとに、このサイトが決めています。</p>
<ol class="brokers" id="brokers" aria-labelledby="brokers-label"></ol>
<details class="more-brokers" id="more-brokers" hidden>
<summary>ほかの<span id="more-count"></span>社も見る</summary>
<ol class="brokers" id="brokers-more" aria-label="ほかの証券会社"></ol>
</details>
<noscript><p><a href="choose.html">紹介している証券会社の一覧を見る</a></p></noscript>
<details class="quiz-tab" id="quiz-tab">
<summary>どの証券口座がおすすめかわからない場合</summary>
<div class="quiz-tab-body">
<p class="quiz-tab-lead">3つの質問に答えると、あなたに合いそうな証券会社がわかります（30秒）。</p>
<section class="quiz" id="chooser" data-heading="h3" aria-label="3つの質問で証券会社を選ぶ"></section>
</div>
</details>
<p class="open-note">「申し込む」を押すと、その証券会社の申し込みページが開きます。用意するもの：マイナンバーカード・スマホ</p>
<a class="text-link" href="support.html">手順を見ながら申し込む {ARROW}</a>
</section>
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
{PR_NOTE.format(text='診断の結果は、紹介している証券会社の中から回答に合う会社を出します。一覧の並びは、広告の条件や使いやすさなどをもとに決めています。')}
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
{PR_NOTE.format(text='')}
<div class="notice" id="pick-first" hidden>
<strong>まだ証券会社を決めていない人へ</strong>
<p><a href="choose.html">3つの質問で証券会社を決める</a>と、その会社の申し込みページのボタンが出ます。</p>
</div>
<div class="notice video-note" id="broker-video" hidden></div>
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
<p class="fine-print">申し込みの画面や必要な書類は、証券会社によって違います。わからないときは、各社の公式サイトのヘルプやお問い合わせ窓口で確かめてください。このページでは、特定の銘柄や商品はすすめていません。</p>
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
<h1 class="visually-hidden">資産推移アプリ</h1>

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
<label class="sim-label" for="s-age"><b class="sim-step" aria-hidden="true">3</b>今の年齢</label>
<div class="sim-input sim-input-age"><input id="s-age" inputmode="numeric" autocomplete="off" value="35" aria-describedby="s-age-hint"><span>歳</span></div>
<small id="s-age-hint">今の年齢から、何歳のときにいくらになるか、何歳で目標に届くかを計算します。</small>
</div>
<div class="sim-field sim-start" role="group" aria-labelledby="s-start-title">
<p class="sim-label" id="s-start-title">はじめにあるお金<span class="sim-opt">なければ0円のまま</span></p>
<div class="sim-subfield">
<label for="s-start">スタート時の元金</label>
<div class="sim-input sim-input-sm"><input id="s-start" inputmode="decimal" autocomplete="off" value="0" aria-describedby="s-start-hint"><span>万円</span></div>
<small id="s-start-hint">はじめに、まとめて投資するお金</small>
</div>
<div class="sim-subfield">
<label for="s-nisa">すでにNISAで投資している金額</label>
<div class="sim-input sim-input-sm"><input id="s-nisa" inputmode="decimal" autocomplete="off" value="0" aria-describedby="s-nisa-hint s-start-sum"><span>万円</span></div>
<small id="s-nisa-hint">これまでにNISAで買った金額（だいたいでOK）</small>
</div>
<p class="sim-perday" id="s-start-sum"></p>
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
<summary>増える割合を自分で入れる</summary>
<div class="sim-fields">
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
<li class="is-principal"><span class="sim-key" aria-hidden="true"></span><span id="s-principal-label">自分で積み立てた元本</span><b id="s-principal">―</b></li>
<li class="sim-parts-note" id="s-principal-sub" hidden></li>
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
<input type="range" id="s-years" min="1" max="45" step="1" value="30" aria-describedby="s-years-hint">
<p class="sim-period-row"><label for="s-years"><b class="sim-step" aria-hidden="true">4</b>何歳まで積み立てる？</label><output id="s-years-out" for="s-years">65歳まで（30年）</output></p>
<button type="button" class="sim-play" id="s-play" aria-pressed="false"><svg class="sim-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M7 4.5v15l13-7.5z" fill="currentColor"/><path class="i-stop" d="M6 6h12v12H6z" fill="currentColor"/></svg><span id="s-play-label">今から育つ様子を再生</span></button>
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
<a class="button" href="start.html#gift-guide">特典2　NISA完全攻略ガイドを見る {ARROW}</a>
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
    "start.html": ("小学生でも分かる NISAのはじめ方", "3つの無料特典で、NISAの口座えらびから、はじめての積立まで。登録なしで使えます。", "choose.js start.js", START),
    "choose.html": ("3つの質問で決まる 証券会社えらび", "使っているカードや買い物の場所に答えるだけで、合いそうな証券会社がわかります。", "choose.js", CHOOSE),
    "support.html": ("NISA口座の申し込みサポート", "NISA口座の申し込みを、チェックリストで最後まで一緒に進めます。", "support.js", SUPPORT),
}


def build(out_dir):
    out = pathlib.Path(out_dir)
    for name, (title, desc, script, body) in PAGES.items():
        scripts = "\n".join(f'<script defer src="{name}"></script>' for name in script.split())
        html = HEAD.format(title=title, desc=desc, scripts=scripts) + HEADER + '<main id="main">\n' + body + "\n</main>\n" + FOOTER + "\n</body>\n</html>\n"
        (out / name).write_text(html, encoding="utf-8")
        print("wrote", out / name)


if __name__ == "__main__":
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else HERE)
