// 申請書の取り込みで写真も一緒に入れる（ユーザーの指示「申請書などを取り込んだときに、一括で写真などもと取り込めるようにする」2026-10-28）：
//   架空の申請書（見本 二郎・苅田町。①浴室の改修前に写真と書き込み2つ＋Excel で足した2枚目の写真・黄色の線（フリーフォーム）・テキストボックス、②玄関の改修前に写真）を取り込む →
//   確かめの画面に「写真 2枚」→ 取り込む → 申請書のタブの写真の欄の ①浴室 改修前（2枚の写真を1枚に・書き込み5つ）・②玄関 改修前に写真、改修の内容は箇所ごとに1行 →
//   ②の写真を消してから同じファイルをもう一度選ぶと「取り込み済み」「まだ入っていない写真 1枚を取り込む」→ 取り込む → 写真が戻る（①はそのまま）
// usage: node e2e-import-photos.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const {photoShinsei} = await import('./photoFixture.ts');
const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(path.join(outDir, 'import-photos'), {recursive: true});
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// 写真（JPEG）はブラウザで作る：a は赤地に白の四角（1600×1200）、b は青（1200×900）
const jpeg = async (color, w, h) =>
  new Uint8Array(
    await page.evaluate(
      async ({color, w, h}) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff';
        g.fillRect(w * 0.1, h * 0.1, w * 0.3, h * 0.3);
        const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
        return [...new Uint8Array(await b.arrayBuffer())];
      },
      {color, w, h},
    ),
  );
const file = path.join(outDir, 'import-photos', '見本二郎様住宅改修申請書.xlsx');
writeFileSync(file, photoShinsei({bytes: await jpeg('#c0392b', 1600, 1200), w: 1600, h: 1200}, {bytes: await jpeg('#2471a3', 1200, 900), w: 1200, h: 900}));

// ---------------------------------------------------------------- 取り込む：確かめの画面に「写真 2枚」
await page.locator('input[aria-label="取り込むファイル"]').setInputFiles(file);
const dlg = page.getByRole('dialog');
await dlg.waitFor();
assert.match(await dlg.innerText(), /申請書\s*見本二郎様住宅改修申請書\.xlsx[\s\S]*写真 2枚/);
await page.screenshot({path: path.join(outDir, 'import-photos-1-dialog.png')});
await dlg.getByRole('button', {name: '取り込む（1件）'}).click();
await page.getByText('1件を取り込みました（写真 2枚）').waitFor();
await dlg.waitFor({state: 'detached'});
log('確かめの画面に「写真 2枚」→ 取り込む OK');

// ---------------------------------------------------------------- 様邸の申請書のタブ：写真の欄・書き込み・改修の内容は1行
const rowOf = (name) => page.getByRole('row').filter({has: page.getByRole('cell', {name, exact: true})});
const openJob = async () => {
  await rowOf('見本 二郎様邸').getByRole('cell', {name: '見本 二郎様邸', exact: true}).click();
  const tab = page.getByRole('tab', {name: /住宅改修申請書/});
  await tab.waitFor();
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await page.getByRole('form', {name: '申請書'}).waitFor();
};
await openJob();
const board = page.getByRole('region', {name: '写真'});
await board.waitFor();
const slot = (name) => board.getByRole('button', {name, exact: true});
const loaded = (name) => page.waitForFunction((n) => {
  const img = document.querySelector(`[aria-label="${n}"] img`);
  return !!img && img.complete && img.naturalWidth > 0;
}, name, {timeout: 15000});
await loaded('①浴室 改修前');
await loaded('②玄関 改修前');
assert.equal(await slot('①浴室 改修後').locator('img').count(), 0);
// ①は2枚の写真と文字を1枚に（横長）・書き込み5つ（矢印・楕円・黄色の線2本・テキストボックス）
const size = await slot('①浴室 改修前').locator('img').evaluate((img) => [img.naturalWidth, img.naturalHeight]);
assert.ok(size[0] > size[1], String(size));
await page.waitForFunction(() => document.querySelector('[aria-label="①浴室 改修前"] [data-marks]')?.getAttribute('data-marks') === '5', null, {timeout: 10000});
const kinds = await slot('①浴室 改修前').locator('[data-mark]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
assert.deepEqual(kinds.sort(), ['ellipse', 'line', 'line', 'line', 'text']);
assert.equal(await slot('②玄関 改修前').locator('[data-marks]').count(), 0);
// 改修の内容は箇所ごとに1行（長さ 700×1100×2000 は1行に）
const preview = page.getByLabel('申請書のプレビュー');
assert.match(await preview.innerText(), /①浴室　手すりの取り付け　L=700×1100×2000mm/);
await board.screenshot({path: path.join(outDir, 'import-photos-2-board.png')});
log('写真の欄に ①浴室 改修前（2枚を1枚に・書き込み5つ）・②玄関 改修前。改修の内容は1行 OK');

// ---------------------------------------------------------------- ②の写真を消して、同じファイルをもう一度：まだ入っていない写真だけ取り込む
await slot('②玄関 改修前').click();
await page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '削除'}).click();
await page.waitForFunction(() => !document.querySelector('[aria-label="②玄関 改修前"] img'));
await page.waitForTimeout(1200);
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.locator('input[aria-label="取り込むファイル"]').setInputFiles(file);
await dlg.waitFor();
assert.match(await dlg.innerText(), /取り込み済み[\s\S]*まだ入っていない写真 1枚を取り込む/);
await dlg.getByRole('button', {name: '取り込む（1件）'}).click();
await page.getByText('1件を取り込みました（写真 1枚）').waitFor();
await openJob();
await loaded('②玄関 改修前');
await loaded('①浴室 改修前');
log('取り込み済みの申請書でも、まだ入っていない写真だけ取り込む OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
