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
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {placeFromDims} from '../../src/sasaoka/cutLink.ts';
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

const RATE = {estimateRate: 0.8, estimateLaborRate: 1.5}; // 見積の率（写真番号を見積書と同じに数えるのに使う）

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

test('BD-134（Mオーク 4m）の 2000mm は BD-132（Mオーク 2m）。同じ 2m でも色ちがい（BD-122 クリア）は選ばない（ユーザーの「念のため」、2026-10-22）', () => {
  // マツ六の品番は BD-1［色］［長さ］（BD-122 クリア 2m・BD-124 クリア 4m・BD-132 Mオーク 2m・BD-134 Mオーク 4m）
  const oak4 = mat('o4', 'BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 4m', 'BD-134', 4);
  const clear2 = mat('c2', 'BAUHAUS 35アッシュ丸棒 ディンプル付 クリア 2m', 'BD-122', 2);
  const oak2 = mat('o2', 'BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 2m', 'BD-132', 2);
  assert.equal(findHalfMaterial(materialRow(oak4), 4000, [oak4, clear2, oak2])?.id, 'o2');
  // 部材リストの品名に色がない（2m の品名が同じ）ときは、品番の見当で BD-132
  const noColor = (m: Material) => ({...m, name: `35アッシュ丸棒 ディンプル付 ${m.pieceLengthM}m`});
  assert.equal(findHalfMaterial(materialRow(noColor(oak4)), 4000, [oak4, clear2, oak2].map(noColor))?.id, 'o2');
  // 品名の頭に品番が付いている書き方でも
  const coded = (m: Material) => ({...m, name: `${m.code} ${m.name}`});
  assert.equal(findHalfMaterial(materialRow(coded(oak4)), 4000, [oak4, clear2, oak2].map(coded))?.id, 'o2');
});

test('見積書の部材を、箇所をまたいで足して発注する数にする（手すりは本・ベースプレートは枚）', () => {
  const j = job(
    ['玄関', [cut(BD134, 60, 2), laborRow({id: 'l1', name: '木', price: 1000, estPrice: null, note: ''}, 2), materialRow(BRACKET, 3)]],
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

test('申請書の長さ（L=2100×2100）の合計が入った手すり・ベースプレートは、区切りごとに1本ずつ切って数える（2100mm×2 は 4000mm 2本）', () => {
  // 申請書で長さを入れると、見積書の手すり・ベースプレートの行（1行ずつ）に合計が入る（`placeFromDims`：4200mm＝1.05本）
  const withDims = (l: string, kind = 1) => {
    const j = job(['廊下', [materialRow(BD134, 1), materialRow(PLATE4, 1)]]);
    j.places[0] = placeFromDims({...j.places[0], kind, dims: {l}});
    return j;
  };
  const j = withDims('2100×2100');
  assert.deepEqual(j.places[0].rows.map((r) => [r.lengthCm, r.qty]), [[420, 1], [420, 1]]);
  // 合計の 4200mm を継いで数えると 4000mm 1本＋2000mm 1本になるが、2100mm は 2000mm からは切れない
  assert.deepEqual(brief(orderBaseLines(j, [BD134, BD132, PLATE4, PLATE2], RATE)), [
    ['BD-134', 2, '本'],
    ['BP-80-4000', 2, '枚'],
  ]);
  // 1本ずつ別の行に入れたときと同じ
  const sep = job(['廊下', [cut(BD134, 210), cut(BD134, 210)]]);
  assert.deepEqual(brief(orderBaseLines(sep, [BD134, BD132], RATE)), [['BD-134', 2, '本']]);
  // 2200mm＋1900mm は 4000mm から 2200mm、2000mm から 1900mm
  assert.deepEqual(brief(orderBaseLines(withDims('2200×1900'), [BD134, BD132, PLATE4, PLATE2], RATE)), [
    ['BD-134', 1, '本'],
    ['BD-132', 1, '本'],
    ['BP-80-4000', 1, '枚'],
    ['BP-80-2000', 1, '枚'],
  ]);
  // 600mm＋1800mm は今までどおり 4000mm 1本から切る
  assert.deepEqual(brief(orderBaseLines(withDims('600×1800'), [BD134, BD132, PLATE4, PLATE2], RATE)), [
    ['BD-134', 1, '本'],
    ['BP-80-4000', 1, '枚'],
  ]);
  // 見積書の長さが申請書の合計と違う（見積書で直した）ときは、見積書の長さのまま
  const edited = withDims('2100×2100');
  edited.places[0].rows = edited.places[0].rows.map((r) => ({...r, lengthCm: 300}));
  assert.deepEqual(brief(orderBaseLines(edited, [BD134, BD132, PLATE4, PLATE2], RATE)), [
    ['BD-134', 1, '本'],
    ['BP-80-4000', 1, '枚'],
  ]);
  // 手すりの取り付け（改修の種類 1）でない箇所の寸法は、手すりの長さにしない
  const other = withDims('2100×2100');
  other.places[0].kind = 2;
  assert.deepEqual(brief(orderBaseLines(other, [BD134, BD132, PLATE4, PLATE2], RATE)), [
    ['BD-134', 1, '本'],
    ['BD-132', 1, '本'],
    ['BP-80-4000', 1, '枚'],
    ['BP-80-2000', 1, '枚'],
  ]);
});

test('同じ2000mmの品（BD-132 をそのまま使う箇所と、BD-134 を切った残りを2000mmにした箇所）は1行にまとめる', () => {
  const j = job(['玄関', [cut(BD134, 160)]], ['トイレ', [materialRow(BD132, 1)]]);
  const lines = orderBaseLines(j, [BD134, BD132], RATE);
  assert.deepEqual(brief(lines), [['BD-132', 2, '本']]);
  assert.deepEqual([lines[0].calc, lines[0].photos, lines[0].lengthMm, lines[0].refId], [2, [1, 2], 2000, BD132.id]);
  // 部材リストから足すと、その行の数が増える（同じ品の2行目はない）
  const edits = bumpOrderQty(emptyOrderEdits(), lines[0], 1);
  assert.deepEqual(brief(applyOrderEdits(lines, edits)), [['BD-132', 3, '本']]);
  // 販売受注簿にも1行で渡す
  assert.deepEqual(hacchuImport(j, lines, null).items.map((i) => [i.modelNumber, i.quantity]), [['BD-132', 2]]);
  // 長さの違う品（4000mm）とはまとめない
  const k = job(['玄関', [cut(BD134, 380)]], ['トイレ', [materialRow(BD132, 1)]]);
  assert.deepEqual(brief(orderBaseLines(k, [BD134, BD132], RATE)), [
    ['BD-134', 1, '本'],
    ['BD-132', 2, '本'],
  ]);
});

test('施工費・何も入っていない行・金額だけの行は発注しない。規格品は見積書の数量のまま', () => {
  const blank: Row = {...materialRow(BRACKET), refId: null, name: '', code: '', maker: '', unit: '', price: 0, listPrice: 0};
  const valueOnly: Row = {...blank, price: -3000};
  const bar = materialRow({...BD134, id: 'mx', name: '既製の手すり 600mm', code: 'K-600', pieceLengthM: 0.6}, 2); // 切らずに使う
  const j = job(['浴室', [blank, valueOnly, laborRow({id: 'l1', name: '木', price: 1000, estPrice: null, note: ''}), bar]]);
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
  // フリガナ・電話番号・依頼者名（ケアマネジャー＝理由書の作成者）・納品予定日（施工日）も渡す（ユーザーの答え「すべてお願いします」2026-10-28）
  assert.deepEqual([payload.furigana, payload.tel, payload.requester, payload.deliveryDate], ['', '', '', '']);
  const full = hacchuImport({...j, date: '2026-11-05', shinsei: {...NO_SHINSEI, kana: 'ヤマダ　タロウ', phone: '０９３０－００－００００', reasonName: '見本 次郎'}}, lines, e);
  assert.deepEqual([full.furigana, full.tel, full.requester, full.deliveryDate], ['ヤマダ　タロウ', '0930-00-0000', '見本 次郎', '2026-11-05']);
});
