# パチスロ動画

パチスロコーデックスで作った「パチスロ動画 引き継ぎ書一式」をもとに作る動画の制作フォルダ。
声は Gemini 3.8 Flash TTS、絵は Gemini 3 Pro Image、映像は Remotion、BGM・効果音は numpy で合成（権利フリー）。
フォントは Zen Maru Gothic / Dela Gothic One / Yusei Magic / Zen Old Mincho（SIL OFL）。
作り方は「本音あるある」（`claude/honne-aruaru-video` の `videos/honne-aruaru`）と同じ道具を引き継いでいる。

## いまの状態

- 引き継ぎ書：**まだ届いていない**。ユーザーの PC のデスクトップにあり、クラウドのセッションからは読めない。
  受け取り用の Google ドライブのフォルダ「パチスロ動画_引き継ぎ書（ここにデスクトップのフォルダーを入れる）」
  https://drive.google.com/drive/folders/1jOIZElQZ_tsE-asaVoZ0eC0-faqF5zH8 に入れてもらったら、全部読んでから制作に入る。
- 制作ライン：`check00`（本編ではない13秒の動作確認）で、声 → 時刻 → 効果音 → BGM → ミックス → 書き出し → 仕上げの検査まで全部通ることを確認済み（2026-10-21）。

## 置き場所

- `episodes/<回>/`：台本 `script.json`（行・話し方・効果音・BGM の止め所）、絵の指示文 `prompts.json`、声 `voice/`、行の時刻 `timeline.json`
- `public/<回>/img`：画面で使う絵（`public/shared/sfx` は全部の回で共通の効果音、`public/fonts` は画面の文字だけに絞ったフォント）
- `src/episodes/<回>.tsx`：その回の場面・カメラ・演出（時刻は台本の行基準 `T.s` / `T.e`。秒の直書きはしない）
- `out/`：完成品（mp4・字幕 srt・概要欄）

## 作る手順（回ごと、例は check00）

```bash
npm install && pip install fonttools brotli
python3 -I scripts/tts.py --ep check00            # 声（文字起こしで台本どおりか確かめ、ずれたら自動で取り直し）
python3 -I scripts/prep_audio.py --ep check00     # 無音を詰めて並べ、行の時刻（timeline.json）を作る
python3 -I scripts/sfx.py                         # 効果音（共通）
python3 -I scripts/bgm.py --ep check00            # BGM（script.json の bgm で曲調と止め所）
python3 -I scripts/mix.py --ep check00            # 声・効果音・BGM を重ねる
python3 -I scripts/subset_fonts.py                # 画面の文字だけのフォント（台本を変えたら）
node scripts/stills.mjs check00 1 5 10            # 確認用の静止画（work/check00/stills/sheet.jpg）
node scripts/render.mjs check00                   # 映像（無音）
python3 -I scripts/finish.py --ep check00         # -14 LUFS に合わせて重ね、字幕を書き、検査
```

`script.json` の `format`（`vertical` 1080×1920 ／ `horizontal` 1920×1080）と `len`（[最短, 最長] 秒）で、仕上げの検査の基準が変わる。
台本にある英字（BIG・REG・AT など）は、声の検査で「指示文の読み上げ」とみなさない。

メモ：Gemini API は前払いクレジット制。尽きると 402 になり、声と絵が作れない（AI Studio で補充する）。
