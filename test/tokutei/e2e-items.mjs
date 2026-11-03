// 商品の欄（2026-11-03 の直し）をブラウザで確かめる。値・名前はすべて架空（カタログの商品の型番・名前はカタログの載っているもの）
//   ・「🔢 型番から検索」：品番の欄の型番とぴったり同じ商品だけを入れる（前方一致は入れない・ないときは何も入れない）
//     （ユーザーの指示「カタログ商品検索と、型番から商品をひっぱってくるのは、絶対に検索をまちがってもらっては困るので、確実に該当商品に当たるかを照らし合わせる」）
//   ・入れた商品は自動でお気に入りへ。「★ お気に入りから入力」は品目ごとに分けて出し、「削除」で外せる（「一度入力した商品は、今後お気に入りの中に、項目ごとにいれる…当然削除する事もできる」）
//   ・税抜の横に税込。税抜・税込を打つと割引率が変わり、割引率を打つと税抜・税込が変わる（「税抜き金額、税込み金額を変更すると、自動的に割引率が変わるようにする。また、逆もしかり」）
//   ・販売見積書の宛名・見積番号・見積日・担当は2行（「４行は長いので、２行にする」）
//   ・申請書・見積書のプレビューで、長い商品名・メーカー名が欄からはみ出さない。ブラウザの「最小フォントサイズ」のまねをしても
//     （「商品名などがはみ出ている。絶対にないようにルール化する」。print/fitTexts.ts）
// 使い方：npm run -s build:tokutei のあと  node test/tokutei/e2e-items.mjs [出力フォルダ]

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, {recursive: true});
const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const catalog = /\/catalog\/([\w.-]+\.(?:pdf|json|jpg))$/.exec(path);
  const file = catalog ? join('catalog', catalog[1]) : path.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    const body = readFileSync(join(dist, file));
    const type = catalog ? (catalog[1].endsWith('.json') ? 'application/json' : catalog[1].endsWith('.jpg') ? 'image/jpeg' : 'application/pdf') : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';
    res.writeHead(200, {'content-type': type});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5193);
await new Promise((r) => server.listen(port, r));
const url = `http://localhost:${port}/tokutei/`;

/** 欄（data-fit）の中の字が、欄の外に出ていないか（字そのものの範囲を Range で測る）。はみ出している欄の文字を返す */
const overflowing = () => {
  const bad = [];
  for (const b of document.querySelectorAll('[data-fit]')) {
    const el = b.querySelector(':scope > [data-fit-inner]');
    const r = b.getBoundingClientRect();
    if (!el || !el.textContent.trim() || r.height < 1 || r.width < 1) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    if (!rects.length) continue;
    const [L, R, T, B] = [Math.min(...rects.map((x) => x.left)), Math.max(...rects.map((x) => x.right)), Math.min(...rects.map((x) => x.top)), Math.max(...rects.map((x) => x.bottom))];
    if (L < r.left - 1 || R > r.right + 1 || T < r.top - 1.5 || B > r.bottom + 1.5) bad.push(el.textContent.trim().slice(0, 30));
  }
  return bad;
};

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto(url);
  await page.getByRole('button', {name: '＋ 苅田町'}).click();
  await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本 太郎');
  const block = page.locator('[data-item]').first();
  await block.getByLabel('種目').selectOption('入浴補助用具');

  // ---- 型番から入力：頭だけ同じ型番（PN-L4143）は入れない
  const code = block.getByLabel('品番', {exact: true});
  const lookup = block.getByRole('button', {name: '🔢 型番から検索'});
  // 「📖 カタログから商品検索」の右（同じ段）に「🔢 型番から検索」（ユーザーの指示「右側に型番から検索をもってくる」2026-11-03）。品番の欄は商品名の右
  const [sBox, lBox, cBox, nBox] = await Promise.all([block.getByRole('button', {name: '📖 カタログから商品検索'}), lookup, code, block.getByLabel('商品名')].map((x) => x.boundingBox()));
  assert.ok(lBox.x > sBox.x + sBox.width && Math.abs(lBox.y - sBox.y) < 4, `${JSON.stringify(sBox)} ${JSON.stringify(lBox)}`);
  assert.ok(cBox.x > nBox.x + nBox.width && Math.abs(cBox.y - nBox.y) < 4 && nBox.width > 150, `${JSON.stringify(nBox)} ${JSON.stringify(cBox)}`);
  await code.fill('PN-L4143');
  await lookup.click();
  await block.getByRole('status').filter({hasText: 'ぴったり同じ商品は'}).waitFor({timeout: 60000});
  assert.equal(await block.getByLabel('商品名').inputValue(), '');
  // ぴったり同じ型番（小文字・全角のハイフンでも同じ）：商品名・メーカー・定価が入り、何を入れたかを出す
  await code.fill('pn－l41431a');
  await lookup.click();
  await block.getByRole('status').filter({hasText: '✓ 型番'}).waitFor();
  assert.equal(await block.getByLabel('商品名').inputValue(), 'シャワーチェアAir コンパクトSPワンタッチ ブルー');
  assert.equal(await code.inputValue(), 'PN-L41431A');
  assert.equal(await block.getByRole('combobox', {name: 'メーカー', exact: true}).inputValue(), 'パナソニックエイジフリー（株）');
  const list = Number((await block.getByLabel('定価').inputValue()).replace(/,/g, ''));
  assert.ok(list > 0);
  log('型番から入力 OK');

  // ---- 品目・メーカーを変えたら、開いているカタログの窓も、その品目・メーカーのページに切り替わる
  // （ユーザーの指示「メーカー名や品目を変えたら、横に表示されているカタログも自動的に切り替わる」2026-11-03）。「★ お気に入りから入力」は「🔢 型番から検索」の右
  const picker = block.getByRole('group', {name: 'カタログの商品'});
  const favBox = await picker.getByRole('button', {name: '★ お気に入りから入力'}).boundingBox();
  assert.ok(favBox.x > lBox.x + lBox.width && Math.abs(favBox.y - lBox.y) < 4, `${JSON.stringify(lBox)} ${JSON.stringify(favBox)}`);
  await picker.getByRole('button', {name: '📖 カタログから商品検索'}).click();
  const viewer = page.getByRole('dialog', {name: 'カタログ'});
  await viewer.waitFor();
  const pageNames = () =>
    page.evaluate(() => [...document.querySelectorAll('[aria-label="カタログのページ"] button')].map((b) => b.textContent).filter((t) => /p\.\d+/.test(t)));
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="カタログのページ"] button')].some((b) => /パナソニック/.test(b.textContent)), null, {timeout: 60000});
  assert.ok((await pageNames()).every((t) => /パナソニック/.test(t)), (await pageNames()).join(' | '));
  await picker.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption('アロン化成（株）');
  await page.waitForFunction(() => {
    const t = [...document.querySelectorAll('[aria-label="カタログのページ"] button')].map((b) => b.textContent).filter((x) => /p\.\d+/.test(x));
    return t.length > 0 && t.every((x) => !/パナソニック/.test(x));
  }, null, {timeout: 30000});
  await page.screenshot({path: `${out}/items-catalog-switch.png`});
  await picker.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption('パナソニックエイジフリー（株）');
  await viewer.getByRole('button', {name: 'カタログを閉じる'}).click();
  await viewer.waitFor({state: 'detached'});
  // 数量（− ＋）は出さない（ユーザーの指示「台数は２台にすることがないので、数量機能は不要」2026-11-03）
  assert.equal(await block.getByRole('button', {name: /の数量を1増やす$/}).count(), 0);
  log('品目・メーカーを変えたらカタログの窓も切り替わる・お気に入りは型番から検索の右・数量なし OK');

  // ---- 税抜・税込・割引率（新しい見積もりは見積もりのタブ＝「販売単価」、申請書のタブは「販売金額」。部品は同じ PriceFields.tsx）
  const P = (await page.locator('[aria-label="販売金額"]').count()) ? '販売金額' : '販売単価';
  const valueIs = async (label, v) => {
    try {
      await page.waitForFunction(([l, x]) => [...document.querySelectorAll(`[aria-label="${l}"]`)].some((e) => e.value === x), [label, v], {timeout: 10000});
    } catch (e) {
      throw new Error(`${label} が ${v} にならない：${JSON.stringify(await page.evaluate((l) => [...document.querySelectorAll(`[aria-label="${l}"]`)].map((x) => x.value), label))}`);
    }
  };
  await block.getByLabel('割引率').click();
  await block.getByLabel('割引率').fill('20');
  await block.getByLabel('割引率').blur();
  const p20 = Math.floor((list * 80) / 100);
  await valueIs(P, p20.toLocaleString('ja-JP'));
  await valueIs(`${P}（税込）`, (p20 + Math.floor(p20 / 10)).toLocaleString('ja-JP'));
  // 税込を打つ → 税抜・割引率
  const p30 = Math.floor((list * 70) / 100);
  await block.getByLabel(`${P}（税込）`).click();
  await block.getByLabel(`${P}（税込）`).fill(String(p30 + Math.floor(p30 / 10)));
  await block.getByLabel(`${P}（税込）`).blur();
  await valueIs(P, p30.toLocaleString('ja-JP'));
  await valueIs('割引率', '30');
  // 税込は税抜のすぐ横（同じ行）
  const [ex, inc] = [await block.getByLabel(P, {exact: true}).boundingBox(), await block.getByLabel(`${P}（税込）`).boundingBox()];
  assert.ok(inc.x > ex.x + ex.width && Math.abs(inc.y - ex.y) < 2, `${JSON.stringify(ex)} ${JSON.stringify(inc)}`);
  // 6けたの金額（「188,800」）でも最後の字まで見える（前は「108,000」の最後の 0 が欄に隠れていた。2026-11-03 の全体のデバッグ）
  await block.getByLabel(`${P}（税込）`).click();
  await block.getByLabel(`${P}（税込）`).fill('188800');
  await block.getByLabel(`${P}（税込）`).blur();
  for (const l of [P, `${P}（税込）`]) {
    const [cw, sw, v] = await block.getByLabel(l, {exact: true}).evaluate((e) => [e.clientWidth, e.scrollWidth, e.value]);
    assert.ok(v.length >= 7 && sw <= cw, `${l}「${v}」が欄に入らない ${sw}>${cw}`);
  }
  await block.getByLabel(`${P}（税込）`).click();
  await block.getByLabel(`${P}（税込）`).fill(String(p30 + Math.floor(p30 / 10)));
  await block.getByLabel(`${P}（税込）`).blur();
  await valueIs('割引率', '30');
  log('税抜・税込・割引率 OK');

  // ---- 仕切を入れたら右に利益率。利益率を打つと販売金額・割引率・備考（算出根拠）が変わる
  // （ユーザーの指示「仕切りの部分を入力したら、右側に利益率を表示、利益率をいじると、販売金額が自動的に変わる」「当然備考の部分も連動して数字が変わる」2026-11-03）
  assert.equal(await block.getByLabel('利益率').count(), 0); // 仕切が空のうちは出さない
  const cost = Math.floor(p30 * 0.6);
  await block.getByLabel('仕切').fill(String(cost));
  await block.getByLabel('仕切').blur();
  const rateOf = (price) => String(Math.round(((price - cost) / price) * 1000) / 10);
  await valueIs('利益率', rateOf(p30));
  const [cb, mb] = [await block.getByLabel('仕切').boundingBox(), await block.getByLabel('利益率').boundingBox()];
  assert.ok(mb.x > cb.x + cb.width && Math.abs(mb.y - cb.y) < 2, `利益率は仕切の右 ${JSON.stringify(cb)} ${JSON.stringify(mb)}`);
  const before = P === '販売単価' ? await block.getByLabel('算出根拠').inputValue() : '';
  await block.getByLabel('利益率').fill('25');
  await block.getByLabel('利益率').blur();
  const p25 = Math.ceil(cost / 0.75 - 1e-9);
  await valueIs(P, p25.toLocaleString('ja-JP'));
  await valueIs('利益率', rateOf(p25));
  if (P === '販売単価') {
    const note = await block.getByLabel('算出根拠').inputValue();
    assert.notEqual(note, before);
    assert.match(note, new RegExp(`^定価${list.toLocaleString('ja-JP')}円の(約)?[\\d.]+%引き$`), note);
  }
  await page.screenshot({path: `${out}/items-margin.png`});
  log('仕切 → 利益率 → 販売金額・割引率・備考 OK');

  // ---- 非課税：多点杖（カタログの金額の横に「非課税」）を型番から入れると非課税。「定価（非課税）」「単価（非課税）」、税込は税抜と同じ。
  // 税込の横の「非課税」ボタンで切りかえられる（ユーザーの指示「歩行器（ピックアップ）や四点杖は非課税…しっかりと全ての商品で認識する」
  // 「念のため、税込み金額の横に非課税ボタンを設置。販売見積書も全く同様の入力方法にする」「単価（税抜き）と書いてある場所も非課税に書き換える」2026-11-03）
  await page.getByRole('button', {name: /^＋ \d+つ目の(福祉用具|商品)を追加$/}).click();
  const cane = page.locator('[data-item]').nth(1);
  await cane.getByLabel('種目').selectOption('歩行補助つえ');
  await cane.getByLabel('品番', {exact: true}).fill('ELB-G4BK');
  await cane.getByRole('button', {name: '🔢 型番から検索'}).click();
  await cane.getByRole('status').filter({hasText: '✓ 型番'}).waitFor({timeout: 60000});
  assert.equal(await cane.getByLabel('商品名').inputValue(), 'エルビスクワド');
  const free = cane.getByRole('button', {name: /非課税$/});
  assert.equal(await free.getAttribute('aria-pressed'), 'true');
  const caneText = await cane.innerText();
  assert.match(caneText, /定価（非課税）/);
  assert.match(caneText, new RegExp(`${P === '販売単価' ? '単価' : '販売金額'}（非課税）`));
  assert.doesNotMatch(caneText, /（税抜）/);
  const caneEx = await cane.getByLabel(P, {exact: true}).inputValue();
  assert.equal(await cane.getByLabel(`${P}（税込）`).inputValue(), caneEx);
  // 販売見積書も申請書と同じ入れ方：税率・単位の欄はない
  assert.equal(await page.getByLabel('税区分').count(), 0);
  assert.equal(await page.getByLabel('単位', {exact: true}).count(), 0);
  await cane.screenshot({path: `${out}/items-taxfree.png`});
  // ボタンで課税に → 税込は1割増し・見出しは（税抜）。もう一度押すと非課税
  await free.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-item]')[1]?.querySelector('button[aria-pressed="false"]'));
  const n = Number(caneEx.replace(/,/g, ''));
  await valueIs(`${P}（税込）`, (n + Math.floor(n / 10)).toLocaleString('ja-JP'));
  assert.match(await cane.innerText(), /定価（税抜）/);
  await free.click();
  await valueIs(`${P}（税込）`, caneEx);
  log('非課税（カタログ・種目・ボタン）OK');

  // ---- はみ出し：長い商品名・メーカー名でも申請書のプレビューの欄から出ない
  await block.getByLabel('商品名').fill('見本のシャワーチェアAir ミドルワイドSPワンタッチ プレミアム ブルー');
  // カタログにないメーカーは、メーカーのプルダウンの「ほかのメーカー（打つ）」で打つ（2026-11-03）
  await block.getByRole('combobox', {name: 'メーカー', exact: true}).waitFor({timeout: 60000}); // カタログを読み終わるとプルダウン
  await block.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption({label: 'ほかのメーカー（打つ）'});
  await block.getByRole('combobox', {name: 'メーカー（打つ）'}).fill('見本エイジフリー工業株式会社');
  await block.getByRole('combobox', {name: 'メーカー（打つ）'}).press('Escape');
  await page.getByRole('tab', {name: /^📄 申請書/}).click();
  await page.locator('[aria-label="申請書のプレビュー"]').first().waitFor();
  await page.waitForTimeout(1200);
  assert.deepEqual(await page.evaluate(overflowing), []);
  log('申請書のプレビュー はみ出し 0');

  // ---- 申請書のプレビュー：福祉用具の青い枠は入れている商品の行だけ。左の商品・プレビューの行にマウスを乗せると、その行が光る
  // （ユーザーの指示「福祉用具の青い枠は入力中の商品の行だけ・マウスを乗せた行も光らせる」）
  const itemRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[aria-label="申請書のプレビュー"] [data-pv-field="items"][data-pv-item]')].map((e) => ({
        item: e.getAttribute('data-pv-item'),
        on: e.className.includes('outline-sky-600'),
        glow: e.hasAttribute('data-glow'),
      })),
    );
  const sForm = page.getByRole('form', {name: '申請書に入れる所'});
  await sForm.locator('[data-item]').nth(1).getByLabel('商品名').click();
  await page.waitForFunction(() => document.querySelector('[data-pv-field="items"][data-pv-item="1"]')?.className.includes('outline-sky-600'));
  let rowsNow = await itemRows();
  assert.ok(rowsNow.some((r) => r.item === '1' && r.on), JSON.stringify(rowsNow));
  assert.ok(rowsNow.every((r) => !r.on || r.item === '1'), `2つ目の商品の行だけを囲む ${JSON.stringify(rowsNow)}`);
  // 左の1つ目の商品にマウスを乗せる → プレビューの1つ目の行が光る
  await sForm.locator('[data-item]').nth(0).hover({position: {x: 30, y: 12}});
  await page.waitForFunction(() => document.querySelector('[data-pv-field="items"][data-pv-item="0"]')?.hasAttribute('data-glow'));
  await page.locator('[aria-label="申請書のプレビュー"]').first().screenshot({path: `${out}/items-preview-row.png`});
  // プレビューの3つ目の行にマウスを乗せる → その行が光る（左から離れたので1つ目は光らない）
  await page.locator('[data-pv-field="items"][data-pv-item="2"]').first().hover();
  await page.waitForFunction(() => document.querySelector('[data-pv-field="items"][data-pv-item="2"]')?.hasAttribute('data-glow'));
  rowsNow = await itemRows();
  assert.ok(rowsNow.filter((r) => r.glow).every((r) => r.item === '2'), JSON.stringify(rowsNow));
  log('申請書のプレビュー：入れている商品の行だけ囲む・マウスを乗せた行が光る OK');

  // ---- 販売見積書：宛名の下の1行に 見積番号・見積日・担当
  await page.getByRole('tab', {name: '📋 見積もり'}).click();
  const form = page.getByRole('form', {name: '見積書に入れる所'});
  await form.waitFor();
  const rowOf = async (label) => (await form.getByLabel(label, {exact: true}).first().boundingBox()).y;
  const [yNo, yDate, yStaff] = [await rowOf('見積番号'), await rowOf('見積日'), await rowOf('担当')];
  assert.ok(Math.abs(yNo - yDate) < 30 && Math.abs(yNo - yStaff) < 60, `${yNo} ${yDate} ${yStaff}`);
  await page.waitForTimeout(800);
  assert.deepEqual(await page.evaluate(overflowing), []);
  await page.screenshot({path: `${out}/items-estimate.png`});
  log('販売見積書の上の段・はみ出し OK');

  // ---- 備考（算出根拠）の「見積書に書く」：初めは書く（自動の文）・外すと欄もプレビューの備考も空・入れ直すと自動の文に戻る
  // （ユーザーの答え「自動で入れるが、オンオフでけせる」2026-11-03）
  {
    const it = form.locator('[data-item]').first();
    const write = it.getByRole('checkbox', {name: '見積書に書く'});
    const note = it.getByLabel('算出根拠');
    const inPreview = (t) => page.waitForFunction((x) => document.querySelector('[aria-label="見積書のプレビュー"]')?.textContent?.includes(x), t);
    const notInPreview = (t) => page.waitForFunction((x) => !document.querySelector('[aria-label="見積書のプレビュー"]')?.textContent?.includes(x), t);
    assert.equal(await write.isChecked(), true);
    const auto = await note.inputValue();
    assert.match(auto, /^定価[\d,]+円の/);
    await inPreview(auto);
    await write.uncheck();
    assert.equal(await note.inputValue(), '');
    assert.ok(await note.isDisabled());
    await notInPreview(auto);
    await it.screenshot({path: `${out}/items-note-off.png`});
    await write.check();
    assert.equal(await note.inputValue(), auto);
    await inPreview(auto);
    log('備考（算出根拠）の見積書に書く・書かない OK');
  }

  // ---- お気に入り：入れた商品は品目（シャワーチェア）ごとに出て、削除で外せる
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click(); // 印刷の前に、手で入れた商品をお気に入りへ
  await page.locator('.est-sheet [role="group"]').first().waitFor();
  await page.getByRole('button', {name: '閉じる'}).click();
  await page.getByRole('button', {name: /^＋ \d+つ目の(福祉用具|商品)を追加$/}).click();
  await page.getByRole('button', {name: '★ お気に入りから入力'}).last().click();
  const fav = page.getByRole('dialog', {name: 'お気に入りから入力'});
  const chairs = fav.getByRole('region', {name: 'シャワーチェア'});
  await chairs.waitFor();
  assert.ok((await chairs.innerText()).includes('見本のシャワーチェアAir ミドルワイドSPワンタッチ プレミアム ブルー'));
  assert.ok((await chairs.innerText()).includes('シャワーチェアAir コンパクトSPワンタッチ ブルー'));
  await page.screenshot({path: `${out}/items-favorites.png`});
  await fav.getByRole('button', {name: 'シャワーチェアAir コンパクトSPワンタッチ ブルーをお気に入りから削除'}).click();
  await fav.getByText('シャワーチェアAir コンパクトSPワンタッチ ブルー').waitFor({state: 'detached'});
  log('お気に入り（品目ごと・削除）OK');
  await fav.getByRole('button', {name: '閉じる'}).last().click();

  // ---- 最小フォントサイズのまね（小さい字を 12px より小さく出さない）でも、はみ出さない
  const ctx2 = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx2.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx2.addInitScript(() => {
    localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '[data-fit-inner] span, [data-fit-inner] div { font-size: max(12px, 1em) !important; }';
      document.head.append(s);
    });
  });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(url);
  await p2.getByRole('button', {name: '＋ 苅田町'}).click();
  const b2 = p2.locator('[data-item]').first();
  await b2.getByLabel('種目').selectOption('入浴補助用具');
  await b2.getByRole('combobox', {name: 'メーカー', exact: true}).waitFor({timeout: 60000}); // カタログを読み終わるとプルダウン
  await b2.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption({label: 'ほかのメーカー（打つ）'});
  await b2.getByRole('combobox', {name: 'メーカー（打つ）'}).fill('見本エイジフリー工業株式会社');
  await b2.getByRole('combobox', {name: 'メーカー（打つ）'}).press('Escape');
  await b2.getByLabel('商品名').fill('見本のシャワーチェアAir ミドルワイドSPワンタッチ プレミアム ブルー');
  await p2.getByRole('tab', {name: /^📄 申請書/}).click();
  await p2.locator('[aria-label="申請書のプレビュー"]').first().waitFor();
  await p2.waitForTimeout(1200);
  assert.deepEqual(await p2.evaluate(overflowing), []);
  await p2.getByRole('tab', {name: '📋 見積もり'}).click();
  await p2.waitForTimeout(1200);
  assert.deepEqual(await p2.evaluate(overflowing), []);
  log('最小フォントサイズでも はみ出し 0');

  assert.deepEqual(errors, []);
  console.log('ok: 型番から入力・税抜/税込/割引率・お気に入り（品目ごと・削除）・見積書の上の段・はみ出し');
} finally {
  await browser.close();
  server.close();
}

function log(...a) {
  console.log('•', ...a);
}
