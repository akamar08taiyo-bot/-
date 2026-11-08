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

このリポジトリは公開（public）なので、メモは2つに分ける。

| 置き場所 | 中身 |
| --- | --- |
| `ai-ecosystem/knowledge`（リポジトリ内・公開） | ルール、NG辞書、スキルのコツなど、見られても困らないもの |
| リポジトリ外の非公開の保管庫（例: `~/Obsidian/AI-private`） | セッションログ、毎日のまとめ、取引先メモなど私的なもの |

1. Obsidian を入れ、「フォルダを保管庫として開く」で `ai-ecosystem/knowledge` を選ぶ。
2. 私的なメモ用に、リポジトリの外に別の保管庫を作る（例: `~/Obsidian/AI-private`）。
3. そのパスを `.claude/settings.local.json`（Git に入らない個人設定）に書く。セッションログと Discord のまとめは、ここに書き込まれる。
   ```json
   { "env": { "OBSIDIAN_VAULT": "/Users/<あなた>/Obsidian/AI-private" } }
   ```
4. `OBSIDIAN_VAULT` に `ai-ecosystem/knowledge` を指定しない。指定した場合も `daily/`・`clients/`・`Claude/`・`private/` は `.gitignore` で除外されるが、公開リポジトリの中に私的な情報を置くことになる。

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

## 12. ほかのプロジェクトでも使う（PC全体に入れる）

ここまでの設定は、このリポジトリで Claude Code を開いたときだけ働く。どのプロジェクトでも同じ環境を使いたいときは、PC 全体の設定（`~/.claude`）に入れる。

### 入れるとどうなるか

| 入るもの | 場所 |
| --- | --- |
| ルール（CLAUDE.md）、NG 辞書、スキルのコツ、デザインシステム、スクリプト、フック | `~/.claude/jeb/` |
| スキル14個、サブエージェント5体 | `~/.claude/skills/`・`~/.claude/agents/` |
| フック5つ、権限ルール、利用制限のステータスライン（13章） | `~/.claude/settings.json` に追記 |
| ルールの読み込み | `~/.claude/CLAUDE.md` に、見出しと読み込みの行を追記 |
| 成果物の出力先 | `~/AI-output/<案件>/`（どのプロジェクトの Git にも入らない） |

- 今の `~/.claude/settings.json` と `~/.claude/CLAUDE.md` は上書きせず、足すだけ。変更前の内容は `~/.claude/jeb/backup/` に控える。
- `~/.claude/settings.json` が壊れていて読めないときは、何も変えずに止まる。
- 同じ名前のスキル・サブエージェントがすでにあれば、控えを取ってから入れる。外すときに元へ戻す。
- フックは、このリポジトリのようにプロジェクト側にジェブのフックがある場合、PC 全体のほうは何もしない（二重に動かない）。
- スキルは、同じ名前なら PC 全体のもの（`~/.claude/skills/`）が優先される。中身はリポジトリ版と同じにしてあるので、動きは変わらない。リポジトリのスキルを直したら、インストーラーをもう一度実行して PC 全体のほうにも反映する。

### 手順（リポジトリのフォルダで実行）

```bash
# 1. 何が変わるかを確かめる（何も変えない）
node ai-ecosystem/scripts/install-global.mjs --dry-run

# 2. 入れる
node ai-ecosystem/scripts/install-global.mjs
```

3. Claude Code を一度終了して開き直す。ほかのプロジェクトで何か頼むと、ジェブの判断手順が効いている。
4. APIキーを使うスクリプト用に、`~/.claude/jeb/.env.example` を `~/.claude/jeb/.env` に複製し、1Password の参照に書き換える（3章と同じ）。

### 更新と取り外し

- **更新**: リポジトリを `git pull` してから、もう一度 `install-global.mjs` を実行する。フック・スキル・スクリプトは新しくなる。
  - `~/.claude/jeb/knowledge`（育てたメモ・NG 辞書）とデザインシステムは、そのまま残る。
  - そのため、リポジトリ側で更新したルールや NG 辞書は、PC 全体には自動では届かない。違いは `diff -r ai-ecosystem/knowledge ~/.claude/jeb/knowledge` で確かめ、必要な行だけ写す。
- **取り外し**: `node ai-ecosystem/scripts/install-global.mjs --uninstall`。設定と CLAUDE.md から追記した分だけを外し、控えておいたスキルを戻す。`~/.claude/jeb`（メモとバックアップ）は残すので、不要なら中身を確かめてから自分で消す。

### 注意

- `~/.claude/jeb/knowledge` は Git に入らない。別の PC とも使いたいメモは、リポジトリの `ai-ecosystem/knowledge` に移して共有するか、私的用の保管庫（5章）に置く。
- フックの登録には bash の書き方を使っている。Mac と Linux はそのまま動く。Windows では Git Bash が必要。
- 特定のプロジェクトでだけ止めたいときは、そのプロジェクトの `.claude/settings.local.json` に書く。例: `{"env": {"JEB_STYLE_CHECK": "off"}}`
- 止められる項目の一覧は、README の「一時的に止めたいとき」にある。

## 13. 利用制限を常に表示する（PC・携帯）

### PC（ターミナルの Claude Code）

このリポジトリで Claude Code を開くと、画面の下（ステータスライン）に週間と5時間の利用制限が常に出る。

```
Opus 5.5 ｜ 週 ■■■■□□□□□□ 41%（11/11(水) 17:23 リセット） ｜ 5時間 24%（19:23）
```

- 色は、50% 未満が緑、50〜79% が黄、80% 以上が赤。
- 数字が変わるのは、Claude Code が返答を受け取ったとき。待機中も1分ごとに描き直すが、数字は前の返答のときのまま。携帯や Web で使った分は、PC で次に返答を受け取るまで反映されない。
- 表示されるのは Pro・Max・Ultra の契約のとき。新しく開いた直後は、最初の返答を受け取るまで「週 --」になる。返答のあとも「週 --」のままなら、その契約では表示されないか、リセットの直後。
- 画面の幅が狭いときは、モデル名や曜日を省いた短い表示になる。
- ほかのプロジェクトでも出したいときは、12章のインストーラーで PC 全体に入れる。自分のステータスラインをすでに使っている場合、インストーラーはそちらを残す（上書きしない）。
- このリポジトリの中だけは、リポジトリの設定（`.claude/settings.json`）のステータスラインが優先される。ここでも自分のものを使いたいときは、`.claude/settings.local.json` に自分の `statusLine` を書く。
- デスクトップアプリでは、入力欄の下の利用状況の表示をクリックすると確認できる。

### 携帯

公式ドキュメントには、携帯の Claude アプリや claude.ai/code で利用制限を常に表示する機能の記載がない（2026年11月8日に確認）。代わりに次の方法で見る。

**方法1: claude.ai の使用状況のページを開く**

携帯のブラウザで https://claude.ai/settings/usage を開く。設定は要らない。ここに5時間・週間の利用状況が出ると言われているが、表示の中身は公式ドキュメントで確認できていない。

**方法2: Obsidian のメモで見る**

1. 5章のとおり、私的用の保管庫を `OBSIDIAN_VAULT` に設定する（フォルダの絶対パスで書く）。
2. ほかのプロジェクトでもメモを更新したいときは、`~/.claude/settings.json` の `env` にも同じ `OBSIDIAN_VAULT` を書く。5章の手順だけだと、このリポジトリで開いているときしか書かれない。
3. 保管庫の `Claude/利用状況.md` が、利用率の数字が変わるたびに書き換わる。
   ```
   # Claude の利用状況
   - PC で受け取った時刻: 11/8 17:23
   - 週間: 41% ■■■■□□□□□□　リセット 11/11(水) 17:23
   - 5時間: 24% ■■□□□□□□□□　リセット 19:23
   ```
4. 保管庫を携帯と同期する。iPhone なら Obsidian Sync（有料）か iCloud Drive。Android なら Obsidian Sync か、Syncthing などの同期アプリ。
5. 携帯の Obsidian でこのメモにスター（ブックマーク）を付けておくと、すぐ開ける。

「PC で受け取った時刻」は、その数字を PC が受け取った時刻。携帯や Web で使った分は、PC で次に返答を受け取るまで反映されない。PC の Claude Code を開いたまま待機している別のセッションが古い数字を持っていても、新しい数字を上書きしないようにしてある。

**方法3: Remote Control 中に `/usage` を送る**

スマホから Remote Control で PC につないでいるときに `/usage` と送ると、その時点の利用状況が文字で返ってくる。

## 14. 動作確認チェックリスト

- [ ] `claude` を起動して何か依頼すると、判断手順（ジェブ判断プロトコル）が効いている
- [ ] `rm -rf ai-ecosystem/knowledge` を頼むと止められる
- [ ] `knowledge/dictionary/ng-phrases.md` にある表現を含む文章を書かせると、書き直しを求められる
- [ ] ファイルを作らせて終わろうとすると、jeb-judge の検品を促される
- [ ] `with-secrets.sh` 経由でキーが読める
- [ ] `node ai-ecosystem/scripts/judge-image.mjs --task テスト <画像>` が判定を返す
- [ ] Obsidian で `ai-ecosystem/knowledge` が開ける
