// 工事見積書の改修場所の欄を直接直す（②③の番号も）・改修内容／改修場所の欄で Delete と「全て削除」で箇所をまるごと消す（申請書はそのまま）。
// ユーザーの指示（2026-11-12）「直接編集できるようにする。②③なども編集できるようにする。リストから以外も」「全て削除ボタンをつくる」
// 「Deleteで全て削除できるようにする。申請書の内容と連動しなくて良い」。名前はすべて架空。
// usage: node e2e-placeedit.mjs <サイト（http://localhost:5190）> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
import {cellAt, newFromList} from './more.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const dialogs = [];
page.on('dialog', (d) => {
  dialogs.push(d.message());
  d.accept();
});
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
// 一覧の上の段の新規作成は「＋ 新規作成 ▼」の1つ（ユーザーの指示「この部分は集約してよい」2026-11-12）。開くと保険者が並び、Esc・外を押すと閉じる
{
  const newBtn = page.getByRole('button', {name: /^＋ 新規作成 [▼▲]$/});
  assert.equal(await newBtn.count(), 1);
  assert.equal(await page.getByRole('button', {name: '＋ 苅田町', exact: true}).count(), 0, '保険者のボタンが閉じたまま並んでいる');
  await newBtn.click();
  const menu = page.getByRole('menu', {name: '新規作成の保険者'});
  const names = (await menu.getByRole('button').allInnerTexts()).map((t) => t.trim());
  assert.ok(['＋ 苅田町', '＋ 行橋市', '＋ みやこ町', '＋ 広域連合'].every((n) => names.includes(n)), JSON.stringify(names));
  await page.keyboard.press('Escape');
  await menu.waitFor({state: 'detached'});
  await newBtn.click();
  await page.mouse.click(5, 600);
  await menu.waitFor({state: 'detached'});
  log('新規作成 ▼：1つのボタンにまとめた・開く・Esc／外で閉じる OK');
}
await newFromList(page, '行橋市');
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const input = sheet.locator('textarea.sheet-input');
const cell = (k) => cellAt(sheet.locator(`[data-edit="${k}"]`).first());
// 選んでいる欄の上には入力欄が重なるので、人と同じく座標で押す
const at = async (k, dbl = false) => {
  const b = await sheet.locator(`[data-edit="${k}"]`).first().boundingBox();
  await page.mouse[dbl ? 'dblclick' : 'click'](b.x + Math.max(4, b.width - 20), b.y + b.height / 2);
  await page.waitForTimeout(80);
};
const names = async () => (await sheet.locator('[data-edit$=":name"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
const addPlace = async (name) => {
  await cell('new:name').click();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await cell('new:text').click();
  await page.keyboard.type('手すり');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
};
await addPlace('玄関');
await addPlace('廊下');
assert.deepEqual(await names(), ['①玄関', '②廊下']);
const keys = await sheet.locator('[data-edit^="place:"][data-edit$=":name"]').evaluateAll((l) => l.map((x) => x.getAttribute('data-edit')));

// ダブルクリックで直す欄に番号も出る。番号だけ直す（②→③）
await at(keys[1], true);
assert.equal(await input.inputValue(), '②廊下');
await page.keyboard.press('Home');
await page.keyboard.press('Delete');
await page.keyboard.type('③');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
assert.deepEqual(await names(), ['①玄関', '③廊下']);
// 番号を変えずに名前だけ直す（自動の番号のまま）
await at(keys[0], true);
assert.equal(await input.inputValue(), '①玄関');
await page.keyboard.press('End');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.type('トイレ');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
assert.deepEqual(await names(), ['①トイレ', '③廊下']);
log('改修場所をダブルクリックで直す（番号も・名前だけも）OK');

// 改修場所の欄で Delete：箇所をまるごと消す（行があるので確かめる）。Ctrl+Z で戻る
await at(keys[1]);
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
assert.equal(dialogs.length, 1, dialogs.join(' / '));
assert.match(dialogs[0], /③廊下の行をすべて消しますか？/);
assert.deepEqual(await names(), ['①トイレ']);
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(200);
assert.deepEqual(await names(), ['①トイレ', '③廊下']);
log('改修場所の欄で Delete → 箇所をまるごと（確かめてから）・Ctrl+Z で戻るOK');

// 「全て削除」のボタン（改修内容の欄を選んで）
const workKey = keys[0].replace(/:name$/, ':work');
await at(workKey);
await page.screenshot({path: path.join(outDir, 'placeedit-01-ops.png'), clip: {x: 0, y: 380, width: 1000, height: 300}});
await sheet.getByRole('toolbar', {name: '行の操作'}).getByRole('button', {name: '✕ 全て削除'}).click();
await page.waitForTimeout(200);
assert.equal(dialogs.length, 2);
assert.deepEqual(await names(), ['③廊下']);
log('「全て削除」のボタンOK');

// 申請書はそのまま（見積書から外した箇所は、申請書の一覧に残り「見積書に入れる」で戻せる）
await page.getByRole('tab', {name: /住宅改修申請書/}).click();
await page.getByRole('button', {name: 'トイレを見積書に入れる'}).waitFor();
log('申請書の箇所はそのまま（トイレを見積書に入れる のボタン）OK');
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();

// 行のない箇所（打ちかけ）は確かめずに消す
await cell('new:name').click();
await page.keyboard.type('浴室');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert.ok((await names()).some((n) => n.endsWith('浴室')));
await cell('new:name').click();
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
assert.equal(dialogs.length, 2);
assert.ok(!(await names()).some((n) => n.endsWith('浴室')), (await names()).join(' '));
log('行のない箇所は Delete で確かめずに消すOK');

// 改修場所の候補：上に申請書の箇所（申請書と同じ番号。薄い黄色の見出し）、下に今までの箇所の名前（ユーザーの指示「リストの中も上部は、申請書に合わせる。
// その下には、現在と同じ一覧。差別化してわかるようにする」2026-11-12）。申請書の箇所を選ぶと、申請書の内容（名前・改修の種類）で見積書に入る
await cell('new:name').click();
await page.keyboard.press('Alt+ArrowDown');
const sug = page.getByRole('listbox', {name: '候補'});
await sug.waitFor();
const sugText = (await sug.innerText()).replace(/\s+/g, ' ');
assert.ok(sugText.indexOf('申請書の箇所') >= 0 && sugText.indexOf('申請書の箇所') < sugText.indexOf('箇所の名前'), sugText);
const opts = (await sug.getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
assert.match(opts[0], /^①トイレ 手すりの取り付け/, JSON.stringify(opts));
assert.ok(opts.some((t) => t === '廊下') && opts.some((t) => t === '玄関'), JSON.stringify(opts)); // 下は今までの一覧
await page.screenshot({path: path.join(outDir, 'placeedit-02-list.png'), clip: {x: 0, y: 300, width: 1100, height: 520}});
await sug.getByRole('option').first().click();
await page.waitForTimeout(200);
assert.ok((await names()).includes('①トイレ'), (await names()).join(' '));
await page.getByRole('tab', {name: /住宅改修申請書/}).click();
assert.equal(await page.getByRole('button', {name: 'トイレを見積書に入れる'}).count(), 0); // 見積書に入った
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
log('改修場所の候補：申請書の箇所が上（番号つき）・下に今までの一覧・選ぶと申請書の箇所が見積書に入るOK');
assert.deepEqual(errors, []);
await browser.close();
console.log('ok: 改修場所を直接直す（番号も）・Delete と「全て削除」で箇所をまるごと消す');
