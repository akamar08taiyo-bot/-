// 見積書にない申請書の箇所（ユーザーの指摘「見積もりを転記した際に、余計な３行が入っていた」「バツで削除しようとしたが消せなかった」2026-11-02）：
//   ⑥浴室 ⑦浴室 ⑧トイレ の見積書と、同じ名字の申請書（①廊下 ②トイレ ④洗面・脱衣室）を「📥 取り込む」→ 1つの様邸にまとまるが、見積書は ⑥⑦⑧ の3行だけ
//   （前は ①廊下 ②トイレ ④洗面・脱衣室 が空白の行で入った）→ 申請書のタブで箇所（廊下・長さ 1800）を足すと見積書に空白の行 → 見積書の ✕ で
//   「「④廊下」を消します。申請書に入れた寸法も消えます。よろしいですか？」→ キャンセルは残る・OK で消える（前は「申請書のタブで消せます」と出て消せなかった）
//   → Ctrl+Z で戻る → 申請書のタブにも戻っている。部材の行の ✕ は今までどおり聞かずに消える
// usage: node e2e-extra-places.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const {extraPlaceFiles} = await import('./importFixture.ts');
const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const dir = path.join(outDir, 'extra-places-files');
mkdirSync(dir, {recursive: true});
const paths = extraPlaceFiles().map((f) => {
  const p = path.join(dir, f.name);
  writeFileSync(p, f.bytes);
  return p;
});

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED|net::/i.test(m.text()) && errors.push('console: ' + m.text()));
// 確かめの画面（confirm）：答えを決めておき、出た文を覚える
const asked = [];
let answer = true;
page.on('dialog', (d) => {
  asked.push(d.message());
  return answer ? d.accept() : d.dismiss();
});
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------------------------------------------------------- 取り込む：見積書と、同じ名字の申請書
await page.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '申請書・見積書・理由書を取り込む'}).waitFor();
await page.locator('input[aria-label="取り込むファイル"]').setInputFiles(paths);
const dlg = page.getByRole('dialog');
await dlg.waitFor();
assert.deepEqual(await dlg.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['見本の書類']);
await dlg.getByRole('button', {name: '取り込む（2件）'}).click();
await page.locator('[aria-live] > div', {hasText: '2件を取り込みました'}).waitFor();
const rowOf = (name) => page.getByRole('row').filter({has: page.getByRole('cell', {name, exact: true})});
await rowOf('見本様邸').getByRole('cell', {name: '見本様邸', exact: true}).click();
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
await sheet.getByText('TOTO TS136GY6R').first().waitFor();

/** 見積書の明細の行（改修場所・内容）。行の左の ✕ のある行だけ（いちばん下の打ち込める行・空いた行は入れない） */
const lines = () =>
  sheet.locator('.form-page tr:has(.sheet-del)').evaluateAll((trs) =>
    trs.map((tr) => {
      const v = (f) => tr.querySelector(`[data-edit$=":${f}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return [v('name'), v('text')];
    }),
  );
assert.deepEqual(await lines(), [
  ['⑥浴室', 'TOTO TS136GY6R インテリアバーF'],
  ['⑦浴室', 'TOTO TS136GLY64 インテリアバーF'],
  ['⑧トイレ', 'マツ六 BD-13435 丸棒ディンプル'],
]);
assert.equal(await sheet.getByText('①廊下').count(), 0);
await sheet.screenshot({path: path.join(outDir, 'extra-01-imported.png')});
log('見積書と同じ名字の申請書を取り込む → 見積書は ⑥浴室 ⑦浴室 ⑧トイレ の3行だけ（①廊下 ②トイレ ④洗面・脱衣室 は入らない）OK');

// ---------------------------------------------------------------- 申請書のタブで箇所（廊下・長さ）を足す → 見積書に空白の行
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
await form.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '廊下'});
await page.keyboard.type('1800');
await page.keyboard.press('Enter');
await form.getByRole('listitem', {name: '④廊下'}).waitFor();
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
const hall = sheet.locator('.form-page tr', {hasText: '④廊下'}).first();
await hall.waitFor();
assert.deepEqual((await lines()).at(-1), ['④廊下', '']);
assert.equal(await hall.locator('button.sheet-copy').count(), 0); // 空白の行（コピーはない。スクリーンショットと同じ）
await sheet.screenshot({path: path.join(outDir, 'extra-02-blank-row.png')});

// ---------------------------------------------------------------- 空白の行の ✕：確かめてから箇所ごと消す（キャンセルは残す）
answer = false;
await hall.locator('.sheet-del').click();
assert.deepEqual(asked, ['「④廊下」を消します。申請書に入れた寸法も消えます。よろしいですか？']);
assert.equal(await sheet.locator('.form-page tr', {hasText: '④廊下'}).count(), 1);
answer = true;
await hall.locator('.sheet-del').click();
await sheet.locator('.form-page tr', {hasText: '廊下'}).first().waitFor({state: 'detached'});
assert.equal(asked.length, 2);
assert.equal((await lines()).length, 3);
assert.equal(await sheet.getByText('申請書のタブで消せます').count(), 0);
await sheet.screenshot({path: path.join(outDir, 'extra-03-deleted.png')});
log('空白の行の ✕ → 「「④廊下」を消します。申請書に入れた寸法も消えます。よろしいですか？」→ キャンセルは残る・OK で消える OK');

// Ctrl+Z で戻る（申請書のタブにも寸法ごと戻る）
await sheet.locator('[data-edit$=":text"]').first().click();
await page.keyboard.press('ControlOrMeta+z');
await sheet.locator('.form-page tr', {hasText: '④廊下'}).first().waitFor();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
assert.equal(await form.getByRole('listitem', {name: '④廊下'}).getByLabel('長さ（mm）').inputValue(), '1800');
log('Ctrl+Z で戻る（申請書のタブにも長さ 1800 のまま）OK');

// ---------------------------------------------------------------- 部材の行の ✕ は今までどおり聞かずに消す
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
await sheet.locator('.form-page tr', {hasText: 'BD-13435'}).first().locator('.sheet-del').click();
await sheet.locator('.form-page tr', {hasText: 'BD-13435'}).first().waitFor({state: 'detached'});
assert.equal(asked.length, 2);
assert.deepEqual((await lines()).map((l) => l[0]), ['⑥浴室', '⑦浴室', '③廊下']); // 写真番号を入れていない廊下は見積書に出る順（3番目）
log('部材の行の ✕ は聞かずに消す（申請書の内容のない箇所は箇所ごと）OK');

await browser.close();
if (errors.length) {
  console.log('ERRORS:', errors);
  process.exit(1);
}
console.log('ERRORS: なし');
