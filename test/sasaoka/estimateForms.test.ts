import assert from 'node:assert/strict';
import test from 'node:test';
import {circled, cutCalc, formForAddress, formLines, jobForm, materialText, paginate, photoNumbers, placeWork, reiwa} from '../../src/sasaoka/estimateForms.ts';
import type {Job, Place, Row} from '../../src/sasaoka/types.ts';

const S = {estimateRate: 0.8, estimateHourRate: 2500, estimateForm: 'yukuhashi'} as const;

let seq = 0;
const blank = {refId: null, code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false};
const mat = (name: string, listPrice: number, extra: Partial<Row> = {}): Row => ({...blank, id: `r${++seq}`, kind: 'material', name, qty: 1, listPrice, ...extra});
const lab = (price: number, qty = 1): Row => ({...blank, id: `r${++seq}`, kind: 'labor', name: '木', price, qty});
const place = (name: string, rows: Row[], extra: Partial<Place> = {}): Place => ({id: `p${++seq}`, name, rows, kind: 1, photo: 0, work: '', ...extra});

test('書式は住所の市町村から：みやこ町・築上町・豊前市など → 広域連合の様式、行橋市・苅田町 → 行橋の様式。分からなければ設定の書式', () => {
  assert.equal(formForAddress('福岡県京都郡みやこ町豊津1118'), 'kouiki');
  assert.equal(formForAddress('築上郡築上町椎田'), 'kouiki');
  assert.equal(formForAddress('福岡県豊前市八屋'), 'kouiki');
  assert.equal(formForAddress('築上郡上毛町'), 'kouiki');
  assert.equal(formForAddress('築上郡吉富町'), 'kouiki');
  assert.equal(formForAddress('行橋市東大橋2-1-7'), 'yukuhashi');
  assert.equal(formForAddress('京都郡苅田町富久町'), 'yukuhashi');
  assert.equal(formForAddress('北九州市小倉南区'), null);
  assert.equal(jobForm({form: '', address: 'みやこ町'}, S), 'kouiki');
  assert.equal(jobForm({form: 'yukuhashi', address: 'みやこ町'}, S), 'yukuhashi'); // 選んだ書式が先
  assert.equal(jobForm({form: '', address: ''}, {estimateForm: 'kouiki'}), 'kouiki');
});

test('みやこ町・築上町用：施工費は 時間×2,500円、部材は メーカー 品番 品名・定価は算出根拠に', () => {
  const job: Pick<Job, 'places'> = {
    places: [
      place('屋外', [
        mat('NTディンプルパイプ', 14400, {maker: '矢崎化工', code: 'HCDT-4000 T BBR', lengthCm: 280, pieceLengthM: 4}),
        mat('NT屋外支柱', 4600, {maker: '矢崎化工', code: 'HL7-P11 T USL', qty: 4, unit: '本'}),
        lab(5000),
        lab(1000, 2),
      ]),
      place('玄関', [], {photo: 5}), // 行のない箇所は出さない
      place('トイレ', [mat('エンドキャップ', 450, {unit: '個', qty: 2}), lab(1234)], {kind: 6, work: '手すり取付（2か所）'}),
    ],
  };
  const lines = formLines(job, S, 'kouiki');
  assert.deepEqual(
    lines.map((l) => [l.first, l.placeName, l.work, l.photo, l.mark, l.text, l.qty, l.unit, l.unitPrice, l.amount, l.listPrice, l.rate, l.cut, l.hourly]),
    [
      // 切って使う部材は「本」で書き、数量の計算（2.8m÷4m＝0.7本）を算出根拠に出す
      [true, '屋外', '手すり取付', 1, '材', '矢崎化工 HCDT-4000 T BBR NTディンプルパイプ', 0.7, '本', 11520, 8064, 14400, 0.8, '2.8m÷4m＝0.7本', false],
      [false, '屋外', '手すり取付', 1, '材', '矢崎化工 HL7-P11 T USL NT屋外支柱', 4, '本', 3680, 14720, 4600, 0.8, '', false],
      [false, '屋外', '手すり取付', 1, '手', '同上施工費', 2.8, '時間', 2500, 7000, 0, null, '', true], // 5,000＋2,000＝7,000円＝2.8時間
      [true, 'トイレ', '手すり取付（2か所）', 2, '材', 'エンドキャップ', 2, '個', 360, 720, 450, 0.8, '', false],
      [false, 'トイレ', '手すり取付（2か所）', 2, '手', '同上施工費', 1, '式', 1234, 1234, 0, null, '', false], // 時間で割り切れない金額は1式
    ],
  );
  // 行橋市・苅田町用は施工費を1式で書き、工事名称を入れていなければ改修の種類（手すりの取付）
  const yk = formLines(job, S, 'yukuhashi');
  assert.deepEqual(yk.map((l) => [l.work, l.qty, l.unit, l.unitPrice]).slice(0, 3), [
    ['手すりの取付', 0.7, '本', 11520],
    ['手すりの取付', 4, '本', 3680],
    ['手すりの取付', 1, '式', 7000],
  ]);
  assert.equal(placeWork({work: '', kind: 2}, 'kouiki'), '段差解消');
  assert.equal(placeWork({work: '', kind: 5}, 'yukuhashi'), '便器の取替');
});

test('写真番号：入れていなければ見積書に出る箇所の順番（行のない箇所は数えない）', () => {
  const job = {places: [place('玄関', [mat('手すり', 1000)]), place('廊下', []), place('トイレ', [mat('手すり', 1000)]), place('浴室', [mat('手すり', 1000)], {photo: 9})]};
  assert.deepEqual([...photoNumbers(job, 0.8).values()], [1, 2, 9]);
  assert.equal(circled(1), '①');
  assert.equal(circled(20), '⑳');
  assert.equal(circled(21), '(21)');
});

test('ページ分け：箇所の行はなるべく同じページに。最後のページの下4行は合計の欄', () => {
  const lines = (counts: number[]) => counts.flatMap((n, place) => Array.from({length: n}, (_, i) => ({place, i})));
  const sizes = (pages: unknown[][]) => pages.map((p) => p.length);
  assert.deepEqual(sizes(paginate(lines([3, 4]), 18)), [7]); // 1ページに入り、下に合計の4行
  assert.deepEqual(sizes(paginate(lines([10, 4]), 18)), [14]); // ちょうど14行＋合計4行
  assert.deepEqual(sizes(paginate(lines([10, 5]), 18)), [10, 5]); // 合計の欄が空かないので、最後の箇所を合計と同じページへ
  assert.deepEqual(sizes(paginate(lines([16]), 18)), [16, 0]); // 1つの箇所でいっぱいなら合計だけのページ
  assert.deepEqual(sizes(paginate(lines([3, 12]), 14)), [3, 12, 0]); // 送っても合計が入らない箇所は送らない
  assert.deepEqual(sizes(paginate(lines([10, 9]), 14)), [10, 9]); // 2つ目の箇所は次のページへ
  assert.deepEqual(sizes(paginate(lines([20]), 14)), [14, 6]); // 1ページに入らない箇所だけ分ける
  assert.deepEqual(sizes(paginate([], 14)), [0]);
});

test('部材の内容の書き方・切って使う部材の数量の計算', () => {
  assert.equal(materialText(mat('', 0)), '材料費'); // 金額だけの行
  assert.equal(materialText(mat('手すり', 0, {lengthCm: 60})), '手すり（長さ60cm）'); // 1本の長さが分からない
  const rail = mat('手すり 4m', 20000, {lengthCm: 60, pieceLengthM: 4});
  assert.equal(materialText(rail), '手すり 4m'); // 長さの計算は内容ではなく備考・算出根拠に
  assert.equal(cutCalc(rail), '0.6m÷4m＝0.15本');
  assert.equal(cutCalc({...rail, qty: 2}), '0.6m÷4m×2＝0.3本'); // 同じ長さを2本
  assert.equal(cutCalc({...rail, lengthCm: 130}), '1.3m÷4m＝0.325本');
  assert.equal(cutCalc({...rail, lengthCm: 0}), ''); // 規格品そのまま
  // 見積の単価を手で入れた行は「×0.8」を書かない
  const [line] = formLines({places: [place('玄関', [{...rail, estPrice: 15000}])]}, S, 'yukuhashi');
  assert.deepEqual([line.rate, line.unitPrice, line.amount], [null, 15000, 2250]);
});

test('令和の年月日', () => {
  assert.deepEqual(reiwa('2026-10-19'), {y: 8, m: 10, d: 19});
  assert.equal(reiwa(''), null);
});
