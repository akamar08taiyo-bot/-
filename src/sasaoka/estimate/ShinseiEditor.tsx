// 申請書のタブ（様邸の画面の左のタブ。右は見積書）：保険者の申請書を、原本の様式のまま画面に出して（プレビュー）、確かめながら作る
// （ユーザーの指示「申請書については、プレビューで、確認しながら作成できるようにする。その他の部分に関しては手入力で、そのまま入力できるように」）。
// 申請書の欄を押すと、その項目を入れる所がすぐ下に出る。打つとプレビューもすぐ変わる。Enter で次の欄（申請書の上からの順番）へ移る。
// 丸で囲む項目（性別・要介護状態区分など）は、申請書の文字を押すと丸がつく。まだ入っていない欄は薄い黄色にし、上にも一覧で出す。
// 「一覧で入れる」にすると、前の版と同じ、申請書の順番に項目を並べた入れ方になる。
// 見積書と同じ様邸（Job）：氏名・住所・被保険者番号・改修の箇所は見積書と同じ欄、改修予定費用は見積書の金額なので、どちらで直してもすぐ両方に出る。
// 申請書だけ・見積書だけでもよい（見積書がないときは、改修の内容を箇所ごとに書き、改修費用を手で入れる）。
// 写真（PhotoBoard）：写真番号の箇所ごとに改修前・改修後の写真を入れ、入れ替える。プレビューの写真貼付用紙にも出し、Excel の写真貼付用紙に貼る

import {Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode} from 'react';
import {isBlankRow, jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {circled, INSURER_IDS, INSURER_INFO, jobInsurer, KINDS, MARK_INFO, NO_SHINSEI, photoNumbers} from '../estimateForms.ts';
import {manualRow, newPlace} from '../rows.ts';
import {usePhotoUrls} from '../photos.ts';
import {autoWorkText, costIsTotal, insuredBoxes, photoSheets, SHINSEI, shinseiCost, shinseiKinds, shinseiValues, shinseiWorks} from '../shinsei.ts';
import {shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField as Field} from '../shinseiPreview.ts';
import type {AppData, Insurer, Job, Place, Settings, ShinseiInfo, ShinseiMarks} from '../types.ts';
import type {Update} from '../useStore.ts';
import {yen} from '../util.ts';
import {PhotoBoard, photoPlaces, usePhotoActions} from './PhotoBoard.tsx';
import type {PhotoKey, PhotoSlot} from './PhotoBoard.tsx';
import {canMakeShinsei, saveShinsei, useTemplate} from './shinseiFiles.ts';
import {ShinseiPages} from './ShinseiPreview.tsx';

/** 欄の順番：保険者ごとの申請書の上からの順番（原本を見て決めた。みやこ町・広域連合は承認の申請書の順番で、支給申請書だけの着工日・完成日は最後） */
const FIELDS: Record<Insurer, Field[]> = {
  kanda: ['kana', 'insuredNo', 'name', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'owner', 'works', 'dates', 'cost'],
  yukuhashi: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'owner', 'works', 'dates', 'cost'],
  miyako: ['kana', 'insuredNo', 'name', 'birth', 'gender', 'zip', 'address', 'phone', 'owner', 'reason', 'works', 'cost', 'renovated', 'dates'],
  kouiki: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'address', 'phone', 'owner', 'reason', 'works', 'cost', 'renovated', 'dates'],
};

/** みやこ町・広域連合：改修の内容は内訳明細書（別紙）、着工日・完成日は支給申請書（工事のあと）に書く */
const twoForms = (i: Insurer) => i === 'miyako' || i === 'kouiki';

/** 欄の名前（申請書の言葉） */
function label(f: Field, i: Insurer): string {
  if (f === 'cost') return twoForms(i) ? '改修費用（介護保険対象分）' : '改修予定費用';
  if (f === 'dates') return twoForms(i) ? '着工日・完成日' : i === 'kanda' ? '着工予定日・完了予定日' : '着工予定日・完成予定日';
  return {
    kana: 'フリガナ',
    name: '被保険者氏名',
    insuredNo: '被保険者番号',
    birth: '生年月日',
    gender: '性別',
    zip: '郵便番号',
    address: '住所',
    phone: '電話番号',
    care: '要介護状態区分',
    owner: '住宅の所有者',
    reason: '住宅改修が必要な理由書作成者',
    works: '改修の内容・箇所及び規模',
    renovated: '現在までの改修状況',
  }[f];
}

/** 入れ方：申請書の形（プレビューの欄を押して入れる）か、一覧（項目を並べて入れる）か。この端末で覚えておく */
type Mode = 'form' | 'list';
const MODE_KEY = 'sasaoka-app:shinsei-mode';
function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'form';
  } catch {
    return 'form';
  }
}

/** 申請書の名前（画面の上に出す） */
const FORM_TITLE: Record<Insurer, string> = {
  kanda: '住宅改修費支給事前申請書（受領委任払用）',
  yukuhashi: '住宅改修費受領委任払申請書',
  miyako: '住宅改修承認届出書・住宅改修費支給申請書（受領委任払用）',
  kouiki: '住宅改修承認申請書（様式第2号）・住宅改修費支給申請書（様式第7号）',
};

export function ShinseiEditor({
  job,
  data,
  update,
  onBack,
  tabs,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  tabs: ReactNode; // 申請書・見積書のタブ
}) {
  const toast = useToast();
  const s = data.settings;
  const insurer = jobInsurer(job);
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const setInsurer = (i: Insurer) => setJob((j) => ({...j, insurer: i, form: INSURER_INFO[i].form}));
  const cost = shinseiCost(job, s);
  const lines = shinseiWorks(job, s);
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* 覚えられなくても使える */
    }
  };

  // まだ入っていない欄（色を付けて、上に一覧で出す）。みやこ町・広域連合の着工日・完成日は工事のあとに入れるので数えない
  const missing: Record<Field, boolean> = {
    kana: !info.kana.trim(),
    name: !job.customer.trim(),
    insuredNo: insuredBoxes(job.insuredNo).join('').length !== 10,
    birth: !info.era || !info.birthY.trim() || !info.birthM.trim() || !info.birthD.trim(),
    gender: !info.gender,
    zip: !info.zip.trim(),
    address: !job.address.trim(),
    phone: !info.phone.trim(),
    care: !info.care,
    owner: !info.owner.trim() || !info.relation.trim(),
    reason: !info.reasonOffice.trim() || !info.reasonName.trim(),
    works: lines.length === 0,
    cost: cost === null,
    renovated: !info.renovated,
    dates: !!insurer && !twoForms(insurer) && (!info.start || !info.end),
  };
  const fields = insurer ? FIELDS[insurer] : [];
  const todo = fields.filter((f) => missing[f]);

  // 申請書のプレビュー：原本に今の内容を転記して描く（打つたびに作り直す。打つのを待たせないように少し遅れてよい）
  const template = useTemplate(insurer);
  const map = insurer ? SHINSEI[insurer] : undefined;
  const shown = useDeferredValue(job);
  const pages = useMemo((): PvPage[] | null => {
    if (!template || !map) return null;
    try {
      return shinseiPreview(template, map, shinseiValues(shown, s));
    } catch {
      return []; // 描けないとき（原本がこわれているなど）は一覧で入れる
    }
  }, [template, map, shown, s]);
  // 入れる所を開いている項目。何も入っていない新しい申請書は、最初の欄（フリガナ）を開いておく
  const [active, setActive] = useState<Field | null>(() => (fields[0] && !job.customer.trim() && !info.kana.trim() && job.places.length === 0 ? fields[0] : null));
  const open = useCallback((f: Field | null) => setActive(f), []);
  const move = (dir: 1 | -1) => setActive((cur) => (cur ? (fields[fields.indexOf(cur) + dir] ?? null) : null));
  useEffect(() => {
    if (active && !fields.includes(active)) setActive(null); // 保険者を替えて、その申請書にない項目
  }, [insurer]);
  const toggleMark = (key: keyof ShinseiMarks, option: string) => setInfo({[key]: info[key] === option ? '' : option} as Partial<ShinseiInfo>);
  // 丸で囲む項目（性別・要介護状態区分・改修状況）：申請書の欄を押して出した所で選んだら、次の欄へ（Enter と同じ）
  const pickMark = (key: 'gender' | 'care' | 'renovated', v: string, inList: boolean) => {
    setInfo({[key]: v} as Partial<ShinseiInfo>);
    if (!inList && v) move(1);
  };

  // 写真：写真番号の箇所の改修前・改修後（写真の欄・プレビューの写真貼付用紙で、ドロップ・選ぶ・入れ替える）
  const sheetNos = useMemo(() => (template && map ? new Set(photoSheets(template, map).keys()) : null), [template, map]);
  const photoActions = usePhotoActions(job, setJob, s);
  const photoList = photoPlaces(job, s);
  const photoUrls = usePhotoUrls(photoList.flatMap(({place}) => [place.photos?.before ?? '', place.photos?.after ?? '']));
  const photoInput = useRef<HTMLInputElement>(null);
  const pickFor = useRef<PhotoKey | undefined>(undefined);
  const pickPhoto = (key?: PhotoKey) => {
    pickFor.current = key;
    photoInput.current?.click();
  };
  const photoKey = (no: number, slot: PhotoSlot): PhotoKey | null => {
    const x = photoList.find((p) => p.no === no);
    return x ? {placeId: x.place.id, slot} : null;
  };
  const photoOf = (no: number, slot: PhotoSlot) => {
    const id = photoList.find((p) => p.no === no)?.place.photos?.[slot];
    return id ? (photoUrls[id] ?? null) : null;
  };

  const save = () => {
    if (!insurer) return;
    void saveShinsei(job, insurer, s).then(
      ({fileName, missingPhotos}) => {
        toast(`「${fileName}」を保存しました`);
        if (missingPhotos) toast(`写真${missingPhotos}枚はこの端末にないので貼っていません`, 'error');
      },
      () => toast('申請書を作れませんでした', 'error'),
    );
  };
  // Enter で次の欄へ（日本語の変換中は動かさない）
  const nextOnEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.target as HTMLElement;
    if (!el.matches('input')) return;
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('input[data-nav], select[data-nav]')];
    const next = all[all.indexOf(el) + 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  // 項目を入れる欄（一覧の1行・申請書の欄を押したときに出る所で同じもの）。inList：一覧の中（改修の内容の下に、申請書に書く内容も出す）
  const row = (f: Field, i: Insurer, inList: boolean): ReactNode => {
    switch (f) {
      case 'kana':
        return <TextInput value={info.kana} onChange={(kana) => setInfo({kana})} placeholder="ヤマダ　タロウ" className="w-full max-w-md" aria-label="フリガナ" data-nav autoFocus={!job.customer && !info.kana} />;
      case 'name':
        return <TextInput value={job.customer} onChange={(customer) => setJob((j) => ({...j, customer}))} placeholder="山田　太郎" className="w-full max-w-md text-base font-bold" aria-label="被保険者氏名" data-nav />;
      case 'insuredNo':
        return (
          <>
            <TextInput value={job.insuredNo} onChange={(insuredNo) => setJob((j) => ({...j, insuredNo}))} inputMode="numeric" placeholder="10けた" className="w-36 font-mono" aria-label="被保険者番号" data-nav />
            {/* 申請書の10マスと同じ形で見せる（右に寄せる） */}
            <span className="flex" aria-hidden="true">
              {insuredBoxes(job.insuredNo).map((d, k) => (
                <span key={k} className="grid h-8 w-5 place-items-center border border-l-0 border-slate-400 font-mono text-base first:border-l sm:w-6">
                  {d}
                </span>
              ))}
            </span>
          </>
        );
      case 'birth':
        return (
          <>
            <Circles label="元号" options={MARK_INFO.era.options} value={info.era} onPick={(era) => setInfo({era: era as ShinseiInfo['era']})} />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <TextInput value={info.birthY} onChange={(birthY) => setInfo({birthY})} inputMode="numeric" className="w-14 text-right" aria-label="生年月日の年" data-nav />年
              <TextInput value={info.birthM} onChange={(birthM) => setInfo({birthM})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の月" data-nav />月
              <TextInput value={info.birthD} onChange={(birthD) => setInfo({birthD})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の日" data-nav />日生
            </span>
          </>
        );
      case 'gender':
        return <Circles label="性別" options={MARK_INFO.gender.options} value={info.gender} onPick={(v) => pickMark('gender', v, inList)} />;
      case 'zip':
        return (
          <span className="inline-flex items-center gap-1">
            〒<TextInput value={info.zip} onChange={(zip) => setInfo({zip})} inputMode="numeric" placeholder="824-0000" className="w-32" aria-label="郵便番号" data-nav />
          </span>
        );
      case 'address':
        return <TextInput value={job.address} onChange={(address) => setJob((j) => ({...j, address}))} placeholder="福岡県…" className="w-full" aria-label="住所" data-nav />;
      case 'phone':
        return (
          <>
            <TextInput type="tel" value={info.phone} onChange={(phone) => setInfo({phone})} placeholder="0930-00-0000" className="w-48" aria-label="電話番号" data-nav />
            {i === 'kouiki' && <Note>支給申請書（様式第7号）に書きます</Note>}
          </>
        );
      case 'care':
        return <Circles label="要介護状態区分" options={MARK_INFO.care.options} value={info.care} onPick={(v) => pickMark('care', v, inList)} />;
      case 'owner':
        return (
          <>
            <TextInput value={info.owner} onChange={(owner) => setInfo({owner})} className="w-48" aria-label="住宅の所有者" data-nav />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              本人との関係（
              <TextInput value={info.relation} onChange={(relation) => setInfo({relation})} className="w-24" aria-label="本人との関係" data-nav />）
            </span>
            <Btn small color="white" onClick={() => setInfo({owner: job.customer.trim(), relation: '本人'})}>
              本人の家
            </Btn>
          </>
        );
      case 'reason':
        return (
          <>
            <span className="inline-flex items-center gap-1">
              事業所名
              <TextInput value={info.reasonOffice} onChange={(reasonOffice) => setInfo({reasonOffice})} className="w-56" aria-label="理由書作成者の事業所名" data-nav />
            </span>
            <span className="inline-flex items-center gap-1">
              氏名
              <TextInput value={info.reasonName} onChange={(reasonName) => setInfo({reasonName})} className="w-40" aria-label="理由書作成者の氏名" data-nav />
            </span>
          </>
        );
      case 'works':
        return <WorksEditor job={job} setJob={setJob} s={s} insurer={i} lines={inList ? lines : []} />;
      case 'cost':
        return (
          <>
            <TextInput
              value={info.cost !== null ? String(info.cost) : cost !== null ? yen(cost) : ''}
              onChange={(t) => {
                const n = Number(t.normalize('NFKC').replace(/[,，\s¥円]/g, ''));
                setInfo({cost: t.trim() === '' || !Number.isFinite(n) ? null : n});
              }}
              inputMode="numeric"
              className="w-36 text-right tabular-nums"
              aria-label={label('cost', i)}
              data-nav
            />
            円
            <Note>{info.cost !== null ? '手で入れた金額' : cost !== null ? (costIsTotal(i) ? '見積書の合計（税込）' : '見積書の介護保険対象分の合計（税込）') : '見積書がないときは手で入れます'}</Note>
            {info.cost !== null && (
              <Btn small color="white" onClick={() => setInfo({cost: null})}>
                見積書の金額にもどす
              </Btn>
            )}
          </>
        );
      case 'renovated':
        return <Circles label="現在までの改修状況" options={MARK_INFO.renovated.options} value={info.renovated} onPick={(v) => pickMark('renovated', v, inList)} />;
      case 'dates':
        return (
          <>
            <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
              {twoForms(i) ? '着工日' : '着工予定日'}
              <input type="date" value={info.start} onChange={(e) => setInfo({start: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label={twoForms(i) ? '着工日' : '着工予定日'} data-nav />
            </label>
            <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
              {twoForms(i) ? '完成日' : i === 'kanda' ? '完了予定日' : '完成予定日'}
              <input type="date" value={info.end} onChange={(e) => setInfo({end: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label={twoForms(i) ? '完成日' : '完了予定日'} data-nav />
            </label>
            {twoForms(i) && <Note>支給申請書に書きます（工事のあと）</Note>}
          </>
        );
    }
  };

  const marks: ShinseiMarks = {gender: info.gender, era: info.era, care: info.care, renovated: info.renovated};
  const shortLabel = (f: Field) => (f === 'reason' ? '理由書作成者' : f === 'works' ? '改修の内容' : insurer ? label(f, insurer) : f);
  // 入っていない欄を押したとき：申請書の形ならその欄の入れる所を開く。一覧ならその欄へ
  const goField = (f: Field) => {
    if (mode === 'form' && pages?.length) setActive(f);
    else document.querySelector<HTMLElement>(`[data-field="${f}"] input, [data-field="${f}"] select, [data-field="${f}"] button`)?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn color="white" onClick={onBack}>
          ← 一覧へ戻る
        </Btn>
        {tabs}
        <h1 className="text-lg font-bold text-[#14532d]">{job.customer.trim() ? jobName(job) : '新しい申請書'}</h1>
        {insurer && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{INSURER_INFO[insurer].name}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {insurer && (
            <div role="group" aria-label="入れ方" className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-sm font-bold shadow-sm">
              {(
                [
                  ['form', '📄 申請書で入れる'],
                  ['list', '📋 一覧で入れる'],
                ] as const
              ).map(([m, text]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 transition ${mode === m ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
          {canMakeShinsei(insurer) && (
            <Btn color="softGreen" onClick={save}>
              📗 申請書をExcelで保存
            </Btn>
          )}
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="grid min-w-[10rem] gap-1 text-xs font-bold text-slate-600">
          保険者
          <select
            value={insurer}
            onChange={(e) => e.target.value && setInsurer(e.target.value as Insurer)}
            className={`h-9 rounded-md border px-2 text-sm ${insurer ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
            aria-label="保険者"
          >
            {!insurer && <option value="">（選ぶ）</option>}
            {INSURER_IDS.map((x) => (
              <option key={x} value={x}>
                {INSURER_INFO[x].name}
              </option>
            ))}
          </select>
        </label>
        {insurer && (
          <div role="status" aria-label="入っていない欄" className="flex flex-wrap items-center gap-1.5 text-sm">
            {todo.length === 0 ? (
              <span className="font-bold text-emerald-800">✓ 申請書の欄はすべて入っています</span>
            ) : (
              <>
                <span className="text-slate-700">まだ入っていない欄：</span>
                {todo.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => goField(f)}
                    className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-bold text-amber-900 hover:bg-amber-100"
                  >
                    {shortLabel(f)}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {insurer && (
        <>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="写真のファイル"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              const key = pickFor.current;
              pickFor.current = undefined;
              if (files.length) void photoActions.put(files, key);
            }}
          />
          <PhotoBoard job={job} rates={s} sheetNos={sheetNos} actions={photoActions} onPick={pickPhoto} />
        </>
      )}

      {!insurer ? (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">保険者を選ぶと、その申請書が出ます。</p>
      ) : mode === 'form' && pages === null ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">申請書を開いています…</p>
      ) : mode === 'form' && pages && pages.length > 0 ? (
        <ShinseiPages
          pages={pages}
          missing={missing}
          active={active}
          marks={marks}
          label={(f) => label(f, insurer)}
          onOpen={open}
          onToggle={toggleMark}
          onMove={move}
          editor={active ? row(active, insurer, false) : null}
          wide={active === 'works'}
          photos={{
            of: photoOf,
            onDrop: (no, slot, e) => {
              const key = photoKey(no, slot);
              if (key) photoActions.drop(e, key);
            },
            onPick: (no, slot) => {
              const key = photoKey(no, slot);
              if (key) pickPhoto(key);
            },
          }}
        />
      ) : (
        <div role="form" aria-label="申請書" onKeyDown={nextOnEnter} className="mx-auto max-w-5xl overflow-hidden rounded-lg border-2 border-slate-700 bg-white shadow-sm">
          <div className="border-b-2 border-slate-700 px-4 py-2.5 text-center text-base font-bold text-slate-800">
            {INSURER_INFO[insurer].name}　{FORM_TITLE[insurer]}
          </div>
          {/* 左に申請書の項目名、右に入れる欄（スマホは項目名を上に） */}
          {fields.map((f) => (
            <div key={f} data-field={f} className="border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[11rem_1fr]">
              <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label(f, insurer)}</div>
              <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${missing[f] ? 'bg-amber-50' : ''}`}>{row(f, insurer, true)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Note({children}: {children: ReactNode}) {
  return <span className="text-xs text-slate-500">{children}</span>;
}

/** 丸で囲む項目（申請書と同じ「男　・　女」の形。押すと丸がつき、もう一度押すと外れる） */
function Circles({label, options, value, onPick}: {label: string; options: readonly string[]; value: string; onPick: (v: string) => void}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((o, k) => (
        <Fragment key={o}>
          {k > 0 && <span className="text-slate-400">・</span>}
          <button
            type="button"
            aria-pressed={value === o}
            onClick={() => onPick(value === o ? '' : o)}
            className={`min-w-[2.75rem] rounded-full px-3 py-1 text-sm font-bold transition ${
              value === o ? 'border-2 border-slate-800 bg-amber-50 text-slate-900' : 'border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * 改修の内容：箇所ごとに 写真番号・改修場所・改修の種類・申請書に書く文。見積書の箇所と同じもの（ここで足した箇所は見積書にも出る）。
 * 申請書に書く文は、見積書の部材から作った文（薄い字）。手で書いたらそちら（高さ H= を足すなど）。下に、申請書に書く行をそのまま出す
 */
function WorksEditor({job, setJob, s, insurer, lines}: {job: Job; setJob: (fn: (j: Job) => Job) => void; s: Settings; insurer: Insurer; lines: string[]}) {
  const photos = photoNumbers(job, s);
  const setPlace = (id: string, fn: (p: Place) => Place) => setJob((j) => ({...j, places: j.places.map((p) => (p.id === id ? fn(p) : p))}));
  // 見積書に箇所が出るように、空白の行を1つ入れておく（見積書で部材・施工費を入れていける）
  const add = (name: string) => setJob((j) => ({...j, places: [...j.places, newPlace(name, [manualRow('material')])]}));
  const remove = (id: string) => setJob((j) => ({...j, places: j.places.filter((p) => p.id !== id)}));
  return (
    <div className="w-full space-y-2">
      {job.places.length > 0 && (
        <div className="text-sm" role="list" aria-label="改修の箇所">
          <div className="hidden gap-2 pb-1 text-xs text-slate-500 sm:flex">
            <span className="w-7 text-center">写真</span>
            <span className="w-28">改修場所</span>
            <span className="w-40">改修の種類</span>
            <span>申請書に書く文（薄い字は見積書から作った文。直すときは書く）</span>
          </div>
          {job.places.map((p) => {
            const n = photos.get(p.id);
            const used = p.rows.some((r) => !isBlankRow(r)); // 見積書に行のある箇所は、見積書で消す
            return (
              <div key={p.id} role="listitem" className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-1.5">
                <span className="w-7 text-center text-base">{n ? circled(n) : '—'}</span>
                <TextInput value={p.name} onChange={(name) => setPlace(p.id, (x) => ({...x, name}))} placeholder="改修場所" className="w-28" aria-label="改修場所" data-nav />
                <select value={p.kind} onChange={(e) => setPlace(p.id, (x) => ({...x, kind: Number(e.target.value)}))} className="h-9 w-40 rounded-md border border-slate-300 px-1 text-sm" aria-label="改修の種類" data-nav>
                  {KINDS.map((k, i) => (
                    <option key={k} value={i + 1}>
                      {circled(i + 1)} {k}
                    </option>
                  ))}
                </select>
                <TextInput value={p.shinseiText ?? ''} onChange={(t) => setPlace(p.id, (x) => ({...x, shinseiText: t}))} placeholder={autoWorkText(p)} className="min-w-[12rem] flex-1" aria-label="申請書に書く文" data-nav />
                {used ? (
                  <span className="w-7" />
                ) : (
                  <button type="button" onClick={() => remove(p.id)} className="w-7 rounded py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`${p.name || '箇所'}を消す`}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-slate-600">箇所を足す：</span>
        {s.placePresets.map((name) => (
          <Btn key={name} small color="white" onClick={() => add(name)}>
            ＋ {name}
          </Btn>
        ))}
        <Btn small color="white" onClick={() => add('')}>
          ＋ そのほか
        </Btn>
      </div>
      {/* 申請書に書く内容をそのまま見せる（みやこ町・広域連合は内訳明細書の改修の種類の行） */}
      {lines.length > 0 &&
        (twoForms(insurer) ? (
          <table className="w-full border border-slate-300 text-sm" aria-label="住宅改修内訳明細書に書く内容">
            <caption className="bg-slate-50 px-2 py-1 text-left text-xs font-bold text-slate-600">住宅改修内訳明細書（様式第2号別紙）に書く内容</caption>
            <tbody>
              {shinseiKinds(job, s).map((k, i) =>
                k.works.length === 0 ? null : (
                  <tr key={i} className="border-t border-slate-200 align-top">
                    <td className="w-36 border-r border-slate-200 px-2 py-1 font-bold">
                      {circled(i + 1)} {KINDS[i]}
                      <div className="text-xs font-normal text-slate-600">{k.places}</div>
                    </td>
                    <td className="whitespace-pre-line px-2 py-1">{k.works.join('\n')}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <div className="rounded border border-slate-300 text-sm" aria-label="申請書に書く内容">
            <div className="bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">申請書に書く内容</div>
            <div className="whitespace-pre-line px-2 py-1">{lines.join('\n')}</div>
          </div>
        ))}
    </div>
  );
}
