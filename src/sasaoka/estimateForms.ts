// 見積書の2つの書式（苅田町・行橋市・みやこ町用／広域連合用）に並べる行を作る。
// どちらも元の Excel と同じく、金額は ROUNDDOWN(数量×単価)。最後のページの下4行が 小計・諸経費・消費税・合計。
//   苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」：1ページ18行。施工費は「1式」
//   広域連合用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式）：1ページ14行。施工費は「時間×1時間の単価（2,500円）」
// 備考・算出根拠は「定価8,000円（税抜）×0.8」。切って使う部材は 数量＝使う長さ÷1本の長さ（本）で書き、備考は「定価20,000円（4m）×0.8」、
// 2行目に mm で計算を書く（例：600÷4000＝0.15）。

import {cutToLength, estimatePlaceLines, estimateQty} from './calc.ts';
import {normalize} from './priceImport.ts';
import type {EstimateForm, Job, Place, Row, Settings} from './types.ts';
import {num, yen} from './util.ts';

export const FORM_IDS: EstimateForm[] = ['yukuhashi', 'kouiki'];

export const FORM_INFO: Record<EstimateForm, {name: string; title: string; perPage: number}> = {
  yukuhashi: {name: '苅田町・行橋市・みやこ町用', title: '工事費見積書兼工事費内訳書', perPage: 18},
  kouiki: {name: '広域連合用', title: '住宅改修内訳明細書', perPage: 14},
};

/** 合計の欄（小計・諸経費・消費税・合計）の行数 */
export const TOTAL_ROWS = 4;

/** 改修の種類（広域連合用の「改修の種類」①〜⑥、苅田町・行橋市・みやこ町用の「改修内容」）。どの箇所もこのどれかにあてはめる */
export const KINDS = ['手すりの取付', '段差の解消', '床材の変更', '扉の取替', '便器の取替', '付帯工事'];
/** 広域連合用の「改修箇所毎工事名称」に書く名前（元の見積書の「手すり取付」） */
const KIND_WORK = ['手すり取付', '段差解消', '床材変更', '扉取替', '便器取替', '付帯工事'];

/** 住所の市町村から書式を決める（築上町・豊前市・上毛町・吉富町は広域連合の様式、苅田町・行橋市・みやこ町はもう一方）。分からなければ null */
export function formForAddress(address: string): EstimateForm | null {
  const a = normalize(address);
  if (/築上町|豊前市|上毛町|吉富町/.test(a)) return 'kouiki';
  if (/行橋市|苅田町|みやこ町/.test(a)) return 'yukuhashi';
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

/** 箇所の改修内容（苅田町・行橋市・みやこ町用）・工事名称（広域連合用）。改修の種類から決まる */
export function placeWork(place: Pick<Place, 'kind'>, form: EstimateForm): string {
  return (form === 'kouiki' ? KIND_WORK : KINDS)[place.kind - 1] || '';
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

// 単位のない部材のうち「本」で数える既製品の手すり（TOTO のインテリア・バー、手すり棒・パイプ）。手すりの部品はのぞく
const READY_MADE_BAR = /手すり|てすり|バー|丸棒|パイプ/;
const BAR_PARTS = /ブラケット|キャップ|ジョイント|金具|受け|ベース|カバー|エンド|スタンド|支柱|アダプター|スペーサー|ソケット|ホルダー|チーズ|エルボ|プレート|ビス|ネジ|ねじ/;

/**
 * 見積書の単位。切って使う部材は「本」。部材リストに単位のない部材（単位の列のないメーカーの表から取り込んだもの）は、
 * 既製品の手すり（TOTO「インテリア・バーF Lタイプ」など）なら「本」。手で入れた単位があればそれ
 */
export function rowUnit(r: Row): string {
  if (cutToLength(r)) return '本';
  const name = normalize(r.name);
  return r.unit.trim() || (READY_MADE_BAR.test(name) && !BAR_PARTS.test(name) ? '本' : '');
}

/** 切って使う部材の数量の計算。長さは mm で書く（例：60cm を 4m から → 600÷4000＝0.15、同じ長さを2本なら 600÷4000×2＝0.3）。切らない部材は '' */
export function cutCalc(r: Row): string {
  if (!cutToLength(r)) return '';
  const mm = (n: number) => String(Math.round(n * 100) / 100);
  const times = r.qty !== 1 ? `×${num(r.qty)}` : '';
  return `${mm(r.lengthCm * 10)}÷${mm(r.pieceLengthM * 1000)}${times}＝${num(estimateQty(r), 3)}`;
}

/** 施工費の金額を「時間×1時間の単価」で書けるときの時間（小数2けたで割り切れるとき。0.8時間×2,500円＝2,000円）。書けなければ null */
export function workHours(amount: number, hourRate: number): number | null {
  if (!(hourRate > 0) || amount <= 0) return null;
  const hours = Math.round((amount / hourRate) * 100) / 100;
  return Math.abs(hours * hourRate - amount) < 1e-6 ? hours : null;
}

export type FormLine = {
  place: number; // 何番目の箇所か
  placeId: string;
  rowId: string; // 見積書で手で直した値を持つ行（部材の行。施工費のまとまりはその最初の手間の行）
  rowIds: string[]; // この1行のもとになった入力の行（左の入力と見積書の行をつなぐ）
  excludeId: string; // 介護保険の対象外かどうかを持つ行（部材のすぐ下の施工費は、上の部材の行）
  isWork: boolean; // 施工費のまとまり
  first: boolean; // 箇所の最初の行（箇所名・工事名称・写真番号・改修の種類を出す）
  placeName: string;
  work: string; // 工事名称（苅田町・行橋市・みやこ町用は改修内容）。改修の種類から
  kind: number; // 改修の種類 1〜6
  photo: number; // 写真番号
  mark: '材' | '手';
  text: string; // 内容（規格・範囲）／部材・仕様（手で直していればそれ）
  autoText: string; // 手で直していないときの内容
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  excluded: boolean; // 介護保険の対象外
  listPrice: number; // 定価（備考・算出根拠の「定価8,000円×0.8」）。施工費は 0
  rate: number | null; // 単価＝定価×この率のとき（見積の単価を手で入れた行・定価のない行は null）
  cut: string; // 切って使う部材の数量の計算（600÷4000＝0.15）。ほかは ''
  piece: number; // 切って使う部材の1本の長さ（m。備考の「定価20,000円（4m）」）。ほかは 0
  hourly: boolean; // 施工費を「時間×1時間の単価」で書いた行
  note: string | null; // 備考（定価等）・算出根拠を手で直したとき（改行で行を分ける）
  manualAmount: boolean; // 施工費の金額を見積書で手で直した
  isNew?: boolean; // 見積書に直接入力するときの、いちばん下の空いた行
};

/** all：金額のない施工費の行も出す（見積書に直接入力するとき。まだ金額を入れていない行も直せるように） */
export function formLines(job: Pick<Job, 'places'>, s: Pick<Settings, 'estimateRate' | 'estimateHourRate'>, form: EstimateForm, opts: {all?: boolean} = {}): FormLine[] {
  const photos = photoNumbers(job, s.estimateRate);
  const out: FormLine[] = [];
  job.places.forEach((place, pi) => {
    (opts.all ? estimatePlaceLines(place, s.estimateRate) : shownLines(place, s.estimateRate)).forEach((l, i) => {
      const base = {
        place: pi,
        placeId: place.id,
        first: i === 0,
        placeName: place.name.trim(),
        work: placeWork(place, form),
        kind: place.kind,
        photo: photos.get(place.id) ?? 0,
        excluded: l.excluded,
      };
      if (l.kind === 'material') {
        const r = l.row;
        const auto = materialText(r);
        out.push({
          ...base,
          rowId: r.id,
          rowIds: [r.id],
          excludeId: r.id,
          isWork: false,
          mark: '材',
          text: r.estText ?? auto,
          autoText: auto,
          qty: l.qty,
          unit: rowUnit(r),
          unitPrice: l.unitPrice,
          amount: l.amount,
          listPrice: r.listPrice > 0 ? r.listPrice : 0,
          rate: r.estPrice === null && r.listPrice > 0 ? s.estimateRate : null,
          cut: cutCalc(r),
          piece: cutToLength(r) ? r.pieceLengthM : 0,
          hourly: false,
          note: r.estNote,
          manualAmount: false,
        });
        return;
      }
      // 広域連合用は「0.8時間×2,500円＝2,000円」のように時間で書く。時間が小数2けたで割り切れないときは「1式」
      const hours = form === 'kouiki' ? workHours(l.amount, s.estimateHourRate) : null;
      const hourly = hours !== null;
      const head = l.rows[0];
      const auto = l.afterMaterial ? '同上施工費' : '施工費';
      out.push({
        ...base,
        rowId: head.id,
        rowIds: l.rows.map((r) => r.id),
        excludeId: l.owner?.id ?? head.id,
        isWork: true,
        mark: '手',
        text: head.estText ?? auto,
        autoText: auto,
        qty: hours ?? 1,
        unit: hourly ? '時間' : '式',
        unitPrice: hourly ? s.estimateHourRate : l.amount,
        amount: l.amount,
        listPrice: 0,
        rate: null,
        cut: '',
        piece: 0,
        hourly,
        note: head.estNote,
        manualAmount: head.estAmount !== null,
      });
    });
  });
  return out;
}

/**
 * 見積書に直接入力するときの、いちばん下の空いた行（打ち込むと行が増える）。
 * 最後の箇所に行がなければ、その箇所の名前・改修の種類・写真番号を出す（そこに入る）。mark は広域連合用の「材／手」
 */
export function sheetNewLine(job: Pick<Job, 'places'>, lines: FormLine[], form: EstimateForm, mark: '材' | '手' = '材'): FormLine {
  const last = job.places[job.places.length - 1];
  const pending = last && last.rows.length === 0 ? last : null;
  const shownPlaces = new Set(lines.map((l) => l.placeId)).size;
  return {
    place: pending ? job.places.length - 1 : 1e6, // 前の箇所とは別のまとまり（ページの送りに巻き込まない）
    placeId: pending?.id ?? '',
    rowId: '',
    rowIds: [],
    excludeId: '',
    isWork: mark === '手',
    first: pending !== null,
    placeName: pending?.name.trim() ?? '',
    work: pending ? placeWork(pending, form) : '',
    kind: pending?.kind ?? 1,
    photo: pending ? (pending.photo > 0 ? pending.photo : shownPlaces + 1) : 0,
    mark,
    text: '',
    autoText: '',
    qty: 0,
    unit: '',
    unitPrice: 0,
    amount: 0,
    excluded: false,
    listPrice: 0,
    rate: null,
    cut: '',
    piece: 0,
    hourly: false,
    note: null,
    manualAmount: false,
    isNew: true,
  };
}

/**
 * 手で直していないときの備考（定価等・苅田町・行橋市・みやこ町用）／算出根拠（広域連合用）。1行ずつ。
 * 部材は「定価8,000円（税抜）×0.8」（見積の単価を手で入れた行は ×0.8 を付けない）。
 * 切って使う部材は「定価20,000円（4m）×0.8」（かっこは1本の長さ）と、2行目に「600÷4000＝0.15」。
 * 算出根拠は対象工事部分の欄なので、介護保険の対象外の行は空。時間で書いた施工費は「1時間2,500円」
 */
export function autoNote(l: FormLine, form: EstimateForm, hourRate: number): string[] {
  if (form === 'kouiki' && l.excluded) return [];
  if (form === 'kouiki' && l.hourly) return [`1時間${yen(hourRate)}円`];
  const list = l.listPrice > 0 ? `定価${yen(l.listPrice)}円（${l.piece > 0 ? `${num(l.piece, 3)}m` : '税抜'}）${l.rate !== null ? `×${l.rate}` : ''}` : '';
  return [list, l.cut].filter(Boolean);
}

/** 見積書に出す備考・算出根拠（手で直していればそれ。改行で行を分ける） */
export function lineNote(l: FormLine, form: EstimateForm, hourRate: number): string[] {
  return l.note !== null ? l.note.split('\n') : autoNote(l, form, hourRate);
}

/** 備考・算出根拠を1つの文字にする（手で直す欄の最初の文字） */
export function noteText(lines: string[]): string {
  return lines.join('\n');
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
