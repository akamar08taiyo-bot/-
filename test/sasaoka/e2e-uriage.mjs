// 売上伝票発行依頼書を通しで確かめる：工事見積書のタブの上の段の「🧾 売上伝票依頼書」→ 足りない所（負担割合・介護度・新規／既存）を窓で入れる →
// 「🧾 売上伝票発行依頼書を開く」→ 新しいタブで売上伝票のアプリが「住宅改修工事」1行（見積書の合計・仕切り計算表の合計）の入った状態で開く。生活保護も。
// ユーザーと決めたこと（2026-10-27）：見積書のタブの上の段・住宅改修は工事1行・生活保護にチェックしたら自己負担は出さない。
// usage: node e2e-uriage.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html）に、売上伝票（akamar08taiyo-bot/taiyo-uriage-denpyo の npm run build の dist）を
//   <サイト>/taiyo-uriage-denpyo/ に置く。売上伝票の見た目も見たいときは TW_CSS に手元で作った Tailwind の CSS（売上伝票は CDN の Tailwind を使う）
// Playwright は PLAYWRIGHT（既定はクラウド環境の場所）。お客様・担当者はサンプル（架空）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync} from 'node:fs';

const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
const tw = process.env.TW_CSS ? readFileSync(process.env.TW_CSS, 'utf8') : '';
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  for (const viewport of [
    {width: 1366, height: 900},
    {width: 390, height: 844},
  ]) {
    const phone = viewport.width < 500;
    const tag = phone ? 'sp' : 'pc';
    const ctx = await browser.newContext({viewport, deviceScaleFactor: phone ? 2 : 1, locale: 'ja-JP'});
    await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
    await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
      if (tw && /^https:\/\/cdn\.tailwindcss\.com/.test(route.request().url())) {
        return route.fulfill({status: 200, contentType: 'text/javascript', body: `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(tw)}; document.head.appendChild(s); })();`});
      }
      return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(`${site}/jutaku-mitsumori/index.html`);
    await page.getByRole('button', {name: /サンプルで試す/}).click();
    await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
    const estimateTab = page.getByRole('tab', {name: /工事見積書/});
    if ((await estimateTab.getAttribute('aria-selected')) !== 'true') await estimateTab.click();
    await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).waitFor();
    // 住所（見積書の工事場所）・居宅とケアマネ（理由書の作成者）も入れておく（伝票に全部入るか確かめる）
    const sheet = page.getByRole('region', {name: '見積書', exact: true});
    await sheet.locator('[data-edit="job:address"]').click();
    await page.keyboard.type('福岡県行橋市中央1-1');
    await page.keyboard.press('Enter');
    await page.getByRole('tab', {name: /理由書/}).click();
    await page.getByLabel('作成者の所属事業所').fill('見本居宅介護支援事業所');
    await page.getByLabel('作成者の氏名').fill('見本 太郎');
    await page.getByRole('tab', {name: /工事見積書/}).click();
    await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).waitFor();

    // 上の段：まん中のかたまり（保存・Excel・印刷）のすぐ右の、右のかたまりの先頭（まん中は上のタブのまん中にそろえるので、幅を変えない）
    const order = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '🧾 売上伝票依頼書');
      return {right: [...b.parentElement.children].map((x) => x.textContent.trim()), before: [...b.parentElement.previousElementSibling.querySelectorAll('button')].map((x) => x.textContent.trim()).at(-1)};
    });
    assert.equal(order.right[0], '🧾 売上伝票依頼書', order.right.join(' / '));
    assert.equal(order.before, '🖨 見積書を印刷');

    await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('まだ入っていません：負担割合・介護度・新規・既存').waitFor();
    assert.equal(await dialog.getByRole('button', {name: '🧾 売上伝票発行依頼書を開く'}).isDisabled(), true);
    // サンプル：見積書の合計 26,950円（e2e-estimate.mjs）
    const detail = await dialog.getByRole('group', {name: '売上伝票に入れる内容'}).innerText();
    assert.match(detail, /住宅改修工事 26,950円（税込）・仕切り ([\d,]+)円/);
    const cost = Number(/仕切り ([\d,]+)円/.exec(detail)[1].replace(/,/g, ''));
    await page.screenshot({path: `${outDir}/uriage-01-dialog-missing-${tag}.png`});
    await dialog.getByRole('group', {name: '伝票の負担割合'}).getByRole('button', {name: '1割'}).click();
    await dialog.getByLabel('伝票の介護度').selectOption('要介護1');
    await dialog.getByRole('group', {name: '伝票の顧客区分'}).getByRole('button', {name: '既存'}).click();
    await dialog.getByText('利用者負担（1割）2,695円').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
    await page.screenshot({path: `${outDir}/uriage-02-dialog-ready-${tag}.png`});
    const link = dialog.getByRole('link', {name: '🧾 売上伝票発行依頼書を開く'});
    assert.equal(await link.getAttribute('href'), `${site}/taiyo-uriage-denpyo/?from=shinsei`);
    const [slip] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
    await slip.getByText('申請書・見積書作成から読み込みました。').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('taiyo-uriage-import-v1')), null);
    assert.equal(await slip.getByPlaceholder('例: 山田太郎').inputValue(), '（サンプル）山田');
    assert.equal(await slip.getByPlaceholder(/施工業者名を入力|入力 \/ 候補から選択/).inputValue(), '笹岡工務店');
    assert.deepEqual(await slip.getByPlaceholder('金額(税込)').evaluateAll((l) => l.map((x) => x.value)), ['26950']);
    assert.deepEqual(await slip.getByPlaceholder('仕切り(税込)').evaluateAll((l) => l.map((x) => x.value)), [String(cost)]);
    const text = await slip.locator('main').innerText();
    assert.match(text, /対象内利用者負担額（1割・切り上げ）\s*¥2,695/);
    assert.match(text, /保険者負担額（9割・切り下げ）\s*¥24,255/);
    // 伝票（印刷の形）に、見積書で入れたものがすべて入っている（ユーザーの問い「全て転記された内容が記載されていますか？」2026-10-27）
    const printed = (await slip.locator('.uriage-print').textContent()).replace(/\s+/g, ' ');
    for (const t of [
      'サービス区分住宅改修',
      '担当者久保 匠史',
      '顧客区分既存',
      '顧客名（サンプル）山田',
      '住所福岡県行橋市中央1-1',
      '居宅名見本居宅介護支援事業所',
      '担当ケアマネージャー見本 太郎',
      '施工業者笹岡工務店',
      '請求区分受領委任払い',
      '介護度介護１',
      '負担割合1割',
      '¥26,950',
      `¥${cost.toLocaleString('ja-JP')}`,
    ]) {
      assert.ok(printed.includes(t), `伝票に「${t}」がない：${printed}`);
    }
    await slip.screenshot({path: `${outDir}/uriage-03-slip-${tag}.png`, fullPage: true});
    await slip.close();
    log(`${tag}: 売上伝票が工事1行・仕切り ${cost}円で開いた`);

    // 生活保護：もう一度開く（新規・既存・負担割合は覚えている）
    await page.getByRole('button', {name: '🧾 売上伝票依頼書', exact: true}).click();
    assert.equal(await dialog.getByRole('group', {name: '伝票の顧客区分'}).getByRole('button', {name: '既存'}).getAttribute('aria-pressed'), 'true');
    assert.equal(await dialog.getByRole('group', {name: '伝票の負担割合'}).getByRole('button', {name: '1割'}).getAttribute('aria-pressed'), 'true');
    await dialog.getByLabel('生活保護（自己負担は出さない）').check();
    await dialog.getByText('利用者負担（生活保護・1割）2,695円').waitFor(); // 「介護扶助」とは書かない（ユーザーの指示 2026-10-28）
    const [slip2] = await Promise.all([ctx.waitForEvent('page'), dialog.getByRole('link', {name: '🧾 売上伝票発行依頼書を開く'}).click()]);
    await slip2.getByText('申請書・見積書作成から読み込みました。').waitFor();
    const text2 = await slip2.locator('main').innerText();
    assert.ok(!text2.includes('介護扶助'), text2);
    assert.match(text2, /対象内利用者負担額（生活保護・1割・切り上げ）\s*¥2,695/);
    assert.match(text2, /ご利用者お支払い合計\s*¥0/);
    await slip2.close();
    // 窓で選んだ負担割合・介護度は申請書の項目にも入っている（住宅改修申請書のタブの一覧）
    await page.getByRole('tab', {name: /住宅改修申請書/}).click();
    await page.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護1'}).waitFor();
    assert.equal(await page.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護1'}).getAttribute('aria-pressed'), 'true');
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('ok: 工事見積書の 🧾 売上伝票依頼書 → 足りない所を窓で → 売上伝票（住宅改修工事1行）→ 生活保護（1366px・390px）');
} finally {
  await browser.close();
}
