// 大分市の住宅改修の申請書を確かめる（2026-11-04。ユーザーがいただいた大分市の様式）：
//   新規作成に「＋ 大分市」。サンプルの様邸の工事場所を大分市にすると「保険者を大分市にする」→
//   申請書のタブは大分市の様式（支給申請兼施工承認申請書・委任状・理由書（表）・理由書（裏）・写真の用紙）。
//   「📗 申請書をExcelで保存」で、改修の内容の行（箇所・施工者・着工予定・完成予定）・費用・居宅介護支援事業所の連絡先・委任状の受任者・理由書（表）を確かめる。
//   値はみな架空の見本（（サンプル）山田・見本町・097-111-2222 など）
// usage: node e2e-oita.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';
import {excelSave} from './e2eDocs.mjs';

const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
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
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 大分市', exact: true}).waitFor();
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
const preview = page.getByLabel('申請書のプレビュー');
await form.waitFor();
await preview.waitFor();
await form.getByLabel('住所', {exact: true}).fill('大分県大分市見本町1-2-3');
await page.getByRole('button', {name: '保険者を大分市にする'}).click();
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
await pageOf('支給申請兼施工承認申請書').waitFor();
await page.waitForTimeout(800);
const names = await preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
// 申請書・委任状・理由書（表・裏）が先、写真番号のある写真の用紙（平面図は大分市の添付書類にないので入れない）
assert.deepEqual(names.slice(0, 4), ['支給申請兼施工承認申請書', '委任状', '理由書（表）', '理由書（裏）'], names.join(','));
assert.ok(names.length > 4 && names.slice(4).every((n) => /^住改・写真/.test(n)), names.join(','));
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
assert.deepEqual(await rowLabels(), [
  'フリガナ',
  '被保険者氏名',
  '被保険者番号',
  '生年月日',
  '要介護状態区分',
  '負担割合',
  '認定有効期間',
  '住所',
  '電話番号',
  '住宅の所有者',
  '改修前日付・改修後日付',
  '改修の内容・箇所及び規模',
  '着工日・完成日',
  '改修費用見積額',
  '住宅改修が必要な理由書作成者',
  '過去の住宅改修費支給申請',
  '施工業者',
]);
const pv = await preview.innerText();
for (const t of ['住宅改修費支給申請兼施工承認', '■受領委任', '委　任　状', '住宅改修が必要な理由書', '見本町1-2-3', '太陽シルバーサービス']) assert.ok(pv.includes(t), `プレビューに「${t}」がない：${pv.slice(0, 1500)}`);
log('大分市の申請書のタブ（プレビュー・一覧の順番）OK');

// ---------------- 入れる：フリガナ・生年月日・要介護・認定有効期間・電話・着工日・完成日・理由書作成者と連絡先
await form.getByLabel('フリガナ', {exact: true}).fill('サンプル　ヤマダ');
await form.getByLabel('生年月日の年').fill('15');
await form.getByLabel('生年月日の月').fill('3');
await form.getByLabel('生年月日の日').fill('15');
{
  const care = form.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護2'});
  if ((await care.getAttribute('aria-pressed')) !== 'true') await care.click();
}
await form.getByLabel('認定有効期間のはじめ').fill('2026-04-01');
await form.getByLabel('認定有効期間のおわり').fill('2028-03-31');
await form.getByLabel('電話番号').fill('097-111-2222');
await form.getByLabel('着工日').fill('2026-11-10');
await form.getByLabel('完成日').fill('2026-11-12');
await form.getByLabel('理由書作成者の事業所名').fill('見本居宅介護支援事業所');
await form.getByLabel('理由書作成者の氏名').fill('見本 花子');
await form.getByLabel('理由書作成者の連絡先').fill('097-333-4444');
await page.waitForTimeout(1200);
await page.screenshot({path: path.join(outDir, 'oita-1-shinsei.png')});
await pageOf('支給申請兼施工承認申請書').screenshot({path: path.join(outDir, 'oita-2-shinsei-page.png')});
await pageOf('委任状').screenshot({path: path.join(outDir, 'oita-3-proxy.png')});
await pageOf('理由書（表）').screenshot({path: path.join(outDir, 'oita-4-riyu.png')});

const [dl] = await Promise.all([page.waitForEvent('download'), excelSave(page)]);
assert.equal(dl.suggestedFilename(), '（サンプル）山田様住宅改修申請書.xlsx');
const file = path.join(outDir, 'oita-shinsei.xlsx');
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheets = new Map();
for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) sheets.set(m[1], strFromU8(files[`xl/${new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)[1]}`]));
const text = (name, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheets.get(name))?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
const a = '支給申請兼施工承認申請書';
assert.deepEqual([text(a, 'L3'), text(a, 'L4'), text(a, 'L11'), text(a, 'AO11')], ['サンプル　ヤマダ', '（サンプル）山田', '大分県大分市見本町1-2-3', '097-111-2222']);
assert.equal(text(a, 'L7'), '明･大･昭　　15年　3月　15日生');
assert.equal(text(a, 'AG7'), '要支援 (　　）　･　要介護 (　２　）');
assert.equal(text(a, 'L9'), '令和8年4月1日　～　令和10年3月31日');
assert.match(text(a, 'O17'), /玄関/); // サンプルの玄関の手すり
assert.match(text(a, 'Z17'), /^太陽シルバーサービス/);
assert.deepEqual([text(a, 'AJ17'), text(a, 'AQ17')], [' R8・11・10', ' R8・11・12']);
assert.match(text(a, 'L29'), /^[\d,]+円$/);
assert.match(text(a, 'AB29'), /^[\d,]+円$/);
assert.equal(text(a, 'M39'), '大分県大分市見本町1-2-3');
assert.equal(text(a, 'M60'), '見本居宅介護支援事業所');
assert.equal(text(a, 'M61'), '担当者氏名（　見本 花子　）　　連絡先（　097-333-4444　）');
assert.match(text(a, 'M63'), /^太陽シルバーサービス/);
const p = '委任状';
assert.equal(text(p, 'C4'), ''); // 氏名は自署
assert.equal(text(p, 'C6'), '大分県大分市見本町1-2-3');
assert.match(text(p, 'C22'), /^太陽シルバーサービス.*所長/);
const r = '理由書（表）';
assert.deepEqual([text(r, 'H5'), text(r, 'H6'), text(r, 'H12'), text(r, 'U8'), text(r, 'W13')], ['見本居宅介護支援事業所', '見本 花子', 'サンプル　ヤマダ', 'Tel　097-333-4444', 'R8・4・1～R10・3・31']);
assert.equal(text(r, 'H16'), '　大分市見本町1-2-3');
assert.equal(text(r, 'L10'), '■'); // 資格を入れていなければ介護支援専門員
assert.equal(sheets.size, 12);
log('Excel（申請書・委任状・理由書（表））OK');

// ---------------- 理由書のタブの連絡先も同じ値（申請書のタブで入れた連絡先）
await page.getByRole('tab', {name: /理由書/}).click();
await page.waitForTimeout(600);
assert.equal(await page.getByLabel('作成者の連絡先').first().inputValue().catch(() => ''), '097-333-4444');
log('理由書のタブの連絡先と同じ OK');

// ---------------- スマホの幅でも横にはみ出さない
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅で横にはみ出している');
await page.screenshot({path: path.join(outDir, 'oita-5-phone.png')});
log('スマホの幅 OK');
console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
