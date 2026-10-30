// 工事見積書の明細の下の介護保険の内訳・負担割合・委任状の保険給付額を、ブラウザで通しで確かめる（ユーザーの指示 2026-10-28）：
//   「工事見積書にも販売見積書と同様に記載する。記載する、記載しないは販売見積もりと同様に選択できるようにする」
//   「住宅改修の委任状の保険給付額の部分が連動されていない」「住宅改修の申請書にも負担割合を設置。住宅改修⇔特定福祉用具などで連動して数字に繋げる」
// 工事見積書のタブで負担割合を選ぶ → 見積書（画面）に 介護保険の対象・利用者負担（赤字）・保険者負担 → 「自己負担額を表示」を外すと消える →
// 住宅改修申請書のタブの負担割合も同じ・委任状のプレビューに保険給付額 → 特定福祉用具申請書のタブ（中のアプリ）の負担割合も同じ → 中で変えると住宅改修にも。
// usage: node e2e-care.mjs <サイトのURL> <出力フォルダ>（サイトは太陽ポータルと同じ形。tokutei/ がなければ特定福祉用具の連動は見ない）。お客様はサンプル（架空）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {excelSave} from './e2eDocs.mjs';

const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
const withTokutei = (await fetch(`${site}/tokutei/index.html`).catch(() => null))?.ok === true;
const yen = (n) => n.toLocaleString('en-US');

await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const estimateTab = page.getByRole('tab', {name: /工事見積書/});
if ((await estimateTab.getAttribute('aria-selected')) !== 'true') await estimateTab.click();
await page.getByRole('combobox', {name: '保険者', exact: true}).selectOption('kanda');
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();

// ---------------- 工事見積書：負担割合を選ぶまでは 介護保険（受領委任払い）・介護保険の対象 だけ
const group = page.getByRole('group', {name: '負担割合・自己負担額'});
const care = sheet.locator('tr[data-care]');
await care.first().waitFor();
const texts = async () => (await care.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
const before = await texts();
assert.equal(before[0], '介護保険（受領委任払い）');
assert.match(before[1], /^介護保険の対象\s+[\d,]+円$/);
assert.equal(before.length, 2, before.join(' / '));
const covered = Number(before[1].replace(/[^\d]/g, ''));
await group.getByRole('button', {name: '1割'}).click();
await page.waitForFunction(() => [...document.querySelectorAll('tr[data-care]')].some((r) => r.textContent.includes('利用者負担（1割）')));
const share = Math.ceil(covered / 10);
const after = await texts();
assert.deepEqual(after.slice(2, 4).map((t) => t.replace(/\s+/g, '　')), [`利用者負担（1割）　${yen(share)}円`, `保険者負担（9割）　${yen(covered - share)}円`]);
// 利用者負担は赤字。見積書の上の「自己負担額を表示」の横にも出す
const redColor = await care.filter({hasText: '利用者負担'}).locator('td').first().evaluate((td) => getComputedStyle(td).color);
assert.equal(redColor, 'rgb(192, 0, 0)');
assert.match(await group.innerText(), new RegExp(`利用者負担（1割）\\s+${yen(share)}円`));
// 明細の最後の行と内訳のあいだは1行あける
assert.equal((await care.first().innerText()).trim(), '');
await sheet.screenshot({path: path.join(outDir, 'care-1-estimate.png')});
await page.screenshot({path: path.join(outDir, 'care-1b-estimate-top.png'), clip: {x: 0, y: 0, width: 1366, height: 520}});
log('工事見積書：負担割合を選ぶと 利用者負担（赤字）・保険者負担。1行あけて書く OK');

// 「自己負担額を表示」を外すと書かない（読み直しても）
const toggle = group.getByRole('checkbox', {name: '自己負担額を表示'});
await toggle.uncheck();
await care.first().waitFor({state: 'detached'});
await page.waitForTimeout(1200);
await page.reload();
await sheet.waitFor();
assert.equal(await care.count(), 0);
assert.equal(await toggle.isChecked(), false);
await toggle.check();
await care.first().waitFor();
log('「自己負担額を表示」を外すと書かない（読み直しても）・付け直すと書く OK');

// Excel にも内訳（利用者負担は赤字）
const [dl] = await Promise.all([page.waitForEvent('download'), excelSave(page)]);
await dl.saveAs(path.join(outDir, 'care-estimate.xlsx'));
log(`Excel に保存（${dl.suggestedFilename()}）OK`);

// 印刷にも
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay tr[data-care]', {hasText: '利用者負担（1割）'}).first().waitFor();
await page.screenshot({path: path.join(outDir, 'care-2-print.png')});
await page.getByRole('button', {name: /閉じる/}).first().click();
log('印刷にも内訳 OK');

// ---------------- 住宅改修申請書のタブ：負担割合は同じ値。委任状の保険給付額（介護保険の対象−負担割合の分）
await page.getByRole('tab', {name: /住宅改修申請書/}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
const burdenRow = form.locator('[data-field="burden"]');
assert.equal(await burdenRow.getByRole('button', {name: '1割'}).getAttribute('aria-pressed'), 'true');
const preview = page.getByLabel('申請書のプレビュー');
await page.waitForFunction((n) => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent.includes(`${n}円`), (covered - share).toLocaleString('ja-JP'), {timeout: 10000});
const amount = preview.getByText(`${(covered - share).toLocaleString('ja-JP')}円`).first();
await amount.scrollIntoViewIfNeeded();
await page.screenshot({path: path.join(outDir, 'care-3-proxy.png')});
// 2割に変えると委任状も変わる
await burdenRow.getByRole('button', {name: '2割'}).click();
const share2 = Math.ceil((covered * 2) / 10);
await page.waitForFunction((n) => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent.includes(`${n}円`), (covered - share2).toLocaleString('ja-JP'), {timeout: 10000});
log('住宅改修申請書の負担割合（工事見積書と同じ値）・委任状の保険給付額が変わる OK');

// ---------------- 特定福祉用具申請書のタブ（中のアプリ）でも同じ負担割合。中で変えると住宅改修にも
if (withTokutei) {
  await page.waitForTimeout(800);
  await page.getByRole('tab', {name: /特定福祉用具申請書/}).click();
  const frame = page.frameLocator('iframe[data-tokutei]');
  const tkBurden = frame.getByRole('group', {name: '負担割合'});
  await tkBurden.waitFor({timeout: 20000});
  assert.equal(await tkBurden.getByRole('button', {name: '2割'}).getAttribute('aria-pressed'), 'true');
  await tkBurden.getByRole('button', {name: '3割'}).click();
  await page.waitForTimeout(1000);
  await page.getByRole('tab', {name: /住宅改修申請書/}).click();
  await form.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-field="burden"] button[aria-pressed="true"]')?.textContent.trim() === '3割', null, {timeout: 10000});
  log('特定福祉用具の負担割合も同じ・中で変えると住宅改修にも（⇔）OK');
}

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
