// 見積作成モードを確かめる：定価×0.8・切って使う部材の数量（使う長さ÷1本の長さ）・見積の単価の手入力・部材ごとの同上施工費・
// 金額だけの行・一式・見積書の2つの書式（苅田町・行橋用／みやこ町・広域連合用）の印刷・介護保険の対象外・定価の取り込み
// usage: node e2e-estimate.mjs <dist-sasaoka/index.html の URL> <出力フォルダ>
// Playwright はこのリポジトリの依存に入れていない。入っている場所を PLAYWRIGHT で指定できる（既定はクラウド環境の場所）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [url, outDir] = process.argv.slice(2);
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined)); // 一式の名前は最初の案のまま
await page.goto(url);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).waitFor();

// ---------------- 見積作成に切り替え：一覧に見積の金額
await page.getByRole('button', {name: '見積作成', exact: true}).click();
// 玄関：木の手すり 定価20,000（1本4m）を60cm → 0.15本×16,000＝2,400・同上施工費（木2）2,000・ブラケット 2,100×0.8＝1,680×2
// トイレ：L型 11,000×0.8＝8,800・同上施工費（タイル2）3,000・キャップ 450×0.8＝360×2
// 部材 15,280・施工費 5,000・小計 20,280・諸経費 2,028（10%）・消費税 2,230（(20,280＋2,028)×0.1 切り捨て）・合計 24,538
const row = await page.getByRole('row', {name: /（サンプル）山田様邸/}).innerText();
for (const v of ['苅田町・行橋用', '15,280', '5,000', '20,280', '2,028', '2,230', '24,538']) assert.ok(row.includes(v), `見積の一覧に ${v} がない: ${row}`);
log('見積の一覧OK');

await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const box = () => page.getByRole('table', {name: '見積書の金額'}).innerText();
// 上の切り替えは 見積作成 が左。見積書の書式は2つ（苅田町・行橋用／みやこ町・広域連合用）
assert.deepEqual(await page.getByRole('group', {name: '使い方'}).getByRole('button').allInnerTexts(), ['見積作成', '仕切り・請求書']);
const formSelect = page.getByRole('combobox', {name: '見積書の書式'});
const formLabel = page.locator('label', {has: formSelect});
assert.deepEqual(await formSelect.locator('option').allInnerTexts(), ['苅田町・行橋用', 'みやこ町・広域連合用']);
assert.equal(await formSelect.inputValue(), 'yukuhashi'); // 住所がないので設定の書式
assert.ok((await formLabel.innerText()).includes('（設定の書式）'));

// 入力の欄は見積書と同じ順番に並び、Tab でその順に進む：作成日 → お客様名 → 被保険者番号 → 工事場所 → 書式 → 担当、
// 箇所は 改修の種類 → 改修場所 → 写真番号、行は 品名 → 長さ → 数量 → 単価 → 介護保険の対象外 → 定価（備考）
const tabOrder = async (from, until, max = 40) => {
  await from.focus();
  const seen = [];
  for (let i = 0; i < max; i++) {
    // 入力の欄だけを数える（ボタンは飛ばす。日付の欄は年・月・日で何度か止まるので1つにまとめる）
    const name = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e.tagName === 'BUTTON') return '';
      return e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.closest('label')?.innerText.split('\n')[0].trim() || e.tagName;
    });
    if (name && seen[seen.length - 1] !== name) seen.push(name);
    if (name === until) return seen;
    await page.keyboard.press('Tab');
  }
  return seen;
};
const jobOrder = await tabOrder(page.getByRole('textbox', {name: '作成日', exact: true}), '担当');
assert.deepEqual(jobOrder, ['作成日', '例：山田', '敬称', '例：0000366989', '住所', '見積書の書式', '担当'], jobOrder.join(' → '));
const rowOrder = await tabOrder(page.getByRole('combobox', {name: '改修の種類'}).first(), '定価');
assert.deepEqual(
  rowOrder,
  ['改修の種類', '箇所名（玄関など）', '写真番号', '品名', '使う長さ（cm）', '1本の長さ（m）', '木の手すり 35φ 4mの数量', '見積の単価', '介護保険の対象外', '定価'],
  rowOrder.join(' → '),
);
log('入力の順番が見積書と同じOK');
assert.ok((await box()).includes('24,538'));
const places = page.locator('section').filter({has: page.getByPlaceholder('箇所名（玄関など）')});
const genkan = places.nth(0);
const toilet = places.nth(1);
const rowNames = (section) => section.getByRole('textbox', {name: '品名'}).evaluateAll((els) => els.map((e) => e.value));
assert.deepEqual(await rowNames(genkan), ['木の手すり 35φ 4m', '木', 'ブラケット']);
const railRow = genkan.getByRole('row', {name: /木の手すり 35φ 4m/});
assert.ok((await railRow.innerText()).includes('0.15本（60cm÷4m）'), await railRow.innerText());
assert.equal(await railRow.getByRole('textbox', {name: '1本の長さ（m）'}).inputValue(), '4'); // 商品名の「4m」から
assert.equal(await railRow.getByRole('textbox', {name: '見積の単価'}).inputValue(), '16,000');

// 使う長さを 120cm にする → 1.2÷4＝0.3本 → 16,000×0.3＝4,800
await railRow.getByRole('textbox', {name: '使う長さ（cm）'}).fill('120');
await page.waitForTimeout(100);
assert.ok((await railRow.innerText()).includes('0.3本'));
assert.ok((await railRow.innerText()).includes('4,800'));
assert.ok((await box()).includes('27,442'), await box()); // 小計 22,680＋諸経費 2,268＋消費税 2,494
log('切って使う部材の数量OK：120cm÷4m＝0.3本×16,000＝4,800');

// 見積の単価を手で入れる → 黄色・↺ で定価×0.8 に戻る
const bracketRow = genkan.getByRole('row', {name: /ブラケット/});
await bracketRow.getByRole('textbox', {name: '見積の単価'}).fill('1500');
await page.waitForTimeout(100);
assert.ok((await bracketRow.innerText()).includes('手入力'));
assert.ok((await bracketRow.innerText()).includes('3,000'));
await bracketRow.getByRole('button', {name: '見積の単価を自動に戻す'}).click();
assert.ok((await bracketRow.innerText()).includes('3,360'));
log('見積の単価の手入力と自動に戻すOK');

// ブラケットの施工費（同上施工費）だけを数える：木を1つ → ブラケットのすぐ下に入り、手すりの同上施工費は 2,000 のまま
await bracketRow.getByRole('button', {name: /この部材の施工費/}).click();
await page.getByRole('dialog').getByText('「ブラケット」の施工費').waitFor();
await page.getByRole('button', {name: '木の箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();
const works = await genkan.locator('tr', {hasText: '同上施工費（見積書ではこの1行）'}).allInnerTexts();
assert.equal(works.length, 2, works.join('|'));
assert.ok(works[0].includes('2,000') && works[1].includes('1,000'), works.join('|'));
log('部材ごとの同上施工費OK', works.map((w) => w.replace(/\s+/g, ' ')));

// 金額だけの行（部材・工事）：名前なしで金額を入れるとすぐ合計に入る
// 足した行の金額の欄にすぐ入力できる（入力欄が選ばれてから打つ）
const focusedPrice = () => page.waitForFunction(() => /単価/.test(document.activeElement?.getAttribute('aria-label') ?? '')).then(() => page.waitForTimeout(50));
await genkan.getByRole('button', {name: '＋ 部材を金額だけ入れる'}).click();
await focusedPrice();
await page.keyboard.type('5000');
await genkan.getByRole('button', {name: '＋ 工事を金額だけ入れる'}).click();
await focusedPrice();
await page.keyboard.type('3000');
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
// 小計 22,680＋1,000（ブラケットの施工費）＋5,000＋3,000＝31,680 → 諸経費 3,168 → 消費税 3,484 → 38,332
assert.ok((await box()).includes('38,332'), await box());
log('金額だけの行OK');

// 一式：サンプルの一式をトイレに入れる → この箇所を一式に登録 → 一式が2つ
await toilet.getByRole('button', {name: '＋ 一式から入れる'}).click();
assert.equal(await page.getByRole('dialog').getByRole('textbox', {name: '一式の名前'}).inputValue(), '（サンプル）I型手すり一式（木の下地）');
await page.getByRole('dialog').getByRole('button', {name: '＋ 入れる'}).click();
assert.deepEqual(await rowNames(toilet), ['L型手すり', 'タイル', 'エンドキャップ', '木の手すり 35φ 4m', '木', 'ブラケット', 'エンドキャップ']);
await genkan.getByRole('button', {name: 'この箇所を一式に登録'}).click();
await toilet.getByRole('button', {name: '＋ 一式から入れる'}).click();
assert.equal(await page.getByRole('dialog').getByRole('button', {name: '＋ 入れる'}).count(), 2);
await page.screenshot({path: path.join(outDir, '31-kits.png')});
await page.getByRole('dialog').getByRole('button', {name: '閉じる'}).first().click();
log('一式を入れる・登録するOK');
await page.screenshot({path: path.join(outDir, '32-estimate-editor.png'), fullPage: true});

// 見積書の印刷（住所がないので設定の書式＝苅田町・行橋用「工事費見積書兼工事費内訳書」）
await page.getByPlaceholder('例：0000366989').fill('0000366989');
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const sheet = page.locator('.print-root .form-page').first();
const doc = await sheet.innerText();
for (const t of [
  '①　工事費見積書兼工事費内訳書',
  '（サンプル）山田',
  '介護保険被保険者番号（0000366989）',
  '定価2,100円×0.8', // 備考は「定価○円×0.8」（ブラケット）
  '定価20,000円×0.8', // 切って使う手すりの備考：1行目に定価×0.8、2行目に mm で長さの計算
  '1200÷4000＝0.3',
  '同上施工費',
  '代表者名　行橋営業所所長　久保 匠史',
  '担当： 久保 匠史　0930-26-9640', // 見積書の担当はフルネーム
  '玄関①',
  'トイレ②',
  'ページ　1　／　1',
]) {
  assert.ok(doc.includes(t), `見積書に「${t}」がない`);
}
// 手すりの行：数量 0.3・単位 本・単価 16,000・金額 4,800（介護保険対象部分も同じ）
const railLine = await sheet.locator('tr', {hasText: '木の手すり 35φ 4m'}).first().locator('td').allInnerTexts();
assert.deepEqual(railLine.slice(3, 11), ['0.3', '本', '16,000', '4,800', '0.3', '本', '16,000', '4,800'], railLine.join('|'));
// 最後の4行（一式でトイレに 22,080円 足したあと）：小計 53,760・諸経費 5,376・消費税 5,913・合計 65,049（全体と介護保険の対象）
const totalLine = async (label) => (await sheet.locator('tr', {hasText: label}).last().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(await totalLine('小計'), ['小計', '53,760', '53,760']);
assert.deepEqual(await totalLine('合計'), ['合計', '65,049', '65,049']);
await page.getByRole('button', {name: '✕ 閉じる'}).click();

// 諸経費を手で直す（端数の調整）→ 見積書の諸経費・消費税・合計が変わる。↺ で 小計×10% に戻る
const overhead = page.getByRole('textbox', {name: '諸経費', exact: true});
await overhead.click();
await page.waitForTimeout(100); // 入力欄が「5,376」→「5376」に変わってから打つ
await overhead.press('ControlOrMeta+A');
await page.keyboard.type('5000');
await page.keyboard.press('Tab');
// 53,760＋5,000＝58,760 → 消費税 5,876 → 合計 64,636
assert.ok((await box()).includes('64,636'), await box());
assert.ok((await page.locator('aside').innerText()).includes('手入力（自動なら 5,376）'));
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
assert.deepEqual(await totalLine('諸経費'), ['諸経費', '5,000', '5,000']);
assert.deepEqual(await totalLine('合計'), ['合計', '64,636', '64,636']);
await page.screenshot({path: path.join(outDir, '33-estimate-print.png')});
await page.emulateMedia({media: 'print'});
await page.pdf({path: path.join(outDir, 'estimate-yukuhashi.pdf'), printBackground: true, preferCSSPageSize: true});
await page.emulateMedia({media: 'screen'});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await page.getByRole('button', {name: '諸経費を自動に戻す'}).click();
assert.ok((await box()).includes('65,049'), await box());
log('見積書（苅田町・行橋用）の印刷・諸経費の手入力OK');

// ブラケットを介護保険の対象外にする → 部材 3,360 と同上施工費 1,000 が対象外。金額の欄に「介護保険の対象」が出る
await genkan.getByRole('row', {name: /ブラケット/}).getByLabel('介護保険の対象外').check();
await page.waitForTimeout(100);
// 対象：53,760−4,360＝49,400 → 諸経費 4,940 → 消費税 5,434 → 合計 59,774
assert.ok((await box()).includes('59,774'), await box());
assert.ok((await page.locator('aside').innerText()).includes('介護保険の対象外：4,360円'));
log('介護保険の対象外OK');

// みやこ町・広域連合用：住所の市町村で書式が変わる。施工費は「時間×2,500円」、写真番号・改修の種類を出す
await page.getByRole('textbox', {name: '住所', exact: true}).fill('福岡県京都郡みやこ町豊津');
await toilet.getByRole('textbox', {name: '写真番号'}).fill('5');
await toilet.getByRole('combobox', {name: '改修の種類'}).selectOption('5');
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const kk = page.locator('.print-root .form-page').first();
const kdoc = await page.locator('.print-root').innerText(); // すべてのページ
for (const t of ['内訳書　様式', '全改修工事部分', '対象工事部分', '1時間2,500円', '福岡県介護保険広域連合', '定価20,000円×0.8', '定価11,000円×0.8', 'トイレ\t便器取替\t材']) {
  assert.ok(kdoc.includes(t), `広域連合の書式に「${t}」がない`);
}
// 木 2箇所＝2,000円 → 0.8時間×2,500円
const woodLine = (await kk.locator('tr', {hasText: '同上施工費'}).first().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(woodLine.slice(0, 5), ['手', '同上施工費', '0.8', '時間', '2,500'], woodLine.join('|'));
// 対象外のブラケット：全改修工事部分だけに金額があり、対象工事部分は空
const bk = (await kk.locator('tr', {hasText: 'ブラケット'}).first().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(bk.slice(2), ['2', '個', '1,680', '3,360'], bk.join('|'));
// 1ページ14行：明細13行のあとに合計の4行が入らないので、トイレ（7行）を2ページ目に送り、合計はその下4行
assert.equal(await page.locator('.print-root .form-page').count(), 2);
assert.ok((await page.locator('.print-root .form-page').last().innerText()).includes('トイレ\t便器取替'));
// 1つの見積書の中で Ｐ－1・Ｐ－2 と続く
assert.ok((await page.locator('.print-root .form-page').first().innerText()).includes('Ｐ－1'));
assert.ok((await page.locator('.print-root .form-page').last().innerText()).includes('Ｐ－2'));
const kLast = page.locator('.print-root .form-page').last();
const kTotal = (await kLast.locator('tr', {hasText: '合計'}).last().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(kTotal, ['合計', '65,049', '59,774']);
assert.ok(kdoc.includes('⑤'), '写真番号⑤・改修の種類⑤がない');
await page.screenshot({path: path.join(outDir, '34-estimate-kouiki.png')});
await page.emulateMedia({media: 'print'});
await page.pdf({path: path.join(outDir, 'estimate-kouiki.pdf'), printBackground: true, preferCSSPageSize: true});
await page.emulateMedia({media: 'screen'});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見積書（みやこ町・広域連合用）の印刷OK');

// 書式を選び直す：苅田町・行橋用を選ぶとその書式に。住所で決まる方（みやこ町・広域連合用）を選び直すと、住所に合わせて変わるままに戻る
assert.equal(await formSelect.inputValue(), 'kouiki');
assert.ok((await formLabel.innerText()).includes('（住所の市町村から）'));
await formSelect.selectOption({label: '苅田町・行橋用'});
assert.ok((await formLabel.innerText()).includes('（この様邸で選んだ書式）'));
assert.ok((await page.getByRole('region', {name: '見積書のでき上がり'}).innerText()).includes('工事費見積書兼工事費内訳書'));
await formSelect.selectOption({label: 'みやこ町・広域連合用'});
assert.ok((await formLabel.innerText()).includes('（住所の市町村から）'));
log('書式は2つから選び直せるOK');

// ---------------- 右に映す見積書：左で入れるとすぐに入る。欄をクリックすると、その欄を打ち直せる
const preview = page.getByRole('region', {name: '見積書のでき上がり'});
const editor = page.getByRole('dialog');
assert.equal(await preview.locator('.form-page').count(), 2); // 印刷と同じく Ｐ－1・Ｐ－2
assert.ok((await preview.innerText()).includes('内訳書　様式'));
await toilet.getByPlaceholder('箇所名（玄関など）').fill('トイレ（1階）');
await page.waitForTimeout(100);
assert.ok((await preview.innerText()).includes('トイレ（1階）'), '左で入れた箇所名が右の見積書に入らない');
await toilet.getByPlaceholder('箇所名（玄関など）').fill('トイレ');
log('左で入れると右の見積書に入るOK');

// 改修内容・工事名称は改修の種類だけで決まる（別に入れる欄はない）。見積書の工事名称の欄をクリックすると改修の種類を選び直せる
assert.equal(await page.getByRole('textbox', {name: '工事名称'}).count(), 0);
await preview.locator('[data-edit$=":work"]').first().click();
await editor.getByRole('combobox', {name: '改修の種類'}).selectOption('2');
await editor.getByRole('combobox', {name: '改修の種類'}).press('Enter');
await editor.waitFor({state: 'detached'});
assert.equal(await genkan.getByRole('combobox', {name: '改修の種類'}).inputValue(), '2');
assert.ok((await preview.locator('tr', {hasText: '玄関'}).first().innerText()).includes('段差解消'));
await genkan.getByRole('combobox', {name: '改修の種類'}).selectOption('1');
assert.ok((await preview.locator('tr', {hasText: '玄関'}).first().innerText()).includes('手すり取付'));
log('改修内容は改修の種類だけで決まるOK');

// 単価の欄をクリックして直す → 左の「見積の単価」も手入力になり、その行に色が付く。↺ で 定価×0.8 に戻る
const lLine = preview.locator('tr', {hasText: 'L型手すり'}).first();
await lLine.locator('[data-edit$=":price"]').first().click();
await editor.getByRole('textbox', {name: '見積の単価'}).fill('8000');
await editor.getByRole('textbox', {name: '見積の単価'}).press('Enter');
await editor.waitFor({state: 'detached'});
const lRow = toilet.getByRole('row', {name: /L型手すり/});
assert.equal(await lRow.getByRole('textbox', {name: '見積の単価'}).inputValue(), '8,000');
assert.ok((await lRow.innerText()).includes('手入力'));
assert.equal(await toilet.locator('tr.row-active').getByRole('textbox', {name: '品名'}).inputValue(), 'L型手すり');
assert.ok((await lLine.innerText()).includes('8,000'));
// 全体：53,760−800＝52,960 → 諸経費 5,296 → 消費税 5,825 → 合計 64,081（対象：48,600 → 58,806）
assert.ok((await box()).includes('64,081') && (await box()).includes('58,806'), await box());
await lLine.locator('[data-edit$=":price"]').first().click();
await editor.getByRole('button', {name: '↺ 定価×0.8（8,800円）に戻す'}).click();
assert.ok((await box()).includes('65,049'), await box());
log('右の見積書で単価を直すOK');

// 内容（品名）は見積書だけ直せる：左に「見積書の内容」と出て、部材の品名はそのまま。Tab で次の欄（数量）へ
await lLine.locator('[data-edit$=":text"]').click();
await editor.getByRole('textbox', {name: '内容'}).fill('L型手すり（トイレ用）');
await editor.getByRole('textbox', {name: '内容'}).press('Tab');
await page.waitForFunction(() => /^数量：/.test(document.querySelector('[role=dialog]')?.getAttribute('aria-label') ?? ''));
await page.keyboard.press('Escape');
await editor.waitFor({state: 'detached'});
assert.ok((await preview.innerText()).includes('L型手すり（トイレ用）'));
assert.ok((await lRow.innerText()).includes('見積書の内容'), await lRow.innerText());
assert.equal(await lRow.getByRole('textbox', {name: '品名'}).inputValue(), 'L型手すり');
log('内容を見積書だけ直す・Tab で次の欄OK');

// 施工費は時間で直せる（この書式は 時間×2,500円）：木 2箇所＝0.8時間 → 1時間＝2,500円。左に「見積書で手入力」
const wood = preview.locator('tr', {hasText: '同上施工費'}).first();
await wood.locator('[data-edit$=":qty"]').click();
await editor.getByRole('textbox', {name: '時間'}).fill('1');
await editor.getByRole('textbox', {name: '時間'}).press('Enter');
await editor.waitFor({state: 'detached'});
const woodTds = (await wood.locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(woodTds.slice(0, 6), ['手', '同上施工費', '1', '時間', '2,500', '2,500'], woodTds.join('|'));
// 53,760＋500＝54,260 → 諸経費 5,426 → 消費税 5,968 → 合計 65,654
assert.ok((await box()).includes('65,654'), await box());
assert.ok((await genkan.innerText()).includes('見積書で手入力（取付手間の合計は 2,000）'));
await genkan.getByRole('button', {name: '施工費の金額を取付手間の合計に戻す'}).click();
assert.ok((await box()).includes('65,049'), await box());
log('施工費を時間で直すOK');

// 諸経費も右の見積書で直せる。Esc ならやめる
await preview.locator('[data-edit="overhead:all"]').first().click();
await editor.getByRole('textbox', {name: '諸経費'}).fill('1');
await editor.getByRole('textbox', {name: '諸経費'}).press('Escape');
assert.ok((await box()).includes('65,049'), await box());
await preview.locator('[data-edit="overhead:all"]').first().click();
await editor.getByRole('textbox', {name: '諸経費'}).fill('6000');
await editor.getByRole('textbox', {name: '諸経費'}).press('Enter');
// 53,760＋6,000＝59,760 → 消費税 5,976 → 合計 65,736
assert.ok((await box()).includes('65,736'), await box());
assert.ok((await page.locator('aside').innerText()).includes('手入力（自動なら 5,376）'));
await page.getByRole('button', {name: '諸経費を自動に戻す'}).click();
log('右の見積書で諸経費を直す・Esc でやめるOK');

// 住所を消すと苅田町・行橋用に戻る。作成日を右の見積書で直す → 印刷の作成日も同じ。直した内容も印刷に入る
await page.getByRole('textbox', {name: '住所', exact: true}).fill('');
await preview.locator('.form-page', {hasText: '工事費見積書兼工事費内訳書'}).waitFor();
await preview.locator('[data-edit="date"]').click();
await editor.getByLabel('作成日').fill('2026-10-01');
await editor.getByLabel('作成日').press('Enter');
assert.ok((await preview.innerText()).includes('令和8年10月1日'));
assert.equal(await page.getByRole('textbox', {name: '作成日', exact: true}).inputValue(), '2026-10-01'); // 左の作成日の欄も同じ日
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const printed = await page.locator('.print-root').innerText();
assert.ok(printed.includes('令和8年10月1日') && printed.includes('L型手すり（トイレ用）'), printed);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await page.screenshot({path: path.join(outDir, '35-estimate-preview.png')});
await lRow.getByRole('button', {name: '見積書の内容を元に戻す'}).click();
assert.ok(!(await preview.innerText()).includes('L型手すり（トイレ用）'));

// 拡大（印刷と同じ大きさ・横に動かす）と、隠す／映す
await preview.getByRole('button', {name: '🔍 拡大'}).click();
const [sw, cw] = await preview.locator('.est-preview').evaluate((e) => [e.scrollWidth, e.clientWidth]);
assert.ok(sw > cw + 100, `拡大していない ${sw} ${cw}`);
await preview.getByRole('button', {name: '全体を見る'}).click();
await preview.getByRole('button', {name: '隠す'}).click();
await page.getByRole('button', {name: '📄 見積書を映しながら入力する'}).click();
await preview.waitFor();
log('作成日・印刷・拡大・隠すOK');

// 同じ箇所を写真番号ごとに別々に入れる：「玄関」をもう1つ → すぐ下に空の玄関（写真番号は次の番号）。見積書では 玄関①・玄関②（トイレは手で⑤にしてある）
await genkan.getByRole('button', {name: '＋ 「玄関」をもう1つ（次の写真番号）'}).click();
const genkan2 = places.nth(1);
assert.equal(await genkan2.getByPlaceholder('箇所名（玄関など）').inputValue(), '玄関');
await genkan2.getByRole('button', {name: '＋ 部材を金額だけ入れる'}).click();
await focusedPrice();
await page.keyboard.type('1000');
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
const sameText = await preview.innerText();
assert.ok(sameText.includes('玄関①') && sameText.includes('玄関②') && sameText.includes('トイレ⑤'), sameText);
// 箇所の候補の「玄関」も、使ってあっても押せる（もう1つ足す）
await page.getByRole('button', {name: '玄関', exact: true}).click();
assert.equal(await places.count(), 4);
await places.nth(3).getByTitle('この箇所を削除').click(); // 行のない箇所はそのまま消える
await genkan2.getByTitle('この箇所を削除').click(); // 行のある箇所は確かめてから消す（ダイアログは自動で OK）
assert.equal(await places.count(), 2);
assert.ok((await box()).includes('65,049'), await box());
log('同じ箇所を写真番号ごとに別々に入れるOK');

// 仕切り・請求書に戻すと、仕切り計算表の金額は見積の操作で変わっていない（長さ・見積の単価は仕切りに関係しない）
await page.getByRole('button', {name: '仕切り・請求書', exact: true}).click();
const shikiri = await page.locator('aside table').innerText();
// 部材は 10,000＋3,000＋5,000（金額だけの行は見積の単価に入れたので仕切りは0）… 玄関の部材は 13,000 のまま
assert.ok(shikiri.includes('部材代合計'), shikiri);
log('仕切りに戻せるOK');

// ---------------- 定価の取り込み：Excel の「定価」の列も読む
await page.getByRole('navigation').getByRole('button', {name: /部材リスト/}).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
await page.locator('[role=dialog] input[type=file]').setInputFiles(path.join(FIX, 'maker-list.xlsx'));
await page.getByRole('button', {name: '部材リストに取り込む（5件）'}).click();
const bp = page.getByRole('row', {name: /手すり I型 600mm/});
assert.equal(await bp.getByRole('textbox', {name: '定価'}).inputValue(), '4,800');
assert.equal(await bp.getByRole('textbox', {name: '仕切価格'}).inputValue(), '3,360');
log('定価の取り込みOK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
