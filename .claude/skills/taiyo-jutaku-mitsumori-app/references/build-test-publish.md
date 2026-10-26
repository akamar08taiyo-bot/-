# テスト・ビルド・公開・デプロイの確かめ方

## 目次
1. 作業場所とブランチ
2. テスト（単体・型・ブラウザ）
3. ビルドと公開（taiyo-portal）
4. デプロイの確かめ方
5. コミット・push の決まり
6. Playwright で確かめるときのこつ

## 1. 作業場所とブランチ

- 見積書・請求書アプリ：`akamar08taiyo-bot/-`、**ブランチ `claude/sasaoka-shikiri-app`**（既定は main だが、このアプリはこのブランチにある）。
- 公開先：`akamar08taiyo-bot/taiyo-portal`（master、GitHub Pages）。
- 販売受注簿作成ツール：`akamar08taiyo-bot/taiyo-hacchu-scan`（master、公開は `docs/`）。
- クラウドの作業環境では、ほかのリポジトリは `add_repo` で足してから clone する（`/home/user/<名前>`）。
- 作業を始める前に `git fetch` して、ほかのセッションが先に push していないか見る（実際にあった）。

## 2. テスト

```sh
cd /home/user/-
npm run -s test:sasaoka   # 単体テスト（node --test "test/sasaoka/*.test.ts"。TypeScript をそのまま動かす）
npm run -s lint           # 型チェック（tsc --noEmit。テストのファイルも含む）
```

単体テストの主なもの：`calc.test.ts`（仕切り・請求書・見積の計算）、`estimateForms.test.ts`（見積書の行・備考・保険者）、`sheetEdit.test.ts`（欄への打ち込み・行の挿入・削除・コピー・貼り付け）、
`order.test.ts`（発注書の本数・2000mm の品・直したところ・販売受注簿へ渡す内容）、`storage.test.ts`（前のデータの読み込み・移し替え）、`estimateXlsx.test.ts`（Excel の中身と式）、
`shinsei.test.ts`（申請書の転記・丸の位置・読み戻し・平面図の工事内容・写真貼付用紙の写真・回した写真の置き場所・写真に書く内容の分け方とテキストボックス）、`shinseiPreview.test.ts`（申請書のプレビュー：シート・平面図・写真貼付用紙の枠・押せる欄・丸の値・表示形式、改修予定費用＝見積書の金額、`startEstimate`）、
`sync.test.ts`、`priceImport.test.ts`、`rows.test.ts`、`photos.test.ts`（写真の撮影日＝Exif の読み取り）、`stampDate.test.ts`（写っている日付の文字から日付・字の行の切り出し）、
`hokensho.test.ts`・`cardApply.test.ts`（介護保険証の読んだ文字から項目・様邸に入れる値とはじめのチェック）、`careSoft.test.ts`（介護ソフトの画面の読んだ文字から項目。架空の画面 `careSoftFixture.mjs` の値だけ）、
`fit.test.ts`（字の幅・折り返し・欄に入る大きさ）、`ocrEngine.test.ts`（読み取りの部品の失敗・時間切れ）。
写っている日付を読む部品（tesseract.js）はブラウザのテストで動く。`e2e-shinsei.mjs` は jsDelivr への取り寄せを `routeOcr` で手元の node_modules（`tesseract.js/dist`・`tesseract.js-core`・
devDependencies の `@tesseract.js-data/jpn`）から返す（ネットにつながない。worker の中の取り寄せも context.route で返せる）。部品が日本語のデータを読むときに出す「Warning: Parameter not found: …」の
console.error はアプリの誤りではないので数えない（`appError`）。

ブラウザのテスト（Playwright。リポジトリの依存には入れていない。場所は環境変数 `PLAYWRIGHT`、既定 `/opt/node-tools/node_modules/playwright/index.mjs`）：

| ファイル | URL | 何を確かめるか |
|---|---|---|
| `e2e.mjs` | `<サイト>/sasaoka/index.html` | 仕切り：取り込み→様邸→印刷→保存 |
| `e2e-settings.mjs` | `<サイト>/sasaoka/index.html` | 設定・CSV・所長と担当・バックアップ・狭い画面・新しい版の知らせ |
| `e2e-sheet.mjs` | `<サイト>` | 見積書の欄に打ち込む：文言・ボタンがないこと・Ctrl+Z（部材リストから入れたものも）・白紙に戻す（確かめる・やめる・戻す）・打ち込み・候補・行の挿入✕コピー→貼付（空白の行は F2・ダブルクリックでも空から）・Ctrl+C／X／V・改修場所の候補・保険者・広域連合用・請求書とのつながり・1行目のあとの Ctrl+Z は1回で戻る・諸経費を F2→Enter しても自動のまま |
| `e2e-estimate.mjs` | `<サイト>` | 見積書：一覧（改修場所・保険者・担当なし・先頭のチェックで次月・前月に回す・行ごとの売上月の ◀ ▶＝請求する月・受注残に渡す月も移る・作成日はそのまま）・見積書の上の売上月（請求する月と一緒に変わる・まれにちがう月＝薄い黄色・受注残に渡す月）・切って使う部材・保存（Ctrl+S）・Excel・印刷・複製・削除・部材＋施工費（常用） |
| `e2e-sync.mjs` | `<サイト>` | 2つのアプリを同時に開いて直しても、どちらの変更も消えない |
| `e2e-bracket.mjs` | `<サイト>` | 中間のブラケット：マツ六の BD-134・BD-01G を CSV で部材リストに取り込む（架空の価格）→ 申請書の長さ L=600×1800 → 見積書で BD-134 を選ぶと 0.6本・すぐ下に BD-01G 1個（部材リストの単価）→ 申請書の長さ 2400 で2個・900 で外れる・600×1800 で1個 → 発注書に BD-01G 1個 |
| `e2e-order.mjs` | `<サイト>` | 発注書：本数の計算・直す・消す・戻す・足す・印刷・数が 0 の行に No. を付けない（印刷と同じ番号）・販売受注簿に転記・スマホの幅 |
| `e2e-shinsei.mjs` | `<サイト>` | 申請書：様邸の画面のタブ（📝 住宅改修申請書・🛁 特定福祉用具申請書・📋 工事見積書・📄 理由書）・左に一覧、右にプレビュー（Enter で次の欄・プレビューの欄を押すと一覧のその欄・丸・式の欄も押せる・寸法・着工予定日は空白・番号は0で埋める・様式・平面図の工事内容・写真貼付用紙・ヘッダー）・入口（申請書から作るなし・請求先なし）・見積書とすぐつながる（改修予定費用＝見積書の合計・氏名）・写真（📷 写真を選ぶ・枠にドロップ・押して入れ替え・ドラッグで入れ替え・削除・差し替え・プレビューの枠にドロップ・Excel の写真貼付用紙に貼る・読み直し・古い写真を消す）・写真に書く内容（改修前だけ・自動の文・追加・縦の写真は右に・横の写真は上に・改修後は枠いっぱい・Excel のテキストボックス）・写真番号の入れ替え（▶ ◀・見出しや写真の上をつかんでドラッグ。改修の内容・見積書の順番も）・写真の向き・大きさ（写真の欄の ↻・プレビューの角のつまみ・上の丸で回す・↺ ↻・元に戻す・枠より大きくしない・Excel の rot と大きさ・読み直し）・iPad（指でドラッグ・写真の上は押したままにしてから・すぐに動かすとスクロール・2本の指でひねる／つまむ）・申請書に書く内容を手で直す（↺ で自動の文に戻す）・4つの保険者の原本に転記（欄・式の答え・丸の数・広域連合は最初の用紙だけに写真・広域連合の〒と住所の2行・苅田町の写真の用紙の□の連動と撮影日（当日・手で直す・Exif の撮影日時の入った JPEG）・広域連合の写真貼付用紙の縦書き）・一覧で入れる（覚えておく）・Excel から見積書・新規作成（フリガナが開いている・Enter で順番に・見積書に行を入れると請求書・発注書）・申請書だけ（「申請書だけ」・請求書のチェックと発注書なし・一覧から申請書のタブ）・スマホの幅（入れる所は画面の下）・工事場所の住所と違う保険者の知らせ（申請書のタブでも）・寸法などを入れた箇所の一覧の ✕ は確かめてから消す |
| `e2e-riyu.mjs` | `<サイト>` | 理由書：タブ・2ページのプレビュー・入っていない欄（薄い黄色。上の一覧は出さない）・申請書と同じ欄の連動・④改修項目は見積書の箇所から・Excel で保存（1シート2ページ）・読み直し・スマホの幅 |
| `e2e-card.mjs` | `<サイト>` | 介護保険証から入れる（入口の名前は「🪪 介護保険証・介護ソフトの画面」「…から新規作成」）：架空の保険証（`cardFixture.mjs`。白黒・ざらつき・横向き）と負担割合証の画像2枚を選ぶ → 確かめる画面（番号・生年月日・性別・〒・住所・要介護・有効期間・保険者・負担割合が読める・直すとチェック・今の値）→ 申請書・理由書・見積書・特定福祉用具の受け渡しに出る。PDF を入口にドロップして新規作成（保険者も保険証から・生年月日は読めたか確かめてもらう）。ボタンは4つのタブのどれでもタブのすぐ右（同じ位置）。画面をクリックしてから Ctrl+V で貼り付けても読む（字を打つ欄では読まない）。居宅介護支援事業者は2件で、届出年月日の新しい方（見本ケアプランセンター）が理由書に入る。読み取りの部品は node_modules から（1回 20 秒ほど）。**架空の保険証は BIZ UD明朝で描くので、その字体があるかどうかで読み方が変わる**（このセッションの環境は `~/.fonts` に BIZ UD がある。ないと代わりの字体で描かれ、届出年月日の「1」が欠けるなど）。保険証の読み取りを直したら、`HOME=<空のフォルダ>` を付けて BIZ UD なしでも動かす（`HOME=/tmp/nohome PORT=5193 node serve.mjs …`） |
| `e2e-tokutei.mjs` | `<サイト>` | 特定福祉用具申請書のタブ：4つのタブの順番・URL の view=tokutei・localStorage の受け渡し（項目の名前と値）・中の枠は画面の下まで。`<サイト>/tokutei/` に特定福祉用具のビルドを置くと、中のアプリに案件ができてお客様の情報が入る・題名の段を出さない・特定福祉用具で直した値は残り住宅改修で直した値は入れ直す・直してすぐタブを替えても消えない（`flushTokutei`）・読み直し・案件は1つ・スマホの幅・🛁 のタブを開いた新しい様邸は空でも消さない・⇔（特定福祉用具で直した電話が住宅改修申請書に）・まとめて保存（白紙の申請書は選べない）・一覧に特定福祉用具だけの様邸の名前と「申請書だけ」・担当 ⇔（特定福祉用具で選ぶ → 工事見積書の担当 → 直すと特定福祉用具にも）・一覧の売上月（特定福祉用具だけの様邸は案件の月・▶ で tokuteiMonths）・2000px の画面で 🪪 の枠の下の「📖 カタログを表示」「🖨 カタログを印刷」（住宅改修申請書・販売見積書・工事見積書のタブから押して、中にカタログの窓・印刷の画面） |
| `e2e-caresoft.mjs` | `<サイト>` | 介護ソフトの画面から入れる：架空の介護ソフトのお客様の欄（`careSoftFixture.mjs`。見本・0000 の値だけ）を描いた PNG を、申請書のタブで Ctrl+V（ファイルの入った貼り付け）→ 確かめる画面 → 申請書・理由書・見積書・特定福祉用具の受け渡し。入口の「…から新規作成」の枠にドロップ（生保・苅田町・携帯だけ・担当の候補にない営業）→ 新しい様邸（保険者も画面から・生活保護）。入口の枠と写真の枠：ファイルを持ってくると薄い緑・重ねると「ここに離す」・空いた枠にドロップ・枠を選んで Ctrl+V（差し替え）。1366px とスマホの幅。読み取りの部品は node_modules から（e2e-card.mjs と同じ） |
| `e2e-trash.mjs` | `<サイト>` | ゴミ箱：行の削除（やめる・Ctrl+Z）・もう1つのアプリにすぐ出る・チェックして「削除する」・探す／件数／請求書に出ない・読み直し・写真は完全に削除まで残る・元に戻す・完全に削除（1件ずつ・まとめて）・見積書／請求書の画面から削除・スマホの幅（タブ3段） |
| `e2e-data.mjs` | `<サイト>` | 保存と取り込み：IndexedDB に書けないときは「保存しました」にせず警告、書けるようになったら保存／この版の知らない項目（新しい版が足した項目）は、この版のタブで直して保存しても消さない／仕切り表の取り込みで「別のファイルにする」と推測したメーカー名は推測し直す（手で打った名前はそのまま） |

サイトは太陽ポータルと同じ形にする（`<サイト>/sasaoka/`・`<サイト>/jutaku-mitsumori/`、特定福祉用具申請書のタブの中まで通すなら `<サイト>/tokutei/` に特定福祉用具のビルド（ブランチ `claude/care-insurance-auto-transfer-3z0c9n` の `npm run -s build:tokutei` → `dist-tokutei/`）、販売受注簿まで通すなら `<サイト>/taiyo-hacchu-scan/` に taiyo-hacchu-scan の `docs/` か `dist/`）。
全部（15本）は `scripts/run-e2e.sh`（下）。`e2e-shinsei.mjs` は 2026-10-26 から、上の段のボタンの並び（📗 申請書をExcelで保存・📦 まとめて保存・🖨 申請書を印刷・右に 📄 白紙に戻す）・申請書の印刷（PDF が1枚→チェックで2枚）・白紙に戻す（確かめる・Ctrl+Z）も見る。
常駐のサーバーは作業環境の時間制限（2時間）で止められるので、テストのあいだだけ立てる `scripts/serve.mjs` を使う（番号は環境変数 `PORT`、初めは 5190）：

```sh
SITE=<スクラッチ>/site
mkdir -p $SITE/sasaoka $SITE/jutaku-mitsumori
cp dist-sasaoka/index.html dist-sasaoka/version.json $SITE/sasaoka/
cp dist-jutaku/index.html dist-jutaku/version.json $SITE/jutaku-mitsumori/
node <スキル>/scripts/serve.mjs $SITE node test/sasaoka/e2e-sheet.mjs http://localhost:5190 <出力フォルダ>
node <スキル>/scripts/serve.mjs $SITE sh <スキル>/scripts/run-e2e.sh <出力フォルダ>   # 15本全部（25分ほど。run_in_background で）。終わりに FAIL があれば終わりのコードが 1
# 特定福祉用具申請書のタブの中・カタログ・⇔ まで通すときは、特定福祉用具のブランチを build:tokutei して dist-tokutei/ を丸ごと（catalog/ も）$SITE/tokutei/ に写す
# card・caresoft は、特定福祉用具申請書のタブの中のアプリ（<サイト>/tokutei/）がないと 404 で落ちる。ポータルの tokutei/ を写しておく。
# いくつかの作業を同時に動かすときは、PORT=5191 などで分け、サイトのフォルダもそれぞれにする（同じフォルダのビルドを上書きし合った。2026-10-23）
```

## 3. ビルドと公開（taiyo-portal）

**ポータルへの push は本番の公開。ユーザーが「公開して」と言ってから。** 作業環境の安全確認（Production Deploy）で止められたら、回り道をせずユーザーに聞く（2026-10-21：「公開して」のあとは通った）。

```sh
cd /home/user/-
npm run -s build:sasaoka   # dist-sasaoka/index.html（1ファイル・約3MB）と version.json
npm run -s build:jutaku    # dist-jutaku/index.html と version.json
git checkout -- package-lock.json   # ビルドで書きかわる。依存を変えていなければ戻す
cp dist-sasaoka/index.html dist-sasaoka/version.json /home/user/taiyo-portal/sasaoka/
cp dist-jutaku/index.html dist-jutaku/version.json /home/user/taiyo-portal/jutaku-mitsumori/
```

`scripts/build-to-portal.sh` がこの5行をまとめて行う。そのあと：
- タイルの使い方の文（`taiyo-portal/index.html` の `APPS` の `name:'住宅改修 見積書作成'`。「仕切り計算・請求書作成」のタイルは今はない）を、変えた機能に合わせて直す。
  直したら `<script>` が壊れていないか確かめる：`node -e "const h=require('fs').readFileSync('index.html','utf8');for(const m of h.match(/<script>([\s\S]*?)<\/script>/g)||[])new Function(m.replace(/<\/?script>/g,''))"`
- README（`/home/user/-/README.md` の「住宅改修 見積書・請求書（笹岡工務店）」の節）も直す。
- 先にアプリのリポジトリを commit・push し、それから taiyo-portal を commit・push。

## 4. デプロイの確かめ方

github.io はこの作業環境から見えない（403）。GitHub MCP で確かめる：
`mcp__github__actions_list`（method: list_workflow_runs、owner: akamar08taiyo-bot、repo: taiyo-portal か taiyo-hacchu-scan、perPage: 2〜3）で、
自分の push の head_sha の `pages build and deployment` が `completed`／`success` になるのを見る（ふつう1分ほど）。待つときは前景の sleep は使えないので、
`run_in_background` の sleep で待つか、`mcp__github__actions_get`（get_workflow_run）を少し間をあけて見る。

## 5. コミット・push の決まり

- コミットメッセージは日本語で「何を・なぜ」。件名・本文にモデル名は書かない。末尾には、そのセッションで指示された2行（`Co-Authored-By: …` と `Claude-Session: …`）を指示どおりそのまま付ける。
- `git push -u origin <ブランチ>`。ネットワークの失敗だけ、2・4・8・16秒あけて4回までやり直す。
- 断られたら（ほかのセッションが先に push）：`git fetch origin <ブランチ>` → `git log HEAD..origin/<ブランチ>` で中身を見る →
  自分のまだ push していないコミットだけなら `git rebase origin/<ブランチ>`。ぶつかった Learnings.md・CLAUDE.md は両方を残し、項の番号を付け直す。
  ビルドした成果物（`docs/assets/` のハッシュ名のファイル・`docs/index.html`）はマージせず、ソースを合わせてからビルドし直して置き換える。
- 人の書いた履歴を書きかえない（force push しない）。PR はユーザーに頼まれたときだけ。
- ユーザーのデータ（価格表の PDF・Excel、お客様の名前）はリポジトリに入れない。

## 6. Playwright で確かめるときのこつ

- 日本語のファイル名のダウンロードが「download」になる → `chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}})`。
- 行のコピー（OS の貼り付けを使う）→ `ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin})`。Ctrl+C／Ctrl+V は `page.keyboard.press('ControlOrMeta+c')` で効く。
- ポータルの営業所：`ctx.addInitScript(() => { try { localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})); } catch {} })`
  （新しいタブの about:blank では localStorage が使えないので try で包む）。
- 新しいタブで開くリンク：`const [tab] = await Promise.all([ctx.waitForEvent('page'), link.click()])`。開いた先を差し替えるなら `ctx.route('**/taiyo-hacchu-scan/**', …)`。
- 自動保存（0.4秒後）を待ってから読み直す（`waitForTimeout(1200)`）。
- 見積書の外（部材を選ぶ画面・施工費を数える画面など）で続けて変えたものは、1秒以内なら Ctrl+Z 1回にまとまる（`EstimateSheet.tsx` の `lastOutside`）。
  テストで何回 Ctrl+Z を押すかが決まらないので、片づけは行の左の✕（`{name}の行を消す`）で消す（`e2e-sheet.mjs` の「押している行に入れる」）。
- 数字の欄（`NumberInput`）は type=text なので `getByRole('spinbutton')` では見つからない → `getByLabel(…, {exact: true})`。
- 見た目を変えたら、1366px とスマホ（390×844、deviceScaleFactor 2）のスクリーンショットを撮って自分で見る。横にはみ出していないか（`document.documentElement.scrollWidth`）も見る。
  文字が欄からはみ出していないかも、プレビュー・印刷の欄を Playwright でページの中から全部調べて数える（2026-10-23 に申請書・理由書・見積書を4つの保険者とも 1366px・390px で 0 にした。
  390px の印刷の画面は縮めて見せている＝zoom なので、その倍率を戻して測る）。ユーザーの指示「文字のはみ出し…しっかり見て」。
  道具：`node test/sasaoka/stress-data.mjs /tmp/stress.json`（長い値の架空の様邸を4つの保険者ぶん）→ サイトを配信して
  `node test/sasaoka/overflow-check.mjs <サイトのURL> /tmp/stress.json <出力フォルダ> [1366|390]`。帳票ごとの件数と、はみ出した文字・箱が出る（0 件が目標。みやこ町の申請書の 1 件は、行の折り返しの全角スペースが 2px 出るだけで字は切れていない）。帳票の欄や文字の入れ方を直したら流す。
- 写真のファイル：ボタンで選ぶのは `const [chooser] = await Promise.all([page.waitForEvent('filechooser'), ボタン.click()]); await chooser.setFiles({name, mimeType, buffer})`。
  画像はブラウザの canvas で作れる（`e2e-shinsei.mjs` の `makeImage`。大きさを変えておくと、Excel の JPEG の大きさでどの写真か分かる）。
  エクスプローラーからのドロップは、ページの中で `new DataTransfer()` に `File` を入れて `dragenter`・`dragover`・`drop` の `DragEvent` を出す（`dropFile`）。
  ドロップできる所の色は `data-drop`（`ready`＝ファイルを持ってきている・`over`＝重ねている）で確かめる（Tailwind の色は oklab で返るので色の値では比べない）。
  ファイルの入った貼り付け（Ctrl+V）は、同じ `DataTransfer` を入れた `new ClipboardEvent('paste', {clipboardData, bubbles: true})` をフォーカスのある要素から出す（`e2e-caresoft.mjs`）。
  箇所のドラッグ（写真番号の入れ替え。ポインターで動かす）は `page.mouse` の down → move（steps）→ up（`e2e-shinsei.mjs` の `dragCard`）。
  `locator.dragTo` も同じくマウスで動かすので、写真の上から別の箇所へ dragTo すると写真番号の入れ替えになる（写真だけを入れ替えるのは、押して選んでから相手の枠を押す）。
- 指（iPad）の操作：`browser.newContext({hasTouch: true, …})` で `locator.tap()`。2本の指は CDP（`ctx.newCDPSession(page)` の `Input.dispatchTouchEvent`。
  `touchStart` は今ふれている指を全部、`touchEnd` は空の配列）。指で押した結果（click）は少し遅れることがあるので、そうなるまで待つ（`e2e-shinsei.mjs` の `until`）。
  勢いよく離したドラッグのすぐあとに押すと、Chromium は「止める」扱いにして click を出さない → ドラッグの終わりで少し止めてから離す（`fingerDrag`）。
  写真の上の長押し（`HOLD_MS`）は、`touchStart` のあと `waitForTimeout` してから `touchMove`。落とす先の箇所は画面のまん中にしておく（端に近いと自動でスクロールして、離した所が変わる）。
- 写真の欄の箇所は `role="group"`（「①玄関の写真」）で、その中に「①玄関 改修前の写真に書く内容」の group もある。箇所だけ数えるときは名前が「の写真」で終わるものだけ（`e2e-shinsei.mjs` の `cards`）。
  プレビューの写真に書く内容は押せない文字なので、枠のボタンの親から `getByText` で探す（`pvNote`）。回した写真は回す前の四角が紙の端より外に出るので、xfrm の位置はマイナスもある。
- 写真の IndexedDB（`taiyo-sasaoka-photos`）は `page.evaluate` で `indexedDB.open` して読める・書ける（古い写真を消すテストは `created: 0` の写真を入れて読み直す）。
- 印刷の画面は `.print-overlay`・`.print-root`。見積書は A4横、請求書・発注書は A4縦。
