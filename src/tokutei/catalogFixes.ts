// 介援隊カタログの読み取りの直し（ユーザーの指示「カタログと商品が違ったものがあった。そこは絶対に間違わないでほしいので、徹底的に検査、確認する」
// 2026-11-09）。全26ページ・246商品・845品番を、ページの絵と1つずつ見くらべて、ページの書き方が特殊で読み取り（catalogItems.ts）では
// 正しく読めなかった商品だけをここに書く（品番が写真の横にしかない・1つの品番に M と L がある・品番がなく S と M で TAIS が分かれている など）。
// 金額は書かない（リポジトリに定価を残さない。読み取った金額をそのまま使う：from は、読み取った何番目の品番の金額・TAIS・注文番号を使うか）。
// 読み取った品番の並びが expect と同じときだけ直す（読み取りが変わったら直さない。test/tokutei/catalogItems.test.ts が全部の直しが当たるかを見る）
import type {CatalogProduct, CatalogVariant} from './catalogItems.ts';

export type CatalogFix = {
  page: number;
  /** 注文番号（261-W1257 など） */
  order: string;
  /** 読み取った品番（この並びのときだけ直す） */
  expect: string[];
  /** 直したあとの品番。code・tais を書かなければ、from の品番のまま */
  variants: {from: number; code?: string; label: string; tais?: string}[];
};

export const CATALOG_FIXES: CatalogFix[] = [
  // p.136 ミニフィット(超ミニ)：XS-0088 には種類の言葉がない（「後脚スタンド付」は XS-128S のもの）
  {page: 136, order: '261-W1356', expect: ['XS-0088', 'XS-128S', 'XS-148E'], variants: [{from: 0, label: ''}, {from: 1, label: '後脚スタンド付'}, {from: 2, label: 'キャスター付'}]},
  // p.137 Mg ウォーカー：品番はなく、S と M で TAIS が分かれている（各¥）
  {page: 137, order: '261-W2981', expect: ['261-W2981'], variants: [{from: 0, label: 'S', tais: '01105-000035'}, {from: 0, label: 'M', tais: '01105-000036'}]},
  {page: 137, order: '261-W1394', expect: ['261-W1394'], variants: [{from: 0, label: 'S', tais: '01105-000011'}, {from: 0, label: 'M', tais: '01105-000030'}]},
  {page: 137, order: '261-W1791', expect: ['261-W1791'], variants: [{from: 0, label: 'S', tais: '01105-000014'}, {from: 0, label: 'M', tais: '01105-000015'}]},
  // p.154 テイコブアルミ製 4点杖：品番は1つ（「EA4-」「102」の2行に割れている）。ブラックと、ほかの3色（各¥）で金額がちがう
  {
    page: 154,
    order: '261-W1257',
    expect: ['EA4-', '102'],
    variants: [
      {from: 0, code: 'EA4-102', label: 'ブラック'},
      {from: 1, code: 'EA4-102', label: 'チェックブラウン'},
      {from: 1, code: 'EA4-102', label: 'レッドフラワー'},
      {from: 1, code: 'EA4-102', label: 'ピンクフラワー'},
    ],
  },
  // p.154 品番が写真の横にしかない杖（各¥）。前は注文番号を品番にしていた
  {page: 154, order: '261-W2319', expect: ['261-W2319'], variants: [{from: 0, code: '77MC-S4', label: 'ストライプB'}, {from: 0, code: '77MC-C5', label: '桜エンジ'}]},
  {
    page: 154,
    order: '261-W1289',
    expect: ['261-W1289'],
    variants: [
      {from: 0, code: '70C-4', label: 'カーボン柄NB', tais: '00576-000031'},
      {from: 0, code: '70C-F4', label: '花柄NB', tais: '00576-000031'},
      {from: 0, code: '70C-C1', label: '格子BR', tais: '00576-000031'},
    ],
  },
  {page: 154, order: '261-W1867', expect: ['261-W1867'], variants: [{from: 0, code: 'WB3801', label: '花柄赤'}, {from: 0, code: 'WB3802', label: '木目ブラウン'}]},
  // p.154 テトラ・ケインα ミディ：品番はなく、S と M で TAIS が分かれている（各¥）。色は青墨
  {page: 154, order: '261-W2839', expect: ['261-W2839'], variants: [{from: 0, label: 'S 青墨', tais: '01105-000040'}, {from: 0, label: 'M 青墨', tais: '01105-000041'}]},
  // p.46 マスカット ポールタイプII：-300 と -310 はグリップボールの色（白・緑）がちがう。-800 はグリーン
  {
    page: 46,
    order: '261-S1093',
    expect: ['MP2000-800', 'MP2000-300', 'MP2000-310'],
    variants: [
      {from: 0, label: 'リングアーム付き グリーン'},
      {from: 1, label: '滑り止めグリップ ポール付き グリップボール白×2'},
      {from: 2, label: '滑り止めグリップ ポール付き グリップボール緑×2'},
    ],
  },
  // p.46 介護リフトつるべーF2Rセット：TAIS が「TAIS/」「00229-000016」の2行に割れている
  {page: 46, order: '261-B0327', expect: ['261-B0327'], variants: [{from: 0, label: '', tais: '00229-000016'}]},
  // p.51 たすけ帯：1つの品番に M と L がある（各¥）
  {page: 51, order: '261-S0535', expect: ['0973'], variants: [{from: 0, label: 'M ウエスト60～85cm'}, {from: 0, label: 'L ウエスト85～110cm'}]},
  {page: 51, order: '261-S0535', expect: ['0972'], variants: [{from: 0, label: 'M 腰回り70～85cm'}, {from: 0, label: 'L 腰回り85～100cm'}]},
  // p.175 きらく ミニでか：品番の左に「標準タイプ」「やわらか便座」「普通便座」と型（MS型・MY型）、片付け簡単
  {
    page: 175,
    order: '261-T0625',
    expect: ['45601', '45603', '45611', '45613', '40035', '40036'],
    variants: [
      {from: 0, label: '標準タイプ MS型 アイボリー'},
      {from: 1, label: '標準タイプ MS型 ダークブラウン'},
      {from: 2, label: 'やわらか便座 MY型 アイボリー'},
      {from: 3, label: 'やわらか便座 MY型 ダークブラウン'},
      {from: 4, label: '普通便座 片付け簡単 MS型 ダークブラウン'},
      {from: 5, label: 'やわらか便座 片付け簡単 MY型 ダークブラウン'},
    ],
  },
  // p.175 きらく P2シリーズ：型（PS2型・PY2型）
  {page: 175, order: '261-T0667', expect: ['47530', '47540'], variants: [{from: 0, label: '標準タイプ PS2型'}, {from: 1, label: 'やわらか便座 PY2型'}]},
  // p.175 ラップポン介護用 消耗品：写真の横の名前（フィルムと凝固剤）
  {page: 175, order: '261-T0989', expect: ['C0F1C460J', 'C0C0T3P1J'], variants: [{from: 0, label: 'フィルムカセットタイプ4 60回分'}, {from: 1, label: 'カタメルサーT3 6L'}]},
  // p.214 バリアフリーレール：表の上の見出し（フラットタイプ・への字タイプと長さ）。前は写真の「施工前」が付いていた
  {
    page: 214,
    order: '261-R0357',
    expect: ['BF120-1000-LO', 'BF120-1000-DO', 'BF120-2000-LO', 'BF120-2000-DO', 'BH120-1000-LO', 'BH120-1000-DO'],
    variants: [
      {from: 0, label: 'フラットタイプ(長さ100cm) ライトオーク'},
      {from: 1, label: 'フラットタイプ(長さ100cm) ダークオーク'},
      {from: 2, label: 'フラットタイプ(長さ200cm) ライトオーク'},
      {from: 3, label: 'フラットタイプ(長さ200cm) ダークオーク'},
      {from: 4, label: 'への字タイプ(長さ100cm) ライトオーク'},
      {from: 5, label: 'への字タイプ(長さ100cm) ダークオーク'},
    ],
  },
];

/** 商品に当たる直し（ページ・注文番号・読み取った品番の並びが同じもの） */
export const fixFor = (p: Pick<CatalogProduct, 'page' | 'variants'>): CatalogFix | undefined =>
  CATALOG_FIXES.find(
    (f) => f.page === p.page && p.variants.some((v) => v.orderCode === f.order) && f.expect.length === p.variants.length && f.expect.every((c, i) => p.variants[i].code === c),
  );

/** 直しを当てた品番の並び（当たらなければそのまま） */
export function applyFix(p: CatalogProduct): CatalogVariant[] {
  const f = fixFor(p);
  if (!f) return p.variants;
  return f.variants.map((v) => {
    const base = p.variants[v.from];
    return {...base, code: v.code ?? base.code, label: v.label, tais: v.tais ?? base.tais};
  });
}
