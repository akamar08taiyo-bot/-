# 販売受注簿作成ツール（akamar08taiyo-bot/taiyo-hacchu-scan）

カタログ画像（介援隊・ウェルファン）を貼り付けて OCR（tesseract.js）で読み、販売受注簿（受注区分：販売／給付／在庫）を作るツール。
ポータルのタイル名は「販売受注簿作成ツール」、画面の見出しは「発注スキャン」。受注簿から御見積書も作れる。
住宅改修のアプリの発注書から部材を受け取れる（`references/business-rules.md` の10）。

## 直す前に必ず
1. リポジトリの `CLAUDE.md` と `Learnings.md` を読む（このリポジトリの決まり。過去の失敗と対処が番号付きで書いてある）。
2. 作業が終わったら `Learnings.md` の末尾に「事実→原因→今後」の形で追記し、一般にできることは `CLAUDE.md` の「既知の落とし穴」にも足す。
3. 既定のブランチは **master**（main ではない）。公開は `docs/`（GitHub Pages）。

## コードの読み方・直し方
- `src/main.jsx` は1ファイル・約42万字の生成コード風（React を JSX ではなく `(0,j.jsx)(…)` で書いている）。読むときは `grep -o` や Python で該当箇所の前後を切り出す。
  受注簿のコンポーネントは `function Ot(){…}`、状態は `[e,t]`＝受注簿（setter t）、`[n,r]`＝設定、`h`＝お知らせ、`x`＝候補。複数商品は `multiSaved`・`multiPageIndex`・`multiDraft`。
- 直すときは **Python の str.replace（1回だけ・件数を assert）** で。Edit ツールは `\uXXXX` を含む行の近くで、新しく書いた日本語まで `\uXXXX` にしてしまう（Learnings 第20項）。
  直したら `git diff -U0 src/main.jsx | cut -c1-220` で確かめる。
- 見積書・PDF の帳票は文字列をつないだ HTML（`window.open`・Blob）、受注簿本体は React。どちらを直すのか先に確かめる。
- 画像の欄の見出しの横のお知らせ（`h(…)` → `span.status`）は16字前後に（長いと見出しが1文字幅に潰れる）。

## 住宅改修の発注書からの受け取り（`/* jutaku-import-begin */`〜`/* jutaku-import-end */`）
- `readJutakuImport()`：localStorage の `taiyo-hacchu-import-v1` を `useState` の初期化で読む（effect だと先に空の状態で動く）。
  `kind` が `taiyo-jutaku-order` でない・部材が空・リンク（`?from=jutaku`）から開いていないのに1日より前、のものは黙って消す。
- `JutakuImportDrawer`：届いた部材（品名・品番・数量と単位）を見せて「受注簿に入れる／入れない」。どちらでも読んだら消す。
- `acceptJutakuImport()`：入力途中の受注簿（`draftOffer`）があれば、置き換える前に `window.confirm`。`jutakuImportPages()` で1点1ページの商品ページにして1ページ目を開く。
  顧客名・住所・営業担当・発注先は全ページ同じ。販売単価＝定価×(100−値引率)%。価格の分からない品は空欄（仕切り未入力として知らせる）。
- 商品ページの数量の横（画面だけ `qtyWithUnit no-print`）・印刷とPDF（`printValue`）・集計ページ・別ページの販売受注簿に単位を付けた（何が何本か分かるように）。

## テスト・公開
```sh
cd /home/user/taiyo-hacchu-scan
node --test "test/*.test.mjs"     # 単体（受け取りは test/jutaku-import.test.mjs。begin〜end を new Function で取り出して動かす）
node test/run-scan-tests.js       # 介援隊カタログの読み取りの検証（node --test には入っていない。両方回す）
npm run build                     # dist/
cp -r dist/. docs/                # 公開
# docs/assets の古いハッシュ名のファイルを消す（index.html と assets/index-*.js から参照されないもの）。
# ワイルドカードの rm は安全確認で止められるので、名前を1つずつ：git rm -f -- docs/assets/古い名前.js
git checkout -- package-lock.json
```
- 直す前に master をそのままビルドして `docs/` とバイト一致するか確かめると、未公開の変更が混ざらないことを保証できる（一致していた）。
- PDF を直したら、1440px と 820px の両方で「PDF保存」を押して実際の PDF を取り、`pdftoppm` のページ画像が同じになるか確かめる（Learnings 第2・7項）。
- docs/ は `/taiyo-hacchu-scan/` の下で配信する（Vite の base）。住宅改修のアプリと同じローカルサーバーに置くと、転記を通しで確かめられる。
