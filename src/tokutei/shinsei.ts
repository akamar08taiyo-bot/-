// 介護保険の申請書（保険者ごとにいただいた Excel の原本）に、案件の内容を書き込む。
// どの欄に何を書くかは、いただいた4つの様式（行橋市・苅田町・みやこ町・広域連合）のすべての欄を調べて決めた（docs/tokutei/DESIGN.md の 5.2）。
// ユーザーの指示「入力できるところ、連動できる部分は徹底的に分析し、無駄を省けるようにする」（2026-10-22）：
// 案件で1回入れた値（お客様・商品・日付）と計算した値（購入金額・保険給付額）を、事前申請書・支給申請書・委任状・写真の用紙のすべてに入れる。
// 原本の式でつながっている欄（支給申請書・写真の用紙が事前申請書を参照）は式のまま使い、書くのは決めた欄だけ（原本のシート・空欄・図形は消さない）。
// 書かない欄：個人番号・印・ケアマネジャーの署名・受け取り者氏名・市町村の記入欄。

import {insurerNoOf} from './insurerNumbers.ts';
import {saleTotals} from './calc.ts';
import {docLabel} from './category.ts';
import {CARE_LEVELS} from './defaults.ts';
import type {CarePlan, Gender, PayMethod, Sale, Settings} from './types.ts';
import {warekiLabel, warekiOf} from './wareki.ts';
import type {Wareki} from './wareki.ts';
import {
  boxes,
  cellBox,
  dropCalcChain,
  drawMarks,
  emOf,
  finishWorkbook,
  fitCell,
  fitPrintPage,
  formatCell,
  hideZeros,
  LINE_K,
  sameStyle,
  setRowHeight,
  sizeCell,
  styleIdOf,
  wrapText,
  writeCells,
} from './xlsxEdit.ts';
import type {CellValue, Files, Mark} from './xlsxEdit.ts';
import {zipLabel} from './zip.ts';
import {KK_CELLS, KK_SHEETS} from './shinsei/kitakyushuCells.ts';

/** 申請書の原本がある保険者 */
export type ShinseiKey = 'yukuhashi' | 'kanda' | 'miyako' | 'kouiki' | 'fukuoka' | 'kitakyushu';

/** 申請書の明細の1行 */
export type ShinseiItem = {
  label: string; // 福祉用具名（種目及び商品名）：「入浴補助用具（入浴用いす）」と商品名の2行
  makerSeller: string; // 製造事業者名及び販売事業者名：メーカー名と会社名の2行
  total: number; // 購入金額（税込）
  amount: number; // 購入金額（税抜。北九州市の申請内容・概要書の金額）
  tais: string;
  product: string; // 納品名（写真の用紙）：商品名 / 品番
  reason: string;
  name: string; // 商品名だけ（福岡市は種目・商品名・製造事業者名が別の欄）
  code: string; // 品番（北九州市の概要書の「品目、形式等」）
  maker: string; // 製造事業者名だけ（㈱に短くしたもの）
  category: string; // 種目（福岡市は種目の番号を書く）
};

/** 受任者（販売事業者。福岡市の支給申請書）：設定の営業所 */
export type ShinseiSeller = {
  name: string; // 太陽シルバーサービス㈱　福岡東営業所
  zip: string;
  address: string;
  tel: string;
  rep: string; // 代表者職氏名：所長　氏名
  providerNo: string; // 特定福祉用具販売の事業者番号（数字だけ）
};

/** 申請書に書く値（案件・設定・計算から作る。どの様式でも同じ） */
export type ShinseiValues = {
  name: string;
  insurerNo: string; // 保険者番号（6けた。選んだ番号、なければ住所の市町村・区から。広域連合・福岡市の申請書のマス。insurerNumbers.ts）
  kana: string;
  insuredNo: string; // 10けた（足りない左は 0）。番号がなければ空
  birth: Wareki | null;
  gender: Gender;
  zip: string; // 824-0043
  address: string;
  tel: string;
  care: string; // 要支援1〜要介護5
  items: ShinseiItem[];
  recorder: string; // 記載者 事業所・氏名：居宅介護支援事業所　ケアマネジャー
  office: string; // 居宅介護支援事業所だけ（広域連合の「居宅の事業所名」）
  carePlan: CarePlan; // 居宅サービス計画の届出（みやこ町）
  applyDate: string; // 申請日（'YYYY-MM-DD'）
  deliveryDate: string; // 納品日＝購入（予定）日・撮影日
  claimDate: string; // 支給申請日
  benefit: number; // 保険給付額（保険者負担）。負担割合を選んでいなければ 0（委任状の金額は空欄）
  ratioSet: boolean; // 負担割合を選んであるか
  ratio: number; // 負担割合（1〜3割。北九州市の給付率 90・80・70 の丸）
  used: number; // 前回までの給付実績（今年度にもう使った購入金額＝限度額−今年度の残り。残りが空欄なら 0）
  staff: string; // 担当（みやこ町の届出者）
  payMethod: PayMethod; // 支払方法（広域連合は、受領委任払用・償還払い用のどちらの様式に書くか）
  seller: ShinseiSeller;
};

/** 被保険者番号を10けたに（数字だけ。足りない左は 0。ユーザーの指示「5桁なら、残りの空白部分は0でうめる」） */
export function padInsuredNo(v: string): string {
  const d = (v || '').normalize('NFKC').replace(/\D/g, '');
  return d ? d.slice(-10).padStart(10, '0') : '';
}

/** 案件で使う明細（商品名も種目もない空の行は申請書に書かない） */
const usedLines = (sale: Sale, s: Settings) => saleTotals(sale, s).lines.filter((l) => l.item.name.trim() || l.item.category);

/** 居宅サービス計画の届出：選んでいなければ、居宅介護支援事業所が入っていれば「有」 */
export const carePlanOf = (sale: Pick<Sale, 'carePlan' | 'careOffice'>): CarePlan => sale.carePlan || (sale.careOffice.trim() ? '有' : '');

/** 会社の名前を短く：株式会社・（株）・(株) → ㈱、有限会社・（有） → ㈲（前後のすき間も詰める） */
export function corpShort(name: string): string {
  return name
    .trim()
    .replace(/[\s　]*(?:株式会社|[（(]株[)）])[\s　]*/g, '㈱')
    .replace(/[\s　]*(?:有限会社|[（(]有[)）])[\s　]*/g, '㈲');
}

export function shinseiValues(sale: Sale, s: Settings): ShinseiValues {
  const t = saleTotals(sale, s);
  const items = usedLines(sale, s).map((l): ShinseiItem => {
    const i = l.item;
    return {
      // 数量（「（2台）」）は書かない（ユーザーの指示「2台　などの文言は不要」2026-10-26。金額は数量分）
      label: [docLabel(i.category, i.sub), i.name.trim()].filter(Boolean).join('\n'),
      // メーカー名と会社名は1行ずつ。株式会社・（株）は㈱にして短く（ユーザーの指示「会社名や商品名は、1行から増えないようにする　太陽シルバーサービス㈱などでも良い」2026-10-26）
      makerSeller: [corpShort(i.maker), corpShort(s.company)].filter(Boolean).join('\n'),
      total: l.total,
      amount: l.amount,
      tais: i.tais.trim(),
      product: [i.name.trim(), i.code.trim()].filter(Boolean).join(' / '),
      reason: i.reason.trim(),
      name: i.name.trim(),
      code: i.code.trim(),
      maker: corpShort(i.maker),
      category: i.category,
    };
  });
  return {
    name: sale.customer.trim(),
    insurerNo: insurerNoOf(sale.insurer, sale.address, sale.insurerNo ?? ''),
    kana: sale.kana.trim(),
    insuredNo: padInsuredNo(sale.insuredNo),
    birth: warekiOf(sale.birthDate),
    gender: sale.gender,
    zip: zipLabel(sale.zip),
    address: sale.address.trim(),
    tel: sale.tel.trim(),
    care: sale.careLevel,
    items,
    recorder: [sale.careOffice.trim(), sale.careManager.trim()].filter(Boolean).join('　'),
    office: sale.careOffice.trim(),
    carePlan: carePlanOf(sale),
    // 申請書の日付（申請日・購入日＝納品日・支給申請日・完了写真の撮影日）は書かない（空欄）。Excel に保存してから手で入れる
    // （ユーザーの指示「特定福祉用具申請書の赤枠部分は、連動すると都合が悪いため、すべてなくす。入力が必要なときは、EXCELにおとして、手入力します」2026-10-28。
    // 前は案件の applyDate・deliveryDate・claimDate を書いていた。状態の「申請」「納品」で入る日付・販売見積書の納品日がそのまま申請書に出て困った）。
    // 戻すときは、ここを sale.applyDate などに戻し、ShinseiInputs.tsx の入れる所と、確かめ（shinseiChecks・missingFields）・プレビューの押せる欄（shinseiPreview.ts）を足す
    applyDate: '',
    deliveryDate: '',
    claimDate: '',
    benefit: t.ratioSet ? t.insurerBurden : 0,
    ratioSet: t.ratioSet,
    ratio: t.ratio,
    used: t.remainingBlank ? 0 : Math.max(0, t.limit - t.remaining),
    staff: sale.staff.trim(),
    payMethod: sale.payMethod,
    seller: {
      name: [corpShort(s.company), s.officeName.trim()].filter(Boolean).join('　'),
      zip: zipLabel(s.postal),
      address: s.address.trim(),
      tel: s.tel.trim(),
      rep: s.manager.trim() ? `所長　${s.manager.trim()}` : '',
      providerNo: (s.providerNo ?? '').normalize('NFKC').replace(/\D/g, ''),
    },
  };
}

/**
 * 理由の欄の文：用具ごとに1行（様式の注意書き「個々の用具ごとに記載」）。前は用具が2つ以上なら頭に「固定用スロープ：」と付けていたが、
 * ユーザーの指示「固定用スロープという文言は不要」（2026-10-26）で付けない。同じ文の理由（同じ用具の大きさ違いなど）は1回だけ
 */
export function reasonText(v: Pick<ShinseiValues, 'items'>): string {
  return [...new Set(v.items.map((i) => i.reason).filter(Boolean))].join('\n');
}

// ---------------------------------------------------------------- 様式ごとの欄

/** 1つのシートに書くもの */
export type SheetWrite = {
  sheet: string;
  cells?: [string, CellValue][]; // 番地 → 値（空の文字は欄を空にする）
  newStyles?: [string, string][]; // 欄がないときに足す書式：番地 → 同じ書式にする欄（日付の数字を「年」と同じ字体に）
  same?: string[][]; // 明細の行の欄の文字の大きさ・配置を、最初の欄にそろえる（原本は行ごとにちがう）
  fit?: string[]; // 入りきらなければ文字を小さくする欄
  fitWidth?: string[]; // 折り返さない1行の欄で、行が字の大きさぎりぎりに低いもの：幅に入らないときだけ小さくする
  oneLine?: string[]; // 名前の欄（種目及び商品名・製造事業者名及び販売事業者名）：1つの名前が2行に折り返さないよう、どの行も幅に入る大きさにする
  sizes?: [string, number][]; // 文字の大きさ（pt）を変える欄（委任状の保険給付額）
  heights?: [number, number][]; // 高さ（pt）を変える行（大きくした字が入るように）：[行, 高さ]
  marks?: Mark[];
  hideZeros?: boolean; // 式が空の欄を参照して 0 と出るシート
  block?: {cell: string; head: string[]; body: string; tail: string[]}; // 理由のかたまり（みやこ町）：head の行・body（理由。欄の幅で折り返す）・tail の行を、入る大きさにして書く
  formats?: [string, {wrap?: boolean; numFmt?: number; color?: string}][]; // 書式を変える欄（折り返す・表示形式・字の色。福岡市の必要な理由・購入金額）
};

export type ShinseiForm = {key: ShinseiKey; title: string; rows: number; sheets: (v: ShinseiValues) => SheetWrite[]};

/** 'YYYY-MM-DD' → Excel の日付の数（1900年1月1日＝1）。なければ 0 */
export function excelDate(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000) : 0;
}

const pick = <T,>(list: readonly T[], v: T) => list.indexOf(v);
// 丸で囲む欄（原本の書き方）
const ERA = (cell: string, v: ShinseiValues): Mark => ({cell, needles: ['明', '大', '昭'], pick: v.birth ? pick(['明', '大', '昭'], v.birth.short) : -1});
const GENDER = (cell: string, v: ShinseiValues): Mark => ({cell, needles: ['男', '女'], pick: v.gender ? pick(['男', '女'], v.gender) : -1});
/** 要介護状態区分（「要支援　１・２」と書いてあるので、要支援は数字だけを囲む） */
const CARE = (cell: string, v: ShinseiValues): Mark => ({cell, needles: ['１', '２', '要介護１', '要介護２', '要介護３', '要介護４', '要介護５'], pick: pick(CARE_LEVELS, v.care)});

/** 値があるときだけ書く（なければ原本の文字のまま） */
const when = (ok: unknown, cells: [string, CellValue][]): [string, CellValue][] => (ok ? cells : []);

/** 生年月日：「明・大・昭　31年6月10日生」（元号は丸で囲む。明治・大正・昭和でなければ元号を書く） */
function birthChoice(v: ShinseiValues, base: string): string | null {
  const b = v.birth;
  if (!b) return null;
  const ymd = `${b.y}年${b.m}月${b.d}日生`;
  return ['明', '大', '昭'].includes(b.short) ? `${base}　${ymd}` : `${b.era}${ymd}`;
}

/** 被保険者番号の10マス */
const insuredCells = (start: string, row: number, v: ShinseiValues): [string, CellValue][] => {
  const digits = v.insuredNo ? [...v.insuredNo] : Array.from({length: 10}, () => '');
  return boxes(start, 10, row).map((ref, i) => [ref, digits[i] ?? '']);
};

/** 明細の行（rows の行に、前から書く。様式の行より多い分は書かない＝画面で知らせる） */
function itemCells(v: ShinseiValues, rows: number[], cols: {label: string; maker: string; total: string; date?: string; tais?: string}): [string, CellValue][] {
  const out: [string, CellValue][] = [];
  v.items.slice(0, rows.length).forEach((it, k) => {
    const r = rows[k];
    out.push([`${cols.label}${r}`, it.label], [`${cols.maker}${r}`, it.makerSeller], [`${cols.total}${r}`, it.total]);
    if (cols.tais) out.push([`${cols.tais}${r}`, it.tais]);
    // 日付は令和の文字で書く（みやこ町の支給申請書の購入日は日付の表示形式の欄だが、英語の表示・欄に入らない「###」にならないように）
    if (cols.date && v.deliveryDate) out.push([`${cols.date}${r}`, warekiLabel(v.deliveryDate)]);
  });
  return out;
}

/** 明細の行の列（refs）：rows の行ごとの番地 */
const rowsOf = (col: string, rows: number[]) => rows.map((r) => `${col}${r}`);

/**
 * 委任状の保険給付額の文字の大きさ（原本は 11pt。ユーザーの指示「委任状に転記されているが、金額の部分の文字が小さすぎる。大きく表示する」2026-10-26 で 14pt、
 * 「委任状の金額部分は、もう少し大きくする」2026-10-27 で 18pt）
 */
const PROXY_AMOUNT_PT = 18;
/**
 * 18pt の字は原本の行（既定の 18.75pt）に入らないので、保険給付額の行（23行）を高くし、すぐ下の空いた行（24行）を同じだけ低くする
 * （日付・委任者の住所・氏名の位置と、用紙の中の収まりは変えない）。[行, 高さ pt]
 */
const PROXY_AMOUNT_ROWS: [number, number][] = [
  [23, 24],
  [24, 13.5],
];
/** 原本の 11pt で、欄の左から「円」の右の端まで（全角の文字の数） */
const PROXY_AMOUNT_EM = 28;

/**
 * 委任状（行橋市・苅田町は同じ様式）：保険給付額・日付・委任者の住所。
 * 委任者の氏名は書かない（自筆。ユーザーの指示「委任状では、名前の部分は自筆となるため、印字しない」2026-10-27。広域連合の委任状と同じ。原本の「氏　名　…㊞」のまま）。
 * 原本は「すき間＋円」の1つの文字なので、円の位置が変わらないように、すき間を減らして書く。
 * 保険給付額は大きく（PROXY_AMOUNT_PT）して、「円」の右の端が原本の 11pt のときと同じ所に来るよう、すき間をその大きさで数える
 */
function proxyCells(v: ShinseiValues): [string, CellValue][] {
  const amount = v.benefit > 0 ? v.benefit.toLocaleString('ja-JP') : '';
  const space = (n: number) => '　'.repeat(Math.max(1, Math.round(n)));
  return [
    ...when(amount, [['B23', `${space((PROXY_AMOUNT_EM * 11) / PROXY_AMOUNT_PT - 1 - emOf(amount))}${amount}円`]]),
    ...when(v.applyDate, [['A29', `${'　'.repeat(5)}${warekiLabel(v.applyDate)}`]]),
    ...when(v.address, [['A32', `　　　　委任者　住　所　　${v.address}`]]),
  ];
}

/** 完了写真（行橋市・苅田町）：納品名（原本の式は #VALUE! になるので商品名を書く）・撮影日（納品日） */
function photoCells(v: ShinseiValues): [string, CellValue][] {
  return [['B3', v.items.map((i) => i.product).join('、')], ...when(v.deliveryDate, [['B4', excelDate(v.deliveryDate)]])];
}

/** 行橋市・苅田町の事前申請書（同じ並び。被保険者番号の行だけ違う） */
function preCells(v: ShinseiValues, insuredRow: number): [string, CellValue][] {
  const reasons = reasonText(v);
  const birth = birthChoice(v, '明・大・昭');
  return [
    ['F4', v.kana],
    ['F5', v.name],
    ...insuredCells('Z', insuredRow, v),
    ...when(birth, [['F9', birth ?? '']]),
    ['G10', v.zip],
    ['F11', v.address],
    ['Y10', v.tel],
    ...itemCells(v, [15, 16, 17], {label: 'A', maker: 'L', total: 'V', date: 'AB'}),
    ...when(reasons, [['E18', reasons]]),
    ...when(v.recorder, [['L20', v.recorder]]),
    ...when(v.applyDate, [['C26', warekiLabel(v.applyDate)]]),
  ];
}

const PRE_FIT = ['F4', 'F5', 'F11', 'Y10', 'E18', 'L20'];
const PRE_ROWS = [15, 16, 17];
const PRE_SAME = [rowsOf('A', PRE_ROWS), rowsOf('L', PRE_ROWS)];
const PRE_ONE_LINE = [...rowsOf('A', PRE_ROWS), ...rowsOf('L', PRE_ROWS)];

/** 令和の日付の数字（「令和」と年・月・日の数） */
function reiwaParts(iso: string): {era: string; y: number; m: number; d: number} | null {
  const w = warekiOf(iso);
  return w ? {era: w.era, y: w.y, m: w.m, d: w.d} : null;
}

/** みやこ町の申請日の行：「令和」・年の数（「年」の欄の左）・月・日 */
function dateRow(iso: string, cells: {era: string; y: string; m: string; d: string}): [string, CellValue][] {
  const p = reiwaParts(iso);
  if (!p) return [];
  return [
    [cells.era, p.era],
    [cells.y, p.y],
    [cells.m, p.m],
    [cells.d, p.d],
  ];
}

const MIYAKO_ROWS = [12, 14, 16, 18];
const MIYAKO_PHOTOS = ['納品確認写真用紙', '納品確認写真用紙 (2)', '納品確認写真用紙 (3)', '納品確認写真用紙 (4)'];

/**
 * 広域連合（福岡県介護保険広域連合の福祉用具購入申請関係様式集。築上町・豊前市・上毛町・吉富町）：事前の申請はなく、購入のあとの支給申請書だけ。
 * 様式集の説明「支払方法に応じて受領委任払用又は償還払い用のどちらかを提出」なので、案件の支払方法の様式に書く（もう片方は空のまま）。
 * 要介護状態区分の欄はない。理由の欄の下に「居宅サービス計画の届出　有・無／居宅の事業所名」（みやこ町と同じく有・無を丸で囲む）と、ケアマネジャーの署名（空ける）
 */
export const KOUIKI_SHEETS = {
  juryo: '様式第8号（福祉用具購入費支給申請書（受領委任払用））',
  shokan: '福祉用具購入費支給申請書（償還払い用）',
  photo: '写真貼付用紙(任意様式でも可）',
} as const;
const KOUIKI_JURYO_ROWS = [12, 14, 16];
const KOUIKI_SHOKAN_ROWS = [14, 16, 18];

/** 広域連合の2つの申請書で同じ書き方の欄（番地は様式ごと） */
type KouikiCells = {kana: string; name: string; insured: [string, number]; birth: string; gender: string; zip: string; address: string; rows: number[]; total: string; reason: string; plan: string; date: {era: string; y: string; m: string; d: string}};

/** 居宅サービス計画の届出の行（原本の文のまま）と、居宅の事業所名（居宅介護支援事業所） */
const KOUIKI_PLAN = ' 居宅サービス計画の届出　　　有　・　無';

function kouikiCells(v: ShinseiValues, c: KouikiCells, birth: string | null): [string, CellValue][] {
  const shown = v.items.slice(0, c.rows.length);
  return [
    [c.kana, v.kana],
    [c.name, v.name],
    ...insuredCells(c.insured[0], c.insured[1], v),
    ...when(birth, [[c.birth, birth ?? '']]),
    ...when(v.zip, [[c.zip, `〒${v.zip}`]]),
    [c.address, v.address],
    ...itemCells(v, c.rows, {label: 'B', maker: 'I', total: 'R', date: 'Y'}),
    // 合計：様式の行に書いた商品の購入金額の合計（行より多い商品は画面で知らせる）
    ...when(shown.length, [[c.total, shown.reduce((n, i) => n + i.total, 0)]]),
    ...when(reasonText(v), [[c.reason, reasonText(v)]]),
    ...dateRow(v.applyDate, c.date),
  ];
}

const kouikiFit = (c: KouikiCells) => [c.name, c.reason];
const kouikiOneLine = (c: KouikiCells) => [...rowsOf('B', c.rows), ...rowsOf('I', c.rows)];
/**
 * 居宅サービス計画の届出の行と居宅の事業所名：アプリで改行を入れ、入る大きさにして書く（みやこ町の理由の欄と同じ block。
 * 行が決まっているので、有・無の丸の位置と、プレビューの1文字ずつの位置が Excel の折り返しに左右されない）
 */
const kouikiPlan = (c: KouikiCells, v: ShinseiValues): SheetWrite['block'] => ({cell: c.plan, head: [KOUIKI_PLAN], body: ` 居宅の事業所名${v.office ? `　${v.office}` : ''}`, tail: []});
const kouikiPlanMark = (cell: string, v: ShinseiValues): Mark => ({cell, needles: ['有', '無'], pick: v.carePlan ? pick(['有', '無'], v.carePlan) : -1, after: '居宅サービス計画の届出'});

/**
 * 受領委任払用（様式第8号）：申請者は会社（受領委任事業者。原本のまま）。口座の欄・広域連合の記入欄は書かない（口座はユーザーの答え「空のままでよい」2026-10-26）。
 * 下の委任状の被保険者氏名は書かない（自署。ユーザーの答え「空けて自署にする」2026-10-26。前は「被保険者氏名　　山田 花子」と書いていた）
 */
function kouikiJuryo(v: ShinseiValues): SheetWrite {
  const c: KouikiCells = {kana: 'G2', name: 'G3', insured: ['W', 4], birth: 'G6', gender: 'W6', zip: 'G8', address: 'G9', rows: KOUIKI_JURYO_ROWS, total: 'R18', reason: 'J20', plan: 'J21', date: {era: 'C27', y: 'F27', m: 'I27', d: 'L27'}};
  return {
    sheet: KOUIKI_SHEETS.juryo,
    // 保険者番号（原本は 406470＝築上町。構成市町村ごとに番号がちがうので、選んだ番号で書きかえる。ユーザーの指示 2026-10-29）
    cells: [...kouikiCells(v, c, birthChoice(v, '明 ・ 大 ・ 昭　')), ['Z9', v.tel], ...insurerBoxes(v, 'AA', 2)],
    block: kouikiPlan(c, v),
    fit: kouikiFit(c),
    oneLine: kouikiOneLine(c),
    fitWidth: ['G2', 'G9', 'Z9'], // フリガナ・住所・電話の行は低い（字の大きさとほぼ同じ）
    marks: [ERA('G6', v), GENDER('W6', v), kouikiPlanMark('J21', v)],
  };
}

/** 保険者番号の6マス（広域連合の様式。1字ずつの欄。原本の数と同じく数で書く） */
const insurerBoxes = (v: ShinseiValues, start: string, row: number): [string, CellValue][] =>
  v.insurerNo.length === 6 ? boxes(start, 6, row).map((ref, i): [string, CellValue] => [ref, Number(v.insurerNo[i])]) : [];

/** 償還払い用：元号の字がないので「昭和31年6月10日生」。申請者は本人（住所・氏名・電話）。届出者・口座の欄は書かない */
function kouikiShokan(v: ShinseiValues): SheetWrite {
  const c: KouikiCells = {kana: 'I4', name: 'I6', insured: ['W', 6], birth: 'I8', gender: 'W8', zip: 'I10', address: 'I11', rows: KOUIKI_SHOKAN_ROWS, total: 'R20', reason: 'I22', plan: 'I23', date: {era: 'H30', y: 'J30', m: 'M30', d: 'P30'}};
  const b = v.birth;
  return {
    sheet: KOUIKI_SHEETS.shokan,
    // 申請者（本人）の住所・氏名・電話は、下線の左の欄に書く（右の空いた欄へはみ出して出る）
    cells: [...kouikiCells(v, c, b ? `${b.era}${b.y}年${b.m}月${b.d}日生` : null), ['J32', v.address], ['J34', v.name], ['Y34', v.tel], ...insurerBoxes(v, 'AA', 4)],
    block: kouikiPlan(c, v),
    fit: kouikiFit(c),
    oneLine: kouikiOneLine(c),
    fitWidth: ['I11'], // フリガナ（I4）は結合していない1つの欄なので小さくしない（右の空いた欄へはみ出す）
    marks: [GENDER('W8', v), kouikiPlanMark('I23', v)],
  };
}

/** 写真貼付用紙（1枚）：氏名・被保険者番号・商品名（2つ以上なら「、」でつなぐ。行橋市の完了写真と同じ） */
function kouikiPhoto(v: ShinseiValues): SheetWrite {
  return {sheet: KOUIKI_SHEETS.photo, cells: [['B3', v.name], ...insuredCells('G', 3, v), ['B4', v.items.map((i) => i.product).join('、')]], fit: ['B3', 'B4']};
}

/**
 * 福岡市（介護保険福祉用具購入費支給申請書【受領委任払用】様式第18号の2。福岡市のホームページの様式。2026-10-29 にユーザーからいただいた）：
 * 事前の申請はなく、購入のあとの支給申請書だけ（1枚）。申請者は本人、受任者は販売事業者（設定の営業所）。
 * 欄の位置は様式の「記載例」のシートで確かめた。書かない欄：年度・申請日・購入日（日付は書かない。2026-10-28 の指示）・振込先・保険者処理欄
 */
export const FUKUOKA_SHEET = '申請書';
export const FUKUOKA_ROWS = [13, 15, 17];
/** 種目の番号（福岡市の様式の「※種目には次の番号を記載」。北九州市の申請書・概要書の種目の並び (1)〜(9) と同じ） */
const KIND_NO: Record<string, number> = {
  腰掛便座: 1,
  自動排泄処理装置の交換可能部品: 2,
  入浴補助用具: 3,
  簡易浴槽: 4,
  移動用リフトのつり具の部分: 5,
  排泄予測支援機器: 6,
  固定用スロープ: 7,
  歩行器: 8,
  歩行補助つえ: 9,
};
/** 福岡市の区（この順で 4013 のうしろの番号：東区＝1 … 早良区＝7） */
const FUKUOKA_WARDS = ['東', '博多', '中央', '南', '西', '城南', '早良'];

/** 住所の福岡市の区（「東」「中央」など）と、そのうしろ。区がなければ null */
export function fukuokaWard(address: string): {ward: string; rest: string} | null {
  const m = new RegExp(`^(?:福岡県)?[\\s　]*(?:福岡市)?[\\s　]*(${FUKUOKA_WARDS.join('|')})[\\s　]*区[\\s　]*(.*)$`).exec(address.trim());
  return m ? {ward: m[1], rest: m[2]} : null;
}

/**
 * 介護保険の保険者番号の6けため(検証番号)：右のけたから 2・1・2… を掛け、2けたになったら十の位と一の位を足して合計し、10 から合計の一の位を引く（一の位が 0 なら 0）。
 * 広域連合の様式の 406470 と、福岡市の記載例（中央区）の 401331 で確かめた
 */
export function insurerCheckDigit(five: string): number {
  let sum = 0;
  [...five].reverse().forEach((d, i) => {
    const n = Number(d) * (i % 2 === 0 ? 2 : 1);
    sum += Math.floor(n / 10) + (n % 10);
  });
  return (10 - (sum % 10)) % 10;
}

/** 福岡市の保険者番号（区ごと。記載例の中央区は 401331）。区が分からなければ空 */
export function fukuokaInsurerNo(address: string): string {
  const w = fukuokaWard(address);
  if (!w) return '';
  const five = `4013${FUKUOKA_WARDS.indexOf(w.ward) + 1}`;
  return `${five}${insurerCheckDigit(five)}`;
}

/** 1つおきの列のマス（福岡市の番号の欄は2列を結合した四角）：Q7・S7・U7… */
export const pairBoxes = (start: string, n: number, row: number) => boxes(start, n * 2, row).filter((_, i) => i % 2 === 0);

/** 原本の「（電話　…　）」「（〒　…　）」のかっこの中に書く（閉じかっこの位置が原本と同じぐらいになるよう、うしろのすき間で合わせる） */
function inParens(head: string, value: string, em: number): string {
  const body = `（${head}　　　${value}`;
  return `${body}${'　'.repeat(Math.max(1, Math.round(em - emOf(body) - 1)))}）`;
}
const BLACK = 'FF000000';
/** 原本のかっこの文字の長さ（全角の文字の数） */
const FUKUOKA_TEL_EM = 27;
const FUKUOKA_ZIP_EM = 26;

function fukuokaSheet(v: ShinseiValues): SheetWrite {
  const b = v.birth;
  const shown = v.items.slice(0, FUKUOKA_ROWS.length);
  const w = fukuokaWard(v.address);
  // 保険者番号：選んだ番号、なければ住所の区から（insurerNumbers.ts。区ごとの番号は fukuokaInsurerNo と同じ）
  const insurer = v.insurerNo.startsWith('4013') ? v.insurerNo : fukuokaInsurerNo(v.address);
  const digits = (no: string, start: string, row: number): [string, CellValue][] => pairBoxes(start, 10, row).map((ref, i) => [ref, no ? no[i] ?? '' : '']);
  const amounts = [...FUKUOKA_ROWS.slice(0, shown.length).map((r) => `Q${r}`), ...(shown.length ? ['Q19'] : [])];
  return {
    sheet: FUKUOKA_SHEET,
    cells: [
      ['E5', v.kana],
      ['E6', v.name],
      // 保険者番号：原本に 4013 まで入っている。うしろの2けたは住所の区から
      ...when(insurer, [
        ['AG5', Number(insurer[4])],
        ['AI5', Number(insurer[5])],
      ]),
      ...(v.insuredNo ? digits(v.insuredNo, 'Q', 7) : []),
      // 生年月日：元号は丸（明治・大正・昭和でなければ元号を書く）、年・月・日はそれぞれの欄
      ...(b ? ([...(['明', '大', '昭'].includes(b.short) ? [] : [['E8', b.era]]), ['H8', b.y], ['J8', b.m], ['L8', b.d]] as [string, CellValue][]) : []),
      // 販売事業者名・事業者番号（10けた。原本の 4・0 も同じ数字で書く）
      ...when(v.seller.name, [['E11', v.seller.name]]),
      ...(v.seller.providerNo.length === 10 ? digits(v.seller.providerNo, 'Q', 11) : []),
      ...shown.flatMap((it, k): [string, CellValue][] => {
        const r = FUKUOKA_ROWS[k];
        return [
          [`C${r}`, KIND_NO[it.category] ?? ''],
          [`D${r}`, it.name],
          [`J${r}`, it.maker],
          [`Q${r}`, it.total],
        ];
      }),
      ...when(shown.length, [['Q19', shown.reduce((n, i) => n + i.total, 0)]]),
      // 申請者（本人）：あて先の区長・住所（記載例と同じ「福岡市　中央　区　天神…」。原本の「区」の欄は消して1つの欄に）・氏名・日中の連絡先
      ...when(w, [['D25', `福岡市${'　'.repeat(Math.ceil((4 - (w?.ward.length ?? 0)) / 2))}${w?.ward}${'　'.repeat(Math.floor((4 - (w?.ward.length ?? 0)) / 2))}区長`]]),
      ...when(v.address, [
        ['L25', w ? `福岡市　${w.ward}　区　${w.rest}` : v.address.replace(/^福岡県[\s　]*/, '')],
        ['O25', ''],
      ]),
      ['L26', v.name],
      ...when(v.tel, [['P28', inParens('電話', v.tel, FUKUOKA_TEL_EM)]]),
      // 受任者（販売事業者）：設定の営業所
      ...when(v.seller.zip, [['E31', inParens('〒', v.seller.zip, FUKUOKA_ZIP_EM)]]),
      ...when(v.seller.address, [['E32', v.seller.address]]),
      ...when(v.seller.tel, [['W31', v.seller.tel]]),
      ...when(v.seller.name, [['E33', v.seller.name]]),
      ...when(v.seller.rep, [['Q33', v.seller.rep]]),
    ],
    // 必要な理由：原本は折り返さない1行の欄なので、アプリで改行を入れて折り返す書式にする（入る大きさにして書く）
    block: {cell: 'E10', head: [], body: reasonText(v), tail: []},
    // 書いた値の字は黒（原本は様式と同じ赤紫の欄がある。記載例は値を黒で書いている。「福岡市　中央　区長」など様式の文字とまぜて書く欄は様式の色のまま）
    formats: [
      ...['E5', 'H8', 'J8', 'L8', 'AG5', 'AI5', ...rowsOf('C', FUKUOKA_ROWS), ...rowsOf('D', FUKUOKA_ROWS), ...rowsOf('J', FUKUOKA_ROWS), 'E32', 'W31', 'E33', 'Q33'].map((ref): [string, {color: string}] => [ref, {color: BLACK}]),
      ['E10', {wrap: true, color: BLACK}],
      ...amounts.map((ref): [string, {numFmt: number; color: string}] => [ref, {numFmt: 3, color: BLACK}]),
    ],
    // 明細の3行目の商品名・製造事業者名は、原本ではまん中ぞろえ（1・2行目は左）。1行目にそろえる
    same: [rowsOf('D', FUKUOKA_ROWS), rowsOf('J', FUKUOKA_ROWS)],
    fit: ['E6', 'E11', 'L26', 'E32', 'W31', 'E33', 'Q33'],
    fitWidth: ['E5'],
    oneLine: [...rowsOf('D', FUKUOKA_ROWS), ...rowsOf('J', FUKUOKA_ROWS)],
    // 元号と本人の状況（在宅を囲む。入所中の方は特定福祉用具の支給の対象にならない）
    marks: [ERA('E8', v), {cell: 'E9', needles: ['在　宅', '入　所'], pick: 0}],
  };
}

/**
 * 北九州市（介護保険居宅介護（予防）福祉用具購入費支給申請書（受領委任払用）と、添える特定福祉用具概要書（介護保険用）。2026-10-29 にユーザーからいただいた市の様式）：
 * 事前の申請はなく、購入のあとの支給申請書だけ。申請するのは事業者（受任者＝設定の営業所。事業者番号も）で、被保険者は委任の欄に自署する（氏名は書かない）。
 * 原本はスキルの scripts/make_kitakyushu_tokutei.py が市の様式（Word・Excel）から作り、欄の番地は kitakyushuCells.ts に書き出す。
 * 申請内容は種目ごとの金額（市の記入例の「税抜の金額を記入」）・合計金額（消費税込）①・前回までの給付実績②（今年度の残りを入れたときだけ）・申請金額（保険給付額）。
 * 給付率（７０・８０・９０）は負担割合から丸で囲む。概要書は商品ごとに 種目・品目、形式等（商品名と品番）・金額（税抜）と、合計・消費税・総合計・業者名（連絡先）・担当者。
 * 書かない欄：購入月・領収書記載日・委任と申請と概要書の日付（日付は書かない。2026-10-28 の指示）・口座振込依頼欄・選択制のチェック・概要書の概要（特長等）・市の記入欄・
 * 裏の委任状（口座名義人が事業者の代表者とちがうときに書く）
 */
export const KITAKYUSHU_SHEETS = {shikyu: KK_SHEETS[0], back: KK_SHEETS[1], gaiyo: KK_SHEETS[2], gaiyoBack: KK_SHEETS[3]} as const;
/** 概要書の商品の行（原本の2行ずつで1つの商品） */
export const KITAKYUSHU_GAIYO_ROWS = 12;
const KK: Record<string, string> = KK_CELLS.shikyu;
const KG: Record<string, string> = KK_CELLS.gaiyo;
/** 北九州市の住所は区から書く（市の記入例「小倉北区城内１－１」「八幡東区中央一丁目１－１」）。市の外の住所は福岡県だけ外す */
export const kitakyushuAddress = (address: string) => address.trim().replace(/^(?:福岡県)?[\s　]*(?:北九州市[\s　]*)?/, '');
/** 事業者番号は市の記入例と同じ全角の数字 */
const fullDigits = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0));

function kitakyushuSheets(v: ShinseiValues): SheetWrite[] {
  const kinds = new Map<number, number>();
  for (const it of v.items) {
    const no = KIND_NO[it.category];
    if (no) kinds.set(no, (kinds.get(no) ?? 0) + it.amount);
  }
  const amount = v.items.reduce((n, i) => n + i.amount, 0);
  const total = v.items.reduce((n, i) => n + i.total, 0);
  const shown = v.items.slice(0, KITAKYUSHU_GAIYO_ROWS);
  const yen = (ok: unknown, ref: string, n: number): [string, CellValue][] => (ok ? [[ref, n]] : []);
  const seller = v.seller;
  const sellerAddress = kitakyushuAddress(seller.address);
  // 業者名（連絡先）：販売事業者名・住所・電話番号（概要書の記入上の注意事項）
  const contact = [seller.name, [seller.zip && `〒${seller.zip}`, seller.address].filter(Boolean).join('　'), seller.tel && `電話　${seller.tel}`].filter(Boolean).join('\n');
  return [
    {
      sheet: KITAKYUSHU_SHEETS.shikyu,
      cells: [
        ...when(seller.providerNo.length === 10, [[KK.provider, fullDigits(seller.providerNo)]]),
        [KK.kana, v.kana],
        [KK.name, v.name],
        ...Array.from({length: 10}, (_, i): [string, CellValue] => [KK[`no${i}`], v.insuredNo[i] ?? '']),
        [KK.address, kitakyushuAddress(v.address)],
        [KK.tel, v.tel],
        ...[...kinds].map(([no, n]): [string, CellValue] => [KK[`kind${no}`], n]),
        ...yen(v.items.length, KK.total, total),
        ...yen(v.used > 0, KK.prev, v.used),
        ...yen(v.benefit > 0, KK.benefit, v.benefit),
        // 委任の欄（被保険者氏名は自署）と申請の欄の事業者：設定の営業所
        ...when(seller.name, [
          [KK.sellerA, seller.name],
          [KK.sellerB, seller.name],
        ]),
        ...when(seller.rep, [
          [KK.repA, seller.rep],
          [KK.repB, seller.rep],
        ]),
        ...when(sellerAddress, [[KK.sellerAddress, sellerAddress]]),
        ...when(seller.tel, [[KK.sellerTel, seller.tel]]),
      ],
      block: {cell: KK.reason, head: [], body: reasonText(v), tail: []},
      formats: [...[...kinds.keys()].map((no) => KK[`kind${no}`]), KK.total, KK.prev, KK.benefit].map((ref): [string, {numFmt: number}] => [ref, {numFmt: 3}]),
      fit: [KK.kana, KK.name, KK.address, KK.tel, KK.sellerA, KK.repA, KK.sellerB, KK.repB, KK.sellerAddress, KK.sellerTel],
      // 給付率の丸：1割＝９０・2割＝８０・3割＝７０（生活保護も 1割）
      marks: [{cell: KK.ratio, needles: ['７０', '８０', '９０'], pick: v.ratioSet ? 3 - v.ratio : -1}],
    },
    {sheet: KITAKYUSHU_SHEETS.back},
    {
      sheet: KITAKYUSHU_SHEETS.gaiyo,
      cells: [
        [KG.name, v.name],
        [KG.insured, v.insuredNo],
        ...yen(v.items.length, KG.amount, amount),
        ...yen(v.items.length, KG.tax, total - amount),
        ...yen(v.items.length, KG.total, total),
        ...when(seller.name, [[KG.seller, contact]]),
        [KG.manager, v.staff],
        ...shown.flatMap((it, r): [string, CellValue][] => [
          [KG[`kind${r}`], it.category],
          [KG[`item${r}`], [it.name, it.code].filter(Boolean).join('\n')],
          [KG[`yen${r}`], it.amount],
        ]),
      ],
      formats: [KG.amount, KG.tax, KG.total, ...shown.map((_, r) => KG[`yen${r}`])].map((ref): [string, {numFmt: number}] => [ref, {numFmt: 3}]),
      fit: [KG.name, KG.seller, KG.manager, ...shown.flatMap((_, r) => [KG[`kind${r}`], KG[`item${r}`]])],
    },
    {sheet: KITAKYUSHU_SHEETS.gaiyoBack},
  ];
}

export const SHINSEI: Record<ShinseiKey, ShinseiForm> = {
  yukuhashi: {
    key: 'yukuhashi',
    title: '行橋市',
    rows: 3,
    sheets: (v) => [
      {sheet: '用具・受領委任払', cells: preCells(v, 7), same: PRE_SAME, fit: PRE_FIT, oneLine: PRE_ONE_LINE, marks: [ERA('F9', v), GENDER('Y9', v), CARE('F12', v)]},
      {sheet: '委任状', cells: proxyCells(v), ...(v.benefit > 0 ? {sizes: [['B23', PROXY_AMOUNT_PT]], heights: PROXY_AMOUNT_ROWS} : {})},
      {sheet: '完了写真', cells: photoCells(v), fit: ['B3'], hideZeros: true},
    ],
  },
  kanda: {
    key: 'kanda',
    title: '苅田町',
    rows: 3,
    sheets: (v) => [
      // 事前申請書の申請者は本人（住所 K28・氏名 K29 は原本の式）。電話番号 K30 にお客様の電話
      {sheet: '用具・受領委任払', cells: [...preCells(v, 4), ['K30', v.tel]], same: PRE_SAME, fit: PRE_FIT, oneLine: PRE_ONE_LINE, marks: [ERA('F9', v), GENDER('Y9', v), CARE('F12', v)]},
      // 支給申請書：ほとんどの欄は事前申請書を参照する式。性別（式でない）・購入日・申請日だけ書く。丸は同じ位置に
      {
        sheet: '用具・支給申請　受領委任払 (2)',
        cells: [
          ...v.items.slice(0, 3).flatMap((_, k): [string, CellValue][] => (v.deliveryDate ? [[`AB${15 + k}`, warekiLabel(v.deliveryDate)]] : [])),
          ...when(v.claimDate, [['C26', warekiLabel(v.claimDate)]]),
        ],
        same: PRE_SAME,
        fit: PRE_FIT,
        oneLine: PRE_ONE_LINE,
        marks: [ERA('F9', v), GENDER('Y9', v), CARE('F12', v)],
        hideZeros: true,
      },
      {sheet: '委任状', cells: proxyCells(v), ...(v.benefit > 0 ? {sizes: [['B23', PROXY_AMOUNT_PT]], heights: PROXY_AMOUNT_ROWS} : {})},
      {sheet: '完了写真', cells: photoCells(v), fit: ['B3'], hideZeros: true},
    ],
  },
  miyako: {
    key: 'miyako',
    title: 'みやこ町',
    rows: 4,
    sheets: (v) => {
      const b = v.birth;
      const birth = b ? `${b.era}${b.y}年${String(b.m).padStart(2, '0')}月${String(b.d).padStart(2, '0')}日生` : '';
      return [
        {
          sheet: '福祉用具購入受領委任払申請書',
          cells: [
            ['I4', v.kana],
            ['I5', v.name],
            ...insuredCells('W', 4, v),
            ['I7', birth],
            ['I8', v.zip ? `〒${v.zip}` : ''],
            ['I9', v.address],
            ['Z9', v.tel],
            ...itemCells(v, MIYAKO_ROWS, {label: 'B', maker: 'I', total: 'R', tais: 'Y'}),
            ...dateRow(v.applyDate, {era: 'D30', y: 'F30', m: 'I30', d: 'L30'}),
            ['I34', v.name],
            ['I36', v.staff],
          ],
          // 理由の欄は「（居宅サービス計画の届出　有・無）」の行と、ケアマネジャーの署名の行（空ける）も入っている。
          // 届出の行を1行目にする（有・無の丸の位置を、理由の長さによらず決められるように）
          block: {cell: 'I20', head: ['（居宅サービス計画の届出　　有・無）'], body: reasonText(v), tail: ['']},
          same: [rowsOf('B', MIYAKO_ROWS), rowsOf('I', MIYAKO_ROWS), rowsOf('Y', MIYAKO_ROWS)],
          fit: ['I4', 'I5', 'I9', 'Z9'],
          oneLine: [...rowsOf('B', MIYAKO_ROWS), ...rowsOf('I', MIYAKO_ROWS)],
          marks: [GENDER('AA7', v), {cell: 'I20', needles: ['有', '無'], pick: v.carePlan ? pick(['有', '無'], v.carePlan) : -1, after: '居宅サービス計画の届出'}],
        },
        {
          sheet: '福祉用具支給申請(受領委任）',
          cells: [...itemCells(v, MIYAKO_ROWS, {label: 'B', maker: 'I', total: 'P', date: 'V'}), ...dateRow(v.claimDate, {era: 'H25', y: 'J25', m: 'M25', d: 'P25'})],
          newStyles: ['H25', 'J25', 'M25', 'P25'].map((ref) => [ref, 'K25'] as [string, string]),
          same: [rowsOf('B', MIYAKO_ROWS), rowsOf('I', MIYAKO_ROWS), rowsOf('V', MIYAKO_ROWS)],
          fit: ['I4', 'I5', 'I9', 'Z9', ...rowsOf('V', MIYAKO_ROWS)],
          oneLine: [...rowsOf('B', MIYAKO_ROWS), ...rowsOf('I', MIYAKO_ROWS)],
          marks: [GENDER('AA7', v)],
        },
        // 納品確認写真用紙：1枚に1つの商品（使わない用紙は空のまま）
        ...v.items.slice(0, MIYAKO_PHOTOS.length).map(
          (it, k): SheetWrite => ({
            sheet: MIYAKO_PHOTOS[k],
            cells: [
              ['J5', v.name],
              ['Y5', v.insuredNo],
              ['J7', it.product],
            ],
            fit: ['J5', 'J7'],
          }),
        ),
      ];
    },
  },
  kouiki: {
    key: 'kouiki',
    title: '広域連合',
    rows: 3,
    sheets: (v) => [v.payMethod === '償還払い' ? kouikiShokan(v) : kouikiJuryo(v), kouikiPhoto(v)],
  },
  fukuoka: {key: 'fukuoka', title: '福岡市', rows: FUKUOKA_ROWS.length, sheets: (v) => [fukuokaSheet(v)]},
  kitakyushu: {key: 'kitakyushu', title: '北九州市', rows: KITAKYUSHU_GAIYO_ROWS, sheets: kitakyushuSheets},
};

export const shinseiForm = (insurer: string): ShinseiForm | null => SHINSEI[insurer as ShinseiKey] ?? null;

// ---------------------------------------------------------------- 書き込む

/**
 * 理由のかたまり（みやこ町の I20）：届出の行（head）・理由（body。欄の幅で折り返す）・署名の行（tail）。
 * 全部が入る文字の大きさにする（折り返しはアプリで決めて改行を入れる）
 */
function writeBlock(files: Files, sheet: string, block: NonNullable<SheetWrite['block']>): void {
  const {box, style} = cellBox(files, sheet, block.cell);
  let pt = style.size;
  let lines: string[] = [];
  for (; pt > 4.5; pt -= 0.5) {
    lines = [...block.head, ...(block.body ? wrapText(block.body, box.w * 0.97, pt) : []), ...block.tail];
    if (lines.length * ((pt * 4) / 3) * LINE_K <= box.h - 4) break;
  }
  writeCells(files, sheet, new Map([[block.cell, lines.join('\n')]]));
  if (pt < style.size) sizeCell(files, sheet, block.cell, Math.max(4.5, pt));
}

/** 開いた原本（unzipSync したもの）に書き込んで、申請書（.xlsx）のバイト列にする。files は書きかえる（原本を何度も使うなら {...files} を渡す） */
export function fillShinsei(files: Files, form: ShinseiForm, v: ShinseiValues): Uint8Array {
  fillShinseiFiles(files, form, v);
  return finishWorkbook(files);
}

/** 開いた原本に書き込む（ブックの仕上げ・zip はしない。申請書のプレビューも同じ書き込みをしたシートを描く＝shinseiPreview.ts） */
export function fillShinseiFiles(files: Files, form: ShinseiForm, v: ShinseiValues): void {
  const sheets = form.sheets(v);
  // 1. 値を書く（式の答えも合わせる）→ 2. 入りきらない欄の文字を小さくする → 3. 丸（文字の大きさが決まってから位置を計算する）
  for (const w of sheets) {
    const styles = new Map((w.newStyles ?? []).map(([ref, like]) => [ref, styleIdOf(files, w.sheet, like) ?? '0'] as [string, string]));
    if (w.cells?.length) writeCells(files, w.sheet, new Map(w.cells), styles);
    if (w.block) writeBlock(files, w.sheet, w.block);
    if (w.hideZeros) hideZeros(files, w.sheet);
  }
  for (const w of sheets) for (const [ref, pt] of w.sizes ?? []) sizeCell(files, w.sheet, ref, pt);
  for (const w of sheets) for (const [row, pt] of w.heights ?? []) setRowHeight(files, w.sheet, row, pt);
  for (const w of sheets) for (const [ref, change] of w.formats ?? []) formatCell(files, w.sheet, ref, change);
  for (const w of sheets) for (const refs of w.same ?? []) sameStyle(files, w.sheet, refs);
  for (const w of sheets) for (const ref of w.fit ?? []) fitCell(files, w.sheet, ref);
  for (const w of sheets) for (const ref of w.fitWidth ?? []) fitCell(files, w.sheet, ref, true);
  for (const w of sheets) for (const ref of w.oneLine ?? []) fitCell(files, w.sheet, ref, false, true);
  for (const w of sheets) if (w.marks?.length) drawMarks(files, w.sheet, w.marks);
  // 4. 書いたシートが A4 から少しはみ出すなら、印刷を「1ページに合わせる」に（Excel で印刷して2〜4枚に分かれないように）
  for (const w of sheets) fitPrintPage(files, w.sheet);
  dropCalcChain(files);
}

/** ファイル名：「山田花子様特定福祉用具申請書.xlsx」（住宅改修アプリの「…様住宅改修申請書.xlsx」と同じ形） */
export function shinseiFileName(sale: Pick<Sale, 'customer'>): string {
  const name = sale.customer.replace(/[\s　]+/g, '').replace(/[\\/:*?"<>|]/g, '') || 'お客様';
  return `${name}様特定福祉用具申請書.xlsx`;
}

// ---------------------------------------------------------------- 作る前に確かめる

/** 申請書に入らないもの・まだ入っていない欄（空欄のまま作ってよい。画面で知らせる） */
export function shinseiChecks(sale: Sale, s: Settings): {missing: string[]; overflow: string} {
  const form = shinseiForm(sale.insurer);
  const v = shinseiValues(sale, s);
  const missing: string[] = [];
  const need = (ok: unknown, label: string) => !ok && missing.push(label);
  need(v.name, 'お客様名');
  need(v.kana, 'フリガナ');
  need(v.insuredNo, '被保険者番号');
  const kouiki = form?.key === 'kouiki';
  // 福岡市・北九州市の様式には性別・郵便番号・要介護状態区分・記載者の欄がない（北九州市は生年月日の欄もない）。販売事業者（受任者）の事業者番号を書く
  const seller = form?.key === 'fukuoka' || form?.key === 'kitakyushu';
  if (form?.key !== 'kitakyushu') need(v.birth, '生年月日');
  if (!seller) need(v.gender, '性別');
  if (!seller) need(v.zip, '郵便番号');
  need(v.address, '住所');
  need(v.tel, '電話');
  if (!kouiki && !seller) need(v.care, '要介護度'); // 広域連合の様式には要介護状態区分の欄がない
  need(v.items.length, '商品');
  const noReason = v.items.filter((i) => !i.reason).length;
  if (v.items.length && noReason) missing.push(noReason === v.items.length ? '福祉用具が必要な理由' : `福祉用具が必要な理由（${noReason}つ）`);
  // 広域連合は「居宅の事業所名」だけ（ケアマネジャーは署名の欄なので書かない）
  if (kouiki) need(v.office, '居宅介護支援事業所（居宅の事業所名）');
  else if (seller) need(v.seller.providerNo.length === 10, '販売事業者の事業者番号（10けた）');
  else need(v.recorder, '居宅介護支援事業所・ケアマネジャー（理由の記載者）');
  need(v.ratioSet, '負担割合');
  if (form?.key === 'miyako' || kouiki) need(v.carePlan, '居宅サービス計画の届出（有・無）');
  const overflow = form && v.items.length > form.rows ? `${form.title}の申請書の商品の欄は${form.rows}行です。${form.rows + 1}つ目からの商品（${v.items.slice(form.rows).map((i) => i.product).join('、')}）は入りません。` : '';
  return {missing, overflow};
}
