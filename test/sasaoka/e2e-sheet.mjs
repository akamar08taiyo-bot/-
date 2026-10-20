// 住宅改修 見積書作成：見積書の欄に打ち込む（Excel のように欄を選んで打ち込む）を確かめる：
// 新しい見積書を見積書の形のまま打ち込む（お客様名・改修内容・改修場所・内容の候補（★お気に入り）・数量 60cm・同上施工費・備考に定価）→
// 合計・元に戻す・行の挿入／削除／コピー→貼付（行の左の＋・✕・コピー、Ctrl+C／X／V、Ctrl+Shift+＋／Ctrl+－）・改修場所の候補（▼・Alt+↓）・
// 介護保険の対象外・諸経費・作成日・笹岡工務店の請求書に入れる（仕切価格を入れる）・
// 広域連合用（材／手・時間）・「請求書を確認する」とのつながり
// usage: node e2e-sheet.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html と <サイト>/sasaoka/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(site).origin}); // 行のコピー（Ctrl+C／Ctrl+V）
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click(); // 部材リスト（★お気に入り）と取付手間の単価
await page.getByRole('button', {name: '＋ 行橋市', exact: true}).click(); // 保険者（苅田町・行橋市・みやこ町は同じ書式）

const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const input = sheet.locator('textarea.sheet-input');
const cell = (key) => sheet.locator(`[data-edit="${key}"]`).first();
const selected = () => input.getAttribute('aria-label');
const bar = () => sheet.getByLabel('選んでいる欄の値').innerText();
const tds = async (text) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const totals = async () => (await tds('合計')).filter(Boolean);
const key = async (text, field) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator(`[data-edit$=":${field}"]`).first().getAttribute('data-edit'));
const undoKey = () => page.keyboard.press('ControlOrMeta+z'); // 元に戻すのボタンは置かない（Ctrl+Z だけ）
const typeIn = async (k, text, end = 'Enter') => {
  await cell(k).click();
  await page.keyboard.type(text);
  if (end) await page.keyboard.press(end);
  await page.waitForTimeout(60);
};

// ---------------- 画面に「直接入力」などの文言・説明、元に戻す／やり直すのボタンは出さない（ユーザーの指示）
const mainText = await page.locator('main').innerText();
assert.ok(!/直接入力|直接打ち込|Excel と同じように|請求書に入る金額|申請書を出す先/.test(mainText), mainText.slice(0, 400));
assert.equal(await page.getByRole('button', {name: /元に戻す|やり直す/}).count(), 0);
log('文言・説明・元に戻す／やり直すのボタンなしOK');

// ---------------- 新しい見積書：お客様名の欄が選ばれていて、そのまま打ち込める
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
assert.deepEqual(rail.slice(0, 7), ['手すりの取付', '①浴室', 'サンプル S-TS35 木の手すり 35φ 4m', '0.15', '本', '16,000', '2,400'], rail.join('|'));
assert.ok(rail[12].includes('定価20,000円（4m）×0.8') && rail[12].includes('600mm÷4000mm＝0.15'), rail[12]);
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
assert.deepEqual((await tds('L型手すり')).slice(0, 7), ['手すりの取付', '②トイレ', 'サンプル S-TL01 L型手すり', '1', '本', '8,800', '8,800']);
log('空いた行・新しい箇所OK');

// ---------------- 行の左の「＋」：下に1行入れる → 打ち込む／介護保険の対象外（スペース）／行の左の「✕」で消す
await sheet.getByRole('button', {name: 'サンプル S-TL01 L型手すりの行の下に1行入れる'}).click();
assert.equal(await selected(), '内容（品名）');
await page.keyboard.type('エンド');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
const order = async () =>
  (await sheet.locator('.form-page tr', {has: page.locator('[data-edit$=":text"]')}).allInnerTexts()).map((t) => t.split('\t')[2]?.trim()).filter(Boolean);
assert.deepEqual((await order()).slice(-2), ['サンプル S-TL01 L型手すり', 'サンプル S-EC01 エンドキャップ']);
// 行を動かすボタン・介護保険の対象外のチェック・下に1行入れる・この行を消す はツールバーに出さない（行の左の「＋」「✕」と、欄で切り替える）
for (const name of ['↓ 下に1行入れる', '▲ 上へ', '▼ 下へ', 'この行を消す', 'この部材（と同上施工費）を消す']) assert.equal(await sheet.getByRole('button', {name, exact: true}).count(), 0, name);
assert.equal(await sheet.getByRole('button', {name: '📋 部材リストから入れる'}).count(), 1);
assert.equal(await sheet.getByLabel('介護保険の対象外').count(), 0);
// 対象外金額の欄でスペース → 介護保険の対象外
await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit^="excl:"]').last().click();
await page.keyboard.press(' ');
const lt = await tds('L型手すり');
assert.deepEqual([lt[7], lt[10], lt[11]], ['', '', '8,800'], lt.join('|'));
await sheet.locator('.form-page tr', {hasText: '手すりカバー'}).first().locator('.sheet-del').click();
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すりカバー'}).count(), 0);
log('行の左の＋で下に1行・対象外・行の左の✕で消すOK');

// ---------------- 行の左の「✕消す」：その行を消す。箇所の行がなくなれば改修内容・改修場所も消えて、その行が空白になる。元に戻せる
const lines = async () => sheet.locator('.form-page tr[data-rows]').count();
const before = await lines();
assert.equal(await sheet.locator('.sheet-del').count(), before); // 明細の行ごとに1つ
await sheet.getByRole('button', {name: 'サンプル S-TL01 L型手すりの行を消す'}).click();
assert.equal(await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).count(), 0);
assert.deepEqual((await tds('エンドキャップ')).slice(0, 2), ['手すりの取付', '②トイレ']); // 箇所の名前は次の行に
await page.locator('[aria-live] > div', {hasText: '行を消しました'}).first().waitFor();
await sheet.getByRole('button', {name: 'サンプル S-EC01 エンドキャップの行を消す'}).click();
assert.equal(await sheet.locator('.form-page tr', {hasText: 'エンドキャップ'}).count(), 0);
assert.equal(await sheet.locator('.form-page', {hasText: 'トイレ'}).count(), 0); // 箇所ごと消えて、空白の行になる
assert.equal((await sheet.locator('.form-page tr.sheet-new').innerText()).trim(), '');
assert.equal(await lines(), before - 2);
await undoKey();
await undoKey();
assert.equal(await lines(), before);
assert.deepEqual((await tds('L型手すり')).slice(0, 2), ['手すりの取付', '②トイレ']);
assert.equal(await sheet.locator('.form-page tr', {hasText: 'エンドキャップ'}).count(), 1);
log('行の左の✕消す（空白になる・元に戻す）OK');

// ---------------- 行の左の「＋」：その行の下に空白の行が入り、内容の欄が選ばれる（そのまま打ち込める）。何も打たなければ空白の行のまま
await sheet.getByRole('button', {name: 'サンプル S-EC01 エンドキャップの行の下に1行入れる'}).click();
assert.equal(await selected(), '内容（品名）');
assert.equal(await lines(), before + 1);
const blankRow = sheet.locator('.form-page tr[data-rows]').nth(await sheet.locator('.form-page tr[data-rows]').evaluateAll((trs) => trs.findIndex((tr) => tr.innerText.includes('エンドキャップ')) + 1));
assert.deepEqual((await blankRow.locator('td').allInnerTexts()).map((t) => t.trim()).filter(Boolean), []); // 数量・単価・金額も出さない
assert.equal(await page.getByText(/仕切価格も定価もない部材/).count(), 0); // 空白の行は「仕切価格がない」と言わない
await page.keyboard.type('養生テープ');
await page.keyboard.press('Enter');
assert.equal((await tds('養生テープ'))[2], '養生テープ');
await sheet.getByRole('button', {name: '養生テープの行を消す'}).click();
assert.equal(await lines(), before);
log('行の左の＋（空白の行を入れて打ち込む）OK');

// ---------------- 行の左のボタンは「＋」「✕」「コピー」の順。「コピー」→ 貼り付けたい行の「貼付」（部材は同上施工費ごと）。続けて貼り付けられ、Esc でやめる
const tools = await sheet.locator('.sheet-rowtools').first().locator(':scope > *').evaluateAll((els) => els.map((e) => e.className.split(' ')[0]));
assert.deepEqual(tools, ['sheet-ins', 'sheet-del', 'sheet-copy']);
const copyBefore = await lines();
const strip = page.getByRole('status').filter({hasText: 'コピー中'});
await sheet.getByRole('button', {name: /木の手すり 35φ 4mの行をコピー$/}).click();
assert.match(await strip.innerText(), /📋 コピー中：「サンプル S-TS35 木の手すり 35φ 4m」/);
assert.equal(await sheet.locator('tr[data-copied]').count(), 2); // 部材と同上施工費に印
assert.equal(await sheet.locator('[data-copy]').count(), 0); // コピーのあいだは「コピー」の代わりに「貼付」
await sheet.getByRole('button', {name: /エンドキャップの行の下に貼り付け$/}).click();
assert.equal(await lines(), copyBefore + 2);
assert.deepEqual((await order()).slice(-3), ['サンプル S-EC01 エンドキャップ', 'サンプル S-TS35 木の手すり 35φ 4m', '同上施工費']);
await sheet.getByRole('button', {name: /L型手すりの行の下に貼り付け$/}).click(); // 続けて貼り付けられる
assert.equal(await lines(), copyBefore + 4);
await page.keyboard.press('Escape');
assert.equal(await strip.count(), 0);
assert.equal(await sheet.locator('[data-paste]').count(), 0);
await undoKey();
await undoKey();
assert.equal(await lines(), copyBefore);
// 同上施工費もコピーできる：施工費のないエンドキャップの下に貼り付けると、エンドキャップの同上施工費になる
await sheet.locator('.form-page tr', {hasText: '同上施工費'}).first().getByRole('button', {name: /をコピー$/}).click();
await sheet.getByRole('button', {name: /エンドキャップの行の下に貼り付け$/}).click();
assert.deepEqual((await order()).slice(-2), ['サンプル S-EC01 エンドキャップ', '同上施工費']);
assert.deepEqual((await tds('同上施工費')).slice(5, 7), ['2,000', '2,000']);
await page.keyboard.press('Escape');
await undoKey();
log('行の左の「＋」「✕」「コピー」→「貼付」（部材・同上施工費）OK');

// ---------------- キーボード：行の欄で Ctrl+C → 貼り付けたい行を選んで Ctrl+V／Ctrl+X は移す（1回だけ）／Ctrl+Shift+＋ で下に1行・Ctrl+－ で消す
await cell(await key('L型手すり', 'text')).click();
await page.keyboard.press('ControlOrMeta+c');
assert.match(await strip.innerText(), /L型手すり/);
await cell(await key('エンドキャップ', 'qty')).click();
await page.keyboard.press('ControlOrMeta+v');
assert.deepEqual((await order()).slice(-2), ['サンプル S-EC01 エンドキャップ', 'サンプル S-TL01 L型手すり']);
assert.equal(await lines(), copyBefore + 1);
await page.keyboard.press('Escape');
await undoKey();
await cell(await key('L型手すり', 'text')).click();
await page.keyboard.press('ControlOrMeta+x');
const cutStrip = page.getByRole('status').filter({hasText: '切り取り中'});
assert.match(await cutStrip.innerText(), /L型手すり/);
await cell(await key('エンドキャップ', 'text')).click();
await page.keyboard.press('ControlOrMeta+v');
assert.deepEqual((await order()).slice(-2), ['サンプル S-EC01 エンドキャップ', 'サンプル S-TL01 L型手すり']);
assert.equal(await lines(), copyBefore); // 移しただけ
assert.equal(await cutStrip.count(), 0);
await undoKey();
assert.deepEqual((await order()).slice(-2), ['サンプル S-TL01 L型手すり', 'サンプル S-EC01 エンドキャップ']);
// 行でない欄（お客様名）の Ctrl+C は欄の文字だけ。そのあとの Ctrl+V は、ふつうに欄に文字が入る
await cell('job:customer').click();
await page.keyboard.press('ControlOrMeta+c');
assert.equal(await strip.count(), 0);
await cell(await key('エンドキャップ', 'note')).click();
await page.keyboard.press('ControlOrMeta+v');
assert.equal(await input.inputValue(), '見本 太郎');
await page.keyboard.press('Escape');
await cell(await key('エンドキャップ', 'text')).click();
await page.keyboard.press('ControlOrMeta+Shift+Equal');
assert.equal(await lines(), copyBefore + 1);
assert.equal(await selected(), '内容（品名）');
await page.keyboard.press('ControlOrMeta+Minus');
assert.equal(await lines(), copyBefore);
log('Ctrl+C／Ctrl+X／Ctrl+V（行）・欄の文字の貼り付け・Ctrl+Shift+＋／Ctrl+－ OK');

// ---------------- 見積書の外で入れたもの（部材リストから入れる）も Ctrl+Z で戻せる。見積書の欄を選んでいなくても効く（Ctrl+Y でやり直す）
const pickBefore = await lines();
await cell(await key('エンドキャップ', 'text')).click();
await sheet.getByRole('button', {name: '📋 部材リストから入れる'}).click();
await page.getByRole('dialog').getByRole('row', {name: /ブラケット/}).getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
assert.equal(await lines(), pickBefore + 1);
await page.locator('header').first().click({position: {x: 4, y: 4}}); // 見積書の外を押す
await undoKey();
assert.equal(await lines(), pickBefore);
await page.keyboard.press('ControlOrMeta+y');
assert.equal(await lines(), pickBefore + 1);
await undoKey();
assert.equal(await lines(), pickBefore);
log('部材リストから入れたものも Ctrl+Z／Ctrl+Y（欄を選んでいなくても）OK');

// ---------------- 改修場所：欄の「▼」（Alt+↓）で箇所の名前の候補から選ぶ。打ち込んでもよい（打った文字で絞る）
await cell(await key('木の手すり 35φ 4m', 'name')).click();
await sheet.getByRole('button', {name: '改修場所（箇所名）を候補から選ぶ'}).click();
const placeOptions = page.getByRole('listbox', {name: '候補'}).getByRole('option');
assert.deepEqual((await placeOptions.allInnerTexts()).slice(0, 3), ['玄関', '上がり框', '廊下']);
await placeOptions.filter({hasText: /^廊下$/}).click();
assert.equal((await tds('木の手すり 35φ 4m'))[1], '①廊下');
await page.keyboard.press('Alt+ArrowDown');
await page.keyboard.type('脱衣');
assert.deepEqual(await placeOptions.allInnerTexts(), ['脱衣所']);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
assert.equal((await tds('木の手すり 35φ 4m'))[1], '①脱衣所');
await undoKey();
await undoKey();
assert.equal((await tds('木の手すり 35φ 4m'))[1], '①浴室');
log('改修場所の候補（▼・Alt+↓・打って絞る）OK');

// ---------------- 諸経費・作成日・工事場所（見積書の欄）
await typeIn('overhead:all', '1000');
assert.equal((await tds('諸経費')).filter(Boolean)[1], '1,000');
await typeIn('date', '2026/10/1');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('令和8年10月1日'));
log('諸経費・作成日OK');

// ---------------- 打ち込んでいる途中で見積書の外の欄を押す → 打った値が入り、その欄を使える（Excel と同じ）
await cell('new:text').click();
await page.keyboard.type('手すり受け');
const staffSelect = page.getByRole('combobox', {name: '担当', exact: true});
await staffSelect.click();
await page.keyboard.press('Escape');
await staffSelect.selectOption('土居 翔太');
assert.equal(await staffSelect.inputValue(), '土居 翔太');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('担当： 土居 翔太'));
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すり受け'}).count(), 1);
await sheet.locator('.form-page tr', {hasText: '手すり受け'}).first().locator('.sheet-del').click();
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すり受け'}).count(), 0);
log('見積書の外を押すと打った値が入るOK');

// ---------------- 笹岡工務店の請求書：新しい見積書は最初から入っている。外すと請求する月・施工日も出ない。
// 入力の画面には請求書に入る金額を出さない（金額は「請求書を見る」の仕切り計算表で確かめる）。仕切価格のない部材だけ知らせ、その場で入れられる
await typeIn('new:text', '取付金具', 'Tab');
await page.keyboard.press('Enter');
const inInvoice = page.getByLabel('笹岡工務店の請求書に入れる');
assert.equal(await inInvoice.isChecked(), true);
await inInvoice.uncheck();
assert.equal(await page.getByLabel('請求する月').count(), 0);
await inInvoice.check();
const noPrice = page.getByText('仕切価格も定価もない部材が 1 行あります');
await noPrice.waitFor();
await page.getByRole('button', {name: '仕切価格を入れる'}).click();
await page.getByRole('dialog').getByRole('textbox', {name: '取付金具の仕切価格'}).fill('300');
await page.getByRole('dialog').getByRole('button', {name: '閉じる'}).first().click();
assert.equal(await noPrice.count(), 0);
assert.ok(!(await page.locator('main').innerText()).includes('①部材代'), '入力の画面に請求書の金額が出ている');
log('笹岡工務店の請求書に最初から入る・外す・仕切価格を入れるOK');

// ---------------- 工事場所の住所の市町村が保険者と違うと知らせる（打っている途中では変えない。変えるのはボタンで）。
// みやこ町は書式は同じで保険者だけ変わる。築上町は広域連合（書式も広域連合用）。材／手を「手」にすると施工費（数量は時間・1時間2,500円）
const insurer = page.getByRole('combobox', {name: '保険者'});
assert.equal(await insurer.inputValue(), 'yukuhashi');
await typeIn('job:address', '福岡県京都郡みやこ町豊津');
await page.getByRole('button', {name: '保険者をみやこ町にする'}).click();
assert.equal(await insurer.inputValue(), 'miyako');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('工事費見積書兼工事費内訳書')); // 書式は同じ
await typeIn('job:address', '福岡県築上郡築上町椎田');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('工事費見積書兼工事費内訳書'));
await page.getByRole('button', {name: '保険者を広域連合にする'}).click();
await sheet.locator('.form-page', {hasText: '内訳書　様式'}).first().waitFor();
assert.equal(await insurer.inputValue(), 'kouiki');
assert.equal(await page.getByRole('button', {name: /^保険者を.*にする$/}).count(), 0);
await cell('new:mark').click();
await page.keyboard.press(' ');
assert.equal((await cell('new:mark').innerText()).trim(), '手');
await typeIn('new:qty', '1.2');
// 部材（取付金具）のすぐ下なので同上施工費。1.2時間×2,500円＝3,000円
const hours = (await sheet.locator('.form-page tr:not([data-new])', {has: page.locator('td.mark', {hasText: '手'})}).last().locator('td').allInnerTexts()).map((t) => t.trim());
assert.deepEqual(hours.slice(2, 9).filter((t) => t !== ''), ['手', '同上施工費', '1.2', '時間', '2,500', '3,000'], hours.join('|'));
await page.screenshot({path: path.join(outDir, '41-sheet-kouiki.png')});
log('広域連合用：材／手・時間OK');

// ---------------- 「請求書を確認する」で開くと、同じ入力から仕切り計算表ができている（同じデータ）
await page.waitForTimeout(600); // 自動保存を待つ
await page.getByRole('button', {name: '🧾 請求書を見る'}).click();
await page.waitForURL(/#tab=invoice&job=/);
await page.getByRole('heading', {level: 1, name: '見本 太郎様邸'}).waitFor();
const shikiri = await page.locator('aside table').innerText();
assert.ok(shikiri.includes('部材代合計') && shikiri.includes('9,900') && shikiri.includes('5,000'), shikiri); // 取付手間 2,000＋3,000
log('仕切り計算表につながるOK');

// ---------------- 「請求書を確認する」の「見積書を開く」で戻ると、同じ見積書
await page.getByRole('button', {name: '📝 見積書を開く'}).click();
await page.waitForURL(/#tab=estimate&job=/);
await sheet.waitFor();
assert.ok((await sheet.innerText()).includes('同上施工費'));
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 太郎様邸');
log('見積書に戻れるOK');

// ---------------- 「📄 白紙に戻す」（印刷の横）：確かめてから、見積書に打ち込んだ内容を全部消す。やめれば何も消えない。
// 保険者（書式）・担当は残す。Ctrl+Z で戻せる
const headButtons = (await page.locator('main button').allInnerTexts()).map((t) => t.trim());
assert.equal(headButtons[headButtons.indexOf('🖨 見積書を印刷') + 1], '📄 白紙に戻す', headButtons.slice(0, 10).join('|'));
const clearBtn = page.getByRole('button', {name: '📄 白紙に戻す'});
page.removeAllListeners('dialog');
let asked = '';
let answer = false;
page.on('dialog', (d) => {
  asked = d.message();
  void (answer ? d.accept() : d.dismiss());
});
const rowsBefore = await lines();
await clearBtn.click();
assert.match(asked, /白紙に戻しますか/);
assert.equal(await lines(), rowsBefore); // 「キャンセル」なら消えない
answer = true;
await clearBtn.click();
assert.equal(await lines(), 0);
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '新しい見積書');
assert.equal(await insurer.inputValue(), 'kouiki');
assert.equal(await staffSelect.inputValue(), '土居 翔太');
assert.ok(await clearBtn.isDisabled()); // もう白紙
await page.locator('header').first().click({position: {x: 4, y: 4}});
await undoKey();
assert.equal(await lines(), rowsBefore);
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 太郎様邸');
log('白紙に戻す（確かめる・やめる・Ctrl+Z で戻す）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
