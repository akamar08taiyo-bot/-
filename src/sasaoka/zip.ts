// 住所から郵便番号を入れる（福岡県だけ。データは zipData.ts）。特定福祉用具のアプリ（claude/care-insurance-auto-transfer-3z0c9n の
// src/tokutei/zip.ts・zipData.ts）と同じもの（アプリ同士は独立しているので写して使う。直すときは両方）。
// ユーザーの指示「住所のみ入力した場合、逆に郵便番号を自動で入力される」2026-10-28：様邸の住所が変わって、申請書の郵便番号が空なら、
// 1つに決まる番号を入れる（withAddressZip。どのタブで住所を入れても・介護保険証や特定福祉用具から入っても）。
// 逆に、郵便番号を入れて住所が空なら住所を入れる（withZipAddress・addressOfZip。2026-10-29。「大字」は oazaData.ts）

import type {Job} from './types.ts';
import {NO_SHINSEI} from './estimateForms.ts';
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

let oaza: Map<string, Set<string>> | null = null;
/** 住所に「大字」を付けて書く町域か（oazaData.ts） */
function isOaza(city: string, town: string): boolean {
  if (!oaza) oaza = new Map(OAZA_FUKUOKA.split('\n').map((line) => [line.split('|')[0], new Set((line.split('|')[1] ?? '').split(','))]));
  return !!oaza.get(city)?.has(town);
}

/**
 * 郵便番号の住所（「福岡県行橋市大字流末」。福岡県の番号だけ）。町域が1つに決まれば町域まで（大字を付けて書く町域は「大字」も）、
 * 決まらなければ（「以下に掲載がない場合」の番号・いくつかの町域にまたがる番号）市区町村まで。福岡県の番号でなければ ''
 * （ユーザーの指示「郵便番号を入力したら住所がでる、福岡県行橋市大字流松（流末）」2026-10-29）
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

/** 郵便番号の市区町村（「京都郡苅田町」。福岡県の番号で、1つの市区町村に決まるときだけ。決まらなければ ''） */
export function cityOfZip(zip: string): string {
  const d = (zip || '').normalize('NFKC').replace(/\D/g, '');
  if (d.length !== 7) return '';
  const hit = cities().filter((c) => c.towns.some((t) => t.zip === d));
  return hit.length === 1 ? hit[0].city : '';
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

/**
 * 郵便番号から入れた住所（の頭）のうしろに、住所を頭から打ち直した（「福岡県…」「京都郡苅田町…」「苅田町…」）ときは、入れた頭を外す
 * （いつものように住所を全部打つと「福岡県京都郡苅田町福岡県京都郡苅田町富久町…」と2回になった。番地を足したときはそのまま）
 */
export function withoutDoubledHead(address: string, zip: string): string {
  const head = addressOfZip(zip);
  if (!head || !address.startsWith(head) || address.length === head.length) return address;
  const rest = address.slice(head.length);
  // 住所の頭が出る番号は、市区町村も1つに決まる（cityOfZip）。「京都郡苅田町」は「苅田町」とだけ打つこともある
  const city = cityOfZip(zip);
  return ['福岡県', city, city.replace(/^.+?郡/, '')].some((w) => w && rest.startsWith(w)) ? rest : address;
}

/** 郵便番号から入れたままの住所か（「福岡県行橋市中央」のように県・市区町村・町域だけで、番地などを足していない） */
export function isZipHead(address: string): boolean {
  return !!address && zipCandidates(address).some((h) => addressOfZip(h.zip) === address);
}

/**
 * 申請書の郵便番号が変わって（7けたになって）、様邸の住所が空なら、郵便番号の住所を入れる（addressOfZip）。
 * 住所が郵便番号から入れたままなら（isZipHead。番地などを足していない）、新しい郵便番号の住所に替える（打ち間違えて1字ずつ打ち直したときも）。
 * 手で入れた住所は変えない。変わらなければ同じ配列を返す
 */
export function withZipAddress(prev: Job[], next: Job[]): Job[] {
  if (next === prev) return next;
  const before = new Map(prev.map((j) => [j.id, j]));
  let changed = false;
  const out = next.map((j) => {
    const p = before.get(j.id);
    const zip = j.shinsei?.zip ?? '';
    if (zip === (p?.shinsei?.zip ?? '')) {
      // 住所を打っている：入れた頭のうしろに頭から打ち直したら、頭を外す
      if (!p || p.address === j.address) return j;
      const a = withoutDoubledHead(j.address, zip);
      if (a === j.address) return j;
      changed = true;
      return {...j, address: a};
    }
    const addr = addressOfZip(zip);
    if (!addr || addr === j.address) return j;
    if (j.address.trim() && !isZipHead(j.address)) return j;
    changed = true;
    return {...j, address: addr};
  });
  return changed ? out : next;
}

/**
 * 様邸の住所が変わった（新しい様邸も）とき、申請書の郵便番号が空なら、住所から1つに決まる郵便番号を入れる。
 * 住所が変わらなければ何もしない（郵便番号を消したら、そのまま）。変わらなければ同じ配列を返す
 */
export function withAddressZip(prev: Job[], next: Job[]): Job[] {
  if (next === prev) return next;
  const before = new Map(prev.map((j) => [j.id, j.address]));
  let changed = false;
  const out = next.map((j) => {
    if (!j.address.trim() || before.get(j.id) === j.address || (j.shinsei?.zip ?? '').trim()) return j;
    const hits = zipCandidates(j.address);
    if (hits.length !== 1) return j;
    changed = true;
    return {...j, shinsei: {...NO_SHINSEI, ...j.shinsei, zip: hits[0].zip}};
  });
  return changed ? out : next;
}
