// 写真貼付用紙の枠に写真を足して並べる（ユーザーの指示「追加で写真を追加できる機能もつける」2026-10-29。北九州市の完了報告書（写真）のプレビューで、
// 改修後の枠に縦の写真が1枚入って左右が空いていた）。usePhotoActions の add・photoTile.ts・photos.ts の composeTiles：
//   1. プレビューの写真を押す → 道具の「＋ 追加」→ 縦の写真をもう1枚 → 同じ枠に横に2枚並んだ1枚の写真になる（枠の中で写真が大きく見える）。撮影日はそのまま
//   2. 写真の欄で写真を押す →「＋ 追加」で2枚まとめて足す（1回に並べるのは、いまの写真と足す写真の4枚まで）
//   3. Excel の写真貼付用紙にも並べた写真が入る
//   4. スマホ（390px）：道具の「＋ 追加」が画面に入る
// usage: node e2e-photoadd.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];

/** サンプルの様邸を北九州市にして、申請書のタブを開く */
async function open(opt) {
  const ctx = await browser.newContext({...opt, locale: 'ja-JP'});
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
  const page = await ctx.newPage();
  // 写真の日付の読み取りの部品（jsDelivr）はテストでは読まない（読めないお知らせは除く）
  page.on('pageerror', (e) => !/jsdelivr/.test(e.message) && errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  await page.getByRole('button', {name: /サンプルで試す/}).click();
  await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
  await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
  const form = page.getByRole('form', {name: '申請書'});
  await form.waitFor();
  await form.getByLabel('住所', {exact: true}).fill('福岡県北九州市小倉北区見本町1-2-3');
  await page.getByRole('button', {name: '保険者を北九州市にする'}).click();
  const preview = page.getByLabel('申請書のプレビュー');
  await preview.getByRole('group', {name: '完了報告書（写真）', exact: true}).waitFor();
  return {ctx, page, preview, board: page.getByRole('region', {name: '写真'})};
}

/** 色のついた写真（PNG）をブラウザで作る：w×h、色 */
const makePhoto = (page, w, h, color) =>
  page.evaluate(
    async ({w, h, color}) => {
      const c = document.createElement('canvas');
      [c.width, c.height] = [w, h];
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.fillRect(w * 0.4, h * 0.1, w * 0.2, h * 0.8);
      const b = await new Promise((r) => c.toBlob(r, 'image/png'));
      return [...new Uint8Array(await b.arrayBuffer())];
    },
    {w, h, color},
  );
const file = async (page, name, w, h, color) => ({name, mimeType: 'image/png', buffer: Buffer.from(await makePhoto(page, w, h, color))});
/** 画像の大きさ（読み込みを待つ） */
const natural = (img) =>
  img.evaluate(async (el) => {
    await el.decode().catch(() => {});
    return {w: el.naturalWidth, h: el.naturalHeight, src: el.src};
  });

// ---------------- 1〜3. パソコン
{
  const {ctx, page, preview, board} = await open({viewport: {width: 1366, height: 900}});
  // ①玄関の改修後に縦の写真を入れる（写真の欄の空いた枠を押して選ぶ）
  {
    const [ch] = await Promise.all([page.waitForEvent('filechooser'), board.getByRole('button', {name: '①玄関 改修後', exact: true}).click()]);
    await ch.setFiles([await file(page, 'after1.png', 900, 1200, '#2563eb')]);
  }
  const done = preview.getByRole('group', {name: '完了報告書（写真）', exact: true});
  const pv = done.getByRole('button', {name: '写真貼付用紙①の改修後', exact: true});
  await pv.locator('img').waitFor();
  const one = await natural(pv.locator('img'));
  assert.ok(one.h > one.w, `縦の写真 ${JSON.stringify(one)}`);
  const frameBox = await pv.boundingBox();
  const shownOne = await pv.locator('div').first().boundingBox();
  // プレビューの写真を押す → 道具の「＋ 追加」
  await pv.click();
  const tools = page.getByRole('toolbar', {name: '写真貼付用紙①の改修後の向き・大きさ'});
  await tools.waitFor();
  await page.screenshot({path: path.join(outDir, 'photoadd-1-tools.png')});
  {
    const [ch] = await Promise.all([page.waitForEvent('filechooser'), tools.getByRole('button', {name: '＋ 追加'}).click()]);
    await ch.setFiles([await file(page, 'after2.png', 900, 1200, '#16a34a')]);
  }
  await page.waitForFunction((src) => document.querySelector('[aria-label="写真貼付用紙①の改修後"] img')?.src !== src, one.src, {timeout: 10000});
  const two = await natural(pv.locator('img'));
  assert.ok(two.w > two.h * 1.2, `横に2枚並んだ写真 ${JSON.stringify(two)}`);
  const shownTwo = await pv.locator('div').first().boundingBox();
  assert.ok(shownTwo.width * shownTwo.height > shownOne.width * shownOne.height * 1.6, `枠の中で大きく見える ${JSON.stringify([shownOne, shownTwo])}`);
  assert.ok(shownTwo.width <= frameBox.width + 1 && shownTwo.height <= frameBox.height + 1, '枠からはみ出さない');
  // 並べた写真の左と右の色（青・緑）
  const colors = await pv.locator('img').evaluate((el) => {
    const c = document.createElement('canvas');
    [c.width, c.height] = [el.naturalWidth, el.naturalHeight];
    const g = c.getContext('2d');
    g.drawImage(el, 0, 0);
    const at = (fx) => [...g.getImageData(Math.round(c.width * fx), Math.round(c.height * 0.5), 1, 1).data].slice(0, 3);
    return [at(0.05), at(0.95)];
  });
  assert.ok(colors[0][2] > 150 && colors[0][1] < 140, `左は青 ${colors[0]}`);
  assert.ok(colors[1][1] > 120 && colors[1][2] < 120, `右は緑 ${colors[1]}`);
  await page.keyboard.press('Escape');
  await done.screenshot({path: path.join(outDir, 'photoadd-2-two.png')});
  log('プレビューの「＋ 追加」：同じ枠に横に2枚並べる（枠の中で大きく・はみ出さない）OK');

  // 写真の欄：写真を押して「＋ 追加」で2枚 → 4枚（2×2）。さらに足すと4枚までと知らせる
  await board.getByRole('button', {name: '①玄関 改修後', exact: true}).click();
  const status = page.getByRole('status', {name: '選んでいる写真'});
  await status.waitFor();
  {
    const [ch] = await Promise.all([page.waitForEvent('filechooser'), status.getByRole('button', {name: '＋ 追加'}).click()]);
    await ch.setFiles([await file(page, 'after3.png', 1200, 900, '#dc2626'), await file(page, 'after4.png', 1200, 900, '#9333ea')]);
  }
  await page.waitForFunction((src) => document.querySelector('[aria-label="写真貼付用紙①の改修後"] img')?.src !== src, two.src, {timeout: 10000});
  const four = await natural(pv.locator('img'));
  assert.ok(Math.abs(four.w / four.h - two.w / two.h) > 0.05, `4枚の並べ方 ${JSON.stringify([two, four])}`);
  // 並べ直した（前に並べた2枚も、もとの写真から並べた。並べた写真を1枚として並べると、前の2枚が小さくなる）：様邸の並べたもとの写真は4枚、
  // それぞれの場所のまん中が その写真の色（青・緑・赤・紫）で、どの写真も同じくらいの大きさ
  await page.waitForTimeout(1200);
  const tiles = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('taiyo-sasaoka-shikiri', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const jobs = await new Promise((res) => {
      const g = db.transaction('kv').objectStore('kv').get('jobs');
      g.onsuccess = () => res(g.result);
    });
    const place = jobs.find((x) => x.customer.includes('山田')).places.find((p) => p.name === '玄関');
    return {photo: place.photos.after, tiles: place.photoTiles?.after};
  });
  assert.equal(tiles.tiles?.ids.length, 4, JSON.stringify(tiles));
  assert.equal(tiles.tiles.of, tiles.photo);
  const centers = await pv.locator('img').evaluate((el, rects) => {
    const c = document.createElement('canvas');
    [c.width, c.height] = [el.naturalWidth, el.naturalHeight];
    const g = c.getContext('2d');
    g.drawImage(el, 0, 0);
    // まん中は白い帯なので、場所の左の端から 1割のところ
    return rects.map(([x, y, w, h]) => [...g.getImageData(Math.round(c.width * (x + w * 0.1)), Math.round(c.height * (y + h / 2)), 1, 1).data].slice(0, 3));
  }, tiles.tiles.rects);
  const hue = ([r, g, b]) => (b > 150 && r < 100 && g < 140 ? '青' : g > 120 && r < 100 && b < 120 ? '緑' : r > 180 && g < 80 && b < 80 ? '赤' : r > 110 && b > 180 && g < 80 ? '紫' : `?${r},${g},${b}`);
  assert.deepEqual(centers.map(hue), ['青', '緑', '赤', '紫']);
  const areas = tiles.tiles.rects.map(([, , w, h]) => w * four.w * h * four.h);
  assert.ok(Math.min(...areas) > Math.max(...areas) * 0.4, `同じくらいの大きさ ${areas}`);
  await done.screenshot({path: path.join(outDir, 'photoadd-3-four.png')});
  log('写真の欄の「＋ 追加」：2枚まとめて足して4枚（前の2枚も、もとの写真から並べ直す）OK');

  // Excel の完了報告書（写真）にも並べた写真
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  const xlsx = path.join(outDir, 'photoadd.xlsx');
  await dl.saveAs(xlsx);
  const files = unzipSync(new Uint8Array(await readFile(xlsx)));
  const media = Object.keys(files).filter((n) => /^xl\/media\//.test(n));
  // JPEG の大きさ（SOF の印）
  const jpegSize = (b) => {
    for (let i = 2; i < b.length - 9; ) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xc3) return {h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8]};
      i += 2 + len;
    }
    return null;
  };
  const sizes = media.map((n) => jpegSize(files[n])).filter(Boolean);
  assert.ok(sizes.some((s) => s.w === four.w && s.h === four.h), `Excel に並べた写真 ${JSON.stringify(sizes)} ${JSON.stringify(four)}`);
  assert.ok(Object.keys(files).some((n) => /drawing/.test(n) && strFromU8(files[n]).includes('<xdr:pic')), 'Excel の写真');
  log('Excel にも並べた写真 OK');
  await ctx.close();
}

// ---------------- 4. スマホ：道具の「＋ 追加」が画面に入る
{
  const {ctx, page, preview, board} = await open({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true});
  {
    const [ch] = await Promise.all([page.waitForEvent('filechooser'), board.getByRole('button', {name: '①玄関 改修後', exact: true}).click()]);
    await ch.setFiles([await file(page, 'after1.png', 900, 1200, '#2563eb')]);
  }
  const pv = preview.getByRole('group', {name: '完了報告書（写真）', exact: true}).getByRole('button', {name: '写真貼付用紙①の改修後', exact: true});
  await pv.locator('img').waitFor();
  await pv.scrollIntoViewIfNeeded();
  await pv.click();
  const add = page.getByRole('toolbar', {name: '写真貼付用紙①の改修後の向き・大きさ'}).getByRole('button', {name: '＋ 追加'});
  await add.waitFor();
  await add.scrollIntoViewIfNeeded();
  const b = await add.boundingBox();
  assert.ok(b.x >= 0 && b.x + b.width <= 390, `スマホで「＋ 追加」が画面に入る ${JSON.stringify(b)}`);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 391, '横にはみ出さない');
  await page.screenshot({path: path.join(outDir, 'photoadd-4-phone.png')});
  log('スマホ：道具の「＋ 追加」OK');
  await ctx.close();
}

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
