// 平面図の部品の種類（部屋・建具・窓・設備・階段・段差）。部屋の一覧はマイホームクラウド（WebCAD）の「部屋」の一覧と同じ並び・名前
// （ポーチ・玄関・土間・シューズクローク・廊下・LDK…車庫）。床の柄はいただいた見取図のテンプレートと同じ
// （フローリング＝橙の横じま・畳＝緑の畳割り・タイル＝青の目地・土間＝灰色）。大きさは方眼のマス（910mm）の何マスか

/** 床の柄 */
export type Finish = 'floor' | 'tatami' | 'tile' | 'doma' | 'plain' | 'void' | 'outside' | 'wood';

/** 床の柄ごとの色（画面・印刷・画像・Excel で同じ） */
export const FINISH: Record<Finish, {fill: string; line: string; name: string}> = {
  floor: {fill: '#fff4e8', line: '#ed8a3f', name: 'フローリング'},
  tatami: {fill: '#e2efda', line: '#2fa860', name: '畳'},
  tile: {fill: '#dbe8f6', line: '#6f9fd6', name: 'タイル'},
  doma: {fill: '#ebebeb', line: '#a6a6a6', name: '土間'},
  plain: {fill: '#ffffff', line: '#c8c8c8', name: 'なし'},
  void: {fill: '#ffffff', line: '#9a9a9a', name: '吹抜'},
  outside: {fill: '#f4f4f0', line: '#b8b8a8', name: '屋外'},
  wood: {fill: '#f7ead7', line: '#c49a6c', name: '板張り'},
};

/**
 * 部屋の種類の色（マイホームクラウドの一覧と同じ分け方：玄関まわり・居室・水まわり・和室・収納・外）。cls は一覧のボタン、fill・line は図の部屋の床と柄。
 * 図の部屋もボタンと同じ色にする（ユーザーの指示「色が単一なので、左の選択肢の水色や黄色にあわせる」2026-11-10。前は床の柄ごとの色で、
 * フローリングの部屋はみな橙だった）。柄の形（フローリングの横じま・畳割り・タイルの目地）はそのまま
 */
export type ToneKey = 'entry' | 'hall' | 'live' | 'water' | 'wa' | 'store' | 'out';
export const TONE: Record<ToneKey, {key: ToneKey; cls: string; fill: string; line: string}> = {
  entry: {key: 'entry', cls: 'bg-stone-100 border-stone-300', fill: '#efedeb', line: '#b8b2ac'},
  // 廊下・土間：茶色（マイホームクラウドと同じ。廊下を大きく描いて中に部屋を置くと、空いた所が茶色の廊下。ユーザーの指示「廊下を選択したら、空いている場所が廊下となる（茶色の部分）」2026-11-10）
  hall: {key: 'hall', cls: 'bg-[#e9e0cf] border-[#c9b893]', fill: '#e3d8c4', line: '#c4b28e'},
  live: {key: 'live', cls: 'bg-amber-50 border-amber-300', fill: '#fff6d6', line: '#f2c443'},
  water: {key: 'water', cls: 'bg-sky-50 border-sky-300', fill: '#e4f4fd', line: '#6ac5f2'},
  wa: {key: 'wa', cls: 'bg-green-50 border-green-400', fill: '#e3f6e8', line: '#3fbf6e'},
  store: {key: 'store', cls: 'bg-orange-50 border-orange-300', fill: '#fff0e0', line: '#f6aa5e'},
  out: {key: 'out', cls: 'bg-slate-50 border-slate-300', fill: '#f2f4f7', line: '#b3bfcd'},
};

export type RoomType = {name: string; finish: Finish; size: [number, number]; tone: (typeof TONE)[ToneKey]; row?: number; hidden?: boolean; full?: string}; // full＝略称（K など）の言葉（ボタンにマウスを乗せると出す）

/**
 * 部屋の種類（size は方眼の何マス×何マス。0.5 は半マス）。row は一覧の段（ユーザーの指示「和室、洋室、仏間、寝室、床の間、広縁／
 * 廊下、リビング、キッチン、ダイニングキッチン、リビングダイニングキッチン／トイレ、浴室、洗面脱衣室、洗面所、脱衣室／
 * ポーチ、玄関、土間、ベランダ、駐車場、テラス の順番に並べる」2026-11-10。そのうしろに道路＝「箇所の中に道路もいれる」2026-11-11）。一覧になかった応接間・収納は1段目、リビングダイニング・ダイニングは
 * 2段目の終わりに残した（「応接間をいれる」「LDもつくる」と言われたもの）。
 * リビング・キッチン…は英語の略称（L・K・DK・LDK・LD・D）に戻した（ユーザーの指示「キッチン、リビングダイニングキッチンは K、L、D、DK、LDK みたいな形で、略称、英語の略称で、に戻してください」
 * 2026-11-12。11-10 の並べ替えで言葉にしていた。DK は新しく足した）。言葉の名前で描いた部屋は、読み込むときに略称にする（`ROOM_ABBR`・model.ts の cleanMadori）。
 * hidden は一覧に出さない前の種類（前に描いた部屋の色・柄はそのまま）
 */
export const ROOM_TYPES: RoomType[] = [
  {name: '和室', finish: 'tatami', size: [3, 4], tone: TONE.wa, row: 1},
  {name: '洋室', finish: 'floor', size: [3, 4], tone: TONE.live, row: 1},
  {name: '仏間', finish: 'wood', size: [1, 1], tone: TONE.store, row: 1},
  {name: '寝室', finish: 'floor', size: [3, 4], tone: TONE.live, row: 1},
  {name: '床の間', finish: 'wood', size: [1, 0.5], tone: TONE.store, row: 1},
  {name: '広縁', finish: 'floor', size: [1, 3], tone: TONE.store, row: 1},
  {name: '応接間', finish: 'floor', size: [3, 4], tone: TONE.live, row: 1}, // ユーザーの指示「応接間をいれる」2026-11-10
  {name: '収納', finish: 'plain', size: [1, 1], tone: TONE.store, row: 1},
  {name: '廊下', finish: 'floor', size: [1, 3], tone: TONE.hall, row: 2},
  {name: 'L', full: 'リビング', finish: 'floor', size: [3, 3], tone: TONE.live, row: 2},
  {name: 'K', full: 'キッチン', finish: 'floor', size: [2, 3], tone: TONE.live, row: 2},
  {name: 'DK', full: 'ダイニングキッチン', finish: 'floor', size: [3, 3], tone: TONE.live, row: 2},
  {name: 'LDK', full: 'リビングダイニングキッチン', finish: 'floor', size: [4, 4], tone: TONE.live, row: 2},
  {name: 'LD', full: 'リビングダイニング', finish: 'floor', size: [4, 3], tone: TONE.live, row: 2}, // ユーザーの指示「LDもつくる」2026-11-10
  {name: 'D', full: 'ダイニング', finish: 'floor', size: [3, 3], tone: TONE.live, row: 2},
  {name: 'トイレ', finish: 'floor', size: [1, 1.5], tone: TONE.water, row: 3},
  {name: '浴室', finish: 'tile', size: [2, 2], tone: TONE.water, row: 3},
  {name: '洗面脱衣室', finish: 'floor', size: [2, 2], tone: TONE.water, row: 3},
  {name: '洗面所', finish: 'floor', size: [1.5, 1], tone: TONE.water, row: 3},
  {name: '脱衣室', finish: 'floor', size: [1.5, 1.5], tone: TONE.water, row: 3},
  {name: 'ポーチ', finish: 'tile', size: [2, 1], tone: TONE.entry, row: 4},
  {name: '玄関', finish: 'tile', size: [1.5, 1], tone: TONE.entry, row: 4},
  {name: '土間', finish: 'doma', size: [2, 1], tone: TONE.hall, row: 4},
  {name: 'ベランダ', finish: 'outside', size: [4, 1], tone: TONE.out, row: 4},
  {name: '駐車場', finish: 'doma', size: [3, 6], tone: TONE.out, row: 4},
  {name: 'テラス', finish: 'tile', size: [3, 1], tone: TONE.out, row: 4},
  {name: '道路', finish: 'doma', size: [8, 4], tone: TONE.out, row: 4}, // ユーザーの指示「箇所の中に道路もいれる」2026-11-11（玄関～道路の手すり・スロープの位置を描くため。幅4マス＝約3.6m）
  // 一覧に出さない前の種類（2026-11-09 の一覧。前に描いた部屋のため）
  {name: 'シューズクローク', finish: 'floor', size: [1, 1], tone: TONE.entry, hidden: true},
  {name: '主寝室', finish: 'floor', size: [4, 4], tone: TONE.live, hidden: true},
  {name: 'ファミリールーム', finish: 'floor', size: [3, 3], tone: TONE.live, hidden: true},
  {name: '書斎', finish: 'floor', size: [2, 2], tone: TONE.live, hidden: true},
  {name: '吹抜', finish: 'void', size: [2, 2], tone: TONE.out, hidden: true},
  {name: 'バルコニー', finish: 'outside', size: [4, 1], tone: TONE.out, hidden: true},
  {name: 'シャワールーム', finish: 'tile', size: [1, 1], tone: TONE.water, hidden: true},
  {name: 'ユーティリティ', finish: 'floor', size: [2, 1.5], tone: TONE.water, hidden: true},
  {name: 'ウォークインクローゼット', finish: 'plain', size: [2, 2], tone: TONE.store, hidden: true},
  {name: '押入', finish: 'plain', size: [2, 1], tone: TONE.store, hidden: true},
  {name: '板の間', finish: 'wood', size: [2, 2], tone: TONE.store, hidden: true},
  {name: '小屋裏収納', finish: 'plain', size: [2, 2], tone: TONE.store, hidden: true},
  {name: '納戸', finish: 'plain', size: [2, 2], tone: TONE.store, hidden: true},
  {name: '車庫', finish: 'doma', size: [3, 6], tone: TONE.out, hidden: true},
  {name: '屋外', finish: 'outside', size: [3, 2], tone: TONE.out, hidden: true},
];
/** 一覧に出す部屋（段ごと） */
/** 11-10〜11-12 に言葉の名前で描いた部屋の種類 → 略称（読み込むときに直す。model.ts の cleanMadori） */
export const ROOM_ABBR: Record<string, string> = Object.fromEntries(ROOM_TYPES.filter((t) => t.full).map((t) => [t.full!, t.name]));
export const ROOM_ROWS: RoomType[][] = [...new Set(ROOM_TYPES.map((t) => t.row).filter((r): r is number => !!r))].sort((a, b) => a - b).map((r) => ROOM_TYPES.filter((t) => t.row === r));
export const roomType = (name?: string) => ROOM_TYPES.find((r) => r.name === name);
/** 種類のない部屋（名前だけ打った部屋）は柄なし。前の版の名前（風呂）も読む */
export const roomFinish = (type?: string): Finish => roomType(type === '風呂' ? '浴室' : type)?.finish ?? 'plain';
/** 図の部屋の色（種類の色。種類のない部屋＝名前だけ打った部屋は白）。key は柄の id に使う */
export const roomColor = (type?: string): {key: ToneKey | 'base'; fill: string; line: string} => {
  const t = roomType(type === '風呂' ? '浴室' : type)?.tone;
  return t ?? {key: 'base', fill: FINISH.plain.fill, line: FINISH.plain.line};
};

/** 一覧のボタンに出す短い名前（マイホームクラウドと同じく、長い名前は小さく2行） */
export const ROOM_SHORT: Record<string, string> = {シューズクローク: 'シューズ\nクローク', ファミリールーム: 'ファミリー\nルーム', 洗面脱衣室: '洗面\n脱衣室', シャワールーム: 'シャワー\nルーム', ユーティリティ: 'ユーティ\nリティ', ウォークインクローゼット: 'ウォークイン\nクローゼット', 小屋裏収納: '小屋裏\n収納'};

/** 間口の建具（w＝開口の幅 mm。マイホームクラウドの「開口」と同じ並び。ユーザーの指示「間口を選択したら」2026-11-10） */
export const DOOR_TYPES: {name: string; w: number}[] = [
  {name: '開口', w: 800},
  {name: '片開き戸', w: 780},
  {name: '両開き戸', w: 1600},
  {name: '親子ドア', w: 1200},
  {name: '片開き戸（袖）', w: 1200},
  {name: '片引き戸', w: 800},
  {name: '引違い戸', w: 1650},
  {name: '引違い戸3枚', w: 2400},
  {name: '引違い戸4枚', w: 3200},
  {name: '折れ戸', w: 800},
  {name: '折れ戸2枚', w: 1600},
  {name: '玄関ドア', w: 850},
];
/** 窓 */
export const WINDOW_TYPES: {name: string; w: number}[] = [
  {name: '引違い窓', w: 1650},
  {name: '掃き出し窓', w: 1650},
  {name: '小窓', w: 600},
  {name: 'FIX窓', w: 800},
];

/**
 * 住設・家具（w×h mm。向きは上が壁側）。group：住設（マイホームクラウドの「住設」と同じ並び）・家具・福祉。hidden は一覧に出さない前の種類
 * （ユーザーの指示「住設を選択したら」「家具を選択したら」2026-11-10）
 */
export type FixGroup = '住設' | '家具' | '福祉';
export const FIX_TYPES: {name: string; w: number; h: number; group: FixGroup; hidden?: boolean}[] = [
  // 浴室・トイレを先頭（一覧の左上）に（ユーザーの指示「住設では、浴室、トイレは左上にもってくる」2026-11-11）
  {name: '浴槽', w: 1500, h: 750, group: '住設'},
  {name: 'ユニットバス', w: 1600, h: 1600, group: '住設'},
  {name: '洋式便器', w: 400, h: 700, group: '住設'},
  {name: '和式便器', w: 400, h: 650, group: '住設'},
  {name: 'トイレ付ユニットバス', w: 1600, h: 2000, group: '住設'},
  {name: '洗面セット', w: 1400, h: 600, group: '住設'},
  {name: 'I型キッチン', w: 2550, h: 650, group: '住設'},
  {name: '対面キッチン', w: 2550, h: 900, group: '住設'},
  {name: 'アイランド型キッチン', w: 2550, h: 1000, group: '住設'},
  {name: 'L型キッチン', w: 2400, h: 1800, group: '住設'},
  {name: '床下収納', w: 600, h: 600, group: '住設'},
  {name: 'キッチンカウンター', w: 1800, h: 450, group: '住設'},
  {name: '床下点検口', w: 600, h: 600, group: '住設'},
  {name: '洗面化粧台', w: 750, h: 550, group: '住設'},
  {name: '手洗器', w: 400, h: 300, group: '住設'},
  {name: '洗濯パン', w: 640, h: 640, group: '住設'},
  {name: '洗濯機', w: 640, h: 640, group: '住設'},
  {name: '玄関収納', w: 900, h: 400, group: '住設'},
  {name: '間仕切', w: 1800, h: 100, group: '住設'},
  {name: 'ロフト', w: 1820, h: 1820, group: '住設'},
  {name: '食卓セット4人用', w: 1200, h: 1500, group: '家具'},
  {name: '食卓セット6人用', w: 1800, h: 1500, group: '家具'},
  {name: '食卓セット2人用', w: 750, h: 1500, group: '家具'},
  {name: '食卓2人用', w: 750, h: 750, group: '家具'},
  {name: '食卓4人用', w: 1200, h: 800, group: '家具'},
  {name: '食卓6人用', w: 1800, h: 900, group: '家具'},
  {name: 'いす', w: 450, h: 450, group: '家具'},
  {name: 'スツール', w: 350, h: 350, group: '家具'},
  {name: '食器棚', w: 1000, h: 450, group: '家具'},
  {name: '冷蔵庫', w: 650, h: 700, group: '家具'},
  {name: 'ベッド', w: 1000, h: 2000, group: '家具'},
  {name: 'ソファ', w: 1800, h: 800, group: '家具'},
  {name: '机', w: 1000, h: 600, group: '家具'},
  {name: 'タンス', w: 900, h: 450, group: '家具'},
  {name: 'テレビ', w: 1000, h: 300, group: '家具'},
  {name: '介護ベッド', w: 910, h: 1950, group: '福祉'},
  {name: 'ポータブルトイレ', w: 550, h: 600, group: '福祉'},
  {name: '車いす', w: 650, h: 1000, group: '福祉'},
  {name: 'シャワーチェア', w: 450, h: 500, group: '福祉'},
  // 一覧に出さない前の種類（2026-11-09 の一覧）
  {name: '洗面台', w: 750, h: 550, group: '住設', hidden: true},
  {name: 'キッチン', w: 2550, h: 650, group: '住設', hidden: true},
  {name: '下駄箱', w: 900, h: 400, group: '住設', hidden: true},
  {name: 'テーブル', w: 1200, h: 800, group: '家具', hidden: true},
  {name: '椅子', w: 450, h: 450, group: '家具', hidden: true},
];
export const fixType = (name?: string) => FIX_TYPES.find((f) => f.name === name);

/**
 * 階段（size は方眼のマス。マイホームクラウドの階段の形。ユーザーの指示「階段を選択したら」2026-11-10）。
 * 種類を増やした（ユーザーの指示「階段の種類は増やす」2026-11-10）：一覧は2列なので、似た形を左右に並べる（踊り場・回り段の組）。
 * 先頭は前と同じ折返し階段（知らない種類を読んだときの代わり）。L字・回り・コ字などの曲がる向きは、選んで「⇆ 左右反転」
 */
export const STAIR_TYPES: {name: string; size: [number, number]}[] = [
  {name: '折返し階段', size: [2, 2]},
  {name: '折返し回り階段', size: [2, 2]},
  {name: 'L字階段', size: [2, 3]},
  {name: '回り階段', size: [2, 3]},
  {name: '直階段', size: [1, 4]},
  {name: '直階段（踊り場）', size: [1, 5]},
  {name: 'コ字階段', size: [3, 2.5]},
  {name: 'らせん階段', size: [2, 2]},
  {name: '外階段（3段）', size: [1.5, 1]},
];

/** 段差の解消（w×h mm） */
export const STEP_TYPES: {name: string; w: number; h: number}[] = [
  {name: '踏み台', w: 600, h: 400},
  {name: 'スロープ', w: 900, h: 1800},
  {name: '式台', w: 900, h: 300},
];
