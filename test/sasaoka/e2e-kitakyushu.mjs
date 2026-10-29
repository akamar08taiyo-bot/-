// 北九州市の住宅改修の申請書を確かめる（2026-10-29。ユーザーの指示「北九州市と福岡市の書式で、全く同じ形の連動型の申請書…」）：
//   サンプルの様邸の工事場所を北九州市小倉北区にすると「保険者を北九州市にする」→ 申請書のタブは北九州市の様式（市の Word の様式から作った原本）。
//   プレビューは 事前届出書（提出用・通知用）・支給申請書・平面図・内容報告書（写真。1枚に写真番号1つ）・完了報告書（写真。1枚に2つ）。
//   「📗 申請書をExcelで保存」で、氏名・郵便番号と電話番号（「－」の前後）・改修の種類と箇所の□→■・施工予定業者（設定の営業所）・支給申請書の着工日・完成日
// usage: node e2e-kitakyushu.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';
import {KK_CELLS} from '../../src/sasaoka/shinsei/kitakyushuCells.ts';

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
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
const preview = page.getByLabel('申請書のプレビュー');
await form.waitFor();
await preview.waitFor();

// ---------------- 工事場所を北九州市に → 「保険者を北九州市にする」
await form.getByLabel('住所', {exact: true}).fill('福岡県北九州市小倉北区見本町1-2-3');
await page.getByRole('button', {name: '保険者を北九州市にする'}).click();
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
await pageOf('事前届出書').waitFor();
await pageOf('平面図').waitFor();
await page.waitForTimeout(800);
const pageNames = () => preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const names = await pageNames();
// 写真番号①②（玄関・トイレ）：内容報告書は1枚に1つ（2枚）、完了報告書は1枚に2つ（1枚）。写真の用紙は写真番号の順（①の内容報告書・完了報告書、②の内容報告書）
// 支給申請書の裏（代理人の委任状・注意書き）は書く欄がないのでプレビューには出さない（Excel には入る）
assert.deepEqual(names, ['事前届出書', '事前届出書（通知用）', '支給申請書', '平面図', '内容報告書（写真）', '完了報告書（写真）', '内容報告書（写真） (2)']);
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '郵便番号', '住所', '電話番号', '負担割合', '住宅の所有者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '工事費見積金額（介護保険対象分）', '着工日・完成日']);
const pv = await preview.innerText();
for (const t of ['介護保険住宅改修事前届出書', '介護保険居宅介護（予防）住宅改修費支給申請書（受領委任払用）', '住宅改修内容報告書（写真）', '住宅改修完了報告書（写真）', '小倉北区見本町1-2-3', '太陽シルバーサービス']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
assert.equal(await pageOf('内容報告書（写真）').getByRole('button', {name: /改修前/}).count(), 1);
assert.equal(await pageOf('完了報告書（写真）').getByRole('button', {name: /改修後/}).count(), 2);
await page.waitForTimeout(400);
await page.screenshot({path: path.join(outDir, 'kitakyushu-1-shinsei.png')});
await pageOf('事前届出書').screenshot({path: path.join(outDir, 'kitakyushu-2-todoke.png')});
await pageOf('支給申請書').screenshot({path: path.join(outDir, 'kitakyushu-3-shikyu.png')});
await pageOf('内容報告書（写真）').screenshot({path: path.join(outDir, 'kitakyushu-4-photo.png')});
log('北九州市の申請書のタブ（プレビュー・一覧の順番・写真の報告書）OK');

// ---------------- 入れる：フリガナ・郵便番号・電話・負担割合・着工日・完成日
await form.getByLabel('フリガナ', {exact: true}).fill('サンプル　ヤマダ');
await form.getByLabel('郵便番号').fill('802-0001');
await form.getByLabel('電話番号').fill('093-111-2222');
await form.getByLabel('着工日').fill('2026-11-02');
await form.getByLabel('完成日').fill('2026-11-05');
await page.waitForTimeout(1200);
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
assert.equal(dl.suggestedFilename(), '（サンプル）山田様住宅改修申請書.xlsx');
const file = path.join(outDir, 'kitakyushu-shinsei.xlsx');
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheets = new Map();
for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) sheets.set(m[1], strFromU8(files[`xl/${new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)[1]}`]));
const text = (name, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheets.get(name))?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
for (const [name, c] of [['事前届出書', KK_CELLS.todoke], ['事前届出書（通知用）', KK_CELLS.notice]]) {
  assert.deepEqual([text(name, c.name), text(name, c.zipA), text(name, c.zipB), text(name, c.address)], ['（サンプル）山田', '802', '0001', '福岡県北九州市小倉北区見本町1-2-3'], name);
  assert.deepEqual([text(name, c.telA), text(name, c.telB), text(name, c.telC)], ['093', '111', '2222'], name);
  assert.match(text(name, c.mochiie), /^■持家/, name);
  assert.match(text(name, c.kinds[0]), /^■手すり取付/, name); // サンプルの①玄関・②トイレは手すりの取り付け
  assert.match(text(name, c.places[0]), /■玄関・屋外.*■トイレ/, name);
  assert.match(text(name, c.builder), /^太陽シルバーサービス.*行橋営業所$/, name);
}
const s = KK_CELLS.shikyu;
assert.deepEqual([text('支給申請書', s.kana), text('支給申請書', s.name)], ['サンプル　ヤマダ', '（サンプル）山田']);
assert.deepEqual([s.startY, s.startM, s.startD, s.endY, s.endM, s.endD].map((r) => text('支給申請書', r)), ['8', '11', '2', '8', '11', '5']);
assert.deepEqual([text('支給申請書', s.telA), text('支給申請書', s.telB)], ['093', '111-2222']);
assert.equal(text('内容報告書（写真）', KK_CELLS.naiyo.place0), '玄関');
assert.equal(text('完了報告書（写真）', KK_CELLS.kanryo.place1), 'トイレ');
assert.equal(sheets.size, 20);
log('Excel（事前届出書・支給申請書・写真の報告書）OK');

// ---------------- スマホの幅でも横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅で横にはみ出している');
await page.screenshot({path: path.join(outDir, 'kitakyushu-5-phone.png')});
log('スマホの幅 OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
