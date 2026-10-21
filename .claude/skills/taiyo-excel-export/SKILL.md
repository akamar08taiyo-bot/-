---
name: taiyo-excel-export
description: 太陽ポータルの業務アプリ（見積・提案書作成、消耗品売上管理、チラシ作成（消耗品）、特定福祉用具、住宅改修 など）に「Excel で保存」（.xlsx）を足す・直す・確かめるときに必ず使う。印刷・PDF と同じ中身・同じ形の Excel を、サーバーなし・ライブラリなしの手書きの Office Open XML でブラウザの中で作るやり方（印刷の位置 → 列と行の境目を集めたグリッド → 結合セル、BIZ UDP明朝 Medium の字の幅、字間のまね、金額は式＋開いた時点の値、A4 の印刷設定）と、確かめ方（XSD の検査・結合の重なり・LibreOffice での計算し直し・画像にして印刷と見比べる。スクリプト付き）、実際にあった落とし穴。「Excel で出したい」「PDF ではなく Excel で」「エクセル出力」「xlsx」「Excel の見た目・字・罫線が印刷と違う」「Excel で ### になる」「Excel の計算が合わない」「Excel で開けない」と言われたら使う。
---

# 業務アプリの「Excel で保存」（作り方と確かめ方）

2026年10月、ユーザー（行橋営業所の担当者）の依頼「見積もりが PDF で出力となっているため、Excel ベースで印刷できるように…文字は一番近いもの・類似しているものに…Excel 出力機能を全て付け加えて」
で、4つのアプリに Excel 保存を付けた。そのときの作り方・確かめ方・失敗をまとめたもの。保管は基本的に Excel、という考えのユーザー。

## 決まった方針（ユーザーと決めたこと）

- **中身は印刷・PDF と同じ**：同じ並び・色・枠・値・位置。印刷とは**同じデータ**（アプリの `docModel()`・`quoteDoc()`・`prepare…Data()`・`saleTotals()` など）から作り、片方だけ直さない。印刷の出力は変えない。
- **書体は一番近いもの**：印刷の BIZ UDP明朝 → Excel では `BIZ UDP明朝 Medium`（Windows 10 以降に標準。family=1・charset=128 なので、無い PC では Excel が近い明朝体で出す）。
  ゴシックは印刷に合わせる（特定福祉用具の見出しは `BIZ UDPゴシック`、見積・提案書作成の試算書は `游ゴシック`）。
- **金額は Excel の計算式**（数量や単価を直すと計算し直される）。式には**開いた時点に見せる値（キャッシュ）**も入れ、印刷と同じ値にする。workbook に `fullCalcOnLoad="1"`。
- **Excel からそのまま A4 で印刷できる**：用紙・向き・余白（印刷の余白と同じ mm）・横1ページに収める・印刷範囲・見出し行の繰り返し・グリッド線を隠す。
- ファイルは端末の中で作り、どこにも送らない（サーバーなし）。ファイル名は PDF と同じで拡張子だけ `.xlsx`。ボタンは「PDF保存」の右。文字と色はそのアプリのボタンに合わせる
  （特定福祉用具・住宅改修は薄い緑の「📗 Excelで保存」、見積・提案書作成は「📗 Excel保存」、消耗品売上管理は「Excel保存」、チラシは白地の「📗 Excelで保存」）。

## 各アプリの書き出し器（同じ作りを写して使っている）

| アプリ | 部品 | 帳票 |
|---|---|---|
| 見積・提案書作成（taiyo-mitsumori、ブランチ `claude/excel-export`） | `src/index.html` の `createXlsxBook()`（`// ===== Excel（.xlsx）出力`）。zip は fflate。グリッドではなく列を決めた作り（`xlDocColumns`・`xlDocHeader`） | `buildQuoteXlsx`・`buildKaiteiXlsx`・`buildInternalXlsx`・`buildEstimateDocXlsx`（グラフ・条件付き書式・図形も） |
| 消耗品売上管理（taiyo-uriage-bunseki） | `src/index.html` の `createXlsxBook()`・`xlLetterSpace`。fflate | `buildDocXlsx(kind, m)`（見積書・発注書） |
| チラシ作成（消耗品）（taiyo-shohin-chirashi） | `assets/xlsx.js`（`window.TssXlsx`。zip も自前＝無圧縮＋CRC-32） | `quote.html` の `buildQuoteXlsx(d)` |
| 特定福祉用具（`-` のブランチ `claude/care-insurance-auto-transfer-3z0c9n`） | `src/tokutei/print/xlsxBook.ts`（TypeScript。いちばん読みやすい見本） | `print/estimateXlsx.ts` の `buildEstimateXlsx` |
| 住宅改修（`-` のブランチ `claude/sasaoka-shikiri-app`） | **別の作り**：`src/sasaoka/xlsxWrite.ts`（`writeXlsx`・`SheetBuilder`。書体は ＭＳ Ｐゴシック、列幅は数字の幅 8px で 1/100 に丸める、文字は inlineStr で xml:space をいつも付ける、印刷は scale と手動の改ページ、calcPr なし）。申請書は**役所の原本（xltx）を開いてセルを書きかえる**（`shinsei.ts`） | 見積書・申請書 |

新しいアプリに付けるときは、近いアプリの部品を写して使う（アプリ同士は独立しているので共有しない）。部品の中身は `references/ooxml-writer.md`。
このスキルの「方針」と references は、`createXlsxBook` の作りの4つ（見積・提案書作成・消耗品売上管理・チラシ・特定福祉用具）の話。住宅改修は上のとおり別の作りなので、住宅改修のスキルも読む。

## 作り方の流れ

1. **印刷の帳票を読む**：用紙・余白・本文の幅（mm）・各ブロックの位置と大きさ・表の列の割合（colgroup）・字の大きさ・色・罫線・縞。いちばん長くなる場合（行が多い・長い名前・合計あり）も見る。
2. **グリッドを作る**（`references/layout.md`）：頭の部分（題名・宛名・金額・発行元の枠）は印刷と同じ位置（横 mm・縦 pt）に置き、
   表の列の境目（優先）と頭の部分の境目を集めて、近い境目をまとめて（列 2mm、行 0.3〜1pt）列と行にする。1つの枠＝結合セル（`box()`）。
3. **値と式**：金額 `数量*単価`、小計 `SUM`、消費税は**アプリの丸めと同じ関数**（切り捨て `INT(小計*0.1)`・四捨五入 `ROUND(…,0)`・JS の `Math.round` に合わせるなら負の数は `INT(x+0.5)`）、合計、介護保険の負担（`CEILING`・`MIN`）。
   どれもキャッシュ値つき。表示形式は `"¥"#,##0` など。
4. **字の幅で行の高さ・折り返しを決める**：BIZ UDP明朝の実測の字の幅で文字の長さを出し、使える幅は 0.93 倍で見積もる（字体が置き換わる PC でも切れないように）。行の高さは印刷の line-height に合わせる。数値のセルは「縮小して全体を表示」で ### を出さない。
5. **印刷設定**：A4（paperSize 9）・向き・余白（mm → inch）・`fitToWidth=1`（縦は 0 か 1）・左右中央・Print_Area・Print_Titles・`showGridLines="0"`。
   手動の改ページを使う帳票は fitToPage ではなく scale（拡大縮小）にする（fitToPage にすると Excel は手動の改ページを使わない。住宅改修の作り）。
6. **ボタンとファイル名**、README・使い方の文・テストを足す。

## 確かめ方（このスキルの `scripts/`。新しい作業環境では最初に用意する）

```sh
S=<このスキル>/scripts
sh $S/setup-fonts.sh            # Google Fonts の BIZ UD 明朝・ゴシックを入れ、「BIZ UDP明朝 Medium」などを代わりの字体で出す（ＭＳ Ｐゴシック → IPA Pゴシック）
sh $S/fetch-xsd.sh              # ECMA-376 の XSD（Apache POI 5.2.5 の jar から）を ~/.cache/taiyo-xsd に（XLSX_XSD_DIR で変えられる）
python3 -I $S/validate.py *.xlsx   # XSD＋結合の重なり・結合の中の値・行の高さ 409pt → ALL VALID / EXCEL CHECKS OK（だめなら終わりのコード 1）
python3 $S/recalc.py *.xlsx        # LibreOffice で式を計算し直し、キャッシュ値と比べる → mismatches: 0（ずれは 1、LibreOffice が動かなければ 2）
sh $S/render.sh <出力> 見積.xlsx 見積.pdf   # LibreOffice で PDF → 画像（見積_xlsx-1.png・見積_pdf-1.png。ページ数も出す）
python3 $S/side-by-side.py <出力>/見積_pdf-1.png <出力>/見積_xlsx-1.png 並べた.png   # 左右に並べて Read で見る
```

- validate.py は、役所の原本を書きかえた xlsx（住宅改修の申請書）も調べられる（画像などの XML でないものは読まず、Excel の拡張 mc:Ignorable の属性・要素は外してから検査）。
  2026-10-21 に、4つのアプリの見本と住宅改修の申請書5つで合格、わざと結合を重ねた・行を 500pt にしたファイルで不合格になることを確かめた。
- recalc.py は使い捨ての LibreOffice の設定フォルダと 2099 番（`RECALC_PORT`）で起動するので、ほかの LibreOffice とぶつかりにくい。要るもの：LibreOffice の python3-uno・openpyxl・lxml・Pillow（並べるとき）・poppler-utils。

- 見本は**架空のデータ**で作る（見本 花子・見本の里・医療法人 見本会 など）。お客様・価格表の本物は使わない。
- 印刷の PDF は Playwright で `page.emulateMedia({media: 'print'})` のあと `page.pdf({format: 'A4', margin: 0, printBackground: true, preferCSSPageSize: true})`。
- 1つの HTML のアプリ（src/index.html）は、テストで帳票の関数の範囲を切り出して `new Function` で動かせる（消耗品売上管理の `docXlsx.test.mjs`）。
- アプリのテストで、式とキャッシュ値が印刷の計算（アプリの計算の関数）と同じことを確かめる（`docXlsx.test.mjs`・`estimateXlsx.test.ts` など）。式を XML から読むときは `&lt;` `&gt;` `&quot;` を戻し、最後に `&amp;` を戻してから比べる。
- ブラウザで「Excelで保存」を押してダウンロードを確かめる（Playwright。`chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}})` にしないと日本語のファイル名が「download」になる）。
- 印刷が変わっていないこと：変える前と後の印刷の HTML（`#print-content-holder` など）を比べる。
- この環境に Microsoft Excel はない。最後はユーザーに見本の .xlsx と印刷と並べた画像を送り、会社の Excel で一度開いてもらう（警告が出ないか・字が切れないか）。

## 落とし穴（実際にあったこと）

- **結合セルが重なる**（Excel で「修復」になる）：近い境目をまとめる幅が大きすぎた（1pt で 0.75pt 違いの境目が1つに）→ 0.3pt に。**XSD では見つからない**ので `validate.py` の結合の検査が要る。
- **Excel のインデントは横位置（h:'left' か 'right'）を指定しないと効かない。**
- `xml:space="preserve"` は、先頭・末尾の空白や改行を残すための印。createXlsxBook の作りは要るときだけ付け（Excel も同じ書き方）、住宅改修はいつも付けている（どちらでも開ける）。
  XSD に xml の名前空間の宣言が無く検査で引っかかるので、`validate.py` は検査の前に外している。セルの中の改行は、そのまま書いても `&#10;` でも同じ（見せるには折り返しの書式が要る）。
- 太字の「4,000 ml」が ### になった → 字の幅を fontTools の実測に、数値セルを縮小表示に。行の高さは 409pt まで（超えると Excel が開けない・直す）。
- 題名の字間（letter-spacing）：BIZ UDP明朝の全角スペースは 0.667em（1em ではない）、半角は 0.333em。字の間の全角スペースを、0.5em なら「全角2つ＋半角1つ」、0.2〜0.3em なら「全角＋半角」に置きかえ、空白のない字の間には半角を入れる（`references/layout.md`）。長い題名は字間をあけずに縮小。
- 宛名の折り返し：行数の見積もりが多すぎて印刷では1行なのに折り返した → 実際の文字の幅で、本当に入らないときだけ折り返す。下線は右の余白分の「下の罫線だけのセル」で延ばす。
- 備考の複数行を1つのセルにまとめると行間が合わない → 1行ずつ別の行に（高さは字の大きさ×印刷の line-height。例：9.5pt×1.6＝15.2pt）。
- 丸めの違い：JS の `Math.round(-2.5)` は −2、Excel の `ROUND` は −3 → 負の数は `INT(x+0.5)`。小数の単価・数量がある帳票は、合計の表示（小数が出るか）も印刷とそろえる。
- 式が 8000 字を超えるときは値だけを書く。数値は有効15桁に丸めて書く。
- XML に書けない文字（制御文字・U+FFFE・U+FFFF）を除く正規表現は `\uFFFE\uFFFF` とエスケープで書く（文字そのものだと見えない・壊れやすい）。
  見積・提案書作成はエスケープで書いてある。消耗品売上管理・チラシ（xlsx.js）・特定福祉用具（xlsxBook.ts）は文字そのもの（動くが直す候補）。住宅改修の esc は制御文字を除いていない（直す候補）。
- fflate は jsPDF の依存として入っていることが多い。直接使うなら package.json に書く（`npm install fflate --save` で別のロックファイルの項目が消えたことがある → 差分を見る）。
- ブラウザの外で帳票の関数を動かして見本を作るとき：esbuild は CJS にまとめる（ESM だと「Dynamic require of util」）、`--node-paths` はないので環境変数 `NODE_PATH`、
  一時の .ts から `fflate` が見つからないときは絶対パス（`…/node_modules/fflate/esm/index.mjs`）。
- LibreOffice は列の幅を代わりの字体で計算するので、細かい位置（半字ほど）は Excel と違うことがある。合否は計算・結合・ページ数・明らかな切れで決め、細かいずれは原本や印刷の位置と数値で比べる。
