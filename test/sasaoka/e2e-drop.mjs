// ドロップと貼り付けの分かりやすい枠を確かめる（ユーザーの指示「完了写真もドラッグ＆ドロップや貼付けしやすいようにする。介護保険証もそうです」2026-10-23。
// 2026-10-29 に、ほかの確かめから分けた）：
//   1. 様邸の画面の入口「🪪 介護保険証」：タブのすぐ右の点線の枠・「ここにドロップ・Ctrl+V」・ファイルを持ってくると薄い緑・重ねると「ここに離す」。枠の文字は「🪪 介護保険証」だけ
//   2. 写真の枠：ファイルを持ってくると枠が薄い緑・重ねると「ここに離す」、空いた枠にドロップ、枠を選んで Ctrl+V（介護保険証の読み取りにはならない）・差し替え
//   3. スマホ（390px）で横にはみ出さない（スクリーンショットを保存）
// usage: node e2e-drop.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}, ignoreDefaultArgs: ['--hide-scrollbars']});
const errors = [];

const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
// localhost のほかにはつながない
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();

// ---------------- 1. 入口：タブのすぐ右の点線の枠「🪪 介護保険証」「ここにドロップ・Ctrl+V」
const area = page.getByRole('button', {name: '🪪 介護保険証', exact: true});
assert.match(await area.innerText(), /^\s*🪪 介護保険証\s*ここにドロップ・Ctrl\+V\s*$/);
assert.equal(await area.evaluate((el) => getComputedStyle(el).borderStyle), 'dashed');
const tablist = page.getByRole('tablist', {name: '住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書'});
const [t, b] = [await tablist.boundingBox(), await area.boundingBox()];
assert.ok(b.x >= t.x + t.width && b.x - (t.x + t.width) < 24 && Math.abs(b.y + b.height / 2 - (t.y + t.height / 2)) < 6, `タブのすぐ右 ${JSON.stringify({t, b})}`);
await page.screenshot({path: path.join(outDir, 'area-idle.png'), clip: {x: 0, y: 0, width: 1366, height: 260}});
// ファイルを画面に持ってくると、落とせる所が薄い緑（重ねた所は「ここに離す」）
const dragOver = (selector) =>
  page.evaluate((sel) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.png', {type: 'image/png'}));
    const el = sel ? document.querySelector(sel) : document.body;
    el.dispatchEvent(new DragEvent('dragenter', {dataTransfer: dt, bubbles: true, cancelable: true}));
    el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
  }, selector);
await dragOver('h1');
await page.waitForFunction(() => document.querySelector('[aria-label="🪪 介護保険証"]')?.getAttribute('data-drop') === 'ready');
await dragOver('[aria-label="🪪 介護保険証"]');
await area.getByText('ここに離す').waitFor();
assert.equal(await area.getAttribute('data-drop'), 'over');
await page.screenshot({path: path.join(outDir, 'drag-over-area.png'), clip: {x: 0, y: 0, width: 1366, height: 260}});
await page.waitForFunction(() => !document.querySelector('[aria-label="🪪 介護保険証"]')?.textContent?.includes('ここに離す'), null, {timeout: 3000});
log('入口の枠「🪪 介護保険証」・ドラッグ中の色・「ここに離す」OK');

// ---------------- 2. 写真の枠：ドロップ・Ctrl+V（申請書のタブ）
/** ファイルの入った貼り付け（Ctrl+V。今いる所に paste を出す） */
const paste = (png, name) =>
  page.evaluate(
    ({b64, name}) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bytes], name, {type: 'image/png'}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true}));
    },
    {b64: png.toString('base64'), name},
  );
const photoBoard = page.getByRole('region', {name: '写真'});
const slot = (name) => photoBoard.getByRole('button', {name, exact: true});
const makeImage = async (color, w, h) =>
  Buffer.from(
    await page.evaluate(
      async ({color, w, h}) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, w, h);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        return [...new Uint8Array(await blob.arrayBuffer())];
      },
      {color, w, h},
    ),
  );
const red = await makeImage('#d33', 640, 480);
const blue = await makeImage('#33d', 480, 640);
// 空いた枠：「＋ 改修前」「ドロップ・Ctrl+V」。ファイルを持ってくると枠がみな薄い緑、重ねた枠は「ここに離す」
assert.match(await slot('①玄関 改修後').innerText(), /^＋ 改修後\s*📷 ドロップ・Ctrl\+V/);
const idle = await slot('①玄関 改修後').evaluate((el) => getComputedStyle(el).borderTopColor);
await dragOver('h1');
await page.waitForFunction(() => [...document.querySelectorAll('[data-photo-slot]')].every((el) => el.getAttribute('data-drop') === 'ready'));
// 薄い緑の枠（ドラッグしていないときの色とちがう。色は少しずつ変わるので、変わるのを待つ）
const slotSel = await slot('①玄関 改修後').evaluate((el) => `[data-photo-slot="${el.dataset.photoSlot}"]`);
await page.waitForFunction(({sel, idle}) => getComputedStyle(document.querySelector(sel)).borderTopColor !== idle, {sel: slotSel, idle}, {timeout: 3000});
await dragOver(slotSel);
await slot('①玄関 改修後').getByText('ここに離す').waitFor();
await photoBoard.screenshot({path: path.join(outDir, 'photo-drag-over.png')});
// ドロップ
await slot('①玄関 改修後').evaluate((el, bytes) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(bytes)], 'red.png', {type: 'image/png'}));
  for (const ev of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(ev, {dataTransfer: dt, bubbles: true, cancelable: true}));
}, [...red]);
await slot('①玄関 改修後').locator('img').waitFor();
// 枠を選んで（Tab で移って）Ctrl+V：その枠に入る。介護保険証の読み取りにはならない
await slot('②トイレ 改修後').focus();
await paste(blue, 'blue.png');
await slot('②トイレ 改修後').locator('img').waitFor();
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 写真のある枠を押して選んでから Ctrl+V：差し替え
await slot('①玄関 改修後').click();
assert.equal(await slot('①玄関 改修後').getAttribute('aria-pressed'), 'true');
const before = await slot('①玄関 改修後').locator('img').getAttribute('src');
await paste(blue, 'blue2.png');
await page.waitForFunction((b) => document.querySelector('[aria-label="①玄関 改修後"] img')?.getAttribute('src') !== b, before);
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 「📷 写真を選ぶ」も点線の枠（押すとファイルを選ぶ）
assert.match(await photoBoard.getByRole('button', {name: '📷 写真を選ぶ'}).innerText(), /ここにドロップ・Ctrl\+V/);
await photoBoard.screenshot({path: path.join(outDir, 'photo-board.png')});
log('写真の枠：ドラッグ中の色・ここに離す・ドロップ・Ctrl+V（選んだ枠・差し替え）OK');

// ---------------- 3. スマホの幅（390px）：横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(400);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `申請書のタブ ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
// スマホの幅では小さい字（ここにドロップ…）を出さない。枠の文字は「🪪 介護保険証」だけ
assert.equal((await page.getByRole('button', {name: '🪪 介護保険証', exact: true}).innerText()).trim(), '🪪 介護保険証');
await page.screenshot({path: path.join(outDir, 'phone-shinsei.png')});
await page.getByRole('region', {name: '写真'}).screenshot({path: path.join(outDir, 'phone-photos.png')});
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
await page.getByRole('region', {name: '新規作成'}).waitFor();
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `入口 ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
await page.screenshot({path: path.join(outDir, 'phone-entry.png')});
log('スマホの幅 OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-drop: all OK');
