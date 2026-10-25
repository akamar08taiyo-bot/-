// 請求書の一覧（☑ したものだけ請求書へ・次月へ）と「📈 売上見込みを確認する」を確かめる
// （ユーザーの指示「請求書を作成する一覧については、シンプルにする。〇〇様邸、（開いてから詳細）☑︎ボックスを作成して、チェックしたものだけ、請求書にのせるようにする」
// 「請求書を作成するの横に、売上見込みを確認するとつくる。開くと住宅改修と特定福祉用具を別々に、その次の売上を集計、確認できるようにする。（税抜、税込）当然印刷も。
// ☑︎して次月に回せるようにもする」2026-10-25）：
//   請求書：〇〇様邸と ☑ だけ・☐ にすると合計と印刷から外れる・☑ で戻る・「次月へ」で次の月の請求書へ
//   売上見込み：住宅改修（見積書のある様邸）と特定福祉用具（特定福祉用具のアプリが書くまとめ。見えない枠で開いて新しくする）を別々に・税抜・税込の合計・
//   ☑ して次月に回す（請求する月・特定福祉用具のデータは変えない）・印刷・受注残・進捗管理へのリンク・スマホの幅
// usage: node e2e-sales.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html・<サイト>/sasaoka/index.html・<サイト>/tokutei/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({ignoreDefaultArgs: ['--hide-scrollbars']});
const errors = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  p.on('dialog', (d) => d.accept());
};
const now = new Date();
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const month = ym(now);
const nextMonth = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));
const yenOf = (t) => Number(t.replace(/[^\d]/g, ''));

// 見本の様邸（名前・番号は見本だけ）。見本一・見本二は請求書に入れる、見本三は見積書はあるが請求書に入れない（☐）
const job = (id, customer, i, shikiri) => ({
  id,
  month,
  customer,
  suffix: '様邸',
  staff: '',
  date: '',
  estDate: `${month}-0${i}`,
  address: '',
  note: '',
  insuredNo: '0000000000',
  insurer: 'yukuhashi',
  form: 'yukuhashi',
  overhead: null,
  overheadTarget: null,
  shikiri,
  places: [
    {
      id: `${id}-p`,
      name: '玄関',
      kind: 1,
      photo: 0,
      rows: [{id: `${id}-r`, kind: 'material', refId: null, name: '見本の手すり', code: 'S-0000', maker: '見本', unit: '本', price: 1000 * i, qty: 1, listPrice: 2000 * i}],
    },
  ],
  createdAt: i,
  updatedAt: i,
});
const JOBS = [job('j1', '見本一', 1, true), job('j2', '見本二', 2, true), job('j3', '見本三', 3, false)];
// 特定福祉用具のアプリの案件（見本）：定価 10,000円の2割引き×1（税抜 8,000円・税込 8,800円）。納品日がこの月
const SALE = {
  id: 's-mihon',
  customer: '見本 花子',
  staff: '久保 匠史',
  insurer: 'yukuhashi',
  burdenRatio: 1,
  payMethod: '受領委任払い',
  status: '納品',
  deliveryDate: `${month}-05`,
  items: [{id: 'i1', productId: null, name: '見本のシャワーチェア', maker: '見本', code: 'M-0000', tais: '', category: '入浴補助用具', sub: '', unit: '台', supplier: '', taxType: '10%', listPrice: 10000, cost: 0, qty: 1, discountRate: 20, unitPrice: null, reason: ''}],
  createdAt: 1,
  updatedAt: 1,
};
const seed = (page) =>
  page.evaluate(
    ({jobs, sale}) =>
      Promise.all(
        [
          ['taiyo-sasaoka-shikiri', 'jobs', jobs],
          ['taiyo-tokutei', 'sales', [sale]],
        ].map(
          ([db, key, value]) =>
            new Promise((resolve) => {
              const req = indexedDB.open(db, 1);
              req.onupgradeneeded = () => req.result.createObjectStore('kv');
              req.onsuccess = () => {
                const tx = req.result.transaction('kv', 'readwrite');
                tx.objectStore('kv').put(value, key);
                tx.objectStore('kv').put('seed-' + Date.now(), 'stamp:' + key);
                tx.oncomplete = () => {
                  req.result.close();
                  resolve(null);
                };
              };
            }),
        ),
      ),
    {jobs: JOBS, sale: SALE},
  );
const noOverflow = async (page, what) => {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw <= cw, `${what}：横にはみ出している（${sw} > ${cw}）`);
};

const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
// 本番の通信はしない（同じサイトの中だけ）
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
const page = await ctx.newPage();
watch(page, '請求書');
await page.goto(`${site}/sasaoka/index.html`);
await page.getByRole('navigation').waitFor();
await seed(page);
await page.reload();
const nav = page.getByRole('navigation');
const main = page.locator('main');
const nameCell = (name) => page.getByRole('cell', {name, exact: true});
const box = (name) => page.getByRole('checkbox', {name: `${name}を請求書に入れる`});
const footer = () => main.getByText(/^ご請求金額（税込）/).innerText();
const checkedCount = () => main.locator('tbody input[type=checkbox]:checked').count();

// ---------------- 請求書の一覧：〇〇様邸と ☑ だけ（☐ の見本三も出す）
await nameCell('見本一様邸').waitFor();
const heads = (await main.locator('thead th').allInnerTexts()).map((t) => t.trim());
assert.deepEqual(heads, ['請求書', 'No.', 'お客様名', '金額（税抜）', '']);
assert.equal(await main.locator('tbody tr').count(), 3);
assert.equal(await box('見本一様邸').isChecked(), true);
assert.equal(await box('見本二様邸').isChecked(), true);
assert.equal(await box('見本三様邸').isChecked(), false);
const f1 = await footer();
assert.equal(await checkedCount(), 2);
// 一覧の下はご請求金額だけ（件数・税抜合計・消費税と説明は出さない。ユーザーの指示「上記の説明の部分は不要になります」2026-10-26）
assert.equal(await main.getByText(/請求書に入れる \d+件|税抜合計|消費税 [\d,]+円|すべての様邸の合計に消費税率|様邸ごとの消費税の合計/).count(), 0);
await page.screenshot({path: path.join(outDir, 'sales-01-invoice-list.png'), fullPage: true});

// ☐ にすると合計と印刷から外れる。☑ で戻る
const total = (t) => yenOf(/ご請求金額（税込） ([\d,]+)円/.exec(t)[1]);
await box('見本二様邸').uncheck();
await page.waitForFunction(() => document.querySelectorAll('main tbody input[type=checkbox]:checked').length === 1);
const f2 = await footer();
assert.ok(total(f2) < total(f1), `☐ にしても合計が減らない：${f1} → ${f2}`);
await box('見本三様邸').check();
await page.waitForFunction(() => document.querySelectorAll('main tbody input[type=checkbox]:checked').length === 2);
await page.getByRole('button', {name: '🖨 請求書を印刷'}).click();
const printed = await page.locator('.print-root').innerText();
assert.ok(printed.includes('見本一') && printed.includes('見本三') && !printed.includes('見本二'), '請求書の印刷に ☑ の様邸だけが出ていない');
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await box('見本二様邸').check();
log('請求書の一覧：〇〇様邸と ☑・☐ で合計と印刷から外れる・☑ で戻るOK');

// 様邸の名前を押すと様邸の画面（詳細）
await nameCell('見本一様邸').click();
await page.getByRole('heading', {level: 1, name: '見本一様邸'}).waitFor();
await nav.getByRole('button', {name: /請求書を確認する/}).click();
await nameCell('見本一様邸').waitFor();

// 「次月へ」→ 次の月の請求書に（☑ のまま）
await page.getByRole('button', {name: '見本一様邸を次月に回す'}).click();
await nameCell('見本一様邸').waitFor({state: 'detached'});
await page.getByRole('button', {name: '次の月'}).click();
await nameCell('見本一様邸').waitFor();
assert.equal(await box('見本一様邸').isChecked(), true);
await page.getByRole('button', {name: '前の月'}).click();
await nameCell('見本二様邸').waitFor();
log('「次月へ」で次の月の請求書へOK');

// ---------------- 売上見込み：住宅改修と特定福祉用具を別々に
await nav.getByRole('button', {name: '📈 売上見込みを確認する'}).click();
const jutaku = page.getByRole('region', {name: '住宅改修', exact: true});
const tokutei = page.getByRole('region', {name: '特定福祉用具', exact: true});
await jutaku.getByRole('button', {name: /見本二様邸/}).waitFor();
// 特定福祉用具のまとめは、見えない枠で開いた特定福祉用具のアプリが書く（storage のできごとで読み直す）
await tokutei.getByRole('button', {name: /見本 花子様/}).waitFor({timeout: 20000});
const names = (region) => region.locator('li button').evaluateAll((els) => els.map((e) => e.firstChild?.textContent?.trim() ?? '')); // 名前（うしろの状態・担当を除く）
assert.deepEqual(await names(jutaku), ['見本三様邸', '見本二様邸'].sort((a, b) => a.localeCompare(b, 'ja'))); // 見本一は次の月に回した
assert.deepEqual(await names(tokutei), ['見本 花子様']);
assert.match(await tokutei.locator('li').innerText(), /納品/);
const tokuText = await tokutei.innerText();
assert.match(tokuText, /税抜 8,000円/);
assert.match(tokuText, /税込 8,800円/);
// 合計＝住宅改修＋特定福祉用具（税込・税抜とも）
const sums = page.getByRole('region', {name: '合計', exact: true});
const cards = await sums.locator(':scope > div').allInnerTexts();
const inc = cards.map((t) => yenOf(/税込 ([\d,]+)円/.exec(t)[1]));
const exc = cards.map((t) => yenOf(/税抜 ([\d,]+)円/.exec(t)[1]));
assert.equal(inc[2], inc[0] + inc[1]);
assert.equal(exc[2], exc[0] + exc[1]);
assert.equal(inc[1], 8800);
assert.match(cards[0], /住宅改修（2件）/);
assert.match(cards[2], /合計（3件）/);
// 住宅改修の行の金額を足すと住宅改修の合計
const rowInc = (await jutaku.locator('li').allInnerTexts()).map((t) => yenOf(/税込 ([\d,]+)円/.exec(t)[1]));
assert.equal(rowInc.reduce((a, b) => a + b, 0), inc[0]);
assert.equal(await page.getByRole('link', {name: '📊 受注残・進捗管理を開く'}).getAttribute('href'), 'https://akamar08taiyo-bot.github.io/solar-silver-progress-app/');
await page.screenshot({path: path.join(outDir, 'sales-02-plan-1366.png'), fullPage: true});
await noOverflow(page, '売上見込み');
log('売上見込み：住宅改修と特定福祉用具を別々に・税抜・税込の合計・受注残へのリンクOK');

// 印刷
await page.getByRole('button', {name: '🖨 印刷'}).click();
const planPrint = await page.locator('.print-root').innerText();
for (const s of ['売上見込み', '住宅改修', '特定福祉用具', '見本二', '見本三', '見本 花子', '8,800']) assert.ok(planPrint.includes(s), `売上見込みの印刷に「${s}」がない`);
assert.ok(!planPrint.includes('見本一'), '次の月に回した見本一が印刷に出ている');
await page.screenshot({path: path.join(outDir, 'sales-03-plan-print.png'), fullPage: true});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('売上見込みの印刷OK');

// ☑ して次月に回す（見本二・見本 花子）→ この月から消え、次の月に出る。請求する月は変えない
const moveBtn = page.getByRole('button', {name: /☑ したものを次月に回す/});
assert.equal(await moveBtn.isDisabled(), true);
await page.getByRole('checkbox', {name: '見本二様邸を選ぶ'}).check();
await page.getByRole('checkbox', {name: '見本 花子様を選ぶ'}).check();
assert.match(await moveBtn.innerText(), /（2件）/);
await moveBtn.click();
await jutaku.getByRole('button', {name: /見本二様邸/}).waitFor({state: 'detached'});
await tokutei.getByRole('button', {name: /見本 花子様/}).waitFor({state: 'detached'});
assert.deepEqual(await names(jutaku), ['見本三様邸']);
await page.getByRole('button', {name: '次の月'}).click();
await tokutei.getByRole('button', {name: /見本 花子様/}).waitFor();
assert.deepEqual(await names(jutaku), ['見本一様邸', '見本二様邸']);
log('☑ して次月に回すOK');

// 読み直しても残る（住宅改修は様邸に、特定福祉用具はこのアプリの設定に覚える）
await page.waitForTimeout(1200);
await page.reload();
await nav.getByRole('button', {name: '📈 売上見込みを確認する'}).click();
await page.getByRole('button', {name: '次の月'}).click();
await jutaku.getByRole('button', {name: /見本二様邸/}).waitFor();
await tokutei.getByRole('button', {name: /見本 花子様/}).waitFor({timeout: 20000});
// 請求する月は変わらない（見本二は今月の請求書のまま）
await nav.getByRole('button', {name: /請求書を確認する/}).click();
await nameCell('見本二様邸').waitFor();
log('読み直しても次月に回したまま・請求する月は変わらないOK');

// 特定福祉用具の行を押すと、特定福祉用具のアプリでその案件を開く（新しいタブ）
await nav.getByRole('button', {name: '📈 売上見込みを確認する'}).click(); // 売上見込みの月は次の月のまま
const [popup] = await Promise.all([ctx.waitForEvent('page'), tokutei.getByRole('button', {name: /見本 花子様/}).click()]);
watch(popup, '特定福祉用具');
await popup.waitForLoadState();
assert.match(popup.url(), /tokutei\/index\.html#tab=sales&sale=s-mihon/);
await popup.getByText('見本 花子').first().waitFor();
await popup.close();
log('特定福祉用具の行から特定福祉用具のアプリを開くOK');

// ---------------- スマホの幅
const phone = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, locale: 'ja-JP', hasTouch: true, isMobile: true});
await phone.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
await phone.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
const sp = await phone.newPage();
watch(sp, 'スマホ');
await sp.goto(`${site}/sasaoka/index.html`);
await sp.getByRole('navigation').waitFor();
await seed(sp);
await sp.reload();
await sp.getByRole('cell', {name: '見本二様邸', exact: true}).waitFor();
await noOverflow(sp, 'スマホ 請求書の一覧');
await sp.screenshot({path: path.join(outDir, 'sales-04-invoice-390.png'), fullPage: true});
await sp.getByRole('navigation').getByRole('button', {name: '📈 売上見込みを確認する'}).click();
await sp.getByRole('region', {name: '特定福祉用具', exact: true}).getByRole('button', {name: /見本 花子様/}).waitFor({timeout: 20000});
// 名前は1行（金額は次の行へ回る）
for (const h of await sp.locator('section li button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) assert.ok(h < 30, `名前が折り返している（高さ ${h}）`);
await noOverflow(sp, 'スマホ 売上見込み');
await sp.screenshot({path: path.join(outDir, 'sales-05-plan-390.png'), fullPage: true});
log('スマホの幅（横にはみ出さない）OK');

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ERRORS: なし');
if (errors.length) process.exit(1);
