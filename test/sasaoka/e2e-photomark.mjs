// 写真への書き込みを確かめる（ユーザーの指示「申請書の写真に書き込んで、手すりの位置や踏み台の位置など、書き込めるようにしたい。入力方法は、とにかくExcelに近づける。
// 文字の書き込み機能や、写真に棒をひく。色や長さをかえる、線の細さを調整するなど、徹底的にExcelに似せてください。」2026-10-27）。
//   写真の欄の ✏️（プレビューの写真の道具の「✏️ 書き込み」・ダブルクリックでも）で書き込みの画面。上は Excel の「図形の書式」と同じ並びのリボン。
//   矢印をドラッグで描く（Shift で 15°ずつ）→ 図形の枠線で色・太さ・点線、四角形（Shift で正方形）、テキストボックス（押すとすぐ打てる・日本語も）、
//   押して選ぶ・ドラッグで動かす・つまみで大きさ・端の○で長さ、Ctrl+C／V・Delete・Ctrl+Z／Y・Ctrl を押したままドラッグで複製、サイズの欄（cm）、回転、右クリックのメニュー。
//   閉じると写真の欄・プレビュー・印刷の写真に重なり、読み直しても残り、Excel の写真貼付用紙には Excel の図形（直線矢印コネクタ・正方形/長方形・テキスト ボックス）で入る。
//   写真を 90°回すと書き込みも一緒に回り、写真を差し替えると消える。スマホ（390px）・iPad でも描ける
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

// 矢印：ドラッグで描く（終点に矢印）。描いたら選んだまま（Excel と同じ）
await ribbon.getByRole('button', {name: '矢印', exact: true}).click();
assert.equal(await ribbon.getByRole('button', {name: '矢印', exact: true}).getAttribute('aria-pressed'), 'true');
await dragOn([0.15, 0.85], [0.42, 0.55]);
assert.deepEqual(await kinds(), ['line']);
assert.equal(await ribbon.getByRole('button', {name: '矢印', exact: true}).getAttribute('aria-pressed'), 'false'); // 描いたら道具は戻る
assert.equal(await marks().nth(0).locator('polygon').count(), 1); // 矢印の先
assert.equal((await svgOf(0, 'line')).stroke, '#FF0000'); // 赤（最初の書式）
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
const rect = await svgOf(1, 'rect');
assert.ok(Math.abs(Number(rect.width) - Number(rect.height)) < 0.5, `正方形 ${rect.width}×${rect.height}`);
assert.equal(rect.fill, 'none'); // 塗りつぶしなし
// 四角形は枠線の色・太さが前に選んだもの（青・4.5pt。Excel の「既定の図形に設定」のかわり）
assert.equal(rect.stroke, '#0070C0');
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
log('テキストボックス（押すとすぐ打てる・日本語・改行・文字の大きさ 14pt・文字の色）OK');

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
await dlg.getByRole('button', {name: '元に戻す'}).click(); // 上の ↶（Excel のクイック アクセス ツール バー）
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
await page.keyboard.press('Escape'); // 選ぶのをやめる
assert.deepEqual(await selected(), []);
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
assert.match(xRect, /<a:solidFill><a:srgbClr val="FFFF00"\/><\/a:solidFill><a:ln w="57150">/);
assert.match(xText, /<xdr:cNvSpPr txBox="1"\/>/);
assert.match(xText, /sz="1400"><a:solidFill><a:srgbClr val="00B050"\/><\/a:solidFill><\/a:rPr><a:t>Tesuri 手すり　L=800mm<\/a:t>/);
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
await ribbon.getByRole('button', {name: '双方向矢印'}).click();
await dragOn([0.2, 0.3], [0.8, 0.3]);
assert.equal(await marks().nth(0).locator('polygon').count(), 2); // 両端に矢印
await dlg.getByRole('button', {name: '閉じる'}).click();
assert.equal(await pvSlot.locator('[data-mark]').count(), 1);
log('プレビューの写真のダブルクリックから・双方向矢印 OK');

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
  await c2.close();
}
log('スマホ（390px）・iPad：指で描ける・横にはみ出さない OK');

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('OK');
