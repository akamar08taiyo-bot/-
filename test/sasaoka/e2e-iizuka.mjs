// 飯塚市の住宅改修の申請書を確かめる（2026-11-02。ユーザーの指示「その資料をもとに田川、久留米、大分、飯塚で書類の作成をお願いします」）：
//   新規作成に「＋ 飯塚市」・ほかの市の申請書の画面に「＋ 飯塚市の書式で作る」。サンプルの様邸の工事場所を飯塚市にすると「保険者を飯塚市にする」→
//   申請書のタブは飯塚市の様式（事前承認願書・承諾書・平面図・事前写真・支給申請書・支給写真・請求書）。
//   「📗 申請書をExcelで保存」で、改修内容の□→■・住宅の種類（個人住宅）・現在の状況（在宅）・請求書の金額、委任の欄の氏名は書かないこと
// usage: node e2e-iizuka.mjs <サイトのURL> <出力フォルダ>
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
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 飯塚市', exact: true}).waitFor();
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
const preview = page.getByLabel('申請書のプレビュー');
await form.waitFor();
await preview.waitFor();
await form.getByLabel('住所', {exact: true}).fill('福岡県飯塚市見本町1-2-3');
await page.getByRole('button', {name: '保険者を飯塚市にする'}).click();
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
await pageOf('事前承認願書').waitFor();
await page.waitForTimeout(800);
const names = await preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
// 申請書（事前承認願書・承諾書・支給申請書・請求書）が先、平面図、写真番号ごとに事前申請用・支給申請用の写真の用紙（箇所のある番号だけ）
// 内訳書（ユーザーの答え「内訳書はいります」2026-11-03）は承諾書のうしろ
assert.deepEqual(names.slice(0, 6), ['事前承認願書', '承諾書', '内訳書', '支給申請書', '請求書', '平面図'], names.join(','));
assert.deepEqual(names.slice(6, 8), ['事前写真①', '支給写真①'], names.join(','));
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '性別', '郵便番号', '住所', '電話番号', '住宅の所有者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '住宅改修の利用', '今回の改修費用（介護保険対象分）', '住宅改修が必要な理由書作成者', '着工日・完成日', '負担割合']);
await pageOf('事前承認願書').screenshot({path: path.join(outDir, 'iizuka-1-jizen.png')});
await pageOf('支給申請書').screenshot({path: path.join(outDir, 'iizuka-2-shikyu.png')});
await pageOf('請求書').screenshot({path: path.join(outDir, 'iizuka-3-seikyu.png')});
log('飯塚市の申請書のタブ（プレビュー・一覧の順番）OK');

await form.getByLabel('フリガナ', {exact: true}).fill('サンプル　ヤマダ');
await form.getByLabel('電話番号').fill('0948-11-2222');
await form.getByLabel('着工日').fill('2026-11-10');
await form.getByLabel('完成日').fill('2026-11-12');
{
  const burden = form.getByRole('group', {name: '負担割合'}).getByRole('button', {name: '1割'});
  if ((await burden.getAttribute('aria-pressed')) !== 'true') await burden.click();
}
await page.waitForTimeout(1200);
await pageOf('請求書').screenshot({path: path.join(outDir, 'iizuka-3-seikyu.png')});
await pageOf('内訳書').screenshot({path: path.join(outDir, 'iizuka-4-uchiwake.png')});
const [dl] = await Promise.all([page.waitForEvent('download'), excelSave(page)]);
const file = path.join(outDir, 'iizuka-shinsei.xlsx');
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheets = new Map();
for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) sheets.set(m[1], strFromU8(files[`xl/${new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)[1]}`]));
const text = (name, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheets.get(name))?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
const a = '事前承認願書';
assert.deepEqual([text(a, 'F7'), text(a, 'F8'), text(a, 'G12'), text(a, 'F16'), text(a, 'W12'), text(a, 'W15')], ['サンプル　ヤマダ', '（サンプル）山田', '福岡県飯塚市見本町1-2-3', '■', '■', '■']);
assert.deepEqual([text(a, 'F21'), text(a, 'J21'), text(a, 'L21')], ['令和8', '11', '10']);
assert.equal(text(a, 'G24'), '福岡県飯塚市見本町1-2-3');
assert.match(text(a, 'G32'), /^太陽シルバーサービス/);
const b = '支給申請書';
assert.deepEqual([text(b, 'D16'), text(b, 'S16'), text(b, 'D10')], ['令和8年11月10日', '令和8年11月12日', '■']);
assert.match(text('請求書', 'J9'), /^￥[\d,]+　円也$/);
assert.equal(sheets.size, 16);
// 内訳書：見積書の明細（サンプルの玄関・トイレ）を1行ずつ、（材）（手）、最後に小計〜合計。使わない行は隠す
const u = '内訳書';
assert.match(text(u, 'B6'), /^①玄関/);
assert.match(text(u, 'D6'), /^（材）/);
const dTexts = [...Array(60)].map((_, i) => text(u, `D${6 + i}`));
const total = dTexts.indexOf('合計');
assert.ok(total > 3 && dTexts.slice(total - 3, total).join(',') === '小計,諸経費,消費税', dTexts.join('|'));
assert.ok(dTexts.some((t) => t.startsWith('（手）')), '施工費の行がない');
assert.match(new RegExp('<row\\b[^>]*\\br="21"[^>]*>').exec(sheets.get(u))?.[0] ?? '', /hidden="1"/);
log('Excel（事前承認願書・支給申請書・請求書・内訳書）OK');

await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅で横にはみ出している');
log('スマホの幅 OK');
console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
