---
name: ad-video
description: 広告用・紹介用の短い動画を作る重めのフロー（20〜30分）。HTMLのデザインカードから絵を作り、ナレーションを合成し、1秒ごとの静止画を確かめてから動画に組み、別のAIとジェブで検品する。「広告動画を作って」「紹介動画を作って」と言われたら使う。
---

# 広告用動画を作る

HTML でデザインを指定し、静止画を確かめてから動画にする。静止画の段階で崩れを直すので、完成後のやり直しが減る。

## 準備

- 案件のデザインシステム: `ai-ecosystem/design-systems/<案件>/`（なければ `default`）
- 道具: Remotion（React で動画）または HyperFrames（HTML で動画）、FFmpeg
- ナレーション: `ai-ecosystem/scripts/tts-elevenlabs.mjs`（ElevenLabs）。使えなければ Google の TTS
- 出力先: `ai-ecosystem/output/<案件>/<動画名>/`

## 手順

1. **段取り**: `planner` で構成（秒数・シーン数・訴求ポイント・CTA）を作り、`jeb-judge` に plan として判定させる。
2. **台本**: シーンごとのナレーション原稿と画面の文字を書く。`japanese-editor` で推敲。
3. **デザインカード**: シーンごとに HTML のカード（1920×1080 または 1080×1920）を作る。色・文字はデザインシステムの tokens を使う。
4. **声の合成**: シーンごとに音声を作り、長さ（秒）を測る。
   ```bash
   ai-ecosystem/scripts/with-secrets.sh node ai-ecosystem/scripts/tts-elevenlabs.mjs --file scene1.txt --out scene1.mp3
   ffprobe -v error -show_entries format=duration -of csv=p=0 scene1.mp3
   ```
5. **素材**: 必要な挿絵は `ask-other-ai` で Codex に生成させ、`images/` に入れる。BGM は権利の確認できる素材だけ使う。
   - 実写風の短い動画素材が必要なときは、動画生成AI（Seedance など）や Antigravity に頼む。このリポジトリには動画生成APIの呼び出しスクリプトはまだない。使うサービスを決めたら、APIキーを 1Password に入れ、`ai-ecosystem/scripts/` に呼び出しスクリプトを足す。
   - 生成した動画素材も、手順6と同じように静止画を切り出して確認してから使う。
6. **1秒ごとの静止画で確認**: Playwright で各カードを撮影するか、Remotion の `npx remotion still` で1秒ごとに書き出す。`judge-image.mjs` で文字崩れ・はみ出しを確認し、崩れていれば絵を直す。
7. **動画に組む**: Remotion（`npx remotion render`）か HyperFrames で書き出す。静止画からつなぐ場合は FFmpeg。
   ```bash
   ffmpeg -framerate 30 -i frames/%05d.png -i narration.mp3 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest ad.mp4
   ```
8. **検品**: `quality-inspector` で長さ・音ズレ・静止画を確認。ズレがあれば 6〜7 をやり直す。
9. **別のAIに見せる**: `ask-other-ai` で Gemini に完成品を見せ、分かりにくい箇所・ズレを時刻付きで挙げてもらう。
10. **最終判定**: `jeb-judge` に依頼文・動画・Gemini の指摘を渡し、PASS なら完成。公開は人間が行う。

## 並列にできる作業

台本確定後の「声の合成」「デザインカード」「挿絵生成」は互いに依存しないので、サブエージェントで同時に進める。
