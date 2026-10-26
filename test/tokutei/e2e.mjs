// ブラウザで通しで確かめる（Playwright）：仕切り一覧表を貼り付けて取り込む → ★ → 見積もりを作る → 商品を選ぶ → 見積書を印刷の画面で見る。
// 使い方：npm run -s build:tokutei のあと
//   node test/tokutei/e2e.mjs [出力フォルダ]
// Playwright はリポジトリの依存に入れていない。場所は環境変数 PLAYWRIGHT（既定はこの作業環境の全体のもの）。
// dist-tokutei/ を小さなサーバーで /tokutei/ の下に置いて開く（太陽ポータルと同じ形）。

import {createServer} from 'node:http';
import {mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {strFromU8, unzipSync} from 'fflate';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node22/lib/node_modules/playwright/index.mjs');
// 2つ目からの商品を足すボタン（「＋ 2つ目の福祉用具を追加」「＋ 3つ目の商品を追加」。ユーザーの指示「追加のボタンはもう少しわかりやすいように」2026-10-26）
const ADD_ITEM = /^＋ \d+つ目の(福祉用具|商品)を追加$/;
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
// 番号は環境変数 E2E_PORT で替えられる（ほかの作業と同じ番号を使わないように）
const port = Number(process.env.E2E_PORT ?? 5191);
await new Promise((r) => server.listen(port, r));
const url = `http://localhost:${port}/tokutei/`;

const TABLE = [
  ['品番', '商品名', 'メーカー', 'TAISコード', '定価(税抜)', '仕切価格', '税区分'],
  ['536-057', 'シャワーベンチ FSフィット', 'アロン化成', '00170000123', '35,000', '21,000', '課税'],
  ['536-480', '浴槽台 ユクリア', 'アロン化成', '00170000456', '13,800', '8,280', '課税'],
  ['BG-01', 'バスグリップ', 'アロン化成', '', '15,800', '9,480', '課税'],
  ['FS4-B', '4点ステッキS', 'イーストアイ', '', '12,000', '7,200', '非課税'],
  ['T-100', 'T字杖 折りたたみ', 'イーストアイ', '', '4,000', '2,400', '非課税'],
]
  .map((r) => r.join('\t'))
  .join('\n');

/** 書き込んだ Excel の欄（式の欄は保存しておいた答え・文字の欄はその文字） */
function cellOf(sheetXml, ref) {
  const m = new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`).exec(sheetXml);
  return m ? (/<v>([^<]*)<\/v>/.exec(m[1]) ?? /<t[^>]*>([^<]*)<\/t>/.exec(m[1]))?.[1] ?? '' : '';
}

/** 印刷イメージの見積書（原本の A4 縦の紙）からはみ出さない：中身（ページの絵）が紙の内側にある（画面と印刷の両方） */
async function assertFits(page, label) {
  for (const media of ['screen', 'print']) {
    await page.emulateMedia({media});
    // どのページも（明細が多いときは3ページまで）
    const over = await page.evaluate(() =>
      Math.max(
        ...[...document.querySelectorAll('.est-sheet')].map((el) => {
          const sheet = el.getBoundingClientRect();
          const paper = el.querySelector('[role="group"]').getBoundingClientRect();
          return Math.max(paper.right - sheet.right, paper.bottom - sheet.bottom);
        }),
      ),
    );
    assert.ok(over <= 0.5, `${label}（${media}）：見積書が紙から ${over.toFixed(1)}px はみ出している`);
  }
}

/** PDF の n ページ目の文字（pdftotext があるとき。なければ null） */
function pdfText(file, n) {
  const r = spawnSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', file, '-'], {encoding: 'utf8'});
  return r.status === 0 ? r.stdout : null;
}

/** PDF のページ数（pdfinfo がなくても数えられるように、ページのオブジェクトを数える） */
function pdfPages(file) {
  return (readFileSync(file).toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
}

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
try {
  const ctx = await browser.newContext({viewport: {width: 1366, height: 900}});
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    } catch {
      /* about:blank では使えない */
    }
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();
  await page.screenshot({path: `${out}/01-home.png`});

  // ---- 商品マスタ：貼り付けた表を取り込む
  await page.getByRole('button', {name: '📦 商品マスタ'}).click();
  await page.getByRole('button', {name: '📄 仕切り一覧表を取り込む'}).click();
  await page.getByLabel('貼り付けた表').fill(TABLE);
  await page.getByRole('button', {name: '貼り付けた表を読み取る'}).click();
  // T字杖は対象外なので最初はチェックしない（取り込むのは4件）
  await page.getByRole('button', {name: '商品マスタに取り込む（4件）'}).waitFor();
  await page.getByRole('button', {name: 'シャワーベンチ FSフィットを★に'}).click();
  await page.getByRole('button', {name: '浴槽台 ユクリアを★に'}).click();
  await page.screenshot({path: `${out}/02-import.png`});
  await page.getByRole('button', {name: '商品マスタに取り込む（4件）'}).click();
  await page.getByText('全4件').waitFor();
  const cats = await page.locator('select[aria-label$="の種目"]').evaluateAll((els) => els.map((e) => e.value));
  // 種目の欄は種目だけ（ユーザーの指示「リストはシンプルに、入浴補助用具、腰掛便座などシンプルで良い」2026-10-26）
  assert.deepEqual(cats.sort(), ['入浴補助用具', '入浴補助用具', '入浴補助用具', '歩行補助つえ'].sort());
  assert.deepEqual(await page.locator('select[aria-label$="の種目"]').first().locator('option').allInnerTexts(), ['種目を選ぶ', '腰掛便座', '自動排泄処理装置の交換可能部品', '排泄予測支援機器', '入浴補助用具', '簡易浴槽', '移動用リフトのつり具の部分', '固定用スロープ', '歩行器', '歩行補助つえ']);
  await page.screenshot({path: `${out}/03-products.png`, fullPage: true});

  // ---- 見積もり：行橋市で新しく作り、★から2つ選ぶ
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 行橋市'}).click();
  await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('山田 花子');
  await page.getByLabel('被保険者番号', {exact: true}).fill('0123456789');
  await page.getByRole('button', {name: '★ 商品を選ぶ'}).click();
  await page.getByRole('button', {name: 'シャワーベンチ FSフィットを入れる'}).click();
  await page.getByRole('button', {name: '浴槽台 ユクリアを入れる'}).click();
  await page.getByRole('button', {name: '閉じる'}).last().click();
  // 35,000×0.8＝28,000＋税2,800＝30,800、13,800×0.8＝11,040＋税1,104＝12,144 → 42,944円。1割：4,295円（切り上げ）・保険者 38,649円
  await page.getByText('42,944円').first().waitFor();
  const aside = await page.locator('aside').first().innerText();
  assert.match(aside, /利用者負担（1割）\s*4,295円/);
  assert.match(aside, /保険者負担（9割）\s*38,649円/);
  await page.screenshot({path: `${out}/04-sale.png`, fullPage: true});

  // ---- 申請書：入れる（生年月日は和暦で・郵便番号は住所から自動・理由は文例のボタン）→ Excel を作る。
  // 「未入力（空欄のまま作ります）」の一覧は出さない（ユーザーの指示「全体的にシンプルにしたいので、今回はなくしてください。すべて」2026-10-26）
  assert.equal(await page.getByText('未入力（空欄のまま作ります）').count(), 0);
  // 入れ方は住宅改修と同じ（ユーザーの指示「生年月日なども含め、入力の仕方や色など、住宅改修と同じ入力方法にする」2026-10-26）：
  // フリガナはひらがなで打ってもカタカナ、生年月日は元号（初めは昭和）と年・月・日、性別・要介護状態区分は丸のボタン
  await page.getByLabel('フリガナ').fill('やまだ はなこ');
  assert.equal(await page.getByLabel('フリガナ').inputValue(), 'ヤマダ ハナコ');
  assert.equal(await page.getByRole('group', {name: '元号'}).getByRole('button', {name: '昭和'}).getAttribute('aria-pressed'), 'true');
  await page.getByLabel('生年月日の年').fill('15');
  await page.getByLabel('生年月日の月').fill('3');
  await page.getByLabel('生年月日の日').fill('15');
  await page.getByRole('group', {name: '性別'}).getByRole('button', {name: '女'}).click();
  await page.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護2'}).click();
  await page.getByLabel('住所').fill('行橋市大字流末1327番地');
  assert.equal(await page.getByLabel('郵便番号').inputValue(), '824-0043');
  await page.getByLabel('電話').fill('0930-00-0000');
  // 文例はプルダウン（種目ごとに5つ・約100字。ユーザーの指示「文例は、各種目…ごとに５種類ぐらい作成する。１００文字程度」2026-10-26）
  const examples = page.getByLabel('シャワーベンチ FSフィットが必要な理由の文例');
  assert.equal(await examples.locator('optgroup[label="文例"] option').count(), 5);
  await examples.selectOption(await examples.locator('optgroup[label="文例"] option').first().getAttribute('value'));
  await page.getByLabel('浴槽台 ユクリアが必要な理由', {exact: true}).fill('浴槽内での立ち座りが困難なため。');
  await page.getByLabel('居宅介護支援事業所').fill('見本居宅介護支援事業所');
  await page.getByLabel('ケアマネジャー').fill('見本 太郎');
  await page.getByLabel('申請日', {exact: true}).fill('2026-10-22');
  await page.getByLabel('納品日').fill('2026-10-30');
  await page.waitForTimeout(600);
  assert.equal(await page.getByText('未入力（空欄のまま作ります）').count(), 0);
  await page.screenshot({path: `${out}/04b-sale-shinsei.png`, fullPage: true});
  const [shinseiFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📄 申請書（Excel）を作る'}).click()]);
  assert.equal(shinseiFile.suggestedFilename(), '山田花子様特定福祉用具申請書.xlsx');
  await shinseiFile.saveAs(`${out}/shinsei.xlsx`);
  {
    const {readCell, ellipseCount} = await import('../../src/tokutei/xlsxEdit.ts');
    const f = unzipSync(new Uint8Array(readFileSync(`${out}/shinsei.xlsx`)));
    const sh = '用具・受領委任払';
    assert.equal(readCell(f, sh, 'F5'), '山田 花子');
    assert.equal(readCell(f, sh, 'F4'), 'ヤマダ ハナコ');
    assert.equal(['Z7', 'AA7', 'AB7', 'AC7', 'AD7', 'AE7', 'AF7', 'AG7', 'AH7', 'AI7'].map((r) => readCell(f, sh, r)).join(''), '0123456789');
    assert.equal(readCell(f, sh, 'F9'), '明・大・昭　15年3月15日生');
    assert.equal(readCell(f, sh, 'G10'), '824-0043');
    assert.equal(readCell(f, sh, 'A15'), '入浴補助用具\nシャワーベンチ FSフィット');
    assert.equal(readCell(f, sh, 'V15'), '30800');
    assert.match(readCell(f, sh, 'E18'), /^下肢筋力の低下により、浴室の床/);
    assert.match(readCell(f, sh, 'E18'), /\n浴槽内での立ち座りが困難なため。$/); // 頭に種目の名前は付けない（2026-10-26）
    assert.equal(readCell(f, sh, 'L20'), '見本居宅介護支援事業所　見本 太郎');
    assert.equal(readCell(f, sh, 'C26'), '令和8年10月22日');
    assert.equal(ellipseCount(f, sh), 3);
    assert.match(readCell(f, '委任状', 'B23'), /38,649円$/);
  }

  // ---- 申請書の画面：左で入れながら、右で申請書の原本の形のまま見る（住宅改修の申請書と同じ）
  await page.getByRole('button', {name: '📄 申請書', exact: true}).click();
  assert.equal(await page.getByRole('tab', {name: '📄 申請書（行橋市）'}).getAttribute('aria-selected'), 'true');
  const preview = page.getByLabel('申請書のプレビュー');
  await preview.getByRole('group', {name: '用具・受領委任払', exact: true}).waitFor();
  assert.deepEqual(await preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['用具・受領委任払', '委任状', '完了写真']);
  const pv = () => preview.getByRole('group', {name: '用具・受領委任払', exact: true}).innerText();
  assert.match(await pv(), /山田 花子/);
  assert.match(await pv(), /ヤマダ ハナコ/);
  assert.match(await pv(), /シャワーベンチ FSフィット/);
  // 入れる所は左、プレビューは右に並ぶ
  const inputBox = await page.getByRole('textbox', {name: 'お客様名'}).boundingBox();
  const pvBox = await preview.boundingBox();
  assert.ok(inputBox && pvBox && inputBox.x + inputBox.width < pvBox.x && pvBox.y < inputBox.y + 400, `${JSON.stringify(inputBox)} ${JSON.stringify(pvBox)}`);
  assert.equal(await page.locator('aside').count(), 0);
  // 打つとプレビューも変わる
  await page.getByRole('textbox', {name: '電話'}).fill('0930-11-2222');
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('0930-11-2222'));
  // 入れている所の欄を囲む
  await page.getByRole('textbox', {name: '住所'}).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"] [data-pv-field="address"]')?.className.includes('outline-sky-600'));
  // プレビューの欄を押すと、左のその入れる所へ
  await preview.getByRole('button', {name: 'フリガナ'}).first().click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'フリガナ');
  await preview.getByRole('button', {name: '居宅介護支援事業所・ケアマネジャー'}).first().click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '居宅介護支援事業所');
  // まだ入っていない所は、プレビューの欄と入れる所が薄い黄色
  await page.getByRole('textbox', {name: '電話'}).fill('');
  await page.getByRole('textbox', {name: 'お客様名'}).focus(); // 入れている所は囲むほうが先なので、ほかへ
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"] [data-pv-field="tel"]')?.className.includes('bg-amber'));
  assert.match((await page.locator('[data-field="tel"] > div').nth(1).getAttribute('class')) ?? '', /bg-amber-50/);
  await page.getByRole('textbox', {name: '電話'}).fill('0930-00-0000');
  await page.waitForFunction(() => !document.querySelector('[aria-label="申請書のプレビュー"] [data-pv-field="tel"]')?.className.includes('bg-amber'));
  // 申請書（Excel）もこの画面から作れる
  await page.getByRole('button', {name: '📄 申請書（Excel）を作る'}).waitFor();
  await page.screenshot({path: `${out}/04c-sale-shinsei-preview.png`});

  // ---- 広域連合（築上町など）：保険者を替えると申請書のタブも替わる。支給申請書だけの様式で、支払方法で受領委任払用・償還払い用。
  // 要介護度の欄はなく、居宅サービス計画の届出（有・無）がある（みやこ町と同じ入れる所が出る）
  const KOUIKI_JURYO = '様式第8号（福祉用具購入費支給申請書（受領委任払用））';
  const KOUIKI_SHOKAN = '福祉用具購入費支給申請書（償還払い用）';
  const KOUIKI_PHOTO = '写真貼付用紙(任意様式でも可）';
  const groups = () => preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await page.getByLabel('保険者', {exact: true}).selectOption('kouiki');
  await page.getByRole('tab', {name: '📄 申請書（広域連合）'}).waitFor();
  await preview.getByRole('group', {name: KOUIKI_JURYO, exact: true}).waitFor();
  assert.deepEqual(await groups(), [KOUIKI_JURYO, KOUIKI_PHOTO]);
  const kv = () => preview.getByRole('group', {name: KOUIKI_JURYO, exact: true}).innerText();
  assert.match(await kv(), /山田 花子/);
  assert.match(await kv(), /被保険者氏名\s*山田 花子/); // 委任状
  assert.match(await kv(), /居宅の事業所名\s*見本居宅介護支援事業所/);
  await page.waitForTimeout(300);
  await preview.getByRole('group', {name: KOUIKI_JURYO, exact: true}).screenshot({path: `${out}/04f-shinsei-kouiki-juryo.png`});
  // （1つ目のボタンは包んでいる label の名前になるので、文字で探す）
  assert.equal(await page.locator('[role=group][aria-label="居宅サービス計画の届出"] button[aria-pressed="true"]').textContent(), '有');
  // 様式の題名を押すと支払方法へ。償還払いにすると償還払い用（申請者は本人）
  await preview.getByRole('button', {name: '支払方法（受領委任払用・償還払い用）'}).first().click();
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-field]')?.getAttribute('data-field')), 'payMethod');
  await page.getByRole('group', {name: '支払方法'}).getByRole('button', {name: '償還払い'}).click();
  await preview.getByRole('group', {name: KOUIKI_SHOKAN, exact: true}).waitFor();
  assert.deepEqual(await groups(), [KOUIKI_SHOKAN, KOUIKI_PHOTO]);
  assert.match(await preview.getByRole('group', {name: KOUIKI_SHOKAN, exact: true}).innerText(), /昭和15年3月15日生/);
  await preview.getByRole('button', {name: '居宅介護支援事業所・ケアマネジャー'}).first().click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '居宅介護支援事業所');
  await page.waitForTimeout(300);
  await page.screenshot({path: `${out}/04d-sale-shinsei-kouiki.png`});
  await preview.getByRole('group', {name: KOUIKI_SHOKAN, exact: true}).screenshot({path: `${out}/04e-shinsei-kouiki-sheet.png`});
  const [kouikiFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📄 申請書（Excel）を作る'}).click()]);
  assert.equal(kouikiFile.suggestedFilename(), '山田花子様特定福祉用具申請書.xlsx');
  await kouikiFile.saveAs(`${out}/shinsei-kouiki.xlsx`);
  {
    const {readCell, ellipseCount} = await import('../../src/tokutei/xlsxEdit.ts');
    const f = unzipSync(new Uint8Array(readFileSync(`${out}/shinsei-kouiki.xlsx`)));
    assert.equal(readCell(f, KOUIKI_SHOKAN, 'I6'), '山田 花子');
    assert.equal(['W6', 'X6', 'Y6', 'Z6', 'AA6', 'AB6', 'AC6', 'AD6', 'AE6', 'AF6'].map((r) => readCell(f, KOUIKI_SHOKAN, r)).join(''), '0123456789');
    assert.equal(readCell(f, KOUIKI_SHOKAN, 'I8'), '昭和15年3月15日生');
    assert.equal(readCell(f, KOUIKI_SHOKAN, 'B14'), '入浴補助用具\nシャワーベンチ FSフィット');
    assert.equal(readCell(f, KOUIKI_SHOKAN, 'R20'), String(30800 + 12144)); // 合計＝見積書の購入金額
    assert.equal(readCell(f, KOUIKI_SHOKAN, 'J34'), '山田 花子');
    assert.equal(ellipseCount(f, KOUIKI_SHOKAN), 2); // 性別・届出（有）
    assert.equal(readCell(f, KOUIKI_JURYO, 'G3'), '');
    assert.equal(readCell(f, KOUIKI_PHOTO, 'B3'), '山田 花子');
  }
  // スマホの幅でも横にはみ出さない（プレビューは下に）
  await page.setViewportSize({width: 390, height: 844});
  await preview.getByRole('group', {name: KOUIKI_SHOKAN, exact: true}).waitFor();
  await page.waitForTimeout(300);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅の広域連合の申請書で横にはみ出している');
  await preview.screenshot({path: `${out}/07c-phone-shinsei-kouiki.png`});
  await page.setViewportSize({width: 1366, height: 900});
  // もとに戻す（行橋市・受領委任払い。このあとの見積書の確かめは行橋市のまま）
  await page.getByRole('group', {name: '支払方法'}).getByRole('button', {name: '受領委任払い'}).click();
  // みやこ町のプレビューも描ける（何行もある理由の欄：届出の有・無の丸と、字を1文字ずつ丸の位置に）
  await page.getByLabel('保険者', {exact: true}).selectOption('miyako');
  await preview.getByRole('group', {name: '福祉用具購入受領委任払申請書', exact: true}).waitFor();
  assert.match(await preview.getByRole('group', {name: '福祉用具購入受領委任払申請書', exact: true}).innerText(), /居宅サービス計画の届出/);
  await page.waitForTimeout(300);
  await preview.getByRole('group', {name: '福祉用具購入受領委任払申請書', exact: true}).screenshot({path: `${out}/04g-shinsei-miyako.png`});
  await page.getByLabel('保険者', {exact: true}).selectOption('yukuhashi');
  await page.getByRole('tab', {name: '📄 申請書（行橋市）'}).waitFor();
  await preview.getByRole('group', {name: '用具・受領委任払', exact: true}).waitFor();

  // 見積もりの画面に戻る（金額のまとめ）
  await page.getByRole('tab', {name: '📋 見積もり'}).click();
  assert.match(await page.locator('aside').first().innerText(), /利用者負担（1割）\s*4,295円/);

  // ---- 見積書（会社の見積書の原本の形。TSS の Excel に書き込んだもの）
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
  await page.locator('.est-sheet [role="group"]').waitFor();
  const doc = await page.locator('.est-sheet').innerText();
  for (const s of ['御　見　積　書', '山田 花子　様', '行橋営業所', 'T1290001044462', '42,944', 'シャワーベンチ FSフィット', '介護保険（受領委任払い）', '介護保険の対象　42,944円', '利用者負担（1割）　4,295円', '保険者負担（9割）　38,649円']) {
    assert.ok(doc.includes(s), `見積書に「${s}」がない`);
  }
  await page.screenshot({path: `${out}/05-estimate.png`});
  await page.locator('.est-sheet').screenshot({path: `${out}/05b-estimate-doc.png`});
  // Excel で保存：原本に書き込んだ .xlsx が、PDF と同じ名前で保存される（御見積合計は式のまま・答えも入れておく）
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.print-toolbar').getByRole('button', {name: '📗 Excelで保存'}).click()]);
  assert.equal(download.suggestedFilename(), '山田 花子様 販売見積書.xlsx');
  await download.saveAs(`${out}/estimate.xlsx`);
  const book = unzipSync(readFileSync(`${out}/estimate.xlsx`));
  const sheet = strFromU8(book['xl/worksheets/sheet1.xml']);
  assert.equal(cellOf(sheet, 'E21'), '42944');
  assert.match(sheet, /<c r="E21"[^>]*><f>/);
  assert.match(cellOf(sheet, 'A6'), /山田 花子　様/);
  // 介護保険の内訳は明細の自己負担額の下に1行ずつ（「備考欄に記載している部分を上にずらす」「行を変えて見やすくする」2026-10-26）。下の備考の欄には書かない
  assert.ok(sheet.includes('利用者負担（1割）　4,295円'));
  assert.doesNotMatch(cellOf(sheet, 'A60'), /利用者負担/);
  assert.ok(!Object.keys(book).some((k) => k.startsWith('xl/media/')), '原本の印影の画像が入っている');
  // 印刷（PDF）は A4縦 1枚
  await assertFits(page, '2品');
  await page.pdf({path: `${out}/estimate.pdf`, preferCSSPageSize: true, printBackground: true});
  assert.equal(pdfPages(`${out}/estimate.pdf`), 1);
  await page.emulateMedia({media: 'screen'});
  await page.getByRole('button', {name: '閉じる'}).click();

  // ---- 品目が多くても原本の明細（16行）の中に入って、A4 1枚のまま。備考は3行まで（入らない行は画面で知らせる）
  // 手で入れた品目は価格が空（0円）なので、合計（42,944円）は変わらない
  for (let n = 1; n <= 8; n++) {
    await page.getByRole('button', {name: ADD_ITEM}).click();
    await page.getByLabel('商品名').last().fill(`見本の商品 ${n}`);
  }
  // メーカー名は候補から選べる（はじめにパナソニックエイジフリー（株）・アロン化成（株））・ほかも打てる・仕切は任意・入れている所は薄い黄色（見積書の水色と分かれる）
  // （ユーザーの指示「メーカー名は、パナソニックエイジフリー（株）とアロン化成（株）はデフォルトにする。それ以外でも選べるようにする」「仕切りは（任意）」
  // 「見積もりが水色で入力しているとわかるようにしてある色も水色なので、わかりづらい。入力項目は、住宅改修などと同じ色にする」2026-10-26）
  const maker = page.getByRole('combobox', {name: 'メーカー'}).last();
  await page.getByRole('button', {name: 'メーカーを候補から選ぶ'}).last().click();
  await page.getByRole('listbox', {name: 'メーカーの候補'}).getByRole('option').first().waitFor();
  const makerOpts = await page.getByRole('listbox', {name: 'メーカーの候補'}).getByRole('option').allInnerTexts();
  assert.deepEqual(makerOpts.slice(0, 2), ['パナソニックエイジフリー（株）', 'アロン化成（株）']);
  await page.getByRole('option', {name: 'アロン化成（株）'}).click();
  assert.equal(await maker.inputValue(), 'アロン化成（株）');
  await maker.fill('見本工業');
  assert.equal(await maker.inputValue(), '見本工業');
  await page.getByText('仕切（税抜・任意）').last().waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="見積書のプレビュー"] [data-pv-field="items"]')?.className.includes('outline-amber-500'));
  // 「自己負担額を表示」は初めからオン：明細の最後の商品の2行下から介護保険の内訳（利用者負担は赤字）（ユーザーの指示「自己負担額を表示のオンオフっていうチェック項目を入れ」
  // 「この部分のみ記載する形で良い　利用者負担額の部分のみ赤字で記載する」2026-10-26）。外すと消える
  const selfPay = page.getByRole('checkbox', {name: '自己負担額を表示'});
  assert.equal(await selfPay.isChecked(), true);
  const estPreview = page.locator('[aria-label="見積書のプレビュー"]');
  await estPreview.getByText(/^利用者負担（1割）　[\d,]+円$/).waitFor();
  await page.screenshot({path: `${out}/05e-self-pay.png`});
  await selfPay.uncheck();
  await estPreview.getByText('介護保険（受領委任払い）', {exact: true}).waitFor({state: 'detached'});
  await selfPay.check();
  await estPreview.getByText('介護保険（受領委任払い）', {exact: true}).waitFor();
  await page.getByRole('textbox', {name: '備考', exact: true}).fill(['ご不明な点は担当までお問い合わせください。', '見本の2行目です。', '見本の3行目です。', '納品の前にお電話いたします。'].join('\n'));
  await page.getByText('見積書の備考は3行までです').waitFor();
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
  await page.locator('.est-sheet [role="group"]').waitFor();
  const longDoc = await page.locator('.est-sheet').innerText();
  for (const s of ['見本の商品 1', '見本の商品 8', 'ご不明な点は担当までお問い合わせください。', '42,944']) assert.ok(longDoc.includes(s), `10品の見積書に「${s}」がない`);
  assert.ok(!longDoc.includes('納品の前にお電話いたします。'));
  await assertFits(page, '10品');
  await page.pdf({path: `${out}/estimate-long.pdf`, preferCSSPageSize: true, printBackground: true});
  assert.equal(pdfPages(`${out}/estimate-long.pdf`), 1);
  await page.emulateMedia({media: 'screen'});
  await page.locator('.est-sheet').screenshot({path: `${out}/05c-estimate-long.png`});
  await page.getByRole('button', {name: '閉じる'}).click();
  await page.getByRole('textbox', {name: '備考', exact: true}).fill('ご不明な点は担当までお問い合わせください。');

  // ---- 16点を超えると2ページ目（明細のつづき）。3ページまで（ユーザーの指示「ページは3ページまでいけるようにする」。1ページ目は「行数は4行ぐらい減らしていい」で16行）
  // 23点：1ページ目に16点（★の2つ＋見本の商品 1〜14）、2ページ目に見本の商品 15〜21
  for (let n = 9; n <= 21; n++) {
    await page.getByRole('button', {name: ADD_ITEM}).click();
    await page.getByLabel('商品名').last().fill(`見本の商品 ${n}`);
  }
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
  await page.locator('.est-sheet [role="group"]').first().waitFor();
  assert.equal(await page.locator('.est-sheet').count(), 2);
  const page1 = await page.locator('.est-sheet').nth(0).innerText();
  const page2 = await page.locator('.est-sheet').nth(1).innerText();
  assert.ok(page1.includes('見本の商品 14') && !page1.includes('見本の商品 15') && page1.includes('1／2') && page1.includes('42,944'));
  for (const s of ['御　見　積　書', '山田 花子　様', '2／2（明細のつづき）', '見本の商品 15', '見本の商品 21']) assert.ok(page2.includes(s), `2ページ目に「${s}」がない`);
  await assertFits(page, '23品');
  await page.pdf({path: `${out}/estimate-2pages.pdf`, preferCSSPageSize: true, printBackground: true});
  assert.equal(pdfPages(`${out}/estimate-2pages.pdf`), 2);
  // 1ページ目の下（合計・備考）まで紙に出る（前は印刷の transform のせいで、紙の下のほうの字が消えた）
  const pdf1 = pdfText(`${out}/estimate-2pages.pdf`, 1);
  if (pdf1 !== null) {
    for (const s of ['39,040', '10%対象', 'ご不明な点は担当までお問い合わせください。']) assert.ok(pdf1.includes(s), `PDF の1ページ目に「${s}」がない`);
    // 介護保険の内訳は明細の下（23品なら2ページ目の最後の商品の下）
    const pdf2 = pdfText(`${out}/estimate-2pages.pdf`, 2);
    for (const s of ['見本の商品 21', '介護保険（受領委任払い）', '利用者負担（1割）', '4,295円']) assert.ok(pdf2.includes(s), `PDF の2ページ目に「${s}」がない`);
  }
  await page.emulateMedia({media: 'screen'});
  await page.locator('.est-sheet').nth(1).screenshot({path: `${out}/05d-estimate-page2.png`});
  const [download2] = await Promise.all([page.waitForEvent('download'), page.locator('.print-toolbar').getByRole('button', {name: '📗 Excelで保存'}).click()]);
  await download2.saveAs(`${out}/estimate-2pages.xlsx`);
  const sheet2 = strFromU8(unzipSync(readFileSync(`${out}/estimate-2pages.xlsx`))['xl/worksheets/sheet1.xml']);
  assert.equal(cellOf(sheet2, 'A71'), '見本の商品 15'); // 2ページ目の明細の1行目（63行目から：頭の7行・見出し）
  assert.equal(cellOf(sheet2, 'E21'), '42944');
  assert.match(sheet2, /<rowBreaks count="1" manualBreakCount="1"><brk id="62"/);
  await page.getByRole('button', {name: '閉じる'}).click();

  // ---- 読み直しても残っている（IndexedDB）
  await page.waitForTimeout(1200);
  await page.reload();
  await page.getByText('42,944円').first().waitFor();

  // ---- スマホの幅（同じデータのまま）：見積もりの画面・商品マスタが横にはみ出さない
  await page.setViewportSize({width: 390, height: 844});
  await page.getByText('42,944円').first().waitFor();
  for (const [name, file] of [
    ['見積もり', '07-phone-sale.png'],
    ['申請書', '07b-phone-shinsei.png'],
    ['商品マスタ', '08-phone-products.png'],
  ]) {
    if (name === '申請書') {
      await page.getByRole('tab', {name: /^📄 申請書/}).click();
      await page.getByLabel('申請書のプレビュー').getByRole('group', {name: '用具・受領委任払', exact: true}).waitFor();
    }
    if (name === '商品マスタ') await page.getByRole('button', {name: '📦 商品マスタ'}).click();
    await page.waitForTimeout(300);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // はみ出したときは、どの部品がはみ出しているかを出す（直す所が分かるように）
    const culprits = await page.evaluate(() =>
      [...document.querySelectorAll('main *')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest('.overflow-x-auto'))
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} 「${(el.textContent ?? '').trim().slice(0, 20)}」`),
    );
    assert.ok(wide <= 1, `スマホの幅の${name}で横にはみ出している（${wide}px）：${culprits.join(' / ')}`);
    await page.screenshot({path: `${out}/${file}`, fullPage: true});
  }

  // ---- 新しい見積もり：福祉用具の欄は最初から1つ開いている（打つとその商品になる。「＋ 2つ目の福祉用具を追加」は2つ目から。ユーザーの指示「基本は手で入れるのがデフォルトなので開いておく」）。
  // 手で入れた商品は「☆ お気に入りに登録」で商品マスタの★に。申請書の「🖨 印刷」は、印刷の前にまだ登録していない手入れの商品を登録するか聞く。一覧はチェックしてまとめて削除
  await page.setViewportSize({width: 1366, height: 900});
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  if (!(await page.getByRole('button', {name: '＋ 苅田町'}).count())) await page.getByRole('button', {name: '📝 見積もり・申請'}).click(); // 2回目で一覧へ
  await page.getByRole('button', {name: '＋ 苅田町'}).click();
  await page.getByRole('button', {name: '📄 申請書', exact: true}).click();
  const shinseiForm = page.getByRole('form', {name: '申請書に入れる所'});
  await shinseiForm.waitFor();
  assert.equal(await shinseiForm.getByRole('button', {name: ADD_ITEM}).count(), 0);
  await shinseiForm.getByLabel('種目', {exact: true}).selectOption('歩行補助つえ');
  await shinseiForm.getByLabel('商品名').fill('見本の多点杖 ワイド');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '商品名'); // 打っている欄から外れない
  await shinseiForm.getByLabel('定価').fill('9000');
  // 定価の下に割引率（変えられる）と販売金額（＝定価×(100−割引率)%。打ち直せて ↺ で戻す）。右の金額は申請書の購入予定金額（税込）
  // （ユーザーの指示「定価の下に、販売金額を記載する」「定価の下に割引率を表示、変更できるようにする」2026-10-26）
  const rate = Number((await shinseiForm.getByLabel('割引率').inputValue()).replace(/,/g, ''));
  await shinseiForm.getByLabel('定価').blur();
  assert.equal(await shinseiForm.getByLabel('販売金額', {exact: true}).inputValue(), (9000 * (100 - rate) / 100).toLocaleString('ja-JP'));
  await shinseiForm.getByLabel('割引率').fill('30');
  await shinseiForm.getByLabel('割引率').blur();
  await page.waitForFunction(() => document.querySelector('[aria-label="販売金額"]')?.value === '6,300');
  await shinseiForm.getByText('6,930円').waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('6,930'));
  await shinseiForm.getByLabel('販売金額', {exact: true}).fill('7000');
  await shinseiForm.getByLabel('販売金額', {exact: true}).blur();
  await shinseiForm.getByText('7,700円').waitFor();
  await shinseiForm.getByRole('button', {name: '販売金額を自動に戻す'}).click();
  await shinseiForm.getByText('6,930円').waitFor();
  await shinseiForm.getByLabel('割引率').fill(String(rate));
  await shinseiForm.getByLabel('割引率').blur();
  await shinseiForm.getByText(`${Math.floor((9000 * (100 - rate)) / 100 * 1.1).toLocaleString('ja-JP')}円`).waitFor();
  // 2つ目からは、最後の商品のすぐ下の横いっぱいの点線の枠。押すと足した商品の種目の欄へ移る（消して元に戻す）
  const addItem = shinseiForm.getByRole('button', {name: ADD_ITEM});
  assert.equal((await addItem.textContent())?.trim(), '＋ 2つ目の福祉用具を追加');
  const addBox = await addItem.boundingBox();
  const firstBox = await shinseiForm.locator('[data-item]').first().boundingBox();
  assert.ok(addBox && firstBox && addBox.width >= firstBox.width - 2 && addBox.y > firstBox.y + firstBox.height - 1, `${JSON.stringify(addBox)} ${JSON.stringify(firstBox)}`);
  await addItem.click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '種目' && document.activeElement.closest('[data-item]') === [...document.querySelectorAll('form [data-item], [role=form] [data-item]')].at(-1));
  assert.equal((await addItem.textContent())?.trim(), '＋ 3つ目の福祉用具を追加');
  await page.screenshot({path: `${out}/10-add-item.png`});
  await shinseiForm.getByRole('button', {name: '商品を消す', exact: true}).click();
  assert.equal(await shinseiForm.locator('[data-item]').count(), 1);
  assert.equal(await shinseiForm.getByLabel('見本の多点杖 ワイドが必要な理由の文例').locator('optgroup[label="文例"] option').count(), 5); // 商品名から多点杖の文例
  const dialogs = [];
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  // 申請書（Excel）を作る と 🖨 印刷 は同じ大きさで、まん中にそろえる（「申請書をつくると、印刷ボタンは統一の大きさで中央揃え」2026-10-26）
  const xlBox = await page.getByRole('button', {name: '📄 申請書（Excel）を作る'}).boundingBox();
  const prBox = await page.getByRole('button', {name: '🖨 印刷', exact: true}).boundingBox();
  const panelBox = await page.getByRole('button', {name: '📄 申請書（Excel）を作る'}).locator('xpath=..').boundingBox();
  assert.ok(xlBox && prBox && panelBox && Math.abs(xlBox.width - prBox.width) < 1 && Math.abs(xlBox.height - prBox.height) < 1 && Math.abs(xlBox.y - prBox.y) < 1, `${JSON.stringify(xlBox)} ${JSON.stringify(prBox)}`);
  assert.ok(Math.abs(xlBox.x - panelBox.x - (panelBox.x + panelBox.width - (prBox.x + prBox.width))) < 2, `まん中にない ${JSON.stringify(panelBox)}`);
  await page.getByRole('button', {name: '🖨 印刷', exact: true}).click();
  assert.match(dialogs[0] ?? '', /手で入れた商品をお気に入り（★）に登録しますか？\n・見本の多点杖 ワイド/);
  await page.locator('.print-overlay').waitFor();
  assert.ok((await page.locator('.print-overlay .est-sheet').count()) >= 3); // 事前申請書・支給申請書・委任状・完了写真
  // 印刷するのは初めは1枚目だけ（「申請書印刷の場合は、１枚目のみ印刷、デフォルトは」2026-10-26）。チェックでほかのページも足せる。紙（PDF）の枚数で確かめる
  const pagesGroup = page.getByRole('group', {name: '印刷するページ'});
  assert.deepEqual(await pagesGroup.getByRole('checkbox').evaluateAll((xs) => xs.map((x) => x.checked)).then((v) => v.slice(0, 3)), [true, false, false]);
  const printedPages = async (name) => {
    await page.emulateMedia({media: 'print'});
    await page.pdf({path: `${out}/${name}.pdf`, preferCSSPageSize: true});
    await page.emulateMedia({media: 'screen'});
    return pdfPages(`${out}/${name}.pdf`);
  };
  assert.equal(await printedPages('shinsei-print-1'), 1);
  await pagesGroup.getByRole('checkbox', {name: '2枚目'}).check();
  assert.equal(await printedPages('shinsei-print-2'), 2);
  await pagesGroup.getByRole('checkbox', {name: '2枚目'}).uncheck();
  await page.locator('.print-overlay').screenshot({path: `${out}/10-shinsei-print.png`});
  await page.getByRole('button', {name: '閉じる'}).click();
  await page.getByRole('button', {name: '📦 商品マスタ'}).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input, td, span, div')].some((el) => ('value' in el ? el.value : el.textContent) === '見本の多点杖 ワイド'));
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  if (!(await page.getByRole('button', {name: '＋ 苅田町'}).count())) await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  const before = await page.getByRole('checkbox', {name: /を選ぶ$/}).count();
  await page.getByRole('checkbox', {name: /を選ぶ$/}).first().check();
  await page.getByRole('checkbox', {name: /を選ぶ$/}).nth(1).check();
  await page.getByRole('status', {name: '選んだ見積もり'}).getByText('2件を選んでいます').waitFor();
  await page.getByRole('button', {name: 'まとめて削除'}).click();
  assert.match(dialogs.at(-1) ?? '', /^2件の見積もりを消します/);
  await page.waitForFunction((n) => document.querySelectorAll('input[type=checkbox][aria-label$="を選ぶ"]').length === n, before - 2);

  // ---- 設定：発行元はポータルで選んだ営業所（行橋営業所）
  await page.getByRole('button', {name: '⚙ 設定'}).click();
  assert.equal(await page.getByLabel('営業所').inputValue(), '行橋営業所');
  await page.getByRole('button', {name: '⬇ すべてをファイルに保存'}).waitFor();
  await page.screenshot({path: `${out}/09-settings.png`, fullPage: true});

  // ---- スマホの幅（はじめて開いたとき）
  const phone = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2});
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(url);
  await p2.getByRole('heading', {name: '特定福祉用具 購入申請書・見積もり作成'}).waitFor();
  await p2.screenshot({path: `${out}/06-phone-home.png`, fullPage: true});
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `スマホの幅で横にはみ出している（${overflow}px）`);

  assert.deepEqual(errors, []);
  console.log('ok: 取り込み → ★ → 見積もり → 申請書（Excel） → 見積書・Excel → 読み直し → スマホの幅');
} finally {
  await browser.close();
  server.close();
}
