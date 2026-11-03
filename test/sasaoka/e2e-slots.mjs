// 申請書→見積書の転記の決まり（ユーザーの指示 2026-11-03「申請書を作成した際の、見積もりへの転記のルール」。railSlots.ts）と、
// 見積書の「＋ 挿入」で行が入る所（「どこにスペースが入り挿入できるかが、ややわかりずらいので、わかるようにする」）、
// 見積書 → 申請書の長さ（「既製品については、既製品の長さから読み取って長さを入力する」）を確かめる：
//   申請書で 廊下（木手すり）・トイレ（既製品）・玄関～道路（高さ 800 → 屋外（支柱））を足す →
//   見積書の空きの行：廊下（手すり）（ブラケット）（施工費）・トイレ（材料費）（施工費）・玄関～道路（支柱）（手すり）（ブラケット）（施工費）→
//   廊下の（ブラケット）を選んで部材リスト（検索は「ブラケット」）→ BD-08G がその行に入る → 「＋ 挿入」にマウスを乗せると BD-08G の下に線 → 押すと入った行が薄い緑 →
//   トイレの（材料費）に TOTO の手すり I型 600mm → 申請書のトイレの長さの薄い字が 600・改修の内容「L=600mm」
// 部材は架空の品番・価格
// usage: node e2e-slots.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------- 部材リスト（価格は架空）
await page.getByRole('navigation').getByRole('button', {name: '📦 部材・施工費マスタ'}).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csv =
  '品番,品名,定価,仕切単価\n' +
  'BD-132,35アッシュ丸棒 見本 2m,10000,6000\n' +
  'BD-08G,35エンドブラケットカバー付 ゴールド,2000,1000\n' +
  'T-600,手すり I型 600mm 見本,9000,5000\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mihon.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
await page.getByPlaceholder('例：マツ六').fill('見本工業');
await page.getByRole('button', {name: '部材リストに取り込む（3件）'}).click();
await page.getByText('新しく 3件').waitFor();
log('部材リスト OK');

// ---------------- 申請書：廊下（木手すり）・トイレ（既製品）・玄関～道路（高さ → 屋外）
await page.getByRole('navigation').getByRole('button', {name: '📝 見積もり・申請書を作成する'}).click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
const works = form.locator('[data-field="works"]');
const addPlace = async (name) => works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: name});
await addPlace('廊下');
const hall = works.getByRole('listitem', {name: /^①廊下/});
assert.equal(await hall.getByRole('combobox', {name: '手すりの種類'}).inputValue(), 'wood');
await addPlace('トイレ');
const toilet = works.getByRole('listitem', {name: /^②トイレ/});
await toilet.getByRole('combobox', {name: '手すりの種類'}).selectOption({label: '既製品（TOTO など）'});
await addPlace('玄関～道路');
const outside = works.getByRole('listitem', {name: /^③玄関～道路/});
assert.equal(await outside.getByRole('combobox', {name: '手すりの種類'}).inputValue(), 'wood');
await outside.getByRole('button', {name: '＋ 高さ（任意）'}).click();
await outside.getByLabel('高さ（mm）').fill('800');
assert.equal(await outside.getByRole('combobox', {name: '手すりの種類'}).inputValue(), 'post'); // 屋外で高さ → 屋外（支柱）
await page.waitForTimeout(600);
await page.screenshot({path: path.join(outDir, 'slots-01-shinsei.png')});
log('申請書：手すりの種類（木手すり・既製品・屋外で高さ → 屋外（支柱））OK');

// ---------------- 見積書の空きの行
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const slotTexts = () => sheet.locator('[data-slot]').evaluateAll((els) => els.map((e) => `（${e.getAttribute('data-slot')}）`));
assert.deepEqual(await slotTexts(), ['（手すり）', '（ブラケット）', '（施工費）', '（材料費）', '（施工費）', '（支柱）', '（手すり）', '（ブラケット）', '（施工費）']);
await page.screenshot({path: path.join(outDir, 'slots-02-estimate.png')});
log('見積書：廊下 手すり・ブラケット・施工費／トイレ 材料費・施工費／玄関～道路 支柱・手すり・ブラケット・施工費 OK');

// ---------------- 空きの行を選んで部材リスト：検索は「ブラケット」・その行に入る
await sheet.locator('[data-slot="ブラケット"]').first().click();
assert.equal(await sheet.locator('[data-slot]').first().innerText(), ''); // 名前（「（手すり）」など）は見せない
assert.match(await sheet.getByLabel('選んでいる欄', {exact: true}).innerText(), /空白の行/);
await sheet.getByRole('button', {name: '📋 部材リストから入れる'}).click();
const dlg = page.getByRole('dialog');
assert.equal(await dlg.getByPlaceholder(/商品名・品番で検索/).inputValue(), 'ブラケット');
await dlg.getByRole('row', {name: /BD-08G/}).first().getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.waitForTimeout(300);
assert.deepEqual((await slotTexts()).slice(0, 2), ['（手すり）', '（施工費）']); // 廊下の（ブラケット）が BD-08G に
const trs = sheet.locator('.form-page tr[data-rows]');
const texts = (await trs.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const bIdx = texts.findIndex((t) => t.includes('BD-08G'));
assert.equal(bIdx, 1, texts.join('\n')); // 廊下の2行目（手すりの空きの行のすぐ下）
log('空きの行を選んで部材リスト（検索「ブラケット」）→ その行に入る OK');

// ---------------- 「＋ 挿入」：マウスを乗せると入る所に線、押すと入った行が薄い緑
const insertBtn = sheet.getByRole('toolbar', {name: '見積書の左のボタン'}).getByRole('button', {name: '＋ 挿入'});
await insertBtn.hover();
const mark = sheet.locator('.sheet-insert-mark');
await mark.waitFor();
assert.equal((await mark.innerText()).trim(), 'ここに1行入ります');
const markBox = await mark.boundingBox();
const bBox = await trs.nth(bIdx).boundingBox();
assert.ok(Math.abs(markBox.y + markBox.height / 2 - (bBox.y + bBox.height)) < 4, `線の位置 ${markBox.y} / 行の下 ${bBox.y + bBox.height}`);
await page.screenshot({path: path.join(outDir, 'slots-03-insert-mark.png')});
await insertBtn.click();
await sheet.locator('tr[data-flash]').waitFor();
assert.equal(await mark.count(), 0);
const after = (await trs.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
assert.equal(after.length, texts.length + 1);
const flashIdx = await trs.evaluateAll((els) => els.findIndex((e) => e.hasAttribute('data-flash')));
assert.equal(flashIdx, bIdx + 1); // BD-08G のすぐ下
await page.screenshot({path: path.join(outDir, 'slots-04-inserted.png')});
await sheet.locator('tr[data-flash]').waitFor({state: 'detached'}).catch(() => {});
await page.waitForFunction(() => !document.querySelector('tr[data-flash]'), null, {timeout: 4000});
log('挿入：入る所に「ここに1行入ります」の線・入った行が薄い緑（少しのあいだ）OK');

// ---------------- トイレ（既製品）に TOTO 型の手すり I型 600mm → 申請書の長さ 600
await sheet.locator('[data-slot="材料費"]').first().click();
await sheet.getByRole('button', {name: '📋 部材リストから入れる'}).click();
assert.equal(await dlg.getByPlaceholder(/商品名・品番で検索/).inputValue(), '');
await dlg.getByPlaceholder(/商品名・品番で検索/).fill('T-600');
await dlg.getByRole('row', {name: /T-600/}).first().getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.waitForTimeout(800);
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
assert.equal(await toilet.getByLabel('長さ（mm）').getAttribute('placeholder'), '600');
assert.ok((await page.locator('body').innerText()).includes('②トイレ　手すりの取り付け　L=600mm'), '申請書の改修の内容に L=600mm がない');
await page.screenshot({path: path.join(outDir, 'slots-05-shinsei-length.png')});
log('既製品の手すり（I型 600mm）→ 申請書のトイレの長さ 600・改修の内容「L=600mm」OK');

// ---------------- スマホの幅：申請書の箇所の行がはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(300);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 392, '横にはみ出す');
await hall.scrollIntoViewIfNeeded();
await page.screenshot({path: path.join(outDir, 'slots-06-mobile.png')});
log('スマホの幅 OK');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'ERRORS: なし');
await browser.close();
if (errors.length) process.exit(1);
console.log('ALL OK');
