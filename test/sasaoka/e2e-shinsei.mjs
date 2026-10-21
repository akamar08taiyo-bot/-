// 申請書を確かめる：見積書の「📝 申請書を作成」で、保険者の申請書の原本（行橋市・苅田町・みやこ町・広域連合）に
//   被保険者氏名・住所・被保険者番号（10マス）・改修の内容（前の申請と同じ書き方「玄関① 木製L字手すり L=600×850㎜」）を転記した Excel を保存する。ほかのシートはそのまま。
//   見積もりの入口の「📥 申請書（Excel）から作る」で、書いた申請書から見積書を作る
// usage: node e2e-shinsei.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
// 文字の設定のない環境では、日本語のファイル名のダウンロードが「download」になるので UTF-8 にする
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const cell = (k) => sheet.locator(`[data-edit="${k}"]`).first();
const typeIn = async (k, text) => {
  await cell(k).click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
};
await typeIn('job:insuredNo', '0000366989');
// Enter で下の工事場所（住所）の欄に移っているので、そのまま打ち込む
await page.keyboard.type('福岡県行橋市中央1-1');
await page.keyboard.press('Enter');
// 玄関の木の手すりを 60cm で使っている（サンプル）

/** シート名 → XML */
const sheetsOf = (bytes) => {
  const files = unzipSync(bytes);
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const out = new Map();
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? '';
    out.set(m[1], strFromU8(files[`xl/${target}`]));
  }
  return {files, sheets: out};
};
const text = (xml, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
const make = async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📝 申請書を作成'}).click()]);
  const file = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(file);
  return {name: dl.suggestedFilename(), file, bytes: new Uint8Array(await readFile(file))};
};

// 改修の内容・工事内容は前の申請の書き方（玄関① 木製L字手すり L=600×850㎜）。サンプルの玄関は木の手すりを 60cm、トイレは L型手すり
const WORKS = '玄関① 木製手すり L=600㎜\nトイレ② L字手すり';

// ---------------- 行橋市：住改・受領委任払のシートに転記（14枚のシートはそのまま）
const yk = await make();
assert.match(yk.name, /^行橋市申請書_（サンプル）山田様_\d{4}-\d{2}-\d{2}\.xlsx$/);
const y = sheetsOf(yk.bytes);
assert.equal(y.sheets.size, 14);
const main = y.sheets.get('住改・受領委任払');
assert.equal(text(main, 'F5'), '（サンプル）山田');
assert.equal(text(main, 'F11'), '福岡県行橋市中央1-1');
assert.equal(['Z7', 'AA7', 'AB7', 'AC7', 'AD7', 'AE7', 'AF7', 'AG7', 'AH7', 'AI7'].map((r) => text(main, r)).join(''), '0000366989');
assert.equal(text(main, 'F14'), WORKS);
log('行橋市の申請書（氏名・住所・被保険者番号・改修の内容）OK');

// ---------------- 苅田町：事前申請書のシートに転記（事後申請書は式で同じ内容）
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');
const kd = await make();
assert.match(kd.name, /^苅田町申請書_（サンプル）山田様_/);
const k = sheetsOf(kd.bytes);
assert.equal(k.sheets.size, 15);
const pre = k.sheets.get('事前申請書');
assert.deepEqual([text(pre, 'J7'), text(pre, 'J11'), text(pre, 'J14')], ['（サンプル）山田', '福岡県行橋市中央1-1', WORKS]);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(pre, r)).join(''), '0000366989');
assert.match(k.sheets.get('事後申請書'), /<f>事前申請書!J7<\/f><v>（サンプル）山田<\/v>/);
await page.locator('[aria-live] > div', {hasText: `「${kd.name}」を保存しました`}).waitFor();
log('苅田町の申請書（事前申請書・事後申請書は式で同じ）OK');

// ---------------- みやこ町：承認届出書に転記（支給申請書・内訳明細書の氏名・番号・住所は承認届出書を参照する式）。改修の内容は内訳明細書の種類の行
const boxes = (col, n, row) => Array.from({length: n}, (_, i) => {
  const c = [...col].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) + i;
  const name = (k) => (k <= 0 ? '' : name(Math.floor((k - 1) / 26)) + String.fromCharCode(65 + ((k - 1) % 26)));
  return `${name(c)}${row}`;
});
await page.getByRole('combobox', {name: '保険者'}).selectOption('miyako');
const my = await make();
assert.match(my.name, /^みやこ町申請書_（サンプル）山田様_/);
const m = sheetsOf(my.bytes);
assert.equal(m.sheets.size, 12);
const top = m.sheets.get('住宅改修承認届出書');
assert.deepEqual([text(top, 'I5'), text(top, 'I9'), boxes('W', 10, 4).map((r) => text(top, r)).join('')], ['（サンプル）山田', '福岡県行橋市中央1-1', '0000366989']);
assert.equal(text(m.sheets.get('住宅改修費支給申請書(受領委任払用)'), 'J6'), '（サンプル）山田');
const md = m.sheets.get('住宅改修内訳明細書');
assert.deepEqual([text(md, 'D15'), text(md, 'K14')], ['玄関・トイレ', WORKS]);
assert.deepEqual([1, 2, 3].map((n) => text(m.sheets.get(`写真 (${n})`), 'B5')), ['玄関', 'トイレ', '']); // 写真番号の改修場所
log('みやこ町の申請書（承認届出書・支給申請書・内訳明細書・写真）OK');

// ---------------- 広域連合（築上町など）：承認申請書・支給申請書（受領委任払用）・内訳明細書（別紙）・平面図・写真貼付用紙
await page.getByRole('combobox', {name: '保険者'}).selectOption('kouiki');
await sheet.locator('.form-page', {hasText: '内訳書　様式'}).first().waitFor(); // 見積書は広域連合用になる
const kk = await make();
assert.match(kk.name, /^広域連合申請書_（サンプル）山田様_/);
const g = sheetsOf(kk.bytes);
assert.equal(g.sheets.size, 25);
for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）']) {
  const x = g.sheets.get(name);
  assert.deepEqual([text(x, 'J6'), text(x, 'J9'), boxes('X', 10, 7).map((r) => text(x, r)).join('')], ['（サンプル）山田', '福岡県行橋市中央1-1', '0000366989'], name);
}
const gb = g.sheets.get('様式第2号別紙（住宅改修内訳明細書）');
assert.deepEqual([text(gb, 'I6'), text(gb, 'D15'), text(gb, 'K14')], ['（サンプル）山田', '玄関・トイレ', WORKS]);
assert.equal(text(g.sheets.get('平面図 (2)'), 'A1'), '　（サンプル）山田　様　邸　平面図');
assert.deepEqual([text(g.sheets.get('写真貼付用紙'), 'B4'), text(g.sheets.get('写真貼付用紙'), 'B5'), text(g.sheets.get('写真貼付用紙 (2)'), 'B5')], ['（サンプル）山田', '玄関', 'トイレ']);
log('広域連合の申請書（承認申請書・支給申請書・内訳明細書・平面図・写真貼付用紙）OK');
// 4つの保険者すべてで申請書のボタンが出る
for (const i of ['kanda', 'yukuhashi', 'miyako', 'kouiki']) {
  await page.getByRole('combobox', {name: '保険者'}).selectOption(i);
  assert.equal(await page.getByRole('button', {name: '📝 申請書を作成'}).count(), 1, i);
}
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');

// ---------------- 申請書（Excel）から作る：氏名・住所・被保険者番号・改修の箇所で新しい見積書
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
const home = page.getByRole('region', {name: '新規作成'});
await home.waitFor();
await home.getByLabel('申請書（Excel）から作る').setInputFiles(kd.file);
await sheet.waitFor();
await page.locator('[aria-live] > div', {hasText: '申請書から見積書を作りました（苅田町・2箇所）'}).waitFor();
assert.equal(await page.getByRole('combobox', {name: '保険者'}).inputValue(), 'kanda');
const form = await sheet.locator('.form-page').first().innerText();
for (const t of ['（サンプル）山田', '0000366989', '福岡県行橋市中央1-1', '①玄関', '②トイレ']) assert.ok(form.includes(t), `見積書に「${t}」がない`);
assert.equal(await sheet.locator('.form-page tr[data-rows]').count(), 2); // 箇所ごとに空白の行
await page.screenshot({path: path.join(outDir, '80-from-shinsei.png')});
// 広域連合の申請書から（改修の内容は内訳明細書の改修の種類の行から読む）
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
await home.waitFor();
await home.getByLabel('申請書（Excel）から作る').setInputFiles(kk.file);
await page.locator('[aria-live] > div', {hasText: '申請書から見積書を作りました（広域連合・2箇所）'}).waitFor();
assert.equal(await page.getByRole('combobox', {name: '保険者'}).inputValue(), 'kouiki');
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '（サンプル）山田様邸'); // 広域連合用の書式には氏名の欄がない
const kform = await sheet.locator('.form-page').first().innerText();
for (const t of ['玄関', 'トイレ']) assert.ok(kform.includes(t), `見積書（広域連合用）に「${t}」がない`);
log('申請書（Excel）から見積書を作るOK（苅田町・広域連合）');

console.log('\nERRORS:', errors.length ? errors : 'なし');
assert.deepEqual(errors, []);
await browser.close();
