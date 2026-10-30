// 写真への書き込みを確かめる（ユーザーの指示「申請書の写真に書き込んで、手すりの位置や踏み台の位置など、書き込めるようにしたい。入力方法は、とにかくExcelに近づける。
// 文字の書き込み機能や、写真に棒をひく。色や長さをかえる、線の細さを調整するなど、徹底的にExcelに似せてください。」2026-10-27）。
//   写真の欄の ✏️（プレビューの写真の道具の「✏️ 書き込み」・ダブルクリックでも）で書き込みの画面。上は Excel の「図形の書式」と同じ並びのリボン。
//   矢印をドラッグで描く（Shift で 15°ずつ）→ 図形の枠線で色・太さ・点線、四角形（Shift で正方形）、テキストボックス（押すとすぐ打てる・日本語も）、
//   押して選ぶ・ドラッグで動かす・つまみで大きさ・端の○で長さ、Ctrl+C／V・Delete・Ctrl+Z／Y・Ctrl を押したままドラッグで複製、サイズの欄（cm）、回転、右クリックのメニュー。
//   閉じると写真の欄・プレビュー・印刷の写真に重なり、読み直しても残り、Excel の写真貼付用紙には Excel の図形（直線矢印コネクタ・正方形/長方形・テキスト ボックス）で入る。
//   写真を 90°回すと書き込みも一緒に回り、写真を差し替えると消える。スマホ（390px）・iPad でも描ける。
//   2026-10-29：開いたときはいつも直線・直線・番号・テキストは描いても道具はそのまま（続けて描く）、ほかの道具は1つ描いたら「選択」に戻る・線の端に吸い付く（L字）・折れ線・手書きのペン（長押しでまっすぐ・ぐしゃぐしゃで消す）・
//   番号（①②）・選択。線は黄色・枠囲みは茶色が初め。リボンは大きく、まん中。補強板の道具は外した（ユーザーの指示「茶色の斜線の…機能は不要」2026-10-29）。
//   写真を回すのは上の帯の「左へ回す」「右へ回す」（ユーザーの指示「写真回転がわかりづらい」2026-10-29。前は書式の欄の ↺ ↻）。
//   消しゴム（なぞった線・図形を消す。1回で戻せる）・上の「戻る」「進む」は文字付き（ユーザーの指示「消しゴム機能をつける。戻る、進むボタンはもう少しわかりやすく」2026-10-29）
//   頂点の編集（角を動かす・線の上をつかんで足す・Delete／頂点を削除で消す・Esc／✓ で終える・戻る。指でも。ユーザーの指示「エクセル　頂点の編集機能をつける」2026-10-30）
// usage: node e2e-photomark.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route('https://cdn.jsdelivr.net/**', (route) => route.abort()); // 写真の日付の読み取りの部品（ここでは使わない）
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|jsdelivr/.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const preview = page.getByLabel('申請書のプレビュー');
await preview.waitFor();
const photoBoard = page.getByRole('region', {name: '写真'});
await photoBoard.waitFor();

/** 部屋の写真のような絵（壁・床・ドア）をブラウザで作る（PNG） */
const makePhoto = async (w, h) =>
  Buffer.from(
    await page.evaluate(
      async ({w, h}) => {
        const c = document.createElement('canvas');
        [c.width, c.height] = [w, h];
        const g = c.getContext('2d');
        const wall = g.createLinearGradient(0, 0, 0, h * 0.7);
        wall.addColorStop(0, '#e9e4da');
        wall.addColorStop(1, '#cfc7b8');
        g.fillStyle = wall;
        g.fillRect(0, 0, w, h * 0.7);
        g.fillStyle = '#9c7a54';
        g.fillRect(0, h * 0.7, w, h * 0.3);
        g.fillStyle = '#7a5a3a';
        g.fillRect(w * 0.62, h * 0.12, w * 0.22, h * 0.58); // ドア
        g.fillStyle = '#d9b84a';
        g.fillRect(w * 0.8, h * 0.42, w * 0.02, h * 0.04);
        g.fillStyle = '#b9ad98';
        g.fillRect(w * 0.08, h * 0.62, w * 0.3, h * 0.08); // 上がりかまち
        const b = await new Promise((r) => c.toBlob(r, 'image/png'));
        return [...new Uint8Array(await b.arrayBuffer())];
      },
      {w, h},
    ),
  );
const room = await makePhoto(1600, 1200);
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), photoBoard.getByRole('button', {name: '📷 写真を選ぶ'}).click()]);
await chooser.setFiles([{name: 'genkan.png', mimeType: 'image/png', buffer: room}]);
await photoBoard.getByRole('button', {name: '①玄関 改修前', exact: true}).locator('img').waitFor();

// ---------------- 書き込みの画面を開く（写真の右上の ✏️）
// 前の版で線の太さ 3pt を覚えていた端末（v2）：色はそのまま、太さは初めの 2pt に（ユーザーの指示「デフォルトの太さは2にする」2026-10-29）
await page.evaluate(() => localStorage.setItem('taiyo-sasaoka-mark-style-v2', JSON.stringify({shape: {line: 'FFFF00', width: 3}, pen: {line: 'FFFF00', width: 4.5}})));
await photoBoard.getByRole('button', {name: '①玄関 改修前に書き込む'}).click();
const dlg = page.getByRole('dialog', {name: '①玄関の改修前の写真に書き込む'});
await dlg.waitFor();
const ribbon = dlg.getByRole('toolbar', {name: '図形の書式'});
const stage = dlg.locator('[data-photo-stage]');
const box = async () => stage.boundingBox();
/** 写真の中の割合（0〜1）の点 → 画面の点 */
const at = async (fx, fy) => {
  const b = await box();
  return {x: b.x + b.width * fx, y: b.y + b.height * fy};
};
const dragOn = async (a, b, mods = []) => {
  const [p, q] = [await at(...a), await at(...b)];
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(p.x + ((q.x - p.x) * i) / 8, p.y + ((q.y - p.y) * i) / 8);
  await page.mouse.up();
  for (const m of mods) await page.keyboard.up(m);
};
const clickOn = async (fx, fy, opts = {}) => {
  const p = await at(fx, fy);
  await page.mouse.click(p.x, p.y, opts);
};
const marks = () => dlg.locator('[data-photo-stage] [data-mark]');
const kinds = () => marks().evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
/** 書き込みの画面の中の図形の線（SVG）の属性 */
const svgOf = (i, sel) => marks().nth(i).locator(sel).first().evaluate((el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])));

// 開いたときは直線（ユーザーの指示「デフォルトは棒線にする」2026-10-29）。リボンは画面のまん中
const pressed = (name) => ribbon.getByRole('button', {name, exact: true}).getAttribute('aria-pressed');
assert.equal(await pressed('直線'), 'true');
// 線の太さの初めは 2pt（一覧に 2.25 はなく 2）
{
  const fmt = dlg.getByRole('complementary', {name: '書式'});
  assert.equal(await fmt.getByRole('button', {name: '線の太さ 2 pt'}).getAttribute('aria-pressed'), 'true');
  assert.equal(await fmt.getByRole('button', {name: '線の太さ 2.25 pt'}).count(), 0);
}
{
  const rb = await ribbon.locator('> div').boundingBox();
  assert.ok(Math.abs(rb.x + rb.width / 2 - 1366 / 2) < 2, `リボンはまん中 ${rb.x}+${rb.width}`);
  const fsz = await ribbon.getByRole('group', {name: '図形の挿入'}).locator('> div').last().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(fsz >= 13, `まとまりの名前の字 ${fsz}px`);
  const cb = await dlg.getByRole('button', {name: '閉じる', exact: true}).boundingBox();
  assert.ok(Math.abs(cb.x + cb.width / 2 - 1366 / 2) < 2, `閉じるはまん中 ${cb.x}+${cb.width}`);
}
// 矢印：ドラッグで描く（終点に矢印）。描いたら選んだまま。道具は「選択」に戻る（ユーザーの指示「横棒と数字記入、文字の場合は連続で入力できるようにする。
// 折れ線などそれ以外は、一度選択して入力し終えたら、選択なしにもどる」2026-10-29。直線・番号・テキストはそのまま）
await ribbon.getByRole('button', {name: '矢印', exact: true}).click();
assert.equal(await pressed('矢印'), 'true');
await dragOn([0.15, 0.85], [0.42, 0.55]);
assert.deepEqual(await kinds(), ['line']);
assert.equal(await pressed('選択'), 'true'); // 1つ描いたら「選択」に戻る
assert.equal(await marks().nth(0).locator('polygon').count(), 1); // 矢印の先
assert.equal((await svgOf(0, 'line')).stroke, '#FFFF00'); // 黄色（最初の書式。ユーザーの指示「初期の色は黄色」）
// 図形の枠線 → 太さ 4.5pt・青・破線
await ribbon.getByRole('button', {name: '図形の枠線の一覧'}).click();
await page.getByRole('menu', {name: '図形の枠線'}).getByRole('menuitem', {name: '太さ'}).click();
await page.getByRole('menu', {name: '太さ'}).getByRole('menuitemradio', {name: '4.5 pt'}).click();
assert.equal(Number((await svgOf(0, 'line'))['stroke-width']).toFixed(2), (4.5 * 4 / 3).toFixed(2));
await ribbon.getByRole('button', {name: '図形の枠線の一覧'}).click();
await page.getByRole('menu', {name: '図形の枠線'}).getByRole('menuitemradio', {name: '青', exact: true}).click();
assert.equal((await svgOf(0, 'line')).stroke, '#0070C0');
await ribbon.getByRole('button', {name: '図形の枠線の一覧'}).click();
await page.getByRole('menu', {name: '図形の枠線'}).getByRole('menuitem', {name: '実線/点線'}).click();
await page.getByRole('menu', {name: '実線/点線'}).getByRole('menuitemradio', {name: '破線', exact: true}).click();
assert.ok((await svgOf(0, 'line'))['stroke-dasharray']);
log('矢印をドラッグで描く・枠線の色・太さ・破線 OK');

// 四角形（Shift で正方形）
await ribbon.getByRole('button', {name: '正方形/長方形'}).click();
await dragOn([0.06, 0.55], [0.4, 0.75], ['Shift']);
assert.deepEqual(await kinds(), ['line', 'rect']);
assert.equal(await pressed('選択'), 'true'); // 1つ描いたら「選択」に戻る
const rect = await svgOf(1, 'rect');
assert.ok(Math.abs(Number(rect.width) - Number(rect.height)) < 0.5, `正方形 ${rect.width}×${rect.height}`);
assert.equal(rect.fill, 'none'); // 塗りつぶしなし
// 枠囲み（四角形）は茶色（ユーザーの指示「枠囲みの初期データは茶色」。線の色を変えても枠囲みは別に覚える）
assert.equal(rect.stroke, '#996633');
log('四角形（Shift で正方形）OK');

// テキストボックス：押すとすぐ打てる（日本語も）
await ribbon.getByRole('button', {name: 'テキスト ボックス'}).click();
await clickOn(0.45, 0.2);
await page.keyboard.type('Tesuri ');
await page.keyboard.insertText('手すり　L=800mm');
await page.keyboard.press('Shift+Enter');
await page.keyboard.insertText('H=750mm');
await page.keyboard.press('Escape'); // 打ち終わる（図形は選んだまま）
assert.deepEqual(await kinds(), ['line', 'rect', 'text']);
assert.equal(await pressed('テキスト ボックス'), 'true'); // テキストは続けて打てる（道具はそのまま。正方形/長方形は1つ描いたら「選択」に戻った）
assert.equal(await marks().nth(2).locator('[data-mark-text]').innerText(), 'Tesuri 手すり　L=800mm\nH=750mm');
// 文字の大きさ 14pt・文字の色 赤
const fs = ribbon.getByRole('textbox', {name: 'フォント サイズ'});
await fs.fill('14');
await fs.press('Enter');
assert.equal(await marks().nth(2).locator('[data-mark-text]').evaluate((el) => el.style.fontSize).then((v) => parseFloat(v) > 0), true);
/** 画面の倍率（紙の画素 → 画面の画素） */
const zoom = () => stage.evaluate((el) => el.getBoundingClientRect().width / Number(el.querySelector('[data-mark] svg').getAttribute('viewBox').split(' ')[2]));
const k = await zoom();
const textDiv = () => marks().nth(2).locator('[data-mark-text]');
assert.ok(Math.abs(parseFloat(await textDiv().evaluate((el) => el.style.fontSize)) - (14 * 4 / 3) * k) < 0.05);
await ribbon.getByRole('button', {name: '文字の色の一覧'}).click();
await page.getByRole('menu', {name: '文字の色'}).getByRole('menuitemradio', {name: '緑', exact: true}).click();
assert.equal(await textDiv().evaluate((el) => getComputedStyle(el).color), 'rgb(0, 176, 80)');
await page.screenshot({path: path.join(outDir, 'mark-01-editor.png')});
// フォント：初めはメイリオ。一覧（30）から選ぶ（ユーザーの指示「メイリオみたいなやつがデフォルトで、一応３０種類ぐらい選べるようにする」）
assert.match(await textDiv().evaluate((el) => el.style.fontFamily), /^"?メイリオ"?, "?Meiryo/);
assert.equal(await ribbon.getByRole('button', {name: 'フォント', exact: true}).innerText().then((t) => t.replace('▼', '').trim()), 'メイリオ');
await ribbon.getByRole('button', {name: 'フォント', exact: true}).click();
const fontMenu = page.getByRole('menu', {name: 'フォント'});
assert.equal(await fontMenu.getByRole('menuitemradio').count(), 30);
await fontMenu.getByRole('menuitemradio', {name: 'HG丸ｺﾞｼｯｸM-PRO'}).click();
assert.match(await textDiv().evaluate((el) => el.style.fontFamily), /^"?HG丸ｺﾞｼｯｸM-PRO"?, "?HGMaruGothicMPRO/);
log('テキストボックス（押すとすぐ打てる・日本語・改行・文字の大きさ 14pt・文字の色・フォント）OK');

// ---------------- 選ぶ・動かす・端の○で長さ
const selected = () => dlg.locator('[data-sel]').evaluateAll((els) => els.map((e) => e.getAttribute('data-sel')));
const ids = () => marks().evaluateAll((els) => els.map((e) => e.getAttribute('data-mark')));
/** 図形の線（SVG の line・rect・ellipse）の画面の四角 */
const shapeBox = (i, sel) => marks().nth(i).locator(sel).first().boundingBox();
const lineMid = async (i) => {
  const b = await shapeBox(i, 'line');
  return {x: b.x + b.width / 2, y: b.y + b.height / 2};
};
const [arrowId, rectId, textId] = await ids();
await ribbon.getByRole('button', {name: '選択', exact: true}).click(); // テキストの道具をやめる（そのままだと押した所に次のテキスト）
let m = await lineMid(0);
await page.mouse.click(m.x, m.y);
assert.deepEqual(await selected(), [arrowId]);
assert.notEqual(await ribbon.getByRole('textbox', {name: '幅'}).inputValue(), '');
const line0 = await svgOf(0, 'line');
await page.mouse.move(m.x, m.y);
await page.mouse.down();
await page.mouse.move(m.x + 40, m.y - 10, {steps: 6});
await page.mouse.up();
const line1 = await svgOf(0, 'line');
assert.ok(Math.abs((Number(line1.x1) - Number(line0.x1)) * k - 40) < 1.5 && Math.abs((Number(line1.y1) - Number(line0.y1)) * k + 10) < 1.5, '動かした');
// 端の○（終点）をドラッグで、長さ・向き（矢印の先の三角の分、線の端は少し手前）
const tip = await marks().nth(0).locator('polygon').evaluate((el) => {
  const [x, y] = el.getAttribute('points').split(' ')[0].split(',').map(Number);
  const r = el.ownerSVGElement.getBoundingClientRect();
  const s = r.width / Number(el.ownerSVGElement.getAttribute('viewBox').split(' ')[2]);
  return {x: r.left + x * s, y: r.top + y * s};
});
await page.mouse.move(tip.x, tip.y);
await page.mouse.down();
await page.mouse.move(tip.x + 60, tip.y - 30, {steps: 6});
await page.mouse.up();
const tip2 = await marks().nth(0).locator('polygon').evaluate((el) => el.getAttribute('points').split(' ')[0].split(',').map(Number));
const tipBefore = [(tip.x - (await stage.boundingBox()).x) / k, (tip.y - (await stage.boundingBox()).y) / k];
assert.ok(Math.abs(tip2[0] - tipBefore[0] - 60 / k) < 1.5 && Math.abs(tip2[1] - tipBefore[1] + 30 / k) < 1.5, '端で長さを変えた');
log('押して選ぶ・ドラッグで動かす・端の○で長さ OK');

// ---------------- コピー・貼り付け・削除・元に戻す・やり直し（Ctrl+C／V・Delete・Ctrl+Z／Y）・Ctrl を押したままドラッグで複製
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
assert.deepEqual(await kinds(), ['line', 'rect', 'text', 'line']);
assert.equal((await selected()).length, 1);
assert.notEqual((await selected())[0], arrowId); // 貼り付けた図形を選ぶ
await page.keyboard.press('Delete');
assert.deepEqual(await kinds(), ['line', 'rect', 'text']);
await page.keyboard.press('Control+z');
assert.deepEqual(await kinds(), ['line', 'rect', 'text', 'line']);
await page.keyboard.press('Control+y');
assert.deepEqual(await kinds(), ['line', 'rect', 'text']);
const rb = await shapeBox(1, 'rect');
const edge = {x: rb.x + 1, y: rb.y + rb.height * 0.3}; // 四角形の左の辺（まん中の○＝大きさのつまみをよけて）
await page.mouse.click(edge.x, edge.y);
assert.deepEqual(await selected(), [rectId]);
await page.keyboard.down('Control');
await page.mouse.move(edge.x, edge.y);
await page.mouse.down();
await page.mouse.move(edge.x + 60, edge.y - 20, {steps: 6});
await page.mouse.up();
await page.keyboard.up('Control');
assert.deepEqual(await kinds(), ['line', 'rect', 'text', 'rect']);
await dlg.getByRole('button', {name: '戻る', exact: true}).click(); // 上の「戻る」（Excel のクイック アクセス ツール バーの元に戻す）
assert.deepEqual(await kinds(), ['line', 'rect', 'text']);
log('コピー・貼り付け・削除・元に戻す・やり直し・Ctrl を押したままドラッグで複製 OK');

// ---------------- サイズ（高さ・幅 cm）・回転・塗りつぶし・重なりの順（右クリックのメニュー）
const tb = await marks().nth(2).locator('[data-mark-text]').boundingBox();
await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
assert.deepEqual(await selected(), [textId]);
const width = ribbon.getByRole('textbox', {name: '幅'});
await width.fill('5');
await width.press('Enter');
assert.ok(Math.abs(Number((await svgOf(2, 'rect')).width) - (5 / 2.54) * 96) < 0.2, 'テキストボックスの幅 5cm');
assert.equal(await width.inputValue(), '5.00');
// 角のつまみを斜めに引く：テキストボックスは縦横の比のまま、文字も大きく（ユーザーの指示「斜めにも縮小、拡大できるようにする」）→ 元に戻す
{
  const handles = dlg.locator(`[data-sel="${textId}"] > circle`);
  const br = await handles.nth(7).boundingBox(); // 右下
  const before = await svgOf(2, 'rect');
  await page.mouse.move(br.x + br.width / 2, br.y + br.height / 2);
  await page.mouse.down();
  await page.mouse.move(br.x + br.width / 2 + 60, br.y + br.height / 2 + 30, {steps: 6});
  await page.mouse.up();
  const after = await svgOf(2, 'rect');
  const grow = Number(after.width) / Number(before.width);
  assert.ok(grow > 1.1, `幅 ${before.width} → ${after.width}`);
  const fsNow = Number(await ribbon.getByRole('textbox', {name: 'フォント サイズ'}).inputValue());
  assert.ok(Math.abs(fsNow - 14 * grow) <= 0.6, `文字の大きさ ${fsNow}（${grow}倍）`);
  assert.ok(Number(after.height) / Number(before.height) > 1.1, '高さも大きく');
  await page.keyboard.press('Control+z');
  assert.equal(Number(await ribbon.getByRole('textbox', {name: 'フォント サイズ'}).inputValue()), 14);
}
// 四角形を選んで、回転 → 右へ 90 度回転、塗りつぶし → 黄
await page.mouse.click(edge.x, edge.y);
await ribbon.getByRole('button', {name: '回転', exact: true}).click();
await page.getByRole('menu', {name: '回転'}).getByRole('menuitem', {name: '右へ 90 度回転'}).click();
assert.match((await svgOf(1, 'rect')).transform ?? '', /^rotate\(90 /);
await ribbon.getByRole('button', {name: '図形の塗りつぶしの一覧'}).click();
await page.getByRole('menu', {name: '図形の塗りつぶし'}).getByRole('menuitemradio', {name: '黄', exact: true}).click();
assert.equal((await svgOf(1, 'rect')).fill, '#FFFF00');
// 右クリックのメニューで最背面へ（四角形がいちばん下＝最初に）
const rb2 = await shapeBox(1, 'rect');
await page.mouse.click(rb2.x + rb2.width / 2, rb2.y + rb2.height / 2, {button: 'right'});
const ctxMenu = page.getByRole('menu', {name: '右クリックのメニュー'});
assert.deepEqual((await ctxMenu.getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), [
  '切り取り Ctrl+X',
  'コピー Ctrl+C',
  '貼り付け Ctrl+V',
  'テキストの編集 F2',
  '最前面へ移動',
  '最背面へ移動',
  '削除 Delete',
]);
await ctxMenu.getByRole('menuitem', {name: '最背面へ移動'}).click();
assert.deepEqual(await ids(), [rectId, arrowId, textId]);
log('サイズ（幅 cm）・回転・塗りつぶし・右クリックのメニュー（最背面へ移動）OK');

// ---------------- 楕円・直線（Shift で 15°ずつ＝ほぼ水平なら水平）・Esc の順（道具 → 選ぶのをやめる → 閉じる）
await ribbon.getByRole('button', {name: '楕円'}).click();
await dragOn([0.55, 0.62], [0.75, 0.72]);
await ribbon.getByRole('button', {name: '直線', exact: true}).click();
await dragOn([0.5, 0.92], [0.95, 0.94], ['Shift']);
assert.deepEqual(await kinds(), ['rect', 'line', 'text', 'ellipse', 'line']);
const flat = await svgOf(4, 'line');
assert.equal(Number(flat.y1).toFixed(2), Number(flat.y2).toFixed(2)); // 水平
assert.equal(await marks().nth(4).locator('polygon').count(), 0); // 直線は矢印なし
await page.keyboard.press('Escape'); // 道具と、選ぶのをやめる
assert.deepEqual(await selected(), []);
assert.equal(await pressed('選択'), 'true');
await page.screenshot({path: path.join(outDir, 'mark-02-editor-all.png')});
await page.keyboard.press('Escape'); // 閉じる
await dlg.waitFor({state: 'detached'});
log('楕円・直線（Shift で水平）・Esc で閉じる OK');

// ---------------- 写真の欄・プレビュー・印刷の写真に重なる。読み直しても残る
const thumbMarks = () => photoBoard.getByRole('button', {name: '①玄関 改修前', exact: true}).locator('[data-mark]').count();
assert.equal(await thumbMarks(), 5);
const pvSlot = preview.getByRole('group', {name: '住改・写真 ①', exact: true});
await pvSlot.scrollIntoViewIfNeeded();
assert.equal(await pvSlot.locator('[data-mark]').count(), 5);
await pvSlot.screenshot({path: path.join(outDir, 'mark-03-preview.png')});
await page.waitForTimeout(1200); // 自動保存
await page.reload();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await photoBoard.getByRole('button', {name: '①玄関 改修前', exact: true}).locator('img').waitFor();
assert.equal(await thumbMarks(), 5);
log('閉じると写真の欄・プレビューに重なる・読み直しても残る OK');

// ---------------- Excel：写真貼付用紙に Excel の図形で（直線矢印コネクタ・正方形/長方形・テキスト ボックス・楕円・直線コネクタ）
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
const file = path.join(outDir, dl.suggestedFilename());
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const wbRels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const rid = /<sheet [^>]*name="住改・写真 ①"[^>]*r:id="([^"]+)"/.exec(wb)[1];
const sheetPath = 'xl/' + new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(wbRels)[1];
const drawRid = /<drawing r:id="([^"]+)"/.exec(strFromU8(files[sheetPath]))[1];
const drawPath = 'xl/drawings/' + new RegExp(`Id="${drawRid}"[^>]*Target="\\.\\./drawings/([^"]+)"`).exec(strFromU8(files[sheetPath.replace(/([^/]+)$/, '_rels/$1.rels')]))[1];
const d = strFromU8(files[drawPath]);
const anchors = [...d.matchAll(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)].map((x) => x[0]);
const pic = anchors.findIndex((a) => a.includes('name="改修前 '));
const after = anchors.slice(pic + 1).filter((a) => /name="(直線|正方形|テキスト|楕円)/.test(a));
assert.equal(after.length, 5, '写真のすぐ上に5つの図形');
assert.deepEqual(after.map((a) => /name="([^"\d]+) \d+"/.exec(a)[1]), ['正方形/長方形', '直線矢印コネクタ', 'テキスト ボックス', '楕円', '直線コネクタ']);
const [xRect, xArrow, xText, xEllipse, xLine] = after;
assert.match(xArrow, /<a:ln w="57150"><a:solidFill><a:srgbClr val="0070C0"\/><\/a:solidFill><a:prstDash val="dash"\/><a:tailEnd type="triangle" w="med" len="med"\/><\/a:ln>/);
assert.match(xRect, /<a:xfrm rot="5400000">/);
assert.match(xRect, /<a:solidFill><a:srgbClr val="FFFF00"\/><\/a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="996633"\/>/); // 初めの太さ 2pt（25400 EMU）
assert.match(xText, /<xdr:cNvSpPr txBox="1"\/>/);
assert.match(xText, /sz="1400"><a:solidFill><a:srgbClr val="00B050"\/><\/a:solidFill><a:latin typeface="HG丸ｺﾞｼｯｸM-PRO"\/><a:ea typeface="HG丸ｺﾞｼｯｸM-PRO"\/><a:cs typeface="HG丸ｺﾞｼｯｸM-PRO"\/><\/a:rPr><a:t>Tesuri 手すり　L=800mm<\/a:t>/);
assert.match(xText, /<a:t>H=750mm<\/a:t>/);
assert.match(xText, /<a:spAutoFit\/>/);
assert.match(xEllipse, /prst="ellipse"/);
assert.doesNotMatch(xLine, /tailEnd|headEnd/);
log('Excel の写真貼付用紙に Excel の図形で入る OK');

// ---------------- 🖨 申請書を印刷：写真の用紙の写真にも重なる
await page.getByRole('button', {name: '🖨 申請書を印刷', exact: true}).click();
const printPages = page.getByRole('group', {name: '印刷するページ'});
await printPages.getByRole('checkbox', {name: '4枚目'}).check();
const printed = page.locator('.print-overlay .shinsei-sheet').nth(3);
await printed.scrollIntoViewIfNeeded();
assert.equal(await printed.locator('[data-mark]').count(), 5);
await printed.screenshot({path: path.join(outDir, 'mark-03b-print.png')});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await page.locator('.print-overlay').waitFor({state: 'detached'});
log('印刷の写真にも重なる OK');

// ---------------- 写真を 90°回すと書き込みも一緒に回る・写真を差し替えると消える
const normLine = async (where) =>
  where.locator('[data-mark]').nth(4).locator('line').evaluate((el) => {
    const vb = el.ownerSVGElement.getAttribute('viewBox').split(' ').map(Number);
    return ['x1', 'y1', 'x2', 'y2'].map((a, i) => Number(el.getAttribute(a)) / vb[i % 2 ? 3 : 2]);
  });
const beforeTurn = await normLine(pvSlot);
await photoBoard.getByRole('button', {name: '①玄関 改修前を右に回す'}).click();
await page.waitForTimeout(300);
const afterTurn = await normLine(pvSlot);
// 右に 90°：(x, y) → (1 − y, x)
assert.ok(Math.abs(afterTurn[0] - (1 - beforeTurn[1])) < 0.01 && Math.abs(afterTurn[1] - beforeTurn[0]) < 0.01, `回した ${beforeTurn} → ${afterTurn}`);
await pvSlot.screenshot({path: path.join(outDir, 'mark-04-preview-turned.png')});
await photoBoard.getByRole('button', {name: '①玄関 改修前', exact: true}).click();
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('status', {name: '選んでいる写真'}).getByRole('button', {name: '差し替え'}).click()]);
await chooser2.setFiles([{name: 'genkan2.png', mimeType: 'image/png', buffer: room}]);
await page.waitForTimeout(800);
assert.equal(await thumbMarks(), 0);
assert.equal(await pvSlot.locator('[data-mark]').count(), 0);
log('写真を 90°回すと書き込みも回る・差し替えると消える OK');

// ---------------- プレビューの写真の道具の「✏️ 書き込み」から（ダブルクリックでも）
await pvSlot.getByRole('button', {name: '写真貼付用紙①の改修前'}).dblclick();
await dlg.waitFor();
assert.equal(await pressed('直線'), 'true'); // 開いたときはいつも直線
await ribbon.getByRole('button', {name: '双方向矢印'}).click();
await dragOn([0.2, 0.3], [0.8, 0.3]);
assert.equal(await marks().nth(0).locator('polygon').count(), 2); // 両端に矢印
log('プレビューの写真のダブルクリックから・前に使った道具のまま開く・双方向矢印 OK');

// ---------------- 続けて描く・L字（線の端に吸い付く）
const pt = (el) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(el[a]));
await ribbon.getByRole('button', {name: '直線', exact: true}).click();
await dragOn([0.2, 0.5], [0.5, 0.5]);
await dragOn([0.503, 0.505], [0.5, 0.8]); // 前の線の終わりの少し横から
assert.deepEqual(await kinds(), ['line', 'line', 'line']);
assert.equal(await pressed('直線'), 'true');
const [la, lb] = [pt(await svgOf(1, 'line')), pt(await svgOf(2, 'line'))];
assert.deepEqual([lb[0], lb[1]].map((v) => v.toFixed(3)), [la[2], la[3]].map((v) => v.toFixed(3)), 'L字：前の線の端につながる');
assert.equal(lb[0].toFixed(3), lb[2].toFixed(3), '縦に4°以内はまっすぐ縦');
log('直線を続けて描く・L字（線の端に吸い付く）OK');

// ---------------- 描いた線は、描く道具のままドラッグで動かせる（ユーザーの指示「ひいた線は、ドロップしたら位置を動かせるようにする」2026-10-29）。
// 描いたばかりの線（選んでいる）の上を押して動かす → 動く（長さ・向きはそのまま、線は増えない、道具は直線のまま）。戻るで戻る
{
  const before = pt(await svgOf(2, 'line'));
  await dragOn([0.5, 0.65], [0.6, 0.62]);
  assert.deepEqual(await kinds(), ['line', 'line', 'line'], '線は増えない');
  assert.equal(await pressed('直線'), 'true');
  const after = pt(await svgOf(2, 'line'));
  const b = await box();
  const [dx, dy] = [after[0] - before[0], after[1] - before[1]];
  const k = (before[3] - before[1]) / (0.3 * b.height); // 図の単位 ÷ 画面の画素（線は写真の高さの 0.3）
  assert.ok(Math.abs(dx - b.width * 0.1 * k) < 3 && Math.abs(dy + b.height * 0.03 * k) < 3, `動いた ${JSON.stringify({before, after, dx, dy, k})}`);
  assert.ok(Math.abs(after[2] - after[0] - (before[2] - before[0])) < 0.5 && Math.abs(after[3] - after[1] - (before[3] - before[1])) < 0.5, '長さ・向きはそのまま');
  await page.screenshot({path: path.join(outDir, 'mark-04b-move-line.png')});
  await dlg.getByRole('button', {name: '戻る', exact: true}).click();
  assert.deepEqual(pt(await svgOf(2, 'line')).map((v) => v.toFixed(2)), before.map((v) => v.toFixed(2)));
}
log('描いた線を描く道具のままドラッグで動かす・戻る OK');

// ---------------- 折れ線（押すたびに角 → ✓ 折れ線を終える）
// 押した点には小さな丸と番号（1・2・3…）。1つ目を押しただけでも見える（ユーザーの指示「折れ線で四角をつくるとき、点をうった場所がわかるように、
// どことどこを繋ぐかわかるように小さく表示する」2026-10-30）
const polyPoints = () => dlg.locator('[data-poly-point]').evaluateAll((els) => els.map((e) => e.textContent));
await ribbon.getByRole('button', {name: /^折れ線/}).click();
for (const [i, [fx, fy]] of [
  [0.6, 0.2],
  [0.75, 0.2],
  [0.75, 0.4],
  [0.9, 0.4],
].entries()) {
  await clickOn(fx, fy);
  assert.deepEqual(await polyPoints(), Array.from({length: i + 1}, (_, j) => String(j + 1)), `折れ線の点の印 ${i + 1}`);
}
await page.mouse.move(0, 0); // マウスの所までの線を外して撮る
await page.screenshot({path: path.join(outDir, 'mark-04b-poly-points.png')});
await dlg.getByRole('button', {name: '✓ 折れ線を終える'}).click();
assert.equal(await dlg.locator('[data-poly-points]').count(), 0); // 終えたら印は消える
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen']);
assert.equal((await svgOf(3, 'polyline')).points.trim().split(/\s+/).length, 4);
assert.equal((await svgOf(3, 'polyline')).stroke, '#FFFF00');
assert.equal(await pressed('選択'), 'true'); // 1つ描いたら「選択」に戻る
// 3つ目の点からは、はじめの点の近くを押すと閉じた形で終える（四角を折れ線で描く。Excel のフリーフォームと同じ）→ 戻るで消す
await ribbon.getByRole('button', {name: /^折れ線/}).click();
for (const [fx, fy] of [
  [0.5, 0.62],
  [0.7, 0.62],
  [0.7, 0.78],
  [0.5, 0.78],
])
  await clickOn(fx, fy);
await clickOn(0.506, 0.627); // はじめの点の少し横
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
{
  const q = (await svgOf(4, 'polyline')).points.trim().split(/\s+/);
  assert.equal(q.length, 5, `閉じた折れ線 ${q}`);
  assert.equal(q[0], q[4], 'はじめの点へ戻って閉じる');
}
assert.equal(await dlg.locator('[data-poly-points]').count(), 0);
assert.equal(await pressed('選択'), 'true');
await dlg.getByRole('button', {name: '戻る', exact: true}).click();
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen']);
log('折れ線（押した点の丸と番号・はじめの点を押すと閉じる）OK');

// ---------------- 四角（角を4つ押すだけ。4つ目で閉じる。ななめの四角も。ユーザーの指示「写真の中のような⬜︎の図をつくるときは、1角ワンタッチで⬜︎やななめ四角をつくれるように」2026-10-29）
await ribbon.getByRole('button', {name: /^四角（角を4つ/}).click();
for (const [fx, fy] of [
  [0.1, 0.12],
  [0.35, 0.08],
  [0.4, 0.38],
  [0.12, 0.42],
])
  await clickOn(fx, fy);
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
{
  const q = (await svgOf(4, 'polyline')).points.trim().split(/\s+/);
  assert.equal(q.length, 5, `四角の角 ${q}`);
  assert.equal(q[0], q[4], '閉じている');
}
assert.equal((await svgOf(4, 'polyline')).stroke, '#FFFF00');
assert.equal(await pressed('選択'), 'true'); // 1つ描いたら「選択」に戻る
assert.equal(await dlg.getByRole('button', {name: '✕ 四角をやめる'}).count(), 0);
await page.screenshot({path: path.join(outDir, 'mark-04c-quad.png')});
// 描いた四角（選んだまま）の中の、線のない所を押してドラッグ：そのまま動く（ユーザーの指示「この図形を、そのまま位置の変更をできるようにする」2026-10-29。
// 前は細い線の上を押さないとつかめず、中を押すと選ぶのが外れた）。戻るで戻る
{
  const pts0 = (await svgOf(4, 'polyline')).points.trim().split(/\s+/).map((q) => q.split(',').map(Number));
  const c = await at(0.25, 0.25); // 四角のまん中（線から離れた所）
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 40, c.y + 30, {steps: 6});
  await page.mouse.up();
  const pts1 = (await svgOf(4, 'polyline')).points.trim().split(/\s+/).map((q) => q.split(',').map(Number));
  assert.equal(pts1.length, pts0.length);
  pts0.forEach(([x, y], i) => assert.ok(Math.abs((pts1[i][0] - x) * k - 40) < 1.5 && Math.abs((pts1[i][1] - y) * k - 30) < 1.5, `動いた ${pts0[i]} → ${pts1[i]}`));
  assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']); // 増えない
  assert.equal((await selected()).length, 1); // 選んだまま
  await page.screenshot({path: path.join(outDir, 'mark-04d-quad-moved.png')});
  // 枠の外（何もない所）を押すと選ぶのが外れる
  await clickOn(0.9, 0.9);
  assert.equal((await selected()).length, 0);
  await dlg.getByRole('button', {name: '戻る', exact: true}).click();
  assert.deepEqual((await svgOf(4, 'polyline')).points.trim().split(/\s+/).map((q) => q.split(',').map(Number)), pts0);
}
// 頂点の編集（Excel の「図形の編集 → 頂点の編集」。ユーザーの指示「エクセル　頂点の編集機能をつける」2026-10-30）：
// 角の黒い四角をつかむとその角だけ動く・線の上をつかんで動かすと角が増える・Delete でその角を消す・Esc で終える。戻るで1つずつ戻る
{
  const ptsOf = async () => (await svgOf(4, 'polyline')).points.trim().split(/\s+/).map((q) => q.split(',').map(Number));
  const pts0 = await ptsOf();
  const pointsBtn = ribbon.getByRole('button', {name: '頂点の編集', exact: true});
  await clickOn(0.9, 0.9);
  assert.equal(await pointsBtn.isDisabled(), true); // 何も選んでいないときは押せない
  await clickOn(0.225, 0.1); // 四角の上の辺を押して選ぶ
  assert.equal((await selected()).length, 1);
  await pointsBtn.click();
  assert.equal(await pointsBtn.getAttribute('aria-pressed'), 'true');
  const edit = dlg.locator('[data-vertex-edit]');
  // 角の四角は絵だけ（押すのは下の写真の所）なので、その場所を押す
  const clickVertex = async (i) => {
    const r = await edit.locator(`[data-vertex="${i}"]`).boundingBox();
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  };
  assert.equal(await edit.getAttribute('data-points'), '4');
  assert.equal(await edit.locator('[data-vertex]').count(), 4);
  // 3つ目の角（右下）をつかんで動かす：その角だけが動く
  const v2 = await edit.locator('[data-vertex="2"]').boundingBox();
  await page.mouse.move(v2.x + v2.width / 2, v2.y + v2.height / 2);
  await page.mouse.down();
  await page.mouse.move(v2.x + v2.width / 2 + 50, v2.y + v2.height / 2 + 40, {steps: 6});
  await page.mouse.up();
  const pts1 = await ptsOf();
  assert.equal(pts1.length, 5);
  assert.deepEqual(pts1[0], pts1[4], '閉じたまま');
  pts0.forEach(([x, y], i) => {
    const [dx, dy] = [(pts1[i][0] - x) * k, (pts1[i][1] - y) * k];
    if (i === 2) assert.ok(Math.abs(dx - 50) < 1.5 && Math.abs(dy - 40) < 1.5, `動かした角 ${pts0[i]} → ${pts1[i]}`);
    else assert.ok(Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6, `ほかの角は動かない ${i}: ${pts0[i]} → ${pts1[i]}`);
  });
  assert.equal(await edit.locator('[data-vertex="2"]').getAttribute('fill'), 'white'); // 動かした角を選んだまま
  // 上の辺のまん中をつかんで上へ：そこに角が増える（2つ目の角）
  await dragOn([0.225, 0.1], [0.225, 0.03]);
  assert.equal(await edit.getAttribute('data-points'), '5');
  assert.equal(await edit.locator('[data-vertex="1"]').getAttribute('fill'), 'white');
  await page.screenshot({path: path.join(outDir, 'mark-04e-points.png')});
  // Delete：選んだ角を消す（図形は消さない）。消すと角を選んでいないので「頂点を削除」は押せない
  await page.keyboard.press('Delete');
  assert.equal(await edit.getAttribute('data-points'), '4');
  assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
  assert.equal(await dlg.getByRole('button', {name: '頂点を削除'}).isDisabled(), true);
  // 角をつかんでから「頂点を削除」（スマホ・iPad 用のボタン）。角が3つより少なくはならない
  await clickVertex(3);
  await dlg.getByRole('button', {name: '頂点を削除'}).click();
  assert.equal(await edit.getAttribute('data-points'), '3');
  await clickVertex(0);
  await page.keyboard.press('Delete');
  assert.equal(await edit.getAttribute('data-points'), '3');
  // Esc で終える（図形は選んだまま）
  await page.keyboard.press('Escape');
  assert.equal(await edit.count(), 0);
  assert.equal(await pointsBtn.getAttribute('aria-pressed'), 'false');
  assert.equal((await selected()).length, 1);
  // 右クリックのメニューからも始められる → 「✓ 頂点の編集を終える」で終える
  const c = await at(0.225, 0.1);
  await page.mouse.click(c.x, c.y, {button: 'right'});
  await page.getByRole('menuitem', {name: '頂点の編集', exact: true}).click();
  assert.equal(await edit.count(), 1);
  await dlg.getByRole('button', {name: '✓ 頂点の編集を終える'}).click();
  assert.equal(await edit.count(), 0);
  // 戻る4回（動かす・足す・消す・消す）で元の四角
  for (let i = 0; i < 4; i++) await dlg.getByRole('button', {name: '戻る', exact: true}).click();
  assert.deepEqual(await ptsOf(), pts0);
  log('頂点の編集（動かす・足す・消す・終える・戻る）OK');
}
// 選んだ図形の右上の × で消す（ユーザーの指示「グループ化したものをバツで消せるようにする」2026-10-30。スマホには Delete のキーがない）。戻るで戻る
{
  const x = dlg.getByRole('button', {name: '選んだ図形を削除'});
  await clickOn(0.9, 0.9);
  assert.equal(await x.count(), 0); // 何も選んでいないときは出ない
  await clickOn(0.225, 0.1); // 四角の上の辺を押して選ぶ
  const xb = await x.boundingBox();
  const [qr, qt] = [await at(0.4, 0.08), await at(0.4, 0.08)].map((p, i) => (i ? p.y : p.x)); // 四角の右の端（x 0.4）・上の端（y 0.08）
  assert.ok(xb.x > qr && xb.y + xb.height < qt, `× は四角の右上の外 ${JSON.stringify(xb)} ${qr},${qt}`);
  await x.click();
  assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen']);
  assert.equal(await x.count(), 0);
  await dlg.getByRole('button', {name: '戻る', exact: true}).click();
  assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
  // いくつ選んでいても（Ctrl+A）まとめて消す → 戻る
  await clickOn(0.225, 0.1);
  await page.keyboard.press('Control+a');
  await x.click();
  assert.deepEqual(await kinds(), []);
  await dlg.getByRole('button', {name: '戻る', exact: true}).click();
  assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
  await clickOn(0.9, 0.9);
  log('選んだ図形の右上の × で消す（1つ・いくつも・戻る）OK');
}
// 3つ押して「✕ 四角をやめる」：描かない
await ribbon.getByRole('button', {name: /^四角（角を4つ/}).click();
for (const [fx, fy] of [
  [0.62, 0.6],
  [0.72, 0.58],
  [0.74, 0.7],
])
  await clickOn(fx, fy);
await dlg.getByRole('button', {name: '✕ 四角をやめる'}).click();
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
// 戻る：四角を消す（このあとの確かめのため）
await dlg.getByRole('button', {name: '戻る', exact: true}).click();
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen']);
log('四角（角を4つ押すと閉じる・途中でやめると描かない・戻る）OK');

// ---------------- ペン（手書き）・長押しでまっすぐ・ぐしゃぐしゃで消す
await ribbon.getByRole('button', {name: /^ペン/}).click();
{
  const [p, q] = [await at(0.1, 0.62), await at(0.4, 0.62)];
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(p.x + ((q.x - p.x) * i) / 12, p.y + Math.sin(i) * 12);
  await page.mouse.up();
}
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen']);
assert.ok((await svgOf(4, 'polyline')).points.trim().split(/\s+/).length > 4, '手書きの線');
assert.equal((await svgOf(4, 'polyline'))['stroke-linecap'], 'round');
assert.equal(await pressed('選択'), 'true'); // 1本描いたら「選択」に戻る
await ribbon.getByRole('button', {name: /^ペン/}).click();
{
  // 長押し：描いて止める（0.8秒）→ まっすぐな線に
  const [p, q] = [await at(0.1, 0.72), await at(0.45, 0.74)];
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(p.x + ((q.x - p.x) * i) / 10, p.y + ((q.y - p.y) * i) / 10 + (i % 2 ? 6 : -6));
  await page.waitForTimeout(800);
  await page.mouse.up();
}
assert.deepEqual(await kinds(), ['line', 'line', 'line', 'pen', 'pen', 'line']);
assert.equal((await svgOf(5, 'line')).stroke, '#FFFF00');
await ribbon.getByRole('button', {name: /^ペン/}).click();
{
  // ぐしゃぐしゃ：L字の縦の線の上 → その線が消える
  const top = await at(0.5, 0.55);
  const bottom = await at(0.5, 0.75);
  await page.mouse.move(top.x - 20, top.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(top.x + (i % 2 ? 20 : -20), top.y + ((bottom.y - top.y) * i) / 14);
  await page.mouse.up();
}
assert.deepEqual(await kinds(), ['line', 'line', 'pen', 'pen', 'line']);
log('ペン（手書き・長押しでまっすぐ・ぐしゃぐしゃで消す）OK');

// ---------------- 消しゴム：なぞった所の線・図形をまるごと消す（なぞり終わるまでに通ったものを1回で）→ 戻る・進む
{
  const before = await ids();
  const undoBtn = dlg.getByRole('button', {name: '戻る', exact: true});
  const redoBtn = dlg.getByRole('button', {name: '進む', exact: true});
  assert.deepEqual([await undoBtn.innerText(), await redoBtn.innerText()].map((t) => t.trim()), ['戻る', '進む']);
  await ribbon.getByRole('button', {name: /^消しゴム/}).click();
  assert.equal(await pressed(/^消しゴム/), 'true');
  // マウスを載せると消しゴムの丸
  const c = await at(0.25, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.mouse.move(c.x + 2, c.y + 2);
  assert.equal(await dlg.locator('[data-eraser]').count(), 1);
  // 手書きの線（y＝0.62 のあたりの波の線）を縦になぞる
  await dragOn([0.25, 0.55], [0.25, 0.69]);
  const after = await ids();
  assert.ok(after.length < before.length && after.every((id) => before.includes(id)), `消しゴム ${before} → ${after}`);
  assert.equal(await pressed(/^消しゴム/), 'true'); // 消しゴムのまま（続けて消せる）
  await page.screenshot({path: path.join(outDir, 'mark-06a-eraser.png')});
  await undoBtn.click();
  assert.deepEqual(await ids(), before);
  await redoBtn.click();
  assert.deepEqual(await ids(), after);
  await undoBtn.click();
  assert.deepEqual(await ids(), before);
  // 何もない所をなぞっても、何も消さない（戻るの回数も増えない）
  await dragOn([0.95, 0.05], [0.97, 0.08]);
  assert.deepEqual(await ids(), before);
  assert.equal(await redoBtn.isDisabled(), false);
}
log('消しゴム（なぞった線を消す・戻る・進む）OK');

// ---------------- 四角形（枠囲み・茶色）・番号（①②）。補強板の道具はない（ユーザーの指示「茶色の斜線の…機能は不要」2026-10-29）
assert.equal(await ribbon.getByRole('button', {name: /^補強板/}).count(), 0);
await ribbon.getByRole('button', {name: '正方形/長方形'}).click();
await dragOn([0.55, 0.55], [0.75, 0.7]);
assert.equal((await kinds()).at(-1), 'rect');
assert.equal((await svgOf(5, 'rect')).stroke, '#996633');
await ribbon.getByRole('button', {name: /^番号/}).click();
await clickOn(0.85, 0.15);
await clickOn(0.85, 0.85);
assert.deepEqual(await marks().evaluateAll((els) => els.slice(-2).map((e) => e.querySelector('[data-mark-text]')?.textContent)), ['①', '②']);
assert.equal(await pressed(/^番号/), 'true'); // 番号は続けて置ける（道具はそのまま）
await page.screenshot({path: path.join(outDir, 'mark-06-pen-board-num.png')});
// 番号の道具のまま閉じて開き直しても、開いたときは直線（ユーザーの指示「デフォルトはただの横棒」2026-10-29。前は最後に使った道具を覚えていた）
await dlg.getByRole('button', {name: '閉じる', exact: true}).click();
await dlg.waitFor({state: 'detached'});
await photoBoard.getByRole('button', {name: '①玄関 改修前に書き込む'}).click();
await dlg.waitFor();
assert.equal(await pressed('直線'), 'true');
// テキストは続けて打てる：押して打つ → 別の所を押すと次のテキスト（道具はテキストのまま）
{
  const n0 = (await kinds()).length;
  await ribbon.getByRole('button', {name: 'テキスト ボックス'}).click();
  await clickOn(0.05, 0.92); // テキストボックスの幅は写真の 35%（0.05〜0.40）
  await page.keyboard.insertText('A');
  await clickOn(0.6, 0.92);
  await page.keyboard.insertText('B');
  await page.keyboard.press('Escape');
  assert.equal(await pressed('テキスト ボックス'), 'true');
  assert.deepEqual(await marks().evaluateAll((els) => els.slice(-2).map((e) => e.querySelector('[data-mark-text]')?.textContent)), ['A', 'B']);
  assert.equal((await kinds()).length, n0 + 2);
  // このあとの確かめのため、戻るで2つのテキストを消す
  for (let i = 0; i < 6 && (await kinds()).length > n0; i++) await dlg.getByRole('button', {name: '戻る', exact: true}).click();
  assert.equal((await kinds()).length, n0);
  await ribbon.getByRole('button', {name: '選択', exact: true}).click();
}
// 選択：押して選ぶ（四角形の枠）
await ribbon.getByRole('button', {name: '選択', exact: true}).click();
await clickOn(0.55, 0.62);
assert.deepEqual(await selected(), [(await ids())[5]]);
log('四角形・番号・選択（補強板の道具はない）OK');

// ---------------- 書式の欄（写真の横にいつも出す）：選んだ四角形の線の色・太さ（ユーザーの指示「線の太さや色などは空いたスペースに常時表示する」）
const panel = dlg.getByRole('complementary', {name: '書式'});
{
  const [pb, sb] = [await panel.boundingBox(), await stage.boundingBox()];
  assert.ok(pb.x + pb.width <= sb.x && pb.height > 400, `書式の欄は写真の左 ${JSON.stringify(pb)}`);
}
assert.equal(await panel.getByRole('button', {name: '線の色 茶'}).getAttribute('aria-pressed'), 'true');
await panel.getByRole('button', {name: '線の色 青'}).click();
await panel.getByRole('button', {name: '線の太さ 6 pt'}).click();
assert.equal((await svgOf(5, 'rect')).stroke, '#0070C0');
assert.equal(Number((await svgOf(5, 'rect'))['stroke-width']).toFixed(2), (8).toFixed(2));
assert.equal(await panel.getByRole('button', {name: '線の太さ 6 pt'}).getAttribute('aria-pressed'), 'true');
await panel.getByRole('button', {name: '線の種類 丸点線'}).click();
assert.ok((await svgOf(5, 'rect'))['stroke-dasharray']);
log('書式の欄（線の色・太さ・線の種類）OK');

// ---------------- 写真を回す（書き込みも一緒に回る）
{
  const b0 = await stage.boundingBox();
  // 回すボタンは上の帯（閉じるの右）。絵と「右へ回す」の文字
  const turnR = dlg.getByRole('button', {name: '写真を右へ回す'});
  assert.equal((await turnR.innerText()).replace(/\s+/g, ''), '右へ回す');
  assert.equal(await panel.getByRole('button', {name: /回す/}).count(), 0);
  await turnR.click();
  await page.waitForFunction((r) => {
    const el = document.querySelector('[role="dialog"] [data-photo-stage]');
    const b = el?.getBoundingClientRect();
    return b && Math.abs(b.width / b.height - r) < 0.02;
  }, b0.height / b0.width);
  assert.equal(await marks().count(), 8);
  await page.screenshot({path: path.join(outDir, 'mark-07-turned.png')});
  await dlg.getByRole('button', {name: '写真を左へ回す'}).click();
  await page.waitForFunction((r) => {
    const el = document.querySelector('[role="dialog"] [data-photo-stage]');
    const b = el?.getBoundingClientRect();
    return b && Math.abs(b.width / b.height - r) < 0.02;
  }, b0.width / b0.height);
}
log('写真を回す（書き込みも一緒に）OK');
await dlg.getByRole('button', {name: '閉じる'}).click();
assert.equal(await pvSlot.locator('[data-mark]').count(), 8);

// ---------------- 平面図の図にも書き込める（ユーザーの指示「平面図に①②の番号・線などを書き込める」2026-10-29）：道具の「✏️ 書き込み」・プレビュー・印刷・Excel。図を差し替えると消える
{
  const planSlot = preview.locator('[data-plan-slot]');
  await planSlot.scrollIntoViewIfNeeded();
  const [pc] = await Promise.all([page.waitForEvent('filechooser'), planSlot.click()]);
  await pc.setFiles([{name: 'plan.png', mimeType: 'image/png', buffer: await makePhoto(1600, 1131)}]);
  await planSlot.locator('img').waitFor();
  await planSlot.click();
  await preview.getByRole('toolbar', {name: '平面図の図'}).getByRole('button', {name: '✏️ 書き込み'}).click();
  const pd = page.getByRole('dialog', {name: '平面図の図に書き込む'});
  await pd.waitFor();
  const pst = pd.locator('[data-photo-stage]');
  const pAt = async (fx, fy) => {
    const b = await pst.boundingBox();
    return {x: b.x + b.width * fx, y: b.y + b.height * fy};
  };
  const pr = pd.getByRole('toolbar', {name: '図形の書式'});
  await pr.getByRole('button', {name: /^番号/}).click();
  for (const [fx, fy] of [[0.2, 0.3], [0.6, 0.3]]) {
    const q = await pAt(fx, fy);
    await page.mouse.click(q.x, q.y);
  }
  await pr.getByRole('button', {name: '直線', exact: true}).click();
  {
    const [a, b] = [await pAt(0.2, 0.6), await pAt(0.7, 0.6)];
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y);
    await page.mouse.up();
  }
  assert.equal(await pd.locator('[data-photo-stage] [data-mark]').count(), 3);
  await page.screenshot({path: path.join(outDir, 'mark-08-plan-editor.png')});
  await pd.getByRole('button', {name: '閉じる'}).click();
  await pd.waitFor({state: 'detached'});
  assert.equal(await planSlot.locator('[data-mark]').count(), 3, 'プレビューの平面図に書き込みが重なる');
  assert.deepEqual(await planSlot.locator('[data-mark-text]').allTextContents(), ['①', '②']);
  await planSlot.screenshot({path: path.join(outDir, 'mark-09-plan-preview.png')});
  // ダブルクリックでも開く
  await planSlot.dblclick();
  await pd.waitFor();
  await pd.getByRole('button', {name: '閉じる'}).click();
  // Excel：平面図の図のすぐ上に Excel の図形で
  const [pdl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  const pfile = path.join(outDir, 'plan-' + pdl.suggestedFilename());
  await pdl.saveAs(pfile);
  const pf = unzipSync(new Uint8Array(await readFile(pfile)));
  const planDrawing = Object.keys(pf).filter((k) => /^xl\/drawings\/drawing\d+\.xml$/.test(k)).map((k) => strFromU8(pf[k])).find((x) => /name="平面図 \d+"/.test(x));
  assert.ok(planDrawing, 'Excel に平面図の図');
  const pa = [...planDrawing.matchAll(/<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)].map((x) => x[0]);
  const at0 = pa.findIndex((a) => /name="平面図 \d+"/.test(a));
  const over = pa.slice(at0 + 1, at0 + 4);
  assert.equal(over.filter((a) => /<a:t>①<\/a:t>/.test(a)).length, 1, 'Excel の平面図に①');
  assert.equal(over.filter((a) => /<a:t>②<\/a:t>/.test(a)).length, 1, 'Excel の平面図に②');
  assert.equal(over.filter((a) => /name="直線コネクタ \d+"/.test(a)).length, 1, 'Excel の平面図に直線');
  // 印刷：平面図にも重なる
  await page.getByRole('button', {name: '🖨 申請書を印刷', exact: true}).click();
  const pp = page.locator('.print-overlay .shinsei-sheet').filter({has: page.locator('[data-marks="3"]')});
  const allBoxes = page.getByRole('group', {name: '印刷するページ'}).getByRole('checkbox');
  for (let i = 0; i < (await allBoxes.count()); i++) await allBoxes.nth(i).check();
  await pp.first().waitFor();
  assert.ok((await pp.count()) >= 1, '印刷の平面図に書き込み');
  await page.keyboard.press('Escape');
  await page.locator('.print-overlay').waitFor({state: 'detached'});
  // 図を差し替えると書き込みは消える（写真と同じ）
  await planSlot.click();
  const [pc2] = await Promise.all([page.waitForEvent('filechooser'), preview.getByRole('toolbar', {name: '平面図の図'}).getByRole('button', {name: '差し替え'}).click()]);
  await pc2.setFiles([{name: 'plan2.png', mimeType: 'image/png', buffer: await makePhoto(1131, 1600)}]);
  await page.waitForFunction(() => document.querySelectorAll('[data-plan-slot] [data-mark]').length === 0);
}
log('平面図の図に書き込む（道具・ダブルクリック・プレビュー・Excel・印刷・差し替えで消える）OK');

// ---------------- スマホ（390px）・iPad：リボンは横に動かせて、写真は画面の幅いっぱい
for (const [name, vp, touch] of [
  ['phone', {width: 390, height: 844}, true],
  ['ipad', {width: 1180, height: 820}, true],
]) {
  const c2 = await browser.newContext({viewport: vp, deviceScaleFactor: 2, hasTouch: touch, locale: 'ja-JP'});
  await c2.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await c2.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => errors.push(`${name} pageerror: ` + e.message));
  p2.on('dialog', (x) => x.accept());
  await p2.goto(`${site}/jutaku-mitsumori/index.html`);
  await p2.getByRole('button', {name: /サンプルで試す/}).click();
  await p2.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
  await p2.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  const board = p2.getByRole('region', {name: '写真'});
  const [ch] = await Promise.all([p2.waitForEvent('filechooser'), board.getByRole('button', {name: '📷 写真を選ぶ'}).click()]);
  await ch.setFiles([{name: 'genkan.png', mimeType: 'image/png', buffer: room}]);
  await board.getByRole('button', {name: '①玄関 改修前に書き込む'}).click();
  const d2 = p2.getByRole('dialog', {name: '①玄関の改修前の写真に書き込む'});
  await d2.waitFor();
  const st = await d2.locator('[data-photo-stage]').boundingBox();
  assert.ok(st.width > vp.width * 0.8 || st.height > (vp.height - 200) * 0.8, `${name} 写真の大きさ ${st.width}×${st.height}`);
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth), vp.width, `${name} 横にはみ出さない`);
  // 指で描く（矢印）
  await d2.getByRole('button', {name: '矢印', exact: true}).tap();
  const cdp = await c2.newCDPSession(p2);
  const pt = (fx, fy) => ({x: st.x + st.width * fx, y: st.y + st.height * fy});
  const touchAt = (type, p) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x: p.x, y: p.y}]});
  await touchAt('touchStart', pt(0.2, 0.8));
  for (let i = 1; i <= 6; i++) await touchAt('touchMove', pt(0.2 + (0.3 * i) / 6, 0.8 - (0.3 * i) / 6));
  await touchAt('touchEnd', pt(0.5, 0.5));
  assert.equal(await d2.locator('[data-photo-stage] [data-mark]').count(), 1, `${name} 指で矢印`);
  await p2.screenshot({path: path.join(outDir, `mark-05-${name}.png`)});
  // 描いた矢印を、矢印の道具のまま指で動かす（線の上を押して動かす）→ 元の所へ戻す
  {
    const lineAt = () => d2.locator('[data-photo-stage] [data-mark] line').first().evaluate((el) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(el.getAttribute(a))));
    const a0 = await lineAt();
    const slide = async (from, to) => {
      await touchAt('touchStart', pt(...from));
      for (let i = 1; i <= 6; i++) await touchAt('touchMove', pt(from[0] + ((to[0] - from[0]) * i) / 6, from[1] + ((to[1] - from[1]) * i) / 6));
      await touchAt('touchEnd', pt(...to));
    };
    await slide([0.35, 0.65], [0.35, 0.55]);
    const a1 = await lineAt();
    assert.equal(await d2.locator('[data-photo-stage] [data-mark]').count(), 1, `${name} 指で動かしても矢印は1本`);
    assert.ok(a1[1] < a0[1] - 5 && Math.abs(a1[0] - a0[0]) < 2, `${name} 指で矢印を動かす ${a0} → ${a1}`);
    await slide([0.35, 0.55], [0.35, 0.65]);
    const a2 = await lineAt();
    assert.ok(Math.abs(a2[1] - a0[1]) < 2, `${name} 元の所へ ${a0} → ${a2}`);
  }
  // スマホの書式の欄：「色 ▼」「太さ ▼」が横に動かさなくても見える。押すと全部の色・太さが画面の中に折り返して開き、選ぶと閉じる
  // （ユーザーの指示「携帯版 色と太さに関しては、閉じた状態でもいいので、横にスクロールせずにも表示される位置に」2026-10-29）
  if (name === 'phone') {
    const aside = d2.getByRole('complementary', {name: '書式'});
    assert.equal(await aside.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, 'スマホの書式の欄が横にはみ出す');
    for (const label of ['線の色を選ぶ', '線の太さを選ぶ', '写真を左へ回す', '写真を右へ回す', '閉じる']) {
      const r = await d2.getByRole('button', {name: label, exact: true}).boundingBox();
      assert.ok(r && r.x >= 0 && r.x + r.width <= vp.width, `${label} ${JSON.stringify(r)}`);
    }
    const arrow = d2.locator('[data-photo-stage] [data-mark]').first();
    await p2.waitForTimeout(800);
    await d2.getByRole('button', {name: '線の色を選ぶ'}).tap();
    const colors = d2.getByRole('group', {name: '線の色', exact: true}).getByRole('button');
    await colors.first().waitFor();
    assert.equal(await colors.count(), 12);
    for (const b of await colors.all()) {
      const r = await b.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= vp.width, `色が画面からはみ出す ${JSON.stringify(r)}`);
    }
    await p2.screenshot({path: path.join(outDir, `mark-05c-${name}-colors.png`), clip: {x: 0, y: 0, width: vp.width, height: 420}});
    await d2.getByRole('button', {name: '線の色 赤'}).tap();
    await d2.getByRole('group', {name: '線の色', exact: true}).waitFor({state: 'hidden', timeout: 5000}); // 選ぶと閉じる（パソコン用の欄は隠れている）
    await p2.waitForFunction(() => document.querySelector('[role="dialog"] [data-photo-stage] [data-mark] line')?.getAttribute('stroke') === '#FF0000', null, {timeout: 5000});
    await d2.getByRole('button', {name: '線の太さを選ぶ'}).tap();
    const widths = d2.getByRole('group', {name: '線の太さ', exact: true}).getByRole('button');
    await widths.first().waitFor();
    for (const b of await widths.all()) {
      const r = await b.boundingBox();
      assert.ok(r.x >= 0 && r.x + r.width <= vp.width, `太さが画面からはみ出す ${JSON.stringify(r)}`);
    }
    await p2.screenshot({path: path.join(outDir, `mark-05d-${name}-widths.png`), clip: {x: 0, y: 0, width: vp.width, height: 420}});
    await d2.getByRole('button', {name: '線の太さ 6 pt'}).tap();
    await p2.waitForFunction(() => Number(document.querySelector('[role="dialog"] [data-photo-stage] [data-mark] line')?.getAttribute('stroke-width')) > 7, null, {timeout: 5000});
    assert.equal((await d2.getByRole('button', {name: '線の太さを選ぶ'}).innerText()).replace(/\s|▼/g, ''), '6');
    assert.ok(arrow);
  }
  // 上の「戻る」「進む」：文字が見えて、画面に入る。閉じるとかさならない
  const close = await d2.getByRole('button', {name: '閉じる', exact: true}).boundingBox();
  for (const label of ['戻る', '進む']) {
    const b = d2.getByRole('button', {name: label, exact: true});
    assert.equal((await b.innerText()).trim(), label, `${name} ${label}の文字`);
    const r = await b.boundingBox();
    assert.ok(r.x >= 0 && r.x + r.width <= close.x && r.width >= 44 && r.height >= 44, `${name} ${label} ${JSON.stringify(r)} 閉じる ${JSON.stringify(close)}`);
  }
  // 指の消しゴムで矢印を消す → 戻るで戻る
  // tap() は押した結果（click）を待たないので、消しゴムに替わるのを待ってから描く。指で描いたすぐあとの tap は取りこぼすことがあるので間をあける（下の「戻る」と同じ）
  await p2.waitForTimeout(800);
  await d2.getByRole('button', {name: /^消しゴム/}).tap();
  await d2.locator('button[aria-pressed="true"][aria-label^="消しゴム"]').waitFor();
  await touchAt('touchStart', pt(0.3, 0.6));
  for (let i = 1; i <= 6; i++) await touchAt('touchMove', pt(0.3 + (0.15 * i) / 6, 0.6 + (0.1 * i) / 6));
  await touchAt('touchEnd', pt(0.45, 0.7));
  assert.equal(await d2.locator('[data-photo-stage] [data-mark]').count(), 0, `${name} 指の消しゴム`);
  assert.equal(await d2.locator('[data-eraser]').count(), 0, `${name} 指を離したら消しゴムの丸は消える`);
  // 消したすぐあと（0.3秒ほど）に押すと、テストのブラウザは2回たたいたと見て押した結果（click）を出さないことがある。人が押すくらいの間をあける
  await p2.waitForTimeout(800);
  await d2.getByRole('button', {name: '戻る', exact: true}).tap();
  await p2.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-photo-stage] [data-mark]').length === 1, null, {timeout: 5000}); // 戻る
  await p2.screenshot({path: path.join(outDir, `mark-05b-${name}-top.png`), clip: {x: 0, y: 0, width: vp.width, height: 330}});
  // 頂点の編集を指で：四角を描く → 「頂点の編集」→ 角を指でずらす → 「✓ 頂点の編集を終える」
  {
    const tapAt = async (fx, fy) => {
      await touchAt('touchStart', pt(fx, fy));
      await touchAt('touchEnd', pt(fx, fy));
      await p2.waitForTimeout(400);
    };
    await p2.waitForTimeout(800);
    await d2.getByRole('button', {name: /^四角（角を4つ/}).tap();
    await d2.locator('button[aria-pressed="true"][aria-label^="四角（角を4つ"]').waitFor();
    for (const [fx, fy] of [
      [0.55, 0.15],
      [0.8, 0.12],
      [0.82, 0.35],
      [0.57, 0.38],
    ])
      await tapAt(fx, fy);
    assert.equal(await d2.locator('[data-photo-stage] [data-mark]').count(), 2, `${name} 指で四角`);
    await d2.getByRole('button', {name: '頂点の編集', exact: true}).tap();
    const edit = d2.locator('[data-vertex-edit]');
    await edit.waitFor();
    const v0 = await edit.locator('[data-vertex="2"]').boundingBox();
    const from = {x: v0.x + v0.width / 2, y: v0.y + v0.height / 2};
    await touchAt('touchStart', from);
    for (let i = 1; i <= 6; i++) await touchAt('touchMove', {x: from.x + (30 * i) / 6, y: from.y + (24 * i) / 6});
    await touchAt('touchEnd', {x: from.x + 30, y: from.y + 24});
    const v1 = await edit.locator('[data-vertex="2"]').boundingBox();
    assert.ok(Math.abs(v1.x - v0.x - 30) < 2 && Math.abs(v1.y - v0.y - 24) < 2, `${name} 指で角を動かす ${JSON.stringify(v0)} → ${JSON.stringify(v1)}`);
    const bar = await d2.getByRole('button', {name: '✓ 頂点の編集を終える'}).boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= vp.width, `${name} 頂点の編集を終えるが画面に入る ${JSON.stringify(bar)}`);
    await p2.screenshot({path: path.join(outDir, `mark-05e-${name}-points.png`)});
    await p2.waitForTimeout(800);
    await d2.getByRole('button', {name: '✓ 頂点の編集を終える'}).tap();
    await edit.waitFor({state: 'detached', timeout: 5000});
    // 指で × を押して四角を消す（矢印は残る）
    await p2.waitForTimeout(800);
    await p2.screenshot({path: path.join(outDir, `mark-05f-${name}-delete.png`)});
    await d2.getByRole('button', {name: '選んだ図形を削除'}).tap();
    await p2.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-photo-stage] [data-mark]').length === 1, null, {timeout: 5000});
    // 指で折れ線：1つ目を押しただけで点の印が出る・2つ目で 1・2 → はじめの点を押して閉じる（4つ目のあと）→ 戻る
    await p2.waitForTimeout(800);
    await d2.getByRole('button', {name: /^折れ線/}).tap();
    await d2.locator('button[aria-pressed="true"][aria-label^="折れ線"]').waitFor();
    await tapAt(0.55, 0.15);
    assert.equal(await d2.locator('[data-poly-point]').count(), 1, `${name} 1つ目の点の印`);
    for (const [fx, fy] of [
      [0.8, 0.15],
      [0.8, 0.35],
      [0.55, 0.35],
    ])
      await tapAt(fx, fy);
    assert.equal(await d2.locator('[data-poly-point]').count(), 4, `${name} 4つの点の印`);
    await p2.screenshot({path: path.join(outDir, `mark-05g-${name}-poly-points.png`)});
    await tapAt(0.56, 0.16); // はじめの点の近く
    await p2.waitForFunction(() => document.querySelectorAll('[role="dialog"] [data-photo-stage] [data-mark]').length === 2, null, {timeout: 5000});
    assert.equal(await d2.locator('[data-poly-points]').count(), 0, `${name} 閉じたら印は消える`);
  }
  await c2.close();
}
log('スマホ（390px）・iPad：指で描ける・横にはみ出さない OK');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK');
