// 郵便番号と住所をつなぐ（福岡県だけ。データは zipData.ts）。
// 住所を打てば〒が入り、〒を先に打てば住所の頭（市区町村・町域）が入る（ユーザーの指示「連動できる部分は…無駄を省けるようにする」）。
// 住所の頭は「福岡県行橋市大字流末」のように県から・大字を付けて書く町域は「大字」も（ユーザーの指示「郵便番号を入力したら住所がでる、福岡県行橋市大字流松（流末）」
// 2026-10-29。大字は oazaData.ts。住宅改修のアプリの src/sasaoka/zip.ts の addressOfZip と同じ）

import {OAZA_FUKUOKA} from './oazaData.ts';
import {ZIP_FUKUOKA} from './zipData.ts';

type Town = {zip: string; town: string; base: string}; // base：町域の（ ）の注記を外した名前
type City = {city: string; short: string; towns: Town[]};

let parsed: City[] | null = null;

/** 「（１～３丁目）」「（その他）」のような注記を外す */
const baseOf = (town: string) => town.replace(/（[^）]*）/g, '').trim();

function cities(): City[] {
  if (!parsed) {
    parsed = ZIP_FUKUOKA.split('\n').map((line) => {
      const [city = '', list = ''] = line.split('|');
      const towns = list.split(',').map((p) => {
        const [zip = '', town = ''] = p.split(':');
        return {zip, town, base: baseOf(town)};
      });
      // 「京都郡苅田町」は「苅田町」とだけ書くこともあるので、郡を外した名前でも探す
      return {city, short: city.replace(/^.+?郡/, ''), towns};
    });
  }
  return parsed;
}

/** 7けたの郵便番号を「824-0043」に（7けたでなければ打ったまま） */
export function zipLabel(zip: string): string {
  const d = (zip || '').normalize('NFKC').replace(/\D/g, '');
  return d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : (zip || '').trim();
}

const norm = (s: string) => (s || '').normalize('NFKC').replace(/[\s　]+/g, '');

export type ZipHit = {zip: string; label: string}; // label：「行橋市流末」

/**
 * 住所の郵便番号の候補（福岡県の住所だけ）。町域まで分かれば その町域の番号、分からなければ市区町村の番号。
 * 同じ町域に番号が2つ以上あるとき（番地で分かれる町域）は候補を全部返す
 */
export function zipCandidates(address: string): ZipHit[] {
  let a = norm(address).replace(/^福岡県/, '');
  if (!a) return [];
  const all = cities();
  const city = all
    .flatMap((c) => [
      {c, name: norm(c.city)},
      {c, name: norm(c.short)},
    ])
    .filter((x) => x.name && a.startsWith(x.name))
    .sort((x, y) => y.name.length - x.name.length)[0];
  if (!city) return [];
  a = a.slice(city.name.length).replace(/^(大字|字)/, '');
  const towns = city.c.towns.filter((t) => t.base && a.startsWith(norm(t.base)));
  const longest = Math.max(0, ...towns.map((t) => norm(t.base).length));
  const best = towns.filter((t) => norm(t.base).length === longest);
  const hits = best.length ? best : city.c.towns.filter((t) => t.town === '');
  const seen = new Set<string>();
  return hits
    .filter((t) => (seen.has(t.zip) ? false : (seen.add(t.zip), true)))
    .map((t) => ({zip: zipLabel(t.zip), label: `${city.c.city}${t.town}`}));
}

let oaza: Map<string, Set<string>> | null = null;
/** 住所に「大字」を付けて書く町域か（oazaData.ts） */
function isOaza(city: string, town: string): boolean {
  if (!oaza) oaza = new Map(OAZA_FUKUOKA.split('\n').map((line) => [line.split('|')[0], new Set((line.split('|')[1] ?? '').split(','))]));
  return !!oaza.get(city)?.has(town);
}

/** 郵便番号の市区町村（「京都郡苅田町」。福岡県の番号で、1つの市区町村に決まるときだけ。決まらなければ ''。住宅改修のアプリの zip.ts と同じ） */
export function cityOfZip(zip: string): string {
  const d = (zip || '').normalize('NFKC').replace(/\D/g, '');
  if (d.length !== 7) return '';
  const hit = cities().filter((c) => c.towns.some((t) => t.zip === d));
  return hit.length === 1 ? hit[0].city : '';
}

/**
 * 郵便番号から入れた住所の頭のうしろに、住所を頭から打ち直した（「福岡県…」「京都郡苅田町…」「苅田町…」）ときは、入れた頭を外す
 * （いつものように住所を全部打つと「福岡県行橋市行事福岡県行橋市…」と2回になった。番地を足したときはそのまま。住宅改修のアプリの zip.ts と同じ）
 */
export function withoutDoubledHead(address: string, zip: string): string {
  const head = addressOfZip(zip);
  if (!head || !address.startsWith(head) || address.length === head.length) return address;
  const rest = address.slice(head.length);
  // 住所の頭が出る番号は、市区町村も1つに決まる（cityOfZip）。「京都郡苅田町」は「苅田町」とだけ打つこともある
  const city = cityOfZip(zip);
  return ['福岡県', city, city.replace(/^.+?郡/, '')].some((w) => w && rest.startsWith(w)) ? rest : address;
}

/** 郵便番号から入れたままの住所の頭か（県・市区町村・町域だけで、番地などを足していない。住宅改修のアプリの zip.ts と同じ） */
export function isZipHead(address: string): boolean {
  return !!address && zipCandidates(address).some((h) => addressOfZip(h.zip) === address);
}

/**
 * 郵便番号 → 住所の頭（「福岡県行橋市大字流末」。町域の注記は外す。福岡県の番号だけ）。町域が1つに決まれば町域まで（大字を付けて書く町域は「大字」も）、
 * 決まらなければ（「以下に掲載がない場合」の番号・いくつかの町域にまたがる番号）市区町村まで。福岡県になければ空
 */
export function addressOfZip(zip: string): string {
  const d = (zip || '').normalize('NFKC').replace(/\D/g, '');
  if (d.length !== 7) return '';
  const hits = cities().flatMap((c) => c.towns.filter((t) => t.zip === d).map((t) => ({c, t})));
  if (hits.length === 0 || new Set(hits.map((h) => h.c.city)).size !== 1) return '';
  const {city} = hits[0].c;
  const bases = new Set(hits.map((h) => h.t.base));
  const town = bases.size === 1 ? [...bases][0] : '';
  return `福岡県${city}${town && isOaza(city, town) ? '大字' : ''}${town}`;
}
