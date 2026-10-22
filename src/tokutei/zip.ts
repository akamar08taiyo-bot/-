// 郵便番号と住所をつなぐ（福岡県だけ。データは zipData.ts）。
// 住所を打てば〒が入り、〒を先に打てば住所の頭（市区町村・町域）が入る（ユーザーの指示「連動できる部分は…無駄を省けるようにする」）。

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

/** 郵便番号 → 住所の頭（「行橋市流末」。町域の注記は外す）。福岡県になければ空 */
export function addressOfZip(zip: string): string {
  const d = (zip || '').normalize('NFKC').replace(/\D/g, '');
  if (d.length !== 7) return '';
  for (const c of cities()) {
    const t = c.towns.find((x) => x.zip === d);
    if (t) return `${c.city}${t.base}`;
  }
  return '';
}
