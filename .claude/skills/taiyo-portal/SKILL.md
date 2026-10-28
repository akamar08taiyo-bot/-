---
name: taiyo-portal
description: 太陽シルバーサービス㈱（行橋営業所）の「太陽ポータル」（業務アプリポータル。https://akamar08taiyo-bot.github.io/taiyo-portal/ 、リポジトリ akamar08taiyo-bot/taiyo-portal の master）と、そこから開く業務アプリ全体に共通の知識。どのアプリがどのリポジトリ・ブランチ・フォルダにあるか、ポータルへの公開（ビルドを置く・タイルの名前と使い方の文＝APPS を直す・GitHub Pages のデプロイの確かめ方）、本番に出す前の確かめ（ユーザーの「公開して」）、ユーザー（行橋営業所の担当者）の好み・報告のしかた・コミットの決まり。ポータル・タイル・使い方の文・公開・デプロイ・「公開して」・新しいアプリをポータルに載せる・どのアプリの話か分からないとき、またはアプリ名（見積・提案書作成、消耗品売上管理、チラシ作成、特定福祉用具、住宅改修、福祉用具相談報告書、販売受注簿作成ツール、売上伝票発行依頼書、受注残・進捗管理、営業月報、居宅カレンダー、価格改定・休暇案内作成ツール、書類送付状、FAX送付状、福祉用具ユーザー辞書 など）が出たら使う。アプリごとの細かいことは各アプリのスキル（taiyo-…-app）、Excel 保存は taiyo-excel-export へ。
---

# 太陽ポータルと業務アプリ（共通）

太陽シルバーサービス㈱の業務アプリをタイルで並べたポータル。依頼してくるのは行橋営業所の担当者（プログラマーではない。スマホ・パソコン・iPad で使い、スクリーンショットに丸を付けて「ここを〜に」と頼む。返事は短い）。
このスキルは 2026年10月のセッションまでの、アプリ全体に共通の知識をまとめたもの（2026-10-26 に、住宅改修・特定福祉用具・受注残をまたいだ受け渡しを足した）。アプリごとの細かいことは各アプリのスキルを読む。
**写しが2つある**（`-` の2つのブランチ `claude/sasaoka-shikiri-app`・`claude/care-insurance-auto-transfer-3z0c9n` の `.claude/skills/taiyo-portal/`）。直したら、ほかの写しにも同じ中身を置く（2026-10-26 に食いちがっていた2つを1つにした）。

## アプリの一覧（2026-10-21 の時点。タイルの並びの順）

| タイル | 開く先 | コード | スキル |
|---|---|---|---|
| 見積・提案書作成 | https://akamar08taiyo-bot.github.io/taiyo-mitsumori/ | `taiyo-mitsumori`（main が本番） | `taiyo-mitsumori-app` |
| 福祉用具相談報告書 | …/taiyo-fukushi-report/ | `taiyo-fukushi-report` | — |
| 販売受注簿作成ツール | …/taiyo-hacchu-scan/ | `taiyo-hacchu-scan`（master の `docs/`） | `taiyo-jutaku-mitsumori-app` の references/hacchu-scan.md |
| 売上伝票発行依頼書 | …/taiyo-uriage-denpyo/ | `taiyo-uriage-denpyo`（**master の `docs/` が本番**。`npm run build` の dist を docs/ に置く。2026-10-27 から申請書・見積書作成の「🧾 売上伝票」から中身の入った状態で開く＝受け取り口 `src/lib/importRequest.js`） | `taiyo-tokutei-app`・`taiyo-jutaku-mitsumori-app` の「🧾 売上伝票」 |
| 消耗品売上管理 | …/taiyo-uriage-bunseki/ | `taiyo-uriage-bunseki`（main） | `taiyo-uriage-bunseki-app` |
| 受注残・進捗管理 | …/solar-silver-progress-app/ | `solar-silver-progress-app`（**main が本番**。作業はブランチ、2026-10 は `claude/taiyo-link-dedupe`） | `taiyo-progress-app`（そのリポジトリの作業のブランチ） |
| 居宅カレンダー | …/taiyo-calendar/ | `taiyo-calendar` | — |
| 営業月報 | …/taiyo-eigyo-geppou/ | `taiyo-eigyo-geppou` | — |
| チラシ作成（レンタル） | …/taiyo-chirashi/ | `taiyo-chirashi`（ケアマネジャー様向け） | — |
| チラシ作成（消耗品） | …/taiyo-shohin-chirashi/ | `taiyo-shohin-chirashi`（main） | `taiyo-shohin-chirashi-app` |
| 価格改定・休暇案内作成ツール | …/taiyo-kakaku-kyuka/ | `taiyo-kakaku-kyuka` | — |
| 書類送付状作成 | ポータルの `soufujo/` | `taiyo-portal` そのもの（`soufujo/index.html` を直接コミット。ビルド・version.json なし） | — |
| FAX送付状作成 | …/-/fax.html | `-` のブランチ `claude/fax-cover-sheet-app`（push すると deploy-fax.yml がビルドして gh-pages を置きかえる） | — |
| 福祉用具ユーザー辞書 | …/fukushi-jisho/ | `fukushi-jisho` | — |
| 申請書・見積書作成（住宅改修と特定福祉用具を1つのタイルに。2026-10-22） | ポータルの `jutaku-mitsumori/`（請求書のタブは `sasaoka/`。同じアプリの2つのビルド）。特定福祉用具は様邸の画面の「🛁 特定福祉用具申請書」のタブの中に `tokutei/` を iframe で出す | 住宅改修：`-` のブランチ `claude/sasaoka-shikiri-app`／特定福祉用具：`-` のブランチ `claude/care-insurance-auto-transfer-3z0c9n` | `taiyo-jutaku-mitsumori-app`・`taiyo-tokutei-app` |

- リポジトリはどれも `akamar08taiyo-bot/<名前>`。URL は `https://akamar08taiyo-bot.github.io/<リポジトリ名>/`。**どれも public**（GitHub Pages のため）。ユーザーのデータを入れないのはこのため。
- リポジトリ `-` は1つで複数のアプリ：main は健康管理アプリ（index.html）と住宅ローン（mortgage.html。`.github/workflows/deploy.yml`）、FAX送付状はブランチ `claude/fax-cover-sheet-app`（/-/ を開いても FAX）、住宅改修・特定福祉用具もブランチごと。
  **作業する前にブランチを確かめる。** main の deploy.yml（Actions で Pages に出す）と gh-pages の公開がぶつかる恐れがある（確かめていない）。`cd -` は「前のフォルダに戻る」になるので、必ず `/home/user/-` と書く。
- 名前の取り違えに注意：「見積・提案書作成」（taiyo-mitsumori）と、チラシ作成（消耗品）の quote.html の画面の見出し「見積・提案書作成」と、「申請書・見積書作成」（前の「住宅改修 見積書作成」＋「特定福祉用具 購入申請書・見積もり作成」）は別のもの。チラシ作成は（レンタル）と（消耗品）で別のリポジトリ。
- タイルの名前を変える・まとめるときは、ポータルの `RENAMED`（前の名前 → 新しい名前）に足す。並び順・非表示はタイルの名前で覚えているので、足さないと並べた位置が末尾にずれる。

## ポータルの仕組み（`taiyo-portal/index.html` の1ファイル）

- 最初に営業所を選ぶ画面（アクセス制限ではない）。選んだ営業所は localStorage `taiyo_portal_session`＝`{office, selectedAt}`。見積・提案書作成・消耗品売上管理・住宅改修・特定福祉用具は、これを読んで営業所を最初に選んでおく（同じサイトなので読める）。
  チラシ作成（消耗品）は自分のキー（`tss_office_v1`）、書類送付状は読まない。
- タイルは `var APPS = [ … ]` の1件ずつ：`{ name, desc, icon（ICONS のキー）, color（'c-…'）, url（ポータルのフォルダなら相対 'tokutei/index.html'、ほかは絶対 URL）, ready（true＝利用可能・false＝準備中）, usage（「使い方を見る」に出す文の配列） }`。タイルは新しいタブで開く。
- 利用者は並べ替え・非表示ができる（localStorage `taiyo_portal_tile_order`・`taiyo_portal_hidden_apps`。**タイルの name で覚えている**ので、name を変えると、その人の並び・非表示の設定がそのタイルだけ外れて末尾に来る）。
  並べ替えたことのある人には、新しいタイルは末尾に出る（ない人には APPS の順）。
- 全部のアプリが同じサイト（akamar08taiyo-bot.github.io）なので、localStorage・IndexedDB を共有する（受け渡しに使える。キーにはアプリごとの接頭辞を付ける。容量も分け合う）。
- ポータルのフォルダに置くアプリ（住宅改修・特定福祉用具）は `index.html`（1ファイルにビルドしたもの）と `version.json`（ビルドした時刻）を置く。アプリは `version.json` を見て新しい版を「⟳ 読み込み直す」で知らせる。

## アプリ間の受け渡し（同じサイトの localStorage・postMessage。形を変えるときは読む側・書く側の両方を直す）

| 何を | 書く側 → 読む側 | 中身 |
|---|---|---|
| `taiyo-tokutei-from-jutaku-v1`（localStorage） | 住宅改修（`tokuteiLink.ts` の `writeTokutei`）→ 特定福祉用具（`jutaku.ts` の `readJutaku`・`applyJutaku`） | `{job, fields}`：お客様の情報・保険者・負担割合・居宅・ケアマネ・介護保険証の値・生活保護・担当（2026-10-26） |
| `taiyo-tokutei-to-jutaku`（postMessage、中の枠 → 親） | 特定福祉用具（`App.tsx`・`jutakuChanges`）→ 住宅改修（`App.tsx`・`readFromTokutei`・`withTokuteiFields`） | `{type, job, fields}`：特定福祉用具で直したお客様の情報・担当（⇔。2026-10-26）。送った値は特定福祉用具の `jutakuSync` にもする |
| `taiyo-tokutei-catalog`（postMessage、親 → 中の枠） | 住宅改修（`TokuteiEditor.tsx`）→ 特定福祉用具（`App.tsx` → `SaleEditor` の `catalogAsk`） | `{type, action: 'show'｜'print'}`：様邸の画面の左の「📖 カタログを表示」「🖨 カタログを印刷」 |
| `window.__taiyoTokuteiFlush`・`__taiyoTokuteiFiles` | 特定福祉用具が置く → 住宅改修が呼ぶ | 枠を消す前に保存を待つ・まとめて保存の Excel を作る |
| `taiyo-tokutei-sales-v1`（localStorage） | 特定福祉用具（`salesSummary.ts`）→ 住宅改修の売上見込み・一覧の名前（`linked`）・受注残（taiyo-link） | `{v, updatedAt, rows, linked}`：案件ごとの金額（税抜）・月（納品日など）・担当・居宅・営業所 |
| `taiyo-jutaku-sales-v1`（localStorage） | 住宅改修（`salesPlan.ts`）→ 受注残（taiyo-link） | `{v, updatedAt, rows, tokuteiMonths}`：見積書のある様邸ごとの金額・売上月・担当・居宅・営業所、このアプリで月を変えた特定福祉用具の案件の月 |
| `taiyo-hacchu-import-v1`・`taiyo-hacchu-import-queue-v1`（localStorage） | 住宅改修の発注書・特定福祉用具 → 販売受注簿作成ツール | kind で分ける。**受け取る側を先に公開**（知らない kind は黙って消す） |
| `taiyo-hacchu-scanned`・`taiyo-scan-image`（postMessage） | 販売受注簿作成ツールの `?embed=scan` ⇔ 特定福祉用具の「📷 スクショから自動認識」 | 読み取った商品・貼り付けた画像 |

- 受け渡しは**同じ端末・同じブラウザ**のあいだだけ（localStorage はその端末にしかない）。受注残（Firestore）は営業所の全員で同じデータだが、「申請書・見積書作成から届いています」は見積書を作った端末で開いたときに出る。
- 送るのは画面に出す値だけ（仕切・利益は入れない）。受け取る側は知らない項目を無視する作りにして、読む側を先に公開する。

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
clone が1つのブランチだけを取ってくる設定（`remote.origin.fetch` が main だけ）のことがある。作業のブランチを push しても `origin/<ブランチ>` ができず、終わりの確かめ（stop hook）が
「push していない・リモートのブランチがない」と言う → `git fetch origin <ブランチ>:refs/remotes/origin/<ブランチ>`（push 済みかは `git ls-remote origin <ブランチ>`）。
GitHub Pages のデプロイは `gh run list --repo akamar08taiyo-bot/<名前> --limit 3 --json headSha,status,conclusion,name` でも見られる（2026-10-26 は gh で見た）。
スクラッチパッド（/tmp）は次のセッションに残らない。くり返し使う検証のスクリプトはスキルの `scripts/` に入れる。

## 「← 業務アプリポータルへ戻る」ボタン（全アプリ共通。2026-10-28）

ユーザーの指示「太陽ポータルに戻るボタンは左上に設置。太陽ポータル全アプリ共通にする。色や大きさも含めて統一する」。どのアプリも同じ形・同じ所に置く：

- 中身：`<a href="https://akamar08taiyo-bot.github.io/taiyo-portal/" class="taiyo-portal-back">← 業務アプリポータルへ戻る</a>`（React は className）。字・行き先はどのアプリも同じ（ポータルの中のアプリも絶対 URL）。
- 置き場所：画面のいちばん上の段の左（題名・ロゴより左）。左の帯（サイドバー）のあるアプリ（消耗品売上管理・居宅カレンダー・営業月報）は広い画面では帯のいちばん上、スマホでは見出しの上の1行。
  1つの画面に1つだけ（狭い画面用と広い画面用で2つ置くときは、片方を必ず隠す）。印刷には出さない。
- 書式（アプリの書式に負けないよう !important。アプリの CSS か最初の <style> に入れる）。測ると 201×34px・白い地・字は #334155・500 13px：

```css
/* 業務アプリポータルへ戻るボタン（太陽ポータルの全アプリ共通。色・大きさ・字はどのアプリでも同じにするため、アプリの書式に負けないよう !important。
   ユーザーの指示「太陽ポータルに戻るボタンは左上に設置。太陽ポータル全アプリ共通にする。色や大きさも含めて統一する」2026-10-28。決まりは taiyo-portal スキル） */
.taiyo-portal-back{display:inline-flex!important;align-items:center!important;gap:4px;box-sizing:border-box!important;height:34px!important;margin:0;padding:0 12px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#334155!important;font:500 13px/1 "Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI","Yu Gothic","Meiryo",sans-serif!important;letter-spacing:0!important;text-decoration:none!important;white-space:nowrap!important;flex:none!important;box-shadow:0 1px 2px rgba(15,23,42,.08)!important}
.taiyo-portal-back:hover{background:#f1f5f9!important;color:#0f172a!important}
.taiyo-portal-back:focus-visible{outline:2px solid #64748b!important;outline-offset:2px}
@media print{.taiyo-portal-back{display:none!important}}
```

- 2026-10-28 に入れたアプリ（コミット）：見積・提案書作成・福祉用具相談報告書・消耗品売上管理・受注残・進捗管理・営業月報・販売受注簿作成ツール・売上伝票発行依頼書・
  チラシ作成（レンタル）（dc-src を直して build-flyer）・チラシ作成（消耗品）（メインメニュー）・価格改定・休暇案内・福祉用具ユーザー辞書（site/）・書類送付状（ポータルの soufujo/）・FAX送付状（fax ブランチ）・
  申請書・見積書作成（住宅改修・特定福祉用具。特定福祉用具は住宅改修のタブの中では出さない）。居宅カレンダーはソースだけ（ブランチ claude/portal-back-left。ビルドに SheetJS 0.20.3 の取り込みが要り、作業環境の安全確認で止められた）。
- 確かめ方：Playwright で `a.taiyo-portal-back:visible` の位置・大きさ・色を 1366px と 390px で測り、上の部分を撮って見比べる。横にはみ出さない（scrollWidth）。

## ユーザーの好み（これまでの指摘から）

ボタンの色と説明文の話は、住宅改修のアプリで言われたこと。見積・提案書作成など、ほかのアプリには今も濃い色のボタンがある → 新しく作る所はこの好みに合わせ、今ある所は頼まれたら合わせる。


- 画面に説明文を入れない（「この説明は不要」と言われて消した）。説明は README とタイルの使い方の文へ。お知らせ（トースト）も「保存しました」のように短く。
- ボタンの色は控えめに（「色付けで目がチカチカする。色付けは Excel に保存と印刷くらいにして、濃い色は要らない」）。保存＝薄い青、Excel＝薄い緑、印刷＝薄い水色、ほかは白（削除も白。消す前の確かめで守る）。
  **同じ働きのボタンは同じ色**（「同じ内容でボタンの色が違う場合は統一する」2026-10-28）。取り込む＝薄い紫、新規・追加＝薄い緑（emerald）、削除・閉じる・転記など＝白。アプリをまたいでも（住宅改修と特定福祉用具など）そろえる。
- ほかのアプリの画面の色・書体も、まとめて使うアプリにそろえる（売上伝票発行依頼書を申請書・見積書作成と同じ濃い緑・同じ書体に。2026-10-28）。
- 消す操作は確かめてから（「全部いきなり消えてしまうと結構困る」）。元に戻せるとなお良い。
- 帳票は「何を・いくつ・いくら」だけ。頼まれていない欄・説明の行を足さない。役所・メーカー・会社の様式は形を変えない（枠の大きさも）。
- 依頼の例に書き間違いがあることもある → 意図を一般のルールにして作り、報告で「こう解釈した」と書く。細かいことを何度も聞き返すより、筋の通った解釈で進めて見せる。ただし、データを消す・外に送る・本番に出すなど取り返しのつかないことは確かめる。
- 進み具合を短く知らせる（長く黙らない）。
- **会社のメールのソフトは Thunderbird**（2026-10-27 の答え。はじめは「Outlook」と答えていた）。タブレットからもメールを送る。
  添付つきのメールをワンタッチで作るときは、パソコンは .eml（`X-Unsent: 1`。Thunderbird 91 以降・Outlook とも送信前のメールで開く）、
  スマホ・タブレットは共有メニュー（`navigator.share`）。作りは売上伝票発行依頼書の `src/lib/mailDraft.js`（販売受注簿作成ツールの `src/lib/mailDraft.mjs` は写し。
  落とし穴は taiyo-hacchu-scan の Learnings.md 第42・43項）。

## 公開の記録（2026-10-22〜26）

- 5つとも公開済み：住宅改修・消耗品売上管理・チラシ作成（消耗品）（2026-10-21）、見積・提案書作成（main e742ff6）・特定福祉用具（ポータル e901963）（2026-10-22、ユーザーの「3つとも公開して」）。
  タイルの使い方の文にも5つとも Excel 保存を書いた。チラシ作成（消耗品）の見積書の金額は円単位（四捨五入）・特定福祉用具の印刷は入りきらなければ縮めて1枚、も同じ日に公開。
- 住宅改修の「改修前日付・改修後日付」（日付入り写真の日付を読む）・写真の枠に PDF・箇所を足すと長さへ・フリガナはカタカナ・保存／Excel／印刷のボタンをまん中、も公開した
  （2026-10-22。ポータル 7f3bd4b＝`claude/sasaoka-shikiri-app` の 4b79070 のビルド）。同じブランチの矢崎化工の価格表の取り込み（2f95be2。別のセッション）は、まだ公開していない。
- 2026-10-22（夕方）：住宅改修と特定福祉用具のタイルを「申請書・見積書作成」の1つにまとめた（ポータル 1a47b1a。ほかのタイルの使い方の文に残っていた
  前の名前の直しが 466cd3f。どちらもデプロイの成功を確かめた）。その前に
  特定福祉用具 e489b63（`claude/care-insurance-auto-transfer-3z0c9n` の fdd825d：申請書・入力の連動・タブの中で開く受け取り）、
  住宅改修 81a89da（`claude/sasaoka-shikiri-app` の 2326b64：4つのタブ・🛁 特定福祉用具申請書のタブ・題名「申請書・見積書作成」・理由書）を公開。
  タイルは住宅改修の4つのタブの版が出てから入れる順にした（先にまとめると特定福祉用具に行けなくなるため）。2つのセッションで相談して、
  住宅改修の公開は住宅改修のセッション、tokutei/ とタイル（index.html）は特定福祉用具のセッションが受け持った。
- 2026-10-26（1つのセッションが住宅改修・特定福祉用具・受注残をまとめて受け持った）：ポータル bfc14bf → c41bfbf → df33fa3（住宅改修 9b1d6aa・特定福祉用具 1d2f772 のビルド。
  一覧の売上月・担当 ⇔・カタログの窓・申請書の印刷など）と、受注残 main 3ba7cdf（重ねて入れない・担当の名前でつなぐ・売上月）。
  そのあと、ポータル 54832f5（住宅改修 3c7fd22・特定福祉用具 b05b3ef のビルド。売上月は請求する月と同じが基本・理由の文例を当たり障りのない文に）と、受注残 main a0e68b5（姓でつなぐ）。どれもデプロイの成功を確かめた。
- 2026-10-27：売上伝票発行依頼書 master 3982633（申請書・見積書作成から開く口・生活保護・3割の1円ずれ。受け取る側なので先に）→ ポータル c9c2be7（住宅改修 918a6cb・特定福祉用具 5d0d4b6 のビルド。🧾 売上伝票・負担割合は未選択から。タイルの文も）。
  その前に別のセッションがポータル d447d77（住宅改修 3a4b039＝様邸の上の段を大きく・保存／Excel／印刷を上のタブのまん中に）を公開していた。
  そのあとの住宅改修 3c7fd22（売上月は請求する月と同じが基本）・受注残 49efb60（すき間のない名前を姓で）は、まだ公開していない。
  **いま公開している版は、スキルの記録ではなく git で確かめる**（ポータルの `git log -- <フォルダ>` のコミット文に「アプリの … のビルド」とビルドしたコミットを書いている。別リポジトリのアプリは公開するブランチの `git log`）。
- 2026-10-22（夜）：特定福祉用具の「📤 販売受注簿に転記」を公開（ユーザーの答え「公開する」）。受け取る側を先に：販売受注簿作成ツール
  `taiyo-hacchu-scan` の master 025f5ee（ブランチ `claude/care-insurance-auto-transfer-3z0c9n` の dca8321 のビルドを docs/ に）→ デプロイの成功を見てから
  ポータル 55ad813（特定福祉用具 e901714 のビルド・タイル「申請書・見積書作成」と「販売受注簿作成ツール」の使い方の文。住宅改修のセッションに頼まれた
  「🪪 介護保険証から入れる」の1行も）。この日は Pages のデプロイが混んでいて、build は数十秒で終わっても deploy の段が10分ほど待たされた
  （`list_workflow_jobs` で deploy の job の「Deploy to GitHub Pages」の成功を見れば、run 全体が in_progress のままでも公開は済んでいる）。
- **同じアプリのブランチで、ほかのセッションも作業していることがある。** 公開の前に `git fetch` して、自分の知らないコミットがあれば中身を見る。
  ユーザーが「公開して」と言ったのが自分の直しだけなら、自分のコミットまでの版をビルドして公開し（ほかのセッションの直しは、そのセッションの「公開して」で）、報告でそのことを書く。
- スキル（`.claude/skills`）は、見積・提案書作成とチラシ作成（消耗品）は main に入った。消耗品売上管理は `claude/skills` のブランチ（main は本番なので、公開のときに入れる）。
  住宅改修・特定福祉用具はそれぞれの作業用のブランチ。どのリポジトリの写しも、次にそのアプリを公開するときに新しい版にそろえる。

## 報告のしかた

日本語・やさしい言葉で、①できたこと ②使い方（番号付き） ③確かめてほしいこと（解釈したところ・ユーザーのデータに要るもの） ④テストと公開の結果。
見た目を変えたら、スクリーンショット（パソコンとスマホ）を送る。Excel・帳票は、架空のデータの見本と印刷と並べた画像を送り、会社の Excel・プリンターで一度見てもらう。
まだ返事をもらっていない質問は、最後に短く並べる。
まとまった作業が終わったら、そのセッションで分かったこと（決めたこと・ユーザーの答え・作り・確かめ方・落とし穴・公開の状態）を各アプリのスキルとこのスキルに書き足す
（ユーザーの指示「完成したらセッションの内容全てスキル化もしくは、スキルに加えてください」2026-10-26。スキルのないアプリは新しく作る。スキルは作業のブランチに入れ、本番のブランチには公開のときに）。

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
