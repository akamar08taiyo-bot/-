// 保存と仕切り表の取り込みを確かめる：
//   ① IndexedDB に書けない（空き容量がないなど）ときは「保存しました」にせず警告を出す。変更は残しておき、書けるようになったら保存する
//      （前は localStorage に書いて保存したことにしていたが、開き直すと IndexedDB の前のデータを読むので直したところが消えていた）
//   ② この版の知らない項目（新しい版が足した項目）は、この版のタブで直して保存しても消さない
//   ③ 仕切り表の取り込みで「別のファイルにする」と、前のファイルから推測したメーカー名は推測し直す（手で打ったメーカー名はそのまま）
// usage: node e2e-data.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html と <サイト>/sasaoka/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';

const [site] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const errors = [];
const open = async (url) => {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('dialog', (d) => d.accept());
  await page.goto(url);
  return {ctx, page};
};
const status = (page) => page.locator('header').innerText();

// ---------------- ① IndexedDB に書けないとき
{
  const {ctx, page} = await open(`${site}/jutaku-mitsumori/index.html#tab=settings`);
  await page.waitForSelector('text=自社の情報');
  const field = () => page.locator('label', {hasText: '会社名'}).locator('input');
  await field().fill('はじめの会社名');
  await page.waitForTimeout(1000);
  assert.match(await status(page), /この端末に自動保存しました/);
  // 空き容量がいっぱいのときのように、設定を書くトランザクションが中断される
  await page.evaluate(() => {
    const orig = IDBObjectStore.prototype.put;
    window.__full = true;
    IDBObjectStore.prototype.put = function (v, k) {
      if (window.__full && (k === 'settings' || k === 'stamp:settings')) {
        try {
          this.transaction.abort();
        } catch {
          /* 中断したあと */
        }
        return null;
      }
      return orig.call(this, v, k);
    };
  });
  await field().fill('直した会社名');
  await page.waitForTimeout(1200);
  const s = await status(page);
  assert.match(s, /保存できませんでした/, s);
  assert.doesNotMatch(s, /自動保存しました/, s);
  assert.notEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sasaoka-app:settings') || 'null')?.company), '直した会社名');
  // 書けるようになったら（ほかの画面に移る・閉じるとき、次に打ったとき）残しておいた変更を保存する
  await page.evaluate(() => {
    window.__full = false;
    window.dispatchEvent(new Event('blur'));
  });
  await page.waitForTimeout(800);
  assert.match(await status(page), /この端末に自動保存しました/);
  await page.reload();
  await page.waitForSelector('text=自社の情報');
  assert.equal(await field().inputValue(), '直した会社名');
  await ctx.close();
  log('IndexedDB に書けないときは「保存できませんでした」と出し、書けるようになったら保存するOK');
}

// ---------------- ② 新しい版が足した項目を消さない
{
  const {ctx, page} = await open(`${site}/sasaoka/index.html`);
  await page.getByRole('button', {name: /サンプルで試す/}).click();
  await page.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).waitFor();
  await page.waitForTimeout(800);
  // 新しい版のタブ（同じ端末のほかのタブ）が、この版の知らない項目を保存したとする
  const raw = await ctx.newPage();
  await raw.goto(`${site}/sasaoka/version.json`);
  const readJobs = () =>
    raw.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('taiyo-sasaoka-shikiri', 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction('kv');
      const jobs = tx.objectStore('kv').get('jobs');
      const stamp = tx.objectStore('kv').get('stamp:jobs');
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
      return {jobs: jobs.result, stamp: stamp.result};
    });
  const injected = await raw.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('taiyo-sasaoka-shikiri', 1);
      r.onsuccess = () => res(r.result);
    });
    const jobs = await new Promise((res) => {
      const g = db.transaction('kv').objectStore('kv').get('jobs');
      g.onsuccess = () => res(g.result);
    });
    jobs[0].futureField = '新しい版で入れた値';
    jobs[0].shinsei = {...jobs[0].shinsei, futureShinsei: '新しい版の申請書の値'};
    jobs[0].places[0].futureNote = '新しい版の箇所の値';
    jobs[0].places[0].rows[0].futureRow = '新しい版の行の値';
    const stamp = 'newer-' + Date.now();
    await new Promise((res) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(jobs, 'jobs');
      tx.objectStore('kv').put(stamp, 'stamp:jobs');
      tx.oncomplete = res;
    });
    db.close();
    new BroadcastChannel('taiyo-sasaoka-shikiri').postMessage({from: 'newer-tab', key: 'jobs', stamp});
    return stamp;
  });
  await page.waitForTimeout(500);
  // この版のタブで同じ様邸を直す
  await page.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).click();
  await page.getByRole('button', {name: 'タイルの数量を1増やす'}).click();
  await page.waitForTimeout(1200);
  const {jobs, stamp} = await readJobs();
  assert.notEqual(stamp, injected, 'この版のタブが保存していない');
  const j = jobs[0];
  assert.deepEqual(
    [j.futureField, j.shinsei?.futureShinsei, j.places[0].futureNote, j.places[0].rows[0].futureRow],
    ['新しい版で入れた値', '新しい版の申請書の値', '新しい版の箇所の値', '新しい版の行の値'],
  );
  await ctx.close();
  log('この版の知らない項目は、この版のタブで直して保存しても消えないOK');
}

// ---------------- ③ 別のファイルにしたらメーカー名を推測し直す
{
  const {ctx, page} = await open(`${site}/jutaku-mitsumori/index.html#tab=master`);
  await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
  const dlg = page.getByRole('dialog');
  const makerField = dlg.getByPlaceholder('例：マツ六');
  const paste = async (text) => {
    await dlg.locator('textarea').fill(text);
    await dlg.getByRole('button', {name: '貼り付けた表を読み取る'}).click();
  };
  const MATSU = 'マツ六 価格表\n品番\t商品名\t定価\t仕切価格\nBD-134\t手すり 丸棒 4000mm\t12,000\t6,000\n';
  const TOTO = 'TOTO 仕切価格表\n品番\t商品名\t定価\t仕切価格\nYHB601\t手すり I型 600mm\t9,000\t4,000\n';
  await paste(MATSU);
  assert.equal(await makerField.inputValue(), 'マツ六');
  await dlg.getByRole('button', {name: '別のファイルにする'}).click();
  await paste(TOTO);
  assert.equal(await makerField.inputValue(), 'TOTO');
  assert.match(await dlg.locator('tbody tr').first().innerText(), /TOTO/);
  // 手で打ったメーカー名は、別のファイルにしてもそのまま
  await makerField.fill('川口技研');
  await dlg.getByRole('button', {name: '別のファイルにする'}).click();
  await paste(MATSU);
  assert.equal(await makerField.inputValue(), '川口技研');
  await ctx.close();
  log('別のファイルにすると推測したメーカー名は推測し直し、手で打ったメーカー名はそのままOK');
}

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
