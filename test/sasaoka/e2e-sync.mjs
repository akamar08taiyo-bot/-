// 見積書（jutaku-mitsumori/）と請求書（sasaoka/）を、同じブラウザの2つのタブで同時に開いても、どちらの変更も消えないことを確かめる：
//   見積書で直す → 開いたままの仕切り計算に入る／仕切り計算で直す → 開いたままの見積書に入る／
//   両方でほぼ同時に保存しても両方残る（あとから保存した方で前の変更を消さない）／読み直しても残っている
// usage: node e2e-sync.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html と <サイト>/sasaoka/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
// 同じブラウザ（同じ保存場所）の2つのタブ
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  p.on('dialog', (d) => d.accept());
};
const est = await ctx.newPage();
watch(est, '見積書');
await est.goto(`${site}/jutaku-mitsumori/index.html`);
await est.getByRole('button', {name: /サンプルで試す/}).click();
await est.waitForTimeout(800); // 自動保存を待つ

const shi = await ctx.newPage();
watch(shi, '仕切り');
await shi.goto(`${site}/sasaoka/index.html`);
await shi.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const shiTotal = () => shi.locator('aside table').innerText();
assert.ok((await shiTotal()).includes('12,900')); // ①部材代：手すり60cm 10,000×0.15＝1,500＋3,000＋7,800＋600

// ---------------- 見積書で L型手すりを2本にする → 開いたままの仕切り計算に入る（①部材代 12,900＋7,800＝20,700）
await est.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const sheet = est.getByRole('region', {name: '見積書', exact: true});
const qtyKey = await sheet.locator('.form-page tr', {hasText: 'L型手すり'}).first().locator('[data-edit$=":qty"]').first().getAttribute('data-edit');
await sheet.locator(`[data-edit="${qtyKey}"]`).click();
await est.keyboard.type('2');
await est.keyboard.press('Enter');
await shi.waitForFunction(() => document.querySelector('aside table')?.textContent?.includes('20,700'), null, {timeout: 5000});
assert.equal(await shi.getByRole('textbox', {name: 'L型手すりの数量'}).inputValue(), '2');
log('見積書で直す → 開いたままの仕切り計算に入るOK');

// ---------------- 仕切り計算でタイルを3箇所にする → 開いたままの見積書の同上施工費が 6,000（タイルの見積の単価 2,000×3）
await shi.getByRole('button', {name: 'タイルの数量を1増やす'}).click();
await est.waitForFunction(
  () => [...document.querySelectorAll('.est-sheet .form-page tr')].some((tr) => /同上施工費/.test(tr.textContent ?? '') && /6,000/.test(tr.textContent ?? '')),
  null,
  {timeout: 5000},
);
log('仕切り計算で直す → 開いたままの見積書に入るOK');

// ---------------- ほぼ同時に保存：見積書で新しい見積書を作り、すぐに仕切り計算で備考を書く（どちらも保存を待たない）
await est.getByRole('button', {name: '← 一覧へ戻る'}).click();
await est.getByRole('button', {name: '＋ 広域連合', exact: true}).click();
await est.getByRole('tab', {name: '📋 見積書'}).click(); // 新規作成は申請書のタブから開く
await est.getByPlaceholder('例：山田').fill('同時 一郎');
await est.getByLabel('笹岡工務店の請求書に入れる').check(); // 行を入れる前に請求書に入れる
const memo = shi.locator('label', {hasText: '備考（任意・明細に印刷されます）'}).locator('input');
await memo.fill('同時に保存した備考');
await est.waitForTimeout(1500);
await shi.waitForTimeout(500);

// 両方とも読み直して、両方の変更が残っている
await est.reload();
await est
  .getByRole('button', {name: '← 一覧へ戻る'})
  .click()
  .catch(() => {}); // 見積書を開いたまま読み直したとき
await est.getByRole('cell', {name: /同時 一郎/}).waitFor();
await shi.reload();
await shi.getByRole('heading', {level: 1, name: '（サンプル）山田様邸'}).waitFor();
assert.equal(await memo.inputValue(), '同時に保存した備考');
assert.equal(await shi.getByRole('textbox', {name: 'L型手すりの数量'}).inputValue(), '2');
assert.equal(await shi.getByRole('textbox', {name: 'タイルの数量'}).inputValue(), '3');
await shi.screenshot({path: path.join(outDir, '60-sync-shikiri.png'), fullPage: true});
log('ほぼ同時に保存しても両方残るOK');

// ---------------- 新しい見積書（同時 一郎）は、「請求書に入れる」で仕切り計算の一覧に入る（行を入れたときも入る）。外すと一覧から消える
await shi.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click(); // 様邸の画面の左上は「← 見積もりへ戻る」。一覧へはタブで戻る
await shi.getByRole('cell', {name: /同時 一郎/}).waitFor();
assert.equal(await shi.getByRole('cell', {name: /（サンプル）山田様邸/}).count(), 1);
await est.getByRole('cell', {name: /同時 一郎/}).click();
await est.getByLabel('笹岡工務店の請求書に入れる').uncheck();
await shi.waitForFunction(() => !document.querySelector('main')?.textContent?.includes('同時 一郎'), null, {timeout: 5000});
await est.getByRole('button', {name: '← 一覧へ戻る'}).click();
log('新しい見積書は請求書に入れると仕切り計算の一覧に入り、外すと消えるOK');

// ---------------- 知らせ（BroadcastChannel）が届かないブラウザでも、古いままのタブで保存したときに、前の変更を消さない
// 知らせを出せないタブ（見積書）でエンドキャップを3個に → 仕切り計算（古いまま）で木を3箇所に → 読み直すと両方残る
const quiet = await ctx.newPage();
watch(quiet, '知らせなし');
await quiet.addInitScript(() => {
  delete window.BroadcastChannel;
});
await quiet.goto(`${site}/jutaku-mitsumori/index.html`);
await quiet.getByRole('button', {name: /見積書の一覧を開く/}).click();
await quiet.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const qs = quiet.getByRole('region', {name: '見積書', exact: true});
const capKey = await qs.locator('.form-page tr', {hasText: 'エンドキャップ'}).first().locator('[data-edit$=":qty"]').first().getAttribute('data-edit');
await qs.locator(`[data-edit="${capKey}"]`).click();
await quiet.keyboard.type('3');
await quiet.keyboard.press('Enter');
await quiet.waitForTimeout(1000);
await shi.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await shi.getByRole('button', {name: '木の数量を1増やす'}).click();
await shi.waitForTimeout(1000);
await shi.reload();
await shi.getByRole('heading', {level: 1, name: '（サンプル）山田様邸'}).waitFor();
assert.equal(await shi.getByRole('textbox', {name: 'エンドキャップの数量'}).inputValue(), '3');
assert.equal(await shi.getByRole('textbox', {name: '木の数量'}).inputValue(), '3');
assert.equal(await shi.getByRole('textbox', {name: 'L型手すりの数量'}).inputValue(), '2');
log('知らせが届かなくても、あとから保存した方で前の変更を消さないOK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
