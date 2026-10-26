// 販売受注簿への転記をブラウザで通しで確かめる（Playwright）：見積もりの「📤 販売受注簿に転記」→ 新しいタブで販売受注簿作成ツールが開く →
// 「受注簿に入れる」→ 商品1点が受注区分「給付」の1ページになり、ページの給付内訳を足すと見積書の利用者負担・保険者負担になる。
// 使い方：npm run -s build:tokutei と、販売受注簿作成ツール（akamar08taiyo-bot/taiyo-hacchu-scan）の npm run build のあと
//   node test/tokutei/e2e-hacchu.mjs <受注簿ツールの dist フォルダ> [出力フォルダ]
// 本番と同じく同じサイト（origin）に置く：dist-tokutei/ を /tokutei/、受注簿ツールを /taiyo-hacchu-scan/ に。
// Playwright はリポジトリの依存に入れていない。場所は環境変数 PLAYWRIGHT（既定はこの作業環境の全体のもの）。

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const hacchu = process.argv[2];
assert.ok(hacchu, '受注簿ツールの dist フォルダを渡してください');
const out = process.argv[3] ?? 'e2e-out';
mkdirSync(out, {recursive: true});

const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = null;
  if (path.startsWith('/tokutei/')) file = join(dist, path.endsWith('/version.json') ? 'version.json' : 'index.html');
  else if (path.startsWith('/taiyo-hacchu-scan/')) {
    const rest = normalize(path.slice('/taiyo-hacchu-scan/'.length) || 'index.html').replace(/^(\.\.[/\\])+/, '');
    file = join(hacchu, rest);
  }
  try {
    const body = readFileSync(file);
    res.writeHead(200, {'content-type': TYPES[extname(file)] ?? 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(5193, r));
const site = 'http://localhost:5193';

// 定価15,800円（課税）の商品2つ：12,640円＋税1,264円＝13,904円ずつ、合計27,808円。
// 1割の利用者負担は 2,781円（ページごとに切り上げると 1,391＋1,391＝2,782円 になる）、保険者負担 25,027円
const TABLE = [
  ['品番', '商品名', 'メーカー', 'TAISコード', '定価(税抜)', '仕切価格', '税区分'],
  ['A-100', 'シャワーチェア 見本A', '見本メーカー', '', '15,800', '9,480', '課税'],
  ['B-200', '浴槽台 見本B', '見本メーカー', '', '15,800', '9,480', '課税'],
]
  .map((r) => r.join('\t'))
  .join('\n');

/** 受注簿の見えているページの欄（見出しの b のとなりの入力欄）の値 */
const cellValue = (page, label) =>
  page.evaluate((label) => {
    const sheet = document.querySelector('section[aria-label="販売受注簿入力"]');
    const cell = [...sheet.querySelectorAll('.sheetCell')].find((c) => c.querySelector('b')?.textContent.trim() === label);
    const input = cell?.querySelector('input:not([type=radio]):not([aria-label="フリガナ"]), textarea, select');
    return input ? input.value : null;
  }, label);
/** 受注簿の見えているページで選ばれているラジオ（受注区分・給付割合） */
const checked = (page, name) =>
  page.evaluate((name) => {
    const sheet = document.querySelector('section[aria-label="販売受注簿入力"]');
    return [...sheet.querySelectorAll(`input[type=radio][name^="${name}"]`)].find((r) => r.checked)?.parentElement.textContent.trim() ?? null;
  }, name);
/** 受注簿の見えているページの入力欄の値（印刷用の控え MultiPrintPages も同じ見出しの section なので、いちばん上＝入力しているページを見る） */
const fieldValues = (page) =>
  page.evaluate(() => [...document.querySelector('section[aria-label="販売受注簿入力"]').querySelectorAll('input:not([type=radio]):not([type=checkbox]), textarea, select')].map((i) => i.value));
/** 受注簿の見えているページの給付内訳（見出し → 金額） */
const benefit = (page) =>
  page.evaluate(() => {
    const dl = document.querySelector('section[aria-label="販売受注簿入力"] .benefitBreakdown');
    return Object.fromEntries([...dl.querySelectorAll('div')].map((d) => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()]));
  });

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort()); // 受注簿ツールの OCR（使わない）
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`特定福祉用具: ${e}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`特定福祉用具: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${site}/tokutei/`);
  await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();

  // ---- 商品マスタに2つ取り込んで★
  await page.getByRole('button', {name: '📦 商品マスタ'}).click();
  await page.getByRole('button', {name: '📄 仕切り一覧表を取り込む'}).click();
  await page.getByLabel('貼り付けた表').fill(TABLE);
  await page.getByRole('button', {name: '貼り付けた表を読み取る'}).click();
  await page.getByRole('button', {name: 'シャワーチェア 見本Aを★に'}).click();
  await page.getByRole('button', {name: '浴槽台 見本Bを★に'}).click();
  await page.getByRole('button', {name: '商品マスタに取り込む（2件）'}).click();
  await page.getByText('全2件').waitFor();

  // ---- 見積もり（行橋市・架空のお客様）
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 行橋市'}).click();
  await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本 花子');
  await page.getByLabel('フリガナ').fill('ミホン ハナコ');
  await page.getByLabel('住所').fill('福岡県行橋市中央1-1');
  await page.getByLabel('電話').fill('0930-00-0000');
  await page.getByRole('combobox', {name: '担当'}).selectOption('土居 翔太');
  await page.getByRole('button', {name: '★ 商品を選ぶ'}).click();
  await page.getByRole('button', {name: 'シャワーチェア 見本Aを入れる'}).click();
  await page.getByRole('button', {name: '浴槽台 見本Bを入れる'}).click();
  await page.getByRole('button', {name: '閉じる'}).last().click();
  await page.getByText('27,808円').first().waitFor();
  const aside = await page.locator('aside').first().innerText();
  assert.match(aside, /利用者負担（1割）\s*2,781円/);
  assert.match(aside, /保険者負担（9割）\s*25,027円/);
  await page.waitForTimeout(600); // 保存（IndexedDB）

  // ---- 📤 販売受注簿に転記：新しいタブで受注簿ツールが開く
  const link = page.getByRole('link', {name: '📤 販売受注簿に転記'});
  assert.equal(await link.getAttribute('href'), `${site}/taiyo-hacchu-scan/?from=tokutei`);
  assert.equal(await link.getAttribute('target'), '_blank');
  const [order] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
  order.on('pageerror', (e) => errors.push(`受注簿: ${e}`));
  await page.getByText('販売受注簿を開きました（商品 2点）').waitFor();
  await page.screenshot({path: `${out}/hacchu-1-sale.png`});

  const drawer = order.getByLabel('特定福祉用具の見積もりから');
  await drawer.getByRole('heading', {name: '特定福祉用具の見積もりから商品が届いています'}).waitFor();
  const drawerText = await drawer.innerText();
  assert.match(drawerText, /見本 花子様 特定福祉用具 の商品 2点です。受注簿に入れると、1点ずつ受注区分「給付」（1割）の商品ページになります/);
  assert.deepEqual(
    await drawer.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.cells].map((c) => c.textContent))),
    [
      ['シャワーチェア 見本A', 'A-100', '1台', '13,904円'],
      ['浴槽台 見本B', 'B-200', '1台', '13,904円'],
    ],
  );
  await order.screenshot({path: `${out}/hacchu-2-drawer.png`});
  await drawer.getByRole('button', {name: '受注簿に入れる'}).click();
  await order.getByText('特定福祉用具2点を入れました').waitFor();
  assert.equal(await order.evaluate(() => localStorage.getItem('taiyo-hacchu-import-v1')), null); // 読んだら消す

  // ---- 1ページ目：受注区分「給付」・1割・SMARTれん太「特定福祉用具」・お客様・担当・商品・給付内訳（アプリが分けた金額）
  assert.equal(await checked(order, 'orderType'), '給付');
  assert.equal(await checked(order, 'burdenRatio'), '1割');
  assert.equal(await cellValue(order, 'SMARTれん太の販売分類'), '特定福祉用具');
  assert.equal(await cellValue(order, '営業担当'), '土居');
  assert.equal(await cellValue(order, '顧客名'), '見本 花子');
  // 顧客名の上にフリガナ（ユーザーの指示「読みなど、全て飛べるようにする」）
  assert.equal(await order.locator('section[aria-label="販売受注簿入力"]').first().getByLabel('フリガナ').inputValue(), 'ミホン ハナコ');
  assert.equal(await cellValue(order, '住所（任意）'), '福岡県行橋市中央1-1');
  // 商品の欄（商品名・型番・仕切り・販売単価など）は入力欄の値で見る
  const fields = await fieldValues(order);
  for (const v of ['シャワーチェア 見本A', 'A-100', '1', '15800', '9480', '12640', '20']) assert.ok(fields.includes(v), `1ページ目に「${v}」がない：${fields.join('／')}`);
  assert.deepEqual(await benefit(order), {'給付割合': '1割負担', '商品代金(10割・税込)': '13,904円', '利用者負担額(1割・税込)': '1,391円', '保険者負担額(9割・税込)': '12,513円'});
  await order.screenshot({path: `${out}/hacchu-3-page1.png`, fullPage: true});
  await order.locator('section[aria-label="販売受注簿入力"] .benefitBreakdown').first().scrollIntoViewIfNeeded();
  await order.screenshot({path: `${out}/hacchu-3b-benefit.png`});

  // ---- 2ページ目：ページごとに切り上げると 1,391円 になるところを、見積書の合計（2,781円）に合わせて 1,390円
  // ページの切り替えは「1/3 2/3 3/3」（3ページ目は次の商品を入れる空のページ。住宅改修の部材を入れたときと同じ）
  await order.getByRole('navigation', {name: '商品ページ'}).first().getByRole('button', {name: '2/3'}).click();
  await order.waitForFunction(() => [...document.querySelector('section[aria-label="販売受注簿入力"]').querySelectorAll('textarea, input')].some((i) => i.value === '浴槽台 見本B'));
  assert.equal(await checked(order, 'orderType'), '給付');
  assert.deepEqual(await benefit(order), {'給付割合': '1割負担', '商品代金(10割・税込)': '13,904円', '利用者負担額(1割・税込)': '1,390円', '保険者負担額(9割・税込)': '12,514円'});
  await order.screenshot({path: `${out}/hacchu-4-page2.png`, fullPage: true});

  // ---- 印刷（商品ページ×2＋集計ページ）でも同じ給付内訳
  await order.emulateMedia({media: 'print'});
  const printed = await order.evaluate(() =>
    [...document.querySelectorAll('.benefitBreakdown')].filter((d) => d.getBoundingClientRect().height > 0).map((d) => d.innerText.replace(/\s+/g, ' ')),
  );
  assert.equal(printed.length, 2, JSON.stringify(printed));
  assert.ok(printed.some((t) => t.includes('1,391円')) && printed.some((t) => t.includes('1,390円')), JSON.stringify(printed));
  await order.emulateMedia({media: 'screen'});

  // ---- 受注簿で数量を直したら、ふつうの計算に戻る（27,808円の1割 → 2,781円）
  await order.locator('section[aria-label="販売受注簿入力"]').first().getByLabel('数量', {exact: true}).fill('2');
  await order.waitForFunction(() => document.querySelector('section[aria-label="販売受注簿入力"] .benefitBreakdown').innerText.includes('27,808円'));
  assert.equal((await benefit(order))['利用者負担額(1割・税込)'], '2,781円');
  await order.close();

  // ---- 状態を「承認」にすると、販売受注簿へ自動で送る（ユーザーの指示「販売受注簿にも自動で転記する」2026-10-25）。1回だけ。
  // 受注簿ツールをふつうに開くと「受注簿に入れる」が出る（列 taiyo-hacchu-import-queue-v1 から。入れたら列から消える）
  await page.goto(`${site}/tokutei/`);
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 行橋市'}).click();
  await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本 次郎');
  await page.getByRole('button', {name: '★ 商品を選ぶ'}).click();
  await page.getByRole('button', {name: 'シャワーチェア 見本Aを入れる'}).click();
  await page.getByRole('button', {name: '閉じる'}).last().click();
  await page.getByText('13,904円').first().waitFor();
  const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem('taiyo-hacchu-import-queue-v1') ?? '[]'));
  assert.deepEqual(await queue(), []);
  await page.getByRole('group', {name: '状態'}).getByRole('button', {name: '承認'}).click();
  await page.getByText('販売受注簿へ送りました').waitFor();
  const queued = await queue();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, 'taiyo-tokutei-order');
  assert.equal(queued[0].customerName, '見本 次郎');
  await page.waitForTimeout(800); // 保存（送った時刻 hacchuSentAt）
  // 納品にしても、もう送らない
  await page.getByRole('group', {name: '状態'}).getByRole('button', {name: '納品'}).click();
  await page.waitForTimeout(300);
  assert.equal((await queue()).length, 1);

  const auto = await ctx.newPage();
  auto.on('pageerror', (e) => errors.push(`受注簿（自動）: ${e}`));
  auto.on('dialog', (d) => d.accept()); // 「前回の入力は消えて…置き換わります」（上で入れた受注簿がこの端末に残っている）
  await auto.goto(`${site}/taiyo-hacchu-scan/`);
  const autoDrawer = auto.getByLabel('特定福祉用具の見積もりから');
  await autoDrawer.getByRole('heading', {name: '特定福祉用具の見積もりから商品が届いています'}).waitFor();
  assert.match(await autoDrawer.innerText(), /見本 次郎様 特定福祉用具 の商品 1点です/);
  await auto.screenshot({path: `${out}/hacchu-5-auto-drawer.png`});
  await autoDrawer.getByRole('button', {name: '受注簿に入れる'}).click();
  await auto.getByText('特定福祉用具1点を入れました').waitFor();
  assert.equal(await auto.evaluate(() => localStorage.getItem('taiyo-hacchu-import-queue-v1')), null); // 列が空になったら消す
  assert.equal(await cellValue(auto, '顧客名'), '見本 次郎');
  await auto.close();

  assert.deepEqual(errors, []);
  console.log('ok: 見積もり → 📤 販売受注簿に転記 → 受注簿に入れる（給付・1点1ページ・給付内訳は見積書と同じ合計）→ 印刷 → 直したらふつうの計算');
} finally {
  await browser.close();
  server.close();
}
