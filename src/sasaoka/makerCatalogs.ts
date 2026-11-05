// メーカーのカタログ（いただいた PDF）を見積書の部材を選ぶ画面で開き、ページの品番を押すと部材が入る
// （ユーザーの指示「カタログの商品をクリックしたら、商品の内容が入るようにする。特定福祉用具と同様の機能」「カタログは様々商品がのっているため、
// 該当の商品のみでもよいため、リンクで商品検索や商品名、型番等をひっぱってこれるようにしたい」2026-11-04）。
// ・矢崎化工（「矢崎かこうのカタログです」p.12〜81）：PDF のページは絵だけなので、品番と位置は読み取り（scripts/yazaki-catalog/）で作った yazakiCatalogData.ts
// ・TOTO（「TOTOカタログです」手すりカタログ 104ページ）：PDF の文字と位置を pdf.js で読んで作った totoCatalogData.ts（scripts/maker-catalog/）
// ・マツ六（「マツ六のPDFカタログです」手すりカタログ Vol.8 100ページ）：TOTO と同じ作り（matsu6CatalogData.ts）。表の「商品コード｜品番」のどちらを押しても入る
// 金額は持たない（ユーザーの指示「リポジトリに仕入れや定価は残さない」）。商品名・定価・仕切は、部材リスト（メーカーの価格表から取り込んだもの）の同じ品番から入れる。
// ページの絵は太陽ポータルの jutaku-mitsumori/catalog/yazaki-p013.jpg・toto-p012.jpg・matsu6-p005.jpg など（リポジトリの catalog-yazaki/・catalog-toto/・catalog-matsu6/ を置く）。
import {YAZAKI_PAGES} from './yazakiCatalogData.ts';
import {TOTO_PAGES} from './totoCatalogData.ts';
import {MATSU6_PAGES} from './matsu6CatalogData.ts';
import type {Material} from './types.ts';

export type CatalogCode = {code: string; x: number; y: number; w: number; h: number}; // 位置はページの幅・高さの割合
export type CatalogPage = {page: number; codes: CatalogCode[]};
export type BookId = 'yazaki' | 'toto' | 'matsu6';
export type CatalogBook = {
  id: BookId;
  maker: string; // 部材リストのメーカー名・画面の名前
  pages: CatalogPage[];
  image: (page: number) => string;
  isMaker: (maker: string) => boolean;
  /**
   * 色ちがいの見つけ方。suffix＝品番のうしろに色の記号（矢崎化工「ECL-5049」→「ECL-5049 USL」）。
   * hash＝「#」のうしろが色（TOTO「YHB203#NW1」の色ちがいは「YHB203#EL」。カタログには1色だけ載っているので、押すと同じ品番の色を選ぶ）
   */
  variants: 'suffix' | 'hash';
  /**
   * 初めに開くページ（品番から開いたときはそのページ）。ユーザーの指示（2026-11-05）「マツ六カタログのデフォルトは43Pにする」「TOTOは24Pがデフォルト」
   * 「矢崎はデフォルトが12P」。なければ最初のページ
   */
  startPage?: number;
  /**
   * 目次（押すとそのページへ。ユーザーの指示「カタログは目次みたいな感じで飛べるようにする。例えば、マツ六であれば、ベースプレート、屋内手すり、
   * ブラケットみたいな感じ」「矢崎であれば、屋外手すり、屋外支柱など」「TOTOであれば、浴室手すり、浴室手すり（ユニットバス用）など」2026-11-05）。
   * ページの見出し・横の見出し（マツ六の 屋外／水まわり／室内／福祉用具、矢崎化工の 屋外／屋内／浴室手すり部材）から作った。page はその見出しの始まるページ（ページの順）
   */
  toc: {title: string; page: number}[];
};

const pagesOf = (raw: {page: number; codes: [string, number, number, number, number][]}[]): CatalogPage[] =>
  raw.map((p) => ({page: p.page, codes: p.codes.map(([code, x, y, w, h]) => ({code, x, y, w, h}))}));
/** ページの絵（ポータルの jutaku-mitsumori/ と sasaoka/ のどちらから開いても同じ所） */
const imageOf = (head: string) => (page: number) => `../jutaku-mitsumori/catalog/${head}-p${String(page).padStart(3, '0')}.jpg`;
const nfkc = (s: string) => s.normalize('NFKC');

// 並びはボタンの並び（いちばん前が初めに開くカタログ。よく使うマツ六を先頭に。ユーザーの「マツ六、TOTO 、矢崎です」2026-11-04 の順）
export const BOOKS: CatalogBook[] = [
  {
    id: 'matsu6',
    maker: 'マツ六',
    pages: pagesOf(MATSU6_PAGES),
    image: imageOf('matsu6'),
    isMaker: (m) => /マツ六|matsu-?roku/i.test(nfkc(m)),
    variants: 'suffix',
    startPage: 43,
    toc: [
      {title: '屋外手すり（フリーRレール）', page: 5},
      {title: '屋外支柱', page: 6},
      {title: 'ベースプレート式支柱', page: 7},
      {title: '屋外ブラケット・ジョイント', page: 11},
      {title: '屋外手すり（ストレートEZ）', page: 17},
      {title: '浴室手すり（ユニットバス）', page: 21},
      {title: '浴室手すり（ソフトアクアレール）', page: 22},
      {title: '浴室手すり（ステンアクアレール）', page: 28},
      {title: '浴室手すり（ソフトハンド）', page: 32},
      {title: '屋内手すり（I型・L型）', page: 34},
      {title: '屋内手すり棒', page: 38},
      {title: '木製ベースプレート', page: 40},
      {title: 'ブラケット（35）', page: 42},
      {title: 'ブラケット（32）', page: 48},
      {title: '遮断機式ブラケット', page: 54},
      {title: '脱着手すりブラケット', page: 56},
      {title: '室内用手すり支柱', page: 58},
      {title: 'アウトセット折戸', page: 62},
      {title: '置き型手すり（たよレール）', page: 65},
    ],
  },
  {
    id: 'toto',
    maker: 'TOTO',
    pages: pagesOf(TOTO_PAGES),
    image: imageOf('toto'),
    isMaker: (m) => /TOTO|東陶/i.test(nfkc(m)),
    variants: 'hash',
    startPage: 24,
    toc: [
      {title: 'トイレ手すり', page: 11},
      {title: '浴室手すり', page: 19},
      {title: '浴室手すり（ユニットバス用）', page: 26},
      {title: '廊下・階段手すり（フリースタイル）', page: 33},
      {title: '上がりかまち手すり', page: 43},
      {title: '屋外手すり', page: 48},
      {title: 'パブリック用手すり', page: 56},
      {title: '取付方法', page: 82},
      {title: 'イージーオーダー', page: 93},
      {title: '品番索引', page: 102},
    ],
  },
  {
    id: 'yazaki',
    maker: '矢崎化工',
    pages: pagesOf(YAZAKI_PAGES),
    image: imageOf('yazaki'),
    isMaker: (m) => /矢崎/.test(nfkc(m)),
    variants: 'suffix',
    startPage: 12,
    toc: [
      {title: '屋外手すり（ネクステール）', page: 12},
      {title: '屋外支柱（ネクステール）', page: 15},
      {title: '屋外手すり（スタンダード）', page: 24},
      {title: '屋外支柱（スタンダード）', page: 29},
      {title: '屋内手すり（パイプ・木製丸棒）', page: 34},
      {title: '屋内ブラケット（テナシス）', page: 38},
      {title: '屋内ブラケット（スタンダード35）', page: 45},
      {title: '屋内支柱（トールスタンド）', page: 55},
      {title: '屋内ブラケット（スタンダード32）', page: 60},
      {title: '浴室手すり（インナー）', page: 68},
      {title: '浴室手すり（アウター）', page: 73},
      {title: '可動式手すり', page: 79},
    ],
  },
];

/** そのページの目次の見出し（そのページより前で、いちばん近い見出し。最初の見出しより前のページは null） */
export function tocOf(book: Pick<CatalogBook, 'toc'>, page: number): {title: string; page: number} | null {
  let hit: {title: string; page: number} | null = null;
  for (const t of book.toc) if (t.page <= page) hit = t;
  return hit;
}
export const bookOf = (id: BookId) => BOOKS.find((b) => b.id === id) ?? BOOKS[0];

/** 品番をくらべる形（全角・半角、空白・ハイフン・大文字小文字のちがいは見ない。TOTO の色の「#」は残す） */
export const codeKey = (s: string) =>
  nfkc(s)
    .toUpperCase()
    .replace(/[\s\-‐‑‒–—―ー－]/g, '');
const baseOf = (k: string) => k.split('#')[0];

/**
 * カタログの品番に合う部材リストの部材。
 * 矢崎化工：同じ品番があればそれだけ。なければ、品番の頭が同じ部材（施工イメージのページの「ECL-5049」は色の記号のない品番なので、ECL-5049 USL・SGD … のどれか）。
 * TOTO：同じ品番と、「#」の前が同じ色ちがい（同じ品番がいちばん前）。1つだけならそれを入れ、2つ以上なら押した人が色を選ぶ
 */
export function catalogMaterials(materials: Material[], code: string, book: CatalogBook = BOOKS[0]): Material[] {
  const k = codeKey(code);
  if (!k) return [];
  const keyOf = (m: Material) => (m.code ? codeKey(m.code) : '');
  const exact = materials.filter((m) => keyOf(m) === k);
  if (book.variants === 'hash') {
    const base = baseOf(k);
    const colors = materials.filter((m) => keyOf(m) !== k && baseOf(keyOf(m)) === base);
    return [...exact, ...colors];
  }
  if (exact.length) return exact;
  return materials.filter((m) => keyOf(m).startsWith(k) && /^[A-Z]/.test(keyOf(m).slice(k.length)));
}

/** 部材が載っているカタログとページ（品番が同じか、カタログの品番が色の記号のない頭・# の前が同じ）。メーカーのカタログの、いちばん前のページ */
export function catalogPageOf(m: Pick<Material, 'code' | 'maker'>): {book: BookId; page: number; code: string} | null {
  const k = codeKey(m.code);
  if (!k) return null;
  for (const book of BOOKS) {
    if (!book.isMaker(m.maker)) continue;
    let head: {book: BookId; page: number; code: string} | null = null;
    for (const p of book.pages)
      for (const c of p.codes) {
        const ck = codeKey(c.code);
        if (ck === k) return {book: book.id, page: p.page, code: c.code};
        if (head) continue;
        if (book.variants === 'hash' ? baseOf(ck) === baseOf(k) : k.startsWith(ck) && ck.length >= 6 && /^[A-Z]/.test(k.slice(ck.length))) head = {book: book.id, page: p.page, code: c.code};
      }
    if (head) return head;
  }
  return null;
}

/** 品番・商品名で探す：合う品番の載っているページ（部材リストの商品名からも探す） */
export function catalogSearch(book: CatalogBook, query: string, materials: Material[]): number[] {
  const q = codeKey(query);
  if (!q) return book.pages.map((p) => p.page);
  const byName = materials.filter((m) => m.code && book.isMaker(m.maker) && codeKey(m.name).includes(q)).map((m) => codeKey(m.code));
  const named = (ck: string) => byName.some((k) => k === ck || (book.variants === 'hash' ? baseOf(k) === baseOf(ck) : k.startsWith(ck)));
  return book.pages.filter((p) => p.codes.some((c) => codeKey(c.code).includes(q) || named(codeKey(c.code)))).map((p) => p.page);
}
