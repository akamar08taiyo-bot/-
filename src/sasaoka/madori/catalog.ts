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

/** 部屋の種類のボタンの色（マイホームクラウドの一覧と同じ分け方：玄関まわり・居室・水まわり・和室・収納） */
const TONE = {
  entry: 'bg-stone-100 border-stone-300',
  live: 'bg-amber-50 border-amber-300',
  water: 'bg-sky-50 border-sky-300',
  wa: 'bg-green-50 border-green-400',
  store: 'bg-orange-50 border-orange-300',
  out: 'bg-slate-50 border-slate-300',
};

export type RoomType = {name: string; finish: Finish; size: [number, number]; tone: string};

/** 部屋の種類（size は方眼の何マス×何マス。0.5 は半マス） */
export const ROOM_TYPES: RoomType[] = [
  {name: 'ポーチ', finish: 'tile', size: [2, 1], tone: TONE.entry},
  {name: '玄関', finish: 'tile', size: [1.5, 1], tone: TONE.entry},
  {name: '土間', finish: 'doma', size: [2, 1], tone: TONE.entry},
  {name: 'シューズクローク', finish: 'floor', size: [1, 1], tone: TONE.entry},
  {name: '廊下', finish: 'floor', size: [1, 3], tone: TONE.entry},
  {name: 'LDK', finish: 'floor', size: [4, 4], tone: TONE.live},
  {name: '洋室', finish: 'floor', size: [3, 4], tone: TONE.live},
  {name: 'L', finish: 'floor', size: [3, 3], tone: TONE.live},
  {name: '主寝室', finish: 'floor', size: [4, 4], tone: TONE.live},
  {name: 'D', finish: 'floor', size: [3, 3], tone: TONE.live},
  {name: 'ファミリールーム', finish: 'floor', size: [3, 3], tone: TONE.live},
  {name: 'K', finish: 'floor', size: [2, 3], tone: TONE.live},
  {name: '書斎', finish: 'floor', size: [2, 2], tone: TONE.live},
  {name: '吹抜', finish: 'void', size: [2, 2], tone: TONE.out},
  {name: 'バルコニー', finish: 'outside', size: [4, 1], tone: TONE.out},
  {name: 'トイレ', finish: 'floor', size: [1, 1.5], tone: TONE.water},
  {name: '洗面脱衣室', finish: 'floor', size: [2, 2], tone: TONE.water},
  {name: '洗面所', finish: 'floor', size: [1.5, 1], tone: TONE.water},
  {name: '脱衣室', finish: 'floor', size: [1.5, 1.5], tone: TONE.water},
  {name: '浴室', finish: 'tile', size: [2, 2], tone: TONE.water},
  {name: 'シャワールーム', finish: 'tile', size: [1, 1], tone: TONE.water},
  {name: 'ユーティリティ', finish: 'floor', size: [2, 1.5], tone: TONE.water},
  {name: '収納', finish: 'plain', size: [1, 1], tone: TONE.store},
  {name: 'ウォークインクローゼット', finish: 'plain', size: [2, 2], tone: TONE.store},
  {name: '押入', finish: 'plain', size: [2, 1], tone: TONE.store},
  {name: '和室', finish: 'tatami', size: [3, 4], tone: TONE.wa},
  {name: '床の間', finish: 'wood', size: [1, 0.5], tone: TONE.store},
  {name: '広縁', finish: 'floor', size: [1, 3], tone: TONE.store},
  {name: '仏間', finish: 'wood', size: [1, 1], tone: TONE.store},
  {name: '板の間', finish: 'wood', size: [2, 2], tone: TONE.store},
  {name: '小屋裏収納', finish: 'plain', size: [2, 2], tone: TONE.store},
  {name: '納戸', finish: 'plain', size: [2, 2], tone: TONE.store},
  {name: 'テラス', finish: 'tile', size: [3, 1], tone: TONE.out},
  {name: '車庫', finish: 'doma', size: [3, 6], tone: TONE.out},
  {name: '屋外', finish: 'outside', size: [3, 2], tone: TONE.out},
];
export const roomType = (name?: string) => ROOM_TYPES.find((r) => r.name === name);
/** 種類のない部屋（名前だけ打った部屋）は柄なし。前の版の名前（風呂）も読む */
export const roomFinish = (type?: string): Finish => roomType(type === '風呂' ? '浴室' : type)?.finish ?? 'plain';

/** 一覧のボタンに出す短い名前（マイホームクラウドと同じく、長い名前は小さく2行） */
export const ROOM_SHORT: Record<string, string> = {シューズクローク: 'シューズ\nクローク', ファミリールーム: 'ファミリー\nルーム', 洗面脱衣室: '洗面\n脱衣室', シャワールーム: 'シャワー\nルーム', ユーティリティ: 'ユーティ\nリティ', ウォークインクローゼット: 'ウォークイン\nクローゼット', 小屋裏収納: '小屋裏\n収納'};

/** 建具（w＝開口の幅 mm） */
export const DOOR_TYPES: {name: string; w: number}[] = [
  {name: '片開き戸', w: 780},
  {name: '両開き戸', w: 1600},
  {name: '片引き戸', w: 800},
  {name: '引違い戸', w: 1650},
  {name: '折れ戸', w: 800},
  {name: '玄関ドア', w: 850},
  {name: '開口', w: 800},
];
/** 窓 */
export const WINDOW_TYPES: {name: string; w: number}[] = [
  {name: '引違い窓', w: 1650},
  {name: '掃き出し窓', w: 1650},
  {name: '小窓', w: 600},
  {name: 'FIX窓', w: 800},
];

/** 設備・家具（w×h mm。向きは上が壁側） */
export const FIX_TYPES: {name: string; w: number; h: number; group: '水まわり' | '家具' | '福祉'}[] = [
  {name: '洋式便器', w: 400, h: 700, group: '水まわり'},
  {name: '和式便器', w: 400, h: 650, group: '水まわり'},
  {name: '洗面台', w: 750, h: 550, group: '水まわり'},
  {name: '手洗器', w: 400, h: 300, group: '水まわり'},
  {name: '浴槽', w: 1500, h: 750, group: '水まわり'},
  {name: 'キッチン', w: 2550, h: 650, group: '水まわり'},
  {name: '洗濯機', w: 640, h: 640, group: '水まわり'},
  {name: '冷蔵庫', w: 650, h: 700, group: '家具'},
  {name: '下駄箱', w: 900, h: 400, group: '家具'},
  {name: 'ベッド', w: 1000, h: 2000, group: '家具'},
  {name: 'テーブル', w: 1200, h: 800, group: '家具'},
  {name: 'ソファ', w: 1800, h: 800, group: '家具'},
  {name: '机', w: 1000, h: 600, group: '家具'},
  {name: 'タンス', w: 900, h: 450, group: '家具'},
  {name: 'テレビ', w: 1000, h: 300, group: '家具'},
  {name: '椅子', w: 450, h: 450, group: '家具'},
  {name: '介護ベッド', w: 910, h: 1950, group: '福祉'},
  {name: 'ポータブルトイレ', w: 550, h: 600, group: '福祉'},
  {name: '車いす', w: 650, h: 1000, group: '福祉'},
  {name: 'シャワーチェア', w: 450, h: 500, group: '福祉'},
];
export const fixType = (name?: string) => FIX_TYPES.find((f) => f.name === name);

/** 階段（size は方眼のマス） */
export const STAIR_TYPES: {name: string; size: [number, number]}[] = [
  {name: '直階段', size: [1, 4]},
  {name: '折返し階段', size: [2, 2]},
  {name: 'L字階段', size: [2, 3]},
];

/** 段差の解消（w×h mm） */
export const STEP_TYPES: {name: string; w: number; h: number}[] = [
  {name: '踏み台', w: 600, h: 400},
  {name: 'スロープ', w: 900, h: 1800},
  {name: '式台', w: 900, h: 300},
];
