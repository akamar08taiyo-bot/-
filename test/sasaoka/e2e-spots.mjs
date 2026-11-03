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

// ---------------- 申請書に入れた箇所を見積書から消す（ユーザーの指示「見積もり書の方からも、消せるように、そして申請書の内容を変更できるように…
// いきなり消すのではなく…申請書からも削除してよいですか」2026-11-02）：玄関 L=600 の手すりを見積書で ✕ → 聞く（やめる／見積書の行だけ消す／申請書からも削除）
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
await works.getByRole('combobox', {name: '箇所を足す'}).selectOption({label: '玄関'});
await page.keyboard.type('600');
const entrance = works.getByRole('listitem', {name: /^②玄関/});
assert.equal(await entrance.getByLabel('長さ（mm）').inputValue(), '600');
await page.waitForTimeout(600);
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
const entranceRow = () => sheet.locator('.form-page tr', {hasText: '玄関'}).first();
await entranceRow().locator('[data-edit$=":text"]').first().click();
await openMaterials();
await pick('BD-132');
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
assert.ok((await entranceRow().innerText()).includes('BD-132'));
const ask = page.getByRole('dialog', {name: '「玄関」は申請書にも入っています'});
// やめる：何も消えない
await entranceRow().locator('[data-edit$=":text"]').first().click({timeout: 2000}).catch(() => sheet.locator('textarea.sheet-input').click()); // 選んでいる欄は上の入力欄を押す
await sheet.getByRole('toolbar', {name: '見積書の左のボタン'}).getByRole('button', {name: '✕ 削除'}).click(); // 見積書の左の「削除」（2026-11-03）
await ask.waitFor();
await page.screenshot({path: path.join(outDir, 'spots-04-delete-ask.png')});
await ask.getByRole('button', {name: 'やめる'}).click();
assert.ok((await entranceRow().innerText()).includes('BD-132'));
// 見積書の行だけ消す：見積書は空白の行、申請書の玄関は残る
await entranceRow().locator('[data-edit$=":text"]').first().click({timeout: 2000}).catch(() => sheet.locator('textarea.sheet-input').click()); // 選んでいる欄は上の入力欄を押す
await sheet.getByRole('toolbar', {name: '見積書の左のボタン'}).getByRole('button', {name: '✕ 削除'}).click(); // 見積書の左の「削除」（2026-11-03）
await ask.getByRole('button', {name: '見積書の行だけ消す'}).click();
await ask.waitFor({state: 'detached'});
assert.ok(!(await entranceRow().innerText()).includes('BD-132'));
// 見積書の行だけ消したあとは、申請書で入れたときの空きの行（（ブラケット）（施工費）。railSlots.ts）が残る。空きの行は聞かずに消え、
// 最後の空白の行の ✕ で聞く：「見積書の行だけ消す」は出さない → 申請書からも削除
const slotTexts = () => sheet.locator('[data-slot]').evaluateAll((els) => els.map((e) => `（${e.getAttribute('data-slot')}）`));
const slotsBefore = await slotTexts(); // 上の階段にも空きの行が残っている（玄関は最後の2つ）
assert.deepEqual(slotsBefore.slice(-2), ['（ブラケット）', '（施工費）']);
await entranceRow().locator('[data-edit$=":text"]').first().click({timeout: 2000}).catch(() => sheet.locator('textarea.sheet-input').click()); // 選んでいる欄は上の入力欄を押す
await sheet.getByRole('toolbar', {name: '見積書の左のボタン'}).getByRole('button', {name: '✕ 削除'}).click(); // 見積書の左の「削除」（2026-11-03）
await page.waitForTimeout(300);
assert.equal(await ask.count(), 0); // 空きの行（ほかの行が残る）は聞かない
assert.deepEqual(await slotTexts(), [...slotsBefore.slice(0, -2), '（施工費）']);
await entranceRow().locator('[data-edit$=":text"]').first().click({timeout: 2000}).catch(() => sheet.locator('textarea.sheet-input').click());
await sheet.getByRole('toolbar', {name: '見積書の左のボタン'}).getByRole('button', {name: '✕ 削除'}).click();
await ask.waitFor();
assert.equal(await ask.getByRole('button', {name: '見積書の行だけ消す'}).count(), 0);
await ask.getByRole('button', {name: '申請書からも削除'}).click();
await ask.waitFor({state: 'detached'});
assert.equal(await sheet.locator('.form-page tr', {hasText: '玄関'}).count(), 0);
await page.waitForTimeout(600);
await page.getByRole('tab', {name: '📝 住宅改修申請書'}).click();
await form.waitFor();
assert.equal(await works.getByRole('listitem', {name: /玄関/}).count(), 0);
assert.equal(await works.getByRole('listitem', {name: '①階段'}).count(), 1);
log('見積書から申請書の箇所を消す（やめる・見積書の行だけ・申請書からも削除）OK');

// ---------------- 金額の欄も直せる・欄にマウスを乗せるとどこの欄か出る（ユーザーの指示「一度入った金額のところを、もう修正できるように…
// 各セルに移ったときに、どこのセルの修正をしているかというセルの上にマウスを乗せたら分かるように」2026-11-02）
await page.getByRole('tab', {name: '📋 工事見積書'}).click();
await sheet.waitFor();
const laborRow = sheet.locator('.form-page tr', {hasText: '同上施工費'}).first();
const laborAmount = laborRow.locator('[data-edit$=":amount"]');
await laborAmount.hover();
const laborTitle = await laborAmount.getAttribute('title');
assert.match(laborTitle ?? '', /^①階段 ／ 同上施工費（.+） ／ 金額$/, laborTitle);
await laborAmount.click();
const barLabel = sheet.getByLabel('選んでいる欄', {exact: true});
assert.equal(await barLabel.getAttribute('title'), laborTitle);
assert.equal((await barLabel.innerText()).replace(/\s+/g, ''), laborTitle.replace(/\s+/g, '')); // 上の段の左にも同じ名前
await page.keyboard.type('5000');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
assert.ok(/ 5,000 /.test(` ${(await laborRow.innerText()).replace(/\s+/g, ' ')} `), await laborRow.innerText());
const railRow = sheet.locator('.form-page tr', {hasText: 'BD-132'}).first();
const railAmount = railRow.locator('[data-edit$=":amount"]');
await railAmount.hover();
assert.match((await railAmount.getAttribute('title')) ?? '', /^①階段 ／ .*BD-132.* ／ 金額$/);
const railPrice = railRow.locator('[data-edit$=":price"]');
await railPrice.hover();
assert.match((await railPrice.getAttribute('title')) ?? '', /^①階段 ／ .*BD-132.* ／ 単価$/);
await railAmount.click();
await page.keyboard.type('9999');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
assert.ok(/ 9,999 /.test(` ${(await railRow.innerText()).replace(/\s+/g, ' ')} `), await railRow.innerText());
await railAmount.click();
await sheet.getByLabel('選んでいる欄', {exact: true}).scrollIntoViewIfNeeded();
await page.mouse.wheel(0, -60);
await page.waitForTimeout(200);
await page.screenshot({path: path.join(outDir, 'spots-05-amount.png')});
// 部材の内容（品名）を Delete で消すと、その部材の行がなくなる（前は品名だけ消えて「材料費」と数量・単価が残った。ユーザーの指摘 2026-11-02）。Ctrl+Z で戻る
const before132 = await sheet.locator('.form-page tr', {hasText: 'BD-132'}).count();
await railRow.locator('[data-edit$=":text"]').click();
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
assert.equal(await sheet.locator('.form-page tr', {hasText: 'BD-132'}).count(), before132 - 1);
assert.equal(await sheet.locator('.form-page td', {hasText: /^材料費$/}).count(), 0);
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(200);
assert.equal(await sheet.locator('.form-page tr', {hasText: 'BD-132'}).count(), before132);
log('部材の内容を Delete で消すと行ごとなくなる（「材料費」が残らない）・Ctrl+Z で戻る OK');
// スマホの幅でも、選んでいる欄の名前で上の段が横にはみ出さない
await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(300);
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
await sheet.getByLabel('選んでいる欄', {exact: true}).scrollIntoViewIfNeeded();
await page.screenshot({path: path.join(outDir, 'spots-06-amount-phone.png')});
log(`金額の欄を直す（施工費 5,000・部材 9,999）・マウスを乗せると「${laborTitle}」OK`);

assert.deepEqual(errors, []);
await browser.close();
console.log('ALL OK');
