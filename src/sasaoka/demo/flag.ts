// （株）イヤーズ デモアプリのビルドか（vite.years.config.ts の define で __DEMO__ に 'years' を入れる）。
// 今までのアプリのビルド・テスト（Vite を通さない）では __DEMO__ がないので、typeof で見る（ないときに名前を読むとエラーになる）
declare const __DEMO__: string | undefined;

export const DEMO: boolean = typeof __DEMO__ === 'string' && __DEMO__ === 'years';
/** 画面の上に出すデモの名前（ユーザーの指示「ツールのどこかにイヤーズ（株）デモアプリみたいな感じでいれる」2026-11-10） */
export const DEMO_NAME = '（株）イヤーズ デモアプリ';
/**
 * デモでは出さない保険者（ユーザーの指示「久留米、飯塚、大分市の申請書はもう除いてください」2026-11-10）。
 * 新規作成のボタン・保険者を選ぶ欄・住所や介護保険証から保険者を決めるとき・ほかの市の申請書のページから外す。今までのアプリはそのまま
 */
export const DEMO_HIDDEN_INSURERS: readonly string[] = DEMO ? ['kurume', 'iizuka', 'oita'] : [];
