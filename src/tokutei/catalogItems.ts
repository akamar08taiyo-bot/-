// 介援隊のカタログのページ（PDF）の文字と位置から、商品の一覧（商品名・品番・色や大きさ・TAIS・定価）を作る。
// ユーザーの指示「項目名とメーカー名を入力・選択した際に、例えば、シャワーチェアで、パナソニックを選んだ場合に、お渡ししたカタログの中の、
// パナソニックのシャワーチェアの一覧を表示する…カタログに載っている商品、すべて取り込んでもらいたい」2026-10-30。
// 金額の表はリポジトリに持たず、開いたときに PDF（public-tokutei/catalog/）から読む（ロジックだけ。ページを足せば、そのページの商品も出る）。
//
// カタログの1つの商品の囲み（ページの読み取りで確かめた形）：
//   見出し：番号（9.2pt）＋商品名（9.2pt。2行まで）。囲みは見出しから、となりの見出しの左まで・次の段の見出しまで
//   介援隊の注文番号（261-S1063 など。9.2pt）
//   品番の行（6.7pt。536-440・PN-L41431D・04740 など）と、その右の色・大きさ（5.8pt。2行の大きさは2つの行にまたがる）。
//   1つの囲みに品番の表が左右に2つあることもある（安寿 軽量浴槽台の「すべり止めシートタイプ」「ソフトクッションタイプ」）
//   金額（11.3pt）と、そのそばの（税抜¥27,000）（5.3pt）。1つの金額が、たてに並んだ品番の行のまとまりのまん中に置かれる
//   TAIS コード（TAIS/00532-000037。5.3pt）、仕様の行（●…。5.7pt）の右の端にメーカー名（アロン化成（株）など）
import type {CatalogPage} from './catalog.ts';
import {CATEGORIES, guessCategory} from './category.ts';
import {makerKey} from './sales.ts';
import type {SaleItem} from './types.ts';

/** PDF の文字1つ（pdf.js の1かたまり）。x・y はページの左上からの pt（y は文字の下の線）、w は幅、h は文字の大きさ */
export type PdfText = {s: string; x: number; y: number; w: number; h: number};

/** 1つの品番（色・大きさちがい） */
export type CatalogVariant = {
  code: string;
  label: string;
  tais: string;
  listPrice: number;
  orderCode: string;
};
/** カタログの1つの商品（囲み） */
export type CatalogProduct = {
  key: string; // ページと見出しの位置。画面で選ぶときの目印
  page: number;
  name: string; // 見出しの商品名
  maker: string; // メーカー名（このアプリの書き方。パナソニックエイジフリー（株）・アロン化成（株）など）。分からなければ空
  category: string;
  sub: string;
  variants: CatalogVariant[]; // 品番ごと。定価は税抜（カタログの（税抜¥…））。読めなければ 0
};

const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
// 見出しは 9.2pt（安寿 軽量浴槽台の 7・8 は 8.5pt）。説明の 8.5pt の文は、番号のすぐ右にないので見出しにならない
const isTitle = (t: PdfText) => between(t.h, 8.3, 9.8);
const isPrice = (t: PdfText) => between(t.h, 10.4, 12.2) && /^[\d,]{3,}$/.test(t.s);
const isRowSize = (t: PdfText) => between(t.h, 6.3, 7.1);
const isLabelSize = (t: PdfText) => between(t.h, 5.5, 6.25);
const isSmall = (t: PdfText) => between(t.h, 4.8, 5.45);
const NUM = /^(\d{1,2}|・)$/;
const ORDER = /^\d{3}-[A-Z]\d{4}$/;
/** 品番：英数字とハイフン（数字を1つ以上） */
const CODE = /^(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{2,}$/;
const TAIS = /TAIS\s*\/?\s*(\d{5}-\d{6})/;
/** 色・大きさの欄に出る記号（値上がりの矢印・区切り） */
const MARK = /^[、,，↑↓★☆※・]+$/;
/** メーカー名の所に並ぶ、メーカーでない言葉 */
const NOT_MAKER = /送料|適用|対象|商品|在庫|価格|受注|生産|取寄|期間|限定|ページ/;
const yenOf = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

/** 同じ行（y が近い）で、すき間の小さい文字をつなぐ（pdf.js は「コンパク」「トSPワンタッチ」のように分ける） */
function lineText(tokens: PdfText[]): string {
  const sorted = [...tokens].sort((a, b) => a.x - b.x);
  let out = '';
  let end = -Infinity;
  for (const t of sorted) {
    if (out && t.x - end > Math.max(2.5, t.h * 0.3)) out += ' ';
    out += t.s;
    end = Math.max(end, t.x + t.w);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** y の近い文字を行にまとめる（上から） */
function linesOf(tokens: PdfText[], tol = 1.6): PdfText[][] {
  const sorted = [...tokens].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfText[][] = [];
  for (const t of sorted) {
    const last = lines.at(-1);
    if (last && Math.abs(last[0].y - t.y) <= tol) last.push(t);
    else lines.push([t]);
  }
  return lines;
}

/** 左の位置が近いもの（tol pt まで）を列にまとめる（左から） */
function columnsOf<T extends {x: number}>(list: T[], tol: number): T[][] {
  const cols: {x: number; items: T[]}[] = [];
  for (const t of [...list].sort((a, b) => a.x - b.x)) {
    const c = cols.find((col) => Math.abs(col.x - t.x) <= tol);
    if (c) c.items.push(t);
    else cols.push({x: t.x, items: [t]});
  }
  return cols.map((c) => c.items);
}

/** カタログのメーカー名を、このアプリの書き方に（はじめの2つ＝sales.ts の DEFAULT_MAKERS と同じ） */
export function appMaker(maker: string): string {
  const m = maker.normalize('NFKC').replace(/\s+/g, '');
  if (/パナソニック|panasonic/i.test(m)) return 'パナソニックエイジフリー（株）';
  if (/アロン化成|安寿/.test(m)) return 'アロン化成（株）';
  return m.replace(/\((株|有)\)/g, '（$1）');
}

type Header = {x: number; y: number; end: number; title: PdfText};
type Block = {head: Header; tokens: PdfText[]};
type Price = {x: number; y: number; value: number};

/** ページの文字 → 商品の一覧（見出しの順） */
export function parseCatalogPage(raw: PdfText[], page: Pick<CatalogPage, 'page' | 'subs'>): CatalogProduct[] {
  const items = raw.map((t) => ({...t, s: t.s.normalize('NFKC').trim()})).filter((t) => t.s);

  // 見出し：番号のすぐ右の商品名
  const nums = items.filter((t) => isTitle(t) && NUM.test(t.s));
  const heads: Header[] = [];
  for (const t of items) {
    if (!isTitle(t) || NUM.test(t.s) || ORDER.test(t.s)) continue;
    const same = nums.filter((n) => Math.abs(n.y - t.y) <= 1.6 && n.x < t.x);
    if (!same.some((n) => t.x - (n.x + n.w) <= 14)) continue;
    const x = Math.min(...same.filter((n) => t.x - n.x <= 40).map((n) => n.x));
    if (heads.some((h) => Math.abs(h.y - t.y) <= 1.6 && Math.abs(h.x - x) < 4)) continue;
    heads.push({
      x,
      y: Math.min(t.y, ...same.map((n) => n.y)),
      end: Infinity,
      title: t,
    });
  }
  if (!heads.length) return [];
  // 右の端：同じ段（上下 40pt まで。帯の見出しで段の高さが少しずれる）の、右のとなりの見出しの左
  for (const h of heads) {
    const right = heads.filter((o) => o !== h && Math.abs(o.y - h.y) <= 40 && o.x > h.x + 20).map((o) => o.x);
    h.end = right.length ? Math.min(...right) - 2 : Infinity;
  }
  // 文字の入る囲み：左が見出しの左（品番は少し左に出る。8pt まで）・右の端（となりの見出しの左）の 6pt より左で、いちばん下の見出し
  const ownerOf = (t: PdfText): Header | null => {
    let best: Header | null = null;
    for (const h of heads) {
      if (h.x > t.x + 8 || t.x >= h.end - 6 || h.y > t.y + 2) continue;
      if (!best || h.y > best.y + 1 || (Math.abs(h.y - best.y) <= 1 && h.x > best.x)) best = h;
    }
    return best;
  };
  const blocks = new Map<Header, Block>(heads.map((h) => [h, {head: h, tokens: []}]));
  for (const t of items) {
    const h = ownerOf(t);
    if (h) blocks.get(h)!.tokens.push(t);
  }

  // 写真のまわりの品番と色（「PN-L41431D」の下に「オレンジ」）：品番の行の右に色がないときに使う
  const photoColor = (code: string): string => {
    for (const t of items) {
      if (!isSmall(t) || t.s !== code) continue;
      const below = items.find((o) => o !== t && isSmall(o) && between(o.y - t.y, 3.5, 10) && Math.abs(o.x - t.x) <= 10 && !/\d/.test(o.s));
      // 「レッ」「ド」のように分かれた字も、同じ行のつづきをつなぐ
      if (!below) continue;
      // すき間なく続く字だけ（となりの写真の色はとらない）
      const word = [below];
      for (const o of items.filter((x) => isSmall(x) && Math.abs(x.y - below.y) <= 1 && x.x > below.x).sort((a, c) => a.x - c.x)) {
        const prev = word.at(-1)!;
        if (o.x - (prev.x + prev.w) > 1.5 || /\d/.test(o.s)) break;
        word.push(o);
      }
      return lineText(word);
    }
    return '';
  };

  const out: {at: Header; p: CatalogProduct}[] = [];
  for (const b of blocks.values()) {
    const name = titleOf(b.head, items);
    if (!name) continue;
    const variants = blockVariants(b, photoColor);
    const orders = b.tokens.filter((t) => isTitle(t) && ORDER.test(t.s));
    if (!variants.length && !orders.length) continue;
    const rowCodes = variants.map((v) => v.code);
    const maker = appMaker(makerOf(b) || (/^安寿/.test(name) ? 'アロン化成' : rowCodes.some((c) => /^PN-/.test(c)) ? 'パナソニック' : ''));
    const g = guessCategory(name);
    const fallback = !g.category && page.subs?.length === 1 ? CATEGORIES.find((c) => c.subs.includes(page.subs![0])) : undefined;
    out.push({
      at: b.head,
      p: {
        key: `${page.page}:${Math.round(b.head.x)}:${Math.round(b.head.y)}`,
        page: page.page,
        name,
        maker,
        category: g.category || fallback?.name || '',
        sub: g.category ? g.sub : fallback ? page.subs![0] : '',
        variants: variants.length
          ? variants
          : orders.map((o) => ({
              code: o.s,
              label: '',
              tais: '',
              listPrice: 0,
              orderCode: o.s,
            })),
      },
    });
  }
  return out.sort((a, c) => a.at.y - c.at.y || a.at.x - c.at.x).map((x) => x.p);
}

/** 見出しの商品名：番号の右から、同じ囲みの中で続く行（3行まで。行の間は 12pt まで） */
function titleOf(h: Header, items: PdfText[]): string {
  const tokens = items.filter((t) => isTitle(t) && Math.abs(t.h - h.title.h) <= 0.8 && !NUM.test(t.s) && !ORDER.test(t.s) && t.x >= h.title.x - 3 && t.x < h.end && between(t.y - h.title.y, -1.6, 30));
  const picked: PdfText[][] = [];
  for (const l of linesOf(tokens)) {
    const prev = picked.at(-1);
    // 2行目からは、商品名の左にそろった行だけ（となりの説明の囲みの字をとらない）
    if (prev && (l[0].y - prev[0].y > 12 || Math.min(...l.map((t) => t.x)) - h.title.x > 12)) break;
    picked.push(l);
    if (picked.length === 3) break;
  }
  return picked.map(lineText).join(' ').replace(/\s+/g, ' ').trim();
}

/** 囲みの中の品番（品番の表ごと。表は品番の左の位置で分ける） */
function blockVariants(b: Block, photoColor: (code: string) => string): CatalogVariant[] {
  const rows: PdfText[] = [];
  for (const t of b.tokens) {
    if (!isRowSize(t)) continue;
    // 「536-050、536-051、536-052」のように1つにまとまっている品番も分ける
    const codes = t.s.split(/[、,，\s]+/).filter((c) => CODE.test(c));
    codes.forEach((c, i) =>
      rows.push({
        ...t,
        s: c,
        x: t.x + (t.w / codes.length) * i,
        w: t.w / codes.length,
      }),
    );
  }
  const prices: Price[] = [];
  const taxOut = b.tokens.filter((t) => isSmall(t) && /税抜/.test(t.s));
  const used = new Set<PdfText>();
  // 金額：左のすぐそばに「￥」「各￥」がある大きな数（ページ番号などの大きな数をとらない）
  const yen = b.tokens.filter((t) => /[¥￥]$/.test(t.s));
  const amounts = b.tokens.filter((t) => isPrice(t) && yen.some((y) => between(t.x - y.x, 0, 24) && Math.abs(y.y - t.y) <= 4));
  for (const p of amounts.sort((a, c) => a.y - c.y)) {
    // そばの（税抜¥…）。税込の金額＝税抜×1.1 のものを先に（税抜の字は金額の下のことも、右上のこともある）。なければ書いてある金額（税のかからない品）
    const value = yenOf(p.s);
    const cand = taxOut.filter((t) => !used.has(t) && between(t.x - p.x, -20, 80) && between(t.y - p.y, -6, 12));
    const dist = (t: PdfText) => Math.abs(t.y - p.y) + Math.abs(t.x - p.x) * 0.1;
    const fit = cand.filter((t) => Math.abs(yenOf(t.s.replace(/^.*税抜/, '')) * 1.1 - value) <= Math.max(2, value * 0.002));
    const near = (fit.length ? fit : cand).sort((x, y) => dist(x) - dist(y))[0];
    if (near) used.add(near);
    prices.push({x: p.x, y: p.y, value: near ? yenOf(near.s.replace(/^.*税抜/, '')) : value});
  }
  const orders = b.tokens.filter((t) => isTitle(t) && ORDER.test(t.s));
  const tais = b.tokens.filter((t) => isSmall(t) && TAIS.test(t.s));
  const nearestY = <T extends {y: number}>(list: T[], y: number, max = Infinity) =>
    list
      .map((t) => ({t, d: Math.abs(t.y - y)}))
      .filter((x) => x.d <= max)
      .sort((a, c) => a.d - c.d)[0]?.t;

  // 表：品番の左の位置が近い（12pt まで）行。表の右の端は、右のとなりの表の左。
  // 左の位置が 60pt より近い列は同じ表（「536-040、536-041、」のように1行に並べた品番。金額は右に1つ）
  const tables: {x: number; rows: PdfText[]}[] = [];
  let prevX = -Infinity;
  for (const list of columnsOf(rows, 12)) {
    const x = Math.min(...list.map((r) => r.x));
    const last = tables.at(-1);
    if (last && x - prevX < 60) last.rows.push(...list);
    else tables.push({x, rows: list});
    prevX = x;
  }
  for (const tb of tables) tb.rows.sort((a, c) => a.y - c.y || a.x - c.x);
  if (!tables.length)
    return prices.map((p) => ({
      code: nearestY(orders, p.y)?.s ?? '',
      label: '',
      tais: '',
      listPrice: p.value,
      orderCode: nearestY(orders, p.y)?.s ?? '',
    }));
  const out: CatalogVariant[] = [];
  tables.forEach((tb, i) => {
    const left = i === 0 ? -Infinity : tb.x - 6;
    const right = tables[i + 1] ? tables[i + 1].x - 6 : Infinity;
    const top = tb.rows[0].y - 10;
    const bottom = tb.rows.at(-1)!.y + 10;
    const inTable = (t: {x: number; y: number}) => t.x >= left && t.x < right && between(t.y, top - 30, bottom + 30);
    // 表の中に金額がなければ、同じ高さの金額（左右2つの表に、右に1つの金額＝入浴グリップ ユニットバス専用）
    const myPrices = prices.some(inTable) ? prices.filter(inTable) : prices.filter((p) => between(p.y, top - 30, bottom + 30));
    const myOrders = orders.filter(inTable);
    const labels = splitInline(tb.rows, rowLabels(b, tb.rows, right, caption(b, tb)));
    const priceOf = assignPrices(tb.rows, myPrices);
    tb.rows.forEach((r, k) => {
      const order = nearestY(myOrders.length ? myOrders : orders, r.y)?.s ?? '';
      const t = nearestY(tais, r.y, 8);
      out.push({
        code: r.s,
        label: withColor(labels[k], photoColor(r.s)),
        tais: t ? TAIS.exec(t.s)![1] : '',
        listPrice: priceOf[k],
        orderCode: order,
      });
    });
  });
  return out;
}

/**
 * 1行に並べた品番（「535-242 レッド、535-243 ブルー、535-244 グリーン 小」）：同じ行の品番が同じ字を持ち、「、」で品番の数に分かれるなら、
 * 品番ごとに自分の色（前の字・うしろの「小」は共通）
 */
function splitInline(rows: PdfText[], labels: string[]): string[] {
  return rows.map((r, k) => {
    const same = rows.map((o, j) => ({o, j})).filter(({o}) => Math.abs(o.y - r.y) <= 1.6).sort((a, c) => a.o.x - c.o.x);
    const parts = labels[k].split(/、\s*/);
    if (same.length < 2 || parts.length !== same.length || same.some(({j}) => labels[j] !== labels[k])) return labels[k];
    const i = same.findIndex(({j}) => j === k);
    const first = parts[0].trim().split(/\s+/);
    const last = parts.at(-1)!.trim().split(/\s+/);
    const own = i === 0 ? first.at(-1)! : i === parts.length - 1 ? last[0] : parts[i].trim();
    return [...first.slice(0, -1), own, ...last.slice(1)].filter(Boolean).join(' ');
  });
}

/** 色・大きさに、写真のまわりの色を足す（同じ字がなければ）。「12~15cm」は「12～15cm」に */
const COLOR = /レッド|ブルー|グリーン|オレンジ|ブラウン|グレー|ホワイト|ピンク|ベージュ|アイボリー|ブラック|イエロー|ネイビー|パープル|ワイン/;
const withColor = (label: string, color: string) => cleanLabel([label, color && !COLOR.test(label) ? color : ''].filter(Boolean).join(' '));

/**
 * 色・大きさの字を見やすく：1字だけの切れはし（「シー」「ト」の「ト」）を外し、「U 型シート」は「U型シート」、同じ言葉は1つ、「12~15cm」は「12～15cm」
 */
function cleanLabel(label: string): string {
  const out: string[] = [];
  for (const w of label.replace(/~/g, '～').split(/\s+/)) {
    if (!w || /^[ァ-ヶー]$/.test(w)) continue;
    const prev = out.at(-1);
    if (prev && /^[A-Z]$/.test(prev) && w.startsWith('型')) out[out.length - 1] = prev + w;
    else out.push(w);
  }
  return out.filter((w, i) => out.findIndex((x) => x.replace(/、$/, '') === w.replace(/、$/, '')) === i).join(' ');
}

/** 表の左の見出し（「5 すべり止め シートタイプ」）：表の左 60pt までの、表の高さの中の 5.8pt の字 */
function caption(b: Block, tb: {x: number; rows: PdfText[]}): string {
  const top = tb.rows[0].y - 6;
  const bottom = tb.rows.at(-1)!.y + 6;
  const words = b.tokens.filter((t) => isLabelSize(t) && between(t.y, top, bottom) && between(tb.x - t.x, 4, 60) && !/[●¥￥\d]/.test(t.s) && !MARK.test(t.s));
  // 表の左にある字が1つのかたまり（たての3行まで）のときだけ（写真のまわりの字はとらない）
  const lines = linesOf(words);
  return lines.length && lines.length <= 3 && words.length <= 6 ? lines.map(lineText).join('') : '';
}

/**
 * 品番の行の右の色・大きさ。列ごとに、たてに続く字（2行の「12～」「15cm」）を1つにまとめ、行にいちばん近いものを付ける
 */
function rowLabels(b: Block, rows: PdfText[], right: number, head: string): string[] {
  const top = rows[0].y - 8;
  const bottom = rows.at(-1)!.y + 8;
  const left = Math.min(...rows.map((r) => r.x));
  // 金額・TAIS より左
  const stop = Math.min(right, ...b.tokens.filter((t) => (isPrice(t) || /[¥￥]|TAIS|税抜/.test(t.s)) && between(t.y, top, bottom) && t.x > left && t.x < right).map((t) => t.x));
  // 行の間（いちばん狭い所）。2行の大きさはこれより狭い間でつながる
  const ys = [...new Set(rows.map((r) => Math.round(r.y * 2) / 2))].sort((a, c) => a - c);
  const gap = ys.length > 1 ? Math.min(...ys.slice(1).map((y, i) => y - ys[i])) : 10;
  const lines = linesOf(b.tokens.filter((t) => isLabelSize(t) && between(t.y, top, bottom) && t.x > left && t.x < stop - 1 && !/[●¥￥]|TAIS|税抜/.test(t.s) && !MARK.test(t.s)));
  // 同じ行の中で、すき間の大きい所で分ける（大きさの列・色の列）
  const gapGroups = (line: PdfText[]) => {
    const groups: PdfText[][] = [];
    for (const t of [...line].sort((a, c) => a.x - c.x)) {
      const g = groups.at(-1);
      if (g && t.x - Math.max(...g.map((x) => x.x + x.w)) <= 3) g.push(t);
      else groups.push([t]);
    }
    return groups;
  };
  // 列の始まり：どこかの行で、すき間のあとの始まりになっている位置。すき間なしにつづいても、そこで分ける
  //（「ジャスト12-20」のすぐ右の「ブルー」。「レッ」「ド」の「ド」はいつも続きなので分けない）
  const starts = lines.flatMap((l) => gapGroups(l).map((g) => g[0].x));
  const isStart = (x: number) => starts.some((s) => Math.abs(s - x) <= 1.5);
  const words = lines.flatMap((line) =>
    gapGroups(line)
      .flatMap((g) => {
        const parts: PdfText[][] = [];
        for (const t of g) {
          const last = parts.at(-1);
          // 列の始まりでも、字のとちゅう（「ソフ」「ト便座」のようにすき間なくカナ・漢字が続く）なら分けない
          const prev = last?.at(-1);
          const midWord = !!prev && t.x - (prev.x + prev.w) < 1 && /[ぁ-んァ-ヶー一-龠]$/.test(prev.s) && /^[ぁ-んァ-ヶー一-龠]/.test(t.s);
          if (last && (!isStart(t.x) || midWord)) last.push(t);
          else parts.push([t]);
        }
        return parts;
      })
      .map((g) => ({x: g[0].x, y: g[0].y, s: lineText(g)})),
  );
  const columns = columnsOf(words, 5).map((col) => {
    const cells: {y0: number; y1: number; s: string}[] = [];
    for (const w of col.sort((a, c) => a.y - c.y)) {
      const last = cells.at(-1);
      // 「UST-」の次の行の「130R」のように、ハイフンで終わる字は次の行とつなぐ
      const limit = /[～~-]$/.test(last?.s ?? '') ? Math.max(gap, 8) : Math.min(6.5, gap * 0.75);
      if (last && w.y - last.y1 > 0 && w.y - last.y1 <= limit) {
        last.s += /[～~-]$/.test(last.s) ? w.s : ` ${w.s}`;
        last.y1 = w.y;
      } else cells.push({y0: w.y, y1: w.y, s: w.s});
    }
    return cells;
  });
  // 行ごとに、列のいちばん近い字。1つの字に「レッド、ブルー、グリーン」のように行の数だけ並んでいれば、上（左）から順に1つずつ
  const picks = columns.map((cells) =>
    rows.map(
      (r) =>
        cells
          .map((c, i) => ({i, d: Math.abs((c.y0 + c.y1) / 2 - r.y)}))
          .filter((x) => x.d <= Math.max(5, gap * 1.2))
          .sort((a, c) => a.d - c.d)[0]?.i ?? -1,
    ),
  );
  return rows.map((r, k) => {
    const parts = columns.map((cells, ci) => {
      const i = picks[ci][k];
      if (i < 0) return '';
      const text = cells[i].s;
      const each = text.split(/、\s*/).filter(Boolean);
      const same = rows.filter((_, j) => picks[ci][j] === i);
      return same.length > 1 && each.length === same.length ? each[same.indexOf(r)] : text;
    });
    return [head, ...parts].filter(Boolean).join(' ');
  });
}

/**
 * 金額を品番の行に割り当てる：金額は、たてに続く行のまとまりのまん中に置かれる（「各¥29,700」は 10cm の2行、「各¥30,800」はその下の6行）。
 * 行を上から順にまとまりに分け、まとまりのまん中と金額の位置のずれがいちばん小さくなる分け方にする。金額のほうが多ければ、行にいちばん近い金額
 */
function assignPrices(rows: PdfText[], prices: Price[]): number[] {
  if (!prices.length) return rows.map(() => 0);
  // 同じ高さの行（「、」で分けた品番）は1つの行として数える
  const lines: number[] = [];
  for (const r of rows) if (!lines.length || Math.abs(lines.at(-1)! - r.y) > 1.6) lines.push(r.y);
  const sorted = [...prices].sort((a, c) => a.y - c.y);
  const n = lines.length;
  const k = sorted.length;
  const lineOf = (y: number) =>
    Math.max(
      0,
      lines.findIndex((l) => Math.abs(l - y) <= 1.6),
    );
  if (k >= n) return rows.map((r) => [...sorted].sort((a, c) => Math.abs(a.y - r.y) - Math.abs(c.y - r.y))[0].value);
  // cost[j][i]：はじめの i 行を j 個のまとまりに分けたときのずれの合計
  const cost = Array.from({length: k + 1}, () => Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({length: k + 1}, () => Array<number>(n + 1).fill(0));
  cost[0][0] = 0;
  for (let j = 1; j <= k; j++)
    for (let i = j; i <= n; i++)
      for (let s = j - 1; s < i; s++) {
        const c = cost[j - 1][s] + Math.abs((lines[s] + lines[i - 1]) / 2 - sorted[j - 1].y);
        if (c < cost[j][i]) {
          cost[j][i] = c;
          cut[j][i] = s;
        }
      }
  const groupOf = Array<number>(n).fill(0);
  for (let j = k, i = n; j > 0; j--) {
    const s = cut[j][i];
    for (let x = s; x < i; x++) groupOf[x] = j - 1;
    i = s;
  }
  return rows.map((r) => sorted[groupOf[lineOf(r.y)]].value);
}

/** メーカー名らしい字：カタカナ・漢字（ひらがなの文・仕様の●・送料などの言葉でない） */
const isMakerName = (s: string) => !!s && s.length <= 30 && /[ァ-ヶー一-龠]/.test(s) && !/[ぁ-ん●:：／/]/.test(s) && !NOT_MAKER.test(s);

/** 仕様の行（●…）の右の端の、すき間のあとのメーカー名（「アロン化成（株）」「（株）ダンロップホームプロダクツ」）。下の行から見る */
function makerOf(b: Block): string {
  const spec = linesOf(b.tokens.filter((t) => between(t.h, 5.5, 6)));
  const first = spec.findIndex((l) => l.some((t) => t.s.startsWith('●')));
  if (first < 0) return '';
  for (const line of spec.slice(first).reverse()) {
    // 行を、すき間（6pt より広い所）で分けたかたまり。右のかたまりから、メーカー名らしいもの
    const groups: PdfText[][] = [];
    for (const t of [...line].sort((a, c) => a.x - c.x)) {
      const g = groups.at(-1);
      if (g && t.x - Math.max(...g.map((x) => x.x + x.w)) <= 6) g.push(t);
      else groups.push([t]);
    }
    for (const g of groups.reverse()) {
      const text = lineText(g);
      // 「（D） ※は各々 パナソニック」のような所は、いちばん右の言葉（「（株）」だけならその前とつなぐ）
      const words = text.split(/\s+/).filter((w) => w && !/^[（(][A-Z][）)]$|^※/.test(w));
      const last = words.at(-1) ?? '';
      const name = /^[（(]株[）)]$/.test(last) ? words.slice(-2).join('') : last;
      if (isMakerName(name)) return name;
      if (text.includes('●')) break; // 仕様の文の中は見ない
    }
  }
  return '';
}

// ---- 商品を入れる欄で使う（components/CatalogPicker.tsx）

/** 種目（細目まで選んでいれば細目）の商品 */
export function catalogInCategory(list: CatalogProduct[], category: string, sub: string): CatalogProduct[] {
  if (!category) return [];
  return list.filter((p) => p.category === category && (!sub || p.sub === sub));
}

/** メーカーが同じか（書き方のちがい・「パナソニック」と「パナソニックエイジフリー（株）」も同じに見る） */
export const sameMaker = (a: string, b: string) => {
  const [x, y] = [makerKey(appMaker(a)), makerKey(appMaker(b))];
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/** 種目の商品のメーカー（カタログの順） */
export function catalogMakers(list: CatalogProduct[]): string[] {
  const out: string[] = [];
  for (const p of list) if (p.maker && !out.some((m) => sameMaker(m, p.maker))) out.push(p.maker);
  return out;
}

/** カタログの品番を選んだときに、商品の欄に入れる値（商品名は見出しに色・大きさを足したもの。販売金額は定価×割引率に戻す） */
export function catalogItemPatch(p: CatalogProduct, v: CatalogVariant, item: Pick<SaleItem, 'category' | 'sub' | 'maker'>): Partial<SaleItem> {
  return {
    name: [p.name, v.label].filter(Boolean).join(' '),
    maker: p.maker || item.maker,
    code: v.code,
    tais: v.tais,
    listPrice: v.listPrice,
    unitPrice: null,
    category: p.category || item.category,
    sub: p.sub || item.sub,
  };
}
