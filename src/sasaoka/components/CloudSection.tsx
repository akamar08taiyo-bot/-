// 設定のタブの「☁ スマホ・パソコンの同期」（常時同期。ユーザーの指示「常時同期させる」「受注残管理アプリみたいに、常時同期させる」2026-11-01。cloud/）：
// 営業所で決めた合言葉を入れて「同期を始める」→ クラウドの件数を見せて確かめてから始める。同期しているあいだは最後に同期した時刻と「今すぐ同期」「この端末の同期をやめる」。
// 上の段の「☁ 同期済み」などは CloudBadge

import {useState} from 'react';
import {PASSPHRASE_MIN, normalizePassphrase} from '../cloud/crypto.ts';
import type {Cloud, CloudPlan, CloudView} from '../cloud/useCloud.ts';
import {Btn, Modal, TextInput, useToast} from './ui.tsx';

const hm = (t: number | null) => (t ? new Date(t).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : '');

/** 同期のようすの短い言葉（上の段・設定の欄） */
export function cloudLabel(v: CloudView): string {
  switch (v.state) {
    case 'off':
      return '';
    case 'waiting':
      return '☁ ほかのタブで同期中';
    case 'starting':
      return '☁ つないでいます…';
    case 'syncing':
      return '☁ 同期中…';
    case 'idle':
      return `☁ 同期済み${v.at ? ` ${hm(v.at)}` : ''}`;
    case 'offline':
      return '☁ つながっていません（つながったら同期します）';
    case 'error':
      return '☁ 同期できません';
  }
}

/** 上の段（「この端末に自動保存しました」の横） */
export function CloudBadge({view}: {view: CloudView}) {
  if (view.state === 'off') return null;
  const bad = view.state === 'error' || view.state === 'offline';
  return (
    <span data-cloud={view.state} title={view.message || undefined} className={bad ? 'rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-900' : ''}>
      {cloudLabel(view)}
    </span>
  );
}

export function CloudSection({cloud}: {cloud: Cloud}) {
  const toast = useToast();
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<CloudPlan | null>(null);
  const [leaving, setLeaving] = useState(false);
  const v = cloud.view;
  const on = v.state !== 'off';
  const short = normalizePassphrase(pass).length < PASSPHRASE_MIN;

  const check = async () => {
    setBusy(true);
    try {
      setPlan(await cloud.prepare(pass));
    } catch (e) {
      toast(`クラウドにつなげませんでした：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await plan.commit();
      setPlan(null);
      setPass('');
      toast('同期を始めました');
    } catch (e) {
      toast(`始められませんでした：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="スマホ・パソコンの同期">
      <h2 className="mb-1 text-base font-bold text-[#0c315e]">☁ スマホ・パソコンの同期</h2>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        同じ合言葉のスマホ・パソコンで、様邸（申請書・見積書・理由書・写真）・特定福祉用具・部材リスト・設定がいつも同じになります。合言葉で暗号にしてから送るので、合言葉を知らない人は読めません。
      </p>
      {on ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-slate-700" data-cloud-state={v.state}>
            {cloudLabel(v)}
          </span>
          {v.state === 'error' && v.message && <span className="text-xs text-rose-700">{v.message}</span>}
          <Btn color="softBlue" small onClick={() => cloud.syncNow()} disabled={v.state === 'waiting'}>
            ⟳ 今すぐ同期
          </Btn>
          <Btn color="white" small onClick={() => setLeaving(true)}>
            この端末の同期をやめる
          </Btn>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!short && !busy) void check();
          }}
        >
          <label className="grid min-w-0 flex-1 basis-64 gap-1 text-xs font-bold text-slate-600">
            合言葉（営業所で決めた言葉。{PASSPHRASE_MIN}文字以上）
            <TextInput type={show ? 'text' : 'password'} value={pass} onChange={setPass} autoComplete="off" className="w-full" aria-label="合言葉" />
          </label>
          <label className="flex h-9 items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            見せる
          </label>
          <Btn type="submit" color="softBlue" disabled={short || busy}>
            {busy ? '確かめています…' : '☁ 同期を始める'}
          </Btn>
        </form>
      )}
      {plan && (
        <Modal
          title="同期を始める"
          onClose={() => setPlan(null)}
          footer={
            <>
              <Btn color="white" onClick={() => setPlan(null)}>
                やめる
              </Btn>
              <Btn color="softBlue" onClick={() => void start()} disabled={busy}>
                同期を始める
              </Btn>
            </>
          }
        >
          {plan.remoteJobs === 0 ? (
            <p className="text-sm leading-6">
              この合言葉のクラウドは、まだ空です（はじめての合言葉）。この端末の様邸 {plan.localJobs} 件などを送って、同期を始めます。
              <br />
              <span className="text-rose-700">ほかの端末で同期しているはずのときは、合言葉がちがっていないか確かめてください。</span>
            </p>
          ) : (
            <p className="text-sm leading-6">
              クラウドに様邸が {plan.remoteJobs} 件あります。この端末の様邸 {plan.localJobs} 件とまとめて、同期を始めます（どちらも消えません）。
            </p>
          )}
        </Modal>
      )}
      {leaving && (
        <Modal
          title="この端末の同期をやめますか？"
          onClose={() => setLeaving(false)}
          footer={
            <>
              <Btn color="white" onClick={() => setLeaving(false)}>
                やめない
              </Btn>
              <Btn
                color="white"
                onClick={() => {
                  setLeaving(false);
                  void cloud.disable().then(() => toast('この端末の同期をやめました'));
                }}
              >
                同期をやめる
              </Btn>
            </>
          }
        >
          <p className="text-sm leading-6">この端末のデータも、クラウドのデータも消えません。もう一度始めるときは、同じ合言葉を入れます。</p>
        </Modal>
      )}
    </section>
  );
}
