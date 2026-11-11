import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateTotals, jobTotals} from '../../src/sasaoka/calc.ts';
import {formLines, offEstimate, photoNumbers, sheetNewLine} from '../../src/sasaoka/estimateForms.ts';
import {placeFromDims, withBrackets} from '../../src/sasaoka/cutLink.ts';
import {laborRow, manualRow, materialRow, newPlace, setLaborCount} from '../../src/sasaoka/rows.ts';
import {
  applySheet,
  clearedSheet,
  deleteLine,
  describeKey,
  dropEmptyPlaces,
  insertBeforeId,
  insertBlankAfter,
  insertBlankBefore,
  isEmptyPlace,
  laborCountAt,
  lineRows,
  parseKind,
  parseLengthCm,
  parseListNote,
  parseNum,
  parsePlace,
  pasteLines,
  setWorkAmount,
  sheetValue,
  splitPlaceAt,
  stepLaborAt,
  toggleExcluded,
  toolPlace,
  withGapRows,
} from '../../src/sasaoka/sheetEdit.ts';
import type {Job, Material, Place, Row, Settings} from '../../src/sasaoka/types.ts';

const S = {
  rate: 0.07,
  taxRate: 0.1,
  taxMode: 'original',
  invoiceTaxMode: 'perJob',
  totalTaxRounding: 'floor',
  estimateRate: 0.8,
  estimateLaborRate: 1.5,
  estimateOverheadRate: 0.1,
  estimateHourRate: 2500,
  estimateForm: 'yukuhashi',
} as const satisfies Pick<
  Settings,
  'rate' | 'taxRate' | 'taxMode' | 'invoiceTaxMode' | 'totalTaxRounding' | 'estimateRate' | 'estimateLaborRate' | 'estimateOverheadRate' | 'estimateHourRate' | 'estimateForm'
>;
const yk = {settings: S, form: 'yukuhashi'} as const;
const kk = {settings: S, form: 'kouiki'} as const;

const emptyJob = (): Job => ({
  id: 'j1', month: '2026-10', customer: '', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null, shikiri: true,
  places: [], createdAt: 1, updatedAt: 1,
});
const rail: Material = {id: 'm1', name: '木の手すり 35φ 4m', price: 10000, listPrice: 20000, pieceLengthM: 4, maker: 'サンプル', code: 'S-TS35', unit: '本', favorite: true, updatedAt: 1};
const bar: Material = {id: 'm2', name: 'インテリアバー', price: 5600, listPrice: 8000, pieceLengthM: 0, maker: 'TOTO', code: 'TS136GY6', unit: '本', favorite: false, updatedAt: 1};

/** 欄に順に打ち込む（いちばん下の行に入れたら、その行の欄に続けて入れる） */
function type(job: Job, steps: [string, string, Material?][], ctx: {settings: typeof S; form: 'yukuhashi' | 'kouiki'} = yk): {job: Job; keys: (string | null)[]} {
  const keys: (string | null)[] = [];
  let j = job;
  let last: string | null = null;
  for (const [key, value, pick] of steps) {
    const k = key.replace('@', last?.split(':')[1] ?? '');
    const res = applySheet(j, k, value, {...ctx, pick: pick ?? null});
    j = res.job;
    last = res.key;
    keys.push(res.key);
  }
  return {job: j, keys};
}

test('打ち込んだ文字を読む：数字・長さ・定価・改修の種類・箇所名と写真番号', () => {
  assert.equal(parseNum('3,800'), 3800);
  assert.equal(parseNum('￥３８００円'), 3800);
  assert.equal(parseNum('定価8000'), 8000);
  assert.equal(parseNum('abc'), null);
  assert.equal(parseNum(''), null);
  assert.equal(parseLengthCm('60cm'), 60);
  assert.equal(parseLengthCm('600mm'), 60);
  assert.equal(parseLengthCm('0.6m'), 60);
  assert.equal(parseLengthCm('６０ｃｍ'), 60);
  assert.equal(parseLengthCm('60'), null);
  assert.deepEqual(parseListNote('8000'), {list: 8000, pieceM: null, rate: null});
  assert.deepEqual(parseListNote('定価8,000円（税抜）×0.8'), {list: 8000, pieceM: null, rate: 0.8});
  assert.deepEqual(parseListNote('定価20,000円（4m）×0.8'), {list: 20000, pieceM: 4, rate: 0.8});
  assert.deepEqual(parseListNote('定価8,000円（税抜）×０．７'), {list: 8000, pieceM: null, rate: 0.7}); // 全角でも
  assert.deepEqual(parseListNote('定価：￥24,300'), {list: 24300, pieceM: null, rate: null});
  assert.equal(parseListNote('ご支給品'), null);
  assert.equal(parseKind('2'), 2);
  assert.equal(parseKind('⑤'), 5);
  assert.equal(parseKind('①手すりの取付'), 1);
  assert.equal(parseKind('①手すりの取り付け'), 1); // 今の書き方（上は前の書き方）
  assert.equal(parseKind('段差解消'), 2);
  assert.equal(parseKind('便器'), 5);
  assert.equal(parseKind('なにか'), null);
  assert.deepEqual(parsePlace('浴室③'), {name: '浴室', photo: 3});
  assert.deepEqual(parsePlace('①勝手口'), {name: '勝手口', photo: 1}); // 写真番号を先に打っても
  assert.deepEqual(parsePlace('② 浴室'), {name: '浴室', photo: 2});
  assert.deepEqual(parsePlace('浴室(12)'), {name: '浴室', photo: 12});
  assert.deepEqual(parsePlace('玄関'), {name: '玄関', photo: null});
});

test('いちばん下の行に打ち込むと、箇所と行が増える（Excel と同じ順に：改修内容 → 改修場所 → 内容 → 数量 → 単価 → 備考）', () => {
  const {job, keys} = type(emptyJob(), [
    ['new:work', '1'],
    ['new:name', '浴室'],
    ['new:text', 'インテリアバー', bar], // 部材リストから選ぶ → 仕切価格・定価も入る
    ['line:@:qty', '2'],
  ]);
  assert.deepEqual(keys, ['new:work', 'new:name', `line:${job.places[0].rows[0].id}:text`, `line:${job.places[0].rows[0].id}:qty`]);
  assert.equal(job.places.length, 1);
  assert.deepEqual([job.places[0].name, job.places[0].kind], ['浴室', 1]);
  const r = job.places[0].rows[0];
  assert.deepEqual([r.kind, r.refId, r.name, r.maker, r.code, r.price, r.listPrice, r.qty], ['material', 'm2', 'インテリアバー', 'TOTO', 'TS136GY6', 5600, 8000, 2]);
  // 見積：単価 8,000×0.8＝6,400 × 2本。仕切り計算表：仕切価格 5,600 × 2本（同じ行から）
  const [line] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([line.unitPrice, line.amount], [6400, 12800]);
  assert.equal(jobTotals(job, S).material, 11200);
});

test('備考に定価を入れると、単価は 定価×0.8（数式と同じ）。手で入れた単価・備考の文字・消すとき', () => {
  let {job} = type(emptyJob(), [
    ['new:name', 'トイレ'],
    ['new:text', 'L型手すり'],
  ]);
  const id = job.places[0].rows[0].id;
  ({job} = type(job, [[`line:${id}:note`, '11000']]));
  let [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.listPrice, l.unitPrice, l.rate], [11000, 8800, 0.8]);
  // 欄を選ぶと、見積書に出ている備考の全文（定価の数字だけではない。ユーザーの指摘、2026-10-22）
  assert.equal(sheetValue(job, `line:${id}:note`, yk), '定価11,000円（税抜）×0.8');
  // そのまま確定しても自動の文のまま（手で直した備考にしない）
  ({job} = type(job, [[`line:${id}:note`, '定価11,000円（税抜）×0.8']]));
  assert.equal(job.places[0].rows[0].estNote, null);
  // 単価を手で入れる → 備考の率は 単価÷定価（「単価の金額を変更すると、例 備考欄の0.8が0.7になったり、0.6になったり逆な連動したりする」2026-10-27）。
  // 定価×率で割り切れない単価は率を書かない。定価×0.8 と同じ金額を入れたら自動のまま
  ({job} = type(job, [[`line:${id}:price`, '7700']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.unitPrice, l.rate], [7700, 0.7]);
  assert.equal(sheetValue(job, `line:${id}:note`, yk), '定価11,000円（税抜）×0.7');
  ({job} = type(job, [[`line:${id}:price`, '8000']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.unitPrice, l.rate], [8000, null]);
  ({job} = type(job, [[`line:${id}:price`, '8800']]));
  assert.equal(job.places[0].rows[0].estPrice, null);
  // 逆に、備考の率を直すと単価が 定価×率 になる（0.6 → 6,600円）。設定の率（0.8）に戻すと自動の単価
  ({job} = type(job, [[`line:${id}:note`, '定価11,000円（税抜）×0.6']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.unitPrice, l.rate, l.amount, job.places[0].rows[0].estNote], [6600, 0.6, 6600, null]);
  ({job} = type(job, [[`line:${id}:note`, '定価11,000円（税抜）×0.8']]));
  assert.deepEqual([job.places[0].rows[0].estPrice, formLines(job, S, 'yukuhashi')[0].unitPrice], [null, 8800]);
  // 定価をもう一度入れると、手で入れた単価はやめて 定価×0.8
  ({job} = type(job, [[`line:${id}:price`, '7000'], [`line:${id}:note`, '定価12,000円（税抜）×0.8']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.listPrice, l.unitPrice], [12000, 9600]);
  // 定価でない文字はそのまま備考に。消すと（Delete）手で書いた備考は自動の文に戻り、もう一度消すと備考を出さない。定価・単価は変えない
  // （前は消すと定価がなくなり、単価が仕切×率に下がって、備考には仕切から逆算した定価が出た。2026-11-08 のデバッグ）
  ({job} = type(job, [[`line:${id}:note`, 'ご支給品']]));
  assert.equal(job.places[0].rows[0].estNote, 'ご支給品');
  ({job} = type(job, [[`line:${id}:note`, '']]));
  assert.deepEqual([job.places[0].rows[0].listPrice, job.places[0].rows[0].estNote], [12000, null]);
  ({job} = type(job, [[`line:${id}:note`, '']]));
  assert.deepEqual([job.places[0].rows[0].listPrice, job.places[0].rows[0].estNote, formLines(job, S, 'yukuhashi')[0].unitPrice], [12000, '', 9600]);
});

test('切って使う手すり：数量に 0.15 や 60cm を入れると 使う長さ÷1本の長さ。整数なら本数', () => {
  let {job} = type(emptyJob(), [['new:text', '木の手すり 35φ 4m', rail]]);
  const id = job.places[0].rows[0].id;
  ({job} = type(job, [[`line:${id}:qty`, '0.15']]));
  let r: Row = job.places[0].rows[0];
  assert.deepEqual([r.lengthCm, r.pieceLengthM, r.qty], [60, 4, 1]);
  let [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.qty, l.unit, l.unitPrice, l.amount, l.cut], [0.15, '本', 16000, 2400, '600mm÷4000mm＝0.15']);
  // 仕切り計算表も同じ 0.15本（仕切価格 10,000×0.15）
  assert.equal(jobTotals(job, S).material, 1500);
  ({job} = type(job, [[`line:${id}:qty`, '90cm']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.qty, l.amount], [0.225, 3600]);
  ({job} = type(job, [[`line:${id}:qty`, '2']]));
  r = job.places[0].rows[0];
  assert.deepEqual([r.lengthCm, r.qty], [0, 2]);
  // 仕切り計算表は本数のまま（1本 10,000 × 2）
  assert.equal(jobTotals(job, S).material, 20000);
  // 品名だけの部材：数量 0.15 を先に入れて、あとで備考に「20000(4m)」と入れても 600mm÷4000mm＝0.15 になる
  ({job} = type(job, [['new:text', '屋外用手すり'], ['line:@:qty', '0.15'], ['line:@:note', '20000(4m)']]));
  r = job.places[0].rows[1];
  assert.deepEqual([r.lengthCm, r.pieceLengthM, r.qty], [60, 4, 1]);
  [, l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.qty, l.unitPrice, l.amount, l.cut], [0.15, 16000, 2400, '600mm÷4000mm＝0.15']);
  // 欄を選ぶと2行とも出る。そのまま確定しても、1行目の定価だけ直しても、2行目は自動の計算のまま
  const key = `line:${r.id}:note`;
  assert.equal(sheetValue(job, key, yk), '定価20,000円（4m）×0.8\n600mm÷4000mm＝0.15');
  ({job} = type(job, [[key, '定価20,000円（4m）×0.8\n600mm÷4000mm＝0.15']]));
  assert.equal(job.places[0].rows[1].estNote, null);
  ({job} = type(job, [[key, '定価25,000円（4m）×0.8\n600mm÷4000mm=0.15']]));
  r = job.places[0].rows[1];
  assert.deepEqual([r.listPrice, r.estNote], [25000, null]);
  // 2行目を書きかえたら、手で直した備考
  ({job} = type(job, [[key, '定価25,000円（4m）×0.8\n現場で切る']]));
  assert.equal(job.places[0].rows[1].estNote, '定価25,000円（4m）×0.8\n現場で切る');
  assert.equal(sheetValue(job, key, yk), '定価25,000円（4m）×0.8\n現場で切る');
});

test('施工費：内容に「同上施工費」と入れて単価を入れる → 取付手間の行になり、仕切り計算表の取付手間も最初は同じ金額。そのあと見積で直しても仕切りは変えない', () => {
  const {job} = type(emptyJob(), [
    ['new:name', '玄関'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
  ]);
  const rows = job.places[0].rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.price, r.qty, r.estPrice]), [['material', 5600, 1, null], ['labor', 2000, 1, 2000]]);
  const lines = formLines(job, S, 'yukuhashi');
  assert.deepEqual(lines.map((l) => [l.text, l.qty, l.unit, l.amount]), [['TOTO TS136GY6 インテリアバー', 1, '本', 6400], ['同上施工費', 1, '式', 2000]]);
  assert.deepEqual([estimateTotals(job, S).work, jobTotals(job, S).labor], [2000, 2000]);
  // 広域連合用は時間で：数量に 1.2（時間）→ 1.2×2,500＝3,000円。仕切り（笹岡工務店）は 2,000円のまま
  const head = rows[1].id;
  const k = applySheet(job, `line:${head}:qty`, '1.2', kk).job;
  assert.deepEqual([formLines(k, S, 'kouiki')[1].qty, formLines(k, S, 'kouiki')[1].amount, jobTotals(k, S).labor], [1.2, 3000, 2000]);
});

test('金額の欄も直せる：施工費はその金額（仕切り計算表はそのまま）、部材は 金額÷数量 を単価に（割り切れなくても金額はちょうど）。出ている金額のまま・空のとき', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '階段'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
    ['new:text', '木の手すり', rail],
    ['line:@:qty', '0.15'],
  ]);
  const [mat, lab, cut] = job.places[0].rows.map((r) => r.id);
  job = applySheet(job, `line:${lab}:amount`, '3,000', yk).job;
  job = applySheet(job, `line:${mat}:qty`, '3', yk).job;
  job = applySheet(job, `line:${mat}:amount`, '１００００', yk).job; // 全角でも
  job = applySheet(job, `line:${cut}:amount`, '3000', yk).job;
  const lines = formLines(job, S, 'yukuhashi');
  assert.deepEqual(lines.map((l) => [l.qty, Math.round(l.unitPrice), l.amount]), [[3, 3333, 10000], [1, 3000, 3000], [0.15, 20000, 3000]]);
  assert.equal(jobTotals(job, S).labor, 2000); // 仕切り計算表の取付手間は変えない
  assert.deepEqual([`line:${lab}:amount`, `line:${mat}:amount`].map((k) => sheetValue(job, k, yk)), ['3000', '10000']);
  // Excel の ROUNDDOWN(数量×単価) でも同じ金額になる単価（3×3333.333334＝10000.000002）
  assert.equal(Math.floor(3 * job.places[0].rows[0].estPrice!), 10000);
  // 出ている金額のまま確定しても単価を書きかえない。空にすると自動（定価8,000×0.8＝6,400円×3）に戻す
  assert.equal(applySheet(job, `line:${mat}:amount`, '10,000', yk).job, job);
  assert.equal(formLines(applySheet(job, `line:${mat}:amount`, '', yk).job, S, 'yukuhashi')[0].amount, 19200);
  assert.equal(formLines(applySheet(job, `line:${lab}:amount`, '', yk).job, S, 'yukuhashi')[1].amount, 2000);
  // 金額に数字でないもの・数量が0の行は何もしない
  assert.equal(applySheet(job, `line:${mat}:amount`, 'あ', yk).job, job);
});

test('見積書で金額を直した施工費に、部材を選ぶ画面で施工費を足す・減らすと、そのまとまりは自動の金額に戻る（足した施工費が入らなかった）', () => {
  const wood = {id: 'k1', name: '木', price: 1000, estPrice: 1500} as Parameters<typeof setLaborCount>[1];
  const tile = {id: 'k2', name: 'タイル', price: 1500, estPrice: 2000} as Parameters<typeof setLaborCount>[1];
  let {job} = type(emptyJob(), [['new:name', '階段'], ['new:text', 'インテリアバー', bar]]);
  const put = (j: Job, rows: Row[]): Job => ({...j, places: [{...j.places[0], rows}]});
  job = put(job, setLaborCount(job.places[0].rows, wood, 2));
  const lab = job.places[0].rows[1].id;
  job = applySheet(job, `line:${lab}:amount`, '2800', yk).job;
  const amounts = (j: Job) => formLines(j, S, 'yukuhashi').map((l) => l.amount);
  assert.deepEqual(amounts(job), [6400, 2800]);
  assert.deepEqual(amounts(put(job, setLaborCount(job.places[0].rows, tile, 1))), [6400, 5000]); // 木 2×1,500＋タイル 2,000
  assert.deepEqual(amounts(put(job, setLaborCount(job.places[0].rows, wood, 1))), [6400, 1500]);
  // ほかの手すりの施工費（別のまとまり）の直した金額は残す
  let two = put(job, [...job.places[0].rows, materialRow(bar), {...laborRow(wood, 1), estAmount: 1200}]);
  two = put(two, setLaborCount(two.places[0].rows.slice(), wood, 4)); // いちばん下の木に足す → 下のまとまりだけ自動に
  assert.deepEqual(amounts(two), [6400, 2800, 6400, 3000]);
});

test('部材の内容（品名）を消す（Delete）と、その部材を同上施工費ごと消す（品名だけ消えて「材料費」と数量・単価が残っていた）', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '玄関'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
    ['new:text', '木の手すり', rail],
  ]);
  const [mat, , second] = job.places[0].rows.map((r) => r.id);
  const res = applySheet(job, `line:${mat}:text`, '', yk);
  assert.deepEqual(formLines(res.job, S, 'yukuhashi').map((l) => l.text), ['サンプル S-TS35 木の手すり 35φ 4m']);
  assert.equal(res.key, `line:${second}:text`); // その位置に来た行を選ぶ
  assert.ok(!formLines(res.job, S, 'yukuhashi').some((l) => l.text === '材料費'));
  // 最後の部材を消すと見積書から箇所がなくなる（申請書の箇所には残る。2026-11-11）。選ぶのはいちばん下の行
  const last = applySheet(res.job, `line:${second}:text`, '', yk);
  assert.deepEqual([last.job.places.length, offEstimate(last.job.places[0]), last.key], [1, true, 'new:text']);
  assert.deepEqual(formLines(last.job, S, 'yukuhashi', {all: true}), []);
});

test('どこの欄か（describeKey）：「①階段 ／ 品名 ／ 欄の名前」。施工費は取り付ける手間の名前（木 など）', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '階段'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
  ]);
  const place = job.places[0];
  const [mat, lab] = place.rows.map((r) => r.id);
  assert.equal(describeKey(job, `line:${lab}:amount`, S), '①階段 ／ 同上施工費 ／ 金額');
  job = {...job, places: [{...place, rows: place.rows.map((r) => (r.id === lab ? {...r, name: '木'} : r))}]};
  assert.equal(describeKey(job, `line:${lab}:price`, S), '①階段 ／ 同上施工費（木） ／ 単価');
  assert.equal(describeKey(job, `line:${mat}:qty`, S), '①階段 ／ TOTO TS136GY6 インテリアバー ／ 数量');
  assert.equal(describeKey(job, `excl:${mat}`, S), '①階段 ／ TOTO TS136GY6 インテリアバー ／ 介護保険の対象／対象外');
  assert.equal(describeKey(job, `place:${place.id}:name`, S), '①階段 ／ 改修場所（箇所名）');
  assert.deepEqual(['new:text', 'job:customer', 'overhead:all', 'overhead:target', 'date'].map((k) => describeKey(job, k, S)), [
    'いちばん下の空いた行 ／ 内容（品名）',
    'お客様名',
    '諸経費',
    '諸経費（介護保険対象部分）',
    '作成日',
  ]);
  assert.equal(describeKey(job, 'line:nothing:price', S), '');
});

test('数えた取付手間（木 2箇所）の見積の金額を直す → 数えた行（仕切り計算表）はそのまま、見積の金額だけ。前の版の「施工費（調整）」は外す', () => {
  const lab = (price: number, qty: number, refId: string): Row => ({
    id: `l${refId}${qty}`, kind: 'labor', refId, name: '木', price, qty, code: '', maker: '', unit: '', listPrice: 0, lengthCm: 0, pieceLengthM: 0,
    estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null,
  });
  const rows: Row[] = [lab(1000, 2, 'k1')]; // 見積の単価がないので 仕切り 2,000×1.5＝3,000円
  const up = setWorkAmount(rows, 0, 3500, S);
  assert.deepEqual(up.map((r) => [r.name, r.price, r.qty, r.estAmount]), [['木', 1000, 2, 3500]]);
  assert.equal(setWorkAmount(up, 0, 3000, S)[0].estAmount, null); // 自動と同じ金額なら直した印を消す
  assert.equal(setWorkAmount(up, 0, null, S)[0].estAmount, null); // 空にしたら自動に戻す
  // 見積の単価がある手間（マスタで 1箇所 1,800円）は、見積の単価×箇所数が自動
  assert.equal(setWorkAmount([{...rows[0], estPrice: 1800}], 0, 3600, S)[0].estAmount, null);
  const old: Row[] = [lab(1000, 2, 'k1'), {...lab(500, 1, 'x'), refId: null, name: '施工費（調整）'}];
  assert.deepEqual(setWorkAmount(old, 0, 3200, S).map((r) => [r.name, r.price, r.estAmount]), [['木', 1000, 3200]]);
});

test('箇所の欄：改修場所に「浴室③」→ 名前と写真番号。改修内容に数字か名前。新しい箇所は下に足す（同じ名前でも別の箇所）', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '浴室'],
    ['new:text', 'インテリアバー', bar],
    ['new:name', '浴室'], // 行のある箇所のあとに打ち込むと、もう1つの浴室
    ['new:work', '段差'],
    ['new:text', 'すべり止め'],
  ]);
  assert.deepEqual(job.places.map((p) => [p.name, p.kind, p.rows.length]), [['浴室', 1, 1], ['浴室', 2, 1]]);
  const p2 = job.places[1].id;
  ({job} = type(job, [[`place:${p2}:name`, '浴室③']]));
  assert.deepEqual([job.places[1].name, job.places[1].photo], ['浴室', 3]);
  ({job} = type(job, [[`place:${p2}:work`, '⑤']]));
  assert.equal(job.places[1].kind, 5);
  assert.equal(sheetValue(job, `place:${p2}:work`, yk), '便器の取替');
});

test('介護保険の対象外を切り替える・お客様名などの欄・諸経費', () => {
  let {job} = type(emptyJob(), [['new:text', 'インテリアバー', bar], ['new:text', '同上施工費'], ['line:@:price', '2000']]);
  const id = job.places[0].rows[0].id;
  job = toggleExcluded(job, id);
  assert.equal(estimateTotals(job, S).excluded, 6400 + 2000); // 部材のすぐ下の施工費も対象外
  job = toggleExcluded(job, id);
  assert.equal(estimateTotals(job, S).excluded, 0);
  job = applySheet(job, 'job:customer', ' 山田 ', yk).job;
  assert.equal(job.customer, '山田');
  // 被保険者番号は確定したら右に詰めて、空いた左は 0（ユーザーの指示）
  job = applySheet(job, 'job:insuredNo', '366989', yk).job;
  assert.equal(job.insuredNo, '0000366989');
  job = applySheet(job, 'overhead:all', '800', yk).job;
  assert.equal(estimateTotals(job, S).all.overhead, 800);
  job = applySheet(job, 'overhead:all', '', yk).job;
  assert.equal(job.overhead, null);
  // 空のまま決めても行は増えない
  assert.equal(applySheet(job, 'new:qty', '', yk).job, job);
});

test('行を消す（行の左の✕消す・この行を消す）：部材は同上施工費ごと。箇所の行がなくなれば箇所も消える（最後の箇所も。その行が空白になる）', () => {
  let {job} = type(emptyJob(), [
    ['new:work', '1'],
    ['new:name', '玄関'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
    ['new:text', '木の手すり 35φ 4m', rail],
    ['new:name', 'トイレ'],
    ['new:text', 'インテリアバー', bar],
  ]);
  assert.deepEqual(job.places.map((p) => [p.name, p.rows.length]), [['玄関', 3], ['トイレ', 1]]);
  const [barRow, , railRow] = job.places[0].rows;
  // 部材の行を消すと、すぐ下の同上施工費も消える
  job = deleteLine(job, barRow.id);
  assert.deepEqual(job.places[0].rows.map((r) => r.id), [railRow.id]);
  // 最後の箇所の、ただ1つの行を消す → 見積書からは外れて、改修内容・改修場所も出ない。申請書の箇所には残る（2026-11-11）
  job = deleteLine(job, job.places[1].rows[0].id);
  assert.deepEqual(job.places.map((p) => [p.name, offEstimate(p)]), [['玄関', false], ['トイレ', true]]);
  assert.ok(formLines(job, S, 'yukuhashi').every((l) => l.placeName === '玄関'));
  // 残りの1行も消すと、見積書に箇所がなくなる（申請書には2つとも残る）
  job = deleteLine(job, railRow.id);
  assert.deepEqual(formLines(job, S, 'yukuhashi'), []);
  assert.deepEqual(job.places.map((p) => [p.name, p.rows.length, offEstimate(p)]), [['玄関', 0, true], ['トイレ', 0, true]]);
  assert.equal(deleteLine(job, 'no-such-row'), job);
  // 改修場所の名前も申請書の内容もない箇所は、どこにも出ないので消す
  const nameless: Job = {...emptyJob(), places: [newPlace('', [materialRow(bar, 1)])]};
  assert.deepEqual(deleteLine(nameless, nameless.places[0].rows[0].id).places, []);
});

test('行をコピーして貼り付け：部材は同上施工費ごと、施工費（同上施工費）はそのまとまり。選んだ行のすぐ下に入る', () => {
  const {job} = type(emptyJob(), [
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
    ['new:text', '木の手すり 35φ 4m', rail],
  ]);
  const [barRow, work, railRow] = job.places[0].rows;
  // 部材の行：部材と同上施工費
  assert.deepEqual(lineRows(job, barRow.id)?.map((r) => r.id), [barRow.id, work.id]);
  // 施工費の行：そのまとまり
  assert.deepEqual(lineRows(job, work.id)?.map((r) => r.id), [work.id]);
  assert.equal(lineRows(job, 'no-such-row'), null);

  // 部材（と同上施工費）を、木の手すりの行の下に貼り付ける（新しい行。IDは別）
  const res = pasteLines(job, `line:${railRow.id}:text`, lineRows(job, barRow.id) ?? []);
  const rows = res.job.places[0].rows;
  assert.deepEqual(rows.map((r) => r.name), [barRow.name, work.name, railRow.name, barRow.name, work.name]);
  assert.equal(res.rowId, rows[3].id);
  assert.notEqual(rows[3].id, barRow.id);
  assert.deepEqual(formLines(res.job, S, 'yukuhashi').map((l) => [l.text, l.amount]), [
    ['TOTO TS136GY6 インテリアバー', 6400],
    ['同上施工費', 2000],
    ['サンプル S-TS35 木の手すり 35φ 4m', 16000],
    ['TOTO TS136GY6 インテリアバー', 6400],
    ['同上施工費', 2000],
  ]);

  // 同上施工費だけを、木の手すり（施工費なし）の下に貼り付ける → 木の手すりの同上施工費になる。返す行は施工費のまとまりの最初の行
  const w = pasteLines(job, `line:${railRow.id}:text`, lineRows(job, work.id) ?? []);
  assert.deepEqual(formLines(w.job, S, 'yukuhashi').map((l) => [l.text, l.amount]), [
    ['TOTO TS136GY6 インテリアバー', 6400],
    ['同上施工費', 2000],
    ['サンプル S-TS35 木の手すり 35φ 4m', 16000],
    ['同上施工費', 2000],
  ]);
  assert.equal(w.rowId, w.job.places[0].rows[3].id);

  // 空白の行に貼り付けると、その行に入る（行は増えない）
  const blank = insertBlankAfter(job, railRow.id);
  // 挿入した空白の行は、書き直すときも空から（前は内容の欄に「材料費」、数量に「1」と出た）
  for (const f of ['text', 'qty', 'unit', 'price', 'note']) assert.equal(sheetValue(blank.job, `line:${blank.rowId}:${f}`, yk), '', f);
  const intoBlank = pasteLines(blank.job, `line:${blank.rowId}:text`, lineRows(job, barRow.id) ?? []);
  assert.deepEqual(intoBlank.job.places[0].rows.map((r) => r.name), [barRow.name, work.name, railRow.name, barRow.name, work.name]);
  // いちばん下の空いた行：最後の箇所のうしろ／貼り付ける場所がない欄：そのまま
  assert.equal(pasteLines(job, 'new:text', lineRows(job, work.id) ?? []).job.places[0].rows.length, 4);
  assert.deepEqual(pasteLines(job, 'job:customer', lineRows(job, work.id) ?? []), {job, rowId: null});
});

test('行を切り取って貼り付け：貼り付けた所に移る（もとの行は消え、箇所の行がなくなれば見積書から外れる）', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '玄関'],
    ['new:text', 'インテリアバー', bar],
    ['new:name', 'トイレ'],
    ['new:text', '木の手すり 35φ 4m', rail],
  ]);
  const [genkan, toilet] = job.places;
  const moved = pasteLines(job, `line:${toilet.rows[0].id}:text`, lineRows(job, genkan.rows[0].id) ?? [], [genkan.rows[0].id]);
  job = moved.job;
  // 行がなくなった玄関は見積書から外れる（申請書には残る。2026-11-11）
  assert.deepEqual(job.places.map((p) => [p.name, p.rows.map((r) => r.name), offEstimate(p)]), [['玄関', [], true], ['トイレ', ['木の手すり 35φ 4m', 'インテリアバー'], false]]);
  assert.equal(moved.rowId, job.places[1].rows[1].id);
});

// ---------------------------------------------------------------- レビューで見つかった不具合（2026-10-23）

/** 欄を F2 で開いて、何も変えずに確定する（見積書の画面は入れないが、同じ値を打ち込んで確定したときも変えない） */
const reconfirm = (job: Job, key: string, ctx: {settings: typeof S; form: 'yukuhashi' | 'kouiki'; materials?: Material[]} = yk) => applySheet(job, key, sheetValue(job, key, ctx), ctx).job;

test('諸経費：出ている自動の金額のまま確定しても手で入れたことにしない（行を足すと諸経費も変わる）。介護保険対象の諸経費も', () => {
  let {job} = type(emptyJob(), [['new:text', '木の手すり 35φ 4m', rail]]);
  assert.equal(estimateTotals(job, S).all.overhead, 1600);
  job = reconfirm(job, 'overhead:all');
  job = reconfirm(job, 'overhead:target');
  assert.deepEqual([job.overhead, job.overheadTarget], [null, null]);
  ({job} = type(job, [['new:text', '別の手すり 4m', {...rail, id: 'm9', code: 'X-1', name: '別の手すり 4m', listPrice: 30000, price: 15000}]]));
  assert.deepEqual([estimateTotals(job, S).all.subtotal, estimateTotals(job, S).all.overhead, estimateTotals(job, S).all.total], [40000, 4000, 48400]);
  // 2行目を対象外にすると、対象の諸経費は対象の小計から（前は全体の 4,000円のままだった）
  job = toggleExcluded(job, job.places[0].rows[1].id);
  assert.deepEqual([estimateTotals(job, S).target.subtotal, estimateTotals(job, S).target.overhead, estimateTotals(job, S).target.total], [16000, 1600, 19360]);
  // 自動と違う金額を入れれば手で入れた金額
  job = applySheet(job, 'overhead:target', '1500', yk).job;
  assert.equal(job.overheadTarget, 1500);
});

test('対象外の行がないとき、介護保険対象部分の欄で諸経費を直しても全体の諸経費になり、消費税・合計も変わる（「諸経費を修正した際に、消費税が自動で切り替わらない」2026-11-04）', () => {
  let {job} = type(emptyJob(), [['new:text', '木の手すり 35φ 4m', rail]]);
  job = applySheet(job, 'overhead:target', '6600', yk).job;
  assert.deepEqual([job.overhead, job.overheadTarget], [6600, null]);
  const t = estimateTotals(job, S);
  assert.deepEqual([t.all.overhead, t.all.tax, t.target.overhead, t.target.tax], [6600, Math.trunc((t.all.subtotal + 6600) * 0.1), 6600, t.all.tax]);
});

test('数量：出ている数量のまま確定しても、切って使う手すり・申請書の長さ・中間のブラケットを書き直さない', () => {
  const bd134: Material = {id: 'm134', name: 'BAUHAUS 35丸棒 Mオーク 4m', price: 9000, listPrice: 15000, pieceLengthM: 4, maker: 'マツ六', code: 'BD-134', unit: '本', favorite: false, updatedAt: 1};
  const bd01g: Material = {id: 'm01g', name: '35ブラケット横型カバー付 ゴールド', price: 900, listPrice: 1500, pieceLengthM: 0, maker: 'マツ六', code: 'BD-01G', unit: '個', favorite: false, updatedAt: 1};
  const ctx = {...yk, materials: [bd134, bd01g]};
  // 600mm×2本（0.3 と出る）：前は 1200mm×1本になり、BD-01G が1個入った
  const twice = {...materialRow(bd134, 2), lengthCm: 60};
  let job: Job = {...emptyJob(), places: [newPlace('玄関', [twice])]};
  assert.equal(sheetValue(job, `line:${twice.id}:qty`, ctx), '0.3');
  assert.equal(reconfirm(job, `line:${twice.id}:qty`, ctx), job);
  // 4000mm（「1」と出る）：前は切らない1本になり、発注書の 4000mm＋2000mm が 4000mm だけになった
  const whole = {...materialRow(bd134, 1), lengthCm: 400};
  job = {...emptyJob(), places: [newPlace('廊下', [whole])]};
  assert.equal(reconfirm(job, `line:${whole.id}:qty`, ctx), job);
  // 申請書の L=1250（0.313 と出る）：前は 1252mm になり、申請書の長さが消えた
  let p: Place = {...newPlace('玄関', [materialRow(bd134, 1)]), dims: {l: '1250'}};
  p = withBrackets(p, placeFromDims(p), ctx.materials);
  job = {...emptyJob(), places: [p]};
  const id = job.places[0].rows[0].id;
  assert.equal(sheetValue(job, `line:${id}:qty`, ctx), '0.313');
  assert.equal(reconfirm(job, `line:${id}:qty`, ctx), job);
  // 違う数量を入れれば今までどおり
  job = applySheet(job, `line:${id}:qty`, '0.4', ctx).job;
  assert.equal(job.places[0].rows[0].lengthCm, 160);
  // 広域連合用の時間（金額÷1時間の単価を小数2けたに丸めて出す）：そのまま確定しても金額は変えない
  const odd = {...laborRow({id: 'l1', name: '木', price: 1000, estPrice: 3333, note: ''}, 1)};
  job = {...emptyJob(), places: [newPlace('玄関', [materialRow(rail, 1), odd])]};
  assert.equal(sheetValue(job, `line:${odd.id}:qty`, kk), '1.33');
  assert.equal(reconfirm(job, `line:${odd.id}:qty`, kk), job);
});

test('挿入した空白の行に「同上施工費」と単価を打つと施工費の行（仕切りの取付手間・広域連合用の時間も、いちばん下の行と同じ）', () => {
  let {job} = type(emptyJob(), [['new:text', '木の手すり 35φ 4m', rail]], kk);
  const ins = insertBlankAfter(job, job.places[0].rows[0].id);
  const res = applySheet(ins.job, `line:${ins.rowId}:text`, '同上施工費', kk);
  assert.equal(res.key, `line:${ins.rowId}:text`);
  job = applySheet(res.job, `line:${ins.rowId}:price`, '3000', kk).job;
  assert.deepEqual(job.places[0].rows.map((r) => [r.kind, r.price]), [['material', 10000], ['labor', 3000]]);
  const lines = formLines(job, S, 'kouiki');
  assert.deepEqual([lines[1].mark, lines[1].text, lines[1].qty, lines[1].unit, lines[1].amount], ['手', '同上施工費', 1.2, '時間', 3000]);
  assert.equal(jobTotals(job, S).labor, 3000);
  assert.equal(formLines(job, S, 'yukuhashi')[1].unit, '式');
  // 上に施工費があれば、そのまとまり（見積書では1行）に入る。名前を打った施工費は内容の欄に出る
  const ins2 = insertBlankAfter(job, job.places[0].rows[0].id);
  const res2 = applySheet(ins2.job, `line:${ins2.rowId}:text`, '手すり取付施工費', kk);
  assert.equal(res2.key, `line:${job.places[0].rows[1].id}:text`);
  assert.equal(formLines(res2.job, S, 'kouiki').length, 2);
});

test('広域連合用：いちばん下の行を「手」にして時間を打つと、その分だけ施工費が増える（上の同上施工費を打った金額にしない）', () => {
  const wood = {id: 'l1', name: '木', price: 1000, estPrice: 1500, note: ''};
  let job: Job = {...emptyJob(), form: 'kouiki', places: [newPlace('玄関', [materialRow(rail, 1), laborRow(wood, 2)])]};
  assert.equal(estimateTotals(job, S).all.subtotal, 19000);
  job = applySheet(job, 'new:qty', '0.8', {...kk, labor: true}).job;
  assert.equal(estimateTotals(job, S).all.subtotal, 21000);
  const added = job.places[0].rows[2];
  assert.deepEqual([added.kind, added.price, added.estPrice, added.qty], ['labor', 2000, 2000, 1]); // 仕切りも同じ金額
  assert.equal(jobTotals(job, S).labor, 4000);
  // 上のまとまりの金額を手で直してあれば、その金額に足す
  job = {...job, places: [{...job.places[0], rows: setWorkAmount(job.places[0].rows.slice(0, 2), 1, 2500, S)}]};
  job = applySheet(job, 'new:price', '1000', {...kk, labor: true}).job;
  assert.deepEqual(formLines(job, S, 'kouiki').map((l) => l.amount), [16000, 3500]);
});

test('貼り付けた文字：Excel の2つのセル・2行はつなげて読まない。−500・ー500 は負の数', () => {
  assert.equal(parseNum('1,500\t1,200'), null);
  assert.equal(parseNum('1\n2'), null);
  assert.equal(parseNum('3,000\n'), 3000); // Excel の1つのセル（うしろに改行が付く）
  assert.equal(parseNum('−500'), -500);
  assert.equal(parseNum('ー500'), -500);
  assert.equal(parseNum('ｰ500'), -500);
  const {job} = type(emptyJob(), [['new:text', '手すり受け'], ['line:@:price', '1,500\t1,200\n']]);
  assert.equal(formLines(job, S, 'yukuhashi')[0].unitPrice, 0);
});

test('内容の欄で、1本の長さのない部材に選び直したら前の使う長さは消す（「（長さ60cm）」と出ない）', () => {
  const end: Material = {id: 'm08g', name: '35エンドブラケット ゴールド', price: 1000, listPrice: 1800, pieceLengthM: 0, maker: 'マツ六', code: 'BD-08G', unit: '個', favorite: false, updatedAt: 1};
  let {job} = type(emptyJob(), [['new:text', '木の手すり 35φ 4m', rail], ['line:@:qty', '600mm']]);
  const id = job.places[0].rows[0].id;
  ({job} = type(job, [[`line:${id}:text`, 'マツ六 BD-08G 35エンドブラケット ゴールド', end]]));
  const [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.text, l.qty, l.unit], ['マツ六 BD-08G 35エンドブラケット ゴールド', 1, '個']);
  // 1本の長さのある部材に選び直したときは、使う長さのまま
  ({job} = type(job, [[`line:${id}:qty`, '1']]));
  ({job} = type(job, [[`line:${id}:text`, '木の手すり 35φ 4m', rail], [`line:${id}:qty`, '60cm'], [`line:${id}:text`, '別の手すり 4m', {...rail, id: 'm9', name: '別の手すり 4m'}]]));
  assert.equal(job.places[0].rows[0].lengthCm, 60);
});

test('見積書の ✕・切り取りで箇所の行がなくなっても、申請書の箇所は消さない（見積書から外すだけ。寸法・写真はそのまま）', () => {
  // ユーザーの指示「申請書も連動して消す機能はやめる」2026-11-11（前は「申請書からも削除してよいですか？」と聞いた）
  const bath = {...newPlace('浴室', [manualRow('material', {qty: 1})]), dims: {l: '800', h: '750'}, photos: {before: 'ph_before_1', after: 'ph_after_1'}, photoNote: '縦手すり'};
  const entry = newPlace('玄関', [materialRow(rail, 1)]);
  let job: Job = {...emptyJob(), places: [entry, bath]};
  // 空白の行の ✕：見積書から外す（前は何もしなかった）
  const off = deleteLine(job, bath.rows[0].id);
  assert.deepEqual([off.places.length, off.places[1].rows.length, offEstimate(off.places[1]), off.places[1].photos?.before, off.places[1].dims?.l], [2, 0, true, 'ph_before_1', '800']);
  // 行を入れてから ✕：見積書には出ない・写真番号は残る（申請書の②のまま）
  job = {...job, places: [entry, {...bath, rows: [materialRow(bar, 1)]}]};
  job = deleteLine(job, job.places[1].rows[0].id);
  assert.deepEqual([job.places.length, job.places[1].rows.length, offEstimate(job.places[1])], [2, 0, true]);
  assert.ok(formLines(job, S, 'yukuhashi').every((l) => l.placeName === '玄関'));
  assert.deepEqual([...photoNumbers(job, S).values()], [1, 2]);
  // 切り取って玄関に貼り付けても申請書には残る。名前のない箇所は今までどおり消える
  job = {...job, places: [entry, {...bath, rows: [materialRow(bar, 1)]}]};
  const moved = pasteLines(job, `line:${entry.rows[0].id}:text`, lineRows(job, job.places[1].rows[0].id) ?? [], [job.places[1].rows[0].id]).job;
  assert.deepEqual(moved.places.map((p) => [p.name, p.rows.length, offEstimate(p)]), [['玄関', 2, false], ['浴室', 0, true]]);
  const plain = {...emptyJob(), places: [entry, newPlace('', [materialRow(bar, 1)])]};
  assert.deepEqual(deleteLine(plain, plain.places[1].rows[0].id).places.map((p) => p.name), ['玄関']);
  // 撮影日だけ・そのほかだけの箇所も残す（申請書の一覧の ✕ で聞く箇所と同じ）
  for (const extra of [{photoDates: {before: '2026-10-01'}}, {shinseiText: '木製'}, {plateLength: '1300'}]) {
    const kept = {...emptyJob(), places: [entry, {...newPlace('', [materialRow(bar, 1)]), ...extra}]};
    assert.deepEqual(deleteLine(kept, kept.places[1].rows[0].id).places.map((p) => offEstimate(p)), [false, true]);
  }
  // 切り取らなかった箇所（行のない箇所など）は、そのまま
  const pending = newPlace('トイレ');
  const three: Job = {...emptyJob(), places: [entry, {...bath, rows: [materialRow(bar, 1)]}, pending]};
  const cut = pasteLines(three, `line:${entry.rows[0].id}:text`, lineRows(three, three.places[1].rows[0].id) ?? [], [three.places[1].rows[0].id]).job;
  assert.equal(cut.places[2], pending);
});

test('見積書から外した箇所：いちばん下の空いた行・ツールバーの入れ先にしない。写真番号は申請書の番号のまま（①③）', () => {
  const entry = newPlace('玄関', [materialRow(rail, 1)]);
  const toilet = {...newPlace('トイレ'), estimateOff: true};
  const bath = newPlace('浴室', [materialRow(bar, 1)]);
  let job: Job = {...emptyJob(), places: [entry, toilet, bath]};
  assert.deepEqual([...photoNumbers(job, S).entries()], [[entry.id, 1], [toilet.id, 2], [bath.id, 3]]);
  assert.deepEqual(formLines(job, S, 'yukuhashi').map((l) => [l.placeName, l.photo]), [['玄関', 1], ['浴室', 3]]);
  // いちばん下に打つと、最後の見積書の箇所（浴室）に入る。名前を打つと新しい箇所④
  job = {...job, places: [entry, bath, toilet]};
  assert.equal(toolPlace(job, null, null)?.id, bath.id);
  assert.equal(toolPlace(job, null, toilet.id)?.id, bath.id);
  let r = applySheet(job, 'new:text', '同上施工費', yk);
  assert.deepEqual(r.job.places.map((p) => [p.name, p.rows.length]), [['玄関', 1], ['浴室', 2], ['トイレ', 0]]);
  // いちばん下の箇所に行がなければ、その箇所の写真番号は外した箇所も数えたつぎ（玄関①・トイレ②（外した）・寝室③）
  const pend: Job = {...job, places: [entry, toilet, newPlace('寝室')]};
  assert.equal(sheetNewLine(pend, formLines(pend, S, 'yukuhashi'), 'yukuhashi').photo, 3);
  const typed = applySheet(pend, 'new:text', 'インテリアバー', {...yk, pick: bar}).job;
  assert.equal(photoNumbers(typed, S).get(pend.places[2].id), 3);
  r = applySheet(job, 'new:name', '寝室', yk);
  assert.deepEqual(r.job.places.map((p) => p.name), ['玄関', '浴室', 'トイレ', '寝室']);
  assert.equal(photoNumbers(r.job, S).get(r.job.places[3].id), undefined); // 行が入るまでは番号なし（今までどおり）
  // 見積書の箇所がみな外れていれば、いちばん下に打つと新しい箇所を作る
  const allOff: Job = {...emptyJob(), places: [toilet]};
  r = applySheet(allOff, 'new:text', 'インテリアバー', {...yk, pick: bar});
  assert.deepEqual(r.job.places.map((p) => [p.name, p.rows.length]), [['トイレ', 0], ['', 1]]);
  // 行が入れば見積書に出る
  assert.equal(offEstimate({...toilet, rows: [materialRow(bar, 1)]}), false);
});

test('白紙に戻す：見積書の内容と、申請書の項目・理由書（お客様のこと）を消す。保険者・担当・請求書に入れるかは残す', () => {
  const {job} = type({...emptyJob(), customer: '前の方', staff: '久保', address: '福岡県行橋市中央1丁目', insurer: 'yukuhashi'}, [['new:text', '木の手すり 35φ 4m', rail]]);
  const full: Job = {...job, shinsei: {...job.shinsei, kana: 'マエノカタ'} as Job['shinsei'], riyu: {body: '前の方の身体状況'} as unknown as Job['riyu'], planPhoto: 'ph-plan'};
  const blank = clearedSheet(full, S);
  assert.deepEqual([blank.customer, blank.address, blank.places.length, blank.riyu, blank.shinsei?.kana], ['', '', 0, undefined, '']);
  assert.equal('planPhoto' in blank, false); // 平面図の図もお宅のもの（箇所の写真と同じく消す）
  assert.deepEqual([blank.staff, blank.insurer, blank.shikiri], ['久保', 'yukuhashi', true]);
});

// ユーザーの指摘「施工費を入力したら、勝手に②になってしまった」（2026-10-25）：①廊下の部材（手すり・ベースプレート・ブラケット）のあとに入れる施工費は、
// 同じ①廊下の行（同上施工費）。新しい箇所②を作らない。部材は見本の品番・架空の価格
const mazroc = (id: string, code: string, name: string, list: number, pieceLengthM = 0): Material => ({
  id, name, code, maker: 'マツ六', unit: '', price: Math.round(list * 0.6), listPrice: list, pieceLengthM, favorite: false, updatedAt: 1,
});
const hallway = (): Job => {
  const rows = [
    {...materialRow(mazroc('x1', 'BD-134', '35アッシュ丸棒 見本 4m', 10000, 4)), lengthCm: 240},
    {...materialRow(mazroc('x2', 'BH-444', '木製ベースプレート 見本 4m', 5000, 4)), lengthCm: 240},
    materialRow(mazroc('x3', 'BD-08G', '35エンドブラケット 見本', 1000), 2),
    materialRow(mazroc('x4', 'BD-18G', '35エンドキャップ 見本', 400), 1),
    materialRow(mazroc('x5', 'BD-01G', '35ブラケット横型 見本', 800), 1),
  ];
  return {...emptyJob(), places: [newPlace('廊下', rows)]};
};

test('いちばん下の行の改修内容・改修場所に「施工費」と打っても新しい箇所を作らず、最後の箇所の施工費（同上施工費）にする。読めない改修内容では箇所を作らない', () => {
  for (const field of ['work', 'name']) {
    const {job, keys} = type(hallway(), [
      [`new:${field}`, '施工費'],
      ['line:@:price', '12000'],
    ]);
    assert.equal(job.places.length, 1, field); // 前は空の箇所②ができ、施工費がそこに入った
    const rows = job.places[0].rows;
    assert.equal(rows.length, 6);
    assert.deepEqual([rows[5].kind, rows[5].name], ['labor', '施工費']);
    assert.equal(keys[0], `line:${rows[5].id}:text`); // 打った施工費の行を選ぶ
    const lines = formLines(job, S, 'yukuhashi');
    assert.deepEqual(
      lines.map((l) => [l.photo, l.first ? l.placeName : '', l.text, l.amount]).slice(-2),
      [
        [1, '', 'マツ六 BD-01G 35ブラケット横型 見本', 640],
        [1, '', '同上施工費', 12000],
      ],
    );
  }
  // 改修の種類・写真番号として読めない文字：何も変えない（前は空の箇所②ができ、いちばん下の行がその箇所になった）
  const start = hallway();
  assert.equal(applySheet(start, 'new:work', 'あいう', yk).job, start);
  assert.equal(applySheet(start, 'new:photo', 'あ', kk).job, start);
  // 改修の種類・改修場所を打てば、今までどおり新しい箇所
  assert.equal(applySheet(start, 'new:work', '段差', yk).job.places.length, 2);
  assert.equal(applySheet(start, 'new:name', 'トイレ', yk).job.places.length, 2);
});

test('ツールバーから入れる箇所（toolPlace）：選んでいる欄の箇所。欄を選んでいない・お客様名などなら最後に選んだ箇所、なければいちばん下の箇所。箇所がなければ null', () => {
  const entry = newPlace('玄関', [materialRow(rail, 1)]);
  const hall = hallway().places[0];
  const job: Job = {...emptyJob(), places: [entry, hall]};
  assert.equal(toolPlace(job, `line:${entry.rows[0].id}:text`, null)?.id, entry.id);
  assert.equal(toolPlace(job, `place:${entry.id}:name`, hall.id)?.id, entry.id);
  assert.equal(toolPlace(job, 'new:text', entry.id)?.id, hall.id); // いちばん下の行は最後の箇所
  // 空白の行に部材を入れて、選んでいた欄がなくなった（その行のIDがない）：最後に選んだ箇所（前は新しい箇所を作った）
  assert.equal(toolPlace(job, 'line:r_gone:text', entry.id)?.id, entry.id);
  assert.equal(toolPlace(job, null, entry.id)?.id, entry.id);
  assert.equal(toolPlace(job, 'job:customer', null)?.id, hall.id);
  assert.equal(toolPlace(job, null, 'p_gone')?.id, hall.id);
  assert.equal(toolPlace(emptyJob(), null, null), null); // 箇所がまだない → 新しく作る
});

test('何も入っていない箇所（前の版の施工費のボタンなどが残した空の箇所）は外す。名前・行・写真番号・改修の種類・申請書の内容のある箇所は残す', () => {
  const job = hallway();
  const empty = newPlace('');
  const kept = [
    {...newPlace(''), kind: 2}, // いちばん下の行で改修の種類を選んだ
    {...newPlace(''), photo: 3},
    newPlace('トイレ'),
    {...newPlace(''), dims: {l: '600'}},
    {...newPlace(''), photos: {before: 'ph_1'}},
    newPlace('', [manualRow('material', {qty: 1})]), // 申請書のタブで足した箇所（空白の行がある）
  ];
  assert.ok(isEmptyPlace(empty));
  assert.ok(kept.every((p) => !isEmptyPlace(p)));
  const dropped = dropEmptyPlaces({...job, places: [...job.places, empty, ...kept, {...empty, id: 'p_empty2'}]});
  assert.deepEqual(
    dropped.places.map((p) => p.id),
    [job.places[0].id, ...kept.map((p) => p.id)],
  );
  assert.equal(dropEmptyPlaces(job), job); // なければ同じ job（保存しない）
});

test('「＋ 挿入」は選んでいる行の上（部材の同上施工費なら部材と同上施工費の間）。箇所の1行目の上は前の箇所のいちばん下（「この間に挿入が差し込めるように」2026-11-03）', () => {
  const wood = {id: 'l1', name: '木', price: 1000, estPrice: 1500, note: ''};
  const a = newPlace('台所', [laborRow(wood, 1)]); // ③台所：施工費だけ
  const m1 = materialRow(rail, 1);
  const w1 = laborRow(wood, 1);
  const m2 = materialRow(bar, 1);
  const b = newPlace('台所', [m1, w1, m2]); // ④台所：手すり・同上施工費・バー
  const job: Job = {...emptyJob(), places: [a, b]};
  // ④の1行目の上 → ③のいちばん下（④の名前の行は動かない）
  const top = insertBlankBefore(job, m1.id);
  assert.deepEqual(top.job.places.map((p) => p.rows.length), [2, 3]);
  assert.equal(top.job.places[0].rows[1].id, top.rowId);
  assert.equal(top.job.places[1].rows[0].id, m1.id);
  assert.equal(insertBeforeId(job, m1.id), m1.id);
  // 同上施工費を選んでいたら、部材と同上施工費の間（ユーザーの指示「部材と取り付け費の間に挿入をお願い」2026-11-05。前は部材の上）
  assert.equal(insertBeforeId(job, w1.id), w1.id);
  const between = insertBlankBefore(job, w1.id);
  assert.deepEqual(between.job.places[0].rows.length, 1);
  assert.deepEqual(between.job.places[1].rows.map((r) => (r.id === between.rowId ? '空白' : r.id)), [m1.id, '空白', w1.id, m2.id]);
  // バーの上 → ④の中（同上施工費とバーの間）
  const mid = insertBlankBefore(job, m2.id);
  assert.deepEqual(mid.job.places[1].rows.map((r) => r.id === mid.rowId ? '空白' : r.id), [m1.id, w1.id, '空白', m2.id]);
  // 最初の箇所の1行目の上 → その箇所のはじめ
  const first = insertBlankBefore(job, a.rows[0].id);
  assert.equal(first.job.places[0].rows[0].id, first.rowId);
  assert.equal(insertBlankBefore(job, 'nope').rowId, null);
});

test('緑の行より下の空いた行（gap:何行下:欄）に打つと、あいだを空白の行でうめて、押した行の位置に入る（「別のセルでも入力したり、編集したりできるように」2026-11-04）', () => {
  const m1 = materialRow(rail, 1);
  const job: Job = {...emptyJob(), places: [newPlace('廊下', [m1])]};
  // 2行下の内容の欄 → 空白の行2つ（緑の行とすぐ下）のあとに入る
  const r = applySheet(job, 'gap:2:text', '見本の部材', yk);
  const rows = r.job.places[0].rows;
  assert.equal(rows.length, 4);
  assert.equal(rows[0].id, m1.id);
  assert.equal(rows[1].name, '');
  assert.equal(rows[2].name, '');
  assert.equal(rows[3].name, '見本の部材');
  assert.equal(r.key, `line:${rows[3].id}:text`);
  // 見積書でも押した行（緑の行の2行下）に出る
  const lines = formLines(r.job, S, 'yukuhashi');
  assert.equal(lines.findIndex((l) => l.text.includes('見本の部材')), 3);
  // 何も打たない・改修の種類として読めない字は、空白の行も足さない
  assert.equal(applySheet(job, 'gap:2:text', '  ', yk).job, job);
  assert.equal(applySheet(job, 'gap:1:kind', 'あいう', yk).job, job);
  // 数量だけ打っても、その行に入る
  const q = applySheet(job, 'gap:1:qty', '3', yk);
  assert.deepEqual(q.job.places[0].rows.map((x) => x.qty), [1, 1, 3]);
  // 改修場所の欄：あいだを空白の行でうめてから、新しい箇所（その行に箇所の名前）
  const p = applySheet(job, 'gap:1:name', '玄関', yk);
  assert.deepEqual(p.job.places.map((x) => [x.name, x.rows.length]), [['廊下', 2], ['玄関', 0]]);
  // 箇所がないときは作ってからうめる
  const e = applySheet(emptyJob(), 'gap:1:text', '見本の部材', yk);
  assert.deepEqual(e.job.places[0].rows.map((x) => x.name), ['', '見本の部材']);
  assert.equal(withGapRows(emptyJob(), 3).places[0].rows.length, 3);
  // 貼り付けも押した行の位置に
  const pasted = pasteLines(job, 'gap:2:text', [materialRow(bar, 2)]);
  assert.deepEqual(pasted.job.places[0].rows.map((x) => x.name), [rail.name, '', '', bar.name]);
  assert.equal(sheetValue(job, 'gap:2:text', yk), '');
  assert.equal(describeKey(job, 'gap:2:qty', S), '空いた行 ／ 数量');
});

test('施工費のリストの −／＋：開いた所のまとまりの数を変え、続けて押す所（key）を返す（「施工費は一覧とともに、数量をふやせるように」2026-11-03）', () => {
  const wood = {id: 'l1', name: '木', price: 1000, estPrice: 1500, note: ''};
  const blank = manualRow('material', {qty: 1});
  const m1 = materialRow(rail, 1);
  let job: Job = {...emptyJob(), places: [newPlace('廊下', [m1, blank])]};
  assert.equal(laborCountAt(job, `line:${blank.id}:text`, wood.id), 0);
  // 空いた行で ＋ → 空いた行は手すりの同上施工費になる。続けて押す所はその行
  let res = stepLaborAt(job, `line:${blank.id}:text`, wood, 1);
  const labor = res.job.places[0].rows[1];
  assert.deepEqual(res.job.places[0].rows.map((r) => [r.kind, r.qty]), [['material', 1], ['labor', 1]]);
  assert.equal(res.rowId, labor.id);
  assert.equal(res.key, `line:${labor.id}:text`);
  job = res.job;
  // ＋ をもう1回 → 2
  res = stepLaborAt(job, res.key!, wood, 1);
  assert.equal(laborCountAt(res.job, res.key!, wood.id), 2);
  assert.equal(res.job.places[0].rows.length, 2);
  job = res.job;
  // − を2回 → 0 になって行がなくなる。続けて押す所は上の手すりの行（もう1回 ＋ を押すとまた同上施工費）
  res = stepLaborAt(job, res.key!, wood, -1);
  res = stepLaborAt(res.job, res.key!, wood, -1);
  assert.deepEqual(res.job.places[0].rows.map((r) => r.kind), ['material']);
  assert.equal(res.key, `line:${m1.id}:text`);
  assert.equal(laborCountAt(res.job, res.key!, wood.id), 0);
  // 0 のときの − は何もしない
  const same = stepLaborAt(res.job, res.key!, wood, -1);
  assert.equal(same.job, res.job);
  const again = stepLaborAt(res.job, res.key!, wood, 1);
  assert.deepEqual(again.job.places[0].rows.map((r) => [r.kind, r.qty]), [['material', 1], ['labor', 1]]);
  // 工務店の請求書（仕切り）の施工費は 仕切りの取付手間×数（ユーザーの指示「木手すり 1箇所 1000、2箇所であれば 2000円」2026-11-03）
  const two = stepLaborAt(again.job, `line:${again.job.places[0].rows[1].id}:text`, wood, 1).job;
  assert.equal(jobTotals(two, S).labor, 2000);
  assert.equal(jobTotals(again.job, S).labor, 1000);
  // いちばん下の空いた行（new:text）：最後の箇所の最後の部材のまとまり
  assert.equal(laborCountAt(again.job, 'new:text', wood.id), 1);
  const add = stepLaborAt(again.job, 'new:text', wood, 1);
  assert.equal(laborCountAt(add.job, add.key!, wood.id), 2);
  assert.equal(add.job.places[0].rows.length, 2);
});

test('箇所の2行目からの改修内容・改修場所に打つと、その行（同上施工費ごと）から別の箇所になる（「他のセルの上に乗せた場合でも、直接変更や入力ができるように」2026-11-04）', () => {
  const wood = {id: 'l1', name: '木', price: 1000, estPrice: 1500, note: ''};
  const m1 = materialRow(rail, 1);
  const w1 = laborRow(wood, 1);
  const m2 = {...materialRow(bar, 1), id: 'step'};
  const w2 = laborRow(wood, 1);
  const tail = materialRow(rail, 1);
  const p: Place = {...newPlace('台所', [m1, w1, m2, w2, tail]), kind: 1};
  let job: Job = {...emptyJob(), places: [p]};
  assert.equal(sheetValue(job, `split:${m2.id}:name`, yk), '');
  // 改修場所に「③玄関」→ 踏台から下が ③玄関（種類は同じ 手すりの取り付け）
  let res = splitPlaceAt(job, m2.id, 'name', '③玄関');
  assert.deepEqual(res.job.places.map((x) => [x.name, x.photo, x.kind, x.rows.map((r) => r.id)]), [
    ['台所', p.photo, 1, [m1.id, w1.id]],
    ['玄関', 3, 1, [m2.id, w2.id, tail.id]],
  ]);
  assert.equal(res.key, `place:${res.job.places[1].id}:name`);
  // applySheet からも同じ
  assert.deepEqual(applySheet(job, `split:${m2.id}:name`, '③玄関', yk).job.places.map((x) => x.name), ['台所', '玄関']);
  // 打った写真番号がほかの箇所と重なるなら使わない（見積書の順番の②になる）
  const dup = applySheet(job, `split:${m2.id}:name`, '①玄関', yk).job;
  assert.deepEqual(dup.places.map((x) => x.photo), [p.photo, 0]);
  assert.deepEqual([...photoNumbers(dup, S).values()], [1, 2]);
  // 改修内容に「段差の解消」→ 名前は同じ台所・種類が段差の解消
  res = splitPlaceAt(job, m2.id, 'work', '段差の解消');
  assert.deepEqual(res.job.places.map((x) => [x.name, x.kind]), [['台所', 1], ['台所', 2]]);
  // 同上施工費の行に打っても、その上の部材から分ける。空・読めない文字は何もしない。1行目なら箇所を直すだけ
  assert.deepEqual(splitPlaceAt(job, w2.id, 'name', '玄関').job.places.map((x) => x.rows.length), [2, 3]);
  assert.equal(splitPlaceAt(job, m2.id, 'name', '  ').job, job);
  assert.equal(splitPlaceAt(job, m2.id, 'work', 'あいう').job, job);
  job = splitPlaceAt(job, m1.id, 'name', '廊下').job;
  assert.deepEqual(job.places.map((x) => x.name), ['廊下']);
  // 見積書の行：2行目からの部材・はじめの施工費の行に split: のキー（同上施工費の行にはない）
  const lines = formLines({...emptyJob(), places: [p]}, S, 'yukuhashi');
  assert.deepEqual(lines.map((l) => [l.first, l.excludeId === l.rowId]), [[true, true], [false, false], [false, true], [false, false], [false, true]]);
});

test('材／手の欄：どの行でも直せる（ユーザーの指摘「材の部分が選択できない」2026-11-05）。字だけ変わり金額は同じ。空白の行を「手」にすると施工費になる', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '廊下'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
  ], kk);
  const [matId, labId] = job.places[0].rows.map((r) => r.id);
  const before = estimateTotals(job, S);
  assert.deepEqual(formLines(job, S, 'kouiki').map((l) => l.mark), ['材', '手']);
  assert.deepEqual([sheetValue(job, `line:${matId}:mark`, kk), sheetValue(job, `line:${labId}:mark`, kk)], ['材', '手']);
  // 部材の行を「手」に・施工費の行を「材」に（て・ざ・全角も読む）。金額はそのまま
  job = applySheet(job, `line:${matId}:mark`, 'て', kk).job;
  job = applySheet(job, `line:${labId}:mark`, 'ｚ', kk).job;
  assert.deepEqual(formLines(job, S, 'kouiki').map((l) => l.mark), ['手', '材']);
  assert.deepEqual(estimateTotals(job, S), before);
  // 読めない字は何もしない・空（Delete）は自動の字に戻す（自動と同じ字は持たない）
  assert.equal(applySheet(job, `line:${matId}:mark`, 'あ', kk).job, job);
  job = applySheet(job, `line:${matId}:mark`, '', kk).job;
  job = applySheet(job, `line:${labId}:mark`, '手', kk).job;
  assert.deepEqual(formLines(job, S, 'kouiki').map((l) => l.mark), ['材', '手']);
  assert.ok(job.places[0].rows.every((r) => !('estMark' in r) || r.estMark === undefined));

  // 空白の行：初めは空。「手」にして時間を打つと、上の部材の同上施工費（打った金額はこの行だけ。1.2時間×2,500円）
  const blank = insertBlankAfter(job, labId);
  job = blank.job;
  const blankId = blank.rowId;
  assert.equal(sheetValue(job, `line:${blankId}:mark`, kk), '');
  assert.equal(formLines(job, S, 'kouiki', {all: true})[2].mark, '');
  job = applySheet(job, `line:${blankId}:mark`, '手', kk).job;
  assert.equal(formLines(job, S, 'kouiki', {all: true})[2].mark, '手');
  job = applySheet(job, `line:${blankId}:qty`, '1.2', kk).job;
  const rows = job.places[0].rows;
  assert.deepEqual(rows.map((r) => r.kind), ['material', 'labor', 'labor']);
  assert.equal(rows[2].estMark, undefined);
  assert.equal(estimateTotals(job, S).work, 2000 + 3000);

  // 空白の行を「材」にしたら、字だけ（打った内容は部材のまま）
  const b2 = insertBlankAfter(job, rows[0].id).job;
  const b2Id = b2.places[0].rows.find((r) => r.kind === 'material' && r.id !== matId)!.id;
  const m2 = applySheet(b2, `line:${b2Id}:mark`, '材', kk).job;
  assert.equal(m2.places[0].rows.find((r) => r.id === b2Id)?.estMark, '材');

  // 空いた行（打ち込める行より下）の材／手：あいだを空白の行でうめて、その行を「手」に
  const g = applySheet(job, 'gap:2:mark', '手', kk);
  const gRows = g.job.places[0].rows;
  assert.equal(gRows.length, rows.length + 2);
  assert.equal(gRows.at(-1)?.estMark, '手');
  assert.equal(g.key, `line:${gRows.at(-1)?.id}:mark`);
});

// 2026-11-08 の全体のデバッグで直したこと
test('空の部材の行が部材と同上施工費のあいだにあっても、施工費は上の部材のもの（介護保険の対象外も）。✕で消すのは空の行だけ', () => {
  const {job} = type(emptyJob(), [
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
  ]);
  const [barRow, work] = job.places[0].rows;
  const blank = manualRow('material', {qty: 1});
  const j: Job = {...job, places: [{...job.places[0], rows: [{...barRow, excluded: true}, blank, work]}]};
  // 部材を介護保険の対象外にすると、その同上施工費も対象外（前は空の行の施工費になって対象に入った）
  assert.equal(estimateTotals(j, S).target.subtotal, 0);
  assert.equal(estimateTotals(j, S).all.subtotal, estimateTotals(job, S).all.subtotal);
  // 空の行を✕で消しても、下の施工費は消えない
  assert.deepEqual(deleteLine(j, blank.id).places[0].rows.map((r) => r.id), [barRow.id, work.id]);
});

test('貼り付けた施工費がすぐ上の施工費につながるとき、上の金額を手で直してあれば、貼り付けた分を足した金額にする', () => {
  const {job} = type(emptyJob(), [
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
  ]);
  const [barRow, work] = job.places[0].rows;
  const auto = formLines(job, S, 'yukuhashi').find((l) => l.text === '同上施工費')!.amount;
  const manual: Job = {...job, places: [{...job.places[0], rows: [barRow, {...work, estAmount: 5000}]}]};
  const res = pasteLines(manual, `line:${work.id}:text`, lineRows(job, work.id) ?? [], [], S);
  const works = formLines(res.job, S, 'yukuhashi').filter((l) => l.isWork);
  assert.deepEqual(works.map((l) => l.amount), [5000 + auto]);
  // 手で直していなければ、足した合計のまま（金額は持たない）
  const plain = pasteLines(job, `line:${work.id}:text`, lineRows(job, work.id) ?? [], [], S);
  assert.ok(plain.job.places[0].rows.every((r) => r.estAmount == null));
});

test('内容の欄で品名のうしろだけ書き足したら、メーカー・品番はそのまま（見積書に出す文字だけ変わる）', () => {
  const {job} = type(emptyJob(), [['new:text', 'インテリアバー', bar]]);
  const r = job.places[0].rows[0];
  const next = applySheet(job, `line:${r.id}:text`, 'TOTO TS136GY6 インテリアバー（右）', yk).job;
  const row = next.places[0].rows[0];
  assert.deepEqual([row.maker, row.code, row.name, row.estText], ['TOTO', 'TS136GY6', 'インテリアバー', 'TOTO TS136GY6 インテリアバー（右）']);
  assert.equal(formLines(next, S, 'yukuhashi')[0].text, 'TOTO TS136GY6 インテリアバー（右）');
  // メーカー・品番まで打ち直したら、今までどおり品名にする
  const other = applySheet(job, `line:${r.id}:text`, '別の手すり', yk).job.places[0].rows[0];
  assert.deepEqual([other.maker, other.code, other.name], ['', '', '別の手すり']);
});

test('数・金額の欄は「2個」「1.5時間」「3箇所」のように単位を付けて打っても読む', () => {
  assert.equal(parseNum('2個'), 2);
  assert.equal(parseNum('１．５時間'), 1.5);
  assert.equal(parseNum('3箇所'), 3);
  assert.equal(parseNum('1セット'), 1);
  assert.equal(parseNum('2m'), null); // 長さは parseLengthCm
});
