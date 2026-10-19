import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateTotals, jobTotals} from '../../src/sasaoka/calc.ts';
import {formLines} from '../../src/sasaoka/estimateForms.ts';
import {applySheet, parseKind, parseLengthCm, parseListNote, parseNum, parsePlace, setWorkAmount, sheetValue, toggleExcluded} from '../../src/sasaoka/sheetEdit.ts';
import type {Job, Material, Row, Settings} from '../../src/sasaoka/types.ts';

const S = {
  rate: 0.07,
  taxRate: 0.1,
  taxMode: 'original',
  invoiceTaxMode: 'perJob',
  totalTaxRounding: 'floor',
  estimateRate: 0.8,
  estimateOverheadRate: 0.1,
  estimateHourRate: 2500,
  estimateForm: 'yukuhashi',
} as const satisfies Pick<
  Settings,
  'rate' | 'taxRate' | 'taxMode' | 'invoiceTaxMode' | 'totalTaxRounding' | 'estimateRate' | 'estimateOverheadRate' | 'estimateHourRate' | 'estimateForm'
>;
const yk = {settings: S, form: 'yukuhashi'} as const;
const kk = {settings: S, form: 'kouiki'} as const;

const emptyJob = (): Job => ({
  id: 'j1', month: '2026-10', customer: '', suffix: '様邸', staff: '', date: '', address: '', note: '', insuredNo: '', form: '', overhead: null, overheadTarget: null,
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
  assert.deepEqual(parseListNote('8000'), {list: 8000, pieceM: null});
  assert.deepEqual(parseListNote('定価8,000円（税抜）×0.8'), {list: 8000, pieceM: null});
  assert.deepEqual(parseListNote('定価20,000円（4m）×0.8'), {list: 20000, pieceM: 4});
  assert.deepEqual(parseListNote('定価：￥24,300'), {list: 24300, pieceM: null});
  assert.equal(parseListNote('ご支給品'), null);
  assert.equal(parseKind('2'), 2);
  assert.equal(parseKind('⑤'), 5);
  assert.equal(parseKind('①手すりの取付'), 1);
  assert.equal(parseKind('段差解消'), 2);
  assert.equal(parseKind('便器'), 5);
  assert.equal(parseKind('なにか'), null);
  assert.deepEqual(parsePlace('浴室③'), {name: '浴室', photo: 3});
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
  assert.equal(sheetValue(job, `line:${id}:note`, yk), '11000');
  // 単価を手で入れる → ×0.8 はやめる。定価×0.8 と同じ金額を入れたら自動のまま
  ({job} = type(job, [[`line:${id}:price`, '8000']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.unitPrice, l.rate], [8000, null]);
  ({job} = type(job, [[`line:${id}:price`, '8800']]));
  assert.equal(job.places[0].rows[0].estPrice, null);
  // 定価をもう一度入れると、手で入れた単価はやめて 定価×0.8
  ({job} = type(job, [[`line:${id}:price`, '7000'], [`line:${id}:note`, '定価12,000円（税抜）×0.8']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.listPrice, l.unitPrice], [12000, 9600]);
  // 定価でない文字はそのまま備考に。消すと定価もなくなる（Excel で定価の欄を消したのと同じ）
  ({job} = type(job, [[`line:${id}:note`, 'ご支給品']]));
  assert.equal(job.places[0].rows[0].estNote, 'ご支給品');
  ({job} = type(job, [[`line:${id}:note`, '']]));
  assert.deepEqual([job.places[0].rows[0].listPrice, job.places[0].rows[0].estNote], [0, null]);
});

test('切って使う手すり：数量に 0.15 や 60cm を入れると 使う長さ÷1本の長さ。整数なら本数', () => {
  let {job} = type(emptyJob(), [['new:text', '木の手すり 35φ 4m', rail]]);
  const id = job.places[0].rows[0].id;
  ({job} = type(job, [[`line:${id}:qty`, '0.15']]));
  let r: Row = job.places[0].rows[0];
  assert.deepEqual([r.lengthCm, r.pieceLengthM, r.qty], [60, 4, 1]);
  let [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.qty, l.unit, l.unitPrice, l.amount, l.cut], [0.15, '本', 16000, 2400, '600÷4000＝0.15']);
  ({job} = type(job, [[`line:${id}:qty`, '90cm']]));
  [l] = formLines(job, S, 'yukuhashi');
  assert.deepEqual([l.qty, l.amount], [0.225, 3600]);
  ({job} = type(job, [[`line:${id}:qty`, '2']]));
  r = job.places[0].rows[0];
  assert.deepEqual([r.lengthCm, r.qty], [0, 2]);
  // 仕切り計算表は本数のまま（1本 10,000 × 2）
  assert.equal(jobTotals(job, S).material, 20000);
});

test('施工費：内容に「同上施工費」と入れて単価を入れる → 取付手間の行になり、仕切り計算表の取付手間も同じ金額', () => {
  const {job} = type(emptyJob(), [
    ['new:name', '玄関'],
    ['new:text', 'インテリアバー', bar],
    ['new:text', '同上施工費'],
    ['line:@:price', '2000'],
  ]);
  const rows = job.places[0].rows;
  assert.deepEqual(rows.map((r) => [r.kind, r.price, r.qty]), [['material', 5600, 1], ['labor', 2000, 1]]);
  const lines = formLines(job, S, 'yukuhashi');
  assert.deepEqual(lines.map((l) => [l.text, l.qty, l.unit, l.amount]), [['TOTO TS136GY6 インテリアバー', 1, '本', 6400], ['同上施工費', 1, '式', 2000]]);
  assert.deepEqual([estimateTotals(job, S).work, jobTotals(job, S).labor], [2000, 2000]);
  // みやこ町・広域連合用は時間で：数量に 1.2（時間）→ 1.2×2,500＝3,000円
  const head = rows[1].id;
  const k = applySheet(job, `line:${head}:qty`, '1.2', kk).job;
  assert.deepEqual([formLines(k, S, 'kouiki')[1].qty, formLines(k, S, 'kouiki')[1].amount, jobTotals(k, S).labor], [1.2, 3000, 3000]);
});

test('数えた取付手間（木 2箇所）の金額を見積書で直す → 数えた行は残し、差を「施工費（調整）」で足し引き', () => {
  const lab = (price: number, qty: number, refId: string): Row => ({
    id: `l${refId}${qty}`, kind: 'labor', refId, name: '木', price, qty, code: '', maker: '', unit: '', listPrice: 0, lengthCm: 0, pieceLengthM: 0,
    estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null,
  });
  const rows: Row[] = [lab(1000, 2, 'k1')];
  const up = setWorkAmount(rows, 0, 2500);
  assert.deepEqual(up.map((r) => [r.name, r.price, r.qty]), [['木', 1000, 2], ['施工費（調整）', 500, 1]]);
  const again = setWorkAmount(up, 0, 1800);
  assert.deepEqual(again.map((r) => [r.name, r.price, r.qty]), [['木', 1000, 2], ['施工費（調整）', -200, 1]]);
  const back = setWorkAmount(again, 0, 2000);
  assert.deepEqual(back.map((r) => [r.name, r.price, r.qty]), [['木', 1000, 2]]);
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
  job = applySheet(job, 'overhead:all', '800', yk).job;
  assert.equal(estimateTotals(job, S).all.overhead, 800);
  job = applySheet(job, 'overhead:all', '', yk).job;
  assert.equal(job.overhead, null);
  // 空のまま決めても行は増えない
  assert.equal(applySheet(job, 'new:qty', '', yk).job, job);
});
