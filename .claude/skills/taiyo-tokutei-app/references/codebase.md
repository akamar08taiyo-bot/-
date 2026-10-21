# コードの地図（`src/tokutei/`）

React 19 + TypeScript + Vite（`vite.tokutei.config.ts` で1ファイルの `dist-tokutei/index.html` にまとめる）+ Tailwind CSS 4。サーバーは使わない。

## データの形（`types.ts`）

- `Product`（商品マスタ）：`name`・`maker`（申請書の製造事業者名）・`code`（品番）・`tais`・`jan`・種目 `category`／細目 `sub`（`categoryByHand`＝手で選んだので取り込み直しても変えない）・
  `listPrice`（定価・税抜、不明は 0）・`cost`（仕切・税抜）・`taxType`（'10%'|'8%'|'非課税'）・`unit`・`supplier`（仕入先）・`favorite`（★）・`useCount`・`lastUsedAt`（よく使う順）・`source`（取り込んだ表）。
- `SaleItem`（見積の品目）：選んだ時点の商品マスタの値を**書き写して**持つ（あとで商品マスタを直しても見積は変わらない）。
  `unitPrice: null` なら 定価×(100−`discountRate`)%。`qty`・`discountRate`・`listPrice`・`cost`・`taxType` など。
- `Sale`（お客様1件の販売）：お客様（`customer`＝「様」は付けない・`kana`・`insuredNo`・`birthDate`・`address`・`tel`・`careLevel`）・保険者（`insurer`＝INSURERS の key、そのほかは 'other' と `insurerName`）・`burdenRatio`（1|2|3）・
  `payMethod`（'受領委任払い'|'償還払い'）・`remaining`（今年度の残り。`null`＝空欄＝限度額10万円、0 は「残りなし」）・`perItem`（個別切り上げ）・`welfare`（生活保護）・
  担当・居宅介護支援事業所とケアマネ・見積番号（`quoteNo`「YYYYMMDD-n」）・各日付・`status`（見積→申請→承認→納品→集金）・備考・`items`。
- `Settings`：見積書の発行元（`company`・`officeName`・住所・電話・`manager`＝所長・`regNo`＝インボイスの登録番号）・`staffList`・`suppliers`・
  `discountRate`（20）・`markupRate`（25。定価がないとき 仕切×1.25。販売受注簿の利益率と同じ）・`limit`（100000。4月〜翌年3月）・`minProfitRate`（20）・
  見積書の文（`validity`・`payment`・`delivery`・`remarks`）・`rev`（設定の版。古い版を読み込むときの直し方）。

## 計算（`calc.ts`。金額はここだけで出す）

- `unitPriceOf(item, s)`：販売単価と根拠（`PriceBasis`＝'list'|'cost'|'manual'|'none'）。
- `lineOf(item, s)`：1行の金額・消費税（行ごとに切り捨て）。
- `saleTotals(sale, s)` → `Totals`：小計・消費税・合計・`covered`（介護保険の対象）・`excess`（超えた分）・`share`（利用者負担。切り上げ）・`userBurden`・`aid`（介護扶助）・
  `insurerBurden`（対象−利用者負担）・`userPay`（お支払い）・`perItemApplied`（個別切り上げが効いたか）・`profit` など。
- `priceNote(line)`：備考の「定価35,000円（税抜）×0.8」。`rateText(discountRate)`。

## そのほか

| ファイル | 役割 |
|---|---|
| `App.tsx` | 3つのタブ（📝 見積もり・申請／📦 商品マスタ／⚙ 設定） |
| `defaults.ts` | 営業所（OFFICES、19か所）・担当・保険者（INSURERS。みやこ町は `perItem`）・`defaultSettings()`。営業所はポータルの localStorage `taiyo_portal_session` から |
| `sales.ts` | 見積番号 `nextQuoteNo`・`newSale`・`copySale`・`itemFromProduct`・`blankItem`・`customerLabel`・`saleWarnings` |
| `category.ts` | 種目の自動判定（T字杖・歩行車・持ち運ぶスロープは対象外） |
| `import/` | 仕切り一覧表の取り込み（`priceImport.ts`・`xlsx.ts`・`pdfText.ts`。住宅改修のアプリから写したもの） |
| `storage.ts` | IndexedDB `taiyo-tokutei`（使えないときは localStorage `tokutei-app:`）。読み込みは `cleanProducts`・`cleanSales`・`cleanSettings`（項目を足したらここも）。バックアップ JSON `backupJson`・`parseBackup`・`mergeById` |
| `useStore.ts`・`sync.ts` | 変更の 0.4秒後に自動保存・タブ間でまとめて保存 |
| `update.ts` | `version.json` を見て「⟳ 読み込み直す」を出す |
| `components/` | `SalesPage`（一覧）・`SaleEditor`（案件の画面。「📗 Excelで保存」）・`ProductsPage`・`ProductPicker`・`CategorySelect`（種目を選ぶ）・`ImportDialog`・`SettingsPage`・`ui.tsx`（ボタンの色。Excel は `excel`＝薄い緑） |
| `print/EstimateDoc.tsx` | 印刷の御見積書（A4縦） |
| `print/PrintView.tsx` | 印刷の画面（画面の幅に合わせて縮めて見せる。「🖨 印刷する」「📗 Excelで保存」「閉じる」。PDF の名前は document.title「御見積書_〇〇様」） |
| `tokutei.css` | `@media print` で `.est{height:296mm; overflow:hidden}`（1枚に固定。行が多いと下が切れる） |

## Excel（`print/`）

- `xlsxBook.ts`：xlsx を書き出す部品（Office Open XML を直接書き、zip は fflate）。`createXlsxBook()` → `addSheet()` → `box(…)` で結合セルを書く。
  書体の定数 `XL_MINCHO`（BIZ UDP明朝 Medium）・`XL_GOTHIC`（BIZ UDPゴシック）、`XL_PT_MM`、`xlRef`・`xlRange`、字の幅 `xlTextEm`・`xlTextMm`、行数の見積もり `xlLineCount`。
  `fullCalcOnLoad`（開いたときに計算し直す）・印刷範囲・A4縦・1枚に収める設定。
  見積・提案書作成・消耗品売上管理の Excel 保存と同じ作り（このアプリは独立しているので写して使っている）。
- `estimateXlsx.ts`：`buildEstimateXlsx(sale, settings)`（Uint8Array）・`saveEstimateXlsx`（ダウンロード）・`estimateXlsxName`。
  頭の部分（宛名・題名・見積番号・日付・会社の枠・印の枠）は印刷と同じ位置に置き、列と行の境目を集めて結合セルにする。品目の表と介護保険の内訳は式。

## テスト（`test/tokutei/`）

`calc.test.ts`（計算の例）・`category.test.ts`・`priceImport.test.ts`・`estimateXlsx.test.ts`（式とキャッシュの値が `saleTotals` と同じか、超えた分・個別切り上げ・生活保護・償還払い・非課税、宛名・印刷設定・ファイル名）・`e2e.mjs`（ブラウザで通し）。
