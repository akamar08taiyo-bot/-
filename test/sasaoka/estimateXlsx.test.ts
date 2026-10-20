import assert from 'node:assert/strict';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {estimateTotals} from '../../src/sasaoka/calc.ts';
import {defaultSettings} from '../../src/sasaoka/defaults.ts';
import {estimateFileName, estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import type {Job, Place, Row} from '../../src/sasaoka/types.ts';
import {readXlsx} from '../../src/sasaoka/xlsx.ts';
import {colName, SheetBuilder, writeXlsx} from '../../src/sasaoka/xlsxWrite.ts';

let seq = 0;
const blank = {refId: null, code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
const mat = (name: string, listPrice: number, extra: Partial<Row> = {}): Row => ({...blank, id: `r${++seq}`, kind: 'material', name, qty: 1, listPrice, ...extra});
const lab = (price: number, qty = 1): Row => ({...blank, id: `r${++seq}`, kind: 'labor', name: '木', price, qty});
const place = (name: string, rows: Row[], extra: Partial<Place> = {}): Place => ({id: `p${++seq}`, name, rows, kind: 1, photo: 0, ...extra});

const S = {...defaultSettings(), staffList: ['久保 匠史']};

function job(extra: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    month: '2026-10',
    customer: '山田',
    suffix: '様邸',
    staff: '久保 匠史',
    date: '',
    address: '福岡県行橋市東大橋2-1-7',
    note: '',
    insuredNo: '0123456789',
    form: '',
    overhead: null,
    overheadTarget: null,
    shikiri: true,
    places: [
      place('勝手口', [
        mat('NTディンプルパイプ', 14400, {maker: '矢崎化工', code: 'HCDT-4000', lengthCm: 280, pieceLengthM: 4}), // 0.7本×11,520＝8,064
        mat('NT屋外支柱', 4600, {maker: '矢崎化工', qty: 4, unit: '本'}), // 4×3,680＝14,720
        lab(5000),
        lab(1000, 2), // 同上施工費 7,000（広域連合用は 2.8時間×2,500円）
      ]),
      place('玄関', [
        mat('木の手すり', 9000, {lengthCm: 100, pieceLengthM: 3}), // 1m÷3m：数量は 0.333 と書くが、金額は 7,200÷3＝2,400
        mat('エアコン移設', 20000, {excluded: true, unit: '式'}), // 介護保険の対象外 16,000
      ], {kind: 2}),
    ],
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

// ---------------------------------------------------------------- .xlsx の中を見る道具

type Cell = {v?: number | string; f?: string; s: number};

function open(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const xml = (p: string) => strFromU8(files[p]);
  const sheet = xml('xl/worksheets/sheet1.xml');
  const styles = xml('xl/styles.xml');
  const cells = new Map<string, Cell>();
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?( t="inlineStr")?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, s, str, inner = ''] = m;
    const f = /<f>([\s\S]*?)<\/f>/.exec(inner)?.[1];
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1];
    cells.set(ref, {s: Number(s ?? 0), f, v: str ? t?.replace(/&amp;/g, '&') : v !== undefined ? Number(v) : undefined});
  }
  const borders = [...styles.matchAll(/<border>([\s\S]*?)<\/border>/g)].map((m) => m[1]);
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)![1];
  const xfBorder = [...cellXfs.matchAll(/borderId="(\d+)"/g)].map((m) => Number(m[1]));
  /** マスの罫線（l・r・t・b → 'thin' | 'medium' | ''） */
  const border = (ref: string) => {
    const b = borders[xfBorder[cells.get(ref)?.s ?? 0]] ?? '';
    const side = (tag: string) => new RegExp(`<${tag} style="(\\w+)"`).exec(b)?.[1] ?? '';
    return {l: side('left'), r: side('right'), t: side('top'), b: side('bottom')};
  };
  const text = (ref: string) => cells.get(ref)?.v;
  return {sheet, cells, border, text, files};
}

/** Excel と同じように式を計算する（ROUNDDOWN・SUM・足し算・掛け算・マスの参照）。式が書いてあるとおりの答えになるか確かめる */
function evaluate(cells: Map<string, Cell>, ref: string): number {
  const c = cells.get(ref);
  if (!c) return 0;
  if (!c.f) return typeof c.v === 'number' ? c.v : 0;
  const cols = (a: string) => [...a].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const range = (r: string) => {
    const [a, b] = r.split(':');
    const [, ca, ra] = /([A-Z]+)(\d+)/.exec(a)!;
    const [, cb, rb] = /([A-Z]+)(\d+)/.exec(b ?? a)!;
    let sum = 0;
    for (let row = Number(ra); row <= Number(rb); row++) for (let col = cols(ca); col <= cols(cb); col++) sum += evaluate(cells, `${colName(col - 1)}${row}`);
    return sum;
  };
  const expr = c.f
    .replace(/SUM\(([^)]*)\)/g, (_, args: string) => `(${args.split(',').map(range).join('+')})`)
    .replace(/ROUNDDOWN\(/g, 'RD(')
    .replace(/\b([A-Z]+\d+)\b/g, (r) => `(${evaluate(cells, r)})`);
  // Excel は15けたで丸めてから切り捨てる
  return Function('RD', `return ${expr}`)((x: number) => Math.trunc(Math.round(x * 1e6) / 1e6));
}

// ---------------------------------------------------------------- 苅田町・行橋市・みやこ町用

test('Excel（苅田町・行橋市・みやこ町用）：印刷と同じ欄に同じ文字・数字。ファイル名は 書式_お客様名様_作成日', () => {
  const j = job();
  const {bytes, fileName} = estimateXlsx(j, S, '2026-10-20');
  assert.equal(fileName, '工事費見積書兼工事費内訳書_山田様_2026-10-20.xlsx');
  const x = open(bytes);
  assert.equal(x.text('A1'), '①　工事費見積書兼工事費内訳書');
  assert.equal(x.text('A3'), '山田');
  assert.equal(x.text('C3'), '様邸　住宅改修');
  assert.equal(x.text('A4'), '介護保険被保険者番号（0123456789）');
  assert.equal(x.text('B5'), '福岡県行橋市東大橋2-1-7');
  assert.match(String(x.text('H2')), /^住　　　所　.+\n施工業者名　太陽シルバーサービス\(株\)行橋営業所\n代表者名　行橋営業所所長　.+\n担当者・電話番号　担当： 久保 匠史　/);
  // 作成日は右上（ヘッダー）、ページ番号は下（フッター）
  assert.ok(x.sheet.includes('<oddHeader>&amp;R作成日　令和8年10月20日</oddHeader>'));
  assert.ok(x.sheet.includes('<oddFooter>&amp;Cページ　&amp;P　／　&amp;N</oddFooter>'));
  // 明細（9行目から）：改修内容・改修場所（写真No.）・内容・数量・単位・単価・金額・介護保険対象部分・対象外金額・備考
  const row = (r: number) => 'ABCDEFGHIJKLM'.split('').map((c) => x.text(`${c}${r}`) ?? '');
  assert.deepEqual(row(9), ['手すりの取付', '①勝手口', '矢崎化工 HCDT-4000 NTディンプルパイプ', 0.7, '本', 11520, 8064, 0.7, '本', 11520, 8064, '', '定価14,400円（4m）×0.8\n2800÷4000＝0.7']);
  assert.deepEqual(row(11), ['', '', '同上施工費', 1, '式', 7000, 7000, 1, '式', 7000, 7000, '', '']);
  assert.deepEqual(row(12).slice(0, 7), ['段差の解消', '②玄関', '木の手すり', 0.333, '本', 7200, 2400]);
  assert.deepEqual(row(13), ['', '', 'エアコン移設', 1, '式', 16000, 16000, '', '', '', '', 16000, '定価20,000円（税抜）×0.8']);
  // 合計の欄（最後の4行）：小計・諸経費・消費税・合計。全体と介護保険の対象
  const t = estimateTotals(j, S);
  assert.deepEqual([23, 24, 25, 26].map((r) => [x.text(`C${r}`), x.text(`G${r}`), x.text(`K${r}`)]), [
    ['小計', t.all.subtotal, t.target.subtotal],
    ['諸経費', t.all.overhead, t.target.overhead],
    ['消費税', t.all.tax, t.target.tax],
    ['合計', t.all.total, t.target.total],
  ]);
  assert.deepEqual([t.all.subtotal, t.all.total, t.target.total], [48184, 58302, 38942]); // 対象：48,184−16,000＝32,184
  // 表として読める（取り込みの読み取りでも、お客様名と合計が読める）
  const grid = readXlsx(bytes)[0];
  assert.equal(grid.name, '山田様');
  assert.ok(grid.rows.some((r) => r.includes('合計') && r.includes('58302')));
});

test('Excel の金額は式：数量・単価を直せば計算し直される。式の答えはアプリの金額と同じ（同じにならない行は数字のまま）', () => {
  const x = open(estimateXlsx(job(), S, '2026-10-20').bytes);
  assert.equal(x.cells.get('G9')?.f, 'ROUNDDOWN(D9*F9,0)');
  assert.equal(x.cells.get('K9')?.f, 'G9'); // 介護保険対象部分は左と同じ
  assert.equal(x.cells.get('H9')?.f, 'D9');
  assert.equal(x.cells.get('J9')?.f, 'F9');
  assert.equal(x.cells.get('L13')?.f, 'G13'); // 対象外金額
  assert.equal(x.cells.get('G12')?.f, undefined); // 0.333×7,200＝2,397 にならないよう、2,400 をそのまま書く
  assert.equal(x.cells.get('G23')?.f, 'SUM(G9:G22)');
  assert.equal(x.cells.get('G24')?.f, `ROUNDDOWN(G23*${S.estimateOverheadRate},0)`);
  assert.equal(x.cells.get('G25')?.f, `ROUNDDOWN((G23+G24)*${S.taxRate},0)`);
  assert.equal(x.cells.get('G26')?.f, 'G23+G24+G25');
  // すべての式を計算し直して、書いてある数字（アプリの金額）と同じになる
  let n = 0;
  for (const [ref, c] of x.cells) {
    if (!c.f) continue;
    assert.equal(evaluate(x.cells, ref), c.v, `${ref} =${c.f}`);
    n++;
  }
  assert.ok(n >= 25, `式の数 ${n}`);
});

test('諸経費を手で直した見積書は、その金額をそのまま書く（式にしない）', () => {
  const x = open(estimateXlsx(job({overhead: 5000, overheadTarget: 3000}), S, '2026-10-20').bytes);
  assert.equal(x.text('G24'), 5000);
  assert.equal(x.cells.get('G24')?.f, undefined);
  assert.equal(x.text('K24'), 3000); // 対象外の行があるので、介護保険の対象は overheadTarget
  assert.equal(x.cells.get('K24')?.f, undefined);
  for (const [ref, c] of x.cells) if (c.f) assert.equal(evaluate(x.cells, ref), c.v, `${ref} =${c.f}`);
});

test('Excel の罫線・列の幅・印刷の設定は印刷の見積書と同じ（数量と単位の間は線なし・金額の右は太い線・A4横）', () => {
  const x = open(estimateXlsx(job(), S, '2026-10-20').bytes);
  assert.deepEqual(x.border('D10'), {l: 'thin', r: '', t: 'thin', b: 'thin'}); // 数量（右の線なし）
  assert.deepEqual(x.border('E10'), {l: '', r: 'thin', t: 'thin', b: 'thin'}); // 単位（左の線なし）
  assert.deepEqual(x.border('G10'), {l: 'thin', r: 'medium', t: 'thin', b: 'thin'}); // 金額の右は太い線
  assert.equal(x.border('H10').l, 'medium'); // となりのマスにも同じ線
  assert.equal(x.border('A10').l, 'medium'); // 表の左
  assert.equal(x.border('A7').t, 'medium'); // 見出しの上
  assert.equal(x.border('D9').t, 'medium'); // 見出しの下（明細の1行目の上）
  assert.equal(x.border('B7').b, ''); // 結合した見出し（7・8行目）の中の線は引かない
  assert.equal(x.border('B8').b, 'medium');
  assert.equal(x.border('M26').b, 'medium'); // 表のいちばん下
  assert.deepEqual(x.border('A3'), {l: '', r: '', t: '', b: 'thin'}); // お客様名の下線
  assert.ok(x.sheet.includes('<mergeCell ref="A3:B3"/>'));
  assert.ok(x.sheet.includes('<mergeCell ref="H2:M5"/>'));
  // 列の幅（A 31.1mm ＝ 117.5px ÷ 8px）・行の高さ（明細 5.77mm ＝ 16.36pt）
  assert.ok(x.sheet.includes('<col min="1" max="1" width="14.69" customWidth="1"/>'));
  assert.ok(x.sheet.includes('<row r="9" ht="16.36" customHeight="1">'));
  assert.ok(/<pageSetup paperSize="9" scale="\d+" orientation="landscape"\/>/.test(x.sheet));
  assert.ok(!x.sheet.includes('fitToPage')); // 「1ページに合わせる」にすると改ページが使われない
  assert.ok(x.sheet.includes('showGridLines="0"'));
  const styles = strFromU8(x.files['xl/styles.xml']);
  assert.ok(styles.includes('<name val="ＭＳ Ｐゴシック"/>'));
  assert.ok(styles.includes('<numFmt') === false && styles.includes('numFmtId="3"')); // 金額は #,##0（組み込みの3番）
});

test('Excel：1ページ18行に入らなければ、印刷と同じところで改ページ（合計は最後のページ）', () => {
  const many = Array.from({length: 16}, (_, i) => mat(`ブラケット ${i + 1}`, 2000 + i * 10, {unit: '個', qty: 2}));
  const j = job({places: [...job().places, place('廊下', many)]});
  const x = open(estimateXlsx(j, S, '2026-10-20').bytes);
  // 1ページ目に6行、廊下の16行は2ページ目、合計は入らないので3ページ目（印刷の見積書と同じ）
  assert.ok(x.sheet.includes('<rowBreaks count="2" manualBreakCount="2"><brk id="26" max="16383" man="1"/><brk id="52" max="16383" man="1"/></rowBreaks>'));
  assert.equal(x.text('A27'), '①　工事費見積書兼工事費内訳書'); // どのページにも見出し
  assert.equal(x.text('A30'), undefined); // 被保険者番号・施工業者は1ページ目だけ
  assert.equal(x.text('H28'), undefined);
  assert.equal(x.text('B35'), '③廊下');
  assert.equal(x.text('C75'), '小計');
  assert.equal(x.cells.get('G75')?.f, 'SUM(G9:G26,G35:G52,G61:G74)');
  for (const [ref, c] of x.cells) if (c.f) assert.equal(evaluate(x.cells, ref), c.v, `${ref} =${c.f}`);
  assert.equal(x.text('G78'), estimateTotals(j, S).all.total);
});

// ---------------------------------------------------------------- 広域連合用

test('Excel（広域連合用）：施工費は 時間×2,500円、算出根拠、対象工事部分（対象外の行は空）、Ｐ－1、フッター', () => {
  const j = job({form: 'kouiki'});
  const {bytes, fileName} = estimateXlsx(j, S, '2026-10-20');
  assert.equal(fileName, '住宅改修内訳明細書_山田様_2026-10-20.xlsx');
  const x = open(bytes);
  assert.equal(x.text('A1'), '内訳書　様式');
  assert.equal(x.text('K3'), '対象工事部分');
  const row = (r: number) => 'ABCDEFGHIJKLMNOPQ'.split('').map((c) => x.text(`${c}${r}`) ?? '');
  assert.deepEqual(row(5), ['勝手口', '手すり取付', '材', '矢崎化工 HCDT-4000 NTディンプルパイプ', '', 0.7, '本', 11520, 8064, '', '①', '①', 0.7, '本', 11520, 8064, '定価14,400円（4m）×0.8\n2800÷4000＝0.7']);
  assert.deepEqual(row(7), ['', '', '手', '同上施工費', '', 2.8, '時間', 2500, 7000, '', '', '', 2.8, '時間', 2500, 7000, '1時間2,500円']);
  assert.deepEqual(row(9), ['', '', '材', 'エアコン移設', '', 1, '式', 16000, 16000, '', '', '', '', '', '', '', '']); // 対象外
  assert.equal(x.cells.get('I7')?.f, 'ROUNDDOWN(F7*H7,0)'); // 2.8時間×2,500円
  assert.equal(x.cells.get('P7')?.f, 'I7');
  const t = estimateTotals(j, S);
  assert.deepEqual([15, 16, 17, 18].map((r) => [x.text(`D${r}`), x.text(`I${r}`), x.text(`P${r}`)]), [
    ['小計', t.all.subtotal, t.target.subtotal],
    ['諸経費', t.all.overhead, t.target.overhead],
    ['消費税', t.all.tax, t.target.tax],
    ['合計', t.all.total, t.target.total],
  ]);
  assert.deepEqual([x.text('F17'), x.text('G17'), x.text('M17'), x.text('N17')], [10, '％', 10, '％']); // 消費税の率
  assert.equal(x.text('P19'), 'Ｐ－1');
  assert.ok(String(x.text('B20')).startsWith('※介護保険対象にならない部分を含む時は'));
  assert.ok(x.sheet.includes('<oddFooter>&amp;L&amp;9福岡県介護保険広域連合&amp;R&amp;9 2021.4</oddFooter>'));
  assert.deepEqual(x.border('E6'), {l: 'medium', r: 'medium', t: 'thin', b: 'thin'}); // 二重線のすき間
  for (const [ref, c] of x.cells) if (c.f) assert.equal(evaluate(x.cells, ref), c.v, `${ref} =${c.f}`);
  const styles = strFromU8(x.files['xl/styles.xml']);
  assert.ok(styles.includes('<name val="ＭＳ Ｐ明朝"/>')); // 本文は明朝、数字はゴシック
});

test('ファイル名：お客様名がなければ「お客様」、ファイル名に使えない文字は _ にする。作成日がなければ日付を付けない', () => {
  assert.equal(estimateFileName(job({customer: ''}), S, '2026-10-20'), '工事費見積書兼工事費内訳書_お客様様_2026-10-20.xlsx');
  assert.equal(estimateFileName(job({customer: '山田/佐藤', form: 'kouiki'}), S, ''), '住宅改修内訳明細書_山田_佐藤様.xlsx');
});

// ---------------------------------------------------------------- 書き出しの部品

test('xlsxWrite：列の名前・となり合うマスの罫線を1本にまとめる（線なし ＞ 太い線 ＞ 細い線）・結合したマスの外まわり', () => {
  assert.deepEqual([0, 25, 26, 27, 51, 52].map(colName), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  const b = new SheetBuilder();
  const r = b.row(5);
  b.put(r, 0, 'a', {}, {l: 'thin', r: 'medium', t: 'thin', b: 'thin'});
  b.put(r, 1, 'b', {}, {l: 'thin', r: 'hidden', t: 'thin', b: 'thin'});
  b.put(r, 2, 'c', {}, {l: 'thin', r: 'thin', t: 'thin', b: 'thin'});
  const r2 = b.row(5);
  b.put(r2, 0, 'merged', {}, {l: 'medium', r: 'medium', t: 'medium', b: 'medium'}, 1, 3);
  const sh = b.sheet({name: 's', cols: [10, 10, 10], landscape: true, margins: {l: 10, r: 10, t: 10, b: 10, header: 5, footer: 5}, font: {name: 'ＭＳ Ｐゴシック', size: 11}});
  const border = (row: number, col: number) => sh.rows[row].cells.get(col)?.s?.border;
  assert.deepEqual(border(0, 0), {l: 'thin', r: 'medium', t: 'thin', b: 'medium'}); // 下は、下の結合したマスの太い線
  assert.deepEqual(border(0, 1), {l: 'medium', r: undefined, t: 'thin', b: 'medium'}); // 右は hidden で線なし
  assert.deepEqual(border(0, 2), {l: undefined, r: 'thin', t: 'thin', b: 'medium'});
  assert.deepEqual(border(1, 1), {l: undefined, r: undefined, t: 'medium', b: 'medium'}); // 結合したマスの中の縦線はなし
  assert.deepEqual(sh.merges, [[1, 0, 1, 2]]);
  // 読み取りの部品で読み直せる（文字・数字）
  const grid = readXlsx(writeXlsx([sh]))[0];
  assert.deepEqual(grid.rows, [['a', 'b', 'c'], ['merged', '', '']]);
});
