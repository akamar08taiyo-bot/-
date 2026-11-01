// 常時同期（cloud/。ユーザーの指示「常時同期させる」「受注残管理アプリみたいに、常時同期させる」2026-11-01）：
//   パソコン：様邸（改修の箇所・写真・特定福祉用具の商品）を作ってから、設定のタブの「☁ スマホ・パソコンの同期」で合言葉を入れて始める（クラウドは空と出る）
//   スマホ（別の端末）：同じ合言葉で始める（クラウドに様邸1件と出る）→ 一覧に様邸が入り、開くと箇所・写真・特定福祉用具の商品がそのまま
//   スマホで直す → パソコンの画面に、読み直さなくても入る。パソコンで新しい様邸 → スマホに入る
//   クラウドの中身は暗号だけ（お客様名が見えない）。ちがう合言葉の端末には何も入らない。同期をやめても、この端末のデータは消えない
// にせの Firebase（fakeFirebase.mjs）を使い、本物の Firebase にはつながない
// usage: node e2e-cloud.mjs <サイトのURL> <出力フォルダ>（サイトは太陽ポータルと同じ形。tokutei/ も要る）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
import {fakeCloud, useFakeFirebase} from './fakeFirebase.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const TK = 'iframe[title="特定福祉用具 購入申請書・見積もり作成"]';
const PASS = 'みほんの合言葉2026';
const cloud = fakeCloud();

async function context(options, tryCloud = true) {
  const ctx = await browser.newContext({locale: 'ja-JP', acceptDownloads: true, ...options});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await useFakeFirebase(ctx, cloud);
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  // 常時同期は保留中（useCloud.ts の CLOUD_ON）。このテストは試しの印（CLOUD_TRY）を付けて動かす
  if (tryCloud) await ctx.addInitScript(() => localStorage.setItem('taiyo-jutaku-cloud-try', '1'));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => void d.accept());
  return {ctx, page};
}

/** 上のタブ（見積もり・申請書を作成する・設定など。ボタン） */
const goTab = async (p, name) => {
  const b = p.getByRole('navigation').getByRole('button', {name});
  await b.click();
  await p
    .getByRole('navigation')
    .locator('button[aria-current="page"]', {hasText: name.replace(/^\S+ /, '')})
    .waitFor();
};

/** 見積もり・申請書を作成するの「📋 見積書の一覧を開く」 */
async function openList(p) {
  await goTab(p, '📝 見積もり・申請書を作成する');
  const open = p.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '📋 見積書の一覧を開く'});
  if (await open.count()) await open.click();
}

/** 設定のタブで合言葉を入れて始める。確かめの画面の文を返す */
async function startSync(p, pass = PASS) {
  await goTab(p, '⚙ 設定');
  const sec = p.getByRole('region', {name: 'スマホ・パソコンの同期'});
  await sec.getByLabel('合言葉').fill(pass);
  await sec.getByRole('button', {name: '☁ 同期を始める'}).click();
  const dlg = p.getByRole('dialog', {name: '同期を始める'});
  await dlg.waitFor({timeout: 30000});
  const text = await dlg.innerText();
  await dlg.getByRole('button', {name: '同期を始める'}).click();
  await dlg.waitFor({state: 'detached'});
  await p.locator('[data-cloud="idle"]').waitFor({timeout: 30000});
  return text;
}

// ---------------- 保留中：試しの印のない端末には、設定の同期の欄も上の段の印も出ず、クラウドにもつながない
{
  const plain = await context({viewport: {width: 1366, height: 900}}, false);
  const reqs = [];
  plain.page.on('request', (r) => /gstatic\.com\/firebasejs|fake-firestore/.test(r.url()) && reqs.push(r.url()));
  await plain.page.goto(`${site}/jutaku-mitsumori/index.html`);
  await goTab(plain.page, '⚙ 設定');
  await plain.page.getByRole('heading', {name: '請求先'}).first().waitFor();
  assert.equal(await plain.page.getByRole('region', {name: 'スマホ・パソコンの同期'}).count(), 0, '保留中は同期の欄を出さない');
  assert.equal(await plain.page.locator('[data-cloud]').count(), 0, '保留中は上の段の印を出さない');
  await plain.page.waitForTimeout(1000);
  assert.deepEqual(reqs, [], '保留中はクラウドにつながない');
  await plain.page.screenshot({path: path.join(outDir, 'cloud-hold-settings.png')});
  await plain.ctx.close();
  log('保留中：同期の欄・印なし、クラウドにつながない');
}

// ---------------- パソコン：様邸を作ってから同期を始める
const pc = await context({viewport: {width: 1366, height: 900}});
let p = pc.page;
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
const png = Buffer.from(
  await p.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 600;
    const g = c.getContext('2d');
    g.fillStyle = '#2e86c1';
    g.fillRect(0, 0, 800, 600);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  }),
);
const board = p.getByRole('region', {name: '写真'});
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), board.getByRole('button', {name: '📷 写真を選ぶ'}).click()]);
await chooser.setFiles([{name: '玄関.png', mimeType: 'image/png', buffer: png}]);
await board.getByRole('button', {name: '①玄関 改修前', exact: true}).locator('img').waitFor({timeout: 20000});
await p.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
const tk = p.frameLocator(TK);
await tk.getByLabel('種目').first().selectOption('歩行補助つえ', {timeout: 30000});
await tk.getByLabel('商品名').last().fill('見本の多点杖');
await p.waitForTimeout(1200);
await p.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await p.getByRole('tab', {name: '📝 住宅改修申請書', selected: true}).waitFor();
await p.waitForTimeout(800);
// 同期していない端末は、上の段に ☁ を出さない・クラウドに何も送らない
assert.equal(await p.locator('[data-cloud]').count(), 0);
assert.equal(cloud.docs.size, 0);
const first = await startSync(p);
assert.match(first, /まだ空です/);
assert.match(first, /様邸 1 件/);
await p.screenshot({path: path.join(outDir, 'cloud-1-pc-settings.png')});
// クラウドに様邸・特定福祉用具の案件・まとまり・写真。中身は暗号（お客様名・商品名が見えない）
for (let i = 0; i < 40 && ![...cloud.docs.keys()].some((k) => k.includes('/photos/')); i++) await p.waitForTimeout(250);
const paths = [...cloud.docs.keys()];
const where = (c) => paths.filter((k) => new RegExp(`/public/data/${c}/`).test(k)).length;
assert.equal(where('jobs'), 1, paths.join('\n'));
assert.equal(where('sales'), 1);
assert.ok(where('keys') >= 2, paths.join('\n')); // 保存したことのあるまとまり（初めの部材リストなど、まだ保存していないものはどの端末も同じ）
assert.equal(where('photos'), 1);
assert.ok(
  paths.every((k) => /^artifacts\/taiyo-jutaku-[0-9a-f]{32}\/public\/data\//.test(k)),
  '置き場所は artifacts/<合言葉から作った名前>/public/data/',
);
const dump = JSON.stringify([...cloud.docs.values()]);
for (const t of ['見本', '七郎', 'ミホン', '多点杖', '玄関']) assert.ok(!dump.includes(t), `クラウドに「${t}」が見える`);
log('パソコン：同期を始める（クラウドは空）→ 様邸・特定福祉用具・まとまり・写真を暗号にして送る OK');

// ---------------- スマホ：同じ合言葉で始める → 様邸・写真・特定福祉用具が入る
const phone = await context({
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const s = phone.page;
await s.goto(`${site}/jutaku-mitsumori/index.html`);
await s.getByRole('region', {name: '新規作成'}).waitFor();
const second = await startSync(s);
assert.match(second, /クラウドに様邸が 1 件/);
await s.screenshot({path: path.join(outDir, 'cloud-2-phone-settings.png')});
await openList(s);
const sRow = s.getByRole('row').filter({has: s.getByRole('cell', {name: '見本 七郎様邸', exact: true})});
await sRow.waitFor({timeout: 30000});
await sRow.getByRole('cell', {name: '見本 七郎様邸', exact: true}).click();
await s.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const sForm = s.getByRole('form', {name: '申請書'});
await sForm.waitFor();
assert.equal(await sForm.locator('[data-field="works"]').getByRole('listitem', {name: '①玄関'}).getByLabel('長さ（mm）').inputValue(), '600');
await s.getByRole('region', {name: '写真'}).getByRole('button', {name: '①玄関 改修前', exact: true}).locator('img').waitFor({timeout: 30000});
await s.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
const sTk = s.frameLocator(TK);
await sTk.getByLabel('商品名').first().waitFor({timeout: 30000});
assert.equal(await sTk.getByLabel('商品名').first().inputValue(), '見本の多点杖');
await s.screenshot({path: path.join(outDir, 'cloud-3-phone-job.png')});
log('スマホ：同じ合言葉で始める（クラウドに様邸1件）→ 様邸・箇所・写真・特定福祉用具の商品がそのまま入る OK');

// ---------------- スマホで直す → パソコンの画面に読み直さずに入る（パソコンは様邸の申請書を開いたまま）
await goTab(p, '📝 見積もり・申請書を作成する');
await p.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await p.getByRole('form', {name: '申請書'}).getByLabel('被保険者氏名').waitFor();
await s.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await s.getByRole('tab', {name: '📝 住宅改修申請書', selected: true}).waitFor();
await sForm.getByLabel('被保険者氏名').fill('見本 七郎（スマホで直した）');
await sForm.getByLabel('被保険者氏名').press('Tab');
const pcName = p.getByRole('form', {name: '申請書'}).getByLabel('被保険者氏名');
for (let i = 0; i < 120 && (await pcName.inputValue()) !== '見本 七郎（スマホで直した）'; i++) await p.waitForTimeout(250);
assert.equal(await pcName.inputValue(), '見本 七郎（スマホで直した）');
log('スマホで直す → パソコンの画面に読み直さなくても入る OK');

// ---------------- パソコンで新しい様邸 → スマホの一覧に入る
await goTab(p, '📝 見積もり・申請書を作成する');
await p.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
await p.getByRole('form', {name: '申請書'}).waitFor();
await p.keyboard.type('みほん　はちろう');
await p.keyboard.press('Enter');
await p.keyboard.type('見本 八郎');
await p.keyboard.press('Enter');
await p.waitForTimeout(600);
await openList(s);
await s
  .getByRole('row')
  .filter({has: s.getByRole('cell', {name: '見本 八郎様邸', exact: true})})
  .waitFor({timeout: 30000});
assert.match(await s.locator('[data-cloud]').innerText(), /☁ 同期済み/);
await s.screenshot({path: path.join(outDir, 'cloud-4-phone-list.png')});
log('パソコンで新しい様邸 → スマホの一覧に入る OK');

// ---------------- ちがう合言葉の端末には入らない。同期をやめても、この端末のデータは消えない
const other = await context({viewport: {width: 1280, height: 860}});
const o = other.page;
await o.goto(`${site}/jutaku-mitsumori/index.html`);
await o.getByRole('region', {name: '新規作成'}).waitFor();
const third = await startSync(o, 'ちがう合言葉ですよ');
assert.match(third, /まだ空です/);
await openList(o);
await o.waitForTimeout(1500);
assert.equal(await o.getByRole('cell', {name: '見本 七郎様邸', exact: true}).count(), 0);
await goTab(s, '⚙ 設定');
const sec = s.getByRole('region', {name: 'スマホ・パソコンの同期'});
await sec.getByRole('button', {name: 'この端末の同期をやめる'}).click();
await s.getByRole('dialog', {name: 'この端末の同期をやめますか？'}).getByRole('button', {name: '同期をやめる'}).click();
await sec.getByLabel('合言葉').waitFor();
assert.equal(await s.locator('[data-cloud]').count(), 0);
await openList(s);
await s
  .getByRole('row')
  .filter({has: s.getByRole('cell', {name: '見本 八郎様邸', exact: true})})
  .waitFor();
log('ちがう合言葉の端末には入らない・同期をやめてもこの端末のデータは残る OK');

await browser.close();
console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nERRORS: なし');
if (errors.length) process.exit(1);
