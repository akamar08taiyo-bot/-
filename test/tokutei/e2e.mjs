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
  // 介援隊のカタログの PDF（dist-tokutei/catalog/。ポータルの tokutei/catalog/）
  const catalog = /\/catalog\/([\w.-]+\.(?:pdf|json|jpg))$/.exec(path); // PDF と、ビルドで作った文字の一覧（text.json）・ページの絵（jpg）
  const file = catalog ? join('catalog', catalog[1]) : path.endsWith('/version.json') ? 'version.json' : 'index.html';
  try {
    const body = readFileSync(join(dist, file));
    res.writeHead(200, {'content-type': catalog ? (catalog[1].endsWith('.json') ? 'application/json' : catalog[1].endsWith('.jpg') ? 'image/jpeg' : 'application/pdf') : file.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'});
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
  // カタログの読み込み：PDF（ページの絵）とビルドで作った文字の一覧（catalog/text.json）を何回取りに行ったか
  const catalogGets = {pdf: 0, json: 0, jpg: 0};
  page.on('request', (r) => {
    if (/\/catalog\/[\w.-]+\.pdf$/.test(r.url())) catalogGets.pdf++;
    if (/\/catalog\/text\.json(\?|$)/.test(r.url())) catalogGets.json++;
    if (/\/catalog\/[\w.-]+\.jpg(\?|$)/.test(r.url())) catalogGets.jpg++;
  });
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
  // 種目の欄は種目だけ（ユーザーの指示「リストはシンプルに、入浴補助用具、腰掛便座などシンプルで良い」2026-10-26）。並びはよく出る順（「一番上に入浴補助用具、次に腰掛け便座、その後に歩行補助杖、歩行器、固定用スロープ」2026-10-26）
  assert.deepEqual(cats.sort(), ['入浴補助用具', '入浴補助用具', '入浴補助用具', '歩行補助つえ'].sort());
  assert.deepEqual(await page.locator('select[aria-label$="の種目"]').first().locator('option').allInnerTexts(), ['種目を選ぶ', '入浴補助用具', '腰掛便座', '歩行補助つえ', '歩行器', '固定用スロープ', '自動排泄処理装置の交換可能部品', '排泄予測支援機器', '簡易浴槽', '移動用リフトのつり具の部分']);
  await page.screenshot({path: `${out}/03-products.png`, fullPage: true});

  // ---- 見積もり：行橋市で新しく作り、★から2つ選ぶ
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 行橋市'}).click();
  await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('山田 花子');
  await page.getByLabel('被保険者番号', {exact: true}).fill('0123456789');
  // 定価の横の「★ お気に入りから入力」：選ぶとその欄の商品になって閉じる（ユーザーの指示「お気に入りから入力をこの辺にもってくる」2026-11-02）
  await page.getByRole('button', {name: '★ お気に入りから入力'}).last().click();
  await page.getByRole('button', {name: 'シャワーベンチ FSフィットを入れる'}).click();
  await page.getByRole('dialog', {name: 'お気に入りから入力'}).waitFor({state: 'detached'});
  await page.getByRole('button', {name: /^＋ \d+つ目の(福祉用具|商品)を追加$/}).click();
  await page.getByRole('button', {name: '★ お気に入りから入力'}).last().click();
  await page.getByRole('button', {name: '浴槽台 ユクリアを入れる'}).click();
  await page.getByRole('dialog', {name: 'お気に入りから入力'}).waitFor({state: 'detached'});
  // 商品の欄の下の「★ 商品を選ぶ」「📷 スクショから自動認識」はなくした（ユーザーの指示「商品を選ぶとスクショから認識はなくす」2026-11-02）
  assert.equal(await page.getByRole('button', {name: /★ 商品を選ぶ|スクショから自動認識/}).count(), 0);
  assert.deepEqual(await page.getByLabel('商品名', {exact: true}).evaluateAll((xs) => xs.map((x) => x.value)), ['シャワーベンチ FSフィット', '浴槽台 ユクリア']);
  // 定価の行（定価・割引率の右。欄がせまいとき＝プレビューと横に並べた 1366px は、そのすぐ下）に「★ お気に入りから入力」
  {
    const f = await page.getByRole('button', {name: '★ お気に入りから入力'}).first().boundingBox();
    const rate = await page.getByLabel('割引率', {exact: true}).first().boundingBox();
    const sameRow = f.x > rate.x + rate.width && Math.abs(f.y + f.height / 2 - (rate.y + rate.height / 2)) < 3;
    const below = f.y >= rate.y + rate.height - 1 && f.y < rate.y + rate.height + 12;
    assert.ok(sameRow || below, `${JSON.stringify(f)} ${JSON.stringify(rate)}`);
  }
  // 35,000×0.8＝28,000＋税2,800＝30,800、13,800×0.8＝11,040＋税1,104＝12,144 → 42,944円。1割：4,295円（切り上げ）・保険者 38,649円
  await page.getByText('42,944円').first().waitFor();
  // 負担割合は未選択から。選ぶまで自己負担額は出さない（ユーザーの指示 2026-10-27）
  assert.ok(!(await page.locator('aside').first().innerText()).includes('利用者負担'));
  await page.getByText('負担割合を選ぶと、自己負担額が出ます').waitFor();
  await page.getByRole('group', {name: '負担割合', exact: true}).first().getByRole('button', {name: '1割'}).click();
  await page.getByText(/利用者負担（1割）/).first().waitFor();
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
  // 電話番号はハイフンなしで打っても、打ち終わるとハイフンが入る（ユーザーの指示「ハイフンなしで入力してもよい。自動でハイフンをいれる」2026-11-05。tel.ts）
  await page.getByLabel('電話').fill('');
  await page.getByLabel('電話').pressSequentially('0930000000');
  assert.equal(await page.getByLabel('電話').inputValue(), '0930-00-0000');
  // 文例はプルダウン（用具ごとの見出しに10ずつ・約100字。ユーザーの指示「シャワーチェアで10個、浴槽台で10個…」2026-10-26）
  const examples = page.getByLabel('シャワーベンチ FSフィットが必要な理由の文例');
  assert.deepEqual(await examples.locator('optgroup').evaluateAll((l) => l.map((g) => `${g.label}${g.children.length}`)), ['シャワーチェア10']);
  await examples.selectOption(await examples.locator('optgroup[label="シャワーチェア"] option').first().getAttribute('value'));
  await page.getByLabel('浴槽台 ユクリアが必要な理由', {exact: true}).fill('浴槽内での立ち座りが困難なため。');
  await page.getByLabel('居宅介護支援事業所').fill('見本居宅介護支援事業所');
  await page.getByLabel('ケアマネジャー').fill('見本 太郎');
  // 申請日・支給申請日の欄はない（申請書には書かない。Excel で手入力。2026-10-28）。状態（見積・申請・…）と納品日（購入日）の欄もない
  // （ユーザーの指示「見積もり・申請・集金などの状態選択機能は不要なのでなくす」「納品日（購入日）も不要」2026-11-03）
  for (const l of ['申請日', '支給申請日', '納品日']) assert.equal(await page.getByLabel(l, {exact: true}).count(), 0, l);
  assert.equal(await page.getByRole('group', {name: '状態', exact: true}).count(), 0);
  await page.waitForTimeout(600);
  assert.equal(await page.getByText('未入力（空欄のまま作ります）').count(), 0);
  await page.screenshot({path: `${out}/04b-sale-shinsei.png`, fullPage: true});
  const [shinseiFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
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
    assert.doesNotMatch(readCell(f, sh, 'C26') ?? '', /令和8年/); // 申請日は書かない
    assert.equal(ellipseCount(f, sh), 3);
    assert.match(readCell(f, '委任状', 'B23'), /38,649円$/);
  }

  // ---- 申請書の画面：左で入れながら、右で申請書の原本の形のまま見る（住宅改修の申請書と同じ）
  await page.getByRole('button', {name: '📄 申請書', exact: true}).click();
  assert.equal(await page.getByRole('tab', {name: '📄 申請書（行橋市）'}).getAttribute('aria-selected'), 'true');
  const preview = page.getByLabel('申請書のプレビュー');
  await preview.getByRole('group', {name: '用具・受領委任払', exact: true}).waitFor();
  assert.deepEqual(await preview.getByRole('group').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), ['用具・受領委任払', '委任状', '完了写真']);
  // 委任状：保険給付額は大きく、委任者の氏名は自筆なので書かない（ユーザーの指示「委任状では、名前の部分は自筆となるため、印字しない」
  // 「委任状の金額部分は、もう少し大きくする」2026-10-27）
  const proxy = preview.getByRole('group', {name: '委任状', exact: true});
  assert.match(await proxy.innerText(), /38,649円/);
  assert.ok(!(await proxy.innerText()).includes('山田'), await proxy.innerText());
  await proxy.scrollIntoViewIfNeeded();
  await proxy.screenshot({path: `${out}/04h-shinsei-proxy.png`});
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
  await page.getByRole('button', {name: '📗 申請書をExcelで保存'}).waitFor();
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
  const [kouikiFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
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
  // ---- 福岡市（様式第18号の2・受領委任払用。支給申請書だけの1枚）：申請者は本人、受任者（販売事業者）は設定の営業所。
  // 保険者番号のうしろ2けた・あて先の区長は住所の区から。要介護度の行はなく、販売事業者（受任者）の行（営業所・事業者番号）が出る
  await page.getByLabel('保険者', {exact: true}).selectOption('fukuoka');
  await page.getByRole('tab', {name: '📄 申請書（福岡市）'}).waitFor();
  const FUKUOKA = preview.getByRole('group', {name: '申請書', exact: true});
  await FUKUOKA.waitFor();
  assert.deepEqual(await groups(), ['申請書']);
  assert.equal(await page.getByRole('group', {name: '要介護状態区分'}).count(), 0);
  await page.getByRole('textbox', {name: '住所', exact: true}).fill('福岡市早良区小田部1-2-3');
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('福岡市　早良　区　小田部1-2-3'));
  // 福岡市の申請書の販売事業者は福岡市の営業所（ユーザーの指示「福岡は、福岡東、福岡南、福岡西／こちらの該当営業所と所長にする」2026-11-05）：
  // 設定は行橋営業所のままでも、早良区は福岡西営業所。選べるのは福岡市の3つだけ。その営業所の事業者番号はまだない（薄い黄色）→ 入れる
  const sellerRow = '[data-field="seller"] > div:nth-child(2)';
  assert.equal(await page.getByLabel('販売事業者の営業所').inputValue(), '福岡西営業所');
  assert.deepEqual((await page.getByLabel('販売事業者の営業所').locator('option').allInnerTexts()).sort(), ['福岡南営業所', '福岡東営業所', '福岡西営業所'].sort());
  assert.equal(await page.getByLabel('事業者番号').inputValue(), '');
  await page.waitForFunction((sel) => document.querySelector(sel)?.className.includes('bg-amber-50'), sellerRow);
  await page.getByLabel('事業者番号').fill('4000000002');
  await page.waitForFunction((sel) => !document.querySelector(sel)?.className.includes('bg-amber-50'), sellerRow);
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('太陽シルバーサービス㈱　福岡西営業所'));
  // プレビューの受任者の欄を押すと、入れる所の販売事業者の行へ
  await preview.getByRole('button', {name: '販売事業者（受任者）'}).first().click();
  assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-field]')?.getAttribute('data-field')), 'seller');
  await page.waitForTimeout(300);
  await page.screenshot({path: `${out}/04h-sale-shinsei-fukuoka.png`});
  await FUKUOKA.screenshot({path: `${out}/04i-shinsei-fukuoka-sheet.png`});
  const [fukuokaFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  assert.equal(fukuokaFile.suggestedFilename(), '山田花子様特定福祉用具申請書.xlsx');
  await fukuokaFile.saveAs(`${out}/shinsei-fukuoka.xlsx`);
  {
    const {readCell, ellipseCount} = await import('../../src/tokutei/xlsxEdit.ts');
    const f = unzipSync(new Uint8Array(readFileSync(`${out}/shinsei-fukuoka.xlsx`)));
    const at = (ref) => readCell(f, '申請書', ref);
    const pairs = (start, n, row) => Array.from({length: n}, (_, i) => at(`${String.fromCharCode(start.charCodeAt(0) + 2 * i)}${row}`));
    assert.equal(at('E6'), '山田 花子');
    assert.equal([at('Y5'), at('AA5'), at('AC5'), at('AE5'), at('AG5'), at('AI5')].join(''), '401372'); // 早良区
    assert.equal([at('Q7'), at('S7'), at('U7'), at('W7'), at('Y7'), at('AA7'), at('AC7'), at('AE7'), at('AG7'), at('AI7')].join(''), '0123456789');
    assert.equal(pairs('Q', 5, 11).join('') + [at('AA11'), at('AC11'), at('AE11'), at('AG11'), at('AI11')].join(''), '4000000002');
    assert.equal(at('E11'), '太陽シルバーサービス㈱　福岡西営業所');
    assert.deepEqual([at('C13'), at('D13')], ['3', 'シャワーベンチ FSフィット']);
    assert.equal(at('Q19'), String(30800 + 12144)); // 合計＝見積書の購入金額
    assert.equal(at('D25'), '福岡市　早良　区長');
    assert.equal(at('L25'), '福岡市　早良　区　小田部1-2-3');
    assert.match(at('E32'), /早良区/);
    assert.equal(ellipseCount(f, '申請書'), 2); // 元号（昭）・在宅
  }
  // スマホの幅でも横にはみ出さない
  await page.setViewportSize({width: 390, height: 844});
  await FUKUOKA.waitFor();
  await page.waitForTimeout(300);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅の福岡市の申請書で横にはみ出している');
  await page.locator('[data-field="seller"]').screenshot({path: `${out}/07d-phone-seller-fukuoka.png`});
  await page.setViewportSize({width: 1366, height: 900});
  // ---- 保険者番号（ユーザーの指示「広域連合の場合は、築上町・豊前市・上毛町・吉富町…保険者を選択できる項目を入力欄に」2026-10-29）：
  // 福岡市は住所の区（早良区）。広域連合は住所の市町村（豊前市）から、選び直すとその番号を様式第8号の保険者番号の6マスに書く
  assert.equal(await page.locator('select[aria-label="保険者番号"]').inputValue(), '401372');
  // 区・市町村は保険者の行の中（保険者のすぐ下。ユーザーの指示「保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる」2026-10-29）。保険者を選ぶとそこへ移る
  const insurerRow = page.locator('[data-field="insurerNo"]');
  assert.equal(await insurerRow.locator('select[aria-label="保険者"]').count(), 1);
  assert.equal(await insurerRow.locator('select[aria-label="保険者番号"]').count(), 1);
  assert.equal(await page.locator('select[aria-label="保険者番号"]').evaluate((el) => el.closest('label').firstChild.textContent), '区');
  await page.getByLabel('保険者', {exact: true}).selectOption('kouiki');
  await preview.getByRole('group', {name: '様式第8号（福祉用具購入費支給申請書（受領委任払用））', exact: true}).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '保険者番号');
  assert.equal(await page.locator('select[aria-label="保険者番号"]').evaluate((el) => el.closest('label').firstChild.textContent), '市町村');
  await page.getByRole('textbox', {name: '住所', exact: true}).fill('福岡県豊前市大字八屋1-1');
  await page.waitForFunction(() => document.querySelector('select[aria-label="保険者番号"]')?.value === '402149');
  assert.ok((await page.locator('select[aria-label="保険者番号"]').locator('option').allInnerTexts()).some((t) => t.includes('406462') && t.includes('上毛町')));
  await page.locator('select[aria-label="保険者番号"]').selectOption('406462'); // 上毛町
  await page.locator('[data-field="insurerNo"]').screenshot({path: `${out}/04j-insurer-no-kouiki.png`});
  const [insurerFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  await insurerFile.saveAs(`${out}/shinsei-kouiki-insurer.xlsx`);
  {
    const {readCell} = await import('../../src/tokutei/xlsxEdit.ts');
    const f = unzipSync(new Uint8Array(readFileSync(`${out}/shinsei-kouiki-insurer.xlsx`)));
    assert.equal(['AA', 'AB', 'AC', 'AD', 'AE', 'AF'].map((c) => readCell(f, '様式第8号（福祉用具購入費支給申請書（受領委任払用））', `${c}2`)).join(''), '406462');
  }
  // ---- 北九州市（支給申請書・受領委任払用と概要書）：4枚のプレビュー。商品名は概要書に
  await page.getByLabel('保険者', {exact: true}).selectOption('kitakyushu');
  await page.getByRole('tab', {name: '📄 申請書（北九州市）'}).waitFor();
  await preview.getByRole('group', {name: '概要書', exact: true}).waitFor();
  assert.deepEqual(await groups(), ['支給申請書', '支給申請書（裏）', '概要書', '概要書（裏）']);
  // 広域連合で選んだ番号（上毛町）は北九州市では使わない（住所に区がなければ選んでいない）
  assert.equal(await page.locator('select[aria-label="保険者番号"]').inputValue(), '');
  assert.ok((await preview.getByRole('group', {name: '概要書', exact: true}).innerText()).includes('シャワーベンチ FSフィット'));
  await page.screenshot({path: `${out}/04k-sale-shinsei-kitakyushu.png`});

  // ---- 久留米市（2026-11-04。いただいた市の様式）：支給申請書・委任状（受領委任払用）・請求書・委任状（久留米市提出用）の4枚。
  // 要介護度の行はなく、販売事業者（受任者）の行に久留米市の受領委任払取扱事業所登録番号（設定）。番号が入るまで薄い黄色
  await page.getByRole('textbox', {name: '住所', exact: true}).fill('福岡県久留米市見本町1-2-3');
  await page.getByLabel('保険者', {exact: true}).selectOption('kurume');
  await page.getByRole('tab', {name: '📄 申請書（久留米市）'}).waitFor();
  await preview.getByRole('group', {name: '請求書', exact: true}).waitFor();
  assert.deepEqual(await groups(), ['申請書', '委任状（受領委任払用）', '請求書', '委任状（提出用）']);
  assert.equal(await page.getByRole('group', {name: '要介護状態区分'}).count(), 0);
  assert.equal(await page.getByLabel('販売事業者の営業所').inputValue(), '久留米営業所'); // 久留米市は久留米営業所（選ばなくても）
  await page.waitForFunction((sel) => document.querySelector(sel)?.className.includes('bg-amber-50'), sellerRow);
  await page.getByLabel('事業者番号').fill('4000000003');
  await page.getByLabel('受領委任払取扱事業所登録番号').fill('12345678');
  await page.waitForFunction((sel) => !document.querySelector(sel)?.className.includes('bg-amber-50'), sellerRow);
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('見本町1-2-3'));
  await page.waitForTimeout(300);
  await page.screenshot({path: `${out}/04l-sale-shinsei-kurume.png`});
  await preview.getByRole('group', {name: '申請書', exact: true}).screenshot({path: `${out}/04m-shinsei-kurume-sheet.png`});
  await preview.getByRole('group', {name: '請求書', exact: true}).screenshot({path: `${out}/04n-shinsei-kurume-claim.png`});
  const [kurumeFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  await kurumeFile.saveAs(`${out}/shinsei-kurume.xlsx`);
  {
    const {readCell, ellipseCount} = await import('../../src/tokutei/xlsxEdit.ts');
    const f = unzipSync(new Uint8Array(readFileSync(`${out}/shinsei-kurume.xlsx`)));
    const at = (ref) => readCell(f, '申請書', ref);
    assert.deepEqual([at('E5'), at('E10'), at('I10')], ['山田 花子', '久留米市', '見本町1-2-3']);
    assert.match(at('C12'), /シャワーベンチ FSフィット/);
    assert.equal(at('S12'), '【販売事業者名】\n太陽シルバーサービス㈱　久留米営業所');
    assert.deepEqual([at('H20'), at('L22')], [String(30800 + 12144), '4295']); // 購入金額合計・支払額（1割）
    assert.equal(['Q', 'S', 'U', 'W', 'Y', 'AA', 'AC', 'AE'].map((c) => at(`${c}44`)).join(''), '12345678');
    assert.equal(ellipseCount(f, '申請書'), 2); // 元号・支払方法（受領委任払い）
    const {KU_CELLS} = await import('../../src/tokutei/shinsei/kurumeCells.ts');
    // 保険給付額（42,944 − 4,295）：委任状と、請求書の11マス（頭に￥）
    assert.equal(readCell(f, '委任状（受領委任払用）', KU_CELLS.proxy.benefit), '38649');
    assert.equal(Array.from({length: 11}, (_, k) => readCell(f, '請求書', KU_CELLS.claim[`d${k}`])).join(''), '￥38649');
  }
  await page.setViewportSize({width: 390, height: 844});
  await preview.getByRole('group', {name: '請求書', exact: true}).waitFor();
  await page.waitForTimeout(300);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'スマホの幅の久留米市の申請書で横にはみ出している');
  await page.locator('[data-field="seller"]').screenshot({path: `${out}/07e-phone-seller-kurume.png`});
  await page.setViewportSize({width: 1366, height: 900});
  // ---- 大分市（2026-11-04）：支給申請書（第12号様式）と委任状の2枚。要介護状態区分の行がある
  await page.getByRole('textbox', {name: '住所', exact: true}).fill('大分県大分市見本町1-2-3');
  await page.getByLabel('保険者', {exact: true}).selectOption('oita');
  await page.getByRole('tab', {name: '📄 申請書（大分市）'}).waitFor();
  await preview.getByRole('group', {name: '委任状', exact: true}).waitFor();
  assert.deepEqual(await groups(), ['支給申請書', '委任状']);
  assert.equal(await page.getByRole('group', {name: '要介護状態区分'}).count(), 1);
  assert.equal(await page.getByLabel('販売事業者の営業所').inputValue(), '大分営業所'); // 大分市は大分営業所（選ばなくても）
  await page.getByLabel('事業者番号').fill('4000000004');
  await page.waitForFunction((sel) => !document.querySelector(sel)?.className.includes('bg-amber-50'), sellerRow);
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('大分営業所'));
  await page.waitForTimeout(300);
  await page.screenshot({path: `${out}/04o-sale-shinsei-oita.png`});
  await preview.getByRole('group', {name: '支給申請書', exact: true}).screenshot({path: `${out}/04p-shinsei-oita-sheet.png`});
  const [oitaFile] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: '📗 申請書をExcelで保存'}).click()]);
  await oitaFile.saveAs(`${out}/shinsei-oita.xlsx`);
  {
    const {readCell} = await import('../../src/tokutei/xlsxEdit.ts');
    const f = unzipSync(new Uint8Array(readFileSync(`${out}/shinsei-oita.xlsx`)));
    const at = (ref) => readCell(f, '支給申請書', ref);
    assert.equal(at('AK3'), '\u3000□償還\u3000\u3000■受領委任');
    assert.equal(at('I5'), '山田 花子');
    assert.match(at('A12'), /シャワーベンチ FSフィット/);
    assert.equal(at('I20'), '太陽シルバーサービス㈱　大分営業所');
    assert.equal(['AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT'].map((c) => at(`${c}20`)).join(''), '4000000004');
    assert.equal(readCell(f, '委任状', 'C6'), '大分県大分市見本町1-2-3');
  }

  // もとに戻す：住所は行橋市。営業所（設定。見積書の発行元）は申請書の営業所が替わっても行橋営業所のまま（下の見積書で確かめる）
  await page.getByRole('textbox', {name: '住所', exact: true}).fill('行橋市大字流末1327番地');
  await page.getByLabel('保険者', {exact: true}).selectOption('yukuhashi');
  await page.getByRole('tab', {name: '📄 申請書（行橋市）'}).waitFor();
  await preview.getByRole('group', {name: '用具・受領委任払', exact: true}).waitFor();
  // 商品マスタ（お気に入り）から入れた商品には「カタログから商品検索」「型番から検索」を出さない（商品は決まっている。手で入れる商品の欄だけ）
  assert.equal(await page.getByRole('button', {name: '📖 カタログから商品検索'}).count(), 0);
  assert.equal(await page.getByRole('button', {name: '🔢 型番から検索'}).count(), 0);

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
  assert.doesNotMatch(cellOf(sheet, 'H47'), /利用者負担/); // 備考は御見積合計の右（2026-11-03）
  assert.ok(!Object.keys(book).some((k) => k.startsWith('xl/media/')), '原本の印影の画像が入っている');
  // 印刷（PDF）は A4縦 1枚
  await assertFits(page, '2品');
  await page.pdf({path: `${out}/estimate.pdf`, preferCSSPageSize: true, printBackground: true});
  assert.equal(pdfPages(`${out}/estimate.pdf`), 1);
  await page.emulateMedia({media: 'screen'});
  await page.getByRole('button', {name: '閉じる'}).click();

  // ---- 介援隊のカタログの印刷（ユーザーの指示「販売見積書、申請書を作成するとき…カタログの PDF の印刷…各項目ごとに印刷がしやすいように」2026-10-26）。
  // カタログのページを A4 で並べ、チェックしたページだけ印刷する。初めは見積もりの商品が載っているページにチェック（品番がページにあれば、そのページ）
  await page.getByRole('button', {name: ADD_ITEM}).click();
  await page.getByLabel('商品名').last().fill('見本の入浴グリップ');
  await page.getByLabel('品番').last().fill('pn-l12211d'); // p.45 の品番（小文字・ハイフンのちがいは同じに見る）
  await page.locator('aside').getByRole('button', {name: '🖨 カタログを印刷'}).click();
  const catPages = page.getByRole('group', {name: '印刷するページ'});
  await catPages.waitFor();
  // ページの一覧は、商品で絞ったページだけ（チェック済み）。「＋ ほかのページ」で全部（ユーザーの指示「該当の項目で絞ったら絞ったものだけを表示するようにする。
  // 現在は、自分でチェックする形式」2026-11-01）。品番は全部のページの文字を読んでから見くらべる（それまでは細目とメーカーで選んだページ）
  const listedPages = () => catPages.getByRole('checkbox').evaluateAll((xs) => xs.map((x) => `${x.checked ? '☑' : '□'}${x.parentElement.textContent}`));
  await page.waitForFunction(
    () => [...document.querySelectorAll('[aria-label="印刷するページ"] input')].map((x) => (x.checked ? 'o' : 'x') + x.parentElement.textContent.split(' ')[0]).join(',') === 'op.37,op.44,op.45',
    null,
    {timeout: 60000},
  );
  assert.deepEqual(await listedPages(), ['☑p.37 シャワーベンチ（安寿）', '☑p.44 浴槽台・浴槽手すり（安寿）', '☑p.45 浴槽手すり・バスボード（パナソニック）']);
  await catPages.getByRole('button', {name: '＋ ほかのページ（23）'}).click();
  // いただいた全部のページ（26。シャワーキャリー・多点杖・ポータブルトイレも。ユーザーの指示「全て盛り込む」2026-11-01）
  assert.deepEqual(await listedPages(), [
    '☑p.37 シャワーベンチ（安寿）',
    '□p.40 シャワーチェア（パナソニック ユクリア）',
    '□p.41 シャワーチェア おりたたみ（パナソニック ユクリア）',
    '□p.43 浴槽台（パナソニック ユクリア）',
    '☑p.44 浴槽台・浴槽手すり（安寿）',
    '☑p.45 浴槽手すり・バスボード（パナソニック）',
    '□p.46 バスボード・移乗台・バスリフト',
    '□p.47 すべり止めマット',
    '□p.48 バスマット・シャワーキャリー',
    '□p.49 シャワーキャリー・シャワー用車いす',
    '□p.50 シャワーキャリー',
    '□p.51 シャワーキャリー・入浴用介助ベルト',
    '□p.136 歩行器（キャスター付き・固定式）',
    '□p.137 歩行器（固定型）・シルバーカー',
    '□p.151 多点杖（スリーベース・トリプル・かるがも）',
    '□p.152 多点杖（かるがも・エルビスクワド・やわらGEL）',
    '□p.153 多点杖（やわらGEL・バンブーステッキ）',
    '□p.154 多点杖（アルミ4点杖・クオッドケイン）',
    '□p.172 家具調トイレ（安寿）',
    '□p.173 家具調トイレ セレクトS（安寿）',
    '□p.174 ポータブルトイレ（さわやかチェア・ラップポン・きらく）',
    '□p.175 ポータブルトイレ（ジャスピタ・きらく・ラップポン・オーブ）',
    '□p.177 ポータブルトイレ（パナソニック）',
    '□p.178 ポータブルトイレ FX-30（安寿）',
    '□p.179 据置式便座・ポータブルトイレ（安寿）',
    '□p.214 段差解消スロープ',
  ]);
  await catPages.getByRole('button', {name: '絞ったページだけ'}).click();
  await page.waitForTimeout(1500); // 品番・商品の一覧を読み終えても、チェックは同じページ
  assert.deepEqual(await listedPages(), ['☑p.37 シャワーベンチ（安寿）', '☑p.44 浴槽台・浴槽手すり（安寿）', '☑p.45 浴槽手すり・バスボード（パナソニック）']);
  // 画面にもチェックしたページだけ（ユーザーの指示「該当のページのみ印刷プレビューに表示する」2026-10-26）
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.cat-sheet img')];
    return imgs.length === 3 && imgs.every((i) => i.complete && i.naturalWidth > 1500);
  }, null, {timeout: 60000});
  assert.deepEqual(await page.locator('.cat-sheet').evaluateAll((xs) => xs.map((x) => x.getAttribute('aria-label'))), ['カタログ p.37 シャワーベンチ（安寿）', 'カタログ p.44 浴槽台・浴槽手すり（安寿）', 'カタログ p.45 浴槽手すり・バスボード（パナソニック）']);
  // 品番の載っているページ：シャワーベンチ FSフィット（536-057）は p.37、浴槽台（536-480）は p.44、入浴グリップ（PN-L12211D）は p.45
  const checkedPages = async () => (await catPages.getByRole('checkbox').evaluateAll((xs) => xs.map((x) => (x.checked ? x.parentElement.textContent.split(' ')[0] : '')))).filter(Boolean);
  assert.deepEqual(await checkedPages(), ['p.37', 'p.44', 'p.45']);
  assert.equal(await page.title(), '山田 花子様 カタログ');
  await page.screenshot({path: `${out}/05c-catalog.png`});
  // 広い画面（xl）は左の空いた所の大きいボタン、狭い画面は上の帯のボタン（見えている方。ユーザーの指示「印刷ボタンをこちらに大きくもってくる」2026-10-28）
  const catPrint = page.locator('.print-overlay').getByRole('button', {name: '🖨 印刷する'}).filter({visible: true});
  // チェックを全部外すと印刷できない
  const ticked = ['p.37 シャワーベンチ（安寿）', 'p.44 浴槽台・浴槽手すり（安寿）', 'p.45 浴槽手すり・バスボード（パナソニック）'];
  for (const name of ticked) await catPages.getByRole('checkbox', {name}).uncheck();
  // （チェックを外したあとの画面の書きかえを待つ）
  const printDisabled = (on) =>
    page.waitForFunction((d) => [...document.querySelectorAll('.print-overlay button')].filter((b) => b.textContent.includes('印刷する')).every((b) => b.disabled === d), on, {timeout: 10000});
  await printDisabled(true);
  assert.equal(await catPrint.isDisabled(), true);
  for (const name of ticked) await catPages.getByRole('checkbox', {name}).check();
  await catPages.getByRole('button', {name: /^＋ ほかのページ/}).click();
  await catPages.getByRole('checkbox', {name: 'p.177 ポータブルトイレ（パナソニック）'}).check();
  await printDisabled(false); // 足した p.177 の絵ができるまで待つ（チェックしたページだけ絵にする）
  assert.equal(await catPrint.isDisabled(), false);
  await page.emulateMedia({media: 'print'});
  await page.pdf({path: `${out}/catalog.pdf`, preferCSSPageSize: true});
  await page.emulateMedia({media: 'screen'});
  assert.deepEqual(await checkedPages(), ['p.37', 'p.44', 'p.45', 'p.177']);
  assert.equal(pdfPages(`${out}/catalog.pdf`), 4);
  await page.getByRole('button', {name: '閉じる'}).click();
  await page.getByRole('button', {name: '見本の入浴グリップを消す'}).click();
  await page.locator('aside').getByRole('button', {name: '🖨 カタログを印刷'}).waitFor();

  // ---- カタログの窓（ユーザーの指示「商品を入力する際、カタログから検索という欄を入力して、右のスペースにカタログを開くことができる。
  // カタログを見ながら商品を入力できるようにする。カタログのポップは位置を移動したり、大きさを変更できるようにする」2026-10-26）
  // 「カタログから商品検索」は手で入れる商品の欄（3つ目を足す。あとで消す）。Enter でも開く（申請書の入れる所の「次の欄へ」にしない）
  await page.getByRole('button', {name: ADD_ITEM}).click();
  // 何も選んでいない欄の「📖 カタログから商品検索」は全部のページの窓。窓の検索の欄に注文番号（ハイフン・小文字のちがいは同じ）を打つと、そのページ
  const catButton = page.locator('[data-item]').last().getByRole('button', {name: '📖 カタログから商品検索'});
  await catButton.click();
  const viewer = page.getByRole('dialog', {name: 'カタログ'});
  await viewer.waitFor();
  await viewer.getByRole('searchbox', {name: 'カタログから検索'}).fill('261s1063'); // p.40 の注文番号
  await viewer.getByRole('searchbox', {name: 'カタログから検索'}).press('Enter');
  const viewerChips = viewer.getByRole('group', {name: 'カタログのページ'}).getByRole('button');
  // ページのボタンの頭には、そのページの品目（2026-11-01。p.40 は「シャワーチェア」）。注文番号の載っているページだけで開く（「✕ 全部のページ」で外せる）
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="カタログのページ"] button')].map((b) => b.textContent).filter((t) => /p\.\d+/.test(t)).join('|') === 'シャワーチェアp.40 シャワーチェア（パナソニック ユクリア）', null, {timeout: 60000});
  await page.waitForFunction(() => {
    const img = document.querySelector('[aria-label="カタログのページの絵"] img');
    return img?.getAttribute('alt') === 'p.40 シャワーチェア（パナソニック ユクリア）' && img.complete && img.naturalWidth > 1500;
  }, null, {timeout: 60000});
  // 右のスペース（見積書のプレビューの所）に出る。入れる所は隠さない
  const vw = page.viewportSize().width;
  const vBox = await viewer.boundingBox();
  assert.ok(Math.abs(vBox.x + vBox.width - (vw - 16)) < 2, JSON.stringify(vBox));
  const inputsBox = await catButton.boundingBox();
  assert.ok(inputsBox.x + inputsBox.width <= vBox.x + 1, `入れる所にかぶる ${JSON.stringify(inputsBox)} ${JSON.stringify(vBox)}`);
  await page.screenshot({path: `${out}/05d-catalog-viewer.png`});
  // 上の帯をつかむと動く・右下の角で大きさが変わる
  const grip = await viewer.getByText('📖 カタログ', {exact: true}).boundingBox();
  await page.mouse.move(grip.x + 10, grip.y + 5);
  await page.mouse.down();
  await page.mouse.move(grip.x - 290, grip.y - 45, {steps: 5});
  await page.mouse.up();
  const moved = await viewer.boundingBox();
  assert.ok(Math.abs(moved.x - (vBox.x - 300)) < 2 && Math.abs(moved.y - (vBox.y - 50)) < 2, `動かない ${JSON.stringify(moved)}`);
  // 画面の外へは出さない（右下の角をつかめるように）
  await page.mouse.move(grip.x - 290, grip.y - 45);
  await page.mouse.down();
  await page.mouse.move(grip.x - 290, grip.y + 400, {steps: 3});
  await page.mouse.up();
  const low = await viewer.boundingBox();
  assert.ok(Math.abs(low.y + low.height - page.viewportSize().height) < 2, `画面の外へ出た ${JSON.stringify(low)}`);
  await page.mouse.move(grip.x - 290, low.y + 5);
  await page.mouse.down();
  await page.mouse.move(grip.x - 290, moved.y + 5, {steps: 3});
  await page.mouse.up();
  const corner = await viewer.getByRole('button', {name: 'カタログの窓の大きさ'}).boundingBox();
  await page.mouse.move(corner.x + 12, corner.y + 12);
  await page.mouse.down();
  await page.mouse.move(corner.x + 12 - 120, corner.y + 12 - 90, {steps: 5});
  await page.mouse.up();
  const sized = await viewer.boundingBox();
  assert.ok(Math.abs(sized.width - (moved.width - 120)) < 2 && Math.abs(sized.height - (moved.height - 90)) < 2 && Math.abs(sized.x - moved.x) < 2, `大きさが変わらない ${JSON.stringify(sized)}`);
  // 窓の中でも検索し直せる（空にすると全部のページ）。ページを押すとそのページ
  assert.equal(await viewer.getByRole('button', {name: '✕ 全部のページ'}).count(), 0); // 何も選んでいない欄から開いた窓は絞っていない
  await viewer.getByRole('searchbox', {name: 'カタログから検索'}).fill('');
  assert.equal(await viewer.getByRole('group', {name: 'カタログのページ'}).getByRole('button', {name: /p\.\d+/}).count(), 26); // 2026-11-01 に歩行器の p.136・137、いただいた全部のページ（p.41〜51・151〜154・174・175）を足した
  await viewerChips.filter({hasText: 'p.172'}).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="カタログのページの絵"] img')?.getAttribute('alt') === 'p.172 家具調トイレ（安寿）', null, {timeout: 60000});
  // 拡大（＋）すると絵が窓より広くなり、窓の中でスクロールする
  const imgW = async () => (await viewer.getByRole('img').boundingBox()).width;
  const w0 = await imgW();
  await viewer.getByRole('button', {name: '大きく'}).click();
  assert.ok((await imgW()) > w0 * 1.15);
  assert.equal((await viewer.getByRole('button', {name: 'もとの大きさ'}).textContent())?.trim(), '120%');
  // ホイールは下へ・上へのスクロール（大きさは変えない）、大きさは － ＋（ユーザーの指示「スクロールは下にずらす。ズームは＋－で調整する」2026-11-03。前はホイールで拡大・縮小）。
  // つかんで横にも上下にも自由に動かせる（絵のまわりに余白。「つまみながら、横にずらすと、カタログ全体を動かすことが自由自在に動かすことができる」2026-11-03）
  const pageArea = viewer.getByLabel('カタログのページの絵');
  const area = await pageArea.boundingBox();
  await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.6);
  const w1 = await imgW();
  const scrolled = () => pageArea.evaluate((el) => ({left: el.scrollLeft, top: el.scrollTop}));
  const sw = await scrolled();
  await page.mouse.wheel(0, 200);
  await page.waitForFunction((t) => document.querySelector('[aria-label="カタログのページの絵"]').scrollTop > t + 50, sw.top);
  assert.ok(Math.abs((await imgW()) - w1) < 2, 'ホイールで大きさが変わった');
  await viewer.getByRole('button', {name: 'もとの大きさ'}).click(); // 100%：絵は窓の幅いっぱい
  const s0 = await scrolled();
  await page.mouse.move(area.x + area.width * 0.5, area.y + area.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.5 + 80, area.y + area.height * 0.5 + 60, {steps: 5});
  await page.mouse.up();
  const s1 = await scrolled();
  assert.ok(Math.abs(s1.left - (s0.left - 80)) < 3 && Math.abs(s1.top - (s0.top - 60)) < 3, `横・上へ動かない ${JSON.stringify(s0)} ${JSON.stringify(s1)}`);
  assert.ok(Math.abs((await imgW()) - w0) < 2);
  // 🖨 印刷 はカタログの印刷の画面。Esc で印刷の画面だけ閉じる（窓は残る）
  await viewer.getByRole('button', {name: '🖨 印刷'}).click();
  await page.getByRole('group', {name: '印刷するページ'}).waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.print-overlay').waitFor({state: 'detached'});
  assert.equal(await viewer.isVisible(), true);
  await viewer.getByRole('button', {name: 'カタログを閉じる'}).click();
  await viewer.waitFor({state: 'detached'});
  // 開き直すと、前に置いた所・大きさ（この端末で覚える）
  await page.getByRole('button', {name: '📖 カタログから商品検索'}).first().click();
  await viewer.waitFor();
  const again = await viewer.boundingBox();
  assert.ok(Math.abs(again.x - sized.x) < 2 && Math.abs(again.y - sized.y) < 2 && Math.abs(again.width - sized.width) < 2, `覚えていない ${JSON.stringify(again)}`);
  await page.keyboard.press('Escape');
  await viewer.waitFor({state: 'detached'});
  // スマホの幅：窓は画面いっぱい・検索の欄は1段まるごと・2本の指で広げると大きく（ユーザーの話「携帯で特定福祉用具カタログを開こうとした場合に開けない」2026-10-30。
  // 前は画面の下の6割に出て、住宅改修のタブの中では絵の所が画面の外になった。開くと14ページを一度に絵にしていて iPhone では開けなかった）
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: '📖 カタログから商品検索'}).first().click();
  await viewer.waitFor();
  assert.deepEqual(await viewer.boundingBox(), {x: 0, y: 0, width: 390, height: 844});
  const phoneSearch = await viewer.getByRole('searchbox', {name: 'カタログから検索'}).boundingBox();
  assert.ok(phoneSearch.width > 350, `検索の欄がせまい ${JSON.stringify(phoneSearch)}`);
  await page.waitForFunction(() => document.querySelector('[aria-label="カタログのページの絵"] img')?.complete, null, {timeout: 60000});
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  const view = await viewer.getByLabel('カタログのページの絵').boundingBox();
  const [cx, cy] = [view.x + view.width / 2, view.y + view.height / 2];
  const fingers = (d) => [{x: cx - d, y: cy, id: 1}, {x: cx + d, y: cy, id: 2}];
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: fingers(40)});
  for (let d = 50; d <= 100; d += 10) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: fingers(d)});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.equal((await viewer.getByRole('button', {name: 'もとの大きさ'}).textContent())?.trim(), '250%');
  await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: false});
  await page.screenshot({path: `${out}/05e-catalog-phone.png`});
  await viewer.getByRole('button', {name: 'カタログを閉じる'}).click();
  await viewer.waitFor({state: 'detached'});
  await page.setViewportSize({width: 1366, height: 900});
  await page.getByRole('button', {name: '商品を消す', exact: true}).click(); // 足した3つ目
  assert.equal(await page.locator('[data-item]').count(), 2);

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
  await page.getByText('仕切（任意）').last().waitFor();
  // 入れている所は住宅改修の申請書と同じ薄い黄色・細い枠（「黄色の部分の色がちょっと濃すぎて、チカチカして見にくい」2026-10-26）
  await page.waitForFunction(() => /bg-amber-300\/25 .*outline-1 .*outline-amber-400/.test(document.querySelector('[aria-label="見積書のプレビュー"] [data-pv-field="items"]')?.className ?? ''));
  // 「自己負担額を表示」は初めからオン：明細の最後の商品の2行下から介護保険の内訳（利用者負担は赤字）（ユーザーの指示「自己負担額を表示のオンオフっていうチェック項目を入れ」
  // 「この部分のみ記載する形で良い　利用者負担額の部分のみ赤字で記載する」2026-10-26）。外すと消える
  const selfPay = page.getByRole('checkbox', {name: '自己負担額を表示'});
  assert.equal(await selfPay.isChecked(), true);
  const estPreview = page.locator('[aria-label="見積書のプレビュー"]');
  await estPreview.getByText(/^利用者負担（1割）　[\d,]+円$/).waitFor();
  // プレビューの右上の − ％ ＋ で大きく・小さく。Ctrl＋スクロールでも（ユーザーの指示「見積もりの右上に+-マーク。アップして見えるようにする。Ctrl+スクロールでも可能にする」2026-11-01）
  const zoomBar = page.getByRole('group', {name: '拡大・縮小'});
  const zoomNow = async () => Number((await zoomBar.getByRole('button', {name: 'もとの大きさ'}).innerText()).replace('%', ''));
  const paperW = async () => (await estPreview.locator('[role="group"]').first().boundingBox()).width;
  const w100 = await paperW();
  // − ％ ＋ は用紙の上の段にあり、用紙（題名・日付）に重ならない（ユーザーの指摘「ここがおかしい」2026-11-04。前は用紙の右上に重ねていた）。スマホの幅でも
  const noOverlap = async (tag) => {
    // プレビューの枠を上まで戻してから測る（下へ動かしたときは、段が上に残って下を通る用紙を隠すのでよい）
    await estPreview.evaluate((el) => {
      for (let p = el; p; p = p.parentElement) if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) p.scrollTop = 0;
    });
    await zoomBar.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const bar = await zoomBar.first().boundingBox();
    const sheet = await estPreview.locator('[role="group"]').first().boundingBox();
    assert.ok(bar.y + bar.height <= sheet.y + 1, `${tag}：拡大・縮小のボタンが見積書の用紙に重なっている（${JSON.stringify({bar, sheet})}）`);
  };
  await noOverlap('1366px');
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(400);
  await noOverlap('390px');
  await page.screenshot({path: `${out}/07f-phone-estimate-zoom.png`});
  await page.setViewportSize({width: 1366, height: 900});
  await page.waitForTimeout(300);
  await zoomBar.getByRole('button', {name: '大きく'}).click();
  assert.equal(await zoomNow(), 120);
  assert.ok((await paperW()) > w100 * 1.15);
  await estPreview.hover({position: {x: 120, y: 160}}); // プレビューの上にマウスを置く（画面に出るまで動かす）
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="拡大・縮小"] [aria-label="もとの大きさ"]')?.textContent?.replace('%', '')) > 120);
  await page.screenshot({path: `${out}/05e-estimate-zoom.png`});
  await zoomBar.getByRole('button', {name: 'もとの大きさ'}).click();
  assert.equal(await zoomNow(), 100);
  await page.screenshot({path: `${out}/05e-self-pay.png`});
  await selfPay.uncheck();
  await estPreview.getByText('介護保険（受領委任払い）', {exact: true}).waitFor({state: 'detached'});
  await selfPay.check();
  await estPreview.getByText('介護保険（受領委任払い）', {exact: true}).waitFor();
  // 備考は御見積合計の右の枠に5行まで（前の「※※消費税について※※」の枠。ユーザーの指示「代わりに備考欄にする（行数を増やす）」2026-11-03。前は下の3行）
  await page.getByRole('textbox', {name: '備考', exact: true}).fill(['ご不明な点は担当までお問い合わせください。', '見本の2行目です。', '見本の3行目です。', '見本の4行目です。', '見本の5行目です。', '納品の前にお電話いたします。'].join('\n'));
  await page.getByText('見積書の備考は5行までです').waitFor();
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
  await page.locator('.est-sheet [role="group"]').first().waitFor();
  // 品名は商品ごとに メーカー／商品名／【品番】の行（ユーザーの指示 2026-11-01）・商品の下に1行あける（2026-11-03）ので、10品（★の2つは3行）は
  // 1ページ目の20行に★の2つと見本の商品 1〜6、2ページ目に 7・8 と介護保険の内訳
  const longDoc = (await page.locator('.est-sheet').allInnerTexts()).join('\n');
  for (const s of ['見本の商品 1', '見本の商品 8', 'ご不明な点は担当までお問い合わせください。', '見本の5行目です。', '42,944', '【品番】']) assert.ok(longDoc.includes(s), `10品の見積書に「${s}」がない`);
  assert.ok(!longDoc.includes('納品の前にお電話いたします。'));
  await assertFits(page, '10品');
  await page.pdf({path: `${out}/estimate-long.pdf`, preferCSSPageSize: true, printBackground: true});
  assert.equal(pdfPages(`${out}/estimate-long.pdf`), await page.locator('.est-sheet').count());
  await page.emulateMedia({media: 'screen'});
  await page.locator('.est-sheet').first().screenshot({path: `${out}/05c-estimate-long.png`});
  await page.getByRole('button', {name: '閉じる'}).click();
  await page.getByRole('textbox', {name: '備考', exact: true}).fill('ご不明な点は担当までお問い合わせください。');

  // ---- 1ページ目に入らなければ2ページ目（明細のつづき）。3ページまで（ユーザーの指示「ページは3ページまでいけるようにする」。1ページ目の明細は20行・商品の下に1行あける）
  // 23点：1ページ目に★の2つ＋見本の商品 1〜6、2ページ目に見本の商品 7〜21
  for (let n = 9; n <= 21; n++) {
    await page.getByRole('button', {name: ADD_ITEM}).click();
    await page.getByLabel('商品名').last().fill(`見本の商品 ${n}`);
  }
  await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
  await page.locator('.est-sheet [role="group"]').first().waitFor();
  assert.equal(await page.locator('.est-sheet').count(), 2);
  const page1 = await page.locator('.est-sheet').nth(0).innerText();
  const page2 = await page.locator('.est-sheet').nth(1).innerText();
  // 1つの商品の行はページをまたがない。1ページ目の最後の商品の次から2ページ目
  const lastOn1 = Math.max(...[...page1.matchAll(/見本の商品 (\d+)/g)].map((m) => Number(m[1])));
  assert.ok(lastOn1 >= 6 && page1.includes('1／2') && page1.includes('42,944'), page1);
  for (const s of ['御　見　積　書', '山田 花子　様', '2／2（明細のつづき）', `見本の商品 ${lastOn1 + 1}`, '見本の商品 21']) assert.ok(page2.includes(s), `2ページ目に「${s}」がない`);
  assert.ok(!page2.includes(`見本の商品 ${lastOn1}\n`));
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
  assert.equal(cellOf(sheet2, 'A71'), `見本の商品 ${lastOn1 + 1}`); // 2ページ目の明細の1行目（63行目から：頭の7行・見出し）
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
  // 長い商品名・メーカー名も、申請書の名前の欄では1つの名前が1行（ユーザーの指示「商品名が長いときに行が中途半端に2行になったり、メーカー名が2列になる。１行でおさめる」2026-10-26）
  await shinseiForm.getByLabel('商品名').fill('見本シャワーチェア Air ミドルワンタッチ ブルー');
  // メーカーはプルダウン（カタログのメーカー）。カタログにないメーカーは「ほかのメーカー（打つ）」で打つ（2026-11-03）
  await shinseiForm.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption({label: 'ほかのメーカー（打つ）'});
  await shinseiForm.getByRole('combobox', {name: 'メーカー（打つ）'}).fill('見本エイジフリーケアサービス（株）');
  const oneRow = (text) =>
    page.waitForFunction(
      (t) => {
        const span = [...document.querySelectorAll('[aria-label="申請書のプレビュー"] span')].find((x) => x.textContent === t);
        return span && span.getClientRects().length === 1;
      },
      text,
      {timeout: 5000},
    );
  // 長い商品名は区切りの良い所（空白）で2行にして、字を大きく（どの行も折り返さない。ユーザーの指示「商品名が長くなった場合は、2段にしてもよい」2026-11-01）
  await oneRow('見本シャワーチェア Air');
  await oneRow('ミドルワンタッチ ブルー');
  await oneRow('見本エイジフリーケアサービス㈱');
  // 歩行補助つえを選んでいれば、商品名がシャワーチェアでも歩行補助つえの文例だけ（ユーザーの指示「歩行補助杖を選択したのに、シャワーチェアの文例がでる」2026-10-26）
  assert.deepEqual(
    await shinseiForm.getByLabel('見本シャワーチェア Air ミドルワンタッチ ブルーが必要な理由の文例').locator('optgroup').evaluateAll((l) => l.map((g) => `${g.label}${g.children.length}`)),
    ['歩行補助つえ5'],
  );
  await shinseiForm.getByRole('combobox', {name: 'メーカー（打つ）'}).fill('');
  await shinseiForm.getByLabel('商品名').fill('見本の多点杖 ワイド');
  await shinseiForm.getByLabel('定価').fill('9000');
  // 定価の下に割引率（変えられる）と販売金額（＝定価×(100−割引率)%。打ち直せて ↺ で戻す）。右の金額は申請書の購入予定金額（税込）
  // （ユーザーの指示「定価の下に、販売金額を記載する」「定価の下に割引率を表示、変更できるようにする」2026-10-26）
  const rate = Number((await shinseiForm.getByLabel('割引率').inputValue()).replace(/,/g, ''));
  await shinseiForm.getByLabel('定価').blur();
  assert.equal(await shinseiForm.getByLabel('販売金額', {exact: true}).inputValue(), (9000 * (100 - rate) / 100).toLocaleString('ja-JP'));
  // 販売金額（税抜）のすぐ横に税込。税抜・税込のどちらを打っても割引率が変わり、割引率を打つと税抜・税込が変わる
  // （ユーザーの指示「税込の合計金額は、税抜きの横にしっかりとわかりやすくする。税抜き金額、税込み金額を変更すると、自動的に割引率が変わるようにする。また、逆もしかり」2026-11-03）
  const valueIs = (label, v) => page.waitForFunction(([l, x]) => document.querySelector(`[aria-label="${l}"]`)?.value === x, [label, v]);
  // 数字の欄は押してから打つ（押したときに桁区切りを外して全体を選ぶので、すぐに打つと前の数字のうしろに続いてしまう）
  const typeIn = async (label, v) => {
    const el = shinseiForm.getByLabel(label, {exact: true});
    await el.click();
    await page.waitForFunction((l) => document.activeElement?.getAttribute('aria-label') === l, label);
    await el.fill(v);
    await el.blur();
  };
  // 歩行補助つえ（多点杖）は非課税：見出しは「定価（非課税）」「販売金額（非課税）」、税込は税抜と同じ。税込の横の「非課税」ボタンで課税にもできる
  // （ユーザーの指示「歩行器（ピックアップ）や四点杖は非課税…全ての商品で認識する」「念のため、税込み金額の横に非課税ボタンを設置」2026-11-03）
  const taxFree = shinseiForm.locator('[data-item]').getByRole('button', {name: /非課税$/}); // 商品はこの1つだけ
  assert.equal(await taxFree.getAttribute('aria-pressed'), 'true');
  await typeIn('割引率', '30');
  await valueIs('販売金額', '6,300');
  await valueIs('販売金額（税込）', '6,300');
  assert.match(await shinseiForm.innerText(), /販売金額（非課税）/);
  await taxFree.click(); // 課税（10%）に
  await valueIs('販売金額（税込）', '6,930');
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('6,930'));
  await typeIn('販売金額', '7000');
  await valueIs('販売金額（税込）', '7,700');
  await valueIs('割引率', '22.2'); // 9,000円の 7,000円 ＝ 22.2%引き
  await typeIn('販売金額（税込）', '7920');
  await valueIs('販売金額', '7,200');
  await valueIs('割引率', '20');
  await page.waitForFunction(() => document.querySelector('[aria-label="申請書のプレビュー"]')?.textContent?.includes('7,920'));
  // ↺ で定価×割引率に戻す（手で入れた印＝薄い黄色が消える）
  await shinseiForm.getByRole('button', {name: '販売金額を自動に戻す'}).click();
  await valueIs('販売金額', '7,200');
  assert.equal(await shinseiForm.getByRole('button', {name: '販売金額を自動に戻す'}).count(), 0);
  await typeIn('割引率', String(rate));
  const one = Math.floor(((9000 * (100 - rate)) / 100) * 1.1);
  await valueIs('販売金額（税込）', one.toLocaleString('ja-JP'));
  // 数量（− ＋）は出さない（ユーザーの指示「台数は２台にすることがないので、数量機能は不要」2026-11-03。前は「数量を追加」2026-10-26）
  assert.equal(await shinseiForm.getByRole('button', {name: '見本の多点杖 ワイドの数量を1増やす'}).count(), 0);
  assert.equal(await shinseiForm.getByLabel('数量分の金額').count(), 0);
  await valueIs('販売金額（税込）', one.toLocaleString('ja-JP'));
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
  assert.equal(await shinseiForm.getByLabel('見本の多点杖 ワイドが必要な理由の文例').locator('optgroup[label="多点杖"] option').count(), 5); // 商品名から多点杖の文例
  const dialogs = [];
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.accept();
  });
  // 上の段は住宅改修の様邸の画面と同じ並び：名前の右に 📗 申請書をExcelで保存・🖨 申請書を印刷・削除、その真下に 🖨 カタログを印刷・複製
  // （ユーザーの指示「基本的な並びは、申請書をEXCELで保存、申請書（見積書を印刷）、削除 それ以外の独自の機能…は行を変えて、真下に統一して設置する」2026-10-28）
  const nameBox = await page.locator('h2').first().boundingBox();
  const xlBox = await page.getByRole('button', {name: '📗 申請書をExcelで保存'}).boundingBox();
  const prBox = await page.getByRole('button', {name: '🖨 申請書を印刷', exact: true}).boundingBox();
  const delBox = await page.getByRole('group', {name: '保存・印刷・削除'}).getByRole('button', {name: '削除', exact: true}).boundingBox();
  const catBox = await page.getByRole('button', {name: '🖨 カタログを印刷'}).boundingBox();
  assert.ok(nameBox && xlBox && prBox && delBox && catBox, 'ボタンがない');
  assert.ok(xlBox.x > nameBox.x + nameBox.width && Math.abs(xlBox.y + xlBox.height / 2 - (nameBox.y + nameBox.height / 2)) < 8, `${JSON.stringify(nameBox)} ${JSON.stringify(xlBox)}`);
  assert.ok(prBox.x > xlBox.x && Math.abs(prBox.y - xlBox.y) < 1 && delBox.x > prBox.x && Math.abs(delBox.y - xlBox.y) < 1, `${JSON.stringify(prBox)} ${JSON.stringify(delBox)}`);
  const copyBox = await page.getByRole('button', {name: '複製', exact: true}).boundingBox();
  assert.ok(Math.abs(catBox.x - xlBox.x) < 1 && catBox.y > xlBox.y + xlBox.height - 1, `${JSON.stringify(xlBox)} ${JSON.stringify(catBox)}`);
  assert.ok(copyBox && copyBox.x > catBox.x + catBox.width && Math.abs(copyBox.y - catBox.y) < 1, `${JSON.stringify(catBox)} ${JSON.stringify(copyBox)}`);
  assert.equal(await page.getByRole('button', {name: '📄 申請書（Excel）を作る'}).count(), 0);
  await page.getByRole('button', {name: '🖨 カタログを印刷'}).click();
  await page.getByRole('group', {name: '印刷するページ'}).waitFor();
  // 多点杖のページ（2026-11-01 に足した p.151〜154）から、商品名の「ワイド」のある p.153（バンブーステッキ ワイド多点杖）だけ
  await page.waitForFunction(
    () => [...document.querySelectorAll('[aria-label="印刷するページ"] input')].map((x) => (x.checked ? 'o' : 'x') + x.parentElement.textContent.split(' ')[0]).join(',') === 'op.153',
    null,
    {timeout: 60000},
  );
  await page.locator('.cat-sheet').first().waitFor();
  assert.equal(await page.locator('.cat-sheet').count(), 1);
  await page.locator('.print-overlay').getByRole('button', {name: '閉じる', exact: true}).click();
  await page.getByRole('button', {name: '🖨 申請書を印刷', exact: true}).click();
  // 手で入れた商品は聞かずにお気に入りへ（ユーザーの指示「一度入力した商品は、今後お気に入りの中に、項目ごとにいれる」2026-11-03。前は印刷の前に聞いていた）
  assert.ok(!dialogs.some((d) => /お気に入り/.test(d)), dialogs.join(' / '));
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
  assert.equal(await page.getByRole('button', {name: '複製', exact: true}).count(), 1); // 見積もりの上の段の複製
  await page.getByRole('button', {name: '📦 商品マスタ'}).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input, td, span, div')].some((el) => ('value' in el ? el.value : el.textContent) === '見本の多点杖 ワイド'));
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  if (!(await page.getByRole('button', {name: '＋ 苅田町'}).count())) await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  // 一覧の行の「複製」で1件増える（一度外したが、ユーザーの指示「複製するボタン削除してもらいましたが、やはり残してください」2026-10-26 で戻した）
  const listed = await page.getByRole('checkbox', {name: /を選ぶ$/}).count();
  await page.getByRole('button', {name: '複製', exact: true}).first().click();
  await page.waitForFunction((n) => document.querySelectorAll('input[type=checkbox][aria-label$="を選ぶ"]').length === n, listed + 1);
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

  // ---- カタログから商品を選ぶ（ユーザーの指示「シャワーチェアで、パナソニックを選んだ場合に、お渡ししたカタログの中の、パナソニックのシャワーチェアの一覧を表示する…
  // カタログに載っている商品、すべて取り込んでもらいたい」2026-10-30）：種目 → 品目（シャワーチェアなど）→ メーカー → 商品と色。押すと商品名・メーカー・品番・定価が入る
  await page.setViewportSize({width: 1366, height: 900});
  await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  if (!(await page.getByRole('button', {name: '＋ 苅田町'}).count())) await page.getByRole('button', {name: '📝 見積もり・申請'}).click();
  await page.getByRole('button', {name: '＋ 苅田町'}).click();
  await page.getByRole('button', {name: '📄 申請書', exact: true}).click();
  const catForm = page.getByRole('form', {name: '申請書に入れる所'});
  const pdfBefore = catalogGets.pdf;
  await catForm.getByLabel('種目', {exact: true}).selectOption('入浴補助用具');
  const picker = catForm.getByRole('group', {name: 'カタログの商品'});
  // 品目・メーカーはプルダウン、その下に「📖 カタログから商品検索」と右に品番・「🔢 型番から検索」（ユーザーの指示「入浴補助用具の右側のリストは不要。品目はプルダウン形式。
  // 品目を選んだら、該当のメーカーをプルダウンから選ぶ。その真下に、カタログから商品検索をもってくる。（絞られた該当のカタログを開く）右側に型番から検索をもってくる」2026-11-03）
  const subSel = picker.getByRole('combobox', {name: '品目'});
  await subSel.waitFor({timeout: 60000});
  // 商品の一覧はビルドで作った文字の一覧から（PDF 26 ページ・24MB を読まない。ユーザーの指示「カタログの読み込みスピードが遅くないか」2026-11-02）
  assert.equal(catalogGets.pdf, pdfBefore, `商品の一覧のために PDF を ${catalogGets.pdf - pdfBefore} 回読んだ`);
  assert.ok(catalogGets.json >= 1, 'catalog/text.json を読んでいない');
  // 種目の右にメーカーの欄はない（メーカーはカタログの枠のプルダウンだけ）
  const firstRow = catForm.locator('[data-item]').first().locator(':scope > div').first();
  assert.equal(await firstRow.getByRole('combobox', {name: /メーカー/}).count(), 0);
  const subOpts = await subSel.locator('option').allInnerTexts();
  const chairOpt = subOpts.find((t) => /^シャワーチェア（\d+）$/.test(t));
  assert.ok(chairOpt, subOpts.join(','));
  await subSel.selectOption({label: chairOpt});
  // メーカーのプルダウンは、シャワーチェアの商品のあるメーカーだけ（カタログの順。2026-11-01 にシャワーキャリーのページを足して、モリトー・カワムラサイクルなども）
  const makerSel = picker.getByRole('combobox', {name: 'メーカー', exact: true});
  const chairMakers = (await makerSel.locator('option').allInnerTexts()).filter((t) => /（株）$/.test(t));
  assert.deepEqual(chairMakers.slice(0, 2), ['アロン化成（株）', 'パナソニックエイジフリー（株）']);
  assert.ok(['ウチヱ（株）', 'ピジョン（株）'].every((m) => chairMakers.includes(m)), chairMakers.join(','));
  await makerSel.selectOption('パナソニックエイジフリー（株）');
  // 一覧は「📖 カタログから商品検索」を押してから。ボタンは品目の下、右（同じ行）に「🔢 型番から検索」（品番の欄は商品名の右）
  assert.equal(await picker.getByRole('list').count(), 0);
  const searchBtn = picker.getByRole('button', {name: '📖 カタログから商品検索'});
  const [btnBox, codeBox, subBox] = [await searchBtn.boundingBox(), await picker.getByRole('button', {name: '🔢 型番から検索'}).boundingBox(), await subSel.boundingBox()];
  assert.ok(codeBox.x > btnBox.x + btnBox.width && Math.abs(codeBox.y - btnBox.y) < 4 && btnBox.y > subBox.y + subBox.height - 1, `${JSON.stringify(btnBox)} ${JSON.stringify(codeBox)} ${JSON.stringify(subBox)}`);
  await page.screenshot({path: `${out}/05f-catalog-picker.png`});
  await searchBtn.click();
  const chairList = picker.getByRole('list', {name: 'シャワーチェアの商品'});
  await chairList.waitFor();
  assert.match(await picker.getByRole('button', {name: /^商品：/}).innerText(), /シャワーチェア・パナソニックエイジフリー（株）\s*24件/);
  const panaList = chairList;
  assert.equal(await panaList.getByRole('listitem').count(), 24); // カタログ p.40 のシャワーチェア 11種と p.41（おりたたみ）の 13種
  // 広い画面ではカタログの窓も、その商品の載っているページだけ
  const searchViewer = page.getByRole('dialog', {name: 'カタログ'});
  await searchViewer.waitFor();
  const viewerPages = searchViewer.getByRole('group', {name: 'カタログのページ'});
  await page.waitForFunction(() => !document.querySelector('[aria-label="カタログのページ"]')?.textContent?.includes('さがしています'));
  assert.deepEqual(await viewerPages.getByRole('button', {name: /^.+p\.\d+/}).allInnerTexts(), ['シャワーチェアp.40 シャワーチェア（パナソニック ユクリア）', 'シャワーチェアp.41 シャワーチェア おりたたみ（パナソニック ユクリア）']);
  // カタログの窓の「🖨 印刷」：絞ったページだけで印刷の画面を開く（ユーザーの指示「該当の項目で絞ったら絞ったものだけを表示するようにする」2026-11-01）
  await searchViewer.getByRole('button', {name: '🖨 印刷'}).click();
  const searchPrint = page.getByRole('group', {name: '印刷するページ'});
  await searchPrint.waitFor();
  assert.deepEqual(
    await searchPrint.getByRole('checkbox').evaluateAll((xs) => xs.map((x) => `${x.checked ? '☑' : '□'}${x.parentElement.textContent}`)),
    ['☑p.40 シャワーチェア（パナソニック ユクリア）', '☑p.41 シャワーチェア おりたたみ（パナソニック ユクリア）'],
  );
  await page.waitForFunction(() => document.querySelectorAll('.cat-sheet img').length === 2, null, {timeout: 60000});
  await page.screenshot({path: `${out}/05i-search-print.png`});
  await page.locator('.print-overlay').getByRole('button', {name: '閉じる', exact: true}).click();
  await page.screenshot({path: `${out}/05h-product-search.png`});
  await viewerPages.getByRole('button', {name: '✕ 全部のページ'}).click();
  assert.equal(await viewerPages.getByRole('button', {name: /^.+p\.\d+/}).count(), 26);
  await searchViewer.getByRole('button', {name: 'カタログを閉じる'}).click();
  // 色が2つ以上ある商品は、商品名を押すと色が開く（ユーザーの指示「商品名も色が複数ある場合は、アコーディオン形式にして、商品名をおすと、色を選べるようにする」2026-11-02）
  // 色が1つだけの商品（p.40 のプレミアム）は、商品名を押すとすぐ入る（色は品番の下の「モカブラウン」。2026-11-03 から品番の下の名前も読む）
  assert.deepEqual(await panaList.getByRole('button', {name: /を入れる$/}).evaluateAll((xs) => xs.map((x) => x.getAttribute('aria-label').replace(/ [\w-]+を入れる$/, ''))), ['シャワーチェアAir ミドルSPワンタッチ プレミアム モカブラウン']);
  const compact = panaList.getByRole('button', {name: 'シャワーチェアAir コンパクトSPワンタッチ（3種類）'});
  assert.equal(await compact.getAttribute('aria-expanded'), 'false');
  await compact.click();
  assert.equal(await compact.getAttribute('aria-expanded'), 'true');
  const colors = panaList.getByRole('group', {name: 'シャワーチェアAir コンパクトSPワンタッチの色・種類'});
  assert.equal(await colors.getByRole('button').count(), 3);
  // 開くのは1つずつ（別の商品を押すと前の商品は閉じる）
  const middle = panaList.getByRole('button', {name: 'シャワーチェアAir ミドルSPワンタッチ（3種類）'});
  await middle.click();
  assert.equal(await compact.getAttribute('aria-expanded'), 'false');
  assert.equal(await panaList.getByRole('group').count(), 1);
  await page.screenshot({path: `${out}/05f2-catalog-colors.png`});
  await compact.click();
  await colors.getByRole('button', {name: 'シャワーチェアAir コンパクトSPワンタッチ ブルー PN-L41431Aを入れる'}).click();
  assert.equal(await catForm.getByLabel('商品名').inputValue(), 'シャワーチェアAir コンパクトSPワンタッチ ブルー');
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="申請書に入れる所"] [aria-label="定価"]')?.value.replace(/[^\d]/g, '')) > 0); // 数字の欄は描いたあとに字が入る
  assert.equal(await panaList.count(), 0); // 選んだら一覧は閉じる（「📖 カタログから商品検索」で開き直せる）
  assert.equal(await makerSel.inputValue(), 'パナソニックエイジフリー（株）');
  await page.screenshot({path: `${out}/05g-catalog-picked.png`});
  // カタログの窓のページの商品を押して入れる（ユーザーの指示「…クリックするとカタログが開き、カタログと商品をリンクさせて、自動的に商品名や金額などが全てはいるようにする。
  // カタログでは、クリックできるよう認識できるようの工夫する」2026-11-02）：品目・メーカーのページだけの窓。ページの商品に押せる枠（＋ 選ぶ）。押して色を選ぶと入って、窓は閉じる
  await searchBtn.click();
  const pickViewer = page.getByRole('dialog', {name: 'カタログ'});
  await pickViewer.waitFor();
  const pickPages = await pickViewer.getByRole('group', {name: 'カタログのページ'}).getByRole('button', {name: /p\.\d+/}).allInnerTexts();
  assert.ok(pickPages.length >= 2 && pickPages.every((t) => /パナソニック/.test(t)), pickPages.join(' | '));
  await pickViewer.getByText('👆 商品を押すと「1つ目」に入ります').waitFor();
  const midHot = pickViewer.getByRole('button', {name: 'シャワーチェアAir ミドルSPワンタッチを選ぶ'});
  await midHot.waitFor({timeout: 30000});
  assert.equal(await pickViewer.locator('[data-hotspot]').count(), 11); // p.40 の 11 の商品
  assert.equal(await midHot.locator('span').innerText(), '＋ 選ぶ');
  await page.screenshot({path: `${out}/05j-catalog-hotspots.png`});
  await midHot.click();
  const chooser = pickViewer.getByRole('dialog', {name: '色・品番を選ぶ'});
  await chooser.waitFor();
  // 色を選ぶ欄はページの絵の下に並べる（絵に重ねない）。開いているあいだも絵だけを動かせて、端まで動かしてもうしろの画面は動かない
  // （ユーザーの指示「この状態で、写真だけスクロールで移動できるようにする」2026-11-02）
  const pickView = pickViewer.getByLabel('カタログのページの絵');
  const [pickViewBox, chooserBox] = [await pickView.boundingBox(), await chooser.boundingBox()];
  assert.ok(chooserBox.y >= pickViewBox.y + pickViewBox.height - 1, `${JSON.stringify(pickViewBox)} ${JSON.stringify(chooserBox)}`);
  assert.equal(await pickView.evaluate((el) => getComputedStyle(el).overscrollBehaviorY), 'contain');
  const midBox = await midHot.boundingBox(); // 押した商品の枠は、狭くなった絵の所の中に見えている
  assert.ok(midBox.y < pickViewBox.y + pickViewBox.height && midBox.y + midBox.height > pickViewBox.y, `${JSON.stringify(midBox)} ${JSON.stringify(pickViewBox)}`);
  assert.equal(await chooser.getByRole('button').filter({hasText: /PN-L4183/}).count(), 3);
  await chooser.getByRole('button', {name: /オレンジ/}).click();
  await chooser.waitFor({state: 'detached'});
  assert.equal(await catForm.getByLabel('商品名').inputValue(), 'シャワーチェアAir ミドルSPワンタッチ オレンジ');
  assert.equal(await catForm.getByLabel('品番').inputValue(), 'PN-L41831D');
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="申請書に入れる所"] [aria-label="定価"]')?.value.replace(/[^\d]/g, '')) > 0); // 数字の欄は描いたあとに字が入る
  // 選んだらカタログの窓は閉じる（ユーザーの指示「商品検索から商品を選んだら、カタログは閉じる。下の一覧表も閉じる」2026-11-03）
  await pickViewer.waitFor({state: 'detached'});
  assert.equal(await picker.getByRole('list').count(), 0);
  await page.screenshot({path: `${out}/05k-catalog-picked.png`});
  // 「⛶ 拡大」：ページ1枚を A4 の形で（絵の所の縦横が 297:210）。「↙ 拡大を閉じる」で前の窓の大きさに戻る
  // （ユーザーの指示「拡大ボタンをおすと開く、開くと、A４サイズに開く、閉じることもできるようにする」2026-11-04）
  await searchBtn.click();
  await pickViewer.waitFor();
  const winBefore = await pickViewer.boundingBox();
  await pickViewer.getByRole('button', {name: '⛶ 拡大'}).click();
  const bigView = await pickViewer.getByLabel('カタログのページの絵').evaluate((el) => ({w: el.clientWidth, h: el.clientHeight}));
  assert.ok(Math.abs(bigView.h / bigView.w - 297 / 210) < 0.02, JSON.stringify(bigView));
  assert.ok(bigView.h > winBefore.height * 0.8, `${JSON.stringify(bigView)} ${JSON.stringify(winBefore)}`);
  const bigBox = await pickViewer.boundingBox();
  assert.ok(bigBox.y >= 0 && bigBox.y + bigBox.height <= 900 && bigBox.x >= 0 && bigBox.x + bigBox.width <= 1366, JSON.stringify(bigBox));
  await pickViewer.getByText(/^\d+%$/).filter({hasText: '100%'}).waitFor();
  await page.screenshot({path: `${out}/05l-catalog-big.png`});
  await pickViewer.getByRole('button', {name: '↙ 拡大を閉じる'}).click();
  const back = await pickViewer.boundingBox();
  assert.deepEqual([back.x, back.y, back.width, back.height].map(Math.round), [winBefore.x, winBefore.y, winBefore.width, winBefore.height].map(Math.round));
  // 拡大した大きさは覚えない（次に開いたときはふつうの窓）
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('taiyo-tokutei-catalog-window-v1') ?? 'null')?.h), Math.round(winBefore.height));
  await pickViewer.getByRole('button', {name: 'カタログを閉じる'}).click();
  await pickViewer.waitFor({state: 'detached'});
  // 「📖 カタログから商品検索」は品目・メーカーのすぐ下・商品名の上。「★ お気に入りから入力」は「🔢 型番から検索」の右（ユーザーの指示「お気に入りから入力は、型番検索の右にもってくる」2026-11-03）
  const yOf = async (loc) => (await loc.boundingBox()).y;
  assert.ok((await yOf(makerSel)) < (await yOf(searchBtn)) && (await yOf(searchBtn)) < (await yOf(catForm.getByLabel('商品名'))));
  // 狭い幅（申請書のタブ）では次の段の左に折れる
  const favBox = await picker.getByRole('button', {name: '★ お気に入りから入力'}).boundingBox();
  const codeBtnBox = await picker.getByRole('button', {name: '🔢 型番から検索'}).boundingBox();
  assert.ok(
    (favBox.x > codeBtnBox.x + codeBtnBox.width && Math.abs(favBox.y - codeBtnBox.y) < 3) || (favBox.y >= codeBtnBox.y + codeBtnBox.height - 1 && Math.abs(favBox.x - btnBox.x) < 2),
    `${JSON.stringify(favBox)} ${JSON.stringify(codeBtnBox)}`,
  );
  assert.equal(await catForm.locator('[data-item]').first().getByRole('button', {name: '★ お気に入りから入力'}).count(), 1); // 定価の行には出さない
  // 品番を打って「🔢 型番から検索」：ぴったり同じ型番の商品がこの欄に入る（2つ目にはならない）
  await catForm.getByLabel('品番').fill('PN-L41431A');
  await picker.getByRole('button', {name: '🔢 型番から検索'}).click();
  await picker.getByRole('status').filter({hasText: '✓ 型番'}).waitFor({timeout: 60000});
  assert.equal(await catForm.getByLabel('商品名').inputValue(), 'シャワーチェアAir コンパクトSPワンタッチ ブルー');
  assert.equal(await catForm.getByLabel('商品名').count(), 1);
  await page.screenshot({path: `${out}/05l-catalog-row-search.png`});
  // 開き直す
  const rowViewer = page.getByRole('dialog', {name: 'カタログ'});
  await searchBtn.click();
  await rowViewer.waitFor();
  // カタログの印刷の「🔲 枠で囲む」（ユーザーの指示「カタログを丸で囲むボタンをつくる。印刷ボタンと並行して作成する」「丸でかこむは、しかくでわくがこみに変更」2026-11-02）：
  // 「印刷する」のすぐ上。初めて押すと見積もりの商品（PN-L41431A）に四角の枠。なぞると枠を足す・✕ で消す・Ctrl+Z で戻す
  await rowViewer.getByRole('button', {name: '🖨 印刷'}).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.cat-sheet img')].some((i) => i.complete && i.naturalWidth > 1000), null, {timeout: 60000});
  const markBtn = page.locator('.cat-print-side').getByRole('button', {name: '🔲 枠で囲む'});
  const sidePrint = await page.locator('.cat-print-side').getByRole('button', {name: /印刷する/}).boundingBox();
  const markBox = await markBtn.boundingBox();
  assert.ok(markBox.y + markBox.height <= sidePrint.y && Math.abs(markBox.x - sidePrint.x) < 2, `${JSON.stringify(markBox)} ${JSON.stringify(sidePrint)}`);
  await markBtn.click();
  assert.equal(await markBtn.getAttribute('aria-pressed'), 'true');
  const marks = page.locator('.cat-sheet [data-mark]');
  await page.waitForFunction(() => document.querySelectorAll('.cat-sheet [data-mark]').length === 1, null, {timeout: 30000});
  const markArea = await page.locator('.cat-mark-box').first().boundingBox();
  await page.mouse.move(markArea.x + markArea.width * 0.55, markArea.y + 300);
  await page.mouse.down();
  await page.mouse.move(markArea.x + markArea.width * 0.8, markArea.y + 420, {steps: 5});
  await page.mouse.up();
  assert.equal(await marks.count(), 2);
  await page.getByRole('button', {name: '枠を消す'}).click();
  assert.equal(await marks.count(), 1);
  await page.keyboard.press('Control+z');
  assert.equal(await marks.count(), 2);
  assert.deepEqual(await marks.evaluateAll((xs) => xs.map((x) => x.tagName)), ['rect', 'rect']); // 丸ではなく四角の枠
  await page.screenshot({path: `${out}/05m-catalog-marks.png`});
  // カタログのページは、ビルドで作った絵（catalog/*.jpg）を出す。端末の中で PDF を読まない（pdf.js は古い iPad の Safari で動かない。
  // ユーザーの話「タブレットで開くとパンフレットが開かない」2026-11-02）
  assert.equal(catalogGets.pdf, 0, `カタログの PDF を ${catalogGets.pdf} 回読んだ`);
  assert.ok(catalogGets.jpg >= 1, 'カタログのページの絵（jpg）を読んでいない');
  await page.locator('.print-overlay').getByRole('button', {name: '閉じる', exact: true}).click();
  await rowViewer.getByRole('button', {name: 'カタログを閉じる'}).click();
  // 合う商品がなければ、種目・メーカーの商品（知らせる）
  await catForm.getByLabel('商品名').fill('みほんのなまえ');
  await catForm.getByRole('button', {name: '📖 カタログから商品検索'}).click();
  await page.getByRole('dialog', {name: 'カタログ'}).waitFor();
  await picker.getByText(/「みほんのなまえ」に合う商品がないので/).waitFor();
  await page.getByRole('dialog', {name: 'カタログ'}).getByRole('button', {name: 'カタログを閉じる'}).click();

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
