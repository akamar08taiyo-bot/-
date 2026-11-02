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
  category?: string; // ページの商品がみな同じ種目のとき（歩行器のページ）。商品名で種目が決まらない商品に使う
  kind: string; // ページの一覧に出す品目（「シャワーチェア」「ポータブルトイレ」「介護保険の対象外」）。ユーザーの指示「カタログ一覧の全ての項目でわかるようにする」2026-11-01
};

/**
 * カタログの窓に出すページを絞る（商品の欄の「🔍 商品検索」で絞った商品の載っているページだけ。ユーザーの指示「カタログも同様です」2026-11-01）。
 * pages はページの番号、label は絞った条件（「入浴補助用具・シャワーチェアー・パナソニックエイジフリー（株）」）
 */
export type CatalogPagesFilter = {pages: number[]; label: string};
/**
 * カタログの窓を開く：query はカタログから検索の字、filter は出すページを絞るとき、target はページの商品を押したときに入れる商品の欄（id。
 * なければ空いた欄か新しい欄）
 */
export type OpenCatalog = (query: string, filter?: CatalogPagesFilter, target?: string) => void;

const PORTABLE_TOILET = '移動できる便器（ポータブルトイレ）';
const ANJU = /アロン|安寿/;

const PANASONIC = /パナソニック|panasonic|ユクリア/i;

/**
 * ページの並び（印刷の画面のチェックの順）。入浴の用具 → 歩行 → 腰掛便座 → 固定用スロープ。2026-10-26 にユーザーから p.37・40・43・44・172・178・179、2026-10-28 に p.214 をいただいて足した。
 * 2026-11-01 にいただいていた全部のページ（p.41・46・48・49・51 の入浴、p.151〜154 の多点杖、p.174・175 のポータブルトイレ）も足した（ユーザーの指示「シャワーキャリーや四点杖、
 * 一部ポータブルトイレなどのPDFなどは印刷機能に盛り込んでなかったが、全て盛り込む」）
 */
export const CATALOG: CatalogPage[] = [
  {file: 'kaientai-p037.pdf', page: 37, kind: 'シャワーチェア', title: 'シャワーベンチ（安寿）', subs: ['入浴用いす'], maker: ANJU},
  {file: 'kaientai-p040.pdf', page: 40, kind: 'シャワーチェア', title: 'シャワーチェア（パナソニック ユクリア）', subs: ['入浴用いす'], maker: PANASONIC},
  {file: 'kaientai-p041.pdf', page: 41, kind: 'シャワーチェア', title: 'シャワーチェア おりたたみ（パナソニック ユクリア）', subs: ['入浴用いす'], maker: PANASONIC, words: /おりたたみ|スツール/},
  {file: 'kaientai-p043.pdf', page: 43, kind: '浴槽台', title: '浴槽台（パナソニック ユクリア）', subs: ['浴槽内いす'], maker: PANASONIC},
  {file: 'kaientai-p044.pdf', page: 44, kind: '浴槽台・浴槽手すり', title: '浴槽台・浴槽手すり（安寿）', subs: ['浴槽内いす', '浴槽用手すり'], maker: ANJU},
  // 浴槽手すりがパナソニック（入浴グリップ ユクリア）と分かるように（ユーザーの指示「浴槽手すりがパナソニックであることがわかるようにする」2026-10-28）
  {file: 'kaientai-p045.pdf', page: 45, kind: '浴槽手すり・バスボード', title: '浴槽手すり・バスボード（パナソニック）', subs: ['浴槽用手すり', '入浴台']},
  // バスボード・移乗台（パナソニックのバスボードは p.45 にもあるので、ここだけの名前で）。バスリフト・移乗サポートロボットは貸与の品目
  {file: 'kaientai-p046.pdf', page: 46, kind: 'バスボード', title: 'バスボード・移乗台・バスリフト', words: /移乗台|極楽|バスベンリー|アクアムーブ|マスカット/},
  {file: 'kaientai-p047.pdf', page: 47, kind: '介護保険の対象外', title: 'すべり止めマット', words: /すべり止め|滑り止め/},
  // バスマット（介護保険の対象外）とシャワーキャリー（安楽キャリー・座位安定シャワーキャリー・シャワーキャリー LX）
  {file: 'kaientai-p048.pdf', page: 48, kind: 'シャワーチェア', title: 'バスマット・シャワーキャリー', words: /バスマット|安楽キャリー|座位安定|シャワーキャリー\s*LX/i},
  {file: 'kaientai-p049.pdf', page: 49, kind: 'シャワーチェア', title: 'シャワーキャリー・シャワー用車いす', words: /シャワー用車いす|浴用キャリー|シャワーキャリー\s*AL|ハイベル|はいらーく|はいねーる|シャトレチェア/i},
  // シャワーキャリーは入浴用いす（ユーザーの指示「シャワーキャリーはシャワーチェア」2026-11-01）。ページの一覧の品目は「シャワーチェア」。
  // 印刷に入れるのは商品名にシャワーキャリーとあるときだけ（ふつうのシャワーチェアでキャリーのページを入れない。細目 subs は付けない）
  {file: 'kaientai-p050.pdf', page: 50, kind: 'シャワーチェア', title: 'シャワーキャリー', words: /シャワーキャリー/},
  {file: 'kaientai-p051.pdf', page: 51, kind: 'シャワーチェア・介助ベルト', title: 'シャワーキャリー・入浴用介助ベルト', subs: ['入浴用介助ベルト'], words: /シャワーラク|介助ベルト|キャリーベルト|たすけ帯/},
  // 歩行器（2024年4月から選択制。買えるのは脚がすべて杖先ゴムの固定式・交互式だけで、車輪・キャスターのある歩行車は対象外）。
  // ユーザーの指示「固定用歩行器のカタログも追加」2026-11-01。p.136 はキャスター付きが多く、固定式は ⑨ スライドフィットEX 固定式。p.137 は ①〜⑩ が固定型、⑪〜⑮ はシルバーカー
  {file: 'kaientai-p136.pdf', page: 136, kind: '歩行器', category: '歩行器', title: '歩行器（キャスター付き・固定式）', words: /スライドフィット|ミニフィット/},
  {file: 'kaientai-p137.pdf', page: 137, kind: '歩行器', category: '歩行器', title: '歩行器（固定型）・シルバーカー', words: /固定型|固定式|ウォーカー|歩行器/},
  // 多点杖（3点杖・4点杖。T字杖など1本の杖は対象外）。品番がなければ商品名の言葉（カルモトリプル・エルビスクワド・バンブーステッキ など）、それもなければ細目の多点杖
  {file: 'kaientai-p151.pdf', page: 151, kind: '多点杖', title: '多点杖（スリーベース・トリプル・かるがも）', subs: ['多点杖'], words: /スリーベース|トリプル|ポイントステッキ|E4点/},
  {file: 'kaientai-p152.pdf', page: 152, kind: '多点杖', title: '多点杖（かるがも・エルビスクワド・やわらGEL）', subs: ['多点杖'], words: /オム4点|ファム|エルビスクワド|ぴったりくん|四点可動式\s*スモール/},
  {file: 'kaientai-p153.pdf', page: 153, kind: '多点杖', title: '多点杖（やわらGEL・バンブーステッキ）', subs: ['多点杖'], words: /TYPE-?U|かる楽|バンブーステッキ|軽かろ|ヒューゴ|SOFT-?G/i},
  {file: 'kaientai-p154.pdf', page: 154, kind: '多点杖', title: '多点杖（アルミ4点杖・クオッドケイン）', subs: ['多点杖'], words: /テイコブ|クオッドケイン|オン・?オフ|4点支柱|マグネシウム四点|補助グリップ/},
  {file: 'kaientai-p172.pdf', page: 172, kind: 'ポータブルトイレ', title: '家具調トイレ（安寿）', subs: [PORTABLE_TOILET], maker: ANJU},
  {file: 'kaientai-p173.pdf', page: 173, kind: 'ポータブルトイレ', title: '家具調トイレ セレクトS（安寿）', subs: [PORTABLE_TOILET], maker: ANJU},
  // ポータブルトイレ（さわやかチェア・ラップポン・きらく など。名前に「トイレ」がない物も。ユーザーの指示「ラップポンは腰掛便座」2026-11-01）
  {file: 'kaientai-p174.pdf', page: 174, kind: 'ポータブルトイレ', title: 'ポータブルトイレ（さわやかチェア・ラップポン・きらく）', words: /さわやか|ラップポン・?(プリート|ブリオ)|木製きらく|たため/},
  {file: 'kaientai-p175.pdf', page: 175, kind: 'ポータブルトイレ', title: 'ポータブルトイレ（ジャスピタ・きらく・ラップポン・オーブ）', words: /あらえ|ジャスピタ|楽立\s*AD|きらく\s*P2|ラップポン・?オーブ/i},
  {file: 'kaientai-p177.pdf', page: 177, kind: 'ポータブルトイレ', title: 'ポータブルトイレ（パナソニック）', subs: [PORTABLE_TOILET], maker: /パナソニック|panasonic/i},
  {file: 'kaientai-p178.pdf', page: 178, kind: 'ポータブルトイレ', title: 'ポータブルトイレ FX-30（安寿）', maker: ANJU, words: /FX-?30|マルチアシスト/i},
  {
    file: 'kaientai-p179.pdf',
    page: 179,
    kind: '据置式便座・ポータブルトイレ',
    title: '据置式便座・ポータブルトイレ（安寿）',
    subs: ['和式便器を腰掛式にするもの'],
    maker: /アロン|安寿|新輝/,
    words: /サニタリエース|据置(式)?便座|楽立|FX-?CP|ポータブルトイレ\s*S型/i,
  },
  // 固定用スロープ（2024年4月から特定福祉用具にも。段差解消スロープ）。ユーザーの指示「スロープのカタログも追加してください」2026-10-28。
  // 品番・申込番号がページにあればこのページ（catalogPicks）。なければ商品名に「スロープ」「段差解消」があればこのページ（ダンスロープ・インタースロープ・エコ段差スロープ など）
  {file: 'kaientai-p214.pdf', page: 214, kind: '固定用スロープ', title: '段差解消スロープ', words: /スロープ|段差解消/},
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
      return plain(`${catalogLabel(CATALOG[i])} ${CATALOG[i].kind}`).includes(q) || plain(text).includes(q) || (code.length >= 4 && codeKey(text).includes(code));
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
