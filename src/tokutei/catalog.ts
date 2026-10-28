// 介援隊のカタログのページを、販売見積書・申請書の画面から選んで印刷する（ユーザーの指示「販売見積書、申請書を作成するとき…
// 介援隊カタログの PDF の印刷…各項目ごとに印刷がしやすいように」2026-10-26。PDF はユーザーからいただいたもの。ネットでも見られるカタログ）。
// PDF は1ページずつ public-tokutei/catalog/ に置き、ビルドで dist-tokutei/catalog/ に出る（ポータルの tokutei/catalog/。アプリの index.html には入れない）。
// ページを足すときは PDF を置いて、ここに1行足す。
import {guessCategory} from './category.ts';
import {estimateBaseName} from './estimateBook.ts';
import type {Sale, SaleItem} from './types.ts';

export type CatalogPage = {
  file: string; // catalog/ の中のファイル名
  page: number; // カタログのページ番号
  title: string;
  subs?: string[]; // この細目の商品があれば、初めから印刷するページに入れる
  maker?: RegExp; // このメーカーの商品（か、メーカーが空の商品）だけ
  words?: RegExp; // 商品名にこの言葉があれば、このページだけ（同じ細目のほかのページは入れない）
};

const PORTABLE_TOILET = '移動できる便器（ポータブルトイレ）';
const ANJU = /アロン|安寿/;

/** ページの並び（印刷の画面のチェックの順）。入浴の用具 → 腰掛便座 → 固定用スロープ。2026-10-26 にユーザーから p.37・40・43・44・172・178・179、2026-10-28 に p.214 をいただいて足した */
export const CATALOG: CatalogPage[] = [
  {file: 'kaientai-p037.pdf', page: 37, title: 'シャワーベンチ（安寿）', subs: ['入浴用いす'], maker: ANJU},
  {file: 'kaientai-p040.pdf', page: 40, title: 'シャワーチェア（パナソニック ユクリア）', subs: ['入浴用いす'], maker: /パナソニック|panasonic|ユクリア/i},
  {file: 'kaientai-p043.pdf', page: 43, title: '浴槽台（パナソニック ユクリア）', subs: ['浴槽内いす'], maker: /パナソニック|panasonic|ユクリア/i},
  {file: 'kaientai-p044.pdf', page: 44, title: '浴槽台・浴槽手すり（安寿）', subs: ['浴槽内いす', '浴槽用手すり'], maker: ANJU},
  // 浴槽手すりがパナソニック（入浴グリップ ユクリア）と分かるように（ユーザーの指示「浴槽手すりがパナソニックであることがわかるようにする」2026-10-28）
  {file: 'kaientai-p045.pdf', page: 45, title: '浴槽手すり・バスボード（パナソニック）', subs: ['浴槽用手すり', '入浴台']},
  {file: 'kaientai-p047.pdf', page: 47, title: 'すべり止めマット', words: /すべり止め|滑り止め/},
  {file: 'kaientai-p050.pdf', page: 50, title: 'シャワーキャリー', words: /シャワーキャリー/},
  {file: 'kaientai-p172.pdf', page: 172, title: '家具調トイレ（安寿）', subs: [PORTABLE_TOILET], maker: ANJU},
  {file: 'kaientai-p173.pdf', page: 173, title: '家具調トイレ セレクトS（安寿）', subs: [PORTABLE_TOILET], maker: ANJU},
  {file: 'kaientai-p177.pdf', page: 177, title: 'ポータブルトイレ（パナソニック）', subs: [PORTABLE_TOILET], maker: /パナソニック|panasonic/i},
  {file: 'kaientai-p178.pdf', page: 178, title: 'ポータブルトイレ FX-30（安寿）', maker: ANJU, words: /FX-?30|マルチアシスト/i},
  {
    file: 'kaientai-p179.pdf',
    page: 179,
    title: '据置式便座・ポータブルトイレ（安寿）',
    subs: ['和式便器を腰掛式にするもの'],
    maker: /アロン|安寿|新輝/,
    words: /サニタリエース|据置(式)?便座|楽立|FX-?CP|ポータブルトイレ\s*S型/i,
  },
  // 固定用スロープ（2024年4月から特定福祉用具にも。段差解消スロープ）。ユーザーの指示「スロープのカタログも追加してください」2026-10-28。
  // 品番・申込番号がページにあればこのページ（catalogPicks）。なければ商品名に「スロープ」「段差解消」があればこのページ（ダンスロープ・インタースロープ・エコ段差スロープ など）
  {file: 'kaientai-p214.pdf', page: 214, title: '段差解消スロープ', words: /スロープ|段差解消/},
];

export const catalogLabel = (p: CatalogPage) => `p.${p.page} ${p.title}`;

/** 品番の見くらべ：全角・大文字小文字・ハイフンのちがいは同じに見る */
export const codeKey = (s: string) =>
  (s || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-‐‑–—―ー−]/g, '');

const plain = (s: string) => (s || '').normalize('NFKC').replace(/\s+/g, '').toUpperCase();

/**
 * 「カタログから検索」（print/CatalogViewer.tsx）：打った語のどれもが、ページの名前・ページの文字・品番のどれかにあるページ。空なら全部。
 * pdf.js のページの文字は1字ずつ空白で区切られることがあるので、空白を除いて見くらべる。品番は全角・ハイフンのちがいも同じ（4字以上のとき）
 */
export function catalogMatches(query: string, texts: readonly (string | null)[]): number[] {
  const words = (query || '').normalize('NFKC').split(/\s+/).filter(Boolean);
  const all = CATALOG.map((_, i) => i);
  return all.filter((i) =>
    words.every((w) => {
      const q = plain(w);
      const code = codeKey(w);
      const text = texts[i] ?? '';
      return plain(catalogLabel(CATALOG[i])).includes(q) || plain(text).includes(q) || (code.length >= 4 && codeKey(text).includes(code));
    }),
  );
}

/** ページの文字から品番らしい語（英字か数字を4字以上ふくむ語。金額の「35,000」は除く）を集める（見くらべ用） */
export function pageCodes(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.normalize('NFKC').split(/[\s、／/()（）［］[\]]+/)) {
    if (/^[¥￥]?\d{1,3}(,\d{3})+円?$/.test(w)) continue;
    const k = codeKey(w);
    if (/[A-Z0-9]/.test(k) && k.replace(/[^A-Z0-9]/g, '').length >= 4) out.add(k);
  }
  return out;
}

/**
 * 見積もりの商品が載っているページ（初めから印刷するページ）。品番がページにあればそのページ。なければ商品名の言葉（FX-30・サニタリエース など
 * そのページにしかない名前）で選び、それもなければ細目（種目の中の分類）とメーカーで選ぶ。codes は、ページごとの品番（pageCodes。読めていないページは null）
 */
export function catalogPicks(items: Pick<SaleItem, 'name' | 'maker' | 'code' | 'sub'>[], codes: (Set<string> | null)[] = []): Set<number> {
  const picks = new Set<number>();
  const all = CATALOG.map((_, i) => i);
  for (const it of items) {
    const code = codeKey(it.code);
    const byCode = code.length >= 4 ? all.filter((i) => codes[i]?.has(code)) : [];
    const name = (it.name || '').normalize('NFKC');
    const sub = it.sub || guessCategory(it.name).sub;
    const maker = (it.maker || '').normalize('NFKC');
    const makerOk = (p: CatalogPage) => !p.maker || !maker || p.maker.test(maker) || p.maker.test(name);
    const byWords = all.filter((i) => CATALOG[i].words?.test(name) && makerOk(CATALOG[i]));
    const bySub = sub ? all.filter((i) => CATALOG[i].subs?.includes(sub) && makerOk(CATALOG[i])) : [];
    for (const i of byCode.length ? byCode : byWords.length ? byWords : bySub) picks.add(i);
  }
  return picks;
}

/** 印刷の画面の題（PDF に保存するときの名前の元。「見本 花子様 カタログ」） */
export const catalogTitle = (sale: Pick<Sale, 'customer'>) => estimateBaseName(sale).replace(/販売見積書$/, 'カタログ');
