// 様邸の画面の「📗 Excelで保存」「✉ メールで送付」（DocsDialog.tsx・mailDraft.ts）
// （ユーザーの指示「Excel で保存っていうので、一つに…チェックして、必要な分だけ保存していく。デフォルトはその開いているページ…のみチェック。…
//  メールで送付機能についても、基本的には一括で全てメールできるような形に…デフォルトは一つだけチェック」2026-10-30）：
//   ・Excelで保存：書類を選ぶ画面。初めは開いているタブの書類だけにチェック。チェックしたものを1つずつ保存
//   ・メールで送付（パソコン）：チェックした書類の Excel を保存して、件名・本文の入ったメール（mailto:）を開く
//   ・メールで送付（スマホ）：共有メニュー（navigator.share）に Excel と件名・本文を渡す
// usage: node e2e-docs.mjs <サイトのURL> <出力フォルダ>（サイトは太陽ポータルと同じ形）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const errors = [];

/** 新しい様邸（行橋市・見本 六郎）を作って、申請書のタブを開いた画面 */
async function newJob(options) {
  const ctx = await browser.newContext({locale: 'ja-JP', acceptDownloads: true, ...options});
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await ctx.addInitScript(() => {
    localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    // メールのソフトを開くリンク（mailto:）は開かずに覚える
    document.addEventListener(
      'click',
      (e) => {
        const a = e.target instanceof Element ? e.target.closest('a[href^="mailto:"]') : null;
        if (!a) return;
        e.preventDefault();
        window.__mailto = a.href;
      },
      true,
    );
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => void d.accept());
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  await page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 行橋市', exact: true}).click();
  await page.getByRole('form', {name: '申請書'}).waitFor();
  await page.keyboard.type('みほん　ろくろう');
  await page.keyboard.press('Enter');
  await page.keyboard.type('見本 六郎');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  return {ctx, page};
}
const checks = (dlg) => dlg.getByRole('group', {name: /書類$/}).getByRole('checkbox').evaluateAll((els) => els.map((e) => [e.closest('label').querySelector('.font-bold').textContent, e.checked, e.disabled]));
/** 作っているあいだに、押した操作の続きと見なされなくなったときは、もう一度押す画面になる（そのときは押す） */
async function finish(page, dlg, retry) {
  await Promise.race([
    page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 30000}),
    dlg.getByRole('button', {name: retry}).waitFor({timeout: 30000}),
  ]);
  if (await dlg.getByRole('button', {name: retry}).count()) await dlg.getByRole('button', {name: retry}).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 30000});
}

// ---------------- パソコン
{
  const {ctx, page} = await newJob({viewport: {width: 1366, height: 900}});
  const names = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  // 前の「📦 まとめて保存」・「📗 申請書をExcelで保存」はない
  assert.equal(await page.getByRole('button', {name: '📦 まとめて保存'}).count(), 0);
  assert.equal(await page.getByRole('button', {name: /をExcelで保存/}).count(), 0);

  // 📗 Excelで保存：初めは住宅改修申請書（このタブ）だけ。工事見積書は行がないので選べない
  await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).click();
  const xdlg = page.getByRole('dialog', {name: 'Excelで保存'});
  assert.deepEqual(await checks(xdlg), [
    ['住宅改修申請書', true, false],
    ['工事見積書', false, true],
    ['特定福祉用具申請書', false, true],
    ['販売見積書', false, true],
    ['理由書', false, false],
  ]);
  await page.screenshot({path: path.join(outDir, 'docs-1-excel.png')});
  await xdlg.getByRole('button', {name: '📗 1つ保存する'}).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 30000});
  await page.waitForTimeout(600);
  assert.deepEqual(names, ['見本六郎様住宅改修申請書.xlsx']);
  // 理由書のタブで開くと、理由書だけ。理由書にもチェックして2つ
  await page.getByRole('tab', {name: '📄 理由書'}).click();
  await page.getByRole('tab', {name: '📄 理由書', selected: true}).waitFor();
  await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).click();
  assert.deepEqual((await checks(xdlg)).map(([, c]) => c), [false, false, false, false, true]);
  await xdlg.getByRole('checkbox', {name: /^住宅改修申請書/}).check();
  await xdlg.getByRole('button', {name: '📗 2つ保存する'}).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 30000});
  await page.waitForTimeout(900);
  assert.deepEqual(names.slice(1).sort(), ['見本六郎様住宅改修申請書.xlsx', '見本六郎様住宅改修理由書.xlsx'].sort());
  log('Excelで保存：初めは開いているタブの書類だけ・チェックしたものを保存 OK');

  // ✉ メールで送付：初めは理由書（このタブ）だけ。住宅改修申請書にもチェック → 2つ保存して、件名・本文の入ったメールを開く
  names.length = 0;
  await page.getByRole('button', {name: '✉ メールで送付', exact: true}).click();
  const mdlg = page.getByRole('dialog', {name: 'メールで送付（Excel）'});
  assert.deepEqual((await checks(mdlg)).map(([, c]) => c), [false, false, false, false, true]);
  await mdlg.getByRole('checkbox', {name: /^住宅改修申請書/}).check();
  await page.screenshot({path: path.join(outDir, 'docs-2-mail.png')});
  await mdlg.getByRole('button', {name: '✉ 2つ付けてメールを作る'}).click();
  await finish(page, mdlg, '✉ メールを開く');
  await page.waitForTimeout(900);
  assert.deepEqual(names.sort(), ['見本六郎様住宅改修申請書.xlsx', '見本六郎様住宅改修理由書.xlsx'].sort());
  const href = await page.evaluate(() => window.__mailto);
  assert.ok(href, 'メールを開いていない');
  const q = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  assert.equal(q.get('subject'), '見本 六郎様 住宅改修申請書・理由書の送付');
  const body = q.get('body').split('\r\n');
  assert.deepEqual(body.slice(0, 7), ['お世話になっております。', '見本 六郎様の住宅改修申請書・理由書をお送りします。', 'ご確認のほど、よろしくお願いいたします。', '', '（添付）', '・見本六郎様住宅改修申請書.xlsx', '・見本六郎様住宅改修理由書.xlsx']);
  await page.getByText(/メールを開きました/).waitFor();
  await page.screenshot({path: path.join(outDir, 'docs-3-mail-done.png')});
  log(`メールで送付（パソコン）：2つ保存・メール（件名「${q.get('subject')}」）OK`);
  await ctx.close();
}

// ---------------- スマホ（共有メニューにファイルを渡す）
{
  const {ctx, page} = await newJob({
    viewport: {width: 390, height: 844},
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  // 共有メニュー（navigator.share）は開かずに、渡されたものを覚える
  await page.evaluate(() => {
    navigator.canShare = (d) => !!d && Array.isArray(d.files);
    navigator.share = async (d) => {
      window.__shared = {title: d.title, text: d.text, files: d.files.map((f) => [f.name, f.type, f.size])};
    };
  });
  await page.getByRole('button', {name: '✉ メールで送付', exact: true}).click();
  const mdlg = page.getByRole('dialog', {name: 'メールで送付（Excel）'});
  assert.deepEqual((await checks(mdlg)).map(([, c]) => c), [true, false, false, false, false]);
  await mdlg.getByRole('checkbox', {name: /^理由書/}).check();
  await page.screenshot({path: path.join(outDir, 'docs-4-phone-mail.png')});
  await mdlg.getByRole('button', {name: '✉ 2つ付けてメールを作る'}).click();
  await finish(page, mdlg, '📤 メールのアプリに渡す');
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.title, '見本 六郎様 住宅改修申請書・理由書の送付');
  assert.deepEqual(
    shared.files.map(([n, t, size]) => [n, t, size > 1000]),
    [
      ['見本六郎様住宅改修申請書.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true],
      ['見本六郎様住宅改修理由書.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', true],
    ],
  );
  assert.match(shared.text, /見本 六郎様の住宅改修申請書・理由書をお送りします。/);
  assert.equal(await page.evaluate(() => window.__mailto ?? null), null); // スマホはメールのソフト（mailto:）ではなく共有メニュー
  await page.getByText('メールのアプリに渡しました').waitFor();
  log('メールで送付（スマホ）：共有メニューに Excel 2つと件名・本文 OK');

  // 📗 Excelで保存（iPhone）：2つ以上は共有メニュー（「ファイルに保存」でまとめて保存できる）。Safari は続けて保存すると初めの1つしか保存しない
  // （ユーザーの報告「画面上は3つ選択されているが、メールにそのまま添付したら、一つ（住宅改修申請書）しか届いていない」2026-10-30）。本文（.txt になる）は渡さない
  const names = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  await page.evaluate(() => delete window.__shared);
  await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).click();
  const xdlg = page.getByRole('dialog', {name: 'Excelで保存'});
  await xdlg.getByRole('checkbox', {name: /^理由書/}).check();
  await xdlg.getByRole('button', {name: '📗 2つ保存する'}).click();
  await finish(page, xdlg, '📤 2つのファイルを渡す');
  const saved = await page.evaluate(() => window.__shared);
  assert.deepEqual(saved.files.map(([n]) => n), ['見本六郎様住宅改修申請書.xlsx', '見本六郎様住宅改修理由書.xlsx']);
  assert.equal(saved.text, undefined);
  assert.deepEqual(names, []); // 続けて保存（ダウンロード）はしない
  await page.getByText('2つのファイルを渡しました').waitFor();
  // 1つだけなら今までどおり保存（ダウンロード）
  await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).click();
  await xdlg.getByRole('button', {name: '📗 1つ保存する'}).click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), null, {timeout: 30000});
  await page.waitForTimeout(600);
  assert.deepEqual(names, ['見本六郎様住宅改修申請書.xlsx']);
  // 共有メニューにファイルを渡せない iPhone（古い iOS）：1つずつ押して保存する画面
  await page.evaluate(() => {
    delete navigator.canShare;
    navigator.canShare = undefined;
  });
  names.length = 0;
  await page.getByRole('button', {name: '📗 Excelで保存', exact: true}).click();
  await xdlg.getByRole('checkbox', {name: /^理由書/}).check();
  await xdlg.getByRole('button', {name: '📗 2つ保存する'}).click();
  const each = xdlg.getByRole('group', {name: '1つずつ保存'});
  await each.waitFor({timeout: 30000});
  await page.screenshot({path: path.join(outDir, 'docs-5-phone-each.png')});
  for (const n of ['見本六郎様住宅改修申請書.xlsx', '見本六郎様住宅改修理由書.xlsx']) {
    await each.getByRole('button', {name: n}).click();
    await page.waitForTimeout(500);
  }
  assert.deepEqual(names, ['見本六郎様住宅改修申請書.xlsx', '見本六郎様住宅改修理由書.xlsx']);
  assert.match(await each.innerText(), /✓ 見本六郎様住宅改修申請書\.xlsx[\s\S]*✓ 見本六郎様住宅改修理由書\.xlsx/);
  await xdlg.getByRole('button', {name: '閉じる', exact: true}).last().click();
  log('Excelで保存（iPhone）：2つ以上は共有メニュー・1つは保存・共有メニューがなければ1つずつ押して保存 OK');
  await ctx.close();
}

await browser.close();
console.log('\nERRORS:', errors.length ? errors : 'なし');
if (errors.length) process.exit(1);
