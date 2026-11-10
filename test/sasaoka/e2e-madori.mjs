// 平面図のタブ（📐 平面図。ユーザーの指示「平面図をつくれるような機能を追加する。まどりっちの機能やマイホームクラウドの機能もつけくわえる」2026-11-09）：
//   部屋（マイホームクラウドと同じ一覧）を方眼にドラッグ → ドアを壁の近くで押すと壁に付く → トイレは壁ぎわ → 申請書の箇所（①玄関）の手すり → 一覧（右の枠）が
//   申請書の改修の内容と同じ → 選んで動かす・Delete・Ctrl+Z → 2階 → 読み直しても残る（#…&view=madori）→ 見取図を印刷（A4横）→ Excel（階ごとのシート・画像）
//   → 申請書の平面図に入れる → スマホの幅で横にはみ出さない。お客様は架空のサンプル
// usage: node e2e-madori.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();

// ---------------- タブ
await page.getByRole('tab', {name: '📐 平面図'}).click();
await page.waitForFunction(() => location.hash.includes('view=madori'));
const canvas = page.locator('[data-madori-canvas] svg');
await canvas.waitFor();
const art = () => canvas.evaluate((s) => s.querySelector('g:not([opacity])')?.innerHTML ?? '');
const M = 910;
/** 図の mm → 画面の位置 */
const toPx = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const s = document.querySelector('[data-madori-canvas] svg');
      const vb = s.viewBox.baseVal;
      const r = s.getBoundingClientRect();
      return {x: r.left + ((x - vb.x) * r.width) / vb.width, y: r.top + ((y - vb.y) * r.height) / vb.height};
    },
    [x, y],
  );
const drag = async (a, b) => {
  const p = await toPx(...a);
  const q = await toPx(...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, {steps: 3});
  await page.mouse.move(q.x, q.y, {steps: 3});
  await page.mouse.up();
};
const click = async (x, y) => {
  const p = await toPx(x, y);
  await page.mouse.click(p.x, p.y);
};
const cat = (name) => page.getByRole('tab', {name, exact: true}).click();
const tool = (name) => page.getByRole('button', {name, exact: true}).first().click();
const legend = () => page.locator('ul.text-rose-600 li').allInnerTexts();

// ---------------- 部屋（マイホームクラウドと同じ並び）
await cat('部屋');
const roomNames = await page.locator('[data-madori-canvas]').locator('xpath=../div[1]').locator('button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('title')).filter(Boolean));
assert.deepEqual(roomNames.slice(0, 6), ['ポーチ', '玄関', '土間', 'シューズクローク', '廊下', 'LDK']);
assert.ok(roomNames.includes('ウォークインクローゼット') && roomNames.at(-1) === '屋外');
// 白紙の平面図は、開いたときから洋室が選ばれている（なぞればすぐ描ける）。同じ道具をもう一度押しても外れない
const pressed = (name) => page.getByRole('button', {name, exact: true}).first().getAttribute('aria-pressed');
assert.equal(await pressed('洋室'), 'true');
await tool('和室');
await tool('和室');
assert.equal(await pressed('和室'), 'true');
await drag([0, 0], [3 * M, 4 * M]);
await tool('廊下');
await drag([0, 4 * M], [6 * M, 5 * M]);
await tool('トイレ');
await drag([3 * M, 0], [4 * M, 1.5 * M]);
await tool('玄関');
await drag([4 * M, 3.5 * M], [6 * M, 5 * M]);
assert.match(await art(), /和室/);
assert.match(await art(), /6帖（9\.94㎡）/); // 3×4 マス＝6帖
log('部屋：ドラッグで方眼に・帖と㎡ OK');

// ---------------- 建具は壁に、設備は壁ぎわに
await cat('建具・窓');
await tool('片開き戸');
await click(1.5 * M, 4 * M + 150); // 和室と廊下の間の壁の少し下
await cat('設備');
await tool('洋式便器');
await click(3.5 * M, 300);
const svgNow = await art();
const door = /translate\(([\d.]+) 3640\) rotate\(0\)/.exec(svgNow); // ドアの開口のまん中が壁の上（y＝和室と廊下の間の壁）
assert.ok(door && (Number(door[1]) - 390) % 227.5 === 0, `ドアの開口の端は半マスの半分にそろう ${door?.[1]}`);
assert.match(svgNow, /translate\(2985 30\)/); // 便器は上の壁の面（y=30）にぴったり・押した所（3.5マス＝3185）がまん中
log('ドアは壁に・便器は壁ぎわ OK');

// ---------------- 申請書の箇所（①玄関）の手すり → 一覧は申請書の改修の内容
await cat('改修');
await page.getByRole('button', {name: /① 玄関/}).click();
await drag([4.2 * M, 4.9 * M], [5.8 * M, 4.9 * M]);
await tool('縦手すり');
await click(3.9 * M, 0.7 * M);
await page.keyboard.press('Escape');
const rows = await legend();
assert.equal(rows.length, 2);
assert.match(rows[0], /^①　玄関　手すりの取り付け/);
assert.equal(rows[1], '②　縦手すり　L＝800mm');
assert.equal(await page.getByRole('button', {name: /① 玄関.*✓/}).count(), 1); // 図に置いた箇所に ✓
log('申請書の箇所につないだ手すり①・縦手すり②・一覧 OK');

// ---------------- 選んで動かす・Delete・Ctrl+Z
await click(1.5 * M, 2 * M); // 和室を選ぶ
await page.getByRole('combobox', {name: '部屋の種類'}).waitFor();
assert.equal(await page.getByRole('combobox', {name: '部屋の種類'}).inputValue(), '和室');
await page.keyboard.press('Delete');
assert.doesNotMatch(await art(), /和室/);
await page.keyboard.press('Control+z');
assert.match(await art(), /和室/);
await click(1.5 * M, 2 * M);
await page.getByRole('textbox', {name: '部屋の名前'}).fill('寝室（和室）');
await page.keyboard.press('Escape');
assert.match(await art(), /寝室（和室）/);
log('選ぶ・消す・Ctrl+Z・名前 OK');

// ---------------- 2階
await page.getByRole('button', {name: '＋ 階'}).click();
await page.getByRole('tab', {name: '2階'}).waitFor();
await cat('部屋');
await tool('洋室');
await drag([0, 0], [3 * M, 4 * M]);
await cat('改修');
await tool('横手すり');
await click(1.5 * M, 3.8 * M);
await page.keyboard.press('Escape');
assert.equal((await legend()).at(-1), '③　L＝600mm'); // 階をまたいで通し番号
await page.getByRole('tab', {name: '1階', exact: true}).click();
log('2階・通し番号 OK');

// ---------------- 読み直しても残る（保存は打ち終わって 0.4 秒後）
await page.waitForTimeout(1500);
await page.reload();
await canvas.waitFor();
await page.waitForFunction(() => document.querySelector('[data-madori-canvas] svg')?.innerHTML.includes('寝室（和室）'));
assert.equal(await page.getByRole('tab', {name: '2階'}).count(), 1);
log('読み直し OK');

// ---------------- 見取図の印刷（A4横）
await page.getByRole('button', {name: '🖨 見取図を印刷'}).click();
const sheets = page.locator('.madori-page');
assert.equal(await sheets.count(), 2);
const first = await sheets.first().innerHTML();
assert.match(first, /住宅改修工事　見取図（1階）/);
assert.match(first, /太陽シルバーサービス株式会社/);
assert.match(first, /①　玄関　手すりの取り付け/);
await page.screenshot({path: path.join(outDir, 'madori-print.png')});
await page.emulateMedia({media: 'print'});
const pdf = await page.pdf({preferCSSPageSize: true, printBackground: true});
await page.emulateMedia({media: 'screen'});
const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
assert.equal(pages, 2, `印刷のページ数 ${pages}`);
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見取図の印刷：A4横・2枚（1階・2階）OK');

// ---------------- Excel（初めは開いているタブ＝平面図だけにチェック）
const down = page.waitForEvent('download');
await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first().click();
const dialog = page.getByRole('dialog', {name: 'Excelで保存'});
assert.equal(await dialog.getByRole('checkbox', {name: /平面図（見取図）/}).isChecked(), true);
assert.equal(await dialog.getByRole('checkbox', {name: /工事見積書/}).isChecked(), false);
await dialog.getByRole('button', {name: /^📗 \d+つ保存する$/}).click();
const file = await down;
assert.equal(file.suggestedFilename(), '（サンプル）山田様住宅改修見取図.xlsx');
const saved = path.join(outDir, 'madori.xlsx');
await file.saveAs(saved);
const z = unzipSync(new Uint8Array(await readFile(saved)));
assert.deepEqual([...strFromU8(z['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]), ['1階', '2階']);
assert.ok(z['xl/media/image1.png'].length > 10000 && z['xl/media/image2.png']);
assert.match(strFromU8(z['xl/worksheets/sheet1.xml']), /①　玄関　手すりの取り付け/);
log('Excel：階ごとのシート・平面図の画像・一覧 OK');

// ---------------- 申請書の平面図に入れる
await page.getByRole('button', {name: /^その他/}).click(); // タブごとの機能は「その他 ▼」の中
await page.getByRole('button', {name: '📝 申請書の平面図に入れる'}).click();
await page.getByText('申請書の平面図に入れました').waitFor();
log('申請書の平面図に入れる OK');

await page.screenshot({path: path.join(outDir, 'madori-pc.png')});
// ---------------- スマホ
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
// 携帯：タブを開き直すと、道具と方眼が見える所までスクロールする（方眼が画面の下に隠れない）
await page.getByRole('tab', {name: /工事見積書/}).click();
await page.getByRole('tab', {name: '📐 平面図'}).click();
await canvas.waitFor();
await page.waitForTimeout(400);
const box = await canvas.boundingBox();
assert.ok(box.y >= 0 && box.y < 844 && box.y + box.height <= 844 + 40, `方眼が画面に見える ${JSON.stringify(box)}`);
await page.screenshot({path: path.join(outDir, 'madori-phone.png'), fullPage: true});
log('スマホの幅で横にはみ出さない OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-madori: all OK');
