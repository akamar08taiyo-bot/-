// 「🔢 型番から入力」の照らし合わせ（画面は components/CodeLookup.tsx）。ユーザーの指示「型番から商品をひっぱってくるのは、絶対に検索をまちがってもらっては困るので、
// 確実に該当商品に当たるかを照らし合わせる」2026-11-03：型番が「ぴったり同じ」商品だけ（全角・半角、大文字・小文字、空白とハイフンの違いだけは同じとみなす。
// 前方一致・あいまいな一致はしない）
import type {CatalogProduct, CatalogVariant} from './catalogItems.ts';
import {taxOf} from './calc.ts';
import {catalogItemPatch, featureBadges} from './catalogItems.ts';
import {productRate} from './sales.ts';
import type {Product, SaleItem, Settings} from './types.ts';

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
export function findByCode(code: string, catalog: CatalogProduct[], products: Product[], item: Pick<SaleItem, 'category' | 'sub' | 'maker'>, settings: Pick<Settings, 'discountRate'>): CodeHit[] {
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
      // 割引率は商品で決めた割引率（なければ設定の割引率。★ お気に入りから・商品マスタから入れたときと同じ productRate）。手で直した備考も自動に戻す
      patch: {name: p.name, maker: p.maker, code: p.code, tais: p.tais, category: p.category || item.category, sub: p.sub || item.sub, listPrice: p.listPrice, cost: p.cost, taxType: taxOf(p.category || item.category, p.taxType), taxByHand: false, unit: p.unit || '台', supplier: p.supplier, unitPrice: null, discountRate: productRate(p, settings), basisNote: null},
    });
  }
  for (const p of catalog)
    (p.variants as CatalogVariant[]).forEach((v, i) => {
      if (codeMatchKey(v.code) !== want && (!v.orderCode || codeMatchKey(v.orderCode) !== want)) return;
      const patch = catalogItemPatch(p, v, item, settings.discountRate);
      // 同じ品番で色・大きさのちがうもの（p.154 EA4-102 の4色、p.51 0973 の M と L など）も別々に出す（何番目かで見分ける。2026-11-09）
      add(patch.name ?? p.name, patch.maker ?? p.maker, {key: `c:${p.key}:${i}:${v.code}`, label: [patch.name, patch.maker, v.code, `カタログ p.${p.page}`, featureBadges(p, v).map((b) => b.text).join('・')].filter(Boolean).join('　'), patch});
    });
  return out;
}
