// 介援隊カタログの種目・品目（ユーザーの指示「アプリ側がカタログをみて、入浴補助用具、腰掛便座などの判別がついていない…シャワーキャリーはシャワーチェア、
// ラップポンは、腰掛便座など、カタログ一覧の全ての項目でわかるようにする。シャワーチェアを選んだら、シャワーチェアの一覧のみが商品一覧からさがせるようにする」2026-11-01）：
//   ① 商品マスタの取り込みに介援隊カタログの PDF（p.50 シャワーキャリー・p.47 すべり止めマット）を入れる → カタログとして読み、定価にカタログの金額・仕切は空欄、
//      シャワーキャリーは「入浴補助用具（シャワーチェア）」でチェック済み、マットは対象外でチェックなし
//   ② お気に入りから入力の画面：入浴のタブ → 品目「シャワーチェア」で、シャワーキャリーだけ（マットは出ない）
//   ③ カタログの窓のページの一覧に、ページごとの品目（シャワーキャリーのページは「シャワーチェア」）
// 使い方：npm run -s build:tokutei のあと node test/tokutei/e2e-catalog.mjs [出力フォルダ]
// 金額は確かめるだけで、テストにもリポジトリにも書かない（ユーザーの指示「リポジトリに仕入れや定価は残さない」）

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, {recursive: true});

const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const catalogDir = new URL('../../public-tokutei/catalog/', import.meta.url).pathname;
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const catalog = /\/catalog\/([\w.-]+\.(?:pdf|json|jpg))$/.exec(path); // PDF と、ビルドで作った文字の一覧（text.json）・ページの絵（jpg）
  const file = catalog ? join('catalog', catalog[1]) : path.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    const body = readFileSync(join(dist, file));
    res.writeHead(200, {'content-type': catalog ? (catalog[1].endsWith('.json') ? 'application/json' : catalog[1].endsWith('.jpg') ? 'image/jpeg' : 'application/pdf') : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5193);
await new Promise((r) => server.listen(port, r));
const url = `http://localhost:${port}/tokutei/`;

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    } catch {
      /* about:blank では使えない */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => void d.accept());
  await page.goto(url);
  await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();

  // ---- ① 商品マスタの取り込み：カタログの PDF を2つ（1つずつ）
  await page.getByRole('button', {name: '📦 商品マスタ'}).click();
  let imported = 0;
  let chairs = 0;
  for (const [file, expect] of [
    ['kaientai-p050.pdf', 'carrier'],
    ['kaientai-p044.pdf', 'bath'],
    ['kaientai-p047.pdf', 'mat'],
  ]) {
    await page.getByRole('button', {name: '📄 仕切り一覧表を取り込む'}).click();
    await page.getByLabel('仕切り一覧表のファイル').setInputFiles(join(catalogDir, file));
    await page.getByText('📖 介援隊カタログとして読みました').waitFor({timeout: 60000});
    const imp = page.getByRole('dialog');
    const rows = imp.locator('tbody tr');
    const n = await rows.count();
    assert.ok(n > 0, file);
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const checked = await row.locator('input[type=checkbox]').isChecked();
      const cat = await row.locator('select').inputValue();
      if (expect !== 'mat') {
        assert.ok(checked, `${file} ${i} チェック`);
        assert.equal(cat, '入浴補助用具');
        assert.match(await row.innerText(), expect === 'carrier' ? /シャワーチェア/ : /浴槽台|浴槽手すり/);
      } else {
        assert.ok(!checked, `${file} ${i} マットはチェックしない`);
        assert.equal(cat, '');
        assert.match(await row.innerText(), /対象外/);
      }
    }
    if (expect === 'carrier') {
      // 定価・販売価格・仕切の3つの列。販売価格は「販売価格の割引率」の欄を変えると、みな一度に変わる（ユーザーの指示「定価、販売価格、仕切りの３つに分けて、
      // 販売価格の部分は、新たに設けた割引率の欄を変更することによって一律で一斉に変更できるようにする」2026-11-01）。金額は計算が合うかだけを見る
      const heads = (await imp.locator('thead th').allInnerTexts()).map((t) => t.trim());
      assert.deepEqual(heads.filter((t) => /定価|販売価格|仕切/.test(t)), ['定価（税抜）', '販売価格（税抜）', '仕切（税抜）']);
      const saleOk = async (rate) => {
        for (let i = 0; i < n; i++) {
          const row = rows.nth(i);
          const list = Number((await row.getByLabel('定価').inputValue()).replace(/[^\d]/g, ''));
          const sale = Number((await row.locator('[data-sale-price]').innerText()).replace(/[^\d]/g, ''));
          assert.equal(sale, Math.floor((list * (100 - rate)) / 100), `${i} ${rate}%`);
        }
      };
      await saleOk(20); // 初めは設定の割引率（20%）
      await imp.getByLabel('販売価格の割引率').fill('25');
      await saleOk(25);
      assert.equal(await imp.getByText('定価の25%引き').count(), n);
      await page.screenshot({path: `${out}/c1-import-catalog.png`});
    }
    if (expect !== 'mat') {
      const btn = imp.getByRole('button', {name: /^商品マスタに取り込む（\d+件）$/});
      const k = Number(/（(\d+)件）/.exec(await btn.innerText())[1]);
      assert.equal(k, n);
      imported += k;
      if (expect === 'carrier') chairs = k;
      await btn.click();
      await page.getByText(`全${imported}件`).waitFor();
    } else {
      await page.screenshot({path: `${out}/c2-import-mats.png`});
      await imp.getByRole('button', {name: /閉じる|やめる|キャンセル/}).first().click();
    }
  }
  await page.getByText(`全${imported}件`).waitFor();
  // 商品マスタも 定価・販売価格・仕切 の順。シャワーキャリー（25% で取り込んだ）は「定価の25%引き」、ほかは 20%
  assert.equal(await page.getByText('定価の25%引き').count(), chairs);
  assert.equal(await page.getByText('定価の20%引き').count(), imported - chairs);
  // 表示中の商品の割引率をまとめて変える
  await page.getByLabel('表示中の商品の割引率').fill('30');
  await page.getByRole('button', {name: `表示中の${imported}件に`}).click();
  await page.getByText('定価の30%引き').first().waitFor();
  assert.equal(await page.getByText('定価の30%引き').count(), imported);
  // 仕切は空欄なので、利益率は出さない（ユーザーの指示「仕切りは空白で良い。なので、利益率はわかりません」2026-11-01）
  assert.equal(await page.getByText(/利益率/).count(), 0);
  await page.screenshot({path: `${out}/c3-products.png`, fullPage: true});

  // ---- ② 見積もり → 定価の横の「★ お気に入りから入力」→ 入浴 → 品目「シャワーチェア」
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  if (!(await page.getByRole('button', {name: '＋ 苅田町'}).count())) await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 苅田町'}).click();
  await page.screenshot({path: `${out}/c3b-new-sale.png`});
  await page.getByRole('button', {name: '★ お気に入りから入力'}).first().click();
  await page.screenshot({path: `${out}/c3c-picker-open.png`});
  const dlg = page.getByRole('dialog', {name: 'お気に入りから入力'});
  await dlg.getByRole('button', {name: /^すべて（\d+）$/}).click();
  const subs = dlg.getByRole('group', {name: '品目'});
  assert.deepEqual(await subs.getByRole('button').allInnerTexts(), ['すべての品目', 'シャワーチェア', '浴槽手すり', '浴槽台']);
  await subs.getByRole('button', {name: 'シャワーチェア'}).click();
  await dlg.locator('li').nth(chairs).waitFor({state: 'detached'}); // 絞り終わるのを待つ
  const names = await dlg.locator('li div.truncate.font-bold').allInnerTexts();
  assert.equal(names.length, chairs);
  assert.ok(names.every((n) => !/マット|浴槽/.test(n)), names.join(','));
  assert.match(await dlg.locator('li').first().innerText(), /入浴補助用具（シャワーチェア）/);
  await page.screenshot({path: `${out}/c4-product-picker.png`});
  await dlg.getByRole('button', {name: '閉じる'}).last().click();

  // ---- ③ カタログの窓：ページの一覧に品目
  await page.getByRole('button', {name: '📖 カタログから商品検索'}).first().click(); // 何も入れていない商品の欄：全部のページ
  const viewer = page.getByRole('dialog', {name: 'カタログ'});
  const pages = viewer.getByRole('group', {name: 'カタログのページ'});
  await pages.getByRole('button').first().waitFor();
  const labels = await pages.getByRole('button').allInnerTexts();
  const carrierPage = labels.find((l) => /p\.50/.test(l));
  assert.ok(carrierPage && /シャワーチェア/.test(carrierPage), carrierPage);
  assert.ok(labels.find((l) => /p\.47/.test(l))?.includes('介護保険の対象外'));
  assert.ok(labels.find((l) => /p\.172/.test(l))?.includes('ポータブルトイレ'));
  await page.screenshot({path: `${out}/c5-catalog-pages.png`});

  // ---- ④ 同じ名前の品番（p.173 家具調トイレ セレクトS）：色・品番を選ぶ欄に「ノーマル 標準便座 快適脱臭」などの違いが出る
  //（ユーザーの指示「脱臭や暖房など、型番だけでなく、商品をえらびやすいようにする」2026-11-04。前はどれも「家具調トイレセレクトSシリーズ」だけ）
  await pages.getByRole('button', {name: /p\.173/}).click();
  const selectS = viewer.getByRole('button', {name: '家具調トイレセレクトSシリーズを選ぶ'});
  await selectS.waitFor({timeout: 30000});
  await selectS.click();
  const chooser = viewer.getByRole('dialog', {name: '色・品番を選ぶ'});
  await chooser.waitFor();
  const variants = (await chooser.getByRole('button').filter({hasText: /534-0/}).allInnerTexts()).map((t) => t.replace(/定価.*$/s, '').replace(/\s+/g, ' ').trim());
  assert.equal(variants.length, 12);
  assert.equal(new Set(variants).size, 12, variants.join(' | '));
  assert.ok(variants.includes('ノーマル 標準便座 快適脱臭 534-023'), variants.join(' | '));
  assert.ok(variants.includes('はねあげ 暖房便座 534-028'), variants.join(' | '));
  await page.screenshot({path: `${out}/c6-catalog-variants.png`});

  assert.deepEqual(errors, []);
  console.log(`ok: カタログの取り込み（${imported}件・定価・仕切は空欄）→ お気に入りから入力（品目シャワーチェア）→ カタログのページの品目`);
} finally {
  await browser.close();
  server.close();
}
