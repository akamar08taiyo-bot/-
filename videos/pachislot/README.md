# パチスロ動画

パチスロコーデックスで作った「パチスロ動画 引き継ぎ書一式」をもとに作る動画の制作フォルダ。
声は Gemini 3.8 Flash TTS、絵は Gemini 3 Pro Image、映像は Remotion、BGM・効果音は numpy で合成（権利フリー）。
フォントは Zen Maru Gothic / Dela Gothic One / Yusei Magic / Zen Old Mincho（SIL OFL）。
作り方は「本音あるある」（`claude/honne-aruaru-video` の `videos/honne-aruaru`）と同じ道具を引き継いでいる。

## いまの状態

- 引き継ぎ書：受け取り、全部読んだ（主要な資料・採用画像は照合値と一致）。
- 第1話（ep01）：制作版 v1 を書き出し済み。
  - 内容：声・生活音・環境音・音楽・字幕・分析と会計のカード。人物の連続動作と口パクは未制作。
  - 中身（台本・カット表・絵・声）はユーザーの作品なので、公開リポジトリには入れていない。
  - 経過・残りは各回の `episodes/<回>/制作記録.md`。
- 制作ライン：`check00`（本編ではない13秒の動作確認）で、声から仕上げの検査まで通ることを確認済み（2026-10-21）。

## 置き場所

- `episodes/<回>/`：台本 `script.json`（行・話し方・効果音・BGM の止め所）、絵の指示文 `prompts.json`、声 `voice/`、行の時刻 `timeline.json`
- `public/<回>/img`：画面で使う絵（`public/shared/sfx` は全部の回で共通の効果音、`public/fonts` は画面の文字だけに絞ったフォント）
- `src/episodes/<回>.tsx`：その回の場面・カメラ・演出（時刻は台本の行基準 `T.s` / `T.e`。秒の直書きはしない）
- `out/`：完成品（mp4・字幕 srt・概要欄）

## 横長の会話劇（第1話の作り方）

縦型の解説と違い、カット表 `episodes/<回>/shots.json` で絵を割る。
- 時刻：各カットの `at` は台本の行と場面が基準（`S01+0`＝場面の始まり、`s01_1.s-3.2`＝行の話し始めの3秒前、`s01_1.e+0.5`＝話し終わりの0.5秒後）。
- 行の前後の間：`script.json` の `pre` と `gap` で決める。
- 画面の部品：`src/drama.tsx` に字幕・時刻・カード・メモ・スマホ・題字がある。各回の画面の文字は `src/episodes/<回>.tsx`。

```bash
python3 -I scripts/gen_shots.py --ep ep01 [ID...]     # カット表の場面画（--publish で文字・リールのぼかしを焼き込み public へ）
python3 -I scripts/sfx_life.py && python3 -I scripts/amb.py   # 生活音・環境音（共通）
python3 -I scripts/bgm_drama.py --ep ep01             # 合図の曲（鳴らす場所は script.json の music）
python3 -I scripts/mix.py --ep ep01                   # sfx（[名前, アンカー, dB]）・beds（環境音）・music を重ねる
```

## 作る手順（回ごと、例は check00）

```bash
npm install && pip install fonttools brotli
python3 -I scripts/tts.py --ep check00            # 声（文字起こしで台本どおりか確かめ、ずれたら自動で取り直し）
python3 -I scripts/prep_audio.py --ep check00     # 無音を詰めて並べ、行の時刻（timeline.json）を作る
python3 -I scripts/sfx.py                         # 効果音（共通）
python3 -I scripts/bgm.py --ep check00            # BGM（script.json の bgm で曲調と止め所）
python3 -I scripts/mix.py --ep check00            # 声・効果音・BGM を重ねる
python3 -I scripts/subset_fonts.py                # 画面の文字だけのフォント（台本を変えたら。src/fonts_data.ts に埋め込む）
node scripts/stills.mjs check00 1 5 10            # 確認用の静止画（work/check00/stills/sheet.jpg）
node scripts/render.mjs check00                   # 映像（無音）
python3 -I scripts/finish.py --ep check00         # -14 LUFS に合わせて重ね、字幕を書き、検査
```

`script.json` の `format`（`vertical` 1080×1920 ／ `horizontal` 1920×1080）と `len`（[最短, 最長] 秒）で、仕上げの検査の基準が変わる。
台本にある英字（BIG・REG・AT など）は、声の検査で「指示文の読み上げ」とみなさない。

メモ：Gemini API は前払いクレジット制。尽きると 402 になり、声と絵が作れない（AI Studio で補充する）。
