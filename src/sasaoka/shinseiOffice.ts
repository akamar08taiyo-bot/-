// 申請書に書く営業所（施工者・受任者・販売事業者・申請者の会社の欄と所長）。ユーザーの指示（2026-11-05）：
// 「大分の申請書は、大分営業所／久留米は久留米営業所／飯塚は飯塚営業所／田川は田川営業所／北九州は、小倉南、小倉、八幡東、八幡西／
//   福岡は、福岡東、福岡南、福岡西／こちらの該当営業所と所長にする」。
// 1つの営業所の市はその営業所。いくつかある市（北九州市・福岡市）は、いま開いている営業所（設定）がその中にあればその営業所、
// なければお客様の区の近くの営業所。田川は広域連合の田川市と田川郡（田川・桂川支部）。ほかの保険者（行橋市・苅田町・みやこ町・広域連合のほかの市町村）は設定のまま。
// 見積書・請求書の発行元は設定のまま（申請書だけ）。住宅改修（src/sasaoka/shinseiOffice.ts）と特定福祉用具（src/tokutei/shinseiOffice.ts）は同じ決まり
import {DEMO} from './demo/flag.ts';
import {BUILDER_OFFICES, OFFICES} from './company.ts';
import type {BuilderOffice} from './types.ts';

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
  if (DEMO) return null; // （株）イヤーズ デモアプリは、設定の営業所のまま（社内の営業所に替えない）
  if (insurer === 'kouiki') return TAGAWA.includes(area) ? '田川営業所' : null;
  const group = GROUPS[insurer];
  if (!group) return null;
  if (group.includes(current)) return current;
  const near = AREA_OFFICE[area];
  return near && group.includes(near) ? near : group[0];
}

/** 申請書に書ける営業所（申請書の画面の営業所の選ぶ欄）。決まりのない保険者は空（どの営業所でも選べる） */
export function shinseiOfficeGroup(insurer: string, area: string): string[] {
  if (DEMO) return [];
  if (insurer === 'kouiki') return TAGAWA.includes(area) ? ['田川営業所'] : [];
  return GROUPS[insurer] ?? [];
}

/**
 * 申請書の施工業者に選べる営業所の名前（申請書の画面の「施工業者」の一覧）：いつもの営業所（company.ts の BUILDER_OFFICES＝行橋・小倉南・小倉・
 * 八幡東・八幡西。ユーザーの言った順）、保険者・区から決まる営業所（auto。大分営業所など一覧にないとき）、申請書の画面で足した営業所（設定の builders）の順。同じ名前は1つ
 */
export function builderChoices(auto: string, added: readonly BuilderOffice[] = []): string[] {
  return [...new Set([...BUILDER_OFFICES, auto, ...added.map((b) => b.name)].map((n) => n.trim()).filter(Boolean))];
}

/** 施工業者の営業所（足した営業所を先に。同じ名前の会社の営業所より、自分で入れた住所・番号を使う）。どちらにもなければ undefined */
export function builderOffice(name: string, added: readonly BuilderOffice[] = []): (BuilderOffice & {juryoNo?: string}) | undefined {
  const n = name.trim();
  if (!n) return undefined;
  return added.find((b) => b.name === n) ?? OFFICES.find((o) => o.name === n);
}

/** 施工業者の欄に書く会社・営業所の値（設定の一部）。builderKey＝選んだ施工業者の一覧の名前（事業者番号を引く。元請けは営業所名と別） */
type BuilderLike = {company?: string; officeName?: string; manager?: string; postal?: string; address?: string; tel?: string; builders?: BuilderOffice[]; builderKey?: string};

/**
 * 施工業者の営業所を設定に重ねる（会社名は足した営業所に入れてあるときだけ）。設定の営業所と同じ名前・一覧にない名前は設定のまま
 * （設定の営業所なら、設定の画面で直した所長・住所を使う）
 */
export function withBuilder<T extends BuilderLike>(s: T, name: string): T {
  const n = name.trim();
  if (!n || n === (s.officeName ?? '').trim()) return s;
  const o = builderOffice(n, s.builders);
  if (!o) return s;
  return {...s, ...('company' in o && o.company ? {company: o.company} : {}), officeName: o.name, manager: o.manager, postal: o.postal, address: o.address, tel: o.tel, builderKey: o.name};
}

/**
 * （株）イヤーズ デモアプリの申請書の施工業者＝元請け（ユーザーの指示「イヤーズは施工業者ではありますが、下請けの施工業者になりますので、基本的には
 * 例えば太陽シルバーサービス、行橋営業所、みたいな感じで、元請けの業者の名前をリストから選んで、入れる…リストも1回登録したら、もうあとはプルダウンから
 * 選べるだけ」2026-11-12）。元請けは設定の builders（name＝「会社名　営業所名」・office＝営業所名）。選んでいない・一覧から外した元請けなら一覧の初めの元請け
 */
export function primeKey(chosen: string, added: readonly BuilderOffice[] = []): string {
  const n = chosen.trim();
  return n && added.some((b) => b.name === n) ? n : (added[0]?.name ?? '');
}

/** 元請けの一覧の名前（「太陽シルバーサービス㈱　行橋営業所」。営業所がなければ会社名だけ） */
export function primeName(company: string, office: string): string {
  return [company.trim(), office.trim()].filter(Boolean).join('　');
}

/**
 * 元請けを申請書の施工業者の欄（会社名・営業所・所在地・電話・代表者）に重ねる。元請けがなければ空ける（下請けの自社の名前は書かない。
 * 設定の自社の情報は申請書に出さない）
 */
export function withPrime<T extends BuilderLike>(s: T, chosen: string): T & {builderKey: string} {
  const key = primeKey(chosen, s.builders);
  const o = (s.builders ?? []).find((b) => b.name === key);
  if (!o) return {...s, company: '', officeName: '', manager: '', postal: '', address: '', tel: '', builderKey: ''};
  return {...s, company: o.company ?? '', officeName: o.office ?? '', manager: o.manager, postal: o.postal, address: o.address, tel: o.tel, builderKey: o.name};
}
