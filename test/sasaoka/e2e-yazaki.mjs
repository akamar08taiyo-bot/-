// 矢崎化工カタログ（yazakiCatalog.ts・YazakiCatalogView.tsx）：部材を選ぶ画面の「📖 矢崎化工カタログから選ぶ」と、部材の「📖 p.12」
// （ユーザーの指示「カタログの商品をクリックしたら、商品の内容が入るようにする」「リンクで商品検索や商品名、型番等をひっぱってこれるように」2026-11-04）：
//   部材リスト（架空の名前・金額。メーカー 矢崎化工）→ 見積書の空いた行の「部材」→ ECA-5032 USL の「📖 p.12」→ p.12 の絵（光っている枠）→
//   枠を押すと入る → 「ECL-5049」で探す → 色の記号のない品番（施工イメージ）の枠 → 色を選ぶ → 部材リストにない品番（品番だけの行）
// ページの絵は site の jutaku-mitsumori/catalog/（リポジトリの catalog-yazaki/ を置く）
// usage: node e2e-yazaki.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
import {clickStable, navItem} from './more.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------- 部材リスト（架空の名前・金額。メーカー 矢崎化工）
await (await navItem(page, '📦 部材・施工費マスタ')).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csv =
  '品番,品名,定価,仕切単価\n' +
  'ECA-5032 USL,見本 エンドブラケット,5000,3000\n' +
  'ECL-5049 USL,見本 支柱エンド 銀,4000,2400\n' +
  'ECL-5049 SGD,見本 支柱エンド 金,4000,2400\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mihon.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
await page.getByPlaceholder('例：マツ六').fill('矢崎化工');
await page.getByRole('button', {name: '部材リストに取り込む（3件）'}).click();
await page.getByText('新しく 3件').waitFor();

// ---------------- 見積書の空いた行の「部材」→ 部材を選ぶ画面
await (await navItem(page, '📝 見積もり・申請書を作成する')).click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
await clickStable(sheet.locator('tr[data-new] [data-pick="material"]'));
const dlg = page.getByRole('dialog');
await dlg.getByRole('button', {name: '📖 矢崎化工カタログから選ぶ'}).waitFor();
// 部材の「📖 p.12」（カタログに載っている矢崎化工の部材だけ）
const link = dlg.getByRole('button', {name: '見本 エンドブラケットのカタログのページを開く'});
assert.equal((await link.innerText()).trim(), '📖 p.12');
await link.click();
const cat = dlg.getByRole('region', {name: '矢崎化工カタログ'});
await cat.waitFor();
assert.equal(await cat.getByLabel('ページ', {exact: true}).inputValue(), '12');
const img = cat.getByRole('img', {name: '矢崎化工カタログ p.12'});
await img.waitFor();
await page.waitForFunction(() => document.querySelector('img[alt="矢崎化工カタログ p.12"]')?.naturalWidth > 0, null, {timeout: 15000});
const hot = cat.locator('[data-code="ECA-5032 USL"]').first(); // p.12 には2か所（商品の枠と、右の説明の「● ECA-5032 USL」）
assert.match(await hot.getAttribute('class'), /ring-4/); // 開いた部材の品番は光る
assert.match(await hot.getAttribute('class'), /border-emerald/); // 部材リストにある品番は緑の枠
await page.screenshot({path: path.join(outDir, 'yazaki-01-page.png')});
// 光らせた品番（ページの下の方）へスクロールしても、上の段（ページ送り・探す）と右の一覧は画面の中に残る
const inView = async (el) => {
  const b = await el.boundingBox();
  assert.ok(b && b.y >= 0 && b.y + b.height <= 900, `画面の外：${JSON.stringify(b)}`);
};
const hb = await hot.boundingBox();
assert.ok(hb && hb.y > 100 && hb.y < 900, `光る枠が見えない：${JSON.stringify(hb)}`);
await inView(cat.getByLabel('ページ', {exact: true}));
await inView(cat.getByLabel('カタログから探す'));
await inView(cat.getByText('p.12 の品番'));
// 枠を押すと入る
await hot.click();
await page.getByText('ECA-5032 USL を入れました').waitFor();
log('部材の「📖 p.12」→ p.12 の絵・光る枠 → 押すと入る OK');

// 品番で探す：ECL-5049（色の記号のない品番は施工イメージのページ）
await cat.getByLabel('カタログから探す').fill('ECL-5049');
const found = cat.getByRole('group', {name: '見つかったページ'});
const pages = (await found.getByRole('button').allInnerTexts()).map((t) => t.trim());
assert.ok(pages.includes('p.14') && pages.length >= 2, pages.join(','));
// 色の記号のない ECL-5049 の載っているページ（施工イメージ）へ
let pickedColor = false;
for (const p of pages) {
  await found.getByRole('button', {name: p, exact: true}).click();
  const bare = cat.locator('[data-code="ECL-5049"]');
  if (await bare.count()) {
    await bare.first().click();
    const choose = cat.getByRole('group', {name: 'ECL-5049の色・種類を選ぶ'});
    await choose.waitFor();
    assert.equal(await choose.getByRole('button', {name: /ECL-5049 (USL|SGD)/}).count(), 2);
    // 色を選ぶ欄・ページ送りは、ページの絵をスクロールしても画面の中に見えている（上の段と右の一覧は残る）
    await page.waitForTimeout(300);
    await inView(choose);
    await inView(cat.getByLabel('ページ', {exact: true}));
    await page.screenshot({path: path.join(outDir, 'yazaki-02-choose.png')});
    await choose.getByRole('button', {name: /ECL-5049 SGD/}).click();
    await page.getByText('ECL-5049 SGD を入れました').waitFor();
    pickedColor = true;
    break;
  }
}
assert.ok(pickedColor, '色の記号のない ECL-5049 が見つからない');
log('品番で探す → 色の記号のない品番 → 色を選ぶ OK');

// 部材リストにない品番：品番だけの行（点線の枠）
await cat.getByLabel('カタログから探す').fill('');
await cat.getByLabel('ページ', {exact: true}).selectOption('13');
const other = cat.locator('[data-code="ECA-5029 USL"]').first();
assert.match(await other.getAttribute('class'), /border-dashed/);
await other.click();
await page.getByText('ECA-5029 USL を入れました（部材リストにない品番）').waitFor();
// ◀ ▶ でページを動かせる
await cat.getByRole('button', {name: '次のページ'}).click();
assert.equal(await cat.getByLabel('ページ', {exact: true}).inputValue(), '14');
await cat.getByRole('button', {name: '← 部材リストに戻る'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.waitForTimeout(400);
const text = (await sheet.innerText()).replace(/\s+/g, ' ');
for (const c of ['見本 エンドブラケット', 'ECL-5049 SGD', 'ECA-5029 USL']) assert.ok(text.includes(c), `見積書に ${c} がない`);
await page.screenshot({path: path.join(outDir, 'yazaki-03-sheet.png')});
log('部材リストにない品番は品番だけの行・◀▶ OK');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'ERRORS: なし');
await browser.close();
if (errors.length) process.exit(1);
console.log('ALL OK');
