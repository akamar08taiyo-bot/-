// イヤーズ（株）デモアプリの使い方動画を撮る（ユーザーの指示「イヤーズ用のこのアプリの使い方を動画にして…テロップなどもつけながら分かりやすい動画に」2026-11-12。
// 第2版：「簡潔にをあんまり意識しすぎると短くなりすぎるので、分かりやすく」「動画はある程度目次もつける」「見積もりについての説明は一切触れなくて大丈夫」→ 目次・章の扉・右上に章の名前・テロップを長めに、申請書と平面図だけ）。
// 架空のお客様＝見本 花子。番号・電話は 0 だけ・住所は郵便番号から出る町名だけ。写真は絵を描いた見本。
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
    max-width:1180px;width:max-content;padding:12px 26px;border-radius:14px;background:rgb(20 83 45 / .94);color:#fff;
    font:500 25px/1.45 'BIZ UDPGothic','Noto Sans JP',sans-serif;letter-spacing:.02em;box-shadow:0 8px 28px rgb(0 0 0 / .28);
    opacity:0;transition:opacity .35s;text-align:center}
  #ov-cap.on{opacity:1}
  #ov-cap b{display:inline-block;margin-right:12px;padding:0 12px;border-radius:8px;background:#facc15;color:#14532d;font-weight:700}
  #ov-cap small{display:block;font-size:19px;color:#d9f99d;margin-top:2px}
  #ov-ptr{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:30px;height:30px;transform:translate(-4px,-2px);
    filter:drop-shadow(0 2px 3px rgb(0 0 0 / .45));transition:opacity .3s}
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
  #ov-chap{position:fixed;right:14px;top:12px;z-index:2147483646;pointer-events:none;padding:6px 16px;border-radius:999px;
    background:#facc15;color:#14532d;font:600 19px/1.3 'BIZ UDPGothic','Noto Sans JP',sans-serif;box-shadow:0 4px 14px rgb(0 0 0 / .25);opacity:0;transition:opacity .3s}
  #ov-chap.on{opacity:1}
  #ov-card ol{margin:0;padding:0;list-style:none;font-size:30px;line-height:2.05;counter-reset:c}
  #ov-card ol li{counter-increment:c}
  #ov-card ol li::before{content:counter(c);display:inline-grid;place-items:center;width:44px;height:44px;margin-right:16px;border-radius:50%;background:#facc15;color:#14532d;font-size:26px;vertical-align:middle}
  #ov-card .no{font-size:30px;color:#facc15;margin-bottom:10px;letter-spacing:.1em}
  #ov-card .sub{font-size:26px;color:#d9f99d;margin-top:18px}
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
    const chap = document.createElement('div');
    chap.id = 'ov-chap';
    document.body.append(ring, cap, chap, card, ptr);
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
    chap(text) {
      ensure();
      const c = document.getElementById('ov-chap');
      if (!text) return c.classList.remove('on');
      c.textContent = text;
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
const read = (t) => Math.min(9000, Math.max(3400, 2200 + [...t].length * 125)); // 字の数で読む時間（v2 は長め）
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

// ---------------- 撮る（v2：目次・章の扉・右上に章の名前。申請書と平面図だけ。見積書・理由書は出さない）
const CHAPTERS = ['はじめに（新規作成・設定）', 'お客様の情報を入れる', '改修の内容を入れる', '写真を入れる', '平面図を描く', '印刷・Excelで保存'];
const card = (html) => page.evaluate((h) => window.__ov.card(h), html);
const chapLabel = (t) => page.evaluate((t) => window.__ov.chap(t), t);
const capOff = () => page.evaluate(() => window.__ov.capOff());
async function chapter(i) {
  await capOff();
  await chapLabel(null);
  await card(`<div class="no">第${i + 1}章</div><div class="t2">${CHAPTERS[i]}</div>`);
  await wait(2800);
  await card(null);
  await wait(500);
  await chapLabel(`${i + 1}. ${CHAPTERS[i]}`);
}

await page.goto(`${site}/years-demo/index.html`);
await page.evaluate(() => window.__ov.ensure());
await page.mouse.move(640, 400);

// タイトル・目次
await card(`<div class="t1">（株）イヤーズ デモアプリ</div><div class="t2">住宅改修申請書・平面図　使い方</div>
  <div class="sub">申請書を入れると、プレビュー・写真の用紙・平面図に自動で入ります</div>`);
// 撮り始めるのは題名のカードが出きってから（前は撮り始めてからカードを出したので、初めの 0.5秒ほどアプリの画面と
// 薄いカードが重なった変な画面が映った。ユーザーの指摘「動画開始5秒で変な部分がある、一瞬へんな画面がうつる」2026-11-12）
await wait(800);
await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1});
await wait(5500);
await card(`<div class="t1">目次</div><ol>${CHAPTERS.map((c) => `<li>${c}</li>`).join('')}</ol>`);
await wait(9000);
await card(null);
await wait(600);

// ---------------- 1. はじめに
await chapter(0);
await cap('', 'これが最初の画面です。左が「新規作成」、右が「申請書の一覧」です');
await mark(page.getByRole('region', {name: '新規作成'}), 2200);
await cap('', '最初に一度だけ、⚙ 設定で自社の情報（住所・電話番号など）を入れておきます', '申請書の「施工業者」の欄に自動で入ります');
await tap(page.getByRole('button', {name: /☰ メニュー/}), 700);
await tap(page.getByRole('menu').getByRole('button', {name: /⚙ 設定/}).or(page.getByRole('menuitem', {name: /設定/})).first(), 1200);
await mark(page.getByText('自社の情報（申請書の施工業者）').first(), 1200);
await cap('', '会社名・営業所名・住所・電話番号を入れます（入れた内容は自動で保存されます）');
await typeIn(page.getByLabel(/^営業所名/), '本社', 140);
await wait(800);
await cap('', '「☰ メニュー」→「申請書を作成する」で、最初の画面に戻ります', '', 3600);
await tap(page.getByRole('button', {name: /☰ メニュー/}), 700);
await tap(page.getByRole('menu').getByRole('button', {name: /申請書を作成する/}).or(page.getByRole('menuitem', {name: /申請書を作成する/})).first(), 1200);
await cap('', '「＋ 新規作成」で、申請する保険者（市町村）のボタンを押します（例：苅田町）');
await tap(page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 苅田町', exact: true}), 1400);
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
await point(page.locator('[data-job-tabs]'));
await cap('', '上のタブは「住宅改修申請書」と「平面図」の2つ。押すと切り替わります');
await ring(null);

// ---------------- 2. お客様の情報
await chapter(1);
await cap('', '左の一覧に入れると、右の申請書（役所の様式のまま）に、そのまま入ります');
await cap('', 'フリガナは、ひらがなで打っても自動でカタカナになります', '', 3600);
await typeIn(form.getByLabel('フリガナ', {exact: true}), 'みほん はなこ');
await wait(1200);
await typeIn(form.getByLabel('被保険者氏名', {exact: true}), '見本 花子');
await page.keyboard.press('Tab');
await wait(900);
// プレビューの1枚目（申請書）の氏名の所（.last() だと下の平面図の用紙の「見本 花子 様邸」まで動いてしまった）
await page.evaluate(() => {
  const pg = document.querySelector('div.origin-top-left[role="group"]');
  const el = [...(pg?.querySelectorAll('*') ?? [])].find((e) => e.children.length === 0 && e.textContent.trim() === '見本 花子');
  el?.setAttribute('data-ov', 'name');
});
await point(page.locator('[data-ov="name"]'));
await cap('', '右の申請書の「被保険者氏名」にも、すぐに入りました');
await ring(null);
await cap('', '生年月日は数字を打つだけ。元号は初めから「昭和」です', '', 3600);
await typeIn(form.getByLabel('生年月日の年', {exact: true}), '15', 160);
await typeIn(form.getByLabel('生年月日の月', {exact: true}), '4', 160);
await typeIn(form.getByLabel('生年月日の日', {exact: true}), '1', 160);
await cap('', '性別・要介護状態区分・負担割合は、ボタンを押して選びます', '右の申請書の文字に丸が付きます', 3800);
await tap(form.getByRole('button', {name: '女', exact: true}), 700);
await tap(form.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護2'}), 700);
await tap(form.getByRole('button', {name: '1割', exact: true}), 900);
await cap('', '郵便番号を入れると、住所が自動で入ります（ハイフンなしで入力）', '', 3800);
await typeIn(form.getByLabel('郵便番号', {exact: true}), '8000344', 150);
await wait(1400);
await mark(form.getByLabel('住所', {exact: true}), 2400);
await cap('', '番地などは、住所の欄のうしろに打ち足せます', '', 3400);
await cap('', '電話番号もハイフンなしで打てば、自動でハイフンが付きます', '', 3800);
await typeIn(form.getByLabel('電話番号', {exact: true}), '0930000000', 120);
await page.keyboard.press('Tab');
await wait(1200);
await cap('', '住宅の所有者は「本人の家」を押すと、本人の名前が入ります', '', 3800);
await tap(form.getByRole('button', {name: '本人の家'}), 1400);
await point(form.getByLabel('被保険者番号', {exact: true}));
await cap('', '被保険者番号など、まだ分からない所は空欄のままで大丈夫です', 'あとから、いつでも入れられます（入れた内容はこの端末に自動で保存）');
await ring(null);

// ---------------- 3. 改修の内容
await chapter(2);
const works = form.locator('[data-field="works"]');
await works.scrollIntoViewIfNeeded();
await cap('', '「＋ 箇所を足す」で改修する場所を選び、改修の種類と長さを入れます');
const add = works.getByRole('combobox', {name: '箇所を足す'});
await point(add);
await wait(600);
await add.selectOption({label: '玄関'});
await ring(null);
await wait(800);
await cap('', '例：玄関の手すり 600mm（選ぶと、すぐ長さの欄に移ります）', '', 3600);
await page.keyboard.type('600', {delay: 180});
await wait(800);
await cap('', '高さを書くときは「＋ 高さ（任意）」を押して入れます', '', 3400);
await tap(works.getByRole('button', {name: /高さ（任意）/}).first(), 600);
await page.keyboard.type('800', {delay: 180});
await wait(800);
await point(add);
await wait(500);
await add.selectOption({label: 'トイレ'});
await ring(null);
await wait(800);
await page.keyboard.type('800', {delay: 180});
await page.keyboard.press('Tab');
await wait(1100);
const worksCell = page.getByText(/①玄関\s*手すりの取り付け/).last();
await point(worksCell);
await cap('', '右の申請書の「改修の内容」に、①玄関・②トイレの行が自動で書かれます', '①②の番号は、写真の用紙・平面図の番号と同じです');
await ring(null);
await cap('', '箇所の種類は、右のプルダウンで変えられます（段差の解消・扉の取替え など）', '', 4200);
await mark(works.getByRole('combobox', {name: '改修の種類'}).first(), 2200);
await cap('', '改修予定費用は、見積もりの金額を手で入れます（空欄のままでも保存できます）', '', 4400);
const cost = form.getByLabel('改修予定費用', {exact: true});
await typeIn(cost, '100000', 150);
await page.keyboard.press('Tab');
await wait(1000);
await mark(form.locator('[data-field="builder"]').or(page.getByText('株式会社イヤーズ').first()).first(), 600);
await cap('', '施工業者の欄には、⚙ 設定で入れた自社の情報が入ります');
await ring(null);

// ---------------- 4. 写真
await chapter(3);
const board = page.locator('[aria-label="写真"]').or(page.getByRole('region', {name: /写真/})).first();
await page.getByRole('button', {name: '①玄関 改修前', exact: true}).scrollIntoViewIfNeeded();
await cap('', '下の「写真」の欄に、箇所ごとの改修前・改修後の写真を入れます', 'パソコンなら写真をドロップ・Ctrl+V、スマホなら押して選ぶ・撮る');
const photo = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 900;
  const g = c.getContext('2d');
  g.fillStyle = '#efe7da';
  g.fillRect(0, 0, 1200, 900);
  g.fillStyle = '#c8b89f';
  g.fillRect(0, 640, 1200, 260);
  g.fillStyle = '#8a6f4e';
  g.fillRect(380, 120, 440, 540);
  g.fillStyle = '#6b5539';
  g.fillRect(760, 380, 24, 70);
  g.fillStyle = '#a89274';
  g.fillRect(300, 640, 600, 60);
  g.fillStyle = 'rgb(255 255 255 / .85)';
  g.fillRect(40, 40, 520, 96);
  g.fillStyle = '#14532d';
  g.font = 'bold 54px sans-serif';
  g.fillText('見本の写真（玄関）', 60, 108);
  const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return [...new Uint8Array(await b.arrayBuffer())];
});
{
  const slot = page.getByRole('button', {name: '①玄関 改修前', exact: true});
  await point(slot);
  await wait(700);
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), slot.click()]);
  await ring(null);
  await ch.setFiles([{name: 'genkan.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo)}]);
}
await wait(2500);
const pvImg = page.locator('img').filter({has: page.locator('xpath=self::*')});
const sheetImg = page.locator('[aria-label*="改修前"] img').last();
await sheetImg.scrollIntoViewIfNeeded().catch(() => {});
await wait(1200);
await point(sheetImg).catch(() => {});
await cap('', '右の写真の用紙に、その写真が入りました', '改修前の写真には、改修の内容（①玄関 手すりの取り付け L=600mm）も書かれます');
await ring(null);
await cap('', '改修前日付は今日の日付が入っています。日付入りの写真なら、写っている日付を読みます', '', 4800);
await mark(form.getByLabel('改修前日付', {exact: true}).or(page.getByLabel('改修前日付').first()).first(), 2200);
void pvImg;
void board;

// ---------------- 5. 平面図
await chapter(4);
await cap('', '上の「📐 平面図」のタブで、平面図を描きます', '', 3200);
await tap(page.locator('[data-job-tabs] [role="tab"]', {hasText: '平面図'}), 1500);
const canvas = page.locator('[data-madori-canvas] svg');
await canvas.waitFor();
await page.evaluate(() => document.querySelector('[role="toolbar"][aria-label="描く道具"]')?.scrollIntoView({block: 'start'}));
await wait(700);
await point(page.locator('[data-plan-works]'));
await cap('', '右には、申請書の改修の内容（①玄関・②トイレ）が出ています', '');
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
  await page.mouse.move(p.x, p.y, {steps: 16});
  await wait(300);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, {steps: 30});
  await wait(200);
  await page.mouse.up();
  await wait(700);
}
async function clickAt(x, y) {
  const p = await toPx(x, y);
  await page.mouse.move(p.x, p.y, {steps: 16});
  await wait(350);
  await page.mouse.click(p.x, p.y);
  await wait(600);
}
await cap('', '左の部屋のボタンを押して、方眼をなぞると部屋が描けます（1マス＝910mm）', '', 4200);
await drag([0, 0], [3 * M, 3 * M]); // 洋室（初めから選ばれている）
await tap(page.getByRole('button', {name: 'トイレ', exact: true}).first(), 400);
await drag([3 * M, 0], [4 * M, 1.5 * M]);
await tap(page.getByRole('button', {name: '玄関', exact: true}).first(), 400);
await drag([3 * M, 1.5 * M], [4.5 * M, 3 * M]);
await cap('', '「トイレ（便器）」を押すと、トイレの部屋の中に自動で入ります', '向きは ↻ をドラッグして、360度自由に回せます', 4600);
await tap(page.getByRole('toolbar', {name: '描く道具'}).getByRole('button', {name: 'トイレ（便器）'}), 2000);
await cap('', '手すりは「横棒」で引きます', '', 3000);
await tap(page.getByRole('toolbar', {name: '描く道具'}).getByRole('button', {name: /横棒/}).first(), 400);
await drag([3.1 * M, 2.85 * M], [4.3 * M, 2.85 * M]);
await cap('', '「番号」を押して、①②の番号を置きます（申請書の箇所と同じ番号）', '', 4200);
const bar = page.getByRole('toolbar', {name: '描く道具'});
await tap(bar.getByRole('button', {name: /番号$/}), 400);
await clickAt(3.7 * M, 2.45 * M);
await clickAt(3.5 * M, 1.15 * M);
await tap(bar.getByRole('button', {name: '番号を確定'}), 1000);
await page.keyboard.press('Escape');
await wait(900);
await cap('', '間違えたら「戻す」、部品は「削除」でなぞって消せます', '', 3800);
await cap('', '描いた平面図は、申請書の平面図にも自動で入ります', '', 3200);
await tap(page.locator('[data-job-tabs] [role="tab"]', {hasText: '住宅改修申請書'}), 1500);
{
  const plan = page.locator('[aria-label="平面図"]').first();
  await plan.scrollIntoViewIfNeeded();
  await wait(1200);
  await point(plan);
  await cap('', '申請書の「平面図」の用紙に、いま描いた図が入っています', '申請書の平面図の枠から描くこともできます（どちらで描いても同じ図）');
  await ring(null);
}

// ---------------- 6. 印刷・Excel
await chapter(5);
await page.evaluate(() => window.scrollTo({top: 0, behavior: 'smooth'}));
await wait(900);
// 動画の画面（1280×720）では A4 の1枚が入りきらないので、撮るときだけ印刷の画面の紙を半分の大きさにして見せる
await page.addStyleTag({content: '.print-root{zoom:.5!important;padding-top:6px}'});
await cap('', '「🖨 申請書を印刷」：印刷するページ（申請書・委任状・写真・平面図）を選んで印刷します', '', 4800);
await tap(page.getByRole('button', {name: '🖨 申請書を印刷'}), 2200);
await mark(page.getByRole('group', {name: '印刷するページ'}), 2600);
await tap(page.getByRole('button', {name: '✕ 閉じる'}).first(), 1000);
await cap('', '「📐 平面図」のタブの「🖨 平面図を印刷」では、平面図だけを A4 で印刷できます', '', 4400);
await cap('', '「📗 Excelで保存」：申請書・平面図を、役所の様式のまま Excel で保存します', '会社の Excel で開いて、直したり印刷したりできます');
await tap(page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first(), 1000);
const xdlg = page.getByRole('dialog', {name: 'Excelで保存'});
const boxes = xdlg.getByRole('group', {name: '保存する書類'}).getByRole('checkbox');
for (let i = 0; i < (await boxes.count()); i++) {
  const b = boxes.nth(i);
  if ((await b.isDisabled()) || (await b.isChecked())) continue;
  await tap(b, 500);
}
await cap('', '保存したい書類にチェックを入れて、保存を押します', '', 3200);
await tap(xdlg.getByRole('button', {name: /^📗 \d+つ保存する$/}), 2600);
await cap('', '「✉ メールで送付」では、チェックした書類を添付したメールを作れます', '', 4000);
await capOff();
await chapLabel(null);
await wait(500);

// まとめ
await card(`<div class="t1">まとめ</div>
  <ul><li>左の一覧に入れると、右の申請書（役所の様式）にそのまま入ります</li>
  <li>分からない所は空欄のままで大丈夫（あとから入れられます）</li>
  <li>改修の内容・写真・平面図の ①② の番号は、みな同じ箇所です</li>
  <li>平面図のタブで描いた図は、申請書の平面図にも入ります</li>
  <li>入力した内容はこの端末に自動で保存。「📗 Excelで保存」で役所の様式のまま保存・印刷</li></ul>`);
await wait(11000);
await cdp.send('Page.stopScreencast');
await wait(500);
await writeFile(path.join(out, 'times.json'), JSON.stringify(times));
console.log('frames', n, 'seconds', (times.at(-1) - times[0]).toFixed(1));
await browser.close();
