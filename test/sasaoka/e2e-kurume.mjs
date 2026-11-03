// 久留米市の住宅改修の申請書を確かめる（2026-11-02。ユーザーの指示「その資料をもとに田川、久留米、大分、飯塚で書類の作成をお願いします」）：
//   新規作成に「＋ 久留米市」。ほかの市の申請書の画面の久留米市にも「＋ 久留米市の書式で作る」。
//   サンプルの様邸の工事場所を久留米市にすると「保険者を久留米市にする」→ 申請書のタブは久留米市の様式（事前承認申請書・支給申請書・平面図・工事写真）。
//   「📗 申請書をExcelで保存」で、改修の内容の□→■と「（玄関１箇所）」、生年月日の年齢、住所（「久留米市」のうしろ）、負担割合の■、理由書作成者の「同左：■」、
//   申請者の氏名を書かない（記入例「必ず手書き」）こと
// usage: node e2e-kurume.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';
import {excelSave} from './e2eDocs.mjs';
import {navItem} from './more.mjs';

const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
let page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------- 新規作成に「＋ 久留米市」・ほかの市の申請書の画面に「＋ 久留米市の書式で作る」
const newSection = page.getByRole('region', {name: '新規作成'});
await newSection.getByRole('button', {name: '＋ 久留米市', exact: true}).waitFor();
await newSection.getByRole('button', {name: /の申請書$/}).click();
const dlg = page.getByRole('dialog');
await dlg.getByRole('region', {name: '久留米市'}).getByRole('button', {name: '＋ 久留米市の書式で作る'}).click();
let form = page.getByRole('form', {name: '申請書'});
let preview = page.getByLabel('申請書のプレビュー');
await form.waitFor();
await preview.waitFor();
assert.equal(await page.getByRole('combobox', {name: '保険者', exact: true}).inputValue(), 'kurume');
log('新規作成・ほかの市の申請書の画面から久留米市の様邸 OK');

// ---------------- サンプルの様邸を久留米市に（様邸のない画面の「サンプルで試す」から。別のブラウザの窓＝データは空）
await ctx.close();
const ctx2 = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx2.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx2.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
page = await ctx2.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
form = page.getByRole('form', {name: '申請書'});
preview = page.getByLabel('申請書のプレビュー');
await page.goto(`${site}/jutaku-mitsumori/index.html`);
// 設定に久留米市の受領委任払い取扱事業所登録番号（架空の8けた。初めは空）
await (await navItem(page, '設定')).click();
const regNo = page.getByLabel('久留米市の受領委任払い取扱事業所登録番号（8けた）');
assert.equal(await regNo.inputValue(), '');
await regNo.fill('12345678');
await page.waitForTimeout(1200);
await (await navItem(page, /見積もり・申請書を作成する/)).click();
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
await preview.waitFor();
await form.getByLabel('住所', {exact: true}).fill('福岡県久留米市見本町1-2-3');
await page.getByRole('button', {name: '保険者を久留米市にする'}).click();
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
await pageOf('事前承認申請書').waitFor();
await page.waitForTimeout(800);
const pageNames = await preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
assert.deepEqual(pageNames.slice(0, 3), ['事前承認申請書', '支給申請書', '平面図']);
assert.ok(pageNames.slice(3).every((n) => /^住改・写真/.test(n)), pageNames.join(','));
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '郵便番号', '住所', '電話番号', '住宅の所有者', '住宅改修が必要な理由書作成者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '着工日・完成日', '改修予定費用', '負担割合']);
const pv = await preview.innerText();
for (const t of ['住宅改修事前承認申請書', '住宅改修費支給申請書', '見本町1-2-3', '太陽シルバーサービス', '（玄関１箇所']) assert.ok(pv.includes(t), `プレビューに「${t}」がない：${pv.slice(0, 1500)}`);
await page.waitForTimeout(400);
await page.screenshot({path: path.join(outDir, 'kurume-1-shinsei.png')});
await pageOf('事前承認申請書').screenshot({path: path.join(outDir, 'kurume-2-jizen.png')});
await pageOf('支給申請書').screenshot({path: path.join(outDir, 'kurume-3-shikyu.png')});
log('久留米市の申請書のタブ（プレビュー・一覧の順番）OK');

// ---------------- 入れる：フリガナ・生年月日・電話・負担割合・着工日・完成日
await form.getByLabel('フリガナ', {exact: true}).fill('サンプル　ヤマダ');
await form.getByLabel('生年月日の年').fill('15');
await form.getByLabel('生年月日の月').fill('3');
await form.getByLabel('生年月日の日').fill('15');
await form.getByLabel('電話番号').fill('0942-11-2222');
await form.getByLabel('着工日').fill('2026-11-10');
await form.getByLabel('完成日').fill('2026-11-12');
{
  const burden = form.getByRole('group', {name: '負担割合'}).getByRole('button', {name: '1割'});
  if ((await burden.getAttribute('aria-pressed')) !== 'true') await burden.click();
}
await page.waitForTimeout(1200);
const [dl] = await Promise.all([page.waitForEvent('download'), excelSave(page)]);
assert.equal(dl.suggestedFilename(), '（サンプル）山田様住宅改修申請書.xlsx');
const file = path.join(outDir, 'kurume-shinsei.xlsx');
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheets = new Map();
for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) sheets.set(m[1], strFromU8(files[`xl/${new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)[1]}`]));
const text = (name, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheets.get(name))?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
const a = '事前承認申請書';
assert.deepEqual([text(a, 'J3'), text(a, 'J4'), text(a, 'Q8')], ['サンプル　ヤマダ', '（サンプル）山田', '見本町1-2-3']);
assert.match(text(a, 'J6'), /^ 明・大・昭　15年3月15日（\d+歳）$/); // 年齢は今日の年齢（昭和15年3月15日生まれは 2026-11-02 に 86歳）
assert.equal(text(a, 'J13'), '■ 手すりの取り付け');
assert.match(text(a, 'J14'), /^　　（玄関１箇所/);
assert.match(text(a, 'AN12'), /^太陽シルバーサービス/);
assert.deepEqual([text(a, 'AN20'), text(a, 'AN22')], ['令和8年11月10日', '令和8年11月12日']);
assert.match(text(a, 'J30'), /^[\d,]+$/);
assert.equal(text(a, 'BA30'), '■');
assert.equal(text(a, 'AS44'), '0942-11-2222');
// 受領委任払い取扱事業所登録番号：設定の久留米市の登録番号（8けた）を右の8マスに（上で設定に入れた架空の番号。ユーザーの答え「登録番号を設定で入れる（初めは空）」2026-11-03）
const BOXES = ['AN', 'AP', 'AR', 'AT', 'AV', 'AX', 'AZ', 'BB', 'BD', 'BF'];
assert.equal(BOXES.map((c) => text(a, `${c}18`) || '_').join(''), '__12345678');
const b = '支給申請書';
assert.deepEqual([text(b, 'J4'), text(b, 'J6'), text(b, 'P11'), text(b, 'AZ33'), text(b, 'AS46')], ['サンプル　ヤマダ', '（サンプル）山田', '見本町1-2-3', '■', '0942-11-2222']);
assert.equal(text(b, 'J16'), '■ 手すりの取り付け');
assert.equal(BOXES.map((c) => text(b, `${c}21`) || '_').join(''), '__12345678');
assert.equal(sheets.size, 11);
log('Excel（事前承認申請書・支給申請書）OK');

// ---------------- スマホの幅でも横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅で横にはみ出している');
await page.screenshot({path: path.join(outDir, 'kurume-4-phone.png')});
log('スマホの幅 OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
