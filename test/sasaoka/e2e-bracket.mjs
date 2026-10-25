// 中間のブラケット（BD-01G）の数を確かめる（ユーザーの指示「見積書で、中間のブラケット（BD-01G）の数も出しますか？」→「おねがいします」、2026-10-22）：
//   部材リストにマツ六の BD-134（35アッシュ丸棒 Mオーク 4m）・BD-01G（35ブラケット横型）を取り込む（架空の価格）→
//   申請書で廊下の長さ L=600×1800 → 見積書で手すり BD-134 を選ぶと 2400mm（0.6本）、そのすぐ下に BD-01G 1個（部材リストの単価）→
//   申請書の長さを 2400 にすると2個・900 にすると外れる・600×1800 に戻すと1個 → 発注書にも BD-01G の数。ブラケットの間は 900mm 以内（cutLink.ts の withBrackets）
// usage: node e2e-bracket.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------- 部材リスト：マツ六の手すりと中間のブラケット（価格は架空）
await page.getByRole('navigation').getByRole('button', {name: '📦 部材・施工費マスタ'}).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csv = '品番,品名,定価,仕切単価\nBD-134,BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 4m,10000,6000\nBD-01G,35ブラケット横型カバー付 ゴールド,1000,600\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mazroc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
await page.getByPlaceholder('例：マツ六').fill('マツ六');
await page.getByRole('button', {name: '部材リストに取り込む（2件）'}).click();
await page.getByText('新しく 2件').waitFor();
log('部材リスト OK');

// ---------------- 申請書：廊下の手すりの長さ L=600×1800（L字）
await page.getByRole('navigation').getByRole('button', {name: '📝 見積もり・申請書を作成する'}).click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
const works = form.locator('[data-field="works"]');
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '廊下'});
const length = works.getByRole('listitem', {name: '①廊下'}).getByLabel('長さ（mm）');
await page.keyboard.type('600×1800');
assert.equal(await length.inputValue(), '600×1800');

// ---------------- 見積書：廊下の行に BD-134 を選ぶ → 2400mm（0.6本）と、そのすぐ下に BD-01G 1個（単価は定価×0.8。単位は部材リストのまま＝この表は単位の列なし）
const estimateTab = page.getByRole('tab', {name: '📋 工事見積書'});
const shinseiTab = page.getByRole('tab', {name: '📝 住宅改修申請書'});
await estimateTab.click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const tds = async (text) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const midRows = () => sheet.locator('.form-page tr', {hasText: 'BD-01G'});
const textKey = await sheet.locator('.form-page tr', {hasText: '廊下'}).first().locator('[data-edit$=":text"]').first().getAttribute('data-edit');
await sheet.locator(`[data-edit="${textKey}"]`).click();
await page.keyboard.type('BD-134');
await page.getByRole('listbox', {name: '候補'}).getByRole('option').first().waitFor();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await midRows().first().waitFor();
assert.ok((await tds('BD-134')).join('|').includes('|0.6|本|8,000|4,800|'), (await tds('BD-134')).join('|'));
assert.ok((await tds('BD-01G')).join('|').includes('|1||800|800|'), (await tds('BD-01G')).join('|'));
const rowTexts = await sheet.locator('.form-page tr').allInnerTexts();
const railAt = rowTexts.findLastIndex((t) => t.includes('BD-134') || t.includes('ディンプル付 Mオーク 4m'));
assert.ok(rowTexts[railAt + 1].includes('BD-01G'), rowTexts.slice(railAt, railAt + 3).join(' / '));
await page.screenshot({path: path.join(outDir, 'bracket-1-estimate.png')});
log('L=600×1800 → BD-134 0.6本・BD-01G 1個（手すりのすぐ下・部材リストの単価）OK');

// ---------------- 申請書の長さを直すと、見積書の BD-01G の数も変わる（2400 → 2個、900 → 外れる、600×1800 → 1個）
const setLength = async (v) => {
  await shinseiTab.click();
  await length.fill(v);
  await estimateTab.click();
  await sheet.waitFor();
};
await setLength('2400');
assert.ok((await tds('BD-01G')).join('|').includes('|2||800|1,600|'), (await tds('BD-01G')).join('|'));
await setLength('900');
assert.equal(await midRows().count(), 0);
assert.ok((await tds('BD-134')).join('|').includes('|0.225|本|'), (await tds('BD-134')).join('|'));
await setLength('600×1800');
assert.ok((await tds('BD-01G')).join('|').includes('|1||800|800|'), (await tds('BD-01G')).join('|'));
log('申請書の長さ 2400 → 2個・900 → 外れる・600×1800 → 1個 OK');

// ---------------- 発注書にも BD-01G の数（手すりは 4000mm 1本）
await page.getByRole('button', {name: '🛒 発注書を作成'}).click();
const list = page.getByRole('region', {name: '発注する部材'});
await list.waitFor();
const items = (await list.locator('ol > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
assert.equal(items.length, 2, items.join('\n'));
assert.match(items[0], /BD-134/);
assert.match(items[1], /BD-01G/);
assert.equal(await list.getByLabel('35ブラケット横型カバー付 ゴールドの発注する数', {exact: true}).inputValue(), '1');
await page.screenshot({path: path.join(outDir, 'bracket-2-order.png')});
log('発注書 BD-134 1本・BD-01G 1個 OK');

assert.deepEqual(errors, []);
await browser.close();
log('ALL OK');
