// 申請書・見積書作成（住宅改修 jutaku-mitsumori/・sasaoka/ と 特定福祉用具 tokutei/）の全画面を回って、見た目の点検をする。すべて架空の値。
//   はみ出し・切れた文字（ボタン・見出し）・入力欄の値の切れ・短い見出しの折り返し・濃い色の地（ガツンと濃い色）・入力欄の高さと字の大きさの種類
// usage（2026-10-26 の「全体のデバッグ」で作った。ユーザーの指示「文字がはみ出ていたり…色合いの微調整…統一感、入力項目…ボタンの配置の違和感」）：
//   node test/sasaoka/stress-data.mjs /tmp/stress.json
//   node serve.mjs <サイト（jutaku-mitsumori/・sasaoka/・tokutei/・taiyo-hacchu-scan/）> node ui-audit.mjs http://localhost:5190 /tmp/stress.json <出力フォルダ> [pc,ipad,phone]
//   画面ごとに1行（ovf＝横のはみ出し・over＝枠からはみ出す入力欄・cut・clip・wrap・strong）と、出力フォルダに report.json とスクリーンショット。
//   濃い色（strong）は 地の色の彩度 0.5 以上・明るさ 0.18〜0.62。上の帯の濃い緑・紺は出るが残してよい（暗い色）。clip は長い値の入力欄なら出てよい（数字の欄・選ぶ欄は 0 に）
import fs from 'node:fs';
import path from 'node:path';

const {chromium} = await import(process.env.PLAYWRIGHT ?? '/opt/node-tools/node_modules/playwright/index.mjs');
const [site, backup, out, sizesArg = 'pc,ipad,phone'] = process.argv.slice(2);
fs.mkdirSync(out, {recursive: true});
const SIZES = {
  pc: {viewport: {width: 1366, height: 900}},
  ipad: {viewport: {width: 1180, height: 820}, hasTouch: true},
  phone: {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true},
};
const TABLE = [
  ['品番', '商品名', 'メーカー', 'TAISコード', '定価(税抜)', '仕切価格', '税区分'],
  ['536-057', 'シャワーベンチ FSフィット 背もたれ・ひじ掛け付き（折りたたみ・ワイドタイプ）', 'アロン化成', '00170000123', '35,000', '21,000', '課税'],
  ['536-480', '浴槽台 ユクリア', 'アロン化成', '00170000456', '13,800', '8,280', '課税'],
  ['FS4-B', '4点ステッキS', 'イーストアイ', '', '12,000', '7,200', '非課税'],
]
  .map((r) => r.join('\t'))
  .join('\n');

// ---- 画面の中で点検する（ページ・iframe のどちらでも）
const AUDIT = () => {
  const W = document.documentElement.clientWidth;
  const res = {overflowX: document.documentElement.scrollWidth - W, cut: [], inputClip: [], wrap: [], strong: {}, heights: {}};
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.2) return null;
    }
    return r;
  };
  const name = (el) => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.placeholder || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
  const cv = document.createElement('canvas').getContext('2d');
  for (const el of document.querySelectorAll('button, label, th, h1, h2, h3, [role=tab], a')) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && (cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis')) res.cut.push(name(el));
  }
  for (const el of document.querySelectorAll('input, select')) {
    const t = (el.type || '').toLowerCase();
    if (['checkbox', 'radio', 'file', 'hidden', 'range', 'color', 'date', 'time', 'month', 'datetime-local', 'submit', 'button'].includes(t)) continue;
    if (el.closest('.print-overlay, [aria-hidden="true"]')) continue;
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const isSel = el.tagName === 'SELECT';
    const text = isSel ? el.selectedOptions[0]?.text ?? '' : el.value || el.placeholder || '';
    const key = `${el.tagName.toLowerCase()} 高さ${Math.round(el.offsetHeight)} 字${cs.fontSize}`;
    res.heights[key] = (res.heights[key] || 0) + 1;
    if (!text) continue;
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const w = cv.measureText(text).width + (parseFloat(cs.letterSpacing) || 0) * text.length;
    const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (isSel ? 16 : 0);
    if (w > avail + 1) res.inputClip.push(`${name(el)}「${text.slice(0, 24)}」${Math.round(w)}>${Math.round(avail)}${el.value || isSel ? '' : '（薄い字）'}`);
  }
  // 入力欄が入っている枠からはみ出している（隣の欄に重なる）
  res.inputOver = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const t = (el.type || '').toLowerCase();
    if (['checkbox', 'radio', 'file', 'hidden'].includes(t) || el.closest('.print-overlay, .est-sheet, .form-page')) continue;
    const r = vis(el);
    if (!r) continue;
    const p = el.parentElement;
    const pr = p.getBoundingClientRect();
    const pcs = getComputedStyle(p);
    const right = pr.right - parseFloat(pcs.paddingRight) - parseFloat(pcs.borderRightWidth);
    if (pcs.overflowX === 'visible' && r.right > right + 2) res.inputOver.push(`${name(el)} ${Math.round(r.right - right)}px`);
  }
  res.inputOver = [...new Set(res.inputOver)];
  for (const el of document.querySelectorAll('label, dt, th, span, div, p, button, h3, td')) {
    if (el.querySelector('input, select, textarea, button, svg, img, br') || el.children.length > 2) continue;
    const txt = el.textContent.replace(/\s+/g, '').trim();
    if (txt.length < 2 || txt.length > 12) continue;
    const r = vis(el);
    if (!r) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((q) => q.width > 1).map((q) => Math.round(q.top / 3)));
    if (tops.size >= 2) res.wrap.push(txt);
  }
  const c2 = document.createElement('canvas');
  c2.width = c2.height = 1;
  const x2 = c2.getContext('2d', {willReadFrequently: true});
  const rgb = (c) => {
    x2.clearRect(0, 0, 1, 1);
    x2.fillStyle = '#000';
    x2.fillStyle = c;
    x2.fillRect(0, 0, 1, 1);
    return x2.getImageData(0, 0, 1, 1).data;
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
    const r = vis(el);
    if (!r || r.width * r.height < 200) continue;
    const [R, G, B, A] = rgb(bg);
    if (A < 150) continue;
    const mx = Math.max(R, G, B) / 255;
    const mn = Math.min(R, G, B) / 255;
    const L = (mx + mn) / 2;
    const S = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * L - 1));
    if (S >= 0.5 && L >= 0.18 && L <= 0.62) {
      const hex = '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('');
      const k = `${hex} ${el.tagName.toLowerCase()}「${(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)}」`;
      res.strong[k] = (res.strong[k] || 0) + 1;
    }
  }
  res.wrap = [...new Set(res.wrap)];
  res.cut = [...new Set(res.cut)];
  res.inputClip = [...new Set(res.inputClip)];
  return res;
};

const report = [];
const browser = await chromium.launch({env: {...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8'}, ignoreDefaultArgs: ['--hide-scrollbars']});
for (const size of sizesArg.split(',')) {
  const dir = path.join(out, size);
  fs.mkdirSync(dir, {recursive: true});
  const ctx = await browser.newContext({...SIZES[size], locale: 'ja-JP', acceptDownloads: true});
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('taiyo_portal_session', JSON.stringify({office: '行橋営業所'}));
    } catch {}
  });
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('popup', (p) => p.close().catch(() => {}));
  let n = 0;
  const shot = async (label, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 500);
    const file = `${String(++n).padStart(3, '0')}-${label.replace(/[\\/:*?"<>| ]+/g, '_')}.png`;
    let r = await page.evaluate(AUDIT).catch((e) => ({error: String(e)}));
    const frame = page.frames().find((f) => f !== page.mainFrame() && /tokutei\/index\.html/.test(f.url()));
    let fr = null;
    if (frame && opts.frame !== false) fr = await frame.evaluate(AUDIT).catch(() => null);
    await page.screenshot({path: path.join(dir, file), fullPage: opts.full !== false}).catch(() => {});
    report.push({size, label, file, ...r, frame: fr});
    const brief = (x) => (x ? `ovf=${x.overflowX} over=${x.inputOver?.length} cut=${x.cut.length} clip=${x.inputClip.length} wrap=${x.wrap.length} strong=${Object.keys(x.strong).length}` : '');
    console.log(`${size} ${label}: ${brief(r)}${fr ? ' | 枠の中 ' + brief(fr) : ''}`);
  };
  const step = async (label, fn, opts) => {
    try {
      await fn();
      await shot(label, opts);
    } catch (e) {
      console.log(`!! ${size} ${label}: ${String(e).split('\n')[0]}`);
      report.push({size, label, error: String(e).split('\n')[0]});
    }
  };
  const closeDialog = async () => {
    for (const nm of ['閉じる', '✕ 閉じる', 'キャンセル']) {
      const b = page.getByRole('button', {name: nm, exact: true}).last();
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {});
        await page.waitForTimeout(300);
        return;
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  };

  // ================= 住宅改修（jutaku-mitsumori）
  await page.goto(`${site}/jutaku-mitsumori/index.html`);
  await page.waitForTimeout(1500);
  await shot('住宅改修-入口');
  await step('住宅改修-設定', async () => {
    await page.locator('header nav').getByRole('button', {name: /設定/}).click();
  });
  await step('住宅改修-長い値を取り込む', async () => {
    await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles(backup);
    await page.getByRole('button', {name: '今のデータに足す（同じものは上書き）'}).click();
    await page.waitForTimeout(800);
  });
  for (const t of ['🧾 請求書を確認する', '📈 売上見込みを確認する', '📦 部材・施工費マスタ', '🗑 ゴミ箱', '📝 見積もり・申請書を作成する']) {
    await step(`住宅改修-${t.slice(2)}`, async () => {
      await page.locator('header nav').getByRole('button', {name: t}).click();
    });
    if (t === '📦 部材・施工費マスタ') {
      for (const sub of ['施工費', '部材＋施工費', '部材リスト']) {
        await step(`住宅改修-マスタ-${sub}`, async () => {
          await page.getByRole('tablist', {name: '部材・施工費マスタ'}).getByRole('tab', {name: new RegExp(`^${sub}`)}).click();
        });
      }
    }
  }
  const insurers = size === 'pc' ? ['kanda', 'yukuhashi', 'miyako', 'kouiki'] : ['kanda', 'kouiki'];
  for (const ins of insurers) {
    await page.goto(`${site}/jutaku-mitsumori/index.html#tab=estimate&job=stress-${ins}`);
    await page.reload();
    await page.waitForTimeout(1500);
    for (const tab of ['📋 工事見積書', '📝 住宅改修申請書', '📄 理由書', '🛁 特定福祉用具申請書', '🏷 販売見積書']) {
      await step(`住宅改修-${ins}-${tab.slice(2)}`, async () => {
        await page.getByRole('tab', {name: tab, exact: true}).click();
        if (tab.startsWith('🛁') || tab.startsWith('🏷')) {
          await page.waitForFunction(() => {
            const f = document.querySelector('iframe[data-tokutei]');
            const b = f?.contentDocument?.body;
            return !!b && !b.innerText.includes('読み込んでいます') && b.innerText.length > 50;
          }, null, {timeout: 20000});
          await page.waitForTimeout(800);
        }
      });
      if (tab === '📋 工事見積書' && ins === insurers[0]) {
        for (const tool of ['📋 部材リストから入れる', '🔧 施工費から入れる', '＋ 部材＋施工費（常用）から入れる']) {
          await step(`住宅改修-${ins}-${tool.slice(2)}`, async () => {
            await page.getByRole('region', {name: '見積書', exact: true}).getByRole('button', {name: tool}).click();
          });
          await closeDialog();
        }
        await step(`住宅改修-${ins}-見積書の印刷`, async () => {
          await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
          await page.locator('.print-overlay').waitFor();
        });
        await closeDialog();
        await step(`住宅改修-${ins}-発注書`, async () => {
          await page.getByRole('button', {name: '🛒 発注書を作成'}).first().click();
          await page.waitForTimeout(800);
        });
        await closeDialog();
        await page.goto(`${site}/jutaku-mitsumori/index.html#tab=estimate&job=stress-${ins}`);
        await page.reload();
        await page.waitForTimeout(1200);
      }
    }
  }
  await page.goto(`${site}/sasaoka/index.html`);
  await page.waitForTimeout(1500);
  await shot('請求書-入口');

  // ================= 特定福祉用具（tokutei 単独）
  await page.goto(`${site}/tokutei/index.html`);
  await page.waitForFunction(() => !document.body.innerText.includes('読み込んでいます'), null, {timeout: 15000}).catch(() => {});
  await shot('特定-入口');
  await step('特定-商品マスタ', async () => {
    await page.getByRole('button', {name: '📦 商品マスタ', exact: true}).click();
  });
  await step('特定-取り込み', async () => {
    await page.getByRole('button', {name: '📄 仕切り一覧表を取り込む'}).click();
  });
  await step('特定-取り込みの確認', async () => {
    await page.getByLabel('貼り付けた表').fill(TABLE);
    await page.getByRole('button', {name: '貼り付けた表を読み取る'}).click();
    await page.waitForTimeout(600);
  });
  await step('特定-取り込んだ', async () => {
    await page.getByRole('button', {name: /^商品マスタに取り込む/}).click();
    await page.waitForTimeout(600);
  });
  await step('特定-設定', async () => {
    await page.getByRole('button', {name: '⚙ 設定', exact: true}).click();
  });
  const tkIns = size === 'pc' ? ['行橋市', '苅田町', 'みやこ町', '広域連合', 'そのほか'] : ['行橋市', '広域連合'];
  for (const ins of tkIns) {
    await page.getByRole('button', {name: '📝 見積もり・申請', exact: true}).click();
    await page.waitForTimeout(400);
    if (!(await page.getByRole('button', {name: `＋ ${ins}`}).isVisible().catch(() => false))) {
      await page.getByRole('button', {name: '📝 見積もり・申請', exact: true}).click();
      await page.waitForTimeout(400);
    }
    await step(`特定-${ins}-見積もり`, async () => {
      await page.getByRole('button', {name: `＋ ${ins}`, exact: true}).click();
      await page.waitForTimeout(600);
      await page.getByRole('textbox', {name: 'お客様名', exact: true}).fill('見本長谷川原\u3000美千代子').catch(() => {});
      await page.getByLabel('商品名').first().fill('シャワーチェア 見本の折りたたみ式 背もたれ・ひじ掛け付き（ワイド）');
      await page.getByLabel('定価').first().fill('135000');
      await page.getByLabel('品番').first().fill('MIHON-12345-WIDE').catch(() => {});
      const add = page.getByRole('button', {name: /^＋ \d+つ目の(福祉用具|商品)を追加$/});
      await add.click();
      await page.getByLabel('商品名').last().fill('見本の浴槽台');
      await page.getByLabel('定価').last().fill('9800');
      await page.getByLabel('備考に足す文').fill('見本：お届けは平日の午前中を希望されています（玄関前に段差あり）。').catch(() => {});
    });
    await step(`特定-${ins}-商品を選ぶ`, async () => {
      await page.getByRole('button', {name: '★ 商品を選ぶ'}).first().click();
    });
    await closeDialog();
    await step(`特定-${ins}-前のお客様から入れる`, async () => {
      await page.getByRole('button', {name: /前のお客様から入れる/}).first().click();
    });
    await closeDialog();
    await step(`特定-${ins}-見積書の印刷`, async () => {
      await page.getByRole('button', {name: '🖨 見積書を印刷'}).first().click();
      await page.locator('.print-overlay').waitFor();
    });
    await closeDialog();
    await step(`特定-${ins}-カタログの印刷`, async () => {
      await page.getByRole('button', {name: '📖 カタログを印刷'}).first().click();
      await page.waitForFunction(() => document.querySelectorAll('.cat-sheet img').length === 5, null, {timeout: 60000});
    }, {full: false});
    await closeDialog();
    const shinseiTab = page.getByRole('tab', {name: /^📄 申請書/});
    if (await shinseiTab.isVisible().catch(() => false)) {
      await step(`特定-${ins}-申請書`, async () => {
        await shinseiTab.click();
        await page.waitForTimeout(800);
        await page.getByPlaceholder('居宅介護支援事業所').first().fill('見本長谷川原居宅介護支援事業所（行橋サテライト）').catch(() => {});
      });
      await step(`特定-${ins}-申請書の印刷`, async () => {
        await page.getByRole('button', {name: '🖨 印刷', exact: true}).click();
        await page.locator('.print-overlay').waitFor();
      }, {full: false});
      await closeDialog();
    }
    if (ins === tkIns[0]) {
      await step(`特定-${ins}-スクショから自動認識`, async () => {
        await page.getByRole('tab', {name: '📋 見積もり'}).click().catch(() => {});
        await page.getByRole('button', {name: /スクショから自動認識/}).first().click();
        await page.waitForTimeout(1500);
      }, {frame: false});
      await closeDialog();
    }
  }
  await step('特定-一覧', async () => {
    await page.getByRole('button', {name: '📝 見積もり・申請', exact: true}).click();
    await page.waitForTimeout(400);
    if (!(await page.getByRole('button', {name: '＋ 行橋市'}).isVisible().catch(() => false))) await page.getByRole('button', {name: '📝 見積もり・申請', exact: true}).click();
  });
  report.push({size, label: 'エラー', errors: errs});
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log('done', report.length);
