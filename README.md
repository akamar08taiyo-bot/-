# 健康管理アプリ（パーソナル食事・健康・筋トレ・サプリ管理）

本人専用の健康管理アプリ。医療診断は行わず、事実の整理・提案・必要時の受診促しに徹する。
体重・体組成の記録を中核機能とし、食事・間食・飲酒・筋トレ・サプリ・健診データを一元管理する。

詳細な要件・画面設計・データ構造・AI判定ルール・医療安全ルールは元の引継ぎ資料を参照。

## 技術スタック

- フロントエンド: React 19 + TypeScript + Vite + Tailwind CSS 4
- グラフ: Recharts
- バックエンド: Firebase（Firestore, Anonymous Auth, Cloud Functions）
- AI連携: クライアント → Cloud Function（APIキーはサーバー側env） → LLM API

## セットアップ

**前提:** Node.js 20+

1. 依存関係をインストール
   ```
   npm install
   ```
2. `.env.example` を `.env.local` にコピーし、Firebase プロジェクトの Web SDK 設定値を入力
   ```
   cp .env.example .env.local
   ```
3. 開発サーバーを起動
   ```
   npm run dev
   ```

## Firebase バックエンド

- `firestore.rules` — `users/{uid}` 配下は本人（`request.auth.uid == uid`）のみ read/write 可能
- `functions/` — 食事テキストのAI分解を行う Cloud Function（`parseMeal`）。LLM APIキーはクライアントに一切含めない
- Firestore データ構造は `src/types.ts` を参照（引継ぎ資料 5章と対応）

Cloud Functions をデプロイする場合:
```
firebase use --add                          # 初回のみ：Firebaseプロジェクトを紐付け
firebase functions:secrets:set LLM_API_KEY  # LLM APIキーをサーバー側に登録（クライアントには含めない）
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

`functions/src/index.ts` の `LLM_API_BASE_URL` / `LLM_MODEL` 環境変数で利用するLLMプロバイダを切り替え可能（既定はOpenAI互換のchat completions）。

## 実装範囲（MVP）

含む: 体重・体組成記録+推移グラフ、食事記録（テキスト入力+AI分解+確認画面）、よく食べるメニュー、間食管理、筋トレ記録、サプリ管理+重複警告、健診データ入力+前年比、ホームサマリ+改善提案（最大3件）。

見送り（次フェーズ）: AIアシスタント自由対話、献立提案の高度化、週次レポート自動生成、健診前モード、音声/写真入力、目標体重に基づく自動ペース計算。

## 医療安全上の注意

本アプリは診断を行わず、体重・数値の増減について断定的な評価（「肥満です」等）はしない。
症状トリガー（胸痛・息切れ・動悸・失神・浮腫）が入力された場合は必ず受診相談を促す。
薬・サプリの中止を指示することはなく、医師の指示を常に優先する。
