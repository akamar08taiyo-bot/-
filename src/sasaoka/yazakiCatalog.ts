// 矢崎化工のカタログ（いただいた PDF の p.12〜81）を見積書の部材を選ぶ画面で開き、ページの品番を押すと部材が入る
// （ユーザーの指示「カタログの商品をクリックしたら、商品の内容が入るようにする。特定福祉用具と同様の機能」「カタログは様々商品がのっているため、
// 該当の商品のみでもよいため、リンクで商品検索や商品名、型番等をひっぱってこれるようにしたい」2026-11-04。PDF は「矢崎かこうのカタログです」）。
// PDF のページは絵だけ（文字がない）なので、品番とその位置は読み取り（OCR）で作った yazakiCatalogData.ts。金額は持たない
// （ユーザーの指示「リポジトリに仕入れや定価は残さない」）。商品名・定価・仕切は、部材リスト（矢崎化工の価格表から取り込んだもの）の同じ品番から入れる。
// ページの絵は太陽ポータルの jutaku-mitsumori/catalog/yazaki-p013.jpg など（リポジトリの catalog-yazaki/ を置く。両方の入口から同じ絵を見る）。
import {YAZAKI_PAGES} from './yazakiCatalogData.ts';
import type {Material} from './types.ts';

export type CatalogCode = {code: string; x: number; y: number; w: number; h: number}; // 位置はページの幅・高さの割合
export type YazakiPage = {page: number; codes: CatalogCode[]};

export const yazakiPages: YazakiPage[] = YAZAKI_PAGES.map((p) => ({
  page: p.page,
  codes: p.codes.map(([code, x, y, w, h]) => ({code, x, y, w, h})),
}));

/** ページの絵（ポータルの jutaku-mitsumori/ と sasaoka/ のどちらから開いても同じ所） */
export const yazakiImage = (page: number) => `../jutaku-mitsumori/catalog/yazaki-p${String(page).padStart(3, '0')}.jpg`;

/** 品番をくらべる形（全角・半角、空白・ハイフン・大文字小文字のちがいは見ない） */
export const codeKey = (s: string) =>
  s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s\-‐‑‒–—―ー－]/g, '');

/** 矢崎化工の部材か（メーカー名） */
export const isYazaki = (m: Pick<Material, 'maker'>) => /矢崎/.test(m.maker.normalize('NFKC'));

/**
 * カタログの品番に合う部材リストの部材。同じ品番があればそれだけ。なければ、品番の頭が同じ部材（施工イメージのページの「ECL-5049」は
 * 色の記号のない品番なので、ECL-5049 USL・ECL-5049 SGD … のどれか。押した人が色を選ぶ）
 */
export function catalogMaterials(materials: Material[], code: string): Material[] {
  const k = codeKey(code);
  if (!k) return [];
  const exact = materials.filter((m) => m.code && codeKey(m.code) === k);
  if (exact.length) return exact;
  return materials.filter((m) => m.code && codeKey(m.code).startsWith(k) && /^[A-Z]/.test(codeKey(m.code).slice(k.length)));
}

/** 部材が載っているカタログのページ（品番がぴったり同じか、カタログの品番が色の記号のない頭のとき）。いちばん前のページ */
export function yazakiPageOf(m: Pick<Material, 'code'>): {page: number; code: string} | null {
  const k = codeKey(m.code);
  if (!k) return null;
  let head: {page: number; code: string} | null = null;
  for (const p of yazakiPages)
    for (const c of p.codes) {
      const ck = codeKey(c.code);
      if (ck === k) return {page: p.page, code: c.code};
      if (!head && k.startsWith(ck) && ck.length >= 6 && /^[A-Z]/.test(k.slice(ck.length))) head = {page: p.page, code: c.code};
    }
  return head;
}

/** 品番・商品名で探す：合う品番の載っているページ（部材リストの商品名からも探す） */
export function yazakiSearch(query: string, materials: Material[]): number[] {
  const q = codeKey(query);
  if (!q) return yazakiPages.map((p) => p.page);
  const byName = materials.filter((m) => m.code && codeKey(m.name).includes(q)).map((m) => codeKey(m.code));
  return yazakiPages
    .filter((p) => p.codes.some((c) => codeKey(c.code).includes(q) || byName.some((k) => k === codeKey(c.code) || k.startsWith(codeKey(c.code)))))
    .map((p) => p.page);
}
