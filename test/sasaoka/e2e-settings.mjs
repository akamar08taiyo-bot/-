// 設定・バックアップ・CSV・1か月で1回計算・所長と担当・狭い画面・お知らせが消えること を確かめる
// Playwright はこのリポジトリの依存に入れていない。入っている場所を PLAYWRIGHT で指定できる（既定はクラウド環境の場所）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const [url, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', (d) => d.accept());
};

const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
const page = await ctx.newPage();
watch(page);
await page.goto(url);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).waitFor();
const toast = page.getByText('サンプルの部材5件と');
assert.equal(await toast.count(), 1);
await page.waitForTimeout(4200);
assert.equal(await toast.count(), 0, 'お知らせが消えていない');
log('お知らせは数秒で消えるOK');

// サンプルの金額（玄関：10,000＋1,500×2＋木1,000×2／トイレ：7,800＋300×2＋タイル1,500×2）
// ① 21,400 ② 5,000 ③ 1,498 ④ round(27,898×0.07=1,952.86)=1,953 ⑦ 29,851
// 請求書の消費税は すべての様邸の合計×0.1 を切り捨て：2,985.1 → 2,985、ご請求金額 32,836
const row = await page.getByRole('row', {name: /（サンプル）山田様邸/}).innerText();
for (const v of ['21,400', '5,000', '1,498', '1,953', '29,851']) assert.ok(row.includes(v), `一覧に ${v} がない: ${row}`);
assert.ok((await page.getByText(/ご請求金額（税込）/).innerText()).includes('32,836'));
assert.ok((await page.getByText(/すべての様邸の合計に消費税率をかけています/).innerText()).includes('2,985'));
log('サンプルの金額OK（消費税は全様邸の合計にかける）');

// CSV
const [csvDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'CSVで保存'}).click()]);
const csvPath = path.join(outDir, 'list.csv');
await csvDl.saveAs(csvPath);
const csv = readFileSync(csvPath, 'utf8');
assert.ok(csv.startsWith('﻿No.,施工日,お客様名,担当,部材代,取付手間,部材上乗せ,諸経費,税抜計,消費税,合計'), csv.slice(0, 80));
assert.ok(csv.includes('（サンプル）山田様邸,久保,21400,5000,1498,1953,29851,,\r\n'), csv);
assert.ok(csv.includes(',,合計,,21400,5000,1498,1953,29851,2985,32836'), csv);
log('CSV OK:', csvDl.suggestedFilename());

// 請求書（様邸ごとの消費税）：所長名と、お客様名の横の担当
await page.getByRole('button', {name: '🖨 請求書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const inv = page.locator('.sheet').first();
assert.ok((await inv.innerText()).includes('行橋営業所所長　久保 匠史'), await inv.innerText());
const invHead = await inv.locator('thead th').allInnerTexts();
assert.deepEqual(invHead.slice(0, 5), ['No.', '施工日', 'お客様名', '担当', '部材代']);
assert.deepEqual((await inv.locator('tbody tr').first().locator('td').allInnerTexts()).slice(2, 5), ['（サンプル）山田様邸', '久保', '21,400']);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('請求書の所長名・担当OK');

// 担当の候補を書き換える（改行を打って足せること）→ 様邸の画面で選べる
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
const staffArea = page.getByRole('textbox', {name: '担当者の名前'});
await staffArea.click();
await staffArea.press('Control+End');
await staffArea.press('Enter');
await staffArea.pressSequentially('山本');
assert.equal(await staffArea.inputValue(), '久保 匠史\n土居 翔太\n宮村\n信田\n藤田\n山本');
await page.getByRole('navigation').getByRole('button', {name: /様邸一覧/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const staffSelect = page.locator('label', {hasText: '担当'}).locator('select');
assert.deepEqual(await staffSelect.locator('option').allInnerTexts(), ['（選ぶ）', '久保 匠史', '土居 翔太', '宮村', '信田', '藤田', '山本']);
await staffSelect.selectOption('土居 翔太');
await page.getByRole('button', {name: '🖨 この様邸の明細を印刷'}).click();
const jobDoc = await page.locator('.sheet').first().innerText();
assert.ok(jobDoc.includes('担当　土居'), jobDoc); // 仕切りの明細・請求書は名字だけ（見積書はフルネーム）
assert.ok(!jobDoc.includes('翔太'), jobDoc);
assert.ok(jobDoc.includes('所長 久保 匠史'), jobDoc);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await staffSelect.selectOption('久保 匠史');
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
log('担当の候補の追加・様邸の明細の担当OK');

// 設定：請求書の担当者・振込先・1か月で1回計算
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
await page.locator('label', {hasText: '請求書の担当者'}).locator('input').fill('山本');
await page.locator('label', {hasText: 'お振込先'}).locator('input').fill('○○銀行 行橋支店 普通 1234567 タイヨウシルバーサービス（カ');
await page.locator('label', {hasText: '請求書（1か月分）の消費税'}).locator('select').selectOption('monthly');
await page.locator('label', {hasText: '⑤消費税の1円未満'}).locator('select').selectOption('floor');
await page.screenshot({path: path.join(outDir, '21-settings.png'), fullPage: true});
await page.getByRole('navigation').getByRole('button', {name: /様邸一覧/}).click();
const foot = await page.getByText(/ご請求金額（税込）/).innerText();
// 切り捨て：⑤ floor(2,985.1)=2,985 → 1か月で1回：29,851×0.1=2,985.1 → 2,985、合計 32,836
assert.ok(foot.includes('32,836'), foot);
log('1か月で1回計算・切り捨て OK', foot);
await page.getByRole('button', {name: '🖨 請求書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
await page.screenshot({path: path.join(outDir, '22-invoice-monthly.png'), fullPage: false});
const doc = await page.locator('.sheet').first().innerText();
assert.ok(doc.includes('消費税（10%）'), doc);
assert.ok(doc.includes('担当　山本'));
assert.ok(doc.includes('行橋営業所所長　久保 匠史'));
assert.deepEqual((await page.locator('.sheet').first().locator('tbody tr').first().locator('td').allInnerTexts()).slice(2, 4), ['（サンプル）山田様邸', '久保']);
assert.ok(doc.includes('お振込先'));
await page.getByRole('button', {name: '✕ 閉じる'}).click();

// バックアップ → 別のブラウザ（空のデータ）に読み込む
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
const [bk] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'バックアップを保存（すべて）'}).click()]);
const bkPath = path.join(outDir, 'backup.json');
await bk.saveAs(bkPath);
const json = JSON.parse(readFileSync(bkPath, 'utf8'));
assert.equal(json.kind, 'taiyo-sasaoka-shikiri-backup');
assert.equal(json.jobs.length, 1);
assert.equal(json.materials.length, 5);
assert.equal(json.kits.length, 1);
log('バックアップ保存OK:', bk.suggestedFilename());

const ctx2 = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
const p2 = await ctx2.newPage();
watch(p2);
await p2.goto(url);
await p2.getByRole('navigation').getByRole('button', {name: '設定'}).click();
await p2.locator('input[type=file][accept*=json]').setInputFiles(bkPath);
await p2.getByText(/部材 5件・取付手間 17件・様邸 1件・一式 1件・設定/).waitFor();
await p2.getByRole('button', {name: '今のデータを置き換える'}).click();
await p2.getByRole('navigation').getByRole('button', {name: /様邸一覧/}).click();
await p2.getByRole('cell', {name: /（サンプル）山田様邸/}).waitFor();
log('別のブラウザにバックアップを読み込めたOK');

// 狭い画面（タブレット縦・スマホ）
for (const [w, h, name] of [
  [820, 1180, '23-tablet.png'],
  [390, 844, '24-phone.png'],
]) {
  await p2.setViewportSize({width: w, height: h});
  await p2.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
  await p2.waitForTimeout(300);
  await p2.screenshot({path: path.join(outDir, name), fullPage: true});
  await p2.getByRole('button', {name: '← 一覧へ戻る'}).click();
}
log('狭い画面のスクリーンショットOK');

// スマホで印刷イメージ：用紙の横幅が画面に収まる。「拡大」で原寸、印刷は原寸
await p2.setViewportSize({width: 390, height: 844});
await p2.getByRole('button', {name: '🖨 請求書を印刷'}).click();
await p2.locator('.print-overlay').waitFor();
const sheetBox = async () => p2.locator('.sheet').first().boundingBox();
let box = await sheetBox();
assert.ok(box.x >= 0 && box.x + box.width <= 390, `用紙がはみ出している: ${JSON.stringify(box)}`);
await p2.screenshot({path: path.join(outDir, '25-phone-invoice.png')});
await p2.getByRole('button', {name: '🔍 拡大'}).click();
box = await sheetBox();
assert.ok(box.width > 700, `拡大していない: ${box.width}`);
await p2.getByRole('button', {name: '全体を表示'}).click();
await p2.emulateMedia({media: 'print'});
const printZoom = await p2.locator('.print-root').evaluate((el) => getComputedStyle(el).zoom);
assert.equal(printZoom, '1');
await p2.emulateMedia({media: 'screen'});
log('スマホの印刷イメージが画面に収まるOK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
