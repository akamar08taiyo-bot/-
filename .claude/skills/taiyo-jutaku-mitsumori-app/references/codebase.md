# コードの地図（akamar08taiyo-bot/- の src/sasaoka、ブランチ claude/sasaoka-shikiri-app）

React 19 ＋ TypeScript ＋ Vite（Tailwind）。リポジトリにはほかのアプリ（健康管理など）も同居している。住宅改修のアプリは `src/sasaoka/` だけ。
1つのアプリ（`App.tsx`）を、2つの入口（`sasaoka.html` → `src/sasaoka/main.tsx`、`jutaku.html` → `src/sasaoka/estimate/main.tsx`）から、最初に開くタブだけ変えて使う。

## 目次
1. ファイルの役割
2. データの形
3. 保存・2つの画面の同期・新しい版の知らせ
4. 見積書に直接入力（EstimateSheet）の仕組み
5. 項目・機能を足すときの手順

## 1. ファイルの役割

| ファイル | 何をするか |
|---|---|
| `App.tsx` | 4つのタブ（📝 見積もり・申請書を作成する／🧾 請求書を確認する／📦 部材・施工費マスタ／⚙ 設定）、新しい版の帯、印刷の画面の開閉、発注書の画面の開閉 |
| `noZoom.ts` | iPhone・iPad で欄を押したときに画面を拡大しない（viewport に maximum-scale=1。`main.tsx`・`estimate/main.tsx` で読み込む） |
| `links.ts` | URL のうしろの `#tab=…&job=…&view=order`（読み直しても同じ所を開く）、ポータルの URL |
| `types.ts` | データの形（Material・LaborItem・Row・Place・Kit・Job・OrderLine・OrderEdits・Settings・Insurer…） |
| `calc.ts` | 金額の計算（仕切り計算表 ①〜⑦、見積の単価・数量・金額・合計、`isBlankRow`、`cutToLength`、空欄の価格の扱い）。見積書に行があるか `hasEstimateRows`・見積書を書きはじめたとき（見積もり作成日・請求書に入れる）`startEstimate` |
| `estimateForms.ts` | 見積書の2つの書式に並べる行（`formLines`・`paginate`）、備考の文字（`lineNote`・`cutCalc`）、保険者（`INSURER_INFO`・`jobInsurer`・`jobForm`・`insurerLabel`）、改修の種類の名前（`KINDS`。①は「手すりの取り付け」）、生年月日の元号（`eraOf`。選んでいなければ昭和） |
| `print/EstimateForms.tsx` | 見積書の書式の描画（印刷と、見積書に直接入力の両方）。行の左のボタン `RowTools`（挿入・✕・コピー／貼付） |
| `print/formLayout.ts` | 見積書の列幅・行の高さ（mm）。印刷と Excel 保存で同じ寸法を使う |
| `print/PrintView.tsx` | 印刷の画面（請求書・仕切り計算表・見積書・発注書）。A4、狭い画面では縮めて見せる |
| `print/OrderDoc.tsx` | 発注書（A4縦） |
| `components/EstimateSheet.tsx` | 見積書に直接入力（Excel のような操作。キー操作・候補・行のコピー・貼り付け） |
| `sheetEdit.ts` | 見積書の欄の値の読み書き（`applySheet`・`sheetValue`）、行の挿入・削除・コピー・貼り付け（`insertBlankAfter`・`deleteLine`・`lineRows`・`pasteLines`） |
| `rows.ts` | 行・箇所を作る部品（`newPlace`・`materialRow`・`laborRow`・`manualRow`・`copyRows`（IDを付け直す）・`addMaterial`・`insertRowsAt`（選んでいる行のまとまりの下・空白の行ならその行に）・`laborSpot`／`laborRange`（施工費を入れる所）・`workRange`・`kitRows`）。行の操作はこれを使う |
| `sheetClip.ts` | 行のコピーを覚えておく所（画面を移っても残る。別の見積書にも貼り付けられる） |
| `App.tsx` | 4つのタブ・様邸の画面の4つのタブ（`JobTabs`：📝 住宅改修申請書・🛁 特定福祉用具申請書・📋 工事見積書・📄 理由書。`jobView`＝'shinsei'／'tokutei'／'estimate'／'riyu'／'order'、URL の `view=`。特定福祉用具申請書のタブを離れるときは `leaveTokutei` で中のアプリの保存を待つ）・新規作成（`newOne`＝住宅改修申請書のタブで開く）・一覧から開く（`openJob`） |
| `estimate/TokuteiEditor.tsx`・`tokuteiLink.ts` | 🛁 特定福祉用具申請書のタブ：特定福祉用具のアプリ（`../tokutei/`）を iframe で出す。お客様の情報を localStorage `taiyo-tokutei-from-jutaku-v1` で渡す（`tokuteiFields`・`writeTokutei`）。枠は画面の下までの高さ。`flushTokutei` で中のアプリの保存を待つ。受け渡しの形は特定福祉用具の `src/tokutei/jutaku.ts` と同じにする |
| `estimate/EstimateEditor.tsx` | 見積書のタブ（💾 保存・📗 Excel・🖨 印刷・📄 白紙に戻す・🛒 発注書を作成・保険者・担当・見積もり作成日・笹岡工務店の請求書に入れる）。`setJob` で `startEstimate` を通す |
| `shinsei.ts` | 申請書：保険者ごとの転記する欄（`SHINSEI`。シートごとに 氏名・住所・番号の10マス・改修の内容・改修の種類の行・写真の改修箇所・平面図の表題・丸で囲む欄 `marks`・申請書の画面の項目の欄と書き方 `texts`）、改修費用（`shinseiCost`。苅田町・行橋市は見積書の合計、みやこ町・広域連合は介護保険対象分＝`costIsTotal`）、改修の内容の文（`workText`・`Place.shinseiText`。箇所ごとの行と手で直した文は `workItems`＝`Place.shinseiLine`）、転記する内容（`shinseiValues`。写真番号の改修の種類 `photoKinds`・撮影日 `photoDates` も）、原本のセルを書きかえる（`setCell`・`fillShinsei`＝開いて `fillFiles`→zip。式の答えも `updateRefs`。②〜⑥の行の折り返し `wrapKinds`。行が多い改修の内容の欄の文字を小さくする `fitLines`／`fitCell`／`fitLinesSize`（小さい文字の書式を styles.xml に足す `sizedStyle`）。苅田町の写真の用紙の□と撮影日 `photoBoxes`（`checkBoxes`・`boxLabels`・`placeBox`）。みやこ町・広域連合の写真貼付用紙の改修の種別の丸 `drawKindCircle`（`photoPlace.kindCircles`。原本の丸は消して、その写真番号の改修の種類に楕円。置き場所の画素は `anchorRect`）。丸の楕円 `drawMarks`・`markBox`（文字の位置は `textLayout`。プレビュー用に `markTexts`・`markOptions`）・図形のファイルを足す `drawingOf`・平面図の工事内容のテキストボックス `drawLegend`（`legend.box`。みやこ町は欄 `legend.cell`）・写真貼付用紙の写真 `drawPhotos`（`photoPlace` の枠を `photoNoteLayout` で写真の所と書く所に分け、写真の所に `photoPlacement`＝向き・大きさ `PhotoEdit` も。回す前の四角を置いて `<a:xfrm rot>` で回す。置き場所の from・to は `anchorBox`＝45〜135°・225〜315° は縦横を入れかえた四角（Excel の決まり）。`xl/media` の JPEG・図形のファイルの関係・`[Content_Types]` の jpeg。改修前の枠の書く所には写真に書く内容 `photoNoteLines` のテキストボックス `noteBoxXml`＝名前「改修前の説明」・文字の大きさ `photoNotePt`・字体は `<xdr:style>` のテーマの字体（改修後の枠は写真を枠いっぱい）。`photoImages` を渡したとき＝Excel で保存のときだけ）・写真番号の用紙 `photoSheets`・範囲の位置 `rangeBox`）、読む（`readShinsei`・`parseWorkLine`） |
| `shinseiPreview.ts` | 申請書のプレビューの材料：原本に `fillFiles` で転記したシートを読み、列の幅・行の高さ・結合・罫線（`joinLines`）・塗り・文字（字体・大きさ・配置・はみ出し・表示形式 `formatNumber`）・図形（中の文字の配置・余白も）・ヘッダーを画素の `PvPage` にする。押せる欄 `fields`（式で参照している欄も）・丸の値 `options`。ページは様式（`kind: 'form'`。範囲は罫線・塗り・文字の四角 `formRange`）・平面図（`'plan'`）・写真貼付用紙（`'photo'`。写真番号ごと、`photoSlots`＝改修前・改修後の枠）。平面図・写真貼付用紙の範囲は印刷の範囲（`printRange`）か印刷の1ページ目（`firstPage`）。大きさのない図形は出さない |
| `estimate/ShinseiEditor.tsx` | 申請書のタブ（左に一覧＝保険者ごとの申請書の順番 `FIELDS`・項目を入れる欄 `row(field, insurer)`・丸・10マス・入っていない欄・Enter で次の欄・改修の箇所と寸法 `WorksEditor`／`Dim`・改修費用、その下に写真。右にプレビュー＝`ShinseiPages`。入れている項目 `active` をプレビューで囲み、プレビューの欄を押すと `goField`。Excel で保存）。項目は `Job.shinsei`（`ShinseiInfo`。丸の値は `MARK_INFO`＝`estimateForms.ts`） |
| `estimate/ShinseiPreview.tsx` | プレビューを描く（縦書きの欄＝`PvText.vertical` は `VerticalText` で1文字ずつ下へ。`ShinseiPages`：紙の大きさを画面の幅に合わせて縮める・入れている項目の欄を囲んでプレビューの枠（`scrollBox`）の中で見える所まで動かす・欄を押すと `onOpen`（一覧のその項目へ）・丸の値を押す・写真貼付用紙の枠に写真を重ねる `PhotoSlotView`（`photoNoteLayout`・`photoPlacement` で Excel と同じ位置・向き・大きさ。改修前の枠だけ、写真に書く内容 `photos.note` を書く所に重ねる＝押せない文字。回している間は確定した向きで分けたまま。写真を押すと選んで、角のつまみ＝大きさ・上の丸＝向き（ドラッグ。90°の倍数の近く `ROT_SNAP` はそろう）・2本の指でひねる／つまむ・道具（↺ ↻・元に戻す・差し替え・完了。枠のすぐ下）。動かしている間は下書き、離したら `onEdit`。つまみ・道具は `1/zoom` で画面の大きさをそろえ、押せる所は `HIT`）・図形の文字 `ShapeText`） |
| `cutLink.ts` | 申請書の寸法（手すりの長さ L=）と見積書の切って使う部材（手すり・ベースプレート）の使う長さをつなぐ（`placeFromDims`＝申請書の長さ→見積書、`placeAfterQty`＝見積書の数量→もう一方と申請書、`fillAdded`＝入れた部材を箇所の長さに。`cutRow`・`dimsLengths`・`BASE_PLATE`） |
| `photos.ts` | 写真：縮めて JPEG に（`preparePhoto`。長い辺 1600画素）、暗い写真の明るさの補正（`brightLut`・`brightPhoto`。画面と Excel に出すとき）、撮影日（`photoTakenDate`／`exifDate`。元のファイルの Exif の撮影日時。縮める前に読む）、この端末の IndexedDB `taiyo-sasaoka-photos` に入れる・読む（`putPhoto`・`getPhotos`）、使われなくなった写真を消す（`prunePhotos`。`App.tsx` で開いたときに一度）、画面に出す URL（`usePhotoUrls`。この端末にない写真は null） |
| `estimate/PhotoBoard.tsx` | 申請書のタブの「📷 写真」（写真番号の箇所 `photoPlaces` ごとに改修前・改修後の枠。入れる・入れ替える・消す `usePhotoActions`＝`put`・`swap`・`remove`・`drop`・`setDate`・写真に書く内容の追加 `setNote`・向きと大きさ `setEdit`・写真番号の入れ替え `swapPlaces`。枠の下に「改修前の写真に書く内容」＝自動 `workText` と追加の欄（role group）。写真の入れ替えは押して選んでから相手の枠を押す（`press`）。撮影日の欄は `dates`＝原本に撮影日の欄のある苅田町だけ。写真・撮影日・向きは `withPhoto` で一緒に動かす。
箇所をつかんで（見出しでも写真の上でも。ポインターで、指でも）ほかの箇所に重ねて離すと写真番号の入れ替え `startCardDrag`（マウスはすぐ・指は見出し＝`data-drag-handle` ならすぐ、写真の上は `HOLD_MS` 押したままにしてから。
`data-no-drag`＝↻ ◀ ▶・撮影日の欄からはつかまない。つかんでいる間は `touchmove` を止めてスクロールさせない。画面の上下の端でスクロール。動かしたあとの click は捨てる）、◀ ▶ で隣と入れ替え。写真の右上の ↻ で右に 90°（`turn`）。枠の写真は `Thumb`（写真貼付用紙と同じ向き・大きさ）。箇所の幅 28rem 以上は見出しが左＝`@container`） |
| `photoEdit.ts` | 写真の向き・大きさ・位置（`PhotoEdit`＝`{rot, scale, x?, y?}`。rot は右回りの度、scale は枠いっぱい＝1 に対する大きさで 0.2〜1。1 より大きくしない＝申請書の大きさは変わらない。x・y は空きの中の位置 −1〜1、まん中なら持たない）。`normRot`・`clampScale`・`clampOff`・`cleanEdit`（そのままなら持たない）・`turn`（90°ずつ。位置はそのまま） |
| `estimate/shinseiFiles.ts`・`shinsei/*.xltx` | 申請書の原本（名残りを消したもの。`?inline` でビルドに入る＝`assetsInclude` に xltx）を開いて覚える（`openTemplate`・`useTemplate`）と保存（ダウンロード。写真番号の写真を読んで `photoImages` に入れる＝`photoImagesOf`、この端末にない写真の枚数を返す）。原本を作り直す手順は `business-rules.md` の11 |
| `estimate/EstimateList.tsx` | 見積もり・申請書の最初の画面（新規作成＝保険者を選ぶ／一覧から作成）、月ごとの一覧（一覧の月＝`Job.month`。作成日・お客様名・見積の合計・請求書の印。先頭のチェックで選んで `moveMonth`＝次月・前月に回す）、`newEstimate(insurer)`（見積もり作成日は空・請求書に入れない。見積書に行を入れたときに入る）、Excel 保存・複製・削除 |
| `estimate/OrderPage.tsx` | 発注書の画面（数の直し・消す・戻す・足す・印刷・販売受注簿に転記） |
| `order.ts` | 発注する数の計算（切って使う部材の本数・2000mm の品・余り0.1本）、手で直したところの重ね方、販売受注簿へ渡す JSON |
| `estimateXlsx.ts`・`xlsxWrite.ts` | 見積書を同じ形の .xlsx にする（列幅＝mm×96/25.4/8、固定の倍率で印刷、金額は式＋計算済みの値） |
| `components/JobEditor.tsx` ほか | 請求書のタブの様邸（仕切り計算表）、部材を選ぶ画面（`Pickers.tsx`）、施工費を数える画面（`JobTools.tsx`）、`KitsPage.tsx`（部材＋施工費（常用）） |
| `priceImport.ts`・`xlsx.ts`・`pdfText.ts` | メーカーの価格表（Excel・CSV・PDF・貼り付けた表）の取り込み。`pdfText.ts` の `pdfToImages` は PDF のページを写真（JPEG）にする（写真の枠に PDF を入れたとき） |
| `hokensho.ts` | 介護保険証の読んだ文字（行・語・字の位置）から項目を取り出す：読み違いの直し `fixOcr`、欄（語の間の大きなすき）`rowsOf`、位置から（生年月日の行から上へ）`locateValues`、ページごと `parsePage`、何回か読んだ結果をまとめる `parseCard`（形に合う・多い・自信・古い保険証は新しい期間）、`plausibleTerm`・`insurerOfName`・`warekiIso` |
| `cardImage.ts`・`cardRead.ts` | 介護保険証の画像の下ごしらえ（白黒・まわりの明るさのしきい値 `inkAdaptive`・回す・罫線を消す `removeLines`・ざらつき `despeckle`・字の行の向き `textIsVertical`・縦の罫線とます `verticalLines`・`valueRect`）と読む流れ `readCardImage`（読み取りの部品 `Recognize` を外から渡す。node のテストでも動く）。切り出して読み直す `readRect`（3つの大きさ・形に合う多い方）、読めなかった字の画 `missedStroke`、読み方ごとの設定 `OCR_MODES` |
| `cardOcr.ts`・`ocrEngine.ts`・`cardApply.ts`・`components/CardReader.tsx` | ブラウザで読む `readCards`（画像・PDF のページ。tesseract.js の worker は `withOcr` で写真の日付と使い回す）、様邸に入れる `applyCard`・はじめのチェック `defaultPicks`、ボタン `CardDrop`・確かめる画面 `CardDialog`・様邸の画面の `CardFill` |
| `stampDate.ts` | 日付入り写真に写っている日付を読む：字の行の切り出し `stampCrops`（`colorMask`・`keepGlyphs`・`lineCrops`。テストできる純粋な関数）、読んだ文字から日付 `parseStampDate`、ブラウザで読む `readStampDate`（tesseract.js の worker は `ocrEngine.ts` の `withOcr` で介護保険証と使い回し、1分で片付ける。写真を何枚も入れたら順に） |
| `storage.ts` | IndexedDB（`taiyo-sasaoka-shikiri`）への保存と、読み込むときの直し方（`cleanJobs` など。前の版のデータもここで今の形にする） |
| `sync.ts`・`useStore.ts` | 2つの画面（タブ）で同じデータを直したときのまとめ方、自動保存（0.4秒後）、`flush` |
| `update.ts`・`vite.version.ts` | `version.json` を見て「このアプリの新しい版が出ています ⟳ 読み込み直す」を出す |
| `samples.ts` | 「サンプルで試す」（サンプルの部材5件・（サンプル）山田様邸・部材＋施工費（常用）1件）、最初に入れる例のセット（`exampleKit`：BD-134＋BD-08G＋施工費） |

## 2. データの形（`types.ts`）

- `Job`（様邸）：customer・suffix（様邸／様）・staff（担当フルネーム）・date（施工日。請求書のタブで使う）・**estDate?**（見積もり作成日。空なら前に覚えた作成日か作った日＝`print/docMeta.ts` の `estimateDateOf`）・address・insuredNo・**insurer**（保険者）・form（保険者を選ぶ前の書式）・
  overhead／overheadTarget（諸経費を手で直したとき）・**shikiri**（笹岡工務店の請求書に入れる）・month（請求する月）・**places**・**order?**（発注書で直したところ）。
- `Place`（箇所）：name・kind（改修の種類1〜6）・photo（写真番号、0なら順番）・rows・dims?（申請書の改修の内容の寸法 `{l?, h?, w?, d?}`。読み込みは `cleanDims`）・shinseiText?（そのほか）・
  shinseiLine?（申請書の改修の内容を手で直した文＝写真番号のうしろ。空の文字も持つ＝空にした行。読み込みは `cleanPlace`、複製でも引き継ぐ）・
  photos?（写真貼付用紙の写真＝`photos.ts` の番号。`{before?, after?}`。読み込みは `cleanPhotos`、複製では引き継がない）・photoDates?（撮影日 'YYYY-MM-DD'。`{before?, after?}`。`cleanPhotoDates`、複製では引き継がない）・
  photoEdits?（写真の向き・大きさ `{before?, after?}` の `PhotoEdit`。`cleanPhotoEdits`、複製では引き継がない）・
  photoNote?（写真貼付用紙の改修前の写真に書く内容の追加の行。改行で区切る。空なら持たない。`cleanPlace`、工事の内容なので複製でも引き継ぐ）。
  写真番号の入れ替えは `swapPhotoNumbers`（`estimateForms.ts`）：箇所の順番と手で入れた番号（photo）の両方を入れ替える（写真・撮影日・向きは箇所が持っているので一緒に動き、見積書・申請書の改修の内容・平面図の番号もそろう）。
- `Row`（行）：kind（material／labor）・refId（部材リスト・手間のID）・name・code・maker・unit・price（仕切価格）・qty・listPrice・lengthCm（使う長さ）・pieceLengthM（1本の長さ）・
  estPrice（部材は見積の単価を手で。施工費はマスタの見積の単価を写したもの。null なら 定価×0.8／仕切り×1.5）・excluded（対象外）・estText／estNote／estAmount（見積書だけの手直し）。部材リストの値は選んだときに書き写す（あとでマスタを変えても過去の金額は変わらない）。
- `LaborItem`（取付手間）：name・price（仕切り）・estPrice（見積。null なら 仕切り×`estimateLaborRate`）・note。`Settings` の `kitExample`・`laborEst`・`tesuri` は「一度だけ入れた／直した」の印（例のセット・前の版の施工費の見積の単価・前に保存した名前の「手摺」→「手すり」。直すのは App.tsx の `useEffect`）。
- 見積書の行と入力の行の関係：部材の行1つが見積書の1行。そのすぐ下に続く手間の行（1つでも何行でも）は、見積書では「同上施工費」の**別の1行**にまとまる
  （箇所の最初の手間は「施工費」の1行）。見積書の明細の `tr` の `data-rows` に、その1行のもとになった入力の行のIDが入る。
- `sheetEdit.ts` の `unitRange` は、行の「✕」「コピー」が相手にする範囲：部材の行から押せば、部材＋すぐ下の手間の行（同上施工費）。同上施工費（手間）の行から押せば、その手間のまとまりだけ。

## 3. 保存・2つの画面の同期・新しい版の知らせ

- 保存はこの端末の IndexedDB だけ（サーバーなし）。使えないときは localStorage（`sasaoka-app:` で始まるキー）。設定からバックアップ（JSON）を保存・読み込みできる。
- 項目（materials・labor・jobs・kits・settings）ごとに保存のたびに印（`stamp:項目名`）を変え、ほかのタブ・アプリが保存したら読み直す。
  保存のときに印が違えば3つ（前に読んだもの・こちら・向こう）を比べ、様邸・箇所・行の項目ごとにまとめる（`sync.ts` の `mergeValue`）。IDのある並びはIDで比べる。
- 自動保存は打ち終わって0.4秒後。画面を閉じる・ほかのタブに移るときはすぐ（pagehide・visibilitychange）。見積書の「💾 保存」／Ctrl+S は `flush()`。
- スマホのブラウザは前の版を覚えていることがあるので、`version.json`（ビルドした日時）を開いて2秒後と画面に戻ったときに見て、違えば帯を出す（保存してから読み込み直す）。

## 4. 見積書に直接入力（`components/EstimateSheet.tsx`）の仕組み

- 見積書の書式（印刷と同じ描画）に、直せる欄だけ `data-edit`（欄のキー）を付ける。キー：`line:行ID:text|qty|unit|price|note`・`place:箇所ID:name|work|kind|photo`・
  `excl:行ID`（対象外）・`new:…`（いちばん下の打ち込める行）・`job:customer|insuredNo|address`・`overhead:all|target`・`date`。明細の `tr` には `data-rows`（もとの行のID）。
- 選んだ欄の上に見えない textarea を置いて、日本語入力をそのまま使う。打ち始めたら見える。Enter・Tab・矢印・F2・Esc・Delete・Ctrl+Z／Y は `onKeyDown`、
  Ctrl+C／X／V は textarea の `onCopy`／`onCut`／`onPaste`（OS の貼り付けの文字を使うため）。
- 候補：内容（品名）は部材リスト（★が先）、改修の種類は①〜⑥、改修場所は設定の箇所の名前。欄の「▼」か Alt+↓ で全部出す。
- 行の左のボタン（`RowTools`。印刷には出ない。文字は CSS の ::before で出して欄の文字に混ぜない）：挿入（`data-ins`。前は「＋」）・✕（`data-del`）・コピー（`data-copy`）。
  空白の行（`isBlankRow`）の欄の値（`sheetValue`）は空（内容の「材料費」・数量「1」などを出さない。F2・ダブルクリックで書き直すときも空から）。
  コピー中は「貼付」（`data-paste`）に替わり、コピーした行に `data-copied`（黄色）。ボタンを押しても欄を選ばないよう、`onMouseDown` で止めて `onClick` で処理する。
- 行のコピー：`lineRows`（部材は同上施工費ごと、施工費はまとまり）を `sheetClip` に覚える。貼り付けは `pasteLines(job, 欄のキー, 行, 切り取りなら消すID)`：
  行のすぐ下、空白の行ならその行、箇所の欄なら最初の行の下、いちばん下の行なら最後の箇所。Ctrl+V は OS の貼り付けの文字がコピーしたときの文字と同じときだけ行を貼る（違えば欄に文字）。
- 元に戻す（Ctrl+Z）・やり直す（Ctrl+Y）：変更のたびに前の Job を積む（100回まで）。1つの操作は1回の `change()` にまとめる（元に戻すが1回で済むように）。
  見積書の外での変更（部材リストから入れる・保険者・担当・請求書に入れる）も `useLayoutEffect` で見分けて積む（戻すのは Job の全体なので、積まないと Ctrl+Z でそれらまで消える）。
  自分の変更は、保存で `updatedAt` だけが付いて戻ってくるので `sameJob` で除く。続けての変更（打ち込み）は1秒以内なら1回にまとめる。
  Ctrl+Z／Y は欄を選んでいなくても `window` の keydown で効く（文字を打つ欄・ダイアログ・印刷の画面の中では効かない）。ボタンは置かない（ユーザーの指示）。
- 白紙に戻す（`estimate/EstimateEditor.tsx` の `clearSheet`。ボタンは「🖨 見積書を印刷」の横）：`confirm` で確かめてから customer・insuredNo・address・places・overhead・
  overheadTarget・order を空にする。保険者と書式は `jobInsurer`／`jobForm` の値で固定して残す（住所から決まっていた古い見積書でも書式が変わらないように）。
  見積書の外での変更なので、上のしくみで Ctrl+Z で戻せる。選んでいた欄がなくなったら、選択の枠の `useLayoutEffect` でお客様名の欄を選び直す（すぐ打ち込める）。
- **行の左のボタンを足すときの決まり**：
  - `RowTools` は2つの書式（苅田町・行橋市・みやこ町用・広域連合用）で共通（`print/EstimateForms.tsx` の YkLine と KkLine の両方から呼ぶ）。1か所直せば両方に出る。印刷・Excel には出ない。
  - 置き場所は見積書の左の余白だけ。入力の画面だけ表を右に寄せている（`sasaoka.css` の `.est-sheet .form-page.yk { padding-left: 28mm }`・`.kk { 29mm }`、書式ごとに別の指定）。
    「＋」を「挿入」にしたとき（2026-10-21）、入力の画面だけページを 300mm（`.est-sheet .form-page { width: 300mm }` と `EstimateSheet.tsx` の `PAGE_W`）に広げ、表を 3mm 右に寄せた（印刷は A4横 297mm のまま）。
    今の3つ（挿入・✕・コピー／貼付）でほぼいっぱい。ボタンを足すなら、同じように入力の画面だけページの幅と余白を広げ（`PAGE_W` も合わせる）、印刷の寸法は変えない。
    それか、今のボタンの役目を切り替える（コピー中は「コピー」が「貼付」になるように）。
  - 新しいボタンの `data-*` は、`EstimateSheet.tsx` の2か所に足す：`onMouseDown` の除外（`t.closest('[data-del], [data-ins], …')`。足さないと押したときに欄が選ばれる）と `onClick` の処理。
  - 行を上下に動かす機能は前にあった（ツールバーの「▲ 上へ」「▼ 下へ」と `moveLine()`）。ユーザーに「この部分は不要」と言われ、ツールバーの行の操作ごと外した（コミット 07ac611。
    `git show 07ac611^:src/sasaoka/sheetEdit.ts` で前の処理を見られる）。その処理には、部材を箇所の最初の「施工費」の上へ動かすと、その施工費が部材の同上施工費にまとまってしまう不具合があった。
    もう一度頼まれたら、行の左のボタンにして、同じ箇所の中だけで動かし、手間がまとまってしまう所では動かさない。e2e-sheet の「ツールバーに▲ 上へ・▼ 下へが無い」確かめと、ボタンの並びの確かめも直す。
  - 箇所をまたいで行を動かすときは、行のIDを変えない「移動」にしない（ほかのタブが同じ行を直していると、`sync.ts` の `mergeRecords` が同じIDの行を両方の箇所に残すことがある）。
    切り取り→貼り付け（新しいIDの写しを入れて、もとを消す）にする。今の Ctrl+X → Ctrl+V はこの形。

## 5. 項目・機能を足すときの手順

1. `types.ts` に足す。`Job` に足すなら `?:`（省略可）にする（テストや `JobsPage` が Job を直接作っているので、必須にすると全部直すことになる）。
2. `storage.ts` の `cleanJobs`（など）で読み込むときの値を決める。書かないと、読み直したときに消える。前のデータの値（移し替え）もここで決める。
3. 複製（`components/JobTools.tsx` の `copyJob`）で引き継ぐか決める（発注書の `order` は引き継がない）。
4. 2つの画面の同期は `sync.ts` が項目ごとに自動でまとめるので、ふつうは何もしなくてよい。
5. 画面の文字・ボタンを足したら、README（`README.md` の住宅改修の節）と、ポータルのタイルの使い方の文（taiyo-portal の `index.html` の `APPS`）も直す。
6. 単体テスト（`test/sasaoka/*.test.ts`）と、必要ならブラウザのテスト（`test/sasaoka/e2e-*.mjs`）を足す。e2e のボタンの名前（aria-label）を変えたら e2e も直す。

画面の作りの決まり：ボタンの色は機能ごと（`components/ui.tsx` の `COLORS`：emerald＝新規・追加、blue＝保存、rose＝削除、sky＝印刷、teal＝一覧・管理・転記、purple＝取り込み）。
お知らせは `useToast()`（エラーは 'error'）。モーダルは `Modal`。数の増減は `Stepper`、数字の欄は `NumberInput`（type=text・inputMode=decimal なので Playwright では getByLabel で探す）。
