// 特定福祉用具申請書・販売見積書のタブを確かめる：様邸の画面のタブは 左から「📝 住宅改修申請書」「📋 工事見積書」「🛁 特定福祉用具申請書」「🏷 販売見積書」「📄 理由書」
//   （ユーザーの指示「住宅改修申請書、工事見積書、特定福祉用具申請書、販売見積書の順にする」2026-10-23。前は「特定福祉用具アプリを出す」2026-10-22）。
//   特定福祉用具申請書のタブは申請書だけ（view=shinsei）、販売見積書のタブは見積書だけ（view=quote）。申請書で入れた商品は販売見積書にも出る（同じ案件）。
//   特定福祉用具申請書のタブは、特定福祉用具のアプリ（<サイト>/tokutei/）を中に出し、住宅改修申請書で入れたお客様の情報を渡す（tokuteiLink.ts）。
//   <サイト>/tokutei/index.html があれば（特定福祉用具のビルドを置いたとき）、中のアプリでその様邸の案件が開いてお客様の情報が入っていること・
//   特定福祉用具で直した値は残り、住宅改修で直した値は入れ直されること・上の題名の段を出さないことも確かめる
// usage: node e2e-tokutei.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
// 2つ目からの商品を足すボタン（「＋ 2つ目の福祉用具を追加」「＋ 3つ目の商品を追加」。ユーザーの指示「追加のボタンはもう少しわかりやすいように」2026-10-26）
const ADD_ITEM = /^＋ \d+つ目の(福祉用具|商品)を追加$/;

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
const withTokutei = (await fetch(`${site}/tokutei/index.html`).catch(() => null))?.ok === true;
log(withTokutei ? '特定福祉用具のビルドあり（中のアプリまで確かめる）' : '特定福祉用具のビルドなし（タブ・URL・受け渡しだけ確かめる）');

// ---------------- 新規作成（行橋市）：住宅改修申請書のタブで開く。お客様の情報を入れる
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
// 画面の上・ブラウザのタブの題名は「申請書・見積書作成」（太陽ポータルのタイルと同じ名前。ユーザーの答え「変える」、2026-10-22）
assert.equal(await page.title(), '申請書・見積書作成');
assert.equal(await page.locator('header').getByText('申請書・見積書作成', {exact: true}).count(), 1);
const tablist = page.getByRole('tablist', {name: '住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書'});
assert.deepEqual(await tablist.getByRole('tab').allInnerTexts(), ['📝 住宅改修申請書', '📋 工事見積書', '🛁 特定福祉用具申請書', '🏷 販売見積書', '📄 理由書']);
assert.equal(await page.getByRole('tab', {name: '📝 住宅改修申請書'}).getAttribute('aria-selected'), 'true');
// フリガナ → 被保険者氏名 → 被保険者番号 → 生年月日の年・月・日 → 郵便番号 → 住所 → 電話番号（架空の方）
for (const t of ['みほん　はなこ', '見本 花子', '366989', '13', '4', '14', '824-0001', '福岡県行橋市中央1-1', '0930-00-0000']) {
  await page.keyboard.type(t);
  await page.keyboard.press('Enter');
}
await form.getByRole('group', {name: '性別'}).getByRole('button', {name: '女'}).click();
await form.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護2'}).click();
const jobId = await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('job'));
assert.ok(jobId);

// ---------------- 特定福祉用具申請書のタブ：URL は view=tokutei。お客様の情報を localStorage に書いてから、特定福祉用具のアプリを中に出す
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await page.waitForFunction(() => location.hash.includes('view=tokutei'));
assert.equal(await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).getAttribute('aria-selected'), 'true');
assert.equal(await page.getByRole('heading', {level: 1}).innerText(), '見本 花子様邸');
const frameEl = page.locator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
assert.equal(await frameEl.getAttribute('src'), `../tokutei/index.html#jutaku=${encodeURIComponent(jobId)}&embed=1&view=shinsei`);
const handoff = JSON.parse(await page.evaluate(() => localStorage.getItem('taiyo-tokutei-from-jutaku-v1')));
assert.deepEqual(handoff, {
  job: jobId,
  fields: {
    customer: '見本 花子',
    kana: 'ミホン　ハナコ',
    insuredNo: '0000366989',
    birthDate: '1938-04-14', // 生年月日の元号は初めから昭和
    gender: '女',
    zip: '824-0001',
    address: '福岡県行橋市中央1-1',
    tel: '0930-00-0000',
    careLevel: '要介護2',
    insurer: 'yukuhashi',
    careOffice: '',
    careManager: '',
  },
});
// 中の枠は画面の下まで（画面ごとはスクロールしない。特定福祉用具のアプリの中だけスクロールする）
const box = await frameEl.boundingBox();
assert.ok(box.height >= 560 && Math.abs(box.y + box.height + 16 - 900) <= 2, JSON.stringify(box));
assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
log('タブの順番・URL・受け渡し OK');

if (withTokutei) {
  const tk = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
  // 入れる所（申請書のプレビューの欄も同じ名前なので、入れる欄だけ）
  const field = (name) => tk.locator(`input[aria-label="${name}"], select[aria-label="${name}"], textarea[aria-label="${name}"]`).first();
  await field('お客様名').waitFor();
  assert.equal(await field('お客様名').inputValue(), '見本 花子');
  assert.equal(await field('フリガナ').inputValue(), 'ミホン　ハナコ');
  assert.equal(await field('被保険者番号').inputValue(), '0000366989');
  // 生年月日は元号の丸と年・月・日、要介護状態区分・性別は丸のボタン（住宅改修と同じ入れ方。ユーザーの指示「生年月日なども含め、入力の仕方や色など、住宅改修と同じ入力方法にする」2026-10-26）
  assert.equal(await tk.getByRole('group', {name: '元号'}).getByRole('button', {name: '昭和'}).getAttribute('aria-pressed'), 'true');
  assert.deepEqual([await field('生年月日の年').inputValue(), await field('生年月日の月').inputValue(), await field('生年月日の日').inputValue()], ['13', '4', '14']);
  assert.equal(await tk.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護2'}).getAttribute('aria-pressed'), 'true');
  assert.equal(await field('郵便番号').inputValue(), '824-0001');
  assert.equal(await field('住所').inputValue(), '福岡県行橋市中央1-1');
  assert.equal(await field('電話').inputValue(), '0930-00-0000');
  assert.equal(await field('保険者').inputValue(), 'yukuhashi');
  assert.equal(await tk.getByRole('group', {name: '性別'}).getByRole('button', {name: '女'}).getAttribute('aria-pressed'), 'true');
  // 上の題名・ポータルへのリンクの段は出さない（住宅改修の画面の上にある）。特定福祉用具のタブ（見積もり・申請／商品マスタ／設定）は出す
  assert.equal(await tk.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).isVisible(), false);
  assert.equal(await tk.getByRole('link', {name: '業務アプリポータルへ'}).isVisible(), false);
  assert.ok(await tk.getByRole('button', {name: '📦 商品マスタ'}).isVisible());
  // 申請書だけ：右に申請書のプレビュー（大きく）。見積もりのタブ・見積書のボタンは出さない（販売見積書のタブにある）
  const pv = tk.getByLabel('申請書のプレビュー');
  await pv.getByRole('group', {name: '用具・受領委任払', exact: true}).waitFor();
  assert.equal(await tk.getByRole('tab', {name: '📋 見積もり'}).count(), 0);
  assert.equal(await tk.getByRole('button', {name: '🖨 見積書を印刷'}).count(), 0);
  const formBox = await tk.getByRole('form', {name: '申請書に入れる所'}).boundingBox();
  const pvBox = await pv.boundingBox();
  assert.ok(formBox && pvBox && formBox.x + formBox.width < pvBox.x && pvBox.width > formBox.width, `${JSON.stringify(formBox)} ${JSON.stringify(pvBox)}`);
  // 申請書で商品を入れると、販売見積書のタブにも出る（同じ案件）
  // 商品がないときも手で入れる欄が1つ開いている（「＋ 2つ目の福祉用具を追加」は2つ目から。ユーザーの指示「基本は手で入れるのがデフォルトなので開いておく」2026-10-26）
  assert.equal(await tk.getByRole('button', {name: ADD_ITEM}).count(), 0);
  await tk.getByLabel('種目').first().selectOption('歩行補助つえ');
  await tk.getByLabel('商品名').last().fill('見本の多点杖');
  await tk.getByRole('button', {name: ADD_ITEM}).waitFor();
  await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('見本の多点杖'));
  await page.screenshot({path: path.join(outDir, 'tokutei-1-tab.png')});
  await page.getByRole('tab', {name: '🏷 販売見積書'}).click();
  await page.waitForFunction(() => location.hash.includes('view=hanbai'));
  assert.equal(await frameEl.getAttribute('src'), `../tokutei/index.html#jutaku=${encodeURIComponent(jobId)}&embed=1&view=quote`);
  await tk.getByRole('button', {name: '🖨 見積書を印刷'}).first().waitFor();
  assert.equal(await tk.getByLabel('商品名').last().inputValue(), '見本の多点杖');
  assert.equal(await field('お客様名').inputValue(), '見本 花子');
  assert.equal(await tk.getByRole('tab', {name: /^📄 申請書/}).count(), 0);
  assert.equal(await tk.getByRole('button', {name: '📄 申請書（Excel）を作る'}).count(), 0);
  await page.screenshot({path: path.join(outDir, 'tokutei-1b-hanbai.png')});
  await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
  await field('お客様名').waitFor();
  log('申請書だけ・販売見積書だけ・申請書の商品が販売見積書に出る OK');

  // 特定福祉用具で電話を直して、すぐ住宅改修申請書のタブへ（直した値は消えない）
  await field('電話').fill('090-1111-2222');
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  // 特定福祉用具で直した値は住宅改修申請書にも入る（⇔。ユーザーの指示「特定福祉用具の申請書を入力した場合であっても、住宅改修申請書、理由書、見積もりなどに、名前や住所なども転記されるようにする」2026-10-26）
  await page.waitForFunction(() => document.querySelector('[aria-label="電話番号"]')?.value === '090-1111-2222', null, {timeout: 5000});
  await form.getByLabel('住所').fill('福岡県行橋市大橋1-1');
  await form.getByLabel('住所').blur();
  await page.waitForTimeout(1200); // 自動保存（0.4秒後）
  await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
  await field('お客様名').waitFor();
  await page.waitForFunction(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    return doc?.querySelector('[aria-label="住所"]')?.value === '福岡県行橋市大橋1-1';
  });
  assert.equal(await field('電話').inputValue(), '090-1111-2222'); // 特定福祉用具で直した値
  assert.equal(await field('住所').inputValue(), '福岡県行橋市大橋1-1'); // 住宅改修で直した値
  log('特定福祉用具で直した値は残る・住宅改修で直した値は入れ直す OK');

  // 読み直しても特定福祉用具申請書のタブ・同じ案件（案件は1つだけ）
  await page.reload();
  await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).waitFor();
  assert.equal(await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).getAttribute('aria-selected'), 'true');
  await field('お客様名').waitFor();
  assert.equal(await field('電話').inputValue(), '090-1111-2222');
  await tk.getByRole('button', {name: '← 見積もりの一覧へ'}).click();
  await tk.getByText('見本 花子').first().waitFor();
  assert.equal(await tk.getByText('見本 花子', {exact: false}).count(), 1);
  log('読み直し・案件は1つ OK');

  // ---------------- 📦 まとめて保存：チェックしたものだけを1つずつ保存（ユーザーの指示「住宅改修申請書・特定福祉用具申請書・住宅改修見積もり・特定福祉用具販売見積もりを
  // 一括で保存できる機能をつける　チェック項目のみ一括で保存する」2026-10-26）。工事見積書は行がないので選べない。特定福祉用具は見えない枠で作る（ほかのタブからでも）
  await page.getByRole('tab', {name: '📄 理由書'}).click();
  await page.getByRole('button', {name: '📦 まとめて保存'}).click();
  const dlg = page.getByRole('dialog');
  assert.equal(await dlg.getByText('工事見積書').locator('..').getByRole('checkbox').isDisabled(), true);
  assert.equal(await dlg.getByText('（見積書に行がありません）').count(), 1);
  const boxes = dlg.getByRole('group', {name: '保存する書類'}).getByRole('checkbox');
  assert.deepEqual(await boxes.evaluateAll((els) => els.map((e) => [e.checked, e.disabled])), [[true, false], [false, true], [true, false], [true, false]]);
  // 販売見積書だけ外す → 住宅改修申請書と特定福祉用具申請書の2つ
  await boxes.nth(3).uncheck();
  const names = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  await dlg.getByRole('button', {name: '📗 2つ保存する'}).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 30000});
  await page.waitForTimeout(800);
  assert.deepEqual(names.sort(), ['見本花子様特定福祉用具申請書.xlsx', '見本花子様住宅改修申請書.xlsx'].sort());
  assert.equal(await page.locator('iframe[title="特定福祉用具（まとめて保存）"]').count(), 0); // 見えない枠は消す
  // 選んだものは覚えている（次に開くと販売見積書は外れたまま）
  await page.getByRole('button', {name: '📦 まとめて保存'}).click();
  assert.deepEqual(await boxes.evaluateAll((els) => els.map((e) => e.checked)), [true, false, true, false]);
  await dlg.getByRole('button', {name: 'やめる'}).click();
  log('まとめて保存 OK');

  // ---------------- 担当（ユーザーの指示「受注残に入れるとき当然担当名のところ、紐付けて受注残に飛ばせるようにしてください」2026-10-26）：
  // 特定福祉用具で選んだ担当は様邸の担当にも入る（⇔）。様邸の担当は特定福祉用具の案件にも入る（受注残には案件の担当で入る）
  await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
  await field('担当').waitFor();
  await field('担当').selectOption('土居 翔太');
  await page.getByRole('tab', {name: '📋 工事見積書'}).click();
  await page.getByRole('region', {name: '見積書', exact: true}).waitFor();
  const staffSel = page.locator('label', {hasText: /^担当/}).first().locator('select');
  await page.waitForFunction(() => [...document.querySelectorAll('label')].find((l) => /^担当/.test(l.textContent))?.querySelector('select')?.value === '土居 翔太', null, {timeout: 5000});
  await staffSel.selectOption('宮村 茉莉花');
  await page.waitForTimeout(1200);
  await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
  await field('担当').waitFor();
  await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('select[aria-label="担当"]')?.value === '宮村 茉莉花', null, {timeout: 10000});
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('taiyo-tokutei-sales-v1') || '{}').rows?.some((r) => r.customer === '見本 花子' && r.staff === '宮村 茉莉花'), null, {timeout: 10000});
  log('担当：特定福祉用具 ⇔ 様邸 OK');

  // ---------------- 一覧の売上月：特定福祉用具だけの様邸は、その案件の月。▶ で次の月にすると、受注残に渡す月（tokuteiMonths）も次の月
  await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
  await page.waitForFunction(() => !location.hash.includes('job='));
  const now = new Date();
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const nextM = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const saleId = await page.evaluate(() => JSON.parse(localStorage.getItem('taiyo-tokutei-sales-v1') || '{}').rows?.find((r) => r.customer === '見本 花子')?.id);
  assert.ok(saleId);
  const hanako = page.getByRole('row', {name: /見本 花子様邸/}).getByRole('group', {name: '売上月'});
  await hanako.getByRole('button', {name: '売上月を次月に'}).click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem('taiyo-jutaku-sales-v1') || '{}').tokuteiMonths?.[id], saleId);
  assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('taiyo-jutaku-sales-v1')).tokuteiMonths[id], saleId), ym(nextM));
  await page.getByRole('button', {name: '次の月'}).click();
  assert.equal((await hanako.innerText()).replace(/\s+/g, ''), `◀${nextM.getFullYear() === now.getFullYear() ? `${nextM.getMonth() + 1}月` : `${nextM.getFullYear()}年${nextM.getMonth() + 1}月`}▶`);
  await page.getByRole('button', {name: '前の月'}).click();
  log('一覧の売上月：特定福祉用具の案件の月も移る（受注残に渡す月）OK');
}

// ---------------- 新規作成してすぐ特定福祉用具申請書のタブを開き、住宅改修には何も入れずに一覧へ戻っても、様邸は消さない
//（中のアプリの案件はこの様邸の id につながる。前は空の様邸とみて消し、作り直すと特定福祉用具の案件が2つになった）
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 苅田町', exact: true}).click();
await form.waitFor();
const emptyId = await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('job'));
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await page.waitForFunction(() => location.hash.includes('view=tokutei'));
if (withTokutei) {
  // 特定福祉用具申請書だけを作っている様邸（ユーザーの指示「特定福祉用具の申請書を作成途中の場合も、こちらの一覧には表示されるようにする」2026-10-26）
  const name2 = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]').locator('input[aria-label="お客様名"]').first();
  await name2.waitFor();
  // まとめて保存：何も入っていない住宅改修申請書は選べない（ユーザーの指示「全くの白紙の申請書や見積もりはチェックから外す」2026-10-26）
  await page.getByRole('button', {name: '📦 まとめて保存'}).click();
  const dlg2 = page.getByRole('dialog');
  assert.equal(await dlg2.getByText('住宅改修申請書', {exact: true}).locator('..').getByRole('checkbox').isDisabled(), true);
  assert.equal(await dlg2.getByText('（何も入っていません）').count(), 1);
  await dlg2.getByRole('button', {name: 'やめる'}).click();
  // 特定福祉用具で入れたお客様名は住宅改修の様邸にも入る（⇔）。見積書に行がないので請求書には入れない
  await name2.fill('見本 特定');
  await page.getByRole('heading', {level: 1, name: /見本 特定/}).waitFor({timeout: 5000}).catch(() => undefined);
  await page.waitForTimeout(1200);
}
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await page.waitForFunction(() => !location.hash.includes('job='));
await page.waitForTimeout(1200); // 自動保存（0.4秒後）
if (withTokutei) {
  // 一覧には特定福祉用具の方のお客様名（印は「特定福祉用具」）。探すときも見つかる
  await page.getByRole('region', {name: '一覧から作成'}).getByRole('button', {name: '📋 見積書の一覧を開く'}).click();
  const row2 = page.getByRole('row', {name: /見本 特定様邸/});
  await row2.waitFor();
  assert.match(await row2.innerText(), /申請書だけ/); // 金額がないので請求書に入れない（ユーザーの指示「金額などを入れていない場合は、請求書や受注残にいれない」）
  await page.getByPlaceholder(/お客様名・住所で探す/).fill('見本 特定');
  await row2.waitFor();
  await page.getByPlaceholder(/お客様名・住所で探す/).fill('');
}
await page.goto(`${site}/jutaku-mitsumori/index.html#tab=estimate&job=${encodeURIComponent(emptyId)}`);
await page.reload();
await page.getByRole('tablist', {name: '住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書'}).waitFor({timeout: 5000});
assert.equal(await page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('job')), emptyId);
log('特定福祉用具申請書のタブを開いた様邸は、空でも消さない・一覧にお客様名・白紙の申請書はまとめて保存で選べない OK');

if (withTokutei) {
  // ---------------- 広い画面：左の 🪪 の枠の下に「📖 カタログを表示」「🖨 カタログを印刷」（ユーザーの指示「赤枠の部分にカタログを表示とカタログを印刷という
  // ２つのボタンを設置する」2026-10-26）。カタログは特定福祉用具のアプリにあるので、🛁 のタブを開いて中にカタログの窓・カタログの印刷を出す（販売見積書のタブならそのまま）
  await page.setViewportSize({width: 2000, height: 1000});
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  const showCat = page.getByRole('button', {name: '📖 カタログを表示'});
  const printCat = page.getByRole('button', {name: '🖨 カタログを印刷'});
  await showCat.waitFor();
  const drop = showCat.locator('xpath=../*[1]'); // 🪪 の枠（同じ箱の最初）
  const [dropBox, showBox, printBox] = [await drop.boundingBox(), await showCat.boundingBox(), await printCat.boundingBox()];
  assert.match(await drop.innerText(), /介護保険証・\s*介護ソフトの画面/);
  assert.ok(Math.abs(showBox.x - dropBox.x) < 1 && Math.abs(showBox.width - dropBox.width) < 1 && showBox.y >= dropBox.y + dropBox.height && printBox.y >= showBox.y + showBox.height, `${JSON.stringify(dropBox)} ${JSON.stringify(showBox)} ${JSON.stringify(printBox)}`);
  assert.ok(printBox.y + printBox.height <= 1000, '画面の下にはみ出す');
  await page.screenshot({path: path.join(outDir, 'tokutei-3-catalog-buttons.png')});
  const tkf = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
  await showCat.click();
  await page.waitForFunction(() => location.hash.includes('view=tokutei'));
  await tkf.getByRole('dialog', {name: 'カタログ'}).waitFor({timeout: 30000});
  await page.waitForTimeout(1500);
  await page.screenshot({path: path.join(outDir, 'tokutei-4-catalog-show.png')});
  await tkf.getByRole('dialog', {name: 'カタログ'}).getByRole('button', {name: 'カタログを閉じる'}).click();
  // 販売見積書のタブでは、そのタブのまま印刷の画面
  await page.getByRole('tab', {name: '🏷 販売見積書'}).click();
  await page.waitForFunction(() => location.hash.includes('view=hanbai'));
  await tkf.locator('input[aria-label="お客様名"]').first().waitFor();
  await printCat.click();
  await tkf.getByRole('group', {name: '印刷するページ'}).waitFor({timeout: 30000});
  assert.equal(await page.getByRole('tab', {name: '🏷 販売見積書'}).getAttribute('aria-selected'), 'true');
  await tkf.getByRole('button', {name: '閉じる', exact: true}).click();
  // 工事見積書のタブからは 🛁 のタブを開いて印刷の画面
  await page.getByRole('tab', {name: '📋 工事見積書'}).click();
  await page.waitForFunction(() => !location.hash.includes('view=')); // 工事見積書のタブは view を書かない
  await printCat.click();
  await page.waitForFunction(() => location.hash.includes('view=tokutei'));
  await tkf.getByRole('group', {name: '印刷するページ'}).waitFor({timeout: 30000});
  await tkf.getByRole('button', {name: '閉じる', exact: true}).click();
  await page.setViewportSize({width: 1366, height: 900});
  log('左の「📖 カタログを表示」「🖨 カタログを印刷」 OK');
}

// ---------------- スマホの幅（390px）：横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await page.waitForTimeout(500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(overflow <= 1, `横にはみ出す ${overflow}px`);
await page.screenshot({path: path.join(outDir, 'tokutei-2-phone.png'), fullPage: true});
log('スマホの幅 OK');

assert.deepEqual(errors, []);
await browser.close();
log('ALL OK');
