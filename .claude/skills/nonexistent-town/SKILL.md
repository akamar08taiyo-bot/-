---
name: nonexistent-town
description: "YouTube チャンネル「存在しない街の記憶」系の動画（実在しない町の、季節をまたいだ暮らしと景色を、語りもテロップもなく映像と環境音だけで見せる約 20 分の映画のような環境映像）を 1 本ずつ作る。参考動画を分析したスタイル設計書に沿って、毎回オリジナルの町を設定から作り、章立て・画像（Gemini）・一部を動かす AI 動画（Veo）・環境音・BGM を用意し、ffmpeg で質感・つなぎ・音量調整まで仕上げ、サムネイル・タイトル・概要欄（架空と AI 生成の開示つき）まで出す。「存在しない街の動画を作って」「次の町」「架空の町の環境映像」「#〇〇 の回」「ショート版も」「参考動画みたいな町の動画」などで必ず使う。"
---

# 存在しない街の記憶：1 本作る

実在しない町を 1 つ作り、その町の季節をまたいだ暮らしと景色を、**説明なし（語り・テロップなし）で映像と音だけ**で見せる、約 20 分の環境映像を作る。
参考動画からは**作り方（型・技法・リズム・質感）だけ**を借り、町・画・音は毎回新しく作る。

- `<SKILL>` はこの SKILL.md のフォルダ（`scripts/` がある所）。スクリプトは Node 18 以上と ffmpeg だけで動く
- 画像・AI 動画・BGM の生成には Gemini の API キー（課金あり）を使う。キーはユーザー自身に `.env` へ書いてもらい、表示・出力・コミットしない
- 詳しい書き方は `references/`（必要になったところで読む）

| ファイル | いつ読む |
|---|---|
| `references/style-bible.md` | 最初に毎回（参考動画の分析と、このチャンネルの型） |
| `references/episode-schema.md` | episode.json を書くとき |
| `references/image-prompts.md` | 画像・動きの指示を書く／できた画像と動画を確かめるとき |
| `references/sound.md` | 環境音・BGM・音量を決めるとき |
| `references/publish.md` | タイトル・概要欄・投稿の設定 |
| `references/qa.md` | 検品のエージェントに渡す |
| `references/narration.md` | 語りを入れる特別な回だけ（標準の型には語りは無い） |

## 0. 準備

1. **作業フォルダ（シリーズ）**：指定が無ければ、PC なら `%USERPROFILE%\Videos\nonexistent-town`、クラウドの作業環境なら `~/nonexistent-town`。
   ```
   nonexistent-town/
     style-bible.md   … このチャンネルの型（無ければ <SKILL>/references/style-bible.md をコピー）
     formats.json     … 尺・章・質感・音の数値（無ければ <SKILL>/references/formats.json をコピー）
     towns.json       … 作った町の台帳（town-seed.mjs が書く）
     ep001/ …         … 1 本ごとのフォルダ（town.json・plan.md・episode.json・images/・clips/・audio/・out/）
   ```
   既存のエピソードのフォルダは上書き・削除しない。
2. **道具の確認**：`node <SKILL>/scripts/check.mjs`（Node・ffmpeg・日本語の書体・Gemini のキーと課金）。✗ は表示どおりに直す。
3. **スタイル設計書を読む**：`<シリーズ>/style-bible.md`。「まだのもの」「食い違い」に書いてあることは、この回の前に片づけられるなら片づける（1 章）。

## 1. 参考動画の分析（未分析の項目があるとき・新しい参考動画をもらったとき）

youtube-reader スキルの「制作分析」で作り方を抜き出し、`style-bible.md` の A 章を埋める・直す。数値が変わったら `formats.json` も直す。
- YouTube のページ（タイトル・概要欄・サムネイル）とカット長・音量の実測は yt-read／yt-frames、映像と音の中身は yt-gemini（ストリーミングなので長い分析でも途中で切れにくい）
- 分析できない（YouTube にも Gemini にも届かない）ときは、**推測で型を作らない**。何が要るかをユーザーに伝え、設計書の今の型で作ってよいか確かめる

## 2. 町を決める

```
node <SKILL>/scripts/town-seed.mjs --count 3 --registry <シリーズ>/towns.json
```
過去の町と名前・要素がかぶらない候補が 3 つ出る（立地・町の性格・時代と季節・場所・音・色・視点・記憶の断片・少しだけ不思議なこと）。
1. ユーザーがいれば選んでもらう。任せられたら、まとまりがよく前回と雰囲気が違うものを選び、理由を 1 行で
2. **町名が実在しないことを検索で確かめる**（自治体名・有名な地名・駅名・作品名）。あれば別の候補に
3. 保存：`node <SKILL>/scripts/town-seed.mjs --seed <その seed> --count 1 --registry <シリーズ>/towns.json --out <シリーズ>/ep<番号>`
4. カードは「たたき台」。良くなるなら town.json を書き換えてよい

## 3. 企画と設計図（plan.md・episode.json）

```
node <SKILL>/scripts/new-episode.mjs --town <ep>/town.json --series <シリーズ> [--format cinematic] [--minutes 20] [--chapters 8]
```
章立て（季節と時間が進む）・場面（各章の最初は遠景）・つなぎ（章内はカット、章の境はディゾルブ）・AI 動画にする候補・章ごとの環境音の骨組みと、見積もり入りの `plan.md` ができる。TODO を埋める：
1. **plan.md**：この回の芯（見終わったあとに残したい感情を 1 文）。章の並び・テーマ・場所をこの町に合わせて入れ替える。記憶の断片と「少しだけ不思議なこと」を、どの章のどの画で見せるか
2. **episode.json**（書式は `references/episode-schema.md`）
   - `shots[].prompt`：何が・どこに・時間帯・天気・構図（`references/image-prompts.md`）。同じ構図・距離を続けない
   - `shots[].motion`：AI 動画にする場面の動き（ゆっくり・少しだけ）。動かさない場面からは `video` と `motion` を消してよい
   - `title`、`music.prompt`（BGM を入れるとき。入れないなら `audio.bgm` を消す）
3. ユーザーがいれば plan.md の要点（章立てと見積もり）を見せる。急いでいる様子なら返事を待たずに進める

## 4. 素材を作る

**最初に、plan.md の見積もり（画像の枚数・AI 動画の本数と秒数・BGM の有無）を伝えて了承を取る**（Gemini の利用料がかかる。特に AI 動画）。
1. **画像**：まず 2 枚 `node <SKILL>/scripts/gen-images.mjs <ep>/episode.json --only c01_01,c01_02` → Read で見て良い方を `imageRefs` に入れる（絵柄をそろえる基準）→ 残りを `gen-images.mjs <ep>/episode.json`。**全部を自分の目で見る**（文字・ロゴ・実在の場所っぽさ・時代に合わない物・崩れ・似た構図の連続・実在の人物に似た顔）。だめな画像は prompt を直して `--only <ファイル名>`
2. **AI 動画**（了承を取った本数だけ）：`node <SKILL>/scripts/gen-clips.mjs <ep>/episode.json --max <本数>`。まず 1 本で動きと音を確かめてから残りを。動画がまだ無い場面は、書き出し時に画像で代わりに作られる
3. **環境音**：plan.md の「環境音」の種類と秒数で `node <SKILL>/scripts/gen-ambience.mjs <種類> --dur <秒> --out <ep>/audio/amb_<種類>.wav`（rain・wind・waves・room・crickets・cicada・crossing・chime・clock・hum・train・birds・crowd）。足りない音は AI 動画の音や、権利のはっきりした素材で（`references/sound.md`）
4. **BGM**（入れるなら）：`node <SKILL>/scripts/gen-music.mjs <ep>/episode.json`（Lyria。歌なし）。手持ちの曲は権利（商用・YouTube で使えるか）を確かめてから

## 5. 組み立てて確かめる

1. 下書き：`node <SKILL>/scripts/render-town.mjs <ep>/episode.json --draft --sheet 48` → `out/<id>_draft_check/sheet_*.jpg` を Read で全部見る。気になる時刻は `--stills 秒,秒`
   - 見るところ：同じ構図・動きの連続、章の変わり目のディゾルブ、AI 動画の崩れ・急な動き、暗すぎ・明るすぎ、名札と最後のカード、音の切れ目
   - 直して下書きをもう一度（3 回以内に形にする）
2. 本番：`node <SKILL>/scripts/render-town.mjs <ep>/episode.json --sheet 48` → 検査がすべて ✓（解像度・fps・映像と音の長さ・-14 LUFS・ピーク）。20 分の回は 1 時間以上かかるので裏で動かす

## 6. サムネイル・タイトル・概要欄

1. `node <SKILL>/scripts/make-thumb.mjs --image <いちばん強い画像> --title "<町名>" [--sub "…"] --grade cinema --out <ep>/out/thumb.jpg` → Read で縮小しても読めるか確かめる
2. タイトル案 3 つと概要欄（章をチャプターに）を `references/publish.md` の型で書き、`out/<id>_概要欄.txt` に保存。「この町は実在しない」「AI で生成」を必ず入れる

## 7. 検品（別のエージェント 2 人を並列で）

`references/qa.md` の「品質」と「オリジナリティ・安全」を、general-purpose エージェントにそれぞれ渡して並列で頼む（動画・サムネイル・episode.json・plan.md・style-bible.md・towns.json のパスを渡す）。指摘は直して書き出し直す。

## 8. 納品と記録

1. 渡すもの：`out/<id>.mp4`・`out/thumb.jpg`・`out/<id>_概要欄.txt`。クラウドの作業環境なら会話にファイルとして送る（コンテナは消える。動画はリポジトリにコミットしない）
2. 台帳に記録（本編のときだけ）：`node <SKILL>/scripts/town-seed.mjs --register <ep>/town.json --registry <シリーズ>/towns.json --title "<タイトル>"`
3. 報告は短く：完成ファイル、作った素材の数（画像・AI 動画・BGM）、人の目と耳で確かめてほしい所（AI 動画の崩れ・音の違和感）、投稿時の設定（`references/publish.md`）

## ショート版を作るとき

同じ町で縦 1080×1920・30〜45 秒。本編のフォルダとは別に作る（例 `ep003_short`）。town.json をコピーし、**本編と同じ番号を `--no` で渡す**：`new-episode.mjs --town <ep003_short>/town.json --format short --no 3 --series <シリーズ>`。台帳には記録しない（本編で記録済み）。
- 画像は 9:16 で作り直すのが一番きれい。横長の画像を使い回すなら場面に `"fit": "contain-blur"`

## いつも守ること

- **パクらない**：参考動画の設定（海上都市・水没都市）・実在の名所・人物の物語・看板や店名・タイトルの言い回しを使わない。借りるのは型だけ（style-bible.md の 9）
- **実在に寄せない**：実在の地名・駅名・店名・ブランド・ロゴ、実在の人物の顔や声を出さない。画像に読める文字を入れない
- **架空であることを隠さない**：最後のカードと概要欄で「実在しない町」「AI 生成」を明記し、本物らしい映像なので YouTube の「改変または合成されたコンテンツ」を「はい」にするよう伝える
- **量産に見せない**：毎回、町・章の並び・色・最初と最後の画・サムネイルを変える。画像や動画を別の回に使い回さない（YouTube の収益化ルール）
- **費用は先に了承**：画像・AI 動画・BGM の数を伝えてから作る。作業ファイルはエピソードのフォルダの中だけ。既存の回を上書き・削除しない
