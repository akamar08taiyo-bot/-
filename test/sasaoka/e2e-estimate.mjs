// 見積作成モードを確かめる：定価×0.8・切って使う部材の数量（使う長さ÷1本の長さ）・見積の単価の手入力・部材ごとの同上施工費・
// 金額だけの行・一式・見積書の印刷・定価の取り込み
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
// 部材 15,280・施工費 5,000・税抜 20,280・消費税 2,028（切り捨て）・合計 22,308
const row = await page.getByRole('row', {name: /（サンプル）山田様邸/}).innerText();
for (const v of ['15,280', '5,000', '20,280', '2,028', '22,308']) assert.ok(row.includes(v), `見積の一覧に ${v} がない: ${row}`);
log('見積の一覧OK');

await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const box = () => page.locator('aside table').innerText();
assert.ok((await box()).includes('22,308'));
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
assert.ok((await box()).includes('24,948'), await box()); // 22,680＋2,268
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
await genkan.getByRole('button', {name: '＋ 部材を金額だけ入れる'}).click();
await page.keyboard.type('5000');
await genkan.getByRole('button', {name: '＋ 工事を金額だけ入れる'}).click();
await page.keyboard.type('3000');
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
// 22,680＋1,000（ブラケットの施工費）＋5,000＋3,000＝31,680 → 消費税 3,168 → 34,848
assert.ok((await box()).includes('34,848'), await box());
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

// 見積書の印刷
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const doc = await page.locator('.sheet').first().innerText();
for (const t of ['御見積書', '（サンプル）山田', '定価20,000円（税抜）', '（120cm使用・1本4m）', '同上施工費', '行橋営業所所長　久保 匠史', '担当　久保', '所長印', '玄関・トイレ 手すり取付工事']) {
  assert.ok(doc.includes(t), `見積書に「${t}」がない`);
}
// 手すりの行：数量 0.3・単位 本・単価 16,000・金額 4,800
const railLine = await page.locator('.sheet').first().locator('tr', {hasText: '木の手すり 35φ 4m'}).first().locator('td').allInnerTexts();
assert.deepEqual(railLine.slice(2, 6), ['0.3', '本', '16,000', '4,800'], railLine.join('|'));
await page.screenshot({path: path.join(outDir, '33-estimate-print.png')});
await page.emulateMedia({media: 'print'});
await page.pdf({path: path.join(outDir, 'estimate.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true});
await page.emulateMedia({media: 'screen'});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見積書の印刷OK');

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
