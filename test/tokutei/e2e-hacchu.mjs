// 販売見積書のページの中の販売受注簿をブラウザで通しで確かめる（Playwright）：見積もりの「📦 販売受注簿」→ 販売受注簿作成ツールが中に出る（?embed=tokutei）→
// 見積書のお客様（名前・フリガナ・住所・電話）・担当・商品が、商品1点が受注区分「給付」の1ページになって入っている。ページの給付内訳を足すと見積書の利用者負担・保険者負担。
// 見積書で直すと受注簿も直る・受注簿で直した型番・仕切りは見積書にも入る・受注簿で足した商品／消した商品は見積書でも足す／消す・受注番号などは案件に保存される。
// 「📷 カタログから商品を自動認識」で画像の欄（スクリーンショットの読み取り）が開き、介援隊・ウェルファンのカタログを開くボタンがある。
// （ユーザーの指示「商品名や型番などを入力したら、自動的に販売見積書のページ内にある、販売受注簿に飛べるようにする…」2026-10-23。前は「📤 販売受注簿に転記」で新しいタブ）
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
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'};
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

const SHEET = '(//section[@aria-label="販売受注簿入力"])[1]';
/** 受注簿の見えているページの欄（見出しの b のとなりの入力欄）。印刷用の控え（MultiPrintPages）も同じ見出しの section なので、いちばん上＝入力しているページを見る */
const cell = (frame, label) => frame.locator(`xpath=${SHEET}//div[contains(concat(' ', @class, ' '), ' sheetCell ')][b[normalize-space()="${label}"]]//*[self::input[not(@type="radio") and not(@type="checkbox")] or self::textarea or self::select][not(@aria-label="フリガナ")]`).first();
/** 管理情報の欄（定価(税抜)・仕切り(税抜) など） */
const mgmt = (frame, label) => frame.locator(`xpath=${SHEET}//dt[normalize-space()="${label}"]/following-sibling::dd[1]//*[self::input or self::select]`).first();
const productName = (frame) => frame.locator(`xpath=${SHEET}//div[contains(@class, "productNameBlock")]/textarea`).first();
/** 商品の表の型番（申込番号・WEBコード・型番…の3つめ） */
const modelNumber = (frame) => frame.locator(`xpath=${SHEET}//table//tbody/tr[1]/td[3]//input`).first();
/** 受注簿の見えているページで選ばれているラジオ（受注区分・給付割合） */
const checked = (frame, name) =>
  frame.evaluate((name) => {
    const sheet = document.querySelector('section[aria-label="販売受注簿入力"]');
    return [...sheet.querySelectorAll(`input[type=radio][name^="${name}"]`)].find((r) => r.checked)?.parentElement.textContent.trim() ?? null;
  }, name);
/** 受注簿の見えているページの給付内訳（見出し → 金額） */
const benefit = (frame) =>
  frame.evaluate(() => {
    const dl = document.querySelector('section[aria-label="販売受注簿入力"] .benefitBreakdown');
    return Object.fromEntries([...dl.querySelectorAll('div')].map((d) => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()]));
  });
/** 受注簿のページを替える（「1/3」など） */
const goPage = (frame, name) => frame.getByRole('navigation', {name: '商品ページ'}).first().getByRole('button', {name}).click();
/** 中に出した受注簿（iframe）の中身。出てから受注簿に見積書のお客様が入るまで待つ */
async function openHacchu(page) {
  await page.getByRole('tab', {name: '📦 販売受注簿'}).click();
  const handle = await page.locator('iframe[data-hacchu]').elementHandle();
  const frame = await handle.contentFrame();
  await frame.waitForFunction(() => [...document.querySelectorAll('section[aria-label="販売受注簿入力"] textarea')].some((t) => t.value === '見本 花子'), null, {timeout: 15000});
  return frame;
}

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
  await page.getByLabel('担当').selectOption('土居 翔太');
  await page.getByRole('button', {name: '★ 商品を選ぶ'}).click();
  await page.getByRole('button', {name: 'シャワーチェア 見本Aを入れる'}).click();
  await page.getByRole('button', {name: '浴槽台 見本Bを入れる'}).click();
  await page.getByRole('button', {name: '閉じる'}).last().click();
  await page.getByText('27,808円').first().waitFor();
  const aside = await page.locator('aside').first().innerText();
  assert.match(aside, /利用者負担（1割）\s*2,781円/);
  assert.match(aside, /保険者負担（9割）\s*25,027円/);
  await page.waitForTimeout(600); // 保存（IndexedDB）

  // ---- 📦 販売受注簿：受注簿ツールが中に出る（新しいタブは開かない。ポータルへのリンク・受注簿ツールの見積もり作成は出さない。はじめは受注簿だけ）
  assert.equal(await page.getByRole('link', {name: '📤 販売受注簿に転記'}).count(), 0);
  let order = await openHacchu(page);
  order.page().on('pageerror', (e) => errors.push(`受注簿: ${e}`));
  assert.equal(await page.locator('iframe[data-hacchu]').getAttribute('src'), '/taiyo-hacchu-scan/?embed=tokutei');
  assert.equal(await order.getByText('← 業務アプリポータルへ戻る').count(), 0);
  assert.equal(await order.getByRole('button', {name: '見積もり作成'}).count(), 0);
  assert.equal(await order.locator('.imagePanel').isVisible(), false);
  assert.equal(await order.evaluate(() => localStorage.getItem('taiyo-hacchu-import-v1')), null);
  await page.screenshot({path: `${out}/hacchu-1-embedded.png`});

  // ---- 1ページ目：受注区分「給付」・1割・SMARTれん太「特定福祉用具」・お客様（名前・フリガナ・住所・電話）・担当・商品・給付内訳（アプリが分けた金額）
  assert.equal(await checked(order, 'orderType'), '給付');
  assert.equal(await checked(order, 'burdenRatio'), '1割');
  assert.equal(await cell(order, 'SMARTれん太の販売分類').inputValue(), '特定福祉用具');
  assert.equal(await cell(order, '営業担当').inputValue(), '土居');
  assert.equal(await cell(order, '顧客名').inputValue(), '見本 花子');
  assert.equal(await order.getByLabel('フリガナ').first().inputValue(), 'ミホン ハナコ');
  assert.equal(await cell(order, '住所（任意）').inputValue(), '福岡県行橋市中央1-1');
  assert.equal(await cell(order, '電話番号（任意）').inputValue(), '0930-00-0000');
  assert.equal(await productName(order).inputValue(), 'シャワーチェア 見本A');
  assert.equal(await modelNumber(order).inputValue(), 'A-100');
  assert.deepEqual([await mgmt(order, '定価(税抜)').inputValue(), await mgmt(order, '仕切り(税抜)').inputValue(), await mgmt(order, '販売単価(税抜)').inputValue()], ['15800', '9480', '12640']);
  assert.deepEqual(await benefit(order), {'給付割合': '1割負担', '商品代金(10割・税込)': '13,904円', '利用者負担額(1割・税込)': '1,391円', '保険者負担額(9割・税込)': '12,513円'});
  await page.screenshot({path: `${out}/hacchu-2-page1.png`});

  // ---- 2ページ目：ページごとに切り上げると 1,391円 になるところを、見積書の合計（2,781円）に合わせて 1,390円
  // ページの切り替えは「1/3 2/3 3/3」（3ページ目は次の商品を入れる空のページ）
  await goPage(order, '2/3');
  await order.waitForFunction(() => [...document.querySelector('section[aria-label="販売受注簿入力"]').querySelectorAll('textarea')].some((i) => i.value === '浴槽台 見本B'));
  assert.equal(await checked(order, 'orderType'), '給付');
  assert.deepEqual(await benefit(order), {'給付割合': '1割負担', '商品代金(10割・税込)': '13,904円', '利用者負担額(1割・税込)': '1,390円', '保険者負担額(9割・税込)': '12,514円'});

  // 印刷・PDF は受注簿の中の「印刷」「PDF保存」（中の枠だけを印刷する。給付内訳の印刷は受注簿ツールのテスト）
  await order.getByRole('button', {name: '印刷', exact: true}).waitFor();

  // ---- 見積書で直すと、受注簿も直る（住所・商品名）。開いていたページ（2ページ目）のまま
  await page.getByRole('tab', {name: '📋 見積書'}).click();
  await page.getByRole('textbox', {name: '住所', exact: true}).fill('福岡県行橋市中央2-2');
  await page.locator('[data-field="items"] input[aria-label="商品名"]').first().fill('シャワーチェア 見本A（ひじ掛け付き）');
  await page.getByRole('tab', {name: '📦 販売受注簿'}).click();
  await order.waitForFunction(() => [...document.querySelector('section[aria-label="販売受注簿入力"]').querySelectorAll('input')].some((i) => i.value === '福岡県行橋市中央2-2'));
  assert.equal(await productName(order).inputValue(), '浴槽台 見本B');
  await goPage(order, '1/3');
  await order.waitForFunction(() => document.querySelector('section[aria-label="販売受注簿入力"] .productNameBlock textarea').value === 'シャワーチェア 見本A（ひじ掛け付き）');
  assert.equal(await cell(order, '住所（任意）').inputValue(), '福岡県行橋市中央2-2');

  // ---- 受注簿で直した型番・仕切りは見積書にも入る。受注番号（受注簿だけの欄）は受注簿に残る
  await cell(order, '受注番号').fill('J-001');
  await modelNumber(order).fill('A-100W');
  await mgmt(order, '仕切り(税抜)').fill('9000');
  // 商品マスタから選んだ商品の品番は、見積書では文字（入力欄ではない）
  await page.waitForFunction(() => document.querySelector('[data-field="items"]').textContent.includes('A-100W'), null, {timeout: 10000});
  await page.getByRole('tab', {name: '📋 見積書'}).click();
  const itemsText = await page.locator('[data-field="items"]').innerText();
  assert.match(itemsText, /見本メーカー\s+A-100W/);
  // 仕切り 9,000円（見積書の金額は定価から：変わらない）
  await page.getByText('27,808円').first().waitFor();
  await page.getByRole('tab', {name: '📦 販売受注簿'}).click();
  assert.equal(await cell(order, '受注番号').inputValue(), 'J-001');
  assert.equal(await modelNumber(order).inputValue(), 'A-100W');

  // ---- 📷 カタログから商品を自動認識：画像の欄（スクリーンショットの読み取り）が開く。介援隊・ウェルファンのカタログを開くボタン
  await order.getByRole('button', {name: '📷 カタログから商品を自動認識'}).click();
  await order.locator('.imagePanel').waitFor();
  assert.equal(await order.getByRole('button', {name: '📷 カタログから商品を自動認識'}).count(), 0);
  const links = order.getByLabel('カタログを開く');
  assert.deepEqual(
    await links.getByRole('link').evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')])),
    [
      ['🔗 介援隊のカタログを開く', 'https://www.kaientai.cc/Default.aspx', '_blank'],
      ['🔗 ウェルファンのカタログを開く', 'https://www.welfan.shop/', '_blank'],
    ],
  );
  await order.getByText('商品部分を貼り付け').waitFor();
  await page.screenshot({path: `${out}/hacchu-3-scan.png`});
  await order.getByRole('button', {name: '✕ 自動認識を閉じる'}).click();
  await order.locator('.imagePanel').waitFor({state: 'hidden'});
  await order.getByRole('button', {name: '📷 カタログから商品を自動認識'}).waitFor();

  // ---- 受注簿で足した商品（カタログから読み取ったのと同じ：空のページに入れて「商品を追加」）は、見積書の商品にも入る
  await goPage(order, '3/3');
  await productName(order).fill('ポータブルトイレ 見本C');
  await modelNumber(order).fill('PT-300');
  await mgmt(order, '定価(税抜)').fill('40000');
  await mgmt(order, '仕切り(税抜)').fill('24000');
  await order.getByRole('button', {name: '商品を追加'}).click();
  await page.getByText('受注簿で足した商品を、見積書にも入れました').waitFor();
  await page.getByRole('tab', {name: '📋 見積書'}).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-field="items"] input')].some((i) => i.value === 'ポータブルトイレ 見本C'));
  // 40,000×0.8＝32,000円＋税3,200円 → 合計 27,808＋35,200＝63,008円
  await page.getByText('63,008円').first().waitFor();
  await page.getByRole('tab', {name: '📦 販売受注簿'}).click();
  await goPage(order, '3/4');
  await order.waitForFunction(() => document.querySelector('section[aria-label="販売受注簿入力"] .productNameBlock textarea').value === 'ポータブルトイレ 見本C');
  assert.equal(await checked(order, 'orderType'), '給付');
  assert.equal(await mgmt(order, '販売単価(税抜)').inputValue(), '32000');

  // ---- 受注簿でページを消すと、見積書の商品からも消える
  await order.getByRole('button', {name: 'このページを削除'}).click();
  await page.getByText('受注簿で消した商品を、見積書からも消しました').waitFor();
  await page.getByRole('tab', {name: '📋 見積書'}).click();
  await page.getByText('27,808円').first().waitFor();
  assert.ok(!(await page.locator('[data-field="items"] input').evaluateAll((els) => els.map((i) => i.value))).includes('ポータブルトイレ 見本C'));

  // ---- 読み直しても、受注簿の中身（受注番号）は案件に残っている
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();
  await page.getByText('見本 花子').first().click();
  order = await openHacchu(page);
  await goPage(order, '1/3');
  await order.waitForFunction(() => document.querySelector('section[aria-label="販売受注簿入力"] .productNameBlock textarea').value.startsWith('シャワーチェア'));
  assert.equal(await cell(order, '受注番号').inputValue(), 'J-001');
  assert.equal(await modelNumber(order).inputValue(), 'A-100W');
  await page.screenshot({path: `${out}/hacchu-4-reload.png`});

  // ---- スマホの幅でも横にはみ出さない
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'スマホの幅で横にはみ出している');
  await page.screenshot({path: `${out}/hacchu-5-phone.png`});

  assert.deepEqual(errors, []);
  console.log('ok: 見積もり → 📦 販売受注簿（中に出る・給付・1点1ページ・給付内訳は見積書と同じ合計）→ 印刷 → 見積書で直す／受注簿で直す・足す・消す → 自動認識・カタログ → 読み直し → スマホ');
} finally {
  await browser.close();
  server.close();
}
