// 申請書を確かめる：様邸の画面のタブ（左から「📝 住宅改修申請書」「🛁 特定福祉用具申請書」「📋 工事見積書」「📄 理由書」）。申請書のタブは、左に申請書の順番の一覧（入れる所）、右にプレビュー
//   （原本の様式のまま。ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。Enter で次の欄、入れている項目はプレビューで囲み、
//   プレビューの欄を押すと一覧のその欄へ。性別・元号・要介護状態区分・改修状況は一覧のボタンか、プレビューの申請書の文字を押すと丸。
//   同じ様邸なので、見積書で入れた氏名・番号・住所・改修の内容・金額（改修予定費用）がすぐ申請書に出て、申請書で入れた氏名なども見積書に出る。
//   改修の内容は「①玄関　手すりの取り付け　L=600mm H=800mm」「②屋外　段差の解消　W600mm D350mm H150mm」（寸法は箇所ごとの 長さ・高さ／幅・奥行・高さ の欄）。
//   被保険者番号の空いたマスは 0。苅田町・行橋市の着工予定日は空白（入れる欄もない）。
//   「📗 申請書をExcelで保存」で、原本（行橋市・苅田町・みやこ町・広域連合）に転記した Excel を保存する（ほかのシートはそのまま。丸は楕円の図形）。
//   新規作成は申請書のタブから（フリガナの欄にカーソル）。見積書に行を入れると笹岡工務店の請求書・発注書に入る（申請書だけなら入れない）。
//   写真：写真の欄（写真番号の箇所ごとに改修前・改修後）に写真のファイルを選ぶ・ドロップする。押して入れ替える・差し替える・消す。
//   プレビューの写真貼付用紙にも出て（枠にドロップしてもよい）、Excel の写真貼付用紙の枠に貼る。平面図の空いた所には工事内容（改修の内容と同じ行）。
//   写真番号は ▶ ◀・箇所をつかんで（見出しでも写真の上でも）ほかの箇所に重ねて入れ替える（写真・改修の内容・見積書の順番も一緒に）。写真の向き・大きさは、写真の欄の ↻ と、
//   プレビューの写真を押して角のつまみ・上の丸（マウス）、2本の指でひねる・つまむ（iPad）。枠より大きくしない。Excel にも同じ向き・大きさで貼る
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
// 写真に写った日付を読む部品（tesseract.js の読み取りの本体・日本語のデータ）は jsDelivr から取ってくる。テストでは手元の node_modules のファイルを返す（ネットにつながない）
const NM = new URL('../../node_modules/', import.meta.url).pathname;
const routeOcr = (c) =>
  c.route('https://cdn.jsdelivr.net/**', async (route) => {
    const m = /\/npm\/(tesseract\.js@v[\d.]+\/dist|tesseract\.js-core@v[\d.]+|@tesseract\.js-data\/jpn\/4\.0\.0_best_int)\/([^/?]+)$/.exec(route.request().url());
    if (!m) return route.abort();
    const dir = m[1].startsWith('tesseract.js@') ? 'tesseract.js/dist' : m[1].startsWith('tesseract.js-core') ? 'tesseract.js-core' : '@tesseract.js-data/jpn/4.0.0_best_int';
    await route.fulfill({body: await readFile(NM + dir + '/' + m[2]), headers: {'access-control-allow-origin': '*', 'content-type': m[2].endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}});
  });
// 読み取りの部品が日本語のデータを読むときに出す警告（「Parameter not found」）は、アプリの誤りではないので数えない
const appError = (m) => m.type() === 'error' && !/^Warning: Parameter not found/.test(m.text());
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await routeOcr(ctx);
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => appError(m) && errors.push('console: ' + m.text()));
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

// ---------------- 様邸の画面のタブ：左に申請書、まん中に理由書（e2e-riyu.mjs）、右に見積書。見積書のある様邸は、一覧から見積書のタブで開く
const tablist = page.getByRole('tablist', {name: '住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書'});
assert.deepEqual(await tablist.getByRole('tab').allInnerTexts(), ['📝 住宅改修申請書', '📋 工事見積書', '🛁 特定福祉用具申請書', '🏷 販売見積書', '📄 理由書']);
const shinseiTab = page.getByRole('tab', {name: '📝 住宅改修申請書'});
const estimateTab = page.getByRole('tab', {name: '📋 工事見積書'});
assert.equal(await estimateTab.getAttribute('aria-selected'), 'true');
await typeIn('job:insuredNo', '0000366989');
// Enter で下の工事場所（住所）の欄に移っているので、そのまま打ち込む
await page.keyboard.type('福岡県行橋市中央1-1');
await page.keyboard.press('Enter');
// 玄関の木の手すりを 60cm で使っている（サンプル）。見積の合計 26,950 円（諸経費で末尾を0に端数調整）
assert.deepEqual((await tds('合計')).filter(Boolean), ['合計', '26,950', '26,950']);

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
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
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
/** プレビューで、まだ入っていない（薄い黄色の）欄の名前 */
const missingSpots = () => preview.locator('[role="button"][class*="bg-amber-300"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
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

// 改修の内容（4つの保険者の申請書・内訳明細書・平面図とも同じ書き方）：「①玄関　手すりの取り付け　L=600mm H=800mm」。
// サンプルの玄関は木の手すりを 60cm（長さは見積書から）、高さは申請書のタブで 800 を入れる。トイレは L型手すり（長さなし）
const WORKS = '①玄関　手すりの取り付け　L=600mm H=800mm\n②トイレ　手すりの取り付け';

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
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '完成予定日', '改修予定費用']);
assert.equal(await form.getByLabel('着工予定日').count(), 0);
assert.match(await form.locator('div[data-field="kana"] > div:first-child').innerText(), /^フリガナ\s*（ひらがなで入力してもカタカナになります）$/);
let pv = await preview.innerText();
for (const t of ['介護保険居宅（ 介護・介護予防 ）住宅改修費受領委任払い申請書', '被保険者氏名', '（サンプル）山田', '福岡県行橋市中央1-1', '①玄関　手すりの取り付け　L=600mm', '②トイレ　手すりの取り付け', '26,950']) {
  assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
}
// 上の「まだ入っていない欄：」の一覧は出さない（ユーザーの指示「全体的にシンプルにしたいので、今回はなくしてください。すべて」2026-10-26）。
// まだ入っていない欄は、プレビューの薄い黄色のまま（着工・完成の日は数えない）
assert.equal(await status.count(), 0);
assert.ok((await missingSpots()).includes('フリガナ'));
assert.ok(!(await missingSpots()).some((n) => /被保険者氏名|着工|完成/.test(n)));
await form.getByLabel('フリガナ', {exact: true}).click();
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
// 手すりの長さは必須（「（任意）」は付けない）、高さは任意で ＋ を押すと開く（ユーザーの指示「手すりの取り付けの高さが任意、長さは必須。
// 手すりの取り付けの高さも、プラスで開いてから入力できるようにする。（任意）」2026-10-26）
assert.doesNotMatch((await genkan.locator('label', {has: page.getByLabel('長さ（mm）')}).innerText()).replace(/\s+/g, ''), /任意/);
assert.equal(await genkan.getByLabel('高さ（mm）').count(), 0);
await genkan.getByRole('button', {name: '＋ 高さ（任意）'}).click();
assert.ok(await genkan.getByLabel('高さ（mm）').evaluate((el) => el === document.activeElement), '開いたらすぐ打てる');
assert.match((await genkan.locator('label', {has: page.getByLabel('高さ（mm）')}).innerText()).replace(/\s+/g, ''), /高さ（任意）/);
await genkan.getByLabel('高さ（mm）').fill('800');
await pvHas('①玄関　手すりの取り付け　L=600mm H=800mm');
// 「申請書に書く内容」の欄はない（ユーザーの指示「申請書に書く内容という部分はなくす」2026-10-26）。改修の内容は寸法・そのほかから自動の文
assert.equal(await form.getByLabel('申請書に書く内容').count(), 0);
assert.equal(await form.getByText('申請書に書く内容').count(), 0);
await genkan.getByLabel('高さ（mm）').fill('850');
await pvHas('①玄関　手すりの取り付け　L=600mm H=850mm');
// そのほかは ＋ を押すと開いて入れる（「そのほかの部分は、プラスかで、開くと入力できるようにする」2026-10-26）
assert.equal(await genkan.getByLabel('そのほか').count(), 0);
await genkan.getByRole('button', {name: '＋ そのほか'}).click();
assert.ok(await genkan.getByLabel('そのほか').evaluate((el) => el === document.activeElement), '開いたらすぐ打てる');
await genkan.getByLabel('そのほか').fill('木製');
// そのほかは次の行（「そのほかの部分の記載は、行替えして表示するようにする」2026-10-26）
await pvHas('木製');
assert.ok(!(await preview.innerText()).includes('H=850mm　木製'), 'そのほかが同じ行にある');
await genkan.getByLabel('そのほか').fill('');
await genkan.getByLabel('高さ（mm）').fill('800');
await pvHas('①玄関　手すりの取り付け　L=600mm H=800mm');
// 丸：プレビューの申請書の「女」「昭」「要介護２」を押す（一覧のボタンにも出る）
const yk = await make(['女', '昭和', '要介護2'], '81-shinsei-preview.png');
pv = await preview.innerText();
for (const t of ['サンプル　ヤマダ', '23年5月6日生', '824-0001', '0930-11-2222', '本人との関係（本人）', '令和8年11月20日']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
assert.deepEqual(await pressed(), ['昭和', '女', '要介護2']);
assert.equal(await form.getByRole('group', {name: '性別'}).getByRole('button', {name: '女'}).getAttribute('aria-pressed'), 'true');
assert.equal(await pageOf('住改・受領委任払').locator('svg ellipse').count(), 3); // 画面にも丸
assert.equal(yk.name, '（サンプル）山田様住宅改修申請書.xlsx');
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
assert.match(main, /<c r="F20" s="\d+"><v>26950<\/v><\/c>/); // 改修予定費用は見積書の合計（数）
log('行橋市の申請書（一覧とプレビューを並べる・Enter で次の欄・プレビューの欄から一覧へ・寸法・丸・着工予定日は空白・見積書の金額・Excel）OK');

// ---------------- 見積書で直すと、申請書にすぐ出る（改修予定費用＝見積書の合計）。申請書で直した氏名は見積書に出る
await estimateTab.click();
const lKey = await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit$=":qty"]').first().getAttribute('data-edit');
await typeIn(lKey, '2');
const total2 = (await tds('合計')).filter(Boolean)[1];
assert.notEqual(total2, '26,950');
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
await pvHas('①玄関　手すりの取り付け　L=600mm H=800mm');
const plan = await pageOf('平面図  (2)').innerText();
for (const t of ['（サンプル）山田', '①玄関　手すりの取り付け　L=600mm H=800mm', '②トイレ　手すりの取り付け']) assert.ok(plan.includes(t), `平面図に「${t}」がない`);
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
const dropFile = async (target, buffer, name, type = 'image/png') => {
  const el = await target.elementHandle();
  await page.evaluate(
    ({el, bytes, name, type}) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, {type}));
      for (const ev of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(ev, {dataTransfer: dt, bubbles: true, cancelable: true}));
    },
    {el, bytes: [...buffer], name, type},
  );
};
/** JPEG の写真をブラウザで作り、撮影日時（Exif の DateTimeOriginal「2026:10:05 09:30:00」）を入れる（スマホ・デジカメの写真と同じ） */
const datedJpeg = async (color, when) => {
  const jpeg = Buffer.from(
    await page.evaluate(async (color) => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 600;
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.fillRect(0, 0, 800, 600);
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      return [...new Uint8Array(await b.arrayBuffer())];
    }, color),
  );
  const le16 = (n) => [n & 255, n >> 8];
  const le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const subAt = 8 + 2 + 12 + 4; // 最初の IFD（Exif の IFD の場所だけ）のうしろに Exif の IFD、そのうしろに日時の文字
  const dataAt = subAt + 2 + 12 + 4;
  const tiff = [0x49, 0x49, ...le16(42), ...le32(8), ...le16(1), ...le16(0x8769), ...le16(4), ...le32(1), ...le32(subAt), ...le32(0)];
  tiff.push(...le16(1), ...le16(0x9003), ...le16(2), ...le32(20), ...le32(dataAt), ...le32(0), ...[...when].map((ch) => ch.charCodeAt(0)), 0);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1]), jpeg.subarray(2)]);
};
/** 日付入り写真（右下に白い字で日付を写し込んだ写真。撮影日時の情報はない＝LINE で送られてきた写真など）をブラウザで作る */
const stampedJpeg = async (when) =>
  Buffer.from(
    await page.evaluate(async (when) => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 1600;
      const g = c.getContext('2d');
      g.fillStyle = '#7a5a3c'; // 床・壁・洗面台のような地
      g.fillRect(0, 0, 1200, 1600);
      g.fillStyle = '#e8e8e8';
      g.fillRect(100, 200, 500, 600);
      g.fillStyle = '#dcdcd4';
      g.fillRect(800, 1300, 400, 300);
      g.font = '38px "IPAGothic", "Noto Sans CJK JP", sans-serif';
      g.textAlign = 'right';
      g.fillStyle = '#222';
      g.fillText(when, 1172, 1562);
      g.fillStyle = '#fff';
      g.fillText(when, 1170, 1560);
      const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      return [...new Uint8Array(await b.arrayBuffer())];
    }, when),
  );
/** 写真を1ページにした PDF（スキャンした写真・PDF で届いた写真と同じ形） */
const pdfOf = async (jpeg) => {
  const p2 = await ctx.newPage();
  await p2.setContent(`<html><body style="margin:0"><img src="data:image/jpeg;base64,${jpeg.toString('base64')}" style="width:100%"></body></html>`);
  const pdf = await p2.pdf({width: '600px', height: '800px', printBackground: true});
  await p2.close();
  return pdf;
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
// 押して移す（空いた枠）・入れ替える（写真のある枠）。写真をドラッグしてほかの箇所に重ねるのは、写真番号の入れ替え（下）
await slot('①', '玄関', '改修後').click();
await slot('②', 'トイレ', '改修後').click();
assert.equal(await srcOf(slot('②', 'トイレ', '改修後')), greenSrc);
assert.ok(await emptySlot(slot('①', '玄関', '改修後')));
await slot('②', 'トイレ', '改修前').click();
await slot('①', '玄関', '改修前').click();
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
log('写真（選ぶ・ドロップ・押して入れ替え・押して移す・削除・差し替え・プレビューの枠にドロップ・Excel の写真貼付用紙・読み直し・古い写真を消す）OK');

// ---------------- 平面図の図（ユーザーの指示「平面図に画像をドロップ・貼り付け」2026-10-25）：プレビューの平面図の表題と工事内容のあいだの枠に、
// ドロップ・Ctrl+V・押して選ぶ（PDF も）。写真の枠と同じ見た目（点線・「ドロップ・Ctrl+V」・ファイルを持ってくると薄い緑・重ねると「ここに離す」）。
// 図は縦横の比のまま枠に収める（Excel と同じ位置）。押して選ぶと差し替え・削除（確かめてから）。Excel の平面図に貼る。読み直しても残る
{
  const planPage = pageOf('平面図  (2)');
  const planSlot = preview.getByRole('button', {name: '平面図', exact: true});
  await planPage.scrollIntoViewIfNeeded();
  assert.match(await planSlot.innerText(), /^＋ 平面図\s*ドロップ・Ctrl\+V$/);
  assert.equal(await planSlot.evaluate((el) => getComputedStyle(el).borderStyle), 'dashed');
  // 枠は平面図のページの中、表題（氏名）の下・工事内容の上
  const [pg, sl, title, legend] = await Promise.all([planPage.boundingBox(), planSlot.boundingBox(), planPage.getByText('（サンプル）山田', {exact: true}).boundingBox(), planPage.getByText(/①玄関　手すりの取り付け/).boundingBox()]);
  assert.ok(sl.x >= pg.x && sl.x + sl.width <= pg.x + pg.width && sl.y >= title.y + title.height && sl.y + sl.height <= legend.y, `平面図の枠の位置 ${JSON.stringify({pg, sl, title, legend})}`);
  assert.ok(sl.width > pg.width * 0.7 && sl.height > pg.height * 0.5, JSON.stringify(sl));
  await planPage.screenshot({path: path.join(outDir, '84a-plan-empty.png')});
  // ファイルを持ってくると薄い緑、重ねると「ここに離す」
  const dragOver = (selector) =>
    page.evaluate((sel) => {
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'x.png', {type: 'image/png'}));
      const el = document.querySelector(sel);
      el.dispatchEvent(new DragEvent('dragenter', {dataTransfer: dt, bubbles: true, cancelable: true}));
      el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
    }, selector);
  await page.mouse.move(1, 1); // 枠の上にマウスがあると、ふだんも緑（hover）
  const idleColor = await planSlot.evaluate((el) => getComputedStyle(el).backgroundColor);
  await dragOver('h1');
  await page.waitForFunction(() => document.querySelector('[data-plan-slot]')?.getAttribute('data-drop') === 'ready');
  assert.notEqual(await planSlot.evaluate((el) => getComputedStyle(el).backgroundColor), idleColor); // 薄い緑
  await planPage.screenshot({path: path.join(outDir, '84b-plan-drag-ready.png')});
  await dragOver('[data-plan-slot]');
  await planSlot.getByText('ここに離す').waitFor();
  assert.equal(await planSlot.getAttribute('data-drop'), 'over');
  await planPage.screenshot({path: path.join(outDir, '84c-plan-drag-over.png')});
  await page.waitForFunction(() => !document.querySelector('[data-plan-slot]')?.getAttribute('data-drop'), null, {timeout: 3000});
  // ドロップ：横長の図（2000×1414 → 縮めて 1600×1131）。縦横の比のまま、枠の幅いっぱい・上下のまん中
  const planA = await makeImage('#7f8c8d', 2000, 1414);
  await dropFile(planSlot, planA, 'plan.png');
  const planImg = planSlot.locator('img');
  await planImg.waitFor();
  const [box, img] = [await planSlot.boundingBox(), await planImg.boundingBox()];
  assert.ok(Math.abs(img.width / img.height - 1600 / 1131) < 0.02, `縦横の比 ${JSON.stringify(img)}`);
  assert.ok(img.x >= box.x && img.y >= box.y && img.x + img.width <= box.x + box.width + 0.5 && img.y + img.height <= box.y + box.height + 0.5, '図が枠からはみ出す');
  assert.ok(box.width - img.width < box.width * 0.03 && Math.abs(img.y + img.height / 2 - (box.y + box.height / 2)) < 2, `枠いっぱい・まん中 ${JSON.stringify({box, img})}`);
  assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
  const srcA = await planImg.getAttribute('src');
  await planPage.screenshot({path: path.join(outDir, '84d-plan-image.png')});
  // 枠を押して選び（道具：差し替え・削除・完了）、Ctrl+V で差し替え（縦長の図 900×1600）。介護保険証の読み取り・写真の欄には入らない
  await planSlot.click();
  assert.equal(await planSlot.getAttribute('aria-pressed'), 'true');
  const tools = preview.getByRole('toolbar', {name: '平面図の図'});
  assert.deepEqual(await tools.getByRole('button').allInnerTexts(), ['差し替え', '削除', '完了']);
  await planPage.screenshot({path: path.join(outDir, '84e-plan-selected.png')});
  const photoCount = (await photoIds()).length;
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bytes], 'image.png', {type: 'image/png'}));
    (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true}));
  }, blue.toString('base64'));
  await page.waitForFunction((old) => document.querySelector('[data-plan-slot] img')?.getAttribute('src') !== old, srcA);
  const tall = await planImg.boundingBox();
  assert.ok(Math.abs(tall.width / tall.height - 900 / 1600) < 0.02 && box.height - tall.height < box.height * 0.03, `縦長の図は枠の高さいっぱい ${JSON.stringify(tall)}`);
  assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
  assert.equal((await photoIds()).length, photoCount + 1); // 写真と同じ所に1枚（写真の枠には入らない）
  assert.equal(await slot('②', 'トイレ', '改修後').locator('img').count(), 1);
  // 差し替え（ファイルを選ぶ）：PDF は1ページ目を図にする（縦長の1ページの PDF → 長い辺 1600 の縦長の図）
  await planSlot.click();
  const [planChooser] = await Promise.all([page.waitForEvent('filechooser'), tools.getByRole('button', {name: '差し替え'}).click()]);
  assert.equal(await planChooser.isMultiple(), false);
  const srcTall = await planImg.getAttribute('src');
  await planChooser.setFiles({name: 'plan.pdf', mimeType: 'application/pdf', buffer: await pdfOf(await datedJpeg('#95a5a6', '2026:10:05 09:30:00'))});
  await page.waitForFunction((old) => !!document.querySelector('[data-plan-slot] img') && document.querySelector('[data-plan-slot] img').getAttribute('src') !== old, srcTall);
  // Excel：平面図のシートに図（縦横の比のまま・平面図の表題と工事内容のあいだ）
  const planBook = sheetsOf((await saveExcel()).bytes);
  const planRid = /<drawing r:id="([^"]+)"/.exec(planBook.sheets.get('平面図  (2)'))[1];
  const planDrawing = new RegExp(`Id="${planRid}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(strFromU8(planBook.files[planBook.paths.get('平面図  (2)').replace(/([^/]+)$/, '_rels/$1.rels')]))[1];
  const pd = strFromU8(planBook.files[`xl/drawings/${planDrawing}`]);
  const planPic = /<xdr:twoCellAnchor editAs="oneCell">(?:(?!<\/xdr:twoCellAnchor>)[\s\S])*name="平面図 \d+"[\s\S]*?<\/xdr:twoCellAnchor>/.exec(pd)?.[0];
  assert.ok(planPic, '平面図の図がない');
  const planEmbed = /r:embed="([^"]+)"/.exec(planPic)[1];
  const planMedia = new RegExp(`Id="${planEmbed}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(strFromU8(planBook.files[`xl/drawings/_rels/${planDrawing}.rels`]))[1];
  const [pw, ph] = jpegSize(planBook.files[`xl/media/${planMedia}`]).split('x').map(Number);
  assert.ok(ph === 1600 && pw < ph, `PDF の図の大きさ ${pw}x${ph}`);
  // 図形の置き場所の縦横の比も図のまま
  const [pcx, pcy] = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(planPic).slice(1).map(Number);
  assert.ok(Math.abs(pcx / pcy - pw / ph) < 0.01, `${pcx}/${pcy}`);
  const fromRow = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(planPic)[1]) + 1;
  const toRow = Number(/<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(planPic)[1]) + 1;
  assert.ok(fromRow >= 8 && toRow <= 53, `平面図の図の行 ${fromRow}〜${toRow}`); // C8:AQ52（工事内容は54行目から）
  // 読み直しても残る。使っている図は、古い写真を消すときも消さない
  await page.waitForTimeout(1200);
  const planId = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('taiyo-sasaoka-shikiri');
        req.onsuccess = () => {
          const db = req.result;
          const names = [...db.objectStoreNames];
          const tx = db.transaction(names, 'readonly');
          const out = [];
          for (const n of names) {
            const all = tx.objectStore(n).getAll();
            all.onsuccess = () => out.push(...all.result);
          }
          tx.oncomplete = () => resolve(JSON.stringify(out).match(/"planPhoto":"([^"]+)"/)?.[1] ?? '');
        };
      }),
  );
  assert.ok(planId && (await photoIds()).includes(planId), `保存した平面図の図の番号 ${planId}`);
  await page.reload();
  await shinseiTab.waitFor();
  if ((await shinseiTab.getAttribute('aria-selected')) !== 'true') await shinseiTab.click();
  await planImg.waitFor();
  assert.ok((await photoIds()).includes(planId));
  // スマホの幅（390px）：枠は画面の中（横にはみ出さない）
  await page.setViewportSize({width: 390, height: 844});
  await planSlot.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const narrow = await planSlot.boundingBox();
  assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 390 && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, JSON.stringify(narrow));
  await pageOf('平面図  (2)').screenshot({path: path.join(outDir, '84f-plan-390.png')});
  await page.setViewportSize({width: 1366, height: 900});
  await page.waitForTimeout(300);
  // 削除：確かめてから（「いいえ」なら消さない）
  await page.evaluate(() => {
    window.__asked = [];
    window.__answer = false;
    window.__confirm = window.confirm;
    window.confirm = (m) => (window.__asked.push(m), window.__answer);
  });
  await planSlot.click();
  await tools.getByRole('button', {name: '削除'}).click();
  assert.deepEqual(await page.evaluate(() => window.__asked), ['平面図の図を削除しますか？']);
  assert.equal(await planImg.count(), 1);
  await page.evaluate(() => (window.__answer = true));
  await tools.getByRole('button', {name: '削除'}).click();
  await planImg.waitFor({state: 'detached'});
  assert.match(await planSlot.innerText(), /^＋ 平面図/);
  await page.evaluate(() => (window.confirm = window.__confirm));
  // 空いた枠を Tab で選んで（フォーカス）Ctrl+V でも入る。消してもう一度入れた図は、次の Excel にも貼る（あとで消す）
  await planSlot.focus();
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bytes], 'image.png', {type: 'image/png'}));
    (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true}));
  }, green.toString('base64'));
  await planImg.waitFor();
  await page.evaluate(() => (window.confirm = () => true));
  await planSlot.click();
  await tools.getByRole('button', {name: '削除'}).click();
  await planImg.waitFor({state: 'detached'});
  await page.evaluate(() => (window.confirm = window.__confirm));
}
log('平面図の図（枠・ドラッグ中の色・ここに離す・ドロップ・Ctrl+V・差し替え（PDF）・Excel の平面図・読み直し・スマホの幅・削除は確かめてから）OK');

// ---------------- 写真に書く内容（ユーザーの指示「写真をめいいっぱいにしない。縦写真の場合、写真を左に寄せてスペースをつくる。横写真の場合、上にスペースをあけて
// 入力スペースをつくる」「自動入力 手すり L=800mm H=600mm、追加 手入力例 ベースプレート L=800mm」）：写真の欄の箇所ごとに、自動の文（改修の種類・寸法）と手で足す行。
// 改修前の枠だけに書く（「改修後には入れる必要はありません。改修前の時に、工務店さんの方に見積もり依頼…内容を伝える時に、見やすく分かりやすく伝えるもの」）。
// プレビューと Excel の写真貼付用紙は、縦の写真は左に寄せて右に、横の写真・写真のない枠は写真の下に中央ぞろえで書く（「画像を上に、画像の下に寸法」2026-10-22）。改修後の写真は枠いっぱい
const noteGroup = (no, name) => photoBoard.getByRole('group', {name: `${no}${name} 改修前の写真に書く内容`});
assert.match(await noteGroup('①', '玄関').innerText(), /自動\s*手すりの取り付け　L=600mm H=800mm/);
assert.match(await noteGroup('②', 'トイレ').innerText(), /自動\s*手すりの取り付け/);
await photoBoard.getByLabel('②トイレ 改修前の写真に書く内容の追加').fill('ベースプレート　L=800mm');
const p2 = pageOf('住改・写真②');
const p1n = pageOf('住改・写真 ①');
/** プレビューの写真貼付用紙の枠に書いた内容（枠の写真のボタンと同じ所にある文字） */
const pvNote = (pg, name, text) => pg.getByRole('button', {name, exact: true}).locator('xpath=..').getByText(text);
const noteB = pvNote(p2, '写真貼付用紙②の改修前', 'ベースプレート　L=800mm');
await noteB.waitFor();
const auto2 = (await noteB.innerText()).split('\n');
assert.equal(auto2.length, 2);
assert.ok(auto2[0].startsWith('手すりの取り付け') && auto2[1] === 'ベースプレート　L=800mm', auto2.join('/'));
// 改修後の枠には書かない（②の改修後の写真・①の写真のない改修後の枠）
assert.equal(await pvNote(p2, '写真貼付用紙②の改修後', '手すりの取り付け').count(), 0);
assert.equal(await pvNote(p1n, '写真貼付用紙①の改修後', '手すりの取り付け').count(), 0);
// ②の改修前は縦の写真（青 900×1600）→ 写真は左、書く内容は右。①の改修前は横の写真（黄 1600×533）→ 写真は上、書く内容はそのすぐ下で中央ぞろえ。
// ②の改修後の横の写真（緑 1200×900）は枠いっぱい（枠のまん中）。どれも枠の中
const boxOf = (loc) => loc.boundingBox();
const btn = (pg, name) => pg.getByRole('button', {name, exact: true});
const [nb, ib, fb, n1, i1, f1, ia, fa] = await Promise.all([
  boxOf(noteB),
  boxOf(btn(p2, '写真貼付用紙②の改修前').locator('img')),
  boxOf(btn(p2, '写真貼付用紙②の改修前')),
  boxOf(pvNote(p1n, '写真貼付用紙①の改修前', 'L=600mm H=800mm')),
  boxOf(btn(p1n, '写真貼付用紙①の改修前').locator('img')),
  boxOf(btn(p1n, '写真貼付用紙①の改修前')),
  boxOf(btn(p2, '写真貼付用紙②の改修後').locator('img')),
  boxOf(btn(p2, '写真貼付用紙②の改修後')),
]);
assert.ok(nb.x >= ib.x + ib.width - 1 && Math.abs(ib.x - fb.x) < fb.width * 0.05, `縦の写真の右に書いていない ${JSON.stringify([ib, nb])}`);
assert.ok(n1.y >= i1.y + i1.height - 1 && n1.y - (i1.y + i1.height) < f1.height * 0.1, `横の写真のすぐ下に書いていない ${JSON.stringify([i1, n1])}`);
assert.ok(Math.abs(i1.y - f1.y) < f1.height * 0.05, `横の写真が枠の上にない ${JSON.stringify([i1, f1])}`);
assert.equal(await pvNote(p1n, '写真貼付用紙①の改修前', 'L=600mm H=800mm').evaluate((el) => getComputedStyle(el).textAlign), 'center');
assert.ok(Math.abs(ia.y + ia.height / 2 - (fa.y + fa.height / 2)) < 2 && Math.abs(ia.x + ia.width / 2 - (fa.x + fa.width / 2)) < 2, `改修後の写真が枠のまん中にない ${JSON.stringify([ia, fa])}`);
const inside = (b, f) => b.x >= f.x - 1 && b.y >= f.y - 1 && b.x + b.width <= f.x + f.width + 1 && b.y + b.height <= f.y + f.height + 1;
assert.ok([[nb, fb], [ib, fb], [n1, f1], [i1, f1], [ia, fa]].every(([b, f]) => inside(b, f)), '写真か書く内容が枠からはみ出す');
await p2.screenshot({path: path.join(outDir, '86b-photo-notes.png')});
await photoBoard.screenshot({path: path.join(outDir, '85a-photo-notes-board.png')});
// Excel：写真貼付用紙の改修前の枠に、書く内容のテキストボックス（自動の文と足した行）。改修後の枠にはない
/** シートに足した書く欄（「改修前の説明」のテキストボックス）の行 */
const notesOf = (book, name) => {
  const rid = /<drawing r:id="([^"]+)"/.exec(book.sheets.get(name))?.[1];
  if (!rid) return [];
  const rels = strFromU8(book.files[book.paths.get(name).replace(/([^/]+)$/, '_rels/$1.rels')]);
  const d = strFromU8(book.files[`xl/drawings/${new RegExp(`Id="${rid}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(rels)[1]}`]);
  return [...d.matchAll(/<xdr:twoCellAnchor>([\s\S]*?)<\/xdr:twoCellAnchor>/g)]
    .map((m) => [/name="(改修[前後]の説明) \d+"/.exec(m[1])?.[1], [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join('/')])
    .filter(([n]) => n)
    .map(([n, t]) => `${n}:${t}`)
    .sort();
};
const noted = sheetsOf((await saveExcel()).bytes);
assert.deepEqual(notesOf(noted, '住改・写真②'), [`改修前の説明:${auto2.join('/')}`]);
assert.deepEqual(notesOf(noted, '住改・写真 ①'), ['改修前の説明:手すりの取り付け　L=600mm H=800mm']);
assert.deepEqual(photosOf(noted, '住改・写真②', 28).sort(), ['改修前:900x1600', '改修後:1200x900']); // 写真はそのまま
// 読み直しても残る
await page.waitForTimeout(1200);
await page.reload();
await photoBoard.waitFor();
assert.equal(await photoBoard.getByLabel('②トイレ 改修前の写真に書く内容の追加').inputValue(), 'ベースプレート　L=800mm');
log('写真に書く内容（改修前だけ・自動の文・追加・縦の写真は右に・横の写真は下に中央ぞろえ・改修後は枠いっぱい・Excel のテキストボックス・読み直し）OK');

// ---------------- 写真番号の入れ替え（ユーザーの指示「①勝手口・②浴室を、押したりドラッグで横にずらしたりして、①浴室・②勝手口に簡単に入れ替える」
// 「クリックしてそのままドロップしたら入れ替え」）：▶ ◀ で隣と、箇所をつかんで（見出しでも写真の上でも）ほかの箇所に重ねて離す。
// 写真は箇所と一緒に動き、申請書の改修の内容・見積書の箇所の順番・写真貼付用紙の番号もそろう
const cards = (where = photoBoard) => where.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter((l) => l.endsWith('の写真'))); // 箇所（中の「写真に書く内容」は数えない）
const workNames = () => works.getByRole('listitem').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
assert.deepEqual(await cards(), ['①玄関の写真', '②トイレの写真']);
const [yellowSrc, blueSrc2, greenSrc2] = [await srcOf(slot('①', '玄関', '改修前')), await srcOf(slot('②', 'トイレ', '改修前')), await srcOf(slot('②', 'トイレ', '改修後'))];
assert.equal(await photoBoard.getByRole('button', {name: '前の写真番号なし'}).isDisabled(), true);
await photoBoard.getByRole('button', {name: '①玄関と②トイレを入れ替える'}).first().click();
assert.deepEqual(await cards(), ['①トイレの写真', '②玄関の写真']);
assert.deepEqual([await srcOf(slot('①', 'トイレ', '改修前')), await srcOf(slot('①', 'トイレ', '改修後')), await srcOf(slot('②', '玄関', '改修前'))], [blueSrc2, greenSrc2, yellowSrc]);
assert.deepEqual(await workNames(), ['①トイレ', '②玄関']);
assert.equal(await photoBoard.getByLabel('①トイレ 改修前の写真に書く内容の追加').inputValue(), 'ベースプレート　L=800mm'); // 写真に書く内容も箇所と一緒に
await pvHas('①トイレ　手すりの取り付け');
await pvHas('②玄関　手すりの取り付け　L=600mm H=800mm');
assert.equal(await pageOf('住改・写真 ①').getByRole('button', {name: '写真貼付用紙①の改修後'}).locator('img').count(), 1); // ①トイレの改修後（緑）
await photoBoard.screenshot({path: path.join(outDir, '85b-photo-board-swapped.png')});
await estimateTab.click();
const est1 = await sheet.locator('.form-page').first().innerText();
assert.ok(est1.indexOf('①トイレ') >= 0 && est1.indexOf('①トイレ') < est1.indexOf('②玄関'), '見積書の箇所の順番が入れ替わっていない');
await shinseiTab.click();
await photoBoard.waitFor();
const handleOf = (name) => photoBoard.getByRole('group', {name}).getByTitle('ドラッグしてほかの写真番号と入れ替え');
/** つかむ所（見出し・写真）を押したまま、ほかの箇所に重ねて離す（マウス）。to が null なら箇所でない所（申請書の一覧）へ */
const dragCard = async (from, toName, shot = '') => {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const to = toName ? photoBoard.getByRole('group', {name: toName}) : form.getByLabel('フリガナ');
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 12});
  if (toName) assert.ok(await to.evaluate((el) => el.className.includes('ring-emerald-500')), '重ねている箇所が分からない');
  if (shot) await photoBoard.screenshot({path: path.join(outDir, shot)});
  await page.mouse.up();
};
await dragCard(handleOf('①トイレの写真'), '②玄関の写真');
assert.deepEqual(await cards(), ['①玄関の写真', '②トイレの写真']);
assert.deepEqual([await srcOf(slot('①', '玄関', '改修前')), await srcOf(slot('②', 'トイレ', '改修前'))], [yellowSrc, blueSrc2]);
assert.deepEqual(await workNames(), ['①玄関', '②トイレ']);
await pvHas('①玄関　手すりの取り付け　L=600mm H=800mm');
// 写真の上をつかんでも同じ（写真は選ばない）。空いた枠からでも。箇所でない所で離すと、そのまま
await dragCard(slot('①', '玄関', '改修前'), '②トイレの写真', '85c-photo-drag.png');
assert.deepEqual(await cards(), ['①トイレの写真', '②玄関の写真']);
assert.equal(await page.getByRole('status', {name: '選んでいる写真'}).count(), 0);
await pvHas('①トイレ　手すりの取り付け');
await dragCard(slot('②', '玄関', '改修後'), '①トイレの写真');
assert.deepEqual(await cards(), ['①玄関の写真', '②トイレの写真']);
assert.deepEqual([await srcOf(slot('①', '玄関', '改修前')), await srcOf(slot('②', 'トイレ', '改修前')), await srcOf(slot('②', 'トイレ', '改修後'))], [yellowSrc, blueSrc2, greenSrc2]);
await dragCard(slot('①', '玄関', '改修前'), null);
assert.deepEqual(await cards(), ['①玄関の写真', '②トイレの写真']);
assert.equal(await page.getByRole('status', {name: '選んでいる写真'}).count(), 0);
// 少し動かしただけ（押しただけ）では入れ替えない
await page.mouse.move(0, 0);
await handleOf('①玄関の写真').click();
assert.deepEqual(await cards(), ['①玄関の写真', '②トイレの写真']);
log('写真番号の入れ替え（▶ ◀・見出しや写真をつかんでドラッグ。写真・改修の内容・見積書の順番も一緒に）OK');

// ---------------- 写真の向き・大きさ（ユーザーの指示「写真の方向転換」「画像の角っこを持ち上げて縮小したり拡大したり」「申請書の大きさは絶対に大きくしない」
// 「パソコンでくるくると回転」「iPad でもくるっとすぐに簡単に回転」）：写真の欄の ↻ で右に 90°。プレビューの写真を押すと、角のつまみで大きさ・上の丸で向き、
// 道具の ↺ ↻・元に戻す。写真は枠より大きくならない（申請書・枠の大きさは変わらない）。Excel にも同じ向き・大きさで貼る
const rotOf = (loc) => loc.evaluate((el) => Number(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? 0));
const thumb = (no, name, which) => slot(no, name, which).locator('img');
const p1 = pageOf('住改・写真 ①');
const pvPhoto = p1.getByRole('button', {name: '写真貼付用紙①の改修前', exact: true});
const pvPic = pvPhoto.locator('div').first(); // 回す前の写真の四角（まん中で回る）
/** 写真の四角の大きさとまん中（紙の上の画素。回す前の形） */
const sizeOf = (loc) =>
  loc.evaluate((el) => {
    const [x, y, w, h] = ['left', 'top', 'width', 'height'].map((k) => parseFloat(el.style[k]));
    return {w, h, x: x + w / 2, y: y + h / 2};
  });
const paperBefore = await p1.evaluate((el) => [el.offsetWidth, el.offsetHeight]);
const full = await sizeOf(pvPic);
await photoBoard.getByRole('button', {name: '①玄関 改修前を右に回す'}).click();
assert.equal(await rotOf(thumb('①', '玄関', '改修前')), 90);
assert.equal(await rotOf(pvPic), 90);
// 横長の写真を立てると、枠の高さに合わせて小さくなり（枠からはみ出さない）、縦の写真なので左に寄る（写真に書く内容は上から右へ）
const turned = await sizeOf(pvPic);
assert.ok(turned.w < full.w && turned.x < full.x, '回して縦になった写真が左に寄っていない');
const [turnedImg, rightNote] = [await pvPhoto.locator('img').boundingBox(), await pvNote(p1, '写真貼付用紙①の改修前', 'L=600mm H=800mm').boundingBox()];
assert.ok(rightNote.x >= turnedImg.x + turnedImg.width - 1, `回して縦になった写真の右に書いていない ${JSON.stringify([turnedImg, rightNote])}`);
/** Excel の写真貼付用紙①の改修前の写真の向き・位置・大きさ（EMU） */
const picXfrm = async () => {
  const book = sheetsOf((await saveExcel()).bytes);
  const rid = /<drawing r:id="([^"]+)"/.exec(book.sheets.get('住改・写真 ①'))[1];
  const rels = strFromU8(book.files[book.paths.get('住改・写真 ①').replace(/([^/]+)$/, '_rels/$1.rels')]);
  const d = strFromU8(book.files[`xl/drawings/${new RegExp(`Id="${rid}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(rels)[1]}`]);
  // 回した写真の回す前の四角は、紙の端より外に出ることがある（位置がマイナス）
  const pics = [...d.matchAll(/<xdr:pic>[\s\S]*?<a:xfrm(?: rot="(\d+)")?><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => ({
    rot: Number(m[1] ?? 0) / 60000,
    x: +m[2],
    y: +m[3],
    cx: +m[4],
    cy: +m[5],
  }));
  assert.equal(pics.length, 1);
  return pics[0];
};
const x1 = await picXfrm();
assert.equal(x1.rot, 90);
assert.ok(Math.abs(x1.cx / x1.cy - 1600 / 533) < 0.02); // 写真の形のまま（回すのは Excel が回す）
// プレビューの写真を押すと選ぶ：角のつまみ・上の丸・道具
await pvPhoto.click();
assert.equal(await pvPhoto.getAttribute('aria-pressed'), 'true');
const tools = page.getByRole('toolbar', {name: '写真貼付用紙①の改修前の向き・大きさ'});
await tools.waitFor();
await p1.screenshot({path: path.join(outDir, '87-photo-edit.png')});
/** つまみを、写真のまん中から見て、角度 turnDeg（右回り）・距離 k 倍の所までドラッグする（マウス） */
const dragKnob = async (label, k, turnDeg) => {
  const knob = p1.getByRole('button', {name: label, exact: true});
  const r = await knob.boundingBox();
  const c = await pvPic.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return {x: b.left + b.width / 2, y: b.top + b.height / 2};
  });
  const [sx, sy] = [r.x + r.width / 2, r.y + r.height / 2];
  const [d, a] = [Math.hypot(sx - c.x, sy - c.y), Math.atan2(sy - c.y, sx - c.x)];
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const t = a + (((turnDeg * Math.PI) / 180) * i) / 10;
    const dd = d * (1 + ((k - 1) * i) / 10);
    await page.mouse.move(c.x + dd * Math.cos(t), c.y + dd * Math.sin(t));
  }
  await page.mouse.up();
};
// 角のつまみを写真のまん中へ半分寄せる → 半分の大きさ（まん中はそのまま）。写真の欄の写真も
await dragKnob('写真貼付用紙①の改修前の大きさ（右下の角）', 0.5, 0);
const half = await sizeOf(pvPic);
assert.ok(Math.abs(half.w / turned.w - 0.5) < 0.03 && Math.abs(half.x - turned.x) < 0.5 && Math.abs(half.y - turned.y) < 0.5, `半分になっていない ${half.w}/${turned.w}`);
assert.equal(await pvPhoto.getAttribute('aria-pressed'), 'true'); // 選んだまま
const thumbW = await thumb('①', '玄関', '改修前').evaluate((el) => parseFloat(el.style.width));
// 外へ広げても、枠いっぱい（元の大きさ）より大きくならない
await dragKnob('写真貼付用紙①の改修前の大きさ（左上の角）', 2.5, 0);
assert.ok(Math.abs((await sizeOf(pvPic)).w - turned.w) < 1, '枠より大きくなった');
assert.deepEqual(await p1.evaluate((el) => [el.offsetWidth, el.offsetHeight]), paperBefore); // 申請書の大きさは変わらない
await dragKnob('写真貼付用紙①の改修前の大きさ（右下の角）', 0.5, 0);
assert.ok(Math.abs((await thumb('①', '玄関', '改修前').evaluate((el) => parseFloat(el.style.width))) - thumbW) < 0.5);
// Excel：半分の大きさ・同じまん中・同じ向き
const x2 = await picXfrm();
assert.equal(x2.rot, 90);
assert.ok(Math.abs(x2.cx / x1.cx - 0.5) < 0.02 && Math.abs(x2.cy / x1.cy - 0.5) < 0.02, `Excel の写真が半分でない ${x2.cx}/${x1.cx}`);
assert.ok(Math.abs(x2.x + x2.cx / 2 - (x1.x + x1.cx / 2)) < 2000 && Math.abs(x2.y + x2.cy / 2 - (x1.y + x1.cy / 2)) < 2000, 'Excel の写真がまん中にない');
// 選んだ写真をつかんで動かす（ユーザーの指示「写真の位置の調整をおこなえるようにする」2026-10-22）：左上へ大きく動かしても枠からはみ出さず、
// 写真の欄・Excel も同じ位置。大きさ・向きは変わらない
await pvPhoto.click();
await tools.waitFor();
const grab = await pvPic.boundingBox();
await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
await page.mouse.down();
// 左下へ動かすと、回すつまみが左下に出るお知らせ（保存しました）の下になるので左上へ
for (let i = 1; i <= 12; i++) await page.mouse.move(grab.x + grab.width / 2 - 60 * i, grab.y + grab.height / 2 - 30 * i);
await page.mouse.up();
const movedPic = await sizeOf(pvPic);
assert.ok(movedPic.x < half.x - 20 && movedPic.y < half.y - 5, `写真が動いていない ${JSON.stringify([half, movedPic])}`);
assert.ok(Math.abs(movedPic.w - half.w) < 0.5 && (await rotOf(pvPic)) === 90, '動かしたら大きさか向きが変わった');
assert.equal(await pvPhoto.getAttribute('aria-pressed'), 'true'); // 選んだまま
{
  const [img, frameBox] = [await pvPhoto.locator('img').boundingBox(), await pvPhoto.boundingBox()];
  assert.ok(img.x >= frameBox.x - 1 && img.y >= frameBox.y - 1 && img.x + img.width <= frameBox.x + frameBox.width + 1 && img.y + img.height <= frameBox.y + frameBox.height + 1, `動かした写真が枠からはみ出す ${JSON.stringify([img, frameBox])}`);
}
assert.ok((await thumb('①', '玄関', '改修前').evaluate((el) => parseFloat(el.style.left))) < 40, '写真の欄の写真が左に寄っていない');
await p1.screenshot({path: path.join(outDir, '87c-photo-move.png')});
const x3 = await picXfrm();
assert.ok(x3.x < x2.x - 50000 && Math.abs(x3.cx - x2.cx) < 2 && x3.rot === 90, `Excel の写真が動いていない ${JSON.stringify([x2, x3])}`);
// 上の丸をまわして回す（くるくる）：45°まわすと 135°。90°の倍数の近く（7°以内）はそろう
await pvPhoto.click(); // Excel を保存したので選び直す
await tools.waitFor();
await dragKnob('写真貼付用紙①の改修前の向き（回す）', 1, 45);
assert.equal(await rotOf(pvPic), 135);
await dragKnob('写真貼付用紙①の改修前の向き（回す）', 1, 40);
assert.equal(await rotOf(pvPic), 180); // 175° → 180°
assert.equal(await rotOf(thumb('①', '玄関', '改修前')), 180);
await p1.screenshot({path: path.join(outDir, '87b-photo-rotate.png')});
// 道具：↻ は右に 90°、↺ は左に 90°、元に戻す
await tools.getByRole('button', {name: '右に回す'}).click();
assert.equal(await rotOf(pvPic), 270);
await tools.getByRole('button', {name: '左に回す'}).click();
await tools.getByRole('button', {name: '左に回す'}).click();
assert.equal(await rotOf(pvPic), 90);
await tools.getByRole('button', {name: '元に戻す'}).click();
assert.equal(await rotOf(pvPic), 0);
assert.ok(Math.abs((await sizeOf(pvPic)).w - full.w) < 1);
assert.equal(await rotOf(thumb('①', '玄関', '改修前')), 0);
// 完了・Esc・ほかの所を押すと、選ぶのをやめる
await tools.getByRole('button', {name: '完了'}).click();
assert.equal(await tools.count(), 0);
await pvPhoto.click();
await page.keyboard.press('Escape');
assert.equal(await tools.count(), 0);
await pvPhoto.click();
await form.getByLabel('フリガナ').click();
assert.equal(await tools.count(), 0);
// 写真を入れ替えると、向き・大きさも写真と一緒に動く
await photoBoard.getByRole('button', {name: '②トイレ 改修前を右に回す'}).click();
await slot('②', 'トイレ', '改修前').click();
await slot('①', '玄関', '改修後').click();
assert.equal(await rotOf(thumb('①', '玄関', '改修後')), 90);
await slot('①', '玄関', '改修後').click();
await slot('②', 'トイレ', '改修前').click();
assert.equal(await rotOf(thumb('②', 'トイレ', '改修前')), 90);
await photoBoard.getByRole('button', {name: '②トイレ 改修前を右に回す'}).click();
await photoBoard.getByRole('button', {name: '②トイレ 改修前を右に回す'}).click();
await photoBoard.getByRole('button', {name: '②トイレ 改修前を右に回す'}).click();
assert.equal(await rotOf(thumb('②', 'トイレ', '改修前')), 0);
// 読み直しても向き・大きさは残る
await photoBoard.getByRole('button', {name: '①玄関 改修前を右に回す'}).click();
await page.waitForTimeout(1200);
await page.reload();
await photoBoard.waitFor();
await thumb('①', '玄関', '改修前').waitFor();
assert.equal(await rotOf(thumb('①', '玄関', '改修前')), 90);
await photoBoard.getByRole('button', {name: '①玄関 改修前を右に回す'}).click();
await photoBoard.getByRole('button', {name: '①玄関 改修前を右に回す'}).click();
await photoBoard.getByRole('button', {name: '①玄関 改修前を右に回す'}).click();
assert.equal(await rotOf(thumb('①', '玄関', '改修前')), 0);
log('写真の向き・大きさ（写真の欄の ↻・プレビューの角のつまみ・上の丸で回す・↺ ↻・元に戻す・枠より大きくしない・Excel・入れ替えで一緒に動く・読み直し）OK');

// ---------------- iPad（指）：写真を押して選び、2本の指でひねると回る（90°の近くはそろう）・つまむと小さく。写真の欄の ↻、見出しを指でドラッグして写真番号を入れ替え
const tab = await browser.newContext({viewport: {width: 1180, height: 820}, deviceScaleFactor: 2, hasTouch: true, locale: 'ja-JP'});
await routeOcr(tab);
await tab.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const ipad = await tab.newPage();
ipad.on('pageerror', (e) => errors.push('pageerror(iPad): ' + e.message));
ipad.on('console', (m) => appError(m) && errors.push('console(iPad): ' + m.text()));
ipad.on('dialog', (d) => d.accept());
await ipad.goto(`${site}/jutaku-mitsumori/index.html`);
await ipad.getByRole('button', {name: /サンプルで試す/}).click();
await ipad.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await ipad.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const board2 = ipad.getByRole('region', {name: '写真'});
await board2.waitFor();
const [chooser3] = await Promise.all([ipad.waitForEvent('filechooser'), board2.getByRole('button', {name: '📷 写真を選ぶ'}).tap()]);
await chooser3.setFiles([
  {name: 'red.png', mimeType: 'image/png', buffer: red},
  {name: 'blue.png', mimeType: 'image/png', buffer: blue},
]);
const slot2 = (no, name, which) => board2.getByRole('button', {name: `${no}${name} ${which}`, exact: true});
/** 指で押した結果（click）は少し遅れて届くことがあるので、そうなるまで待つ（3秒まで） */
const until = async (check, what) => {
  for (let i = 0; i < 30 && !(await check()); i++) await ipad.waitForTimeout(100);
  assert.ok(await check(), what);
};
await slot2('②', 'トイレ', '改修前').locator('img').waitFor();
const cdp = await tab.newCDPSession(ipad);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map(([x, y], id) => ({x, y, id, radiusX: 4, radiusY: 4, force: 1}))});
/** 指1本でドラッグする（hold：押してから動かすまで待つミリ秒。重ねた所で少し止めてから離す。勢いよく離すと、次に押したのが「止める」扱いになって押せない） */
const fingerDrag = async (from, to, hold = 0) => {
  await to.evaluate((el) => el.scrollIntoView({block: 'center'})); // 画面の端（近づけるとスクロールする）から離しておく
  await from.scrollIntoViewIfNeeded();
  const [a, b] = [await from.boundingBox(), await to.boundingBox()];
  const [sx, sy, ex, ey] = [a.x + a.width / 2, a.y + a.height / 2, b.x + b.width / 2, b.y + b.height / 2];
  await touch('touchStart', [[sx, sy]]);
  if (hold) await ipad.waitForTimeout(hold);
  for (let i = 1; i <= 12; i++) await touch('touchMove', [[sx + ((ex - sx) * i) / 12, sy + ((ey - sy) * i) / 12]]);
  for (const dx of [0.4, 0, 0.4, 0]) {
    await ipad.waitForTimeout(50);
    await touch('touchMove', [[ex + dx, ey]]);
  }
  await touch('touchEnd', []);
};
await fingerDrag(board2.getByRole('group', {name: '①玄関の写真'}).getByTitle('ドラッグしてほかの写真番号と入れ替え'), board2.getByRole('group', {name: '②トイレの写真'}));
assert.deepEqual(await cards(board2), ['①トイレの写真', '②玄関の写真']);
// 写真の上は、すぐに動かすと画面のスクロール（入れ替えない）。少し押したままにしてから動かすと、つかんで入れ替え（写真は選ばない）
await fingerDrag(slot2('①', 'トイレ', '改修前'), board2.getByRole('group', {name: '②玄関の写真'}));
await ipad.waitForTimeout(300);
assert.deepEqual(await cards(board2), ['①トイレの写真', '②玄関の写真']);
await fingerDrag(slot2('①', 'トイレ', '改修前'), board2.getByRole('group', {name: '②玄関の写真'}), 450);
await until(async () => (await cards(board2))[0] === '①玄関の写真', '写真の上を押したままドラッグしても入れ替わらない');
await fingerDrag(slot2('①', '玄関', '改修前'), board2.getByRole('group', {name: '②トイレの写真'}), 450);
await until(async () => (await cards(board2))[0] === '①トイレの写真', '写真の上を押したままドラッグしても入れ替わらない（2回目）');
await ipad.waitForTimeout(600);
assert.equal(await board2.getByRole('status', {name: '選んでいる写真'}).count(), 0);
// 写真の欄の ↻ を指で押す
await board2.getByRole('button', {name: '②玄関 改修前を右に回す'}).tap();
await until(async () => (await rotOf(slot2('②', '玄関', '改修前').locator('img'))) === 90, '写真の欄の ↻ を指で押しても回らない');
// プレビューの写真を指で押して選び、2本の指でひねる・つまむ
const ipPage = ipad.getByLabel('申請書のプレビュー').getByRole('group', {name: '住改・写真 ①', exact: true});
const ipPhoto = ipPage.getByRole('button', {name: '写真貼付用紙①の改修前', exact: true});
const ipPic = ipPhoto.locator('div').first();
await ipPhoto.scrollIntoViewIfNeeded();
const ipFull = await sizeOf(ipPic);
await ipPhoto.tap();
await until(async () => (await ipPhoto.getAttribute('aria-pressed')) === 'true', 'プレビューの写真を指で押しても選べない');
/** 写真のまん中のまわりで、2本の指を turnDeg（右回り）ひねって、指の間を k 倍にする */
const twist = async (turnDeg, k) => {
  const c = await ipPic.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return {x: b.left + b.width / 2, y: b.top + b.height / 2};
  });
  const at = (i) => {
    const t = (((turnDeg * Math.PI) / 180) * i) / 10;
    const d = 40 * (1 + ((k - 1) * i) / 10);
    return [
      [c.x - d * Math.cos(t), c.y - d * Math.sin(t)],
      [c.x + d * Math.cos(t), c.y + d * Math.sin(t)],
    ];
  };
  await touch('touchStart', [at(0)[0]]);
  await touch('touchStart', at(0));
  for (let i = 1; i <= 10; i++) await touch('touchMove', at(i));
  await touch('touchEnd', []);
};
await twist(86, 1); // 86° ひねると 90°にそろう
assert.equal(await rotOf(ipPic), 90);
assert.equal(await rotOf(slot2('①', 'トイレ', '改修前').locator('img')), 90);
const ipTurned = await sizeOf(ipPic);
await twist(0, 0.5);
assert.ok(Math.abs((await sizeOf(ipPic)).w / ipTurned.w - 0.5) < 0.03, 'つまんで小さくならない');
await twist(-30, 1);
assert.equal(await rotOf(ipPic), 60);
assert.equal(await ipPhoto.getAttribute('aria-pressed'), 'true');
await ipad.screenshot({path: path.join(outDir, '90-ipad-photo-edit.png')});
// 道具の ↻ を指で押す（斜めは近い 90°にそろえてから右へ）
await ipPage.getByRole('toolbar', {name: '写真貼付用紙①の改修前の向き・大きさ'}).getByRole('button', {name: '右に回す'}).tap();
await until(async () => (await rotOf(ipPic)) === 180, '道具の ↻ を指で押しても回らない');
await ipPage.getByRole('toolbar', {name: '写真貼付用紙①の改修前の向き・大きさ'}).getByRole('button', {name: '元に戻す'}).tap();
await until(async () => Math.abs((await sizeOf(ipPic)).w - ipFull.w) < 0.5, '元に戻らない');
await board2.screenshot({path: path.join(outDir, '91-ipad-photo-board.png')});
// スマホの幅：写真の欄・写真貼付用紙が画面からはみ出さない
await ipad.setViewportSize({width: 390, height: 844});
await board2.scrollIntoViewIfNeeded();
assert.ok(await ipad.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'スマホの幅で横にはみ出す');
await board2.screenshot({path: path.join(outDir, '92-phone-photo-board.png')});
await ipPhoto.scrollIntoViewIfNeeded();
await ipPhoto.tap();
await until(async () => (await ipPhoto.getAttribute('aria-pressed')) === 'true', 'スマホの幅で写真を選べない');
await ipPage.screenshot({path: path.join(outDir, '93-phone-photo-edit.png')});
assert.ok(await ipad.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'スマホの幅で横にはみ出す（写真を選んだとき）');
await tab.close();
log('iPad・スマホ（指で見出し・写真の上を押したままドラッグして入れ替え・すぐに動かすとスクロール・↻・2本の指でひねる／つまむ・道具・はみ出さない）OK');

// ---------------- 苅田町：保険者を替えると苅田町の申請書。丸は残る（もう一度押すと外れる）。事後申請書は式で同じ内容
await shinseiTab.click();
assert.equal(await page.getByRole('button', {name: /^保険者を.*にする$/}).count(), 0);
await page.getByRole('combobox', {name: '保険者'}).selectOption('kanda');
await pageOf('事前申請書').waitFor();
assert.deepEqual(await pageNames(), ['事前申請書', '平面図  (2)', '1 ', '1  (3)']);
// 工事場所の住所（行橋市）と違う保険者を選ぶと、見積書のタブと同じく知らせる（変えるのはボタンで）
assert.ok((await page.getByText('工事場所の住所は「行橋市」です。').count()) > 0);
assert.equal(await page.getByRole('button', {name: '保険者を行橋市にする'}).count(), 1);
// 一覧は苅田町の申請書の順番。ただし被保険者氏名はフリガナのすぐ下（ユーザーの指示）。完了予定日だけ（着工予定日は空白）
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '性別', '郵便番号', '住所', '電話番号', '要介護状態区分', '住宅の所有者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '完了予定日', '改修予定費用']);
assert.equal(await form.getByLabel('完了予定日').inputValue(), '2026-11-20');
assert.equal(await form.getByLabel('改修予定費用').inputValue(), '26,950');
assert.ok((await form.innerText()).includes('見積書の合計（税込）'));
assert.deepEqual(await pressed(), ['昭和', '女', '要介護2']);
assert.ok((await preview.innerText()).includes('26,950円')); // 苅田町も改修予定費用＝見積書の合計
await mark('要介護2').click();
assert.deepEqual(await pressed(), ['昭和', '女']);
const kd = await make(['要支援1']);
// 保存のお知らせ（少しすると消えるので、時間のかかる写真の日付のテストより前に見る）
await page.locator('[aria-live] > div', {hasText: `「${kd.name}」を保存しました`}).waitFor();
assert.equal(kd.name, '（サンプル）山田様住宅改修申請書.xlsx');
const k = sheetsOf(kd.bytes);
assert.equal(k.sheets.size, 15);
const pre = k.sheets.get('事前申請書');
assert.deepEqual([text(pre, 'J7'), text(pre, 'J11'), text(pre, 'J14'), text(pre, 'J17')], ['（サンプル）山田', '福岡県行橋市中央1-1', WORKS, '26,950円']);
assert.equal(['X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6', 'AG6'].map((r) => text(pre, r)).join(''), '0000366989');
assert.match(k.sheets.get('事後申請書'), /<f>事前申請書!J7<\/f><v>（サンプル）山田<\/v>/);
assert.deepEqual([k.ellipses('事前申請書'), k.ellipses('事後申請書')], [3, 3]); // 女・昭・要支援１（事後申請書にも）
assert.deepEqual(['J6', 'J9', 'J10', 'AB11', 'W13', 'Y16'].map((r) => text(pre, r)), ['サンプル　ヤマダ', '明　・　大　・　昭　23年5月6日生', '〒824-0001', '0930-11-2222', '本人との関係（本人）', '令和8年11月20日']);
assert.ok(!/令和|46331/.test(cellOf(pre, 'Y15')), cellOf(pre, 'Y15')); // 着工予定日は空白
// 写真の用紙の改修箇所・実施した工事種類の□は、その写真番号の箇所・改修の種類を■に（ユーザーの指示「□の部分は、選択した項目と連動する」）。
// 撮影日（一覧の改修前日付・改修後日付）：写真に日付がなければ、改修前は当日・改修後は空（原本のまま）
const today = new Date();
const reiwaToday = `令和${today.getFullYear() - 2018}年${today.getMonth() + 1}月${today.getDate()}日`;
const kPhoto1 = k.sheets.get('1 ');
assert.ok(text(kPhoto1, 'B2').includes('■玄関　□玄関～道路') && text(kPhoto1, 'B2').split('■').length === 2, text(kPhoto1, 'B2'));
assert.ok(text(kPhoto1, 'B4').startsWith('■手すりの取り付け　□(2)段差の解消'), text(kPhoto1, 'B4'));
assert.ok(text(k.sheets.get('1  (3)'), 'B2').includes('■トイレ'));
assert.deepEqual([text(kPhoto1, 'D6'), text(k.sheets.get('1  (3)'), 'D6'), text(k.sheets.get('1  (3)'), 'D23')], [reiwaToday, reiwaToday, '']); // 改修後は書かない（原本のまま）
assert.ok((await pageOf('1 ').innerText()).includes('■玄関'));
const kStrings = strFromU8(unzipSync(kd.bytes)['xl/sharedStrings.xml']);
assert.ok(!kStrings.includes('手摺'));
// 撮影日の欄（写真の用紙に撮影日の欄のある苅田町・みやこ町）：「改修前撮影日」「改修後撮影日」と、一覧の「改修前日付」「改修後日付」（どの保険者も。改修の内容のすぐ上）。
// 写真に日付がなければ改修前は当日・改修後は空（ユーザーの指示「改修前は当日デフォルト」「改修後はデフォルト空白」）。
// 1つ直すと、すべての写真の同じ撮影日がその日になる（ユーザーの指示「一つ入力したら全ての写真で全部入力」）。撮影日時の入った写真（JPEG）・日付入り写真を入れると、その日
const dateOf = (no, name, which) => photoBoard.getByLabel(`${no}${name} ${which}撮影日`, {exact: true});
const listDate = (which) => form.getByLabel(`${which}日付`, {exact: true});
const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
assert.deepEqual([await dateOf('①', '玄関', '改修前').inputValue(), await dateOf('①', '玄関', '改修後').inputValue(), await dateOf('②', 'トイレ', '改修後').inputValue()], [isoToday, '', '']);
assert.deepEqual([await listDate('改修前').inputValue(), await listDate('改修後').inputValue()], [isoToday, '']);
assert.ok(/改修前撮影日[\s\S]*改修後撮影日/.test(await photoBoard.innerText()));
await dateOf('②', 'トイレ', '改修後').fill('2026-12-01');
await pvHas('令和8年12月1日');
assert.equal(await dateOf('①', '玄関', '改修後').inputValue(), '2026-12-01'); // 写真のまだない枠にも入る
assert.equal(await listDate('改修後').inputValue(), '2026-12-01');
await dateOf('①', '玄関', '改修前').fill('2026-10-01');
assert.equal(await dateOf('②', 'トイレ', '改修前').inputValue(), '2026-10-01');
await pvHas('令和8年10月1日');
// 一覧の改修後日付で直しても、すべての写真の改修後の撮影日に（あとの確かめのため 12月1日に戻す）
await listDate('改修後').fill('2026-12-02');
assert.deepEqual([await dateOf('①', '玄関', '改修後').inputValue(), await dateOf('②', 'トイレ', '改修後').inputValue()], ['2026-12-02', '2026-12-02']);
await listDate('改修後').fill('2026-12-01');
await form.locator('[data-field="photoDates"]').screenshot({path: path.join(outDir, '87-photo-dates-list.png')});
await dropFile(slot('①', '玄関', '改修後'), await datedJpeg('#8e44ad', '2026:10:05 09:30:00'), 'dated.jpg', 'image/jpeg');
await slot('①', '玄関', '改修後').locator('img').waitFor();
await page.waitForFunction(() => document.querySelector('[aria-label="①玄関 改修後撮影日"]')?.value === '2026-10-05');
await pvHas('令和8年10月5日');
await photoBoard.screenshot({path: path.join(outDir, '88-photo-dates.png')});
// 写真を消すとその写真の撮影日も消え、ほかの写真と同じ日（写真番号の順で最初の日付）に戻る（あとの保険者の確かめのため、入れる前に戻す）
await slot('①', '玄関', '改修後').click();
await page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '削除'}).click();
assert.equal(await dateOf('①', '玄関', '改修後').inputValue(), '2026-12-01');
// 撮影日時のない写真を入れると、ほかの写真のそろえた撮影日になる（当日ではなく）。あとの保険者の確かめのため、また消す
await dropFile(slot('①', '玄関', '改修後'), await makeImage('#16a085', 800, 600), 'plain.png');
await slot('①', '玄関', '改修後').locator('img').waitFor();
assert.equal(await dateOf('①', '玄関', '改修後').inputValue(), '2026-12-01');
await slot('①', '玄関', '改修後').click();
await page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '削除'}).click();
assert.equal(await dateOf('①', '玄関', '改修後').inputValue(), '2026-12-01');
// 日付入り写真（右下に「2026年9月17日木曜日」。撮影日時の情報はない）：写っている日付を読んで入れる（ユーザーの指示「日付入り写真を添付した場合は、
// その日付に合わせて自動入力」）。一覧の改修後日付も（写真番号の順で最初の日付）。読み取りの部品の取り寄せと読み取りに少しかかる
await dropFile(slot('①', '玄関', '改修後'), await stampedJpeg('2026年9月17日木曜日'), 'line.jpg', 'image/jpeg');
await slot('①', '玄関', '改修後').locator('img').waitFor();
await page.waitForFunction(() => document.querySelector('[aria-label="①玄関 改修後撮影日"]')?.value === '2026-09-17', null, {timeout: 60000});
assert.equal(await listDate('改修後').inputValue(), '2026-09-17');
assert.equal(await dateOf('②', 'トイレ', '改修後').inputValue(), '2026-12-01'); // 写真のある枠の撮影日はそのまま
await pvHas('令和8年9月17日');
// PDF（スキャンした日付入り写真など）をそのままドロップ：ページを写真にして入れ（写真のある枠なら差し替え）、写っている日付も読む
// （ユーザーの指示「PDFファイルをドラッグ＆ドロップでそのまま添付できるようにする」）
const stampedSrc = await srcOf(slot('①', '玄関', '改修後'));
await dropFile(slot('①', '玄関', '改修後'), await pdfOf(await stampedJpeg('2026年9月18日金曜日')), 'scan.pdf', 'application/pdf');
await page.waitForFunction((old) => { const img = document.querySelector('[aria-label="①玄関 改修後"] img'); return img && img.getAttribute('src') !== old; }, stampedSrc, {timeout: 30000});
await page.waitForFunction(() => document.querySelector('[aria-label="①玄関 改修後撮影日"]')?.value === '2026-09-18', null, {timeout: 60000});
await photoBoard.screenshot({path: path.join(outDir, '88b-photo-pdf-stamp.png')});
// 写真でも PDF でもないファイルは入れない
await dropFile(slot('②', 'トイレ', '改修前'), Buffer.from('memo'), 'memo.txt', 'text/plain');
await page.locator('[aria-live] > div', {hasText: '写真（画像）か PDF のファイルを選んでください'}).waitFor();
await slot('①', '玄関', '改修後').click();
await page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '削除'}).click();
assert.equal(await dateOf('①', '玄関', '改修後').inputValue(), '2026-12-01');
log('苅田町の写真の用紙（改修箇所・工事種類の□が連動・撮影日：改修前は当日・改修後は空・1つ直すと全部の写真に・一覧の改修前日付・改修後日付・写真の撮影日時と写っている日付を読む・PDF）OK');
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
assert.ok((await pageOf('住宅改修内訳明細書').innerText()).includes('①玄関　手すりの取り付け　L=600mm H=800mm'));
const my = await make(['無']);
assert.equal(my.name, '（サンプル）山田様住宅改修申請書.xlsx');
const m = sheetsOf(my.bytes);
assert.equal(m.sheets.size, 12);
// 撮影日：みやこ町の写真の用紙は原本の「撮影日」のうしろに日付（①玄関の改修後は写真を消したので、②の改修後と同じ日）
assert.deepEqual(
  [1, 2].flatMap((n) => [text(m.sheets.get(`写真 (${n})`), 'D7'), text(m.sheets.get(`写真 (${n})`), 'D32')]),
  ['撮影日　令和8年10月1日', '撮影日　令和8年12月1日', '撮影日　令和8年10月1日', '撮影日　令和8年12月1日'],
);
const top = m.sheets.get('住宅改修承認届出書');
assert.deepEqual([text(top, 'I5'), text(top, 'I9'), boxes('W', 10, 4).map((r) => text(top, r)).join('')], ['（サンプル）山田', '福岡県行橋市中央1-1', '0000366989']);
assert.equal(text(m.sheets.get('住宅改修費支給申請書(受領委任払用)'), 'J6'), '（サンプル）山田');
const md = m.sheets.get('住宅改修内訳明細書');
assert.deepEqual([text(md, 'D15'), text(md, 'K14')], ['玄関・トイレ', WORKS]);
assert.deepEqual([1, 2, 3].map((n) => text(m.sheets.get(`写真 (${n})`), 'B5')), ['玄関', 'トイレ', '']); // 写真番号の改修場所
// 性別（女）・改修状況（無）を囲む。承認届出書は原本の丸（受領委任払いなど2つ）に足す。支給申請書は図形を足す
assert.deepEqual([m.ellipses('住宅改修承認届出書'), m.ellipses('住宅改修費支給申請書(受領委任払用)')], [2 + 2, 2]);
// 写真の用紙の改修の種別：箇所のある写真番号はその改修の種類（①玄関・②トイレとも①手すり）に丸、箇所のない用紙は丸なし（原本に残っていた丸は消す）。プレビューにも
assert.deepEqual([1, 2, 3, 4].map((n) => m.ellipses(`写真 (${n})`)), [1, 1, 0, 0]);
assert.equal(await pageOf('写真 (2)').locator('svg ellipse').count(), 1);
log('みやこ町の申請書（6枚のプレビュー・式の欄も押せる・承認届出書・支給申請書・内訳明細書・写真・改修の種別の丸）OK');

// ---------------- 広域連合（築上町など）：承認申請書・支給申請書（受領委任払用）・内訳明細書（別紙）・平面図・写真貼付用紙
await page.getByRole('combobox', {name: '保険者'}).selectOption('kouiki');
await pageOf('様式第2号（住宅改修承認申請書）').waitFor();
// 広域連合の一覧にも郵便番号（住所の前。ユーザーの指示で足した）
assert.deepEqual((await rowLabels()).slice(0, 7), ['フリガナ', '被保険者氏名', '被保険者番号', '生年月日', '性別', '郵便番号', '住所']);
// 写真貼付用紙の改修の種別①〜⑥は、原本どおり縦書き（ユーザーの指示「縦で入力できるようにする」）：1文字ずつ下へ、欄の中に収まる
const vertical = await pageOf('写真貼付用紙').evaluate((el) => {
  const span = [...el.querySelectorAll('span.sr-only')].find((x) => x.textContent === '手すりの取り付け');
  const box = span.parentElement.getBoundingClientRect();
  const chars = [...span.parentElement.querySelectorAll('div[aria-hidden="true"]')].map((d) => d.getBoundingClientRect());
  return {n: chars.length, sameX: chars.every((r) => Math.abs(r.left - chars[0].left) < 1), down: chars.every((r, i) => i === 0 || r.top > chars[i - 1].top), inside: chars[chars.length - 1].bottom <= box.bottom + 0.5};
});
assert.deepEqual(vertical, {n: 8, sameX: true, down: true, inside: true});
await pageOf('写真貼付用紙').screenshot({path: path.join(outDir, '89-kouiki-photo-vertical.png')});
assert.deepEqual(await pageNames(), ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）', '様式第2号別紙（住宅改修内訳明細書）', '平面図 (2)', '写真貼付用紙', '写真貼付用紙 (2)']);
assert.ok((await preview.innerText()).includes('様式第２号（第６条関係）')); // ヘッダー
await estimateTab.click();
await sheet.locator('.form-page', {hasText: '内訳書　様式'}).first().waitFor(); // 見積書は広域連合用になる
const kk = await make();
assert.equal(kk.name, '（サンプル）山田様住宅改修申請書.xlsx');
const g = sheetsOf(kk.bytes);
assert.equal(g.sheets.size, 25);
for (const name of ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）']) {
  const x = g.sheets.get(name);
  // 住所の欄は2行：1行目に〒と郵便番号（ユーザーの指示「郵便番号をいれれるようにする」）、2行目に住所
  assert.deepEqual([text(x, 'J6'), text(x, 'J9'), text(x, 'J10'), boxes('X', 10, 7).map((r) => text(x, r)).join('')], ['（サンプル）山田', '〒824-0001', '福岡県行橋市中央1-1', '0000366989'], name);
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
// 改修の種別の丸：①①②②の用紙は①手すり（原本の②の用紙の丸は②だった）、箇所のない③〜⑤の用紙は丸なし
assert.deepEqual(SHINSEI_PHOTO_SHEETS.kouiki.map((n) => g.ellipses(n)), [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
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
// 上の段の「📗 申請書をExcelで保存」は画面のまん中（ユーザーの指示「Excelの印刷、保存ボタンを中央にもってくる」）。左・まん中・右に分けた段のまん中
/** ボタンの入ったまん中のかたまりが、上の段のまん中から何画素ずれているか */
const offCenter = (name) =>
  page.getByRole('button', {name, exact: true}).evaluate((b) => {
    const row = b.closest('.lg\\:grid').getBoundingClientRect();
    const box = b.parentElement.getBoundingClientRect();
    return Math.abs((box.left + box.right) / 2 - (row.left + row.right) / 2);
  });
assert.ok((await offCenter('📗 申請書をExcelで保存')) < 2);
await page.screenshot({path: path.join(outDir, '81b-header-center.png'), clip: {x: 0, y: 0, width: 1366, height: 240}});
// フリガナ → 被保険者氏名 → 被保険者番号（6けたでも確定すると右に詰めて左は 0）→ 生年月日の年・月・日 → 郵便番号 → 住所 → 電話番号 → 所有者 → 関係。
// フリガナはひらがなで打っても全角カタカナになる（ユーザーの指示「ひらがなで入力しても、全角カタカナに自動的になるようにする」）
for (const t of ['みほん　いちろう', '見本 一郎', '366989', '10', '3', '4', '800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '見本 花子', '妻']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
assert.equal(await form.getByLabel('フリガナ').inputValue(), 'ミホン　イチロウ');
// 日本語の変換中（IME）はひらがなのまま（変えると変換がこわれる）。確定するとカタカナ。半角カタカナも全角に
const kana = form.getByLabel('フリガナ');
await kana.fill('');
await kana.focus();
const ime = await ctx.newCDPSession(page);
await ime.send('Input.imeSetComposition', {text: 'みほん', selectionStart: 3, selectionEnd: 3});
assert.equal(await kana.inputValue(), 'みほん');
await ime.send('Input.insertText', {text: 'みほん'});
await page.waitForFunction(() => document.querySelector('[aria-label="フリガナ"]').value === 'ミホン');
await kana.fill('ﾐﾎﾝ　ｲﾁﾛｳ');
assert.equal(await kana.inputValue(), 'ミホン　イチロウ');
await ime.detach();
assert.equal((await form.getByLabel('被保険者番号の10マス').innerText()).replace(/\s/g, ''), '0000366989');
assert.equal(await form.getByLabel('被保険者番号', {exact: true}).inputValue(), '0000366989'); // 確定（Enter）したら右に詰めて 0 が入る
await form.getByRole('group', {name: '性別'}).getByRole('button', {name: '男'}).click();
await form.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要支援2'}).click();
await mark('昭和').click();
// 改修前日付・改修後日付は、住宅の所有者の下・改修の内容のすぐ上。初めは改修前が当日・改修後は空
const order = await form.locator('[data-field]').evaluateAll((els) => els.map((e) => e.getAttribute('data-field')));
assert.deepEqual(order.slice(order.indexOf('owner'), order.indexOf('owner') + 3), ['owner', 'photoDates', 'works']);
assert.deepEqual([await listDate('改修前').inputValue(), await listDate('改修後').inputValue()], [isoToday, '']);
// 改修の内容：箇所を足して、手すりは長さ・高さ、段差の解消は幅・奥行・高さ（ユーザーの指示の書き方）。
// 箇所を足すと、その箇所の長さの欄にすぐ打ち込める（ユーザーの指示「廊下、玄関など選択すると、長さの部分をすぐに入力できるようにする」）
const where = () => page.evaluate(() => [document.activeElement?.closest('[role="listitem"]')?.getAttribute('aria-label'), document.activeElement?.getAttribute('aria-label')]);
// 箇所を足すはプルダウン1つ（前の「＋ 廊下」などのボタンは並べない）。はじめは「＋ 箇所を足す」、候補は写真の用紙の改修箇所の順＋そのほか
const placeSelect = works.getByRole('combobox', {name: '箇所を足す'});
assert.equal(await works.getByRole('button', {name: /^＋ /}).count(), 0);
assert.deepEqual(await placeSelect.locator('option').allInnerTexts(), ['＋ 箇所を足す', '廊下', '階段', '台所', '居間・食堂', '寝室', '洗面・脱衣室', '浴室', 'トイレ', '玄関', '玄関～道路', 'そのほか（名前を打つ）']);
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '玄関'});
assert.deepEqual(await where(), ['①玄関', '長さ（mm）']);
await page.keyboard.type('800');
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: 'トイレ'});
assert.deepEqual(await where(), ['②トイレ', '長さ（mm）']);
// 「そのほか」は改修場所の名前から（試したら消す）。箇所はプルダウンで足す（ユーザーの指示「プルダウン形式にしてください」2026-10-26）
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: 'そのほか（名前を打つ）'});
assert.deepEqual(await where(), ['③改修場所', '改修場所']);
// 何も入れていない箇所は聞かずに消す。寸法・写真などを入れた箇所は聞いてから消す（一度押しただけで写真ごと消えて、元に戻せなかった）
const asked = [];
const ask = (d) => asked.push(d.message());
page.on('dialog', ask);
await works.getByRole('button', {name: '箇所を消す', exact: true}).click();
assert.deepEqual(asked, []);
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: 'そのほか（名前を打つ）'});
await page.keyboard.type('物置');
await works.getByRole('listitem', {name: '③物置'}).getByLabel('長さ（mm）').fill('600');
await works.getByRole('button', {name: '物置を消す', exact: true}).click();
assert.match(asked.join('\n'), /^「物置」と、その寸法を消します。元に戻せません/);
assert.equal(await works.getByRole('listitem', {name: '③物置'}).count(), 0);
page.off('dialog', ask);
const g1 = works.getByRole('listitem', {name: '①玄関'});
assert.equal(await g1.getByLabel('長さ（mm）').inputValue(), '800');
if (await g1.getByRole('button', {name: '＋ 高さ（任意）'}).count()) await g1.getByRole('button', {name: '＋ 高さ（任意）'}).click(); // 高さは ＋ で開く（入っていれば開いたまま）
await g1.getByLabel('高さ（mm）').fill('750');
const t2 = works.getByRole('listitem', {name: '②トイレ'});
await t2.getByLabel('改修の種類').selectOption('2');
await t2.getByLabel('幅（mm）').fill('600');
await t2.getByLabel('奥行（mm）').fill('350');
await t2.getByLabel('高さ（mm）').fill('150');
assert.equal(await t2.getByLabel('長さ（mm）').count(), 0); // 段差の解消は幅・奥行・高さ
await form.getByLabel('完了予定日').fill('2026-12-10');
await form.getByLabel('改修予定費用').fill('120000');
await page.waitForFunction(() => !document.querySelector('[aria-label="申請書のプレビュー"] [role="button"][class*="bg-amber-300"]')); // 薄い黄色の欄がなくなる
assert.deepEqual(await pressed(), ['昭和', '男', '要支援2']);
const NEW_WORKS = '①玄関　手すりの取り付け　L=800mm H=750mm\n②トイレ　段差の解消　W600mm D350mm H150mm';
await pvHas('②トイレ　段差の解消　W600mm D350mm H150mm');
await page.screenshot({path: path.join(outDir, '82-shinsei-new.png'), fullPage: true});
pv = await preview.innerText();
for (const t of ['ミホン　イチロウ', '見本 一郎', '10年3月4日生', '〒800-0300', '福岡県京都郡苅田町富久町2-2', '0930-33-4444', '本人との関係（妻）', '①玄関　手すりの取り付け　L=800mm H=750mm', '令和8年12月10日', '120,000円']) {
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
// 改修の内容が10箇所でも欄からはみ出さない（ユーザーの指示「6箇所以上になった場合、はみ出ている」）。小さくした文字に行の間もそろえる
for (const name of ['廊下', '階段', '台所', '居間・食堂', '寝室', '洗面・脱衣室', '浴室', 'トイレ']) await placeSelect.selectOption({label: name});
await pvHas('⑩');
const fit = await pageOf('事前申請書').evaluate((pg) => {
  const box = [...pg.querySelectorAll('div')].find((d) => d.children.length > 0 && [...d.children].every((c) => c.tagName === 'SPAN') && /^①[\s\S]*⑩/.test(d.textContent ?? ''));
  const [a, b] = [box.getBoundingClientRect(), box.parentElement.getBoundingClientRect()];
  return {text: Math.round(a.height), cell: Math.round(b.height), inside: a.top >= b.top - 1 && a.bottom <= b.bottom + 1};
});
assert.ok(fit.inside, `改修の内容が欄からはみ出す：${JSON.stringify(fit)}`);
await pageOf('事前申請書').screenshot({path: path.join(outDir, '89-many-places.png')});
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
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '浴室'});
await works.getByRole('listitem', {name: '①浴室'}).getByLabel('長さ（mm）').fill('600');
await form.getByLabel('改修費用（介護保険対象分）').fill('80000');
await pvHas('①浴室　手すりの取り付け　L=600mm');
assert.ok((await pageOf('住宅改修内訳明細書').innerText()).includes('①浴室　手すりの取り付け　L=600mm'));
const onlyMy = sheetsOf((await saveExcel()).bytes);
const myTop = onlyMy.sheets.get('住宅改修承認届出書');
assert.deepEqual(['I5', 'N11', 'N12'].map((r) => text(myTop, r)), ['見本 次郎', '見本居宅介護支援事業所', '見本 三郎']);
assert.match(myTop, /<c r="I23" s="\d+"><v>80000<\/v><\/c>/);
assert.equal(text(onlyMy.sheets.get('住宅改修内訳明細書'), 'K14'), '①浴室　手すりの取り付け　L=600mm');
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
// 見積書のタブも、保存・Excel・印刷は上の段のまん中（白紙に戻す・発注書・複製・削除は右）
assert.ok((await offCenter('📗 Excelで保存')) < 2);
await page.screenshot({path: path.join(outDir, '81c-header-center-estimate.png'), clip: {x: 0, y: 0, width: 1366, height: 240}});
await shinseiTab.click();
await preview.waitFor();
log('申請書だけ（みやこ町。見積書なしで Excel・請求書に入れない・一覧から申請書のタブで開く）OK');

// ---------------- 上の段のまん中は 申請書をExcelで保存・まとめて保存・印刷 の並び（ユーザーの指示「申請書を保存、まとめて保存、印刷ボタンを並びで表示する」2026-10-26）。右に白紙に戻す
const centerButtons = await page
  .getByRole('button', {name: '📗 申請書をExcelで保存', exact: true})
  .evaluate((b) => [...b.parentElement.querySelectorAll('button')].map((x) => x.textContent.trim()));
assert.deepEqual(centerButtons, ['📗 申請書をExcelで保存', '📦 まとめて保存', '🖨 申請書を印刷']);
assert.ok((await offCenter('📗 申請書をExcelで保存')) < 2);
await page.screenshot({path: path.join(outDir, '81d-header-shinsei-buttons.png'), clip: {x: 0, y: 0, width: 1366, height: 240}});
// 🖨 申請書を印刷：プレビューと同じページを A4 に。初めは1枚目だけ印刷し、チェックで足せる。紙（PDF）の枚数で確かめる
await page.getByRole('button', {name: '🖨 申請書を印刷', exact: true}).click();
const printPages = page.getByRole('group', {name: '印刷するページ'});
await printPages.waitFor();
const checks = await printPages.getByRole('checkbox').evaluateAll((xs) => xs.map((x) => x.checked));
assert.ok(checks.length >= 2 && checks[0] && checks.slice(1).every((x) => !x), JSON.stringify(checks));
assert.equal(await page.locator('.shinsei-sheet').count(), checks.length);
assert.equal(await page.title(), '見本次郎様住宅改修申請書');
const sheetPdfPages = async () => {
  await page.emulateMedia({media: 'print'});
  const pdf = await page.pdf({preferCSSPageSize: true});
  await page.emulateMedia({media: 'screen'});
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
};
assert.equal(await sheetPdfPages(), 1);
await page.screenshot({path: path.join(outDir, '81e-shinsei-print.png')});
await printPages.getByRole('checkbox', {name: '2枚目'}).check();
assert.equal(await sheetPdfPages(), 2);
// 申請書の中の字は印刷にも出る（プレビューと同じ書き込み）。押せる所の黄色・枠は出さない
assert.ok((await page.locator('.shinsei-sheet').first().innerText()).includes('見本'));
assert.equal(await page.locator('.shinsei-sheet [role="button"]').count(), 0);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await page.locator('.print-overlay').waitFor({state: 'detached'});
// 📄 白紙に戻す（ユーザーの指示「白紙に戻すボタンをつける」2026-10-26）：確かめてから消し（ダイアログは OK）、字を打つ欄の外の Ctrl+Z で戻す
const blankBtn = page.getByRole('button', {name: '📄 白紙に戻す', exact: true});
assert.equal(await blankBtn.isDisabled(), false);
await blankBtn.click();
await page.getByRole('heading', {level: 1, name: '新しい申請書'}).waitFor();
assert.equal(await form.getByLabel('被保険者氏名').inputValue(), '');
assert.equal(await blankBtn.isDisabled(), true);
await page.locator('body').click({position: {x: 5, y: 300}});
await page.keyboard.press('ControlOrMeta+z');
await page.getByRole('heading', {level: 1, name: /見本 次郎/}).waitFor();
assert.equal(await form.getByLabel('被保険者氏名').inputValue(), '見本 次郎');
await pvHas('見本 次郎');
log('申請書を保存・まとめて保存・印刷の並び・申請書の印刷（1枚目だけ→足す）・白紙に戻す（Ctrl+Z で戻す）OK');

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
await works.scrollIntoViewIfNeeded();
await page.screenshot({path: path.join(outDir, '83b-shinsei-phone-works.png')}); // 改修の内容（箇所を足すのプルダウン）
const photoBoardPhone = page.getByRole('region', {name: '写真'});
await photoBoardPhone.scrollIntoViewIfNeeded();
await photoBoardPhone.screenshot({path: path.join(outDir, '87-photo-board-phone.png')});
log('スマホの幅（一覧の下にプレビュー・縮めて出す・はみ出さない）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
assert.deepEqual(errors, []);
await browser.close();
