// 文字のはみ出し・切れを、帳票ごとに文字の位置をはかって数える（ユーザーの指示「文字のはみ出しであったりだとか、途中で、横が切れていたりとか、
// 例えば見積もりの枠からはみ出ていたりだとか、そういったところもしっかり見てください」2026-10-22）。
// 長い値の架空の様邸（stress-data.mjs。4つの保険者）を設定のバックアップから足し、見積書（画面・印刷）・申請書・理由書・発注書（画面・印刷）・請求書・様邸の明細の
// 文字のかたまりごとに、いちばん近い箱（表のます、はみ出しを隠す箱）の内側から出ていないかをはかる。0 件が目標。
// スマホの幅の印刷イメージは CSS の zoom で縮めて見せるので、箱の線の太さも同じ倍率にしてから引く（縮める前の太さを引くと内側を狭く測ってしまう）。
// usage: node stress-data.mjs <長い値の json> && node overflow-check.mjs <サイトのURL> <長い値の json> <出力フォルダ> [幅（既定 1366。スマホは 390）]
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import path from 'node:path';
import fs from 'node:fs';

const [site, backup, out, widthArg] = process.argv.slice(2);
const width = Number(widthArg || 1366);
fs.mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width, height: 900}, locale: 'ja-JP', acceptDownloads: true});
await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
  } catch {
    /* about:blank */
  }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const tag = width < 600 ? 'phone' : 'pc';

// 文字（テキストのかたまり）ごとに、いちばん近い「箱」（表のます td/th か、はみ出しを隠す箱）の内側からはみ出しているかをはかる
const MEASURE = (roots) => {
  const out = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || el.closest('.sr-only, [hidden], script, style, button, select, option, textarea, input')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      let box = null;
      let clips = false;
      for (let a = el; a && root.contains(a); a = a.parentElement) {
        const acs = getComputedStyle(a);
        const c = acs.overflowX !== 'visible' || acs.overflowY !== 'visible';
        if (a.tagName === 'TD' || a.tagName === 'TH' || c) {
          box = a;
          clips = c;
          break;
        }
      }
      if (!box) continue;
      const b = box.getBoundingClientRect();
      const bcs = getComputedStyle(box);
      // CSS の zoom・transform で縮めた箱：getComputedStyle の線の太さは縮める前の値なので、箱と同じ倍率にしてから引く
      const z = box.offsetWidth ? b.width / box.offsetWidth : 1;
      const l = b.left + parseFloat(bcs.borderLeftWidth) * z;
      const r = b.right - parseFloat(bcs.borderRightWidth) * z;
      const t = b.top + parseFloat(bcs.borderTopWidth) * z;
      const btm = b.bottom - parseFloat(bcs.borderBottomWidth) * z;
      let dx = 0;
      let dy = 0;
      for (const q of rects) {
        dx = Math.max(dx, l - q.left, q.right - r);
        dy = Math.max(dy, t - q.top, q.bottom - btm);
      }
      // 文字の大きさに対して、どれだけはみ出しているか（字の上下のすき間で少しはみ出すのは数えない）
      const fs = parseFloat(cs.fontSize) * (b.height / (box.offsetHeight || b.height) || 1);
      if (dx > 1 || dy > Math.max(1.5, fs * 0.25)) {
        out.push({text: text.slice(0, 48), box: `${box.tagName.toLowerCase()}${typeof box.className === 'string' && box.className ? '.' + box.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`, w: Math.round(r - l), dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, clips});
      }
    }
  }
  return out;
};

const results = {};
const record = async (name, locator) => {
  const roots = await locator.count();
  const items = roots ? await locator.evaluateAll(MEASURE) : [];
  results[name] = items;
  console.log(`• ${name}（箱 ${roots}）: ${items.length ? items.length + ' 件' : 'なし'}`);
  for (const it of items.slice(0, 12)) console.log('   ', JSON.stringify(it));
};
const shotOf = async (name, locator) => {
  const file = path.join(out, `${tag}-${name}.png`);
  if (locator) await locator.screenshot({path: file}).catch(async () => page.screenshot({path: file, fullPage: true}));
  else await page.screenshot({path: file, fullPage: true});
};

// ---------------- 長い値の様邸をバックアップから入れる（今のデータに足す）
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('navigation').getByRole('button', {name: /設定/}).click();
await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(backup);
await page.getByRole('button', {name: '今のデータに足す（同じものは上書き）'}).click();
await page.waitForTimeout(800);

const ids = ['kanda', 'yukuhashi', 'miyako', 'kouiki'];
for (const ins of ids) {
  const job = `stress-${ins}`;
  // 見積書（画面）
  await page.goto(`${site}/jutaku-mitsumori/index.html#tab=estimate&job=${job}`);
  await page.reload();
  const sheet = page.getByRole('region', {name: '見積書', exact: true});
  await sheet.waitFor();
  await page.waitForTimeout(800);
  await record(`${ins}-見積書`, sheet.locator('.form-page'));
  await shotOf(`${ins}-見積書`, sheet);
  // 見積書の印刷
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
  await page.locator('.print-overlay').waitFor();
  await page.waitForTimeout(800);
  await record(`${ins}-見積書の印刷`, page.locator('.print-overlay .form-page'));
  await shotOf(`${ins}-見積書の印刷`, page.locator('.print-overlay .form-page').first());
  await page.getByRole('button', {name: '✕ 閉じる'}).click();
  // 住宅改修申請書（プレビュー）
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  await page.locator('[aria-label="申請書のプレビュー"]').waitFor();
  await page.waitForTimeout(1500);
  await record(`${ins}-申請書`, page.locator('[aria-label="申請書のプレビュー"]'));
  await shotOf(`${ins}-申請書`, page.locator('[aria-label="申請書のプレビュー"]'));
  // 理由書（プレビュー）
  await page.getByRole('tab', {name: '📄 理由書'}).click();
  await page.locator('[aria-label="理由書のプレビュー"]').waitFor();
  await page.waitForTimeout(1500);
  await record(`${ins}-理由書`, page.locator('[aria-label="理由書のプレビュー"]'));
  await shotOf(`${ins}-理由書`, page.locator('[aria-label="理由書のプレビュー"]'));
  // 発注書（画面・印刷）
  await page.getByRole('tab', {name: '📋 工事見積書'}).click();
  await sheet.waitFor();
  await page.getByRole('button', {name: '🛒 発注書を作成'}).click();
  const list = page.getByRole('region', {name: '発注する部材'});
  await list.waitFor();
  await record(`${ins}-発注書`, page.locator('main'));
  await page.getByRole('button', {name: '🖨 発注書を印刷'}).click();
  await page.locator('.print-overlay').waitFor();
  await page.waitForTimeout(600);
  await record(`${ins}-発注書の印刷`, page.locator('.print-overlay .sheet'));
  await shotOf(`${ins}-発注書の印刷`, page.locator('.print-overlay .sheet').first());
  await page.getByRole('button', {name: '✕ 閉じる'}).click();
}

// ---------------- 請求書（1か月分）・様邸の明細
await page.goto(`${site}/jutaku-mitsumori/index.html#tab=invoice`);
await page.reload();
await page.getByRole('button', {name: '🖨 請求書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
await page.waitForTimeout(600);
await record('請求書の印刷', page.locator('.print-overlay .sheet'));
await shotOf('請求書の印刷', page.locator('.print-overlay .sheet').first());
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await page.getByRole('cell', {name: /美千代子A/}).first().click();
await page.getByRole('button', {name: '🖨 この様邸の明細を印刷'}).click();
await page.locator('.print-overlay').waitFor();
await page.waitForTimeout(600);
await record('様邸の明細の印刷', page.locator('.print-overlay .sheet'));
await shotOf('様邸の明細の印刷', page.locator('.print-overlay .sheet').first());

fs.writeFileSync(path.join(out, `${tag}-results.json`), JSON.stringify(results, null, 1));
console.log(errors.length ? errors.join('\n') : 'errors: なし');
await browser.close();
