// 売上伝票発行依頼書をブラウザで通しで確かめる（Playwright）：販売見積書の上の段の「🧾 売上伝票依頼書」→ 足りない所（負担割合・介護度・新規／既存）を窓で入れる →
// 「🧾 売上伝票発行依頼書を開く」→ 新しいタブで売上伝票のアプリが中身の入った状態で開く（金額・負担額は見積もりと同じ）。生活保護なら自己負担は出さない。
// ユーザーと決めたこと（2026-10-27）：見積書のタブの上の段・負担割合を選ぶまで自己負担額は出さない・生活保護にチェックしたら自己負担は出さない。
// 使い方：npm run -s build:tokutei と、売上伝票発行依頼書（akamar08taiyo-bot/taiyo-uriage-denpyo）の npm run build のあと
//   node test/tokutei/e2e-uriage.mjs <売上伝票の dist フォルダ> [出力フォルダ]
// 本番と同じく同じサイト（origin）に置く：dist-tokutei/ を /tokutei/、売上伝票を /taiyo-uriage-denpyo/ に。
// 売上伝票の見た目も見たいときは TW_CSS に手元で作った Tailwind の CSS（売上伝票は CDN の Tailwind を使う）。お客様・担当者は架空の名前。

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const uriage = process.argv[2];
assert.ok(uriage, '売上伝票の dist フォルダを渡してください');
const out = process.argv[3] ?? 'e2e-out';
mkdirSync(out, {recursive: true});
const tw = process.env.TW_CSS ? readFileSync(process.env.TW_CSS, 'utf8') : '';

const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = null;
  if (path.startsWith('/tokutei/')) file = join(dist, path.endsWith('/version.json') ? 'version.json' : 'index.html');
  else if (path.startsWith('/taiyo-uriage-denpyo/')) file = join(uriage, normalize(path.slice('/taiyo-uriage-denpyo/'.length) || 'index.html').replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = readFileSync(file);
    res.writeHead(200, {'content-type': TYPES[extname(file)] ?? 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5195);
await new Promise((r) => server.listen(port, r));
const site = `http://localhost:${port}`;

// 定価15,800円（課税）の商品2つ：12,640円＋税1,264円＝13,904円ずつ、合計27,808円。2割：5,562円（切り上げ）・保険者 22,246円
const TABLE = [
  ['品番', '商品名', 'メーカー', 'TAISコード', '定価(税抜)', '仕切価格', '税区分'],
  ['A-100', 'シャワーチェア 見本A', '見本メーカー', '', '15,800', '9,480', '課税'],
  ['B-200', '浴槽台 見本B', '見本メーカー', '', '15,800', '9,480', '課税'],
]
  .map((r) => r.join('\t'))
  .join('\n');

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  for (const viewport of [
    {width: 1366, height: 900},
    {width: 390, height: 844},
  ]) {
    const phone = viewport.width < 500;
    const tag = phone ? 'sp' : 'pc';
    const ctx = await browser.newContext({viewport, deviceScaleFactor: phone ? 2 : 1, locale: 'ja-JP'});
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
      } catch {
        /* about:blank では使えない */
      }
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
      if (tw && /^https:\/\/cdn\.tailwindcss\.com/.test(route.request().url())) {
        return route.fulfill({status: 200, contentType: 'text/javascript', body: `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(tw)}; document.head.appendChild(s); })();`});
      }
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`特定福祉用具: ${e}`));
    page.on('dialog', (d) => d.accept());
    await page.goto(`${site}/tokutei/`);
    await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();

    // ---- 商品マスタに2つ取り込んで★ → 見積もり（行橋市・架空のお客様）
    await page.getByRole('button', {name: '📦 商品マスタ'}).click();
    await page.getByRole('button', {name: '📄 仕切り一覧表を取り込む'}).click();
    await page.getByLabel('貼り付けた表').fill(TABLE);
    await page.getByRole('button', {name: '貼り付けた表を読み取る'}).click();
    await page.getByRole('button', {name: 'シャワーチェア 見本Aを★に'}).click();
    await page.getByRole('button', {name: '浴槽台 見本Bを★に'}).click();
    await page.getByRole('button', {name: '商品マスタに取り込む（2件）'}).click();
    await page.getByText('全2件').waitFor();
    await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
    await page.getByRole('button', {name: '＋ 行橋市'}).click();
    await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本 花子');
    await page.getByLabel('住所').fill('福岡県行橋市中央1-1');
    const staff = await page.getByRole('combobox', {name: '担当'}).evaluate((el) => [...el.options].map((o) => o.value).find(Boolean));
    await page.getByRole('combobox', {name: '担当'}).selectOption(staff);
    await page.getByRole('button', {name: '★ 商品を選ぶ'}).click();
    await page.getByRole('button', {name: 'シャワーチェア 見本Aを入れる'}).click();
    await page.getByRole('button', {name: '浴槽台 見本Bを入れる'}).click();
    await page.getByRole('button', {name: '閉じる'}).last().click();
    await page.getByText('27,808円').first().waitFor();

    // 負担割合は未選択から：自己負担額は出さない
    await page.getByText('負担割合を選ぶと、自己負担額が出ます').waitFor();
    assert.ok(!(await page.locator('aside').first().innerText()).includes('利用者負担'));

    // ---- 🧾 売上伝票依頼書：上の段（印刷・Excel の右）
    const bar = await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).boundingBox();
    const excel = await page.getByRole('button', {name: '📗 Excelで保存'}).boundingBox();
    assert.ok(bar && excel && (bar.x > excel.x || bar.y > excel.y), `${JSON.stringify(bar)} ${JSON.stringify(excel)}`);
    await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('まだ入っていません：負担割合・介護度・新規・既存').waitFor();
    assert.equal(await dialog.getByRole('link', {name: '🧾 売上伝票発行依頼書を開く'}).count(), 0);
    assert.equal(await dialog.getByRole('button', {name: '🧾 売上伝票発行依頼書を開く'}).isDisabled(), true);
    await page.screenshot({path: `${out}/uriage-01-dialog-missing-${tag}.png`});
    // 足りない所を窓で入れる（案件にも入る）
    await dialog.getByRole('group', {name: '伝票の負担割合'}).getByRole('button', {name: '2割'}).click();
    await dialog.getByLabel('伝票の介護度').selectOption('要介護2');
    await dialog.getByRole('group', {name: '伝票の顧客区分'}).getByRole('button', {name: '新規'}).click();
    await dialog.getByText('利用者負担（2割）5,562円・保険者負担 22,246円').waitFor();
    if (!phone) assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1366);
    else assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({path: `${out}/uriage-02-dialog-ready-${tag}.png`});
    const link = dialog.getByRole('link', {name: '🧾 売上伝票発行依頼書を開く'});
    assert.equal(await link.getAttribute('href'), `${site}/taiyo-uriage-denpyo/?from=shinsei`);
    assert.equal(await link.getAttribute('target'), '_blank');
    const [slip] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
    await slip.getByText('申請書・見積書作成から読み込みました。').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('taiyo-uriage-import-v1')), null); // 受け取ったら消える
    assert.equal(await slip.getByPlaceholder('例: 山田太郎').inputValue(), '見本 花子');
    assert.equal(await slip.getByPlaceholder('担当者名を入力').inputValue(), staff);
    assert.deepEqual(await slip.getByPlaceholder('金額(税込)').evaluateAll((l) => l.map((x) => x.value)), ['13904', '13904']);
    const text = await slip.locator('main').innerText();
    assert.match(text, /対象内利用者負担額（2割・切り上げ）\s*¥5,562/);
    assert.match(text, /保険者負担額（8割・切り下げ）\s*¥22,246/);
    await slip.screenshot({path: `${out}/uriage-03-slip-${tag}.png`, fullPage: true});
    await slip.close();
    // 見積もりの画面にも負担割合が入った
    await page.getByText(/利用者負担（2割）/).first().waitFor();

    // ---- 生活保護：窓でチェック → 売上伝票は自己負担を出さない
    await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).click();
    await dialog.getByRole('group', {name: '伝票の顧客区分'}).waitFor();
    assert.equal(await dialog.getByRole('group', {name: '伝票の顧客区分'}).getByRole('button', {name: '新規'}).getAttribute('aria-pressed'), 'true'); // 覚えている
    await dialog.getByLabel('生活保護（自己負担は出さない）').check();
    await dialog.getByText('介護扶助（2割）5,562円・保険者負担 22,246円').waitFor();
    const [slip2] = await Promise.all([ctx.waitForEvent('page'), dialog.getByRole('link', {name: '🧾 売上伝票発行依頼書を開く'}).click()]);
    await slip2.getByText('申請書・見積書作成から読み込みました。').waitFor();
    const text2 = await slip2.locator('main').innerText();
    assert.ok(!text2.includes('対象内利用者負担額'), text2);
    assert.match(text2, /介護扶助（生活保護・2割・切り上げ）\s*¥5,562/);
    assert.match(text2, /ご利用者お支払い合計\s*¥0/);
    await slip2.close();
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('ok: 負担割合は未選択から → 🧾 売上伝票依頼書（足りない所を窓で）→ 売上伝票が中身の入った状態で開く → 生活保護（1366px・390px）');
} finally {
  await browser.close();
  server.close();
}
