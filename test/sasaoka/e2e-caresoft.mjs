// 介護ソフトの画面のスクリーンショットから入れる・ドロップと貼り付けの分かりやすい枠を確かめる
// （ユーザーの指示「介護ソフトの…保険番号や名前、振り仮名、住所などが記載されている部分をスクリーンショットで切り取り、貼り付けたら、同様の情報が自動的に入力される」
//   「完了写真もドラッグ＆ドロップや貼付けしやすいようにする。介護保険証もそうです。スクリーンショットもそうです」2026-10-23）：
//   架空の介護ソフトのお客様の欄（careSoftFixture.mjs。見本・0000 の値だけ）を描いてスクリーンショット（PNG）にし、
//   1. 様邸の申請書のタブで Ctrl+V（ファイルの入った貼り付け）→「介護ソフトの画面から入れる」の確かめる画面 → 入れる → 申請書・理由書・見積書の担当・特定福祉用具の受け渡し
//   2. 見積もりの入口の「…から新規作成」の枠にドロップ（生保・苅田町・携帯だけ・担当の候補にない営業）→ 新しい様邸（保険者も画面から）・生活保護を特定福祉用具へ
//   3. 写真の枠：ファイルを持ってくると枠が薄い緑・重ねると「ここに離す」、空いた枠にドロップ、枠を選んで Ctrl+V（介護保険証の読み取りにはならない）
//   4. 1366px とスマホ（390px）で横にはみ出さない（スクリーンショットを保存）
//   読み取りの部品（tesseract.js・日本語のデータ）は手元の node_modules から（ネットにつながない。e2e-card.mjs と同じ）
// usage: node e2e-caresoft.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {softHtml} from './careSoftFixture.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}, ignoreDefaultArgs: ['--hide-scrollbars']});
const errors = [];
const NM = new URL('../../node_modules/', import.meta.url).pathname;
const routeOcr = (c) =>
  c.route('https://cdn.jsdelivr.net/**', async (route) => {
    const m = /\/npm\/(tesseract\.js@v[\d.]+\/dist|tesseract\.js-core@v[\d.]+|@tesseract\.js-data\/jpn\/4\.0\.0_best_int)\/([^/?]+)$/.exec(route.request().url());
    if (!m) return route.abort();
    const dir = m[1].startsWith('tesseract.js@') ? 'tesseract.js/dist' : m[1].startsWith('tesseract.js-core') ? 'tesseract.js-core' : '@tesseract.js-data/jpn/4.0.0_best_int';
    await route.fulfill({body: await readFile(NM + dir + '/' + m[2]), headers: {'access-control-allow-origin': '*', 'content-type': m[2].endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}});
  });
// 読み取りの部品が出すお知らせ（「Parameter not found」「Estimating resolution」）は、アプリの誤りではないので数えない
const appError = (m) => m.type() === 'error' && !/^Warning: Parameter not found|^Estimating resolution|^Detected \d+ diacritics/.test(m.text());

// ---------------- 架空の介護ソフトの画面を描いて、スクリーンショットにする（Windows の 100%・125% のまね）
const shot = async (values, opt, dpr) => {
  const p = await browser.newPage({deviceScaleFactor: dpr});
  await p.setContent(softHtml(values, opt));
  const png = await p.locator('.panel').screenshot();
  await p.close();
  return png;
};
const soft1 = await shot({}, {}, 1);
const soft2 = await shot(
  {name: '試験　次郎', kana: 'ﾐﾎﾝ ｱｷﾗ', birth: '大正15年1月2日生', age: '100歳', gender: '男', staff: '試験 三郎', zip: '800-0300', address: '福岡県京都郡苅田町見本1丁目4番5号', tel: '', mobile: '09000000000',
    careOffice: '見本居宅介護支援事業所', careManager: '試験 花子', careTel: '0979-00-2222', care: '要支援1', term: '令和06年04月01日 〜 令和09年03月31日', insurer: '苅田町', insuredNo: '0000111222', kind: '生保', rate: '90%'},
  {label: 10, value: 15},
  1.25,
);
await writeFile(path.join(outDir, 'soft1.png'), soft1);
await writeFile(path.join(outDir, 'soft2.png'), soft2);
log('架空の介護ソフトの画面を作った');

const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await routeOcr(ctx);
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => appError(m) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// 担当者の候補に、見本の画面の営業（見本 太郎）を足す
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
const staffArea = page.getByRole('textbox', {name: '担当者の名前'});
await staffArea.click();
await staffArea.press('Control+End');
await staffArea.press('Enter');
await staffArea.pressSequentially('見本 太郎');
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();

// ---------------- 入口：4つのタブのすぐ右の点線の枠「🪪 介護保険証・介護ソフトの画面」「ここにドロップ・Ctrl+V」
const area = page.getByRole('button', {name: '🪪 介護保険証・介護ソフトの画面'});
assert.match(await area.innerText(), /介護保険証・介護ソフトの画面\s*ここにドロップ・Ctrl\+V/);
assert.equal(await area.evaluate((el) => getComputedStyle(el).borderStyle), 'dashed');
const tablist = page.getByRole('tablist', {name: '住宅改修申請書・特定福祉用具申請書・工事見積書・理由書'});
const [t, b] = [await tablist.boundingBox(), await area.boundingBox()];
assert.ok(b.x >= t.x + t.width && b.x - (t.x + t.width) < 24 && Math.abs(b.y + b.height / 2 - (t.y + t.height / 2)) < 6, `タブのすぐ右 ${JSON.stringify({t, b})}`);
await page.screenshot({path: path.join(outDir, 'area-idle.png'), clip: {x: 0, y: 0, width: 1366, height: 260}});
// ファイルを画面に持ってくると、落とせる所が薄い緑（重ねた所は「ここに離す」）
const dragOver = (selector) =>
  page.evaluate((sel) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'x.png', {type: 'image/png'}));
    const el = sel ? document.querySelector(sel) : document.body;
    el.dispatchEvent(new DragEvent('dragenter', {dataTransfer: dt, bubbles: true, cancelable: true}));
    el.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
  }, selector);
await dragOver('h1');
await page.waitForFunction(() => document.querySelector('[aria-label="🪪 介護保険証・介護ソフトの画面"]')?.getAttribute('data-drop') === 'ready');
await dragOver('[aria-label="🪪 介護保険証・介護ソフトの画面"]');
await area.getByText('ここに離す').waitFor();
assert.equal(await area.getAttribute('data-drop'), 'over');
await page.screenshot({path: path.join(outDir, 'drag-over-area.png'), clip: {x: 0, y: 0, width: 1366, height: 260}});
await page.waitForFunction(() => !document.querySelector('[aria-label="🪪 介護保険証・介護ソフトの画面"]')?.textContent?.includes('ここに離す'), null, {timeout: 3000});
log('入口の枠・ドラッグ中の色・「ここに離す」OK');

// ---------------- 1. 画面（見出し）をクリックしてから Ctrl+V（Windows の切り取りの貼り付けは名前のない png）
/** ファイルの入った貼り付け（Ctrl+V。今いる所に paste を出す） */
const paste = (png, name) =>
  page.evaluate(
    ({b64, name}) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bytes], name, {type: 'image/png'}));
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true}));
    },
    {b64: png.toString('base64'), name},
  );
await page.locator('h1').first().click();
const t0 = Date.now();
await paste(soft1, 'image.png');
await page.getByRole('status', {name: '介護保険証を読んでいます'}).waitFor();
const dialog = page.getByRole('dialog').filter({hasText: '介護ソフトの画面から入れる'});
await dialog.getByRole('table', {name: '読んだ値'}).waitFor({timeout: 240_000});
log(`読んだ（${Math.round((Date.now() - t0) / 1000)} 秒）`);
await page.screenshot({path: path.join(outDir, 'soft-dialog.png')});
const row = (label) => dialog.getByRole('row', {name: label, exact: true});
const val = (label) => row(label).getByLabel(`${label}（読んだ値）`);
const values = {
  被保険者番号: '0000987654',
  氏名: '見本　春子',
  性別: '女',
  郵便番号: '824-0000',
  住所: '福岡県行橋市見本町1丁目2-3',
  要介護状態区分: '要介護2',
  保険者: 'yukuhashi',
  居宅介護支援事業所: '見本ケアプランセンター',
  利用者負担の割合: '2',
  電話番号: '0930-00-0000',
  担当: '見本 太郎',
  ケアマネジャー: '見本　一郎',
  居宅の電話: '0930-00-1111',
  生活保護: 'no',
};
for (const [label, v] of Object.entries(values)) assert.equal(await val(label).inputValue(), v, label);
assert.deepEqual(
  await Promise.all(['元号', '年', '月', '日'].map((x) => row('生年月日').getByLabel(`生年月日の${x}（読んだ値）`).inputValue())),
  ['昭和', '17', '5', '6'],
);
assert.deepEqual([await row('認定の有効期間').getByLabel('認定の有効期間のはじめ（読んだ値）').inputValue(), await row('認定の有効期間').getByLabel('認定の有効期間のおわり（読んだ値）').inputValue()], ['2025-10-22', '2026-10-31']);
// フリガナ（小さな半角カタカナ）はカタカナで読める（読み違えたときは黄色で「確かめて」）
const kana = await val('フリガナ').inputValue();
assert.match(kana, /^[ァ-ヺー　]+$/, kana);
if (kana !== 'ミホン　ハルコ') assert.match(await row('フリガナ').innerText(), /確かめて/);
log(`フリガナ：${kana}`);
// 介護ソフトの画面には保険者番号がない（行を出さない）。読んだもの：介護ソフトの画面
assert.equal(await row('保険者番号').count(), 0);
assert.match(await dialog.innerText(), /読んだもの：介護ソフトの画面/);
// はじめのチェック：今とちがう値（氏名・番号…）は入れる、同じ（保険者）は入れない
assert.equal(await row('氏名').getByLabel('氏名を入れる').isChecked(), true);
assert.equal(await row('担当').getByLabel('担当を入れる').isChecked(), true);
assert.equal(await row('保険者').getByLabel('保険者を入れる').isChecked(), false);
assert.equal(await row('生活保護').getByLabel('生活保護を入れる').isChecked(), false); // 生保ではない＝今と同じ（なし）
if (kana !== 'ミホン　ハルコ') await val('フリガナ').fill('ミホン　ハルコ');
await dialog.getByRole('button', {name: /項目を入れる$/}).click();
await dialog.waitFor({state: 'detached'});
await page.getByText('介護ソフトの画面の内容を入れました', {exact: false}).waitFor();
const f = (label) => form.getByLabel(label, {exact: true});
assert.equal(await f('被保険者番号').inputValue(), '0000987654');
assert.equal(await f('被保険者氏名').inputValue(), '見本　春子');
assert.equal(await f('フリガナ').inputValue(), 'ミホン　ハルコ');
assert.equal(await f('郵便番号').inputValue(), '824-0000');
assert.equal(await f('住所').inputValue(), '福岡県行橋市見本町1丁目2-3');
assert.equal(await f('電話番号').inputValue(), '0930-00-0000');
// 理由書：作成者の事業所・氏名・連絡先
await page.getByRole('tab', {name: '📄 理由書'}).click();
const rform = page.getByRole('form', {name: '理由書'});
await rform.waitFor();
assert.equal(await rform.getByLabel('作成者の所属事業所').inputValue(), '見本ケアプランセンター');
assert.equal(await rform.getByLabel('作成者の氏名').inputValue(), '見本　一郎');
assert.equal(await rform.getByLabel('作成者の連絡先').inputValue(), '0930-00-1111');
// 見積書：担当（候補の名前）・お客様名
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await page.getByRole('region', {name: '見積書', exact: true}).waitFor();
assert.equal(await page.locator('label', {hasText: '担当'}).locator('select').first().inputValue(), '見本 太郎');
assert.match(await page.getByRole('region', {name: '見積書', exact: true}).innerText(), /見本　春子/);
// 特定福祉用具へ：電話・居宅・ケアマネジャー・負担割合（生活保護でないので welfare は渡さない）
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await page.waitForFunction(() => JSON.parse(localStorage.getItem('taiyo-tokutei-from-jutaku-v1') || '{}').fields?.customer === '見本　春子');
const handoff = JSON.parse(await page.evaluate(() => localStorage.getItem('taiyo-tokutei-from-jutaku-v1')));
assert.deepEqual(
  [handoff.fields.tel, handoff.fields.careOffice, handoff.fields.careManager, handoff.fields.burdenRatio, handoff.fields.careLevel, handoff.fields.birthDate, 'welfare' in handoff.fields],
  ['0930-00-0000', '見本ケアプランセンター', '見本　一郎', 2, '要介護2', '1942-05-06', false],
);
log('貼り付け → 確かめる画面 → 申請書・理由書・見積書・特定福祉用具 OK');

// ---------------- 3. 写真の枠：ドロップ・Ctrl+V（申請書のタブ）
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
const photoBoard = page.getByRole('region', {name: '写真'});
const slot = (name) => photoBoard.getByRole('button', {name, exact: true});
const makeImage = async (color, w, h) =>
  Buffer.from(
    await page.evaluate(
      async ({color, w, h}) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = color;
        g.fillRect(0, 0, w, h);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        return [...new Uint8Array(await blob.arrayBuffer())];
      },
      {color, w, h},
    ),
  );
const red = await makeImage('#d33', 640, 480);
const blue = await makeImage('#33d', 480, 640);
// 空いた枠：「＋ 改修前」「ドロップ・Ctrl+V」。ファイルを持ってくると枠がみな薄い緑、重ねた枠は「ここに離す」
assert.match(await slot('①玄関 改修後').innerText(), /^＋ 改修後\s*📷 ドロップ・Ctrl\+V/);
const idle = await slot('①玄関 改修後').evaluate((el) => getComputedStyle(el).borderTopColor);
await dragOver('h1');
await page.waitForFunction(() => [...document.querySelectorAll('[data-photo-slot]')].every((el) => el.getAttribute('data-drop') === 'ready'));
// 薄い緑の枠（ドラッグしていないときの色とちがう）
assert.notEqual(await slot('①玄関 改修後').evaluate((el) => getComputedStyle(el).borderTopColor), idle);
const slotSel = await slot('①玄関 改修後').evaluate((el) => `[data-photo-slot="${el.dataset.photoSlot}"]`);
await dragOver(slotSel);
await slot('①玄関 改修後').getByText('ここに離す').waitFor();
await photoBoard.screenshot({path: path.join(outDir, 'photo-drag-over.png')});
// ドロップ
await slot('①玄関 改修後').evaluate((el, bytes) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(bytes)], 'red.png', {type: 'image/png'}));
  for (const ev of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(ev, {dataTransfer: dt, bubbles: true, cancelable: true}));
}, [...red]);
await slot('①玄関 改修後').locator('img').waitFor();
// 枠を選んで（Tab で移って）Ctrl+V：その枠に入る。介護保険証の読み取りにはならない
await slot('②トイレ 改修後').focus();
await paste(blue, 'blue.png');
await slot('②トイレ 改修後').locator('img').waitFor();
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 写真のある枠を押して選んでから Ctrl+V：差し替え
await slot('①玄関 改修後').click();
assert.equal(await slot('①玄関 改修後').getAttribute('aria-pressed'), 'true');
const before = await slot('①玄関 改修後').locator('img').getAttribute('src');
await paste(blue, 'blue2.png');
await page.waitForFunction((b) => document.querySelector('[aria-label="①玄関 改修後"] img')?.getAttribute('src') !== b, before);
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 「📷 写真を選ぶ」も点線の枠（押すとファイルを選ぶ）
assert.match(await photoBoard.getByRole('button', {name: '📷 写真を選ぶ'}).innerText(), /ここにドロップ・Ctrl\+V/);
await photoBoard.screenshot({path: path.join(outDir, 'photo-board.png')});
log('写真の枠：ドラッグ中の色・ここに離す・ドロップ・Ctrl+V（選んだ枠・差し替え）OK');

// ---------------- 2. 見積もりの入口の新規作成の枠にドロップ（生保・苅田町・携帯だけ・候補にない営業）
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
const big = page.getByRole('button', {name: '🪪 介護保険証・介護ソフトの画面から新規作成'});
await big.waitFor();
assert.match(await big.innerText(), /ここにドロップ・Ctrl\+V/);
await big.evaluate((el, bytes) => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(bytes)], '画面.png', {type: 'image/png'}));
  for (const ev of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(ev, {dataTransfer: dt, bubbles: true, cancelable: true}));
}, [...soft2]);
const dialog2 = page.getByRole('dialog').filter({hasText: '介護ソフトの画面から入れる'});
await dialog2.getByRole('table', {name: '読んだ値'}).waitFor({timeout: 240_000});
await page.screenshot({path: path.join(outDir, 'soft-dialog2.png')});
const row2 = (label) => dialog2.getByRole('row', {name: label, exact: true});
const val2 = (label) => row2(label).getByLabel(`${label}（読んだ値）`);
assert.equal(await val2('保険者').inputValue(), 'kanda');
assert.equal(await val2('利用者負担の割合').inputValue(), '1');
assert.equal(await val2('生活保護').inputValue(), 'yes');
assert.equal(await row2('生活保護').getByLabel('生活保護を入れる').isChecked(), true);
assert.equal(await val2('電話番号').inputValue(), '090-0000-0000');
assert.equal(await val2('要介護状態区分').inputValue(), '要支援1');
// 担当の候補にない営業は入れない（候補にない名前と出す）
assert.equal(await val2('担当').inputValue(), '');
assert.match(await row2('担当').innerText(), /担当者の候補にない名前/);
assert.equal(await row2('担当').getByLabel('担当を入れる').isChecked(), false);
const name2 = await val2('氏名').inputValue();
assert.equal(name2, '試験　次郎');
await dialog2.getByRole('button', {name: 'この内容で新規作成'}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
const form2 = page.getByRole('form', {name: '申請書'});
assert.equal(await form2.getByLabel('被保険者氏名', {exact: true}).inputValue(), '試験　次郎');
assert.equal(await form2.getByLabel('電話番号', {exact: true}).inputValue(), '090-0000-0000');
assert.match(await page.locator('h1').first().innerText(), /試験　次郎/);
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await page.waitForFunction(() => JSON.parse(localStorage.getItem('taiyo-tokutei-from-jutaku-v1') || '{}').fields?.customer === '試験　次郎');
const handoff2 = JSON.parse(await page.evaluate(() => localStorage.getItem('taiyo-tokutei-from-jutaku-v1')));
assert.deepEqual([handoff2.fields.welfare, handoff2.fields.burdenRatio, handoff2.fields.insurer], [true, 1, 'kanda']);
log('入口の新規作成にドロップ → 新しい様邸（苅田町・生活保護）OK');

// ---------------- 4. スマホの幅（390px）：横にはみ出さない
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(400);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `申請書のタブ ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
await page.screenshot({path: path.join(outDir, 'phone-shinsei.png')});
await page.getByRole('region', {name: '写真'}).screenshot({path: path.join(outDir, 'phone-photos.png')});
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
await page.getByRole('button', {name: '🪪 介護保険証・介護ソフトの画面から新規作成'}).waitFor();
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `入口 ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
await page.screenshot({path: path.join(outDir, 'phone-entry.png')});
log('スマホの幅 OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-caresoft: all OK');
