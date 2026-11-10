// 平面図のタブ（📐 平面図。ユーザーの指示「平面図をつくれるような機能を追加する。まどりっちの機能やマイホームクラウドの機能もつけくわえる」2026-11-09）：
//   部屋（マイホームクラウドと同じ一覧）を方眼にドラッグ → ドアを壁の近くで押すと壁に付く → トイレは壁ぎわ → 申請書の箇所（①玄関）の手すり → 一覧（右の枠）が
//   申請書の改修の内容と同じ → 選んで動かす・Delete・Ctrl+Z → 2階 → 読み直しても残る（#…&view=madori）→ 見取図を印刷（A4横）→ Excel（階ごとのシート・画像）
//   → 申請書の平面図に入れる → スマホの幅で横にはみ出さない。お客様は架空のサンプル
// usage: node e2e-madori.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();

// ---------------- タブ
await page.getByRole('tab', {name: '📐 平面図'}).click();
await page.waitForFunction(() => location.hash.includes('view=madori'));
const canvas = page.locator('[data-madori-canvas] svg');
await canvas.waitFor();
const art = () => canvas.evaluate((s) => s.querySelector('g:not([opacity])')?.innerHTML ?? '');
const M = 910;
/** 図の mm → 画面の位置 */
const toPx = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const s = document.querySelector('[data-madori-canvas] svg');
      const vb = s.viewBox.baseVal;
      const r = s.getBoundingClientRect();
      return {x: r.left + ((x - vb.x) * r.width) / vb.width, y: r.top + ((y - vb.y) * r.height) / vb.height};
    },
    [x, y],
  );
const drag = async (a, b) => {
  const p = await toPx(...a);
  const q = await toPx(...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, {steps: 3});
  await page.mouse.move(q.x, q.y, {steps: 3});
  await page.mouse.up();
};
const click = async (x, y) => {
  const p = await toPx(x, y);
  await page.mouse.click(p.x, p.y);
};
const cat = (name) => page.getByRole('tab', {name, exact: true}).click();
const tool = (name) => page.getByRole('button', {name, exact: true}).first().click();
const legend = () => page.locator('ul.text-rose-600 li').allInnerTexts();

// ---------------- 部屋（マイホームクラウドと同じ並び）
await cat('部屋');
const roomNames = await page.locator('[data-madori-palette]').locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('title')).filter(Boolean));
assert.deepEqual(roomNames.slice(0, 7), ['ポーチ', '土間', '玄関', '廊下', 'ベランダ', '駐車場', 'テラス']); // 段ごとの並び（2026-11-10）
assert.ok(roomNames.includes('寝室') && roomNames.at(-1) === '広縁' && !roomNames.includes('ウォークインクローゼット'));
// 白紙の平面図は、開いたときから洋室が選ばれている（なぞればすぐ描ける）。同じ道具をもう一度押しても外れない
const pressed = (name) => page.getByRole('button', {name, exact: true}).first().getAttribute('aria-pressed');
assert.equal(await pressed('洋室'), 'true');
await tool('和室');
await tool('和室');
assert.equal(await pressed('和室'), 'true');
await drag([0, 0], [3 * M, 4 * M]);
await tool('廊下');
await drag([0, 4 * M], [6 * M, 5 * M]);
await tool('トイレ');
await drag([3 * M, 0], [4 * M, 1.5 * M]);
await tool('玄関');
await drag([4 * M, 3.5 * M], [6 * M, 5 * M]);
assert.match(await art(), /和室/);
assert.doesNotMatch(await art(), /<line|>2730</); // 寸法線は初めは出さない
assert.match(await art(), /fill="#e3f6e8"/); // 和室は一覧のボタンと同じ緑
assert.match(await art(), /fill="#e3d8c4"/); // 廊下は茶色
assert.doesNotMatch(await art(), /帖/); // 寸法・広さ（帖）は初めはオフ
await page.getByRole('checkbox', {name: '広さ（帖）'}).check();
assert.match(await art(), />6帖</); // 3×4 マス＝6帖（㎡は出さない）
assert.doesNotMatch(await art(), /㎡/);
await page.getByRole('checkbox', {name: '寸法'}).check();
assert.match(await art(), />2730</);
await page.getByRole('checkbox', {name: '寸法'}).uncheck();
log('部屋：ドラッグで方眼に・帖・色・寸法線なし OK');

// ---------------- 戻す・進むは上の段のまん中、ホイールで拡大・縮小（下へ回すと遠く）
{
  const bar = await page.getByRole('toolbar', {name: '平面図の設定'}).boundingBox();
  const undoBox = await page.getByRole('button', {name: '↶ 戻す'}).boundingBox();
  const mid = undoBox.x + undoBox.width / 2;
  assert.ok(mid > bar.x + bar.width * 0.35 && mid < bar.x + bar.width * 0.65, `戻すが上の段のまん中 ${mid} / ${bar.x}..${bar.x + bar.width}`);
  const vbw = () => canvas.evaluate((s) => s.viewBox.baseVal.width);
  const w0 = await vbw();
  const c = await toPx(3 * M, 2 * M);
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(150);
  assert.ok((await vbw()) > w0 * 1.3, 'ホイールを下へ回すと遠く（方眼が小さく）');
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(150);
  assert.ok(Math.abs((await vbw()) - w0) < w0 * 0.05, 'ホイールを上へ回すと元の大きさに');
}
log('戻す・進むはまん中・ホイールで拡大・縮小 OK');

// ---------------- 建具は壁に、設備は壁ぎわに
await cat('間口');
await tool('片開き戸');
await click(1.5 * M, 4 * M + 150); // 和室と廊下の間の壁の少し下
await cat('住設');
await tool('洋式便器');
await click(3.5 * M, 300);
const svgNow = await art();
const door = /translate\(([\d.]+) 3640\) rotate\(0\)/.exec(svgNow); // ドアの開口のまん中が壁の上（y＝和室と廊下の間の壁）
assert.ok(door && (Number(door[1]) - 390) % 227.5 === 0, `ドアの開口の端は半マスの半分にそろう ${door?.[1]}`);
assert.match(svgNow, /translate\(2985 30\)/); // 便器は上の壁の面（y=30）にぴったり・押した所（3.5マス＝3185）がまん中
log('ドアは壁に・便器は壁ぎわ OK');

// ---------------- 申請書の箇所（①玄関）の手すり → 一覧は申請書の改修の内容
await cat('改修');
await page.getByRole('button', {name: /① 玄関/}).click();
await drag([4.2 * M, 4.9 * M], [5.8 * M, 4.9 * M]);
await tool('縦手すり');
await click(3.9 * M, 0.7 * M);
await page.keyboard.press('Escape');
const rows = await legend();
assert.equal(rows.length, 2);
assert.match(rows[0], /^①　玄関　手すりの取り付け/);
assert.equal(rows[1], '②　縦手すり　L＝800mm');
assert.equal(await page.getByRole('button', {name: /① 玄関.*✓/}).count(), 1); // 図に置いた箇所に ✓
log('申請書の箇所につないだ手すり①・縦手すり②・一覧 OK');

// ---------------- 選んで動かす・Delete・Ctrl+Z
await click(1.5 * M, 2 * M); // 和室を選ぶ
await page.getByRole('combobox', {name: '部屋の種類'}).waitFor();
assert.equal(await page.getByRole('combobox', {name: '部屋の種類'}).inputValue(), '和室');
await page.keyboard.press('Delete');
assert.doesNotMatch(await art(), /和室/);
await page.keyboard.press('Control+z');
assert.match(await art(), /和室/);
await click(1.5 * M, 2 * M);
await page.getByRole('textbox', {name: '部屋の名前'}).fill('寝室（和室）');
await page.keyboard.press('Escape');
assert.match(await art(), /寝室（和室）/);
log('選ぶ・消す・Ctrl+Z・名前 OK');

// ---------------- 図の上でそのまま文字を打つ（Excel と同じ）・回すつまみ
await cat('作図');
await tool('文字');
await click(0.3 * M, 5.5 * M);
const inplace = page.getByRole('textbox', {name: '図に打つ文字'});
await inplace.waitFor();
await page.keyboard.type('手すり位置');
await page.keyboard.press('Enter');
assert.match(await art(), />手すり位置</);
// 部屋はダブルクリックでその場で名前を直す
const hall = await toPx(1 * M, 4.5 * M);
await page.mouse.dblclick(hall.x, hall.y);
await inplace.waitFor();
assert.equal(await inplace.inputValue(), '廊下');
await page.keyboard.press('Control+a');
await page.keyboard.type('通路');
await page.keyboard.press('Enter');
assert.match(await art(), />通路</);
// 選んだまま打ち始めると、その字から書きかえる
await click(3.3 * M, 1.3 * M); // トイレの部屋（便器の下の空いた所）
await page.keyboard.type('WC');
await page.keyboard.press('Enter');
assert.match(await art(), />WC</);
// 回すつまみ（↻）：階段を置いて、つまみを押すと 90°回る
await cat('階段');
await tool('直階段');
await click(8 * M, 3 * M); // 方眼の上の端だと、つまみが方眼の外（描く道具の段の所）に出るので少し下に
{
  const tb = await page.locator('[data-turn-handle] circle').boundingBox();
  const cb = await page.locator('[data-madori-canvas]').boundingBox();
  assert.ok(tb.y > cb.y, `つまみが方眼の中 ${JSON.stringify([tb, cb])}`);
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
}
assert.match(await art(), /rotate\(90 /);
// 横手すりを一筆で L 字に（横へなぞって、角で下へ）
await cat('改修');
await tool('横手すり');
{
  const a = await toPx(7 * M, 4 * M);
  const c = await toPx(8 * M, 4 * M);
  const b = await toPx(8 * M, 5 * M);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, {steps: 5});
  await page.mouse.move(b.x, b.y, {steps: 5});
  await page.mouse.up();
}
await page.keyboard.press('Escape');
assert.ok((await legend()).some((r) => /L型　910×910mm|L型　900×900mm|L型　9\d0×9\d0mm/.test(r)), `一筆の L 字 ${JSON.stringify(await legend())}`);
await page.keyboard.press('Control+z');
for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z'); // 文字・通路・WC・階段・回す
// ---------------- 部屋を頂点で描く（角を順に押す・はじめの点で閉じる）・頂点（■）で形を変える
await cat('部屋');
await tool('洋室');
for (const [x, y] of [[8, 0], [11, 0], [11, 1], [9, 1], [9, 3], [8, 3]]) await click(x * M, y * M);
await click(8 * M, 0);
assert.match(await art(), /<path d="M7280 0L10010 0L10010 910L8190 910L8190 2730L7280 2730Z" fill="#fff6d6"/);
// 欠いた所の角（■）を右下へ → 部屋が広がる
{
  const h = page.locator('[data-handle="v3"]');
  const b = await h.boundingBox();
  const to = await toPx(10 * M, 2 * M);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps: 6});
  await page.mouse.up();
  assert.match(await art(), /M7280 0L10010 0L10010 1820L9100 1820L9100 2730L7280 2730Z/); // 欠きが小さくなった L 字
}
await page.keyboard.press('Escape');
// ---------------- Excel のような図形（上の段の「図形」）
await page.getByRole('toolbar', {name: '描く道具'}).getByRole('button', {name: '四角', exact: true}).click();
await drag([1 * M, 6 * M], [3 * M, 7 * M]);
assert.match(await art(), /<g transform="translate\(910 5460\)"><path d="M0 0H1820V910H0Z" fill="none" fill-rule="evenodd" stroke="#e01b24" stroke-width="30"/);
// 「図形 ▼」の一覧（基本図形・線・矢印）から右矢印を選ぶ → 最近使用した図形に出る
await page.getByRole('button', {name: '図形 ▼'}).click();
const gallery = page.locator('[aria-label="図形の一覧"]');
await gallery.getByRole('button', {name: '右矢印', exact: true}).click();
assert.equal(await gallery.count(), 0);
await drag([4 * M, 6 * M], [6 * M, 7 * M]);
assert.match(await art(), /<g transform="translate\(3640 5460\)"><path d="M0 227.5L1092 227.5L1092 0L1820 455/);
await page.getByRole('button', {name: '図形 ▼'}).click();
assert.ok((await gallery.innerText()).includes('最近使用した図形'));
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
// ---------------- 方眼の下のスクロールバーで横に動かす
{
  const vx = () => canvas.evaluate((s) => s.viewBox.baseVal.x);
  const x0 = await vx();
  await page.locator('[data-scroll-thumb="x"]').scrollIntoViewIfNeeded();
  const th = await page.locator('[data-scroll-thumb="x"]').boundingBox();
  // まん中の下にお知らせが出ていることがあるので、つまみの左の端を持つ
  await page.mouse.move(th.x + 12, th.y + th.height / 2);
  await page.mouse.down();
  await page.mouse.move(th.x + 92, th.y + th.height / 2, {steps: 4});
  await page.mouse.up();
  const x1 = await vx();
  assert.ok(x1 > x0 + 100, `スクロールバーで右へ ${x0} → ${x1} ${JSON.stringify(th)}`);
}
for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z'); // 図形・頂点・多角形の部屋
assert.match(await art(), /寝室（和室）/);
assert.doesNotMatch(await art(), /手すり位置|通路|>WC</);
log('図の上で文字を打つ・回すつまみ・L字の手すり・頂点で描く部屋と形を変える・図形・スクロールバー OK');

// ---------------- 方眼の上のまん中の描く道具（図形・横棒/L字・丸・文字・番号）・曲げた手すり・ぐしゃぐしゃで消す
// （ユーザーの指示「以下のボタンと図形ボタンは中央にもってくる」「横棒とL字など、自由自在に曲げれる棒」「○（塗り潰し）」「番号1番から自動で…15まで」「グジャグジャってすると線や図形は消せる」2026-11-10）
{
  const bar = page.getByRole('toolbar', {name: '描く道具'});
  const bb = await bar.boundingBox();
  const cb = await page.locator('[data-madori-canvas]').boundingBox();
  // 丸・横四角・横棒・自在棒・文字は段のど真ん中、戻す・進むも上の段のど真ん中、寸法・広さは右（ユーザーの指示 2026-11-10）
  const mid = (b) => b.x + b.width / 2;
  const cg = await bar.locator('[data-draw-center]').boundingBox();
  assert.ok(Math.abs(mid(cg) - mid(bb)) < 3, `描く道具のど真ん中 ${JSON.stringify([bb, cg])}`);
  assert.deepEqual(await bar.locator('[data-draw-center] button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['丸（塗りつぶし）', '横四角（塗りつぶし）', '横棒', '自在棒', '文字']);
  const sb = await page.getByRole('toolbar', {name: '平面図の設定'}).boundingBox();
  const ub = await page.locator('[data-undo-center]').boundingBox();
  assert.ok(Math.abs(mid(ub) - mid(sb)) < 3 && Math.abs(mid(sb) - mid(bb)) < 3, `戻す・進むのど真ん中 ${JSON.stringify([sb, ub])}`);
  // 住設（トイレ・浴槽・キッチン・ベッド・下駄箱）は番号の右（ユーザーの指示「住設も選べるように」2026-11-10）
  assert.deepEqual(await bar.locator('[data-quick-fix]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['トイレ（便器）', '浴槽', 'キッチン', 'ベッド', '下駄箱']);
  {
    const n0 = (await art()).length;
    await bar.getByRole('button', {name: 'ベッド', exact: true}).click();
    assert.equal(await bar.getByRole('button', {name: 'ベッド', exact: true}).getAttribute('aria-pressed'), 'true');
    await click(9 * M, 6 * M);
    assert.ok((await art()).length > n0, 'ベッドを置いた');
    await page.keyboard.press('Control+z');
    assert.equal((await art()).length, n0);
  }
  const dimBox = await page.getByRole('checkbox', {name: '寸法'}).boundingBox();
  assert.ok(dimBox.x > mid(sb), '寸法は右');
  assert.ok(bb.y + bb.height <= cb.y + 1 && cb.y - (bb.y + bb.height) < 16, `方眼のすぐ上 ${JSON.stringify([bb, cb])}`);
  // コ字をなぞる → 曲げた手すり。選んだまま：角（■）4つと区間のまん中（□）3つ
  await bar.getByRole('button', {name: '自在棒'}).click();
  const px = [];
  for (const q of [[1 * M, 6 * M], [1 * M, 8 * M], [4 * M, 8 * M], [4 * M, 6 * M]]) px.push(await toPx(...q));
  await page.mouse.move(px[0].x, px[0].y);
  await page.mouse.down();
  for (const q of px.slice(1)) await page.mouse.move(q.x, q.y, {steps: 10});
  await page.mouse.up();
  assert.equal(await page.locator('[data-handle^="v"]').count(), 4);
  assert.equal(await page.locator('[data-handle^="e"]').count(), 3);
  // 下の区間のまん中（□）をつまんで下へ → もう1つ曲がる
  {
    const h = await page.locator('[data-handle="e1"]').boundingBox();
    const to = await toPx(2.5 * M, 9 * M);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 6});
    await page.mouse.up();
  }
  assert.equal(await page.locator('[data-handle^="v"]').count(), 5);
  const v0 = await page.locator('[data-handle="v0"]').boundingBox();
  const v1 = await page.locator('[data-handle="v1"]').boundingBox();
  await page.keyboard.press('Escape');
  const bent = /L＝[\d,]+(＋[\d,]+){2,}mm/;
  assert.ok((await legend()).some((r) => bent.test(r)), `曲げた手すり ${JSON.stringify(await legend())}`);
  // 手すりの上をぐしゃぐしゃに書く（選ぶ・動かすのまま）→ 消える。戻すで戻る
  {
    const c = {x: v0.x + v0.width / 2 + (v1.x - v0.x) * 0.3, y: v0.y + v0.height / 2 + (v1.y - v0.y) * 0.3};
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 9; i++) await page.mouse.move(c.x + (i % 2 ? 45 : -45), c.y + i * 3, {steps: 3});
    await page.mouse.up();
  }
  assert.ok(!(await legend()).some((r) => bent.test(r)), `ぐしゃぐしゃで消えた ${JSON.stringify(await legend())}`);
  await page.getByText('1つ消しました').last().waitFor();
  await page.keyboard.press('Control+z');
  assert.ok((await legend()).some((r) => bent.test(r)), '戻すで戻る');
  // 描く道具（図形）を選んで、図形の上をぐしゃぐしゃ → 図形も消える（新しい図形は置かない）
  await bar.getByRole('button', {name: '四角', exact: true}).click();
  await drag([5 * M, 6 * M], [7 * M, 7 * M]);
  const boxes = () => art().then((h) => (h.match(/<path d="M0 0H1820V910H0Z"/g) ?? []).length);
  assert.equal(await boxes(), 1);
  await bar.getByRole('button', {name: '直線', exact: true}).click();
  {
    const c = await toPx(6 * M, 6.5 * M);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 9; i++) await page.mouse.move(c.x + (i % 2 ? 40 : -40), c.y + (i % 3) * 4, {steps: 3});
    await page.mouse.up();
  }
  assert.equal(await boxes(), 0);
  assert.doesNotMatch(await art(), /<path d="M0 0L/); // ぐしゃぐしゃの線を直線として置いていない
  await page.keyboard.press('Control+z'); // 消した図形を戻す
  assert.equal(await boxes(), 1);
  // 丸（縦手すり）は塗りつぶしの青
  const dots = () => art().then((h) => (h.match(/r="75" fill="#0070c0"/g) ?? []).length);
  const dots0 = await dots();
  await bar.getByRole('button', {name: '丸（塗りつぶし）'}).click();
  await click(8 * M, 7 * M);
  assert.equal(await dots(), dots0 + 1);
  // 番号：押すたびに次の番号（道具はそのまま）
  const numBtn = bar.getByRole('button', {name: /番号$/});
  const circled = (n) => String.fromCharCode(0x2460 + n - 1);
  const n0 = (await numBtn.innerText()).trim().codePointAt(0) - 0x2460 + 1;
  await numBtn.click();
  for (let i = 0; i < 3; i++) await click((5 + i) * M, 8.3 * M); // 9マス目は方眼の下のスクロールバーに重なる
  assert.equal(await numBtn.getAttribute('aria-pressed'), 'true');
  assert.ok((await numBtn.innerText()).includes(circled(n0 + 3)), await numBtn.innerText());
  for (let i = 0; i < 3; i++) assert.ok((await art()).includes(`>${circled(n0 + i)}<`), `番号 ${circled(n0 + i)}`);
  await page.keyboard.press('Escape');
  // 戻す：番号3つ・丸・図形・曲げ・手すり（消したのは戻してあるので数えない）
  for (let i = 0; i < 3 + 1 + 1 + 1 + 1; i++) await page.keyboard.press('Control+z');
  assert.ok(!(await legend()).some((r) => bent.test(r)));
  assert.doesNotMatch(await art(), /<path d="M0 0H1820V910H0Z"/);
  assert.equal(await dots(), dots0);
}
log('方眼の上のまん中の描く道具・曲げた手すり（□で曲げる）・ぐしゃぐしゃで消す・丸・番号 OK');

// ---------------- 2階
await page.getByRole('button', {name: '＋ 階'}).click();
await page.getByRole('tab', {name: '2階'}).waitFor();
await cat('部屋');
await tool('洋室');
await drag([0, 0], [3 * M, 4 * M]);
await cat('改修');
await tool('横手すり');
await click(1.5 * M, 3.8 * M);
await page.keyboard.press('Escape');
assert.equal((await legend()).at(-1), '③　L＝600mm'); // 階をまたいで通し番号
await page.getByRole('tab', {name: '1階', exact: true}).click();
log('2階・通し番号 OK');

// ---------------- 読み直しても残る（保存は打ち終わって 0.4 秒後）
await page.waitForTimeout(1500);
await page.reload();
await canvas.waitFor();
await page.waitForFunction(() => document.querySelector('[data-madori-canvas] svg')?.innerHTML.includes('寝室（和室）'));
assert.equal(await page.getByRole('tab', {name: '2階'}).count(), 1);
log('読み直し OK');

// ---------------- 見取図の印刷（A4横）
await page.getByRole('button', {name: '🖨 見取図を印刷'}).click();
const sheets = page.locator('.madori-page');
assert.equal(await sheets.count(), 2);
const first = await sheets.first().innerHTML();
assert.match(first, /住宅改修工事　見取図（1階）/);
assert.match(first, /太陽シルバーサービス株式会社/);
assert.match(first, /①　玄関　手すりの取り付け/);
await page.screenshot({path: path.join(outDir, 'madori-print.png')});
await page.emulateMedia({media: 'print'});
const pdf = await page.pdf({preferCSSPageSize: true, printBackground: true});
await page.emulateMedia({media: 'screen'});
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
assert.equal(pages, 2, `印刷のページ数 ${pages}`);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見取図の印刷：A4横・2枚（1階・2階）OK');

// ---------------- Excel（初めは開いているタブ＝平面図だけにチェック）
const down = page.waitForEvent('download');
await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first().click();
const dialog = page.getByRole('dialog', {name: 'Excelで保存'});
assert.equal(await dialog.getByRole('checkbox', {name: /平面図（見取図）/}).isChecked(), true);
assert.equal(await dialog.getByRole('checkbox', {name: /工事見積書/}).isChecked(), false);
await dialog.getByRole('button', {name: /^📗 \d+つ保存する$/}).click();
const file = await down;
assert.equal(file.suggestedFilename(), '（サンプル）山田様住宅改修見取図.xlsx');
const saved = path.join(outDir, 'madori.xlsx');
await file.saveAs(saved);
const z = unzipSync(new Uint8Array(await readFile(saved)));
assert.deepEqual([...strFromU8(z['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]), ['1階', '2階']);
assert.ok(z['xl/media/image1.png'].length > 10000 && z['xl/media/image2.png']);
assert.match(strFromU8(z['xl/worksheets/sheet1.xml']), /①　玄関　手すりの取り付け/);
log('Excel：階ごとのシート・平面図の画像・一覧 OK');

// ---------------- 申請書の平面図の枠は、平面図のタブの今の図（ボタンを押さなくても入る。ユーザーの指示「相互転記させる」2026-11-10）。
// 申請書の枠を押すと同じ図の編集画面。そこで描いたものは平面図のタブにも出る
{
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  const slot = page.locator('[data-plan-slot]');
  const slotImg = slot.locator('img');
  await slotImg.waitFor();
  const svgOf = () => slotImg.evaluate(async (img) => (await fetch(img.src)).text());
  assert.ok((await svgOf()).includes('寝室（和室）'), '申請書の枠に平面図のタブの図');
  await slot.scrollIntoViewIfNeeded();
  await slot.click();
  await page.locator('[data-plan-draw]').waitFor();
  await canvas.waitFor();
  const before = (await art()).match(/fill="#0070c0"/g)?.length ?? 0;
  await page.getByRole('toolbar', {name: '描く道具'}).getByRole('button', {name: '丸（塗りつぶし）'}).click();
  await click(0.5 * M, 2 * M);
  assert.equal((await art()).match(/fill="#0070c0"/g)?.length ?? 0, before + 1);
  await page.getByRole('button', {name: '✓ 申請書の平面図に入れる'}).click();
  await page.locator('[data-plan-draw]').waitFor({state: 'detached'});
  await page.waitForFunction(async (n) => {
    const img = document.querySelector('[data-plan-slot] img');
    return !!img && ((await (await fetch(img.src)).text()).match(/fill="#0070c0"/g)?.length ?? 0) === n;
  }, before + 1);
  await page.getByRole('tab', {name: '📐 平面図'}).click();
  await canvas.waitFor();
  assert.equal((await art()).match(/fill="#0070c0"/g)?.length ?? 0, before + 1, '申請書の枠で描いた丸が平面図のタブにも');
  // 「申請書の平面図に入れる」は、つながっていないとき（申請書に前の版で入れた図があるときなど）だけ「その他 ▼」に出る
  await page.getByRole('button', {name: /^その他/}).click();
  assert.equal(await page.getByRole('button', {name: '📝 申請書の平面図に入れる'}).count(), 0);
  await page.keyboard.press('Escape');
}
log('申請書の平面図の枠＝平面図のタブの図（相互転記）OK');

// ---------------- 申請書の平面図の枠から、その場で描く（新しい様邸）
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.getByRole('button', {name: '＋ 苅田町'}).click();
const drawBtn = page.getByRole('button', {name: '📐 ここで平面図を描く'});
await drawBtn.scrollIntoViewIfNeeded();
await drawBtn.click();
await page.locator('[data-plan-draw]').waitFor();
await canvas.waitFor();
assert.equal(await page.getByRole('button', {name: '洋室', exact: true}).first().getAttribute('aria-pressed'), 'true');
await drag([0, 0], [3 * M, 4 * M]);
assert.match(await art(), /洋室/);
await page.getByRole('button', {name: '✓ 申請書の平面図に入れる'}).click();
await page.locator('[data-plan-draw]').waitFor({state: 'detached'});
await page.getByText('申請書の平面図に入れました').last().waitFor();
await page.locator('button[aria-label="平面図"] img').first().waitFor();
await page.getByRole('tab', {name: '📐 平面図'}).click();
await canvas.waitFor();
assert.match(await art(), /洋室/); // 平面図のタブにも残る
log('申請書の平面図の枠から描いて入れる OK');

await page.screenshot({path: path.join(outDir, 'madori-pc.png')});
// ---------------- スマホ
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
// 携帯：タブを開き直すと、道具と方眼が見える所までスクロールする（方眼が画面の下に隠れない）
await page.getByRole('tab', {name: /工事見積書/}).click();
await page.getByRole('tab', {name: '📐 平面図'}).click();
await canvas.waitFor();
await page.waitForTimeout(400);
const box = await canvas.boundingBox();
assert.ok(box.y >= 0 && box.y < 844 && box.y + box.height <= 844 + 40, `方眼が画面に見える ${JSON.stringify(box)}`);
await page.screenshot({path: path.join(outDir, 'madori-phone.png'), fullPage: true});
log('スマホの幅で横にはみ出さない OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-madori: all OK');
