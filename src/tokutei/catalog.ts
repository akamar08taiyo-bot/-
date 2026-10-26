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
  maker?: RegExp; // 細目で選ぶのは、このメーカーの商品（か、メーカーが空の商品）だけ
  words?: RegExp; // 商品名にこの言葉があれば入れる
};

const PORTABLE_TOILET = '移動できる便器（ポータブルトイレ）';

export const CATALOG: CatalogPage[] = [
  {file: 'kaientai-p045.pdf', page: 45, title: '浴槽手すり・バスボード', subs: ['浴槽用手すり', '入浴台']},
  {file: 'kaientai-p047.pdf', page: 47, title: 'すべり止めマット', words: /すべり止め|滑り止め/},
  {file: 'kaientai-p050.pdf', page: 50, title: 'シャワーキャリー', words: /シャワーキャリー/},
  {file: 'kaientai-p173.pdf', page: 173, title: 'ポータブルトイレ（安寿）', subs: [PORTABLE_TOILET], maker: /アロン|安寿/},
  {file: 'kaientai-p177.pdf', page: 177, title: 'ポータブルトイレ（パナソニック）', subs: [PORTABLE_TOILET], maker: /パナソニック|panasonic/i},
];

export const catalogLabel = (p: CatalogPage) => `p.${p.page} ${p.title}`;

/** 品番の見くらべ：全角・大文字小文字・ハイフンのちがいは同じに見る */
export const codeKey = (s: string) =>
  (s || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-‐‑–—―ー−]/g, '');

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
 * 見積もりの商品が載っているページ（初めから印刷するページ）。品番がページにあればそのページ、なければ細目（種目の中の分類）と
 * メーカー、商品名の言葉で選ぶ。codes は、ページごとの品番（pageCodes。読めていないページは null）
 */
export function catalogPicks(items: Pick<SaleItem, 'name' | 'maker' | 'code' | 'sub'>[], codes: (Set<string> | null)[] = []): Set<number> {
  const picks = new Set<number>();
  for (const it of items) {
    const code = codeKey(it.code);
    const byCode = code.length >= 4 ? CATALOG.map((_, i) => i).filter((i) => codes[i]?.has(code)) : [];
    if (byCode.length) {
      for (const i of byCode) picks.add(i);
      continue;
    }
    const name = (it.name || '').normalize('NFKC');
    const sub = it.sub || guessCategory(it.name).sub;
    const maker = (it.maker || '').normalize('NFKC');
    CATALOG.forEach((p, i) => {
      if (p.words?.test(name)) picks.add(i);
      else if (sub && p.subs?.includes(sub) && (!p.maker || !maker || p.maker.test(maker) || p.maker.test(name))) picks.add(i);
    });
  }
  return picks;
}

/** 印刷の画面の題（PDF に保存するときの名前の元。「見本 花子様 カタログ」） */
export const catalogTitle = (sale: Pick<Sale, 'customer'>) => estimateBaseName(sale).replace(/販売見積書$/, 'カタログ');
