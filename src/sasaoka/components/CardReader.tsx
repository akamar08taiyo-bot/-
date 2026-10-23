// 介護保険証から入れる：ファイル（画像・PDF）を選ぶ・ドロップする → この端末の中で読む（cardOcr.ts）→ 確かめる画面で読めた値を直して入れる。
// （ユーザーの指示「介護保険証をドラッグ＆ドロップで添付したら、全ての情報…入力必要項目が全て入力される」2026-10-22）
// 様邸の画面の4つのタブのすぐ右（この様邸に入れる）と、見積もりの入口の新規作成（保険者も保険証から）にある。
// 画面をクリックしてから Ctrl+V で貼り付けてもよい（ユーザーの指示「上のタブの近辺に…ドラッグアンドドロップでも添付、もしくはクリックしてから挿入で貼り付け」2026-10-22。
// スクリーンショットや、デスクトップでコピーしたファイル）。字を打つ欄にいるときの Ctrl+V は、ふつうの貼り付けのまま
// 保険証の画像は保存せず、どこにも送らない（確かめる画面に出すだけ）

import {useEffect, useRef, useState} from 'react';
import type {DragEvent, ReactNode} from 'react';
import {applyCard, birthText, CARD_FIELDS, currentOf, defaultPicks, fieldText, sameText} from '../cardApply.ts';
import type {CardField} from '../cardApply.ts';
import {isCardFile, readCards} from '../cardOcr.ts';
import type {CardProgress} from '../cardOcr.ts';
import {INSURER_IDS, INSURER_INFO, MARK_INFO, NO_SHINSEI} from '../estimateForms.ts';
import type {CardInfo, CardRead} from '../hokensho.ts';
import type {Insurer, Job} from '../types.ts';
import {Btn, Modal, TextInput, useToast} from './ui.tsx';

/**
 * 介護保険証のボタン（押すとファイルを選ぶ。ファイルをこのボタンにドロップしても、画面で Ctrl+V で貼り付けてもよい）。読めたら onRead
 */
export function CardDrop({onRead, children, className = '', big = false}: {onRead: (r: {read: CardRead; thumbs: string[]}) => void; children: ReactNode; className?: string; big?: boolean}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<CardProgress | null>(null);
  // 読んでいるのをやめる（読み取りの部品をネットから取ってこられずに止まったときも、閉じられるように）
  const running = useRef<AbortController | null>(null);
  const read = async (list: FileList | File[] | null) => {
    const files = [...(list ?? [])].filter(isCardFile);
    if (files.length === 0) {
      if (list && list.length) toast('画像（写真・スキャン）か PDF を入れてください', 'error');
      return;
    }
    const ac = new AbortController();
    running.current = ac;
    setProgress({step: 'ファイルを開いています', page: 0, pages: 0});
    try {
      const r = await readCards(files, (p) => !ac.signal.aborted && setProgress(p), ac.signal);
      if (ac.signal.aborted) return;
      // 開けないファイルは飛ばして、ほかのファイルを読む
      if (r.skipped.length) toast(`開けないファイルがありました：${r.skipped.join('、')}（iPhone の写真の HEIC・パスワードのある PDF は開けないことがあります。JPEG・PNG か、パスワードのない PDF で入れてください）`, 'error');
      if (r.skipped.length && r.thumbs.length === 0) return;
      if (Object.values(r.read.info).every((v) => !v)) toast('介護保険証の字が読めませんでした。明るく、まっすぐに写した画像で試してください', 'error');
      onRead(r);
    } catch {
      if (!ac.signal.aborted) toast('介護保険証を読めませんでした（はじめて使うときは、読み取りの部品をネットから取ってきます。ネットにつながっているか確かめてください）', 'error');
    } finally {
      if (running.current === ac) {
        running.current = null;
        setProgress(null);
      }
    }
  };
  const cancel = () => {
    running.current?.abort();
    running.current = null;
    setProgress(null);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    void read(e.dataTransfer.files);
  };
  // 画面で Ctrl+V：クリップボードの画像・PDF（files にないときは items から）を読む。読んでいるあいだ・字を打つ欄では何もしない
  const reading = useRef(false);
  reading.current = progress !== null;
  const readLatest = useRef(read);
  readLatest.current = read;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (reading.current || !e.clipboardData) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      // 確かめる画面など、ほかの画面が開いているときは読まない
      if (document.querySelector('[role="dialog"]')) return;
      const fromItems = [...e.clipboardData.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile());
      const files = (e.clipboardData.files.length ? [...e.clipboardData.files] : fromItems.filter((f): f is File => f !== null)).filter(isCardFile);
      if (files.length === 0) return;
      // 文字もあるとき（Excel の表をコピーすると、文字と一緒に表の絵も入る）は保険証にしない。
      // ただし文字がファイルの名前だけのとき（Mac でファイルをコピーすると名前も入る）は、ファイルの貼り付け
      const text = e.clipboardData.getData('text/plain').trim();
      if (text && !text.split(/\r?\n/).every((line) => files.some((f) => f.name === line.trim()))) return;
      e.preventDefault();
      void readLatest.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed font-bold transition ${over ? 'border-sky-500 bg-sky-50 text-sky-900' : 'border-sky-300 bg-white text-sky-800 hover:bg-sky-50'} ${big ? 'px-4 py-4 text-base' : 'px-3 py-1.5 text-sm'} ${className}`}
      >
        {children}
      </button>
      <input ref={input} type="file" accept="image/*,application/pdf,.pdf" multiple className="hidden" aria-label="介護保険証のファイル" onChange={(e) => void read(e.target.files).finally(() => (e.target.value = ''))} />
      {progress && (
        <Modal
          title="🪪 介護保険証を読んでいます"
          onClose={cancel}
          footer={
            <Btn color="white" onClick={cancel}>
              やめる
            </Btn>
          }
        >
          <div role="status" aria-label="介護保険証を読んでいます" className="space-y-3 py-2 text-sm text-slate-700">
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" aria-hidden />
              <span className="font-bold">
                {progress.step}
                {progress.pages > 0 && `（${progress.page}／${progress.pages}枚目）`}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              1枚に 10〜40 秒ほどかかります。はじめて使うときは、読み取りの部品（約5MB）をネットから取ってきます。保険証の画像はこの端末の中で読み、保存も送信もしません。
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

/** 1行の値を直す欄 */
function FieldInput({field, v, set}: {field: CardField; v: CardInfo; set: (patch: Partial<CardInfo>) => void}) {
  const cls = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm';
  switch (field) {
    case 'birth':
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <select value={v.era} onChange={(e) => set({era: e.target.value as CardInfo['era']})} className={cls} aria-label="生年月日の元号（読んだ値）">
            <option value="" />
            {['明治', '大正', '昭和', '平成'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <TextInput value={v.birthY} onChange={(birthY) => set({birthY})} className="w-14 text-right" aria-label="生年月日の年（読んだ値）" />年
          <TextInput value={v.birthM} onChange={(birthM) => set({birthM})} className="w-12 text-right" aria-label="生年月日の月（読んだ値）" />月
          <TextInput value={v.birthD} onChange={(birthD) => set({birthD})} className="w-12 text-right" aria-label="生年月日の日（読んだ値）" />日
        </span>
      );
    case 'gender':
      return (
        <select value={v.gender} onChange={(e) => set({gender: e.target.value as CardInfo['gender']})} className={cls} aria-label="性別（読んだ値）">
          <option value="" />
          <option>男</option>
          <option>女</option>
        </select>
      );
    case 'care':
      return (
        <select value={v.care} onChange={(e) => set({care: e.target.value as CardInfo['care']})} className={cls} aria-label="要介護状態区分（読んだ値）">
          <option value="" />
          {MARK_INFO.care.options.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      );
    case 'careTerm':
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <input type="date" value={v.careFrom} onChange={(e) => set({careFrom: e.target.value})} className={cls} aria-label="認定の有効期間のはじめ（読んだ値）" />～
          <input type="date" value={v.careTo} onChange={(e) => set({careTo: e.target.value})} className={cls} aria-label="認定の有効期間のおわり（読んだ値）" />
        </span>
      );
    case 'insurer':
      return (
        <select value={v.insurer} onChange={(e) => set({insurer: e.target.value as CardInfo['insurer']})} className={cls} aria-label="保険者（読んだ値）">
          <option value="" />
          {INSURER_IDS.map((i) => (
            <option key={i} value={i}>
              {INSURER_INFO[i].name}
              {i === 'kouiki' ? '（築上町・豊前市・上毛町・吉富町）' : ''}
            </option>
          ))}
        </select>
      );
    case 'burden':
      return (
        <select value={v.burden} onChange={(e) => set({burden: e.target.value as CardInfo['burden']})} className={cls} aria-label="利用者負担の割合（読んだ値）">
          <option value="" />
          <option value="1">1割</option>
          <option value="2">2割</option>
          <option value="3">3割</option>
        </select>
      );
    default: {
      const label = CARD_FIELDS.find((x) => x.field === field)?.label ?? field;
      return <TextInput value={String(v[field])} onChange={(t) => set({[field]: t} as Partial<CardInfo>)} className="w-full min-w-0" aria-label={`${label}（読んだ値）`} inputMode={field === 'insuredNo' || field === 'insurerNo' || field === 'zip' ? 'numeric' : undefined} />;
    }
  }
}

/**
 * 確かめる画面：左に保険証の画像（向きを直したもの）、右に読めた値（直せる）と今の値。チェックした行だけ入れる。
 * job：入れる様邸（新規作成のときは、保険者を選んでから作る空の様邸）。newJob：新規作成（保険者を選ぶまで入れられない）
 */
export function CardDialog({job, read, thumbs, onApply, onClose, newJob = false}: {job: Job; read: CardRead; thumbs: string[]; onApply: (next: Job) => void; onClose: () => void; newJob?: boolean}) {
  const [v, setV] = useState<CardInfo>(read.info);
  const [picks, setPicks] = useState<Set<CardField>>(() => {
    const p = defaultPicks(job, read.info, read.unsure);
    if (newJob) p.add('insurer');
    return p;
  });
  const [big, setBig] = useState<string | null>(null);
  const cur = currentOf(job);
  const set = (field: CardField) => (patch: Partial<CardInfo>) => {
    setV((x) => ({...x, ...patch}));
    setPicks((p) => new Set(p).add(field));
  };
  const toggle = (field: CardField, on: boolean) =>
    setPicks((p) => {
      const n = new Set(p);
      if (on) n.add(field);
      else n.delete(field);
      return n;
    });
  const insurerChange = !newJob && picks.has('insurer') && v.insurer && job.insurer && v.insurer !== job.insurer;
  const needInsurer = newJob && !v.insurer;
  const found = CARD_FIELDS.filter((f) => fieldText(read.info, f.field)).length;
  const apply = () => {
    const p = new Set(picks);
    for (const f of [...p]) if (!fieldText(v, f) && f !== 'insurer') p.delete(f);
    onApply(applyCard(job, v, p));
  };
  return (
    <Modal
      title="🪪 介護保険証から入れる"
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {needInsurer && <span className="text-sm font-bold text-red-700">保険者を選んでください</span>}
          <Btn color="white" onClick={onClose}>
            キャンセル
          </Btn>
          <Btn color="emerald" onClick={apply} disabled={needInsurer || picks.size === 0}>
            {newJob ? 'この内容で新規作成' : `チェックした ${picks.size} 項目を入れる`}
          </Btn>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          {thumbs.map((t, i) => (
            <button key={i} type="button" onClick={() => setBig(t)} className="block w-full overflow-hidden rounded border border-slate-300 bg-white" aria-label={`保険証の画像 ${i + 1}枚目（押すと大きく）`}>
              <img src={t} alt="" className="block w-full" />
            </button>
          ))}
          <p className="text-xs text-slate-500">読み取りはこの端末の中だけで行い、保険証の画像は保存も送信もしません。</p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm text-slate-700">
            {found} 項目を読みました。<span className="rounded bg-amber-100 px-1 font-bold text-amber-900">黄色</span>
            の行は読み違いがあるかもしれません。画像と見くらべて、直してから入れてください。
          </p>
          <div role="table" aria-label="読んだ値" className="overflow-hidden rounded-lg border border-slate-300 text-sm">
            <div role="row" className="hidden grid-cols-[2rem_8.5rem_minmax(0,1fr)_minmax(0,12rem)] bg-slate-100 font-bold text-slate-600 sm:grid">
              <div role="columnheader" className="px-2 py-1.5" />
              <div role="columnheader" className="px-2 py-1.5">項目</div>
              <div role="columnheader" className="px-2 py-1.5">読んだ値</div>
              <div role="columnheader" className="px-2 py-1.5">{newJob ? '' : '今の値'}</div>
            </div>
            {CARD_FIELDS.map(({field, label, keys}) => {
              const unsure = keys.some((k) => read.unsure.includes(k));
              const value = fieldText(v, field);
              const now = fieldText(cur, field);
              return (
                <div key={field} role="row" aria-label={label} className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-1 border-t border-slate-200 py-1 sm:grid-cols-[2rem_8.5rem_minmax(0,1fr)_minmax(0,12rem)] ${unsure && value ? 'bg-amber-50' : !value ? 'bg-slate-50' : ''}`}>
                  <div className="px-2">
                    <input type="checkbox" checked={picks.has(field)} onChange={(e) => toggle(field, e.target.checked)} aria-label={`${label}を入れる`} className="h-4 w-4 accent-emerald-700" disabled={newJob && field === 'insurer'} />
                  </div>
                  <div className="px-1 font-bold text-slate-700">
                    {label}
                    {unsure && value && <span className="ml-1 text-xs font-normal text-amber-800">（確かめて）</span>}
                    {!fieldText(read.info, field) && <span className="ml-1 text-xs font-normal text-slate-500">（読めず）</span>}
                  </div>
                  <div className="col-span-2 min-w-0 px-2 sm:col-span-1">
                    <FieldInput field={field} v={v} set={set(field)} />
                    {field === 'birth' && v.era === '平成' && <div className="text-xs text-slate-500">申請書の元号は 明治・大正・昭和 だけなので、元号は空で入れます</div>}
                    {field === 'office' && <div className="text-xs text-slate-500">理由書の作成者の所属事業所に入れます</div>}
                    {field === 'insurer' && insurerChange && <div className="text-xs font-bold text-red-700">この様邸は{INSURER_INFO[job.insurer as Insurer].name}です。変えると申請書の様式も変わります</div>}
                  </div>
                  {!newJob && (
                    <div className="col-span-2 truncate px-2 text-xs text-slate-500 sm:col-span-1" title={now}>
                      {now ? `今：${now}` : '今：（空）'}
                      {now && value && sameText(now, value) && <span className="ml-1 text-emerald-700">（同じ）</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {read.kinds.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              読んだもの：{read.kinds.map((k) => (k === 'card' ? '被保険者証' : '負担割合証')).join('・')}
              {!read.kinds.includes('futan') && '（利用者負担の割合は、負担割合証もいっしょに入れると読めます）'}
            </p>
          )}
          {birthText(v) === '' && v.birthY && <p className="text-xs text-red-700">生年月日の元号を選んでください</p>}
        </div>
      </div>
      {big && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" onClick={() => setBig(null)} role="presentation">
          <img src={big} alt="保険証の画像（大きく）" className="max-h-full max-w-full rounded bg-white" />
        </div>
      )}
    </Modal>
  );
}

/** 様邸の画面（申請書・理由書のタブ）の「🪪 介護保険証から入れる」：読んで、確かめて、この様邸に入れる */
export function CardFill({job, setJob}: {job: Job; setJob: (fn: (j: Job) => Job) => void}) {
  const toast = useToast();
  const [got, setGot] = useState<{read: CardRead; thumbs: string[]} | null>(null);
  return (
    <>
      <CardDrop onRead={setGot}>🪪 介護保険証から入れる</CardDrop>
      {got && (
        <CardDialog
          job={job}
          read={got.read}
          thumbs={got.thumbs}
          onClose={() => setGot(null)}
          onApply={(next) => {
            // 確かめているあいだに直した欄（申請書の一覧など）は、入れる項目のほかはそのまま
            setJob((j) => ({...j, insuredNo: next.insuredNo, customer: next.customer, address: next.address, insurer: next.insurer, form: next.form, shinsei: {...NO_SHINSEI, ...j.shinsei, ...diffShinsei(job, next)}}));
            setGot(null);
            toast('介護保険証の内容を入れました（申請書・理由書・見積書に出ます）');
          }}
        />
      )}
    </>
  );
}

/** 入れた項目（申請書の項目のうち、変わったもの） */
function diffShinsei(before: Job, after: Job): Partial<Job['shinsei']> {
  const out: Record<string, unknown> = {};
  const was = (before.shinsei ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(after.shinsei)) if (was[k] !== v) out[k] = v;
  return out as Partial<Job['shinsei']>;
}
