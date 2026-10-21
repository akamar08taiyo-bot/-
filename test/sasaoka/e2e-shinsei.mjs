// 申請書を確かめる：様邸の画面の2つのタブ（左に「📝 申請書」、右に「📋 見積書」）。申請書のタブは、左に申請書の順番の一覧（入れる所）、右にプレビュー
//   （原本の様式のまま。ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。Enter で次の欄、入れている項目はプレビューで囲み、
//   プレビューの欄を押すと一覧のその欄へ。性別・元号・要介護状態区分・改修状況は一覧のボタンか、プレビューの申請書の文字を押すと丸。
//   同じ様邸なので、見積書で入れた氏名・番号・住所・改修の内容・金額（改修予定費用）がすぐ申請書に出て、申請書で入れた氏名なども見積書に出る。
//   改修の内容は「①玄関　手すりの取付　L=600mm H=800mm」「②屋外　段差の解消　W600mm D350mm H150mm」（寸法は箇所ごとの 長さ・高さ／幅・奥行・高さ の欄）。
//   被保険者番号の空いたマスは 0。苅田町・行橋市の着工予定日は空白（入れる欄もない）。
//   「📗 申請書をExcelで保存」で、原本（行橋市・苅田町・みやこ町・広域連合）に転記した Excel を保存する（ほかのシートはそのまま。丸は楕円の図形）。
//   新規作成は申請書のタブから（フリガナの欄にカーソル）。見積書に行を入れると笹岡工務店の請求書・発注書に入る（申請書だけなら入れない）。
//   写真：写真の欄（写真番号の箇所ごとに改修前・改修後）に写真のファイルを選ぶ・ドロップする。押して（ドラッグして）入れ替える・差し替える・消す。
//   プレビューの写真貼付用紙にも出て（枠にドロップしてもよい）、Excel の写真貼付用紙の枠に貼る。平面図の空いた所には工事内容（改修の内容と同じ行）。
//   見積もりの入口の「申請書（Excel）から作る」はない（ユーザーの指示「不要」）
// usage: node e2e-shinsei.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
// 広域連合の写真貼付用紙（写真番号ごとに2枚。原本の並び）
const SHINSEI_PHOTO_SHEETS = {kouiki: ['写真貼付用紙', '写真貼付用紙 (6)', '写真貼付用紙 (2)', '写真貼付用紙 (7)', '写真貼付用紙 (3)', '写真貼付用紙 (8)', '写真貼付用紙 (4)', '写真貼付用紙 (9)', '写真貼付用紙 (5)', '写真貼付用紙 (10)']};
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
  return {files, sheets: out, paths, ellipses};
};
const text = (xml, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');

const preview = page.getByLabel('申請書のプレビュー');
/** 一覧（入れる所） */
const form = page.getByRole('form', {name: '申請書'});
const rowLabels = () => form.locator(':scope > div[data-field] > div:first-child').allInnerTexts();
/** プレビューの1枚（原本のシート） */
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
const pageNames = () => preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
/** プレビューにその文字が出るまで待つ（プレビューは打つのを待たせないように少し遅れて描く） */
const pvHas = (t, timeout = 5000) => page.waitForFunction((x) => document.querySelector('[aria-label="申請書のプレビュー"]')?.innerText.includes(x), t, {timeout});
/** プレビューの欄を押す（同じ項目の欄が2つ＝式で同じ値を出す欄があるときは最初。欄の中の丸で囲む値（生年月日の「昭」など）でない所を押す） */
const spot = async (label, where = preview) => {
  const el = where.getByRole('button', {name: label, exact: true}).first();
  await el.scrollIntoViewIfNeeded();
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
};
/** 丸で囲む値を押す（プレビューの申請書の文字） */
const mark = (value) => preview.getByRole('button', {name: `${value}に丸をつける`}).first();
const pressed = () => preview.locator('button[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').replace('に丸をつける', '')));
const status = page.getByRole('status', {name: '入っていない欄'});
const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
/** 欄の XML（文字でない欄・原本のままの欄を見るとき） */
const cellOf = (xml, ref) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(xml)?.[0] ?? '';
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

// 改修の内容（4つの保険者の申請書・内訳明細書・平面図とも同じ書き方）：「①玄関　手すりの取付　L=600mm H=800mm」。
// サンプルの玄関は木の手すりを 60cm（長さは見積書から）、高さは申請書のタブで 800 を入れる。トイレは L型手すり（長さなし）
const WORKS = '①玄関　手すりの取付　L=600mm H=800mm\n②トイレ　手すりの取付';

// ---------------- 行橋市：申請書のタブ＝左に一覧、右にプレビュー（原本の様式のまま。表題はヘッダー）。見積書の氏名・住所・改修の内容・金額がもう入っている
await shinseiTab.click();
await form.waitFor();
await preview.waitFor();
// 申請書の様式・平面図・写真番号の箇所（玄関①・トイレ②）の写真貼付用紙
assert.deepEqual(await pageNames(), ['住改・受領委任払', '平面図  (2)', '住改・写真 ①', '住改・写真②']);
// 一覧とプレビューは横に並ぶ（見ながら入れる）。入れ方の切り替え・欄の下に出る入れる所はない
const formBox = await form.boundingBox();
const previewBox = await preview.boundingBox();
assert.ok(formBox && previewBox && formBox.x + formBox.width <= previewBox.x + 1 && previewBox.y < formBox.y + 300, `${JSON.stringify(formBox)} ${JSON.stringify(previewBox)}`);
assert.equal(await page.getByRole('group', {name: '入れ方'}).count(), 0);
assert.equal(await page.getByRole('dialog').count(), 0);
// 一覧は行橋市の申請書の順番（氏名が番号の前）。着工予定日はない（空白のまま。ユーザーの指示）
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修の内容・箇所及び規模', '完成予定日', '改修予定費用']);
assert.equal(await form.getByLabel('着工予定日').count(), 0);
let pv = await preview.innerText();
for (const t of ['介護保険居宅（ 介護・介護予防 ）住宅改修費受領委任払い申請書', '被保険者氏名', '（サンプル）山田', '福岡県行橋市中央1-1', '①玄関　手すりの取付　L=600mm', '②トイレ　手すりの取付', '26,958']) {
  assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
}
// まだ入っていない欄は上に出て、押すと一覧のその欄へ。着工・完成の日は数えない
for (const t of ['フリガナ', '生年月日', '性別', '郵便番号', '電話番号', '要介護状態区分', '住宅の所有者']) assert.ok((await status.innerText()).includes(t), t);
assert.ok(!/被保険者氏名|着工|完成/.test(await status.innerText()));
await status.getByRole('button', {name: 'フリガナ'}).click();
assert.equal(await focused(), 'フリガナ');
await page.keyboard.type('サンプル　ヤマダ');
await page.keyboard.press('Enter');
// Enter で次の欄（行橋市の申請書の順番：フリガナ → 被保険者氏名）。打つとプレビューにすぐ出る
assert.equal(await focused(), '被保険者氏名');
assert.equal(await form.getByLabel('被保険者氏名').inputValue(), '（サンプル）山田');
await pvHas('サンプル　ヤマダ');
// プレビューの欄を押すと、一覧のその欄へ。入れている項目はプレビューで囲む
await spot('電話番号');
assert.equal(await focused(), '電話番号');
await page.keyboard.type('0930-11-2222');
assert.ok(await preview.getByRole('button', {name: '電話番号', exact: true}).first().evaluate((el) => el.className.includes('outline-sky-600')));
await form.getByLabel('生年月日の年').fill('23');
await form.getByLabel('生年月日の月').fill('5');
await form.getByLabel('生年月日の日').fill('6');
await form.getByLabel('郵便番号').fill('824-0001');
await form.getByRole('button', {name: '本人の家'}).click();
await form.getByLabel('完成予定日').fill('2026-11-20');
// 改修の内容：箇所ごとに改修場所・改修の種類と寸法。手すりは長さ（入れなければ見積書の使う長さ＝薄い字）と高さ（任意）。段差の解消でないので幅・奥行はない
const works = form.locator('[data-field="works"]');
const genkan = works.getByRole('listitem', {name: '①玄関'});
assert.equal(await genkan.getByLabel('長さ（mm）').getAttribute('placeholder'), '600');
assert.equal(await works.getByLabel('幅（mm）').count(), 0);
await genkan.getByLabel('高さ（mm）').fill('800');
await pvHas('①玄関　手すりの取付　L=600mm H=800mm');
assert.ok((await works.getByLabel('申請書に書く内容').innerText()).includes('①玄関　手すりの取付　L=600mm H=800mm'));
// 丸：プレビューの申請書の「女」「昭」「要介護２」を押す（一覧のボタンにも出る）
const yk = await make(['女', '昭和', '要介護2'], '81-shinsei-preview.png');
pv = await preview.innerText();
for (const t of ['サンプル　ヤマダ', '23年5月6日生', '824-0001', '0930-11-2222', '本人との関係（本人）', '令和8年11月20日']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
assert.deepEqual(await pressed(), ['昭和', '女', '要介護2']);
assert.equal(await form.getByRole('group', {name: '性別'}).getByRole('button', {name: '女'}).getAttribute('aria-pressed'), 'true');
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
assert.deepEqual(['F4', 'F9', 'G10', 'Y10', 'F13', 'V13', 'AB18'].map((r) => text(main, r)), ['サンプル　ヤマダ', '明・大・昭　23年5月6日生', '824-0001', '0930-11-2222', '（サンプル）山田', '本人との関係（本人）', '令和8年11月20日']);
assert.ok(!/令和|46331/.test(cellOf(main, 'AB16')), cellOf(main, 'AB16')); // 着工予定日は空白（原本のまま）
assert.match(main, /<c r="F20" s="\d+"><v>26958<\/v><\/c>/); // 改修予定費用は見積書の合計（数）
log('行橋市の申請書（一覧とプレビューを並べる・Enter で次の欄・プレビューの欄から一覧へ・寸法・丸・着工予定日は空白・見積書の金額・Excel）OK');

// ---------------- 見積書で直すと、申請書にすぐ出る（改修予定費用＝見積書の合計）。申請書で直した氏名は見積書に出る
await estimateTab.click();
const lKey = await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit$=":qty"]').first().getAttribute('data-edit');
await typeIn(lKey, '2');
const total2 = (await tds('合計')).filter(Boolean)[1];
assert.notEqual(total2, '26,958');
await shinseiTab.click();
await pvHas(total2);
await form.getByLabel('被保険者氏名').fill('（サンプル）山田 花');
await estimateTab.click();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '（サンプル）山田 花様邸');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('（サンプル）山田 花'));
await shinseiTab.click();
await form.getByLabel('被保険者氏名').fill('（サンプル）山田');
await estimateTab.click();
await typeIn(lKey, '1');
log('見積書と申請書がすぐつながる（金額・氏名）OK');

// ---------------- 平面図：空いた所に工事内容（申請書の改修の内容と同じ行）。平面図そのものは Excel で描く
await shinseiTab.click();
await pvHas('①玄関　手すりの取付　L=600mm H=800mm');
const plan = await pageOf('平面図  (2)').innerText();
for (const t of ['（サンプル）山田', '①玄関　手すりの取付　L=600mm H=800mm', '②トイレ　手すりの取付']) assert.ok(plan.includes(t), `平面図に「${t}」がない`);
await pageOf('平面図  (2)').screenshot({path: path.join(outDir, '84-plan.png')});
log('平面図の工事内容OK');

// ---------------- 写真：写真の欄（写真番号の箇所ごとに 改修前・改修後）。選ぶ・ドロップ・押して入れ替える・ドラッグで入れ替える・消す・差し替える
const photoBoard = page.getByRole('region', {name: '写真'});
await photoBoard.waitFor();
const slot = (no, name, which) => photoBoard.getByRole('button', {name: `${no}${name} ${which}`, exact: true});
/** 色と大きさのちがう写真（PNG）をブラウザで作る（大きさで、どの写真か分かる） */
const makeImage = async (color, w, h) =>
  Buffer.from(
    await page.evaluate(
      async ({color, w, h}) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, w, h);
        const b = await new Promise((r) => c.toBlob(r, 'image/png'));
        return [...new Uint8Array(await b.arrayBuffer())];
      },
      {color, w, h},
    ),
  );
const red = await makeImage('#c0392b', 2000, 1500); // 長い辺を 1600 に縮める → 1600×1200
const blue = await makeImage('#2471a3', 900, 1600);
const green = await makeImage('#1e8449', 1200, 900);
const yellow = await makeImage('#d4ac0d', 3000, 1000); // → 1600×533
/** 写真のファイルをドロップする（エクスプローラーなどから枠に落とすのと同じ） */
const dropFile = async (target, buffer, name) => {
  const el = await target.elementHandle();
  await page.evaluate(
    ({el, bytes, name}) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, {type: 'image/png'}));
      for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, {dataTransfer: dt, bubbles: true, cancelable: true}));
    },
    {el, bytes: [...buffer], name},
  );
};
const srcOf = (loc) => loc.locator('img').getAttribute('src');
const emptySlot = async (loc) => (await loc.locator('img').count()) === 0 && (await loc.innerText()).startsWith('＋');
// 「📷 写真を選ぶ」で2枚：①玄関・②トイレの改修前に順に入る
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), photoBoard.getByRole('button', {name: '📷 写真を選ぶ'}).click()]);
await chooser.setFiles([
  {name: 'red.png', mimeType: 'image/png', buffer: red},
  {name: 'blue.png', mimeType: 'image/png', buffer: blue},
]);
await slot('①', '玄関', '改修前').locator('img').waitFor();
await slot('②', 'トイレ', '改修前').locator('img').waitFor();
const [redSrc, blueSrc] = [await srcOf(slot('①', '玄関', '改修前')), await srcOf(slot('②', 'トイレ', '改修前'))];
assert.ok(await emptySlot(slot('①', '玄関', '改修後')));
// ①玄関の改修後の枠に写真のファイルをドロップ
await dropFile(slot('①', '玄関', '改修後'), green, 'green.png');
await slot('①', '玄関', '改修後').locator('img').waitFor();
const greenSrc = await srcOf(slot('①', '玄関', '改修後'));
// 押して入れ替える：①の改修前を押して（選ぶ）、②の改修前を押す
await slot('①', '玄関', '改修前').click();
assert.equal(await slot('①', '玄関', '改修前').getAttribute('aria-pressed'), 'true');
await page.getByRole('status', {name: '選んでいる写真'}).waitFor();
await slot('②', 'トイレ', '改修前').click();
assert.deepEqual([await srcOf(slot('①', '玄関', '改修前')), await srcOf(slot('②', 'トイレ', '改修前'))], [blueSrc, redSrc]);
assert.equal(await page.getByRole('status', {name: '選んでいる写真'}).count(), 0);
// ドラッグして移す（空いた枠）・入れ替える（写真のある枠）
await slot('①', '玄関', '改修後').dragTo(slot('②', 'トイレ', '改修後'));
assert.equal(await srcOf(slot('②', 'トイレ', '改修後')), greenSrc);
assert.ok(await emptySlot(slot('①', '玄関', '改修後')));
await slot('②', 'トイレ', '改修前').dragTo(slot('①', '玄関', '改修前'));
assert.deepEqual([await srcOf(slot('①', '玄関', '改修前')), await srcOf(slot('②', 'トイレ', '改修前'))], [redSrc, blueSrc]);
// 消す：押して「削除」
await slot('②', 'トイレ', '改修後').click();
await page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '削除'}).click();
assert.ok(await emptySlot(slot('②', 'トイレ', '改修後')));
// 差し替える：押して「差し替え」→ 写真を選ぶ
await slot('①', '玄関', '改修前').click();
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '差し替え'}).click()]);
await chooser2.setFiles({name: 'yellow.png', mimeType: 'image/png', buffer: yellow});
await page.waitForFunction((old) => document.querySelector('[aria-label="①玄関 改修前"] img')?.getAttribute('src') !== old, redSrc);
// プレビューの写真貼付用紙にも出る。写真貼付用紙の枠にドロップしても入る
const photoPage = pageOf('住改・写真②');
await dropFile(photoPage.getByRole('button', {name: '写真貼付用紙②の改修後'}), green, 'green2.png');
await slot('②', 'トイレ', '改修後').locator('img').waitFor();
assert.equal(await pageOf('住改・写真 ①').getByRole('button', {name: '写真貼付用紙①の改修前'}).locator('img').count(), 1);
assert.equal(await pageOf('住改・写真 ①').getByRole('button', {name: '写真貼付用紙①の改修後'}).locator('img').count(), 0);
assert.equal(await photoPage.locator('img').count(), 2);
await photoBoard.screenshot({path: path.join(outDir, '85-photo-board.png')});
await photoPage.screenshot({path: path.join(outDir, '86-photo-sheet.png')});
// Excel：写真貼付用紙の枠に貼る（①玄関の改修前＝黄色 1600×533、②トイレの改修前＝青 900×1600・改修後＝緑 1200×900。JPEG に縮めて）
/** JPEG の大きさ（幅×高さ） */
const jpegSize = (b) => {
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) return '';
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return `${(b[i + 7] << 8) | b[i + 8]}x${(b[i + 5] << 8) | b[i + 6]}`;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return '';
};
/** シートに貼った写真の大きさ（どの枠か：改修前・改修後の枠の行で） */
const photosOf = (book, name, beforeRows) => {
  const rid = /<drawing r:id="([^"]+)"/.exec(book.sheets.get(name))?.[1];
  if (!rid) return [];
  const rels = strFromU8(book.files[book.paths.get(name).replace(/([^/]+)$/, '_rels/$1.rels')]);
  const drawing = new RegExp(`Id="${rid}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(rels)[1];
  const d = strFromU8(book.files[`xl/drawings/${drawing}`]);
  const drels = strFromU8(book.files[`xl/drawings/_rels/${drawing}.rels`] ?? new Uint8Array());
  return [...d.matchAll(/<xdr:twoCellAnchor editAs="oneCell">([\s\S]*?)<\/xdr:twoCellAnchor>/g)].map((m) => {
    const row = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(m[1])[1]) + 1;
    const embed = /r:embed="([^"]+)"/.exec(m[1])[1];
    const media = new RegExp(`Id="${embed}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(drels)[1];
    return `${row <= beforeRows ? '改修前' : '改修後'}:${jpegSize(book.files[`xl/media/${media}`])}`;
  });
};
const withPhotos = sheetsOf((await saveExcel()).bytes);
assert.deepEqual(photosOf(withPhotos, '住改・写真 ①', 28), ['改修前:1600x533']);
assert.deepEqual(photosOf(withPhotos, '住改・写真②', 28).sort(), ['改修前:900x1600', '改修後:1200x900']);
assert.deepEqual(photosOf(withPhotos, '住改・写真③', 28), []);
// 読み直しても写真は残る（この端末に保存）。どの様邸からも使われなくなった古い写真は、開いたときに消す
const photoIds = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('taiyo-sasaoka-photos');
        req.onsuccess = () => {
          const all = req.result.transaction('photos').objectStore('photos').getAllKeys();
          all.onsuccess = () => resolve(all.result.map(String).sort());
        };
      }),
  );
await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('taiyo-sasaoka-photos');
      req.onsuccess = () => {
        const tx = req.result.transaction('photos', 'readwrite');
        tx.objectStore('photos').put({id: 'ph-old', blob: new Blob(['x']), w: 1, h: 1, created: 0});
        tx.oncomplete = () => resolve(null);
      };
    }),
);
assert.ok((await photoIds()).includes('ph-old'));
await page.waitForTimeout(1200);
await page.reload();
await photoBoard.waitFor();
await slot('①', '玄関', '改修前').locator('img').waitFor();
await slot('②', 'トイレ', '改修後').locator('img').waitFor();
await page.waitForFunction(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('taiyo-sasaoka-photos');
      req.onsuccess = () => {
        const g = req.result.transaction('photos').objectStore('photos').get('ph-old');
        g.onsuccess = () => resolve(!g.result);
      };
    }),
);
assert.ok((await photoIds()).length >= 3); // 使っている3枚は残る（入れ替えた古い写真は、1時間たつまで消さない）
log('写真（選ぶ・ドロップ・押して入れ替え・ドラッグで入れ替え・削除・差し替え・プレビューの枠にドロップ・Excel の写真貼付用紙・読み直し・古い写真を消す）OK');

// ---------------- 苅田町：保険者を替えると苅田町の申請書。丸は残る（もう一度押すと外れる）。事後申請書は式で同じ内容
await shinseiTab.click();
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');
await pageOf('事前申請書').waitFor();
assert.deepEqual(await pageNames(), ['事前申請書', '平面図  (2)', '1 ', '1  (3)']);
// 一覧は苅田町の申請書の順番（番号が氏名の前）。完了予定日だけ（着工予定日は空白）
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者番号', '被保険者氏名', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修の内容・箇所及び規模', '完了予定日', '改修予定費用']);
assert.equal(await form.getByLabel('完了予定日').inputValue(), '2026-11-20');
assert.equal(await form.getByLabel('改修予定費用').inputValue(), '26,958');
assert.ok((await form.innerText()).includes('見積書の合計（税込）'));
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
assert.deepEqual(['J6', 'J9', 'J10', 'AB11', 'W13', 'Y16'].map((r) => text(pre, r)), ['サンプル　ヤマダ', '明　・　大　・　昭　23年5月6日生', '〒824-0001', '0930-11-2222', '本人との関係（本人）', '令和8年11月20日']);
assert.ok(!/令和|46331/.test(cellOf(pre, 'Y15')), cellOf(pre, 'Y15')); // 着工予定日は空白
// 写真の用紙の実施した工事種類は「🔳手すりの取付　□(2)段差の解消…」（ユーザーの指示。原本は「■(1)手摺の取付」）
assert.ok((await pageOf('1 ').innerText()).includes('🔳手すりの取付'));
const kStrings = strFromU8(unzipSync(kd.bytes)['xl/sharedStrings.xml']);
assert.ok(kStrings.includes('🔳手すりの取付　□(2)段差の解消') && !kStrings.includes('手摺'));
await page.locator('[aria-live] > div', {hasText: `「${kd.name}」を保存しました`}).waitFor();
log('苅田町の申請書（申請書の順番の一覧・事前申請書・事後申請書は式で同じ・丸を外す・着工予定日は空白）OK');

// ---------------- みやこ町：承認届出書・支給申請書・内訳明細書の3枚（支給申請書・内訳明細書の氏名などは承認届出書を参照する式）。改修の内容は内訳明細書の種類の行
const boxes = (col, n, row) =>
  Array.from({length: n}, (_, i) => {
    const c = [...col].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) + i;
    const name = (kk) => (kk <= 0 ? '' : name(Math.floor((kk - 1) / 26)) + String.fromCharCode(65 + ((kk - 1) % 26)));
    return `${name(c)}${row}`;
  });
await page.getByRole('combobox', {name: '保険者'}).selectOption('miyako');
await pageOf('住宅改修承認届出書').waitFor();
assert.deepEqual(await pageNames(), ['住宅改修承認届出書', '住宅改修費支給申請書(受領委任払用)', '住宅改修内訳明細書', '平面図', '写真 (1)', '写真 (2)']);
// 内訳明細書の氏名（式で承認届出書と同じ）を押しても、一覧の氏名の欄へ
await spot('被保険者氏名', pageOf('住宅改修内訳明細書'));
assert.equal(await focused(), '被保険者氏名');
assert.ok((await pageOf('住宅改修内訳明細書').innerText()).includes('①玄関　手すりの取付　L=600mm H=800mm'));
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
log('みやこ町の申請書（6枚のプレビュー・式の欄も押せる・承認届出書・支給申請書・内訳明細書・写真）OK');

// ---------------- 広域連合（築上町など）：承認申請書・支給申請書（受領委任払用）・内訳明細書（別紙）・平面図・写真貼付用紙
await page.getByRole('combobox', {name: '保険者'}).selectOption('kouiki');
await pageOf('様式第2号（住宅改修承認申請書）').waitFor();
assert.deepEqual(await pageNames(), ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）', '様式第2号別紙（住宅改修内訳明細書）', '平面図 (2)', '写真貼付用紙', '写真貼付用紙 (2)']);
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
// 写真は写真番号の最初の用紙だけに貼る（同じ番号の用紙が2枚ずつ）
assert.deepEqual(photosOf(g, '写真貼付用紙', 31), ['改修前:1600x533']);
assert.deepEqual(photosOf(g, '写真貼付用紙 (2)', 31).sort(), ['改修前:900x1600', '改修後:1200x900']);
const twins = SHINSEI_PHOTO_SHEETS.kouiki.filter((n) => !['写真貼付用紙', '写真貼付用紙 (2)'].includes(n));
for (const n of twins) assert.deepEqual(photosOf(g, n, 31), [], n);
log('広域連合の申請書（6枚のプレビュー・ヘッダー・承認申請書・支給申請書・内訳明細書・平面図・写真貼付用紙・丸）OK');
// 4つの保険者すべてで申請書の Excel のボタンが出る
for (const i of ['kanda', 'yukuhashi', 'miyako', 'kouiki']) {
  await page.getByRole('combobox', {name: '保険者'}).selectOption(i);
  assert.equal(await page.getByRole('button', {name: '📗 申請書をExcelで保存'}).count(), 1, i);
}
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');

// ---------------- 見積もりの入口：「申請書（Excel）から作る」はない（ユーザーの指示「不要」）。タブの名前は「見積もり・申請書を作成する」
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: '📝 見積もり・申請書を作成する'}).click();
const home = page.getByRole('region', {name: '新規作成'});
await home.waitFor();
assert.equal(await page.getByText('申請書（Excel）から作る').count(), 0);
assert.ok(!(await page.locator('header').innerText()).includes('請求先')); // 上の「請求先：笹岡工務店」も出さない
log('見積もりの入口（申請書から作るなし・タブの名前・請求先なし）OK');

// ---------------- 新規作成（苅田町）：申請書のタブで開き、フリガナの欄にカーソル。申請書の順番に打って Enter。丸は一覧のボタンかプレビューの文字
await home.getByRole('button', {name: '＋ 苅田町', exact: true}).click();
await form.waitFor();
assert.equal(await shinseiTab.getAttribute('aria-selected'), 'true');
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '新しい申請書');
assert.equal(await focused(), 'フリガナ');
// フリガナ → 被保険者番号（6けたでも確定すると右に詰めて左は 0）→ 被保険者氏名 → 生年月日の年・月・日 → 郵便番号 → 住所 → 電話番号 → 所有者 → 関係
for (const t of ['ミホン　イチロウ', '366989', '見本 一郎', '10', '3', '4', '800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '見本 花子', '妻']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
assert.equal((await form.getByLabel('被保険者番号の10マス').innerText()).replace(/\s/g, ''), '0000366989');
assert.equal(await form.getByLabel('被保険者番号', {exact: true}).inputValue(), '0000366989'); // 確定（Enter）したら右に詰めて 0 が入る
await form.getByRole('group', {name: '性別'}).getByRole('button', {name: '男'}).click();
await form.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要支援2'}).click();
await mark('昭和').click();
// 改修の内容：箇所を足して、手すりは長さ・高さ、段差の解消は幅・奥行・高さ（ユーザーの指示の書き方）
await works.getByRole('button', {name: '＋ 玄関'}).click();
await works.getByRole('button', {name: '＋ トイレ'}).click();
const g1 = works.getByRole('listitem', {name: '①玄関'});
await g1.getByLabel('長さ（mm）').fill('800');
await g1.getByLabel('高さ（mm）').fill('750');
const t2 = works.getByRole('listitem', {name: '②トイレ'});
await t2.getByLabel('改修の種類').selectOption('2');
await t2.getByLabel('幅（mm）').fill('600');
await t2.getByLabel('奥行（mm）').fill('350');
await t2.getByLabel('高さ（mm）').fill('150');
assert.equal(await t2.getByLabel('長さ（mm）').count(), 0); // 段差の解消は幅・奥行・高さ
await form.getByLabel('完了予定日').fill('2026-12-10');
await form.getByLabel('改修予定費用').fill('120000');
await status.filter({hasText: 'すべて入っています'}).waitFor();
assert.deepEqual(await pressed(), ['昭和', '男', '要支援2']);
const NEW_WORKS = '①玄関　手すりの取付　L=800mm H=750mm\n②トイレ　段差の解消　W600mm D350mm H150mm';
await pvHas('②トイレ　段差の解消　W600mm D350mm H150mm');
await page.screenshot({path: path.join(outDir, '82-shinsei-new.png'), fullPage: true});
pv = await preview.innerText();
for (const t of ['ミホン　イチロウ', '見本 一郎', '10年3月4日生', '〒800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '本人との関係（妻）', '①玄関　手すりの取付　L=800mm H=750mm', '令和8年12月10日', '120,000円']) {
  assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
}
const first = sheetsOf((await saveExcel()).bytes);
const fp = first.sheets.get('事前申請書');
assert.deepEqual(
  ['J6', 'J7', 'J9', 'J10', 'J11', 'AB11', 'J13', 'W13', 'J14', 'Y16', 'J17'].map((r) => text(fp, r)),
  ['ミホン　イチロウ', '見本 一郎', '明　・　大　・　昭　10年3月4日生', '〒800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '見本 花子', '本人との関係（妻）', NEW_WORKS, '令和8年12月10日', '120,000円'],
);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(fp, r)).join(''), '0000366989'); // 空いたマスは 0
assert.ok(!/令和/.test(cellOf(fp, 'Y15'))); // 着工予定日は空白
assert.deepEqual([first.ellipses('事前申請書'), first.ellipses('事後申請書')], [3, 3]);
assert.equal(text(first.sheets.get('平面図  (2)'), 'C2'), '見本 一郎');
// 読み直しても申請書のタブのまま（URL に view=shinsei）。寸法も残る。自動保存は打ち終わって 0.4 秒後なので、少し待ってから読み直す
await page.waitForTimeout(1200);
await page.reload();
await form.waitFor();
assert.equal(await shinseiTab.getAttribute('aria-selected'), 'true');
await pvHas('②トイレ　段差の解消　W600mm D350mm H150mm');
assert.equal(await works.getByRole('listitem', {name: '①玄関'}).getByLabel('高さ（mm）').inputValue(), '750');
// 見積書のタブ：氏名・番号・住所・箇所が入っている。行を入れるまでは笹岡工務店の請求書・発注書は出さない。行を入れると入る（見積もり作成日も今日）
await estimateTab.click();
await sheet.waitFor();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 一郎様邸');
const est = await sheet.locator('.form-page').first().innerText();
for (const t of ['見本 一郎', '0000366989', '福岡県京都郡苅田町富久町2-2', '①玄関', '②トイレ']) assert.ok(est.includes(t), `見積書に「${t}」がない`);
const inInvoice = page.getByLabel('笹岡工務店の請求書に入れる');
const orderBtn = page.getByRole('button', {name: '🛒 発注書を作成'});
assert.equal(await inInvoice.count(), 0); // 見積書に行がないうちは出さない（申請書だけの様邸＝ほかの工務店の工事）
assert.equal(await orderBtn.isDisabled(), true);
await typeIn('new:text', '取付金具', 'Tab');
await page.keyboard.press('Enter');
assert.equal(await inInvoice.isChecked(), true);
assert.equal(await orderBtn.isDisabled(), false);
log('新規作成（申請書のタブから・フリガナにカーソル・申請書の順番に Enter・番号は0で埋める・丸・箇所の寸法・Excel・読み直し・見積書に行を入れると請求書・発注書）OK');

// ---------------- 申請書だけ（みやこ町）：見積書を作らずに Excel にする。一覧に出て（請求書には入れない）、押すと申請書のタブで開く
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
await home.waitFor();
await home.getByRole('button', {name: '＋ みやこ町', exact: true}).click();
await form.waitFor();
await form.getByLabel('被保険者氏名').fill('見本 次郎');
await form.getByLabel('理由書作成者の事業所名').fill('見本居宅介護支援事業所');
await form.getByLabel('理由書作成者の氏名').fill('見本 三郎');
await works.getByRole('button', {name: '＋ 浴室'}).click();
await works.getByRole('listitem', {name: '①浴室'}).getByLabel('長さ（mm）').fill('600');
await form.getByLabel('改修費用（介護保険対象分）').fill('80000');
await pvHas('①浴室　手すりの取付　L=600mm');
assert.ok((await pageOf('住宅改修内訳明細書').innerText()).includes('①浴室　手すりの取付　L=600mm'));
const onlyMy = sheetsOf((await saveExcel()).bytes);
const myTop = onlyMy.sheets.get('住宅改修承認届出書');
assert.deepEqual(['I5', 'N11', 'N12'].map((r) => text(myTop, r)), ['見本 次郎', '見本居宅介護支援事業所', '見本 三郎']);
assert.match(myTop, /<c r="I23" s="\d+"><v>80000<\/v><\/c>/);
assert.equal(text(onlyMy.sheets.get('住宅改修内訳明細書'), 'K14'), '①浴室　手すりの取付　L=600mm');
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '📋 見積書の一覧を開く'}).click();
const listRow = page.getByRole('row', {name: /見本 次郎/});
await listRow.waitFor();
assert.match(await listRow.innerText(), /申請書だけ/); // 見積書のない申請書は笹岡工務店の請求書に入れない
await page.getByRole('cell', {name: /見本 次郎/}).click();
await preview.waitFor();
assert.equal(await shinseiTab.getAttribute('aria-selected'), 'true'); // まだ申請書だけなので申請書のタブ
await pvHas('見本 次郎');
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('row', {name: /見本 次郎/}).getByRole('button', {name: '📝 申請書'}).click();
await preview.waitFor();
// 見積書のタブも、請求書・発注書は出さない
await estimateTab.click();
assert.equal(await inInvoice.count(), 0);
assert.equal(await orderBtn.isDisabled(), true);
await shinseiTab.click();
await preview.waitFor();
log('申請書だけ（みやこ町。見積書なしで Excel・請求書に入れない・一覧から申請書のタブで開く）OK');

// ---------------- スマホの幅：一覧の下にプレビュー（縦に並べる）。プレビューは画面の幅に縮める。横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(300);
const formPhone = await form.boundingBox();
const previewPhone = await preview.boundingBox();
assert.ok(formPhone && previewPhone && previewPhone.y >= formPhone.y + formPhone.height - 1, `${JSON.stringify(formPhone)} ${JSON.stringify(previewPhone)}`);
const paperBox = await pageOf('住宅改修承認届出書').boundingBox();
assert.ok(paperBox && paperBox.width <= 390, JSON.stringify(paperBox));
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true); // 横にはみ出さない
await form.getByLabel('フリガナ').focus();
await page.screenshot({path: path.join(outDir, '83-shinsei-phone.png')});
const photoBoardPhone = page.getByRole('region', {name: '写真'});
await photoBoardPhone.scrollIntoViewIfNeeded();
await photoBoardPhone.screenshot({path: path.join(outDir, '87-photo-board-phone.png')});
log('スマホの幅（一覧の下にプレビュー・縮めて出す・はみ出さない）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
assert.deepEqual(errors, []);
await browser.close();
