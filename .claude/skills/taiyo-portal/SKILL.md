---
name: taiyo-portal
description: 太陽シルバーサービス㈱（行橋営業所）の「太陽ポータル」（業務アプリポータル。https://akamar08taiyo-bot.github.io/taiyo-portal/ 、リポジトリ akamar08taiyo-bot/taiyo-portal の master）と、そこから開く業務アプリ全体に共通の知識。どのアプリがどのリポジトリ・ブランチ・フォルダにあるか、ポータルへの公開（ビルドを置く・タイルの名前と使い方の文＝APPS を直す・GitHub Pages のデプロイの確かめ方）、本番に出す前の確かめ（ユーザーの「公開して」）、ユーザー（行橋営業所の担当者）の好み・報告のしかた・コミットの決まり。ポータル・タイル・使い方の文・公開・デプロイ・「公開して」・新しいアプリをポータルに載せる・どのアプリの話か分からないとき、またはアプリ名（見積・提案書作成、消耗品売上管理、チラシ作成、特定福祉用具、住宅改修、福祉用具相談報告書、販売受注簿作成ツール、売上伝票発行依頼書、受注残・進捗管理、営業月報、居宅カレンダー、価格改定・休暇案内作成ツール、書類送付状、FAX送付状、福祉用具ユーザー辞書 など）が出たら使う。アプリごとの細かいことは各アプリのスキル（taiyo-…-app）、Excel 保存は taiyo-excel-export へ。
---

# 太陽ポータルと業務アプリ（共通）

太陽シルバーサービス㈱の業務アプリをタイルで並べたポータル。依頼してくるのは行橋営業所の担当者（プログラマーではない。スマホ・パソコン・iPad で使い、スクリーンショットに丸を付けて「ここを〜に」と頼む。返事は短い）。
このスキルは 2026年10月のセッションまでの、アプリ全体に共通の知識をまとめたもの。アプリごとの細かいことは各アプリのスキルを読む。

## アプリの一覧（2026-10-21 の時点。タイルの並びの順）

| タイル | 開く先 | コード | スキル |
|---|---|---|---|
| 見積・提案書作成 | https://akamar08taiyo-bot.github.io/taiyo-mitsumori/ | `taiyo-mitsumori`（main が本番） | `taiyo-mitsumori-app` |
| 福祉用具相談報告書 | …/taiyo-fukushi-report/ | `taiyo-fukushi-report` | — |
| 販売受注簿作成ツール | …/taiyo-hacchu-scan/ | `taiyo-hacchu-scan`（master の `docs/`） | `taiyo-jutaku-mitsumori-app` の references/hacchu-scan.md |
| 売上伝票発行依頼書 | …/taiyo-uriage-denpyo/ | `taiyo-uriage-denpyo` | — |
| 消耗品売上管理 | …/taiyo-uriage-bunseki/ | `taiyo-uriage-bunseki`（main） | `taiyo-uriage-bunseki-app` |
| 受注残・進捗管理 | …/solar-silver-progress-app/ | `solar-silver-progress-app` | — |
| 居宅カレンダー | …/taiyo-calendar/ | `taiyo-calendar` | — |
| 営業月報 | …/taiyo-eigyo-geppou/ | `taiyo-eigyo-geppou` | — |
| チラシ作成（レンタル） | …/taiyo-chirashi/ | `taiyo-chirashi`（ケアマネジャー様向け） | — |
| チラシ作成（消耗品） | …/taiyo-shohin-chirashi/ | `taiyo-shohin-chirashi`（main） | `taiyo-shohin-chirashi-app` |
| 価格改定・休暇案内作成ツール | …/taiyo-kakaku-kyuka/ | `taiyo-kakaku-kyuka` | — |
| 書類送付状作成 | ポータルの `soufujo/` | `taiyo-portal` そのもの（`soufujo/index.html` を直接コミット。ビルド・version.json なし） | — |
| FAX送付状作成 | …/-/fax.html | `-` のブランチ `claude/fax-cover-sheet-app`（push すると deploy-fax.yml がビルドして gh-pages を置きかえる） | — |
| 福祉用具ユーザー辞書 | …/fukushi-jisho/ | `fukushi-jisho` | — |
| 住宅改修 見積書作成 | ポータルの `jutaku-mitsumori/`（請求書のタブは `sasaoka/`。同じアプリの2つのビルド） | `-` のブランチ `claude/sasaoka-shikiri-app` | `taiyo-jutaku-mitsumori-app` |
| 特定福祉用具 購入申請書・見積もり作成 | ポータルの `tokutei/` | `-` のブランチ `claude/care-insurance-auto-transfer-3z0c9n` | `taiyo-tokutei-app` |

- リポジトリはどれも `akamar08taiyo-bot/<名前>`。URL は `https://akamar08taiyo-bot.github.io/<リポジトリ名>/`。**どれも public**（GitHub Pages のため）。ユーザーのデータを入れないのはこのため。
- リポジトリ `-` は1つで複数のアプリ：main は健康管理アプリ（index.html）と住宅ローン（mortgage.html。`.github/workflows/deploy.yml`）、FAX送付状はブランチ `claude/fax-cover-sheet-app`（/-/ を開いても FAX）、住宅改修・特定福祉用具もブランチごと。
  **作業する前にブランチを確かめる。** main の deploy.yml（Actions で Pages に出す）と gh-pages の公開がぶつかる恐れがある（確かめていない）。`cd -` は「前のフォルダに戻る」になるので、必ず `/home/user/-` と書く。
- 名前の取り違えに注意：「見積・提案書作成」（taiyo-mitsumori）と、チラシ作成（消耗品）の quote.html の画面の見出し「見積・提案書作成」と、「住宅改修 見積書作成」は別のもの。チラシ作成は（レンタル）と（消耗品）で別のリポジトリ。

## ポータルの仕組み（`taiyo-portal/index.html` の1ファイル）

- 最初に営業所を選ぶ画面（アクセス制限ではない）。選んだ営業所は localStorage `taiyo_portal_session`＝`{office, selectedAt}`。見積・提案書作成・消耗品売上管理・住宅改修・特定福祉用具は、これを読んで営業所を最初に選んでおく（同じサイトなので読める）。
  チラシ作成（消耗品）は自分のキー（`tss_office_v1`）、書類送付状は読まない。
- タイルは `var APPS = [ … ]` の1件ずつ：`{ name, desc, icon（ICONS のキー）, color（'c-…'）, url（ポータルのフォルダなら相対 'tokutei/index.html'、ほかは絶対 URL）, ready（true＝利用可能・false＝準備中）, usage（「使い方を見る」に出す文の配列） }`。タイルは新しいタブで開く。
- 利用者は並べ替え・非表示ができる（localStorage `taiyo_portal_tile_order`・`taiyo_portal_hidden_apps`。**タイルの name で覚えている**ので、name を変えると、その人の並び・非表示の設定がそのタイルだけ外れて末尾に来る）。
  並べ替えたことのある人には、新しいタイルは末尾に出る（ない人には APPS の順）。
- 全部のアプリが同じサイト（akamar08taiyo-bot.github.io）なので、localStorage・IndexedDB を共有する（受け渡しに使える。キーにはアプリごとの接頭辞を付ける。容量も分け合う）。
- ポータルのフォルダに置くアプリ（住宅改修・特定福祉用具）は `index.html`（1ファイルにビルドしたもの）と `version.json`（ビルドした時刻）を置く。アプリは `version.json` を見て新しい版を「⟳ 読み込み直す」で知らせる。

## 公開の流れ（共通）

**本番に出すのは、ユーザーが「公開して」と言ってから。** 本番＝ポータルの master への push と、ほかのアプリの公開するブランチへの push（GitHub Pages がすぐ配信する。多くは main、taiyo-hacchu-scan は master の docs/、FAX は claude/fax-cover-sheet-app）。
作業環境の安全確認（Production Deploy）で止められることがある（2026-10：taiyo-mitsumori の main への push、ポータルの `git pull` と push が止められた。ユーザーの「公開して」のあとは通った）。
**止められたら回り道をしない**（別の push のしかた・GitHub の API でファイルを書くなどをしない）。何をしようとしたか・なぜ要るかを報告して、ユーザーに決めてもらう。
「公開して」は、そのとき聞いたアプリのこと。ほかのアプリの公開は別に聞く。

1. アプリのリポジトリ（作業用のブランチ）を commit・push する。
2. ポータルのフォルダのアプリ：ビルド → `index.html` と `version.json` をフォルダに置く（住宅改修は `jutaku-mitsumori/` と `sasaoka/` の**両方**）→ タイルの使い方の文を直す → ポータルを commit・push（`git push -u origin master`）。
   別リポジトリのアプリ：そのリポジトリの公開するブランチに push（ビルドしたものもコミットするアプリがある）。タイルの文を変えるときだけポータルも push。
3. ポータルの push の前に `git fetch origin master` と `git log HEAD..origin/master` で、ほかのセッションの公開が先に入っていないか見る（clone は浅いことが多い）。
4. タイルの文を直したら、`<script>` が壊れていないか確かめる：
   `node -e "const h=require('fs').readFileSync('index.html','utf8');for(const m of h.match(/<script>([\s\S]*?)<\/script>/g)||[])new Function(m.replace(/<\/?script>/g,''))"`
5. **デプロイの確かめ**：github.io はこの作業環境から見えない（403）。GitHub MCP の `actions_list`（`list_workflow_runs`、owner `akamar08taiyo-bot`、repo はポータルなら `taiyo-portal`、perPage 3）で、
   自分の push の head_sha の「pages build and deployment」が completed／success になるのを見る（1分ほど）。走っている間は `actions_get`（`get_workflow_run`）。前景の sleep は使えないので、待つときは run_in_background の sleep か Monitor で。
6. 報告：スマホで古い画面が出たら「⟳ 読み込み直す」（ポータルのフォルダのアプリ）か、読み込み直し（Ctrl+F5・アプリの強制再読込）。

新しいセッションでのリポジトリの用意：`add_repo`（owner・repo。push するなら access "push"）→ `git clone https://github.com/akamar08taiyo-bot/<名前> /home/user/<名前>` → `register_repo_root`。
スクラッチパッド（/tmp）は次のセッションに残らない。くり返し使う検証のスクリプトはスキルの `scripts/` に入れる。

## ユーザーの好み（これまでの指摘から）

ボタンの色と説明文の話は、住宅改修のアプリで言われたこと。見積・提案書作成など、ほかのアプリには今も濃い色のボタンがある → 新しく作る所はこの好みに合わせ、今ある所は頼まれたら合わせる。


- 画面に説明文を入れない（「この説明は不要」と言われて消した）。説明は README とタイルの使い方の文へ。お知らせ（トースト）も「保存しました」のように短く。
- ボタンの色は控えめに（「色付けで目がチカチカする。色付けは Excel に保存と印刷くらいにして、濃い色は要らない」）。保存＝薄い青、Excel＝薄い緑、印刷＝薄い水色、ほかは白（削除も白。消す前の確かめで守る）。
- 消す操作は確かめてから（「全部いきなり消えてしまうと結構困る」）。元に戻せるとなお良い。
- 帳票は「何を・いくつ・いくら」だけ。頼まれていない欄・説明の行を足さない。役所・メーカー・会社の様式は形を変えない（枠の大きさも）。
- 依頼の例に書き間違いがあることもある → 意図を一般のルールにして作り、報告で「こう解釈した」と書く。細かいことを何度も聞き返すより、筋の通った解釈で進めて見せる。ただし、データを消す・外に送る・本番に出すなど取り返しのつかないことは確かめる。
- 進み具合を短く知らせる（長く黙らない）。

## 2026-10-22 の時点の公開の状態（Excel で保存）

- 5つとも公開済み：住宅改修・消耗品売上管理・チラシ作成（消耗品）（2026-10-21）、見積・提案書作成（main e742ff6）・特定福祉用具（ポータル e901963）（2026-10-22、ユーザーの「3つとも公開して」）。
  タイルの使い方の文にも5つとも Excel 保存を書いた。チラシ作成（消耗品）の見積書の金額は円単位（四捨五入）・特定福祉用具の印刷は入りきらなければ縮めて1枚、も同じ日に公開。
- 住宅改修の「改修前日付・改修後日付」（日付入り写真の日付を読む）・写真の枠に PDF・箇所を足すと長さへ（2026-10-22）は、ブランチに push 済み（89023e8）。ユーザーの「公開して」待ち。
- スキル（`.claude/skills`）は、見積・提案書作成とチラシ作成（消耗品）は main に入った。消耗品売上管理は `claude/skills` のブランチ（main は本番なので、公開のときに入れる）。
  住宅改修・特定福祉用具はそれぞれの作業用のブランチ。どのリポジトリの写しも、次にそのアプリを公開するときに新しい版にそろえる。

## 報告のしかた

日本語・やさしい言葉で、①できたこと ②使い方（番号付き） ③確かめてほしいこと（解釈したところ・ユーザーのデータに要るもの） ④テストと公開の結果。
見た目を変えたら、スクリーンショット（パソコンとスマホ）を送る。Excel・帳票は、架空のデータの見本と印刷と並べた画像を送り、会社の Excel・プリンターで一度見てもらう。
まだ返事をもらっていない質問は、最後に短く並べる。

## コミット・リポジトリの決まり

- コミットの件名・本文は日本語（何を・なぜ・どう確かめたか）。書き方はリポジトリに合わせる（`-` は `feat:`・`fix:`・`docs:` を付ける）。**モデル名を書かない。** 末尾には、そのセッションで指示された2行（`Co-Authored-By: …`・`Claude-Session: …`）をそのまま付ける。
- PR は頼まれたときだけ。push は `git push -u origin <ブランチ>`。ほかの人のブランチの履歴は書きかえない（rebase・amend・force push をしない）。push を断られたら `git fetch` で中身を見て、自分のまだ push していないコミットだけ rebase。
- **ユーザーのデータ（価格表の PDF・Excel、お客様の名前、売上の CSV）はリポジトリに入れない。** テストの見本は自分で作る（架空の名前）。「ダミー」「取り込まないで」と言われたファイルは形を読むだけ。
- テストで本番の Firebase などにつながない（ブラウザのテストは localhost 以外の通信を止める）。
- コメントは日本語で「なぜ」を書く。`git add -A` は使わず、ファイル名を挙げて add する（一時ファイルを入れない）。
- ワイルドカード付きの削除（`rm docs/assets/*` など）は安全確認で止められる。消すファイルは名前を1つずつ指定する。

## Playwright で確かめるときの共通のこつ

- Playwright はリポジトリの依存に入れていない。場所は `/opt/node-tools/node_modules/playwright/index.mjs`（ESM）か `/opt/node22/lib/node_modules/playwright`（CJS）。
  場所を指す環境変数はアプリで違う（住宅改修・特定福祉用具の e2e は ESM の `PLAYWRIGHT`＝index.mjs のパス、見積・提案書作成の harness は CJS の `PLAYWRIGHT_DIR`＝フォルダ）。
- `chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}})`（日本語のダウンロード名が「download」にならないように）。
- ポータルの営業所：`ctx.addInitScript(() => { try { localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})); } catch {} })`。
- 見た目を変えたら、1366px とスマホ（390×844、deviceScaleFactor 2）のスクリーンショットを撮って自分で見る。横にはみ出していないか（`document.documentElement.scrollWidth`）も見る。iPad は `hasTouch: true` の 1180×820。
- confirm・alert は止める（`page.on('dialog', d => d.accept())`。止め忘れるとタブごと固まる）。`window.print` は止める。
