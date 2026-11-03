// 「🔢 型番から入力」の照らし合わせ（画面は components/CodeLookup.tsx）。ユーザーの指示「型番から商品をひっぱってくるのは、絶対に検索をまちがってもらっては困るので、
// 確実に該当商品に当たるかを照らし合わせる」2026-11-03：型番が「ぴったり同じ」商品だけ（全角・半角、大文字・小文字、空白とハイフンの違いだけは同じとみなす。
// 前方一致・あいまいな一致はしない）
import type {CatalogProduct, CatalogVariant} from './catalogItems.ts';
import {taxOf} from './calc.ts';
import {catalogItemPatch} from './catalogItems.ts';
import type {Product, SaleItem} from './types.ts';

/**
 * 型番の比べ方：全角→半角・大文字にして、空白とハイフン類を除く（「pn-l41431d」「ＰＮ－Ｌ41431Ｄ」「PNL41431D」は同じ）。
 * 日本語の入力のまま打った「ＢＤー１３２」の「ー」も、英数字のあいだならハイフンとみる（ユーザーの指示「型番入力では、-がなくてもリストがでるようにする」2026-11-03）
 */
export const codeMatchKey = (s: string) =>
  s
    .normalize('NFKC')
    .toUpperCase()
    .replace(/([A-Z0-9])\u30fc(?=[A-Z0-9])/g, '$1')
    .replace(/[\s\-\u2010-\u2015\u2212]/g, '');

export type CodeHit = {key: string; label: string; patch: Partial<SaleItem>};

/** 型番がぴったり同じ商品（商品マスタ → カタログの順。同じ商品名・メーカーは1つにまとめる） */
export function findByCode(code: string, catalog: CatalogProduct[], products: Product[], item: Pick<SaleItem, 'category' | 'sub' | 'maker'>): CodeHit[] {
  const want = codeMatchKey(code);
  if (want.length < 3) return [];
  const out: CodeHit[] = [];
  const seen = new Set<string>();
  const add = (name: string, maker: string, hit: CodeHit) => {
    const k = `${name.normalize('NFKC').replace(/\s+/g, '')}|${maker.normalize('NFKC').replace(/\s+/g, '')}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(hit);
  };
  for (const p of products) {
    if (!p.code.trim() || codeMatchKey(p.code) !== want) continue;
    add(p.name, p.maker, {
      key: `m:${p.id}`,
      label: [p.name, p.maker, p.code].filter(Boolean).join('　'),
      patch: {name: p.name, maker: p.maker, code: p.code, tais: p.tais, category: p.category || item.category, sub: p.sub || item.sub, listPrice: p.listPrice, cost: p.cost, taxType: taxOf(p.category || item.category, p.taxType), taxByHand: false, unit: p.unit || '台', supplier: p.supplier, unitPrice: null},
    });
  }
  for (const p of catalog)
    for (const v of p.variants as CatalogVariant[]) {
      if (codeMatchKey(v.code) !== want && (!v.orderCode || codeMatchKey(v.orderCode) !== want)) continue;
      const patch = catalogItemPatch(p, v, item);
      add(patch.name ?? p.name, patch.maker ?? p.maker, {key: `c:${p.key}:${v.code}`, label: [patch.name, patch.maker, v.code, `カタログ p.${p.page}`].filter(Boolean).join('　'), patch});
    }
  return out;
}
