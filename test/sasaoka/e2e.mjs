// ビルドした1ファイルのアプリを実際のブラウザで操作して確かめる。
// usage: node e2e.mjs <dist-sasaoka/index.html の URL> <出力フォルダ>
// Playwright はこのリポジトリの依存に入れていない。入っている場所を PLAYWRIGHT で指定できる（既定はクラウド環境の場所）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [url, outDir] = process.argv.slice(2);
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const shot = async (page, name) => page.screenshot({path: path.join(outDir, name), fullPage: true});
const log = (...a) => console.log('•', ...a);

const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP', acceptDownloads: true});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
page.on('dialog', (d) => d.accept());

await page.goto(url);
await page.getByText('分の様邸はまだありません').waitFor();
log('起動OK');
await shot(page, '01-empty.png');

// ---------------- 部材リスト：Excel の取り込み
await page.getByRole('navigation').getByRole('button', {name: /部材・施工費マスタ/}).click();
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
await page.locator('input[type=file]').setInputFiles(path.join(FIX, 'maker-list.xlsx'));
await page.getByRole('button', {name: '部材リストに取り込む（5件）'}).waitFor();
// 自動で選ばれた列の確認
const selects = page.locator('[role=dialog] select');
const selectedText = async (label) =>
  page.locator('[role=dialog] label', {hasText: label}).locator('select').evaluate((s) => s.options[s.selectedIndex].text);
assert.match(await selectedText('商品名の列'), /^C列/);
assert.match(await selectedText('仕切価格の列'), /^E列：3360/);
assert.match(await selectedText('定価の列（見積に使う）'), /^D列：4800/);
assert.match(await selectedText('品番の列'), /^B列/);
log('Excel の列の自動判定OK', await selects.count());
await page.getByRole('button', {name: '手すり I型 600mmを★に'}).click();
await page.getByRole('button', {name: 'ブラケット(エンド)を★に'}).click();
await shot(page, '02-import-xlsx.png');
await page.getByRole('button', {name: '部材リストに取り込む（5件）'}).click();
await page.getByText('新しく 5件').waitFor();
log('Excel 取り込みOK');

// ---------------- 部材リスト：PDF（埋め込みなしの日本語フォント＝CMapが必要）
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
await page.locator('[role=dialog] input[type=file]').setInputFiles(path.join(FIX, 'maker-cid.pdf'));
await page.getByText(/PDF 1ページ/).waitFor({timeout: 30000});
await page.getByPlaceholder('例：マツ六').fill('サンプル精工');
const pdfRows = await page.locator('[role=dialog] tbody tr').count();
const names = await page.locator('[role=dialog] tbody tr td:nth-child(5) input').evaluateAll((els) => els.map((e) => e.value));
const prices = await page.locator('[role=dialog] tbody tr td:nth-child(8) input').evaluateAll((els) => els.map((e) => e.value.replace(/,/g, '')));
const lists = await page.locator('[role=dialog] tbody tr td:nth-child(7)').evaluateAll((tds) => tds.map((td) => td.querySelector('input')?.value.replace(/,/g, '') ?? td.textContent.trim()));
log('PDF（CMap）読み取り', pdfRows, names, prices, '定価', lists);
assert.deepEqual(names, ['木製手すり 35φ 600mm', '木製手すり 35φ 2000mm', 'エンドブラケット', 'I型ブラケット', 'エンドキャップ 35φ', 'L型コーナー(自在)']);
assert.deepEqual(prices, ['3360', '9800', '1470', '1330', '350', '2240']);
await page.getByRole('button', {name: '木製手すり 35φ 2000mmを★に'}).click();
await page.getByRole('button', {name: 'エンドキャップ 35φを★に'}).click();
await shot(page, '03-import-pdf.png');
await page.getByRole('button', {name: '部材リストに取り込む（6件）'}).click();
await page.getByText('新しく 6件').waitFor();
log('PDF 取り込みOK');

// ---------------- 部材リスト：LibreOffice で作ったPDF（フォント埋め込み）
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
await page.locator('[role=dialog] input[type=file]').setInputFiles(path.join(FIX, 'maker-list.pdf'));
await page.getByText(/PDF 1ページ/).waitFor({timeout: 30000});
const lines2 = await page.locator('[role=dialog] tbody tr td:nth-child(5) input').evaluateAll((els) => els.map((e) => e.value));
log('PDF（埋め込み・1行ずつ）', lines2);
await page.getByRole('button', {name: '表の列で読む'}).click();
const lines3 = await page.locator('[role=dialog] tbody tr').evaluateAll((trs) =>
  trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.querySelector('input:not([type=checkbox])')?.value ?? td.textContent.trim())),
);
log('PDF（埋め込み・表の列で読む）', JSON.stringify(lines3.slice(0, 3)));
await shot(page, '04-import-pdf2.png');
await page.locator('[role=dialog]').getByRole('button', {name: '閉じる'}).first().click();

await shot(page, '05-materials.png');

// ---------------- 様邸を作る：玄関（部材2種＋木2箇所）・トイレ（部材＋タイル1箇所）
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click();
await page.getByRole('button', {name: '＋ 様邸を追加'}).click();
await page.getByPlaceholder('例：山田').fill('田中');
await page.locator('input[type=date]').first().fill('2026-10-03');
await page.getByRole('button', {name: '玄関', exact: true}).click();
await page.getByRole('button', {name: '＋ 部材を追加'}).click();
const dlg = page.locator('[role=dialog]');
// 入れたあとは ＋／− で数量を変える（＋ 追加 → ＋ → ＋ → − で2本）
const railRow = dlg.getByRole('row', {name: /手すり I型 600mm/});
await railRow.getByRole('button', {name: '＋ 追加'}).click();
await railRow.getByRole('button', {name: /を1つ増やす/}).click();
await railRow.getByRole('button', {name: /を1つ増やす/}).click();
await railRow.getByRole('button', {name: /を1つ減らす/}).click();
assert.equal((await railRow.getByLabel(/の数量$/).innerText()).trim(), '2');
await dlg.getByRole('row', {name: /ブラケット\(エンド\)/}).getByRole('button', {name: '＋ 追加'}).click();
await shot(page, '06-picker.png');
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.getByRole('button', {name: '＋ 取付手間（箇所数を数える）'}).click();
await page.getByRole('button', {name: '木の箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '木の箇所数を1増やす', exact: true}).click();
await shot(page, '07-labor.png');
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();

await page.getByRole('button', {name: 'トイレ', exact: true}).click();
await page.getByRole('button', {name: '＋ 部材を追加'}).nth(1).click();
await dlg.getByRole('button', {name: /^すべて/}).click();
await dlg.getByPlaceholder(/商品名・品番で検索/).fill('エンドキャップ サンプル精工');
await dlg.getByRole('row', {name: /エンドキャップ 35φ/}).first().getByRole('button', {name: '＋ 追加'}).click();
await dlg.getByRole('row', {name: /エンドキャップ 35φ/}).first().getByRole('button', {name: /を1つ増やす/}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.getByRole('button', {name: '＋ 取付手間（箇所数を数える）'}).nth(1).click();
await page.getByRole('button', {name: 'タイルの箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();

// 期待値：玄関 部材 3360×2＋1500＝8220、手間 1000×2＝2000／トイレ 部材 350×2＝700、手間 1500
// ① 8920 ② 3500 ③ round(624.4)=624 ④ round((8920+3500+624)×0.07=913.08)=913 ⑦ 13957 ⑤ round(1395.7)-1=1395 ⑥ 15352
const box = await page.locator('aside table').innerText();
log('集計', box.replace(/\s+/g, ' '));
for (const v of ['8,920', '3,500', '624', '913', '1,395', '15,352', '13,957']) assert.ok(box.includes(v), `集計に ${v} がない`);
await shot(page, '08-editor.png');

// ---------------- 一覧・2件目（サンプル）・印刷
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click(); // 様邸の画面の左上は「← 見積もりへ戻る」。一覧へはタブで戻る
const listText = await page.locator('table').first().innerText();
assert.ok(listText.includes('田中様邸'));
assert.ok(listText.includes('13,957'));
// 請求書の消費税は全様邸の合計×0.1（切り捨て）：13,957 → 1,395、ご請求金額 15,352
assert.ok((await page.getByText(/ご請求金額（税込）/).innerText()).includes('15,352'));
// 次の月でサンプルを試してから、この月に戻ってもう1件（複製）
await page.getByRole('button', {name: '＋ 様邸を追加'}).click();
await page.getByPlaceholder('例：山田').fill('佐藤');
await page.locator('input[type=date]').first().fill('2026-10-12');
await page.getByRole('button', {name: 'トイレ', exact: true}).click();
await page.getByRole('button', {name: '＋ 部材を追加'}).click();
await dlg.getByRole('row', {name: /木製手すり 35φ 2000mm/}).getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await page.getByRole('button', {name: '＋ 取付手間（箇所数を数える）'}).click();
await page.getByRole('button', {name: 'ウォシュレットの箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: 'ウォシュレット 部品代の箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click(); // 様邸の画面の左上は「← 見積もりへ戻る」。一覧へはタブで戻る
await shot(page, '09-list.png');

await page.getByRole('button', {name: '🖨 請求書＋各様邸の明細'}).click();
await page.locator('.print-overlay').waitFor();
await page.locator('.print-toolbar input').nth(1).fill('2026-10-001');
await shot(page, '10-print-preview.png');
await page.emulateMedia({media: 'print'});
await page.pdf({path: path.join(outDir, 'print-invoice.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true});
await page.emulateMedia({media: 'screen'});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('印刷PDFを作成');

// ---------------- 再読み込みしても残っているか
await page.waitForTimeout(800);
await page.reload();
await page.getByText('田中様邸').waitFor();
const after = await page.locator('table').first().innerText();
assert.ok(after.includes('佐藤様邸'));
await page.getByRole('navigation').getByRole('button', {name: /部材・施工費マスタ/}).click();
assert.ok((await page.getByText('全11件').count()) === 1, '部材リストが11件残っていない');
log('再読み込み後も保存されているOK');

// サンプル（次の月）
await page.getByRole('navigation').getByRole('button', {name: /請求書を確認する/}).click();
await page.getByRole('button', {name: '次の月'}).click();
await page.getByRole('button', {name: /サンプルで試す/}).click();
await page.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).waitFor();
await shot(page, '11-sample.png');
await page.getByRole('cell', {name: '（サンプル）山田様邸', exact: true}).click();
await shot(page, '12-sample-editor.png');

// 広い画面でタブを切り替えても、タブの列と中身の左の位置は動かない（ユーザーの報告「申請書・見積書を作成するのタブを選んだときのみ、左にぐっと動く」。
// 前は見積もりのタブだけ画面の幅が広く、1920px の画面では 100px 左に動いた）
await page.setViewportSize({width: 1920, height: 1000});
const lefts = [];
for (const name of [/見積もり・申請書を作成する/, /請求書を確認する/, /部材・施工費マスタ/, /設定/]) {
  await page.getByRole('navigation').getByRole('button', {name}).click();
  await page.waitForTimeout(300);
  lefts.push(await page.evaluate(() => [document.querySelector('nav button'), document.querySelector('main')?.firstElementChild].map((el) => Math.round(el.getBoundingClientRect().left)).join(',')));
}
assert.equal(new Set(lefts).size, 1, lefts.join(' / '));
log('タブを切り替えても左右に動かないOK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
