---
name: slides
description: 登壇・営業・社内向けのスライドを作る。案件ごとのデザインシステムで毎回同じ見た目にし、挿絵はCodex、確認はLibreOfficeで画像化して行う。「スライドを作って」「登壇資料を作って」と言われたら使う。案件名があれば、その案件のデザインシステムを必ず使う。
---

# スライド作成

## 案件ごとに分ける

- デザインは `ai-ecosystem/design-systems/<案件>/`（DESIGN.md と tokens.json）。案件名が分からなければ人間に聞く。指定がなければ `default`。
- A社のロゴ・写真・言い回しをB社の資料に入れない。案件専用のルールが多い場合は、このスキルを `slides-<案件>` として複製し、案件の決まりを書き足す。
- 新しい案件は `ai-ecosystem/design-systems/_template/` を複製して作る。

## 手順

1. **段取り**: 目的・聞き手・時間（1枚1分が目安）・持ち帰ってほしい一言を確認し、`planner` で章立てを作る。`jeb-judge` に plan として判定させる。
2. **1枚1メッセージの原稿**: 各スライドの見出し（言い切りの一文）と本文（3項目まで）を書く。`japanese-editor` で推敲。
3. **作る**: 次のどれかで作る。
   - PowerPoint で渡す: python-pptx などで .pptx を生成（tokens.json の色・書体を使う）。
   - Web で見せる: HTML スライドを作り、`web-publish` でパスワード付きURLにする。
4. **挿絵・図**: `ask-other-ai` で Codex に生成させる。図の矢印や文字は `judge-image.mjs` で確認。
5. **画像化して確認**: 
   ```bash
   soffice --headless --convert-to pdf --outdir ai-ecosystem/output/<案件>/ deck.pptx
   pdftoppm -png -r 80 ai-ecosystem/output/<案件>/deck.pdf ai-ecosystem/output/<案件>/page
   ```
   `quality-inspector` にページ画像を見せ、はみ出し・重なり・小さすぎる文字（本文18pt未満）を探す。
6. **検品**: `jeb-judge` に依頼文・ファイル・ページ画像を渡す。PASS なら納品。
