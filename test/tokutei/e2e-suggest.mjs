// 居宅介護支援事業所・ケアマネジャーの候補を「▼」のリストから選ぶ・リストから消す（ユーザーの指示「候補一覧は常時表示しない　リストから選べるようにする。
// リスト一覧になった場合も消せるようにする」2026-10-28）と、住所を入れると郵便番号が入る（「住所のみ入力した場合、逆に郵便番号を自動で入力される」）。
// 事業所の名前・住所は架空のもの
// 使い方：npm run -s build:tokutei のあと  node test/tokutei/e2e-suggest.mjs [出力フォルダ]

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
  const file = path.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    const body = readFileSync(join(dist, file));
    res.writeHead(200, {'content-type': file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'});
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.E2E_PORT ?? 5192);
await new Promise((r) => server.listen(port, r));
const url = `http://localhost:${port}/tokutei/`;

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

  const office = page.getByRole('textbox', {name: '居宅介護支援事業所'});
  const toggle = page.getByRole('button', {name: '居宅介護支援事業所の候補'});
  const newSale = async (careOffice) => {
    if (!(await page.getByRole('button', {name: '＋ 苅田町'}).count())) await page.getByRole('button', {name: '← 見積もりの一覧へ'}).click();
    await page.getByRole('button', {name: '＋ 苅田町'}).click();
    await office.waitFor();
    if (careOffice) {
      await office.fill(careOffice);
      await page.waitForTimeout(600);
    }
  };
  await newSale('見本居宅介護支援事業所A');
  await newSale('見本居宅介護支援事業所B');
  await newSale('');

  // 候補はいつもは出さない（前は欄の下に丸いボタンで並べていた）。▼を押すとリスト
  assert.equal(await page.getByRole('button', {name: '見本居宅介護支援事業所A', exact: true}).count(), 0);
  await toggle.click();
  const list = page.getByRole('list', {name: '居宅介護支援事業所の候補の一覧'});
  await list.waitFor();
  assert.deepEqual((await list.getByRole('listitem').allInnerTexts()).map((t) => t.replace(/\s*✕$/, '').trim()).sort(), ['見本居宅介護支援事業所A', '見本居宅介護支援事業所B']);
  await page.screenshot({path: `${out}/suggest-01-list.png`});
  // リストから消す（前の見積もりの値はそのまま）
  await list.getByRole('button', {name: '見本居宅介護支援事業所Bを候補から消す'}).click();
  assert.equal(await list.getByRole('button', {name: '見本居宅介護支援事業所Bを候補から消す'}).count(), 0);
  // 選ぶと入る・リストは閉じる。ほかに候補がなければ▼も出さない
  await list.getByRole('button', {name: '見本居宅介護支援事業所A', exact: true}).click();
  assert.equal(await office.inputValue(), '見本居宅介護支援事業所A');
  await list.waitFor({state: 'detached'});
  assert.equal(await toggle.count(), 0);
  // 外したまま（読み直しても）
  await office.fill('');
  await page.waitForTimeout(800);
  await page.reload();
  await office.waitFor();
  await toggle.click();
  assert.deepEqual((await list.getByRole('listitem').allInnerTexts()).map((t) => t.replace(/\s*✕$/, '').trim()), ['見本居宅介護支援事業所A']);
  // リストの外を押すと閉じる
  await page.getByRole('textbox', {name: 'お客様名'}).click();
  await list.waitFor({state: 'detached'});
  console.log('ok: 候補はいつもは出さない・▼のリストから選ぶ・リストから消す（読み直しても）');

  // 住所を入れると郵便番号（大字があっても）
  await page.getByRole('textbox', {name: '住所'}).fill('苅田町大字新津1番地1');
  await page.waitForFunction(() => document.querySelector('[aria-label="郵便番号"]')?.value === '800-0344', null, {timeout: 5000});
  console.log('ok: 住所だけ入れると郵便番号 800-0344');

  // スマホの幅：リストが横にはみ出さない
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ja-JP'});
  await phone.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const p2 = await phone.newPage();
  await p2.goto(url);
  // 別の context なので見積もりは空。1つ作ってから
  await p2.getByRole('button', {name: '＋ 苅田町'}).click();
  await p2.getByRole('textbox', {name: '居宅介護支援事業所'}).fill('見本居宅介護支援事業所C');
  await p2.waitForTimeout(600);
  await p2.getByRole('button', {name: '← 見積もりの一覧へ'}).click();
  await p2.getByRole('button', {name: '＋ 苅田町'}).click();
  await p2.getByRole('button', {name: '居宅介護支援事業所の候補'}).click();
  await p2.getByRole('list', {name: '居宅介護支援事業所の候補の一覧'}).waitFor();
  assert.ok(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p2.getByRole('list', {name: '居宅介護支援事業所の候補の一覧'}).scrollIntoViewIfNeeded();
  await p2.screenshot({path: `${out}/suggest-02-phone.png`});
  console.log('ok: スマホの幅');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
