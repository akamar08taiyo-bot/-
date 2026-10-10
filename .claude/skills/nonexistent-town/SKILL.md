---
name: nonexistent-town
description: "YouTube チャンネル「存在しない街の記憶」系の動画（実在しない街の、知らないのに懐かしい記憶を描く映像）を 1 本ずつ作る。参考動画の作り方（youtube-reader で分析したスタイル設計書）に沿い、毎回オリジナルの街を設定から作って、画像（Gemini）・語り（Gemini TTS）・BGM（Lyria）・環境音を用意し、ffmpeg でゆっくり動く映像・フィルムの質感・テロップ・音量調整まで仕上げ、サムネイル・タイトル・概要欄（AI 生成と架空であることの開示つき）まで出す。「存在しない街の動画を作って」「次の街」「架空の街の記憶」「#〇〇 の回」「ショート版も」「参考動画みたいな街の動画」などで必ず使う。"
---

# 存在しない街の記憶：1 本作る

実在しない街を 1 つ作り、その街の「知らないのに懐かしい記憶」を、ゆっくり動く画・質感・音・短い言葉で見せる動画を作る。
参考動画からは**作り方（型・技法・リズム・質感）だけ**を借り、街・画・言葉・音は毎回新しく作る。

- `<SKILL>` はこの SKILL.md のフォルダ（`scripts/` がある所）。スクリプトは Node 18 以上と ffmpeg だけで動く
- 画像・語り・BGM の生成には Gemini の API キー（課金あり）を使う。キーはユーザー自身に `.env` へ書いてもらい、表示・出力・コミットしない
- 詳しい書き方は `references/`（必要になったところで読む）

| ファイル | いつ読む |
|---|---|
| `references/style-bible.md` | 最初に毎回（このチャンネルの型。参考動画の分析結果が入る） |
| `references/episode-schema.md` | episode.json を書くとき |
| `references/image-prompts.md` | 画像の指示を書く・できた画像を確かめるとき |
| `references/narration.md` | 語りを入れるとき |
| `references/sound.md` | BGM・環境音・音量を決めるとき |
| `references/publish.md` | タイトル・概要欄・投稿の設定 |
| `references/qa.md` | 検品のエージェントに渡す |

## 0. 準備

1. **作業フォルダ（シリーズ）**を決める。指定が無ければ、PC なら `%USERPROFILE%\Videos\nonexistent-town`、クラウドの作業環境なら `~/nonexistent-town`。中身：
   ```
   nonexistent-town/
     style-bible.md   … このチャンネルの型（無ければ <SKILL>/references/style-bible.md をコピー）
     formats.json     … 尺・場面数・質感などの数値（無ければ <SKILL>/references/formats.json をコピー）
     towns.json       … 作った街の台帳（town-seed.mjs が書く）
     ep001/ …         … 1 本ごとのフォルダ（town.json・plan.md・episode.json・images/・voice/・audio/・out/）
   ```
   既存のエピソードのフォルダは上書き・削除しない。
2. **道具の確認**：`node <SKILL>/scripts/check.mjs`（Node・ffmpeg・日本語の書体・Gemini のキーと課金）。✗ は表示どおりに直す。Gemini が使えないなら、画像・声・BGM はユーザーの手持ちの素材か、ffmpeg の環境音だけで作れる範囲を伝える。
3. **スタイル設計書を読む**：`<シリーズ>/style-bible.md`。冒頭の「状態」が **未分析** なら、先に参考動画を分析する（1 章）。

## 1. 参考動画の分析（未分析のとき・新しい参考動画をもらったとき）

youtube-reader スキルの「制作分析」で作り方を抜き出し、`style-bible.md` の A 章に書き写す。分析が終わったら B 章（このチャンネルの型）と `formats.json`・`imageStyle` の数値を、分析結果に合わせて直し、状態を「分析済み：日付」にする。

- 参考動画：style-bible.md に書いてある URL（最初の 1 本は https://youtu.be/k8FsvnQfamo ）
- YouTube にも Gemini にも届かず分析できないときは、**推測で型を作らない**。何が要るか（ネットワークの許可・Gemini のチャージ・動画の説明やスクリーンショット）をユーザーに伝える。ユーザーが「仮の型で進めて」と言ったときだけ、B 章の「仮の型」で作り、納品時に「参考動画の分析前の仮の型で作った」と添える。

## 2. 街を決める

```
node <SKILL>/scripts/town-seed.mjs --count 3 --registry <シリーズ>/towns.json
```
過去の街と名前・要素がかぶらない候補が 3 つ出る（立地・町の性格・時代と季節・場所・音・色・視点・記憶の断片・少しだけ不思議なこと）。
1. ユーザーがいれば選んでもらう。任せられたら、まとまりがよく前回と雰囲気が違うものを選び、理由を 1 行で伝える
2. **町名が実在しないことを検索で確かめる**（自治体名・有名な地名・駅名・作品名）。あれば別の候補にする
3. 選んだ候補で保存：`node <SKILL>/scripts/town-seed.mjs --seed <その seed> --count 1 --registry <シリーズ>/towns.json --out <シリーズ>/ep<番号>`
4. カードは「たたき台」。ちぐはぐな所や、もっと良くなる所は town.json を書き換えてよい

## 3. 企画と設計図（plan.md・episode.json）

```
node <SKILL>/scripts/new-episode.mjs --town <ep>/town.json --format long|short|ambient --series <シリーズ>
```
型（formats.json）に沿った `episode.json` の骨組みと `plan.md` ができる。TODO を埋める：
1. **plan.md**：この回の芯（見終わったあとに残したい感情を 1 文）、流れ（導入→歩く→記憶の核→不思議の気配→余韻）、場面ごとの中身、語り、音
2. **episode.json**（書式は `references/episode-schema.md`）
   - `shots[].prompt`：何が・どこに・時間帯・天気・構図（`references/image-prompts.md` の型）。同じ構図・距離が続かないよう、遠景・中景・寄り・物のアップを混ぜる
   - `shots[].caption`：短い言葉だけ（地名・場所名・年・季節。文章にしない）
   - `audio.voice[].text`：語りを入れる回だけ（`references/narration.md`）
   - `music.prompt`・`title`・不要な TODO の削除
3. ユーザーがいれば plan.md の要点を 3 行で見せる。急いでいる様子なら返事を待たずに進める

## 4. 素材を作る

作る前に、この回の見込み（画像の枚数、語りの行数、BGM の有無）を 1 行で伝える（Gemini の利用料がかかるため）。
1. **画像**：まず 2 枚だけ `node <SKILL>/scripts/gen-images.mjs <ep>/episode.json --only 1,2` → Read で見て良い方を `imageRefs` に入れる（絵柄をそろえる基準）→ 残りを `gen-images.mjs <ep>/episode.json`。**全部を自分の目で見る**（文字・ロゴ・顔・実在の場所っぽさ・時代に合わない物・崩れ・似た構図の連続）。だめな場面は prompt を直して `--only 番号`
2. **語り**（入れる回だけ）：`node <SKILL>/scripts/gen-voice.mjs <ep>/episode.json`。町名などの読みは `speak` にかなで書く。長さの警告が出た行は聞き直してもらう
3. **BGM**：`node <SKILL>/scripts/gen-music.mjs <ep>/episode.json`（Lyria。歌なし）。ユーザーの手持ちの曲を使うなら、権利（商用・YouTube で使えるか）を確かめてから `audio.bgm.file` に置く
4. **環境音**：`node <SKILL>/scripts/gen-ambience.mjs <種類> --dur <秒> --out <ep>/audio/amb_<種類>.wav`（rain・wind・waves・room・crickets・cicada・crossing・chime・clock・hum）。足りない音は Lyria や権利のはっきりした素材で（`references/sound.md`）

## 5. 組み立てて確かめる

1. 下書き：`node <SKILL>/scripts/render-town.mjs <ep>/episode.json --draft` → `out/<id>_draft_check/sheet.jpg`（全体の 12 コマ）を Read で見る。気になる時刻は `--stills 秒,秒` で確かめる
   - 見るところ：文字の重なり・読みにくさ、暗すぎ・明るすぎ、同じ動きの連続、つなぎの違和感、タイトルの見え方、最後のフェード
   - 直して下書きをもう一度（3 回以内に形にする）
2. 本番：`node <SKILL>/scripts/render-town.mjs <ep>/episode.json` → 検査がすべて ✓（解像度・fps・映像と音の長さ・-14 LUFS・ピーク）。1080p は動画の長さの 4 倍ほどかかるので、長い回は裏で動かす
3. 語りのある回は `out/<id>.srt`（字幕）もできる

## 6. サムネイル・タイトル・概要欄

1. `node <SKILL>/scripts/make-thumb.mjs --image <いちばん強い画像> --title "<町名>" --sub "存在しない街の記憶 #<番号>" [--stamp "…"] --grade <look.grade> --out <ep>/out/thumb.jpg` → Read で縮小しても読めるか確かめる
2. タイトル案 3 つと概要欄を `references/publish.md` の型で書き、`out/<id>_概要欄.txt` に保存。概要欄には「この町は実在しない」「AI で生成した映像・音声」を必ず入れる

## 7. 検品（別のエージェント 2 人を並列で）

`references/qa.md` の「品質」と「オリジナリティ・安全」を、general-purpose エージェントにそれぞれ渡して並列で頼む（動画・サムネイル・episode.json・plan.md・style-bible.md・towns.json のパスを渡す）。指摘は直して書き出し直す（小さな手間で直せる「できれば」も直す）。

## 8. 納品と記録

1. 渡すもの：`out/<id>.mp4`、`out/thumb.jpg`、`out/<id>_概要欄.txt`、（あれば）`out/<id>.srt`。クラウドの作業環境なら会話にファイルとして送る（コンテナは消えるため。動画はリポジトリにコミットしない）
2. 台帳に記録：`node <SKILL>/scripts/town-seed.mjs --register <ep>/town.json --registry <シリーズ>/towns.json --title "<タイトル>"`
3. 報告は短く：完成ファイル、使った声と BGM の作り方、人の目と耳で確かめてほしい所（冒頭・町名の読み・画像の細部）、投稿時の設定（`references/publish.md`：改変・合成コンテンツの開示を「はい」など）

## ショート版を作るとき

同じ街で縦 1080×1920 の 30〜50 秒。`--format short` で別のエピソードのフォルダを作る（例 `ep003_short`。town.json をコピー）。
- 画像は 9:16 で作り直すのが一番きれい（`imageAspect: "9:16"`）。横長の画像を使い回すなら場面に `"fit": "contain-blur"`
- 最初の 2 秒で町名と年を見せる。終わりは最初の画に戻るとループして見られる

## いつも守ること

- **パクらない**：参考動画の台詞・文章・町名・特定の画・音楽・サムネイルの構図を使わない。借りるのは型だけ（style-bible.md の「借りてよいもの」）
- **実在に寄せない**：実在の地名・駅名・店名・ブランド・ロゴ・実在の人物の顔や声を出さない。画像に読める文字を入れない
- **架空であることを隠さない**：概要欄で「実在しない町」「AI 生成」を明記し、写真のように本物らしい映像なら YouTube の「改変または合成されたコンテンツ」を「はい」にするよう伝える
- **量産に見せない**：毎回、街・色・動きの順・オープニング・サムネイルの構図を変える。語りや選び方に作り手の視点を入れる（YouTube の「不自然なコンテンツ（量産・繰り返し）」の収益化ルールに当たらないように）
- 作業ファイルはエピソードのフォルダの中だけ。既存の回を上書き・削除しない。API キーを表示しない
