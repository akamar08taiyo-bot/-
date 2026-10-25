# テスト・ビルド・公開（特定福祉用具）

## 1. 作業の場所

コードは `akamar08taiyo-bot/-` のブランチ `claude/care-insurance-auto-transfer-3z0c9n`。同じリポジトリのほかのブランチ（住宅改修 `claude/sasaoka-shikiri-app`、main の健康管理アプリ）と混ぜない。
今のチェックアウトが別のブランチなら、worktree で別のフォルダに出す（2026-10 は `/home/user/tokutei-wt`）：

```sh
cd /home/user/-     # リポジトリ「-」（cd - と書くと前のフォルダに戻ってしまう）
# 浅い clone・1つのブランチだけの clone でも使えるように、取ってくる先を名前で指定する
git fetch origin claude/care-insurance-auto-transfer-3z0c9n:refs/remotes/origin/claude/care-insurance-auto-transfer-3z0c9n
git worktree add /home/user/tokutei-wt claude/care-insurance-auto-transfer-3z0c9n 2>/dev/null \
  || git worktree add -b claude/care-insurance-auto-transfer-3z0c9n /home/user/tokutei-wt origin/claude/care-insurance-auto-transfer-3z0c9n
cd /home/user/tokutei-wt && npm ci --no-audit --no-fund
```

作業の前に `git fetch` して、ほかのセッションが先に push していないか見る。コミット・push の前に `git branch --show-current` を見る。

## 2. テスト

```sh
npm run -s test:tokutei   # 単体テスト（node --test "test/tokutei/*.test.ts"。TypeScript をそのまま動かすので Node 22.18 以上）。2026-10 で 31件
npm run -s lint           # 型チェック（tsc --noEmit）
npm run -s build:tokutei  # dist-tokutei/index.html（1ファイル、約2.8MB）と version.json
PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.mjs timeout 600 node test/tokutei/e2e.mjs <出力フォルダ>
```

- `e2e.mjs` はビルドのあとに動かす。中で 5191番（環境変数 `E2E_PORT` で替えられる）の小さなサーバーを立てて `/tokutei/` を開く。Playwright はリポジトリの依存に入れていないので、場所は環境変数 `PLAYWRIGHT`（既定は `/opt/node22/lib/node_modules/playwright/index.mjs`。無ければ上のように指定）。
  流れ：取り込み → ★ → 見積もり（42,944円・4,295円・38,649円）→ 申請書（行橋市の Excel・プレビュー。広域連合に替えて受領委任払用・償還払い用・Excel・390px）→ 印刷 → Excel の保存（ファイル名と値）→ 読み直し → 390px で横にはみ出さない。PDF のページ数は `pdfinfo` で見る。
- 見た目を変えたら、パソコンとスマホ（390px）のスクリーンショットを撮って自分の目で見る。
- 販売受注簿への転記：受注簿ツール（`akamar08taiyo-bot/taiyo-hacchu-scan`、`/home/user/taiyo-hacchu-scan`）を `npm ci && npm run build` してから
  `node test/tokutei/e2e-hacchu.mjs /home/user/taiyo-hacchu-scan/dist <出力フォルダ>`（5193番で `/tokutei/` と `/taiyo-hacchu-scan/` を同じサイトに置く）。
  受注簿ツールの単体テストは `node --test "test/*.test.mjs"` と `node test/run-scan-tests.js`（受け取りは `test/tokutei-import.test.mjs`・`test/jutaku-import.test.mjs`）。

## 3. Excel の確かめ方（この環境に Excel はない）

1. 単体テスト（`estimateBook.test.ts`）：原本の式と、開いた時点の値（キャッシュ）が `saleTotals` と同じか。XML の `&amp;` などを戻してから比べる。
2. 見本を何通りか作る（ふつう・限度額を超える・生活保護・個別切り上げ・単価を手で入れた行）。ブラウザの外で作るときは esbuild で CJS にまとめる
   （`NODE_PATH=<作業ツリー>/node_modules npx esbuild … --bundle --platform=node --format=cjs --define:process.env.NODE_ENV='"production"'`）。
3. `taiyo-excel-export` スキルの手順で、XSD の検査（ALL VALID）・LibreOffice で計算し直して式の答えが同じか（2026-10 は 65 の式が一致）・PDF→画像にして印刷と並べて見比べる（どちらも1ページ）。
4. ユーザーには、架空のデータの見本の .xlsx と、印刷と並べた画像を送り、会社の Excel で一度開いてもらう。

### 申請書（`shinsei.ts`）の確かめ方

1. 単体テスト（`shinsei.test.ts`）：4つの保険者の欄・丸の数・式の答え・アプリに入れた原本が空か（広域連合は外部リンク・保存した場所・プロパティも）。
2. 架空の案件で4つの申請書を作り（Node で `fillShinsei` を呼ぶ。`fflate` は絶対パス。広域連合は受領委任払い・償還払いの両方）、`taiyo-excel-export` の `setup-fonts.sh` のあと LibreOffice で PDF → 画像にして、
   丸（元号・性別・要介護度・みやこ町の届出）が字の上にあるか、長い商品名・理由が欄に入っているかを見る。
   原本は LibreOffice だと1枚に入りきらず右の列が次のページに出ることがある → 見るだけの写しで「1ページに収める」（`<pageSetUpPr fitToPage="1"/>` と `fitToWidth="1" fitToHeight="1"`）にすると見やすい。
3. 前の方の記入が原本に残っていないか（`shinsei.test.ts` の最後のテスト）。原本を替えたら、氏名・番号・写真・丸・共有の文字の表を必ず見る。

## 4. 公開（太陽ポータルの `tokutei/`）

**ユーザーが「公開して」と言ってから。**（本番への push は作業環境の安全確認で止められることがある。止められたら回り道をしない）

```sh
cd /home/user/tokutei-wt && npm run -s build:tokutei
cp dist-tokutei/index.html dist-tokutei/version.json /home/user/taiyo-portal/tokutei/
# タイルの使い方の文：taiyo-portal/index.html の APPS の name:'特定福祉用具 購入申請書・見積もり作成'
cd /home/user/taiyo-portal && git add tokutei/index.html tokutei/version.json index.html && git commit … && git push -u origin master
```

- 先にアプリのブランチを commit・push してから、ポータルを commit・push する。ポータルの `git fetch` で、ほかのセッションの公開が先に入っていないか見る。
- 販売受注簿への転記を含む版は、**受注簿ツールを先に公開する**（taiyo-hacchu-scan の master に入れて `docs/` を作り直す。手順はそのリポジトリの CLAUDE.md。
  デプロイは repo `taiyo-hacchu-scan` の「pages build and deployment」）。今の受注簿ツールは知らない kind を黙って消すので、逆だと転記した商品が消える。
- タイルの文を直したら `<script>` が壊れていないか確かめる（`taiyo-portal` スキル）。
- デプロイの確かめ：github.io はこの作業環境から見えない。GitHub MCP の `actions_list`（`list_workflow_runs`、owner `akamar08taiyo-bot`、repo `taiyo-portal`、perPage 3）で、
  自分の push の head_sha の「pages build and deployment」が completed／success になるのを見る（ふつう1分ほど）。
- 今の公開の版は `taiyo-portal/tokutei/version.json` の `build`（ビルドした時刻）で分かる。`dist-tokutei/version.json` と比べる。
