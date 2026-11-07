---
name: video-edit
description: 撮影済み動画の編集。無音・言い間違い部分のカット、テロップ入れ、解説用の図の差し込みを FFmpeg で行う。テロップ作成は telop-writer、検品は quality-inspector に並列で任せる。「カットして」「テロップを入れて」と言われたら使う。
---

# 動画のカット・テロップ・図

## 手順

1. **素材確認**: `ffprobe` で長さ・解像度・音声を確認。出力先 `ai-ecosystem/output/<案件>/<動画名>/` を作る。
2. **文字起こし**: 時刻付きの文字起こしを用意する（人間から受け取る、または文字起こしツール）。長い動画の内容確認は `ask-other-ai` で Gemini に回してよい。
3. **カット**: 無音区間を検出してカット候補を作る。
   ```bash
   ffmpeg -i in.mp4 -af silencedetect=noise=-35dB:d=0.6 -f null - 2> silence.log
   ```
   言い間違い・脱線の区間を文字起こしから選び、残す区間のリスト（start,end）を作って人間に見せる。OK が出てから書き出す。
4. **テロップ**（並列）: `telop-writer` サブエージェントに文字起こしを渡し、`telop.srt` を作らせる。カット後の時刻に合わせ直すのを忘れない。
5. **図**（並列）: 説明が必要な箇所に図を入れる。図は `ask-other-ai`（Codex）か HTML で作り、`judge-image.mjs` で確認。
6. **焼き込み**:
   ```bash
   ffmpeg -i cut.mp4 -vf "subtitles=telop.srt:force_style='FontName=Noto Sans JP,FontSize=28,Outline=2'" -c:a copy out.mp4
   ```
7. **検品**: `quality-inspector` で音ズレとテロップのはみ出しを確認し、最後に `jeb-judge`。

## 注意

- 元の動画ファイルは上書きしない。書き出しは必ず別名にする。
- 画面に個人情報（メール・通知・顧客名）が映っていたら、その区間にモザイクをかける（`boxblur` か `delogo`）。
