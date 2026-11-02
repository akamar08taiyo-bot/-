// 見積もり・申請書を作成するの「新規作成」の「📑 久留米市・飯塚市・大分市・田川市の申請書」（otherForms.ts。ユーザーの指示
// 「久留米、飯塚、大分、田川の申請書に飛べるページを用意して」2026-11-02）：押すと4つの市の申請書のページへのリンク（新しいタブで開く）。
// 田川市は「＋ 広域連合の書式で作る」で広域連合の申請書・見積書を作る。スマホの幅でも横にはみ出さない。
// 外のサイトには行かない（リンクの行き先と target を確かめるだけ。localhost 以外の通信は止める）
// usage: node e2e-otherforms.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
for (const size of [{width: 1366, height: 900}, {width: 390, height: 844}]) {
  const ctx = await browser.newContext({viewport: size, locale: 'ja-JP', ...(size.width < 500 ? {deviceScaleFactor: 2, hasTouch: true, isMobile: true} : {})});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  const open = page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '📑 久留米市・飯塚市・大分市・田川市の申請書'});
  await open.scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(outDir, `otherforms-entrance-${size.width}.png`)});
  await open.click();
  const dlg = page.getByRole('dialog', {name: '📑 ほかの市の申請書'});
  await dlg.waitFor();
  for (const city of ['久留米市', '飯塚市', '大分市', '田川市']) {
    const sec = dlg.getByRole('region', {name: city});
    const links = sec.getByRole('link');
    assert.ok((await links.count()) >= 2, city);
    for (const a of await links.all()) {
      assert.equal(await a.getAttribute('target'), '_blank');
      assert.match(await a.getAttribute('rel'), /noopener/);
      assert.match(await a.getAttribute('href'), /^https:\/\//);
    }
    assert.ok((await sec.innerText()).includes('住宅改修'), city);
    assert.ok((await sec.innerText()).includes('福祉用具購入'), city);
  }
  assert.match(await dlg.getByRole('region', {name: '久留米市'}).getByRole('link', {name: /住宅改修/}).getAttribute('href'), /city\.kurume\.fukuoka\.jp/);
  assert.match(await dlg.getByRole('region', {name: '田川市'}).getByRole('link').first().getAttribute('href'), /fukuoka-kaigo\.jp/);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= size.width);
  await page.screenshot({path: path.join(outDir, `otherforms-${size.width}.png`)});
  if (size.width > 500) {
    // 田川市：「＋ 広域連合の書式で作る」→ 広域連合の様邸（申請書のタブ）
    await dlg.getByRole('region', {name: '田川市'}).getByRole('button', {name: '＋ 広域連合の書式で作る'}).click();
    await dlg.waitFor({state: 'detached'});
    await page.getByRole('form', {name: '申請書'}).waitFor();
    await page.getByRole('tab', {name: '📋 工事見積書'}).click();
    await page.getByRole('region', {name: '見積書', exact: true}).locator('.form-page', {hasText: '内訳書　様式'}).first().waitFor();
    log('田川市：＋ 広域連合の書式で作る → 広域連合の見積書 OK');
  } else {
    await dlg.getByRole('button', {name: '閉じる', exact: true}).click();
    await dlg.waitFor({state: 'detached'});
  }
  log(`${size.width}px：4つの市の申請書のリンク（新しいタブ・公式のページ）OK`);
  await ctx.close();
}
assert.deepEqual(errors, []);
await browser.close();
console.log('ALL OK');
