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
import {CATALOG, catalogPicks} from './catalog.ts';
import type {CatalogPage} from './catalog.ts';
import type {CatalogRule} from './print/catalogRules.ts';
import {applyFix} from './catalogFixes.ts';
import {CATALOG_FEATURES} from './catalogFeatures.ts';
import type {Candidate} from './import/priceImport.ts';
import {CATEGORIES, guessCategory, subShort, WHEELED} from './category.ts';
import {taxOf} from './calc.ts';
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
  category: string; // 種目。介護保険の購入の対象でないと分かったもの（すべり止めマット・印のない商品）は空
  sub: string;
  /** カタログの「介・購入」の印：true＝ある、false＝ない（印のあるページで）、null＝このページには印がない（杖・スロープのページ） */
  insured: boolean | null;
  /** 種目が空のわけ（「すべり止めマットは介護保険の対象外です」など）。種目があれば空 */
  note: string;
  taxFree: boolean; // 非課税（福祉用具の杖など。定価は書いてある金額のまま）
  variants: CatalogVariant[]; // 品番ごと。定価は税抜（カタログの（税抜¥…））。読めなければ 0
  /**
   * ページの上の囲みの位置（左上から pt）：見出し・写真・品番・定価・説明の文字の入る所。カタログの窓で、ページの絵の上に重ねる「押せる枠」に使う
   * （ユーザーの指示「カタログと商品をリンクさせて、自動的に商品名や金額などが全てはいるようにする」2026-11-02）
   */
  box?: PageBox;
  /**
   * カタログの機能アイコン（ひじ掛け・ひじ掛け跳ね上げ・座面回転・リクライニングなど）：true＝あり（黒）、false＝なし（灰色）。アイコンのない商品は undefined。
   * catalogFeatures.ts の表から（2026-11-09 のユーザーの指摘：ユクリア コンパクトで肘付きのはずが肘なしの型番が入った）
   */
  features?: Record<string, boolean>;
};
export type PageBox = {x: number; y: number; w: number; h: number};

const between = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
// 見出しは 9.2pt（安寿 軽量浴槽台の 7・8 は 8.5pt）。説明の 8.5pt の文は、番号のすぐ右にないので見出しにならない
const isTitle = (t: PdfText) => between(t.h, 8.3, 9.8);
const isPrice = (t: PdfText) => between(t.h, 10.4, 12.2) && /^[\d,]{3,}$/.test(t.s);
const isRowSize = (t: PdfText) => between(t.h, 6.3, 7.1);
const isLabelSize = (t: PdfText) => between(t.h, 5.5, 6.25);
const isSmall = (t: PdfText) => between(t.h, 4.8, 5.45);
/**
 * 色・大きさの字：ふつうは品番より小さい字（5.8pt）。品番と同じ大きさ（6.7pt）の、品番でない字も（p.44 の「536-482 標準 レッド」の「標準」・
 * 2行にまたがる「標準」「ミニ」、p.47 の「M PN-L10201A ブルー」の「M」。前は小さい字しか見ず、標準とミニ・M と L が同じ名前になっていた。2026-11-09 の点検）
 */
const isWordSize = (t: PdfText) => isLabelSize(t) || (isRowSize(t) && !t.s.split(/[、,，\s]+/).some((c) => CODE.test(c)) && !ORDER.test(t.s) && !atEdge(t));
/** ページの端の帯の字（右ページの右・左ページの左の「入浴」「歩行関連」などの見出し） */
const atEdge = (t: PdfText) => t.x >= 570 || t.x + t.w <= 30;
const NUM = /^(\d{1,2}|・)$/;
const ORDER = /^\d{3}-[A-Z]\d{4}$/;
/**
 * 品番：英数字とハイフン（数字を1つ以上）か、英字だけの3字以上（歩行器の SAWR・SAWMSSR・SAV、バスボードの VALSBDSOR。2026-11-03 の
 * カタログの金額の点検で、数字のない品番を読めず、品番がなくなる・となりの品番に金額がずれるのを見つけた）。NEW は新商品の印。
 * 「No.5022」「No.5600」（p.48・49 の入浴用車いす）と、スラッシュのある「KSC-2/ST」「KS11-PF/ST」も品番（前は読めず、注文番号を品番にしていた。2026-11-09 の点検）
 */
const CODE = /^(?:(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{2,}|(?!NEW$)[A-Z]{3,}|No\.\d{3,}|[A-Z][A-Z0-9-]*\d[A-Z0-9-]*\/[A-Z]{1,3})$/;
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
/** extra：ほかの見出しの囲みからもらった字（囲みの中の小さな囲みの下の表。囲みの位置にだけ使う） */
type Block = {head: Header; tokens: PdfText[]; extra?: PdfText[]};
type Price = {x: number; y: number; h: number; value: number};

/** ページの文字 → 商品の一覧（見出しの順） */
export function parseCatalogPage(raw: PdfText[], page: Pick<CatalogPage, 'page' | 'subs'> & {category?: string}, rules: CatalogRule[] = []): CatalogProduct[] {
  const items = raw.map((t) => ({...t, s: t.s.normalize('NFKC').trim()})).filter((t) => t.s);

  // 見出し：番号のすぐ右の商品名。「・」は「5・6」の番号のつなぎ。商品名の字のすぐ右の「・」（「ラップポン・プリート2」）は商品名の中なので番号にしない
  const inName = (n: PdfText) => n.s === '・' && items.some((t) => t !== n && isTitle(t) && !NUM.test(t.s) && Math.abs(t.y - n.y) <= 1.6 && between(n.x - (t.x + t.w), -4, 3));
  const nums = items.filter((t) => isTitle(t) && NUM.test(t.s) && !inName(t));
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
  // 囲みの中の小さな囲み（p.175「5 バケツA型用 袋止めN」は「4 ポータブルトイレ きらく ミニでか」の囲みの右上の小さな枠）：右下の見出しのほうが
  // 近いので、小さな囲みの下の表（261-T0625 の品番と金額）まで小さな囲みのものになり、4 は品番も注文番号もない見出しになっていた（2026-11-03 の点検）。
  // 注文番号が2つある囲みの、2つ目の注文番号から下は、同じ段の左の、品番も注文番号もない見出しのものにする
  const hasOrder = (b: Block) => b.tokens.some((t) => isTitle(t) && ORDER.test(t.s));
  const hasCode = (b: Block) => b.tokens.some((t) => isRowSize(t) && t.s.split(/[、,，\s]+/).some((c) => CODE.test(c)));
  for (const b of blocks.values()) {
    const orders = b.tokens.filter((t) => isTitle(t) && ORDER.test(t.s)).sort((a, c) => a.y - c.y);
    if (orders.length < 2) continue;
    const orphans = [...blocks.values()].filter((o) => o !== b && Math.abs(o.head.y - b.head.y) <= 40 && o.head.x < b.head.x && !hasOrder(o) && !hasCode(o));
    if (orphans.length !== 1) continue;
    const cut = orders[1].y - orders[1].h - 1;
    const moved = b.tokens.filter((t) => t.y >= cut);
    b.tokens = b.tokens.filter((t) => t.y < cut);
    orphans[0].tokens.push(...moved);
    orphans[0].extra = [...(orphans[0].extra ?? []), ...moved];
  }

  // 写真のまわりの品番と色（「PN-L41431D」の下に「オレンジ」）：品番の行の右に色がないときに使う
  // 1行のすき間なく続く字（「レッ」「ド」のように分かれた字もつなぐ。となりの写真の色はとらない）
  const wordFrom = (head: PdfText) => {
    const word = [head];
    for (const o of items.filter((x) => isSmall(x) && Math.abs(x.y - head.y) <= 1 && x.x > head.x).sort((a, c) => a.x - c.x)) {
      const prev = word.at(-1)!;
      if (o.x - (prev.x + prev.w) > 1.5 || /\d|[:：]/.test(o.s)) break;
      word.push(o);
    }
    return lineText(word);
  };
  // 2行に折れて書いた品番（p.48「13003000」「1260014」）も、品番の字として見る
  const codeHead = (t: PdfText, code: string): PdfText | null => {
    if (t.s === code) return t;
    if (!code.startsWith(t.s) || t.s.length < 4) return null;
    return items.find((o) => o !== t && isSmall(o) && between(o.y - t.y, 3.5, 8) && Math.abs(o.x - t.x) <= 2 && t.s + o.s === code) ?? null;
  };
  // 写真のまわりの品番の下の色・柄。2行目まで読む（2026-11-09 の点検。前は1行目だけで、「ウォーム」「グレー」が「ウォーム」、
  // 「バーズアイ」「レッド」が「バーズアイ」、「ワイン」「レッド」が「ワイン」になり、色ちがいの品番の見分けがつかなかった）：
  //   1行目が短いカタカナで、つなぐと色の名前になる（ウォーム＋グレー・ミント＋グリーン・リーフ＋ワイン・ワイン＋レッド）→ つなぐ
  //   2行目が色の名前かかっこ書き（バーズアイ／レッド、桜柄／ローズピンク、小アンバー／(ブラウン)）→ 空白でつなぐ
  const photoColor = (code: string): string => {
    for (const t of items) {
      if (!isSmall(t)) continue;
      const head = codeHead(t, code);
      if (!head) continue;
      // 下の行が品番・「SAVS：」のような寸法の見出しなら色ではない（p.46 バスボードの「VALSBDLOR L：」・p.136 の「SAVS：」が色に入っていた。2026-11-03 の点検）
      const below = items.find((o) => o !== head && isSmall(o) && between(o.y - head.y, 3.5, 10) && Math.abs(o.x - head.x) <= 10 && !/\d/.test(o.s) && !CODE.test(o.s) && !/[:：]/.test(o.s));
      if (!below) continue;
      const first = wordFrom(below);
      const nextHead = items.find((o) => o !== below && isSmall(o) && between(o.y - below.y, 3.5, 8) && Math.abs(o.x - below.x) <= 2 && !/\d|[:：]/.test(o.s) && !CODE.test(o.s));
      const next = nextHead ? wordFrom(nextHead) : '';
      if (next && /^[ァ-ヶー]{2,4}$/.test(first) && /^[ァ-ヶー]+$/.test(next) && (!COLOR.test(first) || COLOR_HEAD.test(first)) && COLOR.test(first + next)) return first + next;
      if (next && (COLOR.test(next) || /^\(.+\)$/.test(next)) && !COLOR.test(first)) return `${first} ${next}`;
      return first;
    }
    return '';
  };

  // 「介・購入」の印（介護保険の購入の対象。5pt の「介」と「購入」）。ページの下の凡例（「介・購入　介護保険購入対象商品」）は除く
  const legend = (t: PdfText) => items.some((o) => /購入対象/.test(o.s) && Math.abs(o.y - t.y) <= 2 && between(o.x - t.x, 0, 60));
  const isBadge = (t: PdfText) => isSmall(t) && t.s === '購入' && !legend(t) && items.some((o) => o.s === '介' && Math.abs(o.y - t.y) <= 1.5 && between(t.x - o.x, 0, 12));
  const pageBadges = items.some(isBadge);

  const out: {at: Header; p: CatalogProduct}[] = [];
  for (const b of blocks.values()) {
    const name = titleOf(b.head, items);
    if (!name) continue;
    const variants = blockVariants(b, photoColor, rules);
    const orders = b.tokens.filter((t) => isTitle(t) && ORDER.test(t.s));
    if (!variants.length && !orders.length) continue;
    const rowCodes = variants.map((v) => v.code);
    const maker = appMaker(makerOf(b) || (/^安寿/.test(name) ? 'アロン化成' : rowCodes.some((c) => /^PN-/.test(c)) ? 'パナソニック' : ''));
    const insured = pageBadges ? b.tokens.some(isBadge) : null;
    const taxFree = b.tokens.some((t) => /非課税/.test(t.s));
    // 囲みの説明の文（歩行車の見分けに使う）。ページの端の見出し（右ページの右・左ページの左の「歩行器／シルバーカー」など）は入れない
    const text = b.tokens.filter((t) => t.x < 570 && t.x + t.w > 30).map((t) => t.s).join('');
    const {category, sub, note} = catalogCategory(name, insured, taxFree, page.subs, text, page.category);
    // 囲みの位置：見出しの左上から、囲みの文字（品番・定価・説明）のいちばん右・下まで。右はとなりの見出しの手前まで
    const inside = [...b.tokens.filter((t) => t.x < b.head.end && t.x + t.w > 30), ...(b.extra ?? [])];
    const left = Math.min(b.head.x, ...inside.map((t) => t.x));
    const top = Math.min(b.head.y - b.head.title.h, ...inside.map((t) => t.y - t.h)) - 2;
    const right = Math.min(b.extra?.length ? Infinity : b.head.end, Math.max(...inside.map((t) => t.x + t.w))) + 2;
    const bottom = Math.max(...inside.map((t) => t.y)) + 3;
    out.push({
      at: b.head,
      p: {
        key: `${page.page}:${Math.round(b.head.x)}:${Math.round(b.head.y)}`,
        page: page.page,
        name,
        maker,
        category,
        sub,
        insured,
        note,
        taxFree,
        box: {x: Math.round(left - 2), y: Math.round(top), w: Math.round(right - left + 2), h: Math.round(bottom - top)},
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
  const list = out.sort((a, c) => a.at.y - c.at.y || a.at.x - c.at.x).map((x) => x.p);
  // ページの書き方が特殊で読めない商品は、絵で確かめた直しを当てる（catalogFixes.ts。金額は読み取ったもの）
  for (const p of list) {
    p.variants = applyFix(p);
    const f = CATALOG_FEATURES.find((r) => r.page === p.page && r.order === p.variants[0]?.orderCode && r.code === p.variants[0]?.code);
    if (f) p.features = Object.fromEntries([...f.on.map((k) => [k, true] as const), ...f.off.map((k) => [k, false] as const)]);
  }
  trimOverlaps(list);
  return list;
}

/**
 * 押せる枠（box）の重なりをなくす（2026-11-05 の点検。全ページを調べると、上の商品の枠が下の商品の見出しの行（商品名・「完成品」の札）まで
 * 11pt ほどかかり、左の商品の枠が右の商品に 3〜7pt かかっていた。押すと後ろの（下・右の）枠が上に来るので正しい商品が入るが、点線の枠がかぶって
 * どちらの商品か分かりにくい）：下にある枠の上の線まで上の枠を、右にある枠の左の線まで左の枠を縮める。
 * 枠の中の小さな囲み（p.175 の「バケツA型用 袋止めN」）のように、大きくかぶるもの（重なりが 20pt をこえる向き）はそのまま
 */
function trimOverlaps(list: CatalogProduct[]): void {
  for (const a of list) {
    for (const d of list) {
      if (a === d || !a.box || !d.box) continue;
      const A = a.box;
      const D = d.box;
      const ox = Math.min(A.x + A.w, D.x + D.w) - Math.max(A.x, D.x);
      const oy = Math.min(A.y + A.h, D.y + D.h) - Math.max(A.y, D.y);
      if (ox <= 0 || oy <= 0) continue;
      if (D.y > A.y && oy <= 20 && ox > oy) A.h = Math.max(1, D.y - A.y - 1); // d が下：a の下の線を d の上まで
      else if (D.x > A.x && ox <= 20 && oy > ox) A.w = Math.max(1, D.x - A.x - 1); // d が右：a の右の線を d の左まで
    }
  }
}

/**
 * カタログの商品の種目と細目。商品名から決め（category.ts の guessCategory）、決まらなければページの細目（1つのとき）。
 * 「介・購入」の印のあるページで印のない商品（すべり止めマット・クッション・リフト・介護保険の対象でないもの）は種目を空にする。
 * 杖のページには印がないので、非課税（福祉用具の杖）の多点杖だけを対象にする（課税の杖は福祉用具でないことが多い）
 */
export function catalogCategory(
  name: string,
  insured: boolean | null,
  taxFree: boolean,
  subs?: string[],
  text = '',
  pageCategory = '',
): {category: string; sub: string; note: string} {
  const g = guessCategory(name);
  if (insured === false) return {category: '', sub: '', note: g.warn || 'カタログに「介・購入」の印がありません（介護保険の購入の対象外）'};
  if (g.category === '歩行補助つえ' && insured === null && !taxFree) return {category: '', sub: '', note: '非課税でない杖（介護保険の対象か確かめてください）'};
  // 歩行器：商品名に車輪の言葉がなくても、囲みの説明（「前脚のスイングキャスター」「ハンドルブレーキ」）にあれば歩行車で対象外。
  // 選択制で買えるのは、脚がすべて杖先ゴムの固定式・交互式だけ（2026-11-01 ユーザーの指示「固定用歩行器のカタログも追加」。カタログ p.136・137）
  const walker = g.category === '歩行器' || (!g.category && !g.warn && pageCategory === '歩行器');
  if (walker) {
    if (WHEELED.test(`${name} ${text}`)) return {category: '', sub: '', note: '車輪・キャスターのある歩行車は対象外（買えるのは脚がすべて杖先ゴムの固定式・交互式）'};
    if (!taxFree && insured === null) return {category: '', sub: '', note: '非課税でない歩行器（介護保険の対象か確かめてください）'};
    return {category: '歩行器', sub: '', note: ''};
  }
  if (g.category) return {category: g.category, sub: g.sub, note: ''};
  const fallback = subs?.length === 1 ? CATEGORIES.find((c) => c.subs.includes(subs[0])) : undefined;
  if (fallback) return {category: fallback.name, sub: subs![0], note: ''};
  if (pageCategory && !g.warn) return {category: pageCategory, sub: '', note: ''};
  return {category: '', sub: '', note: g.warn};
}

/** 見出しの商品名：番号の右から、同じ囲みの中で続く行（3行まで。行の間は 12pt まで） */
function titleOf(h: Header, items: PdfText[]): string {
  const tokens = items.filter((t) => isTitle(t) && Math.abs(t.h - h.title.h) <= 0.8 && (!NUM.test(t.s) || (t.s === '・' && t.x > h.title.x)) && !ORDER.test(t.s) && t.x >= h.title.x - 3 && t.x < h.end && between(t.y - h.title.y, -1.6, 30));
  const picked: PdfText[][] = [];
  for (const l of linesOf(tokens)) {
    const prev = picked.at(-1);
    // 2行目からは、商品名の左にそろった行だけ（となりの説明の囲みの字をとらない）
    if (prev && (l[0].y - prev[0].y > 12 || Math.min(...l.map((t) => t.x)) - h.title.x > 12)) break;
    picked.push(l);
    if (picked.length === 3) break;
  }
  const name = picked.map(lineText).join(' ').replace(/\s+/g, ' ').trim();
  // 見出しのすぐ右か下の、小さな字（7.8pt）のかっこ書き（「ミニフィット（超ミニ）」「シャトレチェアD (4輪自在)」「安寿 バスボード（薄型）」）。
  // 前は見出しの字（9.2pt）だけを見ていて、かっこ書きが落ち、ちがう商品と見分けがつかなかった（2026-11-09 の点検）
  const sub = items
    .filter((t) => between(t.h, 7.3, 8.3) && /^[(（].+[)）]$/.test(t.s) && t.x >= h.title.x - 4 && t.x < h.end && between(t.y - h.title.y, -1.6, 12))
    .sort((a, c) => a.y - c.y || a.x - c.x)[0];
  return sub && !name.includes(sub.s) ? `${name}${sub.s}` : name;
}

/** 囲みの中の品番（品番の表ごと。表は品番の左の位置で分ける） */
function blockVariants(b: Block, photoColor: (code: string) => string, rules: CatalogRule[] = []): CatalogVariant[] {
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
  // 「非課税 ￥」「非課税 各￥」のように前に字のついた￥は、左の端ではなく右の端が金額のすぐ左（2026-11-01。歩行器・杖の非課税の金額を読めていなかった）
  const amounts = b.tokens.filter(
    (t) => isPrice(t) && yen.some((y) => Math.abs(y.y - t.y) <= 4 && (between(t.x - y.x, 0, 24) || between(t.x - (y.x + y.w), -4, 8))),
  );
  for (const p of amounts.sort((a, c) => a.y - c.y)) {
    // そばの（税抜¥…）。税込の金額＝税抜×1.1 のものを先に（税抜の字は金額の下のことも、右上のこともある）。なければ書いてある金額（税のかからない品）
    const value = yenOf(p.s);
    const cand = taxOut.filter((t) => !used.has(t) && between(t.x - p.x, -20, 80) && between(t.y - p.y, -6, 12));
    const dist = (t: PdfText) => Math.abs(t.y - p.y) + Math.abs(t.x - p.x) * 0.1;
    const fit = cand.filter((t) => Math.abs(yenOf(t.s.replace(/^.*税抜/, '')) * 1.1 - value) <= Math.max(2, value * 0.002));
    const near = (fit.length ? fit : cand).sort((x, y) => dist(x) - dist(y))[0];
    if (near) used.add(near);
    prices.push({x: p.x, y: p.y, h: p.h, value: near ? yenOf(near.s.replace(/^.*税抜/, '')) : value});
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
  // 品番のない商品（注文番号だけ）：金額と同じ行の左の字（「マットタイプM 幅38×長さ55×厚さ0.2cm」）を色・大きさにする。
  // 前は空で、大きさごとに金額のちがう商品（p.47 オーバルリンク・p.48 乾度良好）を見分けられなかった（2026-11-03 の点検）
  const leftText = (p: Price) =>
    lineText(
      b.tokens
        .filter((t) => (isRowSize(t) || isLabelSize(t)) && Math.abs(t.y - p.y) <= 5 && t.x < p.x - 2 && !MARK.test(t.s) && !/^[¥￥各]+$/.test(t.s) && !ORDER.test(t.s) && !/^※/.test(t.s))
        .sort((x, y) => x.x - y.x),
    )
      .replace(/[↑↓★¥￥●]|各$/g, '')
      .trim();
  // 囲みに TAIS が1つだけなら、どの品番にも付ける（品番の表の上・金額の左に1つだけ書いてある商品。前は品番の行から 8pt の所しか見ず、
  // 付かない品番があった：p.151 の R-103、p.153 の 605502、p.214 の TM-999 など。2026-11-09 の点検）
  const onlyTais = (list: PdfText[]) => (new Set(list.map((t) => TAIS.exec(t.s)![1])).size === 1 ? TAIS.exec(list[0].s)![1] : '');
  if (!tables.length)
    return prices.map((p) => ({
      code: nearestY(orders, p.y)?.s ?? '',
      label: prices.length > 1 ? leftText(p) : '',
      tais: tais.length ? onlyTais(tais) : '',
      listPrice: p.value,
      orderCode: nearestY(orders, p.y)?.s ?? '',
    }));
  const out: CatalogVariant[] = [];
  const ranges: TableRange[] = [];
  tables.forEach((tb, i) => {
    ranges.push({tb, start: out.length, end: out.length + tb.rows.length});
    const left = i === 0 ? -Infinity : tb.x - 6;
    const right = tables[i + 1] ? tables[i + 1].x - 6 : Infinity;
    const top = tb.rows[0].y - 10;
    const bottom = tb.rows.at(-1)!.y + 10;
    const inTable = (t: {x: number; y: number}) => t.x >= left && t.x < right && between(t.y, top - 30, bottom + 30);
    // 表の中に金額がなければ、同じ高さの金額（左右2つの表に、右に1つの金額＝入浴グリップ ユニットバス専用）
    const myPrices = prices.some(inTable) ? prices.filter(inTable) : prices.filter((p) => between(p.y, top - 30, bottom + 30));
    const myOrders = orders.filter(inTable);
    // TAIS も表の左右の範囲の中のもの（p.214 インタースロープは4つの表が横に並び、同じ高さに4つの TAIS がある。前は高さだけで選び、
    // 右の3つの表の品番に左の表の TAIS を付けていた。2026-11-09 の点検）
    const myTais = tais.filter(inTable).length ? tais.filter(inTable) : tais;
    // 品番のすぐ下（同じ左の位置）の TAIS は、その品番だけのもの（p.137 の「WC-3010M」の下の TAIS は WC-3010S のものではない。WC-3010S は「TAIS/取得中」。
    // p.154 の WB3576 の TAIS も、WB3502 のものではない）。1つだけでも、ほかの品番には付けない
    const ownedTais = (t: PdfText) => tb.rows.some((r) => Math.abs(t.x - r.x) <= 3 && between(t.y - r.y, 0.5, 9));
    // 品番の行のまとまりのまん中（品番の下に、同じ左の位置で「O型シート」・TAIS コードなどが続くと、金額はその2行のまん中に置かれる。
    // 品番の行の高さで比べると、まとまりの境が1行ずれた：p.49 SW6083SAL・p.154 WB5148・p.136 の歩行器。2026-11-03 の点検）
    // どの行にも続きの行があるときだけ（p.214 バリアフリーレールは、まとまりの下の「フラットタイプ（長さ200cm）」を続きと見てずれた）
    const isCodeText = (t: PdfText) => t.s.split(/[、,，\s]+/).some((c) => CODE.test(c));
    const codeX = (r: PdfText) => Math.min(...tb.rows.filter((o) => Math.abs(o.y - r.y) <= 1.6).map((o) => o.x));
    const below = (x: number, y: number) =>
      b.tokens.find((t) => Math.abs(t.x - x) <= 3 && t.y > y + 1 && t.y - y <= 10 && !isCodeText(t) && !isPrice(t) && !/^[●※]/.test(t.s));
    const bottomOf = (r: PdfText) => {
      const x = codeX(r);
      let bottom = r.y;
      for (let k = 0; k < 2; k++) {
        const next = below(x, bottom);
        if (!next) break;
        bottom = next.y;
      }
      return bottom;
    };
    const bottoms = tb.rows.map(bottomOf);
    const twoLines = bottoms.every((y, k) => y > tb.rows[k].y + 1);
    // 品番のすぐ下（同じ左の位置）の種類の名前（p.172 セレクトR 自動ラップ2 の「標準便座」「ソフト便座」「暖房便座」。2026-11-03 の点検）。
    // 前は品番より右の字だけを見ていたので「ソフ」「ト便座」の「ト便座」だけになり、名前のない行にはとなりの行の「ト便座」が付いた。
    // どの行にもあるときだけ（品番の行の字と同じ大きさのかたまり。TAIS・金額・注の行はとらない）
    // 下になければ、品番のすぐ上（p.175 ジャスピタの「標準タイプ」「ソフト便座タイプ」は品番の上にある）
    const above = (x: number, y: number) =>
      b.tokens.find((t) => Math.abs(t.x - x) <= 3 && t.y < y - 1 && y - t.y <= 10 && !isCodeText(t) && !isPrice(t) && !/^[●※]/.test(t.s));
    const nameNear = (side: typeof below) => tb.rows.map((r) => {
      const x = codeX(r);
      const first = side(x, r.y);
      if (!first || !isLabelSize(first)) return null;
      const line = b.tokens
        .filter((t) => isLabelSize(t) && Math.abs(t.y - first.y) <= 1.6 && t.x >= x - 3 && t.x < right && !/[●¥￥]|TAIS|税抜/.test(t.s) && !MARK.test(t.s) && !isPrice(t))
        .sort((a, c) => a.x - c.x);
      // 品番の左の位置から、すき間なく続く字だけ（右の列の字はとらない）
      const run: PdfText[] = [];
      for (const t of line) if (!run.length || t.x - Math.max(...run.map((u) => u.x + u.w)) <= 3) run.push(t);
      return run.length ? run : null;
    });
    const okNames = (list: (PdfText[] | null)[]) => list.every((u) => u && !/^[\d\s.,-]+$/.test(lineText(u)));
    const downs = nameNear(below);
    const ups = okNames(downs) ? downs : nameNear(above);
    // 上の名前は、どの行もちがう名前のときだけ（表の見出しの行を名前にしない）
    const under = okNames(downs) ? downs : new Set(ups.map((u) => (u ? lineText(u) : ''))).size === ups.length ? ups : downs;
    const useUnder = okNames(under);
    const taken = new Set(useUnder ? under.flatMap((u) => u!) : []);
    const rest = useUnder ? {...b, tokens: b.tokens.filter((t) => !taken.has(t))} : b;
    const labelsWith = (heads: string[]) => splitInline(tb.rows, rowLabels(rest, tb.rows, right, heads)).map((l, k) => (useUnder ? [l, lineText(under[k]!)].filter(Boolean).join(' ') : l));
    let labels = labelsWith(captions(rest, tb));
    // 行の見分けがつかない（同じ名前・名前なしの行がある）表だけ、入れ子の見出しを読む（nestedCaptions。p.173 セレクトS・p.178 FX-30 など）。
    // 見分けのつく表は前のまま（読み方を変えて、ほかの商品の名前が変わらないように）
    const distinct = (list: string[]) => list.every(Boolean) && new Set(list).size === list.length;
    if (tb.rows.length > 1 && !distinct(labels)) {
      const nested = nestedCaptions(rest, tb);
      const next = nested ? labelsWith(nested) : null;
      if (next && new Set(next).size > new Set(labels).size) labels = next;
    }
    const priceOf = rulePrices(tb.rows, myPrices, rules) ?? assignPrices(twoLines ? tb.rows.map((r, k) => ({...r, y: (r.y + bottoms[k]) / 2})) : tb.rows, myPrices);
    tb.rows.forEach((r, k) => {
      const order = nearestY(myOrders.length ? myOrders : orders, r.y)?.s ?? '';
      const t = nearestY(myTais, r.y, 8);
      out.push({
        code: r.s,
        label: withColor(labels[k], photoColor(r.s)),
        tais: t ? TAIS.exec(t.s)![1] : myTais.length === 1 && !ownedTais(myTais[0]) ? onlyTais(myTais) : '',
        listPrice: priceOf[k],
        orderCode: order,
      });
    });
  });
  return out.length > 1 && !distinctLabels(out) ? withTableHeads(b, ranges, out) : out;
}

type TableRange = {tb: {x: number; rows: PdfText[]}; start: number; end: number};
const distinctLabels = (list: CatalogVariant[]) => list.every((v) => v.label) && new Set(list.map((v) => v.label)).size === list.length;

/**
 * 表をまたいで品番の見分けがつかない商品（ユーザーの指示「脱臭や暖房など、型番だけでなく、商品をえらびやすいようにする」2026-11-04）に、
 * 表の外の手がかりを足す。足すのは見つかったものだけ（見分けのつく商品は前のまま）：
 *   表の上の見出し（p.179 サニタリエース SD の「ソフト便座タイプ」「暖房便座タイプ」、p.177 ラフィーネの「プラスチック便座」…「脱臭あたたか便座」）：
 *     表の上 60pt までの、2つ以上の表の上にかかる見出しの行（いちばん近い行）。表ごとに、いちばん重なる言葉
 *   ●の行（p.177 ラフィーネの「前後傾調整脚」「センサー式自動脱臭」）：表の左の言葉と、その表の上の●
 *   品番の末尾の色（「※品番の末尾は、B：ブラウン、V：パープル…を表しています」）
 */
function withTableHeads(b: Block, ranges: TableRange[], out: CatalogVariant[]): CatalogVariant[] {
  const extra = out.map(() => [] as string[]);
  const add = (r: TableRange, w: string) => {
    for (let k = r.start; k < r.end; k++) if (!extra[k].includes(w)) extra[k].push(w);
  };
  const firstY = Math.min(...ranges.map((r) => r.tb.rows[0].y));
  const leftX = Math.min(...ranges.map((r) => r.tb.x));
  const cell = (i: number): [number, number] => [ranges[i].tb.x - 2, ranges[i + 1] ? ranges[i + 1].tb.x - 2 : ranges[i].tb.x + 70];
  // 表の上の字（字のかけらをつないだ言葉）
  const above = b.tokens.filter((t) => isLabelSize(t) && between(firstY - t.y, 3, 60) && !/[¥￥]/.test(t.s));
  const words = linesOf(above).flatMap((line) => {
    const groups: PdfText[][] = [];
    for (const t of [...line].sort((a, c) => a.x - c.x)) {
      const g = groups.at(-1);
      if (g && t.x - Math.max(...g.map((x) => x.x + x.w)) <= 1.5 && t.s !== '●' && g.at(-1)!.s !== '●') g.push(t);
      else groups.push([t]);
    }
    return groups.map((g) => ({x: g[0].x, end: Math.max(...g.map((x) => x.x + x.w)), y: g[0].y, s: lineText(g)}));
  });
  const isMark = (s: string) => /^[●ー－\-]$/.test(s) || MARK.test(s);
  // 見出しの行：近い行から、2つ以上の表にちがう言葉がかかる行
  const lines = linesOf(words.filter((w) => !isMark(w.s) && w.end > leftX).map((w) => ({...w, w: w.end - w.x, h: 0}))).sort((a, c) => c[0].y - a[0].y);
  for (const line of lines) {
    const picks = ranges.map((_, i) => {
      const [x0, x1] = cell(i);
      const best = line.map((w) => ({w, o: Math.min(x1, w.x + w.w) - Math.max(x0, w.x)})).filter((x) => x.o > 0).sort((a, c) => c.o - a.o)[0];
      return best?.w.s ?? '';
    });
    if (picks.filter(Boolean).length >= 2 && new Set(picks.filter(Boolean)).size >= 2) {
      picks.forEach((w, i) => w && add(ranges[i], w));
      break;
    }
  }
  // ●の行：表の左の言葉（上下 5pt まで。2行の「前後傾」「調整脚」）と、表の上の●
  const dots = words.filter((w) => w.s === '●');
  for (const y of [...new Set(dots.map((d) => Math.round(d.y)))]) {
    const name = words.filter((w) => w.end <= leftX && Math.abs(w.y - y) <= 5 && !isMark(w.s)).sort((a, c) => a.y - c.y || a.x - c.x).map((w) => w.s).join('');
    if (!name) continue;
    ranges.forEach((r, i) => {
      const [x0, x1] = cell(i);
      if (dots.some((d) => Math.abs(d.y - y) <= 1.6 && d.x >= x0 && d.x < x1)) add(r, name);
    });
  }
  // 表の左の、行のまとまりの見出し（p.177 ラフィーネの「長穴便座タイプ」「標準便座タイプ」）：2つ以上あれば、どの表の行にも高さのいちばん近い見出し
  const lowest = Math.max(...ranges.map((r) => r.tb.rows.at(-1)!.y));
  const side = linesOf(b.tokens.filter((t) => isLabelSize(t) && t.x + t.w <= leftX - 2 && between(t.y, firstY - 6, lowest + 6) && !isMark(t.s) && !/[¥￥\d●]/.test(t.s)));
  const groups: PdfText[][][] = [];
  for (const l of side) {
    const g = groups.at(-1);
    if (g && l[0].y - g.at(-1)![0].y <= 8) g.push(l);
    else groups.push([l]);
  }
  if (groups.length >= 2) {
    const heads = groups.map((g) => ({y: (g[0][0].y + g.at(-1)![0].y) / 2, s: g.map(lineText).join('')}));
    for (const r of ranges)
      r.tb.rows.forEach((row, i) => {
        const h = [...heads].sort((a, c) => Math.abs(a.y - row.y) - Math.abs(c.y - row.y))[0];
        if (!extra[r.start + i].includes(h.s)) extra[r.start + i].push(h.s);
      });
  }
  // 品番の末尾の色
  const legend = /末尾は[、,，]?(.+?)を表して/.exec(b.tokens.map((t) => t.s).join(''))?.[1] ?? '';
  const suffix = new Map([...legend.matchAll(/([A-Z]{1,3})[:：]([^、,，。:：A-Z]+)/g)].map((m) => [m[1], m[2].trim()]));
  out.forEach((v, k) => {
    const m = /^(.*\d)([A-Z]{1,3})$/.exec(v.code);
    const color = m ? suffix.get(m[2]) : undefined;
    if (color && !v.label.includes(color)) extra[k].push(color);
  });
  return out.map((v, k) => {
    if (!extra[k].length) return v;
    // 足した言葉に含まれる言葉（「ソフト便座タイプ」の「ソフト便座」）は消す
    const own = v.label.split(/\s+/).filter((w) => w && !extra[k].some((e) => e.includes(w)));
    return {...v, label: cleanLabel([...extra[k], ...own].join(' '))};
  });
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
const COLOR = /レッド|ブルー|グリーン|オレンジ|ブラウン|グレー|ホワイト|ピンク|ベージュ|アイボリー|ブラック|イエロー|ネイビー|パープル|ワイン|シルバー/;
/** 色の名前の前に付く言葉（「ワイン」＋「レッド」・「ローズ」＋「ピンク」など。それだけでも色の名前のもの） */
const COLOR_HEAD = /^(ワイン|ローズ|ダーク|ライト|ミディアム|モカ|ミスト|アース|スカイ|ベビー|パステル)$/;
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

/**
 * 表の左の見出し（「5 すべり止め シートタイプ」）：表の左 60pt までの、表の高さの中の 5.8pt の字。行ごとに返す。
 * 見出しがたてに離れていくつかあるとき（p.172 の「ノーマルタイプ」「はねあげタイプ」、p.174 プリート2 の「普通便座」「やわらか便座」「暖房便座」）は、
 * 行ごとにいちばん近い見出し（前は全部をつないだ「普通便座やわらか便座暖房便座」をどの行にも付けていた。2026-11-03 の点検）
 */
function captions(b: Block, tb: {x: number; rows: PdfText[]}): string[] {
  const top = tb.rows[0].y - 6;
  const bottom = tb.rows.at(-1)!.y + 6;
  const words = b.tokens.filter((t) => isWordSize(t) && between(t.y, top, bottom) && between(tb.x - t.x, 4, 60) && !/[●¥￥\d]/.test(t.s) && !MARK.test(t.s));
  const lines = linesOf(words);
  // 行の間が 8pt までなら1つの見出し（2行に折り返した「ノーマル」「タイプ」）
  const groups: PdfText[][][] = [];
  for (const l of lines) {
    const g = groups.at(-1);
    if (g && l[0].y - g.at(-1)![0].y <= 8) g.push(l);
    else groups.push([l]);
  }
  // 前からの決まり：表の左にある字が1つのかたまり（たての3行まで・字が6つまで）なら、どの行にもその字（写真のまわりの字はとらない）
  const whole = lines.length && lines.length <= 3 && words.length <= 6 ? lines.map(lineText).join('') : '';
  // 行ごとに分けるのは、見出しが1つの列にたてに並ぶとき（左の位置がそろう）・色の名前でないときだけ。
  // 入れ子の見出し（p.173「ノーマル」→「標準便座」→「快適脱臭」・p.178）や、写真の横の色の名前（p.45・p.175）は分けない
  const oneColumn = columnsOf(words, 5).length === 1;
  if (groups.length < 2 || !oneColumn || words.some((t) => COLOR.test(t.s)) || groups.some((g) => g.length > 3 || g.flat().length > 6)) return tb.rows.map(() => whole);
  const text = groups.map((g) => g.map(lineText).join(''));
  const mid = groups.map((g) => (g[0][0].y + g.at(-1)![0].y) / 2);
  const pick = tb.rows.map((r) => mid.map((m, i) => ({i, d: Math.abs(m - r.y)})).sort((a, c) => a.d - c.d)[0].i);
  // どの見出しにも、それにいちばん近い行がある（見出しが表の行の並びに沿っている）ときだけ
  return groups.every((_, i) => pick.includes(i)) ? pick.map((i) => text[i]) : tb.rows.map(() => whole);
}

/**
 * 表の左の入れ子の見出し（ユーザーの指示「販売カタログから商品を検索する場合、脱臭や暖房など、型番だけでなく、商品をえらびやすいようにする」2026-11-04。
 * 前は読めず、p.173 家具調トイレ セレクトS の12の品番がみな同じ名前で並んだ）。例 p.173：
 *   「ノーマル」（6行のまん中）│「標準便座」「ソフト便座」「暖房便座」（2行ずつのまん中）│「快適脱臭」（2行目と同じ高さ）│ 534-020 …
 *   → 534-020「ノーマル 標準便座」・534-023「ノーマル 標準便座 快適脱臭」・534-021「ノーマル ソフト便座」…
 * 見出しは、表の左（左の表の金額・品番より右、品番の 110pt 左まで）の 5.8pt の字。左の位置で列に分け、列ごとに、見出しがどの行の見出しかを決める：
 *   列に1つだけ → どの行にも／見出しで行を上から分けて、どの見出しもその行のまん中にある（2行に折り返した見出しはつないで見る）／
 *   どの見出しも、つづいた行のまん中か同じ高さにある（p.178 の「快適脱臭」：その2行だけ）。
 * どの列も決まり、行ごとの見出しが2つ以上にちがうときだけ返す（決まらなければ null。まちがえて付けるより付けない）
 */
function nestedCaptions(b: Block, tb: {x: number; rows: PdfText[]}): string[] | null {
  const ys = [...new Set(tb.rows.map((r) => Math.round(r.y * 10) / 10))].sort((a, c) => a - c);
  if (ys.length < 2) return null;
  const top = ys[0] - 6;
  const bottom = ys.at(-1)! + 6;
  const isData = (t: PdfText) => isPrice(t) || /[¥￥★↑]|税抜|TAIS/.test(t.s) || t.s.split(/[、,，\s]+/).some((c) => CODE.test(c));
  const limit = Math.max(tb.x - 110, ...b.tokens.filter((t) => isData(t) && t.x + t.w <= tb.x - 2 && between(t.y, top, bottom)).map((t) => t.x + t.w));
  const toks = b.tokens.filter(
    (t) => isLabelSize(t) && between(t.y, top, bottom) && t.x > limit && t.x + t.w <= tb.x + 1 && !/[●¥￥]/.test(t.s) && !MARK.test(t.s) && !/^[\d\s.,～~-]+$/.test(t.s),
  );
  if (!toks.length) return null;
  // 字のかけら（「ソフ」「ト便座」）をつなぐ。すき間のある字は別の言葉（「S」と「標準便座」）
  const words = linesOf(toks).flatMap((line) => {
    const groups: PdfText[][] = [];
    for (const t of [...line].sort((a, c) => a.x - c.x)) {
      const g = groups.at(-1);
      if (g && t.x - Math.max(...g.map((x) => x.x + x.w)) <= 1.5) g.push(t);
      else groups.push([t]);
    }
    return groups.map((g) => ({x: g[0].x, y: g[0].y, s: lineText(g)}));
  });
  type Word = {y: number; s: string};
  const near = (a: number, c: number, tol: number) => Math.abs(a - c) <= tol;
  const mid = (list: number[]) => (list[0] + list.at(-1)!) / 2;
  // 上から分ける：見出しの間のまん中で行を分け、どの見出しも自分の行のまん中にある
  const partition = (list: Word[]): (number[] | null)[] | null => {
    const cuts = list.slice(1).map((w, i) => (list[i].y + w.y) / 2);
    const spans = list.map((_, i) => ys.filter((y) => (i === 0 || y >= cuts[i - 1]) && (i === list.length - 1 || y < cuts[i])));
    return spans.every((sp, i) => sp.length > 0 && near(mid(sp), list[i].y, 2.5)) ? spans : null;
  };
  // つづいた行（いちばん短いもの）のまん中か同じ高さ。ほかの見出しと重ならない
  const spansOf = (list: Word[]): (number[] | null)[] | null => {
    const out: number[][] = [];
    for (const w of list) {
      let found: number[] | null = null;
      for (let n = 1; n <= ys.length && !found; n++)
        for (let i = 0; i + n <= ys.length && !found; i++) {
          const sp = ys.slice(i, i + n);
          if (near(mid(sp), w.y, 0.8) && !out.some((o) => o.some((y) => sp.includes(y)))) found = sp;
        }
      if (!found) return null;
      out.push(found);
    }
    return out;
  };
  // 2行に折り返した見出し（「自動ラップ2」「標準便座」）をつなぐ
  const joined = (list: Word[]): Word[] => {
    const out: {ys: number[]; s: string}[] = [];
    for (const w of list) {
      const last = out.at(-1);
      if (last && w.y - last.ys.at(-1)! <= 7.5) {
        last.ys.push(w.y);
        last.s += /[A-Za-z0-9]$/.test(last.s) ? ` ${w.s}` : w.s;
      } else out.push({ys: [w.y], s: w.s});
    }
    return out.map((o) => ({y: mid(o.ys), s: o.s}));
  };
  const columns = columnsOf(words, 4).sort((a, c) => a[0].x - c[0].x);
  const perRow = ys.map(() => [] as string[]);
  for (const col of columns) {
    const list = [...col].sort((a, c) => a.y - c.y);
    if (list.length === 1) {
      perRow.forEach((p) => p.push(list[0].s));
      continue;
    }
    const merged = joined(list);
    const tries: [Word[], (number[] | null)[] | null][] = [
      [list, partition(list)],
      [merged, merged.length > 1 ? partition(merged) : null],
      [list, spansOf(list)],
      [merged, spansOf(merged)],
    ];
    const ok = tries.find(([, sp]) => sp);
    if (merged.length === 1) {
      perRow.forEach((p) => p.push(merged[0].s));
      continue;
    }
    if (!ok) return null;
    ok[0].forEach((w, i) => ok[1]![i]!.forEach((y) => perRow[ys.indexOf(y)].push(w.s)));
  }
  const texts = perRow.map((p) => p.join(' '));
  if (new Set(texts).size < 2) return null;
  return tb.rows.map((r) => texts[ys.indexOf(Math.round(r.y * 10) / 10)] ?? '');
}

/**
 * 品番の行の右の色・大きさ。列ごとに、たてに続く字（2行の「12～」「15cm」）を1つにまとめ、行にいちばん近いものを付ける
 */
function rowLabels(b: Block, rows: PdfText[], right: number, heads: string[]): string[] {
  const top = rows[0].y - 8;
  const bottom = rows.at(-1)!.y + 8;
  const left = Math.min(...rows.map((r) => r.x));
  // 金額・TAIS より左。品番のすぐ下に同じ左の位置で書いた TAIS（p.136・137 の歩行器「SAWMR スタンダード」の下の「TAIS/00465-000039」）は、
  // 品番の右の字の終わりではない（前はここで切って、スタンダード・ミニタイプ・シルバーなどの種類の名前がみな空になっていた。2026-11-09 の点検）
  const stop = Math.min(right, ...b.tokens.filter((t) => (isPrice(t) || /[¥￥]|TAIS|税抜/.test(t.s)) && between(t.y, top, bottom) && t.x > left + 3 && t.x < right).map((t) => t.x));
  // 行の間（いちばん狭い所）。2行の大きさはこれより狭い間でつながる
  const ys = [...new Set(rows.map((r) => Math.round(r.y * 2) / 2))].sort((a, c) => a - c);
  const gap = ys.length > 1 ? Math.min(...ys.slice(1).map((y, i) => y - ys[i])) : 10;
  const lines = linesOf(b.tokens.filter((t) => isWordSize(t) && between(t.y, top, bottom) && t.x > left && t.x < stop - 1 && !/[●¥￥]|TAIS|税抜/.test(t.s) && !MARK.test(t.s)));
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
  // 品番のすぐ右（同じ行・すき間 10pt まで）の言葉：どの行にもあれば、それぞれの品番だけの種類の名前（p.136 の「SAWMR スタンダード」
  // 「SAWMHR ハイタイプ」「SW5310 シルバー」）。品番の長さで左の位置が 5pt 以上ずれるので、左の位置で列に分けると別々の列になり、
  // となりの行の名前が付いた（SW5310 に上の行の「SSタイプ」。2026-11-09 の点検）。その行にだけ付けて、列には入れない。
  // ない行があるとき（p.44 の「ジャスト8-12」は下の色ちがいの行にも共通）は前のまま、列で見る
  const ownOf = (r: PdfText) =>
    words.filter((w) => Math.abs(r.y - w.y) <= 1.6 && between(w.x - (r.x + r.w), -1, 10)).sort((a, c) => a.x - c.x)[0];
  const ownAll = rows.length >= 2 && rows.every((r) => rows.filter((o) => Math.abs(o.y - r.y) <= 1.6).length === 1 && ownOf(r));
  const own = rows.map((r) => (ownAll ? ownOf(r) : undefined));
  const columns = columnsOf(words.filter((w) => !own.includes(w)), 5).map((col) => {
    const cells: {y0: number; y1: number; s: string}[] = [];
    for (const w of col.sort((a, c) => a.y - c.y)) {
      const last = cells.at(-1);
      // 「UST-」の次の行の「130R」のように、ハイフンで終わる字は次の行とつなぐ
      const limit = /[～~-]$/.test(last?.s ?? '') ? Math.max(gap, 8) : Math.min(6.5, gap * 0.75);
      // 言葉のすぐ下の数字の範囲（p.44 安寿 軽量浴槽台の「標準」「12-20」：3行にかかる2行の見出し）もつなぐ。前は別々になり、
      // 「標準 レッド」「12-20 グリーン」のように、3つの高さのどれか分からなかった（2026-11-09 の点検）
      const caption = !!last && !/\d/.test(last.s) && /^\d+(?:\.\d+)?(?:[-～~]\d+(?:\.\d+)?)+$/.test(w.s) && w.y - last.y1 <= 9;
      if (last && w.y - last.y1 > 0 && (w.y - last.y1 <= limit || caption)) {
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
    return [heads[k], own[k]?.s ?? '', ...parts].filter(Boolean).join(' ');
  });
}

/**
 * 罫線で金額を割り当てる：表の幅いっぱいの横の罫線（品番の列から金額の列までかかる線）で行をまとまりに分け、金額は自分のいるまとまりの行に付ける
 * （まとまりの中の行の間の線は品番の列だけの短い線なので、区切りにしない）。罫線がない・まとまりと金額が1つずつ合わないときは null（assignPrices で推し量る）。
 * 字の位置だけで推し量ると、p.136 の「SAV・SAVS 各¥…／SAVH・SAVA 各¥…」の SAVH を SAV・SAVS の金額にしていた（2026-11-09 の点検）
 */
function rulePrices(rows: PdfText[], prices: Price[], rules: CatalogRule[]): number[] | null {
  if (!rules.length || !prices.length || !rows.length) return null;
  const left = Math.min(...rows.map((r) => r.x));
  const right = Math.max(...prices.map((p) => p.x));
  const top = Math.min(...rows.map((r) => r.y - r.h), ...prices.map((p) => p.y - p.h)) - 12;
  const bottom = Math.max(...rows.map((r) => r.y), ...prices.map((p) => p.y)) + 12;
  const cuts = [...new Set(rules.filter((r) => r.x <= left + 3 && r.x + r.w >= right && between(r.y, top, bottom)).map((r) => Math.round(r.y * 10) / 10))].sort((a, c) => a - c);
  if (!cuts.length) return null;
  const band = (y: number) => cuts.filter((c) => c < y).length;
  const rowBand = rows.map((r) => band(r.y - r.h / 2));
  const priceBand = new Map<number, number>();
  for (const p of prices) {
    const k = band(p.y - p.h * 0.35);
    if (priceBand.has(k)) return null; // 1つのまとまりに金額が2つ
    priceBand.set(k, p.value);
  }
  if (rowBand.some((k) => !priceBand.has(k))) return null;
  if ([...priceBand.keys()].some((k) => !rowBand.includes(k))) return null;
  return rowBand.map((k) => priceBand.get(k)!);
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
// 寸法（p.175「幅52×奥行55.5cm」）をメーカーにしない：数字・× のある字は、「(株)」の付いた会社名（companyOf）でなければメーカーにしない
const isMakerName = (s: string) => !!s && s.length <= 30 && /[ァ-ヶー一-龠]/.test(s) && !/[ぁ-ん●:：／/\d×]/.test(s) && !NOT_MAKER.test(s);
/**
 * 「(株)」「(有)」の付いた会社名（字は NFKC で半角のかっこ）。かたまりが会社名だけ（「みずわ工業(株)」「(有)ふれあいサポート」）か、
 * 仕様の文の終わりにすき間なく続いた会社名（「●1(DY)(株)イーストアイ」「●1(D)ウチヱ(株)」「…お使いください。ケアメディックス(株)」）。
 * 前はかたまりの最後の言葉しか見ず、「●」の付いた言葉はメーカーにしないので、空になっていた（2026-11-09 の点検）
 */
function companyOf(text: string): string {
  const t = text.replace(/\s+/g, '');
  if (/^(?:\((?:株|有)\)[^●:：。、()]+|[^●:：。、()]+\((?:株|有)\))$/.test(t) && !/×/.test(t) && t.length <= 30) return t;
  const head = /(?:^|[●。、)])(\((?:株|有)\)[ァ-ヶー一-龠A-Za-zぁ-ん・0-9]+)$/.exec(t)?.[1];
  const tail = /([ァ-ヶー一-龠A-Za-z・]+\((?:株|有)\))$/.exec(t)?.[1];
  const name = head ?? tail ?? '';
  return name && !NOT_MAKER.test(name) ? name : '';
}

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
      const company = companyOf(text);
      if (company) return company;
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

/** ひらがなをカタカナに（「しゃわーちぇあ」でも「シャワーチェア」に当たるように） */
const toKatakana = (s: string) => s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
/**
 * 見くらべ用の文字：全角・半角、大文字・小文字、ひらがな・カタカナ、のばす音（ー）・空白・中黒のちがいをなくす
 * （「シャワーチェアー」も「シャワーチェア」に、「ﾕｸﾘｱ」も「ユクリア」に当たる）
 */
export const looseKey = (s: string) =>
  toKatakana((s || '').normalize('NFKC').toLowerCase()).replace(/[\s\u30fc\u2010-\u2015\u2212\-\u30fb]/g, '');

/** 商品の欄の値（種目・品目・項目名＝商品名の欄に打った字・メーカー）で絞る条件 */
export type CatalogFilter = Pick<SaleItem, 'category' | 'sub' | 'name' | 'maker'>;

/** 品目・種目の名前そのもの（「シャワーチェア」「浴槽台」「ポータブルトイレ」「歩行器」など）。打った語がこれなら、その品目の商品をみな出す */
const GENERIC = new Map<string, {category: string; sub: string}>();
for (const c of CATEGORIES) {
  GENERIC.set(looseKey(c.name), {category: c.name, sub: ''});
  for (const sb of c.subs) for (const n of [sb, subShort(sb)]) GENERIC.set(looseKey(n), {category: c.name, sub: sb});
}

/**
 * カタログの商品を、商品の欄の種目・品目・項目名（商品名の欄に打った字）・メーカーで絞る（ユーザーの指示「メーカー名の横に、商品検索ボタン。
 * メーカー名、項目名を入力すると、フィルターをかけられた商品のみ表示されるようにする。カタログも同様です」2026-11-01）。
 * 介護保険の購入の対象（種目のある商品）だけ。種目が空なら項目名から種目・品目を推し量る。項目名の語は：
 *   品目の名前そのもの（「シャワーチェアー」）→ その品目の商品をみな（シャワーキャリー・シャワーベンチもシャワーチェアの品目。2026-11-01 の指示）
 *   ほかの語（「ユクリア」「シャワーキャリー」）→ 商品名・品番・色や大きさか、ページの題（かっこの外。p.48〜51 のシャワーキャリー）にある商品。
 *   どれにもなければ、その語から推し量った品目
 * 項目名に当たる商品がなければ、項目名を外した種目・メーカーの商品（byName が false）
 */
export function catalogFilter(
  list: CatalogProduct[],
  f: CatalogFilter,
): {items: CatalogProduct[]; category: string; sub: string; byName: boolean; unmatched: string[]} {
  const name = toKatakana((f.name || '').normalize('NFKC')).trim();
  const guess = name ? guessCategory(name) : {category: '', sub: ''};
  const category = f.category || guess.category;
  const sub = f.sub || (guess.category && guess.category === category ? guess.sub : '');
  const maker = (f.maker || '').trim();
  const base = list.filter((p) => p.category && (!category || p.category === category) && (!sub || p.sub === sub) && (!maker || sameMaker(p.maker, maker)));
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return {items: base, category, sub, byName: false, unmatched: []};
  const hay = new Map(base.map((p) => [p, looseKey(`${p.name} ${p.maker} ${p.variants.map((v) => `${v.code} ${v.label}`).join(' ')}`)]));
  // 商品名・品番にあるか、ページの題（かっこの中の例の名前は除く）にあるか：「シャワーキャリー」は、名前にシャワーキャリーとある商品と、
  // p.48〜51 のシャワーキャリーのページの商品（シャトレチェア・シャワーラク など。名前にはない）
  const literal = (key: string) => (p: CatalogProduct) =>
    hay.get(p)!.includes(key) || looseKey((CATALOG.find((c) => c.page === p.page)?.title ?? '').replace(/（.*?）|\(.*?\)/g, '')).includes(key);
  const inCat = (g: {category: string; sub: string}) => (p: CatalogProduct) => p.category === g.category && (!g.sub || p.sub === g.sub);
  const generic = [...GENERIC.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  const tests: ((p: CatalogProduct) => boolean)[] = [];
  // 絞り込みに使えなかった語。黙って捨てない（2026-11-09 のユーザーの指摘：「肘付き」を打っても絞られず、肘なしの型番が見積もりに入った。
  // 前は、商品名にない語は品目を推し量るか、一致なしで全部の商品を出していた＝「肘付き」「コンパクト」が黙って消えた）
  const unmatched: string[] = [];
  for (const raw of words) {
    let w = looseKey(raw);
    // ひじ掛け（肘付き・肘掛け付・ひじあり・アーム付／肘なし・ひじ掛けなし）：カタログの機能アイコン（catalogFeatures.ts）で絞る
    const arm = w.match(ARM_WORD);
    if (arm) {
      const none = /ナシ|無/.test(arm[0]);
      tests.push((p) => armrestOf(p) === !none);
      w = w.replace(ARM_WORD, '');
      if (!w) continue;
    }
    const gen = GENERIC.get(w);
    if (gen) {
      tests.push(inCat(gen));
      continue;
    }
    if (base.some(literal(w))) {
      tests.push(literal(w));
      continue;
    }
    // 品目の名前を含む語（「コンパクトシャワーチェア」＝シャワーチェアの品目で、名前に「コンパクト」のある商品）
    const g = generic.find((k) => w.includes(k));
    if (g) {
      tests.push(inCat(GENERIC.get(g)!));
      const rest = w.replace(g, '');
      if (rest && base.some(literal(rest))) tests.push(literal(rest));
      else if (rest) unmatched.push(raw);
      continue;
    }
    const gc = guessCategory(raw);
    if (gc.category) tests.push(inCat(gc));
    else unmatched.push(raw);
  }
  // 絞れた語が1つもなければ、名前では絞っていない（byName は false。使えなかった語は unmatched で知らせる）
  const hits = tests.length ? base.filter((p) => tests.every((t) => t(p))) : [];
  return hits.length ? {items: hits, category, sub, byName: true, unmatched} : {items: base, category, sub, byName: false, unmatched};
}

/** 商品検索の「ひじ掛け」の語（肘付き・肘掛け付・ひじあり・アーム付・アームレスト／肘なし・ひじ掛けなし）。looseKey のあと（カタカナ）の字で見る */
// looseKey は「ー」を除くので、アームレスト・アーム付は「アムレスト」「アム付キ」で見る
const ARM_WORD = /(?:肘|ヒジ)(?:掛ケ|掛|カケ)?(?:付キ|付|ツキ|アリ|有リ|有|ナシ|無シ|無)?|アムレスト|アム(?:付キ|付|ツキ|アリ|ナシ|無シ|無)/;

/**
 * ひじ掛けがあるか：true＝あり、false＝なし、null＝カタログのアイコンで分からない。シャワーチェア・シャワーベンチは「ひじ掛け」のアイコン（黒＝あり・灰色＝なし）、
 * シャワーキャリー・ポータブルトイレは「ひじ掛け跳ね上げ・昇降・着脱・高さ調整」のどれかがあれば、ひじ掛けのある商品（2026-11-09。catalogFeatures.ts）
 */
export function armrestOf(p: Pick<CatalogProduct, 'features'>): boolean | null {
  const f = p.features;
  if (!f) return null;
  if ('ひじ掛け' in f) return f['ひじ掛け'];
  return Object.entries(f).some(([k, v]) => k.startsWith('ひじ掛け') && v) ? true : null;
}

/**
 * 品番（種類）で変わる機能：アイコンは商品（囲み）に1組だけなので、種類の言葉で分かれているときは、その言葉のある品番だけの機能
 * （p.174 さわやかチェア 泉II・PT：「ひじ掛け跳ね上げ」のアイコンは黒でも、8252「肘掛け 自在タイプ」は跳ね上げではない。2026-11-09 の検品）
 */
const VARIANT_FEATURE: Record<string, RegExp> = {'ひじ掛け跳ね上げ': /はね上げ|跳ね上げ|はねあげ|跳上/};

/**
 * 一覧・色を選ぶ欄・入れた商品の欄に出す機能の札（ひじ掛けあり／なし は必ず。ほかは「あり」のものだけ）。
 * v を渡すと、その品番に当たる札だけ（品番で変わる機能）。渡さないときは「（はね上げタイプのみ）」のように書く
 */
export function featureBadges(p: Pick<CatalogProduct, 'features'> & {variants?: Pick<CatalogVariant, 'label'>[]}, v?: Pick<CatalogVariant, 'label'>): {text: string; tone: 'yes' | 'no' | 'info'}[] {
  const out: {text: string; tone: 'yes' | 'no' | 'info'}[] = [];
  const arm = armrestOf(p);
  if (arm === true && p.features && 'ひじ掛け' in p.features) out.push({text: 'ひじ掛けあり', tone: 'yes'});
  if (arm === false) out.push({text: 'ひじ掛けなし', tone: 'no'});
  for (const [k, on] of Object.entries(p.features ?? {})) {
    if (!on || k === 'ひじ掛け') continue;
    const re = VARIANT_FEATURE[k];
    const labels = (p.variants ?? []).map((x) => x.label);
    const split = re && labels.some((l) => re.test(l)) && labels.some((l) => !re.test(l));
    if (!split) out.push({text: k, tone: 'info'});
    else if (!v) out.push({text: `${k}（${re.exec(labels.find((l) => re.test(l))!)![0]}の品番のみ）`, tone: 'info'});
    else if (re.test(v.label)) out.push({text: k, tone: 'info'});
  }
  return out;
}

/**
 * カタログの印刷で初めにチェックするページ（CATALOG の順の番号）。商品ごとに：品番の載っているページ、なければ種目・項目名・メーカーで絞った
 * 商品（catalogFilter。商品検索と同じ）のページ（ユーザーの指示「該当の項目で絞ったら絞ったものだけを表示するようにする。現在は、自分でチェックする形式」
 * 2026-11-01）。項目名に合う商品がないとき・カタログを読めないときは今までの選び方（catalogPicks：商品名の言葉・細目とメーカー）
 */
export function salePages(items: (CatalogFilter & Pick<SaleItem, 'code'>)[], codes: (Set<string> | null)[], products: CatalogProduct[]): Set<number> {
  const out = new Set<number>();
  for (const it of items) {
    const byCode = catalogPicks([{name: '', maker: '', sub: '', code: it.code}], codes);
    if (byCode.size) {
      for (const i of byCode) out.add(i);
      continue;
    }
    const name = (it.name || '').trim();
    if (products.length && (it.category || name || (it.maker || '').trim())) {
      const f = catalogFilter(products, it);
      if (f.byName || !name) {
        for (const pg of catalogPagesOf(f.items)) {
          const i = CATALOG.findIndex((c) => c.page === pg);
          if (i >= 0) out.add(i);
        }
        continue;
      }
    }
    for (const i of catalogPicks([it], codes)) out.add(i);
  }
  return out;
}

/** 絞った商品の載っているカタログのページ（ページの番号。カタログの窓をそのページだけにする） */
export const catalogPagesOf = (list: CatalogProduct[]) => [...new Set(list.map((p) => p.page))].sort((a, b) => a - b);

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

/**
 * カタログの品番を選んだときに、商品の欄に入れる値（商品名は見出しに色・大きさを足したもの。販売金額は定価×割引率＝設定の割引率に戻す）。
 * 前の商品の仕切・仕入先・手で直した備考（算出根拠）・利益率から出た割引率も消す（前は残っていて、選び直した商品の単価・利益・見積書の備考が前の商品のままだった）
 */
export function catalogItemPatch(p: CatalogProduct, v: CatalogVariant, item: Pick<SaleItem, 'category' | 'sub' | 'maker'>, discountRate: number): Partial<SaleItem> {
  const category = p.category || item.category;
  return {
    productId: null,
    cost: 0,
    supplier: '',
    discountRate,
    basisNote: null,
    name: [p.name, v.label].filter(Boolean).join(' '),
    maker: p.maker || item.maker,
    code: v.code,
    tais: v.tais,
    listPrice: v.listPrice,
    unitPrice: null,
    category,
    sub: p.sub || item.sub,
    // 税区分もカタログのとおり（金額の横の「非課税」。歩行器・多点杖など）。前は前の商品の税区分（初めは 10%）のままで、
    // 非課税の多点杖の税込が1割増しになっていた（ユーザーの指示「歩行器（ピックアップ）や四点杖は非課税。カタログの横にも記載してある」2026-11-03）
    taxType: p.taxFree ? '非課税' : taxOf(category, '10%'),
    taxByHand: false,
  };
}

/** 介援隊の注文番号（261-S0100 など）。この番号のある PDF は介援隊のカタログとして読む */
export const isKaientaiOrder = (s: string) => /^\d{3}-[A-Z]\d{4}$/.test(s);

/**
 * 商品マスタの取り込み（components/ImportDialog.tsx）で、介援隊のカタログの PDF を読んだときの候補（品番ごとに1行）。
 * カタログの金額は定価（税抜）。仕切は空欄（ユーザーの指示「カタログにのっているのは、定価です。販売価格は、そこから20パーセント引がデフォルト、
 * 仕切りは空白で良い」2026-11-01。前は表として読み、定価を仕切に入れていた）。種目は「介・購入」の印と商品名で決め（catalogCategory）、
 * 決まったものだけ初めからチェックする（すべり止めマットなど介護保険の対象外のものは、チェックを付ければ取り込める）
 */
export function catalogCandidates(products: CatalogProduct[], defaultMaker = ''): Candidate[] {
  const out: Candidate[] = [];
  products.forEach((p) =>
    p.variants.forEach((v, i) => {
      const listPrice = v.listPrice > 0 ? v.listPrice : null;
      out.push({
        key: `c${p.key}:${i}`,
        row: p.page,
        name: [p.name, v.label].filter(Boolean).join(' '),
        price: null,
        listPrice,
        code: v.code || v.orderCode,
        maker: p.maker || defaultMaker,
        unit: '',
        tais: v.tais,
        jan: '',
        taxType: p.taxFree ? '非課税' : '10%',
        taxKnown: true,
        category: p.category,
        sub: p.sub,
        warn: p.category ? '' : p.note,
        include: !!p.category && listPrice !== null,
        favorite: false,
      });
    }),
  );
  return out;
}
