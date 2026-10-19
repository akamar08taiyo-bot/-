# 本音あるある #1「夫に冷めた瞬間」

30〜50代女性向けの縦型ショート（約46秒・1080×1920）。台本は「本音あるある ショート台本集 vol.1」の台本1に、
「バズっている結婚・夫婦系ショート 実例分析」で見えた点（1枚目に冷めた顔＋大きな題、上にシリーズ名、
4〜6秒ごとに場面を変える、最後に逆転と「買う？買わない？」の判断を聞く締め）を足したもの。

- 完成品：`out/honne01.mp4`、字幕 `out/honne01.srt`、タイトル・概要欄・固定コメント `out/honne01_概要欄.txt`、サムネ `out/honne01_cover.png`
- 声：Gemini 3.8 Flash TTS「Sulafat」（40代らしい落ち着いた低め）。行ごとに読み間違いを文字起こしで確認し、夫のセリフの真似などは数テイクから聞き比べで選んだ（`assets/voice/takes.json`）
- 絵：Gemini 3 Pro Image。人物の設定画 `assets/gen/sheet_v1.jpg` を毎回参照させ、同じ顔・服で10場面（`public/img/S1〜S10.jpg`、指示文は `assets/gen/prompts.json`）
- 映像：Remotion（`src/`）。場面・テロップ・効果の時刻はすべて台本の行基準
- BGM・効果音：numpy で作曲・合成（権利フリー）
- フォント：Zen Maru Gothic / Dela Gothic One / Yusei Magic（SIL OFL）。元は `assets/fonts`、画面に出る文字だけに絞ったものを `public/fonts` に置く

## 作り直す手順

```bash
npm install
pip install fonttools brotli         # フォントを絞るのに使う
python3 -I scripts/subset_fonts.py   # 台本や画面の文字を変えたら作り直す
python3 -I scripts/tts.py            # 声（キャッシュ済みの行は飛ばす。--only a1 で1行だけ）
python3 -I scripts/prep_audio.py     # 無音を詰め、話す速さをそろえ、行の時刻 src/timeline.json を作る
python3 -I scripts/sfx.py            # 効果音
python3 -I scripts/bgm.py            # BGM（「冷めるでしょ」で止まり、オチで戻る）
python3 -I scripts/mix.py            # 声・BGM・効果音を重ねる（声の間は BGM を下げる）
node scripts/stills.mjs 0 9.6 24.9   # 確認用の静止画（work/stills/sheet.jpg）
node scripts/render.mjs              # 映像（無音）
python3 -I scripts/finish.py         # -14 LUFS に合わせて重ね、字幕を書き、検査
```

次の回は `script.json`（行・テロップ・字幕の色分け）と `assets/gen/prompts.json` の場面を書き換え、
設定画を参照させて絵を作る（`python3 -I scripts/gen_image.py S1 --refs assets/gen/sheet_v1.jpg`）。

メモ：2026-10-19 の制作の最後で Gemini API の前払いクレジットが尽きた（HTTP 402）。次の回で声・絵を作る前に AI Studio でクレジットを補充する。
