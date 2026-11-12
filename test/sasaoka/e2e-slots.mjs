// 申請書→見積書の転記の決まり（ユーザーの指示 2026-11-03「申請書を作成した際の、見積もりへの転記のルール」。railSlots.ts）と、
// 見積書の「＋ 挿入」で行が入る所（「どこにスペースが入り挿入できるかが、ややわかりずらいので、わかるようにする」）、
// 見積書 → 申請書の長さ（「既製品については、既製品の長さから読み取って長さを入力する」）を確かめる：
//   申請書で 廊下・トイレ・玄関～道路（高さ 800 → 屋外（支柱））を足す（手すりの種類の選ぶ欄はない。ユーザーの指示「ここの木手すりの選択は不要」2026-11-03）→
//   見積書の空きの行：廊下・トイレ（手すり）（ブラケット）（施工費）・玄関～道路（支柱）（手すり）（ブラケット）（施工費）→
//   廊下の（ブラケット）の内容の欄の左の「部材」（薄い「部材｜施工費｜常用」。ユーザーの指示 2026-11-03）→ 部材を選ぶ画面（検索は「ブラケット」）→ BD-08G がその行に入る →
//   選んだ行の改修内容の左の小さな「＋挿入」にマウスを乗せると BD-08G の上に線 → 押すと入った行が薄い緑 →
//   廊下の（施工費）の「施工費」→ 施工費のリスト（プルダウン）から「木」→ その行が BD-08G の同上施工費（木）になる →
//   トイレの（手すり）に TOTO の手すり I型 600mm（既製品）→ 申請書のトイレの長さの薄い字が 600・改修の内容「L=600mm」
// 部材は架空の品番・価格
// usage: node e2e-slots.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
import {clickStable, navItem} from './more.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------- 部材リスト（価格は架空）
await (await navItem(page, '📦 部材・施工費マスタ')).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csv =
  '品番,品名,定価,仕切単価\n' +
  'BD-132,35アッシュ丸棒 見本 2m,10000,6000\n' +
  'BD-08G,35エンドブラケットカバー付 ゴールド,2000,1000\n' +
  'T-600,手すり I型 600mm 見本,9000,5000\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mihon.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
await page.getByPlaceholder('例：マツ六').fill('見本工業');
await page.getByRole('button', {name: '部材リストに取り込む（3件）'}).click();
await page.getByText('新しく 3件').waitFor();
log('部材リスト OK');

// ---------------- 申請書：廊下・トイレ・玄関～道路（高さ → 屋外（支柱））。手すりの種類の選ぶ欄はない
await (await navItem(page, '📝 見積もり・申請書を作成する')).click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
const works = form.locator('[data-field="works"]');
const addPlace = async (name) => works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: name});
await addPlace('廊下');
const hall = works.getByRole('listitem', {name: /^①廊下/});
assert.equal(await hall.getByRole('combobox', {name: '手すりの種類'}).count(), 0);
await addPlace('トイレ');
const toilet = works.getByRole('listitem', {name: /^②トイレ/});
await addPlace('玄関～道路');
const outside = works.getByRole('listitem', {name: /^③玄関～道路/});
await outside.getByRole('button', {name: '＋ 高さ（任意）'}).click();
await outside.getByLabel('高さ（mm）').fill('800'); // 屋外で高さ → 屋外（支柱）
await page.waitForTimeout(600);
await page.screenshot({path: path.join(outDir, 'slots-01-shinsei.png')});
log('申請書：廊下・トイレ・玄関～道路（高さ）OK');

// ---------------- 見積書の空きの行
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const slotTexts = () => sheet.locator('[data-slot]').evaluateAll((els) => els.map((e) => `（${e.getAttribute('data-slot')}）`));
assert.deepEqual(await slotTexts(), ['（手すり）', '（ブラケット）', '（施工費）', '（手すり）', '（ブラケット）', '（施工費）', '（支柱）', '（手すり）', '（ブラケット）', '（施工費）']);
await page.screenshot({path: path.join(outDir, 'slots-02-estimate.png')});
log('見積書：廊下・トイレ 手すり・ブラケット・施工費／玄関～道路 支柱・手すり・ブラケット・施工費 OK');

// ---------------- 空きの行の「部材」：検索は「ブラケット」・その行に入る
// 空いた行の内容の欄には、まん中に薄く「部材｜施工費｜常用」だけ（名前（「（手すり）」など）は見せない）。見積書の左は Excelで保存・見積書を印刷
assert.equal((await sheet.locator('[data-slot]').first().innerText()).replace(/\s/g, ''), '部材施工費常用');
const side = sheet.getByRole('toolbar', {name: '見積書の左のボタン'});
assert.deepEqual((await side.getByRole('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['📗 Excelで保存', '🖨 見積書を印刷', '📖 マツ六', '📖 TOTO', '📖 矢崎化工']);
const bracket = sheet.locator('[data-slot="ブラケット"]').first();
// 「部材｜施工費｜常用」は欄のまん中（ユーザーの指示「部材・施工費・常用は枠内の中央揃えにする」2026-11-03。前は左に寄せていた）
const [pickBox, cellBox] = [await bracket.getByRole('group', {name: '入れるもの'}).boundingBox(), await bracket.boundingBox()];
assert.ok(Math.abs(pickBox.x + pickBox.width / 2 - (cellBox.x + cellBox.width / 2)) < 3, `まん中にない ${JSON.stringify({pickBox, cellBox})}`);
// いちばん下の打ち込める行も、まん中
const newCell = sheet.locator('tr[data-new] td', {has: page.getByRole('group', {name: '入れるもの'})}).first();
const [newPick, newBox] = [await newCell.getByRole('group', {name: '入れるもの'}).boundingBox(), await newCell.boundingBox()];
assert.ok(Math.abs(newPick.x + newPick.width / 2 - (newBox.x + newBox.width / 2)) < 3, `いちばん下の行でまん中にない ${JSON.stringify({newPick, newBox})}`);
await bracket.click({position: {x: 6, y: cellBox.height / 2}}); // 左の空いた所を押すと、その欄（行）を選ぶ（右の端には案内がかぶる）
assert.match(await sheet.getByLabel('選んでいる欄', {exact: true}).innerText(), /空白の行/);
// 選んだ欄の右の濃い緑の「⌨ 品番・品名を打つと検索」は出さない（ユーザーの指示「濃い緑の説明は不要」2026-11-03）。薄い「← 項目から選ぶ か 品番を入力」はそのまま
assert.equal(await sheet.getByRole('note').count(), 0);
assert.equal(await sheet.getByText('品番・品名を打つと検索').count(), 0);
assert.equal(await sheet.locator('tr[data-current]').count(), 1); // 選んでいる行は薄い緑
await page.screenshot({path: path.join(outDir, 'slots-02b-selected.png')});
// 選んでいる欄の上の「部材」も押せる（見えない入力欄が重なっている）
await bracket.getByRole('button', {name: '📋 部材リストから入れる'}).click({force: true});
const dlg = page.getByRole('dialog');
assert.equal(await dlg.getByPlaceholder(/商品名・品番で検索/).inputValue(), 'ブラケット');
await dlg.getByRole('row', {name: /BD-08G/}).first().getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.waitForTimeout(300);
assert.deepEqual((await slotTexts()).slice(0, 2), ['（手すり）', '（施工費）']); // 廊下の（ブラケット）が BD-08G に
const trs = sheet.locator('.form-page tr[data-rows]');
const texts = (await trs.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const bIdx = texts.findIndex((t) => t.includes('BD-08G'));
assert.equal(bIdx, 1, texts.join('\n')); // 廊下の2行目（手すりの空きの行のすぐ下）
log('空きの行を選んで部材リスト（検索「ブラケット」）→ その行に入る OK');

// ---------------- 「＋ 挿入」：マウスを乗せると入る所に線、押すと入った行が薄い緑。入るのは選んでいる行の上（Excel と同じ。ユーザーの指示
// 「挿入の場合、この間に挿入が差し込めるようにする」2026-11-03。前は選んでいる行の下）
const ops = sheet.getByRole('toolbar', {name: '行の操作'});
// 行の操作は選んでいる行（BD-08G）の改修内容の左（見積書の余白）
const [opsBox, rowBox] = [await ops.boundingBox(), await trs.nth(bIdx).boundingBox()];
assert.ok(Math.abs(opsBox.y - rowBox.y) < 3 && opsBox.x + opsBox.width <= rowBox.x, `${JSON.stringify(opsBox)} ${JSON.stringify(rowBox)}`);
const insertBtn = ops.getByRole('button', {name: '＋ 挿入'});
await insertBtn.hover();
const mark = sheet.locator('.sheet-insert-mark');
await mark.waitFor();
assert.equal((await mark.innerText()).trim(), 'ここに1行入ります');
const markBox = await mark.boundingBox();
const bBox = await trs.nth(bIdx).boundingBox();
assert.ok(Math.abs(markBox.y + markBox.height / 2 - bBox.y) < 4, `線の位置 ${markBox.y} / 行の上 ${bBox.y}`);
await page.screenshot({path: path.join(outDir, 'slots-03-insert-mark.png')});
await insertBtn.click();
await sheet.locator('tr[data-flash]').waitFor();
assert.equal(await mark.count(), 0);
const after = (await trs.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
assert.equal(after.length, texts.length + 1);
const flashIdx = await trs.evaluateAll((els) => els.findIndex((e) => e.hasAttribute('data-flash')));
assert.equal(flashIdx, bIdx); // BD-08G のすぐ上
assert.match(after[bIdx + 1], /BD-08G/);
await page.screenshot({path: path.join(outDir, 'slots-04-inserted.png')});
await sheet.locator('tr[data-flash]').waitFor({state: 'detached'}).catch(() => {});
await page.waitForFunction(() => !document.querySelector('tr[data-flash]'), null, {timeout: 4000});
log('挿入：入る所に「ここに1行入ります」の線・入った行が薄い緑（少しのあいだ）OK');

// ---------------- 空きの行の「施工費」：施工費のリスト（プルダウン）から選ぶと、その行が BD-08G の同上施工費に
await sheet.locator('[data-slot="施工費"]').first().getByRole('button', {name: '🔧 施工費から入れる'}).click();
const laborList = page.getByRole('listbox', {name: '施工費のリスト'});
await laborList.waitFor();
await page.screenshot({path: path.join(outDir, 'slots-04b-labor-list.png')});
await laborList.getByRole('option').filter({hasText: /^木\d/}).click();
await laborList.waitFor({state: 'detached'});
await page.waitForTimeout(300);
const afterLabor = (await trs.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const lIdx = afterLabor.findIndex((t) => t.includes('同上施工費'));
assert.ok(lIdx > bIdx, afterLabor.join('\n'));
assert.match(afterLabor[lIdx], /1,500/); // 木の見積の単価
assert.equal(await sheet.locator('[data-slot="施工費"]').count(), 2); // 廊下の（施工費）はなくなった（トイレ・玄関～道路のぶん）
log('空きの行の「施工費」→ 施工費のリスト → 同上施工費（木）OK');

// ---------------- トイレの（手すり）に TOTO 型の手すり I型 600mm（既製品）→ 申請書の長さ 600
await sheet.locator('[data-slot="手すり"]').nth(1).getByRole('button', {name: '📋 部材リストから入れる'}).click();
assert.equal(await dlg.getByPlaceholder(/商品名・品番で検索/).inputValue(), '');
await dlg.getByPlaceholder(/商品名・品番で検索/).fill('t600'); // 「-」なし・小文字でも出る（2026-11-03）
await dlg.getByRole('row', {name: /T-600/}).first().getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.waitForTimeout(800);
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
assert.equal(await toilet.getByLabel('長さ（mm）').inputValue(), '600'); // 薄い字ではなく、そのまま入れて見せる（2026-11-03）
// 消しても、見積書の長さ（600）に戻る（空のままにはならない）
await toilet.getByLabel('長さ（mm）').fill('');
await page.keyboard.press('Tab');
assert.equal(await toilet.getByLabel('長さ（mm）').inputValue(), '600');
assert.ok((await page.locator('body').innerText()).includes('②トイレ　手すりの取り付け　L=600mm'), '申請書の改修の内容に L=600mm がない');
await page.screenshot({path: path.join(outDir, 'slots-05-shinsei-length.png')});
log('既製品の手すり（I型 600mm）→ 申請書のトイレの長さ 600・改修の内容「L=600mm」OK');

// ---------------- いちばん下の打ち込める行（2026-11-03 のユーザーの指示）：
//   「セルを動かした場合、EXCELの様に、チカチカさせて入力できることが視覚的にわかるように」→ 欄を選ぶとカーソルが点滅（打たない欄は出さない）
//   「ダブルクリックで品番入力と説明」→ 欄をダブルクリックすると品番を打てる（右の薄い案内は「ここの説明は不要です」2026-11-04 で外した）
//   「常に入力のセル上で、部材・施工費・常用をおく」→ 打っているあいだも「部材｜施工費｜常用」は欄の上に見えて押せる（打つ所はその右）
//   「品番入力の一部でお気に入りを作成できるように」→ 候補の右の ☆ で★お気に入りに入れる。「BD132」と打って Enter で部材リストの BD-132 が入る
//   「施工費は一覧とともに、数量をふやせるように」→ 施工費のリストの −／＋（開いたまま。その数だけ金額が増える）
//   「閉じると施工費に進むの２種類をつくる」→ 部材を選ぶ画面の「🔧 施工費に進む」で、入れた部材の行の施工費のリストが開く
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
const newText = sheet.locator('tr[data-new] [data-edit="new:text"]');
await newText.scrollIntoViewIfNeeded();
// 右の薄い案内「← 項目から選ぶ か ダブルクリックで品番入力」は出さない（ユーザーの指示「ここの説明は不要です」2026-11-04）
assert.equal(await sheet.locator('.sheet-pick-guide').count(), 0);
assert.ok(!(await sheet.innerText()).includes('項目から選ぶ'));
await newText.click({position: {x: 6, y: 8}});
const sheetInput = sheet.locator('textarea.sheet-input');
// 1回押しただけで、点滅するカーソル（.sheet-caret）が欄の左の端に出る（ユーザーの指示「チカチカは左端にする」2026-11-04。数字の欄も左の端）
const caret = sheet.locator('.sheet-caret');
await caret.waitFor();
assert.equal(await caret.evaluate((el) => getComputedStyle(el).animationName), 'sheet-caret-blink');
assert.equal(await sheetInput.evaluate((el) => document.activeElement === el), true);
const cb = await caret.boundingBox();
const nb = await newText.boundingBox();
assert.ok(cb.x >= nb.x && cb.x < nb.x + 8 && cb.y >= nb.y && cb.y + cb.height <= nb.y + nb.height + 1, `${JSON.stringify(cb)} ${JSON.stringify(nb)}`);
// カーソルは「部材｜施工費｜常用」より左（空いた所）
assert.ok(cb.x + cb.width < (await newText.locator('[data-pick="material"]').boundingBox()).x, '部材のボタンより左');
await caret.evaluate((el) => (el.style.animation = 'none')); // 写真は点いているときに撮る
await page.screenshot({path: path.join(outDir, 'slots-06a-caret-new.png'), clip: {x: nb.x - 260, y: nb.y - 50, width: 760, height: 120}});
await caret.evaluate((el) => (el.style.animation = ''));
// 右寄せの数字の欄（金額・単価など）は右の端（ユーザーの指示「左側でちかちかさせるのではなく、一番右に置く」2026-11-12。前は数字の欄も左の端）
// 数の入った行（BD-08G など）の金額の欄で見る
const qtyCell = sheet.locator('.form-page tr[data-rows] [data-edit$=":amount"]').filter({hasText: /\d/}).first();
if (await qtyCell.count()) {
  assert.equal(await qtyCell.evaluate((el) => getComputedStyle(el).textAlign), 'right');
  const qb = await qtyCell.boundingBox();
  await page.mouse.click(qb.x + qb.width / 2, qb.y + qb.height / 2);
  await caret.waitFor();
  const qc = await caret.boundingBox();
  assert.ok(qc.x + qc.width <= qb.x + qb.width && qc.x > qb.x + qb.width - 10, `金額の欄のカーソル ${JSON.stringify(qc)} ${JSON.stringify(qb)}`);
  // 打つ字も右から（入力欄の右の端が欄の右の端）
  await page.keyboard.type('1');
  const ib = await sheetInput.boundingBox();
  assert.ok(Math.abs(ib.x + ib.width - (qb.x + qb.width)) < 2, `金額の欄の入力欄 ${JSON.stringify(ib)} ${JSON.stringify(qb)}`);
  assert.equal(await sheetInput.evaluate((el) => getComputedStyle(el).textAlign), 'right');
  await page.keyboard.press('Escape');
  await page.screenshot({path: path.join(outDir, 'slots-06b-caret.png'), clip: {x: qb.x - 300, y: qb.y - 60, width: 700, height: 160}});
  // 字のある欄は、点滅するカーソルが字の末尾（最後の字のすぐ右。ユーザーの指示「チカチカする編集マークは末尾につける」2026-11-12）。
  // Backspace は1字ずつ消す（「文字も一文字ずつでも消せるようにする。EXCELに近づける」。前は欄をまるごと消していた）。Esc でやめると元のまま
  const textCell = sheet.locator('.form-page tr[data-rows] [data-edit$=":text"]').filter({hasText: /BD-/}).first();
  const tb = await textCell.boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await caret.waitFor();
  const tc = await caret.boundingBox();
  const end = await textCell.evaluate((el) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim() && !n.parentElement.closest('button, [data-pick]')) last = n;
    const r = document.createRange();
    const len = last.textContent.trimEnd().length;
    r.setStart(last, len - 1);
    r.setEnd(last, len);
    const rs = r.getClientRects();
    const b = rs[rs.length - 1];
    return {right: b.right, top: b.top, bottom: b.bottom};
  });
  assert.ok(Math.abs(tc.x - end.right) < 4 && tc.x > tb.x + 20, `内容の欄のカーソルが字の末尾にない ${JSON.stringify(tc)} ${JSON.stringify(end)}`);
  assert.ok(tc.y < end.bottom && tc.y + tc.height > end.top, `カーソルが最後の行にない ${JSON.stringify(tc)} ${JSON.stringify(end)}`);
  await caret.evaluate((el) => (el.style.animation = 'none'));
  await page.screenshot({path: path.join(outDir, 'slots-06c-caret-end.png'), clip: {x: tb.x - 120, y: tb.y - 40, width: 560, height: 110}});
  await caret.evaluate((el) => (el.style.animation = ''));
  await page.keyboard.press('F2');
  const full = await sheetInput.inputValue();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  assert.equal(await sheetInput.evaluate((el) => el.classList.contains('editing')), true);
  assert.equal(await sheetInput.inputValue(), [...full].slice(0, -1).join(''));
  await page.keyboard.press('Backspace');
  assert.equal(await sheetInput.inputValue(), [...full].slice(0, -2).join(''));
  assert.equal(await sheetInput.evaluate((el) => el.selectionStart === el.value.length), true, 'カーソルが末尾にない');
  await page.keyboard.press('Escape');
  assert.ok((await textCell.innerText()).replace(/\s+/g, '').includes(full.replace(/\s+/g, '').slice(-4)), '消さずにやめたのに字が変わった');
  // 数字の欄も1字ずつ（金額の末尾の1字が消える）
  await page.mouse.click(qb.x + qb.width / 2, qb.y + qb.height / 2);
  await page.keyboard.press('F2');
  const amount = await sheetInput.inputValue();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  assert.equal(await sheetInput.inputValue(), amount.slice(0, -1));
  await page.keyboard.press('Escape');
  log('字の末尾にカーソル・Backspace で1字ずつ消す（内容・金額）OK');
  await page.mouse.click(nb.x + 6, nb.y + nb.height / 2);
}
const rowsBefore = await trs.count();
const nb2 = await newText.boundingBox();
await page.mouse.dblclick(nb2.x + 6, nb2.y + nb2.height / 2); // 欄の左の空いた所（「部材」の左）をダブルクリック
assert.equal(await sheetInput.evaluate((el) => el.classList.contains('editing')), true);
assert.equal(await sheetInput.getAttribute('aria-label'), '内容（品名）');
// 打っているあいだも「施工費」のボタンが見えて、いちばん上にある（入力欄の下に隠れない）
const laborBtn = newText.locator('[data-pick="labor"]');
const lb = await laborBtn.boundingBox();
assert.equal(await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.getAttribute('data-pick'), {x: lb.x + lb.width / 2, y: lb.y + lb.height / 2}), 'labor');
await page.keyboard.type('bd132');
const sug = page.getByRole('listbox', {name: '候補'});
await sug.getByRole('option').first().waitFor();
assert.equal(await sug.getByRole('option', {selected: true}).count(), 1); // 品番がぴったりの部材は、↓で選ばなくても選ばれている
await sug.getByRole('button', {name: /お気に入りに入れる$/}).first().click();
await sug.getByRole('button', {name: /お気に入りから外す$/}).first().waitFor();
await page.screenshot({path: path.join(outDir, 'slots-07-hinban.png')});
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
assert.equal(await trs.count(), rowsBefore + 1);
assert.match((await trs.last().innerText()).replace(/\s+/g, ' '), /BD-132/);
// 施工費のリストの −／＋（開いたまま）。その部材の同上施工費が 木 1,500円×2＝3,000円
await clickStable(sheet.locator('tr[data-new] [data-pick="labor"]'));
await laborList.waitFor();
const wood = laborList.getByRole('group', {name: /^木の数量$/});
await wood.getByRole('button', {name: /1つ増やす/}).click();
await wood.getByRole('button', {name: /1つ増やす/}).click();
assert.equal((await wood.getByLabel(/^木の数$/).innerText()).trim(), '2');
assert.equal(await laborList.isVisible(), true);
await page.screenshot({path: path.join(outDir, 'slots-08-labor-qty.png')});
let lastRow = (await trs.last().innerText()).replace(/\s+/g, ' ');
assert.match(lastRow, /同上施工費 1 式 3,000 3,000/, lastRow);
await wood.getByRole('button', {name: /1つ減らす/}).click();
assert.equal((await wood.getByLabel(/^木の数$/).innerText()).trim(), '1');
lastRow = (await trs.last().innerText()).replace(/\s+/g, ' ');
assert.match(lastRow, /同上施工費 1 式 1,500 1,500/, lastRow);
await page.keyboard.press('Escape');
await laborList.waitFor({state: 'detached'});
// 部材を選ぶ画面の「🔧 施工費に進む」
await clickStable(sheet.locator('tr[data-new] [data-pick="material"]'));
assert.equal(await dlg.getByRole('button', {name: /^すべて/}).getAttribute('aria-pressed'), 'true'); // 開いたときは「すべて」
// 外のサイトのカタログへのリンク（マツ六・TOTO・介援隊）は外した（いただいた PDF のカタログがアプリの中にある。ユーザーの「マツ六、TOTO 、矢崎です」2026-11-04）
assert.equal(await page.getByRole('link', {name: /のカタログを開く/}).count(), 0);
const sideBar = page.getByRole('toolbar', {name: '見積書の左のボタン'});
await dlg.getByRole('row', {name: /T-600/}).first().getByRole('button', {name: '＋ 追加'}).click();
await page.screenshot({path: path.join(outDir, 'slots-09-next-labor-button.png')});
await dlg.getByRole('button', {name: '🔧 施工費に進む'}).click();
await laborList.waitFor();
await laborList.getByRole('option').filter({hasText: /^木\d/}).click();
await laborList.waitFor({state: 'detached'});
await page.waitForTimeout(300);
const tail = (await trs.allInnerTexts()).slice(-2).map((t) => t.replace(/\s+/g, ' ').trim());
assert.match(tail[0], /T-600/, tail.join('|'));
assert.match(tail[1], /^同上施工費 1 式 1,500/, tail.join('|'));
// 緑の行の2行下の空いた行にも直接打てる：押した欄が選ばれ（緑の行へ移らない）、打つとその行の位置に入る
// （ユーザーの指示「別のセルでも入力したり、編集したりできるようにする」2026-11-04）
const gapQty = sheet.locator('tr[data-blank] [data-edit="gap:2:qty"]');
await gapQty.scrollIntoViewIfNeeded();
const gq = await gapQty.boundingBox();
await page.mouse.click(gq.x + gq.width / 2, gq.y + gq.height / 2);
const selBox = await sheet.locator('.sheet-sel').boundingBox();
assert.ok(Math.abs(selBox.y - gq.y) < 2 && Math.abs(selBox.x - gq.x) < 2, `選んだ欄 ${JSON.stringify(selBox)} ${JSON.stringify(gq)}`);
const gc = await caret.boundingBox();
assert.ok(gc.x >= gq.x && gc.x < gq.x + 8 && gc.y >= gq.y, `空いた行のカーソル ${JSON.stringify(gc)}`);
await caret.evaluate((el) => (el.style.animation = 'none'));
await page.screenshot({path: path.join(outDir, 'slots-10-gap-select.png'), clip: {x: gq.x - 420, y: gq.y - 90, width: 760, height: 150}});
// 金額の欄（打たない欄）を押すと、同じ行のとなりの欄（緑の行へ移らない）
const gapRow = gapQty.locator('xpath=..');
const amountTd = gapRow.locator('td').nth(6);
const ab = await amountTd.boundingBox();
await page.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2);
const selBox2 = await sheet.locator('.sheet-sel').boundingBox();
assert.ok(Math.abs(selBox2.y - gq.y) < 2, `金額の欄を押した ${JSON.stringify(selBox2)}`);
await page.mouse.click(gq.x + gq.width / 2, gq.y + gq.height / 2);
const rowIndex = (loc) => loc.evaluate((tr) => [...tr.parentElement.children].indexOf(tr)); // ページの表の中の何行目か（打つと画面が動くので位置では比べない）
const gapIndex = await rowIndex(gapRow);
const before = await trs.count();
await page.keyboard.type('2');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
assert.equal(await trs.count(), before + 3); // 空白の行2つ＋打った行
const filled = trs.nth(before + 2);
assert.equal(await rowIndex(filled), gapIndex, '打った行が押した行の位置にない');
assert.equal((await filled.locator('[data-edit$=":qty"]').first().innerText()).trim(), '2');
await filled.scrollIntoViewIfNeeded();
const fb = await filled.boundingBox();
await page.screenshot({path: path.join(outDir, 'slots-11-gap-typed.png'), clip: {x: fb.x, y: fb.y - 110, width: 760, height: 170}});
log('打ち込める行：カーソルの点滅（左の端）・ダブルクリックで品番・☆でお気に入り・BD132＋Enter・施工費の −／＋・施工費に進む・下の空いた行にも打てる OK');
// ---------------- 見積書の左の「📖 マツ六」「📖 TOTO」「📖 矢崎化工」（ユーザーの「マツ六、TOTO 、矢崎です」2026-11-04。前は外のサイトのリンク マツ六・TOTO・介援隊）：
// アプリの中のカタログ（いただいた PDF）がそのカタログのページで開き、品番の「＋ 追加」を押すと見積書に入る
const books = sideBar.getByRole('group', {name: 'メーカーのカタログ'});
assert.deepEqual((await books.getByRole('button').allInnerTexts()).map((t) => t.trim()), ['📖 マツ六', '📖 TOTO', '📖 矢崎化工']);
const rowsBeforeCat = await trs.count();
await books.getByRole('button', {name: 'TOTOのカタログから選ぶ'}).click();
const totoCat = dlg.getByRole('region', {name: 'TOTOカタログ'});
await totoCat.waitFor();
assert.equal(await totoCat.getByRole('group', {name: 'カタログ'}).getByRole('button', {name: 'TOTO', exact: true}).getAttribute('aria-pressed'), 'true');
assert.deepEqual((await totoCat.getByRole('group', {name: 'カタログ'}).getByRole('button').allInnerTexts()).map((t) => t.trim()), ['マツ六', 'TOTO', '矢崎化工']);
const catItem = totoCat.getByRole('list', {name: 'このページの品番'}).getByRole('listitem').first();
const catCode = (await catItem.locator('div.font-bold').first().innerText()).trim();
await page.screenshot({path: path.join(outDir, 'slots-12-side-catalog.png')});
await catItem.getByRole('button').click();
const chooser = totoCat.getByRole('group', {name: /の色・種類を選ぶ/});
if (await chooser.count()) await chooser.getByRole('button').nth(1).click(); // 色ちがいがあれば1つ選ぶ
await dlg.getByRole('button', {name: '選び終わったら閉じる'}).click();
await dlg.waitFor({state: 'detached'});
await page.waitForTimeout(300);
assert.ok((await trs.count()) > rowsBeforeCat, 'カタログの品番が見積書に入らない');
assert.ok((await sheet.innerText()).replace(/\s/g, '').includes(catCode.replace(/#.*$/, '').replace(/\s/g, '')), `見積書に ${catCode} がない`);
log(`見積書の左のカタログ（マツ六・TOTO・矢崎化工）：TOTO のカタログで ${catCode} を入れる OK`);
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();

// ---------------- スマホの幅：申請書の箇所の行がはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(300);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 392, '横にはみ出す');
await hall.scrollIntoViewIfNeeded();
await page.screenshot({path: path.join(outDir, 'slots-06-mobile.png')});
log('スマホの幅 OK');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'ERRORS: なし');
await browser.close();
if (errors.length) process.exit(1);
console.log('ALL OK');
