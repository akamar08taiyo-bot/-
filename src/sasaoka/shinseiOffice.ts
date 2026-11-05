// 申請書に書く営業所（施工者・受任者・販売事業者・申請者の会社の欄と所長）。ユーザーの指示（2026-11-05）：
// 「大分の申請書は、大分営業所／久留米は久留米営業所／飯塚は飯塚営業所／田川は田川営業所／北九州は、小倉南、小倉、八幡東、八幡西／
//   福岡は、福岡東、福岡南、福岡西／こちらの該当営業所と所長にする」。
// 1つの営業所の市はその営業所。いくつかある市（北九州市・福岡市）は、いま開いている営業所（設定）がその中にあればその営業所、
// なければお客様の区の近くの営業所。田川は広域連合の田川市と田川郡（田川・桂川支部）。ほかの保険者（行橋市・苅田町・みやこ町・広域連合のほかの市町村）は設定のまま。
// 見積書・請求書の発行元は設定のまま（申請書だけ）。住宅改修（src/sasaoka/shinseiOffice.ts）と特定福祉用具（src/tokutei/shinseiOffice.ts）は同じ決まり

/** 保険者ごとの営業所（いくつかあるときは、区が分からないときの初めの営業所を先頭に） */
const GROUPS: Record<string, string[]> = {
  oita: ['大分営業所'],
  kurume: ['久留米営業所'],
  iizuka: ['飯塚営業所'],
  kitakyushu: ['小倉南営業所', '小倉営業所', '八幡東営業所', '八幡西営業所'],
  fukuoka: ['福岡東営業所', '福岡南営業所', '福岡西営業所'],
};

/** 区（市町村）→ 近い営業所。北九州市の門司区は小倉、戸畑区は八幡東、若松区は八幡西。福岡市の博多区は福岡東、中央区・城南区・早良区・西区は福岡西 */
const AREA_OFFICE: Record<string, string> = {
  小倉北区: '小倉営業所',
  門司区: '小倉営業所',
  小倉南区: '小倉南営業所',
  八幡東区: '八幡東営業所',
  戸畑区: '八幡東営業所',
  八幡西区: '八幡西営業所',
  若松区: '八幡西営業所',
  東区: '福岡東営業所',
  博多区: '福岡東営業所',
  南区: '福岡南営業所',
  中央区: '福岡西営業所',
  城南区: '福岡西営業所',
  早良区: '福岡西営業所',
  西区: '福岡西営業所',
};

/** 広域連合の田川・桂川支部のうち田川営業所の受け持ち（田川市・田川郡） */
const TAGAWA = ['田川市', '香春町', '添田町', '糸田町', '川崎町', '大任町', '赤村', '福智町'];

/**
 * 申請書に書く営業所の名前。insurer は保険者（kurume など）、area は保険者番号の区・市町村の名前（insurerAreaName）、current は設定の営業所。
 * 決まりのない保険者は null（設定の営業所のまま）
 */
export function shinseiOfficeName(insurer: string, area: string, current: string): string | null {
  if (insurer === 'kouiki') return TAGAWA.includes(area) ? '田川営業所' : null;
  const group = GROUPS[insurer];
  if (!group) return null;
  if (group.includes(current)) return current;
  const near = AREA_OFFICE[area];
  return near && group.includes(near) ? near : group[0];
}

/** 申請書に書ける営業所（申請書の画面の営業所の選ぶ欄）。決まりのない保険者は空（どの営業所でも選べる） */
export function shinseiOfficeGroup(insurer: string, area: string): string[] {
  if (insurer === 'kouiki') return TAGAWA.includes(area) ? ['田川営業所'] : [];
  return GROUPS[insurer] ?? [];
}
