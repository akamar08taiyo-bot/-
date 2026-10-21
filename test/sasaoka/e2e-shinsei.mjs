// 申請書を確かめる：見積書の「📝 申請書を作成」で申請書の画面（申請書の順番の欄）を開き、「📗 申請書をExcelで保存」で、保険者の申請書の原本
//   （行橋市・苅田町・みやこ町・広域連合）に 被保険者氏名・住所・被保険者番号（10マス）・改修の内容（「玄関① 木製L字手すり L=600×850㎜」）と、
//   申請書の画面で入れた フリガナ・生年月日・電話番号など を転記した Excel を保存する。ほかのシートはそのまま。丸で囲む項目（性別・元号・要介護状態区分・改修状況）は
//   申請書の画面で押したものを楕円の図形で囲む（見積書に残るので次も同じ）。
//   見積もりの入口の「📝 申請書から作る」で申請書から先に入れ（Enter で次の欄）、「→ 見積書を作る」で同じ様邸の見積書へ。申請書だけでも Excel にできる。
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
const shinseiForm = page.getByRole('form', {name: '申請書'});
/** 申請書の画面で「📗 申請書をExcelで保存」 */
const saveExcel = async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  const file = path.join(outDir, dl.suggestedFilename());
  await dl.saveAs(file);
  return {name: dl.suggestedFilename(), file, bytes: new Uint8Array(await readFile(file))};
};
/** 見積書の「📝 申請書を作成」→ 申請書の画面で丸で囲むものを押す（[項目, 値]。押してあるものをもう一度押すと外す）→ Excel を保存 → 見積書へもどる */
const make = async (picks = [], shot = '') => {
  await page.getByRole('button', {name: '📝 申請書を作成'}).click();
  await shinseiForm.waitFor();
  for (const [group, value] of picks) await shinseiForm.getByRole('group', {name: group}).getByRole('button', {name: value, exact: true}).click();
  if (shot) await page.screenshot({path: path.join(outDir, shot), fullPage: true});
  const got = await saveExcel();
  await page.getByRole('button', {name: '→ 見積書へ'}).click();
  await sheet.waitFor();
  return got;
};
/** 申請書の画面の欄の名前（上からの順番） */
const rowLabels = () => shinseiForm.locator(':scope > div.border-b > div:first-child').allInnerTexts();

// 改修の内容・工事内容は前の申請の書き方（玄関① 木製L字手すり L=600×850㎜）。サンプルの玄関は木の手すりを 60cm、トイレは L型手すり
const WORKS = '玄関① 木製手すり L=600㎜\nトイレ② L字手すり';

// ---------------- 行橋市：住改・受領委任払のシートに転記（14枚のシートはそのまま）。丸は 元号・性別・要介護状態区分
// 申請書の画面は申請書の順番。見積書の氏名・番号・住所は入っている。フリガナから Enter で次の欄へ進める
await page.getByRole('button', {name: '📝 申請書を作成'}).click();
await shinseiForm.waitFor();
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修の内容・箇所及び規模', '着工予定日・完成予定日', '改修予定費用']);
assert.deepEqual([await shinseiForm.getByLabel('被保険者氏名').inputValue(), await shinseiForm.getByLabel('被保険者番号').inputValue(), await shinseiForm.getByLabel('住所').inputValue()], ['（サンプル）山田', '0000366989', '福岡県行橋市中央1-1']);
assert.match(await page.getByRole('status', {name: '入っていない欄'}).innerText(), /フリガナ・生年月日・性別・郵便番号・電話番号・要介護状態区分・住宅の所有者・着工予定日・完成予定日/);
await shinseiForm.getByLabel('フリガナ').fill('サンプル　ヤマダ');
await shinseiForm.getByLabel('フリガナ').press('Enter');
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '被保険者氏名'); // Enter で次の欄
await shinseiForm.getByLabel('生年月日の年').fill('23');
await shinseiForm.getByLabel('生年月日の月').fill('5');
await shinseiForm.getByLabel('生年月日の日').fill('6');
await shinseiForm.getByLabel('郵便番号').fill('824-0001');
await shinseiForm.getByLabel('電話番号').fill('0930-11-2222');
await shinseiForm.getByRole('button', {name: '本人の家'}).click();
await shinseiForm.getByLabel('着工予定日').fill('2026-11-05');
await shinseiForm.getByLabel('完了予定日').fill('2026-11-20');
await page.getByRole('button', {name: '→ 見積書へ'}).click();
await sheet.waitFor();
const yk = await make([['性別', '女'], ['元号', '昭和'], ['要介護状態区分', '要介護2']], '81-shinsei-form.png');
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
assert.match(main, /<c r="F20" s="\d+"><v>\d+<\/v><\/c>/); // 改修予定費用は見積書の介護保険対象分の合計（数）
log('行橋市の申請書（申請書の順番の画面・氏名・住所・被保険者番号・フリガナ・生年月日・電話・所有者・予定日・費用・改修の内容・丸3つ）OK');

// ---------------- 苅田町：事前申請書のシートに転記（事後申請書は式で同じ内容）
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');
// 選んだものは見積書に残る（次に開いたときも選んである）。もう一度押すと外れる
await page.getByRole('button', {name: '📝 申請書を作成'}).click();
const pressed = () => shinseiForm.locator('button[aria-pressed="true"]').allInnerTexts();
assert.deepEqual(await pressed(), ['昭和', '女', '要介護2']);
await shinseiForm.getByRole('button', {name: '要介護2', exact: true}).click();
assert.deepEqual(await pressed(), ['昭和', '女']);
await page.getByRole('button', {name: '→ 見積書へ'}).click();
const kd = await make([['要介護状態区分', '要支援1']]);
assert.match(kd.name, /^苅田町申請書_（サンプル）山田様_/);
const k = sheetsOf(kd.bytes);
assert.equal(k.sheets.size, 15);
const pre = k.sheets.get('事前申請書');
assert.deepEqual([text(pre, 'J7'), text(pre, 'J11'), text(pre, 'J14')], ['（サンプル）山田', '福岡県行橋市中央1-1', WORKS]);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(pre, r)).join(''), '0000366989');
assert.match(k.sheets.get('事後申請書'), /<f>事前申請書!J7<\/f><v>（サンプル）山田<\/v>/);
assert.deepEqual([k.ellipses('事前申請書'), k.ellipses('事後申請書')], [3, 3]); // 女・昭・要支援１（事後申請書にも）
assert.deepEqual(['J6', 'J9', 'J10', 'AB11', 'W13'].map((r) => text(pre, r)), ['サンプル　ヤマダ', '明　・　大　・　昭　23年5月6日生', '〒824-0001', '0930-11-2222', '本人との関係（本人）']);
await page.locator('[aria-live] > div', {hasText: `「${kd.name}」を保存しました`}).waitFor();
log('苅田町の申請書（事前申請書・事後申請書は式で同じ・申請書の画面の項目）OK');

// ---------------- みやこ町：承認届出書に転記（支給申請書・内訳明細書の氏名・番号・住所は承認届出書を参照する式）。改修の内容は内訳明細書の種類の行
const boxes = (col, n, row) => Array.from({length: n}, (_, i) => {
  const c = [...col].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) + i;
  const name = (k) => (k <= 0 ? '' : name(Math.floor((k - 1) / 26)) + String.fromCharCode(65 + ((k - 1) % 26)));
  return `${name(c)}${row}`;
});
await page.getByRole('combobox', {name: '保険者'}).selectOption('miyako');
const my = await make([['現在までの改修状況', '無']]);
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
for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）']) assert.equal(g.ellipses(name), 2, name);
log('広域連合の申請書（承認申請書・支給申請書・内訳明細書・平面図・写真貼付用紙・丸）OK');
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
// 申請書に書いてあったフリガナ・生年月日・電話番号や改修の内容の文も、申請書の画面にもどる
await page.getByRole('button', {name: '📝 申請書を作成'}).click();
await shinseiForm.waitFor();
assert.deepEqual(
  await Promise.all(['フリガナ', '生年月日の年', '電話番号', '郵便番号'].map((l) => shinseiForm.getByLabel(l).inputValue())),
  ['サンプル　ヤマダ', '23', '0930-11-2222', '824-0001'],
);
assert.deepEqual(await shinseiForm.getByLabel('申請書に書く文').evaluateAll((els) => els.map((e) => e.value)), ['木製手すり L=600㎜', 'L字手すり']);
await page.getByRole('button', {name: '→ 見積書へ'}).click();
await sheet.waitFor();
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
log('申請書（Excel）から見積書を作るOK（苅田町・広域連合。申請書の項目ももどる）');

// ---------------- 申請書から先に作る（苅田町）：申請書の順番に Enter で入れる → 箇所を足す → Excel → 「→ 見積書を作る」で同じ様邸の見積書
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
await home.waitFor();
await page.getByRole('group', {name: '申請書から作る'}).getByRole('button', {name: '📝 苅田町'}).click();
await shinseiForm.waitFor();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '新しい申請書');
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者番号', '被保険者氏名', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修の内容・箇所及び規模', '着工予定日・完了予定日', '改修予定費用']);
// フリガナの欄から、申請書の順番に打って Enter（被保険者番号・氏名・生年月日・郵便番号・住所・電話番号・所有者・本人との関係）
for (const t of ['ミホン　イチロウ', '1234567890', '見本 一郎', '10', '3', '4', '800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '見本 花子', '妻']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
for (const [group, value] of [['元号', '昭和'], ['性別', '男'], ['要介護状態区分', '要支援2']]) await shinseiForm.getByRole('group', {name: group}).getByRole('button', {name: value, exact: true}).click();
await shinseiForm.getByRole('button', {name: '＋ 玄関'}).click();
await shinseiForm.getByRole('button', {name: '＋ トイレ'}).click();
await shinseiForm.getByLabel('申請書に書く文').first().fill('I型手すり L=800㎜ H=750');
await shinseiForm.getByLabel('着工予定日').fill('2026-12-01');
await shinseiForm.getByLabel('完了予定日').fill('2026-12-10');
await shinseiForm.getByLabel('改修予定費用').fill('120000');
await page.locator('[role="status"][aria-label="入っていない欄"]', {hasText: 'すべて入っています'}).waitFor();
await page.screenshot({path: path.join(outDir, '82-shinsei-first.png'), fullPage: true});
const first = sheetsOf((await saveExcel()).bytes);
const fp = first.sheets.get('事前申請書');
assert.deepEqual(
  ['J6', 'J7', 'J9', 'J10', 'J11', 'AB11', 'J13', 'W13', 'J14', 'Y15', 'Y16', 'J17'].map((r) => text(fp, r)),
  ['ミホン　イチロウ', '見本 一郎', '明　・　大　・　昭　10年3月4日生', '〒800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '見本 花子', '本人との関係（妻）', '玄関① I型手すり L=800㎜ H=750\nトイレ② 手すり', '令和8年12月1日', '令和8年12月10日', '120,000円'],
);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(fp, r)).join(''), '1234567890');
assert.deepEqual([first.ellipses('事前申請書'), first.ellipses('事後申請書')], [3, 3]);
// 読み直しても申請書の画面のまま（URL に view=shinsei）。自動保存は打ち終わって 0.4 秒後なので、少し待ってから読み直す
await page.waitForTimeout(1200);
await page.reload();
await shinseiForm.waitFor();
assert.equal(await shinseiForm.getByLabel('フリガナ').inputValue(), 'ミホン　イチロウ');
// 見積書を作る：氏名・番号・住所・箇所が入った見積書。笹岡工務店の請求書にも入る
await page.getByRole('button', {name: '→ 見積書を作る'}).click();
await sheet.waitFor();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 一郎様邸');
const est = await sheet.locator('.form-page').first().innerText();
for (const t of ['見本 一郎', '1234567890', '福岡県京都郡苅田町富久町2-2', '①玄関', '②トイレ']) assert.ok(est.includes(t), `見積書に「${t}」がない`);
assert.equal(await page.getByLabel('笹岡工務店の請求書に入れる').isChecked(), true);
await page.getByRole('button', {name: '📝 申請書を作成'}).click();
await shinseiForm.waitFor();
assert.equal(await page.getByRole('button', {name: '→ 見積書へ'}).count(), 1);
log('申請書から先に作る（申請書の順番・Enter で次の欄・丸・箇所・Excel・読み直し・見積書へ）OK');

// ---------------- 申請書だけ（みやこ町）：見積書を作らずに Excel にする。一覧に出て、そこから申請書を開ける
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もりを作成する/}).click();
await home.waitFor();
await page.getByRole('group', {name: '申請書から作る'}).getByRole('button', {name: '📝 みやこ町'}).click();
await shinseiForm.waitFor();
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者番号', '被保険者氏名', '生年月日', '性別', '郵便番号', '住所', '電話番号', '住宅の所有者', '住宅改修が必要な理由書作成者', '改修の内容・箇所及び規模', '改修費用（介護保険対象分）', '現在までの改修状況', '着工日・完成日']);
await shinseiForm.getByLabel('被保険者氏名').fill('見本 次郎');
await shinseiForm.getByLabel('理由書作成者の事業所名').fill('見本居宅介護支援事業所');
await shinseiForm.getByLabel('理由書作成者の氏名').fill('見本 三郎');
await shinseiForm.getByRole('button', {name: '＋ 浴室'}).click();
await shinseiForm.getByLabel('申請書に書く文').fill('浴室用手すり L=600㎜');
await shinseiForm.getByLabel('改修費用（介護保険対象分）').fill('80000');
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
await listRow.getByRole('button', {name: '📝 申請書'}).click();
await shinseiForm.waitFor();
assert.equal(await shinseiForm.getByLabel('被保険者氏名').inputValue(), '見本 次郎');
log('申請書だけ（みやこ町。見積書なしで Excel・一覧から申請書を開く）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
assert.deepEqual(errors, []);
await browser.close();
