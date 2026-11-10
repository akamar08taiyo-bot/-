// （株）イヤーズ デモアプリのビルドか（vite.years.config.ts の define で __DEMO__ に 'years' を入れる）。
// 今までのアプリのビルド・テスト（Vite を通さない）では __DEMO__ がないので、typeof で見る（ないときに名前を読むとエラーになる）
declare const __DEMO__: string | undefined;

export const DEMO: boolean = typeof __DEMO__ === 'string' && __DEMO__ === 'years';
/** 画面の上に出すデモの名前（ユーザーの指示「ツールのどこかにイヤーズ（株）デモアプリみたいな感じでいれる」2026-11-10） */
export const DEMO_NAME = '（株）イヤーズ デモアプリ';
