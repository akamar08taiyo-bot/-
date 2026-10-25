import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultSettings} from '../../src/tokutei/defaults.ts';
import {CATALOG_SITES, itemFromScan, SCAN_PATH, scanDraft} from '../../src/tokutei/scanItem.ts';

// 販売見積書の「📷 スクショから自動認識」（ユーザーの指示「スクショから切り取って作成にすると、自動認識を使えるようにする。
// ケアマックスとウェルファンのカタログにも飛べるように、リンクも準備」2026-10-25）。読み取りは受注簿ツールの ?embed=scan。商品は架空

test('受注簿ツールの読み取りだけを出す。カタログはケアマックス（介援隊）とウェルファン', () => {
  assert.equal(SCAN_PATH, '/taiyo-hacchu-scan/?embed=scan');
  assert.deepEqual(
    CATALOG_SITES.map((c) => [c.name, c.url]),
    [
      ['ケアマックス（介援隊）', 'https://www.kaientai.cc/Default.aspx'],
      ['ウェルファン', 'https://www.welfan.shop/'],
    ],
  );
});

test('読み取った値を右の欄に：商品名・メーカー・型番・定価・仕切り・税・単位・発注先。種目は商品名から', () => {
  const d = scanDraft({productName: ' シャワーベンチ 見本A ', maker: '見本化成', modelNumber: 'SB-01', catalogNumber: '123456', listPrice: '35000', listPriceTaxIn: '38500', cost: '21000', taxType: '10%', unit: '台', supplier: 'ケアマックス'});
  assert.deepEqual(d, {name: 'シャワーベンチ 見本A', maker: '見本化成', code: 'SB-01', listPrice: 35000, cost: 21000, taxType: '10%', unit: '台', supplier: 'ケアマックス', category: '入浴補助用具', sub: '入浴用いす'});
  // 定価（税抜）がなく税込だけ：税込から戻す。金額の「,」「円」・全角の数字も読む。知らない税は 10%、単位が空なら「台」
  const t = scanDraft({productName: '4点杖 見本B', listPrice: '', listPriceTaxIn: '１３，２００円', cost: '7,200', taxType: '5%', unit: ''})!;
  assert.deepEqual([t.listPrice, t.cost, t.taxType, t.unit, t.category], [12000, 7200, '10%', '台', '歩行補助つえ']);
  assert.equal(scanDraft({productName: '4点杖 見本B', listPriceTaxIn: '13200', taxType: '非課税'})!.listPrice, 13200);
  // まだ読んでいない・読めなかった（商品名・型番・定価・仕切りのどれもない）
  assert.equal(scanDraft({productName: '', maker: '見本化成', supplier: 'ケアマックス'}), null);
  assert.equal(scanDraft(null), null);
  assert.equal(scanDraft('x'), null);
});

test('見積書の商品の1行にする（商品マスタの商品ではない。割引率は設定の初めの値・販売単価は定価から）', () => {
  const s = defaultSettings();
  const item = itemFromScan(scanDraft({productName: 'シャワーベンチ 見本A', maker: '見本化成', modelNumber: 'SB-01', listPrice: '35000', cost: '21000', supplier: 'ウェルファン'})!, s);
  assert.deepEqual(
    [item.productId, item.name, item.maker, item.code, item.category, item.listPrice, item.cost, item.qty, item.discountRate, item.unitPrice, item.supplier, item.unit],
    [null, 'シャワーベンチ 見本A', '見本化成', 'SB-01', '入浴補助用具', 35000, 21000, 1, s.discountRate, null, 'ウェルファン', '台'],
  );
  assert.match(item.id, /^i/);
});
