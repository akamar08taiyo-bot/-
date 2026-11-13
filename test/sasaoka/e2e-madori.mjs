// 平面図のタブ（📐 平面図。ユーザーの指示「平面図をつくれるような機能を追加する。まどりっちの機能やマイホームクラウドの機能もつけくわえる」2026-11-09）：
//   部屋（マイホームクラウドと同じ一覧）を方眼にドラッグ → ドアを壁の近くで押すと壁に付く → トイレは壁ぎわ → 横棒を描いて申請書の箇所①玄関につなぐ → 見取図の下の枠が
//   申請書の改修の内容と同じ（右の枠の一覧は出さない）→ 選んで動かす・Delete・Ctrl+Z → 2階 → 読み直しても残る（#…&view=madori）→ 見取図を印刷（A4。縦が基本・1階と2階を1枚に・
//   いちばん上に「〇〇様邸」・日付なし・下に改修の内容）→ Excel（1シート・画像）
//   → 申請書の平面図に入れる → スマホの幅で横にはみ出さない。お客様は架空のサンプル
// usage: node e2e-madori.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';
import {newFromList} from './more.mjs';

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
// 描くときは、上の描く道具の段が画面の上に来るまでスクロールして使う（方眼は道具の段から方眼の下までが1画面に入る高さ。ユーザーの指示「平面図の入力画面を広く取る」2026-11-12）
const toTools = () => page.evaluate(() => document.querySelector('[role="toolbar"][aria-label="描く道具"]')?.scrollIntoView({block: 'start'}));
await toTools();
{
  const t = await page.getByRole('toolbar', {name: '描く道具'}).boundingBox();
  const c = await page.locator('[data-madori-canvas]').boundingBox();
  assert.ok(t.y >= -1 && c.y + c.height <= 900 + 1, `道具の段と方眼が1画面に入る ${JSON.stringify([t, c])}`);
}
const art = () => canvas.evaluate((s) => s.querySelector('g:not([opacity])')?.innerHTML ?? '');
/** 描いた手すり（棒）の線（path の d）。手すりには番号を付けないので、形はこれで見る */
const railPaths = async () => [...(await art()).matchAll(/<path d="(M[^"]*)" stroke="#e01b24" stroke-width="45"/g)].map((x) => x[1]);
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
  await toTools();
  const p = await toPx(...a);
  const q = await toPx(...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, {steps: 3});
  await page.mouse.move(q.x, q.y, {steps: 3});
  await page.mouse.up();
};
const click = async (x, y) => {
  await toTools();
  const p = await toPx(x, y);
  await page.mouse.click(p.x, p.y);
};
const cat = (name) => page.getByRole('tab', {name, exact: true}).click();
const tool = (name) => page.getByRole('button', {name, exact: true}).first().click();
// 部品の文の一覧：前は右の枠（ユーザーの指示「この部分は不要」2026-11-11 で外した）。いまは見取図の印刷の下の枠
// （申請書の改修の内容＋申請書にない平面図の番号の文。sheet.ts の sheetWorks）を開いて読む
// 印刷のあいだはアプリの画面を隠すので、閉じるとスクロールが上に戻る → 前の位置に戻す（このあとの操作の座標が変わらないように）
const legend = async () => {
  const y = await page.evaluate(() => scrollY);
  await page.getByRole('button', {name: '🖨 平面図を印刷'}).click();
  const rows = await page.locator('.madori-page [data-sheet-works] text').allTextContents();
  await page.getByRole('button', {name: '✕ 閉じる'}).click();
  await page.evaluate((y) => scrollTo(0, y), y);
  return rows;
};

// ---------------- 部屋（マイホームクラウドと同じ並び）
await cat('部屋');
const roomNames = await page.locator('[data-madori-palette]').locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('title')).filter(Boolean));
// 段ごとの並び（ユーザーの指示「和室、洋室、仏間、寝室、床の間、広縁／廊下、リビング、キッチン、ダイニングキッチン、リビングダイニングキッチン／
// トイレ、浴室、洗面脱衣室、洗面所、脱衣室／ポーチ、玄関、土間、ベランダ、駐車場、テラス の順番に並べる」2026-11-10。応接間・収納・リビングダイニング・ダイニングは段の終わり）
assert.deepEqual(roomNames, [
  ...['和室', '洋室', '仏間', '寝室', '床の間', '広縁', '応接間', '収納'],
  // リビング…は英語の略称（ボタンは L・K・DK・LDK・LD・D、マウスを乗せると言葉。ユーザーの指示「K、L、D、DK、LDK みたいな形で、略称、英語の略称で、に戻してください」2026-11-12）
  ...['廊下', 'L（リビング）', 'K（キッチン）', 'DK（ダイニングキッチン）', 'LDK（リビングダイニングキッチン）', 'LD（リビングダイニング）', 'D（ダイニング）'],
  ...['トイレ', '浴室', '洗面脱衣室', '洗面所', '脱衣室'],
  ...['ポーチ', '玄関', '土間', 'ベランダ', '駐車場', 'テラス', '道路'], // 道路（ユーザーの指示「箇所の中に道路もいれる」2026-11-11）
]);
// 白紙の平面図は、開いたときから洋室が選ばれている（なぞればすぐ描ける）。同じ道具をもう一度押しても外れない
const pressed = (name) => page.getByRole('button', {name, exact: true}).first().getAttribute('aria-pressed');
assert.equal(await pressed('洋室'), 'true');
// 選んでいる部屋のボタンも、見た目はほかの部屋と同じ（太い枠にしない。ユーザーの指示「洋室のところだけふと丸になっているが、普通で良い」2026-11-12）
{
  const look = (name) => page.locator(`[data-madori-palette] button[title="${name}"]`).evaluate((e) => {
    const c = getComputedStyle(e);
    return [c.borderTopWidth, c.boxShadow];
  });
  assert.deepEqual(await look('洋室'), await look('仏間'));
}
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
// 方眼（尺）：初めは出さない・チェックで出す・外すと消える（ユーザーの指示「尺はオンオフで良い。デフォルトは表示しない」2026-11-12。前は 910・900・1000mm を選ぶ欄）
assert.equal(await page.locator('[data-madori-canvas] [data-grid]').count(), 0);
assert.equal(await page.getByLabel('方眼の1マス').count(), 0);
await page.getByRole('checkbox', {name: '方眼（尺）'}).check();
assert.equal(await page.locator('[data-madori-canvas] [data-grid]').count(), 2);
await page.getByRole('checkbox', {name: '方眼（尺）'}).uncheck();
assert.equal(await page.locator('[data-madori-canvas] [data-grid]').count(), 0);
log('部屋：ドラッグで方眼に・帖・色・寸法線なし・方眼（尺）は初めは出さない OK');

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
await tool('洋式便器'); // トイレの部屋があるので、押すだけでその中に入る（ユーザーの指示「便器を選択したらトイレの中にいれる」2026-11-12。前は押してから方眼を押した）
await page.getByText('トイレに入れました').last().waitFor();
const svgNow = await art();
const door = /translate\(([\d.]+) 3640\) rotate\(0\)/.exec(svgNow); // ドアの開口のまん中が壁の上（y＝和室と廊下の間の壁）
assert.ok(door && (Number(door[1]) - 390) % 227.5 === 0, `ドアの開口の端は半マスの半分にそろう ${door?.[1]}`);
assert.match(svgNow, /translate\(2985 30\)/); // 便器はトイレの上の壁の面（y=30）にぴったり・左右のまん中（3.5マス＝3185）
log('ドアは壁に・便器は壁ぎわ OK');

// ---------------- 申請書の箇所：前もって部品を並べる「置き場」は出さない（ユーザーの指示「事前に線や番号をおいておくのはなしで」2026-11-11）。
// 横棒・丸には番号を付けない（ユーザーの指示「番号はセットにしなくても良い。棒は棒、丸は丸のみ」2026-11-12）。
// 番号は「① 番号」で置き、選んで右の欄の「申請書の箇所」で ①玄関 につなぐ → 見取図の下の枠は申請書の改修の内容
assert.equal(await page.getByRole('tab', {name: '改修', exact: true}).count(), 0);
assert.equal(await page.locator('[data-stage]').count(), 0);
assert.ok(!(await art()).includes('#e01b24'), 'まだ手すりは描いていない');
await tool('横棒');
await drag([4.4 * M, 4.9 * M], [5.6 * M, 4.9 * M]);
await page.getByRole('button', {name: '選ぶのをやめる'}).waitFor(); // 描いた棒を選んでいる（右に部品の欄）
assert.equal(await page.getByRole('combobox', {name: '申請書の箇所'}).count(), 0, '棒には申請書の箇所・番号の欄を出さない');
await page.keyboard.press('Escape');
await page.getByRole('button', {name: '丸（塗りつぶし）'}).click();
await click(3.9 * M, 0.7 * M);
await page.keyboard.press('Escape');
assert.doesNotMatch(await art(), /[①-⑳]/, '棒・丸には番号を付けない');
{
  const dbar = page.getByRole('toolbar', {name: '描く道具'});
  const nb = dbar.getByRole('button', {name: /番号$/});
  assert.ok((await nb.innerText()).includes('①'), '棒・丸を描いても番号は①から');
  await nb.click();
  await click(4.4 * M, 4.4 * M);
  await dbar.getByRole('button', {name: '番号を確定'}).click();
  await click(4.4 * M, 4.4 * M); // 置いた①を選ぶ
  const link = page.getByRole('combobox', {name: '申請書の箇所'});
  await link.waitFor();
  assert.match((await link.locator('option').allInnerTexts()).join('|'), /①\s*玄関/);
  await link.selectOption({index: 1}); // ①玄関
  await page.keyboard.press('Escape');
}
assert.equal(((await art()).match(/[①-⑳]/g) ?? []).join(''), '①');
// 右の枠の一覧・床面積は出さない（ユーザーの指示「この部分は不要」2026-11-11）。部品を選んでいるときだけ右に部品の欄
assert.equal(await page.getByText('一覧（右の枠）').count(), 0);
assert.equal(await page.getByText(/床面積/).count(), 0);
assert.equal(await page.getByRole('textbox', {name: '一覧を手で直す'}).count(), 0);
// 見取図の下の枠は申請書の改修の内容（①玄関・②トイレ）
const rows = await legend();
assert.equal(rows.length, 2, JSON.stringify(rows));
assert.match(rows[0], /^①玄関　手すりの取り付け/);
assert.match(rows[1], /^②トイレ　/);
assert.equal(await page.locator('[data-stage]').count(), 0);
log('置き場は出さない・棒と丸には番号なし・番号①を申請書の箇所①玄関につなぐ・見取図の下の枠 OK');

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
// 階段の種類（ユーザーの指示「階段の種類は増やす」2026-11-10）：9つの絵のボタン・選んで左右反転・種類を替えるとその形の大きさ
for (const name of ['折返し階段', '折返し回り階段', 'L字階段', '回り階段', '直階段', '直階段（踊り場）', 'コ字階段', 'らせん階段', '外階段（3段）']) {
  assert.equal(await page.locator(`[data-madori-palette] button[aria-label="${name}"]`).count(), 1, name);
}
await page.getByRole('button', {name: '⇆ 左右反転'}).click();
assert.match(await art(), /rotate\(90 [\d.]+ [\d.]+\) translate\(910 0\) scale\(-1 1\)/);
await page.getByRole('combobox', {name: '種類'}).selectOption('らせん階段');
assert.match(await art(), /<circle cx="910" cy="910" r="855.4"/);
// 横手すりを一筆で L 字に（横へなぞって、角で下へ）
await tool('自在棒');
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
assert.ok((await railPaths()).some((d) => /l9\d0 0L[\d.]+ [\d.]+$/.test(d)), `一筆の L 字 ${JSON.stringify(await railPaths())}`);
await page.keyboard.press('Control+z');
for (let i = 0; i < 7; i++) await page.keyboard.press('Control+z'); // 文字・通路・WC・階段・回す・左右反転・らせん階段
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
  // 方眼の線から離れた所へ動かすと、半マス（455mm）に飛ばず 10mm 刻みで止まる（ユーザーの答え「（部屋の大きさのつまみは）より細かく」2026-11-12）
  const b2 = await h.boundingBox();
  const to2 = await toPx(10 * M - 200, 2 * M + 150);
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(to2.x, to2.y, {steps: 6});
  await page.mouse.up();
  const m = /M7280 0L10010 0L10010 (\d+)L(\d+) \d+L\d+ 2730L7280 2730Z/.exec(await art());
  assert.ok(m, 'L 字のまま');
  const [y, x] = [Number(m[1]), Number(m[2])];
  assert.ok(Math.abs(x - (10 * M - 200)) <= 20 && Math.abs(y - (2 * M + 150)) <= 20, `つまみを離した所で止まる ${x} ${y}`);
  assert.ok(x % 10 === 0 && y % 10 === 0 && x % 455 !== 0 && y % 455 !== 0, `10mm 刻み（半マスではない）${x} ${y}`);
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
  // 描く道具の段は方眼のすぐ上（間は「〇〇様邸」の行だけ。ユーザーの指示「平面図の一番上に〇〇様邸と表示しておく」2026-11-11）
  const tb = await page.locator('[data-plan-title]').boundingBox();
  assert.ok(bb.y + bb.height <= tb.y + 1 && tb.y + tb.height <= cb.y + 1 && cb.y - (bb.y + bb.height) < 16 + tb.height + 8, `方眼のすぐ上 ${JSON.stringify([bb, tb, cb])}`);
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
  // 曲げた手すり（角が2つ以上＝4点より多い線）
  const bent = (d) => d.split('L').length >= 4;
  assert.ok((await railPaths()).some(bent), `曲げた手すり ${JSON.stringify(await railPaths())}`);
  // 手すりの上をぐしゃぐしゃに書く（選ぶ・動かすのまま）→ 消える。戻すで戻る
  {
    const c = {x: v0.x + v0.width / 2 + (v1.x - v0.x) * 0.3, y: v0.y + v0.height / 2 + (v1.y - v0.y) * 0.3};
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    for (let i = 1; i <= 9; i++) await page.mouse.move(c.x + (i % 2 ? 45 : -45), c.y + i * 3, {steps: 3});
    await page.mouse.up();
  }
  assert.ok(!(await railPaths()).some(bent), `ぐしゃぐしゃで消えた ${JSON.stringify(await railPaths())}`);
  await page.getByText('1つ消しました').last().waitFor();
  await page.keyboard.press('Control+z');
  assert.ok((await railPaths()).some(bent), '戻すで戻る');
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
  // 番号のボタンはほかより少し大きい・右に「✓ 確定」（番号を置いている間だけ押せる。押すと置き終える。ど真ん中の道具は動かない）
  // （ユーザーの指示「番号ボタンは確定をつくる。番号ボタンもし小さい場合は少しおおきくする」2026-11-10）
  {
    const nb = await numBtn.boundingBox();
    const tb = await bar.getByRole('button', {name: '文字', exact: true}).boundingBox();
    assert.ok(nb.height > tb.height + 4, `番号のボタンが大きい ${JSON.stringify([nb, tb])}`);
    const done = bar.getByRole('button', {name: '番号を確定'});
    assert.equal(await done.isEnabled(), true);
    const db = await done.boundingBox();
    assert.ok(db.x > nb.x + nb.width - 2 && db.x - (nb.x + nb.width) < 12 && Math.abs(db.y + db.height / 2 - (nb.y + nb.height / 2)) < 3, `確定は番号のすぐ右 ${JSON.stringify([nb, db])}`);
    const cg2 = await bar.locator('[data-draw-center]').boundingBox();
    assert.ok(Math.abs(mid(cg2) - mid(cg)) < 1, `確定が出てもど真ん中の道具は動かない ${JSON.stringify([cg, cg2])}`);
    await done.click();
    assert.equal(await numBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(await done.isDisabled(), true); // 確定はいつも番号の右にあり、番号を置いていないときは押せない
    // 確定で止めたあと、ほかの道具（和室など）に替えて描ける（ユーザーの指示「一旦ストップして、また新たに（例えば和室）など入力できる」）
    const has4 = (await art()).includes(`>${circled(n0 + 3)}<`);
    await click(4 * M, 8.3 * M);
    assert.equal((await art()).includes(`>${circled(n0 + 3)}<`), has4, '確定のあとに押しても番号は増えない');
    await page.keyboard.press('Escape');
    // Enter でも置き終える
    await numBtn.click();
    assert.equal(await done.isEnabled(), true);
    await page.keyboard.press('Enter');
    assert.equal(await numBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(await done.isDisabled(), true);
    // 番号のボタンをもう一度押す・置いた番号をもう一度押す・方眼の外を押すでも確定（番号は増えない）
    // （ユーザーの指示「番号入力機能は番号の部分を2回押しても、確定と認識する。平面図内以外をタップしても確定とする」2026-11-10）
    const before = await art();
    await numBtn.click();
    assert.equal(await numBtn.getAttribute('aria-pressed'), 'true');
    await numBtn.click();
    assert.equal(await numBtn.getAttribute('aria-pressed'), 'false');
    await numBtn.click();
    await click(5 * M, 8.3 * M); // 置いてある番号の上
    assert.equal(await numBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(await art(), before, '置いた番号を押しても番号は増えない');
    await numBtn.click();
    await page.mouse.click(6, 640); // 方眼の外（左の余白）
    assert.equal(await numBtn.getAttribute('aria-pressed'), 'false');
    assert.equal(await art(), before);
  }
  // 戻す：番号3つ・丸・図形・曲げ・手すり（消したのは戻してあるので数えない）
  for (let i = 0; i < 3 + 1 + 1 + 1 + 1; i++) await page.keyboard.press('Control+z');
  assert.ok(!(await railPaths()).some(bent));
  assert.doesNotMatch(await art(), /<path d="M0 0H1820V910H0Z"/);
  assert.equal(await dots(), dots0);
}
log('方眼の上のまん中の描く道具・曲げた手すり（□で曲げる）・ぐしゃぐしゃで消す・丸・番号 OK');

// ---------------- 頂点の編集（上の段の「◇ 頂点の編集」。ユーザーの指示「頂点で編集できるようにもする。頂点の編集も上におく。色んな形の図形を後付けでつくれる」2026-11-10）
{
  const bar = page.getByRole('toolbar', {name: '描く道具'});
  const vbtn = page.getByRole('button', {name: '◇ 頂点の編集'});
  await page.keyboard.press('Escape');
  assert.equal(await vbtn.isDisabled(), true); // 何も選んでいなければ押せない
  const vb = await vbtn.boundingBox();
  const ub = await page.locator('[data-undo-center]').boundingBox();
  assert.ok(vb.y >= ub.y - 1 && vb.y + vb.height <= ub.y + ub.height + 1, '頂点の編集は上の段のまん中（戻す・進む・削除の右）');
  const vcount = () => page.locator('[data-handle^="v"]').count();
  const hb = async (h) => {
    await toTools(); // 上の段のボタンを押すとページが上に戻るので、描く道具の段までスクロールし直してから
    const b = await page.locator(`[data-handle="${h}"]`).boundingBox();
    return {x: b.x + b.width / 2, y: b.y + b.height / 2};
  };
  const mdrag = async (a, b) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, {steps: 6});
    await page.mouse.up();
  };
  await toTools();
  const freePaths = () => art().then((h) => [...h.matchAll(/<path d="(M[\d.\- LC]+Z)" fill="none" stroke="#e01b24" stroke-width="30" stroke-linejoin="round"/g)].map((m) => m[1]));
  await bar.getByRole('button', {name: '四角', exact: true}).click();
  await drag([9 * M, 6 * M], [11 * M, 8 * M]);
  await vbtn.click();
  assert.equal(await vbtn.getAttribute('aria-pressed'), 'true');
  assert.equal(await vcount(), 4);
  // 右上の角だけを右上へ（ほかの角は動かない）→ ななめの辺の形
  const p1 = await hb('v1');
  await mdrag(p1, {x: p1.x + 50, y: p1.y - 30});
  let [d] = await freePaths();
  assert.ok(d && d.split('L').length === 4, `4つの角 ${d}`);
  // 辺のまん中（□）をつまむと角が増える
  const e2 = await hb('e2');
  await mdrag(e2, {x: e2.x, y: e2.y + 40});
  assert.equal(await vcount(), 5);
  [d] = await freePaths();
  assert.equal(d.split('L').length, 5);
  // 角をダブルクリック（ダブルタップ）で消す
  const p4 = await hb('v4');
  await page.mouse.dblclick(p4.x, p4.y);
  assert.equal(await vcount(), 4);
  // 角を選んで「🗑 頂点を削除」でも消せる（3つより少なくはならない）
  const p0 = await hb('v0');
  await page.mouse.click(p0.x, p0.y);
  await page.getByRole('button', {name: '選んだ頂点を削除'}).click();
  assert.equal(await vcount(), 3);
  // 頂点の編集を終えると、ふだんの四隅・四辺のつまみ（形のまま大きくする）
  await vbtn.click();
  assert.equal(await vbtn.getAttribute('aria-pressed'), 'false');
  assert.equal(await vcount(), 0);
  assert.equal(await page.locator('[data-handle="se"]').count(), 1);
  // 丸を頂点の編集にすると 12 の角を通るなめらかな線
  await bar.getByRole('button', {name: '丸', exact: true}).click();
  await drag([5 * M, 6 * M], [7 * M, 7 * M]);
  await vbtn.click();
  assert.equal(await vcount(), 12);
  assert.ok((await freePaths()).some((x) => x.includes('C')), 'なめらかな線');
  await page.keyboard.press('Escape');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Control+z'); // 丸・頂点の編集・四角と4つの直し
  assert.equal((await freePaths()).length, 0);
  assert.doesNotMatch(await art(), /<path d="M0 0H1820V1820H0Z"/);
}
log('頂点の編集：角を動かす・辺で角を足す・ダブルタップ／頂点を削除で消す・丸はなめらかな線 OK');

// ---------------- 角を押して平行四辺形の部屋（ユーザーの指示「角を押していって、頂点で結ぼうと思うが、平行四辺形が勝手に四角になる」2026-11-10）・
// 全て削除（「削除の横に全て削除を設置、一応確認する」）・応接間（「応接間をいれる」）
{
  await cat('部屋');
  assert.equal(await page.locator('[data-madori-palette] button[title="応接間"]').count(), 1);
  await tool('洋室');
  for (const [x, y] of [[6, 6], [10, 6], [9, 8], [5, 8]]) await click(x * M, y * M);
  await click(6 * M, 6 * M); // はじめの点で閉じる
  assert.match(await art(), new RegExp(`d="M${6 * M} ${6 * M}L${10 * M} ${6 * M}L${9 * M} ${8 * M}L${5 * M} ${8 * M}Z"`), '平行四辺形のまま');
  await page.keyboard.press('Escape');
  // 全て削除：確かめのあとにこの階の図がみな消える。戻すで戻る
  const all = page.getByRole('button', {name: 'この階の図をすべて削除'});
  const ab = await all.boundingBox();
  const db = await page.locator('[data-del-center]').boundingBox();
  assert.ok(ab.x > db.x + db.width - 1 && ab.x - (db.x + db.width) < 12, `全て削除は削除のすぐ右 ${JSON.stringify([db, ab])}`);
  const before = await art();
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
  });
  await all.click();
  assert.match(asked, /1階の図.*すべて消しますか/);
  await page.waitForFunction(() => !document.querySelector('[data-madori-canvas] svg g:not([opacity])')?.innerHTML.includes('寝室'));
  assert.equal(await all.isDisabled(), true);
  await page.keyboard.press('Control+z');
  assert.equal(await art(), before, '戻すで戻る');
  await page.keyboard.press('Control+z'); // 平行四辺形の部屋も戻す
}
log('平行四辺形の部屋・全て削除（確かめ・戻す）・応接間 OK');

// ---------------- 何も選んでいないときに「🗑 削除」を押す → なぞった部品（部屋も）を消す（ユーザーの指示「削除をタップして、グジャグジャってなぞると、消せるように」2026-11-10）
{
  await page.keyboard.press('Escape');
  const before = await art();
  await cat('部屋');
  await tool('洋室');
  await drag([8 * M, 2 * M], [11 * M, 5 * M]); // 方眼の空いた所
  await page.keyboard.press('Escape');
  const withRoom = await art();
  assert.notEqual(withRoom, before);
  const del = page.locator('[data-del-center]');
  assert.equal(await del.getAttribute('aria-label'), 'なぞって削除');
  await del.click();
  assert.equal(await del.getAttribute('aria-pressed'), 'true');
  // 部屋の中をぐしゃぐしゃ：なぞっているあいだは消える部屋が赤く、離すと消える。消すモードのまま（続けて消せる）
  const c = await toPx(9.5 * M, 3.5 * M);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 9; i++) await page.mouse.move(c.x + (i % 2 ? 40 : -40), c.y + i * 2, {steps: 3});
  await page.screenshot({path: path.join(outDir, 'madori-erase.png')});
  assert.equal(await page.locator('[data-erase-mark] > *').count(), 1);
  await page.mouse.up();
  assert.equal(await art(), before, 'なぞった部屋が消えた');
  assert.equal(await page.locator('[data-erase-mark]').count(), 0);
  await page.getByText('1つ消しました').last().waitFor();
  assert.equal(await del.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Control+z');
  assert.equal(await art(), withRoom, '戻すで戻る');
  // 押しただけでも消える
  await click(10.5 * M, 4.5 * M);
  assert.equal(await art(), before, '押した部屋が消えた');
  await page.keyboard.press('Control+z');
  // もう一度押すとやめる。やめたあとは部屋の中を押すと選ぶ（消さない）
  await del.click();
  assert.equal(await del.getAttribute('aria-pressed'), 'false');
  await click(10.5 * M, 4.5 * M);
  assert.equal(await art(), withRoom);
  assert.equal(await del.getAttribute('aria-label'), '選んだ部品を削除');
  // ほかの道具を選ぶと消すモードは終わる
  await page.keyboard.press('Escape');
  await del.click();
  await tool('洋室');
  assert.equal(await del.getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z'); // 足した部屋も戻す
  assert.equal(await art(), before);
}
log('削除を押してなぞる・押すと部屋も消える（赤く見せる・続けて消せる・戻す・やめる）OK');

// ---------------- 住設 ▼・いつも出す（☆）・まん中の削除・右下のすべらせて戻す／進む・方眼の下の申請書の改修の内容
// （ユーザーの指示「他の住設もプルダウンから選べるようにして、必要な住設や、矢印などは常時表示できるようにする」「削除ボタンも中央におく」
//   「右下に、左にスラッシュすると戻る、右にスラッシュすると進む」「平面図の下のスペースに、申請書で入力した内容をいれる」2026-11-10）
{
  const bar = page.getByRole('toolbar', {name: '描く道具'});
  const mid = (b) => b.x + b.width / 2;
  const cg0 = await bar.locator('[data-draw-center]').boundingBox();
  const fixLabels = () => bar.locator('[data-quick-fix]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  // 住設 ▼：段にない住設（洗面セット）を一覧から選んで置く。選ぶと一覧は閉じる
  await bar.getByRole('button', {name: '住設 ▼'}).click();
  const list = page.getByLabel('住設の一覧');
  await list.waitFor();
  assert.deepEqual(await list.locator('.font-bold').allInnerTexts(), ['住設', '家具', '福祉用具']);
  await list.getByRole('button', {name: '洗面セット', exact: true}).click();
  assert.equal(await list.count(), 0);
  const n0 = (await art()).length;
  await click(8 * M, 1 * M);
  const placedArt = await art();
  assert.ok(placedArt.length > n0, '洗面セットを置いた');
  await page.keyboard.press('Escape');
  // ☆ で段にいつも出す（読み直しても覚えている）・★ でまた外す。ど真ん中の道具は動かない
  await bar.getByRole('button', {name: '住設 ▼'}).click();
  await list.getByRole('button', {name: '洗面セットを段にいつも出す', exact: true}).click();
  assert.equal(await list.getByRole('button', {name: '洗面セットを段にいつも出す', exact: true}).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.deepEqual(await fixLabels(), ['トイレ（便器）', '浴槽', 'キッチン', 'ベッド', '下駄箱', '洗面セット']);
  assert.ok((await page.evaluate(() => localStorage.getItem('taiyo-madori-pins-v1'))).includes('洗面セット'));
  const cg1 = await bar.locator('[data-draw-center]').boundingBox();
  assert.ok(Math.abs(mid(cg1) - mid(cg0)) < 1, `住設を足してもど真ん中 ${JSON.stringify([cg0, cg1])}`);
  await bar.getByRole('button', {name: '住設 ▼'}).click();
  await list.getByRole('button', {name: '洗面セットを段にいつも出す', exact: true}).click();
  await page.keyboard.press('Escape');
  assert.deepEqual(await fixLabels(), ['トイレ（便器）', '浴槽', 'キッチン', 'ベッド', '下駄箱']);
  // 図形 ▼ の ☆：矢印を段から外す・また出す
  await bar.getByRole('button', {name: '図形 ▼'}).click();
  const shapes = page.getByLabel('図形の一覧');
  await shapes.getByRole('button', {name: '矢印を段にいつも出す', exact: true}).first().click();
  await page.keyboard.press('Escape');
  assert.equal(await bar.getByRole('button', {name: '矢印', exact: true}).count(), 0);
  await bar.getByRole('button', {name: '図形 ▼'}).click();
  await shapes.getByRole('button', {name: '矢印を段にいつも出す', exact: true}).first().click();
  await page.keyboard.press('Escape');
  assert.equal(await bar.getByRole('button', {name: '矢印', exact: true}).count(), 1);
  // まん中の削除：選んだ部品を消す（何も選んでいなければ押せない）
  const del = page.locator('[data-del-center]');
  assert.equal(await del.getAttribute('aria-label'), 'なぞって削除'); // 何も選んでいないときは、なぞって消す
  {
    const ub = await page.locator('[data-undo-center]').boundingBox();
    const sb = await page.getByRole('toolbar', {name: '平面図の設定'}).boundingBox();
    assert.ok(Math.abs(mid(ub) - mid(sb)) < 3, `削除もまん中 ${JSON.stringify([ub, sb])}`);
  }
  await click(8 * M, 1 * M);
  assert.equal(await del.getAttribute('aria-label'), '選んだ部品を削除');
  await del.click();
  assert.equal((await art()).length, n0, '削除で消えた');
  // 右下：左へすべらせると戻す・右へすべらせると進む（1回で1つ。方眼には描かない）
  const pad = page.locator('[data-swipe-undo]');
  await toTools(); // 上の段の削除を押すとページが上に戻る
  const pb = await pad.boundingBox();
  const cb = await page.locator('[data-madori-canvas]').boundingBox();
  assert.ok(pb.x + pb.width > cb.x + cb.width - 60 && pb.y + pb.height > cb.y + cb.height - 60, `右下 ${JSON.stringify([pb, cb])}`);
  const slide = async (dx) => {
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await page.mouse.down();
    await page.mouse.move(pb.x + pb.width / 2 + dx, pb.y + pb.height / 2, {steps: 6});
    await page.mouse.up();
  };
  await slide(-90);
  assert.equal(await art(), placedArt, '左へすべらせて戻す（消したのが戻る）');
  await slide(90);
  assert.equal((await art()).length, n0, '右へすべらせて進む（また消える）');
  // 方眼の右：申請書の改修の内容（申請書と同じ書き方。ユーザーの指示「申請内容を右側に表示して、平面図の入力画面を広く取る」2026-11-12。前は方眼の下）
  const works = await page.locator('[data-plan-works] li').allInnerTexts();
  assert.ok(works.length >= 1, JSON.stringify(works));
  assert.match(works[0], /^①玄関　手すりの取り付け/);
  const wb = await page.locator('[data-plan-works]').boundingBox();
  assert.ok(wb.x >= cb.x + cb.width && wb.y <= cb.y + 1, `方眼の右 ${JSON.stringify([wb, cb])}`);
  // 方眼は広く（描く道具の段から方眼の下までが1画面に入るいっぱい。1366×900 なら 720px ほど。前は 600px）
  const db = await bar.boundingBox();
  assert.ok(cb.height >= 700 && cb.y + cb.height - db.y <= 900, `方眼の高さ ${JSON.stringify([db, cb])}`);
  // 方眼のいちばん上に「〇〇様邸」（ユーザーの指示「平面図の一番上に〇〇様邸と表示しておく」2026-11-11）。方眼のまん中にそろえる
  const title = page.locator('[data-plan-title]');
  assert.equal(await title.innerText(), '（サンプル）山田様邸');
  const tb = await title.boundingBox();
  assert.ok(tb.y + tb.height <= cb.y + 1 && cb.y - (tb.y + tb.height) < 16 && Math.abs(tb.x + tb.width / 2 - (cb.x + cb.width / 2)) < 2, `方眼の上 ${JSON.stringify([tb, cb])}`);
  // 番号を置くと、右の一覧に申請書の同じ写真番号の改修の内容（番号だけの部品のとき）
  const numBtn = bar.getByRole('button', {name: /番号$/});
  const k = (await numBtn.innerText()).trim().codePointAt(0) - 0x2460 + 1;
  const want = works.find((w) => w.startsWith(String.fromCharCode(0x2460 + k - 1)));
  await numBtn.click();
  await click(4 * M, 8.3 * M);
  await bar.getByRole('button', {name: '番号を確定'}).click();
  const rowK = (await legend()).find((r) => r.startsWith(String.fromCharCode(0x2460 + k - 1)));
  if (want) assert.equal(rowK, want.split('\n')[0]); // 印刷の下の枠は方眼の下の欄と同じ文
  else assert.equal(rowK, String.fromCharCode(0x2460 + k - 1)); // 申請書にその番号の行がなければ番号だけ（印刷の一覧の枠が空にならないように）
  await page.keyboard.press('Control+z');
}
log('住設 ▼・いつも出す・まん中の削除・すべらせて戻す／進む・方眼の右の改修の内容・広い方眼・番号の一覧 OK');

// ---------------- 2階
await page.getByRole('button', {name: '＋ 階'}).click();
await page.getByRole('tab', {name: '2階'}).waitFor();
await cat('部屋');
await tool('洋室');
await drag([0, 0], [3 * M, 4 * M]);
await tool('横棒');
await click(1.5 * M, 3.8 * M);
await page.keyboard.press('Escape');
// 2階の絵（下の階のうすい絵＝opacity の g の次）
const art2 = () => canvas.evaluate((s) => s.querySelector(':scope > g:not([opacity])')?.innerHTML ?? '');
assert.match(await art2(), /#e01b24/);
assert.doesNotMatch(await art2(), /[①-⑳]/); // 棒には番号を付けない
{
  // 番号は階をまたいで通し番号（1階の①のあと、2階は②③）。②は申請書の②トイレの行、③は申請書にないので番号だけ
  const dbar = page.getByRole('toolbar', {name: '描く道具'});
  const nb = dbar.getByRole('button', {name: /番号$/});
  assert.ok((await nb.innerText()).includes('②'), await nb.innerText());
  await nb.click();
  await click(0.8 * M, 1 * M);
  await click(2.2 * M, 1 * M);
  await dbar.getByRole('button', {name: '番号を確定'}).click();
  await page.keyboard.press('Escape');
}
assert.equal(((await art2()).match(/[①-⑳]/g) ?? []).join(''), '②③');
{
  const rows2 = await legend();
  assert.match(rows2.at(-2), /^②トイレ　/);
  assert.equal(rows2.at(-1), '③');
}
await page.getByRole('tab', {name: '1階', exact: true}).click();
log('2階・通し番号 OK');

// ---------------- 読み直しても残る（保存は打ち終わって 0.4 秒後）
await page.waitForTimeout(1500);
await page.reload();
await canvas.waitFor();
await page.waitForFunction(() => document.querySelector('[data-madori-canvas] svg')?.innerHTML.includes('寝室（和室）'));
assert.equal(await page.getByRole('tab', {name: '2階'}).count(), 1);
log('読み直し OK');

// ---------------- 見取図の印刷（A4。縦が基本・横に広い図は横。1階と2階を1枚に。いちばん上に「〇〇様邸」、下に改修の内容。日付・会社の名前は書かない）
// （ユーザーの指示「〇〇様邸　平面図、日付などは不要」「基本的には縦印刷、横広の場合は、自動的に横にする」「2階を作成した際は、1階と2階の内容を1枚におさまるようにする」2026-11-10、
//   「平面図の一番上に〇〇様邸と表示しておく」「改修の内容（申請書）…印刷時にも表示する」2026-11-11）
await page.getByRole('button', {name: '🖨 平面図を印刷'}).click();
const sheets = page.locator('.madori-page');
assert.equal(await sheets.count(), 1);
const first = await sheets.first().innerHTML();
assert.match(first, />1階</);
assert.match(first, />2階</);
assert.ok(!/見取図|平面図|株式会社|担当者|\d+年\d+月\d+日/.test(first.replace(/<pattern[\s\S]*?<\/pattern>/g, '')), '「見取図」・日付・会社の名前は書かない');
assert.match(first, /font-weight="700"[^>]*>（サンプル）山田様邸<\/text>/);
{
  // 「〇〇様邸」は紙のいちばん上（平面図より上）
  const top = await sheets.first().evaluate((el) => {
    const t = [...el.querySelectorAll('svg > text')].find((x) => x.textContent === '（サンプル）山田様邸').getBoundingClientRect();
    const plan = el.querySelector('svg > g[transform]').getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return {t: t.bottom - box.top, plan: plan.top - box.top, h: box.height};
  });
  assert.ok(top.t < top.plan && top.t < top.h * 0.08, JSON.stringify(top));
}
assert.match(first, /①玄関　手すりの取り付け/);
assert.match(first, /②トイレ　/);
assert.match(first, /xml:space="preserve"[^>]*>③<\/text>/); // 申請書にない番号は番号だけ
const orient = await sheets.first().getAttribute('data-orientation');
log('見取図の向き', orient);
await page.screenshot({path: path.join(outDir, 'madori-print.png')});
// iPad の横向き（1180×820）でも、1枚目が上の帯の下に切れずに入る（ユーザーの「印刷画面が変になっている」2026-11-10。前は下の会社名が切れていた）
for (const vp of [{width: 1180, height: 820}, {width: 1366, height: 768}, {width: 390, height: 844}]) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(200);
  const box = await sheets.first().boundingBox();
  const barBottom = await page.locator('.print-toolbar').evaluate((e) => e.getBoundingClientRect().bottom);
  assert.ok(box.y >= barBottom - 1 && box.y + box.height <= vp.height + 0.5 && box.x >= 0 && box.x + box.width <= vp.width + 0.5, `${vp.width}×${vp.height} ${JSON.stringify(box)}`);
  if (vp.width === 1180) await page.screenshot({path: path.join(outDir, 'madori-print-ipad.png')});
}
await page.setViewportSize({width: 1366, height: 900});
await page.emulateMedia({media: 'print'});
const pdf = await page.pdf({preferCSSPageSize: true, printBackground: true});
await page.emulateMedia({media: 'screen'});
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
assert.equal(pages, 1, `印刷のページ数 ${pages}`);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見取図の印刷：1枚に1階・2階・いちばん上に〇〇様邸・下に改修の内容・日付なし OK');

// ---------------- Excel（初めは開いているタブ＝平面図だけにチェック）
const down = page.waitForEvent('download');
await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first().click();
const dialog = page.getByRole('dialog', {name: 'Excelで保存'});
assert.equal(await dialog.getByRole('checkbox', {name: /^平面図/}).isChecked(), true);
assert.equal(await dialog.getByRole('checkbox', {name: /工事見積書/}).isChecked(), false);
await dialog.getByRole('button', {name: /^📗 \d+つ保存する$/}).click();
const file = await down;
assert.equal(file.suggestedFilename(), '（サンプル）山田様住宅改修平面図.xlsx');
const saved = path.join(outDir, 'madori.xlsx');
await file.saveAs(saved);
const z = unzipSync(new Uint8Array(await readFile(saved)));
assert.deepEqual([...strFromU8(z['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]), ['平面図']);
assert.ok(z['xl/media/image1.png'].length > 10000 && !z['xl/media/image2.png']);
const xs1 = strFromU8(z['xl/worksheets/sheet1.xml']);
assert.match(xs1, /①玄関　手すりの取り付け/);
assert.match(xs1, /<c r="A1" [^>]*><is><t xml:space="preserve">（サンプル）山田様邸<\/t>/);
assert.match(xs1, new RegExp(`orientation="${orient}"`));
log('Excel：1シート（印刷と同じ向き）・平面図の画像・一覧 OK');

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
await newFromList(page, '苅田町');
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

// ---------------- 便器はトイレの中・浴槽は浴室の中（ユーザーの指示「便器を選択したらトイレの中にいれる。浴槽を選択したら、浴室の中に入れる」2026-11-12）、
// 少しずつ動かす（「住設などもカクカク動くので、微調節をして動かせるようにする」）、360° 回す（「向きなどは360度自由自在に動かせるようにする」）
{
  await cat('部屋');
  await tool('トイレ');
  await drag([3 * M, 0], [4 * M, 1.5 * M]); // 2730〜3640 × 0〜1365
  await tool('浴室');
  await drag([4 * M, 0], [6 * M, 1.5 * M]); // 3640〜5460 × 0〜1365
  await cat('住設');
  await tool('洋式便器');
  await page.getByText('トイレに入れました').last().waitFor();
  await tool('浴槽');
  await page.getByText('浴室に入れました').last().waitFor();
  const a1 = await art();
  assert.match(a1, /translate\(2985 30\)"><rect x="20" y="0" width="360" height="182"/, '便器はトイレの上の壁ぎわのまん中');
  assert.match(a1, /translate\(3800 30\)/, '浴槽は浴室の上の長い壁ぎわのまん中');
  {
    const c0 = await toPx(3000, 0);
    await page.screenshot({path: path.join(outDir, 'madori-fix-in-room.png'), clip: {x: Math.max(0, c0.x - 260), y: Math.max(0, c0.y - 60), width: 620, height: 260}});
  }
  const toilet = async () => {
    const m = /<g transform="translate\(([\d.-]+) ([\d.-]+)\)(?: rotate\(([\d.]+) 200 350\))?"><rect x="20" y="0" width="360" height="182"/.exec(await art());
    assert.ok(m, '便器が見つかる');
    return {x: Number(m[1]), y: Number(m[2]), rot: Number(m[3] ?? 0)};
  };
  // ドラッグで 100mm 右へ：前は右の壁から 140mm 以内で壁へ飛んだ（3210）。いまは動かした所に止まる
  await toTools();
  const p0 = await toPx(3185, 400);
  const p1 = await toPx(3285, 400);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.mouse.move((p0.x + p1.x) / 2, p0.y, {steps: 4});
  await page.mouse.move(p1.x, p1.y, {steps: 4});
  await page.mouse.up();
  let t = await toilet();
  assert.ok(Math.abs(t.x - 3085) <= 10 && t.y === 30, `100mm 動かした所に止まる ${JSON.stringify(t)}`);
  // 矢印キーは 10mm ずつ、右の枠の「微調整」も 10mm、Shift＋矢印は半マス
  const x0 = t.x;
  await page.keyboard.press('ArrowRight');
  assert.equal((await toilet()).x, x0 + 10);
  await page.getByRole('button', {name: '右へ 10mm 動かす'}).click();
  assert.equal((await toilet()).x, x0 + 20);
  await page.getByRole('button', {name: '下へ 10mm 動かす'}).click();
  assert.equal((await toilet()).y, 40);
  await page.keyboard.press('Shift+ArrowLeft');
  assert.equal((await toilet()).x, x0 + 20 - 455);
  await page.keyboard.press('Control+z');
  assert.equal((await toilet()).x, x0 + 20);
  // ↻ をドラッグして 45° 回す（0・90・180・270° の近くでなければ、その角度のまま）
  await toTools();
  t = await toilet();
  const hb = await page.locator('[data-turn-handle] circle').boundingBox();
  const h0 = {x: hb.x + hb.width / 2, y: hb.y + hb.height / 2};
  const c = await toPx(t.x + 200, t.y + 350);
  const r = Math.hypot(h0.x - c.x, h0.y - c.y);
  await page.mouse.move(h0.x, h0.y);
  await page.mouse.down();
  for (const deg of [10, 20, 30, 40, 45]) await page.mouse.move(c.x + r * Math.sin((deg * Math.PI) / 180), c.y - r * Math.cos((deg * Math.PI) / 180), {steps: 2});
  await page.mouse.up();
  t = await toilet();
  assert.ok(Math.abs(t.rot - 45) <= 2, `45° に回る ${t.rot}`);
  const deg = page.getByRole('textbox', {name: '向き'});
  assert.ok(Math.abs(Number(await deg.inputValue()) - 45) <= 2);
  {
    const cc = await toPx(t.x + 200, t.y + 350);
    await page.screenshot({path: path.join(outDir, 'madori-rotate.png'), clip: {x: Math.max(0, cc.x - 220), y: Math.max(0, cc.y - 170), width: 440, height: 300}});
  }
  // 向きの欄に打つ → その角度。↻ を押すだけなら 90° 回る（今までと同じ）
  await deg.fill('30');
  await deg.press('Enter');
  assert.equal((await toilet()).rot, 30);
  {
    const hb2 = await page.locator('[data-turn-handle] circle').boundingBox();
    await page.mouse.click(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2);
  }
  assert.equal((await toilet()).rot, 120);
  // 向きの欄は描き直したあとに変わる（すぐ読むと前の 30 のことがあった）
  for (let i = 0; i < 20 && (await deg.inputValue()) !== '120'; i++) await page.waitForTimeout(100);
  assert.equal(await deg.inputValue(), '120');
  // もう便器の入っているトイレしかないときは、今までどおり押した所に置く（すぐには入れない）
  await tool('洋式便器');
  assert.equal(await page.getByRole('button', {name: '洋式便器', exact: true}).first().getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
}
log('便器はトイレ・浴槽は浴室の中に・10mm ずつ動かす・吸い付くのは近いときだけ・360° 回す OK');

await page.screenshot({path: path.join(outDir, 'madori-pc.png')});
assert.equal(await page.locator('[data-del-near]').isVisible(), false, 'パソコンでは方眼の上の 🗑 は出さない（上の段の削除）');
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
// 携帯：番号の「✓ 確定」はいつも番号の右（番号を置いている間だけ押せる。段の高さ・方眼の位置は変わらない）
{
  const pbar = page.getByRole('toolbar', {name: '描く道具'});
  const before = await pbar.boundingBox();
  await pbar.getByRole('button', {name: /番号$/}).click();
  const done = pbar.getByRole('button', {name: '番号を確定'});
  assert.ok(await done.isVisible());
  assert.ok(await done.isEnabled());
  const after = await pbar.boundingBox();
  assert.ok(Math.abs(after.height - before.height) < 1, `段の高さ ${before.height} → ${after.height}`);
  assert.ok(Math.abs((await canvas.boundingBox()).y - box.y) < 1, '方眼の位置は変わらない');
  await page.screenshot({path: path.join(outDir, 'madori-phone-num.png')});
  await done.click();
  assert.ok(await done.isDisabled());
}
// 携帯：方眼のすぐ上の 🗑（上の段の削除は方眼から遠い）で消すモード → 方眼を押すと消える → もう一度押すとやめる
{
  const near = page.locator('[data-del-near]');
  assert.ok(await near.isVisible());
  const nb = await near.boundingBox();
  assert.ok(nb.y + nb.height <= (await canvas.boundingBox()).y && nb.y >= 0, `方眼のすぐ上 ${JSON.stringify(nb)}`);
  const before = await art();
  await near.click();
  assert.equal(await near.getAttribute('aria-pressed'), 'true');
  const cb = await canvas.boundingBox();
  // 方眼のまん中あたりで、何かが消える所を探して押す（押すと消える部品が赤くなる所）
  let hit = null;
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.4], [0.6, 0.4], [0.4, 0.6], [0.6, 0.6], [0.3, 0.3], [0.5, 0.3], [0.3, 0.5]]) {
    const p = {x: cb.x + cb.width * fx, y: cb.y + cb.height * fy};
    await page.mouse.click(p.x, p.y);
    if ((await art()) !== before) {
      hit = p;
      break;
    }
  }
  assert.ok(hit, '携帯でも押した部品が消える');
  await page.keyboard.press('Control+z');
  assert.equal(await art(), before);
  await near.click();
  assert.equal(await near.getAttribute('aria-pressed'), 'false');
}
await page.screenshot({path: path.join(outDir, 'madori-phone.png'), fullPage: true});
log('スマホの幅で横にはみ出さない・方眼の上の 🗑 で消す OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-madori: all OK');
