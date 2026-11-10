// 平面図（見取図）のデータ（様邸の画面の「📐 平面図」。ユーザーの指示「平面図をつくれるような機能を追加する。まどりっちの機能やマイホームクラウドの機能もつけくわえる」2026-11-09）。
// いただいた Excel の「住宅改修工事　見取図」のテンプレート（900mm 刻みの部屋の箱・フローリング／畳／タイルの柄・階段・トイレ・浴槽・ドア・窓・
// 赤い手すりの線と①②・右の「① L＝600mm」の一覧）と同じものを、方眼の上で部品を置いて作る。
// 長さはすべて mm。位置は図の左上を 0。部品は階（1階・2階…）ごとに持つ。

/** 部品の種類 */
export type MKind =
  | 'room' // 部屋（四角。種類で色・柄・名前）
  | 'door' // 建具（片開き・引き戸など。壁の上に置く）
  | 'window' // 窓（壁の上に置く）
  | 'fix' // 設備・家具（トイレ・浴槽・キッチン・ベッドなど）
  | 'stair' // 階段
  | 'rail' // 手すり（横手すり＝赤い線。両端に点。番号つき）
  | 'vrail' // 縦手すり（赤い点。番号つき）
  | 'step' // 段差の解消（踏み台・スロープ）
  | 'num' // 番号（①②。自由に置く）
  | 'text' // 文字
  | 'line' // 線（汎用作図。壁の足りない所など）
  | 'dim'; // 寸法線（長さを自動で書く）

export type Rot = 0 | 90 | 180 | 270;

/**
 * 部品1つ。x・y＝左上（線の部品は始点）、w・h＝幅・奥行（線の部品は終点までの差 dx・dy）。
 * 建具・窓は x・y が壁の上の開口のまん中、w が開口の幅、rot が壁の向き（0＝横の壁・90＝縦の壁）、flip が開く側
 */
export type MItem = {
  id: string;
  kind: MKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: Rot;
  type?: string; // 部屋・建具・窓・設備・階段・段差の種類（catalog.ts）
  label?: string; // 部屋の名前（空なら種類の名前）・文字
  flip?: boolean; // 建具の開く向き（壁の反対側へ）
  hinge?: boolean; // 建具の吊り元を反対の端に
  n?: number; // 番号（手すり・縦手すり・段差・番号。0 か空なら自動の連番）
  place?: string; // 申請書の箇所（Place.id）。つなぐと番号と凡例の文がその箇所のもの（写真番号・改修の内容）
  len?: number; // 縦手すり・L型手すりの縦の長さ（mm。凡例に書く）
  size?: number; // 文字の大きさ（mm。図の上の大きさ）
  note?: string; // 凡例に書く文を手で直したもの（空なら自動）
};

/** 下絵（スクリーンショット・手書きの間取りの写真をうすく敷いて、なぞって描く。写真はこの端末の IndexedDB の番号。photos.ts） */
export type Underlay = {photo: string; x: number; y: number; w: number; h: number; opacity: number; hidden?: boolean};

export type MFloor = {id: string; name: string; items: MItem[]; underlay?: Underlay};

/** 方眼の1マスの長さ（910＝尺モジュール・900・1000＝メーターモジュール） */
export type Module = 910 | 900 | 1000;
export const MODULES: Module[] = [910, 900, 1000];

export type Madori = {
  module: Module;
  snap: 1 | 2 | 4; // 方眼の1マスを何分割して部品をそろえるか（2＝半マス。マイホームクラウドの 1/2）
  floors: MFloor[];
  showDims: boolean; // 部屋の外まわりの寸法線を自動で出す
  showArea: boolean; // 部屋の名前の下に広さ（帖・㎡）
  legend?: string; // 右の一覧を手で直したもの（空なら自動。1行ずつ）
  updatedAt: number;
};

let seq = 0;
export const mid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyMadori(): Madori {
  return {module: 910, snap: 2, floors: [{id: mid(), name: '1階', items: []}], showDims: true, showArea: true, updatedAt: Date.now()};
}

/** 方眼にそろえる1歩（mm） */
export const snapStep = (m: Pick<Madori, 'module' | 'snap'>) => m.module / m.snap;
export const snapTo = (v: number, step: number) => Math.round(v / step) * step;

/** 部屋の広さ：㎡（小数2けた）と帖（1帖＝方眼の1マス×2マス。910 なら 1.656㎡・900 なら 1.62㎡。小数1けた） */
export function roomArea(w: number, h: number, module: Module): {m2: number; jo: number; tsubo: number} {
  const a = (Math.abs(w) * Math.abs(h)) / 1e6;
  const jo = (Math.abs(w) * Math.abs(h)) / (2 * module * module);
  return {m2: Math.round(a * 100) / 100, jo: Math.round(jo * 10) / 10, tsubo: Math.round((a / 3.30579) * 100) / 100};
}

/** 帖の書き方（6帖・4.5帖。整数なら小数をつけない） */
export const joLabel = (jo: number) => `${Number.isInteger(jo) ? jo : jo.toFixed(1)}帖`;

/** 線の部品（手すり・線・寸法）の長さ（mm） */
export const lineLength = (it: Pick<MItem, 'w' | 'h'>) => Math.round(Math.hypot(it.w, it.h));

/** 部品の外まわりの四角（回したあと。線の部品は始点と終点を囲む） */
export function bounds(it: MItem): {x: number; y: number; w: number; h: number} {
  if (it.kind === 'rail' || it.kind === 'line' || it.kind === 'dim') {
    const x2 = it.x + it.w;
    const y2 = it.y + it.h;
    return {x: Math.min(it.x, x2), y: Math.min(it.y, y2), w: Math.abs(it.w), h: Math.abs(it.h)};
  }
  if (it.kind === 'door' || it.kind === 'window') {
    const vert = it.rot === 90 || it.rot === 270;
    const d = it.kind === 'door' ? it.w : 120;
    return vert ? {x: it.x - d, y: it.y - it.w / 2, w: d * 2, h: it.w} : {x: it.x - it.w / 2, y: it.y - d, w: it.w, h: d * 2};
  }
  if (it.kind === 'vrail' || it.kind === 'num') return {x: it.x - 150, y: it.y - 150, w: 300, h: 300};
  const vert = it.rot === 90 || it.rot === 270;
  return vert ? {x: it.x + (it.w - it.h) / 2, y: it.y + (it.h - it.w) / 2, w: it.h, h: it.w} : {x: it.x, y: it.y, w: it.w, h: it.h};
}

/** 階の部品をみな囲む四角（何もなければ null） */
export function floorBounds(items: MItem[], underlay?: Underlay): {x: number; y: number; w: number; h: number} | null {
  const boxes = items.map(bounds);
  if (underlay && !underlay.hidden) boxes.push({x: underlay.x, y: underlay.y, w: underlay.w, h: underlay.h});
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}

/** 番号を付ける部品（手すり・縦手すり・段差・番号）。図の上の並びで ①②③ */
export const NUMBERED: MKind[] = ['rail', 'vrail', 'step', 'num'];

/**
 * 番号を決める：申請書の箇所につないだ部品はその箇所の写真番号、手で決めた番号（n）はその番号、ほかは置いた順に空いている番号。
 * 返すのは 部品の id → 番号（1 から）。階をまたいで通し番号（1階の①②のあと2階は③）
 */
export function numberItems(floors: MFloor[], placeNo: (placeId: string) => number | undefined): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  const all = floors.flatMap((f) => f.items).filter((it) => NUMBERED.includes(it.kind));
  for (const it of all) {
    const n = it.place ? placeNo(it.place) : it.n && it.n > 0 ? it.n : undefined;
    if (n) {
      out.set(it.id, n);
      used.add(n);
    }
  }
  let next = 1;
  for (const it of all) {
    if (out.has(it.id)) continue;
    // 番号（num）を自由に置いたときと、同じ箇所の手すりが2本のとき（L型を2本の線で描いた）は、同じ番号でよい
    while (used.has(next)) next++;
    out.set(it.id, next);
    used.add(next);
  }
  return out;
}

/** ①〜⑳（それより大きい番号は (21)） */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;
}

const fmtMm = (v: number) => `${Math.round(v).toLocaleString('ja-JP')}mm`;

/**
 * 右の一覧（凡例）の1行：見本の「①　L＝600mm」「④　L型　600×600mm」。申請書の箇所につないだ部品は、その箇所の改修の内容
 * （申請書と同じ「玄関　手すりの取り付け　L=600mm H=800mm」）。手で直した文（note）があればそれ
 */
export function legendText(it: MItem, placeLine: (placeId: string) => string | undefined): string {
  if (it.note?.trim()) return it.note.trim();
  if (it.place) {
    const line = placeLine(it.place);
    if (line) return line.replace(/^[①-⑳]\s*/, '');
  }
  switch (it.kind) {
    case 'rail':
      return it.len ? `L型　${fmtMm(lineLength(it)).replace('mm', '')}×${fmtMm(it.len)}` : `L＝${fmtMm(lineLength(it))}`;
    case 'vrail':
      return `縦手すり${it.len ? `　L＝${fmtMm(it.len)}` : ''}`;
    case 'step':
      return `${it.type || '段差の解消'}　${fmtMm(Math.max(it.w, it.h)).replace('mm', '')}×${fmtMm(Math.min(it.w, it.h))}`;
    default:
      return it.label?.trim() ?? '';
  }
}

/** 一覧の行（番号の順。同じ番号は1行） */
export function legendLines(m: Pick<Madori, 'floors' | 'legend'>, placeNo: (id: string) => number | undefined, placeLine: (id: string) => string | undefined): string[] {
  if (m.legend?.trim()) return m.legend.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim());
  const nums = numberItems(m.floors, placeNo);
  const rows = new Map<number, string>();
  for (const f of m.floors) {
    for (const it of f.items) {
      const n = nums.get(it.id);
      if (!n || it.kind === 'num' || rows.has(n)) continue;
      const t = legendText(it, placeLine);
      if (t) rows.set(n, t);
    }
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([n, t]) => `${circled(n)}　${t}`);
}

/** 部品を足す・直す・消す（階の中で） */
export function withFloor(m: Madori, floorId: string, fn: (items: MItem[]) => MItem[]): Madori {
  return {...m, floors: m.floors.map((f) => (f.id === floorId ? {...f, items: fn(f.items)} : f)), updatedAt: Date.now()};
}

/** 90°回す（部屋・設備・階段は中心のまわり、建具・窓は壁の向きを変える） */
export function rotated(it: MItem): MItem {
  const rot = (((it.rot ?? 0) + 90) % 360) as Rot;
  if (it.kind === 'rail' || it.kind === 'line' || it.kind === 'dim') {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    return {...it, x: cx + it.h / 2, y: cy - it.w / 2, w: -it.h, h: it.w};
  }
  return {...it, rot};
}

/** 読み込んだデータを整える（壊れた値は捨てる。storage.ts の cleanJobs から） */
export function cleanMadori(raw: unknown): Madori | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const KINDS: MKind[] = ['room', 'door', 'window', 'fix', 'stair', 'rail', 'vrail', 'step', 'num', 'text', 'line', 'dim'];
  const floors = (Array.isArray(r.floors) ? r.floors : []).filter((f): f is Record<string, unknown> => !!f && typeof f === 'object').map((f, i) => {
    const items = (Array.isArray(f.items) ? f.items : []).filter((it): it is Record<string, unknown> => !!it && typeof it === 'object' && KINDS.includes(it.kind as MKind)).map((it) => {
      const o: MItem = {id: str(it.id) || mid(), kind: it.kind as MKind, x: num(it.x), y: num(it.y), w: num(it.w), h: num(it.h)};
      if ([90, 180, 270].includes(num(it.rot))) o.rot = num(it.rot) as Rot;
      for (const k of ['type', 'label', 'place', 'note'] as const) if (str(it[k])) o[k] = str(it[k]);
      for (const k of ['n', 'len', 'size'] as const) if (num(it[k]) > 0) o[k] = num(it[k]);
      if (it.flip === true) o.flip = true;
      if (it.hinge === true) o.hinge = true;
      return o;
    });
    const u = f.underlay as Record<string, unknown> | undefined;
    const underlay: Underlay | undefined =
      u && typeof u === 'object' && str(u.photo) && num(u.w) > 0 && num(u.h) > 0
        ? {photo: str(u.photo), x: num(u.x), y: num(u.y), w: num(u.w), h: num(u.h), opacity: Math.min(1, Math.max(0.05, num(u.opacity, 0.4))), ...(u.hidden === true ? {hidden: true} : {})}
        : undefined;
    return {id: str(f.id) || mid(), name: str(f.name) || `${i + 1}階`, items, ...(underlay ? {underlay} : {})};
  });
  if (!floors.length) return undefined;
  const module = MODULES.includes(num(r.module) as Module) ? (num(r.module) as Module) : 910;
  const snap = [1, 2, 4].includes(num(r.snap)) ? (num(r.snap) as 1 | 2 | 4) : 2;
  return {module, snap, floors, showDims: r.showDims !== false, showArea: r.showArea !== false, ...(str(r.legend) ? {legend: str(r.legend)} : {}), updatedAt: num(r.updatedAt, Date.now())};
}

/** 何か描いてあるか（白紙の平面図は保存・印刷の候補に出さない） */
export const hasMadori = (m: Madori | undefined): m is Madori => !!m && m.floors.some((f) => f.items.length > 0 || !!f.underlay);
