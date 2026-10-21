// ブラウザで通しで確かめる（Playwright）：仕切り一覧表を貼り付けて取り込む → ★ → 見積もりを作る → 商品を選ぶ → 見積書を印刷の画面で見る。
// 使い方：npm run -s build:tokutei のあと
//   node test/tokutei/e2e.mjs [出力フォルダ]
// Playwright はリポジトリの依存に入れていない。場所は環境変数 PLAYWRIGHT（既定はこの作業環境の全体のもの）。
// dist-tokutei/ を小さなサーバーで /tokutei/ の下に置いて開く（太陽ポータルと同じ形）。

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, {recursive: true});

const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const file = path.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    const body = readFileSync(join(dist, file));
    res.writeHead(200, {'content-type': file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(5191, r));
const url = 'http://localhost:5191/tokutei/';

const TABLE = [
  ['品番', '商品名', 'メーカー', 'TAISコード', '定価(税抜)', '仕切価格', '税区分'],
  ['536-057', 'シャワーベンチ FSフィット', 'アロン化成', '00170000123', '35,000', '21,000', '課税'],
  ['536-480', '浴槽台 ユクリア', 'アロン化成', '00170000456', '13,800', '8,280', '課税'],
  ['BG-01', 'バスグリップ', 'アロン化成', '', '15,800', '9,480', '課税'],
  ['FS4-B', '4点ステッキS', 'イーストアイ', '', '12,000', '7,200', '非課税'],
  ['T-100', 'T字杖 折りたたみ', 'イーストアイ', '', '4,000', '2,400', '非課税'],
]
  .map((r) => r.join('\t'))
  .join('\n');

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}});
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    } catch {
      /* about:blank では使えない */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();
  await page.screenshot({path: `${out}/01-home.png`});

  // ---- 商品マスタ：貼り付けた表を取り込む
  await page.getByRole('button', {name: '📦 商品マスタ'}).click();
  await page.getByRole('button', {name: '📄 仕切り一覧表を取り込む'}).click();
  await page.getByLabel('貼り付けた表').fill(TABLE);
  await page.getByRole('button', {name: '貼り付けた表を読み取る'}).click();
  // T字杖は対象外なので最初はチェックしない（取り込むのは4件）
  await page.getByRole('button', {name: '商品マスタに取り込む（4件）'}).waitFor();
  await page.getByRole('button', {name: 'シャワーベンチ FSフィットを★に'}).click();
  await page.getByRole('button', {name: '浴槽台 ユクリアを★に'}).click();
  await page.screenshot({path: `${out}/02-import.png`});
  await page.getByRole('button', {name: '商品マスタに取り込む（4件）'}).click();
  await page.getByText('全4件').waitFor();
  const cats = await page.locator('select[aria-label$="の種目"]').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(cats.sort(), ['入浴補助用具|入浴用いす', '入浴補助用具|浴槽内いす', '入浴補助用具|浴槽用手すり', '歩行補助つえ|多点杖'].sort());
  await page.screenshot({path: `${out}/03-products.png`, fullPage: true});

  // ---- 見積もり：行橋市で新しく作り、★から2つ選ぶ
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 行橋市'}).click();
  await page.getByLabel('お客様名').fill('山田 花子');
  await page.getByLabel('被保険者番号').fill('0123456789');
  await page.getByRole('button', {name: '★ 商品を選ぶ'}).click();
  await page.getByRole('button', {name: 'シャワーベンチ FSフィットを入れる'}).click();
  await page.getByRole('button', {name: '浴槽台 ユクリアを入れる'}).click();
  await page.getByRole('button', {name: '閉じる'}).last().click();
  // 35,000×0.8＝28,000＋税2,800＝30,800、13,800×0.8＝11,040＋税1,104＝12,144 → 42,944円。1割：4,295円（切り上げ）・保険者 38,649円
  await page.getByText('42,944円').first().waitFor();
  const aside = await page.locator('aside').first().innerText();
  assert.match(aside, /利用者負担（1割）\s*4,295円/);
  assert.match(aside, /保険者負担（9割）\s*38,649円/);
  await page.screenshot({path: `${out}/04-sale.png`, fullPage: true});

  // ---- 見積書
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
  await page.locator('.est').waitFor();
  const doc = await page.locator('.est').innerText();
  for (const s of ['御　見　積　書', '山田 花子', '行橋営業所', 'T1290001044462', '¥42,944', '入浴補助用具（入浴用いす）', '定価35,000円（税抜）×0.8', '¥4,295', '¥38,649']) {
    assert.ok(doc.includes(s), `見積書に「${s}」がない`);
  }
  await page.screenshot({path: `${out}/05-estimate.png`});
  await page.locator('.est').screenshot({path: `${out}/05b-estimate-doc.png`});
  // 印刷（PDF）は A4縦 1枚に収まる（ページ数は pdfinfo で確かめる）
  await page.emulateMedia({media: 'print'});
  await page.pdf({path: `${out}/estimate.pdf`, preferCSSPageSize: true, printBackground: true});
  await page.emulateMedia({media: 'screen'});
  await page.getByRole('button', {name: '閉じる'}).click();

  // ---- 読み直しても残っている（IndexedDB）
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByText('42,944円').first().waitFor();

  // ---- スマホの幅（同じデータのまま）：見積もりの画面・商品マスタが横にはみ出さない
  await page.setViewportSize({width: 390, height: 844});
  await page.getByText('42,944円').first().waitFor();
  for (const [name, file] of [
    ['見積もり', '07-phone-sale.png'],
    ['商品マスタ', '08-phone-products.png'],
  ]) {
    if (name === '商品マスタ') await page.getByRole('button', {name: '📦 商品マスタ'}).click();
    await page.waitForTimeout(300);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // はみ出したときは、どの部品がはみ出しているかを出す（直す所が分かるように）
    const culprits = await page.evaluate(() =>
      [...document.querySelectorAll('main *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('.overflow-x-auto'))
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} 「${(el.textContent ?? '').trim().slice(0, 20)}」`),
    );
    assert.ok(wide <= 1, `スマホの幅の${name}で横にはみ出している（${wide}px）：${culprits.join(' / ')}`);
    await page.screenshot({path: `${out}/${file}`, fullPage: true});
  }

  // ---- 設定：発行元はポータルで選んだ営業所（行橋営業所）
  await page.setViewportSize({width: 1366, height: 900});
  await page.getByRole('button', {name: '⚙ 設定'}).click();
  assert.equal(await page.getByLabel('営業所').inputValue(), '行橋営業所');
  await page.getByRole('button', {name: '⬇ すべてをファイルに保存'}).waitFor();
  await page.screenshot({path: `${out}/09-settings.png`, fullPage: true});

  // ---- スマホの幅（はじめて開いたとき）
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(url);
  await p2.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();
  await p2.screenshot({path: `${out}/06-phone-home.png`, fullPage: true});
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `スマホの幅で横にはみ出している（${overflow}px）`);

  assert.deepEqual(errors, []);
  console.log('ok: 取り込み → ★ → 見積もり → 見積書 → 読み直し → スマホの幅');
} finally {
  await browser.close();
  server.close();
}
