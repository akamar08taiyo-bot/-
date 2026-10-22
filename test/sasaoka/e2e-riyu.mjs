// 理由書を確かめる：様邸の画面のいちばん右のタブ「📄 理由書」（ユーザーの指示「必要に応じて住宅改修の理由書にも飛べるようにする。入力できる項目を全て転記されるようにする」）。
//   左に原本の上からの順の一覧、右にプレビュー（原本の1枚のシートの2ページ）。申請書と同じ欄（氏名・番号・生年月日・性別・要介護・郵便番号・住所・作成者）は
//   どちらで直しても両方に出る。④改修項目は見積書の箇所から。「📗 理由書をExcelで保存」で原本に転記した Excel（1シート2ページ）を保存する。
//   URL のうしろは #…&view=riyu（読み直しても理由書のタブ）。スマホの幅（390px）でも横にはみ出さない
// usage: node e2e-riyu.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();

// ---------------- タブ：住宅改修申請書・特定福祉用具申請書・工事見積書・理由書
const tablist = page.getByRole('tablist', {name: '住宅改修申請書・特定福祉用具申請書・工事見積書・理由書'});
assert.deepEqual(await tablist.getByRole('tab').allInnerTexts(), ['📝 住宅改修申請書', '🛁 特定福祉用具申請書', '📋 工事見積書', '📄 理由書']);
await page.getByRole('tab', {name: '📄 理由書'}).click();
const form = page.getByRole('form', {name: '理由書'});
await form.waitFor();
await page.waitForFunction(() => location.hash.includes('view=riyu'));
const preview = page.getByLabel('理由書のプレビュー');
await preview.waitFor();
assert.deepEqual(await preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).filter((n) => /ページ/.test(n))), ['住宅改修理由書（1ページ）', '住宅改修理由書（2ページ）']);
log('タブ・2ページのプレビュー OK');

// 入っていない欄の一覧（押すとその欄へ）
const status = page.getByRole('status', {name: '入っていない欄'});
const chips = () => status.getByRole('button').allInnerTexts();
assert.ok((await chips()).includes('被保険者番号'));
assert.ok((await chips()).includes('利用者の身体状況'));
await status.getByRole('button', {name: '被保険者番号'}).click();
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '被保険者番号');

// ---------------- 基本情報（申請書と同じ欄）
const fill = async (label, value) => {
  const el = form.getByLabel(label, {exact: true});
  await el.fill(value);
};
await fill('被保険者番号', '123456');
await form.getByLabel('被保険者番号', {exact: true}).blur();
assert.equal(await form.getByLabel('被保険者番号', {exact: true}).inputValue(), '0000123456'); // 空いたマスは 0
await fill('被保険者氏名', '見本　花子');
const group = (name) => form.getByRole('group', {name, exact: true});
await group('元号').getByRole('button', {name: '昭和'}).click();
await fill('生年月日の年', '13');
await fill('生年月日の月', '4');
await fill('生年月日の日', '14');
await group('性別').getByRole('button', {name: '女'}).click();
await group('要介護認定').getByRole('button', {name: '要介護2'}).click();
await fill('認定有効期間のはじめ', '2025-04-01');
await fill('認定有効期間のおわり', '2028-03-31');
await fill('郵便番号', '824-0001');
await fill('住所', '福岡県行橋市中央1-1');
await group('住宅状況').getByRole('button', {name: 'その他'}).click();
await fill('住宅状況のその他', '公営住宅');
// ---------------- 作成者
await fill('現地確認日', '2026-10-20');
await form.getByRole('button', {name: '今日'}).click();
await fill('作成者の所属事業所', '見本居宅介護支援事業所');
await fill('作成者の氏名', '見本　一郎');
await fill('作成者の資格', '福祉住環境コーディネーター');
await fill('作成者の連絡先', '０９３０－００－００００');
// ---------------- 総合的状況
await fill('利用者の身体状況', '膝が痛く、立ち座りがつらい\n夜はふらつく');
await fill('介護状況', '長女が日中だけ見守り');
await fill('住宅改修により、利用者等は日常生活をどう変えたいか', '一人でトイレに行けるようにしたい');
await form.getByLabel('歩行器の改修前').check();
await form.getByLabel('歩行器の改修後').check();
await form.getByLabel('手すりの改修後').check();
await fill('福祉用具のその他1', 'シャワーチェア');
await form.getByLabel('福祉用具のその他1の改修後').check();
// ---------------- P2：排泄・自宅内の移動
await form.getByLabel('排泄：トイレまでの移動').check();
await form.getByLabel('排泄：便器からの立ち座り（移乗を含む）').check();
await fill('排泄：①のその他', '夜間の移動');
await fill('排泄：②具体的な困難な状況', '廊下に手すりがなく、ふらつく');
await form.getByLabel('排泄：転倒等の防止、安全の確保').check();
await form.getByLabel('排泄：動作の容易性の確保').check();
await fill('排泄：改修の方針', '手すりを付けて、安全に移動できるようにする');
assert.equal(await form.getByLabel('その他（自宅内の移動）：①の□').isChecked(), false);
await fill('その他（自宅内の移動）：①改善をしようとしている生活動作', '居間から寝室への移動');
assert.equal(await form.getByLabel('その他（自宅内の移動）：①の□').isChecked(), true); // 文を書くと■
await fill('その他（自宅内の移動）：③のその他', '見守りを減らす');
// ④ 改修項目は見積書の箇所から（サンプルは玄関の手すり）
assert.match(await form.locator('[data-riyu-field="works"]').innerText(), /■ 手すりの取付け：①玄関|手すり.*玄関/);
assert.match(await page.locator('[aria-label="年齢"]').innerText(), /^\d+歳$/);
log('一覧に入れた OK');

// プレビューに出る（少し遅れて描く）
const pvHas = (t) => page.waitForFunction((x) => document.querySelector('[aria-label="理由書のプレビュー"]')?.innerText.includes(x), t, {timeout: 5000});
for (const t of ['見本　花子', '福岡県行橋市中央1-1', '見本居宅介護支援事業所', '膝が痛く、立ち座りがつらい', '廊下に手すりがなく、ふらつく', '居間から寝室への移動', '令和7年4月1日～令和10年3月31日', 'シャワーチェア']) await pvHas(t);
assert.ok((await status.innerText()).includes('すべて入っています'), await status.innerText());
await page.screenshot({path: path.join(outDir, 'riyu-1366.png'), fullPage: true});
log('プレビュー OK');

// プレビューの欄を押すと一覧のその欄へ
await preview.getByRole('button', {name: '介護状況', exact: true}).first().click();
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '介護状況');

// ---------------- 申請書のタブにも同じ値（氏名・番号・生年月日・性別・要介護・郵便番号・住所）
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
const sform = page.getByRole('form', {name: '申請書'});
await sform.waitFor();
assert.equal(await sform.getByLabel('被保険者氏名', {exact: true}).inputValue(), '見本　花子');
assert.equal(await sform.getByLabel('被保険者番号', {exact: true}).inputValue(), '0000123456');
assert.equal(await sform.getByLabel('郵便番号', {exact: true}).inputValue(), '824-0001');
// 申請書で住所を直すと理由書にも出る
await sform.getByLabel('住所', {exact: true}).fill('福岡県行橋市中央2-2');
await page.getByRole('tab', {name: '📄 理由書'}).click();
await pvHas('福岡県行橋市中央2-2');
log('申請書と連動 OK');

// ---------------- 読み直しても理由書のタブ・入れた内容は残る
await page.waitForTimeout(800);
await page.reload();
await page.getByRole('form', {name: '理由書'}).waitFor();
assert.equal(await page.getByRole('form', {name: '理由書'}).getByLabel('利用者の身体状況').inputValue(), '膝が痛く、立ち座りがつらい\n夜はふらつく');
log('読み直し OK');

// ---------------- Excel で保存
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 理由書をExcelで保存'}).click()]);
assert.equal(dl.suggestedFilename(), '見本花子様住宅改修理由書.xlsx');
const file = path.join(outDir, dl.suggestedFilename());
await dl.saveAs(file);
const files = unzipSync(new Uint8Array(await readFile(file)));
const wb = strFromU8(files['xl/workbook.xml']);
assert.deepEqual([...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]), ['住宅改修理由書']); // 1つのシート
const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
assert.match(xml, /<rowBreaks[^>]*><brk id="40"/); // 2ページ（40行目のあとで改ページ）
const shared = files['xl/sharedStrings.xml'] ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')) : [];
const cellText = (ref) => {
  const c = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(xml);
  if (!c) return '';
  const body = c[2] ?? '';
  if (/t="s"/.test(c[1])) return shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? '';
  return [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('').replace(/&#10;/g, '\n');
};
const expect = {
  C6: '見本　花子',
  C9: '福岡県行橋市中央2-2',
  E8: '824-0001',
  V4: '13年4月14日',
  AH4: '令和8年10月20日',
  S7: '令和7年4月1日～令和10年3月31日',
  AH6: '見本居宅介護支援事業所',
  AH7: '福祉住環境コーディネーター',
  AH8: '見本　一郎',
  AK9: '0930-00-0000',
  H24: '長女が日中だけ見守り',
  M45: '廊下に手すりがなく、ふらつく',
  AD45: '手すりを付けて、安全に移動できるようにする',
  B72: '■居間から寝室への移動',
  AK36: '・シャワーチェア',
};
for (const [ref, v] of Object.entries(expect)) assert.equal(cellText(ref), v, ref);
assert.equal(cellText('H18').replace(/\r/g, ''), '膝が痛く、立ち座りがつらい\n夜はふらつく');
assert.deepEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'H4', 'I4', 'J4', 'K4', 'L4'].map(cellText).join(''), '0000123456');
assert.match(cellText('AA4').trim(), /^■/); // 女
assert.match(cellText('Z4').trim(), /^□/);
assert.match(cellText('W9').trim(), /^■\s*その他（公営住宅）/);
assert.match(cellText('W8').trim(), /^□.*□.*□/);
assert.match(cellText('B45').trim(), /^■/);
assert.match(cellText('B46').trim(), /^□/);
assert.match(cellText('B48').trim(), /^■/);
assert.match(cellText('B52'), /夜間の移動/);
assert.match(cellText('X47').trim(), /^■/);
assert.match(cellText('X48').trim(), /^■/);
assert.match(cellText('X79').trim(), /^■.*見守りを減らす/);
assert.match(cellText('AN26'), /■/); // 歩行器の改修前
assert.match(cellText('AO24'), /■/); // 手すりの改修後
assert.match(cellText('AN24'), /□/);
assert.match(cellText('AJ47').trim(), /^■/); // ④ 手摺取付
assert.match(cellText('AL48'), /玄関/);
// 丸（元号の昭和・要介護2）は楕円の図形
const drawing = strFromU8(files['xl/drawings/drawing1.xml']);
assert.equal((drawing.match(/prst="ellipse"/g) ?? []).length, 2);
log('Excel OK');

// ---------------- スマホの幅：横にはみ出さない
const phone = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'ja-JP', isMobile: true, hasTouch: true});
await phone.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
await phone.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const p2 = await phone.newPage();
p2.on('pageerror', (e) => errors.push('pageerror(phone): ' + e.message));
await p2.goto(`${site}/jutaku-mitsumori/index.html`);
await p2.getByRole('button', {name: /サンプルで試す/}).click();
await p2.getByText(/（サンプル）山田様邸/).first().click();
await p2.getByRole('tab', {name: '📄 理由書'}).click();
await p2.getByRole('form', {name: '理由書'}).waitFor();
await p2.getByLabel('理由書のプレビュー').waitFor();
await p2.waitForTimeout(400);
const over = await p2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
assert.ok(over <= 0, `横にはみ出す ${over}px`);
await p2.screenshot({path: path.join(outDir, 'riyu-390.png'), fullPage: true});
log('スマホ OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('e2e-riyu: all OK');
