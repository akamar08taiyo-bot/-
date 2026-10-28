// 申請書・見積書・理由書の Excel の取り込み（ユーザーの指示「申請書や見積もり・理由書の取り込みをできるようにする。前提条件として、名字が同じ人の場合は
// 同一人物とみなし、〇〇様に合算できるようにする。それ以外は、そのまま取り込んで、申請書や見積書（合計）金額を認識し、売上見込みや受注残などに計上するようにする」2026-10-27）：
//   見積もりの入口の「📥 申請書・見積書・理由書を取り込む」でファイルを選ぶ → 名字ごとの確かめの画面（見本の3つは「見本」様にまとめる・試作 一郎はそのまま・
//   .xls は読めない）→ 取り込む → 一覧に「見本様邸」（住改・見積書の合計）と「試作 一郎様邸」（ほかの形の見積書の合計）→ 受注残に渡すまとめ・売上見込みにも入る →
//   同じファイルをもう一度選ぶと「取り込み済み」で入れない → 見本様邸の見積書に明細・申請書に箇所。スマホの幅も
// usage: node e2e-import-docs.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const {importFiles} = await import('./importFixture.ts');
const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
const fx = importFiles();
const dir = path.join(outDir, 'import-files');
mkdirSync(dir, {recursive: true});
const paths = fx.files.map((f) => {
  const p = path.join(dir, f.name);
  writeFileSync(p, f.bytes);
  return p;
});

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}, ignoreDefaultArgs: ['--hide-scrollbars']});
const errors = [];
const open = async (viewport, extra = {}) => {
  const ctx = await browser.newContext({viewport, locale: 'ja-JP', ...extra});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED|net::/i.test(m.text()) && errors.push('console: ' + m.text()));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  return page;
};

// ---------------------------------------------------------------- 見積もりの入口から取り込む
const page = await open({width: 1366, height: 900});
const drop = page.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '申請書・見積書・理由書を取り込む'});
await drop.waitFor();
await page.screenshot({path: path.join(outDir, 'import-01-home.png')});
await page.locator('input[aria-label="取り込むファイル"]').setInputFiles(paths);
const dlg = page.getByRole('dialog');
await dlg.waitFor();
const groups = dlg.getByRole('region');
assert.deepEqual(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['見本の書類', '試作 一郎の書類']);
// 見本の3つ（見積書・申請書・理由書）は「見本」様にまとめる（名前がちがうので名字だけ）。試作 一郎はそのまま
const mihon = dlg.getByRole('region', {name: '見本の書類'});
assert.equal(await mihon.getByRole('textbox', {name: 'お客様名'}).inputValue(), '見本');
const text = await mihon.innerText();
for (const s of ['見積書', '見本花子様住宅改修見積書.xlsx', `合計 ${yen(fx.estimateTotal)}`, '申請書', '見本太郎様住宅改修申請書.xlsx', `改修費用 ${yen(fx.applicationCost)}`, '理由書', '見本花子様住宅改修理由書.xlsx']) assert.ok(text.includes(s), `${s} がない：${text}`);
assert.equal(await mihon.getByRole('combobox', {name: '入れる様邸'}).inputValue(), ''); // 新しく作る
assert.equal(await mihon.getByRole('checkbox', {name: 'まとめない（1つずつ）'}).isChecked(), false);
const other = dlg.getByRole('region', {name: '試作 一郎の書類'});
assert.ok((await other.innerText()).includes(`合計 ${yen(fx.otherTotal)}`));
assert.match(await dlg.innerText(), /読めないファイル：古い形式\.xls（\.xls は Excel で \.xlsx に保存し直すと読めます）/);
await page.screenshot({path: path.join(outDir, 'import-02-dialog-1366.png')});
await dlg.getByRole('button', {name: '取り込む（4件）'}).click();
await page.locator('[aria-live] > div', {hasText: '4件を取り込みました'}).waitFor();
log('入口から選ぶ → 名字でまとめた確かめの画面（見本の3つ・試作 一郎・読めない .xls）→ 取り込む OK');

// ---------------------------------------------------------------- 一覧：見本様邸（住改・見積書の合計）と試作 一郎様邸（ほかの形の見積書の合計）
const rowOf = (name) => page.getByRole('row').filter({has: page.getByRole('cell', {name, exact: true})});
await rowOf('見本様邸').waitFor();
assert.equal(await page.getByRole('textbox', {name: '一覧の月'}).inputValue(), '2026-10'); // 見積書の作成日の月
const mihonRow = rowOf('見本様邸');
assert.equal((await mihonRow.locator('td').first().innerText()).trim(), '住改');
assert.ok((await mihonRow.innerText()).includes(yen(fx.estimateTotal).replace('円', '')));
const otherRow = rowOf('試作 一郎様邸');
assert.ok((await otherRow.innerText()).includes('55,000'));
assert.match(await otherRow.innerText(), /申請書だけ/); // 工務店の請求書には入れない
await page.screenshot({path: path.join(outDir, 'import-03-list.png')});
// 受注残・進捗管理に渡すまとめ（taiyo-jutaku-sales-v1）にも入る
await page.waitForTimeout(1200);
const summary = JSON.parse(await page.evaluate(() => localStorage.getItem('taiyo-jutaku-sales-v1')));
const sums = Object.fromEntries(summary.rows.map((r) => [r.customer, [r.month, r.total]]));
assert.deepEqual(sums['見本'], ['2026-10', fx.estimateTotal]);
assert.deepEqual(sums['試作 一郎'], ['2026-10', fx.otherTotal]);
log('一覧（住改の印・見積書の合計）・受注残に渡すまとめ OK');

// ---------------------------------------------------------------- 売上見込み
await page.getByRole('navigation').getByRole('button', {name: '📈 売上見込みを確認する'}).click();
await page.getByRole('textbox', {name: '売上の月'}).fill('2026-10');
const plan = page.locator('main');
await plan.getByText('見本様邸', {exact: true}).waitFor();
await plan.getByText('試作 一郎様邸', {exact: true}).waitFor();
assert.ok((await plan.innerText()).includes(`税込 ${yen(fx.estimateTotal + fx.otherTotal)}`) || (await plan.innerText()).includes(yen(fx.estimateTotal + fx.otherTotal)));
await page.screenshot({path: path.join(outDir, 'import-04-sales.png')});
log('売上見込みに入る OK');

// ---------------------------------------------------------------- 同じファイルをもう一度：取り込み済み
await page.getByRole('navigation').getByRole('button', {name: '📝 見積もり・申請書を作成する'}).click();
// 取り込んだあとは一覧のまま（タブを押し直しても一覧）。一覧の上の段の「📥 取り込む」から
await page.getByRole('button', {name: '📥 取り込む'}).waitFor();
await page.locator('input[aria-label="取り込むファイル"]').setInputFiles(paths.slice(0, 4));
await dlg.waitFor();
assert.equal((await dlg.innerText()).match(/取り込み済み/g)?.length, 4);
assert.equal(await dlg.getByRole('button', {name: '取り込む（0件）'}).isDisabled(), true);
await dlg.getByRole('button', {name: 'やめる'}).click();
await dlg.waitFor({state: 'detached'});
log('同じファイルは取り込み済み（入れない）OK');

// ---------------------------------------------------------------- 見本様邸の中：見積書の明細・申請書の箇所・理由書
await rowOf('見本様邸').getByRole('cell', {name: '見本様邸', exact: true}).click();
await page.getByText('木の手すり 35φ 4m').first().waitFor();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
assert.ok((await form.innerText()).includes('浴室'));
await page.screenshot({path: path.join(outDir, 'import-05-shinsei.png')});
log('見本様邸の見積書の明細・申請書の箇所 OK');

// ---------------------------------------------------------------- スマホの幅
const phone = await open({width: 390, height: 844}, {deviceScaleFactor: 2, hasTouch: true, isMobile: true});
await phone.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '申請書・見積書・理由書を取り込む'}).waitFor();
await phone.locator('input[aria-label="取り込むファイル"]').setInputFiles(paths);
await phone.getByRole('dialog').waitFor();
assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await phone.screenshot({path: path.join(outDir, 'import-06-dialog-390.png')});
log('スマホの幅 OK');

await browser.close();
if (errors.length) {
  console.log('ERRORS:', errors);
  process.exit(1);
}
console.log('ERRORS: なし');
