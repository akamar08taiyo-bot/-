// 住宅改修 見積書作成を確かめる：一覧（見積の合計・笹岡工務店の請求書の印・探す）・サンプルの見積書（定価×0.8・切って使う部材の数量・同上施工費）・
// 見積の単価の手入力・部材ごとの施工費・部材＋施工費（常用）・保存（ボタン・Ctrl+S）・Excel で保存・諸経費の手入力・介護保険の対象外・
// 2つの書式（苅田町・行橋市・みやこ町用／広域連合用）の印刷・複製・削除・定価の取り込み・部材＋施工費（常用）のセットを登録
// usage: node e2e-estimate.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html と <サイト>/sasaoka/index.html）
// Playwright はこのリポジトリの依存に入れていない。入っている場所を PLAYWRIGHT で指定できる（既定はクラウド環境の場所）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {strFromU8, unzipSync} from 'fflate';

const [site, outDir] = process.argv.slice(2);
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const log = (...a) => console.log('•', ...a);
// 文字の設定のない環境では、日本語のファイル名のダウンロードが「download」になるので UTF-8 にする
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];
const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
await page.goto(`${site}/jutaku-mitsumori/index.html`);
assert.ok((await page.locator('main').innerText()).includes('見積書はまだありません'));
await page.getByRole('button', {name: /サンプルで試す/}).click();

// ---------------- 一覧：見積の合計・笹岡工務店の請求書の印（改修場所・保険者・担当は出さない。ユーザーの指示）
// 玄関：木の手すり 定価20,000（1本4m）を60cm → 0.15本×16,000＝2,400・同上施工費（木2。見積は1箇所1,500）3,000・ブラケット 2,100×0.8＝1,680×2
// トイレ：L型 11,000×0.8＝8,800・同上施工費（タイル2。見積は1箇所2,000）4,000・キャップ 450×0.8＝360×2
// 部材 15,280・施工費 7,000・小計 22,280・諸経費 2,220（10%の 2,228 から、合計の末尾が0になるよう端数調整）・消費税 2,450（(22,280＋2,220)×0.1 切り捨て）・合計 26,950
const now = new Date();
const thisMonthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月分に入れる`;
const sampleRow = page.getByRole('row', {name: /（サンプル）山田様邸/});
const rowText = await sampleRow.innerText();
for (const v of ['26,950', thisMonthLabel]) assert.ok(rowText.includes(v), `一覧に ${v} がない: ${rowText}`);
for (const v of ['行橋市', '久保', '玄関・トイレ']) assert.ok(!rowText.includes(v), `一覧に ${v} が出ている: ${rowText}`);
log('一覧OK');

// ---------------- 一覧の先頭のチェック：選んで次月に回す・前月に回す（一覧の月＝様邸の月。笹岡工務店の請求書の月も一緒に）
const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const nextMonth = `${next.getFullYear()}年${next.getMonth() + 1}月`;
const bar = page.getByRole('status', {name: '選んだ見積書'});
assert.equal(await bar.count(), 0);
await sampleRow.getByRole('checkbox', {name: '選ぶ'}).check();
assert.match(await bar.innerText(), /1件を選んでいます/);
await bar.getByRole('button', {name: '次月に回す ▶'}).click();
await page.locator('[aria-live] > div', {hasText: `1件を${nextMonth}に回しました`}).waitFor();
assert.equal(await sampleRow.count(), 0); // この月の一覧から消える
await page.getByRole('button', {name: '次の月'}).click();
assert.ok((await sampleRow.innerText()).includes(`${nextMonth}分に入れる`));
await page.getByRole('checkbox', {name: 'すべて選ぶ'}).check();
await bar.getByRole('button', {name: '◀ 前月に回す'}).click();
await page.getByRole('button', {name: '前の月'}).click();
assert.ok((await sampleRow.innerText()).includes(thisMonthLabel));
log('一覧の先頭のチェックで次月・前月に回すOK');

// ---------------- 行ごとの売上月（ユーザーの指示「見積もり作成日と、請求月というか販売月というか工事が発生する月っていうのは大きく異なります…
// 何月分かっていうのを簡単に切り替えができるように一覧表の中で」「切り替えた分に関しては受注残に飛ばすときにも、その月の該当の月の受注残に含める」2026-10-26）。
// ▶ で次の月へ（請求する月・売上見込みの月・受注残に渡す月も）。作成日はそのまま
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const salesGroup = sampleRow.getByRole('group', {name: '売上月'});
assert.equal((await salesGroup.innerText()).replace(/\s+/g, ''), `◀${now.getMonth() + 1}月▶`);
const dateBefore = await sampleRow.locator('td').nth(2).innerText(); // 先頭は種類（住改・特福）、次に選ぶ
await salesGroup.getByRole('button', {name: '売上月を次月に'}).click();
await page.locator('[aria-live] > div', {hasText: `（サンプル）山田様邸を${nextMonth}分にしました`}).waitFor();
assert.equal(await sampleRow.count(), 0);
const sentMonth = await page.evaluate(() => JSON.parse(localStorage.getItem('taiyo-jutaku-sales-v1') || '{}').rows?.find((r) => r.customer.includes('山田'))?.month);
assert.equal(sentMonth, ym(next)); // 受注残に渡す月
await page.getByRole('button', {name: '次の月'}).click();
assert.ok((await sampleRow.innerText()).includes(`${nextMonth}分に入れる`));
assert.equal(await sampleRow.locator('td').nth(2).innerText(), dateBefore); // 作成日は変えない
await page.screenshot({path: path.join(outDir, '51a-list-sales-month.png')});
await salesGroup.getByRole('button', {name: '売上月を前月に'}).click();
await page.getByRole('button', {name: '前の月'}).click();
await sampleRow.waitFor();
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('taiyo-jutaku-sales-v1') || '{}').rows?.find((r) => r.customer.includes('山田'))?.month), ym(now));
log('行ごとの売上月（◀ ▶）：請求する月・受注残に渡す月も移る・作成日はそのまま OK');

await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
// 見積書の上の「売上月」（ユーザーの話「請求月と販売月は基本的には同じです。まれに違うことがあります」2026-10-26）：初めは請求する月と同じで、
// 請求する月を変えると一緒に変わる。ちがう月にしたときだけ別（薄い黄色）で、受注残に渡す月もその月
const salesField = page.getByLabel('売上月', {exact: true});
const billField = page.getByLabel('請求する月', {exact: true});
const summaryMonth = () => page.evaluate(() => JSON.parse(localStorage.getItem('taiyo-jutaku-sales-v1') || '{}').rows?.find((r) => r.customer.includes('山田'))?.month);
assert.deepEqual([await billField.inputValue(), await salesField.inputValue()], [ym(now), ym(now)]);
await billField.fill(ym(next));
await page.waitForFunction((m) => document.querySelector('[aria-label="売上月"]')?.value === m, ym(next));
await salesField.fill(ym(now)); // 売上月だけ今月に（まれにちがうとき）
await page.waitForFunction((m) => document.querySelector('[aria-label="請求する月"]')?.value === m, ym(next));
assert.match(await salesField.getAttribute('class'), /amber/);
await page.waitForFunction((m) => JSON.parse(localStorage.getItem('taiyo-jutaku-sales-v1') || '{}').rows?.find((r) => r.customer.includes('山田'))?.month === m, ym(now));
await billField.fill(ym(now)); // 請求する月も今月に戻すと、また同じ（一緒に変わる）
await salesField.waitFor();
assert.doesNotMatch(await salesField.getAttribute('class'), /amber/);
assert.equal(await summaryMonth(), ym(now));
log('見積書の上の売上月：請求する月と一緒に変わる・まれにちがう月にできる OK');
const cell = (k) => sheet.locator(`[data-edit="${k}"]`).first();
const tds = async (text) => (await sheet.locator('.form-page tr', {hasText: text}).first().locator('td').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
const key = async (text, field) => sheet.locator('.form-page tr', {hasText: text}).first().locator(`[data-edit$=":${field}"]`).first().getAttribute('data-edit');
const totals = async () => (await tds('合計')).filter(Boolean);
const typeIn = async (k, text, end = 'Enter') => {
  await cell(k).click();
  await page.keyboard.type(text);
  if (end) await page.keyboard.press(end);
  await page.waitForTimeout(60);
};
assert.deepEqual(await totals(), ['合計', '26,950', '26,950']);
assert.deepEqual(await page.getByRole('combobox', {name: '保険者'}).locator('option').allInnerTexts(), ['苅田町', '行橋市', 'みやこ町', '広域連合']);

// ---------------- 見積書の欄：被保険者番号・切って使う手すりを 120cm（1.2÷4＝0.3本×16,000＝4,800）
await typeIn('job:insuredNo', '0000366989');
await typeIn(await key('木の手すり 35φ 4m', 'qty'), '120cm');
const rail = await tds('木の手すり 35φ 4m');
assert.deepEqual(rail.slice(3, 7), ['0.3', '本', '16,000', '4,800'], rail.join('|'));
assert.ok(rail[12].includes('定価20,000円（4m）×0.8') && rail[12].includes('1200mm÷4000mm＝0.3'), rail[12]);
assert.deepEqual(await totals(), ['合計', '29,860', '29,860']); // 小計 24,680＋諸経費 2,466（端数調整）＋消費税 2,714
log('切って使う部材：120cm÷4m＝0.3本×16,000＝4,800 OK');

// ---------------- 見積の単価を手で入れる → 備考の率が 単価÷定価 に（1,470円 → ×0.7。割り切れない 1,500円 は率を書かない）。
// 逆に備考の率を直すと単価が 定価×率 に（×0.6 → 1,260円）。単価を消すと 定価×0.8 に戻る（ユーザーの指示「単価の金額を変更すると、例 備考欄の0.8が0.7になったり、
// 0.6になったり逆な連動したりするようになる」2026-10-27）
const bracketPrice = await key('ブラケット', 'price');
await typeIn(bracketPrice, '1470');
let bk = await tds('ブラケット');
assert.deepEqual([bk[5], bk[6], bk[12]], ['1,470', '2,940', '定価2,100円（税抜）×0.7'], bk.join('|'));
await typeIn(bracketPrice, '1500');
bk = await tds('ブラケット');
assert.deepEqual([bk[5], bk[6], bk[12]], ['1,500', '3,000', '定価2,100円（税抜）'], bk.join('|'));
await typeIn(await key('ブラケット', 'note'), '定価2,100円（税抜）×0.6');
bk = await tds('ブラケット');
assert.deepEqual([bk[5], bk[6], bk[12]], ['1,260', '2,520', '定価2,100円（税抜）×0.6'], bk.join('|'));
await cell(bracketPrice).click();
await page.keyboard.press('Delete');
bk = await tds('ブラケット');
assert.deepEqual([bk[5], bk[6], bk[12]], ['1,680', '3,360', '定価2,100円（税抜）×0.8'], bk.join('|'));
log('見積の単価の手入力と自動に戻すOK');

// ---------------- ブラケットの施工費（取付手間を数える）：木を1つ → ブラケットのすぐ下に同上施工費 1,500（木の見積の単価）
await cell(await key('ブラケット', 'text')).click();
await sheet.getByRole('button', {name: '🔧 施工費から入れる'}).click();
await page.getByRole('dialog').getByText('「ブラケット」の施工費').waitFor();
await page.getByRole('button', {name: '木の箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();
const works = (await sheet.locator('.form-page tr', {hasText: '同上施工費'}).allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
assert.equal(works.length, 3, works.join('|'));
assert.ok(works[0].includes('3,000') && works[1].includes('1,500') && works[2].includes('4,000'), works.join('|'));
log('部材ごとの同上施工費OK');

// ---------------- 部材＋施工費（常用）：トイレの L型手すりを選んで「部材＋施工費（常用）から入れる」→ 選んだ行（と同上施工費）のすぐ下に4行（木の手すり 16,000・同上施工費 3,000・ブラケット 3,360・キャップ 720）
await cell(await key('L型手すり', 'text')).click();
await sheet.getByRole('button', {name: '＋ 部材＋施工費（常用）から入れる'}).click();
// 最初に入る例（BD-134 と BD-08G は数量を空けておく。施工費は木 2箇所＝見積 3,000円）と、サンプルのセット
const kitNames = page.getByRole('dialog').getByRole('textbox', {name: '部材＋施工費（常用）の名前'});
assert.deepEqual(await kitNames.evaluateAll((els) => els.map((e) => e.value)), ['（例）手すり BD-134＋金具 BD-08G＋施工費', '（サンプル）I型手すり（木の下地）']);
assert.ok((await page.getByRole('dialog').getByRole('listitem').first().innerText()).includes('見積 3,000円（税抜）'));
await page.getByRole('dialog').getByRole('listitem').filter({hasText: '見積 23,080円（税抜）'}).getByRole('button', {name: '＋ 入れる'}).click();
const texts = (await sheet.locator('.form-page [data-edit$=":text"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
assert.deepEqual(texts, [
  'サンプル S-TS35 木の手すり 35φ 4m',
  '同上施工費',
  'サンプル S-BK01 ブラケット',
  '同上施工費',
  'サンプル S-TL01 L型手すり',
  '同上施工費',
  'サンプル S-TS35 木の手すり 35φ 4m',
  '同上施工費',
  'サンプル S-BK01 ブラケット',
  'サンプル S-EC01 エンドキャップ',
  'サンプル S-EC01 エンドキャップ', // もとからあったキャップは、入れた4行の下
]);
// 小計 24,680＋1,500＋23,080＝49,260 → 諸経費 4,922（端数調整）→ 消費税 5,418 → 合計 59,600
assert.deepEqual(await totals(), ['合計', '59,600', '59,600']);
log('部材＋施工費（常用）を入れるOK');
await page.screenshot({path: path.join(outDir, '50-estimate-app.png'), fullPage: true});

// ---------------- 保存：ボタンと Ctrl+S（見積書の欄に打ち込んでいる途中の値も入れて保存）。読み直しても同じ
const savedToasts = () => page.locator('[aria-live] > div', {hasText: /^保存しました$/}).count();
await page.getByRole('button', {name: '💾 保存'}).click();
await page.locator('[aria-live] > div', {hasText: /^保存しました$/}).first().waitFor();
await cell('job:insuredNo').click();
await page.keyboard.type('1111111111'); // Enter を押さずに Ctrl+S
await page.keyboard.press('Control+s');
for (let i = 0; i < 40 && (await savedToasts()) < 2; i++) await page.waitForTimeout(50);
assert.equal(await savedToasts(), 2);
await page.reload();
await sheet.waitFor();
assert.ok((await cell('job:insuredNo').innerText()).includes('1111111111'));
assert.deepEqual(await totals(), ['合計', '59,600', '59,600']);
await typeIn('job:insuredNo', '0000366989');
log('保存（ボタン・Ctrl+S・読み直しても同じ）OK');

// ---------------- Excel で保存：印刷する見積書と同じ形の .xlsx（金額は式。計算済みの値も入っている）
/** save：出力フォルダにも置く名前（LibreOffice で描いて印刷と見比べるとき） */
const download = async (click, save) => {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  if (save) await dl.saveAs(path.join(outDir, save));
  const files = unzipSync(new Uint8Array(await readFile(await dl.path())));
  return {name: dl.suggestedFilename(), sheet: strFromU8(files['xl/worksheets/sheet1.xml'])};
};
const yx = await download(() => page.getByRole('button', {name: '📗 見積書をExcelで保存'}).click());
assert.equal(yx.name, '（サンプル）山田様住宅改修見積書.xlsx');
for (const t of ['（サンプル）山田', '介護保険被保険者番号（0000366989）', '1200mm÷4000mm＝0.3', '<f>ROUNDDOWN(D9*F9,0)</f><v>4800</v>', '<v>49260</v>', '<v>59600</v>', '令和']) {
  assert.ok(yx.sheet.includes(t), `Excel に「${t}」がない`);
}
await page.locator('[aria-live] > div', {hasText: `Excel ファイル「${yx.name}」を保存しました`}).waitFor();
log('Excelで保存（苅田町・行橋市・みやこ町用）OK');

// ---------------- 苅田町・行橋市・みやこ町用の印刷
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const printed = page.locator('.print-root .form-page').first();
const doc = await printed.innerText();
for (const t of [
  '①　工事費見積書兼工事費内訳書',
  '（サンプル）山田',
  '介護保険被保険者番号（0000366989）',
  '定価2,100円（税抜）×0.8',
  '定価20,000円（4m）×0.8',
  '1200mm÷4000mm＝0.3',
  '同上施工費',
  '代表者名　行橋営業所所長　久保 匠史',
  '担当： 久保 匠史　0930-26-9640',
  '①玄関',
  '②トイレ',
  'ページ　1　／　1',
]) {
  assert.ok(doc.includes(t), `見積書に「${t}」がない`);
}
// 印刷は A4 の用紙いっぱいに（ユーザーの指示 2026-10-27）：どの用紙も 1 倍より大きく、字・罫線は用紙の端から 5mm より内（切れない）。縦が長い用紙は上下が 6mm
const paperFill = async () =>
  page.locator('.print-root .form-page').evaluateAll((ps) =>
    ps.map((p) => {
      const pr = p.getBoundingClientRect();
      const mm = 297 / pr.width;
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      for (const k of p.children) {
        const range = document.createRange();
        range.selectNodeContents(k);
        const x = k.getBoundingClientRect().width > pr.width * 0.9 ? range.getBoundingClientRect() : k.getBoundingClientRect();
        if (!x.width) continue;
        [l, t, r, b] = [Math.min(l, x.left), Math.min(t, x.top), Math.max(r, x.right), Math.max(b, x.bottom)];
      }
      return {fill: Number(p.dataset.fill), edge: Math.min(l - pr.left, t - pr.top, pr.right - r, pr.bottom - b) * mm};
    }),
  );
const assertFilled = async () => {
  for (const f of await paperFill()) assert.ok(f.fill > 1 && f.edge >= 5 && f.edge <= 7, JSON.stringify(f)); // いちばん近い端（左右か上下）が 6mm ほど
};
const totalLine = async (where, label) => (await where.locator('tr', {hasText: label}).last().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(await totalLine(printed, '小計'), ['小計', '49,260', '49,260']);
assert.deepEqual(await totalLine(printed, '合計'), ['合計', '59,600', '59,600']);
await assertFilled();
await page.screenshot({path: path.join(outDir, '51-print-yukuhashi.png')});
// 「🖨 印刷する」は用紙（A4横）の右の上に大きく（発注書の印刷と同じ。2026-10-25）
const printBox = await page.getByRole('button', {name: '🖨 印刷する'}).boundingBox();
const paperBox = await printed.boundingBox();
assert.ok(printBox.x >= paperBox.x + paperBox.width && printBox.x + printBox.width <= 1366 && Math.abs(printBox.y - paperBox.y) < 30, JSON.stringify({printBox, paperBox}));
await page.emulateMedia({media: 'print'});
await page.pdf({path: path.join(outDir, 'estimate-yukuhashi.pdf'), printBackground: true, preferCSSPageSize: true});
await page.emulateMedia({media: 'screen'});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見積書（苅田町・行橋市・みやこ町用）の印刷OK');

// ---------------- 諸経費を見積書の欄で直す → 消すと自動（小計×10% から合計の末尾が0になるよう端数調整）に戻る
await typeIn('overhead:all', '5000');
assert.deepEqual(await totals(), ['合計', '59,686', '59,686']); // 49,260＋5,000＋5,426
// 諸経費の下に打てる欄はないので、選んだまま。Delete で消す
assert.equal(await sheet.locator('textarea.sheet-input').getAttribute('aria-label'), '諸経費');
await page.keyboard.press('Delete');
assert.deepEqual(await totals(), ['合計', '59,600', '59,600']);
log('諸経費の手入力OK');

// ---------------- 玄関のブラケットを介護保険の対象外（対象外金額の欄でスペース）→ ブラケット 3,360 と同上施工費 1,500 が対象外
await sheet.locator('.form-page tr', {hasText: 'ブラケット'}).first().locator('[data-edit^="excl:"]').last().click();
await page.keyboard.press(' ');
// 対象：49,260−4,860＝44,400 → 諸経費 4,437（端数調整）→ 消費税 4,883 → 合計 53,720
assert.deepEqual(await totals(), ['合計', '59,600', '53,720']);
log('介護保険の対象外OK');

// ---------------- 広域連合用に変える：写真番号・改修の種類を見積書の欄で入れる。施工費は「時間×2,500円」。2ページ（Ｐ－1・Ｐ－2）
await page.getByRole('combobox', {name: '保険者'}).selectOption('kouiki'); // 広域連合 → 広域連合用の書式
await sheet.locator('.form-page', {hasText: '内訳書　様式'}).first().waitFor();
await typeIn(await key('L型手すり', 'photo'), '5');
await typeIn(await key('L型手すり', 'kind'), '5');
await page.getByRole('button', {name: '🖨 見積書を印刷'}).click();
await page.locator('.print-overlay').waitFor();
const kdoc = await page.locator('.print-root').innerText();
for (const t of ['内訳書　様式', '全改修工事部分', '対象工事部分', '1時間2,500円×1.2時間', '福岡県介護保険広域連合', '定価20,000円（4m）×0.8', '定価11,000円（税抜）×0.8', 'トイレ\t便器取替\t材', '⑤']) {
  assert.ok(kdoc.includes(t), `広域連合の書式に「${t}」がない`);
}
const pages = page.locator('.print-root .form-page');
// 1ページ14行：玄関4行・トイレ7行のあとの介護保険の内訳（3行）と合計4行は入らないので、内訳と合計を2ページ目に送る（箇所の途中では分けない）
assert.equal(await pages.count(), 2);
assert.ok((await pages.first().innerText()).includes('Ｐ－1'));
assert.ok((await pages.last().innerText()).includes('Ｐ－2'));
assert.ok((await pages.first().innerText()).includes('トイレ\t便器取替'));
assert.match(await pages.last().innerText(), /介護保険（受領委任払い）[\s\S]*介護保険の対象外[\s\S]*合計/);
const kk = pages.first();
const wood = (await kk.locator('tr', {hasText: '同上施工費'}).first().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(wood.slice(0, 5), ['手', '同上施工費', '1.2', '時間', '2,500'], wood.join('|')); // 木 2箇所＝見積 3,000円
const kbk = (await kk.locator('tr', {hasText: 'ブラケット'}).first().locator('td').allInnerTexts()).filter(Boolean);
assert.deepEqual(kbk.slice(2), ['2', '個', '1,680', '3,360'], kbk.join('|')); // 対象外：全改修工事部分だけ
assert.deepEqual(await totalLine(pages.last(), '合計'), ['合計', '59,600', '53,720']);
await assertFilled();
await page.screenshot({path: path.join(outDir, '52-print-kouiki.png')});
await page.emulateMedia({media: 'print'});
await page.pdf({path: path.join(outDir, 'estimate-kouiki.pdf'), printBackground: true, preferCSSPageSize: true});
await page.emulateMedia({media: 'screen'});
await page.getByRole('button', {name: '✕ 閉じる'}).click();
log('見積書（広域連合用）の印刷OK');

// ---------------- 一覧に戻る：書式が変わっている。探す
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
await sampleRow.waitFor();
const search = page.getByRole('textbox', {name: '見積書を探す'});
await search.fill('山田');
assert.equal(await page.locator('tbody tr').count(), 1);
await search.fill('見つからない名前');
assert.ok((await page.locator('main').innerText()).includes('見つかりませんでした'));
await search.fill('');
log('一覧の書式・探すOK');

// ---------------- 一覧の「📗 Excel」：広域連合用の .xlsx（2ページ。介護保険の対象は対象外を除いた金額）
const kx = await download(() => sampleRow.getByRole('button', {name: '📗 Excel'}).click(), 'estimate-kouiki.xlsx');
assert.equal(kx.name, '（サンプル）山田様住宅改修見積書.xlsx');
for (const t of ['内訳書　様式', 'Ｐ－1', 'Ｐ－2', '1時間2,500円×1.2時間', '<v>59600</v>', '<v>53720</v>', '<rowBreaks count="1"']) {
  assert.ok(kx.sheet.includes(t), `Excel（広域連合用）に「${t}」がない`);
}
assert.equal(await page.getByRole('heading', {level: 1}).count(), 0); // 一覧のまま（見積書は開かない）
log('一覧からExcelで保存（広域連合用）OK');

// ---------------- 複製（今月分の請求書に入れて作る）→ 削除（ゴミ箱に移る。完全に消すのはゴミ箱のタブから＝e2e-trash.mjs）
// 複製は一度「不要」で外したが、ユーザーの指示「複製するボタン削除してもらいましたが、やはり残してください」（2026-10-26）で戻した（見積書の上の段・一覧の行とも）
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await page.getByRole('button', {name: '複製', exact: true}).click();
await page.getByRole('heading', {level: 1, name: '（サンプル）山田（コピー）様邸'}).waitFor();
assert.equal(await page.getByLabel(/工務店の請求書に入れる/).isChecked(), true);
await page.getByRole('button', {name: '← 一覧へ戻る'}).click();
const copyRow = page.getByRole('row', {name: /（コピー）/});
assert.ok((await copyRow.innerText()).includes(thisMonthLabel)); // 工務店の請求書（今月分）に入る
assert.ok((await sampleRow.innerText()).includes(thisMonthLabel));
assert.equal(await copyRow.getByRole('button', {name: '複製', exact: true}).count(), 1); // 一覧の行にも
await page.getByRole('cell', {name: /（コピー）/}).click();
await page.getByRole('button', {name: '削除', exact: true}).click();
await page.getByRole('row', {name: /（コピー）/}).waitFor({state: 'detached'});
assert.equal(await page.locator('tbody tr').count(), 1);
assert.equal((await page.getByRole('navigation').getByRole('button', {name: /ゴミ箱/}).innerText()).replace(/\s+/g, ' ').trim(), '🗑 ゴミ箱 1');
log('複製・削除（ゴミ箱へ）OK');

// ---------------- 部材・施工費マスタ（請求書と同じ部材リスト）：Excel の「定価」の列も読む。施工費（笹岡工務店の手間）も同じタブ
await page.getByRole('navigation').getByRole('button', {name: /部材・施工費マスタ/}).click();
assert.ok((await page.locator('main').innerText()).includes('見積書（見積もり・申請書を作成する）と請求書（工務店請求書を確認する）の両方で使います'));
await page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}).click();
await page.locator('[role=dialog] input[type=file]').setInputFiles(path.join(FIX, 'maker-list.xlsx'));
await page.getByRole('button', {name: '部材リストに取り込む（5件）'}).click();
const bp = page.getByRole('row', {name: /手すり I型 600mm/});
assert.equal(await bp.getByRole('textbox', {name: '定価'}).inputValue(), '4,800');
assert.equal(await bp.getByRole('textbox', {name: '仕切価格'}).inputValue(), '3,360');
log('定価の取り込みOK');

// ---------------- 施工費（笹岡工務店の手間）：部材・施工費マスタのもう1つのタブ
await page.getByRole('tab', {name: /^施工費（/}).click();
assert.ok((await page.locator('main').innerText()).includes('取付手間の単価'));
// 施工費は笹岡工務店に限らない（「仕切り（工務店）」。ユーザーの指示「笹岡工務店を使っているところ以外でも一緒にみんなが使えるように…金額などはそのまま」2026-10-26）
assert.ok((await page.locator('main').innerText()).includes('仕切り（工務店）'));
assert.ok(!(await page.locator('main').innerText()).includes('笹岡'));
// 仕切り（笹岡工務店）と見積の両方の単価を持つ。踏台 木 の見積は 2,000円（ユーザーの指示）。見積を消すと 仕切り×1.5 を薄く出す
assert.deepEqual([await page.getByLabel('木の単価', {exact: true}).inputValue(), await page.getByLabel('木の見積の単価', {exact: true}).inputValue()], ['1,000', '1,500']);
assert.deepEqual([await page.getByLabel('タイルの単価', {exact: true}).inputValue(), await page.getByLabel('タイルの見積の単価', {exact: true}).inputValue()], ['1,500', '2,000']);
const stepWood = page.getByLabel('踏台 木の見積の単価', {exact: true});
assert.deepEqual([await page.getByLabel('踏台 木の単価', {exact: true}).inputValue(), await stepWood.inputValue()], ['1,500', '2,000']);
assert.equal(await stepWood.getAttribute('placeholder'), '2,250');

// ---------------- 部材＋施工費（常用）：部材・施工費マスタでセットを登録する（部材を入れ、その部材の施工費を数える）
await page.getByRole('tab', {name: '部材＋施工費（常用・2件）'}).click(); // サンプルと、最初に入る例（BD-134＋BD-08G＋施工費）
await page.getByRole('region', {name: 'セット「（サンプル）I型手すり（木の下地）」'}).waitFor();
await page.getByRole('button', {name: '＋ 新しいセットを登録'}).click();
await page.keyboard.type('トイレ L型手すり'); // 名前の欄が選ばれている
const kitCard = page.getByRole('region', {name: 'セット「トイレ L型手すり」'});
await kitCard.getByRole('button', {name: '📋 部材リストから入れる'}).click();
await page.getByRole('dialog').getByRole('row', {name: /L型手すり/}).getByRole('button', {name: '＋ 追加'}).click();
await page.getByRole('button', {name: '選び終わったら閉じる'}).click();
await kitCard.getByRole('button', {name: 'L型手すりの施工費を数える'}).click();
await page.getByRole('button', {name: 'タイルの箇所数を1増やす', exact: true}).click();
await page.getByRole('button', {name: '数え終わったら閉じる'}).click();
// L型 11,000×0.8＝8,800 ＋ タイル（見積 2,000）＝ 見積 10,800円。仕切りは 7,800＋1,500＝9,300円
const kitText = await kitCard.innerText();
assert.ok(kitText.includes('10,800円') && kitText.includes('仕切り 9,300円'), kitText);
assert.deepEqual((await kitCard.locator('tbody tr').allInnerTexts()).map((t) => t.split('\n')[0].split('\t')[0]), ['部材', '施工費']);
await page.getByRole('tab', {name: '部材＋施工費（常用・3件）'}).waitFor();
log('部材＋施工費（常用）のセットを登録OK');

// ---------------- 見積書の「＋ 部材＋施工費（常用）から入れる」に、登録したセットが出る。そこから部材・施工費マスタへも行ける
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
await page.getByRole('cell', {name: /（サンプル）山田様邸/}).click();
await sheet.getByRole('button', {name: '＋ 部材＋施工費（常用）から入れる'}).click();
const kitDialog = page.getByRole('dialog');
assert.equal(await kitDialog.getByRole('textbox', {name: '部材＋施工費（常用）の名前'}).first().inputValue(), 'トイレ L型手すり');
assert.ok((await kitDialog.innerText()).includes('見積 10,800円（税抜）'));
await kitDialog.getByRole('button', {name: '📦 部材・施工費マスタで登録・直す'}).click();
await page.getByRole('region', {name: 'セット「トイレ L型手すり」'}).waitFor();
assert.equal(await page.getByRole('tab', {name: '部材＋施工費（常用・3件）'}).getAttribute('aria-selected'), 'true');
log('見積書から部材＋施工費（常用）を選ぶ・マスタへ行くOK');
// ---------------- 設定：見積書と請求書の両方
await page.getByRole('navigation').getByRole('button', {name: '設定'}).click();
const settings = await page.locator('main').innerText();
assert.ok(settings.includes('自社の情報（請求書の発行元・見積書の施工業者）') && settings.includes('部材の単価＝定価×この率'), settings);
assert.ok(settings.includes('請求先（工務店）の名前') && settings.includes('③部材上乗せ・④諸経費の率'), settings);
log('設定OK');

// ---------------- 「📄 白紙に戻す」は外した（ユーザーの指示「基本的な並びは…削除（白紙に戻すは不要）」2026-10-28）
await page.getByRole('navigation').getByRole('button', {name: /見積もり・申請書を作成する/}).click();
const sampleCell = page.getByRole('cell', {name: /（サンプル）山田様邸/});
await Promise.race([sheet.waitFor(), sampleCell.waitFor()]); // 開いていた見積書に戻るか、一覧
if ((await sheet.count()) === 0) await sampleCell.click();
await sheet.waitFor();
assert.equal(await page.getByRole('button', {name: '📄 白紙に戻す'}).count(), 0);
log('白紙に戻すはない OK');

// ---------------- iPhone で見積書の欄を押しても画面が拡大されない（viewport に maximum-scale=1。iPhone・iPad だけ）
const iphone = await browser.newContext({viewport: {width: 390, height: 844}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', isMobile: true, hasTouch: true, locale: 'ja-JP'});
const ip = await iphone.newPage();
await ip.goto(`${site}/jutaku-mitsumori/index.html`);
assert.match(await ip.locator('meta[name="viewport"]').getAttribute('content'), /maximum-scale=1/);
await iphone.close();
assert.doesNotMatch(await page.locator('meta[name="viewport"]').getAttribute('content'), /maximum-scale/); // パソコン・Android は今までどおり
log('iPhone で欄を押しても拡大しない（viewport）OK');

console.log('\nERRORS:', errors.length ? errors : 'なし');
await browser.close();
