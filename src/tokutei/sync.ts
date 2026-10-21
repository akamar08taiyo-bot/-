// 同じアプリを2つのタブで開いたまま、両方で同じもの（案件・商品マスタなど）を保存したときに、
// あとから保存した方で前の変更を消さないように、3つ（前に読んだもの・こちらの今・向こうが保存したもの）を比べてまとめる。
//   片方だけが変えたところ → その方／両方が変えた案件・明細 → 中の項目ごとに比べる（同じ項目を両方で変えていたら、こちら）
//   消したものは、もう片方がそのあいだに直していなければ消す（直していれば残す）。向こうが足したものは、うしろに足す
// 住宅改修 見積書アプリの src/sasaoka/sync.ts（2026-10-20 の版）を写したもの（このアプリは独立しているので、写したあとは別々に直す）。

import type {AppData} from './types.ts';

type Rec = {id: string};
type Obj = Record<string, unknown>;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasIds = (v: unknown): v is Rec[] => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');

/** 3つを比べてまとめる。片方だけが変えていればその方。両方が変えていれば中まで比べ、それでも同じところを両方が変えていたらこちら */
export function mergeValue<T>(base: T, mine: T, theirs: T): T {
  if (same(mine, theirs)) return mine;
  if (same(base, mine)) return theirs;
  if (same(base, theirs)) return mine;
  if (hasIds(base) && hasIds(mine) && hasIds(theirs)) return mergeRecords(base, mine, theirs) as T;
  if (isObj(base) && isObj(mine) && isObj(theirs)) {
    const out: Obj = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const [m, t] = [mine[k], theirs[k]];
      // 直した時刻は新しい方
      out[k] = k === 'updatedAt' && typeof m === 'number' && typeof t === 'number' ? Math.max(m, t) : mergeValue(base[k], m, t);
    }
    return out as T;
  }
  return mine;
}

/** IDのある並び（案件・明細・商品）をまとめる。並びはこちらの順、向こうが足したものはうしろに */
export function mergeRecords<T extends Rec>(base: readonly T[], mine: readonly T[], theirs: readonly T[]): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const t = new Map(theirs.map((x) => [x.id, x]));
  const out: T[] = [];
  for (const x of mine) {
    const old = b.get(x.id);
    if (!old) {
      out.push(x); // こちらで足した
      continue;
    }
    const other = t.get(x.id);
    if (!other) {
      if (!same(old, x)) out.push(x); // 向こうが消したが、こちらで直していた → 残す
      continue;
    }
    out.push(mergeValue(old, x, other));
  }
  for (const x of theirs) {
    if (m.has(x.id)) continue;
    const old = b.get(x.id);
    if (!old)
      out.push(x); // 向こうで足した
    else if (!same(old, x)) out.push(x); // こちらで消したが、向こうで直していた → 残す
  }
  return out;
}

export function mergeKey<K extends keyof AppData>(key: K, base: AppData[K] | undefined, mine: AppData[K], theirs: AppData[K]): AppData[K] {
  return base === undefined ? mine : mergeValue(base, mine, theirs); // 前に読んだものが分からなければ、こちらの今のまま
}
