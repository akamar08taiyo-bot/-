// 様邸のデータ（携帯で作ったものをパソコンへ送る。jobShare.ts・DocsDialog.tsx・DocImport.tsx）
// （ユーザーの指示「携帯で作成したものを、パソコンに送った場合、パソコンで同様のアプリが入っているため そのまま（申請書、見積もりなど全て）、共有したい。
//  データをあずけるのは一旦保留にしているため、リンクでもいいので共有したい。開くとパソコンの中のアプリで同期させる」2026-10-30）：
//   携帯（iPhone）：様邸（改修の箇所）・写真・特定福祉用具の商品を入れて「✉ メールで送付」で「📲 様邸のデータ」→ 共有メニューに .json と、取り込み方・アプリのリンクの本文
//   パソコン（別の端末＝別の保存場所）：「📥 申請書・見積書・理由書を取り込む」にその .json → 確かめの画面 → 取り込む → 一覧に出て、開くと箇所・写真・特定福祉用具の商品がそのまま
//   もう一度取り込むと、この端末の同じ様邸を置きかえる（この端末の方があとで直していれば、そう出す）
// usage: node e2e-share.mjs <サイトのURL> <出力フォルダ>（サイトは太陽ポータルと同じ形。tokutei/ も要る）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const TK = 'iframe[title="特定福祉用具 購入申請書・見積もり作成"]';

async function context(options) {
  const ctx = await browser.newContext({locale: 'ja-JP', acceptDownloads: true, ...options});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => void d.accept());
  return {ctx, page};
}

// ---------------- 携帯：様邸を作って、様邸のデータを送る
const phone = await context({
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
let p = phone.page;
await p.goto(`${site}/jutaku-mitsumori/index.html`);
await p.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
const form = p.getByRole('form', {name: '申請書'});
await form.waitFor();
await p.keyboard.type('みほん　しちろう');
await p.keyboard.press('Enter');
await p.keyboard.type('見本 七郎');
await p.keyboard.press('Enter');
const works = form.locator('[data-field="works"]');
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '玄関'});
await p.keyboard.type('600');
await p.keyboard.press('Tab');
// 写真を1枚（①玄関の改修前）
const png = Buffer.from(
  await p.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = '#c0392b';
    g.fillRect(0, 0, 800, 600);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  }),
);
const board = p.getByRole('region', {name: '写真'});
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), board.getByRole('button', {name: '📷 写真を選ぶ'}).click()]);
await chooser.setFiles([{name: '玄関.png', mimeType: 'image/png', buffer: png}]);
await board.getByRole('button', {name: '①玄関 改修前', exact: true}).locator('img').waitFor({timeout: 20000});
// 特定福祉用具の商品を1つ
await p.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
const tk = p.frameLocator(TK);
await tk.getByLabel('種目').first().selectOption('歩行補助つえ', {timeout: 30000});
await tk.getByLabel('商品名').last().fill('見本の多点杖');
await p.waitForTimeout(1200);
await p.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await p.getByRole('tab', {name: '📝 住宅改修申請書', selected: true}).waitFor();
await p.waitForTimeout(800);
// 共有メニュー（navigator.share）は開かずに、渡されたものを覚える（.json は中身も）
await p.evaluate(() => {
  navigator.canShare = (d) => !!d && Array.isArray(d.files);
  navigator.share = async (d) => {
    window.__shared = {title: d.title, text: d.text, files: await Promise.all(d.files.map(async (f) => ({name: f.name, type: f.type, text: f.type === 'application/json' ? await f.text() : null})))};
  };
});
await p.getByRole('button', {name: '✉ メールで送付', exact: true}).click();
const mdlg = p.getByRole('dialog', {name: 'メールで送付（Excel）'});
const data = mdlg.getByRole('group', {name: '様邸のデータ'}).getByRole('checkbox');
assert.equal(await data.isChecked(), false); // 初めは付けない
await mdlg.getByRole('group', {name: 'メールに付ける書類'}).getByRole('checkbox', {name: /^住宅改修申請書/}).uncheck();
await data.check();
await p.screenshot({path: path.join(outDir, 'share-1-phone-dialog.png')});
await mdlg.getByRole('button', {name: '✉ 1つ付けてメールを作る'}).click();
await p.waitForFunction(() => window.__shared, null, {timeout: 60000});
const shared = await p.evaluate(() => window.__shared);
assert.equal(shared.title, '見本 七郎様 様邸のデータの送付');
assert.deepEqual(
  shared.files.map((f) => [f.name, f.type]),
  [['見本七郎様_様邸データ.json', 'application/json']],
);
assert.match(shared.text, /「📥 申請書・見積書・理由書を取り込む」に「見本七郎様_様邸データ\.json」を入れると/);
assert.ok(shared.text.includes(`${site}/jutaku-mitsumori/index.html`), shared.text); // アプリのリンク
assert.ok(shared.text.trimEnd().endsWith(`${site}/jutaku-mitsumori/index.html`) && !shared.text.includes('TEL'), shared.text); // 会社・営業所・電話は書かない（データを送る際は不要）
const pkg = JSON.parse(shared.files[0].text);
assert.equal(pkg.kind, 'taiyo-jutaku-job');
assert.equal(pkg.job.customer, '見本 七郎');
assert.equal(pkg.photos.length, 1);
assert.deepEqual(
  pkg.tokutei.items.map((i) => i.name),
  ['見本の多点杖'],
);
log(`携帯：様邸のデータ（写真 ${pkg.photos.length}枚・特定福祉用具 ${pkg.tokutei.items.length}点）を共有メニューへ・本文に取り込み方とリンク OK`);
await phone.ctx.close();

// ---------------- パソコン（別の端末）：取り込む
const pc = await context({viewport: {width: 1366, height: 900}});
p = pc.page;
await p.goto(`${site}/jutaku-mitsumori/index.html`);
await p.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '申請書・見積書・理由書を取り込む'}).waitFor();
const file = {name: '見本七郎様_様邸データ.json', mimeType: 'application/json', buffer: Buffer.from(shared.files[0].text)};
await p.locator('input[aria-label="取り込むファイル"]').setInputFiles([file]);
const idlg = p.getByRole('dialog', {name: '📲 様邸のデータの取り込み'});
await idlg.waitFor();
const card = await idlg.getByRole('region', {name: '見本 七郎様邸のデータ'}).innerText();
assert.match(card, /改修の箇所 1・見積書の行 \d+・写真 1枚・特定福祉用具 1点/);
assert.match(card, /新しく足します/);
await p.screenshot({path: path.join(outDir, 'share-2-pc-import.png')});
await idlg.getByRole('button', {name: '取り込む（1件）'}).click();
await p.locator('[aria-live] > div', {hasText: '見本 七郎様邸を取り込みました（写真 1枚）'}).waitFor({timeout: 60000});
// 一覧に出て、開くと箇所・写真・特定福祉用具の商品がそのまま
const row = p.getByRole('row').filter({has: p.getByRole('cell', {name: '見本 七郎様邸', exact: true})});
await row.waitFor();
await row.getByRole('cell', {name: '見本 七郎様邸', exact: true}).click();
await p.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const pcForm = p.getByRole('form', {name: '申請書'});
await pcForm.waitFor();
assert.equal(await pcForm.locator('[data-field="works"]').getByRole('listitem', {name: '①玄関'}).getByLabel('長さ（mm）').inputValue(), '600');
await p.getByRole('region', {name: '写真'}).getByRole('button', {name: '①玄関 改修前', exact: true}).locator('img').waitFor({timeout: 20000});
await p.screenshot({path: path.join(outDir, 'share-3-pc-job.png')});
await p.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
const pcTk = p.frameLocator(TK);
await pcTk.getByLabel('商品名').first().waitFor({timeout: 30000});
assert.equal(await pcTk.getByLabel('商品名').first().inputValue(), '見本の多点杖');
assert.equal(await pcTk.getByLabel('お客様名').first().inputValue(), '見本 七郎');
log('パソコン：取り込む → 一覧に見本 七郎様邸・開くと箇所・写真・特定福祉用具の商品がそのまま OK');

// ---------------- もう一度取り込む：パソコンで直したあとなら「この端末の方があとで直されています」
await p.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await pcForm.getByLabel('被保険者氏名').fill('見本 七郎（直した）');
await p.waitForTimeout(1200);
await p.getByRole('button', {name: '← 一覧へ戻る'}).click();
await p.getByRole('navigation').getByRole('button', {name: '📝 見積もり・申請書を作成する'}).click();
await p.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '申請書・見積書・理由書を取り込む'}).waitFor();
await p.locator('input[aria-label="取り込むファイル"]').setInputFiles([file]);
await idlg.waitFor();
assert.match(await idlg.innerText(), /この端末の方があとで直されています（.+）。送ったデータで置きかえます/);
await idlg.getByRole('button', {name: '取り込む（1件）'}).click();
await p.locator('[aria-live] > div', {hasText: '見本 七郎様邸を取り込みました'}).waitFor({timeout: 60000});
await p.getByRole('row').filter({has: p.getByRole('cell', {name: '見本 七郎様邸', exact: true})}).waitFor(); // 送ったデータ（直す前の名前）に戻った
assert.equal(await p.getByRole('row').filter({hasText: '見本 七郎（直した）'}).count(), 0);
log('もう一度取り込む：この端末の方があとで直していればそう出す・置きかえる（同じ様邸は1つ）OK');

await browser.close();
console.log('\nERRORS:', errors.length ? errors : 'なし');
if (errors.length) process.exit(1);
