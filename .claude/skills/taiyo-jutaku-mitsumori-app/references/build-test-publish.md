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
`shinsei.test.ts`（申請書の転記・丸の位置・読み戻し・平面図の工事内容・写真貼付用紙の写真）、`shinseiPreview.test.ts`（申請書のプレビュー：シート・平面図・写真貼付用紙の枠・押せる欄・丸の値・表示形式、改修予定費用＝見積書の金額、`startEstimate`）、
`sync.test.ts`、`priceImport.test.ts`、`rows.test.ts`。

ブラウザのテスト（Playwright。リポジトリの依存には入れていない。場所は環境変数 `PLAYWRIGHT`、既定 `/opt/node-tools/node_modules/playwright/index.mjs`）：

| ファイル | URL | 何を確かめるか |
|---|---|---|
| `e2e.mjs` | `<サイト>/sasaoka/index.html` | 仕切り：取り込み→様邸→印刷→保存 |
| `e2e-settings.mjs` | `<サイト>/sasaoka/index.html` | 設定・CSV・所長と担当・バックアップ・狭い画面・新しい版の知らせ |
| `e2e-sheet.mjs` | `<サイト>` | 見積書の欄に打ち込む：文言・ボタンがないこと・Ctrl+Z（部材リストから入れたものも）・白紙に戻す（確かめる・やめる・戻す）・打ち込み・候補・行の＋✕コピー→貼付・Ctrl+C／X／V・改修場所の候補・保険者・広域連合用・請求書とのつながり |
| `e2e-estimate.mjs` | `<サイト>` | 見積書：一覧（改修場所・保険者・担当なし・先頭のチェックで次月・前月に回す）・切って使う部材・保存（Ctrl+S）・Excel・印刷・複製・削除・部材＋施工費（常用） |
| `e2e-sync.mjs` | `<サイト>` | 2つのアプリを同時に開いて直しても、どちらの変更も消えない |
| `e2e-order.mjs` | `<サイト>` | 発注書：本数の計算・直す・消す・戻す・足す・印刷・販売受注簿に転記・スマホの幅 |
| `e2e-shinsei.mjs` | `<サイト>` | 申請書：様邸の画面のタブ（左📝 申請書・右📋 見積書）・左に一覧、右にプレビュー（Enter で次の欄・プレビューの欄を押すと一覧のその欄・丸・式の欄も押せる・寸法・着工予定日は空白・番号は0で埋める・様式・平面図の工事内容・写真貼付用紙・ヘッダー）・入口（申請書から作るなし・請求先なし）・見積書とすぐつながる（改修予定費用＝見積書の合計・氏名）・写真（📷 写真を選ぶ・枠にドロップ・押して入れ替え・ドラッグで入れ替え・削除・差し替え・プレビューの枠にドロップ・Excel の写真貼付用紙に貼る・読み直し・古い写真を消す）・4つの保険者の原本に転記（欄・式の答え・丸の数・広域連合は最初の用紙だけに写真）・一覧で入れる（覚えておく）・Excel から見積書・新規作成（フリガナが開いている・Enter で順番に・見積書に行を入れると請求書・発注書）・申請書だけ（「申請書だけ」・請求書のチェックと発注書なし・一覧から申請書のタブ）・スマホの幅（入れる所は画面の下） |

サイトは太陽ポータルと同じ形にする（`<サイト>/sasaoka/`・`<サイト>/jutaku-mitsumori/`、販売受注簿まで通すなら `<サイト>/taiyo-hacchu-scan/` に taiyo-hacchu-scan の `docs/` か `dist/`）。
常駐のサーバーは作業環境の時間制限（2時間）で止められるので、テストのあいだだけ立てる `scripts/serve.mjs` を使う：

```sh
SITE=<スクラッチ>/site
mkdir -p $SITE/sasaoka $SITE/jutaku-mitsumori
cp dist-sasaoka/index.html dist-sasaoka/version.json $SITE/sasaoka/
cp dist-jutaku/index.html dist-jutaku/version.json $SITE/jutaku-mitsumori/
node <スキル>/scripts/serve.mjs $SITE node test/sasaoka/e2e-sheet.mjs http://localhost:5190 <出力フォルダ>
node <スキル>/scripts/serve.mjs $SITE sh <スキル>/scripts/run-e2e.sh <出力フォルダ>   # 6つ全部
```

## 3. ビルドと公開（taiyo-portal）

```sh
cd /home/user/-
npm run -s build:sasaoka   # dist-sasaoka/index.html（1ファイル・約3MB）と version.json
npm run -s build:jutaku    # dist-jutaku/index.html と version.json
git checkout -- package-lock.json   # ビルドで書きかわる。依存を変えていなければ戻す
cp dist-sasaoka/index.html dist-sasaoka/version.json /home/user/taiyo-portal/sasaoka/
cp dist-jutaku/index.html dist-jutaku/version.json /home/user/taiyo-portal/jutaku-mitsumori/
```

`scripts/build-to-portal.sh` がこの5行をまとめて行う。そのあと：
- タイルの使い方の文（`taiyo-portal/index.html` の `APPS` の `name:'住宅改修 見積書作成'` と `name:'仕切り計算・請求書作成'`）を、変えた機能に合わせて直す。
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
- 写真のファイル：ボタンで選ぶのは `const [chooser] = await Promise.all([page.waitForEvent('filechooser'), ボタン.click()]); await chooser.setFiles({name, mimeType, buffer})`。
  画像はブラウザの canvas で作れる（`e2e-shinsei.mjs` の `makeImage`。大きさを変えておくと、Excel の JPEG の大きさでどの写真か分かる）。
  エクスプローラーからのドロップは、ページの中で `new DataTransfer()` に `File` を入れて `dragenter`・`dragover`・`drop` の `DragEvent` を出す（`dropFile`）。
  枠から枠へのドラッグ（HTML5 の draggable）は `locator.dragTo(相手)` で効く（Chromium）。
- 写真の IndexedDB（`taiyo-sasaoka-photos`）は `page.evaluate` で `indexedDB.open` して読める・書ける（古い写真を消すテストは `created: 0` の写真を入れて読み直す）。
- 印刷の画面は `.print-overlay`・`.print-root`。見積書は A4横、請求書・発注書は A4縦。
