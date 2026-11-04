// メーカーのカタログ（makerCatalogs.ts・MakerCatalogView.tsx。矢崎化工・TOTO）：部材を選ぶ画面の「📖 カタログから選ぶ」と、部材の「📖 p.12」
// （ユーザーの指示「カタログの商品をクリックしたら、商品の内容が入るようにする」「リンクで商品検索や商品名、型番等をひっぱってこれるように」2026-11-04）：
//   部材リスト（架空の名前・金額。メーカー 矢崎化工）→ 見積書の空いた行の「部材」→ ECA-5032 USL の「📖 p.12」→ p.12 の絵（光っている枠）→
//   枠を押すと入る → 「ECL-5049」で探す → 色の記号のない品番（施工イメージ）の枠 → 色を選ぶ → 部材リストにない品番（品番だけの行）
//   → 「📖 カタログから選ぶ」は初めマツ六（「マツ六のPDFカタログです」Vol.8）→ BJ-14WD を入れる
//   → TOTO に切り替え（「TOTOカタログです」2026-11-04）→ YHB203#NW1 の枠 → 色ちがい（#EL）を選ぶ → 色が1つの品番はそのまま入る → 次に開くと TOTO
// ページの絵は site の jutaku-mitsumori/catalog/（リポジトリの catalog-yazaki/・catalog-toto/ を置く）
// usage: node e2e-makercatalog.mjs <サイトのURL> <出力フォルダ>
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
// マツ六の部材（架空の名前・金額）
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csvM6 = '品番,品名,定価,仕切単価\n' + 'BJ-14WD,見本 曲がる手すり棒 2m,9000,5000\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mihon-m6.csv', mimeType: 'text/csv', buffer: Buffer.from(csvM6)});
await page.getByPlaceholder('例：マツ六').fill('マツ六');
await page.getByRole('button', {name: '部材リストに取り込む（1件）'}).click();
await page.getByText('新しく 1件').last().waitFor();
// TOTO の部材（架空の名前・金額）
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csvToto = '品番,品名,定価,仕切単価\n' + 'YHB203#NW1,見本 ハンドグリップ 白,9000,5000\n' + 'YHB203#EL,見本 ハンドグリップ 木目,9000,5000\n' + 'YHBS203FR#MW,見本 棚付きグリップ,20000,12000\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mihon-toto.csv', mimeType: 'text/csv', buffer: Buffer.from(csvToto)});
await page.getByPlaceholder('例：マツ六').fill('TOTO');
await page.getByRole('button', {name: '部材リストに取り込む（3件）'}).click();
await page.getByText('新しく 3件').last().waitFor(); // 1回目のお知らせが残っていることがある

// ---------------- 見積書の空いた行の「部材」→ 部材を選ぶ画面
await (await navItem(page, '📝 見積もり・申請書を作成する')).click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
await clickStable(sheet.locator('tr[data-new] [data-pick="material"]'));
const dlg = page.getByRole('dialog');
await dlg.getByRole('button', {name: '📖 カタログから選ぶ'}).waitFor();
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

// ---------------- TOTO：部材の「📖 p.12」・切り替え・色ちがいを選ぶ・色が1つならそのまま入る
await page.waitForFunction(() => !document.body.innerText.includes('を入れました'), null, {timeout: 15000}); // お知らせが行にかぶらないように
await clickStable(sheet.locator('tr[data-new] [data-pick="material"]'));
await dlg.getByRole('button', {name: '📖 カタログから選ぶ'}).waitFor();
assert.equal((await dlg.getByRole('button', {name: '見本 ハンドグリップ 木目のカタログのページを開く'}).innerText()).trim(), '📖 p.12'); // ほかの色の部材も # の前が同じ品番のページ
await dlg.getByRole('button', {name: '📖 カタログから選ぶ'}).click();
// 初めはマツ六（Vol.8）：品番で探す → p.5 の BJ-14WD（商品コードの所を押しても入る）
const mc = dlg.getByRole('region', {name: 'マツ六カタログ'});
await mc.waitFor();
await mc.getByLabel('カタログから探す').fill('bj-14wd');
await mc.getByRole('group', {name: '見つかったページ'}).getByRole('button', {name: 'p.5', exact: true}).click();
await page.waitForFunction(() => document.querySelector('img[alt="マツ六カタログ p.5"]')?.naturalWidth > 0, null, {timeout: 15000});
const bj = mc.locator('[data-code="BJ-14WD"]').first();
assert.match(await bj.getAttribute('class'), /border-emerald/);
const bb = await bj.boundingBox();
await page.mouse.click(bb.x + 8, bb.y + bb.height / 2); // 枠の左はし＝商品コードの所
await page.getByText('BJ-14WD を入れました').waitFor();
await page.screenshot({path: path.join(outDir, 'matsu6-01-page.png')});
log('マツ六：初めに開く・品番で探す・商品コードの所を押しても入る OK');
await dlg.getByRole('group', {name: 'カタログ'}).getByRole('button', {name: 'TOTO', exact: true}).click();
const tc = dlg.getByRole('region', {name: 'TOTOカタログ'});
await tc.waitFor();
await tc.getByLabel('カタログから探す').fill('yhb203');
await tc.getByRole('group', {name: '見つかったページ'}).getByRole('button', {name: 'p.12', exact: true}).click();
await page.waitForFunction(() => document.querySelector('img[alt="TOTOカタログ p.12"]')?.naturalWidth > 0, null, {timeout: 15000});
const grip = tc.locator('[data-code="YHB203#NW1"]').first();
assert.match(await grip.getAttribute('class'), /border-emerald/);
await grip.click();
const colors = tc.getByRole('group', {name: 'YHB203#NW1の色・種類を選ぶ'});
await colors.waitFor();
assert.deepEqual((await colors.getByRole('button').allInnerTexts()).map((t) => /^YHB203#[A-Z0-9]+/.exec(t)?.[0]).filter(Boolean), ['YHB203#NW1', 'YHB203#EL']); // 載っている色がいちばん前
await page.screenshot({path: path.join(outDir, 'toto-01-choose.png')});
await colors.getByRole('button', {name: /YHB203#EL/}).click();
await page.getByText('YHB203#EL を入れました').waitFor();
await tc.locator('[data-code="YHBS203FR#MW"]').first().click();
await page.getByText('YHBS203FR#MW を入れました').waitFor();
await tc.getByRole('button', {name: '← 部材リストに戻る'}).click();
// 次に開くと TOTO（前に開いたカタログ）
await dlg.getByRole('button', {name: '📖 カタログから選ぶ'}).click();
await dlg.getByRole('region', {name: 'TOTOカタログ'}).waitFor();
await dlg.getByRole('region', {name: 'TOTOカタログ'}).getByRole('button', {name: '← 部材リストに戻る'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.waitForTimeout(400);
const text2 = (await sheet.innerText()).replace(/\s+/g, ' ');
for (const c of ['見本 曲がる手すり棒 2m', '見本 ハンドグリップ 木目', '見本 棚付きグリップ']) assert.ok(text2.includes(c), `見積書に ${c} がない`);
log('TOTO：📖 p.12・切り替え・色ちがいを選ぶ・色が1つならそのまま・次も TOTO OK');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'ERRORS: なし');
await browser.close();
if (errors.length) process.exit(1);
console.log('ALL OK');
