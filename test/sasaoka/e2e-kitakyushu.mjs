// 北九州市の住宅改修の申請書を確かめる（2026-10-29。ユーザーの指示「北九州市と福岡市の書式で、全く同じ形の連動型の申請書…」）：
//   サンプルの様邸の工事場所を北九州市小倉北区にすると「保険者を北九州市にする」→ 申請書のタブは北九州市の様式（市の Word の様式から作った原本）。
//   プレビューは 事前届出書（提出用・通知用）・支給申請書・内容報告書（写真。1枚に写真番号1つ）・完了報告書（写真。1枚に2つ）。
//   平面図は出さない（市の要項で要らない。改修後のイメージ図は内容報告書（写真）の下の欄。2026-10-29）。
//   「📗 申請書をExcelで保存」で、氏名・郵便番号と電話番号（「－」の前後）・改修の種類と箇所の□→■・施工予定業者（設定の営業所）・支給申請書の着工日・完成日
// usage: node e2e-kitakyushu.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';
import {KK_CELLS} from '../../src/sasaoka/shinsei/kitakyushuCells.ts';

const [site, outDir = 'e2e-out'] = process.argv.slice(2);
mkdirSync(outDir, {recursive: true});
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => void d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const form = page.getByRole('form', {name: '申請書'});
const preview = page.getByLabel('申請書のプレビュー');
await form.waitFor();
await preview.waitFor();

// ---------------- 工事場所を北九州市に → 「保険者を北九州市にする」
await form.getByLabel('住所', {exact: true}).fill('福岡県北九州市小倉北区見本町1-2-3');
await page.getByRole('button', {name: '保険者を北九州市にする'}).click();
const pageOf = (name) => preview.getByRole('group', {name, exact: true});
await pageOf('事前届出書').waitFor();
await pageOf('内容報告書（写真）').waitFor();
await page.waitForTimeout(800);
// 保険者のすぐ右で区を選んで保険者番号を決める（ユーザーの指示「北九州市や福岡市では、保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる」2026-10-29）。
// 初めは住所の小倉北区。保険者を選び直すと区の選ぶ所へ移る
{
  const area = page.getByRole('combobox', {name: '保険者番号'});
  assert.equal(await area.inputValue(), '401067');
  assert.equal(await area.evaluate((el) => el.closest('label').firstChild.textContent), '区');
  assert.deepEqual(await area.locator('option').allInnerTexts(), ['門司区　401018', '若松区　401034', '戸畑区　401059', '小倉北区　401067', '小倉南区　401075', '八幡東区　401083', '八幡西区　401091']);
  await page.getByRole('combobox', {name: '保険者', exact: true}).selectOption('yukuhashi');
  assert.equal(await area.count(), 0); // 行橋市は1つなので選ばない（番号だけ）
  await page.getByRole('combobox', {name: '保険者', exact: true}).selectOption('kitakyushu');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '保険者番号');
  await area.selectOption('401091'); // 八幡西区
  await page.locator('section', {has: page.getByRole('combobox', {name: '保険者', exact: true})}).first().screenshot({path: path.join(outDir, 'kitakyushu-0-area.png')});
  await area.selectOption('401067');
  await pageOf('事前届出書').waitFor();
}
const pageNames = () => preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const names = await pageNames();
// 写真番号①②（玄関・トイレ）：内容報告書は1枚に1つ（2枚）、完了報告書は1枚に2つ（1枚）。写真の用紙は写真番号の順（①の内容報告書・完了報告書、②の内容報告書）
// 支給申請書の裏（代理人の委任状・注意書き）は書く欄がないのでプレビューには出さない（Excel には入る）
assert.deepEqual(names, ['事前届出書', '事前届出書（通知用）', '支給申請書', '内容報告書（写真）', '完了報告書（写真）', '内容報告書（写真） (2)']);
const rowLabels = async () => (await form.locator(':scope > div[data-field] > div:first-child').allInnerTexts()).map((t) => t.replace(/\s*（ひらがなで入力してもカタカナになります）$/, ''));
assert.deepEqual(await rowLabels(), ['フリガナ', '被保険者氏名', '被保険者番号', '郵便番号', '住所', '電話番号', '負担割合', '住宅の所有者', '改修前日付・改修後日付', '改修の内容・箇所及び規模', '工事費見積金額（介護保険対象分）', '着工日・完成日']);
const pv = await preview.innerText();
for (const t of ['介護保険住宅改修事前届出書', '介護保険居宅介護（予防）住宅改修費支給申請書（受領委任払用）', '住宅改修内容報告書（写真）', '住宅改修完了報告書（写真）', '小倉北区見本町1-2-3', '太陽シルバーサービス']) assert.ok(pv.includes(t), `プレビューに「${t}」がない`);
assert.equal(await pageOf('内容報告書（写真）').getByRole('button', {name: /改修前/}).count(), 1);
assert.equal(await pageOf('完了報告書（写真）').getByRole('button', {name: /改修後/}).count(), 2);
// 内容報告書の「改修後のイメージ図」の欄も、改修後の写真の枠
assert.equal(await pageOf('内容報告書（写真）').getByRole('button', {name: /改修後/}).count(), 1);
await page.waitForTimeout(400);
await page.screenshot({path: path.join(outDir, 'kitakyushu-1-shinsei.png')});
await pageOf('事前届出書').screenshot({path: path.join(outDir, 'kitakyushu-2-todoke.png')});
await pageOf('支給申請書').screenshot({path: path.join(outDir, 'kitakyushu-3-shikyu.png')});
await pageOf('内容報告書（写真）').screenshot({path: path.join(outDir, 'kitakyushu-4-photo.png')});
log('北九州市の申請書のタブ（プレビュー・一覧の順番・写真の報告書）OK');

// ---------------- 写真を改修前に入れると、改修後にも同じ写真（ユーザーの指示「北九州では、改修前と改修後には、同じ写真を入れ、
//   改修後の写真に線を書き込むため、写真を選択した場合は前後に同じ写真を組み込む」2026-10-29）。改修後の写真は内容報告書の「改修後のイメージ図」と完了報告書に
const board = page.getByRole('region', {name: '写真'});
{
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    [c.width, c.height] = [1200, 900];
    const g = c.getContext('2d');
    g.fillStyle = '#2563eb';
    g.fillRect(0, 0, 1200, 900);
    const b = await new Promise((r) => c.toBlob(r, 'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  });
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), board.getByRole('button', {name: '①玄関 改修前', exact: true}).click()]);
  await ch.setFiles([{name: 'before1.png', mimeType: 'image/png', buffer: Buffer.from(png)}]);
}
const naiyoImg = (slot) => pageOf('内容報告書（写真）').getByRole('button', {name: `写真貼付用紙①の${slot}`, exact: true}).locator('img');
await naiyoImg('改修前').waitFor();
await naiyoImg('改修後').waitFor();
await pageOf('完了報告書（写真）').getByRole('button', {name: '写真貼付用紙①の改修後', exact: true}).locator('img').waitFor();
const srcs = await Promise.all([naiyoImg('改修前'), naiyoImg('改修後')].map((x) => x.getAttribute('src')));
assert.equal(srcs[0], srcs[1], '改修前と改修後（イメージ図）が同じ写真でない');
// 写真の欄の①玄関の改修後にも同じ写真。②トイレの改修後は空のまま
assert.equal(await board.getByRole('button', {name: '①玄関 改修後に書き込む', exact: true}).count(), 1);
assert.equal(await board.getByRole('button', {name: '②トイレ 改修後に書き込む', exact: true}).count(), 0);
await page.waitForTimeout(400);
await pageOf('内容報告書（写真）').screenshot({path: path.join(outDir, 'kitakyushu-4b-photo-pair.png')});
log('改修前に入れた写真が改修後（内容報告書の改修後のイメージ図・完了報告書）にも入る OK');

// ---------------- 入れる：フリガナ・郵便番号・電話・負担割合・着工日・完成日
await form.getByLabel('フリガナ', {exact: true}).fill('サンプル　ヤマダ');
await form.getByLabel('郵便番号').fill('802-0001');
await form.getByLabel('電話番号').fill('093-111-2222');
await form.getByLabel('着工日').fill('2026-11-02');
await form.getByLabel('完成日').fill('2026-11-05');
await page.waitForTimeout(1200);
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
assert.equal(dl.suggestedFilename(), '（サンプル）山田様住宅改修申請書.xlsx');
const file = path.join(outDir, 'kitakyushu-shinsei.xlsx');
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
const rels = strFromU8(files['xl/_rels/workbook.xml.rels']);
const sheets = new Map();
for (const m of wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) sheets.set(m[1], strFromU8(files[`xl/${new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)[1]}`]));
const text = (name, ref) => (/<t[^>]*>([\s\S]*?)<\/t>/.exec(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sheets.get(name))?.[0] ?? '')?.[1] ?? '').replace(/&#10;/g, '\n');
for (const [name, c] of [['事前届出書', KK_CELLS.todoke], ['事前届出書（通知用）', KK_CELLS.notice]]) {
  assert.deepEqual([text(name, c.name), text(name, c.zipA), text(name, c.zipB), text(name, c.address)], ['（サンプル）山田', '802', '0001', '福岡県北九州市小倉北区見本町1-2-3'], name);
  assert.deepEqual([text(name, c.telA), text(name, c.telB), text(name, c.telC)], ['093', '111', '2222'], name);
  assert.match(text(name, c.mochiie), /^■持家/, name);
  assert.match(text(name, c.kinds[0]), /^■手すり取付/, name); // サンプルの①玄関・②トイレは手すりの取り付け
  assert.match(text(name, c.places[0]), /■玄関・屋外.*■トイレ/, name);
  assert.match(text(name, c.builder), /^太陽シルバーサービス.*行橋営業所$/, name);
  // 施工予定業者の所在地は郵便番号と住所の1行（ユーザーの指摘「北九州の郵便番号が綺麗に入力されていない」2026-10-29）
  assert.match(text(name, c.builderAddress), /^〒\d{3}-\d{4}　福岡県/, name);
}
const s = KK_CELLS.shikyu;
assert.deepEqual([text('支給申請書', s.kana), text('支給申請書', s.name)], ['サンプル　ヤマダ', '（サンプル）山田']);
assert.deepEqual([s.startY, s.startM, s.startD, s.endY, s.endM, s.endD].map((r) => text('支給申請書', r)), ['8', '11', '2', '8', '11', '5']);
assert.deepEqual([text('支給申請書', s.telA), text('支給申請書', s.telB)], ['093', '111-2222']);
assert.equal(text('内容報告書（写真）', KK_CELLS.naiyo.place0), '玄関');
assert.equal(text('完了報告書（写真）', KK_CELLS.kanryo.place1), 'トイレ');
// 写真：内容報告書の改修前とイメージ図、完了報告書の改修後に同じ写真（3枚とも同じ画像のファイル）
const picsOf = (name) => {
  const rid = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].find((m) => m[1] === name)[2];
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)[1];
  const sRels = strFromU8(files[`xl/${target.replace(/([^/]+)$/, '_rels/$1.rels')}`]);
  const drawing = /Target="\.\.\/drawings\/([^"]+)"/.exec(sRels)[1];
  const dRels = strFromU8(files[`xl/drawings/_rels/${drawing}.rels`]);
  const d = strFromU8(files[`xl/drawings/${drawing}`]);
  return [...d.matchAll(/<xdr:pic>[\s\S]*?<a:blip r:embed="([^"]+)"/g)].map((m) => new RegExp(`Id="${m[1]}"[^>]*Target="\\.\\./media/([^"]+)"`).exec(dRels)[1]);
};
const naiyoPics = picsOf('内容報告書（写真）');
const kanryoPics = picsOf('完了報告書（写真）');
assert.equal(naiyoPics.length, 2, '内容報告書（写真）の写真は改修前とイメージ図の2枚');
assert.equal(kanryoPics.length, 1, '完了報告書（写真）の写真は①の改修後の1枚');
const bytesOf = (n) => Buffer.from(files[`xl/media/${n}`]).toString('base64');
assert.equal(new Set([...naiyoPics, ...kanryoPics].map(bytesOf)).size, 1, '改修前・イメージ図・完了報告書が同じ写真でない');
assert.equal(sheets.size, 19); // 事前届出書2・支給申請書の表と裏・内容報告書10・完了報告書5（平面図はない）
assert.ok(![...sheets.keys()].some((n) => /平面図/.test(n)));
log('Excel（事前届出書・支給申請書・写真の報告書）OK');

// ---------------- スマホの幅でも横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(500);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅で横にはみ出している');
await page.screenshot({path: path.join(outDir, 'kitakyushu-5-phone.png')});
log('スマホの幅 OK');

// ---------------- 郵便番号を入れると、住所が空なら住所（大字も）が入る（ユーザーの指示「郵便番号を入力したら住所がでる、福岡県行橋市大字流松（流末）」2026-10-29）。
//   Enter で住所の欄へ移って番地を打つと、入った住所のうしろに続く。郵便番号を打ち直すと、手を加えていない住所は新しい番号の住所に
await page.getByRole('button', {name: /見積もり・申請書を作成する/}).first().click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 北九州市', exact: true}).click();
const form2 = page.getByRole('form', {name: '申請書'});
await form2.waitFor();
const zipBox = form2.getByLabel('郵便番号');
const addrBox = form2.getByLabel('住所', {exact: true});
await zipBox.click();
await zipBox.pressSequentially('8240005');
await page.waitForFunction(() => document.querySelector('[aria-label="住所"]')?.value === '福岡県行橋市中央', null, {timeout: 5000});
await zipBox.fill('');
await zipBox.pressSequentially('8240043'); // 打ち間違えて直した（住所はそのまま＝前の番号の住所）
await page.waitForFunction(() => document.querySelector('[aria-label="住所"]')?.value === '福岡県行橋市大字流末', null, {timeout: 5000});
await zipBox.press('Enter');
assert.equal(await addrBox.evaluate((el) => el === document.activeElement), true);
await page.keyboard.type('1-1');
assert.equal(await addrBox.inputValue(), '福岡県行橋市大字流末1-1');
// 番地まで入れたあとに郵便番号を替えても、住所は変えない
await zipBox.fill('824-0005');
await page.waitForTimeout(300);
assert.equal(await addrBox.inputValue(), '福岡県行橋市大字流末1-1');
await page.screenshot({path: path.join(outDir, 'kitakyushu-6-zip-address.png')});
// 頭が入ったあとに、いつものように住所を頭から全部打っても、2回にならない
await addrBox.fill('');
await zipBox.fill('');
await zipBox.pressSequentially('8000300');
await page.waitForFunction(() => document.querySelector('[aria-label="住所"]')?.value === '福岡県京都郡苅田町', null, {timeout: 5000});
await zipBox.press('Enter');
await page.keyboard.type('福岡県京都郡苅田町富久町2-2');
assert.equal(await addrBox.inputValue(), '福岡県京都郡苅田町富久町2-2');
log('郵便番号 → 住所（福岡県行橋市大字流末）・Enter で住所の欄へ・番地はうしろに・打ち直し・頭から全部打っても2回にならない OK');

// ---------------- 住所から郵便番号：1字ずつ打っても、町名まで打つとその番号（途中の「福岡県京都郡苅田町」で入った町の番号 800-0300 のままにしない）。
// 郵便番号はハイフンなし・全角で打っても「800-0333」に（ユーザーの指示「郵便番号は、ハイフンなしでもありでも自動計算、住所から逆算して郵便番号を割り出すこともできる」2026-10-29）
await addrBox.fill('');
await zipBox.fill('');
await addrBox.click();
await addrBox.pressSequentially('福岡県京都郡苅田町');
await page.waitForFunction(() => document.querySelector('[aria-label="郵便番号"]')?.value === '800-0300', null, {timeout: 5000});
await addrBox.pressSequentially('大字黒添');
await page.waitForFunction(() => document.querySelector('[aria-label="郵便番号"]')?.value === '800-0333', null, {timeout: 5000});
await addrBox.pressSequentially('1-1');
await page.waitForTimeout(300);
assert.equal(await zipBox.inputValue(), '800-0333');
await page.screenshot({path: path.join(outDir, 'kitakyushu-7-address-zip.png')});
await addrBox.fill('');
await zipBox.fill('');
await zipBox.click();
await zipBox.pressSequentially('８０００３３３');
await page.waitForFunction(() => document.querySelector('[aria-label="郵便番号"]')?.value === '800-0333', null, {timeout: 5000});
assert.equal(await addrBox.inputValue(), '福岡県京都郡苅田町大字黒添');
log('住所を1字ずつ打っても町名までの郵便番号（800-0333）・全角でハイフンなしの郵便番号も「800-0333」に OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
if (errors.length) process.exit(1);
