// 介護保険証から入れる：ファイル（画像・PDF）を選ぶ・ドロップする → この端末の中で読む（cardOcr.ts）→ 確かめる画面で読めた値を直して入れる。
// （ユーザーの指示「介護保険証をドラッグ＆ドロップで添付したら、全ての情報…入力必要項目が全て入力される」2026-10-22）
// 様邸の画面の4つのタブのすぐ右（この様邸に入れる）と、見積もりの入口の新規作成（保険者も保険証から）にある。
// 画面をクリックしてから Ctrl+V で貼り付けてもよい（ユーザーの指示「上のタブの近辺に…ドラッグアンドドロップでも添付、もしくはクリックしてから挿入で貼り付け」2026-10-22。
// スクリーンショットや、デスクトップでコピーしたファイル）。字を打つ欄にいるときの Ctrl+V は、ふつうの貼り付けのまま
// 保険証の画像は保存せず、どこにも送らない（確かめる画面に出すだけ）
// 同じ入口に、介護ソフトのお客様の欄のスクリーンショットも入れられる（ユーザーの指示「介護ソフトの…部分をスクリーンショットで切り取り、貼り付けたら、
// 同様の情報が自動的に入力される」2026-10-23。careSoftOcr.ts がどちらか決めて読む）。確かめる画面は同じで、保険証にない項目（電話番号・担当・ケアマネジャー・
// 居宅の電話・生活保護）の行は読めたときだけ出す。入口は点線の枠に「ここにドロップ・Ctrl+V」（ドロップできることが分かるように。ui.tsx の DropArea）

import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {applyCard, applyExtra, birthText, CARD_FIELDS, currentExtra, currentOf, defaultPicks, EXTRA_FIELDS, extraPicks, extraText, fieldText, sameExtra, sameText, staffMatch} from '../cardApply.ts';
import type {CardField, ExtraField, ExtraInfo, ReadResult} from '../cardApply.ts';
import {isCardFile} from '../cardOcr.ts';
import type {CardProgress} from '../cardOcr.ts';
import {readCardOrScreen} from '../careSoftOcr.ts';
import {INSURER_IDS, INSURER_INFO, MARK_INFO, NO_SHINSEI} from '../estimateForms.ts';
import type {CardInfo} from '../hokensho.ts';
import {riyuOf} from '../riyu.ts';
import type {Insurer, Job} from '../types.ts';
import {Btn, DropArea, Modal, TextInput, useToast} from './ui.tsx';

/**
 * 介護保険証・介護ソフトの画面の入口（点線の枠。押すとファイルを選ぶ。ファイルをこの枠にドロップしても、画面で Ctrl+V で貼り付けてもよい）。読めたら onRead。
 * children：枠の言葉（読み上げの名前にも）、hint：その下の小さな言葉
 */
export function CardDrop({onRead, children, hint, className = '', big = false}: {onRead: (r: {read: ReadResult; thumbs: string[]}) => void; children: string; hint?: ReactNode; className?: string; big?: boolean}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
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
      const r = await readCardOrScreen(files, (p) => !ac.signal.aborted && setProgress(p), ac.signal);
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
      <DropArea name={children} label={children} hint={hint} big={big} className={className} onPick={() => input.current?.click()} onFiles={(files) => void read(files)} />
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

/** 保険証にない項目（介護ソフトの画面から）の値を直す欄。担当は担当者の候補から選ぶ */
function ExtraInput({field, v, set, staffList}: {field: ExtraField; v: ExtraInfo; set: (patch: Partial<ExtraInfo>) => void; staffList: string[]}) {
  const cls = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm';
  const label = EXTRA_FIELDS.find((x) => x.field === field)?.label ?? field;
  if (field === 'staff')
    return (
      <select value={v.staff} onChange={(e) => set({staff: e.target.value})} className={cls} aria-label="担当（読んだ値）">
        <option value="" />
        {staffList.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    );
  if (field === 'welfare')
    return (
      <select value={v.welfare} onChange={(e) => set({welfare: e.target.value as ExtraInfo['welfare']})} className={cls} aria-label="生活保護（読んだ値）">
        <option value="" />
        <option value="yes">あり（生保）</option>
        <option value="no">なし</option>
      </select>
    );
  return <TextInput value={v[field]} onChange={(t) => set({[field]: t} as Partial<ExtraInfo>)} className="w-full min-w-0" aria-label={`${label}（読んだ値）`} inputMode={field === 'phone' || field === 'reasonTel' ? 'tel' : undefined} />;
}

/**
 * 確かめる画面：左に保険証の画像（向きを直したもの）・介護ソフトの画面、右に読めた値（直せる）と今の値。チェックした行だけ入れる。
 * job：入れる様邸（新規作成のときは、保険者を選んでから作る空の様邸）。newJob：新規作成（保険者を選ぶまで入れられない）。
 * staffList：担当者の候補（介護ソフトの画面の担当は、候補にある名前のときだけ入れる）
 */
export function CardDialog({job, read, thumbs, onApply, onClose, newJob = false, staffList}: {job: Job; read: ReadResult; thumbs: string[]; onApply: (next: Job) => void; onClose: () => void; newJob?: boolean; staffList?: string[]}) {
  const [v, setV] = useState<CardInfo>(read.info);
  const [picks, setPicks] = useState<Set<CardField>>(() => {
    const p = defaultPicks(job, read.info, read.unsure);
    if (newJob) p.add('insurer');
    return p;
  });
  const [big, setBig] = useState<string | null>(null);
  // 介護ソフトの画面から読んだときの、保険証にない項目（担当は担当者の候補の名前にしてから。候補になければ空）
  const soft = read.soft;
  const staff = staffList ?? [];
  const exRead: ExtraInfo | null = soft ? {...soft.extra, staff: staffMatch(soft.extra.staff, staff)} : null;
  const [ex, setEx] = useState<ExtraInfo | null>(exRead);
  const [exPicks, setExPicks] = useState<Set<ExtraField>>(() => (soft && exRead ? extraPicks(job, exRead, soft.unsure) : new Set<ExtraField>()));
  // 担当の行は、担当者の候補を渡されたときだけ（特定福祉用具申請書のタブには候補がない）
  const exRows = soft ? EXTRA_FIELDS.filter(({field}) => extraText(soft.extra, field) && (field !== 'staff' || staffList)) : [];
  // 介護ソフトの画面には保険者番号がない（行を出さない）
  const fields = soft ? CARD_FIELDS.filter((f) => f.field !== 'insurerNo') : CARD_FIELDS;
  const cur = currentOf(job);
  const curEx = currentExtra(job);
  const setExField = (field: ExtraField) => (patch: Partial<ExtraInfo>) => {
    setEx((x) => (x ? {...x, ...patch} : x));
    setExPicks((p) => new Set(p).add(field));
  };
  const toggleEx = (field: ExtraField, on: boolean) =>
    setExPicks((p) => {
      const n = new Set(p);
      if (on) n.add(field);
      else n.delete(field);
      return n;
    });
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
  const found = fields.filter((f) => fieldText(read.info, f.field)).length + exRows.length;
  const count = picks.size + exPicks.size;
  const apply = () => {
    const p = new Set(picks);
    for (const f of [...p]) if (!fieldText(v, f) && f !== 'insurer') p.delete(f);
    const next = applyCard(job, v, p);
    onApply(ex ? applyExtra(next, ex, new Set([...exPicks].filter((f) => extraText(ex, f) && exRows.some((r) => r.field === f))), staff) : next);
  };
  return (
    <Modal
      title={soft ? '🪪 介護ソフトの画面から入れる' : '🪪 介護保険証から入れる'}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {needInsurer && <span className="text-sm font-bold text-red-700">保険者を選んでください</span>}
          <Btn color="white" onClick={onClose}>
            キャンセル
          </Btn>
          <Btn color="emerald" onClick={apply} disabled={needInsurer || count === 0}>
            {newJob ? 'この内容で新規作成' : `チェックした ${count} 項目を入れる`}
          </Btn>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          {thumbs.map((t, i) => (
            <button key={i} type="button" onClick={() => setBig(t)} className="block w-full overflow-hidden rounded border border-slate-300 bg-white" aria-label={`${soft ? '画面' : '保険証'}の画像 ${i + 1}枚目（押すと大きく）`}>
              <img src={t} alt="" className="block w-full" />
            </button>
          ))}
          <p className="text-xs text-slate-500">読み取りはこの端末の中だけで行い、{soft ? '画面' : '保険証'}の画像は保存も送信もしません。</p>
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
            {fields.map(({field, label, keys}) => {
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
            {soft &&
              ex &&
              exRows.map(({field, label}) => {
                const unsure = soft.unsure.includes(field);
                const value = extraText(ex, field);
                const now = extraText(curEx, field);
                return (
                  <div key={field} role="row" aria-label={label} className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-1 border-t border-slate-200 py-1 sm:grid-cols-[2rem_8.5rem_minmax(0,1fr)_minmax(0,12rem)] ${unsure && value ? 'bg-amber-50' : !value ? 'bg-slate-50' : ''}`}>
                    <div className="px-2">
                      <input type="checkbox" checked={exPicks.has(field)} onChange={(e) => toggleEx(field, e.target.checked)} aria-label={`${label}を入れる`} className="h-4 w-4 accent-emerald-700" />
                    </div>
                    <div className="px-1 font-bold text-slate-700">
                      {label}
                      {unsure && value && <span className="ml-1 text-xs font-normal text-amber-800">（確かめて）</span>}
                    </div>
                    <div className="col-span-2 min-w-0 px-2 sm:col-span-1">
                      <ExtraInput field={field} v={ex} set={setExField(field)} staffList={staff} />
                      {field === 'staff' && !value && <div className="text-xs text-slate-500">担当者の候補にない名前：{soft.extra.staff}</div>}
                      {field === 'reasonName' && <div className="text-xs text-slate-500">理由書の作成者の氏名に入れます</div>}
                      {field === 'reasonTel' && <div className="text-xs text-slate-500">理由書の作成者の連絡先に入れます</div>}
                    </div>
                    {!newJob && (
                      <div className="col-span-2 truncate px-2 text-xs text-slate-500 sm:col-span-1" title={now}>
                        {now ? `今：${now}` : '今：（空）'}
                        {now && value && sameExtra(field, now, value) && <span className="ml-1 text-emerald-700">（同じ）</span>}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          {soft && <p className="mt-2 text-xs text-slate-500">読んだもの：介護ソフトの画面</p>}
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

/** 様邸の画面（4つのタブのすぐ右）の「🪪 介護保険証・介護ソフトの画面」：読んで、確かめて、この様邸に入れる。staffList：担当者の候補 */
export function CardFill({job, setJob, staffList}: {job: Job; setJob: (fn: (j: Job) => Job) => void; staffList?: string[]}) {
  const toast = useToast();
  const [got, setGot] = useState<{read: ReadResult; thumbs: string[]} | null>(null);
  return (
    <>
      <CardDrop onRead={setGot}>🪪 介護保険証・介護ソフトの画面</CardDrop>
      {got && (
        <CardDialog
          job={job}
          read={got.read}
          thumbs={got.thumbs}
          staffList={staffList}
          onClose={() => setGot(null)}
          onApply={(next) => {
            // 確かめているあいだに直した欄（申請書の一覧など）は、入れる項目のほかはそのまま（担当・理由書の作成者の連絡先は、介護ソフトの画面から入れたときだけ変わる）
            setJob((j) => ({
              ...j,
              insuredNo: next.insuredNo,
              customer: next.customer,
              address: next.address,
              insurer: next.insurer,
              form: next.form,
              staff: next.staff === job.staff ? j.staff : next.staff,
              ...(next.riyu !== job.riyu ? {riyu: {...riyuOf(j), tel: riyuOf(next).tel}} : {}),
              shinsei: {...NO_SHINSEI, ...j.shinsei, ...diffShinsei(job, next)},
            }));
            setGot(null);
            toast(got.read.soft ? '介護ソフトの画面の内容を入れました（申請書・理由書・見積書に出ます）' : '介護保険証の内容を入れました（申請書・理由書・見積書に出ます）');
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
