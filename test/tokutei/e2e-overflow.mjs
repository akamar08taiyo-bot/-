// 文字のはみ出しの点検（2026-11-03 の全体のデバッグで作った。ユーザーの指示「文字のはみ出しやカタログの金額確認など、全ての項目でデバッグしてください」）。
// 8つの保険者（苅田町・行橋市・みやこ町・広域連合・福岡市・北九州市・久留米市・大分市）で、長い値（お客様名・住所・居宅介護支援事業所・ケアマネジャー・
// 商品名・メーカー・品番・理由・備考。すべて架空）を入れた3つの商品の申請書と販売見積書のプレビューを開き、欄（data-fit）の字が欄の外に出ていないかを数える。
// 1366px・390px（スマホ）と、ブラウザの「最小フォントサイズ」（12px）のまねの3とおり。
// 使い方：npm run -s build:tokutei のあと  node test/tokutei/e2e-overflow.mjs [出力フォルダ]

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
const log = (...a) => console.log('•', ...a);

/** 欄（data-fit）の中の字が、欄の外に出ていないか（e2e-items.mjs と同じ測り方）。はみ出している欄の文字を返す */
const overflowing = () => {
  const bad = [];
  for (const b of document.querySelectorAll('[data-fit]')) {
    const el = b.querySelector(':scope > [data-fit-inner]');
    const r = b.getBoundingClientRect();
    if (!el || !el.textContent.trim() || r.height < 1 || r.width < 1) continue;
    // 見える字だけ（行の終わりで折り返した全角の空白は欄の外にぶら下がるが、何も描かれない）
    const rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.textContent ?? '';
      for (let i = 0; i < s.length; i++) {
        if (/[\s\u3000]/.test(s[i])) continue;
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        for (const x of range.getClientRects()) if (x.width > 0 && x.height > 0) rects.push(x);
      }
    }
    if (!rects.length) continue;
    const [L, R, T, B] = [Math.min(...rects.map((x) => x.left)), Math.max(...rects.map((x) => x.right)), Math.min(...rects.map((x) => x.top)), Math.max(...rects.map((x) => x.bottom))];
    if (L < r.left - 1 || R > r.right + 1 || T < r.top - 1.5 || B > r.bottom + 1.5) bad.push(el.textContent.trim().slice(0, 30));
  }
  return bad;
};

// 長い値（すべて架空）
const ADDRESS = {
  kanda: '福岡県京都郡苅田町大字与原1234番地56　見本ハイツ苅田南第二ビル301号室',
  yukuhashi: '福岡県行橋市大字流末1234番地56　見本マンション行橋駅前東館1203号室',
  miyako: '福岡県京都郡みやこ町犀川大坂1234番地5　見本コーポ犀川第三203号室',
  kouiki: '福岡県築上郡築上町大字椎田1234番地56　見本レジデンス椎田南第一101号',
  fukuoka: '福岡県福岡市早良区小田部4丁目1234番地56　見本マンション小田部東館1203号室',
  kitakyushu: '福岡県北九州市小倉北区重住3丁目1234番56号　見本ハイツ重住南第二ビル301号室',
  kurume: '福岡県久留米市見本町1234番地56　見本マンション久留米駅前東館1203号室',
  oita: '大分県大分市大字見本1234番地56　見本ハイツ大分南第二ビル301号室',
};
const ITEMS = [
  {cat: '入浴補助用具', name: '見本のシャワーチェア 折りたたみ式 背もたれ・ひじ掛け付き（ワイドタイプ）ブルー', maker: '見本エイジフリー工業株式会社', code: 'MIHON-L41431WIDE-BL', list: '135000'},
  {cat: '腰掛便座', name: '見本の家具調ポータブルトイレ ひじ掛けはねあげ 暖房便座・快適脱臭タイプ', maker: '見本化成工業株式会社', code: 'MIHON-534-031-DX', list: '111500'},
  {cat: '歩行補助つえ', name: '見本の四点杖 補助グリップ付き アルミ製 伸縮式（ロング）', maker: '見本ホームプロダクツ株式会社', code: 'MIHON-WB5257-LONG', list: '9900'},
];
const REASON = '見本：浴室の床が滑りやすく、立ち座りの動作が不安定なため、背もたれ・ひじ掛けのあるいすで安全に洗身できるようにする。転倒の不安を減らし、ご本人ができる動作を続けられるようにするため。';

async function fillIfThere(loc, value) {
  if ((await loc.count()) === 0) return false;
  await loc.first().fill(value);
  return true;
}

async function stressSale(page, ins) {
  await page.goto(url);
  await page.getByRole('button', {name: '＋ 苅田町'}).click();
  await page.getByLabel('保険者', {exact: true}).selectOption(ins);
  await fillIfThere(page.getByRole('textbox', {name: 'お客様名', exact: true}), '見本長谷川原　美千代子');
  await fillIfThere(page.getByLabel('フリガナ', {exact: true}), 'ミホンハセガワラ　ミチヨコ');
  await fillIfThere(page.getByLabel('被保険者番号', {exact: true}), '0001234567');
  await fillIfThere(page.getByRole('textbox', {name: '住所', exact: true}), ADDRESS[ins]);
  await fillIfThere(page.getByRole('textbox', {name: '電話', exact: true}), '0930-00-0000');
  for (let i = 0; i < ITEMS.length; i++) {
    if (i > 0) await page.getByRole('button', {name: /^＋ \d+つ目の(福祉用具|商品)を追加$/}).click();
    const b = page.locator('[data-item]').nth(i);
    const it = ITEMS[i];
    await b.getByLabel('種目').selectOption(it.cat);
    await b.getByRole('combobox', {name: 'メーカー', exact: true}).waitFor({timeout: 60000});
    await b.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption({label: 'ほかのメーカー（打つ）'});
    await b.getByRole('combobox', {name: 'メーカー（打つ）'}).fill(it.maker);
    await b.getByRole('combobox', {name: 'メーカー（打つ）'}).press('Escape');
    await b.getByLabel('商品名').fill(it.name);
    await fillIfThere(b.getByLabel('品番', {exact: true}), it.code);
    await b.getByLabel('定価').fill(it.list);
    await b.getByLabel('定価').blur();
  }
  await page.getByRole('tab', {name: /^📄 申請書/}).click();
  await page.locator('[aria-label="申請書のプレビュー"]').first().waitFor();
  await fillIfThere(page.getByLabel('居宅介護支援事業所', {exact: true}), '社会福祉法人見本福祉会　見本居宅介護支援事業所みやこ南');
  await fillIfThere(page.getByLabel('ケアマネジャー', {exact: true}), '見本長谷川原　一郎太');
  const reasons = page.locator('textarea[aria-label$="が必要な理由"], input[aria-label$="が必要な理由"]');
  for (let i = 0; i < (await reasons.count()); i++) await reasons.nth(i).fill(REASON);
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const results = [];
try {
  for (const [tag, opts, minFont] of [
    ['pc', {viewport: {width: 1366, height: 900}}, false],
    ['phone', {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: true, hasTouch: true}, false],
    ['minfont', {viewport: {width: 1366, height: 900}}, true],
  ]) {
    const ctx = await browser.newContext({...opts, locale: 'ja-JP'});
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await ctx.addInitScript((mf) => {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
      if (mf)
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style');
          s.textContent = '[data-fit-inner] span, [data-fit-inner] div { font-size: max(12px, 1em) !important; }';
          document.head.append(s);
        });
    }, minFont);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => void d.accept());
    for (const ins of Object.keys(ADDRESS)) {
      await stressSale(page, ins);
      const shinsei = await page.evaluate(overflowing);
      if (process.env.OVF_DETAIL && shinsei.length) {
        const {detail} = await import(process.env.OVF_DETAIL);
        const d = await page.evaluate(detail);
        console.log(JSON.stringify(d, null, 1));
        for (const [i, x] of d.entries()) await page.screenshot({path: `${out}/${tag}-${ins}-ovf${i}.png`, clip: {x: Math.max(0, x.box[0] - 40), y: Math.max(0, x.box[1] - 40), width: Math.max(x.box[2], x.ink[2]) + 120, height: Math.max(x.box[3], x.ink[3]) + 80}}).catch(() => {});
      }
      await page.locator('[aria-label="申請書のプレビュー"]').first().screenshot({path: `${out}/${tag}-${ins}-申請書.png`}).catch(() => {});
      // Excel も保存しておく（LibreOffice で画像にして、欄に入っているかを目で見る。taiyo-excel-export スキルの render.sh）
      if (tag === 'pc') {
        const [x] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).first().click()]);
        await x.saveAs(`${out}/${ins}-申請書.xlsx`);
      }
      await page.getByRole('tab', {name: '📋 見積もり'}).click();
      await page.waitForTimeout(1500);
      const estimate = await page.evaluate(overflowing);
      if (tag === 'pc') {
        await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
        const [x] = await Promise.all([page.waitForEvent('download'), page.locator('.print-toolbar').getByRole('button', {name: '📗 Excelで保存'}).click()]);
        await x.saveAs(`${out}/${ins}-見積書.xlsx`);
        await page.getByRole('button', {name: '閉じる'}).click();
      }
      await page.screenshot({path: `${out}/${tag}-${ins}-見積書.png`});
      results.push({tag, ins, shinsei, estimate});
      log(`${tag} ${ins}：申請書 ${shinsei.length} 件・見積書 ${estimate.length} 件`, shinsei.concat(estimate).slice(0, 4).join(' / '));
    }
    assert.deepEqual(errors, [], tag);
    await ctx.close();
  }
  const bad = results.filter((r) => r.shinsei.length || r.estimate.length);
  assert.deepEqual(bad, []);
  console.log('ok: 8つの保険者の申請書・販売見積書のプレビューで、長い値でも欄からはみ出さない（1366px・390px・最小フォントサイズ）');
} finally {
  await browser.close();
  server.close();
}
