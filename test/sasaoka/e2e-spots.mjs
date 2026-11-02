// 同じ部材でも手すりの所ごとに別の行（ユーザーの指示「施工費や部材を追加する際は、同じ部材を追加する場合でも、1箇所につき、部材をのせていく。
// 例えばBD-132 BD-08G 施工費2000円が2箇所ある場合は、たさずにそれぞれでこの部材を追加していく」2026-11-02）と、
// 申請書の「＋ ベースプレート」の長さ（「ベースプレートをいれる場合は、追加ボタンを押して、長さの欄にベースプレートの正確な長さをいれる、
// 入れたら、自動的に見積もりの方でも長さを汲み取り、見積金額に反映する」2026-11-02）を確かめる：
//   部材リストに BD-132（2m の手すり）・BD-08G（エンドブラケット）・BH-412（ベースプレート 2m）を取り込む（架空の価格）→
//   申請書で階段 L=2100・「＋ ベースプレート」1300 → 改修の内容に「ベースプレート　L=1300mm」→
//   見積書：1か所目 BD-132・BH-412・BD-08G×2・施工費（木）、2か所目 BD-132・BD-08G×2・施工費（木）。同じ部材も別の行（足さない）。
//   ベースプレートは 1300mm÷2000mm＝0.65本 → 申請書でベースプレートを 1500 にすると 0.75本
// usage: node e2e-spots.mjs <サイトのURL> <出力フォルダ>
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/404|Not Found|ERR_FAILED/i.test(m.text()) && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);

// ---------------- 部材リスト（価格は架空）
await page.getByRole('navigation').getByRole('button', {name: '📦 部材・施工費マスタ'}).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
const csv =
  '品番,品名,定価,仕切単価\n' +
  'BD-132,BAUHAUS 35アッシュ丸棒 ディンプル付 Mオーク 2m,10000,6000\n' +
  'BD-08G,35エンドブラケットカバー付 ゴールド,2000,1000\n' +
  'BH-412,木製ベースプレート 120mm幅 Mブラウン 2m,8000,5000\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mazroc.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
await page.getByPlaceholder('例：マツ六').fill('マツ六');
await page.getByRole('button', {name: '部材リストに取り込む（3件）'}).click();
await page.getByText('新しく 3件').waitFor();
log('部材リスト OK');

// ---------------- 申請書：階段 L=2100・「＋ ベースプレート」1300
await page.getByRole('navigation').getByRole('button', {name: '📝 見積もり・申請書を作成する'}).click();
await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
const works = form.locator('[data-field="works"]');
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '階段'});
const stair = works.getByRole('listitem', {name: '①階段'});
await page.keyboard.type('2100');
assert.equal(await stair.getByLabel('長さ（mm）').inputValue(), '2100');
// 前は「そのほか」に打っていた（ユーザーの写真）→「＋ ベースプレート」を押すと、その長さをベースプレートの欄に移す
await stair.getByRole('button', {name: '＋ そのほか'}).click();
await page.keyboard.type('ベースプレート　1200mm');
await stair.getByRole('button', {name: '＋ ベースプレート'}).click();
assert.equal(await stair.getByLabel('ベースプレート（mm）').inputValue(), '1200');
assert.equal(await stair.getByLabel('そのほか').count(), 0);
await stair.getByLabel('ベースプレート（mm）').fill('1300');
assert.equal(await stair.getByLabel('ベースプレート（mm）').inputValue(), '1300');
await page.waitForTimeout(600);
const preview = await page.locator('body').innerText();
assert.ok(/①階段　手すりの取り付け　L=2100mm\n?[ 　]*ベースプレート　L=1300mm/.test(preview) || preview.includes('ベースプレート　L=1300mm'), '申請書の改修の内容にベースプレートの行がない');
await page.screenshot({path: path.join(outDir, 'spots-01-shinsei.png')});
log('申請書：＋ ベースプレート 1300mm・改修の内容に「ベースプレート　L=1300mm」OK');

// ---------------- 見積書：1か所目
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
const textKey = await sheet.locator('.form-page tr', {hasText: '階段'}).first().locator('[data-edit$=":text"]').first().getAttribute('data-edit');
await sheet.locator(`[data-edit="${textKey}"]`).click();
const dlg = page.getByRole('dialog');
const pick = async (code, plus = 0, expectAdd = true) => {
  await dlg.getByPlaceholder(/商品名・品番で検索/).fill(code);
  const row = dlg.getByRole('row', {name: new RegExp(code)}).first();
  // 同じ部材がもう箇所にあっても「＋ 追加」（足さずに別の行）
  if (expectAdd) assert.equal(await row.getByRole('button', {name: '＋ 追加'}).count(), 1, `${code} の ＋ 追加`);
  await row.getByRole('button', {name: '＋ 追加'}).click();
  for (let i = 0; i < plus; i++) await row.getByRole('button', {name: /を1つ増やす/}).click();
  return row;
};
const openMaterials = async () => {
  await sheet.getByRole('button', {name: '📋 部材リストから入れる'}).click();
  await dlg.getByRole('button', {name: /^すべて/}).click();
};
await openMaterials();
await pick('BD-132');
await pick('BH-412');
const end1 = await pick('BD-08G', 1);
assert.equal((await end1.getByLabel(/の数量$/).innerText()).trim(), '2');
await page.screenshot({path: path.join(outDir, 'spots-02-picker.png')});
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
// 閉じると、最後に入れた BD-08G の行を選んでいる → 施工費はその同上施工費
await sheet.getByRole('button', {name: /施工費から入れる/}).click();
await dlg.getByText(/エンドブラケット.*の施工費/).first().waitFor();
await page.getByRole('button', {name: '木の箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();

// ---------------- 2か所目：同じ BD-132・BD-08G×2・施工費（木）を、1か所目に足さずに別の行で
await openMaterials();
await pick('BD-132');
const end2 = await pick('BD-08G', 1);
assert.equal((await end2.getByLabel(/の数量$/).innerText()).trim(), '2');
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await sheet.getByRole('button', {name: /施工費から入れる/}).click();
await dlg.getByText(/エンドブラケット.*の施工費/).first().waitFor();
await page.getByRole('button', {name: '木の箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();
await page.waitForTimeout(500);

const rows = (await sheet.locator('.form-page tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const kinds = rows
  .map((t) => (t.includes('BD-132') ? 'BD-132' : t.includes('BH-412') ? 'BH-412' : t.includes('BD-08G') && !t.includes('施工費') ? 'BD-08G' : /同上施工費/.test(t) ? '施工費' : ''))
  .filter(Boolean);
assert.deepEqual(kinds, ['BD-132', 'BH-412', 'BD-08G', '施工費', 'BD-132', 'BD-08G', '施工費'], rows.join('\n'));
const ends = rows.filter((t) => t.includes('BD-08G') && !t.includes('施工費'));
assert.equal(ends.length, 2, ends.join('\n'));
assert.ok(ends.every((t) => /ゴールド 2 1,600 3,200 /.test(t)), ends.join('\n')); // どちらも 2個（足して 4個の1行にしない）
await page.screenshot({path: path.join(outDir, 'spots-03-estimate.png'), fullPage: true});
log('見積書：同じ部材・施工費を、手すりの所ごとに別の行 OK');

// ---------------- ベースプレートの数量：1300mm÷2000mm＝0.65 → 申請書で 1500 にすると 0.75
const plateText = async () => rows2().then((rs) => rs.find((t) => t.includes('BH-412')) ?? '');
const rows2 = async () => (await sheet.locator('.form-page tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
assert.ok((await plateText()).includes('0.65'), await plateText());
assert.ok((await plateText()).includes('1300mm÷2000mm＝0.65'), await plateText());
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
await stair.getByLabel('ベースプレート（mm）').fill('1500');
await page.waitForTimeout(600);
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
assert.ok((await plateText()).includes('0.75'), await plateText());
log('見積書のベースプレート：申請書の長さ 1300mm→0.65本、1500mm→0.75本 OK');

assert.deepEqual(errors, []);
await browser.close();
console.log('ALL OK');
