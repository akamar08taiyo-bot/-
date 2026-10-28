// 「🧾 売上伝票依頼書」の窓：売上伝票発行依頼書に入れる内容を確かめ、足りない所（負担割合・介護度・新規／既存・納品日）をここで入れてから開く
// （ユーザーと決めたこと 2026-10-27：「置き場所は見積書のタブの上の段」「負担割合を選ぶまで自己負担額は出さない」）。
// ここで選んだ負担割合・介護度・支払方法・生活保護・納品日は案件にも入る（申請書・見積書と同じ値）。送る中身は uriage.ts
import {useState} from 'react';
import type {MouseEvent, ReactNode} from 'react';
import {saleTotals} from '../calc.ts';
import {CARE_LEVELS} from '../defaults.ts';
import type {BurdenRatio, PayMethod, Sale, Settings} from '../types.ts';
import {URIAGE_IMPORT_KEY, uriageMissing, uriageRequest, uriageUrl} from '../uriage.ts';
import type {CustomerType} from '../uriage.ts';
import {todayIso, yen} from '../util.ts';
import {Circles} from './ShinseiParts.tsx';
import {Btn, Modal, btnClass, useToast} from './ui.tsx';

export function UriageDialog({sale, settings, change, onClose}: {sale: Sale; settings: Settings; change: (patch: Partial<Sale>) => void; onClose: () => void}) {
  const toast = useToast();
  const t = saleTotals(sale, settings);
  const [customerType, setCustomerType] = useState<CustomerType | null>(sale.uriageCustomer ?? null);
  const issueDate = sale.deliveryDate || todayIso();
  const {fix, elsewhere} = uriageMissing(sale, t, {customerType, issueDate});
  const ready = fix.length === 0 && elsewhere.length === 0;

  const open = (ev: MouseEvent<HTMLAnchorElement>) => {
    try {
      localStorage.setItem(URIAGE_IMPORT_KEY, JSON.stringify(uriageRequest(sale, settings, {customerType, issueDate})));
    } catch {
      ev.preventDefault();
      toast('売上伝票へ渡せませんでした（この端末のブラウザに保存できません）', 'error');
      return;
    }
    // 新規・既存は案件に覚える（もう一度出すときに選び直さなくてよいように）。納品日は窓で直したときだけ案件に入る
    if (customerType && sale.uriageCustomer !== customerType) change({uriageCustomer: customerType});
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
            <a href={uriageUrl()} target="_blank" onClick={open} className={btnClass('softBlue')}>
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
        {row('お客様', text(sale.customer), !sale.customer.trim())}
        {row('担当', text(sale.staff), !sale.staff.trim())}
        {row('居宅・ケアマネ', <span className="text-slate-800">{[sale.careOffice.trim(), sale.careManager.trim()].filter(Boolean).join('　') || '—'}</span>)}
        {row(
          '商品',
          t.total > 0 ? (
            <span className="tabular-nums text-slate-800">
              {t.lines.filter((l) => l.total > 0).length}点・{yen(t.total)}円（税込）
            </span>
          ) : (
            <span className="text-rose-700">見積書で金額を入れてください</span>
          ),
          t.total <= 0,
        )}
        {row(
          '負担割合',
          <Circles<BurdenRatio>
            label="伝票の負担割合"
            value={sale.burdenRatio}
            onPick={(burdenRatio) => burdenRatio && change({burdenRatio})}
            options={[
              [1, '1割'],
              [2, '2割'],
              [3, '3割'],
            ]}
          />,
          !t.ratioSet,
        )}
        {row(
          '介護度',
          <select
            value={sale.careLevel}
            onChange={(e) => change({careLevel: e.target.value})}
            aria-label="伝票の介護度"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="">選ぶ</option>
            {CARE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>,
          !sale.careLevel,
        )}
        {row(
          '支払方法',
          <Circles<PayMethod>
            label="伝票の支払方法"
            value={sale.payMethod}
            onPick={(payMethod) => payMethod && change({payMethod})}
            options={[
              ['受領委任払い', '受領委任払い'],
              ['償還払い', '償還払い'],
            ]}
          />,
        )}
        {row(
          '新規・既存',
          <Circles<CustomerType>
            label="伝票の顧客区分"
            value={customerType}
            onPick={(v) => v && setCustomerType(v)}
            options={[
              ['new', '新規'],
              ['existing', '既存'],
            ]}
          />,
          !customerType,
        )}
        {row(
          '納品日',
          <input
            type="date"
            value={issueDate}
            onChange={(e) => e.target.value && change({deliveryDate: e.target.value})}
            aria-label="伝票の納品日"
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
          />,
        )}
        {row(
          '生活保護',
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={sale.welfare} onChange={(e) => change({welfare: e.target.checked})} />
            生活保護（自己負担は出さない）
          </label>,
        )}
      </div>
      {t.ratioSet && t.total > 0 && (
        <p className="mt-3 text-sm tabular-nums text-slate-700">
          {sale.welfare ? `介護扶助（${t.ratio}割）${yen(t.aid)}円` : `利用者負担（${t.ratio}割）${yen(t.userBurden)}円`}・保険者負担 {yen(t.insurerBurden)}円
          {t.excess > 0 && `・限度額を超えた分 ${yen(t.excess)}円`}
        </p>
      )}
      {!ready && <p className="mt-2 text-sm font-bold text-amber-800">まだ入っていません：{[...fix, ...elsewhere].join('・')}</p>}
    </Modal>
  );
}
