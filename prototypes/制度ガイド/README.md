# 制度ガイド（無料プレゼント3点の試作）

偉人編「知らないと損する制度」の動画の最後で配る、3つの無料プレゼントの試作です（2026年10月5日）。

- `index.html`：3つをまとめて見せるプレビューの入口（Claude の Artifact として公開。DOCTYPE なしで書く決まり）
- `kaisei.html`：知らないと損する お金の制度改正まとめ
- `shindan.html`：あなたに合う制度の診断（答えとチェックは端末の localStorage だけ）
- `kyufu.html`：だれ向け？ 国の給付金・手当の一覧

見た目は「おかねの地図」のサイト（`styles.css`・`start.css`）に合わせ、新しい部品は `gift.css` にあります。`preview.js`・`preview.css` はプレビュー専用で、実際のサイトには入れません。

## 作り直し方

1. 制度の中身を直すときは `reports/制度データ 2026-10.json` だけを直す（3ページの数字はすべてここから）。
2. `python3 build.py` で3ページと `seido-data.js` を作り直す。
3. `python3 make_index.py` で入口のページを作り直す。
4. 画面を変えたら、`files/poster-*.webp`（スマホの画面の写真）も撮り直す。

公開中のプレビュー：https://claude.ai/artifact/6n3arH81sbf5GmaoSQbHaq
