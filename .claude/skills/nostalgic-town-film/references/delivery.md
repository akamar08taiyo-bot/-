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

## 5. 費用の報告

台帳（`assets/gen/ledger.json`、`assets/veo/ledger.json`）から数えて概算を伝える：画像 1枚 約$0.13、Veo Lite 1080p 8秒 $0.64、Veo Fast 8秒 約$1.20、Gemini の分析・試聴・音声は合計 $1 未満。正確な額は Google AI Studio の請求画面で、と添える。
