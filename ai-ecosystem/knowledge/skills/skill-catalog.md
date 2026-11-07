---
tags: [ナレッジ, スキル]
---
# スキル一覧と使い方のコツ

小さいタスクごとにスキルを作り、組み合わせて大きなタスクをこなす。使ってみて分かったコツや失敗は、各スキルの「コツ」に日付つきで足していく。

| スキル | 何をするか | 組み合わせる相手 |
| --- | --- | --- |
| ask-other-ai | 画像生成→Codex、長い資料・動画レビュー→Gemini、見た目判定→OpenAI Vision | ほぼ全部 |
| blog-article | 動画・資料からブログ記事を1本 | japanese-polish, web-publish, sns-post |
| ad-video | 広告動画（静止画で確認してから動画化） | ask-other-ai, video-edit |
| video-edit | カット・テロップ・図 | telop-writer（サブエージェント） |
| thumbnail-banner | サムネ・バナー・漫画 | ask-other-ai |
| slides | 案件ごとのデザインでスライド | ask-other-ai, web-publish |
| minutes-report | 議事録・レポート | obsidian-memo |
| invoice-moneyforward | 請求書（人間の承認つき） | — |
| sns-post | X投稿の下書き | thumbnail-banner |
| japanese-polish | 日本語の推敲と辞書の更新 | obsidian-memo |
| obsidian-memo | メモの登録 | 全部 |
| web-publish | Vercel / Cloudflare / GitHub | quality-inspector |
| daily-digest | 毎日のまとめ | obsidian-memo |

## コツ（使いながら足す）

### ask-other-ai
- 画像に文字を入れたいときは、絵だけ生成して文字は HTML で載せると崩れない。

### slides
- 案件ごとにデザインシステムを分けると、毎回同じ雰囲気で出せる。新しい案件は `design-systems/_template` を複製する。

### ad-video
- 動画にする前に1秒ごとの静止画で確認すると、やり直しが減る。
