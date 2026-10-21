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
| `App.tsx` | 4つのタブ（📝 見積もりを作成する／🧾 請求書を確認する／📦 部材・施工費マスタ／⚙ 設定）、新しい版の帯、印刷の画面の開閉、発注書の画面の開閉 |
| `links.ts` | URL のうしろの `#tab=…&job=…&view=order`（読み直しても同じ所を開く）、ポータルの URL |
| `types.ts` | データの形（Material・LaborItem・Row・Place・Kit・Job・OrderLine・OrderEdits・Settings・Insurer…） |
| `calc.ts` | 金額の計算（仕切り計算表 ①〜⑦、見積の単価・数量・金額・合計、`isBlankRow`、`cutToLength`、空欄の価格の扱い） |
| `estimateForms.ts` | 見積書の2つの書式に並べる行（`formLines`・`paginate`）、備考の文字（`lineNote`・`cutCalc`）、保険者（`INSURER_INFO`・`jobInsurer`・`jobForm`・`insurerLabel`） |
| `print/EstimateForms.tsx` | 見積書の書式の描画（印刷と、見積書に直接入力の両方）。行の左のボタン `RowTools`（＋・✕・コピー／貼付） |
| `print/formLayout.ts` | 見積書の列幅・行の高さ（mm）。印刷と Excel 保存で同じ寸法を使う |
| `print/PrintView.tsx` | 印刷の画面（請求書・仕切り計算表・見積書・発注書）。A4、狭い画面では縮めて見せる |
| `print/OrderDoc.tsx` | 発注書（A4縦） |
| `components/EstimateSheet.tsx` | 見積書に直接入力（Excel のような操作。キー操作・候補・行のコピー・貼り付け） |
| `sheetEdit.ts` | 見積書の欄の値の読み書き（`applySheet`・`sheetValue`）、行の挿入・削除・コピー・貼り付け（`insertBlankAfter`・`deleteLine`・`lineRows`・`pasteLines`） |
| `rows.ts` | 行・箇所を作る部品（`newPlace`・`materialRow`・`laborRow`・`manualRow`・`copyRows`（IDを付け直す）・`addMaterial`・`workRange`・`kitRows`）。行の操作はこれを使う |
| `sheetClip.ts` | 行のコピーを覚えておく所（画面を移っても残る。別の見積書にも貼り付けられる） |
| `estimate/EstimateEditor.tsx` | 見積書の画面（💾 保存・📗 Excel・📝 申請書を作成・🖨 印刷・📄 白紙に戻す・🛒 発注書を作成・保険者・担当・見積もり作成日・笹岡工務店の請求書に入れる） |
| `shinsei.ts` | 申請書：保険者ごとの転記する欄（`SHINSEI`。シートごとに 氏名・住所・番号の10マス・改修の内容・改修の種類の行・写真の改修箇所・平面図の表題）、転記する内容（`shinseiValues`）、原本のセルを書きかえる（`setCell`・`fillShinsei`。式の答えも `updateRefs`）、読む（`readShinsei`・`parseWorkLine`） |
| `estimate/shinseiFiles.ts`・`shinsei/*.xltx` | 申請書の原本（名残りを消したもの。`?inline` でビルドに入る＝`assetsInclude` に xltx）と保存（ダウンロード）。原本を作り直す手順は `business-rules.md` の11 |
| `estimate/EstimateList.tsx` | 見積もりの最初の画面（新規作成＝保険者を選ぶ／一覧から作成）、月ごとの一覧、`newEstimate(insurer)`、Excel 保存・複製・削除 |
| `estimate/OrderPage.tsx` | 発注書の画面（数の直し・消す・戻す・足す・印刷・販売受注簿に転記） |
| `order.ts` | 発注する数の計算（切って使う部材の本数・2000mm の品・余り0.1本）、手で直したところの重ね方、販売受注簿へ渡す JSON |
| `estimateXlsx.ts`・`xlsxWrite.ts` | 見積書を同じ形の .xlsx にする（列幅＝mm×96/25.4/8、固定の倍率で印刷、金額は式＋計算済みの値） |
| `components/JobEditor.tsx` ほか | 請求書のタブの様邸（仕切り計算表）、部材を選ぶ画面（`Pickers.tsx`）、施工費を数える画面（`JobTools.tsx`）、`KitsPage.tsx`（部材＋施工費（常用）） |
| `priceImport.ts`・`xlsx.ts`・`pdfText.ts` | メーカーの価格表（Excel・CSV・PDF・貼り付けた表）の取り込み |
| `storage.ts` | IndexedDB（`taiyo-sasaoka-shikiri`）への保存と、読み込むときの直し方（`cleanJobs` など。前の版のデータもここで今の形にする） |
| `sync.ts`・`useStore.ts` | 2つの画面（タブ）で同じデータを直したときのまとめ方、自動保存（0.4秒後）、`flush` |
| `update.ts`・`vite.version.ts` | `version.json` を見て「このアプリの新しい版が出ています ⟳ 読み込み直す」を出す |
| `samples.ts` | 「サンプルで試す」（サンプルの部材5件・（サンプル）山田様邸・部材＋施工費（常用）1件）、最初に入れる例のセット（`exampleKit`：BD-134＋BD-08G＋施工費） |

## 2. データの形（`types.ts`）

- `Job`（様邸）：customer・suffix（様邸／様）・staff（担当フルネーム）・date（施工日。請求書のタブで使う）・**estDate?**（見積もり作成日。空なら前に覚えた作成日か作った日＝`print/docMeta.ts` の `estimateDateOf`）・address・insuredNo・**insurer**（保険者）・form（保険者を選ぶ前の書式）・
  overhead／overheadTarget（諸経費を手で直したとき）・**shikiri**（笹岡工務店の請求書に入れる）・month（請求する月）・**places**・**order?**（発注書で直したところ）。
- `Place`（箇所）：name・kind（改修の種類1〜6）・photo（写真番号、0なら順番）・rows。
- `Row`（行）：kind（material／labor）・refId（部材リスト・手間のID）・name・code・maker・unit・price（仕切価格）・qty・listPrice・lengthCm（使う長さ）・pieceLengthM（1本の長さ）・
  estPrice（部材は見積の単価を手で。施工費はマスタの見積の単価を写したもの。null なら 定価×0.8／仕切り×1.5）・excluded（対象外）・estText／estNote／estAmount（見積書だけの手直し）。部材リストの値は選んだときに書き写す（あとでマスタを変えても過去の金額は変わらない）。
- `LaborItem`（取付手間）：name・price（仕切り）・estPrice（見積。null なら 仕切り×`estimateLaborRate`）・note。`Settings` の `kitExample`・`laborEst` は「一度だけ入れた」の印（例のセット・前の版の施工費の見積の単価）。
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
- 行の左のボタン（`RowTools`。印刷には出ない。文字は CSS の ::before で出して欄の文字に混ぜない）：＋（`data-ins`）・✕（`data-del`）・コピー（`data-copy`）。
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
  - 置き場所は見積書の左の余白だけ。入力の画面だけ表を右に寄せている（`sasaoka.css` の `.est-sheet .form-page.yk { padding-left: 25mm }`・`.kk { 26mm }`、書式ごとに別の指定）。
    今の3つ（＋・✕・コピー／貼付）でほぼいっぱい。ページは 297mm（`EstimateSheet.tsx` の `PAGE_W`）で、表の右端もほぼ端まで来ている。ボタンを足すなら、
    入力の画面だけページの幅と余白を広げ（`PAGE_W` も合わせる）、印刷の寸法は変えない。それか、今のボタンの役目を切り替える（コピー中は「コピー」が「貼付」になるように）。
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
