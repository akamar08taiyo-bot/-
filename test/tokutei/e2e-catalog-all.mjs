// 介援隊カタログの全商品を、カタログの窓で実際に押して確かめる（ユーザーの指示「カタログと商品が違ったものがあった。そこは絶対に間違わないでほしいので、
// 徹底的に検査、確認する」2026-11-09）。期待する値は、アプリと同じ読み取り（catalogItems.ts の parseCatalogPage。ビルドで作った catalog/text.json と
// catalog/rules.json から）をこのテストの中で作る。金額はテストに書かない（ユーザーの指示「リポジトリに仕入れや定価は残さない」）。
//   ① どの品番も、ページの絵の上の品番の字の所（品番の字がなければ枠のまん中）と商品名の所に、その商品の押せる枠がある（となりの商品の枠ではない）
//   ② 色・品番がいくつもある商品：枠を押すと出る「色・品番を選ぶ」に、品番・色や大きさ・定価が、読み取りどおり・その順で並ぶ（アプリが罫線を読めていることも）
//   ③ 品番が1つの商品：枠を押すと商品の欄に入る。入った商品名・品番・定価・TAIS・メーカー・税区分が読み取りどおり（新しい見積もりで1つずつ）
//   ④ 色・品番を選ぶ商品のいくつか（同じ品番の S と M・4色・金額のちがう組）：選んで、入った値が選んだ品番のもの
// 使い方：npm run -s build:tokutei のあと node test/tokutei/e2e-catalog-all.mjs [出力フォルダ]

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {CATALOG} from '../../src/tokutei/catalog.ts';
import {parseCatalogPage} from '../../src/tokutei/catalogItems.ts';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, {recursive: true});
const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;

// 期待する値：アプリと同じ文字・罫線から
const text = JSON.parse(readFileSync(join(dist, 'catalog/text.json'), 'utf8'));
const rules = JSON.parse(readFileSync(join(dist, 'catalog/rules.json'), 'utf8'));
const tokensOf = (file) => text[file].map(([s, x, y, w, h]) => ({s, x, y, w, h}));
const expected = CATALOG.map((c) => parseCatalogPage(tokensOf(c.file), c, rules[c.file].map(([x, y, w]) => ({x, y, w}))));
const nameOf = (p, v) => [p.name, v.label].filter(Boolean).join(' ');
const yen = (n) => `¥${n.toLocaleString('ja-JP')}`;

const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const catalog = /\/catalog\/([\w.-]+\.(?:pdf|json|jpg))$/.exec(path);
  const f = catalog ? join('catalog', catalog[1]) : path.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    const body = readFileSync(join(dist, f));
    res.writeHead(200, {'content-type': catalog ? (catalog[1].endsWith('.json') ? 'application/json' : catalog[1].endsWith('.jpg') ? 'image/jpeg' : 'application/pdf') : f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5193);
await new Promise((r) => server.listen(port, r));
const url = `http://localhost:${port}/tokutei/`;

/** 保存された見積もりの、開いている案件の1つ目の商品（IndexedDB。保存は打ってから少しあと） */
const firstItem = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('taiyo-tokutei', 1);
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readonly');
          const g = tx.objectStore('kv').get('sales');
          g.onsuccess = () => {
            const sales = Array.isArray(g.result) ? g.result : [];
            const sale = sales.at(-1);
            resolve(sale?.items?.[0] ?? null);
          };
          g.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

async function waitItem(page, want) {
  for (let i = 0; i < 40; i++) {
    const it = await firstItem(page);
    if (it && it.code === want.code && it.name === want.name) return it;
    await page.waitForTimeout(150);
  }
  return firstItem(page);
}

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const problems = [];
const bad = (msg) => {
  problems.push(msg);
  console.log('NG', msg);
};
try {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto(url);

  const viewer = page.getByRole('dialog', {name: 'カタログ'});
  /** 新しい見積もりを作って、1つ目の商品の欄の「📖 カタログから商品検索」でカタログの窓（全部のページ）を開き、ページ i を出す */
  async function openAt(i, fresh) {
    if (fresh) {
      await page.goto(url);
      await page.getByRole('button', {name: '＋ 苅田町'}).click();
    }
    if (!(await viewer.isVisible().catch(() => false))) await page.getByRole('button', {name: '📖 カタログから商品検索'}).first().click();
    await viewer.waitFor();
    const pages = viewer.getByRole('group', {name: 'カタログのページ'});
    await pages.getByRole('button', {name: new RegExp(`p\\.${CATALOG[i].page}(?!\\d)`)}).click();
    const n = expected[i].length;
    await page.waitForFunction((n) => document.querySelectorAll('[data-hotspot]').length === n && [...document.querySelectorAll('[aria-label="カタログのページの絵"] img')].some((im) => im.complete && im.naturalWidth > 0), n, {timeout: 60000});
  }
  /** ページの pt の点にある押せる枠（その点を窓の中に動かしてから見る） */
  async function keyAt(key, x, y) {
    return page.evaluate(
      ({key, x, y}) => {
        const view = document.querySelector('[aria-label="カタログのページの絵"]');
        const img = view.querySelector('img');
        const hot = [...document.querySelectorAll('[data-hotspot]')].find((b) => b.dataset.key === key);
        if (!hot) return 'なし';
        const k = 200 / 72;
        const at = () => {
          const r = img.getBoundingClientRect();
          return {cx: r.left + ((x * k) / img.naturalWidth) * r.width, cy: r.top + ((y * k) / img.naturalHeight) * r.height};
        };
        // その点が窓のまん中に来るように絵を動かす
        const v = view.getBoundingClientRect();
        let p = at();
        view.scrollLeft += p.cx - (v.left + v.width / 2);
        view.scrollTop += p.cy - (v.top + v.height / 2);
        p = at();
        const el = document.elementFromPoint(p.cx, p.cy);
        return el?.closest('[data-hotspot]')?.dataset.key ?? `枠の外（${el?.tagName ?? '?'}）`;
      },
      {key, x, y},
    );
  }

  let checkedPoints = 0;
  let checkedLists = 0;
  let checkedPicks = 0;
  for (let i = 0; i < CATALOG.length; i++) {
    const c = CATALOG[i];
    const toks = tokensOf(c.file).map((t) => ({...t, s: t.s.normalize('NFKC').trim()}));
    await openAt(i, true);
    // ① 押せる枠の位置（品番の字・商品名の所）
    for (const p of expected[i]) {
      const b = p.box;
      const points = [{what: '商品名', x: b.x + 12, y: b.y + 8}];
      for (const v of p.variants) {
        const t = toks.find((t) => t.s.split(/[、,，\s]+/).includes(v.code) && t.x >= b.x - 2 && t.x <= b.x + b.w && t.y >= b.y && t.y <= b.y + b.h + 2);
        points.push(t ? {what: `品番 ${v.code}`, x: t.x + t.w / 2, y: t.y - t.h / 2} : {what: `品番 ${v.code}（枠のまん中）`, x: b.x + b.w / 2, y: b.y + b.h / 2});
      }
      for (const pt of points) {
        const got = await keyAt(p.key, pt.x, pt.y);
        checkedPoints++;
        if (got !== p.key) bad(`p.${c.page} ${p.name}：${pt.what}の所が ${got === 'なし' ? '枠なし' : (expected[i].find((q) => q.key === got)?.name ?? got)}`);
      }
    }
    // ② 色・品番がいくつもある商品：選ぶ欄の中身
    for (const p of expected[i].filter((p) => p.variants.length > 1)) {
      await openAt(i, false);
      const pt = {x: p.box.x + 12, y: p.box.y + 8};
      await keyAt(p.key, pt.x, pt.y);
      await viewer.locator(`[data-hotspot][data-key="${p.key}"]`).click({position: {x: 12, y: 10}});
      const chooser = viewer.getByRole('dialog', {name: '色・品番を選ぶ'});
      await chooser.waitFor();
      const title = (await chooser.locator('span.font-bold').first().innerText()).trim();
      if (title !== p.name) bad(`p.${c.page} ${p.name}：選ぶ欄の題が「${title}」`);
      const rows = await chooser.getByRole('button').filter({hasNotText: '✕'}).allInnerTexts();
      const got = rows.map((r) => r.replace(/\s+/g, ' ').trim());
      const want = p.variants.map((v) => [v.label || p.name, v.code, v.listPrice > 0 ? `定価 ${yen(v.listPrice)}` : ''].filter(Boolean).join(' '));
      checkedLists++;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad(`p.${c.page} ${p.name}：選ぶ欄\n   画面 ${JSON.stringify(got)}\n   読取 ${JSON.stringify(want)}`);
      await chooser.getByRole('button', {name: '選ぶのをやめる'}).click();
    }
    // ③ 品番が1つの商品：押すと入る
    for (const p of expected[i].filter((p) => p.variants.length === 1)) {
      await openAt(i, true);
      await keyAt(p.key, p.box.x + 12, p.box.y + 8);
      await viewer.locator(`[data-hotspot][data-key="${p.key}"]`).click({position: {x: 12, y: 10}});
      const v = p.variants[0];
      const it = await waitItem(page, {code: v.code, name: nameOf(p, v)});
      checkedPicks++;
      const want = {name: nameOf(p, v), code: v.code, listPrice: v.listPrice, tais: v.tais, ...(p.maker ? {maker: p.maker} : {}), ...(p.taxFree ? {taxType: '非課税'} : {})};
      const diff = Object.entries(want).filter(([k, val]) => it?.[k] !== val);
      if (diff.length) bad(`p.${c.page} ${p.name}：入った値 ${diff.map(([k, val]) => `${k}=${JSON.stringify(it?.[k])}（読取 ${JSON.stringify(val)}）`).join(' ')}`);
    }
    console.log(`p.${c.page}：${expected[i].length} 商品`);
  }
  // ④ 選ぶ欄から選ぶ（同じ品番の S と M・4色・金額のちがう組・M と L）
  const picks = [
    [136, 'SAVH', 'ハイ'],
    [154, 'EA4-102', 'ブラック'],
    [154, 'EA4-102', 'ピンクフラワー'],
    [137, '261-W2981', 'M'],
    [51, '0973', 'L ウエスト85～110cm'],
    [44, '536-530', '標準 16-26 グリーン'],
    [136, 'SW5310', 'シルバー スリム タイプ'],
  ];
  for (const [no, code, label] of picks) {
    const i = CATALOG.findIndex((c) => c.page === no);
    const p = expected[i].find((p) => p.variants.some((v) => v.code === code && v.label === label));
    assert.ok(p, `${no} ${code} ${label}`);
    const k = p.variants.findIndex((v) => v.code === code && v.label === label);
    const v = p.variants[k];
    await openAt(i, true);
    await keyAt(p.key, p.box.x + 12, p.box.y + 8);
    await viewer.locator(`[data-hotspot][data-key="${p.key}"]`).click({position: {x: 12, y: 10}});
    const chooser = viewer.getByRole('dialog', {name: '色・品番を選ぶ'});
    await chooser.getByRole('button').filter({hasNotText: '✕'}).nth(k).click();
    const it = await waitItem(page, {code: v.code, name: nameOf(p, v)});
    checkedPicks++;
    const want = {name: nameOf(p, v), code: v.code, listPrice: v.listPrice, tais: v.tais};
    const diff = Object.entries(want).filter(([kk, val]) => it?.[kk] !== val);
    if (diff.length) bad(`選んだ p.${no} ${code} ${label}：${diff.map(([kk, val]) => `${kk}=${JSON.stringify(it?.[kk])}（読取 ${JSON.stringify(val)}）`).join(' ')}`);
  }
  await page.screenshot({path: `${out}/catalog-all-last.png`});
  assert.deepEqual(errors, []);
  assert.deepEqual(problems, [], `${problems.length} 件`);
  console.log(`ok: カタログの窓：枠の位置 ${checkedPoints} 点・選ぶ欄 ${checkedLists} 商品・入れた値 ${checkedPicks} 件（全 ${CATALOG.length} ページ）`);
} finally {
  await browser.close();
  server.close();
}
