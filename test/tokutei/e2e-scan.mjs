// 販売見積書の「📷 スクショから自動認識」をブラウザで通しで確かめる（Playwright。読み取りは本物：tesseract.js をこの端末で動かす）。
// 架空の介援隊の商品ページ（商品名・申込番号・メーカー・JAN・WEB・TAIS・小売価格・卸売価格）を画像にして、窓の中で貼り付け →
// 受注簿ツールの読み取り（?embed=scan。画像の欄だけ）→ 右の欄に商品名・定価・仕切りが入る → 「見積書に入れる」→ 見積書の商品・金額。
// カタログのリンク（ケアマックス（介援隊）・ウェルファン）も見る。
// （ユーザーの指示「販売見積書は、見積もり書を作成する為のみに作成。スクショから切り取って作成にすると、自動認識を使えるようにする。
//   ケアマックスとウェルファンのカタログにも飛べるように、リンクも準備」2026-10-25）
// 使い方：npm run -s build:tokutei と、販売受注簿作成ツール（akamar08taiyo-bot/taiyo-hacchu-scan）の npm run build のあと
//   ENG_DATA=<eng.traineddata.gz のあるフォルダ> node test/tokutei/e2e-scan.mjs <受注簿ツールの dist フォルダ> [出力フォルダ]
// 読み取りの部品（jsDelivr）はこの作業環境から取れないので、node_modules の tesseract.js・tesseract.js-core・@tesseract.js-data/jpn と、
// 英語のデータ（受注簿ツールは jpn+eng で読む。npm pack @tesseract.js-data/eng@1.0.0 の 4.0.0_best_int）を Playwright で返す。

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const hacchu = process.argv[2];
assert.ok(hacchu, '受注簿ツールの dist フォルダを渡してください');
const eng = process.env.ENG_DATA;
assert.ok(eng, '英語のデータのフォルダを ENG_DATA で渡してください');
const out = process.argv[3] ?? 'e2e-out';
mkdirSync(out, {recursive: true});

const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const NM = new URL('../../node_modules/', import.meta.url).pathname;
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = null;
  if (path.startsWith('/tokutei/')) file = join(dist, path.endsWith('/version.json') ? 'version.json' : 'index.html');
  else if (path.startsWith('/taiyo-hacchu-scan/')) file = join(hacchu, normalize(path.slice('/taiyo-hacchu-scan/'.length) || 'index.html').replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = readFileSync(file);
    res.writeHead(200, {'content-type': TYPES[extname(file)] ?? 'application/octet-stream'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5194);
await new Promise((r) => server.listen(port, r));
const site = `http://localhost:${port}`;

/** 架空の介援隊の商品ページ（受注簿ツールの test/scan-cases.js の並び）。この画面を切り取ったスクリーンショットのつもり */
const CATALOG = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#fff;font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;color:#222}
.page{width:620px;padding:18px 24px}
h1{font-size:20px;font-weight:500;margin:0 0 14px;padding:6px 10px;border-bottom:2px solid #2a6db0;color:#1d4f86}
table{border-collapse:collapse;font-size:16px}
th{font-weight:400;text-align:left;padding:5px 18px 5px 0;color:#444}
td{padding:5px 0}
.cost{color:#d0021b}
</style><div class="page">
<h1>シャワーベンチ 見本A SB-01 ブルー</h1>
<table>
<tr><th>申込番号：</th><td>S9901</td></tr>
<tr><th>メーカー：</th><td>見本化成</td></tr>
<tr><th>JANコード：</th><td>4900000000017</td></tr>
<tr><th>WEBコード：</th><td>990101</td></tr>
<tr><th>TAISコード：</th><td></td></tr>
<tr><th>小売価格：</th><td>35,000円(課10)</td></tr>
<tr><th>卸売価格：</th><td class="cost">21,000円(課10)</td></tr>
<tr><th>在庫：</th><td></td></tr>
</table></div>`;

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  // 架空のカタログの画面を画像に（表示倍率 2。倍率 1 の小さな字だと「35,000」の「,」を「.」と読んで、定価が入らない）
  const maker = await browser.newPage({viewport: {width: 680, height: 420}, deviceScaleFactor: 2});
  await maker.setContent(CATALOG);
  const png = await maker.locator('.page').screenshot();
  await maker.close();

  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route('https://cdn.jsdelivr.net/**', async (route) => {
    const url = route.request().url();
    const m = /\/npm\/(tesseract\.js@v[\d.]+\/dist|tesseract\.js-core@v[\d.]+|@tesseract\.js-data\/(jpn|eng)\/4\.0\.0_best_int)\/([^/?]+)$/.exec(url);
    if (!m) return route.abort();
    const dir = m[1].startsWith('tesseract.js@') ? NM + 'tesseract.js/dist' : m[1].startsWith('tesseract.js-core') ? NM + 'tesseract.js-core' : m[2] === 'eng' ? eng : NM + '@tesseract.js-data/jpn/4.0.0_best_int';
    await route.fulfill({body: readFileSync(join(dir, m[3])), headers: {'access-control-allow-origin': '*', 'content-type': m[3].endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}});
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    } catch {
      /* about:blank */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`特定福祉用具: ${e}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${site}/tokutei/`);
  await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();
  await page.getByRole('button', {name: '＋ 行橋市'}).click();
  await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本 花子');

  // ---- 販売見積書の中に受注簿は出さない（見積書を作るだけ）
  assert.equal(await page.getByRole('tab', {name: '📦 販売受注簿'}).count(), 0);
  assert.equal(await page.locator('iframe[data-hacchu]').count(), 0);

  // ---- 📷 スクショから自動認識：窓の中に受注簿ツールの読み取り（画像の欄だけ）。カタログのリンク
  await page.getByRole('button', {name: '📷 スクショから自動認識'}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', {name: '📷 スクショから自動認識'}).waitFor();
  assert.deepEqual(
    await dialog.getByLabel('カタログを開く').getByRole('link').evaluateAll((as) => as.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')])),
    [
      ['🔗 ケアマックス（介援隊）のカタログを開く', 'https://www.kaientai.cc/Default.aspx', '_blank'],
      ['🔗 ウェルファンのカタログを開く', 'https://www.welfan.shop/', '_blank'],
    ],
  );
  assert.equal(await dialog.locator('iframe[data-scan]').getAttribute('src'), '/taiyo-hacchu-scan/?embed=scan');
  const scan = await (await dialog.locator('iframe[data-scan]').elementHandle()).contentFrame();
  scan.page().on('pageerror', (e) => errors.push(`受注簿ツール: ${e}`));
  await scan.getByText('商品部分を貼り付け').waitFor();
  assert.equal(await scan.locator('section[aria-label="販売受注簿入力"]').count(), 0); // 受注簿は出さない
  assert.equal(await scan.locator('header.topbar').count(), 0);
  assert.equal(await scan.getByText('← 業務アプリポータルへ戻る').count(), 0);
  assert.equal(await dialog.getByRole('button', {name: '見積書に入れる'}).isDisabled(), true);
  await page.screenshot({path: `${out}/scan-1-dialog.png`});

  // ---- 窓の上で貼り付け（Ctrl+V と同じ）→ 受注簿ツールが読む → 右の欄に入る
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'catalog.png', {type: 'image/png'}));
    window.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
  }, png.toString('base64'));
  await page.waitForFunction(() => document.querySelector('[aria-label="読み取った定価"]')?.value === '35,000', null, {timeout: 240_000});
  const name = await dialog.getByLabel('読み取った商品名').inputValue();
  assert.match(name, /シャワーベンチ/);
  assert.equal(await dialog.getByLabel('読み取った仕切り').inputValue(), '21,000');
  assert.equal(await dialog.getByLabel('読み取った型番').inputValue(), 'SB-01');
  assert.equal(await dialog.getByLabel('読み取ったメーカー').inputValue(), '見本化成');
  assert.equal(await dialog.getByLabel('読み取った種目').inputValue(), '入浴補助用具|入浴用いす');
  assert.equal(await scan.getByText('右の欄に入れました').count(), 1);
  await page.screenshot({path: `${out}/scan-2-read.png`});

  // ---- 見積書に入れる：35,000×0.8＝28,000＋税2,800＝30,800円
  await dialog.getByRole('button', {name: '見積書に入れる'}).click();
  await page.getByText(/見積書に入れました：シャワーベンチ/).waitFor();
  assert.equal(await dialog.getByLabel('読み取った商品名').inputValue(), '');
  await dialog.getByRole('button', {name: '閉じる'}).last().click();
  await page.getByText('30,800円').first().waitFor();
  const values = await page.locator('[data-field="items"] input').evaluateAll((els) => els.map((i) => i.value));
  assert.ok(values.some((v) => /シャワーベンチ/.test(v)), values.join('／'));
  assert.ok(values.includes('見本化成'), values.join('／'));
  await page.screenshot({path: `${out}/scan-3-added.png`});

  // ---- 申請書の画面にも同じボタン
  await page.getByRole('tab', {name: /📄 申請書/}).click();
  await page.getByRole('button', {name: '📷 スクショから自動認識'}).waitFor();

  assert.deepEqual(errors, []);
  console.log('ok: 📷 スクショから自動認識（受注簿ツールの読み取りだけ・カタログのリンク）→ 貼り付け → 右の欄 → 見積書に入れる');
} finally {
  await browser.close();
  server.close();
}
