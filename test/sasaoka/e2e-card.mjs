// 介護保険証から入れるを確かめる（ユーザーの指示「介護保険証をドラッグ＆ドロップで添付したら、全ての情報…入力必要項目が全て入力される」2026-10-22）：
//   架空の保険証（cardFixture.mjs。スキャンのような白黒・ざらつき・90°横向き）と負担割合証を、
//   1. 申請書のタブの「🪪 介護保険証から入れる」で選ぶ（画像2枚）→ 確かめる画面（読めた値・今の値）→ 入れる → 申請書・理由書・見積書に出る
//   2. 新規作成（行橋市）の様邸の「🪪 介護保険証」にドロップ（PDF）→ 新しい様邸に入る（見積もりの入口＝メイン画面には読み取りの欄を出さない。2026-10-23）
//   3. ボタンは4つのタブのどれでもタブのすぐ右。画面をクリックしてから Ctrl+V（貼り付け）でも読む（字を打つ欄では読まない）
//   読み取りの部品（tesseract.js・日本語のデータ）は手元の node_modules から（ネットにつながない）
// usage: node e2e-card.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {cardHtml, SCAN_JS} from './cardFixture.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
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

// ---------------- 架空の保険証の画像を作る（スキャンのように）
const maker = await browser.newPage({deviceScaleFactor: 2});
const scan = async (opt) => {
  await maker.setContent(cardHtml(undefined, opt));
  const png = await maker.locator('body').screenshot();
  const url = await maker.evaluate(`(${SCAN_JS})('data:image/png;base64,${png.toString('base64')}')`);
  return Buffer.from(url.split(',')[1], 'base64');
};
const cardRot = await scan({rotate: 90});
const futan = await scan({kind: 'futan'});
await writeFile(path.join(outDir, 'card-rot.png'), cardRot);
await writeFile(path.join(outDir, 'futan.png'), futan);
// PDF（A4 縦に、横向きの保険証の画像を貼ったもの＝スキャンした PDF のまね）
// （縦長の画像は 1ページに入る大きさ：幅 105mm なら高さ約 270mm）
await maker.setContent(`<!doctype html><style>@page{size:A4;margin:0}body{margin:0}img{display:block;margin:10mm}</style><img src="data:image/png;base64,${cardRot.toString('base64')}" style="width:105mm"><div style="page-break-before:always"></div><img src="data:image/png;base64,${futan.toString('base64')}" style="width:190mm">`);
const pdf = await maker.pdf({format: 'A4'});
await writeFile(path.join(outDir, 'card.pdf'), pdf);
await maker.close();
log('架空の保険証の画像・PDF を作った');

const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await routeOcr(ctx);
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => appError(m) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();

// ---------------- 1. 申請書のタブで、画像2枚を選ぶ
const t0 = Date.now();
await page.getByLabel('介護保険証のファイル').setInputFiles([
  {name: '保険証.png', mimeType: 'image/png', buffer: cardRot},
  {name: '負担割合証.png', mimeType: 'image/png', buffer: futan},
]);
await page.getByRole('status', {name: '介護保険証を読んでいます'}).waitFor();
const dialog = page.getByRole('dialog').filter({hasText: '介護保険証から入れる'});
await dialog.getByRole('table', {name: '読んだ値'}).waitFor({timeout: 240_000});
log(`読んだ（${Math.round((Date.now() - t0) / 1000)} 秒）`);
await page.screenshot({path: path.join(outDir, 'card-dialog.png')});
const row = (label) => dialog.getByRole('row', {name: label, exact: true});
const val = (label) => row(label).getByLabel(`${label}（読んだ値）`);
// 形の決まった項目は読めている（横向きのスキャン・ざらつきでも）
assert.equal(await val('被保険者番号').inputValue(), '0000123456');
assert.equal(await row('生年月日').getByLabel('生年月日の元号（読んだ値）').inputValue(), '昭和');
assert.deepEqual(
  await Promise.all(['年', '月', '日'].map((x) => row('生年月日').getByLabel(`生年月日の${x}（読んだ値）`).inputValue())),
  ['13', '4', '14'],
);
assert.equal(await val('性別').inputValue(), '女');
assert.equal(await val('郵便番号').inputValue(), '824-0001');
assert.equal(await val('要介護状態区分').inputValue(), '要介護2');
assert.equal(await row('認定の有効期間').getByLabel('認定の有効期間のはじめ（読んだ値）').inputValue(), '2024-04-01');
assert.equal(await row('認定の有効期間').getByLabel('認定の有効期間のおわり（読んだ値）').inputValue(), '2027-03-31');
assert.equal(await val('保険者').inputValue(), 'yukuhashi');
assert.equal(await val('利用者負担の割合').inputValue(), '1');
assert.match(await val('住所').inputValue(), /^行橋市中央一丁目1番1号$/);
// 氏名・フリガナは読み違いがあるかもしれないので直せる。直したら、その行にチェックが付く
// （読んだ値がもう同じときも、いったん替えてから直す）
await val('氏名').fill('見本');
await val('氏名').fill('見本　花子');
await val('フリガナ').fill('ミホン');
await val('フリガナ').fill('ミホン　ハナコ');
assert.equal(await row('氏名').getByLabel('氏名を入れる').isChecked(), true);
// 保険者はこの様邸と同じ（行橋市）なので、はじめはチェックしない
assert.equal(await row('保険者').getByLabel('保険者を入れる').isChecked(), false);
// 「今の値」：サンプルの様邸の氏名
assert.match(await row('氏名').innerText(), /今：（サンプル）山田/);
await dialog.getByRole('button', {name: /項目を入れる$/}).click();
await dialog.waitFor({state: 'detached'});
assert.deepEqual(errors, []);
log('確かめる画面 OK');

// 申請書に出る
const f = (label) => form.getByLabel(label, {exact: true});
assert.equal(await f('被保険者番号').inputValue(), '0000123456');
assert.equal(await f('被保険者氏名').inputValue(), '見本　花子');
assert.equal(await f('フリガナ').inputValue(), 'ミホン　ハナコ');
assert.equal(await f('郵便番号').inputValue(), '824-0001');
assert.equal(await f('住所').inputValue(), '行橋市中央一丁目1番1号');
assert.equal(await form.getByRole('group', {name: '性別'}).getByRole('button', {name: '女'}).getAttribute('aria-pressed'), 'true');
// 理由書にも出る（要介護・認定有効期間・作成者の事業所）
await page.getByRole('tab', {name: '📄 理由書'}).click();
const rform = page.getByRole('form', {name: '理由書'});
await rform.waitFor();
assert.equal(await rform.getByLabel('認定有効期間のはじめ').inputValue(), '2024-04-01');
assert.equal(await rform.getByLabel('認定有効期間のおわり').inputValue(), '2027-03-31');
assert.equal(await rform.getByRole('group', {name: '要介護認定'}).getByRole('button', {name: '要介護2'}).getAttribute('aria-pressed'), 'true');
// 居宅介護支援事業者は2件のうち、届出年月日の新しい方（前の事業所「見本居宅介護支援事業所」ではない）
assert.match(await rform.getByLabel('作成者の所属事業所').inputValue(), /^見本ケアプランセンター$/);
await page.waitForFunction(() => document.querySelector('[aria-label="理由書のプレビュー"]')?.innerText.includes('令和6年4月1日～令和9年3月31日'), null, {timeout: 8000});
// 見積書にも（氏名・番号・住所）
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await page.getByRole('region', {name: '見積書', exact: true}).waitFor();
assert.match(await page.getByRole('region', {name: '見積書', exact: true}).innerText(), /見本　花子/);
// 特定福祉用具申請書のタブにも渡す（中の特定福祉用具のアプリが受け取る localStorage）
await page.getByRole('tab', {name: '🛁 特定福祉用具申請書'}).click();
await page.waitForFunction(() => !!localStorage.getItem('taiyo-tokutei-from-jutaku-v1'));
const handoff = JSON.parse(await page.evaluate(() => localStorage.getItem('taiyo-tokutei-from-jutaku-v1')));
assert.equal(handoff.fields.insuredNo, '0000123456');
assert.equal(handoff.fields.customer, '見本　花子');
assert.equal(handoff.fields.kana, 'ミホン　ハナコ');
assert.equal(handoff.fields.birthDate, '1938-04-14');
assert.equal(handoff.fields.careLevel, '要介護2');
assert.equal(handoff.fields.burdenRatio, 1);
assert.equal(handoff.fields.insurer, 'yukuhashi');
assert.deepEqual([handoff.fields.careFrom, handoff.fields.careTo], ['2024-04-01', '2027-03-31']);
// 特定福祉用具申請書のタブにも「🪪 介護保険証から入れる」（入れると中の特定福祉用具のアプリを開き直す）
assert.equal(await page.getByRole('button', {name: '🪪 介護保険証', exact: true}).isVisible(), true);
// 介護ソフトの画面から入れるは外した（ユーザーの指示「その機能はちょっと現実的に使えそうにないので、そこは外してください」2026-10-29）
assert.equal(await page.getByText(/介護ソフト/).count(), 0);
log('申請書・理由書・見積書・特定福祉用具に出た OK');

// ---------------- 2. 新規作成の様邸に PDF をドロップ（見積もりの入口には読み取りの欄を出さない）
await page.getByRole('button', {name: /見積もり・申請書を作成する/}).first().click();
await page.getByRole('region', {name: '新規作成'}).waitFor();
assert.equal(await page.getByRole('button', {name: /介護保険証/}).count(), 0);
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市'}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
const drop = page.getByRole('button', {name: '🪪 介護保険証', exact: true});
await drop.waitFor();
const dt = await page.evaluateHandle(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const d = new DataTransfer();
  d.items.add(new File([bytes], '保険証.pdf', {type: 'application/pdf'}));
  return d;
}, pdf.toString('base64'));
await drop.dispatchEvent('dragover', {dataTransfer: dt});
await drop.dispatchEvent('drop', {dataTransfer: dt});
const dialog2 = page.getByRole('dialog').filter({hasText: '介護保険証から入れる'});
await dialog2.getByRole('table', {name: '読んだ値'}).waitFor({timeout: 240_000});
await page.screenshot({path: path.join(outDir, 'card-dialog-pdf.png')});
assert.equal(await dialog2.getByRole('row', {name: '保険者', exact: true}).getByLabel('保険者（読んだ値）').inputValue(), 'yukuhashi');
// PDF に貼った画像は粗い（150mm に縮めた）ので、読み違いもありうる：形（10けた）は合う
assert.match(await dialog2.getByRole('row', {name: '被保険者番号', exact: true}).getByLabel('被保険者番号（読んだ値）').inputValue(), /^\d{10}$/);
// 生年月日は、読めたか、読めなかった字がありそうなら確かめてもらう（細い「1」が読めず「昭和3年」など）
const birthRow2 = dialog2.getByRole('row', {name: '生年月日', exact: true});
const y2 = await birthRow2.getByLabel('生年月日の年（読んだ値）').inputValue();
assert.ok(y2 === '13' || /確かめて/.test(await birthRow2.innerText()), `生年月日の年 ${y2}`);
await dialog2.getByRole('row', {name: '氏名', exact: true}).getByLabel('氏名（読んだ値）').fill('見本　次郎');
await dialog2.getByRole('button', {name: /項目を入れる$/}).click();
await dialog2.waitFor({state: 'detached'});
assert.equal(await page.getByRole('form', {name: '申請書'}).getByLabel('被保険者氏名', {exact: true}).inputValue(), '見本　次郎');
assert.match(await page.locator('h1').first().innerText(), /見本　次郎/);
await page.screenshot({path: path.join(outDir, 'card-new.png'), fullPage: false});
log('新規作成 OK');

// ---------------- 2b. 複合機・FAX のスキャンの PDF（白黒の CCITT G4 の画像・ページを 270° 回した形。fixtures/card-fax.pdf ＝ 架空の保険証と負担割合証を
//   make-fax-pdf.py で入れたもの）。pdf.js の画像の部品（jbig2.wasm）を同梱していなかったときは、ページが真っ白で何も読めなかった
//   （ユーザーの報告「保険証などが上手く取り込めないケースがあった」2026-10-29）
await page.getByRole('button', {name: /見積もり・申請書を作成する/}).first().click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市'}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
const fax = await readFile(new URL('./fixtures/card-fax.pdf', import.meta.url));
await page.getByLabel('介護保険証のファイル').setInputFiles([{name: 'スキャン.pdf', mimeType: 'application/pdf', buffer: fax}]);
const faxDialog = page.getByRole('dialog').filter({hasText: '介護保険証から入れる'});
await faxDialog.getByRole('table', {name: '読んだ値'}).waitFor({timeout: 300_000});
await page.screenshot({path: path.join(outDir, 'card-dialog-fax.png')});
assert.equal(await faxDialog.locator('img').count(), 2, 'スキャンの2ページとも画像になる（真っ白で飛ばさない）');
assert.match(await faxDialog.getByRole('row', {name: '被保険者番号', exact: true}).getByLabel('被保険者番号（読んだ値）').inputValue(), /^\d{10}$/);
assert.equal(await faxDialog.getByRole('row', {name: '保険者', exact: true}).getByLabel('保険者（読んだ値）').inputValue(), 'yukuhashi');
await faxDialog.getByRole('button', {name: 'キャンセル'}).click();
await faxDialog.waitFor({state: 'detached'});
log('複合機・FAX のスキャンの PDF（白黒の CCITT・270° 回したページ）OK');

// ---------------- 3. 「🪪 介護保険証から入れる」は4つのタブのどれでも、1段目のタブのすぐ右（ユーザーの指示「上のタブの近辺に」）。
//   画面をクリックしてから Ctrl+V で貼り付けても読む（「クリックしてから挿入で貼り付け」）。字を打つ欄での Ctrl+V は、ふつうの貼り付けのまま
const cardBtn = page.getByRole('button', {name: '🪪 介護保険証', exact: true});
const tablist = page.getByRole('tablist', {name: '住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書'});
/** 見えている間の位置（タブを替えている途中＝前の画面が消えて次の画面が出る間は待つ） */
const boxOf = async (loc) => {
  for (let i = 0; i < 50; i++) {
    const box = await loc.boundingBox();
    if (box) return box;
    await page.waitForTimeout(100);
  }
  throw new Error('見えない');
};
const lefts = [];
for (const name of ['📝 住宅改修申請書', '📋 工事見積書', '🛁 特定福祉用具申請書', '🏷 販売見積書', '📄 理由書']) {
  await page.getByRole('tab', {name}).click();
  // 特定福祉用具申請書のタブを離れるときは、中のアプリの保存を待ってから替わる（flushTokutei）ので、選ばれるまで待つ
  await page.waitForFunction((n) => [...document.querySelectorAll('[role="tab"]')].some((x) => x.textContent === n && x.getAttribute('aria-selected') === 'true'), name);
  // 工事見積書・理由書のタブには出さない（ユーザーの指示「工事費見積書作成のときは、このカタログ部分や介護保険証貼り付け部分は不要なのでなくす」「理由書作成のときも同様に」2026-10-27）
  if (name === '📋 工事見積書' || name === '📄 理由書') {
    await page.waitForTimeout(300);
    assert.equal(await cardBtn.count(), 0, `${name}：🪪 の欄を出さない`);
    continue;
  }
  const [t, b] = [await boxOf(tablist), await boxOf(cardBtn)];
  assert.ok(b.x >= t.x + t.width && b.x - (t.x + t.width) < 24, `${name}：タブのすぐ右 ${JSON.stringify({t, b})}`);
  assert.ok(Math.abs(b.y + b.height / 2 - (t.y + t.height / 2)) < 6, `${name}：タブと同じ段 ${JSON.stringify({t, b})}`);
  lefts.push(Math.round(b.x));
}
assert.equal(new Set(lefts).size, 1, `どのタブでも同じ位置 ${lefts}`);
await page.screenshot({path: path.join(outDir, 'card-button.png'), clip: {x: 0, y: 0, width: 1366, height: 260}});
/** クリップボードの画像を貼り付ける（Ctrl+V。今いる所に paste を出す） */
const pasteCard = (withText = '') =>
  page.evaluate(
    async ({b64, withText}) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(new File([bytes], '保険証.png', {type: 'image/png'}));
      // Excel の表をコピーしたときのように、文字と一緒に絵も入っている（Mac でファイルをコピーしたときは、ファイルの名前が文字で入る）
      if (withText) d.setData('text/plain', withText);
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true}));
    },
    {b64: cardRot.toString('base64'), withText},
  );
// 工事見積書のタブには 🪪 の欄がないので、画面をクリックしてから Ctrl+V しても読まない
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await page.getByRole('region', {name: '見積書', exact: true}).waitFor();
await page.locator('h1').first().click();
await pasteCard('保険証.png');
await page.waitForTimeout(800);
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 住宅改修申請書のタブで、字を打つ欄にいるときは読まない
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
await page.locator('main input:visible').first().focus();
assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'INPUT');
await pasteCard();
await page.waitForTimeout(800);
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 画面（見出し）をクリックしてから Ctrl+V → 読んで確かめる画面（文字もあるとき＝Excel の表のコピーは読まない）
await page.locator('h1').first().click();
await pasteCard('手すり\t1');
await page.waitForTimeout(800);
assert.equal(await page.getByRole('status', {name: '介護保険証を読んでいます'}).count(), 0);
// 文字がファイルの名前だけなら、ファイルの貼り付けとして読む
await pasteCard('保険証.png');
await page.getByRole('status', {name: '介護保険証を読んでいます'}).waitFor();
const dialog3 = page.getByRole('dialog').filter({hasText: '介護保険証から入れる'});
await dialog3.getByRole('table', {name: '読んだ値'}).waitFor({timeout: 240_000});
assert.equal(await dialog3.getByRole('row', {name: '被保険者番号', exact: true}).getByLabel('被保険者番号（読んだ値）').inputValue(), '0000123456');
await dialog3.getByRole('button', {name: 'キャンセル'}).click();
await dialog3.waitFor({state: 'detached'});
log('タブのすぐ右・貼り付け（Ctrl+V）OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-card: all OK');
