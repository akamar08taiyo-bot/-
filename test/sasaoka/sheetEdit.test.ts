import assert from 'node:assert/strict';
import test from 'node:test';
import {estimateTotals, jobTotals} from '../../src/sasaoka/calc.ts';
import {formLines} from '../../src/sasaoka/estimateForms.ts';
import {placeFromDims, withBrackets} from '../../src/sasaoka/cutLink.ts';
import {laborRow, manualRow, materialRow, newPlace} from '../../src/sasaoka/rows.ts';
import {
  applySheet,
  clearedSheet,
  deleteLine,
  dropEmptyPlaces,
  insertBlankAfter,
  isEmptyPlace,
  lineRows,
  parseKind,
  parseLengthCm,
  parseListNote,
  parseNum,
  parsePlace,
  pasteLines,
  setWorkAmount,
  sheetValue,
  toggleExcluded,
  toolPlace,
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
  // 最後の箇所の、ただ1つの行を消す → 箇所も消えて、改修内容・改修場所も出ない
  job = deleteLine(job, job.places[1].rows[0].id);
  assert.deepEqual(job.places.map((p) => p.name), ['玄関']);
  assert.ok(formLines(job, S, 'yukuhashi').every((l) => l.placeName === '玄関'));
  // 残りの1行も消すと、箇所がなくなる
  job = deleteLine(job, railRow.id);
  assert.deepEqual(job.places, []);
  assert.equal(deleteLine(job, 'no-such-row'), job);
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

test('行を切り取って貼り付け：貼り付けた所に移る（もとの行は消え、箇所の行がなくなれば箇所も消える）', () => {
  let {job} = type(emptyJob(), [
    ['new:name', '玄関'],
    ['new:text', 'インテリアバー', bar],
    ['new:name', 'トイレ'],
    ['new:text', '木の手すり 35φ 4m', rail],
  ]);
  const [genkan, toilet] = job.places;
  const moved = pasteLines(job, `line:${toilet.rows[0].id}:text`, lineRows(job, genkan.rows[0].id) ?? [], [genkan.rows[0].id]);
  job = moved.job;
  assert.deepEqual(job.places.map((p) => [p.name, p.rows.map((r) => r.name)]), [['トイレ', ['木の手すり 35φ 4m', 'インテリアバー']]]);
  assert.equal(moved.rowId, job.places[0].rows[1].id);
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

test('申請書のタブで寸法・写真を入れた箇所は、見積書の ✕・切り取りで行がなくなっても消さない（空白の行にして残す）', () => {
  const bath = {...newPlace('浴室', [manualRow('material', {qty: 1})]), dims: {l: '800', h: '750'}, photos: {before: 'ph_before_1', after: 'ph_after_1'}, photoNote: '縦手すり'};
  const entry = newPlace('玄関', [materialRow(rail, 1)]);
  let job: Job = {...emptyJob(), places: [entry, bath]};
  // 空白の行の ✕：何もしない（前は箇所ごと寸法・写真まで消えた）
  assert.equal(deleteLine(job, bath.rows[0].id), job);
  // 行を入れてから ✕：箇所は空白の行にして残す
  job = {...job, places: [entry, {...bath, rows: [materialRow(bar, 1)]}]};
  job = deleteLine(job, job.places[1].rows[0].id);
  assert.deepEqual([job.places.length, job.places[1].rows.length, job.places[1].photos?.before, job.places[1].dims?.l], [2, 1, 'ph_before_1', '800']);
  assert.ok(formLines(job, S, 'yukuhashi')[1].blank);
  // 切り取って玄関に貼り付けても残る。申請書の内容のない箇所は今までどおり消える
  job = {...job, places: [entry, {...bath, rows: [materialRow(bar, 1)]}]};
  const moved = pasteLines(job, `line:${entry.rows[0].id}:text`, lineRows(job, job.places[1].rows[0].id) ?? [], [job.places[1].rows[0].id]).job;
  assert.deepEqual(moved.places.map((p) => [p.name, p.rows.length]), [['玄関', 2], ['浴室', 1]]);
  const plain = {...emptyJob(), places: [entry, newPlace('トイレ', [materialRow(bar, 1)])]};
  assert.deepEqual(deleteLine(plain, plain.places[1].rows[0].id).places.map((p) => p.name), ['玄関']);
  // 撮影日だけ・そのほかだけの箇所も残す（申請書の一覧の ✕ で聞く箇所と同じ）
  for (const extra of [{photoDates: {before: '2026-10-01'}}, {shinseiText: '木製'}]) {
    const kept = {...emptyJob(), places: [entry, {...newPlace('トイレ', [materialRow(bar, 1)]), ...extra}]};
    assert.deepEqual(deleteLine(kept, kept.places[1].rows[0].id).places.map((p) => p.name), ['玄関', 'トイレ']);
  }
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
