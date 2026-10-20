import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addOrderLine,
  applyOrderEdits,
  bumpOrderQty,
  emptyOrderEdits,
  findHalfMaterial,
  hacchuImport,
  orderBaseLines,
  photoLabel,
  planBars,
  removedLines,
  removeOrderLine,
  restoreOrderLine,
  setOrderQty,
  unitTotals,
} from '../../src/sasaoka/order.ts';
import {laborRow, materialRow, newPlace} from '../../src/sasaoka/rows.ts';
import type {Job, Material, Row} from '../../src/sasaoka/types.ts';

const mat = (id: string, name: string, code: string, pieceLengthM: number, unit = '本', price = 6000, listPrice = 18600): Material => ({
  id,
  name,
  price,
  listPrice,
  pieceLengthM,
  maker: 'マツ六',
  code,
  unit,
  favorite: true,
  updatedAt: 1,
});

const BD134 = mat('m134', 'BAUHAUS 35アッシュ丸棒 ディンプル付 φ35×4000mm Mオーク', 'BD-134', 4);
const BD132 = mat('m132', 'BAUHAUS 35アッシュ丸棒 ディンプル付 φ35×2000mm Mオーク', 'BD-132', 2, '本', 3200, 9800);
const PLATE4 = mat('mp4', 'ベースプレート 80mm幅 4000mm', 'BP-80-4000', 4, '枚', 4000, 8000);
const PLATE2 = mat('mp2', 'ベースプレート 80mm幅 2000mm', 'BP-80-2000', 2, '枚', 2100, 4200);
const BRACKET: Material = {id: 'mb', name: 'ブラケット', price: 500, listPrice: 1000, pieceLengthM: 0, maker: 'マツ六', code: 'BR-1', unit: '個', favorite: false, updatedAt: 1};

const RATE = 0.8; // 見積の掛率（写真番号を見積書と同じに数えるのに使う）

/** 切って使う行（使う長さ cm × 本数） */
const cut = (m: Material, cm: number, qty = 1): Row => ({...materialRow(m, qty), lengthCm: cm});

const job = (...places: [string, Row[]][]): Job => ({
  id: 'j1',
  month: '2026-10',
  customer: '山田',
  suffix: '様邸',
  staff: '藤田 太郎',
  date: '',
  address: '福岡県行橋市中央1-1',
  note: '',
  insuredNo: '',
  form: '',
  overhead: null,
  overheadTarget: null,
  shikiri: true,
  places: places.map(([name, rows]) => newPlace(name, rows)),
  createdAt: 1,
  updatedAt: 1,
});

const brief = (lines: ReturnType<typeof orderBaseLines>) => lines.map((l) => [l.code, l.qty, l.unit]);

test('切って使う部材の本数：余りが0.1本より少なければもう1本、2000mmで足りる1本は2000mm', () => {
  const p = (pieces: [number, number][], halfOk = true) => {
    const r = planBars(
      pieces.map(([mm, count]) => ({mm, count})),
      4000,
      halfOk,
    );
    return [r.full, r.half, r.slackMm, r.extra];
  };
  assert.deepEqual(p([[600, 2], [1600, 1]]), [1, 0, 1200, false]); // 0.15本×2＋0.4本＝0.7本 → 4000mm 1本
  assert.deepEqual(p([[1600, 1]]), [0, 1, 400, false]); // 0.4本 → 2000mm 1本（余り 400mm ＝ 0.1本）
  assert.deepEqual(p([[1800, 1]]), [1, 0, 2200, false]); // 2000mm だと余り 200mm で危ない → 4000mm
  assert.deepEqual(p([[3800, 1]]), [1, 1, 2200, true]); // 余り 200mm → 2000mm をもう1本
  assert.deepEqual(p([[4000, 1]]), [1, 1, 2000, true]); // ちょうど1本 → もう1本
  assert.deepEqual(p([[2100, 2]]), [2, 0, 3800, false]); // 2100mm は 2000mm から切れない
  assert.deepEqual(p([[1500, 3]]), [1, 1, 1500, false]); // 4000mm に2本、2000mm に1本
  assert.deepEqual(p([[4500, 1]]), [1, 1, 1500, false]); // 1本より長い（継ぐ）→ 4000mm＋残り 500mm は 2000mm
  assert.deepEqual(p([[3800, 1]], false), [2, 0, 4200, true]); // 2000mm がない部材は 4000mm をもう1本
});

test('2000mmの品を部材リストから探す（長さだけ違う同じ品。品番 BD-134 → BD-132 も手がかり）', () => {
  assert.equal(findHalfMaterial(materialRow(BD134), 4000, [BD134, BD132, PLATE2])?.id, 'm132');
  assert.equal(findHalfMaterial(materialRow(PLATE4), 4000, [BD134, BD132, PLATE4, PLATE2])?.id, 'mp2');
  assert.equal(findHalfMaterial(materialRow(BD134), 4000, [BD134, PLATE4]), null); // 長さの違う別の品は選ばない
  // 名前の書き方が違っても、品番の見当（BD-132）で選ぶ
  const other = {...BD132, name: '丸棒 2m'};
  assert.equal(findHalfMaterial(materialRow(BD134), 4000, [BD134, other])?.id, 'm132');
});

test('見積書の部材を、箇所をまたいで足して発注する数にする（手すりは本・ベースプレートは枚）', () => {
  const j = job(
    ['玄関', [cut(BD134, 60, 2), laborRow({id: 'l1', name: '木', price: 1000, note: ''}, 2), materialRow(BRACKET, 3)]],
    ['トイレ', [cut(BD134, 160), materialRow(BRACKET, 2), cut(PLATE4, 380)]],
  );
  const lines = orderBaseLines(j, [BD134, BD132, PLATE4, PLATE2, BRACKET], RATE);
  assert.deepEqual(brief(lines), [
    ['BD-134', 1, '本'],
    ['BR-1', 5, '個'],
    ['BP-80-4000', 1, '枚'],
    ['BP-80-2000', 1, '枚'],
  ]);
  // 計算の説明（使う長さ・余り・箇所ごとの数）は持たない。発注書には何を何本かだけを出す（ユーザーの指示）
  assert.ok(lines.every((l) => !('detail' in l)));
  assert.deepEqual([lines[3].price, lines[3].listPrice, lines[3].lengthMm, lines[3].warn], [2100, 4200, 2000, '']);
  // どこで使うか：玄関①・トイレ②。2000mm の行（足す分）も同じ箇所
  assert.deepEqual(lines.map((l) => l.photos), [[1, 2], [1, 2], [2], [2]]);
});

test('どこで使うか（写真番号）：見積書と同じ番号。入れた写真番号を使い、入れていなければ見積書に出る順番', () => {
  const j = job(
    ['玄関', [materialRow(BRACKET, 2)]],
    ['廊下', []], // 行のない箇所は見積書に出ないので数えない
    ['トイレ', [materialRow(BRACKET, 1), cut(BD134, 80)]],
    ['浴室', [cut(BD134, 60)]],
  );
  j.places[0].photo = 5;
  const lines = orderBaseLines(j, [BD134, BD132, BRACKET], RATE);
  assert.deepEqual(lines.map((l) => [l.code, l.photos]), [
    ['BR-1', [2, 5]], // 小さい順
    ['BD-132', [2, 3]], // 80cm＋60cm は 2000mm 1本で足りる
  ]);
  assert.equal(photoLabel([2, 5]), '②⑤');
  assert.equal(photoLabel([20, 21]), '⑳(21)');
  assert.deepEqual(addOrderLine(emptyOrderEdits(), {...materialRow(PLATE2), qty: 1}).added[0].photos, []); // 発注書で足した行は持たない
});

test('2000mmだけで足りるときは2000mmの品だけを発注する。部材リストに2000mmの品がなければ品番を空けて知らせる', () => {
  const j = job(['廊下', [cut(BD134, 160)]]);
  const withHalf = orderBaseLines(j, [BD134, BD132], RATE);
  assert.deepEqual(brief(withHalf), [['BD-132', 1, '本']]);
  assert.equal(withHalf[0].name, BD132.name);

  const noHalf = orderBaseLines(j, [BD134], RATE);
  assert.deepEqual(brief(noHalf), [['', 1, '本']]);
  assert.equal(noHalf[0].name, 'BAUHAUS 35アッシュ丸棒 ディンプル付 φ35×2000mm Mオーク');
  assert.match(noHalf[0].warn, /2000mmの品が部材リストにありません/);
  assert.deepEqual([noHalf[0].price, noHalf[0].listPrice], [0, 0]);
});

test('施工費・何も入っていない行・金額だけの行は発注しない。規格品は見積書の数量のまま', () => {
  const blank: Row = {...materialRow(BRACKET), refId: null, name: '', code: '', maker: '', unit: '', price: 0, listPrice: 0};
  const valueOnly: Row = {...blank, price: -3000};
  const bar = materialRow({...BD134, id: 'mx', name: '既製の手すり 600mm', code: 'K-600', pieceLengthM: 0.6}, 2); // 切らずに使う
  const j = job(['浴室', [blank, valueOnly, laborRow({id: 'l1', name: '木', price: 1000, note: ''}), bar]]);
  assert.deepEqual(brief(orderBaseLines(j, [], RATE)), [['K-600', 2, '本']]);
});

test('発注書で数を直す・消す・戻す・足す（見積書を直しても、手で直したところは残る）', () => {
  const j = job(['玄関', [cut(BD134, 160, 2), materialRow(BRACKET, 3)]]);
  const base = orderBaseLines(j, [BD134, BRACKET], RATE);
  let e = emptyOrderEdits();
  e = setOrderQty(e, base[0], 2);
  e = removeOrderLine(e, base[1]);
  e = addOrderLine(e, {...materialRow(PLATE2), qty: 1});
  e = addOrderLine(e, {...materialRow(PLATE2), qty: 1}); // 同じ部材は数を足す
  assert.deepEqual(brief(applyOrderEdits(base, e)), [
    ['BD-134', 2, '本'],
    ['BP-80-2000', 2, '枚'],
  ]);
  assert.deepEqual(removedLines(base, e).map((l) => l.code), ['BR-1']);
  // 見積書から計算した数に戻すと、直した印は消える
  assert.deepEqual(setOrderQty(e, base[0], 1).qty, {});
  // 部材リストから同じ部材を足したときは、その行の数を増やす（直した数があればそこから）
  assert.equal(bumpOrderQty(e, base[0], 1).qty[base[0].key], 3);
  assert.equal(bumpOrderQty(emptyOrderEdits(), base[1], 2).qty[base[1].key], 5);
  e = restoreOrderLine(e, base[1].key);
  assert.deepEqual(brief(applyOrderEdits(base, e)).map((x) => x[0]), ['BD-134', 'BR-1', 'BP-80-2000']);
  // 見積書に部材が増えても、直した数はそのまま
  const more = orderBaseLines(job(['玄関', [cut(BD134, 160, 2), materialRow(BRACKET, 4), cut(PLATE4, 100)]]), [BD134, BRACKET, PLATE4, PLATE2], RATE);
  assert.deepEqual(brief(applyOrderEdits(more, e)), [
    ['BD-134', 2, '本'],
    ['BR-1', 4, '個'],
    ['BP-80-2000', 1, '枚'],
    ['BP-80-2000', 2, '枚'],
  ]);
  assert.equal(unitTotals(applyOrderEdits(more, e)), '2本・4個・3枚');
});

test('販売受注簿へ渡す内容（数量は1以上の整数・営業担当は名字・数が0の行は渡さない）', () => {
  const j = job(['玄関', [cut(BD134, 160, 2), materialRow(BRACKET, 3)]]);
  const base = orderBaseLines(j, [BD134, BRACKET], RATE);
  const e = {...setOrderQty(emptyOrderEdits(), base[1], 0), supplier: 'ケアマックス'};
  const lines = applyOrderEdits(base, e);
  const payload = hacchuImport(j, lines, e);
  assert.equal(payload.kind, 'taiyo-jutaku-order');
  assert.deepEqual([payload.title, payload.customerName, payload.sales, payload.supplier, payload.address], [
    '山田様邸 住宅改修',
    '山田',
    '藤田',
    'ケアマックス',
    '福岡県行橋市中央1-1',
  ]);
  assert.deepEqual(payload.items, [
    {
      productName: BD134.name,
      maker: 'マツ六',
      modelNumber: 'BD-134',
      quantity: 1,
      unit: '本',
      listPrice: 18600,
      cost: 6000,
      note: '', // 計算の説明は渡さない
    },
  ]);
  const half = {...base[0], qty: 0.5};
  assert.equal(hacchuImport(j, [half], null).items[0].quantity, 1);
});
