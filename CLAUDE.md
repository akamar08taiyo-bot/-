# CLAUDE.md — このリポジトリで Claude Code が守る共通ルール

入口は Claude Code ひとつ。判断は「ジェブ（判断AI）」、作業はスキルとサブエージェント、
知識は `ai-ecosystem/knowledge`（Obsidian の保管庫）に貯める。全体図は `ai-ecosystem/README.md`。

## 1. 依頼を受けたら（ジェブ判断）

- 依頼のたびに UserPromptSubmit フックが「ジェブ判断プロトコル」を差し込む。その順番どおりに動く。
- 3ステップ以上かかる依頼は、最初に `planner` サブエージェントで段取りを作り、`jeb-judge` に段取りを判定させてから着手する。
- 成果物（文章・画像・動画・スライド・コード・設定）を作ったら、報告する前に必ず `jeb-judge` で検品する。
  FAIL なら直して再検品。3回続けて FAIL なら、止まって人間に相談する。
- 独立した作業はサブエージェントで並列に進める（例: 動画ならテロップ担当・検品担当・プランナー）。

## 2. 他のAIに頼むルール（詳細は `ask-other-ai` スキル）

| 場面 | 頼む先 |
| --- | --- |
| 画像生成（スライドの挿絵、図、サムネ） | Codex（イメージ生成）。使えないときは `ai-ecosystem/scripts/image-generate.mjs` |
| 長い文章のレビュー、動画のレビュー、Google Workspace 作業 | Gemini（Antigravity / Gemini CLI） |
| 画像の見た目の判定（崩れた文字・個人情報・矢印） | OpenAI Vision（`ai-ecosystem/scripts/judge-image.mjs`） |
| それ以外 | Claude Code 自身 |

## 3. 文章・デザイン・見直しのルール

次のメモを必ず守る（Obsidian 側で育てる）。

@ai-ecosystem/knowledge/rules/writing.md
@ai-ecosystem/knowledge/rules/design.md
@ai-ecosystem/knowledge/rules/review.md

## 4. メモを取る（ナレッジを育てる）

- 新しく分かったこと（不自然な言い回し、スキルのコツ、失敗と対策、Xのネタ）は `obsidian-memo` スキルで `ai-ecosystem/knowledge` に追記する。
- AIっぽい言い回しを見つけたら `knowledge/dictionary/ng-phrases.md` に、AIっぽい見た目は `ng-design.md` に足す（フックが次から自動で検出する）。

## 5. 安全

- ファイルや外部サービス上のデータを消さない。必要なら人間に頼む（`guard.mjs` フックでも止まる）。
- お金（請求・支払い・送金）と外部公開（投稿・本番デプロイ・メール送信）は、実行前に必ず人間の確認を挟む。下書きまで作ってリンクを渡す。
- APIキーは 1Password に入れ、`.env` には `op://` の参照だけを書く（見本は `.env.example`）。実際のキーをファイル・チャット・コミットに書かない。
- スクショに個人情報（メール・電話・住所・顔・通知・キー）が写っていたらモザイクをかける。
- 案件ごとにスキルとデザインシステムを分け、A社の素材をB社の成果物に混ぜない。

## 6. このリポジトリのアプリ（健康管理・住宅ローン）を触るとき

- 医療安全のルールは README の「医療安全上の注意」に従う（診断しない、症状があれば受診を促す、薬やサプリの中止を指示しない）。
- 変更したら `npm run lint` と `npm run build` が通ることを確かめる。
