---
name: ask-other-ai
description: 他のAIに頼むルール。画像生成はCodex（イメージ生成）へ、長い文章・動画のレビューやGoogle Workspace作業はGemini（Antigravity / Gemini CLI）へ、画像の見た目判定はOpenAI Visionへ回す。Claude Code だけでは作れない・見られないものが出てきたときに使う。
---

# 他のAIに頼む

Claude Code は入口と取りまとめ役。苦手な作業は得意なAIに回し、結果を受け取って続きを進める。

## 振り分け表

| 場面 | 頼む先 | 呼び方 |
| --- | --- | --- |
| 画像生成（スライドの挿絵・図・サムネ・漫画のコマ） | Codex のイメージ生成 | Codex をプラグインで接続していればそれを使う。なければ `ai-ecosystem/scripts/ask-codex.sh` |
| Codex の利用枠が切れたときの画像生成 | OpenAI Images API | `node ai-ecosystem/scripts/image-generate.mjs` |
| 長い資料のレビュー（本1冊分、議事録の束など） | Gemini（コンテキストが大きい） | `ai-ecosystem/scripts/ask-gemini.sh "<指示>" <ファイル...>` |
| 動画のレビュー（完成品を見てもらう） | Gemini | 同上（動画ファイルを渡す） |
| 動画生成・Google Workspace（Docs/Sheets/Slides）作業 | Antigravity（Gemini 系） | `GEMINI_CMD` に Antigravity の CLI を設定して `ask-gemini.sh` |
| 画像の見た目判定（文字崩れ・個人情報・矢印） | OpenAI Vision | `node ai-ecosystem/scripts/judge-image.mjs` |
| 上記以外 | Claude Code 自身 | — |

Gmail・Googleドライブ・カレンダーの読み書きだけなら、まず Claude Code の Google Workspace コネクターを使う（他のAIに回すより速い）。

## 手順

1. 何を頼むかを1文で決め、入力（ファイル・画像）と出力の置き場所（`ai-ecosystem/output/<案件>/`）を決める。
2. 頼む先に渡すプロンプトを作る。案件の DESIGN.md の要点（色・雰囲気・禁止事項）を必ず含める。
3. 呼び出す（キーが必要なものは `ai-ecosystem/scripts/with-secrets.sh` 経由）。
   ```bash
   ai-ecosystem/scripts/with-secrets.sh ai-ecosystem/scripts/ask-codex.sh "16:9の図。…。ai-ecosystem/output/a社/fig1.png に保存"
   ai-ecosystem/scripts/with-secrets.sh ai-ecosystem/scripts/ask-gemini.sh "この動画を見て、テロップのズレと聞き取りにくい箇所を時刻付きで挙げて" ai-ecosystem/output/a社/ad.mp4
   ```
4. 返ってきたものを確かめる。画像なら `judge-image.mjs`、レビュー指摘なら内容を読んで反映するか判断する。
5. 頼む先のコマンドが入っていない・キーがないときは、無理に代替せず「何が足りないか」を人間に伝える（手順は `ai-ecosystem/SETUP.md`）。

## 注意

- 他のAIに個人情報や未公開の顧客資料を渡す前に、渡してよい範囲か確かめる。
- 返ってきた画像・文章も、最後は jeb-judge の検品を通す。
