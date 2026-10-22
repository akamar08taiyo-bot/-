# コードの地図（`src/tokutei/`）

React 19 + TypeScript + Vite（`vite.tokutei.config.ts` で1ファイルの `dist-tokutei/index.html` にまとめる）+ Tailwind CSS 4。サーバーは使わない。

## データの形（`types.ts`）

- `Product`（商品マスタ）：`name`・`maker`（申請書の製造事業者名）・`code`（品番）・`tais`・`jan`・種目 `category`／細目 `sub`（`categoryByHand`＝手で選んだので取り込み直しても変えない）・
  `listPrice`（定価・税抜、不明は 0）・`cost`（仕切・税抜）・`taxType`（'10%'|'8%'|'非課税'）・`unit`・`supplier`（仕入先）・`favorite`（★）・`useCount`・`lastUsedAt`（よく使う順）・`source`（取り込んだ表）。
- `SaleItem`（見積の品目）：選んだ時点の商品マスタの値を**書き写して**持つ（あとで商品マスタを直しても見積は変わらない）。
  `unitPrice: null` なら 定価×(100−`discountRate`)%。`qty`・`discountRate`・`listPrice`・`cost`・`taxType`・`reason`（福祉用具が必要な理由。申請書の欄）など。
- `Sale`（お客様1件の販売）：お客様（`customer`＝「様」は付けない・`kana`・`insuredNo`・`birthDate`・`gender`（'男'|'女'|''）・`zip`・`address`・`tel`・`careLevel`）・保険者（`insurer`＝INSURERS の key、そのほかは 'other' と `insurerName`）・`burdenRatio`（1|2|3）・
  `payMethod`（'受領委任払い'|'償還払い'）・`remaining`（今年度の残り。`null`＝空欄＝限度額10万円、0 は「残りなし」）・`perItem`（個別切り上げ）・`welfare`（生活保護）・
  担当・居宅介護支援事業所とケアマネ・`carePlan`（居宅サービス計画の届出。みやこ町。空なら居宅介護支援事業所があれば「有」）・見積番号（`quoteNo`「YYYYMMDD-n」）・
  各日付（`claimDate`＝支給申請日を含む）・`status`（見積→申請→承認→納品→集金）・備考・`items`。
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
| `App.tsx` | 3つのタブ（📝 見積もり・申請／📦 商品マスタ／⚙ 設定）。URL の `#tab=…&sale=…&print=1`。住宅改修のタブの中では `#jutaku=<様邸の id>&embed=1`（題名の段を出さない・`window.__taiyoTokuteiFlush` を出す） |
| `jutaku.ts` | 住宅改修のアプリから開いたとき：localStorage `taiyo-tokutei-from-jutaku-v1`（`{job, fields}`）を読む `readJutaku`・値を確かめる `cleanJutakuFields`・その様邸の案件を開く（なければ作る）`applyJutaku`（`Sale.jutakuJob`・前に受け取った値 `jutakuSync` とちがう値だけ、まだ手で直していない項目に入れる。`jutakuSync` は作ったときの値から始めるので、初めの値のままの負担割合1割・保険者も、あとで住宅改修で入れた値が入る。保険者が変わったら個別切り上げも）。形は住宅改修の `src/sasaoka/tokuteiLink.ts` と同じにする |
| `defaults.ts` | 営業所（OFFICES、19か所）・担当・保険者（INSURERS。みやこ町は `perItem`）・`defaultSettings()`。営業所はポータルの localStorage `taiyo_portal_session` から |
| `sales.ts` | 見積番号 `nextQuoteNo`・`newSale`・`copySale`・`itemFromProduct`・`blankItem`・`customerLabel`・`saleWarnings`。使い回し：`customerKey`（同じお客様＝被保険者番号10けた、なければ名前＋生年月日）・`pastCustomers`・`customerPatch`（前のお客様から入れる）・`sameYearSales`（今年度の残り）・`frequentValues`（居宅・ケアマネの候補） |
| `category.ts` | 種目の自動判定（T字杖・歩行車・持ち運ぶスロープは対象外）。`docLabel`＝書類の種目（腰掛便座の長い細目は「腰掛便座（ポータブルトイレ）」） |
| `shinsei.ts` | 申請書：`SHINSEI`（行橋市・苅田町・みやこ町。シートごとに書く欄・丸・文字を小さくする欄・行のそろえ）・`shinseiValues`（案件 → 書く値）・`fillShinsei`・`shinseiChecks`（未入力・行に入らない商品）・`shinseiFileName`（「〇〇様特定福祉用具申請書.xlsx」） |
| `shinsei/` | 申請書の原本（`yukuhashi.xltx`・`kanda.xltx`・`miyako.xlsx`）。いただいた様式から前の方の記入・写真・丸を消したもの（式の誤りも2つ直した。DESIGN.md 5.2）。`shinseiFiles.ts` が `?inline` で中に入れて開く |
| `xlsxEdit.ts` | 原本の XML を直接書きかえる部品（住宅改修の `shinsei.ts` から写した）：`writeCells`（式の答えも合わせる）・`fitCell`・`sameStyle`・`drawMarks`（楕円。何行もある欄も）・`hideZeros`・`dropCalcChain`・`finishWorkbook` |
| `wareki.ts`・`zip.ts`（`zipData.ts`＝福岡県の郵便番号）・`reasons.ts` | 生年月日の読み取り（和暦・西暦）・住所 ⇔ 郵便番号・理由の文例 |
| `import/` | 仕切り一覧表の取り込み（`priceImport.ts`・`xlsx.ts`・`pdfText.ts`。住宅改修のアプリから写したもの） |
| `storage.ts` | IndexedDB `taiyo-tokutei`（使えないときは localStorage `tokutei-app:`）。読み込みは `cleanProducts`・`cleanSales`・`cleanSettings`（項目を足したらここも）。バックアップ JSON `backupJson`・`parseBackup`・`mergeById` |
| `useStore.ts`・`sync.ts` | 変更の 0.4秒後に自動保存・タブ間でまとめて保存。`flush` は保存の途中ならそれが終わるまで待つ（住宅改修のタブの中の枠が消える前に待つため） |
| `update.ts` | `version.json` を見て「⟳ 読み込み直す」を出す |
| `components/` | `SalesPage`（一覧）・`SaleEditor`（案件の画面。「📗 Excelで保存」）・`ShinseiPanel`（「📄 申請書（Excel）を作る」と未入力の欄）・`CustomerPicker`・`BirthInput`・`ReasonField`・`Suggest`・`ProductsPage`・`ProductPicker`・`CategorySelect`（種目を選ぶ）・`ImportDialog`・`SettingsPage`・`ui.tsx`（ボタンの色。Excel は `excel`＝薄い緑） |
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

`calc.test.ts`（計算の例）・`category.test.ts`・`priceImport.test.ts`・`estimateXlsx.test.ts`（式とキャッシュの値が `saleTotals` と同じか、超えた分・個別切り上げ・生活保護・償還払い・非課税、宛名・印刷設定・ファイル名）・
`shinsei.test.ts`（3つの申請書の欄・丸の数・式の答え・原本に前の方の記入が残っていないか）・`link.test.ts`（生年月日・郵便番号・前のお客様・今年度の残り・理由）・`jutaku.test.ts`（住宅改修からの受け渡し：開いた様邸のものだけ・案件を作る／開く・変わった値だけ入れ直す・保険者と個別切り上げ・読み込みで残す）・`e2e.mjs`（ブラウザで通し。申請書の Excel を落として欄を読む）。
