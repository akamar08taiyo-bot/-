// 設定・バックアップ・CSV・1か月で1回計算・所長と担当・狭い画面・お知らせが消えること・前に保存した名前の「手摺」を「手すり」に直すこと を確かめる
// Playwright はこのリポジトリの依存に入れていない。入っている場所を PLAYWRIGHT で指定できる（既定はクラウド環境の場所）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
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
await page.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).waitFor();
const toast = page.getByText('サンプルの部材5件と');
assert.equal(await toast.count(), 1);
await page.waitForTimeout(4200);
assert.equal(await toast.count(), 0, 'お知らせが消えていない');
log('お知らせは数秒で消えるOK');

// サンプルの金額（玄関：手すり60cm 10,000×0.15＋1,500×2＋木1,000×2／トイレ：7,800＋300×2＋タイル1,500×2）
// ① 12,900 ② 5,000 ③ 903 ④ round(18,803×0.07=1,316.21)=1,316 ⑦ 20,119
// 請求書の消費税は すべての様邸の合計×0.1 を切り捨て：2,011.9 → 2,011、ご請求金額 22,130
// 一覧は〇〇様邸と金額（税抜）だけ（ユーザーの指示「請求書を作成する一覧については、シンプルにする」2026-10-25）。①〜④は様邸を開いた画面と印刷に
const row = await page.getByRole('row', {name: /（サンプル）山田様邸/}).innerText();
assert.ok(row.includes('20,119'), `一覧に 20,119 がない: ${row}`);
for (const v of ['12,900', '1,316']) assert.ok(!row.includes(v), `一覧に内訳の ${v} が出ている: ${row}`);
assert.ok((await page.getByText(/ご請求金額（税込）/).innerText()).includes('22,130'));
assert.ok((await page.getByText(/すべての様邸の合計に消費税率をかけています/).innerText()).includes('2,011'));
log('サンプルの金額OK（消費税は全様邸の合計にかける）');

// CSV
const [csvDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'CSVで保存'}).click()]);
const csvPath = path.join(outDir, 'list.csv');
await csvDl.saveAs(csvPath);
const csv = readFileSync(csvPath, 'utf8');
assert.ok(csv.startsWith('﻿No.,施工日,お客様名,担当,部材代,取付手間,部材上乗せ,諸経費,税抜計,消費税,合計'), csv.slice(0, 80));
assert.ok(csv.includes('（サンプル）山田様邸,久保,12900,5000,903,1316,20119,,\r\n'), csv);
assert.ok(csv.includes(',,合計,,12900,5000,903,1316,20119,2011,22130'), csv);
log('CSV OK:', csvDl.suggestedFilename());

// 請求書（様邸ごとの消費税）：所長名と、お客様名の横の担当
await page.getByRole('button', {name: '🖨 請求書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const inv = page.locator('.sheet').first();
assert.ok((await inv.innerText()).includes('行橋営業所所長　久保 匠史'), await inv.innerText());
const invHead = await inv.locator('thead th').allInnerTexts();
assert.deepEqual(invHead.slice(0, 5), ['No.', '施工日', 'お客様名', '担当', '部材代']);
assert.deepEqual((await inv.locator('tbody tr').first().locator('td').allInnerTexts()).slice(2, 5), ['（サンプル）山田様邸', '久保', '12,900']);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('請求書の所長名・担当OK');

// 担当の候補を書き換える（改行を打って足せること）→ 様邸の画面で選べる
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
const staffArea = page.getByRole('textbox', {name: '担当者の名前'});
await staffArea.click();
await staffArea.press('Control+End');
await staffArea.press('Enter');
await staffArea.pressSequentially('山本');
assert.equal(await staffArea.inputValue(), '久保 匠史\n土居 翔太\n宮村 茉莉花\n信田 裕太\n藤田 知美\n山本');
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click();
await page.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).click();
const staffSelect = page.locator('label', {hasText: '担当'}).locator('select');
assert.deepEqual(await staffSelect.locator('option').allInnerTexts(), ['（選ぶ）', '久保 匠史', '土居 翔太', '宮村 茉莉花', '信田 裕太', '藤田 知美', '山本']);
await staffSelect.selectOption('土居 翔太');
await page.getByRole('button', {name: '🖨 この様邸の明細を印刷'}).click();
const jobDoc = await page.locator('.sheet').first().innerText();
assert.ok(jobDoc.includes('担当　土居'), jobDoc); // 仕切りの明細・請求書は名字だけ（見積書はフルネーム）
assert.ok(!jobDoc.includes('翔太'), jobDoc);
assert.ok(jobDoc.includes('所長 久保 匠史'), jobDoc);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await staffSelect.selectOption('久保 匠史');
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click(); // 様邸の画面の左上は「← 見積もりへ戻る」。一覧へはタブで戻る
log('担当の候補の追加・様邸の明細の担当OK');

// 設定：請求書の担当者・振込先・1か月で1回計算
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
await page.locator('label', {hasText: '請求書の担当者'}).locator('input').fill('山本');
await page.locator('label', {hasText: 'お振込先'}).locator('input').fill('○○銀行 行橋支店 普通 1234567 タイヨウシルバーサービス（カ');
await page.locator('label', {hasText: '請求書（1か月分）の消費税'}).locator('select').selectOption('monthly');
await page.locator('label', {hasText: '⑤消費税の1円未満'}).locator('select').selectOption('floor');
await page.screenshot({path: path.join(outDir, '21-settings.png'), fullPage: true});
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click();
const foot = await page.getByText(/ご請求金額（税込）/).innerText();
// 切り捨て：⑤ floor(2,011.9)=2,011 → 1か月で1回：20,119×0.1=2,011.9 → 2,011、合計 22,130
assert.ok(foot.includes('22,130'), foot);
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
assert.equal(json.kits.length, 2); // サンプルの1件と、最初に入る例（BD-134＋BD-08G＋施工費）
log('バックアップ保存OK:', bk.suggestedFilename());

const ctx2 = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
const p2 = await ctx2.newPage();
watch(p2);
await p2.goto(url);
await p2.getByRole('navigation').getByRole('button', {name: '設定'}).click();
await p2.locator('input[type=file][accept*=json]').setInputFiles(bkPath);
await p2.getByText(/部材 5件・取付手間 17件・様邸（見積書）1件・部材＋施工費（常用） 2件・設定/).waitFor();
await p2.getByRole('button', {name: '今のデータを置き換える'}).click();
await p2.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click();
await p2.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).waitFor();
log('別のブラウザにバックアップを読み込めたOK');

// 狭い画面（タブレット縦・スマホ）
for (const [w, h, name] of [
  [820, 1180, '23-tablet.png'],
  [390, 844, '24-phone.png'],
]) {
  await p2.setViewportSize({width: w, height: h});
  await p2.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).click();
  await p2.waitForTimeout(300);
  await p2.screenshot({path: path.join(outDir, name), fullPage: true});
  await p2.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click(); // 様邸の画面の左上は「← 見積もりへ戻る」。一覧へはタブで戻る
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

// ---------------- 「手摺」ではなく「手すり」（ユーザーの指示）：前の版で保存した名前（施工費の安寿框手摺・部材・常用のセット・見積書の行）は、
// 開いたときに一度だけ「手すり」に直す（前の版のバックアップを読み込んでも、次に開いたときに直る）
const old = JSON.parse(readFileSync(bkPath, 'utf8'));
delete old.settings.tesuri;
const rail = old.materials.find((m) => m.code === 'S-TS35');
rail.name = rail.name.replace('手すり', '手摺り'); // 木の手摺り 35φ 4m
old.labor = old.labor.map((l) => (l.id === 'l17' ? {...l, name: '安寿框手摺'} : l));
old.kits = old.kits.map((k) => ({...k, name: k.name.replace('手すり', '手摺')}));
old.jobs = old.jobs.map((j) => ({...j, places: j.places.map((p) => ({...p, rows: p.rows.map((r) => (r.refId === rail.id ? {...r, name: rail.name} : r))}))}));
assert.equal((JSON.stringify(old).match(/手摺/g) ?? []).length, 5);
// 商品名の幅を1本の長さと読んでいた前の版の部材・見積書の行（ユーザーの指示「幅120mmは、商品の詳細のため、無視してください」）：
// 「120mm幅 … 4m」が 0.12m、見積書で数量 0.6 と打った行は「72mm÷120mm＝0.6」と入っていた。読み込むと 4m・2400mm に直る（数量・金額はそのまま）
const plateName = 'マツ六 BH-414 木製ベースプレート 120mm幅 Mブラウン 4m';
old.materials.push({...rail, id: 'm-bh414', code: 'BH-414', name: plateName, pieceLengthM: 0.12});
const platePlace = old.jobs.flatMap((j) => j.places).find((p) => p.rows.some((r) => r.kind === 'material'));
platePlace.rows.push({...platePlace.rows.find((r) => r.kind === 'material'), id: 'r-bh414', refId: 'm-bh414', name: plateName, code: 'BH-414', qty: 1, lengthCm: 7.2, pieceLengthM: 0.12});
const oldPath = path.join(outDir, 'backup-old.json');
writeFileSync(oldPath, JSON.stringify(old));
const ctx3 = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
const p4 = await ctx3.newPage();
watch(p4);
await p4.goto(url);
await p4.getByRole('navigation').getByRole('button', {name: '設定'}).click();
await p4.locator('input[type=file][accept*=json]').setInputFiles(oldPath);
await p4.getByRole('button', {name: '今のデータを置き換える'}).click();
await p4.waitForTimeout(1200);
await p4.reload();
await p4.getByRole('navigation').getByRole('button', {name: '設定'}).click();
await p4.waitForTimeout(500);
const [bk2] = await Promise.all([p4.waitForEvent('download'), p4.getByRole('button', {name: 'バックアップを保存（すべて）'}).click()]);
const fixed = JSON.parse(readFileSync(await bk2.path(), 'utf8'));
assert.ok(!JSON.stringify(fixed).includes('手摺'), JSON.stringify(fixed).match(/.{0,20}手摺.{0,20}/g)?.join(' / '));
assert.equal(fixed.labor.find((l) => l.id === 'l17').name, '安寿框手すり');
assert.equal(fixed.materials.find((m) => m.code === 'S-TS35').name, '木の手すり 35φ 4m');
assert.deepEqual(fixed.kits.map((k) => k.name).sort(), json.kits.map((k) => k.name).sort());
assert.equal(fixed.settings.tesuri, true);
assert.equal(fixed.materials.find((m) => m.id === 'm-bh414').pieceLengthM, 4);
const fixedPlate = fixed.jobs.flatMap((j) => j.places.flatMap((p) => p.rows)).find((r) => r.id === 'r-bh414');
assert.deepEqual([fixedPlate.pieceLengthM, fixedPlate.lengthCm, fixedPlate.qty], [4, 240, 1]); // 0.6本のまま
await ctx3.close();
log('「手摺」を「手すり」に（前に保存した施工費・部材・常用のセット・見積書の行を一度だけ）OK');

// ---------------- 新しい版の知らせ：version.json の版が開いている版と違えば「読み込み直す」を出す（前の版が出たままのスマホ向け）
const p3 = await ctx.newPage();
await p3.route('**/version.json', (route) => route.fulfill({contentType: 'application/json', body: JSON.stringify({build: 'これより新しい版'})}));
await p3.goto(url);
const banner = p3.getByRole('status').filter({hasText: 'このアプリの新しい版が出ています'});
await banner.waitFor({timeout: 8000});
await p3.unroute('**/version.json');
await Promise.all([p3.waitForEvent('load'), banner.getByRole('button', {name: '⟳ 読み込み直す'}).click()]);
await p3.waitForTimeout(3000); // 読み込み直したあとは同じ版なので出ない
assert.equal(await p3.getByText('このアプリの新しい版が出ています').count(), 0);
await p3.close();
log('新しい版の知らせ・読み込み直すOK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
