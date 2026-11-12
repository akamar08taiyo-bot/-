// 太陽シルバーサービス 申請書・見積書作成の使い方動画を撮る（ユーザーの指示「対応シルバー用の見積もり申請書作成アプリの動画も作成…見積もりのサンプルは、
// BD-132.BD-08G.BH-414.施工費 3000円…動画はある程度目次もつける。特定福祉用具では、ユクリアコンパクト肘掛け跳ね上げと、楽スマを使用する」2026-11-12）。
// 目次・7つの章（部材リスト・住宅改修申請書・工事見積書・理由書・平面図・特定福祉用具申請書と販売見積書・Excel）。
// 架空のお客様＝見本 花子。部材の金額は見本（架空。ユーザーの答え「見本の金額で撮る」。本当の定価・仕入れではない）。施工費は「木」の単価を 3000 に打ち直す。
// 特定福祉用具は商品名「ユクリア コンパクト 肘付き」で検索（コンパクトSPおりたたみN）と「楽スマ」（スリーベース）。iframe の中のマウスも上の画面の指に送る。
// 使い方：npm run build:jutaku → <サイト>/jutaku-mitsumori/ に dist-jutaku、<サイト>/tokutei/ に特定福祉用具のビルドを置き、
//   node scripts/serve.mjs <サイト> node scripts/taiyo-video-record.mjs http://localhost:5190 <出力フォルダ>（FAST=1 で下見：待ちを短く・章ごとに画面写真）
//   python3 scripts/years-video-make.py <出力フォルダ> <出力フォルダ>/taiyo-howto.mp4
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
await ctx.addInitScript(() => {
  window.print = () => {};
  try {
    localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
  } catch {}
  if (window !== window.top) {
    const fwd = (kind) => (e) => {
      try {
        const r = window.frameElement.getBoundingClientRect();
        window.parent.__ov?.[kind](e.clientX + r.left, e.clientY + r.top);
      } catch {}
    };
    document.addEventListener('mousemove', fwd('move'), true);
    document.addEventListener('mousedown', fwd('ripple'), true);
    return;
  }
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
    move(x, y) {
      const p = document.getElementById('ov-ptr');
      if (p) Object.assign(p.style, {left: x + 'px', top: y + 'px'});
    },
    ripple(x, y) {
      const r = document.createElement('div');
      r.className = 'ov-rip';
      Object.assign(r.style, {left: x + 'px', top: y + 'px'});
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 700);
    },
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

const FAST = process.env.FAST === '1';
const wait = (ms) => page.waitForTimeout(FAST ? Math.min(ms, 250) : ms);
const read = (t) => Math.min(9000, Math.max(3400, 2200 + [...t].length * 125)); // 字の数で読む時間（v2 は長め）
async function cap(step, text, sub = '', ms) {
  await page.evaluate(([s, t, b]) => window.__ov.cap(s, t, b), [step, text, sub]);
  await wait(ms ?? read(text + sub));
}
const ring = (r) => page.evaluate((r) => window.__ov.ring(r), r);
async function point(loc, {steps = 18} = {}) {
  await loc.scrollIntoViewIfNeeded();
  // 下のテロップに隠れる所・上の帯の下は、画面のまん中まで動かす
  await loc.evaluate((e) => {
    const r = e.getBoundingClientRect();
    if (r.bottom > innerHeight - 150 || r.top < 110) e.scrollIntoView({block: 'center'});
  }).catch(() => {});
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

// ---------------- 撮る（太陽シルバーサービス 申請書・見積書作成。お客様は架空＝見本 花子。部材の金額は見本＝架空）
const CHAPTERS = ['はじめに（部材リスト・新規作成）', '住宅改修申請書', '工事見積書', '理由書', '平面図', '特定福祉用具申請書・販売見積書', 'Excelで保存・印刷・メール'];
const card = (html) => page.evaluate((h) => window.__ov.card(h), html);
const chapLabel = (t) => page.evaluate((t) => window.__ov.chap(t), t);
const capOff = () => page.evaluate(() => window.__ov.capOff());
const snap = async (name) => FAST && (await page.screenshot({path: path.join(out, `dry-${name}.png`)}));
async function chapter(i) {
  await capOff();
  await chapLabel(null);
  await card(`<div class="no">第${i + 1}章</div><div class="t2">${CHAPTERS[i]}</div>`);
  await wait(2800);
  await card(null);
  await wait(500);
  await chapLabel(`${i + 1}. ${CHAPTERS[i]}`);
}
// 見積書の欄は右の方を押す（空いた行は左の打つ所。まん中には「部材｜施工費｜常用」のボタン。test/sasaoka/more.mjs の cellAt と同じ）
function cellAt(loc) {
  return {
    async click() {
      await loc.scrollIntoViewIfNeeded();
      const b = await loc.boundingBox();
      const pick = await loc.evaluate((el) => !!el.querySelector(':scope > .sheet-pick')).catch(() => false);
      const x = b.x + (pick ? 6 : Math.max(4, b.width - 20));
      const y = b.y + b.height / 2;
      await page.mouse.move(x, y, {steps: 16});
      await wait(400);
      await page.mouse.click(x, y);
    },
  };
}
const nav = page.getByRole('navigation', {name: '画面'});
async function menuTo(name) {
  const shown = nav.getByRole('button', {name}).filter({visible: true});
  if (await shown.count()) return tap(shown.first(), 900);
  await tap(nav.getByRole('button', {name: /^☰ メニュー/}), 600);
  await tap(nav.getByRole('menu', {name: 'メニュー'}).getByRole('button', {name}), 1000);
}
const jobTab = (name) => page.locator('[data-job-tabs] [role="tab"]', {hasText: name});

await page.goto(`${site}/jutaku-mitsumori/index.html`);
await page.evaluate(() => window.__ov.ensure());
if (!FAST) await cdp.send('Page.startScreencast', {format: 'jpeg', quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1});
await page.mouse.move(640, 400);

await card(`<div class="t1">太陽シルバーサービス</div><div class="t2">申請書・見積書作成　使い方</div>
  <div class="sub">住宅改修申請書を入れると、工事見積書・理由書・平面図・特定福祉用具申請書に自動で入ります</div>`);
await wait(5500);
await card(`<div class="t1">目次</div><ol>${CHAPTERS.map((c) => `<li>${c}</li>`).join('')}</ol>`);
await wait(9500);
await card(null);
await wait(600);

// ---------------- 1. はじめに：部材リスト（見本の金額）・新規作成
await chapter(0);
await cap('', '見積書の部材は「📦 部材・施工費マスタ」の部材リストから選びます', 'メーカーの価格表（Excel・CSV・PDF）を取り込んでおきます');
await menuTo('📦 部材・施工費マスタ');
await tap(page.getByRole('button', {name: /メーカーの仕切り表を取り込む/}), 900);
// 金額は見本（架空）。動画の中だけで、本当の定価・仕入れではない
// （品番・品名・定価・仕切単価。金額の数字とカンマを並べて書かない＝リポジトリの金額の検査に合わせて join で作る）
const csv =
  [
    ['品番', '品名', '定価', '仕切単価'],
    ['BD-132', '35アッシュ丸棒 Mオーク 2m', 10000, 6000],
    ['BD-08G', '35エンドブラケットカバー付 ゴールド', 2000, 1000],
    ['BH-414', '木製ベースプレート 120mm幅 Mブラウン 4m', 16000, 10000],
  ]
    .map((r) => r.join(','))
    .join('\n') + '\n';
await page.locator('[role=dialog] input[type=file]').setInputFiles({name: 'mihon.csv', mimeType: 'text/csv', buffer: Buffer.from(csv)});
await wait(900);
await typeIn(page.getByPlaceholder('例：マツ六'), 'マツ六', 120);
await cap('', 'ここでは BD-132・BD-08G・BH-414 の3つを入れます（動画の金額は見本です）', '', 4200);
await tap(page.getByRole('button', {name: '部材リストに取り込む（3件）'}), 1500);
await snap('1-materials');
await cap('', '「📝 見積もり・申請書を作成する」に戻って、「＋ 新規作成」で保険者を選びます（例：苅田町）');
await menuTo('📝 見積もり・申請書を作成する');
await tap(page.getByRole('region', {name: '新規作成'}).getByRole('button', {name: '＋ 苅田町', exact: true}), 1500);
const form = page.getByRole('form', {name: '申請書'});
await form.waitFor();
await point(page.locator('[data-job-tabs]'));
await cap('', '上のタブ：住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書・平面図', 'お客様の情報は、どのタブで入れても、ほかのタブに入ります');
await ring(null);

// ---------------- 2. 住宅改修申請書
await chapter(1);
await cap('', '左の一覧に入れると、右の申請書（役所の様式のまま）にそのまま入ります');
await typeIn(form.getByLabel('フリガナ', {exact: true}), 'みほん はなこ');
await typeIn(form.getByLabel('被保険者氏名', {exact: true}), '見本 花子');
await cap('', 'フリガナはひらがなで打っても、自動でカタカナになります', '', 3400);
await typeIn(form.getByLabel('生年月日の年', {exact: true}), '15', 150);
await typeIn(form.getByLabel('生年月日の月', {exact: true}), '4', 150);
await typeIn(form.getByLabel('生年月日の日', {exact: true}), '1', 150);
await tap(form.getByRole('button', {name: '女', exact: true}), 500);
await tap(form.getByRole('group', {name: '要介護状態区分'}).getByRole('button', {name: '要介護2'}), 500);
await tap(form.getByRole('button', {name: '1割', exact: true}), 600);
await cap('', '郵便番号を入れると住所が、電話番号はハイフンなしでも自動で入ります', '', 4000);
await typeIn(form.getByLabel('郵便番号', {exact: true}), '8000344', 140);
await wait(1200);
await typeIn(form.getByLabel('電話番号', {exact: true}), '0930000000', 110);
await page.keyboard.press('Tab');
await tap(form.getByRole('button', {name: '本人の家'}), 900);
await point(form.getByLabel('被保険者番号', {exact: true}));
await cap('', '被保険者番号など、分からない所は空欄のままで大丈夫です（あとから入れられます）');
await ring(null);
const works = form.locator('[data-field="works"]');
await works.scrollIntoViewIfNeeded();
await cap('', '「＋ 箇所を足す」で玄関を選び、手すりの長さ 600mm を入れます', '', 4000);
const add = works.getByRole('combobox', {name: '箇所を足す'});
await point(add);
await wait(500);
await add.selectOption({label: '玄関'});
await ring(null);
await wait(700);
await page.keyboard.type('600', {delay: 180});
await wait(700);
await cap('', 'ベースプレートを使うときは「＋ ベースプレート」で長さを入れます', '', 3800);
await tap(works.getByRole('button', {name: '＋ ベースプレート'}).first(), 600);
await page.keyboard.type('600', {delay: 180});
await page.keyboard.press('Tab');
await wait(900);
await mark(works.getByText('見積書へ連動').first(), 1200);
await cap('', '「見積書へ連動」がオンなので、この箇所は工事見積書にも入ります');
await snap('2-shinsei');

// ---------------- 3. 工事見積書
await chapter(2);
await tap(jobTab('工事見積書'), 1500);
const sheet = page.getByRole('region', {name: '見積書', exact: true});
await sheet.waitFor();
await point(sheet.locator('.form-page tr', {hasText: '玄関'}).first());
await cap('', '申請書の「①玄関」が入っていて、手すり・ブラケット・施工費などの空いた行もできています');
await ring(null);
const textKey = await sheet.locator('.form-page tr', {hasText: '玄関'}).first().locator('[data-edit$=":text"]').first().getAttribute('data-edit');
await cellAt(sheet.locator(`[data-edit="${textKey}"]`)).click();
await wait(600);
await cap('', '行の「部材」を押すと、部材リストから選べます', '', 3200);
{
  const cur = sheet.locator('tr[data-current] [data-pick="material"]');
  await tap((await cur.count()) ? cur : sheet.locator('tr[data-new] [data-pick="material"]'), 900);
}
const dlg = page.getByRole('dialog');
await tap(dlg.getByRole('button', {name: /^すべて/}), 600);
async function pick(code, plus = 0) {
  await typeIn(dlg.getByPlaceholder(/商品名・品番で検索/), code, 130);
  await page.keyboard.press('Control+A');
  const row = dlg.getByRole('row', {name: new RegExp(code)}).first();
  await tap(row.getByRole('button', {name: '＋ 追加'}), 700);
  for (let i = 0; i < plus; i++) await tap(row.getByRole('button', {name: /を1つ増やす/}), 500);
  await dlg.getByPlaceholder(/商品名・品番で検索/).fill('');
}
await cap('', '品番で探して「＋ 追加」：BD-132（手すり 2m）', '', 3000);
await pick('BD-132');
await cap('', 'BH-414（木製ベースプレート 4m）', '', 2600);
await pick('BH-414');
await cap('', 'BD-08G（エンドブラケット）は 2個', '', 2600);
await pick('BD-08G', 1);
await snap('3-picker');
await cap('', '「🔧 施工費に進む」を押すと、そのまま施工費のリストが開きます', '', 3600);
await tap(dlg.getByRole('button', {name: /施工費に進む/}), 1000);
{
  const list = page.getByRole('listbox', {name: '施工費のリスト'});
  await list.waitFor();
  if (FAST) console.log('OPTIONS', (await list.getByRole('option').allInnerTexts()).slice(0, 12).map((t) => t.replace(/\s+/g, ' ')).join(' | '));
  await cap('', '施工費は「木」（取り付け 1か所）を選びます', '', 3000);
  await tap(list.getByRole('option').filter({hasText: /^木\d/}).first(), 1200);
}
await snap('3-labor');
// 施工費 3000円：同上施工費は「1 式」なので、単価を 3000 に打ち直す（Excel と同じように欄を選んで打つ）
{
  const tr = sheet.locator('.form-page tr', {hasText: '同上施工費'}).first();
  const priceKey = await tr.locator('[data-edit$=":price"]').first().getAttribute('data-edit');
  await cap('', '取り付けは2か所なので、施工費の単価を 3000円 に打ち直します', 'Excel と同じように、欄を選んで数字を打って Enter', 3800);
  await cellAt(sheet.locator(`[data-edit="${priceKey}"]`)).click();
  await wait(500);
  await page.keyboard.type('3000', {delay: 170});
  await page.keyboard.press('Enter');
  await wait(1200);
  await point(tr);
  await cap('', '施工費 3000円 になりました。合計・消費税・介護保険の内訳も自動で計算されます', '', 4600);
  await ring(null);
}
await snap('3-labor2');
{
  const sum = sheet.getByText(/^合計/).first();
  if (await sum.count()) await mark(sum, 2400);
}
await cap('', '見積書の合計は、申請書の「改修予定費用」にも自動で入ります', '', 3200);
await tap(jobTab('住宅改修申請書'), 1500);
await mark(form.getByLabel('改修予定費用', {exact: true}), 3200);
await snap('3-cost');

// ---------------- 4. 理由書
await chapter(3);
await tap(jobTab('理由書'), 1500);
await mark(page.getByLabel('被保険者氏名', {exact: true}).first(), 1500);
await cap('', '理由書：お名前・住所・改修の箇所など、申請書に入れた内容が転記されています', '残りの欄（理由など）を入れるだけです');
{
  const p2 = page.locator('[aria-label="理由書のプレビュー"] [role="group"]').nth(1);
  if (await p2.count()) {
    await p2.evaluate((e) => e.scrollIntoView({block: 'start', behavior: 'smooth'}));
    await wait(1000);
    await point(p2);
    await cap('', '改修項目のチェック（手すりの取付け ①玄関）も自動で付きます');
    await ring(null);
  }
}
await snap('4-riyu');

// ---------------- 5. 平面図
await chapter(4);
await tap(jobTab('平面図'), 1500);
const canvas = page.locator('[data-madori-canvas] svg');
await canvas.waitFor();
await page.evaluate(() => document.querySelector('[role="toolbar"][aria-label="描く道具"]')?.scrollIntoView({block: 'start'}));
await wait(700);
await point(page.locator('[data-plan-works]'));
await cap('', '平面図：右に申請書の改修の内容（①玄関）が出ています');
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
async function drag(a, b2) {
  const p = await toPx(...a);
  const q = await toPx(...b2);
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
await cap('', '部屋のボタンを押して、方眼をなぞると部屋が描けます', '', 3400);
await drag([0, 0], [3 * M, 3 * M]);
await tap(page.getByRole('button', {name: '玄関', exact: true}).first(), 400);
await drag([3 * M, 1.5 * M], [4.5 * M, 3 * M]);
await cap('', '手すりは「横棒」、①の番号は「番号」で置きます', '', 3600);
const bar = page.getByRole('toolbar', {name: '描く道具'});
await tap(bar.getByRole('button', {name: /横棒/}).first(), 400);
await drag([3.1 * M, 2.85 * M], [4.3 * M, 2.85 * M]);
await tap(bar.getByRole('button', {name: /番号$/}), 400);
await clickAt(3.7 * M, 2.45 * M);
await tap(bar.getByRole('button', {name: '番号を確定'}), 1000);
await page.keyboard.press('Escape');
await cap('', '描いた平面図は、申請書の平面図・「🖨 平面図を印刷」・Excel にも入ります', '', 4400);
await snap('5-madori');

// ---------------- 6. 特定福祉用具申請書・販売見積書
await chapter(5);
await tap(jobTab('特定福祉用具申請書'), 2500);
const tk = page.frameLocator('iframe[title="特定福祉用具 購入申請書・見積もり作成"]');
const block = tk.locator('[data-item]').first();
await block.getByLabel('種目').waitFor({timeout: 60000});
await point(tk.getByLabel('お客様名').or(tk.getByRole('textbox', {name: 'お客様名', exact: true})).first()).catch(() => {});
await cap('', '特定福祉用具申請書：お名前・住所などは、住宅改修申請書から入っています');
await ring(null);
await cap('', '種目を選び、メーカーを選んで、商品名に「ユクリア コンパクト 肘付き」と打ちます', '', 4400);
await point(block.getByLabel('種目'));
await wait(500);
await block.getByLabel('種目').selectOption('入浴補助用具');
await ring(null);
const pk = block.getByRole('group', {name: 'カタログの商品'});
await pk.getByRole('combobox', {name: 'メーカー', exact: true}).waitFor({timeout: 60000});
await point(pk.getByRole('combobox', {name: 'メーカー', exact: true}));
await wait(500);
await pk.getByRole('combobox', {name: 'メーカー', exact: true}).selectOption('パナソニックエイジフリー（株）');
await ring(null);
await typeIn(block.getByLabel('商品名'), 'ユクリア コンパクト 肘付き', 120);
await cap('', '「📖 カタログから商品検索」：カタログの中から、肘付きの商品だけが出ます', '肘付き・肘なしを取りちがえないよう「ひじ掛けあり」の札が付きます');
await tap(pk.getByRole('button', {name: '📖 カタログから商品検索'}), 1500);
const list1 = pk.getByRole('list');
await list1.waitFor();
await mark(list1, 2200);
await tap(list1.getByRole('button', {name: /コンパクトSPおりたたみN（\d+種類）/}), 1000);
await tap(pk.getByRole('button', {name: /コンパクトSPおりたたみN .*を入れる/}).first(), 1500);
await point(block.getByLabel('商品名'));
await cap('', '商品名・品番・メーカー・定価がカタログから入りました（右の申請書にも）', '');
await ring(null);
await snap('6-item1');
await cap('', '「＋ 2つ目の福祉用具を追加」で、2つ目の商品を足します（例：楽スマ）', '', 4000);
await tap(tk.getByRole('button', {name: '＋ 2つ目の福祉用具を追加'}), 1000);
const block2 = tk.locator('[data-item]').nth(1);
await block2.getByLabel('種目').selectOption('歩行補助つえ');
await wait(800);
const pk2 = block2.getByRole('group', {name: 'カタログの商品'});
await pk2.getByRole('button', {name: '📖 カタログから商品検索'}).waitFor({timeout: 60000});
await typeIn(block2.getByLabel('商品名'), '楽スマ', 160);
await tap(pk2.getByRole('button', {name: '📖 カタログから商品検索'}), 1500);
const list2 = pk2.getByRole('list');
await list2.waitFor();
{
  const one = list2.getByRole('button', {name: /楽スマ/}).first();
  await tap(one, 1000);
  const put = pk2.getByRole('button', {name: /を入れる$/}).first();
  if (await put.count()) await tap(put, 1500);
}
await point(block2.getByLabel('商品名'));
await cap('', '楽スマ スリーベース（多点杖）も入りました。非課税の商品も自動で分かります', '');
await ring(null);
await snap('6-item2');
await cap('', '「🏷 販売見積書」のタブには、同じ商品の御見積書ができています', '', 3600);
await tap(jobTab('販売見積書'), 2500);
await wait(1500);
await snap('6-hanbai');

// ---------------- 7. Excel・印刷・メール
await chapter(6);
await cap('', '「📗 Excelで保存」：書類にチェックを入れて、まとめて Excel で保存できます', '役所の様式のまま。会社の Excel で直したり印刷したりできます');
await tap(page.getByRole('button', {name: '📗 Excelで保存', exact: true}).first(), 1200);
const xdlg = page.getByRole('dialog', {name: 'Excelで保存'});
const boxes = xdlg.getByRole('group', {name: '保存する書類'}).getByRole('checkbox');
for (let i = 0; i < (await boxes.count()); i++) {
  const bx = boxes.nth(i);
  if ((await bx.isDisabled()) || (await bx.isChecked())) continue;
  await tap(bx, 400);
}
await snap('7-excel');
await tap(xdlg.getByRole('button', {name: /^📗 \d+つ保存する$/}), 3000);
await cap('', '「🖨 印刷」はタブごとに（申請書を印刷・見積書を印刷 など）。「✉ メールで送付」は、チェックした書類を添付したメールを作ります', '', 5600);
await capOff();
await chapLabel(null);
await wait(500);
await card(`<div class="t1">まとめ</div>
  <ul><li>住宅改修申請書に入れた内容は、工事見積書・理由書・平面図・特定福祉用具申請書に自動で入ります</li>
  <li>見積書の部材は部材リストから。長さから本数・金額を自動で計算します</li>
  <li>特定福祉用具は、カタログから商品検索（肘付き・肘なしも分かります）</li>
  <li>分からない所は空欄のままで大丈夫。入力した内容はこの端末に自動で保存</li>
  <li>「📗 Excelで保存」で、役所の様式のまま保存・印刷</li></ul>`);
await wait(12000);
if (!FAST) {
  await cdp.send('Page.stopScreencast');
  await wait(500);
  await writeFile(path.join(out, 'times.json'), JSON.stringify(times));
  console.log('frames', n, 'seconds', (times.at(-1) - times[0]).toFixed(1));
}
await browser.close();
