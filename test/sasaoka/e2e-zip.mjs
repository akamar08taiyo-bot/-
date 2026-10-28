// 住所から郵便番号（ユーザーの指示「住所のみ入力した場合、逆に郵便番号を自動で入力される　難しい場合は、無理にする必要はない」2026-10-28）：
//   住宅改修申請書で住所を入れると、郵便番号が空なら住所から1つに決まる番号が入る（大字・郡がなくても）。郵便番号を消したら住所を直すまでそのまま。
//   住所を直すと（郵便番号が空なら）入れ直す。特定福祉用具申請書のタブ（中は特定福祉用具のアプリ）にも同じ郵便番号。住所は架空の番地
// usage: node e2e-zip.mjs <サイトのURL> <出力フォルダ>（サイトは太陽ポータルと同じ形。tokutei がなければ住宅改修だけ確かめる）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
const withTokutei = (await fetch(`${site}/tokutei/index.html`).catch(() => null))?.ok === true;

await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 苅田町', exact: true}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
await page.keyboard.type('みほん　ろくろう');
await page.keyboard.press('Enter');
await page.keyboard.type('見本 六郎');
await page.keyboard.press('Enter');
const zip = form.getByLabel('郵便番号');
const address = form.getByLabel('住所');
assert.equal(await zip.inputValue(), '');

// 住所だけ入れる → 郵便番号が入る（「大字」があっても・郡がなくても）
await address.fill('苅田町大字新津1番地1');
await page.waitForFunction(() => document.querySelector('[aria-label="郵便番号"]')?.value === '800-0344', null, {timeout: 5000});
await page.screenshot({path: path.join(outDir, 'zip-01-shinsei.png')});
log('住所だけ入れる → 郵便番号 800-0344 OK');

// 郵便番号を消したら、住所を直すまでそのまま
await zip.fill('');
await page.waitForTimeout(800);
assert.equal(await zip.inputValue(), '');
// 住所を直すと入れ直す
await address.fill('行橋市中央1-1');
await page.waitForFunction(() => document.querySelector('[aria-label="郵便番号"]')?.value === '824-0005', null, {timeout: 5000});
// 郵便番号が入っていれば、住所を直しても変えない
await address.fill('苅田町大字新津2番地2');
await page.waitForTimeout(800);
assert.equal(await zip.inputValue(), '824-0005');
log('消したらそのまま・住所を直すと入れ直す・入っていれば変えない OK');
await page.waitForTimeout(1200); // 自動保存（0.4秒後）

if (withTokutei) {
  await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
  const tk = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
  const tkZip = tk.getByLabel('郵便番号').first();
  await tkZip.waitFor({timeout: 15000});
  assert.equal(await tkZip.inputValue(), '824-0005');
  log('特定福祉用具申請書のタブにも同じ郵便番号 OK');
}

await browser.close();
if (errors.length) {
  console.log('ERRORS:', errors);
  process.exit(1);
}
console.log('ERRORS: なし');
