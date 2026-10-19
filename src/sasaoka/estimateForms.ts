// 見積書の2つの書式（行橋市・苅田町用／みやこ町・築上町・豊前市など用）に並べる行を作る。
// どちらも元の Excel と同じく、金額は ROUNDDOWN(数量×単価)。最後のページの下4行が 小計・諸経費・消費税・合計。
//   行橋市・苅田町用「工事費見積書兼工事費内訳書」：1ページ18行。施工費は「1式」
//   みやこ町・築上町・豊前市など用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式）：1ページ14行。施工費は「時間×1時間の単価（2,500円）」
// 切って使う部材は 数量＝使う長さ÷1本の長さ（本）で書き、備考・算出根拠にその計算を書く（例：0.6m÷4m＝0.15本）。

import {cutToLength, estimatePlaceLines, estimateQty} from './calc.ts';
import {normalize} from './priceImport.ts';
import type {EstimateForm, Job, Place, Row, Settings} from './types.ts';
import {num} from './util.ts';

export const FORM_IDS: EstimateForm[] = ['yukuhashi', 'kouiki'];

export const FORM_INFO: Record<EstimateForm, {name: string; title: string; perPage: number}> = {
  yukuhashi: {name: '行橋市・苅田町用', title: '工事費見積書兼工事費内訳書', perPage: 18},
  kouiki: {name: 'みやこ町・築上町・豊前市など用', title: '住宅改修内訳明細書', perPage: 14},
};

/** 合計の欄（小計・諸経費・消費税・合計）の行数 */
export const TOTAL_ROWS = 4;

/** 改修の種類（みやこ町・築上町用の「改修の種類」①〜⑥、行橋市・苅田町用の「改修内容」） */
export const KINDS = ['手すりの取付', '段差の解消', '床材の変更', '扉の取替', '便器の取替', '付帯工事'];
/** 工事名称を入れていないときの名前（みやこ町・築上町用の「改修箇所毎工事名称」。元の見積書の「手すり取付」） */
const KIND_WORK = ['手すり取付', '段差解消', '床材変更', '扉取替', '便器取替', '付帯工事'];

/** 住所の市町村から書式を決める（福岡県介護保険広域連合の京築の町・市は広域連合の様式）。分からなければ null */
export function formForAddress(address: string): EstimateForm | null {
  const a = normalize(address);
  if (/みやこ町|築上町|豊前市|上毛町|吉富町/.test(a)) return 'kouiki';
  if (/行橋市|苅田町/.test(a)) return 'yukuhashi';
  return null;
}

/** 様邸の見積書の書式：選んであればそれ、なければ住所から、それでも分からなければ設定の書式 */
export function jobForm(job: Pick<Job, 'form' | 'address'>, s: Pick<Settings, 'estimateForm'>): EstimateForm {
  return job.form || formForAddress(job.address) || s.estimateForm;
}

/** ①〜⑳（21からは (21)） */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;
}

/** 箇所の工事名称：入れてあればそれ、なければ改修の種類から */
export function placeWork(place: Pick<Place, 'work' | 'kind'>, form: EstimateForm): string {
  return place.work.trim() || (form === 'kouiki' ? KIND_WORK : KINDS)[place.kind - 1] || '';
}

/** 見積書に出る箇所（行のあるもの）ごとの写真番号。入れていなければ見積書に出る順番 */
export function photoNumbers(job: Pick<Job, 'places'>, rate: number): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const p of job.places) {
    if (shownLines(p, rate).length === 0) continue;
    n++;
    out.set(p.id, p.photo > 0 ? p.photo : n);
  }
  return out;
}

// 金額のない施工費の行は出さない
const shownLines = (place: Pick<Place, 'rows'>, rate: number) => estimatePlaceLines(place, rate).filter((l) => l.kind === 'material' || l.amount !== 0);

/** 部材の「内容（規格・範囲）」：メーカー 品番 品名（切って使う部材の長さの計算は備考・算出根拠に書く） */
export function materialText(r: Row): string {
  const base = [r.maker, r.code, r.name].map((x) => x.trim()).filter(Boolean).join(' ') || '材料費';
  return r.lengthCm > 0 && !cutToLength(r) ? `${base}（長さ${num(r.lengthCm)}cm）` : base;
}

/** 切って使う部材の数量の計算（例：0.6m÷4m＝0.15本、同じ長さを2本なら 0.6m÷4m×2＝0.3本）。切らない部材は '' */
export function cutCalc(r: Row): string {
  if (!cutToLength(r)) return '';
  const times = r.qty !== 1 ? `×${num(r.qty)}` : '';
  return `${num(r.lengthCm / 100, 3)}m÷${num(r.pieceLengthM, 3)}m${times}＝${num(estimateQty(r), 3)}本`;
}

/** 施工費の金額を「時間×1時間の単価」で書けるときの時間（小数2けたで割り切れるとき。0.8時間×2,500円＝2,000円）。書けなければ null */
export function workHours(amount: number, hourRate: number): number | null {
  if (!(hourRate > 0) || amount <= 0) return null;
  const hours = Math.round((amount / hourRate) * 100) / 100;
  return Math.abs(hours * hourRate - amount) < 1e-6 ? hours : null;
}

export type FormLine = {
  place: number; // 何番目の箇所か
  first: boolean; // 箇所の最初の行（箇所名・工事名称・写真番号・改修の種類を出す）
  placeName: string;
  work: string; // 工事名称（行橋市・苅田町用は改修内容）
  kind: number; // 改修の種類 1〜6
  photo: number; // 写真番号
  mark: '材' | '手';
  text: string; // 内容（規格・範囲）／部材・仕様
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  excluded: boolean; // 介護保険の対象外
  listPrice: number; // 定価（行橋市・苅田町用の備考「定価：￥…」、みやこ町・築上町用の算出根拠）。施工費は 0
  rate: number | null; // 単価＝定価×この率のとき（見積の単価を手で入れた行・定価のない行は null）
  cut: string; // 切って使う部材の数量の計算（0.6m÷4m＝0.15本）。ほかは ''
  hourly: boolean; // 施工費を「時間×1時間の単価」で書いた行
};

export function formLines(job: Pick<Job, 'places'>, s: Pick<Settings, 'estimateRate' | 'estimateHourRate'>, form: EstimateForm): FormLine[] {
  const photos = photoNumbers(job, s.estimateRate);
  const out: FormLine[] = [];
  job.places.forEach((place, pi) => {
    shownLines(place, s.estimateRate).forEach((l, i) => {
      const base = {
        place: pi,
        first: i === 0,
        placeName: place.name.trim(),
        work: placeWork(place, form),
        kind: place.kind,
        photo: photos.get(place.id) ?? 0,
        excluded: l.excluded,
      };
      if (l.kind === 'material') {
        const r = l.row;
        out.push({
          ...base,
          mark: '材',
          text: materialText(r),
          qty: l.qty,
          unit: cutToLength(r) ? '本' : r.unit.trim(),
          unitPrice: l.unitPrice,
          amount: l.amount,
          listPrice: r.listPrice > 0 ? r.listPrice : 0,
          rate: r.estPrice === null && r.listPrice > 0 ? s.estimateRate : null,
          cut: cutCalc(r),
          hourly: false,
        });
        return;
      }
      // みやこ町・築上町用は「0.8時間×2,500円＝2,000円」のように時間で書く。時間が小数2けたで割り切れないときは「1式」
      const hours = form === 'kouiki' ? workHours(l.amount, s.estimateHourRate) : null;
      const hourly = hours !== null;
      out.push({
        ...base,
        mark: '手',
        text: l.afterMaterial ? '同上施工費' : '施工費',
        qty: hours ?? 1,
        unit: hourly ? '時間' : '式',
        unitPrice: hourly ? s.estimateHourRate : l.amount,
        amount: l.amount,
        listPrice: 0,
        rate: null,
        cut: '',
        hourly,
      });
    });
  });
  return out;
}

/**
 * ページに分ける。箇所の行はなるべく同じページに入れ、1ページに入りきらない箇所だけ途中で分ける。
 * 最後のページの下の reserve 行は合計の欄。空いていなければ、最後の箇所を次のページに送って合計と同じページにする
 * （送れないとき＝その箇所だけでページがいっぱいのときは、合計だけのページを足す）
 */
export function paginate<T extends {place: number}>(lines: T[], perPage: number, reserve = TOTAL_ROWS): T[][] {
  const groups: T[][] = [];
  for (const l of lines) {
    const g = groups[groups.length - 1];
    if (g && g[0].place === l.place) g.push(l);
    else groups.push([l]);
  }
  const pages: T[][] = [[]];
  for (const g of groups) {
    let page = pages[pages.length - 1];
    if (page.length > 0 && page.length + g.length > perPage && g.length <= perPage) {
      page = [];
      pages.push(page);
    }
    for (const l of g) {
      if (page.length === perPage) {
        page = [];
        pages.push(page);
      }
      page.push(l);
    }
  }
  const lastPage = pages[pages.length - 1];
  if (perPage - lastPage.length < reserve) {
    const g = groups[groups.length - 1];
    const start = lastPage.indexOf(g[0]);
    pages.push(start > 0 && g.length <= perPage - reserve ? lastPage.splice(start) : []);
  }
  return pages;
}

/** 'YYYY-MM-DD' → 令和の年月日（令和より前・空なら null） */
export function reiwa(iso: string): {y: number; m: number; d: number} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m || iso < '2019-05-01') return null;
  return {y: Number(m[1]) - 2018, m: Number(m[2]), d: Number(m[3])};
}
