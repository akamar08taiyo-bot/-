// カタログの機能アイコンの札（ひじ掛けあり／ひじ掛けなし・ひじ掛け跳ね上げ・座面回転 など）。商品検索の一覧・色を選ぶ欄・カタログの窓・入れた商品の欄で同じ見た目
// （2026-11-09 のユーザーの指摘：ユクリア コンパクトで、肘付きを見積もるはずが肘なしの型番が入った。一覧に肘掛けの有無が出ていなかった）
import {featureBadges} from '../catalogItems.ts';
import type {CatalogProduct, CatalogVariant} from '../catalogItems.ts';

/** variant を渡すと、その品番に当たる札だけ（はね上げタイプの品番だけ「ひじ掛け跳ね上げ」など） */
export function FeatureBadges({product, variant, className = ''}: {product: Pick<CatalogProduct, 'features' | 'variants'>; variant?: Pick<CatalogVariant, 'label'>; className?: string}) {
  const list = featureBadges(product, variant);
  if (!list.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {list.map((b) => (
        <span
          key={b.text}
          className={`whitespace-nowrap rounded px-1 text-[11px] leading-5 ${b.tone === 'yes' ? 'bg-sky-100 text-sky-900' : b.tone === 'no' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}
        >
          {b.text}
        </span>
      ))}
    </span>
  );
}
