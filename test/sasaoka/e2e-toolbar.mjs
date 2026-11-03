// 様邸の画面の5つのタブ（住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書）の上の段が、どのタブでも同じ形・同じ位置・同じ大きさ・同じ色であること
// （ユーザーの指示「各タブでEXCEL印刷や保存など、表記の方法やタブの大きさ、順番を統一する。カタログ印刷など、個別のボタンについては、例外とする。
//  基本的な並びは、申請書をEXCELで保存、申請書（見積書を印刷）、削除（白紙に戻すは不要） それ以外の独自の機能（例えば、売上伝票発行依頼書や発注書を作成、カタログを印刷など）
//  は行を変えて、真下に統一して設置する タブを切り替えても、位置や大きさ、色などは変えない、同じ機能であればボタンの名前も変えない）行の位置も変えない（基本的に中央揃え）」2026-10-28）：
//   上の段＝「📗 Excelで保存」「🖨 〇〇を印刷」「その他 ▼」（中は「✉ メールで送付」とタブごとの機能、最後に削除。2026-11-03 にプルダウン）。様邸のタブは画面の上の帯。
//   （2026-10-30 に「📗 〇〇をExcelで保存」と「📦 まとめて保存」を「📗 Excelで保存」の1つにして、まとめて保存の所に「✉ メールで送付」。DocsDialog.tsx）
//   特定福祉用具の2つのタブ（中は特定福祉用具のアプリ）も同じ所に出し、押すと中のアプリが保存・印刷などをする（中のアプリの上の段は出さない）。
//   理由書のタブにも「🖨 理由書を印刷」（2ページとも）。
// usage: node e2e-toolbar.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html・<サイト>/tokutei/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';
import {moreItems, openMore} from './more.mjs';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const asked = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => {
  asked.push(d.message());
  void d.accept();
});
const frame = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');

await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
await page.getByRole('form', {name: '申請書'}).waitFor();
await page.keyboard.type('みほん　ろくろう');
await page.keyboard.press('Enter');
await page.keyboard.type('見本 六郎');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);

const TABS = [
  {tab: '📝 住宅改修申請書', book: '申請書', more: ['✉ メールで送付']},
  {tab: '📋 工事見積書', book: '見積書', more: ['✉ メールで送付', '💾 保存', '🧾 売上伝票を作成', '🛒 発注書を作成', '複製']},
  // 並び：Excelで保存・〇〇を印刷・カタログを印刷・メールで送付・販売受注簿を作成・売上伝票を作成、最後に削除（ユーザーの指示 2026-11-02）
  {tab: '🛁 特定福祉用具申請書', book: '申請書', more: ['🖨 カタログを印刷', '✉ メールで送付'], tokutei: true},
  {tab: '🏷 販売見積書', book: '見積書', more: ['🖨 カタログを印刷', '✉ メールで送付', '📤 販売受注簿を作成', '🧾 売上伝票を作成'], tokutei: true},
  {tab: '📄 理由書', book: '理由書', more: ['✉ メールで送付']},
];
const row1 = page.getByRole('group', {name: '保存・印刷'});
const menu = page.getByRole('menu', {name: 'その他'});

/** タブを開いて、上の段のボタンの名前・位置・色を読む */
const open = async ({tab, tokutei}) => {
  await page.getByRole('tab', {name: tab}).click();
  await page.getByRole('tab', {name: tab, selected: true}).waitFor();
  if (tokutei) await frame.getByLabel('商品名').first().waitFor({timeout: 20000});
  await row1.waitFor();
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    };
    const g1 = document.querySelector('[role="group"][aria-label="保存・印刷"]');
    // 「その他 ▼」の中（閉じていて見えない）はのぞく
    const items = [...g1.querySelectorAll('button, a, label')].filter((c) => !c.closest('[role="menu"]') && c.getBoundingClientRect().width > 0);
    return {
      b1: items.map((b) => ({text: b.textContent.trim(), ...box(b), bg: getComputedStyle(b).backgroundColor, font: getComputedStyle(b).fontSize, cls: b.className})),
      r1: box(g1),
      name: box(document.querySelector('h1')),
      tabs: box(document.querySelector('header [role="tablist"]')),
      scroll: document.documentElement.scrollWidth - innerWidth,
    };
  });
};

for (const width of [1366, 1600, 390]) {
  await page.setViewportSize({width, height: width === 390 ? 844 : 900});
  const seen = [];
  for (const t of TABS) {
    const m = await open(t);
    // 上の段は Excelで保存・〇〇を印刷・その他 ▼ の1段（ユーザーの指示「ここの部分がごちゃごちゃしているので、プルダウンにする」2026-11-03）
    assert.deepEqual(m.b1.map((b) => b.text), ['📗 Excelで保存', `🖨 ${t.book}を印刷`, 'その他 ▼'], `${width} ${t.tab}`);
    // 「その他 ▼」の中：タブごとの機能、最後に削除（ユーザーの指示「…メールで送付、それから、販売受注簿を作成、売上伝票…を作成、それから最後に、削除」2026-11-02）
    assert.deepEqual(await moreItems(page), [...t.more, '削除'], `${width} ${t.tab}`);
    assert.equal(m.scroll <= 0, true, `${width} ${t.tab} 横にはみ出す`);
    // 様邸のタブは画面の上の帯（ユーザーの指示「メインタブが二つある為、わかりづらい」2026-11-03）
    assert.ok(m.tabs.w > 0 && m.tabs.y < m.name.y, `${width} ${t.tab} タブが上の帯にない ${JSON.stringify(m.tabs)}`);
    if (width >= 1024) {
      // パソコンは名前のすぐ右・同じ高さ
      assert.ok(m.r1.x > m.name.x + m.name.w && m.r1.x - (m.name.x + m.name.w) < 120, `${width} ${t.tab} 名前のすぐ右にない ${JSON.stringify(m.name)} ${JSON.stringify(m.r1)}`);
    }
    if (width === 390) {
      // スマホは同じ幅の2列（ユーザーの指示「携帯で見た時のボタンの配置…ガタガタして、若干ずれている」2026-10-29）：ボタンはどれも同じ幅、左の端は2つの列か、奇数の最後はまん中
      assert.ok(m.b1.every((b) => Math.abs(b.w - m.b1[0].w) <= 1), `${width} ${t.tab} ボタンの幅 ${m.b1.map((b) => Math.round(b.w))}`);
      assert.ok(new Set(m.b1.map((b) => Math.round(b.x))).size <= 3, `${width} ${t.tab} ボタンの左の端`);
    }
    seen.push({t, m});
    if (width === 1366) await page.screenshot({path: path.join(outDir, `toolbar-${TABS.indexOf(t) + 1}.png`), clip: {x: 0, y: 0, width, height: 290}});
    if (width === 390) await page.screenshot({path: path.join(outDir, `toolbar-phone-${TABS.indexOf(t) + 1}.png`), clip: {x: 0, y: 0, width, height: 600}});
  }
  // どのタブでも、上の段のボタンは同じ位置・同じ大きさ・同じ色・同じ字の大きさ（印刷の書類の名前はどれも3字）
  const [first] = seen;
  for (const {t, m} of seen.slice(1)) {
    for (let i = 0; i < first.m.b1.length; i++) {
      const a = first.m.b1[i];
      const b = m.b1[i];
      for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(a[k] - b[k]) <= 1, `${width} ${t.tab} ${b.text} の ${k}：${a[k]} → ${b[k]}`);
      assert.equal(b.bg, a.bg, `${width} ${t.tab} ${b.text} の色`);
      assert.equal(b.font, a.font, `${width} ${t.tab} ${b.text} の字の大きさ`);
    }
  }
  // 色：Excel は薄い緑・印刷は薄い水色・その他は白（ui.tsx の softGreen・softSky・white。Tailwind の色は oklab で返るので class で見る）
  for (const {t, m} of seen) assert.deepEqual(m.b1.map((b) => b.cls.match(/\bbg-(emerald-50|sky-50|white)\b/)?.[1]), ['emerald-50', 'sky-50', 'white'], t.tab);
  log(`${width}px：5つのタブとも Excelで保存・〇〇を印刷・その他 ▼（中はタブごとの機能、最後に削除）。同じ位置・大きさ・色 OK`);
}
await page.setViewportSize({width: 1366, height: 900});

// ---------------- 特定福祉用具の2つのタブ：上の段のボタンで中のアプリが動く
await open(TABS[2]);
assert.equal(await frame.getByRole('group', {name: '保存・印刷'}).count(), 0); // 中のアプリの上の段は出さない
// 📗 Excelで保存：初めは特定福祉用具申請書（このタブ）。商品がないうちは選べない（特定福祉用具のアプリが作らない）
await row1.getByRole('button', {name: '📗 Excelで保存'}).click();
const xdlg = page.getByRole('dialog', {name: 'Excelで保存'});
assert.equal(await xdlg.getByRole('checkbox', {name: /^特定福祉用具申請書/}).isDisabled(), true);
assert.equal(await xdlg.getByText('（特定福祉用具の商品がありません）').count(), 2);
await xdlg.getByRole('button', {name: 'やめる'}).click();
await row1.getByRole('button', {name: '🖨 申請書を印刷'}).click();
await frame.locator('.print-overlay').waitFor();
await frame.locator('.print-overlay').getByRole('button', {name: '閉じる'}).click();
await (await openMore(page)).getByRole('button', {name: '🖨 カタログを印刷'}).click();
await frame.getByRole('group', {name: '印刷するページ'}).waitFor({timeout: 30000});
await frame.getByRole('button', {name: '閉じる', exact: true}).click();
log('特定福祉用具申請書：Excelで保存（商品がないうちは選べない）・申請書を印刷・カタログを印刷 OK');

await open(TABS[3]);
await (await openMore(page)).getByRole('button', {name: '🧾 売上伝票を作成'}).click();
await frame.getByRole('group', {name: '売上伝票に入れる内容'}).waitFor();
await frame.getByRole('button', {name: '閉じる'}).first().click();
// 商品がないうちは「販売受注簿を作成」を押しても開かない（中のアプリが知らせる）
const pages = ctx.pages().length;
await (await openMore(page)).getByRole('link', {name: '📤 販売受注簿を作成'}).click();
await frame.getByText('商品がありません').waitFor();
await page.waitForTimeout(500);
assert.equal(ctx.pages().length, pages);
log('販売見積書：売上伝票を作成・商品がなければ受注簿は開かない OK');

// ---------------- 理由書の印刷：2ページとも初めから印刷する
await open(TABS[4]);
await row1.getByRole('button', {name: '🖨 理由書を印刷'}).click();
const printPages = page.getByRole('group', {name: '印刷するページ'});
await page.locator('.print-overlay').getByText('理由書（A4縦）').waitFor();
const checks = await printPages.getByRole('checkbox').evaluateAll((xs) => xs.map((x) => x.checked));
assert.deepEqual(checks, [true, true]);
assert.equal(await page.title(), '見本六郎様住宅改修理由書');
await page.screenshot({path: path.join(outDir, 'toolbar-riyu-print.png')});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await page.locator('.print-overlay').waitFor({state: 'detached'});
log('理由書を印刷（2ページとも）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
