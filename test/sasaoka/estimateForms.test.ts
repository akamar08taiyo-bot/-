import assert from 'node:assert/strict';
import test from 'node:test';
import {autoNote, circled, cutCalc, formForAddress, formLines, jobForm, lineNote, materialText, noteText, paginate, photoNumbers, placeWork, reiwa} from '../../src/sasaoka/estimateForms.ts';
import type {Job, Place, Row} from '../../src/sasaoka/types.ts';

const S = {estimateRate: 0.8, estimateHourRate: 2500, estimateForm: 'yukuhashi'} as const;

let seq = 0;
const blank = {refId: null, code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
const mat = (name: string, listPrice: number, extra: Partial<Row> = {}): Row => ({...blank, id: `r${++seq}`, kind: 'material', name, qty: 1, listPrice, ...extra});
const lab = (price: number, qty = 1): Row => ({...blank, id: `r${++seq}`, kind: 'labor', name: '木', price, qty});
const place = (name: string, rows: Row[], extra: Partial<Place> = {}): Place => ({id: `p${++seq}`, name, rows, kind: 1, photo: 0, ...extra});

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

test('みやこ町・広域連合用：施工費は 時間×2,500円、部材は メーカー 品番 品名・定価は算出根拠に', () => {
  const job: Pick<Job, 'places'> = {
    places: [
      place('屋外', [
        mat('NTディンプルパイプ', 14400, {maker: '矢崎化工', code: 'HCDT-4000 T BBR', lengthCm: 280, pieceLengthM: 4}),
        mat('NT屋外支柱', 4600, {maker: '矢崎化工', code: 'HL7-P11 T USL', qty: 4, unit: '本'}),
        lab(5000),
        lab(1000, 2),
      ]),
      place('玄関', [], {photo: 5}), // 行のない箇所は出さない
      place('トイレ', [mat('エンドキャップ', 450, {unit: '個', qty: 2}), lab(1234)], {kind: 5}),
    ],
  };
  const lines = formLines(job, S, 'kouiki');
  assert.deepEqual(
    lines.map((l) => [l.first, l.placeName, l.work, l.photo, l.mark, l.text, l.qty, l.unit, l.unitPrice, l.amount, l.listPrice, l.rate, l.cut, l.hourly]),
    [
      // 切って使う部材は「本」で書き、数量の計算（mm で 2800÷4000＝0.7）を算出根拠に出す
      [true, '屋外', '手すり取付', 1, '材', '矢崎化工 HCDT-4000 T BBR NTディンプルパイプ', 0.7, '本', 11520, 8064, 14400, 0.8, '2800÷4000＝0.7', false],
      [false, '屋外', '手すり取付', 1, '材', '矢崎化工 HL7-P11 T USL NT屋外支柱', 4, '本', 3680, 14720, 4600, 0.8, '', false],
      [false, '屋外', '手すり取付', 1, '手', '同上施工費', 2.8, '時間', 2500, 7000, 0, null, '', true], // 5,000＋2,000＝7,000円＝2.8時間
      [true, 'トイレ', '便器取替', 2, '材', 'エンドキャップ', 2, '個', 360, 720, 450, 0.8, '', false],
      [false, 'トイレ', '便器取替', 2, '手', '同上施工費', 1, '式', 1234, 1234, 0, null, '', false], // 時間で割り切れない金額は1式
    ],
  );
  // 苅田町・行橋用は施工費を1式で書き、改修内容は改修の種類（手すりの取付）。工事名称・改修内容は改修の種類だけで決まる
  const yk = formLines(job, S, 'yukuhashi');
  assert.deepEqual(yk.map((l) => [l.work, l.qty, l.unit, l.unitPrice]).slice(0, 3), [
    ['手すりの取付', 0.7, '本', 11520],
    ['手すりの取付', 4, '本', 3680],
    ['手すりの取付', 1, '式', 7000],
  ]);
  assert.equal(yk[3].work, '便器の取替');
  assert.equal(placeWork({kind: 2}, 'kouiki'), '段差解消');
  assert.equal(placeWork({kind: 5}, 'yukuhashi'), '便器の取替');
  assert.equal(placeWork({kind: 6}, 'kouiki'), '付帯工事');
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
  // 長さは mm で書く：60cm を 4m の手すりから → 600÷4000＝0.15
  assert.equal(cutCalc(rail), '600÷4000＝0.15');
  assert.equal(cutCalc({...rail, qty: 2}), '600÷4000×2＝0.3'); // 同じ長さを2本
  assert.equal(cutCalc({...rail, lengthCm: 130}), '1300÷4000＝0.325');
  assert.equal(cutCalc({...rail, lengthCm: 62.5, pieceLengthM: 3.6}), '625÷3600＝0.174'); // 割り切れない数量は小数3けたまで書く
  assert.equal(cutCalc({...rail, lengthCm: 0}), ''); // 規格品そのまま
  // 見積の単価を手で入れた行は「×0.8」を書かない
  const [line] = formLines({places: [place('玄関', [{...rail, estPrice: 15000}])]}, S, 'yukuhashi');
  assert.deepEqual([line.rate, line.unitPrice, line.amount], [null, 15000, 2250]);
});

test('見積書だけの内容・備考・施工費の金額（右に映す見積書で直したもの）', () => {
  const rail = mat('手すり 4m', 20000, {lengthCm: 60, pieceLengthM: 4, unit: '本'});
  const cap = mat('エンドキャップ', 450, {unit: '個', qty: 2, estText: 'エンドキャップ（木口用）', estNote: '定価450円\n（税抜）'});
  const wood = {...lab(1000, 2), estText: '手すり取付費', estAmount: 2500};
  const job = {places: [place('玄関', [rail, cap, wood])]};
  const [r, c, w] = formLines(job, S, 'yukuhashi');
  // 直していなければ元の内容・備考（定価8,000円×0.8 の形。切って使う部材は2行目に長さの計算）
  assert.deepEqual([r.text, r.autoText, r.note], ['手すり 4m', '手すり 4m', null]);
  assert.deepEqual(lineNote(r, 'yukuhashi', 2500), ['定価20,000円×0.8', '600÷4000＝0.15']);
  // 直した内容・備考（改行で2行）。元の内容は autoText に残る
  assert.deepEqual([c.text, c.autoText], ['エンドキャップ（木口用）', 'エンドキャップ']);
  assert.deepEqual(lineNote(c, 'yukuhashi', 2500), ['定価450円', '（税抜）']);
  assert.deepEqual(autoNote(c, 'yukuhashi', 2500), ['定価450円×0.8']);
  // 見積の単価を手で入れた行は ×0.8 を付けない
  assert.deepEqual(autoNote(formLines({places: [place('玄関', [{...cap, estPrice: 400, estNote: null}])]}, S, 'yukuhashi')[0], 'yukuhashi', 2500), ['定価450円']);
  // 施工費のまとまり：名前と金額は最初の手間の行のもの
  assert.deepEqual([w.isWork, w.text, w.autoText, w.amount, w.manualAmount, w.rowId, w.rowIds], [true, '手すり取付費', '同上施工費', 2500, true, wood.id, [wood.id]]);
  // みやこ町・広域連合用：2,500円は 1時間×2,500円 と書ける
  const k = formLines(job, S, 'kouiki');
  assert.deepEqual([k[2].qty, k[2].unit, k[2].unitPrice, k[2].amount, k[2].hourly], [1, '時間', 2500, 2500, true]);
  assert.deepEqual(lineNote(k[2], 'kouiki', 2500), ['1時間2,500円']);
  // 算出根拠も備考と同じ書き方（定価○円×0.8、2行目に長さの計算）
  assert.deepEqual(autoNote(k[0], 'kouiki', 2500), ['定価20,000円×0.8', '600÷4000＝0.15']);
  // 介護保険の対象外の行は、算出根拠（対象工事部分の欄）は空。苅田町・行橋用の備考は書く
  const ex = formLines({places: [place('玄関', [{...rail, excluded: true}])]}, S, 'kouiki')[0];
  assert.deepEqual([autoNote(ex, 'kouiki', 2500), autoNote(ex, 'yukuhashi', 2500)], [[], ['定価20,000円×0.8', '600÷4000＝0.15']]);
  // 手で直す欄の最初の文字
  assert.equal(noteText(['定価20,000円×0.8', '600÷4000＝0.15']), '定価20,000円×0.8\n600÷4000＝0.15');
});

test('令和の年月日', () => {
  assert.deepEqual(reiwa('2026-10-19'), {y: 8, m: 10, d: 19});
  assert.equal(reiwa(''), null);
});
