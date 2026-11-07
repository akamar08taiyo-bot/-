# 自分のPCでやる設定

リポジトリに入っている仕組み（ルール・フック・スキル・サブエージェント・スクリプト）は、Claude Code で開けばそのまま動く。
ここに書いてあるのは、PCやアカウント側でしかできない設定。必要なものから順に進めればよい。

迷ったら、このファイルと `README.md` を Claude Code に渡して「この手順を一緒に進めて」と頼む。

## 1. 前提

- Node.js 20 以上、Git、Claude Code（ログイン済み）
- Mac の場合は Homebrew があると楽

```bash
git clone <このリポジトリのURL>
cd <リポジトリのフォルダ>
npm install
(cd ai-ecosystem && npm install)
```

## 2. 入口（ターミナル・デスクトップ・スマホ）

1. リポジトリのフォルダで `claude` を起動する。初回に「このフォルダを信頼しますか」と聞かれたら信頼する（`.claude/settings.json` のフックと権限ルールが有効になる）。
2. `/hooks` を開き、UserPromptSubmit / PreToolUse / PostToolUse / Stop / SessionEnd にフックが入っていることを確認する。
3. `.mcp.json` の Playwright MCP を使うか聞かれたら許可する。
4. スマホから操作する場合は Remote Control を使う。PC側で `claude remote-control` を実行する（毎回自動で始めたい場合は Claude Code の設定 `remoteControlAtStartup` をオン）。スマホの Claude アプリからそのセッションに接続できる。
5. デスクトップアプリを使う場合も、このリポジトリのフォルダを開けば同じ設定が効く。

## 3. APIキー（1Password）

実際のキーは 1Password だけに置き、`.env` には参照（`op://保管庫/項目/フィールド`）だけを書く。

1. 1Password アプリと 1Password CLI を入れる（Mac: `brew install --cask 1password-cli`）。
2. 1Password アプリの 設定 → 開発者 →「1Password CLI と連携」をオンにする。
3. 保管庫「AI」を作り、必要な項目を作る（例: `Anthropic API`、`OpenAI API`、`ElevenLabs`、`Discord Bot`、`X API`）。各項目の「credential」などのフィールドにキーを入れる。
4. 見本を複製して、参照先を自分の保管庫・項目名に合わせる。
   ```bash
   cp .env.example .env
   ```
5. 確認（キーの中身は表示されない）:
   ```bash
   ai-ecosystem/scripts/with-secrets.sh node -e "console.log('OpenAI:', !!process.env.OPENAI_API_KEY)"
   ```

注意: `.env` に `ANTHROPIC_API_KEY` という名前を使わない。Claude Code 本体がその値を読むと、サブスクリプションではなく API 課金に切り替わる。判定AI用は `JUDGE_ANTHROPIC_API_KEY` にしてある。

## 4. 他のAI（Codex・Gemini / Antigravity）

- **Codex**（画像生成に使う）: `npm install -g @openai/codex` → `codex login`。Codex をプラグインで Claude Code につなぐ方法を使っている場合は、そちらが優先される。
- **Gemini CLI**（長い資料・動画のレビュー）: `npm install -g @google/gemini-cli` → `gemini` を一度起動してログイン。
- **Antigravity** を使う場合: そのCLIのコマンド名を `.env` の `GEMINI_CMD` に入れる（`ask-gemini.sh` がそれを呼ぶ）。
- 確認:
  ```bash
  ai-ecosystem/scripts/ask-gemini.sh "こんにちはと返して"
  ```

## 5. Obsidian（ナレッジ）

1. Obsidian を入れ、「フォルダを保管庫として開く」で `ai-ecosystem/knowledge` を選ぶ。
2. セッションログや日次まとめを保管庫に書かせたい場合は、`.claude/settings.local.json`（Git に入らない個人設定）に保管庫のパスを書く。
   ```json
   { "env": { "OBSIDIAN_VAULT": "/Users/<あなた>/<リポジトリ>/ai-ecosystem/knowledge" } }
   ```
3. 別の保管庫を使っている場合は、そちらのパスを書けばよい（ルールとNG辞書はリポジトリ側を使い続ける）。

## 6. コネクター（外部連携）

claude.ai の 設定 → コネクター で追加する。追加したものは Claude Code からも使える。

| サービス | 状態 | 使うスキル |
| --- | --- | --- |
| Gmail・Googleカレンダー・Googleドライブ・Googleスプレッドシート | このアカウントで接続済み | daily-digest, minutes-report |
| Figma・Canva | 接続済み | slides, thumbnail-banner |
| Vercel | 接続済み | web-publish |
| Slack・Notion・Discord | 必要なら追加 | minutes-report, daily-digest |
| マネーフォワード クラウド | 提供されている MCP / コネクターを公式の案内で確認して追加 | invoice-moneyforward |

## 7. 道具

| 道具 | 入れ方（Mac） | 使うスキル |
| --- | --- | --- |
| FFmpeg | `brew install ffmpeg` | video-edit, ad-video |
| LibreOffice | `brew install --cask libreoffice` | slides（PDF化して確認） |
| poppler（pdftoppm） | `brew install poppler` | slides（ページ画像化） |
| Remotion | 動画用のフォルダで `npx create-video@latest` | ad-video |
| HyperFrames | 公式の手順で導入 | ad-video |
| Playwright | `.mcp.json` で自動（ブラウザは初回に自動で入る） | web-publish, thumbnail-banner |

## 8. 出口（公開先）

- **Vercel**: `npm install -g vercel` → `vercel login`。確認用URLにパスワードをかけるには、プロジェクトの Settings → Deployment Protection で設定する（使える保護の種類は契約プランによって違う）。
- **Cloudflare**: `npm install -g wrangler` → `wrangler login`。独自ドメインのブログは Pages か Workers に置く。
- **X**: X API を使う場合は開発者アカウントでキーを作り 1Password へ（API の利用条件・料金は X の案内を確認）。使わない場合は Claude in Chrome で、ログイン済みのブラウザから下書きを作る。
- 本番反映のコマンド（`vercel --prod` など）は、`.claude/settings.json` で毎回確認が出るようにしてある。

## 9. 定期タスク（毎日のまとめ）

どちらか一方でよい。

- **クラウド**: claude.ai の Claude Code でこのリポジトリのスケジュール（定期タスク）を作り、毎朝「daily-digest スキルで今日のまとめを作って」と送るようにする。Claude Code に「毎朝7時半にまとめを作るスケジュールを登録して」と頼めば作れる。
- **自分のPC**: cron などから実行する。
  ```cron
  30 7 * * * cd /path/to/<リポジトリ> && claude -p "daily-digest スキルで今日のまとめを作って" >> ~/daily-digest.log 2>&1
  ```
  `-p` で動かすと、許可が必要な操作はその場で止まる。止まった操作は `.claude/settings.local.json` の `permissions.allow` に足す。

## 10. Discord ボット

1. Discord Developer Portal で New Application → Bot を作り、トークンを 1Password の「Discord Bot」に入れる。
2. Bot の設定で「MESSAGE CONTENT INTENT」をオンにする（メッセージ本文を読むため）。
3. OAuth2 の URL Generator で scope に `bot`、権限に「チャンネルを見る」「メッセージ履歴を読む」「メッセージを送信」を付け、チームのサーバーに招待する。
4. 報告用のチャンネルを作り、本人とパートナーだけが見られるようにする。
5. Discord の開発者モードをオンにし、読むチャンネルと報告用チャンネルのIDを `.env` の `DISCORD_CHANNEL_IDS` / `DISCORD_REPORT_CHANNEL_ID` に入れる。
6. まず投稿せずに試す:
   ```bash
   ai-ecosystem/scripts/with-secrets.sh node ai-ecosystem/bots/discord-digest.mjs --dry-run
   ```
7. 問題なければ `--dry-run` を外して、毎日の定期実行（9章）に組み込む。

## 11. 別の入口のチャットボット（任意）

動画では、チャットボットを別の入口にして中で Claude Code を動かし、1Password を持たせてパスワードを見せずにWebアプリへログインさせていた。
ただし、そのボットは利用枠がすぐなくなるため、実際はクラウドの Claude Code に作業させているとのこと。

ここでは同じ役割を次の組み合わせで置き換える。

- クラウドの Claude Code（claude.ai/code）でこのリポジトリを開く → スマホからでも依頼できる
- 自分のPCで動かしたい作業は Remote Control（2章）で頼む
- Webアプリへのログインが必要な作業は、1Password のサービスアカウントなど「ボットにパスワードを見せない」仕組みを使い、パスワードをチャットやファイルに書かない

## 12. 動作確認チェックリスト

- [ ] `claude` を起動して何か依頼すると、判断手順（ジェブ判断プロトコル）が効いている
- [ ] `rm -rf ai-ecosystem/knowledge` を頼むと止められる
- [ ] `knowledge/dictionary/ng-phrases.md` にある表現を含む文章を書かせると、書き直しを求められる
- [ ] ファイルを作らせて終わろうとすると、jeb-judge の検品を促される
- [ ] `with-secrets.sh` 経由でキーが読める
- [ ] `node ai-ecosystem/scripts/judge-image.mjs --task テスト <画像>` が判定を返す
- [ ] Obsidian で `ai-ecosystem/knowledge` が開ける
