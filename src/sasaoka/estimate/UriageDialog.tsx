// 「🧾 売上伝票」の窓（工事見積書のタブの上の段）：売上伝票発行依頼書に入れる内容を確かめ、足りない所（負担割合・介護度・新規／既存・施工日）を
// ここで入れてから開く（ユーザーと決めたこと 2026-10-27：「置き場所は見積書のタブの上の段」「住宅改修は工事1行」「生活保護にチェックしたら自己負担は出さない」）。
// ここで選んだ負担割合・介護度・生活保護は申請書の項目に、施工日は様邸に入る（仕切り計算表と同じ施工日）。送る中身は ../uriage.ts
import type {MouseEvent, ReactNode} from 'react';
import {Btn, Modal, useToast} from '../components/ui.tsx';
import {MARK_INFO, NO_SHINSEI} from '../estimateForms.ts';
import type {Job, Settings, ShinseiInfo} from '../types.ts';
import {HOUSING_LIMIT, URIAGE_IMPORT_KEY, uriageAmounts, uriageMissing, uriageRequest, uriageUrl} from '../uriage.ts';
import type {Billing, CustomerType} from '../uriage.ts';
import {staffFull, todayIso, yen} from '../util.ts';
import {Circles} from './ShinseiEditor.tsx';

const BILLING: [Billing, string][] = [
  ['receipt', '受領委任払い'],
  ['reimbursement', '償還払い'],
];
const CUSTOMER: [CustomerType, string][] = [
  ['new', '新規'],
  ['existing', '既存'],
];

export function UriageDialog({job, s, setJob, onClose}: {job: Job; s: Settings; setJob: (fn: (j: Job) => Job) => void; onClose: () => void}) {
  const toast = useToast();
  const si = job.shinsei ?? NO_SHINSEI;
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const setUriage = (patch: NonNullable<Job['uriage']>) => setJob((j) => ({...j, uriage: {...j.uriage, ...patch}}));
  const customerType = job.uriage?.customer ?? null;
  const billing: Billing = job.uriage?.billing ?? 'receipt';
  // 施工日：様邸の施工日（仕切り計算表）→ 申請書の完了予定日 → 着工予定日 → 今日
  const issueDate = job.date || si.end || si.start || todayIso();
  const choice = {customerType, billing, issueDate};
  const {fix, elsewhere} = uriageMissing(job, s, choice);
  const ready = fix.length === 0 && elsewhere.length === 0;
  const a = uriageAmounts(job, s);

  const open = (ev: MouseEvent<HTMLAnchorElement>) => {
    try {
      localStorage.setItem(URIAGE_IMPORT_KEY, JSON.stringify(uriageRequest(job, s, choice)));
    } catch {
      ev.preventDefault();
      toast('売上伝票へ渡せませんでした（この端末のブラウザに保存できません）', 'error');
      return;
    }
    toast('売上伝票発行依頼書を開きました');
    onClose();
  };

  /** 1行：見出し・中身。warn なら薄い黄色（まだ入っていない） */
  const row = (label: string, body: ReactNode, warn = false) => (
    <div className="border-b border-slate-200 last:border-b-0 sm:grid sm:grid-cols-[8rem_1fr]">
      <div className="bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:py-2">{label}</div>
      <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 text-sm ${warn ? 'bg-amber-50' : ''}`}>{body}</div>
    </div>
  );
  const text = (v: string) => (v.trim() ? <span className="text-slate-800">{v}</span> : <span className="text-rose-700">見積書で入れてください</span>);
  // 売上伝票と同じ計算（介護保険の対象は限度額まで・利用者負担は切り上げ）
  const covered = Math.min(a.target, HOUSING_LIMIT);
  const share = si.burden ? Math.ceil((covered * Number(si.burden)) / 10) : 0;

  return (
    <Modal
      title="🧾 売上伝票発行依頼書"
      onClose={onClose}
      footer={
        <>
          <Btn color="white" onClick={onClose}>
            閉じる
          </Btn>
          {ready ? (
            <a
              href={uriageUrl()}
              target="_blank"
              onClick={open}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:bg-blue-100"
            >
              🧾 売上伝票発行依頼書を開く
            </a>
          ) : (
            <Btn color="softBlue" disabled title={[...fix, ...elsewhere].join('・')}>
              🧾 売上伝票発行依頼書を開く
            </Btn>
          )}
        </>
      }
    >
      <div role="group" aria-label="売上伝票に入れる内容" className="overflow-hidden rounded-lg border border-slate-300">
        {row('お客様', text(job.customer), !job.customer.trim())}
        {row('担当', text(staffFull(job.staff, s.staffList)), !job.staff.trim())}
        {row('居宅・ケアマネ', <span className="text-slate-800">{[si.reasonOffice.trim(), si.reasonName.trim()].filter(Boolean).join('　') || '—'}</span>)}
        {row(
          '明細',
          a.total > 0 ? (
            <span className="tabular-nums text-slate-800">
              住宅改修工事 {yen(a.total)}円（税込）・仕切り {yen(a.cost)}円
              {a.target < a.total && `・介護保険の対象 ${yen(a.target)}円`}
            </span>
          ) : (
            <span className="text-rose-700">見積書に金額を入れてください</span>
          ),
          a.total <= 0,
        )}
        {row(
          '負担割合',
          <Circles label="伝票の負担割合" options={['1割', '2割', '3割']} value={si.burden ? `${si.burden}割` : ''} onPick={(v) => setInfo({burden: (v ? v[0] : '') as ShinseiInfo['burden']})} />,
          !si.burden,
        )}
        {row(
          '介護度',
          <select value={si.care} onChange={(e) => setInfo({care: e.target.value as ShinseiInfo['care']})} aria-label="伝票の介護度" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            <option value="">選ぶ</option>
            {MARK_INFO.care.options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>,
          !si.care,
        )}
        {row(
          '請求区分',
          <Circles
            label="伝票の請求区分"
            options={BILLING.map(([, l]) => l)}
            value={BILLING.find(([k]) => k === billing)?.[1] ?? ''}
            onPick={(v) => v && setUriage({billing: BILLING.find(([, l]) => l === v)?.[0] ?? 'receipt'})}
          />,
        )}
        {row(
          '新規・既存',
          <Circles
            label="伝票の顧客区分"
            options={CUSTOMER.map(([, l]) => l)}
            value={CUSTOMER.find(([k]) => k === customerType)?.[1] ?? ''}
            onPick={(v) => v && setUriage({customer: CUSTOMER.find(([, l]) => l === v)?.[0]})}
          />,
          !customerType,
        )}
        {row(
          '施工日',
          <input
            type="date"
            value={issueDate}
            onChange={(e) => e.target.value && setJob((j) => ({...j, date: e.target.value}))}
            aria-label="伝票の施工日"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          />,
        )}
        {row(
          '生活保護',
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={si.welfare === true} onChange={(e) => setInfo({welfare: e.target.checked || undefined})} />
            生活保護（自己負担は出さない）
          </label>,
        )}
      </div>
      {si.burden && a.total > 0 && (
        <p className="mt-3 text-sm tabular-nums text-slate-700">
          {si.welfare ? `介護扶助（${si.burden}割）` : `利用者負担（${si.burden}割）`}
          {yen(share)}円{a.total > covered && `・実費 ${yen(a.total - covered)}円`}
        </p>
      )}
      {!ready && <p className="mt-2 text-sm font-bold text-amber-800">まだ入っていません：{[...fix, ...elsewhere].join('・')}</p>}
    </Modal>
  );
}
