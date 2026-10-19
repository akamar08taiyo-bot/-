// 見積書に直接入力（Excel のように欄を選んで打ち込む）を確かめる：
// 新しい様邸を見積書の形のまま打ち込む（お客様名・改修内容・改修場所・内容の候補（★お気に入り）・数量 60cm・同上施工費・備考に定価）→
// 合計・元に戻す・行の挿入／移動／削除・介護保険の対象外・諸経費・作成日・仕切価格を入れる・広域連合用（材／手・時間）・仕切り計算表とのつながり
// usage: node e2e-sheet.mjs <dist-sasaoka/index.html の URL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [url, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.getByRole('button', {name: /サンプルで試す/}).click(); // 部材リスト（★お気に入り）と取付手間の単価
await page.getByRole('button', {name: '見積作成', exact: true}).click();
await page.getByRole('button', {name: '＋ 様邸を追加'}).click();

const sheet = page.getByRole('region', {name: '見積書に直接入力'});
await sheet.waitFor();
const input = sheet.locator('textarea.sheet-input');
const cell = (key) => sheet.locator(`[data-edit="${key}"]`).first();
const selected = () => input.getAttribute('aria-label');
const bar = () => sheet.getByLabel('選んでいる欄の値').innerText();
const tds = async (text) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const totals = async () => (await tds('合計')).filter(Boolean);
const key = async (text, field) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator(`[data-edit$=":${field}"]`).first().getAttribute('data-edit'));
const typeIn = async (k, text, end = 'Enter') => {
  await cell(k).click();
  await page.keyboard.type(text);
  if (end) await page.keyboard.press(end);
  await page.waitForTimeout(60);
};

// ---------------- 新しい様邸：お客様名の欄が選ばれていて、そのまま打ち込める
assert.equal(await page.getByRole('group', {name: '入力のしかた'}).getByRole('button', {pressed: true}).innerText(), '📝 見積書に直接入力（Excel のように）');
assert.equal(await selected(), 'お客様名');
await page.keyboard.type('見本 太郎');
await page.keyboard.press('Enter');
assert.ok((await page.getByRole('heading', {level: 1}).innerText()).includes('見本 太郎様邸'));
log('お客様名を見積書の欄に打ち込むOK');

// ---------------- いちばん下の行：改修内容 → 改修場所 → 内容（候補から） → 数量（60cm）
await cell('new:work').click();
await page.keyboard.type('1');
await page.keyboard.press('Tab');
assert.equal(await selected(), '改修場所（箇所名）');
await page.keyboard.type('浴室');
await page.keyboard.press('Tab');
assert.equal(await selected(), '内容（品名）');
await page.keyboard.type('手すり');
const options = page.getByRole('listbox', {name: '候補'}).getByRole('option');
assert.deepEqual(await options.allInnerTexts().then((t) => t.map((x) => x.split('\n')[0])), ['★ L型手すり', '★ 木の手すり 35φ 4m']); // ★お気に入りが先・名前順
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Tab'); // 選んで右（数量）へ
assert.equal(await selected(), '数量');
await page.keyboard.type('60cm');
await page.keyboard.press('Enter');
await page.screenshot({path: path.join(outDir, '40-sheet-first.png')});
let rail = await tds('木の手すり 35φ 4m');
assert.deepEqual(rail.slice(0, 7), ['手すりの取付', '浴室①', 'サンプル S-TS35 木の手すり 35φ 4m', '0.15', '本', '16,000', '2,400'], rail.join('|'));
assert.ok(rail[12].includes('定価20,000円（4m）×0.8') && rail[12].includes('600÷4000＝0.15'), rail[12]);
log('改修内容・改修場所・内容（候補から）・数量 60cm＝0.15本OK');

// ---------------- 同上施工費：内容に打って、単価に金額
await typeIn('new:text', '同上施工費', 'Tab');
assert.equal(await selected(), '単価');
await page.keyboard.type('2000');
await page.keyboard.press('Enter');
assert.deepEqual((await tds('同上施工費')).slice(2, 7), ['同上施工費', '1', '式', '2,000', '2,000']);
log('同上施工費を打ち込むOK');

// ---------------- リストにない部材：内容・数量・単位を打ち、備考に定価 → 単価は 定価×0.8
await typeIn('new:text', '手すりカバー', 'Tab');
await page.keyboard.type('2');
await page.keyboard.press('Tab');
await page.keyboard.type('個');
await page.keyboard.press('Enter');
await typeIn(await key('手すりカバー', 'note'), '3000');
let cover = await tds('手すりカバー');
assert.deepEqual(cover.slice(2, 7), ['手すりカバー', '2', '個', '2,400', '4,800'], cover.join('|'));
assert.equal(cover[12], '定価3,000円（税抜）×0.8');
// 2,400＋2,000＋4,800＝9,200 → 諸経費 920 → 消費税 1,012 → 合計 11,132
assert.deepEqual(await totals(), ['合計', '11,132', '11,132']);
log('備考に定価を入れると単価が 定価×0.8 になるOK');

// ---------------- Ctrl+Z で元に戻す・Ctrl+Y でやり直す
await page.keyboard.press('ControlOrMeta+z');
assert.equal((await tds('手すりカバー'))[6], '0');
await page.keyboard.press('ControlOrMeta+y');
assert.deepEqual(await totals(), ['合計', '11,132', '11,132']);
log('元に戻す・やり直すOK');

// ---------------- F2 で書き直す・Esc でやめる・Delete で消す
await cell(await key('手すりカバー', 'qty')).click();
await page.keyboard.press('F2');
assert.equal(await input.inputValue(), '2');
await page.keyboard.press('End');
await page.keyboard.type('0');
await page.keyboard.press('Escape');
assert.equal((await tds('手すりカバー'))[3], '2');
await page.keyboard.press('Delete');
assert.equal((await tds('手すりカバー'))[3], '0');
await page.keyboard.press('ControlOrMeta+z');
assert.equal((await tds('手すりカバー'))[3], '2');
log('F2・Esc・Delete OK');

// ---------------- 空いた行を押すと、打ち込める行の同じ列が選ばれる。改修場所を打つと箇所が増える（写真番号は次の番号）
await sheet.locator('.form-page tr[data-blank]').nth(3).locator('td').nth(1).click();
assert.equal(await selected(), '改修場所（箇所名）');
await page.keyboard.type('トイレ');
await page.keyboard.press('Tab');
await page.keyboard.type('L型');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
assert.deepEqual((await tds('L型手すり')).slice(0, 7), ['手すりの取付', 'トイレ②', 'サンプル S-TL01 L型手すり', '1', '本', '8,800', '8,800']);
log('空いた行・新しい箇所OK');

// ---------------- ツールバー：下に1行入れる → 打ち込む／上へ／介護保険の対象外（スペース）／消す
await cell(await key('L型手すり', 'text')).click();
await sheet.getByRole('button', {name: '↓ 下に1行入れる'}).click();
assert.equal(await selected(), '内容（品名）');
await page.keyboard.type('エンド');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
const order = async () =>
  (await sheet.locator('.form-page tr', {has: page.locator('[data-edit$=":text"]')}).allInnerTexts()).map((t) => t.split('\t')[2]?.trim()).filter(Boolean);
assert.deepEqual((await order()).slice(-2), ['サンプル S-TL01 L型手すり', 'サンプル S-EC01 エンドキャップ']);
await cell(await key('エンドキャップ', 'text')).click();
await sheet.getByRole('button', {name: '▲ 上へ'}).click();
assert.deepEqual((await order()).slice(-2), ['サンプル S-EC01 エンドキャップ', 'サンプル S-TL01 L型手すり']);
// 対象外金額の欄でスペース → 介護保険の対象外
await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit^="excl:"]').last().click();
await page.keyboard.press(' ');
const lt = await tds('L型手すり');
assert.deepEqual([lt[7], lt[10], lt[11]], ['', '', '8,800'], lt.join('|'));
assert.equal(await sheet.getByLabel('介護保険の対象外').isChecked(), true);
await cell(await key('手すりカバー', 'text')).click();
await sheet.getByRole('button', {name: 'この部材（と同上施工費）を消す'}).click();
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すりカバー'}).count(), 0);
log('下に1行・上へ・対象外・消すOK');

// ---------------- 諸経費・作成日・工事場所（見積書の欄）
await typeIn('overhead:all', '1000');
assert.equal((await tds('諸経費')).filter(Boolean)[1], '1,000');
await typeIn('date', '2026/10/1');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('令和8年10月1日'));
log('諸経費・作成日OK');

// ---------------- 打ち込んでいる途中で見積書の外の欄を押す → 打った値が入り、その欄で打てる（Excel と同じ）
await cell('new:text').click();
await page.keyboard.type('手すり受け');
const memo = page.locator('label', {hasText: '備考（任意・明細に印刷されます）'}).locator('input');
await memo.click();
await page.keyboard.type('メモ');
assert.equal(await memo.inputValue(), 'メモ');
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すり受け'}).count(), 1);
await cell(await key('手すり受け', 'text')).click();
await sheet.getByRole('button', {name: 'この部材（と同上施工費）を消す'}).click();
log('見積書の外を押すと打った値が入るOK');

// ---------------- 請求書に入る金額：仕切価格のない部材を知らせ、その場で入れられる
await typeIn('new:text', '取付金具', 'Tab');
await page.keyboard.press('Enter');
const link = page.getByRole('region', {name: '請求書に入る金額'});
assert.ok((await link.innerText()).includes('仕切価格が入っていない部材が 1 行'), await link.innerText());
await link.getByRole('button', {name: '仕切価格を入れる'}).click();
await page.getByRole('dialog').getByRole('textbox', {name: '取付金具の仕切価格'}).fill('300');
await page.getByRole('dialog').getByRole('button', {name: '閉じる'}).first().click();
// 部材代：木の手すり 10,000＋L型 7,800＋エンドキャップ 300＋取付金具 300＝18,400、取付手間 2,000
const linkText = await link.innerText();
assert.ok(linkText.includes('①部材代 18,400') && linkText.includes('②取付手間 2,000') && !linkText.includes('仕切価格が入っていない'), linkText);
log('請求書に入る金額・仕切価格を入れるOK');

// ---------------- 工事場所をみやこ町にすると広域連合用。材／手を「手」にすると施工費（数量は時間）
await typeIn('job:address', '福岡県京都郡みやこ町豊津');
await sheet.locator('.form-page', {hasText: '内訳書　様式'}).first().waitFor();
await cell('new:mark').click();
await page.keyboard.press(' ');
assert.equal((await cell('new:mark').innerText()).trim(), '手');
await typeIn('new:qty', '1.2');
// 部材（取付金具）のすぐ下なので同上施工費。1.2時間×2,500円＝3,000円
const hours = (await sheet.locator('.form-page tr:not([data-new])', {has: page.locator('td.mark', {hasText: '手'})}).last().locator('td').allInnerTexts()).map((t) => t.trim());
assert.deepEqual(hours.slice(2, 9).filter((t) => t !== ''), ['手', '同上施工費', '1.2', '時間', '2,500', '3,000'], hours.join('|'));
await page.screenshot({path: path.join(outDir, '41-sheet-kouiki.png')});
log('広域連合用：材／手・時間OK');

// ---------------- 仕切り計算表・請求書は同じ入力から（仕切り・請求書に切り替えて見る）
await link.getByRole('button', {name: '仕切り計算表・請求書を見る →'}).click();
const shikiri = await page.locator('aside table').innerText();
assert.ok(shikiri.includes('部材代合計') && shikiri.includes('18,400') && shikiri.includes('5,000'), shikiri); // 取付手間 2,000＋3,000
log('仕切り計算表につながるOK');

// ---------------- 項目ごとに入力に切り替えても同じ内容
await page.getByRole('button', {name: '見積作成', exact: true}).click();
await page.getByRole('button', {name: '🗂 項目ごとに入力'}).click();
assert.ok((await page.locator('input[placeholder="箇所名（玄関など）"]').first().inputValue()) === '浴室');
await page.getByRole('button', {name: '📝 見積書に直接入力（Excel のように）'}).click();
await sheet.waitFor();
log('入力のしかたの切り替えOK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
