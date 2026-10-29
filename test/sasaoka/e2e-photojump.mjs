// 携帯・タブレットの「📷 写真へ」（写真の欄へすぐ飛ぶ）を確かめる（ユーザーの指示「携帯から見る場合とタブレットから見る場合のみ…一番メインのタブのところに…
// 写真の欄に飛ぶ…スクロールしてもすぐに飛べる」2026-10-29。PhotoJump.tsx）：
//   1. iPhone：タブの格子の理由書のとなり。工事見積書のタブで押す → 住宅改修申請書のタブに替わって写真の欄が画面の上。右下の浮かぶボタンは「↑ 上へ」→ いちばん上へ。
//      入れる欄のあたりでは「📷 写真へ」→ 写真の欄へ。写真の欄の ✏️・↻ は指で押しやすい大きさ（40px）
//   2. iPad の縦（820px）：「← 一覧へ戻る」の右（タブの段に入れると右が切れた）。タブの段が切れない
//   3. iPad の横（1180px）：様邸の名前の右。5つのタブとも、上のボタンの段の高さが同じ（タブの段に入れると介護保険証の枠が次の段に落ちた）
//   4. パソコン（マウス）：どこにも出さない
// usage: node e2e-photojump.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const TABS = ['📝 住宅改修申請書', '📋 工事見積書', '🛁 特定福祉用具申請書', '🏷 販売見積書', '📄 理由書'];

/** サンプルの様邸を開く（一覧から開くと工事見積書のタブ） */
async function openSample(opt) {
  const ctx = await browser.newContext({...opt, locale: 'ja-JP'});
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  await page.getByRole('button', {name: /サンプルで試す/}).click();
  await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
  await page.getByRole('group', {name: '保存・印刷・削除'}).waitFor();
  return {ctx, page};
}
/** 写真の欄の上の端が画面の上（8px）にある。ページの下まで動かしても届かないときは、ページのいちばん下で画面の上半分 */
const atPhotos = (page) =>
  page.waitForFunction(
    () => {
      const r = document.querySelector('[data-photo-board]')?.getBoundingClientRect();
      const bottom = window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2;
      return !!r && (Math.abs(r.top - 8) < 30 || (bottom && r.top < window.innerHeight / 2));
    },
    null,
    {timeout: 8000},
  );
const fab = (page) => page.locator('button.fixed[aria-label="写真の欄へ"], button.fixed[aria-label="上へ戻る"]');
const selected = (page) => page.locator('[role=tab][aria-selected=true]').innerText();

// ---------------- 1. iPhone
{
  const {ctx, page} = await openSample({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true});
  assert.equal(await selected(page), '📋 工事見積書');
  const tablist = page.locator('[data-job-tabs]');
  const jump = page.getByRole('button', {name: '写真の欄へ'});
  assert.equal(await jump.count(), 1);
  // タブの格子の中、理由書のとなり（同じ段）
  assert.equal(await jump.evaluate((el) => !!el.closest('[data-job-tabs]')), true);
  const [riyu, j] = [await page.getByRole('tab', {name: '📄 理由書'}).boundingBox(), await jump.boundingBox()];
  assert.ok(Math.abs(riyu.y - j.y) < 1 && j.x > riyu.x && Math.abs(riyu.width - j.width) < 2, `${JSON.stringify(riyu)} ${JSON.stringify(j)}`);
  await tablist.screenshot({path: path.join(outDir, 'photojump-iphone-tabs.png')});
  // 工事見積書のタブから押す → 住宅改修申請書のタブの写真の欄
  await jump.click();
  await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent?.includes('住宅改修申請書'));
  await atPhotos(page);
  await page.waitForTimeout(400);
  assert.deepEqual(await fab(page).allInnerTexts(), ['↑ 上へ']);
  await page.screenshot({path: path.join(outDir, 'photojump-iphone-photos.png')});
  // 写真の ✏️・↻ は指で押しやすい大きさ（写真を入れてから）
  const board = page.getByRole('region', {name: '写真'});
  await board.getByRole('button', {name: '①玄関 改修前', exact: true}).evaluate(async (el) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    c.getContext('2d').fillRect(0, 0, 640, 480);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'p.png', {type: 'image/png'}));
    for (const ev of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(ev, {dataTransfer: dt, bubbles: true, cancelable: true}));
  });
  for (const name of ['①玄関 改修前を右に回す', '①玄関 改修前に書き込む']) {
    const b = await board.getByRole('button', {name}).boundingBox();
    assert.ok(b.width >= 39 && b.height >= 39, `${name} ${JSON.stringify(b)}`);
  }
  // 「↑ 上へ」→ いちばん上（タブの段が見える）・浮かぶボタンは消える
  await page.getByRole('button', {name: '上へ戻る'}).click();
  await page.waitForFunction(() => window.scrollY < 5, null, {timeout: 5000});
  await page.waitForTimeout(300);
  assert.equal(await fab(page).count(), 0);
  // 入れる欄のあたり → 浮かぶボタンは「📷 写真へ」→ 写真の欄
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(400);
  assert.deepEqual(await fab(page).allInnerTexts(), ['📷 写真へ']);
  await page.screenshot({path: path.join(outDir, 'photojump-iphone-fab.png')});
  await fab(page).click();
  await atPhotos(page);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  log('iPhone：タブの格子の理由書のとなり・工事見積書のタブから写真の欄へ・右下の「↑ 上へ」「📷 写真へ」・✏️ ↻ は 40px OK');
  await ctx.close();
}

// ---------------- 2・3. iPad の縦・横：置き場所と、タブを替えても上のボタンの段が動かないこと
for (const [name, viewport, where] of [
  ['iPad の縦', {width: 820, height: 1180}, 'back'],
  ['iPad の横', {width: 1180, height: 820}, 'title'],
]) {
  const {ctx, page} = await openSample({viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true});
  const ys = [];
  for (const t of TABS) {
    await page.getByRole('tab', {name: t}).click();
    await page.waitForFunction((t) => [...document.querySelectorAll('[role=tab]')].some((e) => e.textContent.includes(t.slice(2)) && e.getAttribute('aria-selected') === 'true'), t);
    await page.getByRole('group', {name: '保存・印刷・削除'}).waitFor();
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    const jump = page.getByRole('button', {name: '写真の欄へ'});
    assert.equal(await jump.count(), 1, `${name} ${t}`);
    const m = await page.evaluate(() => {
      const tl = document.querySelector('[data-job-tabs]');
      const b = [...document.querySelectorAll('button[aria-label="写真の欄へ"]')].find((x) => x.getBoundingClientRect().width > 0 && !x.classList.contains('fixed'));
      const back = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('一覧へ戻る')).getBoundingClientRect();
      const r = b.getBoundingClientRect();
      return {
        clipped: tl.scrollWidth > tl.clientWidth + 1,
        inTabs: tl.contains(b),
        besideBack: Math.abs(r.top + r.height / 2 - (back.top + back.height / 2)) < 4 && r.left > back.right,
        besideTitle: !!b.closest('h1')?.parentElement || !!b.parentElement?.querySelector('h1'),
        right: r.right,
        y: Math.round(document.querySelector('[aria-label="保存・印刷・削除"]').getBoundingClientRect().top),
        sw: document.documentElement.scrollWidth,
      };
    });
    assert.ok(!m.clipped && !m.inTabs && m.right <= viewport.width && m.sw <= viewport.width, `${name} ${t} ${JSON.stringify(m)}`);
    assert.ok(where === 'back' ? m.besideBack : m.besideTitle, `${name} ${t} ${JSON.stringify(m)}`);
    ys.push(m.y);
    if (t === TABS[0]) await page.screenshot({path: path.join(outDir, `photojump-${viewport.width}.png`), clip: {x: 0, y: 0, width: viewport.width, height: 480}});
  }
  assert.ok(ys.every((y) => y === ys[0]), `${name} 上のボタンの段の高さ ${ys}`);
  // 押すと写真の欄へ（理由書のタブから）
  await page.getByRole('button', {name: '写真の欄へ'}).click();
  await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent?.includes('住宅改修申請書'));
  await atPhotos(page);
  log(`${name}：${where === 'back' ? '「← 一覧へ戻る」の右' : '様邸の名前の右'}・タブの段が切れない・5つのタブで上のボタンの段の高さが同じ・写真の欄へ OK`);
  await ctx.close();
}

// ---------------- 4. パソコン（マウス）：出さない
{
  const {ctx, page} = await openSample({viewport: {width: 1366, height: 900}});
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  await page.getByRole('form', {name: '申請書'}).waitFor();
  await page.evaluate(() => window.scrollTo(0, 2000));
  await page.waitForTimeout(500);
  assert.equal(await page.locator('button[aria-label="写真の欄へ"], button[aria-label="上へ戻る"]').count(), 0);
  log('パソコン：「📷 写真へ」も右下のボタンも出さない OK');
  await ctx.close();
}

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-photojump: all OK');
