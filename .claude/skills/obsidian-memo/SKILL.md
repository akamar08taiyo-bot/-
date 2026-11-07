---
name: obsidian-memo
description: AI用のメモをObsidianの保管庫（ai-ecosystem/knowledge）に登録する。不自然な日本語、スキルの使い方のコツ、失敗と対策、メルマガの発信履歴、Xのネタ、案件メモなどを能動的に残す。作業が完成したとき、新しいコツが分かったとき、「メモして」と言われたときに使う。
---

# Obsidian にメモを登録する

保管庫は `ai-ecosystem/knowledge`（環境変数 `OBSIDIAN_VAULT` があればそちらにも書ける）。Obsidian で「フォルダを保管庫として開く」で、そのまま読める。

## どこに書くか

| 内容 | ファイル |
| --- | --- |
| AIっぽい・不自然な言い回し | `dictionary/ng-phrases.md`（表に1行足す。フックが自動検出に使う） |
| AIっぽい見た目 | `dictionary/ng-design.md` |
| スキルの使い方・コツ・失敗と対策 | `skills/skill-catalog.md` の該当スキルの節 |
| Xの投稿ネタ | `sns/x-ideas.md` |
| メルマガの発信履歴 | `newsletter/history.md` |
| 案件・取引先ごとの決まりや宿題 | `clients/<案件名>.md`（`clients/_template.md` を複製） |
| 日々の記録 | `daily/<YYYY-MM-DD>.md` |

## 書き方

- 1メモ1行〜数行。日付（YYYY-MM-DD）と、次に何をすればよいかを書く。
- Obsidian のリンク `[[ファイル名]]` で関連メモをつなぐ。
- 既存の表に足すときは、表の形（`| 列1 | 列2 |`）を崩さない。
- 個人情報・APIキー・パスワードは書かない。
- Obsidian CLI を使っている場合はそれで登録してよい（中身は同じ Markdown）。

## 書いたあと

書いたファイルと追記した行を報告する。辞書に足した場合は「次回からフックで検出される」ことも伝える。
