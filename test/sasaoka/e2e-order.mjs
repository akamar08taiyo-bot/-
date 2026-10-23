// 発注書を確かめる：見積書の「🛒 発注書を作成」→ 見積書の部材を何本・何個にまとめる
//   （切って使う手すりは 4000mm／2000mm の本数。余りが 0.1本より少なければもう1本）→ 数を直す・消す・戻す・部材リストから足す
//   → 読み直しても同じ → 印刷（A4縦の発注書）→ 販売受注簿に転記（同じサイトの /taiyo-hacchu-scan/ に部材を渡して開く）→ 見積書へ戻る
// usage: node e2e-order.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html）。販売受注簿作成ツールは置かなくてよい（開いた先は差し替えて確かめる）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
  } catch {
    /* 新しいタブを開いた直後（about:blank）は使えない */
  }
});
// 販売受注簿作成ツールの代わり：渡された部材（localStorage）を画面に出すだけのページ
await ctx.route('**/taiyo-hacchu-scan/**', (route) =>
  route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>販売受注簿</title><pre id="got"></pre><script>document.getElementById("got").textContent = localStorage.getItem("taiyo-hacchu-import-v1") || "";</script>',
  }),
);
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();

// 木の手すり（1本4m）を 380cm 使う → 3800mm（0.95本）。4000mm 1本だと余りが 200mm（0.1本＝400mm より少ない）→ 2000mm をもう1本
const qtyKey = await sheet.locator('.form-page tr', {hasText: '木の手すり 35φ 4m'}).first().locator('[data-edit$=":qty"]').first().getAttribute('data-edit');
await sheet.locator(`[data-edit="${qtyKey}"]`).click();
await page.keyboard.type('380cm');
await page.keyboard.press('Enter');
// 工事場所の住所（印刷した発注書には出さない。発注先に要らないため）
await sheet.locator('[data-edit="job:address"]').click();
await page.keyboard.type('福岡県行橋市中央1-1');
await page.keyboard.press('Enter');

await page.getByRole('button', {name: '🛒 発注書を作成'}).click();
await page.getByRole('heading', {name: '発注書　（サンプル）山田様邸'}).waitFor();
assert.match(page.url(), /#tab=estimate&job=[^&]+&view=order$/);
const list = page.getByRole('region', {name: '発注する部材'});
const items = async () => (await list.locator('ol > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const total = () => page.getByTestId('order-total').innerText();
let rows = await items();
assert.equal(rows.length, 5, rows.join('\n'));
// どこで使うか：見積書の写真番号（玄関①・トイレ②）
assert.match(rows[0], /^1 木の手すり 35φ 4m サンプル 品番 S-TS35 1本 4000mm ?写真番号 ① − ＋ 本 ✕$/);
assert.match(rows[1], /^2 木の手すり 35φ 2m サンプル 1本 2000mm ?写真番号 ① ⚠ 2000mmの品が部材リストにありません。品番・価格を確かめてください/);
// 計算の説明（使う長さ・余り・足す分）は出さない（ユーザーの指示）
assert.ok(rows.every((t) => !/使う長さ|余り|足す分/.test(t)), rows.join('\n'));
assert.match(rows[2], /^3 ブラケット サンプル 品番 S-BK01 ?写真番号 ① − ＋ 個 ✕$/);
assert.match(rows[3], /^4 L型手すり サンプル 品番 S-TL01 ?写真番号 ② − ＋ 本 ✕$/);
assert.equal(await list.getByLabel('ブラケットの発注する数', {exact: true}).inputValue(), '2');
assert.equal(await total(), '5品目（3本・4個）');
log('見積書の部材から発注する数（4000mm 1本＋余りが少ないので 2000mm 1本・規格品は見積書の数）OK');

// 数を直す・消す・戻す
await list.getByRole('button', {name: 'ブラケットの発注する数を1増やす'}).click();
assert.match((await items())[2], /見積書から計算した数は 2個 ?戻す/);
await list.getByRole('button', {name: 'エンドキャップを発注書から消す'}).click();
assert.equal(await total(), '4品目（3本・3個）');
await list.getByRole('button', {name: '戻す', exact: true}).last().click(); // 消した行：エンドキャップ
assert.equal(await total(), '5品目（3本・5個）');
await page.getByPlaceholder('例：ケアマックス').fill('ケアマックス');
assert.equal(await page.getByText('備考').count(), 0); // 備考（○月○日までに納品など）の欄はない
// 部材リストから足す：見積書にない部材は行が増える。見積書にある部材は、その行の数が増える
await list.getByRole('button', {name: '＋ 部材リストから足す'}).click();
const picker = page.getByRole('dialog');
await picker.getByRole('button', {name: /すべて/}).click();
await picker.getByRole('row', {name: /補強板/}).getByRole('button', {name: '＋ 追加'}).click();
await picker.getByRole('row', {name: /L型手すり/}).getByRole('button', {name: '＋ 追加'}).click();
await picker.getByRole('button', {name: '選び終わったら閉じる'}).click();
rows = await items();
assert.equal(rows.length, 6, rows.join('\n'));
assert.match(rows[5], /^6 補強板 サンプル 品番 S-HB01 ?発注書で足した行 − ＋ 枚 ✕$/);
assert.equal(await list.getByLabel('L型手すりの発注する数', {exact: true}).inputValue(), '2');
assert.equal(await total(), '6品目（4本・5個・1枚）');
log('数を直す・消す・戻す・部材リストから足すOK');

// 読み直しても発注書が開き、直したところが残る（自動保存は打ち終わって 0.4 秒後）
await page.waitForTimeout(1200);
await page.reload();
await page.getByRole('heading', {name: '発注書　（サンプル）山田様邸'}).waitFor();
assert.equal(await total(), '6品目（4本・5個・1枚）');
assert.equal(await page.getByPlaceholder('例：ケアマックス').inputValue(), 'ケアマックス');
assert.equal(await list.getByLabel('ブラケットの発注する数', {exact: true}).inputValue(), '3');
await page.screenshot({path: path.join(outDir, '70-order.png'), fullPage: true});
log('読み直しても同じOK');

// 印刷：A4縦の発注書（発注先・件名・数量と単位。品目数・現場の住所・備考・計算の説明は出さない）
await page.getByRole('button', {name: '🖨 発注書を印刷'}).click();
const doc = page.locator('.order-doc');
await doc.waitFor();
const docText = (await doc.innerText()).replace(/\s+/g, ' ');
for (const t of ['発 注 書', 'ケアマックス 御中', '件名：（サンプル）山田様邸 住宅改修の部材', '写真番号']) {
  assert.ok(docText.includes(t) || docText.replace(/ /g, '').includes(t.replace(/ /g, '')), `発注書に「${t}」がない: ${docText}`);
}
assert.ok(!/使う長さ|余り|足す分|品目|納品|現場|行橋市中央/.test(docText), `発注書に要らないもの（計算の説明・品目数・備考・現場の住所）が出ている: ${docText}`);
const docRows = (await doc.locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
assert.deepEqual(
  docRows,
  // いちばん右の欄は、どこで使うか（写真番号）。発注書で足した補強板は空
  ['1 サンプル S-TS35 木の手すり 35φ 4m 1 本 ①', '2 サンプル 木の手すり 35φ 2m 1 本 ①', '3 サンプル S-BK01 ブラケット 3 個 ①', '4 サンプル S-TL01 L型手すり 2 本 ②', '5 サンプル S-EC01 エンドキャップ 2 個 ②', '6 サンプル S-HB01 補強板 1 枚'],
);
assert.equal(await page.title(), '発注書_（サンプル）山田様');
await doc.screenshot({path: path.join(outDir, '71-order-doc.png')});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('発注書の印刷OK');

// 数が 0 の行には No. を付けない（印刷は発注する行だけに番号を付けるので、画面も同じ番号にする）
const bracketQty = list.getByLabel('ブラケットの発注する数', {exact: true});
const stepBracket = async (name, want) => {
  await list.getByRole('button', {name: `ブラケットの発注する数を1${name}`}).click();
  for (let i = 0; i < 30 && (await bracketQty.inputValue()) !== want; i++) await page.waitForTimeout(100);
  assert.equal(await bracketQty.inputValue(), want);
};
for (const want of ['2', '1', '0']) await stepBracket('減らす', want);
rows = await items();
assert.match(rows[2], /^ブラケット .*0 なので発注しません/, rows[2]);
assert.match(rows[3], /^3 L型手すり /, rows[3]);
await page.getByRole('button', {name: '🖨 発注書を印刷'}).click();
await doc.waitFor();
assert.equal((await doc.locator('tbody tr').nth(2).innerText()).replace(/\s+/g, ' ').trim(), '3 サンプル S-TL01 L型手すり 2 本 ②');
await page.getByRole('button', {name: '✕ 閉じる'}).click();
for (const want of ['1', '2', '3']) await stepBracket('増やす', want);
log('数が 0 の行には No. を付けない（画面と印刷で同じ番号）OK');

// 販売受注簿に転記：同じサイトの /taiyo-hacchu-scan/ を新しいタブで開き、部材を渡す
const [tab] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('link', {name: '📤 販売受注簿に転記'}).click()]);
await tab.waitForLoadState('domcontentloaded');
assert.equal(new URL(tab.url()).pathname + new URL(tab.url()).search, '/taiyo-hacchu-scan/?from=jutaku');
const got = JSON.parse(await tab.locator('#got').innerText());
assert.equal(got.kind, 'taiyo-jutaku-order');
assert.deepEqual([got.title, got.customerName, got.sales, got.supplier], ['（サンプル）山田様邸 住宅改修', '（サンプル）山田', '久保', 'ケアマックス']);
assert.deepEqual(
  got.items.map((i) => [i.modelNumber, i.productName, i.quantity, i.unit]),
  [
    ['S-TS35', '木の手すり 35φ 4m', 1, '本'],
    ['', '木の手すり 35φ 2m', 1, '本'],
    ['S-BK01', 'ブラケット', 3, '個'],
    ['S-TL01', 'L型手すり', 2, '本'],
    ['S-EC01', 'エンドキャップ', 2, '個'],
    ['S-HB01', '補強板', 1, '枚'],
  ],
);
assert.ok(got.items[0].listPrice > 0 && got.items[0].cost > 0 && got.items[1].cost === 0, JSON.stringify(got.items.slice(0, 2)));
assert.ok(got.items.every((i) => i.note === ''), '備考に計算の説明を渡している'); // 計算の説明は渡さない
await tab.close();
log('販売受注簿に転記（部材6点・数量と単位・発注先・営業担当）OK');

// 見積書へ戻る（URL の view=order も消える）
await page.getByRole('button', {name: '← 見積書へ戻る'}).click();
await sheet.waitFor();
assert.doesNotMatch(page.url(), /view=order/);

// スマホの幅でも、数量と単位・✕ が並ぶ
await page.setViewportSize({width: 390, height: 844});
await page.getByRole('button', {name: '🛒 発注書を作成'}).click();
await page.getByRole('heading', {name: '発注書　（サンプル）山田様邸'}).waitFor();
const box = await list.getByRole('button', {name: 'ブラケットを発注書から消す'}).boundingBox();
assert.ok(box && box.x + box.width <= 390, `✕ が画面からはみ出している: ${JSON.stringify(box)}`);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, '横にはみ出している');
await page.screenshot({path: path.join(outDir, '72-order-phone.png'), fullPage: true});
log('スマホの幅OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
assert.deepEqual(errors, []);
await browser.close();
