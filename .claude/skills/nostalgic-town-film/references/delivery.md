# 納品と保存

## 1. 会話に添付する軽量版（30MiB 未満）

会話への添付（SendUserFile）は1ファイル 30MiB まで。7分の作品なら 480p の2パスで約27MB：

```bash
SLUG=$(python3 -c "import json;print(json.load(open('src/timeline.json')).get('slug','film'))")
for v in theme asmr; do
  ffmpeg -y -i out/${SLUG}_$v.mp4 -vf scale=854:480:flags=lanczos -c:v libx264 -preset slow -b:v 440k -pass 1 -passlogfile work/$v -an -f mp4 /dev/null
  ffmpeg -y -i out/${SLUG}_$v.mp4 -vf scale=854:480:flags=lanczos -c:v libx264 -preset slow -b:v 440k -pass 2 -passlogfile work/$v -c:a aac -b:a 96k -movflags +faststart out/mini_${v}_480p.mp4
done
```

尺が違うときは、映像のビットレート ≒ (28×8×1024×1024 / 尺秒) − 96000 で決める。送る前に数コマ取り出して、字幕や電子版の文字が読めることを確かめる。

## 2. 高画質の上映ページ（Artifact）

Artifact が配信できるのは .html .css .js .json .txt .jpg .png .mp4 .webm .mp3 .wav など。**.m3u8 と .ts は拒否される**。1ファイル 15MB、1回の公開 64MB・255ファイル、1版で合計 256MB まで。そこで：

```bash
python3 -I scripts/make_screening.py      # work/screen/（poster.jpg、hls/…、batches/batch_N.json）
```

- 映像 1080p（平均 3.8Mbps、2秒ごとのキーフレーム、10秒ごとの分割 MP4）と、音2種類（AAC 128k）を HLS の別トラックにする。目次は .txt
- ページは `site/screening.html`（hls.js 1.5.20 を jsDelivr から読み込む）。題・副題・章（`CHAPTERS`）・本文・事実の表を作品に合わせて書き換える。iPhone は iOS 17.1 以降（ManagedMediaSource）で再生できる。`video.disableRemotePlayback = true` が要る

公開は Artifact ツールで、同じ `file_path` に何回かに分けて：

1. 1回目：`file_path: <作業フォルダ>/site/screening.html`、`icon: "film"`、`description`（1文）、`root: <作業フォルダ>/work/screen`、`files: batch_1.json の中身`
2. 2回目以降：同じ `file_path` と `root`、`files: batch_N.json の中身`（前の回のファイルは残る）

公開前の確認：この環境の Playwright の Chromium は H.264／AAC を再生できない（MediaSource.isTypeSupported が false）。ページの仕組みを試すときは、同じ形で VP9＋Opus の短い試験用ストリームを作り、目次の読み込み・音の切り替え・章の移動を確かめる。スマホ幅（390px）で横にはみ出さないことも見る。

ページは非公開。他の人に見せるにはユーザーがページの共有メニューから共有する、と伝える。

## 3. 保存（作業環境は使い捨て）

- コードと文書と原画、`assets/veo/*.mp4`（有料で生成した元動画）はリポジトリに入れる。元動画を入れるときはユーザーに確認（数百MB になる）
- スロー化したクリップ・カットごとの書き出し・完成品・一時ファイルは入れない（.gitignore 済み）。元動画とコードから作り直せる
- コミットは作業の区切りごとに。プルリクエストは頼まれた時だけ

## 4. YouTube 用の文案（docs/youtube_description.txt）

- タイトル：`<作品名>｜<作品のテーマの言葉>｜<年代>の<舞台>【第N章】`。環境音版は `<作品名>｜<テーマの言葉>【環境音のみ｜作業用・睡眠用】`。100文字まで。スマホでは前の40字ほどしか見えないので、作品名とテーマの言葉を前に置く
  - 第一章の例：`AIと人間の共存｜変わっていくもの、変わらないもの。僕の大好きなあの頃は、そのままに｜昭和を残した2080年の海辺の町【第一章】`
- 概要欄（5,000文字まで。検索結果や「もっと見る」の前に出るのは最初の2〜3行）：
  1. テーマの言葉（2行）
  2. 作者の想い：変わっていく時代とその先の希望、それでも変わらないでいてほしいもの（作品の中の具体的な場面で）
  3. 物語：日付と舞台、世界の説明、一日の流れ
  4. 台本・制作へのこだわり（第一章では「台本はすべて自分で考え、何度も書き直した。いちばん大切にしたのはストーリー」）
  5. 視聴者への呼びかけ（例「あなたの“変わらないでほしいもの”をコメントで」）
  6. 目次：章の時刻（00:00 から、各章10秒以上）→ 次回予告の題
  7. 架空である注記 → AI 生成と制作方法の注記（画像・動画・声が AI であること）→ ハッシュタグ
- 作者の想いと制作の話は、作者（ユーザー）の一人称で、ユーザーが話した言葉と事実だけをもとに書く（作り方についての主張を足さない）。書いたら本人に読んでもらう
- 文に `<` `>` は使えない。場面の列挙は字幕・構成表と照らして、映像に本当にあるものだけにする
- アップロード時：「改変または合成されたコンテンツ」を「はい」
- 他作品へのオマージュを入れても、その作品名をタイトル・概要欄・タグに入れない（関係のない作品名で人を集める表示になるため）

実例：assets/examples/youtube_description_example.txt

### サムネイル（scripts/make_thumbnail.py）

- 各章 A・B の2案を作る。A は作品の心にいちばん近い一場面（第一章：ロボットに寄りかかって花火を見る子ども）、B は別の切り口（町並みの夕景、昭和の回想など）。YouTube のサムネイルのテスト機能が使えれば、A と B を比べる
- 文字は2行・16字まで、本編と同じ Zen Old Mincho（太字）。横書きか、章題と同じ縦書き。タイトルと同じ言葉は使わず、タイトルを補うひと言にする（例「2080年の、昭和の夏。」「砂の向こうに、あの夏があった。」）
- シリーズ名「AIと人間の共存　第N章」を小さく、毎回同じ位置（左上。絵と重なるときは左下）に入れる
- 文字の側だけ絵をなめらかに暗くし、影と細い縁取りで読みやすくする。スマホの一覧の大きさ（320×180）でも読めるかを一覧画像で確かめる
- まだ映像のない章は、Gemini でキービジュアルを作る（のちにその章の原画にも使う）。昭和の回想の絵は「本物の写真」「線画やアニメにしない」「白い縁を付けない」と強く書かないと、イラストになることがある

## 6. YouTube 投稿キット（話ごとのページ）

作者が YouTube に載せるものを、話ごとに1ページへまとめた Artifact。上から順に、コピーと保存だけで投稿できる（作者の要望「ワンクリックでコピーや保存しやすく」）。道具は `assets/posting-kit/`（シリーズの作業フォルダの横に `videos/posting-kit/` として置く）。

| 手順（YouTube Studio の順） | ページにあるもの |
|---|---|
| 1 動画ファイル | 版の切り替え（テーマ曲入り／環境音のみ）、試写（480p）、元の画質の MP4 の保存 |
| 2 タイトル | 版ごとのタイトルと別案。コピー、文字数（100字まで） |
| 3 説明 | 版ごとの概要欄（コピー・テキストで保存）、目次。もう一つの章の URL を入れると「（…URLを貼る）」の所に入る |
| 4 サムネイル | A（おすすめ）と B の保存 |
| 5 再生リスト・視聴者 | 設定の一覧 |
| 6 改変コンテンツ・タグ | 「改変または合成」＝はい、タグのコピー（500字まで）、気をつけること |
| 7 公開のあと | 固定コメントの紹介文、終了画面、もう一つの章の概要欄の差しかえ |
| 台本 | 全文（Markdown を表示）、コピー・保存 |

各手順に「済」のチェック（閲覧者のブラウザに残るだけ）。見出しと結びに作者の言葉を1行ずつ。

```bash
cd videos/posting-kit
python3 -I split_video.py ep2 ../<作品>/out/<slug>_theme.mp4 ../<作品>/out/<slug>_asmr.mp4   # 映像を共有する形に分ける
# 映像の束 out/media/ep2/v*.mp4 を Artifact の保存場所へ（Artifact ツール：url, asset: true, file_paths 25本ずつ）
python3 -I set_urls.py ep2 < 対応表.txt      # 「v00.mp4 /_blob/…」の行を、out/video/ep2.json へ
python3 -I build_kit.py                       # 文書・サムネ・台本・timeline.json → out/kit.html（試写も分ける）
# 公開：file_path out/kit.html、root out、files にサムネ・音の束（media/<話>/a_*.mp4）・試写（preview/*.mp4）、capabilities {downloads: true, assets: {}}
```

- **文の元**：各話の `docs/youtube_*.txt` を【見出し】ごとに読む。目次の時刻は timeline.json から計算し直すので、カットを足しても自動で合う。環境音のみ版の概要欄は、文書の指示（2行を足す、ハッシュタグを替える）どおりに作る
- **動画の置き方**：2つの版は映像がまったく同じなので、`-c copy` で断片化 MP4（`frag_keyframe+empty_moov+default_base_moof+separate_moof`）にし、映像の断片は1組、音の断片は版ごとに持つ。ページは「頭（ftyp＋moov、JSON に base64）→ 断片を元の順に（束の中の位置と長さ）→ 終わり（mfra）」を Blob でつなぎ、元の fMP4 と同じバイト列に戻す（split_video.py が SHA-256 で確かめる。ページでも同じ値になることを試験した）。2話×2版（約1.9GB）が約1GB に収まる
- **置き場所の上限**：Artifact の保存場所（assets）は1作品 1GiB・1ファイル 20MiB。ページのファイルは別に合計 256MB・1ファイル 15MB。映像の束（19MiB）は保存場所へ、音の束（14MB）と試写は公開ファイルへ
- **保存**：`downloads` 機能（`await claude.use("downloads")` → `save({filename, data: Blob})`）。閲覧者に確認が出る。断られた（declined）・ほかの確認が開いている（rate_limited）・大きすぎる（too_large：Android の Claude アプリは 200MiB まで）を、それぞれ言葉で伝える。ビューアの外（ファイルを直接開いた時）は保存できないと表示する
- **コピー**：クリックの中で `navigator.clipboard.writeText`。断られたら文字を選んだ状態にする
- **確かめ方**：この環境のヘッドレス Chromium は H.264 を再生できないが、ページの「読み込み → Blob → SHA-256」は試験できる（手元のサーバーで、url を外して公開ファイルの path から読む版を作る）。スマホ幅・暗い色の表示も見る
- 古い上映ページには、最新版は投稿キットにあることを書き足す

## 5. 費用の報告

台帳（`assets/gen/ledger.json`、`assets/veo/ledger.json`）から数えて概算を伝える：画像 1枚 約$0.13、Veo Lite 1080p 8秒 $0.64、Veo Fast 8秒 約$1.20、Gemini の分析・試聴・音声は合計 $1 未満。正確な額は Google AI Studio の請求画面で、と添える。
