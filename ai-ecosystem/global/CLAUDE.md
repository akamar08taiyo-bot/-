# PC 全体の AI 環境ルール（ジェブ）

このファイルは `ai-ecosystem/scripts/install-global.mjs` が `~/.claude/jeb/CLAUDE.md` に入れたもの。
どのプロジェクトで Claude Code を開いても、このルールが効く。プロジェクトに自分の `CLAUDE.md` や `.claude/hooks` があれば、そちらが優先される。

## 0. 置き場所

- `~/.claude/jeb/` が共通の置き場所。ルール・NG 辞書・スキルのコツ（`knowledge/`）、デザインシステム（`design-systems/`）、スクリプト（`scripts/`）、フック（`hooks/`）がある。
- 成果物（画像・動画・原稿・請求書の PDF など）は `~/AI-output/<案件>/` に置く。どのプロジェクトの Git にも入らない。
- 私的なメモ（メールの要約、取引先の単価、日々の記録）は `OBSIDIAN_VAULT` の保管庫に書く。未設定なら `~/.claude/jeb/knowledge/` の `daily/`・`clients/`・`private/` に書く（このPCの中だけに残る）。

## 1. 依頼を受けたら（ジェブ判断）

- 依頼のたびに UserPromptSubmit フックが「ジェブ判断プロトコル」を差し込む。その順番どおりに動く。
- 3ステップ以上かかる依頼は、最初に `planner` サブエージェントで段取りを作り、`jeb-judge` に段取りを判定させてから着手する。
- 成果物を作ったら、報告する前に必ず `jeb-judge` で検品する。FAIL なら直して再検品。3回続けて FAIL なら、止まって人間に相談する。
- 独立した作業はサブエージェントで並列に進める。

## 2. 他のAIに頼むルール（詳細は `ask-other-ai` スキル）

| 場面 | 頼む先 |
| --- | --- |
| 画像生成 | Codex（イメージ生成）。使えないときは `~/.claude/jeb/scripts/image-generate.mjs` |
| 長い文章・動画のレビュー、動画生成、Google Workspace 作業 | Gemini（Antigravity / Gemini CLI） |
| 画像の見た目の判定（崩れた文字・個人情報・矢印） | OpenAI Vision（`~/.claude/jeb/scripts/judge-image.mjs`） |
| それ以外 | Claude Code 自身 |

APIキーが必要なスクリプトは `~/.claude/jeb/scripts/with-secrets.sh` 経由で実行する（`~/.claude/jeb/.env` に 1Password の参照を書いておく）。

## 3. 文章・デザイン・見直しのルール

@~/.claude/jeb/knowledge/rules/writing.md
@~/.claude/jeb/knowledge/rules/design.md
@~/.claude/jeb/knowledge/rules/review.md

## 4. メモを取る（ナレッジを育てる）

- 新しく分かったこと（不自然な言い回し、スキルのコツ、失敗と対策、Xのネタ）は `obsidian-memo` スキルで `~/.claude/jeb/knowledge/` に追記する。
- AIっぽい言い回しは `~/.claude/jeb/knowledge/dictionary/ng-phrases.md` に、AIっぽい見た目は `ng-design.md` に足す（フックが次から自動で検出する）。

## 5. 安全

- ファイルや外部サービス上のデータを消さない。必要なら人間に頼む（`guard.mjs` フックでも止まる）。
- お金（請求・支払い・送金）と外部公開（投稿・本番デプロイ・メール送信）は、実行前に必ず人間の確認を挟む。下書きまで作ってリンクを渡す。
- APIキーは 1Password に入れ、`.env` には `op://` の参照だけを書く。実際のキーをファイル・チャット・コミットに書かない。
- スクショに個人情報が写っていたらモザイクをかける。
- 案件ごとにスキルとデザインシステムを分け、A社の素材をB社の成果物に混ぜない。

## 6. プロジェクトごとのルール

各プロジェクトの `CLAUDE.md` と README に書かれたルール（テストの通し方、医療・法律などの注意）を、ここより優先して守る。
