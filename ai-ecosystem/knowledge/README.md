---
tags: [ナレッジ, 目次]
---
# ナレッジ（AI用メモの保管庫）

AIが作業しながら書き足していくメモ置き場。Obsidian で「フォルダを保管庫として開く」→ このフォルダを選ぶと、そのまま読み書きできる。
GitHub で共有しているので、別のPCや別の作業者とも同じメモを使える。

| フォルダ | 中身 | 誰が使うか |
| --- | --- | --- |
| `rules/` | 文章・デザイン・見直しのルール | CLAUDE.md が毎回読み込む |
| `dictionary/` | AIっぽい言い回し・見た目のNG一覧 | `style-check.mjs` フックが自動チェックに使う |
| `skills/` | スキルの使い方・コツ・失敗と対策 | planner が段取りに使う |
| `sns/` | Xのネタ帳 | sns-post / daily-digest |
| `newsletter/` | メルマガの発信履歴 | メルマガ作成時に重複を避ける |
| `clients/` | 案件・取引先ごとの決まり、宿題 | slides / invoice-moneyforward など |
| `daily/` | 毎日のまとめ | daily-digest |

メモの書き方は `obsidian-memo` スキルを参照。
