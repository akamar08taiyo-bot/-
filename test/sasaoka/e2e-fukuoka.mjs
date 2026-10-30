// 福岡市の住宅改修の申請書を確かめる（2026-10-29。ユーザーの指示「北九州市と福岡市の書式で、全く同じ形の連動型の申請書…」）：
//   サンプルの様邸の工事場所を福岡市早良区にすると「保険者を福岡市にする」→ 申請書のタブは福岡市の様式（様式第21号・完了届出書 第22号の2・平面図・写真貼付台紙）。
//   一覧は福岡市の申請書の順番（性別・郵便番号・要介護状態区分の欄はない。着工日・完成日は完了届出書）。プレビューの写真貼付台紙は1枚に写真番号2つ（施工前と施工後は別の用紙）。
//   「📗 申請書をExcelで保存」で、あて先の区長・住所の区・保険者番号のうしろ2けた（早良区＝72）・改修の内容（種類ごとの行）・改修施工者（設定の営業所）・写真貼付台紙の改修の場所の■
// usage: node e2e-fukuoka.mjs <サイトのURL> <出力フォルダ>
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
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '福岡西営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const shinseiTab = page.getByRole('tab', {name: '📝 住宅改修申請書'});
await shinseiTab.click();
const form = page.getByRole('form', {name: '申請書'});
const preview = page.getByLabel('申請書のプレビュー');
await form.waitFor();
await preview.waitFor();

// ---------------- 工事場所を福岡市早良区に → 「保険者を福岡市にする」
await form.getByLabel('住所', {exact: true}).fill('福岡県福岡市早良区小田部1-2-3');
await page.getByRole('button', {name: '保険者を福岡市にする'}).click();
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
await pageOf('様式第21号').waitFor();
// 保険者のすぐ右で区を選んで保険者番号を決める（ユーザーの指示「保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる」2026-10-29）。初めは住所の早良区
{
  const area = page.getByRole('combobox', {name: '保険者番号'});
  assert.equal(await area.inputValue(), '401372');
  assert.equal(await area.evaluate((el) => el.closest('label').firstChild.textContent), '区');
  assert.ok((await area.locator('option').allInnerTexts()).includes('早良区　401372'));
}
const pageNames = () => preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
// 申請書・完了届出書・平面図・写真番号①②（玄関・トイレ）の施工前と施工後の写真貼付台紙（1枚に2つ）
assert.deepEqual(await pageNames(), ['様式第21号', '完了届出書（受領委任用)', '平面図', '写真貼付台紙（事前）', '写真貼付台紙（完了）']);
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '住所', '電話番号', '負担割合', '住宅の所有者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '改修予定費用', '着工日・完成日']);
const pv = await preview.innerText();
for (const t of ['介護保険住宅改修費支給申請書', '介護保険住宅改修完了届出書【受領委任払用】', '早良', '小田部1-2-3', '①玄関', '②トイレ', '太陽シルバーサービス']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
// 写真貼付台紙は1枚に写真番号2つ：施工前の用紙に①②の改修前の枠、施工後の用紙に①②の改修後の枠
assert.equal(await pageOf('写真貼付台紙（事前）').getByRole('button', {name: /改修前/}).count(), 2);
assert.equal(await pageOf('写真貼付台紙（完了）').getByRole('button', {name: /改修後/}).count(), 2);
assert.equal(await pageOf('写真貼付台紙（事前）').getByRole('button', {name: /改修後/}).count(), 0);
await page.waitForTimeout(400);
await page.screenshot({path: path.join(outDir, 'fukuoka-1-shinsei.png')});
await pageOf('様式第21号').screenshot({path: path.join(outDir, 'fukuoka-2-form21.png')});
await pageOf('写真貼付台紙（事前）').screenshot({path: path.join(outDir, 'fukuoka-3-photo.png')});
log('福岡市の申請書のタブ（5枚のプレビュー・一覧の順番・写真貼付台紙は1枚に2つ）OK');

// ---------------- 入れる：フリガナ・電話・着工日・完成日
await form.getByLabel('フリガナ', {exact: true}).fill('サンプル　ヤマダ');
await form.getByLabel('電話番号').fill('092-111-2222');
await form.getByLabel('着工日').fill('2026-11-02');
await form.getByLabel('完成日').fill('2026-11-05');
await page.waitForTimeout(1200);
const [dl] = await Promise.all([page.waitForEvent('download'), excelSave(page)]);
assert.equal(dl.suggestedFilename(), '（サンプル）山田様住宅改修申請書.xlsx');
const file = path.join(outDir, 'fukuoka-shinsei.xlsx');
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheets = new Map();
for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) sheets.set(m[1], strFromU8(files[`xl/${new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)[1]}`]));
const text = (name, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheets.get(name))?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
const a = '様式第21号';
assert.deepEqual([text(a, 'E6'), text(a, 'E7'), text(a, 'E25'), text(a, 'N25'), text(a, 'P25'), text(a, 'L26')], ['サンプル　ヤマダ', '（サンプル）山田', '早良', '早良', '小田部1-2-3', '（サンプル）山田']);
assert.deepEqual([text(a, 'X6'), text(a, 'Y6')], ['7', '2']); // 早良区の保険者番号 401372
assert.match(text(a, 'G11'), /^①玄関　L=600mm.*②トイレ/s);
assert.equal(text(a, 'G12'), '－');
assert.match(text(a, 'G19'), /^太陽シルバーサービス.*福岡西営業所$/);
assert.match(text(a, 'O27'), /092-111-2222/);
const b = '完了届出書（受領委任用)';
assert.deepEqual([text(b, 'P16'), text(b, 'V16'), text(b, 'X16'), text(b, 'P17'), text(b, 'V17'), text(b, 'X17')], ['令和　8', '11', '2', '令和　8', '11', '5']);
assert.match(text(b, 'P29'), /^福岡西営業所所長　/);
assert.match(text('写真貼付台紙（事前）', 'D6'), /■玄関・道路までの通路/);
assert.match(text('写真貼付台紙（事前）', 'D24'), /■便所/); // 下の②トイレ
assert.equal(sheets.size, 13);
log('Excel（申請書・完了届出書・写真貼付台紙の改修の場所）OK');

// ---------------- スマホの幅でも横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅で横にはみ出している');
await page.screenshot({path: path.join(outDir, 'fukuoka-4-phone.png')});
log('スマホの幅 OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
