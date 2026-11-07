---
name: japanese-polish
description: 日本語をきれいにするための推敲。文章ルールとNG表現の辞書に沿って直し、新しく見つけたAIっぽい言い回しを辞書に足す。記事・台本・メール・スライド原稿を仕上げる前や「日本語を直して」と言われたときに使う。
---

# 日本語の推敲

## 手順

1. `ai-ecosystem/knowledge/rules/writing.md` と `ai-ecosystem/knowledge/dictionary/ng-phrases.md` を確認する。
2. `japanese-editor` サブエージェントに対象ファイルを渡して直させる（長い文章は章ごとに分けて並列にしてよい）。
3. 直した文章を読み、意味・数字・固有名詞が変わっていないか元と見比べる。
4. `japanese-editor` が報告した「新しいNG表現の候補」を、`obsidian-memo` スキルで `ng-phrases.md` の表に追記する（追記すると、次から `style-check.mjs` フックが自動で見つける）。
5. 成果物の一部として使う文章なら、最後に `jeb-judge` の検品に回す。
