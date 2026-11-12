// 様邸の画面の上の段の「その他 ▼」（2026-11-03 からプルダウン。ユーザーの指示「ここの部分がごちゃごちゃしているので、プルダウンにする」）。
// メールで送付・保存・売上伝票を作成・発注書を作成・複製・カタログを印刷・販売受注簿を作成・削除 は、これを開いてから押す（JobHeader.tsx の MoreMenu）

/** 「その他 ▼」を開いて、その中（menu）を返す（開いていればそのまま） */
export async function openMore(page) {
  const btn = page.getByRole('button', {name: /^その他 [▼▲]$/});
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  const menu = page.getByRole('menu', {name: 'その他'});
  await menu.waitFor();
  return menu;
}

/** 「その他 ▼」を閉じる（開いていれば） */
export async function closeMore(page) {
  const btn = page.getByRole('button', {name: /^その他 [▼▲]$/});
  if ((await btn.count()) && (await btn.getAttribute('aria-expanded')) === 'true') await btn.click();
}

/** 「その他 ▼」の中のボタン・リンクの名前（上から） */
export async function moreItems(page) {
  const menu = await openMore(page);
  const names = (await menu.locator('button, a').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  await closeMore(page);
  return names;
}

/**
 * 見積書の一覧の上の段の「＋ 新規作成 ▼」を開いて、保険者（「苅田町」など）のボタンを押す（2026-11-12 から1つのボタンにまとめた。
 * ユーザーの指示「この部分は集約してよい」。EstimateList.tsx の NewMenu）。見積もりの入口の「新規作成」の欄は今までどおりボタンが並ぶ
 */
export async function newFromList(scope, insurer) {
  const btn = scope.getByRole('button', {name: /^＋ 新規作成 [▼▲]$/});
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await scope.getByRole('menu', {name: '新規作成の保険者'}).getByRole('button', {name: `＋ ${insurer}`, exact: true}).click();
}

/**
 * 画面の上の帯の画面の切り替え（2026-11-03 から、見積もり・申請書を作成する（様邸を開いていないとき）のほかは右の隅の「☰ メニュー ▼」の中。
 * ユーザーの指示「売上見込みを確認する、工務店請求書、部材・施工費マスタ、設定、ゴミ箱は、プルダウンにして右隅におく」）。帯に見えていればそれ、なければメニューを開いて中のもの
 */
export async function navItem(page, name) {
  const nav = page.getByRole('navigation', {name: '画面'});
  const shown = nav.getByRole('button', {name}).filter({visible: true});
  if (await shown.count()) return shown.first();
  const btn = nav.getByRole('button', {name: /^☰ メニュー/});
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  return nav.getByRole('menu', {name: 'メニュー'}).getByRole('button', {name});
}

/**
 * 見積書の欄の locator を、押すときは欄の右の方（右の端から 20px。選んだ欄の「▼」より左）を押すようにしたもの。
 * 空いた行の内容の欄は左に「部材｜施工費｜常用」のボタンがあり（2026-11-03）、欄のまん中を押すとそのボタンを押してしまうため
 * （ユーザーの指示「右の空いたスペースにのせたら、そのセルを選択していることが認識でき…」）
 */
export function cellAt(loc) {
  return new Proxy(loc, {
    get(target, prop) {
      if (prop === 'click')
        return async (opts = {}) => {
          const b = await target.boundingBox();
          // 空いた行の内容の欄（まん中に「部材｜施工費｜常用」）は、左の空いた所（打つ所。2026-11-04 から点滅するカーソルも左の端）
          const pick = await target.evaluate((el) => !!el.querySelector(':scope > .sheet-pick')).catch(() => false);
          return target.click({position: {x: pick ? 6 : Math.max(4, b.width - 20), y: b.height / 2}, ...opts});
        };
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/**
 * 空いた行の内容の欄の「部材｜施工費｜常用」の字を除いた文字（2026-11-03 から、空いた行・いちばん下の新しい行の内容の欄にこのボタンが入る。
 * 行の文字を読むテストで、ボタンの字を内容として数えないように）
 */
// 空いた行の「← 項目から選ぶ か 品番を入力」（薄い案内。2026-11-03〜11-04。今は出さない）があっても外す
export const noPick = (t) => t.replace(/部材\s*施工費\s*常用(\s*← 項目から選ぶ か (ダブルクリックで品番入力|品番を入力))?/g, '');

/**
 * 動きが止まってから押す（force）。「＋ 挿入」のあと、選んだ行が見える所まで動く間に force で押すと、前の位置を押してしまう
 * （force は「止まっているか」を確かめないため）。選んだ欄の上には見えない入力欄が重なっているので force は要る
 */
export async function clickStable(loc) {
  await loc.waitFor();
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const b = await loc.boundingBox();
    if (b && prev && Math.abs(b.x - prev.x) < 0.5 && Math.abs(b.y - prev.y) < 0.5) break;
    prev = b;
    await loc.page().waitForTimeout(50);
  }
  await loc.click({force: true});
}

/**
 * 空いた行の「施工費」を押して、施工費のリストの name（「木」など）を選ぶ。press はその行の「施工費」を押す関数。
 * 「＋ 挿入」のあと、選んだ行が見える所まで動き終わる前に押すと、ほかの所を押してリストが開かないことがある（人は動き終わってから押す）ので、
 * 開かなければもう一度押す
 */
export async function chooseLabor(page, press, name) {
  const list = page.getByRole('listbox', {name: '施工費のリスト'});
  for (let i = 0; i < 3; i++) {
    await press();
    if (await list.waitFor({timeout: 3000}).then(() => true, () => false)) break;
  }
  await list.getByRole('option').filter({hasText: new RegExp(`^${name}\\d`)}).click();
}

/**
 * 「＋ 挿入」は選んでいる行の上に1行入れる（Excel と同じ。ユーザーの指示「挿入の場合、この間に挿入が差し込めるようにする」2026-11-03。前は下）。
 * 前と同じ「tr の行（部材は同上施工費ごと）のすぐ下」に空いた行を入れたいときは、そのすぐ下の行を選んで「＋ 挿入」。
 * すぐ下に行がなければ（いちばん下の行）、いちばん下の空いた行（tr[data-new]。打ち込むと最後の箇所の最後に入る）を選ぶ。
 * tr を省くと、選んでいる行（tr[data-current]）
 */
export async function insertBelow(sheet, tr) {
  const base = tr ?? sheet.locator('.form-page tr[data-current]');
  const next = await base.evaluate((el) => {
    const all = [...el.closest('.est-sheet').querySelectorAll('.form-page tr[data-rows]')];
    let i = all.indexOf(el) + 1;
    while (i < all.length && all[i].innerText.includes('同上施工費')) i++;
    return i < all.length ? i : -1;
  });
  if (next < 0) {
    await cellAt(sheet.locator('tr[data-new] [data-edit="new:text"]')).click();
    return;
  }
  await cellAt(sheet.locator('.form-page tr[data-rows]').nth(next).locator('[data-edit$=":text"]').first()).click();
  await sheet.getByRole('toolbar', {name: '行の操作'}).getByRole('button', {name: '＋ 挿入'}).click();
}

/** 選んでいる空いた行（いちばん下の空いた行を選んでいるときはその行）の「部材｜施工費｜常用」 */
export async function pickAt(sheet, kind) {
  const cur = sheet.locator(`tr[data-current] [data-pick="${kind}"]`);
  await clickStable((await cur.count()) ? cur : sheet.locator(`tr[data-new] [data-pick="${kind}"]`));
}
