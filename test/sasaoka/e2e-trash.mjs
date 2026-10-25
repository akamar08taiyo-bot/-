// ゴミ箱と上のタブを確かめる（ユーザーの指示「設定のタブの横にゴミ箱をつくり、一時的に削除したデータを残せるようにする。ゴミ箱内、チェックして１件１件、
// もしくは一括で削除したら、完全に消せるようにする」「ここらへんのタブももう少し大きく見やすくする」2026-10-25）：
//   一覧の行の「削除」→ ゴミ箱へ（確かめ「○○様邸をゴミ箱に移しますか？」・Ctrl+Z で戻る）／チェックして「削除する」→ まとめてゴミ箱へ（「N件をゴミ箱に移しますか？」）／
//   ゴミ箱の様邸は一覧・探す・件数・請求書・もう1つのアプリ（開いたままの請求書のタブ）に出ない／ゴミ箱のタブ（削除した日・お客様名・保険者・作成日・合計）／
//   読み直しても残る・写真も残る／元に戻す／行の「完全に削除」・チェックしてまとめて「完全に削除」（どちらも確かめる。やめたら消さない）→ 写真も消える／
//   上のタブ（大きさ・選んでいるタブ・広い画面で1段・タブを替えても動かない）・スマホの幅（3段・横にはみ出さない）
// usage: node e2e-trash.mjs <サイトのURL> <出力フォルダ>
//   サイトは太陽ポータルと同じ形（<サイト>/jutaku-mitsumori/index.html と <サイト>/sasaoka/index.html）
const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import path from 'node:path';

const [site, outDir] = process.argv.slice(2);
const log = (...a) => console.log('•', ...a);
// スクロールバーを出す（タブを替えたときに画面の幅が変わらないかを見るため）
const browser = await chromium.launch({ignoreDefaultArgs: ['--hide-scrollbars']});
const errors = [];
const asked = []; // 確かめ（confirm）の文
let answer = true; // 確かめに OK（true）か キャンセル（false）か
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
  p.on('dialog', (d) => {
    asked.push(d.message());
    return answer ? d.accept() : d.dismiss();
  });
};
const newPage = async (ctx, url, name) => {
  const p = await ctx.newPage();
  watch(p, name);
  await p.goto(url);
  return p;
};
const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// 見本の様邸（名前・番号は見本だけ）。見本一には写真を1枚（この端末の写真の保存場所に、1時間より前に入れた写真として）
const job = (id, customer, i, extra = {}) => ({
  id,
  month,
  customer,
  suffix: '様邸',
  staff: '',
  date: '',
  estDate: `${month}-0${i}`,
  address: '',
  note: '',
  insuredNo: '0000000000',
  insurer: i % 2 ? 'yukuhashi' : 'kanda',
  form: 'yukuhashi',
  overhead: null,
  overheadTarget: null,
  shikiri: true,
  places: [
    {
      id: `${id}-p`,
      name: '玄関',
      kind: 1,
      photo: 0,
      rows: [{id: `${id}-r`, kind: 'material', refId: null, name: '見本の手すり', code: 'S-0000', maker: '見本', unit: '本', price: 1000 * i, qty: 1, listPrice: 2000 * i}],
      ...extra,
    },
  ],
  createdAt: i,
  updatedAt: i,
});
const JOBS = [job('j1', '見本一', 1, {photos: {before: 'ph-trash-1'}}), job('j2', '見本二', 2), job('j3', '見本三', 3), job('j4', '見本四', 4)];
const seed = (page) =>
  page.evaluate(
    (jobs) =>
      Promise.all([
        new Promise((resolve) => {
          const req = indexedDB.open('taiyo-sasaoka-shikiri', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('kv');
          req.onsuccess = () => {
            const tx = req.result.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(jobs, 'jobs');
            tx.objectStore('kv').put('seed-' + Date.now(), 'stamp:jobs');
            tx.oncomplete = () => resolve(null);
          };
        }),
        new Promise((resolve) => {
          const req = indexedDB.open('taiyo-sasaoka-photos', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('photos', {keyPath: 'id'});
          req.onsuccess = () => {
            const tx = req.result.transaction('photos', 'readwrite');
            tx.objectStore('photos').put({id: 'ph-trash-1', blob: new Blob(['x']), w: 1, h: 1, created: 0});
            tx.objectStore('photos').put({id: 'ph-orphan', blob: new Blob(['x']), w: 1, h: 1, created: 0}); // どこからも使われない古い写真（開いたときに消える）
            tx.oncomplete = () => resolve(null);
          };
        }),
      ]),
    JOBS,
  );
const photoIds = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('taiyo-sasaoka-photos');
        req.onsuccess = () => {
          const all = req.result.transaction('photos').objectStore('photos').getAllKeys();
          all.onsuccess = () => resolve(all.result.map(String).sort());
        };
      }),
  );
const noOverflow = async (page, what) => {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw <= cw, `${what}：横にはみ出している（${sw} > ${cw}）`);
};

const ctx = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'ja-JP'});
await ctx.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const page = await newPage(ctx, `${site}/jutaku-mitsumori/index.html`, '見積書');
await page.getByRole('heading', {name: '＋ 新規作成'}).waitFor();
await seed(page);
await page.reload();
const nav = page.getByRole('navigation');
const tabBtn = (name) => nav.getByRole('button', {name});
const trashTab = tabBtn(/ゴミ箱/);
await trashTab.waitFor();

// ---------------- 上のタブ：5つ（設定の右にゴミ箱）・大きさ・選んでいるタブ・広い画面で1段・タブを替えても動かない
const tabNames = await nav.getByRole('button').allInnerTexts();
assert.deepEqual(
  tabNames.map((t) => t.trim()),
  ['📝 見積もり・申請書を作成する', '🧾 請求書を確認する', '📦 部材・施工費マスタ', '⚙ 設定', '🗑 ゴミ箱'],
);
const tabBoxes = async () => nav.getByRole('button').evaluateAll((els) => els.map((e) => {
  const r = e.getBoundingClientRect();
  return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: parseFloat(getComputedStyle(e).fontSize)};
}));
const first = await tabBoxes();
assert.ok(first.every((b) => b.y === first[0].y), `1段に並んでいない: ${JSON.stringify(first)}`);
assert.ok(first.every((b) => b.h >= 48 && b.font >= 16), `タブが小さい: ${JSON.stringify(first)}`);
for (const name of ['🧾 請求書を確認する', '📦 部材・施工費マスタ', '⚙ 設定', '🗑 ゴミ箱', '📝 見積もり・申請書を作成する']) {
  await tabBtn(name).click();
  assert.equal(await tabBtn(name).getAttribute('aria-current'), 'page');
  assert.equal(await nav.locator('[aria-current=page]').count(), 1);
  await page.waitForTimeout(250); // 色が変わり終わるまで（transition）
  // 選んでいるタブは下の画面と同じ色（明るい地）、ほかは暗い地の上の白い字
  const [on, off] = await Promise.all([
    tabBtn(name).evaluate((e) => getComputedStyle(e).color),
    nav.locator('button:not([aria-current])').first().evaluate((e) => getComputedStyle(e).color),
  ]);
  assert.notEqual(on, off);
  assert.deepEqual((await tabBoxes()).map((b) => b.x), first.map((b) => b.x), `${name}：タブの位置が動いた`);
  await noOverflow(page, name);
}
await page.screenshot({path: path.join(outDir, 'trash-01-tabs-1366.png'), clip: {x: 0, y: 0, width: 1366, height: 200}});
log('上のタブ（5つ・大きさ・選んでいるタブ・1段・動かない）OK');

// もう1つのアプリ（請求書のタブ）を開いたままにしておく（ゴミ箱に移すと、こちらの一覧からも消える）
const inv = await newPage(ctx, `${site}/sasaoka/index.html`, '請求書');
await inv.getByRole('cell', {name: '見本一様邸'}).waitFor();
assert.equal(await inv.locator('tbody tr', {hasText: '見本'}).count(), 4);

// ---------------- 一覧の行の「削除」→ ゴミ箱へ
assert.match(await page.locator('main').innerText(), /全部で 4件/);
await page.getByRole('button', {name: '📋 見積書の一覧を開く'}).click();
const rows = page.locator('main tbody tr');
const row = (name) => page.getByRole('row', {name: new RegExp(name)});
await row('見本一様邸').waitFor();
assert.equal(await rows.count(), 4);
// 確かめでキャンセルしたら消さない
answer = false;
await row('見本一様邸').getByRole('button', {name: '削除', exact: true}).click();
assert.equal(asked.pop(), '見本一様邸をゴミ箱に移しますか？');
assert.equal(await rows.count(), 4);
answer = true;
await row('見本一様邸').getByRole('button', {name: '削除', exact: true}).click();
assert.equal(asked.pop(), '見本一様邸をゴミ箱に移しますか？');
await page.locator('[aria-live] > div', {hasText: 'ゴミ箱に移しました'}).waitFor();
assert.equal(await rows.count(), 3);
assert.equal(await row('見本一様邸').count(), 0);
assert.equal((await trashTab.innerText()).replace(/\s+/g, ' ').trim(), '🗑 ゴミ箱 1');
// 開いたままの請求書のアプリからも消える
await inv.getByRole('cell', {name: '見本一様邸'}).waitFor({state: 'detached'});
assert.equal(await inv.locator('tbody tr', {hasText: '見本'}).count(), 3);
// Ctrl+Z で戻る → もう一度削除
await page.locator('body').click({position: {x: 5, y: 600}});
await page.keyboard.press('Control+z');
await row('見本一様邸').waitFor();
assert.equal(await rows.count(), 4);
assert.equal((await trashTab.innerText()).trim(), '🗑 ゴミ箱');
await row('見本一様邸').getByRole('button', {name: '削除', exact: true}).click();
assert.equal(await rows.count(), 3);
log('一覧の行の削除 → ゴミ箱（確かめ・キャンセル・Ctrl+Z・開いたままの請求書からも消える）OK');

// ---------------- チェックして「削除する」→ まとめてゴミ箱へ（2件）→ ゴミ箱は3件
const bar = page.getByRole('status', {name: '選んだ見積書'});
await row('見本二様邸').getByRole('checkbox', {name: '選ぶ'}).check();
await row('見本三様邸').getByRole('checkbox', {name: '選ぶ'}).check();
assert.match(await bar.innerText(), /2件を選んでいます/);
assert.deepEqual(
  (await bar.getByRole('button').allInnerTexts()).map((t) => t.trim()),
  ['◀ 前月に回す', '次月に回す ▶', '削除する', 'やめる'],
);
// 「削除する」も白いボタン（色はつけない）
assert.equal(await bar.getByRole('button', {name: '削除する'}).evaluate((e) => getComputedStyle(e).backgroundColor), 'rgb(255, 255, 255)');
await page.screenshot({path: path.join(outDir, 'trash-02-list-bar-1366.png')});
await bar.getByRole('button', {name: '削除する'}).click();
assert.equal(asked.pop(), '2件をゴミ箱に移しますか？');
await page.locator('[aria-live] > div', {hasText: '2件をゴミ箱に移しました'}).waitFor();
assert.equal(await bar.count(), 0);
assert.deepEqual((await rows.allInnerTexts()).map((t) => /見本./.exec(t)?.[0]), ['見本四']);
assert.equal((await trashTab.innerText()).replace(/\s+/g, ' ').trim(), '🗑 ゴミ箱 3');
// 探す（すべての月）にも出ない
await page.getByRole('textbox', {name: '見積書を探す'}).fill('見本');
assert.equal(await rows.count(), 1);
await page.getByRole('textbox', {name: '見積書を探す'}).fill('');
// 件数（最初の画面の「全部で」）・請求書のタブ（一覧・印刷）にも出ない
await tabBtn('📝 見積もり・申請書を作成する').click();
assert.match(await page.locator('main').innerText(), /全部で 1件/);
await tabBtn('🧾 請求書を確認する').click();
await page.getByRole('cell', {name: '見本四様邸'}).waitFor();
assert.equal(await page.locator('main tbody tr', {hasText: '見本'}).count(), 1);
await page.getByRole('button', {name: '🖨 請求書を印刷'}).click();
const printed = await page.locator('.print-root').innerText();
assert.ok(printed.includes('見本四') && !/見本[一二三]/.test(printed), '請求書の印刷にゴミ箱の様邸が出ている');
await page.getByRole('button', {name: '✕ 閉じる'}).click();
await inv.getByRole('cell', {name: '見本三様邸'}).waitFor({state: 'detached'});
assert.equal(await inv.locator('tbody tr', {hasText: '見本'}).count(), 1);
log('チェックしてまとめてゴミ箱（確かめ・2件）・探す・件数・請求書・印刷・もう1つのアプリに出ないOK');

// ---------------- ゴミ箱のタブ：削除した日の新しい順・お客様名・保険者・作成日・合計
await trashTab.click();
const trashRows = page.locator('main tbody tr');
await page.getByRole('heading', {name: '🗑 ゴミ箱（3件）'}).waitFor();
const heads = (await page.locator('main thead th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
assert.deepEqual(heads, ['削除した日', 'お客様名', '保険者', '作成日', '見積の合計（税込）']);
const cells = await trashRows.evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].slice(1, 6).map((td) => td.innerText.trim().split('\n')[0])));
assert.deepEqual(cells.map((c) => c[1]), ['見本三様邸', '見本二様邸', '見本一様邸']); // 同じ時刻なら作った順の新しい方から
assert.ok(cells.every((c) => /^\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}$/.test(c[0])), JSON.stringify(cells));
assert.deepEqual(cells.map((c) => c[2]), ['行橋市', '苅田町', '行橋市']);
assert.deepEqual(cells.map((c) => c[3]), [3, 2, 1].map((d) => `${now.getFullYear()}/${now.getMonth() + 1}/${d}`));
assert.ok(cells.every((c) => /^\d{1,3}(,\d{3})*$/.test(c[4])), JSON.stringify(cells));
await page.getByRole('checkbox', {name: 'すべて選ぶ'}).check();
assert.match(await page.getByRole('status', {name: '選んだ様邸'}).innerText(), /3件を選んでいます/);
await page.waitForTimeout(300); // タブの色が変わり終わってから撮る
await page.screenshot({path: path.join(outDir, 'trash-03-trash-1366.png')});
await page.getByRole('status', {name: '選んだ様邸'}).getByRole('button', {name: 'やめる'}).click();
log('ゴミ箱のタブ（3件・削除した日の新しい順・列）OK');

// ---------------- 読み直しても残る。ゴミ箱の様邸の写真も残る（どこからも使われない古い写真は消える）
await page.waitForTimeout(1200);
await page.reload();
await page.getByRole('heading', {name: '🗑 ゴミ箱（3件）'}).waitFor();
await page.waitForFunction(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('taiyo-sasaoka-photos');
      req.onsuccess = () => {
        const g = req.result.transaction('photos').objectStore('photos').get('ph-orphan');
        g.onsuccess = () => resolve(!g.result);
      };
    }),
);
assert.deepEqual(await photoIds(page), ['ph-trash-1']);
log('読み直してもゴミ箱に残る・ゴミ箱の様邸の写真も残るOK');

// ---------------- 元に戻す（見本二）→ 見積もりの一覧・請求書に戻る
await page.getByRole('button', {name: '見本二様邸を元に戻す'}).click();
await page.locator('[aria-live] > div', {hasText: '見本二様邸を元に戻しました'}).waitFor();
await page.getByRole('heading', {name: '🗑 ゴミ箱（2件）'}).waitFor();
await inv.getByRole('cell', {name: '見本二様邸'}).waitFor(); // 開いたままの請求書のアプリにも戻る
await tabBtn('📝 見積もり・申請書を作成する').click();
assert.match(await page.locator('main').innerText(), /全部で 2件/);
await trashTab.click();
log('元に戻すOK');

// ---------------- 行の「完全に削除」（確かめ。キャンセルしたら消さない）
answer = false;
await page.getByRole('button', {name: '見本三様邸を完全に削除'}).click();
assert.equal(asked.pop(), '見本三様邸を完全に削除しますか？元に戻せません');
assert.equal(await trashRows.count(), 2);
answer = true;
await page.getByRole('button', {name: '見本三様邸を完全に削除'}).click();
assert.equal(asked.pop(), '見本三様邸を完全に削除しますか？元に戻せません');
await page.getByRole('heading', {name: '🗑 ゴミ箱（1件）'}).waitFor();
// 残り（見本一）はチェックしてまとめて「完全に削除」
await page.getByRole('checkbox', {name: 'すべて選ぶ'}).check();
await page.getByRole('status', {name: '選んだ様邸'}).getByRole('button', {name: '完全に削除'}).click();
assert.equal(asked.pop(), '1件を完全に削除しますか？元に戻せません');
await page.getByText('ゴミ箱は空です').waitFor();
assert.equal((await trashTab.innerText()).trim(), '🗑 ゴミ箱');
// 完全に削除した様邸の写真は、保存できたあとに消える
await page.waitForFunction(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open('taiyo-sasaoka-photos');
      req.onsuccess = () => {
        const g = req.result.transaction('photos').objectStore('photos').get('ph-trash-1');
        g.onsuccess = () => resolve(!g.result);
      };
    }),
);
// Ctrl+Z でも戻らない（完全に削除は戻せない）
await page.locator('body').click({position: {x: 5, y: 600}});
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
await page.getByText('ゴミ箱は空です').waitFor();
log('行の完全に削除・チェックしてまとめて完全に削除（確かめ・キャンセル）・写真も消えるOK');

// ---------------- 読み直しても：ゴミ箱は空・一覧は見本二と見本四
await page.waitForTimeout(1200);
await page.reload();
await page.getByText('ゴミ箱は空です').waitFor();
await tabBtn('📝 見積もり・申請書を作成する').click();
assert.match(await page.locator('main').innerText(), /全部で 2件/);
await page.getByRole('button', {name: '📋 見積書の一覧を開く'}).click();
await row('見本四様邸').waitFor();
assert.deepEqual((await rows.allInnerTexts()).map((t) => /見本./.exec(t)?.[0]).sort(), ['見本二', '見本四']);
log('読み直しても（ゴミ箱は空・一覧は2件）OK');

// ---------------- 見積書の画面の「削除」・請求書の様邸の「削除」もゴミ箱へ
await row('見本四様邸').getByRole('cell', {name: '見本四様邸'}).click();
await page.getByRole('heading', {level: 1, name: '見本四様邸'}).waitFor();
await page.getByRole('button', {name: '削除', exact: true}).click();
assert.equal(asked.pop(), '見本四様邸をゴミ箱に移しますか？');
await row('見本二様邸').waitFor();
assert.equal(await rows.count(), 1);
await tabBtn('🧾 請求書を確認する').click();
await page.getByRole('cell', {name: '見本二様邸'}).click();
await page.getByRole('heading', {level: 1, name: '見本二様邸'}).waitFor();
await page.getByRole('button', {name: '削除', exact: true}).first().click(); // 上の段の様邸の削除（箇所の「削除」より前）
assert.equal(asked.pop(), '見本二様邸をゴミ箱に移しますか？');
await trashTab.click();
await page.getByRole('heading', {name: '🗑 ゴミ箱（2件）'}).waitFor();
log('見積書の画面・請求書の様邸の削除もゴミ箱へOK');

// ---------------- スマホの幅（390px）：タブは3段・横にはみ出さない。一覧の選んだ帯・ゴミ箱
const phone = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, locale: 'ja-JP', hasTouch: true, isMobile: true});
await phone.addInitScript(() => localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'})));
const sp = await newPage(phone, `${site}/jutaku-mitsumori/index.html`, 'スマホ');
await sp.getByRole('heading', {name: '＋ 新規作成'}).waitFor();
await seed(sp);
await sp.reload();
const spNav = sp.getByRole('navigation');
await spNav.getByRole('button', {name: /ゴミ箱/}).waitFor();
const rowsOf = async () => {
  const ys = await spNav.getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
  return [...new Set(ys)].length;
};
assert.equal(await rowsOf(), 3);
for (const name of ['🧾 請求書を確認する', '📦 部材・施工費マスタ', '⚙ 設定', '🗑 ゴミ箱', '📝 見積もり・申請書を作成する']) {
  await spNav.getByRole('button', {name}).click();
  await sp.waitForTimeout(250);
  await noOverflow(sp, `スマホ ${name}`);
}
await sp.screenshot({path: path.join(outDir, 'trash-04-tabs-390.png'), clip: {x: 0, y: 0, width: 390, height: 300}});
await sp.getByRole('button', {name: '📋 見積書の一覧を開く'}).click();
await sp.getByRole('row', {name: /見本二様邸/}).getByRole('checkbox', {name: '選ぶ'}).check();
await sp.getByRole('row', {name: /見本三様邸/}).getByRole('checkbox', {name: '選ぶ'}).check();
await noOverflow(sp, 'スマホ 一覧の選んだ帯');
await sp.screenshot({path: path.join(outDir, 'trash-05-list-bar-390.png')});
await sp.getByRole('status', {name: '選んだ見積書'}).getByRole('button', {name: '削除する'}).click();
await spNav.getByRole('button', {name: /ゴミ箱/}).click();
await sp.getByRole('heading', {name: '🗑 ゴミ箱（2件）'}).waitFor();
await sp.getByRole('checkbox', {name: '見本二様邸を選ぶ'}).check();
await noOverflow(sp, 'スマホ ゴミ箱');
await sp.waitForTimeout(300); // タブの色が変わり終わってから撮る
// 行のボタンは表を横に動かさなくても見える
for (const b of ['見本三様邸を元に戻す', '見本三様邸を完全に削除']) {
  const box = await sp.getByRole('button', {name: b}).boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `${b} が画面の外: ${JSON.stringify(box)}`);
}
await sp.screenshot({path: path.join(outDir, 'trash-06-trash-390.png'), fullPage: true});
log('スマホの幅（タブ3段・はみ出さない・一覧の選んだ帯・ゴミ箱）OK');

assert.deepEqual(errors, []);
await browser.close();
log('ゴミ箱・上のタブ：すべてOK');
