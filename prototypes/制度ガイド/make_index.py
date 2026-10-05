"""プレビューの入口（index.html）を作る。見た目は前の特典プレビュー（NISAのはじめ方）と同じ部品を使う。"""
import json
import pathlib
import urllib.parse

HERE = pathlib.Path(__file__).parent
BASE_CSS = HERE / "_showcase_base.css"  # 前の特典プレビュー（NISAのはじめ方）の部品
DATA = next(p for p in [HERE.parents[1] / "reports" / "制度データ 2026-10.json", pathlib.Path("/home/user/-/reports/制度データ 2026-10.json")] if p.exists())
REPO = "https://github.com/akamar08taiyo-bot/-/blob/claude/money-youtube-viral-research/reports/"
SCRIPTS = "https://claude.ai/artifact/393v7w1BTGuUvnP3rHmDCV"
GALLERY = "https://claude.ai/artifact/88Bki2FczPnw7y4fV4iZnx"
NISA = "https://claude.ai/artifact/UhvRPzh38U6Uq7igZjmEH4"
ARROW = ('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>')
OUT = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
       'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>')


def repo(name):
    return REPO + urllib.parse.quote(name)


def old_css():
    css = BASE_CSS.read_text(encoding="utf-8")
    css = css.replace("/* Layout: 動画の最後で配る3つの特典を、机に並べた見本のように。紙（PDF）とスマホ（アプリ）のポスター＋説明＋ボタン */",
                      "/* Layout: 偉人編の動画の最後で配る3つのプレゼントを、スマホ2台のポスターで並べる。下に、つながる動画と資料 */")
    return css


NEW_CSS = """
/* つながる動画 */
.videos,.docs{display:grid;gap:12px}
.sec-head{display:grid;gap:4px;max-width:46rem}
.sec-head h2{font-size:24px;line-height:1.45;letter-spacing:-.02em;font-weight:800}
.sec-head p{font-size:15px;color:var(--muted)}
.ep-list{list-style:none;padding:0;display:grid;gap:10px}
@media(min-width:900px){.ep-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ep{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 14px;align-items:start;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.ep-no{grid-row:1/span 5;font:400 30px/1 var(--num);color:var(--accent);min-width:1em;padding-top:2px}
.ep>:not(.ep-no){grid-column:2;min-width:0}
@media(min-width:900px){.ep.is-now{grid-column:1/-1}}
.ep-kicker{font-size:13px;font-weight:700;letter-spacing:.04em;color:var(--accent-ink)}
.ep h3{font-size:17px;line-height:1.55;font-weight:800}
.ep-meta{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:14px;color:var(--muted)}
.state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;border-radius:999px;padding:1px 10px;border:1px solid currentColor;white-space:nowrap}
.state::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.state.is-making{color:var(--accent-ink)}
.state.is-ready{color:var(--ink)}
.state.is-done{color:var(--btn-fg);background:var(--btn-bg);border-color:var(--btn-bg)}
.ep-close{font-size:14px;line-height:1.7;background:var(--pale);border-radius:6px;padding:6px 10px}
.ep a{font-size:14px;font-weight:700}
.more{display:flex;flex-wrap:wrap;gap:10px}
.link-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 14px;border:1.5px solid var(--ink);border-radius:8px;font-size:15px;font-weight:700;text-decoration:none}
.link-btn:hover{background:var(--pale)}

/* 資料 */
.doc-list{list-style:none;padding:0;display:grid;gap:10px}
@media(min-width:900px){.doc-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
.doc{display:grid;gap:4px;min-width:0;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:10px;text-decoration:none}
.doc:hover{border-color:var(--ink)}
.doc b{display:flex;align-items:center;gap:8px;font-size:16px;line-height:1.5}
.doc b svg{flex:none;color:var(--accent)}
.doc span{font-size:14px;color:var(--muted);line-height:1.7}
.doc small{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--accent-ink)}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}
"""

EPISODES = [
    ("制度編1", "三英傑の年金：60歳・65歳・75歳、いちばん損するのは？", "done", "69秒。動画一覧の「偉人版」で見られます",
     "待てるのは75歳まで！準備はプロフィールのリンクから！", "改正まとめ・診断", "ep1"),
    ("制度編2", "年金生活、捨てたら損する封筒ベスト5", "making", "声ができて、書き出しの仕上げ中",
     "中身を出して！準備はプロフィールのリンクから！", "給付金の一覧（年金生活）", "ep2"),
    ("制度編3", "親の家の手すり、工事の前に申請しないと損", "making", "画面とサムネができて、次に声づくり",
     "お城は対象外です！備えはプロフィールのリンクから！", "給付金の一覧（介護）", "ep3"),
    ("改正編1", "11月以降に変わるお金のルールTOP5", "ready", "制作待ち",
     "城は建ちません！使い道はプロフィールのリンクから！", "改正まとめ・診断", "kaisei1"),
    ("改正編2", "知らないと損する 2027年度の制度改正TOP5", "ready", "法案の行方を見て制作",
     "4月からが1%です！始め方はプロフィールのリンクから！", "改正まとめ", "kaisei2"),
]


def main():
    d = json.loads(DATA.read_text(encoding="utf-8"))
    n_kaisei = sum(1 for i in d["items"] if i.get("type") == "kaisei")
    n_benefit = len(d["benefits"])
    n_tabs = len(d["benefit_tabs"])

    eps = []
    for k, (no, title, state, state_text, close, gift, anchor) in enumerate(EPISODES, 1):
        cls = {"making": "is-making", "done": "is-done"}.get(state, "is-ready")
        label = {"making": "制作中", "done": "完成"}.get(state, "台本完成")
        eps.append(f"""<li class="ep{' is-now' if state == 'done' else ''}">
<span class="ep-no" aria-hidden="true">{k}</span>
<p class="ep-kicker">{no}</p>
<h3>{title}</h3>
<p class="ep-meta"><span class="state {cls}">{label}</span>{state_text}</p>
<p class="ep-close">最後のひと言：「{close}」<br>→ つながるプレゼント：{gift}</p>
<a href="{GALLERY if state == 'done' else SCRIPTS + '#' + anchor}" target="_blank" rel="noopener">{'動画を見る' if state == 'done' else '台本を見る'} {OUT}</a>
</li>""")

    docs = [
        (SCRIPTS, "台本帳", "偉人編 損する制度シリーズ", "制度編3本と改正TOP5の2本。配役・乱入・演出・出典まで、制作セッションに頼む文ごとワンタップでコピーできます。"),
        (GALLERY, "動画", "できあがった動画の一覧", "偉人編・番外編など、完成した34本。このシリーズの5本も、できたらここに入ります。"),
        (repo("無料プレゼント 制度ガイドの計画.md"), "計画書", "無料プレゼント「制度ガイド」の計画", "3つのプレゼントの中身、作る順番、直すタイミング。"),
        (repo("制度データ 2026-10.json"), "データ", "制度データ（2026年10月5日時点）", f"改正{n_kaisei}件と給付金・手当{n_benefit}件。3つのプレゼントと動画の数字は、すべてここから。"),
        (repo("偉人編 損する制度シリーズ.md"), "レポート", "偉人編「知らないと損する制度」シリーズ", "シリーズの決まり、5本の台本、このあとの8本の骨組み。"),
        (NISA, "前に作った特典", "NISAのはじめ方 3つの特典", "ガイドPDF・逆算アプリ・証券会社えらび。同じサイトの無料特典です。"),
    ]
    doc_html = "\n".join(
        f'<li><a class="doc" href="{u}" target="_blank" rel="noopener"><small>{k}</small><b>{t} {OUT}</b><span>{s}</span></a></li>'
        for u, k, t, s in docs)

    html = f"""<title>制度ガイド プレビュー</title>
<style>{old_css()}{NEW_CSS}</style>

<div class="wrap">
  <header class="intro">
    <p class="brand"><img src="files/mascot.webp" alt="" width="44" height="44">おかねの地図<span class="pill">試作プレビュー</span></p>
    <h1><span class="nb">知らないと損する</span> <span class="nb">制度ガイド</span></h1>
    <p class="lead">偉人編「知らないと損する制度」の動画の最後で配る、3つの無料プレゼントの試作です。アプリはそのまま押して試せます。下に、つながる動画と資料もまとめました。</p>
  </header>

  <section class="path" aria-labelledby="path-title">
    <h2 id="path-title">視聴者がたどる道</h2>
    <ol class="flow">
      <li><span>偉人編の動画を見る。最後のひと言は「〜はプロフィールのリンクから！」</span></li>
      <li><span>プロフィールのリンクから、おかねの地図の無料プレゼントへ</span></li>
      <li><span>3つのプレゼントで、自分に関係する制度とやることを確かめる</span></li>
    </ol>
  </section>

  <section class="gifts" aria-label="3つの無料プレゼント">
    <article class="gift" aria-labelledby="g1-title">
      <a class="poster" href="kaisei.html" aria-label="プレゼント1の制度改正まとめを開く">
        <span class="phone"><img src="files/poster-kaisei-a.webp" alt="" width="360" height="720"></span>
        <span class="phone"><img src="files/poster-kaisei-b.webp" alt="" width="360" height="720"></span>
      </a>
      <div class="gift-body">
        <p class="gift-no"><b>1</b>プレゼント ・ Webページ</p>
        <h2 id="g1-title"><span class="nb">知らないと損する</span> <span class="nb">お金の制度改正まとめ</span></h2>
        <p>2026年11月から2027年度までに変わるお金のルールを、時期の順に並べました。</p>
        <nav class="chips" aria-label="だれ向けかを選んで開く"><a href="kaisei.html#kaishain">会社員</a><a href="kaisei.html#nenkin">年金</a><a href="kaisei.html#kosodate">子育て</a></nav>
        <ul class="facts">
          <li>改正{n_kaisei}件を「決定・法案・検討中」の札つきで</li>
          <li>いつから・だれに関係・やること・損する点がひと目で</li>
          <li>すべての項目に出典（国税庁・日本年金機構など）のリンク</li>
        </ul>
        <div class="actions">
          <a class="btn" href="kaisei.html">まとめを開く {ARROW}</a>
        </div>
      </div>
    </article>

    <article class="gift" aria-labelledby="g2-title">
      <a class="poster" href="shindan.html" aria-label="プレゼント2の診断を開く">
        <span class="phone"><img src="files/poster-shindan-a.webp" alt="" width="360" height="720"></span>
        <span class="phone"><img src="files/poster-shindan-b.webp" alt="" width="360" height="720"></span>
      </a>
      <div class="gift-body">
        <p class="gift-no"><b>2</b>プレゼント ・ Webアプリ</p>
        <h2 id="g2-title">あなたに合う制度の診断</h2>
        <p>年齢・働き方・家族・住まいにタップで答えると、関係しそうな制度だけを出します。</p>
        <ul class="facts">
          <li>7〜8問・1分ほど。名前や年収の金額は聞きません</li>
          <li>「やること」「知っておくこと」「決まったら」に分けて表示</li>
          <li>やることはチェックでき、結果はコピーしてメモに残せる</li>
        </ul>
        <div class="actions">
          <a class="btn" href="shindan.html">診断をはじめる {ARROW}</a>
        </div>
      </div>
    </article>

    <article class="gift" aria-labelledby="g3-title">
      <a class="poster" href="kyufu.html" aria-label="プレゼント3の給付金・手当の一覧を開く">
        <span class="phone"><img src="files/poster-kyufu-a.webp" alt="" width="360" height="720"></span>
        <span class="phone"><img src="files/poster-kyufu-b.webp" alt="" width="360" height="720"></span>
      </a>
      <div class="gift-body">
        <p class="gift-no"><b>3</b>プレゼント ・ Webページ</p>
        <h2 id="g3-title"><span class="nb">だれ向け？</span> <span class="nb">国の給付金・手当の一覧</span></h2>
        <p>申請しないともらえない国の給付金・手当を、だれ向けかで分けてまとめました。</p>
        <nav class="chips" aria-label="分類を選んで開く"><a href="kyufu.html#kosodate">子育て</a><a href="kyufu.html#kaigo">介護</a><a href="kyufu.html#nenkin">年金生活</a></nav>
        <ul class="facts">
          <li>{n_tabs}つの分類・{n_benefit}件。いくら・やること・窓口つき</li>
          <li>「遅れると損する」点を赤茶の字で強調</li>
          <li>市区町村ごとの補助は、全国の検索サイトでの探し方つき</li>
        </ul>
        <div class="actions">
          <a class="btn" href="kyufu.html">一覧を開く {ARROW}</a>
        </div>
      </div>
    </article>
  </section>

  <section class="videos" aria-labelledby="videos-title">
    <div class="sec-head">
      <h2 id="videos-title">このプレゼントにつながる動画</h2>
      <p>偉人編「知らないと損する制度」の5本です。どれも最後に、このプレゼントへ案内します。制作は「お金の動画制作」のセッションで進んでいます（10月5日 夜の時点）。</p>
    </div>
    <ol class="ep-list">
{chr(10).join(eps)}
    </ol>
    <div class="more"><a class="link-btn" href="{GALLERY}" target="_blank" rel="noopener">できあがった動画の一覧（34本） {OUT}</a><a class="link-btn" href="{SCRIPTS}" target="_blank" rel="noopener">台本帳をひらく {OUT}</a></div>
  </section>

  <section class="docs" aria-labelledby="docs-title">
    <div class="sec-head">
      <h2 id="docs-title">資料</h2>
      <p>台本・計画・データのもと。新しいタブで開きます。</p>
    </div>
    <ul class="doc-list">
{doc_html}
    </ul>
  </section>

  <section class="notes" aria-labelledby="notes-title">
    <h2 id="notes-title">このプレビューについて</h2>
    <ul>
      <li>3つとも試作です。制度の内容は2026年10月5日時点で、国税庁・日本年金機構・厚生労働省などの資料と報道で確かめました。「法案」「検討中」は決まったら直します。</li>
      <li>診断の答えとチェックは、見ている端末の中だけに残ります（どこにも送りません）。</li>
      <li>ページの上のメニューや、ほかのページへのリンクは、プレビューでは開きません。実際のサイトでは開きます。</li>
      <li>広告（アフィリエイト）は入れていません。実際のサイトに入れるときは、データの <code>制度データ 2026-10.json</code> を直せば3ページとも変わります。</li>
    </ul>
  </section>
</div>

<script>
(function () {{
  'use strict';
  try {{ localStorage.setItem('seido-guide:home', location.href.split('#')[0]); }} catch (e) {{ /* 保存が使えなくても動く */ }}
}}());
</script>
"""
    (HERE / "index.html").write_text(html, encoding="utf-8")
    print("wrote index.html", len(html))


if __name__ == "__main__":
    main()
