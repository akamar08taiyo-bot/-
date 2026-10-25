// ゴミ箱のタブ（設定のタブの右）と、様邸をゴミ箱に移す・元に戻す・完全に削除する操作（ユーザーの指示「設定のタブの横にゴミ箱をつくり、
// 一時的に削除したデータを残せるようにする。ゴミ箱内、チェックして１件１件、もしくは一括で削除したら、完全に消せるようにする」2026-10-25）。
// 見積もりの一覧・見積書・請求書の様邸の「削除」は、どれもゴミ箱に移す（askTrash）。完全に消すのはゴミ箱の「完全に削除」だけ。
// データの持ち方（様邸に trashedAt を付ける）とその理由は trash.ts

import {useEffect, useMemo, useRef, useState} from 'react';
import {estimateTotals, hasEstimateRows, jobName} from '../calc.ts';
import {insurerLabel} from '../estimateForms.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {lastTrashAction, moveToTrash, purgeTrash, rememberTrashAction, restoreFromTrash, trashedJobs, undoTrashAction} from '../trash.ts';
import type {AppData, Job} from '../types.ts';
import type {Update} from '../useStore.ts';
import {yen} from '../util.ts';
import {Btn, useToast} from './ui.tsx';

/** 確かめ・お知らせに出す様邸の名前（お客様名がなければ、作成日と金額でどれか分かるように） */
export function trashLabel(job: Job, s: AppData['settings']): string {
  if (job.customer.trim()) return jobName(job);
  return `「お客様名なし・${dateText(estimateDateOf(job))}・${yen(estimateTotals(job, s).all.total)}円」`;
}

const dateText = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}` : '';
};

const timeText = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * 様邸をゴミ箱に移す（確かめてから。行の「削除」は「○○様邸をゴミ箱に移しますか？」＝label、チェックしてまとめてなら label なしで「N件を…」）。移したら true。
 * 移したあとは、一覧・ゴミ箱で Ctrl+Z を押すと元に戻る（useTrashUndo）
 */
export function askTrash(ids: string[], label: string | null, update: Update, toast: (text: string) => void): boolean {
  if (ids.length === 0) return false;
  if (!confirm(`${label ?? `${ids.length}件`}をゴミ箱に移しますか？`)) return false;
  const now = Date.now();
  update('jobs', (jobs) => moveToTrash(jobs, ids, now));
  rememberTrashAction({kind: 'trash', ids, when: new Map()});
  toast(label ? 'ゴミ箱に移しました' : `${ids.length}件をゴミ箱に移しました`);
  return true;
}

/**
 * Ctrl+Z で、さっきのゴミ箱に移す・元に戻すをやめる（ユーザーの好み「Ctrl+Z で元に戻す」）。見積もりの最初の画面と一覧・請求書の一覧・ゴミ箱で効く
 * （見積書・様邸の画面では見積書の Ctrl+Z が動くので付けない）。
 * 文字を打つ欄の中（その欄の文字を戻す）・ダイアログ・印刷の画面では何もしない（EstimateSheet.tsx の Ctrl+Z と同じ決まり）
 */
export function useTrashUndo(update: Update) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.isComposing || e.key.toLowerCase() !== 'z') return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="month"]):not([type="date"])')) return;
      if (document.querySelector('[role="dialog"], .print-overlay')) return;
      const a = lastTrashAction();
      if (!a) return;
      e.preventDefault();
      rememberTrashAction(null);
      update('jobs', (jobs) => undoTrashAction(jobs, a, Date.now()));
      toastRef.current(a.kind === 'trash' ? '元に戻しました' : 'ゴミ箱に戻しました');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [update]);
}

/**
 * ゴミ箱のタブ：ゴミ箱の様邸（削除した日の新しい順）。行ごとの「元に戻す」「完全に削除」と、チェックした様邸をまとめて。
 * 完全に削除はいつも確かめる（元に戻せない）。消したあとの写真は onPurged（App.tsx：保存してから写真の掃除）
 */
export function TrashPage({data, update, onPurged}: {data: AppData; update: Update; onPurged: () => void}) {
  const toast = useToast();
  const s = data.settings;
  useTrashUndo(update);
  const list = useMemo(
    () =>
      trashedJobs(data.jobs).map((job) => ({
        job,
        estimated: hasEstimateRows(job),
        total: estimateTotals(job, s).all.total,
      })),
    [data.jobs, s],
  );
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  // ほかのタブ・アプリで元に戻した・消した様邸は、チェックからも外す（見えない様邸をまとめて消さないように）
  const ids = useMemo(() => new Set(list.map(({job}) => job.id)), [list]);
  const picked = [...checked].filter((id) => ids.has(id));
  const allChecked = list.length > 0 && list.every(({job}) => checked.has(job.id));
  const toggle = (id: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const uncheck = (done: string[]) => setChecked((c) => new Set([...c].filter((id) => !done.includes(id))));

  // 行のボタンは名前、チェックしてまとめてなら件数（確かめ・お知らせ。チェックが1件でも「1件を…」）
  const what = (targets: string[], bulk: boolean) => {
    const one = bulk ? undefined : list.find(({job}) => job.id === targets[0]);
    return one ? trashLabel(one.job, s) : `${targets.length}件`;
  };
  const restore = (targets: string[], bulk = false) => {
    if (targets.length === 0) return;
    // Ctrl+Z でやめたときに、前の削除した日のままゴミ箱に戻せるように覚えておく
    const when = new Map(list.filter(({job}) => targets.includes(job.id)).map(({job}) => [job.id, job.trashedAt ?? Date.now()]));
    update('jobs', (jobs) => restoreFromTrash(jobs, targets, Date.now()));
    rememberTrashAction({kind: 'restore', ids: targets, when});
    uncheck(targets);
    toast(`${what(targets, bulk)}を元に戻しました`);
  };
  const purge = (targets: string[], bulk = false) => {
    if (targets.length === 0) return;
    const label = what(targets, bulk);
    if (!confirm(`${label}を完全に削除しますか？元に戻せません`)) return;
    update('jobs', (jobs) => purgeTrash(jobs, targets));
    // 完全に削除は Ctrl+Z で戻せない。そのあとの Ctrl+Z で、その前の操作（元に戻した様邸をまたゴミ箱へ）が動かないように、覚えも消す
    rememberTrashAction(null);
    uncheck(targets);
    toast(`${label}を完全に削除しました`);
    onPurged();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-[#44403c]">🗑 ゴミ箱（{list.length}件）</h2>
      </div>
      {picked.length > 0 && (
        <div role="status" aria-label="選んだ様邸" className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span className="font-bold">{picked.length}件を選んでいます</span>
          <Btn small color="white" onClick={() => restore(picked, true)}>
            元に戻す
          </Btn>
          <Btn small color="white" onClick={() => purge(picked, true)}>
            完全に削除
          </Btn>
          <Btn small color="white" onClick={() => setChecked(new Set())}>
            やめる
          </Btn>
        </div>
      )}
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-slate-500">ゴミ箱は空です</p>
      ) : (
        // スマホの幅では、削除した日・保険者・作成日・合計をお客様名の下にまとめ、ボタンを縦に並べる（表を横に動かさなくてもボタンが見える）
        <div className="overflow-x-auto rounded-xl border border-stone-300 bg-white shadow-sm">
          <table className="w-full text-sm md:min-w-[820px]">
            <thead className="bg-stone-100 text-xs text-stone-700">
              <tr>
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => setChecked(allChecked ? new Set() : new Set(list.map(({job}) => job.id)))}
                    className="h-4 w-4 align-middle"
                    aria-label="すべて選ぶ"
                  />
                </th>
                <th className="hidden px-2 py-2 text-left md:table-cell">削除した日</th>
                <th className="px-2 py-2 text-left">お客様名</th>
                <th className="hidden px-2 py-2 text-left md:table-cell">保険者</th>
                <th className="hidden px-2 py-2 text-left md:table-cell">作成日</th>
                <th className="hidden px-2 py-2 text-right md:table-cell">見積の合計（税込）</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map(({job, estimated, total}) => {
                const label = trashLabel(job, s);
                const removed = timeText(job.trashedAt ?? 0);
                const insurer = insurerLabel(job, s);
                const made = dateText(estimateDateOf(job));
                return (
                  <tr key={job.id} className={`border-t border-slate-100 ${checked.has(job.id) ? 'bg-sky-50' : ''}`}>
                    <td className="px-2 py-2">
                      <input type="checkbox" checked={checked.has(job.id)} onChange={() => toggle(job.id)} className="h-4 w-4 align-middle" aria-label={`${label}を選ぶ`} />
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 tabular-nums md:table-cell">{removed}</td>
                    <td className="px-2 py-2 font-bold text-slate-800">
                      {job.customer.trim() ? jobName(job) : <span className="text-slate-400">（お客様名なし）</span>}
                      <div className="mt-0.5 text-xs font-normal leading-5 text-slate-500 tabular-nums md:hidden">
                        <div>削除 {removed}</div>
                        <div>
                          {insurer}・作成 {made}
                          {estimated && `・${yen(total)}円`}
                        </div>
                      </div>
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-2 md:table-cell">{insurer}</td>
                    <td className="hidden whitespace-nowrap px-2 py-2 tabular-nums md:table-cell">{made}</td>
                    <td className="hidden px-2 py-2 text-right font-bold tabular-nums text-slate-700 md:table-cell">
                      {estimated ? yen(total) : <span className="font-normal text-slate-400">—</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex flex-col items-end gap-1.5 md:flex-row md:justify-end">
                        <Btn small color="white" className="whitespace-nowrap" onClick={() => restore([job.id])} aria-label={`${label}を元に戻す`}>
                          元に戻す
                        </Btn>
                        <Btn small color="white" className="whitespace-nowrap" onClick={() => purge([job.id])} aria-label={`${label}を完全に削除`}>
                          完全に削除
                        </Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
