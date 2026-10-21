// 申請書を確かめる：様邸の画面の2つのタブ（左に「📝 申請書」、右に「📋 見積書」）。申請書のタブは、保険者の申請書の原本を様式のまま画面に描き（プレビュー）、
//   欄を押して入れる（入れる所が欄の下に出る。Enter で次の欄。性別・元号・要介護状態区分・改修状況は申請書の文字を押すと丸）。
//   同じ様邸なので、見積書で入れた氏名・番号・住所・改修の内容・金額（改修予定費用）がすぐ申請書に出て、申請書で入れた氏名なども見積書に出る。
//   「📗 申請書をExcelで保存」で、原本（行橋市・苅田町・みやこ町・広域連合）に転記した Excel を保存する（ほかのシートはそのまま。丸は楕円の図形）。
//   「📋 一覧で入れる」にすると、前の版の入れ方（申請書の順番の一覧）。
//   新規作成は申請書のタブから（フリガナの欄が開いている）。見積書に行を入れると笹岡工務店の請求書に入る（申請書だけなら入れない）。
//   「📥 申請書（Excel）から作る」で、書いた申請書から見積書を作る
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
const typeIn = async (k, text, end = 'Enter') => {
  await cell(k).click();
  await page.keyboard.type(text);
  if (end) await page.keyboard.press(end);
  await page.waitForTimeout(60);
};
const tds = async (text) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());

// ---------------- 様邸の画面のタブ：左に申請書、右に見積書。見積書のある様邸は、一覧から見積書のタブで開く
const tablist = page.getByRole('tablist', {name: '申請書と見積書'});
assert.deepEqual(await tablist.getByRole('tab').allInnerTexts(), ['📝 申請書', '📋 見積書']);
const shinseiTab = page.getByRole('tab', {name: '📝 申請書'});
const estimateTab = page.getByRole('tab', {name: '📋 見積書'});
assert.equal(await estimateTab.getAttribute('aria-selected'), 'true');
await typeIn('job:insuredNo', '0000366989');
// Enter で下の工事場所（住所）の欄に移っているので、そのまま打ち込む
await page.keyboard.type('福岡県行橋市中央1-1');
await page.keyboard.press('Enter');
// 玄関の木の手すりを 60cm で使っている（サンプル）。見積の合計 26,958 円
assert.deepEqual((await tds('合計')).filter(Boolean), ['合計', '26,958', '26,958']);

/** シート名 → XML。ellipses はシートの楕円の図形の数（申請書の丸） */
const sheetsOf = (bytes) => {
  const files = unzipSync(bytes);
  const wb = strFromU8(files['xl/workbook.xml']);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
  const out = new Map();
  const paths = new Map();
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? '';
    out.set(m[1], strFromU8(files[`xl/${target}`]));
    paths.set(m[1], `xl/${target}`);
  }
  const ellipses = (name) => {
    const p = paths.get(name);
    const rid = /<drawing r:id="([^"]+)"/.exec(out.get(name))?.[1];
    if (!rid) return 0;
    const sheetRels = strFromU8(files[p.replace(/([^/]+)$/, '_rels/$1.rels')]);
    const d = new RegExp(`Id="${rid}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(sheetRels)?.[1];
    return (strFromU8(files[`xl/drawings/${d}`]).match(/prst="ellipse"/g) ?? []).length;
  };
  return {files, sheets: out, ellipses};
};
const text = (xml, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');

const preview = page.getByLabel('申請書のプレビュー');
/** プレビューの1枚（原本のシート） */
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
const pageNames = () => preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
/** 申請書の欄を押して入れる所を開く（同じ項目の欄が2つ＝式で同じ値を出す欄があるときは最初。開いている入れる所は下の欄にかぶるので、先に Esc で閉じる） */
const openSpot = async (label, where = preview) => {
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
  const el = where.getByRole('button', {name: label, exact: true}).first();
  // 欄の中の丸で囲む値（生年月日の「昭」など）を押すと丸がつくので、値のない所を押す
  const at = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const opts = [...node.parentElement.querySelectorAll('button[aria-pressed]')].map((b) => b.getBoundingClientRect());
    for (const fx of [0.5, 0.95, 0.05, 0.75, 0.25]) {
      for (const fy of [0.5, 0.15, 0.85]) {
        const [x, y] = [r.left + r.width * fx, r.top + r.height * fy];
        if (!opts.some((o) => x >= o.left && x <= o.right && y >= o.top && y <= o.bottom)) return {x: r.width * fx, y: r.height * fy};
      }
    }
    return {x: r.width / 2, y: r.height / 2};
  });
  await el.click({position: at});
  await dlg(label).waitFor();
};
/** 欄を押したときに出る、入れる所 */
const dlg = (label) => page.getByRole('dialog', {name: `${label}を入れる`});
/** 丸で囲む値を押す */
const mark = (value) => preview.getByRole('button', {name: `${value}に丸をつける`}).first();
const pressed = () => preview.locator('button[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace('に丸をつける', '')));
const status = page.getByRole('status', {name: '入っていない欄'});
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
/** 「📗 申請書をExcelで保存」 */
const saveExcel = async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  const file = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(file);
  return {name: dl.suggestedFilename(), file, bytes: new Uint8Array(await readFile(file))};
};
/** 申請書のタブで丸で囲む値を押して（押してあるものをもう一度押すと外れる）、Excel を保存する */
const make = async (picks = [], shot = '') => {
  await shinseiTab.click();
  await preview.waitFor();
  for (const v of picks) await mark(v).click();
  if (shot) await page.screenshot({path: path.join(outDir, shot), fullPage: true});
  return saveExcel();
};

// 改修の内容・工事内容は前の申請の書き方（玄関① 木製L字手すり L=600×850㎜）。サンプルの玄関は木の手すりを 60cm、トイレは L型手すり
const WORKS = '玄関① 木製手すり L=600㎜\nトイレ② L字手すり';

// ---------------- 行橋市：申請書のタブ＝原本の様式のまま（表題はヘッダー）。見積書の氏名・住所・改修の内容・金額がもう入っている
await shinseiTab.click();
await preview.waitFor();
assert.deepEqual(await pageNames(), ['住改・受領委任払']);
let pv = await preview.innerText();
for (const t of ['介護保険居宅（ 介護・介護予防 ）住宅改修費受領委任払い申請書', '被保険者氏名', '（サンプル）山田', '福岡県行橋市中央1-1', '玄関① 木製手すり L=600㎜', 'トイレ② L字手すり', '26,958']) {
  assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
}
// まだ入っていない欄は上に出て、押すとその欄が開く。開いている欄がないので何も出ていない（入れた様邸）
assert.equal(await page.getByRole('dialog').count(), 0);
for (const t of ['フリガナ', '生年月日', '性別', '郵便番号', '電話番号', '要介護状態区分', '住宅の所有者', '着工予定日・完成予定日']) assert.ok((await status.innerText()).includes(t), t);
assert.ok(!(await status.innerText()).includes('被保険者氏名'));
await status.getByRole('button', {name: 'フリガナ'}).click();
await dlg('フリガナ').getByLabel('フリガナ').fill('サンプル　ヤマダ');
await dlg('フリガナ').getByLabel('フリガナ').press('Enter');
// Enter で次の欄（行橋市の申請書の順番：フリガナ → 被保険者氏名）。氏名は見積書と同じ
await dlg('被保険者氏名').waitFor();
assert.equal(await focused(), '被保険者氏名');
assert.equal(await dlg('被保険者氏名').getByLabel('被保険者氏名').inputValue(), '（サンプル）山田');
assert.ok((await preview.innerText()).includes('サンプル　ヤマダ'));
// 欄を押して入れる（入れる所は欄のすぐ下）
await openSpot('生年月日');
await dlg('生年月日').getByLabel('生年月日の年').fill('23');
await dlg('生年月日').getByLabel('生年月日の月').fill('5');
await dlg('生年月日').getByLabel('生年月日の日').fill('6');
await openSpot('郵便番号');
await dlg('郵便番号').getByLabel('郵便番号').fill('824-0001');
await openSpot('電話番号');
await dlg('電話番号').getByLabel('電話番号').fill('0930-11-2222');
await openSpot('住宅の所有者');
await dlg('住宅の所有者').getByRole('button', {name: '本人の家'}).click();
await openSpot('着工予定日・完成予定日');
await dlg('着工予定日・完成予定日').getByLabel('着工予定日').fill('2026-11-05');
await dlg('着工予定日・完成予定日').getByLabel('完了予定日').fill('2026-11-20');
await page.keyboard.press('Escape');
assert.equal(await page.getByRole('dialog').count(), 0);
// 丸：申請書の「女」「昭」「要介護２」を押す
const yk = await make(['女', '昭和', '要介護2'], '81-shinsei-preview.png');
pv = await preview.innerText();
for (const t of ['サンプル　ヤマダ', '23年5月6日生', '824-0001', '0930-11-2222', '本人との関係（本人）', '令和8年11月5日', '令和8年11月20日']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
assert.deepEqual(await pressed(), ['昭和', '女', '要介護2']);
assert.equal(await pageOf('住改・受領委任払').locator('svg ellipse').count(), 3); // 画面にも丸
assert.match(yk.name, /^行橋市申請書_（サンプル）山田様_\d{4}-\d{2}-\d{2}\.xlsx$/);
const y = sheetsOf(yk.bytes);
assert.equal(y.sheets.size, 14);
const main = y.sheets.get('住改・受領委任払');
assert.equal(text(main, 'F5'), '（サンプル）山田');
assert.equal(text(main, 'F11'), '福岡県行橋市中央1-1');
assert.equal(['Z7', 'AA7', 'AB7', 'AC7', 'AD7', 'AE7', 'AF7', 'AG7', 'AH7', 'AI7'].map((r) => text(main, r)).join(''), '0000366989');
assert.equal(text(main, 'F14'), WORKS);
assert.equal(y.ellipses('住改・受領委任払'), 3); // 図形のないシートに図形を足して、女・昭・要介護２を囲む
assert.deepEqual(['F4', 'F9', 'G10', 'Y10', 'F13', 'V13', 'AB16', 'AB18'].map((r) => text(main, r)), ['サンプル　ヤマダ', '明・大・昭　23年5月6日生', '824-0001', '0930-11-2222', '（サンプル）山田', '本人との関係（本人）', '令和8年11月5日', '令和8年11月20日']);
assert.match(main, /<c r="F20" s="\d+"><v>26958<\/v><\/c>/); // 改修予定費用は見積書の合計（数）
log('行橋市の申請書（タブ・プレビュー・欄を押して入れる・Enter で次の欄・丸・見積書の金額・Excel）OK');

// ---------------- 見積書で直すと、申請書にすぐ出る（改修予定費用＝見積書の合計）。申請書で直した氏名は見積書に出る
await estimateTab.click();
const lKey = await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit$=":qty"]').first().getAttribute('data-edit');
await typeIn(lKey, '2');
const total2 = (await tds('合計')).filter(Boolean)[1];
assert.notEqual(total2, '26,958');
await shinseiTab.click();
assert.ok((await preview.innerText()).includes(total2), `改修予定費用が見積書の合計（${total2}）になっていない`);
await openSpot('被保険者氏名');
await dlg('被保険者氏名').getByLabel('被保険者氏名').fill('（サンプル）山田 花');
await estimateTab.click();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '（サンプル）山田 花様邸');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('（サンプル）山田 花'));
await shinseiTab.click();
await openSpot('被保険者氏名');
await dlg('被保険者氏名').getByLabel('被保険者氏名').fill('（サンプル）山田');
await page.keyboard.press('Escape');
await estimateTab.click();
await typeIn(lKey, '1');
log('見積書と申請書がすぐつながる（金額・氏名）OK');

// ---------------- 苅田町：保険者を替えると苅田町の申請書。丸は残る（もう一度押すと外れる）。事後申請書は式で同じ内容
await shinseiTab.click();
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');
await pageOf('事前申請書').waitFor();
assert.deepEqual(await pageNames(), ['事前申請書']);
assert.deepEqual(await pressed(), ['昭和', '女', '要介護2']);
assert.ok((await preview.innerText()).includes('26,958円')); // 苅田町も改修予定費用＝見積書の合計
await mark('要介護2').click();
assert.deepEqual(await pressed(), ['昭和', '女']);
const kd = await make(['要支援1']);
assert.match(kd.name, /^苅田町申請書_（サンプル）山田様_/);
const k = sheetsOf(kd.bytes);
assert.equal(k.sheets.size, 15);
const pre = k.sheets.get('事前申請書');
assert.deepEqual([text(pre, 'J7'), text(pre, 'J11'), text(pre, 'J14'), text(pre, 'J17')], ['（サンプル）山田', '福岡県行橋市中央1-1', WORKS, '26,958円']);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(pre, r)).join(''), '0000366989');
assert.match(k.sheets.get('事後申請書'), /<f>事前申請書!J7<\/f><v>（サンプル）山田<\/v>/);
assert.deepEqual([k.ellipses('事前申請書'), k.ellipses('事後申請書')], [3, 3]); // 女・昭・要支援１（事後申請書にも）
assert.deepEqual(['J6', 'J9', 'J10', 'AB11', 'W13'].map((r) => text(pre, r)), ['サンプル　ヤマダ', '明　・　大　・　昭　23年5月6日生', '〒824-0001', '0930-11-2222', '本人との関係（本人）']);
await page.locator('[aria-live] > div', {hasText: `「${kd.name}」を保存しました`}).waitFor();
log('苅田町の申請書（事前申請書・事後申請書は式で同じ・丸を外す）OK');

// ---------------- みやこ町：承認届出書・支給申請書・内訳明細書の3枚（支給申請書・内訳明細書の氏名などは承認届出書を参照する式）。改修の内容は内訳明細書の種類の行
const boxes = (col, n, row) =>
  Array.from({length: n}, (_, i) => {
    const c = [...col].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) + i;
    const name = (kk) => (kk <= 0 ? '' : name(Math.floor((kk - 1) / 26)) + String.fromCharCode(65 + ((kk - 1) % 26)));
    return `${name(c)}${row}`;
  });
await page.getByRole('combobox', {name: '保険者'}).selectOption('miyako');
await pageOf('住宅改修承認届出書').waitFor();
assert.deepEqual(await pageNames(), ['住宅改修承認届出書', '住宅改修費支給申請書(受領委任払用)', '住宅改修内訳明細書']);
// 支給申請書の氏名（式で承認届出書と同じ）を押しても、氏名の欄が開く
await openSpot('被保険者氏名', pageOf('住宅改修内訳明細書'));
await page.keyboard.press('Escape');
assert.ok((await pageOf('住宅改修内訳明細書').innerText()).includes('玄関① 木製手すり L=600㎜'));
const my = await make(['無']);
assert.match(my.name, /^みやこ町申請書_（サンプル）山田様_/);
const m = sheetsOf(my.bytes);
assert.equal(m.sheets.size, 12);
const top = m.sheets.get('住宅改修承認届出書');
assert.deepEqual([text(top, 'I5'), text(top, 'I9'), boxes('W', 10, 4).map((r) => text(top, r)).join('')], ['（サンプル）山田', '福岡県行橋市中央1-1', '0000366989']);
assert.equal(text(m.sheets.get('住宅改修費支給申請書(受領委任払用)'), 'J6'), '（サンプル）山田');
const md = m.sheets.get('住宅改修内訳明細書');
assert.deepEqual([text(md, 'D15'), text(md, 'K14')], ['玄関・トイレ', WORKS]);
assert.deepEqual([1, 2, 3].map((n) => text(m.sheets.get(`写真 (${n})`), 'B5')), ['玄関', 'トイレ', '']); // 写真番号の改修場所
// 性別（女）・改修状況（無）を囲む。承認届出書は原本の丸（受領委任払いなど2つ）に足す。支給申請書は図形を足す
assert.deepEqual([m.ellipses('住宅改修承認届出書'), m.ellipses('住宅改修費支給申請書(受領委任払用)')], [2 + 2, 2]);
log('みやこ町の申請書（3枚のプレビュー・式の欄も押せる・承認届出書・支給申請書・内訳明細書・写真）OK');

// ---------------- 広域連合（築上町など）：承認申請書・支給申請書（受領委任払用）・内訳明細書（別紙）・平面図・写真貼付用紙
await page.getByRole('combobox', {name: '保険者'}).selectOption('kouiki');
await pageOf('様式第2号（住宅改修承認申請書）').waitFor();
assert.deepEqual(await pageNames(), ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）', '様式第2号別紙（住宅改修内訳明細書）']);
assert.ok((await preview.innerText()).includes('様式第２号（第６条関係）')); // ヘッダー
await estimateTab.click();
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
for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）']) assert.equal(g.ellipses(name), 2, name);
log('広域連合の申請書（3枚のプレビュー・ヘッダー・承認申請書・支給申請書・内訳明細書・平面図・写真貼付用紙・丸）OK');
// 4つの保険者すべてで申請書の Excel のボタンが出る
for (const i of ['kanda', 'yukuhashi', 'miyako', 'kouiki']) {
  await page.getByRole('combobox', {name: '保険者'}).selectOption(i);
  assert.equal(await page.getByRole('button', {name: '📗 申請書をExcelで保存'}).count(), 1, i);
}
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');

// ---------------- 一覧で入れる（前の版の入れ方）：申請書の順番に項目が並ぶ。入れたものは申請書の形でも同じ。この端末で覚えておく
const shinseiForm = page.getByRole('form', {name: '申請書'});
const rowLabels = () => shinseiForm.locator(':scope > div.border-b > div:first-child').allInnerTexts();
await page.getByRole('button', {name: '📋 一覧で入れる'}).click();
await shinseiForm.waitFor();
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者番号', '被保険者氏名', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修の内容・箇所及び規模', '着工予定日・完了予定日', '改修予定費用']);
assert.equal(await shinseiForm.getByLabel('フリガナ').inputValue(), 'サンプル　ヤマダ');
await shinseiForm.getByLabel('フリガナ').press('Enter');
assert.equal(await focused(), '被保険者番号'); // Enter で次の欄
assert.equal(await shinseiForm.getByLabel('改修予定費用').inputValue(), '26,958');
assert.ok((await shinseiForm.innerText()).includes('見積書の合計（税込）'));
await page.reload();
await shinseiForm.waitFor();
await page.getByRole('button', {name: '📄 申請書で入れる'}).click();
await preview.waitFor();
log('一覧で入れる（申請書の順番・Enter で次の欄・覚えておく）OK');

// ---------------- 申請書（Excel）から作る：氏名・住所・被保険者番号・改修の箇所で新しい見積書（見積書のタブで開く）
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
const home = page.getByRole('region', {name: '新規作成'});
await home.waitFor();
assert.equal(await page.getByRole('group', {name: '申請書から作る'}).count(), 0); // 新規作成で申請書と見積書の両方
await home.getByLabel('申請書（Excel）から作る').setInputFiles(kd.file);
await sheet.waitFor();
await page.locator('[aria-live] > div', {hasText: '申請書から見積書を作りました（苅田町・2箇所）'}).waitFor();
assert.equal(await estimateTab.getAttribute('aria-selected'), 'true');
assert.equal(await page.getByRole('combobox', {name: '保険者'}).inputValue(), 'kanda');
const form = await sheet.locator('.form-page').first().innerText();
for (const t of ['（サンプル）山田', '0000366989', '福岡県行橋市中央1-1', '①玄関', '②トイレ']) assert.ok(form.includes(t), `見積書に「${t}」がない`);
assert.equal(await sheet.locator('.form-page tr[data-rows]').count(), 2); // 箇所ごとに空白の行
await page.screenshot({path: path.join(outDir, '80-from-shinsei.png')});
// 申請書に書いてあったフリガナ・生年月日・電話番号や改修の内容の文も、申請書のタブに出る
await shinseiTab.click();
pv = await preview.innerText();
for (const t of ['サンプル　ヤマダ', '23年5月6日生', '0930-11-2222', '〒824-0001', '玄関① 木製手すり L=600㎜', 'トイレ② L字手すり']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
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
log('申請書（Excel）から見積書を作るOK（苅田町・広域連合。申請書の項目も出る）');

// ---------------- 新規作成（苅田町）：申請書のタブで開き、フリガナの欄が開いている。申請書の順番に打って Enter（性別・要介護状態区分は選ぶと次へ）
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
await home.waitFor();
await home.getByRole('button', {name: '＋ 苅田町', exact: true}).click();
await dlg('フリガナ').waitFor();
assert.equal(await shinseiTab.getAttribute('aria-selected'), 'true');
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '新しい申請書');
assert.equal(await focused(), 'フリガナ');
for (const t of ['ミホン　イチロウ', '1234567890', '見本 一郎', '10', '3', '4']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
await dlg('性別').waitFor();
await page.keyboard.press('Enter'); // 男
for (const t of ['800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
await dlg('要介護状態区分').waitFor();
await page.keyboard.press('Tab');
await page.keyboard.press('Enter'); // 要支援2
for (const t of ['見本 花子', '妻']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
const works = dlg('改修の内容・箇所及び規模');
await works.getByRole('button', {name: '＋ 玄関'}).click();
await works.getByRole('button', {name: '＋ トイレ'}).click();
await works.getByLabel('申請書に書く文').first().fill('I型手すり L=800㎜ H=750');
await works.getByRole('button', {name: '次の欄'}).click();
await dlg('着工予定日・完了予定日').getByLabel('着工予定日').fill('2026-12-01');
await dlg('着工予定日・完了予定日').getByLabel('完了予定日').fill('2026-12-10');
await dlg('着工予定日・完了予定日').getByRole('button', {name: '次の欄'}).click();
await dlg('改修予定費用').getByLabel('改修予定費用').fill('120000');
await page.keyboard.press('Enter'); // 最後の欄なので閉じる
assert.equal(await page.getByRole('dialog').count(), 0);
await mark('昭和').click();
await status.filter({hasText: 'すべて入っています'}).waitFor();
assert.deepEqual(await pressed(), ['昭和', '男', '要支援2']);
await page.screenshot({path: path.join(outDir, '82-shinsei-new.png'), fullPage: true});
pv = await preview.innerText();
for (const t of ['ミホン　イチロウ', '見本 一郎', '10年3月4日生', '〒800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '本人との関係（妻）', '玄関① I型手すり L=800㎜ H=750', 'トイレ② 手すり', '令和8年12月1日', '120,000円']) {
  assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
}
const first = sheetsOf((await saveExcel()).bytes);
const fp = first.sheets.get('事前申請書');
assert.deepEqual(
  ['J6', 'J7', 'J9', 'J10', 'J11', 'AB11', 'J13', 'W13', 'J14', 'Y15', 'Y16', 'J17'].map((r) => text(fp, r)),
  ['ミホン　イチロウ', '見本 一郎', '明　・　大　・　昭　10年3月4日生', '〒800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '見本 花子', '本人との関係（妻）', '玄関① I型手すり L=800㎜ H=750\nトイレ② 手すり', '令和8年12月1日', '令和8年12月10日', '120,000円'],
);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(fp, r)).join(''), '1234567890');
assert.deepEqual([first.ellipses('事前申請書'), first.ellipses('事後申請書')], [3, 3]);
// 読み直しても申請書のタブのまま（URL に view=shinsei）。自動保存は打ち終わって 0.4 秒後なので、少し待ってから読み直す
await page.waitForTimeout(1200);
await page.reload();
await preview.waitFor();
assert.equal(await shinseiTab.getAttribute('aria-selected'), 'true');
assert.ok((await preview.innerText()).includes('ミホン　イチロウ'));
assert.equal(await page.getByRole('dialog').count(), 0); // 入れてある様邸は、欄を開かない
// 見積書のタブ：氏名・番号・住所・箇所が入っている。行を入れるまでは笹岡工務店の請求書に入れない。行を入れると入る（見積もり作成日も今日）
await estimateTab.click();
await sheet.waitFor();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 一郎様邸');
const est = await sheet.locator('.form-page').first().innerText();
for (const t of ['見本 一郎', '1234567890', '福岡県京都郡苅田町富久町2-2', '①玄関', '②トイレ']) assert.ok(est.includes(t), `見積書に「${t}」がない`);
const inInvoice = page.getByLabel('笹岡工務店の請求書に入れる');
assert.equal(await inInvoice.isChecked(), false);
await typeIn('new:text', '取付金具', 'Tab');
await page.keyboard.press('Enter');
assert.equal(await inInvoice.isChecked(), true);
log('新規作成（申請書のタブから・フリガナが開いている・申請書の順番に Enter・丸・箇所・Excel・読み直し・見積書に行を入れると請求書に入る）OK');

// ---------------- 申請書だけ（みやこ町）：見積書を作らずに Excel にする。一覧に出て（請求書には入れない）、押すと申請書のタブで開く
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
await home.waitFor();
await home.getByRole('button', {name: '＋ みやこ町', exact: true}).click();
await dlg('フリガナ').waitFor();
await page.keyboard.press('Escape');
await openSpot('被保険者氏名');
await dlg('被保険者氏名').getByLabel('被保険者氏名').fill('見本 次郎');
await openSpot('住宅改修が必要な理由書作成者');
await dlg('住宅改修が必要な理由書作成者').getByLabel('理由書作成者の事業所名').fill('見本居宅介護支援事業所');
await dlg('住宅改修が必要な理由書作成者').getByLabel('理由書作成者の氏名').fill('見本 三郎');
await openSpot('改修の内容・箇所及び規模', pageOf('住宅改修内訳明細書'));
await dlg('改修の内容・箇所及び規模').getByRole('button', {name: '＋ 浴室'}).click();
await dlg('改修の内容・箇所及び規模').getByLabel('申請書に書く文').fill('浴室用手すり L=600㎜');
await openSpot('改修費用（介護保険対象分）');
await dlg('改修費用（介護保険対象分）').getByLabel('改修費用（介護保険対象分）').fill('80000');
await page.keyboard.press('Escape');
assert.ok((await pageOf('住宅改修内訳明細書').innerText()).includes('浴室① 浴室用手すり L=600㎜'));
const onlyMy = sheetsOf((await saveExcel()).bytes);
const myTop = onlyMy.sheets.get('住宅改修承認届出書');
assert.deepEqual(['I5', 'N11', 'N12'].map((r) => text(myTop, r)), ['見本 次郎', '見本居宅介護支援事業所', '見本 三郎']);
assert.match(myTop, /<c r="I23" s="\d+"><v>80000<\/v><\/c>/);
assert.equal(text(onlyMy.sheets.get('住宅改修内訳明細書'), 'K14'), '浴室① 浴室用手すり L=600㎜');
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '📋 見積書の一覧を開く'}).click();
const listRow = page.getByRole('row', {name: /見本 次郎/});
await listRow.waitFor();
assert.match(await listRow.innerText(), /入れない/); // 見積書のない申請書は笹岡工務店の請求書に入れない
await page.getByRole('cell', {name: /見本 次郎/}).click();
await preview.waitFor();
assert.equal(await shinseiTab.getAttribute('aria-selected'), 'true'); // まだ申請書だけなので申請書のタブ
assert.ok((await preview.innerText()).includes('見本 次郎'));
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('row', {name: /見本 次郎/}).getByRole('button', {name: '📝 申請書'}).click();
await preview.waitFor();
log('申請書だけ（みやこ町。見積書なしで Excel・請求書に入れない・一覧から申請書のタブで開く）OK');

// ---------------- スマホの幅：申請書は画面の幅に縮めて出し、欄を押すと入れる所は画面の下に出る
await page.setViewportSize({width: 390, height: 844});
await openSpot('フリガナ');
const sheetBox = await dlg('フリガナ').boundingBox();
assert.ok(sheetBox && sheetBox.y + sheetBox.height >= 843 && sheetBox.x <= 1 && sheetBox.width >= 389, JSON.stringify(sheetBox));
const paperBox = await pageOf('住宅改修承認届出書').boundingBox();
assert.ok(paperBox && paperBox.width <= 390, JSON.stringify(paperBox));
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); // 横にはみ出さない
await page.screenshot({path: path.join(outDir, '83-shinsei-phone.png')});
log('スマホの幅（縮めて出す・入れる所は画面の下）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
assert.deepEqual(errors, []);
await browser.close();
