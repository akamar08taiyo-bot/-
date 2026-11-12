// イヤーズ（株）デモアプリの使い方動画を撮る（ユーザーの指示「イヤーズ用のこのアプリの使い方を動画にして…テロップなどもつけながら分かりやすい動画に」2026-11-12）。
// 架空のお客様＝見本 花子。番号・電話は 0 だけ・住所は郵便番号から出る町名だけ。
// 画面の上にテロップ・指（カーソル）・押す所の枠を重ね、CDP の画面の配信（screencast）を JPEG で保存する → years-video-make.py で mp4 に。
// 使い方：npm run build:years → <サイト>/years-demo/ に dist-years の index.html・version.json と status.json（enabled:true）を置き、
//   node scripts/serve.mjs <サイト> node scripts/years-video-record.mjs http://localhost:5190 <出力フォルダ>
//   python3 scripts/years-video-make.py <出力フォルダ> <出力フォルダ>/years-howto.mp4
// 画面の作りを変えたら、ここの押す所（名前・ラベル）も直す。frames は 400MB ほどになるので、作ったら消す
const {chromium} = await import('/opt/node-tools/node_modules/playwright/index.mjs');
import {mkdir, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';

const [site, out] = process.argv.slice(2);
const frames = path.join(out, 'frames');
await rm(frames, {recursive: true, force: true});
await mkdir(frames, {recursive: true});

const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}});
const ctx = await browser.newContext({viewport: {width: 1280, height: 720}, deviceScaleFactor: 1.5, locale: 'ja-JP', acceptDownloads: true});
await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
await ctx.route((u) => u.href.startsWith('https://akamar08taiyo-bot.github.io/years-demo/status.json'), (r) => r.fulfill({status: 200, contentType: 'application/json', body: '{"enabled":true,"until":"2026-12-31","message":""}'}));
await ctx.addInitScript(() => {
  window.print = () => {};
  const css = `
  #ov-cap{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;
    max-width:1180px;width:max-content;padding:12px 26px;border-radius:14px;background:rgba(20,83,45,.94);color:#fff;
    font:500 25px/1.45 'BIZ UDPGothic','Noto Sans JP',sans-serif;letter-spacing:.02em;box-shadow:0 8px 28px rgba(0,0,0,.28);
    opacity:0;transition:opacity .35s;text-align:center}
  #ov-cap.on{opacity:1}
  #ov-cap b{display:inline-block;margin-right:12px;padding:0 12px;border-radius:8px;background:#facc15;color:#14532d;font-weight:700}
  #ov-cap small{display:block;font-size:19px;color:#d9f99d;margin-top:2px}
  #ov-ptr{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:30px;transform:translate(-4px,-2px);
    filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transition:opacity .3s}
  #ov-ring{position:fixed;z-index:2147483645;pointer-events:none;border:4px solid #f97316;border-radius:10px;
    box-shadow:0 0 0 6px rgb(249 115 22 / .22);opacity:0;transition:opacity .25s,left .35s,top .35s,width .35s,height .35s}
  #ov-ring.on{opacity:1}
  .ov-rip{position:fixed;z-index:2147483646;pointer-events:none;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
    border:3px solid #f97316;animation:ovrip .6s ease-out forwards}
  @keyframes ovrip{to{transform:scale(3.4);opacity:0}}
  #ov-card{position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#14532d,#166534 55%,#15803d);color:#fff;font-family:'BIZ UDPGothic','Noto Sans JP',sans-serif;opacity:0;transition:opacity .5s}
  #ov-card.on{opacity:1}
  #ov-card.on~#ov-ptr{opacity:0}
  #ov-card .t1{font-size:30px;padding:6px 18px;border-radius:10px;background:#fff;color:#14532d;margin-bottom:22px}
  #ov-card .t2{font-size:52px;letter-spacing:.06em;margin-bottom:26px}
  #ov-card ul{list-style:none;margin:0;padding:0;font-size:27px;line-height:1.9}
  #ov-card li::before{content:'✓ ';color:#facc15}
  .fixed.bottom-5[aria-live="polite"]{bottom:112px!important}`;
  const ensure = () => {
    if (document.getElementById('ov-style') || !document.head) return;
    const st = document.createElement('style');
    st.id = 'ov-style';
    st.textContent = css;
    document.head.appendChild(st);
    const cap = document.createElement('div');
    cap.id = 'ov-cap';
    const ring = document.createElement('div');
    ring.id = 'ov-ring';
    const card = document.createElement('div');
    card.id = 'ov-card';
    const ptr = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ptr.id = 'ov-ptr';
    ptr.setAttribute('viewBox', '0 0 24 24');
    ptr.innerHTML = '<path d="M3 2l15 9-6.5 1.6L15 20l-2.6 1.2-3.4-7.3L4 18z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>';
    document.body.append(ring, cap, card, ptr);
    document.addEventListener('mousemove', (e) => {
      ptr.style.left = e.clientX + 'px';
      ptr.style.top = e.clientY + 'px';
    }, true);
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = 'ov-rip';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  window.__ov = {
    ensure,
    cap(step, text, sub) {
      ensure();
      const c = document.getElementById('ov-cap');
      c.innerHTML = (step ? `<b>${step}</b>` : '') + text + (sub ? `<small>${sub}</small>` : '');
      c.classList.add('on');
    },
    capOff() {
      document.getElementById('ov-cap')?.classList.remove('on');
    },
    ring(r) {
      ensure();
      const g = document.getElementById('ov-ring');
      if (!r) return g.classList.remove('on');
      Object.assign(g.style, {left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px'});
      g.classList.add('on');
    },
    card(html) {
      ensure();
      const c = document.getElementById('ov-card');
      if (!html) return c.classList.remove('on');
      c.innerHTML = html;
      c.classList.add('on');
    },
  };
  document.addEventListener('DOMContentLoaded', ensure);
});

const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('pageerror', e.message));

// ---------------- 画面の配信を JPEG で保存（変わったときだけ届く。時刻で長さを決める）
const cdp = await ctx.newCDPSession(page);
const times = [];
let n = 0;
cdp.on('Page.screencastFrame', async ({data, metadata, sessionId}) => {
  const i = n++;
  times.push(metadata.timestamp);
  cdp.send('Page.screencastFrameAck', {sessionId}).catch(() => {});
  await writeFile(path.join(frames, `f${String(i).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
});

const wait = (ms) => page.waitForTimeout(ms);
const read = (t) => Math.min(6500, Math.max(2600, 1300 + [...t].length * 95)); // 字の数で読む時間
async function cap(step, text, sub = '', ms) {
  await page.evaluate(([s, t, b]) => window.__ov.cap(s, t, b), [step, text, sub]);
  await wait(ms ?? read(text + sub));
}
const ring = (r) => page.evaluate((r) => window.__ov.ring(r), r);
async function point(loc, {steps = 18} = {}) {
  await loc.scrollIntoViewIfNeeded();
  await wait(250);
  const b = await loc.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y, {steps});
  await ring(b);
  return {x, y, b};
}
async function tap(loc, hold = 500) {
  const {x, y} = await point(loc);
  await wait(550);
  await page.mouse.click(x, y);
  await ring(null);
  await wait(hold);
}
async function mark(loc, ms = 1800) {
  await point(loc);
  await wait(ms);
  await ring(null);
}
async function typeIn(loc, text, delay = 110) {
  await tap(loc, 200);
  await page.keyboard.type(text, {delay});
  await wait(400);
}

// ---------------- 撮る
await page.goto(`${site}/years-demo/index.html`);
await page.evaluate(() => window.__ov.ensure());
await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1});
await page.mouse.move(640, 400);

// タイトル
await page.evaluate(() =>
  window.__ov.card(`<div class="t1">（株）イヤーズ デモアプリ</div><div class="t2">申請書・見積書作成　使い方</div>
  <ul><li>住宅改修申請書を入力すると</li><li>工事見積書・理由書・平面図に自動で連動します</li></ul>`),
);
await wait(5200);
await page.evaluate(() => window.__ov.card(null));
await wait(700);

// 0. サンプル・新規作成
await cap('はじめに', 'デモでは「サンプルで試す」を押すと、見本の部材が入ります', '本番では、自社の部材・施工費を登録して使います');
await tap(page.getByRole('button', {name: /サンプルで試す/}), 1200);
await cap('', '「＋ 新規作成」から、申請する保険者（市町村）を選びます', '', 2600);
await tap(page.getByRole('button', {name: /^＋ 新規作成 [▼▲]$/}), 500);
await tap(page.getByRole('menu', {name: '新規作成の保険者'}).getByRole('button', {name: '＋ 苅田町', exact: true}), 1200);

// 1. 住宅改修申請書
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
await cap('①', '住宅改修申請書：左の欄に入れると、右の申請書にそのまま入ります');
await cap('①', 'フリガナは、ひらがなで打っても自動でカタカナになります', '', 1800);
await typeIn(form.getByLabel('フリガナ', {exact: true}), 'みほん はなこ');
await wait(900);
await typeIn(form.getByLabel('被保険者氏名', {exact: true}), '見本 花子');
await wait(600);
await cap('①', '生年月日・性別などは、押して選ぶ・数字を打つだけ', '', 1600);
await typeIn(form.getByLabel('生年月日の年', {exact: true}), '15', 140);
await typeIn(form.getByLabel('生年月日の月', {exact: true}), '4', 140);
await typeIn(form.getByLabel('生年月日の日', {exact: true}), '1', 140);
await tap(form.getByRole('button', {name: '女', exact: true}), 600);
await cap('①', '郵便番号を入れると、住所が自動で入ります', '', 1500);
await typeIn(form.getByLabel('郵便番号', {exact: true}), '8000344', 130);
await wait(1200);
await mark(form.getByLabel('住所', {exact: true}), 1600);
await cap('①', '電話番号はハイフンなしで打ってもOK（自動で付きます）', '', 1500);
await typeIn(form.getByLabel('電話番号', {exact: true}), '0930000000', 110);
await page.keyboard.press('Tab');
await wait(1000);
await point(form.getByLabel('被保険者番号', {exact: true}));
await cap('①', '被保険者番号・要介護度など、分からない所は空欄のままで大丈夫', 'あとから、いつでも入れられます');
await ring(null);

// 2. 改修の箇所
const works = form.locator('[data-field="works"]');
await works.scrollIntoViewIfNeeded();
await cap('②', '改修の箇所を選んで、長さを入れます（例：玄関の手すり 600mm）', '', 2600);
const add = works.getByRole('combobox', {name: '箇所を足す'});
await point(add);
await wait(500);
await add.selectOption({label: '玄関'});
await ring(null);
await wait(700);
await page.keyboard.type('600', {delay: 160});
await wait(700);
await point(add);
await wait(400);
await add.selectOption({label: 'トイレ'});
await ring(null);
await wait(700);
await page.keyboard.type('800', {delay: 160});
await page.keyboard.press('Tab');
await wait(900);
const worksCell = page.getByText(/①玄関\s*手すりの取り付け/).last();
await point(worksCell);
await cap('②', '申請書の「改修の内容」に、①玄関・②トイレの行が自動で書かれます');
await ring(null);

// 3. 工事見積書
await tap(page.getByRole('tab', {name: '📋 工事見積書'}), 1300);
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
await point(sheet.locator('.form-page tr', {hasText: '①玄関'}).first());
await cap('③', '工事見積書：申請書の箇所（①玄関・②トイレ）が、最初から入っています');
await ring(null);
await cap('③', '行の「部材」を押して、部材リストから選びます', '', 2200);
await tap(sheet.getByText('部材', {exact: true}).first(), 1000);
const dlg = page.getByRole('dialog').first();
await tap(dlg.locator('tr', {hasText: '木の手すり'}).getByRole('button', {name: /追加/}), 900);
if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
await wait(700);
await point(sheet.locator('.form-page tr', {hasText: 'S-TS35'}).first());
await cap('③', '申請書の長さ 600mm から、本数を自動で計算（600÷4000＝0.15本）', '金額も自動で計算されます');
await ring(null);
await cap('③', '施工費も、一覧から選ぶだけ', '', 1800);
await tap(sheet.getByText('施工費', {exact: true}).first(), 900);
await tap(page.getByRole('listbox', {name: '施工費のリスト'}).getByRole('option', {name: /^木/}).first(), 1000);
await page.keyboard.press('Escape');
await wait(1200);

// 申請書の改修予定費用
await page.evaluate(() => window.__ov.cap('③', '見積書の合計は、申請書の「改修予定費用」に自動で入ります'));
await tap(page.getByRole('tab', {name: '📝 住宅改修申請書'}), 1200);
const cost = form.getByLabel('改修予定費用', {exact: true});
await point(cost);
await wait(3600);
await ring(null);

// 4. 理由書
await page.evaluate(() => window.__ov.cap('④', '理由書：お名前など、申請書に入れた内容が転記されています'));
await tap(page.getByRole('tab', {name: '📄 理由書'}), 1300);
await mark(page.getByLabel('被保険者氏名', {exact: true}).first(), 3000);
const p2 = page.locator('[aria-label="理由書のプレビュー"] [role="group"]').nth(1);
await p2.evaluate((e) => e.scrollIntoView({block: 'start', behavior: 'smooth'}));
await wait(900);
await point(p2);
await cap('④', '改修項目のチェック（手すりの取付 ①玄関・②トイレ）も自動で付きます');
await ring(null);

// 5. 平面図
await page.evaluate(() => window.__ov.cap('⑤', '平面図：右に、申請書の改修の内容が出ています'));
await tap(page.getByRole('tab', {name: '📐 平面図'}), 1400);
const canvas = page.locator('[data-madori-canvas] svg');
await canvas.waitFor();
await page.evaluate(() => document.querySelector('[role="toolbar"][aria-label="描く道具"]')?.scrollIntoView({block: 'start'}));
await wait(600);
await point(page.locator('[data-plan-works]'));
await cap('⑤', '平面図：右に、申請書の改修の内容が出ています');
await ring(null);
const M = 910;
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
async function drag(a, b) {
  const p = await toPx(...a);
  const q = await toPx(...b);
  await page.mouse.move(p.x, p.y, {steps: 14});
  await wait(250);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, {steps: 26});
  await wait(150);
  await page.mouse.up();
  await wait(500);
}
async function clickAt(x, y) {
  const p = await toPx(x, y);
  await page.mouse.move(p.x, p.y, {steps: 14});
  await wait(300);
  await page.mouse.click(p.x, p.y);
  await wait(500);
}
await cap('⑤', '部屋のボタンを押して、方眼をなぞると部屋が描けます', '', 2200);
await drag([0, 0], [3 * M, 3 * M]); // 洋室（初めから選ばれている）
await tap(page.getByRole('button', {name: 'トイレ', exact: true}).first(), 300);
await drag([3 * M, 0], [4 * M, 1.5 * M]);
await tap(page.getByRole('button', {name: '玄関', exact: true}).first(), 300);
await drag([3 * M, 1.5 * M], [4.5 * M, 3 * M]);
await cap('⑤', '「トイレ（便器）」を押すと、トイレの部屋の中に自動で入ります', '', 1800);
await tap(page.getByRole('toolbar', {name: '描く道具'}).getByRole('button', {name: 'トイレ（便器）'}), 1800);
await cap('⑤', '手すり（横棒）を引いて、①②の番号を置きます', '番号は申請書の箇所の番号と同じです', 1800);
await tap(page.getByRole('toolbar', {name: '描く道具'}).getByRole('button', {name: /横棒/}).first(), 300);
await drag([3.1 * M, 2.85 * M], [4.3 * M, 2.85 * M]);
const bar = page.getByRole('toolbar', {name: '描く道具'});
await tap(bar.getByRole('button', {name: /番号$/}), 300);
await clickAt(3.7 * M, 2.45 * M);
await clickAt(3.5 * M, 1.15 * M);
await tap(bar.getByRole('button', {name: '番号を確定'}), 900);
await page.keyboard.press('Escape');
await wait(800);
await cap('⑤', '「🖨 平面図を印刷」：下の枠に、申請書の改修の内容が入ります', '', 2200);
// 動画の画面（1280×720）では A4 の1枚が入りきらないので、撮るときだけ印刷の画面の紙を半分の大きさにして1枚まるごと見せる
await page.addStyleTag({content: '.print-root{zoom:.5!important;padding-top:6px}'});
await tap(page.getByRole('button', {name: '🖨 平面図を印刷'}), 1800);
{
  const b = await page.locator('[aria-label="平面図の印刷"]').boundingBox();
  const vis = {x: b.x + b.width * 0.03, y: b.y + b.height * 0.895, width: b.width * 0.94, height: b.height * 0.08};
  await page.mouse.move(vis.x + vis.width / 2, vis.y + vis.height / 2, {steps: 18});
  await ring(vis);
  await cap('⑤', '印刷の下の枠：申請書の改修の内容（①玄関・②トイレ）がそのまま入ります', '', 3800);
  await ring(null);
}
await wait(300);
await tap(page.getByRole('button', {name: '✕ 閉じる'}), 900);

// 6. Excel で保存
await cap('⑥', '「📗 Excelで保存」：申請書・見積書・理由書・平面図をまとめて保存', '役所の様式のまま、印刷もできます', 2400);
await tap(page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first(), 900);
const xdlg = page.getByRole('dialog', {name: 'Excelで保存'});
const boxes = xdlg.getByRole('group', {name: '保存する書類'}).getByRole('checkbox');
for (let i = 0; i < (await boxes.count()); i++) {
  const b = boxes.nth(i);
  if ((await b.isDisabled()) || (await b.isChecked())) continue;
  await tap(b, 350);
}
await wait(600);
await tap(xdlg.getByRole('button', {name: /^📗 \d+つ保存する$/}), 2200);
await page.evaluate(() => window.__ov.capOff());
await wait(600);

// まとめ
await page.evaluate(() =>
  window.__ov.card(`<div class="t1">まとめ</div>
  <ul><li>申請書に入れた内容は、見積書・理由書・平面図に自動で入ります</li>
  <li>分からない所は空欄のままで大丈夫（あとから入れられます）</li>
  <li>入力した内容は、この端末に自動で保存されます</li>
  <li>「📗 Excelで保存」で、役所の様式のまま保存・印刷できます</li></ul>`),
);
await wait(7000);
await cdp.send('Page.stopScreencast');
await wait(500);
await writeFile(path.join(out, 'times.json'), JSON.stringify(times));
console.log('frames', n, 'seconds', (times.at(-1) - times[0]).toFixed(1));
await browser.close();
