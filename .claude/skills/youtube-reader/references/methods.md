# 読み取り方法の詳細

SKILL.md の表で方法を選んだあと、準備・コマンド・失敗したときの直し方を調べるときに読む。

## 目次
1. 方法の一覧
2. 環境ごとの準備（Windows の PC／クラウド／Cowork・claude.ai）
3. yt-dlp を直接使うとき
4. 音声ファイルからの文字起こし
5. エラーと対処
6. Gemini の費用と制限
7. ブラウザで読む・ユーザーに頼む

---

## 1. 方法の一覧

| # | 方法 | 取れるもの | 要るもの | 壊れにくさ |
|---|---|---|---|---|
| 1 | oEmbed | タイトル・投稿者・サムネイルの URL | youtube.com | とても安定 |
| 2 | 視聴ページ（`ytInitialPlayerResponse`） | 概要欄の全文・長さ・タグ・公開日・カテゴリ・字幕の一覧・ストーリーボードの場所・解像度と fps | youtube.com | 安定（YouTube の形式変更で壊れることはある） |
| 3 | チャプター | 投稿者のチャプター・自動チャプター（ページ内）、概要欄の「0:00 〜」行 | youtube.com | 安定 |
| 4 | サムネイル | `i.ytimg.com/vi/<ID>/maxresdefault.jpg`（無ければ sd → hq） | *.ytimg.com | とても安定 |
| 5 | ストーリーボード | シークバー用の縮小コマ（160×90 前後、数秒おき）を並べたシート | *.ytimg.com | 安定 |
| 6 | 字幕（timedtext） | 字幕の全文（手動・自動生成）、`--tlang` で自動翻訳 | youtube.com | 不安定（PO トークンが要る動画がある。クラウドの IP は 429 になりやすい） |
| 7 | yt-dlp | 字幕・動画・音声・詳しい情報 | yt-dlp＋JS ランタイム＋ffmpeg | 活発に保守されていて追従が早い |
| 8 | youtube-transcript-api（Python） | 字幕 | pip | クラウドの IP はほぼブロックされる（公式 README に明記）。PC 向け |
| 9 | Gemini に URL を渡す | 映像・音声・画面の文字をまとめて理解 | Gemini のキーと課金 | 安定。公開動画のみ |
| 10 | YouTube Data API v3 | 正式な統計・タグ・長さ | API キー | 安定。字幕のダウンロードは動画の所有者だけ |
| 11 | ブラウザ | 目で見る・文字起こしパネルを読む | Claude in Chrome／内蔵ブラウザ | 手作業 |
| 12 | ユーザーに頼む | 貼ってもらった文字・画像・ファイル | — | 最後の手 |

1〜6 は `yt-read.mjs`、7 は `yt-frames.mjs`、9 は `yt-gemini.mjs` がまとめて行う。

---

## 2. 環境ごとの準備

### ユーザーの Windows PC（Claude デスクトップアプリの Code タブ）
YouTube に普通に届くので、いちばん多くの方法が使える。
- Node：制作キット（ai-video-studio など）で入っている。`node -v` で 18 以上を確認
- yt-dlp：`winget install yt-dlp.yt-dlp`（公式の exe は yt-dlp-ejs を同梱）
- JS ランタイム：`winget install DenoLand.Deno`（推奨）。入れない場合は Node 22 以上を使う（`yt-frames.mjs` は自動で `--js-runtimes node` を付ける）
- ffmpeg：`winget install ffmpeg`
- 入れたあとはターミナルを開き直す（PATH を読み直すため）
- Gemini のキー：制作キットの `.env`（`%USERPROFILE%\Videos\ai-video-studio\.env` など）に `GEMINI_API_KEY` があれば自動で使う

### クラウドの作業環境（Claude Code on the web／Linux）
- yt-dlp：`pip install -U "yt-dlp[default]"`（yt-dlp-ejs も入る）。PyPI は既定で届く
- JS ランタイム：Node 22 以上が入っていれば node を使う（deno は不要）
- ffmpeg：たいてい入っている（`ffmpeg -version`）
- **ネットワーク**：既定（Trusted）では YouTube に届かない。ユーザーに環境の設定を変えてもらう
  - 画面上部のクラウド環境メニュー → 環境の編集 → Network access を **Custom**
  - Allowed domains に 1 行ずつ：`youtube.com` `*.youtube.com` `youtu.be` `*.ytimg.com` `*.googlevideo.com` `youtubei.googleapis.com`
  - 「Also include default list of common package managers」にチェックを入れたまま
  - 既存のセッションにも約 1 分で反映される
- YouTube はクラウドの IP に「Sign in to confirm you’re not a bot」を出すことがある。そのときは Gemini で読むか、PC で実行する
- Gemini（generativelanguage.googleapis.com）は環境に接続済みのことが多い（キーはプロキシが付ける）。`--check` で確認

### Cowork／claude.ai のチャット
- ネットワークが限られることが多い。Gemini のキーと課金があれば `yt-gemini.mjs` がいちばん確実
- どれも無理なら 7 章（ユーザーに頼む）

---

## 3. yt-dlp を直接使うとき

```bash
# 情報だけ（概要欄・チャプター・タグ・解像度・fps など全部入りの JSON）
yt-dlp --dump-json --skip-download "<URL>" > info.json

# 字幕だけ（手動＋自動生成、日本語と英語）
yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs "ja.*,ja,en.*,en" --sub-format vtt "<URL>"

# 分析用の低画質（480p 以下）
yt-dlp -f "bv*[height<=480]+ba/b[height<=480]" --merge-output-format mp4 -o "source.%(ext)s" "<URL>"

# 一部だけ（1:00〜2:30）
yt-dlp --download-sections "*1:00-2:30" -f "bv*[height<=480]+ba/b" -o "part.%(ext)s" "<URL>"

# ストーリーボード（縮小コマ。mhtml で保存）
yt-dlp -f sb0 "<URL>"

# deno が無く Node 22 以上があるとき
yt-dlp --js-runtimes node "<URL>" ...
```

- JS ランタイムの説明（公式）：https://github.com/yt-dlp/yt-dlp/wiki/EJS
- 毎回 `--js-runtimes node` を付けるのが面倒なら、yt-dlp の設定ファイル（Windows：`%APPDATA%\yt-dlp\config.txt`、Linux：`~/.config/yt-dlp/config`）に書く

---

## 4. 音声ファイルからの文字起こし

`yt-frames.mjs --audio` で `audio.wav`（16kHz モノラル）ができる。字幕が無い動画の声を文字にするとき：
- Gemini：`yt-gemini.mjs --mode transcript` が URL のまま使えるので、まずこちら
- ローカル：`pip install faster-whisper` で Whisper を動かす（CPU でも 10 分の音声が数分）
  ```python
  from faster_whisper import WhisperModel
  m = WhisperModel("small", compute_type="int8")
  segs, _ = m.transcribe("audio.wav", language="ja")
  for s in segs: print(f"[{int(s.start//60)}:{int(s.start%60):02d}] {s.text}")
  ```

---

## 5. エラーと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| 「接続を断られた」「Request was cancelled」「CONNECT 403」 | クラウドの作業環境のネットワーク制限 | 2 章の設定をユーザーに頼む。**第三者のミラー・ダウンロードサイト・別のプロキシで迂回しない** |
| 「Sign in to confirm you’re not a bot」／`LOGIN_REQUIRED` | クラウドの IP をボット扱い、または年齢制限 | Gemini で読む／PC で実行／ユーザーに頼む。他人のアカウントの Cookie は使わない |
| 字幕が空で返る・PO トークンが必要 | YouTube の新しい保護 | `yt-frames.mjs --subs`（yt-dlp）か `yt-gemini.mjs --mode transcript` |
| 字幕で HTTP 429 | 取得しすぎ・クラウドの IP | 時間をおく／yt-dlp／Gemini |
| yt-dlp「n challenge」「JS runtime」の警告・失敗 | JS ランタイムが無い・古い | deno を入れる、または Node 22 以上で `--js-runtimes node` |
| yt-dlp「Requested format is not available」 | 形式の指定が合わない | `-f "bv*+ba/b"` に緩める |
| Gemini 402 | クレジット切れ | ユーザーに AI Studio（https://aistudio.google.com）でチャージしてもらう |
| Gemini 400（private・unavailable など） | 非公開・限定公開・年齢制限・地域制限 | 公開動画のみ対応。ユーザーに頼む |
| Gemini 429 | 上限（無料枠は 1 日 8 時間） | 時間をおく・課金を有効に |
| Gemini が `RECITATION` で止まる | 書き写しと判断された | summary／scenes／breakdown に切り替える、範囲を短くする |
| カットがほとんど検出されない | ゆっくりしたディゾルブ・長回し・静止画の連続 | `--scene 0.15` で再実行、シートで目視 |
| シートに時刻が入らない | ffmpeg に drawtext が無い・書体が無い | index.md の表で時刻を読む |

---

## 6. Gemini の費用と制限

- 公開動画だけ（限定公開・非公開は不可）。1 リクエストに動画は 10 本まで（Gemini 2.5 以降）
- 無料枠は YouTube 動画を 1 日 8 時間まで。課金を有効にすると長さの上限なし
- トークンの目安：低解像度（`--res low`、既定）で 1 秒あたり約 100（10 分で約 6 万）。標準解像度は約 300／秒
- 長い動画は `--start/--end` で区切る。全体の流れは低解像度、細部だけ `--res high` で見直す
- `--fps` で 1 秒あたりのコマ数を変えられる（動きの速い動画は 2〜5、ほぼ静止なら 0.5）
- `--check` は動画の最初の 1 秒だけで課金・キーを確かめる（文字だけの呼び出しは通っても、動画はクレジット切れで止まることがあるため）
- 公式：https://ai.google.dev/gemini-api/docs/video-understanding

---

## 7. ブラウザで読む・ユーザーに頼む

### ブラウザ（Claude in Chrome／内蔵ブラウザの道具があるとき）
それぞれのスキル（chrome-browser／built-in-browser）を先に読む。
1. 動画のページを新しいタブで開く
2. 概要欄を「もっと見る」で開いて読む
3. 「…」→「文字起こしを表示」で文字起こしのパネルを開いて読む
4. 一時停止したまま、要所の時刻（例：0:00, 0:15, 0:30 …）にシークしてスクリーンショットを撮る
5. ユーザーのログイン状態やチャンネルには触らない（高評価・コメント・登録をしない）

### ユーザーに頼むもの（どの方法も使えないとき）
- タイトルと概要欄のコピー
- 文字起こしの全文（YouTube の「…」→「文字起こしを表示」→ 全部選択してコピー）
- 要所のスクリーンショット 5〜10 枚（時刻がわかるように）
- 動画ファイル（ユーザーが自分で持っている場合だけ）。あれば `yt-frames.mjs <ファイル>` で同じ分析ができる
