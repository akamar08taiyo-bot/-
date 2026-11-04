// 文字のはみ出しを出さない決まりを確かめる（ユーザーの指示「商品名などがはみ出ている。絶対にないようにルール化する。工事費見積もりなども同様に同じルール化として必ず守る」2026-11-03）。
// サンプルの様邸に長い住所を入れ、申請書（どの保険者も）・理由書・工事見積書のプレビューで、どの欄の文字も欄の外に出ていないこと
// （プレビューの欄＝data-fit・工事見積書の欄＝.fitbox。字そのものの範囲を Range で測る）。ブラウザの「最小フォントサイズ」の設定（小さい字を大きく出す）の
// まねをしても同じ（print/fitTexts.ts・print/shrinkCells.ts が出た大きさを測って縮める）。
// usage: node e2e-fit.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const [site, out = 'e2e-out'] = process.argv.slice(2);
let total = 0;
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const check = () => {
  const bad = [];
  const boxes = [...document.querySelectorAll('[data-fit]')].map((b) => [b, b.querySelector(':scope > [data-fit-inner]')]);
  // 工事見積書：.fitbox は欄（td）の中
  for (const f of document.querySelectorAll('.fitbox')) boxes.push([f.parentElement, f]);
  for (const [b, el] of boxes) {
    if (!el || !el.textContent.trim()) continue;
    const r = b.getBoundingClientRect();
    if (r.height < 1 || r.width < 1) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    if (!rects.length) continue;
    const L = Math.min(...rects.map((x) => x.left)), R = Math.max(...rects.map((x) => x.right));
    const T = Math.min(...rects.map((x) => x.top)), B = Math.max(...rects.map((x) => x.bottom));
    if (L < r.left - 1 || R > r.right + 1 || T < r.top - 1.5 || B > r.bottom + 1.5) bad.push(`${el.textContent.trim().slice(0, 24)} box=${Math.round(r.width)}x${Math.round(r.height)} text=${Math.round(R - L)}x${Math.round(B - T)}`);
  }
  return bad;
};
for (const minFont of [false, true]) {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript((mf) => {
    localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    if (mf) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '[data-fit-inner] span, [data-fit-inner] div, .fitbox, .fitbox div { font-size: max(12px, 1em) !important; }'; document.head.append(s); });
  }, minFont);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => {
    throw new Error('pageerror: ' + e.message);
  });
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  await page.getByRole('button', {name: /サンプルで試す/}).click();
  await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  const form = page.getByRole('form', {name: '申請書'});
  await form.waitFor();
  await form.getByLabel('住所', {exact: true}).fill('福岡県京都郡苅田町大字見本長い地名の町一丁目二番地三号 見本ハイツ第二号棟 101');
  await page.waitForTimeout(1200);
  const tag = minFont ? '最小フォントあり' : 'ふつう';
  let seen = 0;
  for (const ins of ['kanda', 'yukuhashi', 'miyako', 'kouiki', 'kurume', 'iizuka', 'oita']) {
    const sel = page.getByRole('combobox', {name: '保険者', exact: true});
    if (!(await sel.count())) break;
    const opts = await sel.locator('option').evaluateAll((l) => l.map((o) => o.value));
    if (!opts.includes(ins)) continue;
    await sel.selectOption(ins);
    await page.waitForTimeout(1500);
    const bad = await page.evaluate(check);
    console.log('•', tag, '申請書', ins, bad.length, bad.slice(0, 5));
    total += bad.length;
    seen++;
  }
  assert.ok(seen >= 7, `申請書を ${seen} 保険者しか見ていない`);
  await page.getByRole('tab', {name: /理由書/}).first().click();
  await page.waitForTimeout(1500);
  const bad2 = await page.evaluate(check);
  console.log('•', tag, '理由書', bad2.length, bad2.slice(0, 5));
  total += bad2.length;
  await page.getByRole('tab', {name: /工事見積書/}).first().click();
  await page.waitForTimeout(1500);
  const bad3 = await page.evaluate(check);
  console.log('•', tag, '工事見積書', bad3.length, bad3.slice(0, 5));
  total += bad3.length;
  assert.ok(await page.locator('.fitbox').count() > 10, '工事見積書の欄が測れていない');
  await ctx.close();
}
await browser.close();
assert.equal(total, 0, `はみ出している欄が ${total} あります`);
console.log('OK はみ出し 0');
