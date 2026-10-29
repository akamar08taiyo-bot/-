// 介護保険の保険者番号（6けた）：保険者ごとの市町村・区と番号（ユーザーにいただいた一覧。2026-10-29）。
// ユーザーの指示「広域連合の場合は、築上町・豊前市・上毛町・吉富町、４箇所でそれぞれ保険者番号が違うため、保険者を選択できる項目を入力欄に入れる」
// 「他の保険者も同様の仕様にする」。申請書の画面の「保険者番号」で選び（初めは住所の市町村・区から）、申請書の保険者番号のマスに書く
// （広域連合の様式は 406470＝築上町 が原本に入っているので、選んだ番号で書きかえる。福岡市は 4013 のうしろ2けた）。
// 福岡県のほかの保険者と、大分県・熊本県・佐賀県・長崎県の一覧はスキルの references/insurer-numbers.md。住宅改修のアプリ（src/sasaoka/insurerNumbers.ts）も同じ一覧
// 保険者の名前は defaults.ts の INSURERS の key（住宅改修と同じ）。そのほか（other）は一覧なし
type Insurer = 'yukuhashi' | 'kanda' | 'miyako' | 'kouiki' | 'fukuoka' | 'kitakyushu';
const isInsurer = (v: string): v is Insurer => v in INSURER_AREAS;

/** name：選ぶ所に出す名前（住所にこの名前があれば初めにそれを選ぶ） */
export type InsurerArea = {no: string; name: string};

export const INSURER_AREAS: Record<Insurer, InsurerArea[]> = {
  yukuhashi: [{no: '402131', name: '行橋市'}],
  kanda: [{no: '406215', name: '苅田町'}],
  miyako: [{no: '406256', name: 'みやこ町'}],
  // 福岡県介護保険広域連合：構成市町村ごとに番号がちがう。行橋営業所の近く（豊前市・築上町・上毛町・吉富町）を先に
  kouiki: [
    {no: '402149', name: '豊前市'},
    {no: '406470', name: '築上町'},
    {no: '406462', name: '上毛町'},
    {no: '406421', name: '吉富町'},
    {no: '402065', name: '田川市'},
    {no: '402073', name: '柳川市'},
    {no: '402255', name: 'うきは市'},
    {no: '402263', name: '宮若市'},
    {no: '403410', name: '宇美町'},
    {no: '403428', name: '篠栗町'},
    {no: '403436', name: '志免町'},
    {no: '403444', name: '須恵町'},
    {no: '403451', name: '新宮町'},
    {no: '403485', name: '久山町'},
    {no: '403816', name: '芦屋町'},
    {no: '403824', name: '水巻町'},
    {no: '403832', name: '岡垣町'},
    {no: '403840', name: '遠賀町'},
    {no: '404012', name: '小竹町'},
    {no: '404020', name: '鞍手町'},
    {no: '404210', name: '桂川町'},
    {no: '404475', name: '筑前町'},
    {no: '404483', name: '東峰村'},
    {no: '405035', name: '大刀洗町'},
    {no: '405225', name: '大木町'},
    {no: '405449', name: '広川町'},
    {no: '406017', name: '香春町'},
    {no: '406025', name: '添田町'},
    {no: '406041', name: '糸田町'},
    {no: '406058', name: '川崎町'},
    {no: '406082', name: '大任町'},
    {no: '406090', name: '赤村'},
    {no: '406108', name: '福智町'},
  ],
  fukuoka: [
    {no: '401315', name: '東区'},
    {no: '401323', name: '博多区'},
    {no: '401331', name: '中央区'},
    {no: '401349', name: '南区'},
    {no: '401356', name: '西区'},
    {no: '401364', name: '城南区'},
    {no: '401372', name: '早良区'},
  ],
  kitakyushu: [
    {no: '401018', name: '門司区'},
    {no: '401034', name: '若松区'},
    {no: '401059', name: '戸畑区'},
    {no: '401067', name: '小倉北区'},
    {no: '401075', name: '小倉南区'},
    {no: '401083', name: '八幡東区'},
    {no: '401091', name: '八幡西区'},
  ],
};

/** 保険者のふつうの名前（選ぶ所の見出し・広域連合の構成市町村の注記に） */
export const INSURER_GROUP: Record<Insurer, string> = {yukuhashi: '行橋市', kanda: '苅田町', miyako: 'みやこ町', kouiki: '福岡県介護保険広域連合', fukuoka: '福岡市', kitakyushu: '北九州市'};

/**
 * 住所から保険者番号（初めの値）：その保険者の市町村・区の名前が住所にあればその番号。福岡市は住所の区（「福岡市」を書かない住所の「中央区…」も）。
 * 1つしかない保険者はその番号、広域連合で市町村が分からなければ原本の 406470（築上町）
 */
export function areaInsurerNo(key: string, address: string): string {
  if (!isInsurer(key)) return '';
  const insurer = key;
  const list = INSURER_AREAS[insurer];
  const a = address.normalize('NFKC').replace(/[\s　]+/g, '');
  if (insurer === 'fukuoka') {
    const m = /^(?:福岡県)?(?:福岡市)?(東|博多|中央|南|西|城南|早良)区/.exec(a);
    return m ? (list.find((x) => x.name === `${m[1]}区`)?.no ?? '') : '';
  }
  // 長い名前から（「八幡東区」を「東区」より先に）
  const hit = [...list].sort((x, y) => y.name.length - x.name.length).find((x) => a.includes(x.name));
  if (hit) return hit.no;
  if (list.length === 1) return list[0].no;
  return insurer === 'kouiki' ? '406470' : '';
}

/**
 * 申請書に書く保険者番号：選んだ番号（介護保険証から読んだ番号も。6けた）、なければ住所から。
 * ほかの保険者の一覧にある番号（保険者を選び直す前に選んでいた番号）は使わない（広域連合の上毛町を選んだあと北九州市にしたら、北九州市の区の番号に）
 */
export function insurerNoOf(insurer: string, address: string, picked: string): string {
  const p = picked.normalize('NFKC').replace(/\D/g, '');
  const other = Object.entries(INSURER_AREAS).some(([k, list]) => k !== insurer && list.some((x) => x.no === p));
  return p.length === 6 && !other ? p : areaInsurerNo(insurer, address);
}

/** 番号の市町村・区の名前（一覧にない番号は空） */
export function insurerAreaName(insurer: string, no: string): string {
  return isInsurer(insurer) ? (INSURER_AREAS[insurer].find((x) => x.no === no)?.name ?? '') : '';
}

/** 保険者の市町村・区（そのほかの保険者は空） */
export const insurerAreas = (insurer: string): InsurerArea[] => (isInsurer(insurer) ? INSURER_AREAS[insurer] : []);
