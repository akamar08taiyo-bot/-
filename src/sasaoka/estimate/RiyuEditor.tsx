// 住宅改修が必要な理由書のタブ（様邸の画面の「📄 理由書」。ユーザーの指示「必要に応じて住宅改修の理由書にも飛べるようにする。
// 入力できる項目を全て転記されるようにする」2026-10-22）。左に一覧（原本の上からの順）、右にプレビュー（原本の様式のまま2ページ）。
// 被保険者番号・氏名・生年月日・性別・要介護・郵便番号・住所・作成者の事業所と氏名は申請書と同じ欄なので、どちらで直してもすぐ両方に出る。
// ④改修項目は見積書・申請書の改修の箇所から（ここでは直さない）

import {useDeferredValue, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode} from 'react';
import {jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {circled, eraOf, INSURER_INFO, jobInsurer, KINDS, MARK_INFO, NO_SHINSEI} from '../estimateForms.ts';
import {ageAt, birthIso, RIYU_ACTS, RIYU_EQUIPMENT, RIYU_MAP, RIYU_PURPOSES, riyuOf, riyuShown, riyuValues} from '../riyu.ts';
import {insuredBoxes, padInsuredNo, workItems} from '../shinsei.ts';
import {shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField} from '../shinseiPreview.ts';
import type {AppData, Job, RiyuAct, RiyuActKey, RiyuInfo, ShinseiInfo, ShinseiMarks} from '../types.ts';
import type {Update} from '../useStore.ts';
import {todayIso} from '../util.ts';
import {saveRiyu, useTemplate} from './shinseiFiles.ts';
import {Circles, Note} from './ShinseiEditor.tsx';
import {ShinseiPages} from './ShinseiPreview.tsx';

type Field = ShinseiField;

/** 一覧の項目（原本の上からの順。P1 の基本情報・作成者・総合的状況・福祉用具、P2 の活動・改修項目） */
const SECTIONS: {title: string; fields: Field[]}[] = [
  {title: '基本情報', fields: ['insuredNo', 'name', 'birth', 'gender', 'care', 'careTerm', 'zip', 'address', 'housing']},
  {title: '作成者', fields: ['checkDate', 'madeDate', 'reason', 'qualification', 'tel']},
  {title: '総合的状況', fields: ['body', 'careState', 'wish', 'equipment']},
  {title: 'P2（活動ごと）', fields: ['act:toilet', 'act:bath', 'act:out', 'act:home', 'works']},
];

const LABEL: Partial<Record<Field, string>> = {
  insuredNo: '被保険者番号',
  name: '被保険者氏名',
  birth: '生年月日',
  gender: '性別',
  care: '要介護認定',
  careTerm: '認定有効期間',
  zip: '郵便番号',
  address: '住所',
  housing: '住宅状況',
  checkDate: '現地確認日',
  madeDate: '作成日',
  reason: '所属事業所・氏名',
  qualification: '資格（介護支援専門員でないとき）',
  tel: '連絡先',
  body: '利用者の身体状況',
  careState: '介護状況',
  wish: '住宅改修により、利用者等は日常生活をどう変えたいか',
  equipment: '福祉用具の利用状況と住宅改修後の想定',
  'act:toilet': '排泄',
  'act:bath': '入浴',
  'act:out': '外出',
  'act:home': 'その他（自宅内の移動）',
  works: '④ 改修項目（改修箇所）',
};
const label = (f: Field) => LABEL[f] ?? f;

/** 文章の欄（打った改行はそのまま原本の欄に） */
function TextArea({value, onChange, label: aria, rows = 3}: {value: string; onChange: (v: string) => void; label: string; rows?: number}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      aria-label={aria}
      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    />
  );
}

/** □の項目（押すと■。原本と同じ形） */
function Check({on, onChange, children, label: aria}: {on: boolean; onChange: (v: boolean) => void; children: ReactNode; label: string}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 py-0.5 text-sm">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} aria-label={aria} className="h-4 w-4 accent-slate-800" />
      {children}
    </label>
  );
}

export function RiyuEditor({job, data, update, onBack, tabs}: {job: Job; data: AppData; update: Update; onBack: () => void; tabs: ReactNode}) {
  const toast = useToast();
  const s = data.settings;
  const insurer = jobInsurer(job);
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const r = riyuShown(job);
  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const setRiyu = (patch: Partial<RiyuInfo>) => setJob((j) => ({...j, riyu: {...riyuOf(j), ...patch}}));
  const setAct = (key: RiyuActKey, patch: Partial<RiyuAct>) => setJob((j) => {
    const cur = riyuOf(j);
    return {...j, riyu: {...cur, acts: {...cur.acts, [key]: {...cur.acts[key], ...patch}}}};
  });
  const toggle = (list: number[], i: number, on: boolean) => (on ? [...new Set([...list, i])].sort((a, b) => a - b) : list.filter((x) => x !== i));
  const age = ageAt(birthIso(info), r.madeDate || todayIso());

  // まだ入っていない欄（色を付けて、上に一覧で出す。理由書を書くのにまず要る欄だけ）
  const missing: Partial<Record<Field, boolean>> = {
    insuredNo: !job.insuredNo.trim(),
    name: !job.customer.trim(),
    birth: !info.birthY.trim() || !info.birthM.trim() || !info.birthD.trim(),
    gender: !info.gender,
    care: !info.care,
    careTerm: !info.careFrom || !info.careTo,
    address: !job.address.trim(),
    housing: !r.housing,
    madeDate: !r.madeDate,
    reason: !info.reasonOffice.trim() || !info.reasonName.trim(),
    body: !r.body.trim(),
    careState: !r.care.trim(),
    wish: !r.wish.trim(),
  };
  const todo = SECTIONS.flatMap((x) => x.fields).filter((f) => missing[f]);

  // プレビュー：原本に今の内容を転記して描く（申請書と同じ描き方。1枚のシートを P1・P2 の2ページに）
  const template = useTemplate('riyu');
  const shown = useDeferredValue(job);
  const pages = useMemo((): PvPage[] | null => {
    if (!template) return null;
    try {
      return shinseiPreview(template, RIYU_MAP, riyuValues(shown, s));
    } catch {
      return [];
    }
  }, [template, shown, s]);
  const [active, setActive] = useState<Field | null>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  const marks: ShinseiMarks = {gender: info.gender, era: eraOf(info), care: info.care, renovated: info.renovated};
  // プレビューの丸の値（元号・要介護）を押したとき。元号は外さない（選んでいなければ昭和）
  const toggleMark = (key: keyof ShinseiMarks, option: string) => setInfo({[key]: key !== 'era' && info[key] === option ? '' : option} as Partial<ShinseiInfo>);
  const goField = (f: Field) => {
    setActive(f);
    document.querySelector<HTMLElement>(`[data-riyu-field="${f}"] input, [data-riyu-field="${f}"] textarea, [data-riyu-field="${f}"] button`)?.focus();
  };

  const save = () =>
    void saveRiyu(job, s).then(
      (fileName) => toast(`「${fileName}」を保存しました`),
      () => toast('理由書を作れませんでした', 'error'),
    );
  // Enter で次の欄へ（文章の欄は改行のまま。日本語の変換中は動かさない）
  const nextOnEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    if (!el.matches('input[type="text"], input[type="tel"], input:not([type])')) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('input[data-nav]')];
    const next = all[all.indexOf(el) + 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  const date = (value: string, onChange: (v: string) => void, aria: string) => (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-slate-300 px-2" aria-label={aria} />
  );

  const row = (f: Field): ReactNode => {
    switch (f) {
      case 'insuredNo':
        return (
          <>
            <TextInput
              value={job.insuredNo}
              onChange={(insuredNo) => setJob((j) => ({...j, insuredNo}))}
              onBlur={() => padInsuredNo(job.insuredNo) !== job.insuredNo && setJob((j) => ({...j, insuredNo: padInsuredNo(j.insuredNo)}))}
              inputMode="numeric"
              placeholder="10けた"
              className="w-36 font-mono"
              aria-label="被保険者番号"
              data-nav
            />
            <span className="flex" aria-hidden>
              {insuredBoxes(job.insuredNo).map((d, k) => (
                <span key={k} className="grid h-8 w-5 place-items-center border border-l-0 border-slate-400 font-mono first:border-l">
                  {d}
                </span>
              ))}
            </span>
          </>
        );
      case 'name':
        return <TextInput value={job.customer} onChange={(customer) => setJob((j) => ({...j, customer}))} placeholder="山田　太郎" className="w-full max-w-md text-base font-bold" aria-label="被保険者氏名" data-nav />;
      case 'birth':
        return (
          <>
            <Circles label="元号" options={MARK_INFO.era.options} value={eraOf(info)} onPick={(era) => era && setInfo({era: era as ShinseiInfo['era']})} />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <TextInput value={info.birthY} onChange={(birthY) => setInfo({birthY})} inputMode="numeric" className="w-14 text-right" aria-label="生年月日の年" data-nav />年
              <TextInput value={info.birthM} onChange={(birthM) => setInfo({birthM})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の月" data-nav />月
              <TextInput value={info.birthD} onChange={(birthD) => setInfo({birthD})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の日" data-nav />日
            </span>
            {age !== null && <span className="text-sm font-bold text-slate-700" aria-label="年齢">{age}歳</span>}
          </>
        );
      case 'gender':
        return <Circles label="性別" options={MARK_INFO.gender.options} value={info.gender} onPick={(gender) => setInfo({gender} as Partial<ShinseiInfo>)} />;
      case 'care':
        return <Circles label="要介護認定" options={MARK_INFO.care.options} value={info.care} onPick={(care) => setInfo({care} as Partial<ShinseiInfo>)} />;
      case 'careTerm':
        return (
          <span className="inline-flex flex-wrap items-center gap-1">
            {date(info.careFrom, (careFrom) => setInfo({careFrom}), '認定有効期間のはじめ')}～{date(info.careTo, (careTo) => setInfo({careTo}), '認定有効期間のおわり')}
          </span>
        );
      case 'zip':
        return (
          <span className="inline-flex items-center gap-1">
            〒<TextInput value={info.zip} onChange={(zip) => setInfo({zip})} inputMode="numeric" placeholder="824-0000" className="w-32" aria-label="郵便番号" data-nav />
          </span>
        );
      case 'address':
        return <TextInput value={job.address} onChange={(address) => setJob((j) => ({...j, address}))} placeholder="福岡県…" className="w-full" aria-label="住所" data-nav />;
      case 'housing':
        return (
          <>
            <Circles label="住宅状況" options={['持ち家', '借家', '借間', 'その他']} value={r.housing} onPick={(housing) => setRiyu({housing: housing as RiyuInfo['housing']})} />
            {r.housing === 'その他' && <TextInput value={r.housingOther} onChange={(housingOther) => setRiyu({housingOther})} className="w-48" aria-label="住宅状況のその他" data-nav />}
          </>
        );
      case 'checkDate':
        return (
          <>
            {date(r.checkDate, (checkDate) => setRiyu({checkDate}), '現地確認日')}
            {r.checkDate && !riyuOf(job).checkDate && <Note>改修前の写真の日付です</Note>}
          </>
        );
      case 'madeDate':
        return (
          <>
            {date(r.madeDate, (madeDate) => setRiyu({madeDate}), '作成日')}
            <Btn small color="white" onClick={() => setRiyu({madeDate: todayIso()})}>
              今日
            </Btn>
          </>
        );
      case 'reason':
        return (
          <>
            <span className="inline-flex items-center gap-1">
              所属事業所
              <TextInput value={info.reasonOffice} onChange={(reasonOffice) => setInfo({reasonOffice})} className="w-56" aria-label="作成者の所属事業所" data-nav />
            </span>
            <span className="inline-flex items-center gap-1">
              氏名
              <TextInput value={info.reasonName} onChange={(reasonName) => setInfo({reasonName})} className="w-40" aria-label="作成者の氏名" data-nav />
            </span>
          </>
        );
      case 'qualification':
        return <TextInput value={r.qualification} onChange={(qualification) => setRiyu({qualification})} className="w-56" aria-label="作成者の資格" data-nav />;
      case 'tel':
        return <TextInput type="tel" value={r.tel} onChange={(tel) => setRiyu({tel})} placeholder="0930-00-0000" className="w-48" aria-label="作成者の連絡先" data-nav />;
      case 'body':
        return <TextArea value={r.body} onChange={(body) => setRiyu({body})} label="利用者の身体状況" />;
      case 'careState':
        return <TextArea value={r.care} onChange={(care) => setRiyu({care})} label="介護状況" />;
      case 'wish':
        return <TextArea value={r.wish} onChange={(wish) => setRiyu({wish})} label="住宅改修により、利用者等は日常生活をどう変えたいか" rows={4} />;
      case 'equipment':
        return (
          <div className="w-full">
            <div role="table" aria-label="福祉用具の利用状況" className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] text-sm">
              <div className="font-bold text-slate-600" />
              <div className="text-center font-bold text-slate-600">改修前</div>
              <div className="text-center font-bold text-slate-600">改修後</div>
              {RIYU_EQUIPMENT.map((name) => {
                const e = r.equipment[name] ?? {};
                const set = (k: 'before' | 'after', on: boolean) => {
                  const next = {...e, [k]: on || undefined};
                  const equipment = {...r.equipment};
                  if (next.before || next.after) equipment[name] = {...(next.before ? {before: true} : {}), ...(next.after ? {after: true} : {})};
                  else delete equipment[name];
                  setRiyu({equipment});
                };
                return [
                  <div key={name} className="border-t border-slate-100 py-0.5">
                    ●{name}
                  </div>,
                  ...(['before', 'after'] as const).map((k) => (
                    <div key={name + k} className="grid place-items-center border-t border-slate-100">
                      <input type="checkbox" checked={!!e[k]} onChange={(ev) => set(k, ev.target.checked)} aria-label={`${name}の${k === 'before' ? '改修前' : '改修後'}`} className="h-4 w-4 accent-slate-800" />
                    </div>
                  )),
                ];
              })}
              {[0, 1, 2].map((i) => {
                const e = r.equipmentOther[i] ?? {name: '', before: false, after: false};
                const set = (patch: Partial<typeof e>) => {
                  const list = [0, 1, 2].map((k) => r.equipmentOther[k] ?? {name: '', before: false, after: false});
                  list[i] = {...e, ...patch};
                  while (list.length && !list[list.length - 1].name.trim() && !list[list.length - 1].before && !list[list.length - 1].after) list.pop();
                  setRiyu({equipmentOther: list});
                };
                return [
                  <div key={`o${i}`} className="flex items-center gap-1 border-t border-slate-100 py-0.5">
                    ・<TextInput value={e.name} onChange={(name) => set({name})} placeholder="その他" className="h-8 w-full" aria-label={`福祉用具のその他${i + 1}`} />
                  </div>,
                  ...(['before', 'after'] as const).map((k) => (
                    <div key={`o${i}${k}`} className="grid place-items-center border-t border-slate-100">
                      <input type="checkbox" checked={e[k]} onChange={(ev) => set({[k]: ev.target.checked})} aria-label={`福祉用具のその他${i + 1}の${k === 'before' ? '改修前' : '改修後'}`} className="h-4 w-4 accent-slate-800" />
                    </div>
                  )),
                ];
              })}
            </div>
          </div>
        );
      case 'works': {
        const items = workItems(job, s).filter((w) => w.name);
        return items.length === 0 ? (
          <Note>見積書・申請書で改修の箇所を入れると、ここに出ます</Note>
        ) : (
          <ul className="w-full space-y-0.5 text-sm">
            {KINDS.map((k, i) => {
              const names = items.filter((w) => w.kind === i + 1).map((w) => `${circled(w.photo)}${w.name}`);
              return names.length ? (
                <li key={k}>
                  ■ {k}：{names.join('・')}
                </li>
              ) : null;
            })}
          </ul>
        );
      }
      default: {
        if (!f.startsWith('act:')) return null;
        const key = f.slice(4) as RiyuActKey;
        const def = RIYU_ACTS.find((a) => a.key === key)!;
        const a = r.acts[key];
        return (
          <div className="w-full space-y-2">
            <div>
              <div className="text-xs font-bold text-slate-600">① 改善をしようとしている生活動作</div>
              {def.items.length > 0 ? (
                <div className="flex flex-wrap gap-x-3">
                  {def.items.map((it, i) => (
                    <Check key={it.cell} on={a.items.includes(i)} onChange={(on) => setAct(key, {items: toggle(a.items, i, on)})} label={`${def.label}：${it.name}`}>
                      {it.name}
                    </Check>
                  ))}
                  <span className="inline-flex items-center gap-1 text-sm">
                    その他（
                    <TextInput value={a.itemOther} onChange={(itemOther) => setAct(key, {itemOther})} className="h-8 w-40" aria-label={`${def.label}：①のその他`} />）
                  </span>
                </div>
              ) : (
                <TextArea value={a.itemOther} onChange={(itemOther) => setAct(key, {itemOther})} label={`${def.label}：①改善をしようとしている生活動作`} rows={2} />
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-600">② ①の具体的な困難な状況</div>
              <TextArea value={a.trouble} onChange={(trouble) => setAct(key, {trouble})} label={`${def.label}：②具体的な困難な状況`} rows={2} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-600">③ 改修目的・期待効果</div>
              <div className="flex flex-wrap gap-x-3">
                {RIYU_PURPOSES.slice(0, -1).map((p, i) => (
                  <Check key={p} on={a.purposes.includes(i)} onChange={(on) => setAct(key, {purposes: toggle(a.purposes, i, on)})} label={`${def.label}：${p}`}>
                    {p}
                  </Check>
                ))}
                <span className="inline-flex items-center gap-1 text-sm">
                  その他（
                  <TextInput value={a.purposeOther} onChange={(purposeOther) => setAct(key, {purposeOther})} className="h-8 w-40" aria-label={`${def.label}：③のその他`} />）
                </span>
              </div>
              <div className="mt-1 text-xs font-bold text-slate-600">改修の方針</div>
              <TextArea value={a.policy} onChange={(policy) => setAct(key, {policy})} label={`${def.label}：改修の方針`} rows={2} />
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-2">
          <Btn color="white" onClick={onBack}>
            ← 一覧へ戻る
          </Btn>
          {tabs}
          <h1 className="text-lg font-bold text-[#14532d]">{job.customer.trim() ? jobName(job) : '新しい理由書'}</h1>
          {insurer && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{INSURER_INFO[insurer].name}</span>}
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-lg:basis-full">
          <Btn color="softGreen" onClick={save}>
            📗 理由書をExcelで保存
          </Btn>
        </div>
        <div />
      </div>

      <section role="status" aria-label="入っていない欄" className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        {todo.length === 0 ? (
          <span className="font-bold text-emerald-800">✓ 理由書の欄はすべて入っています</span>
        ) : (
          <>
            <span className="text-slate-700">まだ入っていない欄：</span>
            {todo.map((f) => (
              <button key={f} type="button" onClick={() => goField(f)} className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-bold text-amber-900 hover:bg-amber-100">
                {label(f)}
              </button>
            ))}
          </>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div role="form" aria-label="理由書" onKeyDown={nextOnEnter} className="min-w-0 overflow-hidden rounded-lg border-2 border-slate-700 bg-white shadow-sm">
          <div className="border-b-2 border-slate-700 px-4 py-2.5 text-center text-base font-bold text-slate-800">住宅改修が必要な理由書</div>
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div className="border-b border-slate-300 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">〈{sec.title}〉</div>
              {sec.fields.map((f) => (
                <div
                  key={f}
                  data-riyu-field={f}
                  onFocus={() => setActive(f)}
                  className={`border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[9.5rem_1fr] ${active === f ? 'relative z-[1] outline outline-2 -outline-offset-2 outline-sky-500' : ''}`}
                >
                  <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label(f)}</div>
                  <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${missing[f] ? 'bg-amber-50' : ''}`}>{row(f)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div ref={previewBox} className="min-w-0 rounded-lg bg-slate-200/60 p-2 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto" style={{scrollbarGutter: 'stable'}}>
          {pages === null ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">理由書を開いています…</p>
          ) : pages.length > 0 ? (
            <ShinseiPages pages={pages} missing={missing} active={active} marks={marks} label={label} onOpen={goField} onToggle={toggleMark} scrollBox={previewBox} title="理由書のプレビュー" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
