// 見取図の紙（A4）：いちばん上に「〇〇様邸」、平面図、その下に枠で囲んだ改修の内容（①玄関　手すりの取り付け　L=600mm…赤い字）。
// 縦が基本で、横に広い図は横（ユーザーの指示「基本的には縦印刷、横広の場合は、自動的に横にする」2026-11-10）。2階建ても1枚に1階・2階を並べる
// （「2階を作成した際は、1階と2階の内容を1枚におさまるようにする」）。日付・会社の名前・「見取図」「平面図」の文字は書かない（「〇〇様邸　平面図、日付などは不要」2026-11-10）。
// 「〇〇様邸」だけはいちばん上に書く（ユーザーの指示「平面図の一番上に〇〇様邸と表示しておく」2026-11-11）。
// 印刷（MadoriPrint.tsx）・Excel（xlsx.ts）で同じ位置（sheetLayout）を使う。申請書の平面図の枠の画像は planSvg。長さは mm

import {textEm} from '../print/fit.ts';
import {workItems} from '../shinsei.ts';
import type {Job, Settings} from '../types.ts';
import {customerFilePart} from '../util.ts';
import {emptyMadori, legendLines, numberItems} from './model.ts';
import type {Madori, MFloor, Underlay} from './model.ts';
import {floorSvg, patternDefs, RED, viewOf} from './render.ts';

/** 紙（A4）の短い辺・長い辺と余白（mm） */
export const A4 = {short: 210, long: 297, margin: 10};
/**
 * 下の枠（改修の内容）：字の大きさの候補（mm。大きい順）・行の高さ（字の倍）・枠の中の余白・列のすき間・平面図とのすき間・紙の中で一覧に使える高さの割合。
 * 初めの大きさは 3.4mm（約 9.5pt。ユーザーの指示「申請書の内容の部分はもう少し小さくする」2026-11-12。前は 4.2mm）
 */
const LEG = {sizes: [3.4, 3.1, 2.8, 2.5], lh: 1.55, pad: 3, colGap: 6, gap: 4, maxShare: 0.4};
/** いちばん上の「〇〇様邸」：字の大きさ（mm。9mm＝約 25pt）と、平面図の上に取る段の高さ（mm）。ユーザーの指示「〇〇様邸の部分を大きくする」2026-11-12（前は 6mm） */
const TITLE = {fs: 9, h: 15};

const escText = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 申請書の箇所（Place.id）→ 写真番号・改修の内容（申請書と同じ文） */
export function placeLookup(
  job: Job,
  s: Settings,
): {no: (id: string) => number | undefined; line: (id: string) => string | undefined; byNo: (n: number) => string | undefined; list: {id: string; photo: number; name: string; line: string}[]} {
  const items = workItems(job, s);
  const map = new Map(items.map((w) => [w.id, w]));
  const byPhoto = new Map(items.map((w) => [w.photo, w.line]));
  return {no: (id) => map.get(id)?.photo, line: (id) => map.get(id)?.line, byNo: (n) => byPhoto.get(n), list: items.map((w) => ({id: w.id, photo: w.photo, name: w.name, line: w.line}))};
}

export type SheetText = {fileName: string};

/** 見取図の保存名（Excel・PDF。「山田花子様住宅改修見取図」） */
export function sheetText(job: Job): SheetText {
  return {fileName: `${customerFilePart(job.customer)}住宅改修見取図`};
}

/**
 * 平面図のいちばん上に書く「山田花子様邸」（画面の方眼の上・印刷・Excel。ユーザーの指示「平面図の一番上に〇〇様邸と表示しておく」2026-11-11）。
 * 様邸の呼び方を「様」にしていても「様邸」（名前の終わりの「様」「様邸」は重ねない）。お客様の名前がなければ空
 */
export function sheetTitle(job: Pick<Job, 'customer'>): string {
  const name = job.customer.trim().replace(/\s*(様邸|様)$/, '');
  return name ? `${name}様邸` : '';
}

/**
 * 見取図の下の枠の行（ユーザーの指示「改修の内容（申請書）…常時表示しておく・印刷時にも表示する」2026-11-11）：方眼の下の欄と同じ、申請書の改修の内容
 * （「①玄関　手すりの取り付け　L=600mm」。そのほかの2行目は次の行）。平面図に置いた番号で申請書にない番号は、その部品の文（「⑨L＝600mm」・番号だけ）を番号の順に足す
 * （前は平面図に置いた番号の行だけ。画面の右の枠の一覧は「この部分は不要」で外したので、手で直した一覧＝Madori.legend も使わない）
 */
export function sheetWorks(m: Madori, floors: MFloor[], look: Pick<ReturnType<typeof placeLookup>, 'no' | 'line' | 'byNo' | 'list'>): string[] {
  const rows = new Map<number, string>();
  for (const w of look.list) if (!rows.has(w.photo)) rows.set(w.photo, w.line);
  const nums = numberItems(m.floors, look.no);
  const here = new Set(floors.flatMap((f) => f.items.map((it) => nums.get(it.id))).filter((n): n is number => !!n));
  for (const row of legendLines({floors: m.floors}, look.no, look.line, look.byNo)) {
    const n = rowNo(row);
    if (here.has(n) && !rows.has(n)) rows.set(n, row.replace(/^([①-⑳]|\(\d+\))　/, '$1'));
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, line]) => line.split('\n')).filter((l) => l.trim());
}

/** 図に入れる下絵（申請書の平面図の枠に入れた図。隠していないもの）。なぞるための下絵は印刷しない */
export const printedUnderlay = (f: MFloor): Underlay | undefined => (f.underlay && !f.underlay.hidden && f.underlay.print ? f.underlay : undefined);
/** その階に図がある（部品か、図に入れる下絵） */
export const floorHasPlan = (f: MFloor) => f.items.length > 0 || !!printedUnderlay(f);
/** 図がある平面図（申請書の平面図の枠・印刷・Excel に出すもの） */
export const madoriHasPlan = (m: Madori | undefined): m is Madori => !!m && m.floors.some(floorHasPlan);

/**
 * 申請書の平面図の枠が、平面図のタブの図とつながっているか（ユーザーの指示「平面図は、申請書でもつくれるし、平面図専用からもつくれる。相互転記させる」2026-11-10）：
 * 申請書に別の図（前の版で入れた図）がない・枠から外していない・図がある。つながっていれば、申請書の枠はいつも平面図のタブの今の図
 */
export const planLinked = (job: Pick<Job, 'planPhoto' | 'planOff' | 'madori'>): boolean => !job.planPhoto && !job.planOff && madoriHasPlan(job.madori);

/** 申請書の平面図の枠と平面図のタブの図をつなぐ（申請書に前の版で入れた図・書き込みは外す。枠から外した印も消す） */
export function linkPlan(job: Job): Job {
  const {planPhoto: _p, planMarks: _m, planOff: _o, ...j} = job;
  return j;
}

/**
 * 申請書の平面図の枠に入れた画像（ドロップ・貼り付け・選ぶ）を、平面図の1階の「図に入れる下絵」にする（濃さ 1。長い辺を 9100mm＝10マス）。
 * 前の下絵とは差し替え。描いた部品はそのまま。平面図のタブでも同じ図が出て、上に手すり・丸・番号などを描ける
 */
export function withPlanImage(job: Job, photo: string, w: number, h: number): Job {
  const m = job.madori ?? emptyMadori();
  const k = 9100 / Math.max(1, w, h);
  const under: Underlay = {photo, x: 0, y: 0, w: Math.round(w * k), h: Math.round(h * k), opacity: 1, print: true};
  const [first, ...rest] = m.floors;
  return {...linkPlan(job), madori: {...m, floors: [{...first, underlay: under}, ...rest], updatedAt: Date.now()}};
}

/**
 * 申請書の平面図の枠の図を消す：前の版で入れた図は消す。平面図のタブの図は消さずに、申請書の枠から外す（描いた部品がなく、枠に入れた画像だけなら、その画像も外す）
 */
export function withoutPlan(job: Job): Job {
  const j = linkPlan(job);
  const m = j.madori;
  if (!m) return j;
  const drawn = m.floors.some((f) => f.items.length > 0);
  const next: Job = drawn ? j : {...j, madori: {...m, floors: m.floors.map((f) => (f.underlay?.print ? (({underlay: _u, ...rest}) => rest)(f) : f)), updatedAt: Date.now()}};
  return madoriHasPlan(next.madori) ? {...next, planOff: true} : next;
}

/** 図に入れる下絵の <image>（images＝写真の番号 → data: の URL。SVG を画像にしても写るように。ないときは描かない） */
export function underlaySvg(f: MFloor, images: Record<string, string> = {}): string {
  const u = printedUnderlay(f);
  const href = u ? images[u.photo] : undefined;
  return u && href ? `<image href="${href}" x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" preserveAspectRatio="none"/>` : '';
}

/** 印刷・Excel に出す階（何か描いてある階。どれも白紙なら1階だけ） */
export function sheetFloors(m: Madori): MFloor[] {
  const drawn = m.floors.filter(floorHasPlan);
  return drawn.length ? drawn : m.floors.slice(0, 1);
}

/** その階の一覧の行（階をまたいだ通し番号。その階にある番号だけ。手で直した一覧があれば、1枚目にそれを出す） */
export function floorLegend(
  m: Madori,
  floor: MFloor,
  no: (id: string) => number | undefined,
  line: (id: string) => string | undefined,
  first: boolean,
  byNo?: (n: number) => string | undefined,
): string[] {
  if (m.legend?.trim()) return first ? legendLines(m, no, line) : [];
  const nums = numberItems(m.floors, no);
  const here = new Set(floor.items.map((it) => nums.get(it.id)).filter((n): n is number => !!n));
  const all = legendLines({floors: m.floors}, no, line, byNo);
  return all.filter((row) => {
    const c = row.codePointAt(0) ?? 0;
    const n = c >= 0x2460 && c <= 0x2473 ? c - 0x2460 + 1 : Number(/^\((\d+)\)/.exec(row)?.[1]);
    return here.has(n);
  });
}

/** 平面図の範囲（階の部品を囲む四角に寸法線・番号の分の余白。図に入れる下絵があれば、それも入る範囲） */
export function planView(floor: MFloor): {x: number; y: number; w: number; h: number} {
  const u = printedUnderlay(floor);
  if (!u) return viewOf(floor.items, 900);
  if (!floor.items.length) return {x: u.x, y: u.y, w: u.w, h: u.h};
  const v = viewOf(floor.items, 900);
  const x0 = Math.min(v.x, u.x);
  const y0 = Math.min(v.y, u.y);
  return {x: x0, y: y0, w: Math.max(v.x + v.w, u.x + u.w) - x0, h: Math.max(v.y + v.h, u.y + u.h) - y0};
}

/** 階の並べ方：row＝横に並べる、col＝縦に重ねる */
export type PlanDir = 'row' | 'col';

/**
 * 平面図だけの SVG（背景は白。申請書の平面図の枠・見取図の紙・Excel の画像）。階が2つ以上なら横に並べるか縦に重ね（dir）、それぞれの上に「1階」「2階」。
 * body は外の <svg>・柄の defs を除いた中身（見取図の紙に入れる）
 */
export function planSvg(m: Madori, floors: MFloor[], no: (id: string) => number | undefined, pid = 'pl', images: Record<string, string> = {}, dir: PlanDir = 'row'): {svg: string; body: string; w: number; h: number} {
  const nums = numberItems(m.floors, no);
  const a = planArrange(floors, dir);
  const parts = floors.map((f, i) => {
    const v = a.views[i];
    const at = a.at[i];
    return (
      `<g transform="translate(${at.x - v.x} ${at.y + a.label - v.y})">${underlaySvg(f, images)}${floorSvg(f.items, {module: m.module, showArea: m.showArea, showDims: m.showDims, nums, pid})}</g>` +
      (a.label ? `<text x="${at.x + v.w / 2}" y="${at.y + a.label * 0.75}" font-size="${a.label * 0.7}" text-anchor="middle" fill="#1f2937" font-family="'BIZ UDPGothic','Meiryo',sans-serif">${escText(f.name)}</text>` : '')
    );
  });
  const body = parts.join('');
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${a.w} ${a.h}" width="${Math.round(a.w / 10)}" height="${Math.round(a.h / 10)}"><defs>${patternDefs(pid)}</defs><rect width="${a.w}" height="${a.h}" fill="#ffffff"/>${body}</svg>`,
    body,
    w: a.w,
    h: a.h,
  };
}

/** 階の絵の並べ方（mm）：それぞれの階の範囲と、左上の位置（見出しの段を含む）。見出しは階が2つ以上のとき */
export function planArrange(floors: MFloor[], dir: PlanDir = 'row'): {views: {x: number; y: number; w: number; h: number}[]; at: {x: number; y: number}[]; label: number; w: number; h: number} {
  const views = floors.map(planView);
  const label = floors.length > 1 ? 500 : 0;
  const gap = 600;
  if (dir === 'row') {
    const h = Math.max(...views.map((v) => v.h)) + label;
    let x = 0;
    const at = views.map((v) => {
      const p = {x, y: 0};
      x += v.w + gap;
      return p;
    });
    return {views, at, label, w: x - gap, h};
  }
  const w = Math.max(...views.map((v) => v.w));
  let y = 0;
  const at = views.map((v) => {
    const p = {x: (w - v.w) / 2, y};
    y += v.h + label + gap;
    return p;
  });
  return {views, at, label, w, h: y - gap};
}

/** SVG の文字を PNG（申請書の平面図の枠は JPEG。申請書の Excel は図を jpeg で入れる＝shinsei.ts）にする（画面の外のキャンバスで描く）。px は長い辺の画素 */
export async function svgToPng(svg: string, w: number, h: number, px = 2400, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<{blob: Blob; w: number; h: number}> {
  const scale = px / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const sized = svg.replace(/width="[^"]*" height="[^"]*"/, `width="${cw}" height="${ch}"`);
  const url = URL.createObjectURL(new Blob([sized], {type: 'image/svg+xml'}));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((ok, ng) => {
      img.onload = () => ok();
      img.onerror = () => ng(new Error('平面図を絵にできませんでした'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('平面図を絵にできませんでした');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.92));
    if (!blob) throw new Error('平面図を絵にできませんでした');
    return {blob, w: cw, h: ch};
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 紙の1枚の並び（mm）：向き・紙の大きさ・平面図の絵（planSvg）を置く所と倍率・一覧の枠 */
export type SheetLayout = {
  landscape: boolean;
  w: number;
  h: number;
  dir: PlanDir;
  plan: {x: number; y: number; w: number; h: number; k: number} | null; // 平面図の絵（planSvg の w×h を k 倍）。図がなければ null
  area: {x: number; y: number; w: number; h: number}; // 平面図に使える所
  title: {x: number; y: number; fs: number} | null; // いちばん上の「〇〇様邸」（x はまん中・y は字の下の線）。名前がなければ null
  legend: {x: number; y: number; w: number; h: number; fs: number; cols: number; rows: number; colW: number} | null; // 一覧がなければ null
};

/** 一覧の枠の大きさ：字はなるべく大きく、1列で入らなければ2列、それでも入らなければ字を小さく（使える高さ maxH まで） */
function legendBox(lines: string[], innerW: number, maxH: number): {h: number; fs: number; cols: number; rows: number; colW: number} | null {
  if (!lines.length) return null;
  const colWOf = (cols: number) => (innerW - LEG.pad * 2 - (cols - 1) * LEG.colGap) / cols;
  for (const fs of LEG.sizes) {
    for (const cols of lines.length > 1 ? [1, 2] : [1]) {
      const colW = colWOf(cols);
      if (lines.some((l) => textEm(l) * fs > colW)) continue;
      const rows = Math.ceil(lines.length / cols);
      const h = rows * fs * LEG.lh + LEG.pad * 2;
      if (h <= maxH) return {h, fs, cols, rows, colW};
    }
  }
  // どうしても入らない：いちばん小さい字の2列（長い行は字の幅を縮めて枠に入れる＝pageSvg の textLength）
  const fs = LEG.sizes[LEG.sizes.length - 1];
  const cols = lines.length > 1 ? 2 : 1;
  const rows = Math.ceil(lines.length / cols);
  return {h: Math.min(maxH, rows * fs * LEG.lh + LEG.pad * 2), fs, cols, rows, colW: colWOf(cols)};
}

/**
 * 紙の並びを決める：縦（A4縦）と横（A4横）、階の並べ方（横に並べる・縦に重ねる）のうち、平面図がいちばん大きく入るもの。
 * 縦を基本にして、横のほうが 1.25 倍より大きく入る（横に広い図）ときだけ横（1階・2階を横に並べたほうが少し大きいくらいなら、縦に重ねて縦のまま）
 */
export function sheetLayout(floors: MFloor[], legend: string[], title = ''): SheetLayout {
  const hasPlan = floors.some(floorHasPlan);
  const dirs: PlanDir[] = floors.length > 1 ? ['row', 'col'] : ['row'];
  const top = title ? TITLE.h : 0;
  const one = (landscape: boolean) => {
    const w = landscape ? A4.long : A4.short;
    const h = landscape ? A4.short : A4.long;
    const iw = w - A4.margin * 2;
    const ih = h - A4.margin * 2 - top;
    const leg = legendBox(legend, iw, ih * LEG.maxShare);
    const area = {x: A4.margin, y: A4.margin + top, w: iw, h: ih - (leg ? leg.h + LEG.gap : 0)};
    let best: {dir: PlanDir; k: number; pw: number; ph: number} = {dir: 'row', k: 0, pw: 0, ph: 0};
    if (hasPlan) {
      for (const dir of dirs) {
        const a = planArrange(floors, dir);
        const k = Math.min(area.w / a.w, area.h / a.h);
        if (k > best.k * 1.0001) best = {dir, k, pw: a.w, ph: a.h};
      }
    }
    const plan = hasPlan ? {x: area.x + (area.w - best.pw * best.k) / 2, y: area.y + (area.h - best.ph * best.k) / 2, w: best.pw * best.k, h: best.ph * best.k, k: best.k} : null;
    const legendAt = leg ? {x: A4.margin, y: area.y + area.h + LEG.gap, w: iw, ...leg} : null;
    const titleAt = title ? {x: w / 2, y: A4.margin + TITLE.fs * 0.9, fs: TITLE.fs} : null;
    return {landscape, w, h, dir: best.dir, plan, area, title: titleAt, legend: legendAt} satisfies SheetLayout;
  };
  const tall = one(false);
  const wide = one(true);
  return wide.plan && tall.plan && wide.plan.k > tall.plan.k * 1.25 ? wide : tall;
}

/** 一覧の行の位置（枠の左上からの mm）：列ごとに上から */
export function legendSpots(l: NonNullable<SheetLayout['legend']>, n: number): {x: number; y: number}[] {
  return Array.from({length: n}, (_, i) => {
    const c = Math.floor(i / l.rows);
    const r = i % l.rows;
    return {x: LEG.pad + c * (l.colW + LEG.colGap), y: LEG.pad + l.fs * LEG.lh * (r + 0.78)};
  });
}

/** 紙に出す一覧の行：紙に出す階にある番号だけ（階をまたいだ通し番号）。手で直した一覧があればそれ */
export function sheetLegend(m: Madori, floors: MFloor[], no: (id: string) => number | undefined, line: (id: string) => string | undefined, byNo?: (n: number) => string | undefined): string[] {
  if (m.legend?.trim()) return legendLines(m, no, line);
  return [...new Set(floors.flatMap((f) => floorLegend(m, f, no, line, false, byNo)))].sort((a, b) => rowNo(a) - rowNo(b));
}
const rowNo = (row: string) => {
  const c = row.codePointAt(0) ?? 0;
  return c >= 0x2460 && c <= 0x2473 ? c - 0x2460 + 1 : Number(/^\((\d+)\)/.exec(row)?.[1] ?? 999);
};

/** 見取図の1枚の SVG（mm）。いちばん上に「〇〇様邸」、平面図（階をみな）は枠に入る大きさに縮めてまん中、その下に改修の内容の枠 */
export function pageSvg(m: Madori, floors: MFloor[], lay: SheetLayout, legend: string[], no: (id: string) => number | undefined, pid: string, images: Record<string, string> = {}, title = ''): string {
  const font = `font-family="'BIZ UDPGothic','Meiryo','Hiragino Sans','Noto Sans JP',sans-serif"`;
  const p = lay.plan ? planSvg(m, floors, no, pid, images, lay.dir) : null;
  const L = lay.legend;
  const T = title ? lay.title : null;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lay.w} ${lay.h}" width="${lay.w}mm" height="${lay.h}mm" ${font}>` +
    `<defs>${patternDefs(pid)}</defs><rect width="${lay.w}" height="${lay.h}" fill="#ffffff"/>` +
    (T ? `<text x="${r2(T.x)}" y="${r2(T.y)}" font-size="${T.fs}" font-weight="700" text-anchor="middle" fill="#111827">${escText(title)}</text>` : '') +
    (p && lay.plan ? `<g transform="translate(${r2(lay.plan.x)} ${r2(lay.plan.y)}) scale(${lay.plan.k})">${p.body}</g>` : '') +
    (L
      ? `<g data-sheet-works=""><rect x="${L.x}" y="${r2(L.y)}" width="${L.w}" height="${r2(L.h)}" fill="none" stroke="#7f7f7f" stroke-width="0.6"/>` +
        legendSpots(L, legend.length)
          .map((q, i) => {
            const tooLong = textEm(legend[i]) * L.fs > L.colW;
            // そのほかの行（申請書の改修の内容の2行目）は、全角・半角のすき間で1行目の改修の種類の頭まで下げてある。半角のすき間がつぶれないように xml:space
            return `<text x="${r2(L.x + q.x)}" y="${r2(L.y + q.y)}" font-size="${L.fs}" fill="${RED}" xml:space="preserve"${tooLong ? ` textLength="${r2(L.colW)}" lengthAdjust="spacingAndGlyphs"` : ''}>${escText(legend[i])}</text>`;
          })
          .join('') +
        `</g>`
      : '') +
    `</svg>`
  );
}
const r2 = (v: number) => Math.round(v * 100) / 100;
