# 健康管理アプリ（パーソナル食事・健康・筋トレ・サプリ管理）

本人専用の健康管理アプリ。医療診断は行わず、事実の整理・提案・必要時の受診促しに徹する。
体重・体組成の記録を中核機能とし、食事・間食・飲酒・筋トレ・サプリ・健診データを一元管理する。

詳細な要件・画面設計・データ構造・AI判定ルール・医療安全ルールは元の引継ぎ資料を参照。

## 同梱アプリ

このリポジトリは Vite のマルチページ構成で、2つのフロントエンドをビルドする。

| ページ | 内容 |
| --- | --- |
| `index.html` | 健康管理アプリ（食事・健診・筋トレ・サプリ・体重） |
| `mortgage.html` | 住宅ローン 金利シナリオ・シミュレーター |

開発サーバー起動後は `http://localhost:3000/`（健康管理）と `http://localhost:3000/mortgage.html`（シミュレーター）でそれぞれ開ける。
公開後は `https://<ユーザー名>.github.io/<リポジトリ名>/mortgage.html`。

### 住宅ローン 金利シナリオ・シミュレーター

変動金利が段階的に上昇した場合に、月々返済額・残高・総返済額がどう変わるかを試算し、
**金利と総返済額の相関**をグラフで確認するための単体アプリ（Firebase 非依存・入力値はサーバーに送らない）。

- 借入額・返済期間・当初金利・見直し間隔・上昇幅・上限金利をその場で変更して再計算
- 「金利と総返済額の相関」グラフは、X軸を「見直しごとの上昇幅」と「全期間固定金利」で切り替え可能
- 累計利息 / 残高の推移、月々返済額の階段状の推移、区間ごとの内訳表
- 125%ルール（返済額の上昇を直前の1.25倍までに抑える）を有効にすると、未払利息と最終回の一括精算まで追跡する
- 条件はURLのクエリ（`?p=3300&y=35&r=1.25&s=0.25&rv=5&max=10&cap=0`）に反映されるため、そのまま共有できる

計算ロジックは `src/mortgage/calc.ts`（元利均等返済・見直しごとの返済額再計算＝いわゆる「5年ルール」に近い方式）。
上昇幅やタイミングは想定の一例であり、実際の適用金利・ルール・諸費用は金融機関によって異なる。

## 技術スタック

- フロントエンド: React 19 + TypeScript + Vite（マルチページ）+ Tailwind CSS 4（GitHub Pagesでホスティング）
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

## 自動デプロイ（GitHub Actions）

`main` ブランチへのpush時に `.github/workflows/deploy.yml` が2つのジョブを実行する。

- `deploy-pages`: フロントエンドをビルドし **GitHub Pages** に公開
- `deploy-firebase-backend`: Firestoreルールと Cloud Functions を **Firebase** にデプロイ

初回のみ、以下を手動でセットアップする。

1. **GitHub Pagesを有効化**
   リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** に変更
2. **Firebaseプロジェクトを作成**（未作成の場合）
   [Firebase Console](https://console.firebase.google.com/) → プロジェクトを追加 → Firestore・Authentication（匿名認証を有効化）を設定
3. **サービスアカウントキーを発行**（バックエンドデプロイ用）
   [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts) → 対象プロジェクト → サービスアカウントを作成
   → ロールに `Firebase 管理者`（`roles/firebase.admin`）付与 → キーを作成（JSON）してダウンロード
4. **GitHubリポジトリにSecretsを登録**
   リポジトリの Settings → Secrets and variables → Actions → New repository secret
   - `FIREBASE_SERVICE_ACCOUNT`: 手順3でダウンロードしたJSONファイルの中身をそのまま貼り付け
   - `FIREBASE_PROJECT_ID`: FirebaseプロジェクトID
   - `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID` / `VITE_FIREBASE_APP_ID`: `.env.example` と同じ値（GitHub Pagesの静的ビルドに埋め込むため）
5. **LLM APIキーをCloud Functions側に登録**（一度だけ、ローカルから）
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add                          # 手順2のプロジェクトを選択
   firebase functions:secrets:set LLM_API_KEY
   ```

以降は `main` へのpush、または GitHub の Actions タブから `workflow_dispatch` で手動実行することでデプロイされる。
公開URLは `https://<GitHubユーザー名>.github.io/<リポジトリ名>/`。

Firebase Web SDKの設定値（`VITE_FIREBASE_*`）はクライアント側に埋め込まれるが、アクセス制御は `firestore.rules` で行っているため、これらの値自体を秘匿する必要はない。

## 実装範囲（MVP）

含む: 体重・体組成記録+推移グラフ、食事記録（テキスト入力+AI分解+確認画面）、よく食べるメニュー、間食管理、筋トレ記録、サプリ管理+重複警告、健診データ入力+前年比、ホームサマリ+改善提案（最大3件）。

見送り（次フェーズ）: AIアシスタント自由対話、献立提案の高度化、週次レポート自動生成、健診前モード、音声/写真入力、目標体重に基づく自動ペース計算。

## 医療安全上の注意

本アプリは診断を行わず、体重・数値の増減について断定的な評価（「肥満です」等）はしない。
症状トリガー（胸痛・息切れ・動悸・失神・浮腫）が入力された場合は必ず受診相談を促す。
薬・サプリの中止を指示することはなく、医師の指示を常に優先する。
