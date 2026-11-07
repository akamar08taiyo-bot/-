---
name: web-publish
description: 作ったページを公開する出口。レポートやLPは Vercel にパスワード付きURLでデプロイ、独自ドメインのブログは Cloudflare に本番反映、元のコードは GitHub で共有する。「URLにして」「デプロイして」「公開して」と言われたら使う。本番反映は人間の確認後。
---

# Webに出す（Vercel / Cloudflare / GitHub）

## どこに出すか

| 用途 | 出口 | 公開範囲 |
| --- | --- | --- |
| レポート・提案資料・LPの確認用 | Vercel | パスワード付きURL（Deployment Protection） |
| 独自ドメインで運用するブログ・サイト | Cloudflare（Pages / Workers） | 一般公開 |
| 元のコードの共有（複数PC・複数人） | GitHub | リポジトリの権限どおり |

## 手順

1. **ビルドと表示確認**: `quality-inspector` でビルドし、Playwright で PC幅とスマホ幅のスクリーンショットを撮る。
2. **検品**: `jeb-judge` に依頼文とスクリーンショットを渡す。個人情報・社外秘が入っていないかも確認させる。
3. **プレビュー**（確認用URL）:
   - Vercel: Vercel のコネクター、または `vercel deploy`（本番ではないプレビュー）。プロジェクト設定でパスワード保護を有効にしておく。
   - Cloudflare: `wrangler pages deploy <dir> --branch preview` のようにプレビュー用ブランチへ。
4. **人間の確認**: プレビューURLを渡す。パスワードはチャットに書かず、1Password で共有してもらう。
5. **本番反映**（OK が出てから）: `vercel --prod` / `wrangler pages deploy <dir>`（`.claude/settings.json` で毎回確認が出る）。
6. **コードの共有**: 変更はブランチでコミットして GitHub に push し、必要ならプルリクエストにする（強制 push はフックで止まる）。

## 注意

- 顧客資料はパスワードなしで公開しない。
- デプロイ先のトークンは 1Password（`.env` は `op://` 参照）か各 CLI のログインを使う。
