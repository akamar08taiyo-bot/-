---
name: daily-digest
description: 毎日の定期タスク。AIニュース、YouTubeのネタ、メール（Gmail）、Discordでの仕事のやり取りを集めてまとめ、今日のタスク一覧を作る。定期実行（スケジュール）から呼ばれるほか、「今日のまとめを作って」と言われたら使う。
---

# 毎日のまとめ（ニュース・ネタ・メール・Discord）

## 集めるもの

1. **AIニュース**: Web検索で過去24時間の生成AIの主要ニュースを5件まで。各1行の要点と出典URL。
2. **YouTubeのネタ**: ニュースと `ai-ecosystem/knowledge/sns/x-ideas.md` から、動画にできそうなネタを3つ（タイトル案つき）。
3. **メール**: Gmail コネクターで未読・要返信を探し、「要返信」「確認だけ」「対応不要」に分ける。返信は下書きまで（送信は人間）。
4. **Discord**: `ai-ecosystem/bots/discord-digest.mjs` を実行して、チームのやり取りの要約と今日のタスクを受け取る。
   ```bash
   ai-ecosystem/scripts/with-secrets.sh node ai-ecosystem/bots/discord-digest.mjs --dry-run
   ```
5. **予定**: Googleカレンダーで今日の予定。

## まとめ方

```
# YYYY-MM-DD のまとめ
## 今日のタスク（優先順）
## 要返信メール
## チームのやり取り（Discord）
## AIニュース
## 動画・Xのネタ
```

- メールや Discord の中身を含むので、私的用の保管庫に保存する（`OBSIDIAN_VAULT/daily/<YYYY-MM-DD>.md`。未設定なら Git 除外の `ai-ecosystem/knowledge/daily/`）。公開リポジトリの共有ファイルには書かない。
- 動画・Xのネタは、公開してよいものだけ `sns/x-ideas.md` に追記する。
- 外部への送信（メール返信・投稿）は一切しない。下書きのみ。
- 保存する前に `jeb-judge` に渡し、事実と違う要約がないか、私的な情報を公開側に書いていないか、何も送信していないかを確認させる。
- **クラウドの定期タスクで動かすとき**は、`OBSIDIAN_VAULT` がなく、使い終わった環境ごとファイルが消える。まとめはセッションの最後の返答として出し（スマホの Claude アプリで読める）、残したい場合は Google ドライブの私的フォルダにコネクターで保存する。リポジトリにはコミットしない。

## 定期実行の登録

- クラウド: claude.ai の Claude Code でスケジュール（定期タスク）を作り、毎朝「daily-digest スキルで今日のまとめを作って」と送る。
- 自分のPC: cron などから `claude -p "daily-digest スキルで今日のまとめを作って"` を実行する。手順は `ai-ecosystem/SETUP.md`。
