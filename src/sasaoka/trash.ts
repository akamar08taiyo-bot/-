// ゴミ箱：削除した様邸（見積書・申請書）を、すぐには消さずに残しておく（ユーザーの指示「設定のタブの横にゴミ箱をつくり、一時的に削除したデータを残せるようにする。
// ゴミ箱内、チェックして１件１件、もしくは一括で削除したら、完全に消せるようにする」2026-10-25）。自動では消さない（完全に削除を押したときだけ）。
//
// ゴミ箱に移した様邸は、様邸の一覧（jobs）に残したまま trashedAt（移した時刻）を付ける。別の保存の項目（trash など）にしない理由：
//   ・前の版を開いたままのタブ（ゴミ箱を知らない）が保存しても、trashedAt は keepNewer（storage.ts）と sync.ts のまとめ方で残る
//     （別の項目にすると、前の版のタブが様邸を直して保存したときに、一覧とゴミ箱の両方に同じ様邸ができる）
//   ・前の版の写真の掃除（prunePhotos）も、様邸の一覧に書いてある写真の番号を残すので、ゴミ箱の様邸の写真を消さない
//   ・バックアップ（すべて）にも、そのまま入る（読み込んでもゴミ箱のまま）
// 画面（見積もりの一覧・請求書・発注書・探す・件数・印刷）には、ゴミ箱の様邸を除いたデータ（liveData）を渡す。ゴミ箱のタブだけがゴミ箱の様邸を見る。

import type {AppData, Job} from './types.ts';

export const isTrashed = (j: Pick<Job, 'trashedAt'>): boolean => typeof j.trashedAt === 'number' && j.trashedAt > 0;

/** ゴミ箱にない様邸。ゴミ箱が空なら同じ並び（作り直さないので、画面の useMemo がむだに動かない） */
export function liveJobs(jobs: Job[]): Job[] {
  return jobs.some(isTrashed) ? jobs.filter((j) => !isTrashed(j)) : jobs;
}

/** 画面に出すデータ（ゴミ箱の様邸を除く）。ゴミ箱が空なら同じもの */
export function liveData(data: AppData): AppData {
  const jobs = liveJobs(data.jobs);
  return jobs === data.jobs ? data : {...data, jobs};
}

/** ゴミ箱の様邸（削除した時刻の新しい順） */
export function trashedJobs(jobs: readonly Job[]): Job[] {
  return jobs.filter(isTrashed).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0) || b.createdAt - a.createdAt);
}

/**
 * ゴミ箱に移す（まだゴミ箱にないものだけ）。when があれば、その時刻にする（元に戻したのを Ctrl+Z でやめるとき＝前の削除した日のまま）。
 * 何も変わらなければ同じ並びを返す（保存しない）
 */
export function moveToTrash(jobs: Job[], ids: Iterable<string>, now: number, when?: ReadonlyMap<string, number>): Job[] {
  const set = new Set(ids);
  let changed = false;
  const next = jobs.map((j) => {
    if (!set.has(j.id) || isTrashed(j)) return j;
    changed = true;
    return {...j, trashedAt: when?.get(j.id) ?? now, updatedAt: now};
  });
  return changed ? next : jobs;
}

/** ゴミ箱から元に戻す（trashedAt を外す。様邸の月・請求書に入れるかは、削除する前のまま） */
export function restoreFromTrash(jobs: Job[], ids: Iterable<string>, now: number): Job[] {
  const set = new Set(ids);
  let changed = false;
  const next = jobs.map((j) => {
    if (!set.has(j.id) || !isTrashed(j)) return j;
    changed = true;
    const {trashedAt: _trashedAt, ...rest} = j;
    return {...rest, updatedAt: now};
  });
  return changed ? next : jobs;
}

/** 完全に削除する。ゴミ箱にあるものだけ（ほかのタブ・アプリで元に戻した様邸は消さない） */
export function purgeTrash(jobs: Job[], ids: Iterable<string>): Job[] {
  const set = new Set(ids);
  const next = jobs.filter((j) => !(set.has(j.id) && isTrashed(j)));
  return next.length === jobs.length ? jobs : next;
}

// 写真の掃除（prunePhotos）に渡す使っている番号は、ゴミ箱の様邸も含めた全部の様邸から photos.ts の photoIdsInUse で作る（App.tsx）

// ---------------------------------------------------------------- Ctrl+Z で、さっきのゴミ箱に移す・元に戻すをやめる

/** さっきの操作（ゴミ箱に移した・元に戻した様邸と、元に戻す前の削除した日）。完全に削除は戻せない（確かめのとおり） */
export type TrashAction = {kind: 'trash' | 'restore'; ids: string[]; when: Map<string, number>};

let last: TrashAction | null = null;

export const lastTrashAction = () => last;

export function rememberTrashAction(a: TrashAction | null) {
  last = a;
}

/** さっきの操作をやめた様邸の並び（やめるものがなければ同じ並び） */
export function undoTrashAction(jobs: Job[], a: TrashAction, now: number): Job[] {
  return a.kind === 'trash' ? restoreFromTrash(jobs, a.ids, now) : moveToTrash(jobs, a.ids, now, a.when);
}
