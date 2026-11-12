// 住宅改修 見積書作成：見積書の欄に打ち込む（Excel のように欄を選んで打ち込む）を確かめる：
// 新しい見積書を見積書の形のまま打ち込む（お客様名・改修内容・改修場所・内容の候補（★お気に入り）・数量 60cm・同上施工費・備考に定価）→
// 合計・元に戻す・行の挿入／削除／コピー→貼付（行の左の挿入・✕・コピー、Ctrl+C／X／V、Ctrl+Shift+＋／Ctrl+－）・改修場所の候補（▼・Alt+↓）・
// 介護保険の対象外・諸経費・作成日・笹岡工務店の請求書に入れる（仕切価格を入れる）・
// 広域連合用（材／手・時間）・「請求書を確認する」とのつながり
// usage: node e2e-sheet.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html と <サイト>/sasaoka/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
import {cellAt, chooseLabor, clickStable, insertBelow, moreItems, navItem, noPick, openMore, pickAt} from './more.mjs';

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
await page.getByRole('tab', {name: '📋 工事見積書'}).click(); // 新規作成は申請書のタブから開く

const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const input = sheet.locator('textarea.sheet-input');
const cell = (key) => cellAt(sheet.locator(`[data-edit="${key}"]`).first());
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

// 行の操作（2026-11-03。ユーザーの指示「改修内容の横に、挿入、削除、コピー、貼り付けボタンを小さくもってくる（工事費見積書の枠内）」）：
// 行の欄（内容）を選ぶと、その行の改修内容の左（見積書の余白）に「＋ 挿入」「✕ 削除」「⧉ コピー」「📋 貼付」。見積書の左は Excelで保存・見積書を印刷
const side = sheet.getByRole('toolbar', {name: '見積書の左のボタン'});
const ops = sheet.getByRole('toolbar', {name: '行の操作'});
const rowOp = async (row, op) => {
  const tr = typeof row === 'string' ? sheet.locator('.form-page tr', {hasText: row}).first() : row;
  // 選んでいる欄の上には見えない入力欄があるので、その欄を選んでいるときは入力欄を押す（人が押すのと同じ）
  await cellAt(tr.locator('[data-edit$=":text"]').first()).click({timeout: 2000}).catch(() => input.click());
  await ops.getByRole('button', {name: op}).click();
  await page.waitForTimeout(60);
};
// 選んでいる行（空いた行）の内容の欄の「部材｜施工費｜常用」（2026-11-03。前は見積書の左の「部材リストから入れる」など）。選んでいる欄の上の見えない入力欄の下にあるので force
const pickHere = (kind) => pickAt(sheet, kind);
// name の行（部材は同上施工費ごと）のすぐ下に空いた行を入れる（「＋ 挿入」は選んでいる行の上なので、すぐ下の行を選んで挿入。more.mjs の insertBelow）
const below = (name) => insertBelow(sheet, sheet.locator('.form-page tr[data-rows]', {hasText: name}).first());
const laborPick = async (name) => {
  await chooseLabor(page, () => pickHere('labor'), name);
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
// 行を入れるまでは笹岡工務店の請求書・発注書は出さない（申請書だけの様邸＝ほかの工務店の工事を入れないため）。行を入れると入る
assert.equal(await page.getByLabel('工務店の請求書に入れる').count(), 0);
assert.equal(await page.getByRole('menu', {name: 'その他', includeHidden: true}).getByRole('button', {name: '🛒 発注書を作成', includeHidden: true}).isDisabled(), true); // 上の段の「その他 ▼」の中
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
assert.deepEqual(rail.slice(0, 7), ['手すりの取り付け', '①浴室', 'サンプル S-TS35 木の手すり 35φ 4m', '0.15', '本', '16,000', '2,400'], rail.join('|'));
assert.ok(rail[12].includes('定価20,000円（4m）×0.8') && rail[12].includes('600mm÷4000mm＝0.15'), rail[12]);
assert.equal(await page.getByLabel('工務店の請求書に入れる').isChecked(), true); // 行を入れたので請求書に入る
assert.equal(await page.getByRole('menu', {name: 'その他', includeHidden: true}).getByRole('button', {name: '🛒 発注書を作成', includeHidden: true}).isDisabled(), false); // 発注書も作れる
log('改修内容・改修場所・内容（候補から）・数量 60cm＝0.15本・行を入れると請求書に入るOK');

// 1行目を入れた直後も、Ctrl+Z 1回で1つ前に戻る（前は見積もり作成日の付いた見積書を外の変更とみて、2回押さないと戻らなかった）
await undoKey(); // 数量 60cm
await undoKey(); // 内容（木の手すり）
await undoKey(); // 改修場所「浴室」
assert.equal(await sheet.locator('.form-page', {hasText: '浴室'}).count(), 0);
for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+y');
rail = await tds('木の手すり 35φ 4m');
assert.deepEqual(rail.slice(0, 7), ['手すりの取り付け', '①浴室', 'サンプル S-TS35 木の手すり 35φ 4m', '0.15', '本', '16,000', '2,400'], rail.join('|'));
log('1行目のあとの Ctrl+Z（1回で1つ前）OK');

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
// 2,400＋2,000＋4,800＝9,200 → 諸経費 919（920 から合計の末尾が0になるよう端数調整）→ 消費税 1,011 → 合計 11,130
assert.deepEqual(await totals(), ['合計', '11,130', '11,130']);
log('備考に定価を入れると単価が 定価×0.8 になるOK');

// ---------------- Ctrl+Z で元に戻す・Ctrl+Y でやり直す
await page.keyboard.press('ControlOrMeta+z');
assert.equal((await tds('手すりカバー'))[6], '0');
await page.keyboard.press('ControlOrMeta+y');
assert.deepEqual(await totals(), ['合計', '11,130', '11,130']);
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
assert.equal((await tds('手すりカバー'))[3], ''); // 数量 0 は空欄（本数をあとで書く行）
await page.keyboard.press('ControlOrMeta+z');
assert.equal((await tds('手すりカバー'))[3], '2');
log('F2・Esc・Delete OK');

// 諸経費の欄を F2 で開いてそのまま Enter：手で入れた金額にしない（このあと行を足すと、諸経費も変わる）
await cell('overhead:all').click();
await page.keyboard.press('F2');
await page.keyboard.press('Enter');

// ---------------- 空いた行を押すと、打ち込める行の同じ列が選ばれる。改修場所を打つと箇所が増える（写真番号は次の番号）
await sheet.locator('.form-page tr[data-blank]').nth(3).locator('td').nth(1).click();
assert.equal(await selected(), '改修場所（箇所名）');
await page.keyboard.type('トイレ');
await page.keyboard.press('Tab');
await page.keyboard.type('L型');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
assert.deepEqual((await tds('L型手すり')).slice(0, 7), ['手すりの取り付け', '②トイレ', 'サンプル S-TL01 L型手すり', '1', '本', '8,800', '8,800']);
// 9,200＋8,800＝18,000 → 諸経費 1,800（上で F2・Enter した諸経費も自動のまま。前は 919 のままで合計 20,810）→ 消費税 1,980 → 合計 21,780
assert.deepEqual(await totals(), ['合計', '21,780', '21,780']);
log('空いた行・新しい箇所・諸経費は自動のままOK');

// ---------------- 行の「挿入」：選んだ行の上に1行入れる → 打ち込む／介護保険の対象外（スペース）／「削除」で消す
// 行の操作は1組（選んでいる行の改修内容の左）。見積書の左は Excelで保存・見積書を印刷だけ
assert.deepEqual(await side.getByRole('button').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ').trim())), ['📗 Excelで保存', '🖨 見積書を印刷', '📖 マツ六', '📖 TOTO', '📖 矢崎化工']);
assert.deepEqual(await ops.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['＋ 挿入', '✕ 削除', '⧉ コピー', '📋 貼付']);
assert.equal(await sheet.locator('.sheet-rowtools, [data-ins], [data-del], [data-copy], [data-paste]').count(), 0);
assert.equal(await ops.getByRole('button', {name: '📋 貼付'}).isDisabled(), true); // コピーするまで押せない
// 「＋ 挿入」は選んでいる行の上（Excel と同じ。ユーザーの指示「挿入の場合、この間に挿入が差し込めるようにする」2026-11-03。前は下）。
// 箇所の1行目（②トイレの L型手すり）の上は、前の箇所（①浴室）のいちばん下に入る（②トイレの名前は L型手すり の行のまま）
const rowsNow = async () => (await sheet.locator('.form-page tr[data-rows]').allInnerTexts()).map((t) => noPick(t).replace(/\s+/g, ' ').trim());
const beforeIns = await rowsNow();
await rowOp('L型手すり', '＋ 挿入');
const afterIns = await rowsNow();
const li = afterIns.findIndex((t) => t.includes('L型手すり'));
assert.equal(afterIns.length, beforeIns.length + 1);
assert.equal(afterIns[li - 1], '', afterIns.join('\n'));
assert.match(afterIns[li], /^手すりの取り付け ②トイレ/);
assert.equal(await selected(), '内容（品名）');
await ops.getByRole('button', {name: '✕ 削除'}).click();
assert.deepEqual(await rowsNow(), beforeIns);
// L型手すりの下（いちばん下の行）に入れるのは、いちばん下の空いた行に打ち込む
await below('L型手すり');
assert.equal(await selected(), '内容（品名）');
await page.keyboard.type('エンド');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
const order = async () =>
  (await sheet.locator('.form-page tr', {has: page.locator('[data-edit$=":text"]')}).allInnerTexts()).map((t) => noPick(t.split('\t')[2] ?? '').trim()).filter(Boolean);
assert.deepEqual((await order()).slice(-2), ['サンプル S-TL01 L型手すり', 'サンプル S-EC01 エンドキャップ']);
// 行を動かすボタン・介護保険の対象外のチェック・下に1行入れる・この行を消す は出さない（左の「挿入」「削除」と、欄で切り替える）
for (const name of ['↓ 下に1行入れる', '▲ 上へ', '▼ 下へ', 'この行を消す', 'この部材（と同上施工費）を消す']) assert.equal(await sheet.getByRole('button', {name, exact: true}).count(), 0, name);
assert.equal(await side.getByRole('button', {name: '📋 部材リストから入れる'}).count(), 0); // 部材は空いた行の「部材」から
assert.equal(await sheet.getByLabel('介護保険の対象外').count(), 0);
// 対象外金額の欄でスペース → 介護保険の対象外
await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit^="excl:"]').last().click();
await page.keyboard.press(' ');
const lt = await tds('L型手すり');
assert.deepEqual([lt[7], lt[10], lt[11]], ['', '', '8,800'], lt.join('|'));
await rowOp('手すりカバー', '✕ 削除');
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すりカバー'}).count(), 0);
log('左の挿入で上に1行（箇所の境目）・対象外・左の削除で消すOK');

// ---------------- 左の「削除」：選んだ行を消す。箇所の行がなくなれば改修内容・改修場所も消えて、その行が空白になる。元に戻せる
const lines = async () => sheet.locator('.form-page tr[data-rows]').count();
const before = await lines();
await rowOp('L型手すり', '✕ 削除');
assert.equal(await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).count(), 0);
assert.deepEqual((await tds('エンドキャップ')).slice(0, 2), ['手すりの取り付け', '②トイレ']); // 箇所の名前は次の行に
// 行の操作のお知らせ（「行を消しました」など）は出さない（ユーザーの指示「行を消しましたという文言は不要」2026-10-26）
await page.waitForTimeout(300);
assert.equal(await page.locator('[aria-live] > div', {hasText: /行を消しました|コピーしました|貼り付けました|移しました/}).count(), 0);
await rowOp('エンドキャップ', '✕ 削除');
assert.equal(await sheet.locator('.form-page tr', {hasText: 'エンドキャップ'}).count(), 0);
assert.equal(await sheet.locator('.form-page', {hasText: 'トイレ'}).count(), 0); // 箇所ごと消えて、空白の行になる
assert.equal(noPick(await sheet.locator('.form-page tr.sheet-new').innerText()).trim(), '');
assert.equal(await lines(), before - 2);
await undoKey();
await undoKey();
assert.equal(await lines(), before);
assert.deepEqual((await tds('L型手すり')).slice(0, 2), ['手すりの取り付け', '②トイレ']);
assert.equal(await sheet.locator('.form-page tr', {hasText: 'エンドキャップ'}).count(), 1);
log('左の削除（空白になる・元に戻す）OK');

// ---------------- 左の「挿入」：選んだ行の上に空白の行が入り、内容の欄が選ばれる（そのまま打ち込める）。何も打たなければ空白の行のまま
await rowOp('エンドキャップ', '＋ 挿入');
assert.equal(await selected(), '内容（品名）');
assert.equal(await lines(), before + 1);
const blankRow = sheet.locator('.form-page tr[data-rows]').nth(await sheet.locator('.form-page tr[data-rows]').evaluateAll((trs) => trs.findIndex((tr) => tr.innerText.includes('エンドキャップ')) - 1));
assert.deepEqual((await blankRow.locator('td').allInnerTexts()).map((t) => noPick(t).trim()).filter(Boolean), []); // 数量・単価・金額も出さない（内容の欄の「部材｜施工費｜常用」は除く）
assert.equal(await page.getByText(/仕切価格が空欄の部材/).count(), 0); // 空白の行は「仕切価格がない」と言わない
// 書き直し（F2・ダブルクリック）も空から（前は「材料費」と出た。ユーザーの指摘）
await page.keyboard.press('F2');
assert.equal(await input.inputValue(), '');
await page.keyboard.press('Escape');
// 選んでいる欄の上には見えない入力欄があるので、ダブルクリックはそこに（人が押すのと同じ）。空いた行の内容の欄は左に「部材｜施工費｜常用」があるので、右の方を押す
await input.dblclick({position: {x: (await input.boundingBox()).width - 20, y: (await input.boundingBox()).height / 2}});
assert.equal(await input.evaluate((el) => el.classList.contains('editing')), true);
assert.equal(await input.inputValue(), '');
assert.equal(await bar(), '　');
await page.keyboard.press('Escape');
await page.keyboard.type('養生テープ');
await page.keyboard.press('Enter');
assert.equal((await tds('養生テープ'))[2], '養生テープ');
await rowOp('養生テープ', '✕ 削除');
assert.equal(await lines(), before);
log('左の挿入（空白の行を入れて打ち込む・書き直しも空から）OK');

// ---------------- 左の「コピー」→ 貼り付けたい行を選んで「貼付」（部材は同上施工費ごと）。続けて貼り付けられ、Esc でやめる
const copyBefore = await lines();
const strip = page.getByRole('status').filter({hasText: 'コピー中'});
await rowOp('木の手すり 35φ 4m', '⧉ コピー');
assert.match(await strip.innerText(), /📋 コピー中：「サンプル S-TS35 木の手すり 35φ 4m」/);
assert.equal(await sheet.locator('tr[data-copied]').count(), 2); // 部材と同上施工費に印
await rowOp('エンドキャップ', '📋 貼付');
assert.equal(await lines(), copyBefore + 2);
assert.deepEqual((await order()).slice(-3), ['サンプル S-EC01 エンドキャップ', 'サンプル S-TS35 木の手すり 35φ 4m', '同上施工費']);
await rowOp('L型手すり', '📋 貼付'); // 続けて貼り付けられる
assert.equal(await lines(), copyBefore + 4);
// 下の空いた行を選んで「貼付」：いちばん下に貼り付ける
await sheet.locator('.form-page tr[data-blank]').last().locator('td').nth(2).click();
await ops.getByRole('button', {name: '📋 貼付'}).click();
assert.equal(await lines(), copyBefore + 6);
assert.deepEqual((await order()).slice(-4), ['サンプル S-TS35 木の手すり 35φ 4m', '同上施工費', 'サンプル S-TS35 木の手すり 35φ 4m', '同上施工費']);
await page.keyboard.press('Escape');
assert.equal(await strip.count(), 0);
assert.equal(await ops.getByRole('button', {name: '📋 貼付'}).isDisabled(), true);
await undoKey();
await undoKey();
await undoKey();
assert.equal(await lines(), copyBefore);
// 同上施工費もコピーできる：施工費のないエンドキャップの下に貼り付けると、エンドキャップの同上施工費になる
await rowOp(sheet.locator('.form-page tr', {hasText: '同上施工費'}).first(), '⧉ コピー');
await rowOp('エンドキャップ', '📋 貼付');
assert.deepEqual((await order()).slice(-2), ['サンプル S-EC01 エンドキャップ', '同上施工費']);
assert.deepEqual((await tds('同上施工費')).slice(5, 7), ['2,000', '2,000']);
await page.keyboard.press('Escape');
await undoKey();
log('左の「挿入」「削除」「コピー」→「貼付」（部材・同上施工費・空いた行）OK');

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

// ---------------- 見積書の外で入れたもの（部材を選ぶ画面）も Ctrl+Z で戻せる。見積書の欄を選んでいなくても効く（Ctrl+Y でやり直す）
const pickBefore = await lines();
await sheet.locator('tr[data-new] [data-pick="material"]').click(); // いちばん下の打ち込める行の「部材」（最後の箇所に入る）
await page.getByRole('dialog').getByRole('row', {name: /ブラケット/}).getByRole('button', {name: '＋ 追加'}).click();
// お気に入りの一覧の「削除」：お気に入りから外す（部材リストには残る。「すべて」で★を押すと戻る）。仕切価格の空欄は「空欄」（定価から計算しない）
const picker = page.getByRole('dialog');
const favTab = picker.getByRole('button', {name: /^★ お気に入り（\d+）$/});
// 開いたときは「すべて」（ユーザーの指示「デフォルトはお気に入りではなく、全てにする」2026-11-03）
assert.equal(await picker.getByRole('button', {name: /^すべて（\d+）$/}).getAttribute('aria-pressed'), 'true');
await favTab.click();
const favBefore = Number(/（(\d+)）/.exec(await favTab.innerText())[1]);
await picker.getByRole('button', {name: '補強板をお気に入りから削除'}).click();
assert.equal(await picker.getByRole('row', {name: /補強板/}).count(), 0);
assert.equal(await favTab.innerText(), `★ お気に入り（${favBefore - 1}）`);
await picker.getByRole('button', {name: /^すべて（\d+）$/}).click();
assert.equal(await picker.getByRole('row', {name: /補強板/}).count(), 1);
assert.equal(await picker.getByRole('button', {name: '補強板をお気に入りから削除'}).count(), 0); // 「すべて」には削除を出さない
await picker.getByRole('row', {name: /補強板/}).getByRole('button', {name: /お気に入りに/}).click();
assert.equal(await favTab.innerText(), `★ お気に入り（${favBefore}）`);
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
assert.equal(await lines(), pickBefore + 1);
await page.locator('header').first().click({position: {x: 4, y: 4}}); // 見積書の外を押す
await undoKey();
assert.equal(await lines(), pickBefore);
await page.keyboard.press('ControlOrMeta+y');
assert.equal(await lines(), pickBefore + 1);
await undoKey();
assert.equal(await lines(), pickBefore);
log('部材リストから入れたものも Ctrl+Z／Ctrl+Y（欄を選んでいなくても）・お気に入りの削除 OK');

// ---------------- 行の下に入れる：すぐ下の行を選んで「＋ 挿入」で空いた行 → その行の「部材」で入れた部材は、上の行（行の同上施工費）のすぐ下。続けて入れたものはその下。
// 空いた行に入る（行は空いた行のぶんだけ）
const pickAdd = async (...names) => {
  await pickHere('material');
  for (const name of names) await page.getByRole('dialog').getByRole('row', {name}).getByRole('button', {name: '＋ 追加'}).click();
  await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
};
const from = async (name, n) => {
  const o = await order();
  return o.slice(o.indexOf(name), o.indexOf(name) + n);
};
// 片づけは左の「削除」で（見積書の外で続けて入れたものは Ctrl+Z 1回にまとまるので、回数が決まらない）
const drop = (name) => rowOp(name, '✕ 削除');
await below('木の手すり 35φ 4m');
await pickAdd(/ブラケット/, /補強板/);
assert.deepEqual(await from('サンプル S-TS35 木の手すり 35φ 4m', 4), ['サンプル S-TS35 木の手すり 35φ 4m', '同上施工費', 'サンプル S-BK01 ブラケット', 'サンプル S-HB01 補強板']);
assert.equal(await lines(), pickBefore + 2);
await drop('サンプル S-BK01 ブラケット');
await drop('サンプル S-HB01 補強板');
assert.equal(await lines(), pickBefore);
await below('エンドキャップ'); // いちばん下の行なので、いちばん下の空いた行
await pickAdd(/ブラケット/);
assert.deepEqual(await from('サンプル S-EC01 エンドキャップ', 2), ['サンプル S-EC01 エンドキャップ', 'サンプル S-BK01 ブラケット']);
assert.equal(await lines(), pickBefore + 1);
await drop('サンプル S-BK01 ブラケット');
assert.equal(await lines(), pickBefore);
// 施工費も：空白の行の「施工費」→ 施工費のリストの「木」→ その行に入り、すぐ上の部材（エンドキャップ）の同上施工費になる
await below('エンドキャップ');
await laborPick('木');
assert.deepEqual(await from('サンプル S-EC01 エンドキャップ', 2), ['サンプル S-EC01 エンドキャップ', '同上施工費']);
assert.equal(await lines(), pickBefore + 1);
await rowOp(sheet.locator('.form-page tr', {hasText: '同上施工費'}).last(), '✕ 削除');
assert.equal(await lines(), pickBefore);
log('空いた行に入れる（部材・続けて入れる・施工費）OK');

// ---------------- 施工費を入れても、勝手に新しい箇所を作らない（ユーザーの指摘「施工費を入力したら、勝手に②になってしまった」2026-10-25）
const placeNames = async () => (await sheet.locator('[data-edit^="place:"][data-edit$=":name"]').allInnerTexts()).map((t) => t.trim());
const lastWork = async () => (await sheet.locator('.form-page tr', {hasText: '同上施工費'}).last().locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const linesBefore = await lines();
assert.deepEqual(await placeNames(), ['①浴室', '②トイレ']);
// ①浴室の空白の行の「部材」→ 空白の行がブラケットになり、閉じると最後に入れたブラケットの行を選ぶ（2026-11-02。前は選んでいた欄がなくなった）→
// その下に空いた行を入れて「施工費」はそのブラケットの同上施工費（①浴室。前は新しい箇所③の「施工費」になった）
await below('木の手すり 35φ 4m');
await pickAdd(/ブラケット/);
await sheet.getByLabel('選んでいる欄の値').filter({hasText: 'サンプル S-BK01 ブラケット'}).waitFor({timeout: 5000}).catch(() => undefined); // 閉じたあと選び直すまで待つ
assert.equal(await bar(), 'サンプル S-BK01 ブラケット'); // 最後に入れた行を選んでいる
await below('サンプル S-BK01 ブラケット');
await laborPick('木');
assert.deepEqual(await placeNames(), ['①浴室', '②トイレ']);
let texts = await order();
assert.deepEqual(texts.slice(texts.indexOf('サンプル S-BK01 ブラケット'), texts.indexOf('サンプル S-TL01 L型手すり')), ['サンプル S-BK01 ブラケット', '同上施工費']);
assert.equal(await lines(), linesBefore + 2);
assert.deepEqual(await placeNames(), ['①浴室', '②トイレ']);
await page.screenshot({path: path.join(outDir, '47-sheet-labor-same-place.png')});
// いちばん下の行の改修内容に「施工費」と打つ：最後の箇所（②トイレ）の同上施工費（前は空の箇所③ができ、そこに入った）。続けて単価
await cell('new:work').click();
await page.keyboard.type('施工費');
await page.keyboard.press('Tab');
assert.equal(await selected(), '単価');
await page.keyboard.type('12000');
await page.keyboard.press('Enter');
assert.deepEqual(await placeNames(), ['①浴室', '②トイレ']);
texts = await order();
assert.equal(texts[texts.length - 1], '同上施工費');
assert.deepEqual((await lastWork()).slice(0, 7), ['', '', '同上施工費', '1', '式', '12,000', '12,000']);
assert.equal(await lines(), linesBefore + 3);
// 読めない改修内容では箇所を作らない（いちばん下の行は空のまま）
await cell('new:work').click();
await page.keyboard.type('あいう');
await page.keyboard.press('Enter');
assert.equal(await cell('new:work').innerText(), '');
assert.equal(await lines(), linesBefore + 3);
log('施工費を入れても新しい箇所を作らない（空白の行に部材を入れたあとのボタン・お客様名の欄・いちばん下の行に打つ）OK');

// 申請書のタブにも箇所は2つ（写真番号・改修の内容に③が出ない）
await page.waitForTimeout(1200); // 自動保存
const shinseiTab = page.getByRole('tab', {name: '📝 住宅改修申請書'});
const shinseiPlaces = () => page.getByRole('list', {name: '改修の箇所'}).getByRole('listitem');
await shinseiTab.click();
await page.getByRole('form', {name: '申請書'}).waitFor();
assert.deepEqual(await shinseiPlaces().evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['①浴室', '②トイレ']);
// 前の版が残した空の箇所（何も入っていない箇所）は、見積書を開いたときに外す（いちばん下の行がその箇所になり、打った施工費が②になっていた）
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('taiyo-sasaoka-shikiri', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const jobs = await new Promise((res) => {
    const g = db.transaction('kv').objectStore('kv').get('jobs');
    g.onsuccess = () => res(g.result);
  });
  const j = jobs.find((x) => x.customer === '見本 太郎');
  j.places.push({id: 'p_empty_old', name: '', rows: [], kind: 1, photo: 0});
  const stamp = 'old-' + Date.now();
  await new Promise((res) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(jobs, 'jobs');
    tx.objectStore('kv').put(stamp, 'stamp:jobs');
    tx.oncomplete = res;
  });
  db.close();
  new BroadcastChannel('taiyo-sasaoka-shikiri').postMessage({from: 'old-tab', key: 'jobs', stamp});
});
await page.waitForFunction(() => document.querySelectorAll('[aria-label="改修の箇所"] [role="listitem"]').length === 3);
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
assert.equal(await cell('new:work').innerText(), ''); // いちばん下の行は空の箇所にならない
await shinseiTab.click();
await page.getByRole('form', {name: '申請書'}).waitFor();
assert.deepEqual(await shinseiPlaces().evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['①浴室', '②トイレ']);
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
log('申請書のタブの箇所も2つ・前の版が残した空の箇所は見積書を開くと外れるOK');
// 片づけ（ブラケットは同上施工費ごと消える）
await drop('サンプル S-BK01 ブラケット');
await rowOp(sheet.locator('.form-page tr', {hasText: '同上施工費'}).last(), '✕ 削除');
assert.equal(await lines(), linesBefore);

// ---------------- 改修場所：欄の「▼」（Alt+↓）で箇所の名前の候補から選ぶ。打ち込んでもよい（打った文字で絞る）
await cell(await key('木の手すり 35φ 4m', 'name')).click();
await sheet.getByRole('button', {name: '改修場所（箇所名）を候補から選ぶ'}).click();
const placeOptions = page.getByRole('listbox', {name: '候補'}).getByRole('option');
assert.deepEqual((await placeOptions.allInnerTexts()).slice(0, 3), ['廊下', '階段', '台所']); // 写真の用紙の改修箇所と同じ名前・順番
await placeOptions.filter({hasText: /^廊下$/}).click();
assert.equal((await tds('木の手すり 35φ 4m'))[1], '①廊下');
await page.keyboard.press('Alt+ArrowDown');
await page.keyboard.type('脱衣');
assert.deepEqual(await placeOptions.allInnerTexts(), ['洗面・脱衣室']);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
assert.equal((await tds('木の手すり 35φ 4m'))[1], '①洗面・脱衣室');
await undoKey();
await undoKey();
assert.equal((await tds('木の手すり 35φ 4m'))[1], '①浴室');
log('改修場所の候補（▼・Alt+↓・打って絞る）OK');

// ---------------- 諸経費・作成日・工事場所（見積書の欄）
await typeIn('overhead:all', '1000');
assert.equal((await tds('諸経費')).filter(Boolean)[1], '1,000');
await typeIn('date', '2026/10/1');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('令和8年10月1日'));
// 上の「見積もり作成日」（施工日の欄はない）も同じ日。そこで変えても見積書に入る。消したら当日
const estDateInput = page.getByLabel('見積もり作成日', {exact: true});
assert.equal(await estDateInput.inputValue(), '2026-10-01');
assert.equal(await page.getByLabel('施工日').count(), 0);
await estDateInput.fill('2026-11-03');
assert.ok((await sheet.locator('.form-page').first().innerText()).includes('令和8年11月3日'));
await estDateInput.fill('');
const today = new Date();
assert.equal(await estDateInput.inputValue(), [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n) => String(n).padStart(2, '0')).join('-'));
log('諸経費・作成日（見積もり作成日・消したら当日）OK');

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
await rowOp('手すり受け', '✕ 削除');
assert.equal(await sheet.locator('.form-page tr', {hasText: '手すり受け'}).count(), 0);
log('見積書の外を押すと打った値が入るOK');

// ---------------- 笹岡工務店の請求書：新しい見積書は、行を入れたときから入っている（上で確かめた）。外すと請求する月・施工日も出ない。
// 入力の画面には請求書に入る金額を出さない（金額は「請求書を見る」の仕切り計算表で確かめる）。仕切価格のない部材だけ知らせ、その場で入れられる
await typeIn('new:text', '取付金具', 'Tab');
await page.keyboard.press('Enter');
const inInvoice = page.getByLabel('工務店の請求書に入れる');
assert.equal(await inInvoice.isChecked(), true);
await inInvoice.uncheck();
assert.equal(await page.getByLabel('請求する月').count(), 0);
await inInvoice.check();
const noPrice = page.getByText('仕切価格が空欄の部材が 1 行あります');
await noPrice.waitFor();
await page.getByRole('button', {name: '仕切価格を入れる'}).click();
await page.getByRole('dialog').getByRole('textbox', {name: '取付金具の仕切価格'}).fill('300');
await page.getByRole('dialog').getByRole('button', {name: '閉じる'}).first().click();
assert.equal(await noPrice.count(), 0);
assert.ok(!(await page.locator('main').innerText()).includes('①部材代'), '入力の画面に請求書の金額が出ている');
log('工務店の請求書に最初から入る・外す・仕切価格を入れるOK');

// ---------------- 工事場所の住所の市町村が保険者と違うと知らせる（打っている途中では変えない。変えるのはボタンで）。
// みやこ町は書式は同じで保険者だけ変わる。築上町は広域連合（書式も広域連合用）。材／手を「手」にすると施工費（数量は時間・1時間2,500円）
const insurer = page.getByRole('combobox', {name: '保険者', exact: true});
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
assert.ok(hours.some((t) => /^1時間2,500円\s*×1\.2時間$/.test(t)), hours.join('|')); // 算出根拠（「1時間2500円×1.2時間みたいな感じで記載」2026-10-27）
await page.screenshot({path: path.join(outDir, '41-sheet-kouiki.png')});
log('広域連合用：材／手・時間OK');

// どの行の材／手も選んで直せる（ユーザーの指摘「材の部分が選択できない」2026-11-05。前はいちばん下の行だけ）：
// 選んだ欄をもう一度押すと 材⇔手（スマホで押すのと同じ）、「て」と打っても手、Delete で元の字。金額は変わらない
const matMark = sheet.locator('.form-page tr[data-rows]', {has: page.locator('td.mark', {hasText: '材'})}).first().locator('td.mark');
const mk = await matMark.getAttribute('data-edit');
assert.match(mk ?? '', /^line:.+:mark$/);
const sum0 = await totals();
await cellAt(matMark).click();
assert.match(await selected(), /材／手/);
assert.equal((await bar()).trim(), '材');
await input.click(); // 選んでいる欄をもう一度押す
assert.equal((await cell(mk).innerText()).trim(), '手');
await page.keyboard.press('Delete');
assert.equal((await cell(mk).innerText()).trim(), '材');
await page.keyboard.type('て');
assert.equal((await cell(mk).innerText()).trim(), '手');
assert.deepEqual(await totals(), sum0);
await page.keyboard.press('Delete');
assert.equal((await cell(mk).innerText()).trim(), '材');
log('広域連合用：どの行の材／手も直せるOK');

// 同上施工費の行を選んで「＋ 挿入」：部材と同上施工費の間に入る（ユーザーの指示「このセルにカーソルをあてていた場合の挿入は、部材と取り付け費の間に挿入をお願い」2026-11-05。
// 前は部材の上）。入る所の線も同上施工費の行の上。Ctrl+Z で戻す
{
  const rowsTr = sheet.locator('.form-page tr[data-rows]');
  const before = (await rowsTr.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const wi = before.findIndex((t, i) => i > 0 && t.includes('同上施工費') && !before[i - 1].includes('施工費'));
  assert.ok(wi > 0, before.join('\n'));
  await rowOp(rowsTr.nth(wi), '＋ 挿入');
  await sheet.locator('tr[data-flash]').waitFor();
  const after = (await rowsTr.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.equal(after.length, before.length + 1);
  assert.equal(await rowsTr.evaluateAll((els) => els.findIndex((e) => e.hasAttribute('data-flash'))), wi); // 部材のすぐ下
  assert.equal(after[wi - 1], before[wi - 1]);
  assert.match(after[wi + 1], /同上施工費/);
  await page.screenshot({path: path.join(outDir, '41b-sheet-insert-between.png')});
  await undoKey();
  await page.waitForTimeout(100);
  assert.equal(await rowsTr.count(), before.length);
}
log('同上施工費を選んで挿入すると部材と同上施工費の間OK');

// ---------------- 「請求書を確認する」で開くと、同じ入力から仕切り計算表ができている（同じデータ）
await page.waitForTimeout(600); // 自動保存を待つ
await (await openMore(page)).getByRole('button', {name: '🧾 請求書を見る'}).click(); // 上の段の「その他 ▼」の中（2026-11-03）
await page.waitForURL(/#tab=invoice&job=/);
await page.getByRole('heading', {level: 1, name: '見本 太郎様邸'}).waitFor();
const shikiri = await page.locator('aside table').innerText();
// 切って使う部材は発注書と同じ本数（ユーザーの指示「1本単位でお願いします」2026-11-12）：木の手すり 4m を 60cm（0.15本）→ 発注書は 2000mm を1本。
// サンプルの部材リストに 2000mm の品がないので、その行の仕切価格は空欄（0円）で「確かめてください」と出す（前は 0.15本×10,000円＝1,500円で 9,900）
assert.ok(shikiri.includes('部材代合計') && shikiri.includes('8,400') && shikiri.includes('5,000'), shikiri); // 取付手間 2,000＋3,000
{
  const bars = await page.locator('[data-shikiri-bars]').innerText();
  assert.match(bars, /2000mm/);
  assert.match(bars, /品番・価格を確かめてください/);
  assert.match(bars, /1本/);
}
log('仕切り計算表につながる・切って使う部材は発注書と同じ1本単位OK');

// ---------------- 様邸の画面（請求書を確認する）の左上は「← 見積もりへ戻る」：同じ見積書が開く。請求書のタブは一覧に戻っている。右の「📝 見積書を開く」も残す
assert.equal(await page.getByRole('button', {name: '← 一覧へ戻る'}).count(), 0);
assert.equal(await page.getByRole('button', {name: '📝 見積書を開く'}).count(), 1);
await page.getByRole('button', {name: '← 見積もりへ戻る'}).click();
await page.waitForURL(/#tab=estimate&job=/);
await sheet.waitFor();
assert.ok((await sheet.innerText()).includes('同上施工費'));
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 太郎様邸');
await (await navItem(page, /請求書を確認する/)).click();
await page.getByRole('cell', {name: '見本 太郎様邸', exact: true}).waitFor(); // 様邸ではなく一覧
assert.equal(await page.getByRole('button', {name: '← 見積もりへ戻る'}).count(), 0);
// 「📝 見積書を開く」でも同じ見積書
await page.getByRole('cell', {name: '見本 太郎様邸', exact: true}).click();
await page.getByRole('button', {name: '📝 見積書を開く'}).click();
await page.waitForURL(/#tab=estimate&job=/);
await sheet.waitFor();
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 太郎様邸');
log('見積書に戻れるOK（← 見積もりへ戻る・📝 見積書を開く）');

// ---------------- 商品名の幅は1本の長さにしない（ユーザーの指示「幅120mmは、商品の詳細のため、無視してください」）：
// 「…120mm幅 … 4m」に数量 0.6 → 4000mm の 0.6。備考は「定価19,800円（4m）×0.8」「2400mm÷4000mm＝0.6」（前は 0.12m・72mm÷120mm）
await typeIn('new:text', 'マツ六 BH-414 木製ベースプレート 120mm幅 Mブラウン 4m', 'Tab');
assert.equal(await selected(), '数量');
await page.keyboard.type('0.6');
await page.keyboard.press('Enter');
await typeIn(await key('BH-414', 'note'), '19800');
const plate = (await tds('BH-414')).join('|');
assert.ok(plate.includes('|0.6|本|15,840|9,504|'), plate); // 数量・単価・金額（19,800円×0.8×0.6）
assert.ok(plate.includes('定価19,800円（4m）×0.8') && plate.includes('2400mm÷4000mm＝0.6'), plate);
log('商品名の幅（120mm幅）は1本の長さにしない（4m の 0.6＝2400mm）OK');

// ---------------- 中間のブラケット（横受け。BD-01G）は自動では入れない（ユーザーの指示「手すりをいれると横受けが自動的にはいるが、はいらなくてよい」2026-11-04。
// 前は 2026-10-22 の「おねがいします」で、手すりの数量に 2400mm と入れると手すりのすぐ下に BD-01G を2個入れていた）。
// （自分で入れた BD-01G の数は cutLink.test.ts と e2e-bracket.mjs）。手すりの数量を直しても入らない・Ctrl+Z は1回で戻る
const midRow = () => sheet.locator('.form-page tr', {hasText: 'BD-01G'});
await typeIn('new:text', 'マツ六 BD-134 35アッシュ丸棒 ディンプル付 Mオーク 4m', 'Tab');
assert.equal(await selected(), '数量');
await page.keyboard.type('2400mm');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
assert.equal(await midRow().count(), 0);
await typeIn(await key('BD-134', 'qty'), '900mm');
assert.equal(await midRow().count(), 0);
await undoKey();
await page.waitForTimeout(200);
assert.ok((await tds('BD-134')).join('|').includes('2400mm÷4000mm＝0.6'), (await tds('BD-134')).join('|'));
assert.equal(await midRow().count(), 0);
log('中間のブラケット（横受け）：手すりを入れても・数量を直しても自動では入らない・Ctrl+Z で戻る OK');

// ---------------- 箇所の2行目からの改修場所の欄にも打てる（ユーザーの指示「他のセルの上に乗せた場合でも、直接変更や入力ができるようにする」2026-11-04）：
// 打つとその行（同上施工費ごと）から下が別の箇所になる。Ctrl+Z で戻る
const placeCount = async () => sheet.locator('[data-edit^="place:"][data-edit$=":name"]').count();
const placesBefore = await placeCount();
const splitName = sheet.locator('.form-page tr', {hasText: 'BD-134'}).first().locator('[data-edit^="split:"][data-edit$=":name"]');
assert.equal(await splitName.count(), 1);
await cellAt(splitName).click();
assert.equal(await selected(), '改修場所（箇所名）');
await page.keyboard.type('洗面所');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
assert.equal(await placeCount(), placesBefore + 1);
assert.match((await tds('BD-134')).join('|'), /洗面所/);
await undoKey();
await page.waitForTimeout(300);
assert.equal(await placeCount(), placesBefore);
log('箇所の2行目からの改修場所に打つと、その行から別の箇所・Ctrl+Z で戻る OK');

// ---------------- 上の段：Excelで保存・見積書を印刷・その他 ▼（メールで送付・保存・売上伝票を作成・発注書・複製、最後に削除）。白紙に戻すはない
// （ユーザーの指示「ここの部分がごちゃごちゃしているので、プルダウンにする」2026-11-03。前は2段目に並べていた）
const row1 = (await page.getByRole('group', {name: '保存・印刷'}).getByRole('button', {includeHidden: false}).allInnerTexts()).map((t) => t.trim());
assert.deepEqual(row1, ['📗 Excelで保存', '🖨 見積書を印刷', 'その他 ▼']);
// 工務店の請求書に入れる様邸は「🧾 請求書を見る」も（ユーザーの指示「請求書を見るの機能はプルダウンに含める」2026-11-03）
assert.deepEqual(await moreItems(page), ['✉ メールで送付', '💾 保存', '🧾 売上伝票を作成', '🛒 発注書を作成', '🧾 請求書を見る', '複製', '削除']);
assert.equal(await page.getByRole('button', {name: '📄 白紙に戻す'}).count(), 0);
log('上の段の並び（Excel・印刷・メールで送付など・最後に削除）・白紙に戻すはない OK');

// ---------------- 見積書の左のボタン（Excelで保存・見積書を印刷・マツ六・TOTO・介援隊）は、見えているページの表の横（ユーザーの指示「２ページ目にいっても、
// TOTO,マツ六などのカタログは２ページ目にいってもみれるようにする」2026-11-04）：行を貼り付けて2ページにし、2ページ目の表の1行目が見えているときはその横、
// 表の途中を見ているときは画面の上に付いてくる。Ctrl+Z で行を戻す
await rowOp('L型手すり', '⧉ コピー');
for (let i = 0; i < 9; i++) await ops.getByRole('button', {name: '📋 貼付'}).click();
await page.keyboard.press('Escape');
assert.ok((await sheet.locator('.form-page').count()) >= 2, '2ページにならない');
const firstRowY = () =>
  page.evaluate(() => [...document.querySelectorAll('.est-sheet .form-page')].map((pg) => pg.querySelector('tr[data-rows], tr[data-new], tr[data-blank]').getBoundingClientRect().top));
const sideY = async () => (await side.boundingBox()).y;
// 2ページ目の表の1行目が画面のまん中あたりに来るまで下へ
const page2At = async (y) => {
  const [, p2] = await firstRowY();
  await page.evaluate((d) => scrollBy(0, d), p2 - y);
  await page.waitForTimeout(250);
};
await page2At(450);
let [, p2] = await firstRowY();
assert.ok(Math.abs((await sideY()) - (p2 - 8)) < 3, `2ページ目の表の横にない side=${await sideY()} p2=${p2}`);
await page.screenshot({path: path.join(outDir, 'sheet-side-page2.png')});
// 2ページ目の表の途中（1行目が画面の上より上）：画面の上に付いてくる
await page2At(-200);
const stuck = await sideY();
assert.ok(stuck >= 0 && stuck < 20, `画面の上に付いてこない ${stuck}`);
// 1ページ目の表の1行目が見えているときは、その横（前と同じ）
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(250);
const [p1] = await firstRowY();
if (p1 + (await side.boundingBox()).height < 900) assert.ok(Math.abs((await sideY()) - (p1 - 8)) < 3, `1ページ目の表の横にない side=${await sideY()} p1=${p1}`);
for (let i = 0; i < 9; i++) await undoKey();
await page.waitForTimeout(300);
log('見積書の左のボタン：見えているページの表の横・表の途中では画面の上に付いてくる OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
