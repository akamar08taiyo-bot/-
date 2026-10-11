# AIと人間の共存（第一章）

「存在しない街の記憶」のテーマ（架空なのに懐かしい街の日常）を手本に、映像・音楽をオリジナルで作った模擬動画。
舞台は、昭和を残した2080年の海辺の町「継町」と、沖の島「継島」。尺は6分51秒（1920×1080／30fps、26カット）。

- 分析：[docs/analysis.md](docs/analysis.md)（参照動画の全カット表は [docs/ref_tGJRlrAXIoE/](docs/ref_tGJRlrAXIoE/)）
- テーマ・構成・音の設計：[docs/theme.md](docs/theme.md)
- 概要欄（貼り付け用）：[docs/youtube_description.txt](docs/youtube_description.txt)
- 第二章「砂の向こうから来た男」の台本：[docs/chapter2_script.md](docs/chapter2_script.md)

## 作り方（上から順に）

| 工程 | 使うもの | 出力 |
|---|---|---|
| 原画 | `scripts/gen_image.py`・`scripts/edit_image.py`（Gemini 画像生成）、N04 の採用原画（`assets/n04_pdf`） | `assets/gen/*.jpg`、対応表 `assets/sources.json` |
| 動き | `scripts/veo_batch.py`（Veo 3.1 Lite、1080p・8秒） | `assets/veo/*.mp4`（有料で生成した元動画なので git に保存） |
| 半速スロー | `scripts/slowmo.sh <ID> <元動画>`（動き補間で60fps→半速30fps、音は rubberband で半速） | `public/clips/<ID>.mp4`、`work/veoaudio/<ID>.wav` |
| 電子版の追跡 | `python3 -I scripts/track.py A1 B2 B3 C5 E1`（確認は `scripts/track_check.py`） | `src/track.json` |
| テーマ曲 | `python3 -I audio/src/compose.py`（作曲→FluidSynth） | `audio/out/music.wav` |
| 環境音・仕上げ | `python3 -I audio/src/build_mix.py` → `python3 -I audio/src/build_theme.py` | `audio/out/mix_asmr.wav`（-16 LUFS）、`mix_theme.wav`（-14 LUFS） |
| 終わりのあいさつ | `scripts/tts_outro.py`（Gemini TTS、指示文の読み上げ部分は切り落とす） | `audio/src/outro/Algieba_cut.wav` |
| フォント | 書き出す機械にシステムフォントとして入れる：`cp public/fonts/ZenOldMincho-{Regular,Bold}.ttf public/fonts/ZenMaruGothic-{Bold,Black}.ttf /usr/local/share/fonts/zen/ && fc-cache -f` | — |
| 書き出し | `node scripts/render_shots.mjs`（カットごとに無音で書き出し。済んだカットは飛ばす） → `python3 -I scripts/assemble.py`（1.2秒のクロスフェードでつなぎ、粒子・周辺減光をかけ、2つの音を重ねる） | `out/shots/*.mp4` → `out/ai_human_coexistence_asmr.mp4`、`out/ai_human_coexistence_theme.mp4` |
| 点検 | `scripts/stills.mjs`（静止画）、`scripts/qa_final.py`（黒コマ・一覧）、`scripts/audio_qa.py`・`scripts/review_video.py`（Gemini による試聴・試写） | `work/` |

カットの尺・字幕・電子版・音の割り当ては、すべて `src/timeline.json` で決めている。

## 素材とライセンス

- 画像：Gemini（Nano Banana Pro）で生成・修正。N04 の原画は N04 画像提案書から取り出したもの。
- 動画：Veo 3.1 Lite（扉のカットのみ Veo 3.1 Fast）。
- 音：Veo が生成した現場音＋numpy で合成した環境音・効果音。テーマ曲はプログラムで作曲し、FluidR3_GM（MIT）で音にした。
- フォント：Zen Old Mincho、Zen Maru Gothic（SIL Open Font License）。
