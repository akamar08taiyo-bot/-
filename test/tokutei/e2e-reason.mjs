// 福祉用具が必要な理由の改行（ユーザーの指摘「申請書の理由が変になっている」2026-11-13。北九州市の支給申請書で「ひじ掛／けの／…立ち座りで／き、介」と行が割れた）：
// アプリで改行を入れる欄（北九州市・みやこ町・福岡市の理由のかたまり、大分市の1行ずつの欄）は、プレビューで折り返し直さない（行の数がアプリの改行と同じ）・
// 欄からはみ出さない。Windows の ＭＳ 明朝の小さい字は字の幅が数%広く出るので、字を 12% 広くしたまね（letter-spacing）でも同じになるかを見る。
// 改行を入れない保険者（行橋市・苅田町・広域連合）は、画面で欄の幅に折り返すだけ（欄に入る）。
// 使い方：npm run -s build:tokutei のあと  node test/tokutei/e2e-reason.mjs [出力フォルダ]
import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, {recursive: true});
const dist = new URL('../../dist-tokutei/', import.meta.url).pathname;
const server = createServer((req, res) => {
  const p = (req.url ?? '/').split('?')[0];
  const file = p.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    res.writeHead(200, {'content-type': file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'});
    res.end(readFileSync(join(dist, file)));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5194);
await new Promise((r) => server.listen(port, r));
const url = `http://localhost:${port}/tokutei/`;
const log = (...a) => console.log('•', ...a);

// 理由（架空の文例。ユーザーのスクリーンショットと同じくらいの長さ）
const REASON = '浴室での立ち座りに介助が必要で、介助者の負担が大きくなっている。ひじ掛けのあるシャワーチェアを使用することで、本人がひじ掛けを支えに立ち座りでき、介助者の負担を減らしながら入浴を続けられる。';
const INSURERS = {kitakyushu: '福岡県北九州市小倉北区城内1-1', miyako: '福岡県京都郡みやこ町犀川大坂1-1', fukuoka: '福岡県福岡市早良区小田部1-2-3', oita: '大分県大分市荷揚町1-1', yukuhashi: '福岡県行橋市中央1-1', kanda: '福岡県京都郡苅田町富久町1-1', kouiki: '福岡県築上郡築上町大字椎田1-1'};
const PRE_WRAPPED = new Set(['kitakyushu', 'miyako', 'fukuoka', 'oita']);

/** 理由の字の入った欄：行の数（見えている行）・アプリの改行の数・欄からはみ出していないか */
// 丸で囲む欄（みやこ町の「有・無」のある理由の欄）は data-fit ではなく、1字ずつ位置を決めて描く（読み上げ用の .sr-only に全文）
const reasonBoxes = () =>
  [...document.querySelectorAll('[data-fit], [aria-label="申請書のプレビュー"] div:has(> .sr-only)')]
    .filter((b) => !b.matches('[data-fit] *'))
    .filter((b) => (b.textContent ?? '').includes('浴室での立ち座り') || (b.textContent ?? '').includes('入浴を続けられる'))
    .map((b) => {
      const marked = !b.hasAttribute('data-fit');
      const inner = marked ? b : b.querySelector(':scope > [data-fit-inner]');
      const r = b.getBoundingClientRect();
      const tops = new Set();
      let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
      const walker = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement?.closest('.sr-only')) continue;
        const s = n.textContent ?? '';
        for (let i = 0; i < s.length; i++) {
          if (/[\s　]/.test(s[i])) continue;
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          for (const x of range.getClientRects()) {
            if (!x.width) continue;
            tops.add(Math.round(x.top));
            L = Math.min(L, x.left);
            R = Math.max(R, x.right);
            T = Math.min(T, x.top);
            B = Math.max(B, x.bottom);
          }
        }
      }
      // 近い高さ（2px 以内）は同じ行
      const rows = [...tops].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 2).length;
      const text = marked ? (b.querySelector(':scope > .sr-only')?.textContent ?? '') : (inner?.innerText ?? '');
      return {rows, appLines: text.split('\n').filter((l) => l.trim()).length, inside: L >= r.left - 1 && R <= r.right + 1 && T >= r.top - 1.5 && B <= r.bottom + 1.5, text: text.slice(0, 40)};
    });

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  for (const wide of [false, true]) {
    const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await ctx.addInitScript((w) => {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
      if (w)
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style');
          s.textContent = '[data-fit-inner], [data-fit-inner] * { letter-spacing: 0.12em; }';
          document.head.append(s);
        });
    }, wide);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => void d.accept());
    for (const [ins, address] of Object.entries(INSURERS)) {
      await page.goto(url);
      await page.getByRole('button', {name: '＋ 苅田町'}).click();
      await page.getByLabel('保険者', {exact: true}).selectOption(ins);
      await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本 花子');
      await page.getByRole('textbox', {name: '住所', exact: true}).fill(address);
      const b = page.locator('[data-item]').first();
      await b.getByLabel('種目').selectOption('入浴補助用具');
      await b.getByLabel('商品名').fill('見本のシャワーチェア');
      await b.getByLabel('定価').fill('24000');
      await b.getByLabel('定価').blur();
      await page.getByRole('tab', {name: /^📄 申請書/}).click();
      await page.locator('[aria-label="申請書のプレビュー"]').first().waitFor();
      await page.locator('textarea[aria-label$="が必要な理由"], input[aria-label$="が必要な理由"]').first().fill(REASON);
      await page.waitForTimeout(1500);
      const boxes = await page.evaluate(reasonBoxes);
      assert.ok(boxes.length > 0, `${ins}: 理由の欄が見つからない`);
      for (const x of boxes) {
        assert.ok(x.inside, `${ins}${wide ? '（字を広く）' : ''}: 理由が欄からはみ出している ${x.text}`);
        // アプリで改行した保険者は、見えている行の数＝アプリの改行（画面で折り返し直さない）
        if (PRE_WRAPPED.has(ins)) assert.equal(x.rows, x.appLines, `${ins}${wide ? '（字を広く）' : ''}: 行が割れている ${x.text}（${x.rows} 行・改行 ${x.appLines}）`);
      }
      const shot = page.locator('[data-fit], [aria-label="申請書のプレビュー"] div:has(> .sr-only)').filter({hasText: '浴室での立ち座り'}).first();
      await shot.scrollIntoViewIfNeeded();
      await shot.screenshot({path: `${out}/reason-${ins}${wide ? '-wide' : ''}.png`}).catch(() => {});
      log(`${ins}${wide ? '（字を 12% 広く）' : ''}：${boxes.map((x) => `${x.rows} 行（改行 ${x.appLines}）`).join('・')} 欄に入る OK`);
    }
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('ok: 理由の欄は行が割れず、欄に入る（7つの保険者・字を広くしたまねでも）');
} finally {
  await browser.close();
  server.close();
}
