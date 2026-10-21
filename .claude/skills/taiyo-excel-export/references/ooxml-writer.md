# 書き出し器（createXlsxBook）の中身

いちばん読みやすい見本は特定福祉用具の `src/tokutei/print/xlsxBook.ts`（akamar08taiyo-bot/- のブランチ claude/care-insurance-auto-transfer-3z0c9n）。
見積・提案書作成・消耗品売上管理は同じ作りの JavaScript 版、チラシ作成（消耗品）の `assets/xlsx.js` は zip まで自前の版。

## 使い方

```ts
const book = createXlsxBook();
const ws = book.addSheet('御見積書', {margins: {l: 13, r: 13, t: 14, b: 14, h: 6, f: 6}, fitWidth: 1, fitHeight: 0, printArea: [0, 0, lastRow, lastCol]});
ws.setCols([12.3, 40.1, 15.0]);               // 列幅（mm）
ws.height(0, 28);                              // 行の高さ（pt。409 まで。同じ行は大きい方）
ws.box(0, 0, 0, 2, '御　　 見　　 積　　 書', {font: {sz: 18, b: true}, align: {h: 'center', v: 'center'}});
ws.box(5, 2, 5, 2, {f: 'SUM(C3:C4)', v: 42944}, {fmt: '"¥"#,##0', border: {b: 'thin:000000'}, align: {h: 'right', shrink: true}});
ws.box(6, 0, 6, 2, {rich: [{t: '見本 花子', font: {sz: 14}}, {t: '　様', font: {sz: 11}}]});
const bytes = book.toBytes('御見積書');          // Uint8Array（.xlsx）
```

- 行・列は 0 始まり。`xlRef(r, c)`＝"A1"、`xlRange(r1, c1, r2, c2, abs)`。
- 値：数値／文字列／`{rich: [{t, font}]}`（1つのセルで大きさ・色を変える）／`{f: '式', v: 開いた時点の値}`／null。
  式の答えが文字のときは `t="str"`、数値は `<v>`。数値は有効15桁に丸めて書く（`Number(n.toPrecision(15))`）。
- 書式：`{font: {name, sz, b, color}, fill: 'RRGGBB', border: {l, r, t, b: 'thin:RRGGBB'}, align: {h, v, wrap, indent, shrink}, fmt: '"¥"#,##0'}`。
  同じ書式は1つにまとめて番号を使い回す（fonts・fills・borders・numFmts・cellXfs を intern）。組み込みの表示形式（`#,##0` は 3 など）はその番号、ほかは 164 から。
- `box()`：結合セル。外枠の罫線を、まわりのセル（左端の列に l、右端に r、上の行に t、下の行に b）に振り分ける（結合セルの罫線は各セルに書かないと出ない）。塗りは全部のセルに入れる。値は左上のセルだけ。

## 書き出す XML

- `[Content_Types].xml`（zip の先頭に置く。読み込み側によっては先頭を期待する）・`_rels/.rels`・`docProps/core.xml`・`docProps/app.xml`・
  `xl/workbook.xml`（`<calcPr calcId="191029" fullCalcOnLoad="1"/>`、定義名 `_xlnm.Print_Area`・`_xlnm.Print_Titles` は `localSheetId` つき・シート名は `'…'!$A$1:$H$40` の形）・
  `xl/_rels/workbook.xml.rels`・`xl/styles.xml`（`cellStyle name="標準"`）・`xl/sharedStrings.xml`（count＝参照の数、uniqueCount＝種類の数）・`xl/worksheets/sheetN.xml`。
- シート：`<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`（収める設定のとき）・`<dimension>`・`<sheetView showGridLines="0">`・`<cols>`（`customWidth`）・`<sheetData>`（行は `ht`＋`customHeight="1"`）・
  `<mergeCells>`・`<printOptions horizontalCentered="1"/>`・`<pageMargins>`（inch。mm÷25.4）・`<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>`。
  要素の順番は XSD のとおりにする（順番が違うと Excel が修復する）。
- 列幅：mm → px（96/25.4）→ 標準フォントの数字1文字の幅（MDW＝10px：BIZ UDP明朝 Medium 11pt）で割り、1/256 に丸める。
- フォント：`<sz/><color rgb="FF……"/><name val="BIZ UDP明朝 Medium"/><family val="1"/><charset val="128"/>`（明朝は family 1、ゴシックは 3）。リッチテキストは `rFont`。
- 文字のエスケープ：`& < > "` と、XML に書けない制御文字（U+0000〜U+0008・U+000B・U+000C・U+000E〜U+001F・U+FFFE・U+FFFF）を除く。正規表現は `\uFFFE\uFFFF` とエスケープで書く。
- `<t>` の `xml:space="preserve"` は先頭・末尾の空白、改行・タブがあるときだけ。

## 版ごとの違い（写して使うときに気をつける）

| | 特定福祉用具（xlsxBook.ts） | 見積・提案書作成／消耗品売上管理（JS） | チラシ（xlsx.js） |
|---|---|---|---|
| 書き出し | `toBytes('題名')` | `toBytes({title, creator})` | `toBytes`（zip も自前） |
| 式の答えが文字（`t="str"`） | あり | 見積・提案書作成はあり、消耗品売上管理はない | あり |
| 向き・左右中央・Print_Titles | 縦・左右中央に固定、Print_Titles なし | 設定できる | `ws.page` で設定できる |
| 条件付き書式・図形・グラフ | なし | 見積・提案書作成だけ | なし |

- 見積・提案書作成の版には、条件付き書式（`ws.cf`。値上がり赤・値下がり緑）・図形（`ws.rect`。印の枠）・グラフ（`ws.chart`。`xl/charts/chartN.xml`＋drawing＋rels）もある。

## zip

- fflate の `zipSync(files, {level: 6})`・`strToU8`（jsPDF の依存として入っていることが多い）。
- 自前（チラシ作成）：無圧縮（STORE）の zip を書き、各ファイルの CRC-32 を計算する。外部のライブラリがいらない（見本で約78KB）。

## ダウンロード

`new Blob([bytes], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})` → `URL.createObjectURL` → `a.download = ファイル名` → click → あとで revokeObjectURL。
ファイル名に使えない文字（`\/:*?"<>|`・改行）は `_` に。
