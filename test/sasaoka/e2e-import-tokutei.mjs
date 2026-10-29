// 特定福祉用具の申請書の取り込み（ユーザーの報告「申請書を読み込めないことがある」2026-10-29：行橋市の福祉用具購入の受領委任払の申請書が「読めませんでした」）：
//   見積もりの入口の「📥 申請書・見積書・理由書を取り込む」に、架空の方（見本 花子）の行橋市の特定福祉用具の申請書（様式と同じ欄の並び）を選ぶ →
//   確かめの画面に「特定福祉用具申請書」と福祉用具の点数・金額 → 取り込む → 様邸ができる（お客様の情報）→ 🛁 特定福祉用具申請書のタブで、特定福祉用具の案件に
//   お客様と福祉用具（種目・商品名・製造事業者・販売単価）が入る。もう一度開いても福祉用具は増えない
// usage: node e2e-import-tokutei.mjs <サイトのURL> <出力フォルダ>（<サイト>/tokutei/ に特定福祉用具のビルドがあること）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {strToU8, zipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);

/** 表の欄を列の番号で置いた Excel（行ごとの {列: 値}） */
function gridBook(sheets) {
  const colName = (c) => (c < 26 ? String.fromCharCode(65 + c) : colName(Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26)));
  const esc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sheetXml = (rows) =>
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((r, i) => `<row r="${i + 1}">${Object.entries(r).map(([c, v]) => `<c r="${colName(Number(c))}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`)
      .join('')}</sheetData></worksheet>`;
  const files = {
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([n], i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach(([, rows], i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(rows))));
  return zipSync(files);
}
const book = gridBook([
  [
    '用具・受領委任払',
    [
      {0: 'フ  リ  ガ  ナ', 5: 'ミホン ハナコ'},
      {0: '被保険者氏名', 5: '見本 花子'},
      {19: '被保険者番号', 25: '0', 26: '0', 27: '0', 28: '0', 29: '0', 30: '1', 31: '2', 32: '3', 33: '4', 34: '5'},
      {0: '生　年　月　日', 5: '明・大・昭　15年3月15日生', 19: '性　　別', 24: '男　　・　　女'},
      {0: '住　　　　所', 5: '〒', 6: '824-0005', 22: '電話\r\n番号', 24: '0930-00-0000'},
      {5: '福岡県行橋市中央1丁目2-3'},
      {0: '福　祉　用　具　名', 11: '製造事業者名及び', 21: '購入予定金額'},
      {0: '入浴補助用具\nシャワーチェア 見本A', 11: '見本工業\n見本福祉㈱', 21: '28160', 26: '円'},
      {0: '腰掛便座\nポータブルトイレ 見本C', 11: '見本製作所\n見本福祉㈱', 21: '33000', 26: '円'},
      {0: '福祉用具が\r\n\r\n必要な理由', 4: '立ち座りが困難なため。'},
      {0: '　行橋市長　様'},
      {0: '　上記のとおり関係書類を添えて居宅介護（介護予防）福祉用具購入費受領委任払いの申請をします。'},
    ],
  ],
]);
mkdirSync(outDir, {recursive: true});
const file = path.join(outDir, '見本花子　行橋市福祉購入受領委任.xlsx');
writeFileSync(file, book);

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED|net::/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '申請書・見積書・理由書を取り込む'}).waitFor();
await page.locator('input[aria-label="取り込むファイル"]').setInputFiles([file]);
const dlg = page.getByRole('dialog');
await dlg.waitFor();
const text = await dlg.innerText();
for (const s of ['特定福祉用具申請書', '見本花子　行橋市福祉購入受領委任.xlsx', '福祉用具 2点 61,160円']) assert.ok(text.includes(s), `${s} がない：${text}`);
await page.screenshot({path: path.join(outDir, 'import-tokutei-1-dialog.png')});
await dlg.getByRole('button', {name: /^取り込む（1件）$/}).click();
await dlg.waitFor({state: 'detached'});
log('特定福祉用具の申請書を読む・確かめの画面 OK');

// 様邸を開く → 🛁 特定福祉用具申請書のタブ：お客様と福祉用具が入る
await page.getByRole('cell', {name: /見本/}).first().click();
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
const tk = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
const field = (name) => tk.locator(`input[aria-label="${name}"], select[aria-label="${name}"], textarea[aria-label="${name}"]`).first();
await field('お客様名').waitFor();
assert.equal(await field('お客様名').inputValue(), '見本 花子');
assert.equal(await field('被保険者番号').inputValue(), '0000012345');
assert.equal(await field('住所').inputValue(), '福岡県行橋市中央1丁目2-3');
assert.equal(await field('保険者').inputValue(), 'yukuhashi');
const names = () => tk.getByLabel('商品名').evaluateAll((els) => els.map((e) => e.value).filter(Boolean));
await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('ポータブルトイレ 見本C'), null, {timeout: 15000});
assert.deepEqual(await names(), ['シャワーチェア 見本A', 'ポータブルトイレ 見本C']);
await page.screenshot({path: path.join(outDir, 'import-tokutei-2-tab.png')});
// もう一度開いても福祉用具は増えない
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await field('お客様名').waitFor();
await page.waitForTimeout(800);
assert.deepEqual(await names(), ['シャワーチェア 見本A', 'ポータブルトイレ 見本C']);
log('🛁 特定福祉用具申請書のタブにお客様と福祉用具が入る・2回目は増えない OK');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK');
