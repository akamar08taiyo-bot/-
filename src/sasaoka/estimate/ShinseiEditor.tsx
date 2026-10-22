// 申請書のタブ（様邸の画面の左のタブ。右は見積書）：保険者の申請書の項目を、申請書の上からの順番に並べた一覧で入れ、横のプレビュー（原本の様式のまま）で確かめる
// （ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。Enter で次の欄。入れている項目はプレビューで囲み、プレビューの欄を押すと一覧のその項目へ。
// 丸で囲む項目（性別・要介護状態区分など）は一覧のボタンか、プレビューの申請書の文字を押す。まだ入っていない欄は薄い黄色にし、上にも並べる。
// 見積書と同じ様邸（Job）：氏名・住所・被保険者番号・改修の箇所は見積書と同じ欄、改修予定費用は見積書の金額なので、どちらで直してもすぐ両方に出る。
// 申請書だけ・見積書だけでもよい（見積書がないときは、改修の箇所と寸法を入れ、改修費用を手で入れる）。
// 写真（PhotoBoard）：写真番号の箇所ごとに改修前・改修後の写真を入れ、入れ替える。プレビューの写真貼付用紙にも出し、Excel の写真貼付用紙に貼る

import {Fragment, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type {InputHTMLAttributes, KeyboardEvent, ReactNode} from 'react';
import {isBlankRow, jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {circled, eraOf, INSURER_IDS, INSURER_INFO, jobInsurer, KINDS, MARK_INFO, NO_SHINSEI, photoNumbers} from '../estimateForms.ts';
import {placeFromDims} from '../cutLink.ts';
import {manualRow, newPlace} from '../rows.ts';
import {usePhotoUrls} from '../photos.ts';
import {costIsTotal, estimateLength, insuredBoxes, padInsuredNo, photoDay, photoNoteLines, photoSheets, SHINSEI, shinseiCost, shinseiKinds, shinseiValues, shinseiWorks, workItems} from '../shinsei.ts';
import type {WorkItem} from '../shinsei.ts';
import {shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField as Field} from '../shinseiPreview.ts';
import type {AppData, Insurer, Job, Place, PlaceDims, Settings, ShinseiInfo, ShinseiMarks} from '../types.ts';
import type {Update} from '../useStore.ts';
import {toKatakana, yen} from '../util.ts';
import {PhotoBoard, photoPlaces, SLOT_LABEL, usePhotoActions} from './PhotoBoard.tsx';
import type {PhotoKey, PhotoSlot} from './PhotoBoard.tsx';
import {canMakeShinsei, saveShinsei, useTemplate} from './shinseiFiles.ts';
import {ShinseiPages} from './ShinseiPreview.tsx';

/** 欄の順番：保険者ごとの申請書の上からの順番（原本を見て決めた。みやこ町・広域連合は承認の申請書の順番で、支給申請書だけの着工日・完成日は最後）。
 *  ただし被保険者氏名はどの保険者もフリガナのすぐ下（ユーザーの指示「ふりがなの下に、名前をもってくる」、2026-10-21。苅田町・みやこ町は原本では番号が先） */
const FIELDS: Record<Insurer, Field[]> = {
  kanda: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'owner', 'photoDates', 'works', 'dates', 'cost'],
  yukuhashi: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'owner', 'photoDates', 'works', 'dates', 'cost'],
  miyako: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'owner', 'reason', 'photoDates', 'works', 'cost', 'renovated', 'dates'],
  kouiki: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'owner', 'reason', 'photoDates', 'works', 'cost', 'renovated', 'dates'], // 郵便番号はユーザーの指示で足した（2026-10-21）
};
// 改修前日付・改修後日付（写真の日付）は、改修の内容のすぐ上（ユーザーの指示「この部分に改修前日付・改修後日付を入力欄となるようにする」2026-10-22）

/** みやこ町・広域連合：改修の内容は内訳明細書（別紙）、着工日・完成日は支給申請書（工事のあと）に書く */
const twoForms = (i: Insurer) => i === 'miyako' || i === 'kouiki';

/** 欄の名前（申請書の言葉） */
function label(f: Field, i: Insurer): string {
  if (f === 'cost') return twoForms(i) ? '改修費用（介護保険対象分）' : '改修予定費用';
  // 苅田町・行橋市の着工予定日は書かない（ユーザーの指示「申請書の着工予定日は空白にする」）ので、完了（完成）予定日だけ
  if (f === 'dates') return twoForms(i) ? '着工日・完成日' : i === 'kanda' ? '完了予定日' : '完成予定日';
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
    photoDates: '改修前日付・改修後日付',
  }[f];
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

  // まだ入っていない欄（色を付けて、上に一覧で出す）。着工・完了の日は数えない（苅田町・行橋市の着工予定日は空白のまま。みやこ町・広域連合の着工日・完成日は工事のあと）
  const missing: Record<Field, boolean> = {
    kana: !info.kana.trim(),
    name: !job.customer.trim(),
    insuredNo: !insuredBoxes(job.insuredNo).join(''),
    birth: !info.birthY.trim() || !info.birthM.trim() || !info.birthD.trim(), // 元号は選んでいなければ昭和
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
    dates: false,
    photoDates: false, // 改修前は当日、改修後は空でよい
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
      return []; // 描けないとき（原本がこわれているなど）は一覧だけ
    }
  }, [template, map, shown, s]);
  // 一覧で入れている項目（プレビューのその欄を囲む）
  const [active, setActive] = useState<Field | null>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  // 元号は外さない（選んでいなければ昭和なので、押した元号にするだけ）
  const toggleMark = (key: keyof ShinseiMarks, option: string) => setInfo({[key]: key !== 'era' && info[key] === option ? '' : option} as Partial<ShinseiInfo>);

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
    const place = photoList.find((p) => p.no === no)?.place;
    const id = place?.photos?.[slot];
    const url = id ? photoUrls[id] : null;
    return url ? {...url, edit: place?.photoEdits?.[slot]} : null;
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

  // 項目を入れる欄（一覧の1行）
  const row = (f: Field, i: Insurer): ReactNode => {
    switch (f) {
      case 'kana':
        return <KanaInput value={info.kana} onChange={(kana) => setInfo({kana})} placeholder="ヤマダ　タロウ" className="w-full max-w-md" aria-label="フリガナ" data-nav autoFocus={!job.customer && !info.kana} />;
      case 'name':
        return <TextInput value={job.customer} onChange={(customer) => setJob((j) => ({...j, customer}))} placeholder="山田　太郎" className="w-full max-w-md text-base font-bold" aria-label="被保険者氏名" data-nav />;
      case 'insuredNo':
        return (
          <>
            <TextInput
              value={job.insuredNo}
              onChange={(insuredNo) => setJob((j) => ({...j, insuredNo}))}
              onBlur={() => padInsuredNo(job.insuredNo) !== job.insuredNo && setJob((j) => ({...j, insuredNo: padInsuredNo(j.insuredNo)}))} // 確定したら右に詰めて 0 で10けた
              inputMode="numeric"
              placeholder="10けた"
              className="w-36 font-mono"
              aria-label="被保険者番号"
              data-nav
            />
            {/* 申請書の10マスと同じ形で見せる（右に寄せ、空いた左のマスは 0） */}
            <span className="flex" aria-label="被保険者番号の10マス">
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
            {/* 選んでいなければ昭和（ユーザーの指示「昭和がデフォルトにする」）。押している元号をもう一度押しても外さない */}
            <Circles label="元号" options={MARK_INFO.era.options} value={eraOf(info)} onPick={(era) => era && setInfo({era: era as ShinseiInfo['era']})} />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <TextInput value={info.birthY} onChange={(birthY) => setInfo({birthY})} inputMode="numeric" className="w-14 text-right" aria-label="生年月日の年" data-nav />年
              <TextInput value={info.birthM} onChange={(birthM) => setInfo({birthM})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の月" data-nav />月
              <TextInput value={info.birthD} onChange={(birthD) => setInfo({birthD})} inputMode="numeric" className="w-12 text-right" aria-label="生年月日の日" data-nav />日生
            </span>
          </>
        );
      case 'gender':
        return <Circles label="性別" options={MARK_INFO.gender.options} value={info.gender} onPick={(gender) => setInfo({gender} as Partial<ShinseiInfo>)} />;
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
        return <Circles label="要介護状態区分" options={MARK_INFO.care.options} value={info.care} onPick={(care) => setInfo({care} as Partial<ShinseiInfo>)} />;
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
        return <WorksEditor job={job} setJob={setJob} s={s} insurer={i} />;
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
        return <Circles label="現在までの改修状況" options={MARK_INFO.renovated.options} value={info.renovated} onPick={(renovated) => setInfo({renovated} as Partial<ShinseiInfo>)} />;
      case 'photoDates':
        // 写真の日付（苅田町・みやこ町は写真の用紙の撮影日に書く）。改修前は当日・改修後は空。日付入り写真を入れるとその日付（PhotoBoard.tsx）。
        // 直すと、すべての写真の同じ改修前・改修後の日付になる。改修前を消すと当日に戻る
        return (
          <>
            {(['before', 'after'] as const).map((slot) => (
              <label key={slot} className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
                {SLOT_LABEL[slot]}日付
                <input
                  type="date"
                  value={photoDay(job, s, slot)}
                  onChange={(e) => photoActions.setDate(slot, e.target.value)}
                  className="h-9 rounded-md border border-slate-300 px-2"
                  aria-label={`${SLOT_LABEL[slot]}日付`}
                  data-nav
                />
              </label>
            ))}
          </>
        );
      case 'dates': {
        // 苅田町・行橋市は完了（完成）予定日だけ（着工予定日は空白のまま）。みやこ町・広域連合は支給申請書の着工日・完成日（工事のあと）
        const end = twoForms(i) ? '完成日' : i === 'kanda' ? '完了予定日' : '完成予定日';
        return (
          <>
            {twoForms(i) && (
              <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
                着工日
                <input type="date" value={info.start} onChange={(e) => setInfo({start: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label="着工日" data-nav />
              </label>
            )}
            <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
              {end}
              <input type="date" value={info.end} onChange={(e) => setInfo({end: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label={end} data-nav />
            </label>
            {twoForms(i) && <Note>支給申請書に書きます（工事のあと）</Note>}
          </>
        );
      }
    }
  };

  const marks: ShinseiMarks = {gender: info.gender, era: eraOf(info), care: info.care, renovated: info.renovated};
  const shortLabel = (f: Field) => (f === 'reason' ? '理由書作成者' : f === 'works' ? '改修の内容' : insurer ? label(f, insurer) : f);
  // 入っていない欄・プレビューの欄を押したとき：一覧のその項目の最初の欄へ
  const goField = (f: Field) => {
    setActive(f);
    document.querySelector<HTMLElement>(`[data-field="${f}"] input, [data-field="${f}"] select, [data-field="${f}"] button`)?.focus();
  };

  return (
    <div className="space-y-3">
      {/* Excel で保存は画面のまん中（ユーザーの指示「Excelの印刷、保存ボタンを中央にもってくる」2026-10-22。見積書のタブの保存・Excel・印刷も同じ所）。
          広い画面は 左・まん中・右 の3つに分け、まん中を画面のまん中にそろえる。狭い画面はまん中のボタンだけの行にして、そのまん中に */}
      <div className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-2">
          <Btn color="white" onClick={onBack}>
            ← 一覧へ戻る
          </Btn>
          {tabs}
          <h1 className="text-lg font-bold text-[#14532d]">{job.customer.trim() ? jobName(job) : '新しい申請書'}</h1>
          {insurer && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">{INSURER_INFO[insurer].name}</span>}
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-lg:basis-full">
          {canMakeShinsei(insurer) && (
            <Btn color="softGreen" onClick={save}>
              📗 申請書をExcelで保存
            </Btn>
          )}
        </div>
        <div />
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

      {!insurer ? (
        <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center text-sm text-amber-900">保険者を選ぶと、その申請書が出ます。</p>
      ) : (
        // 左に一覧（入れる所）と写真、右にプレビュー（見ながら入れる。広い画面ではプレビューの枠だけ動く）。スマホは縦に並べる
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            <div role="form" aria-label="申請書" onKeyDown={nextOnEnter} className="overflow-hidden rounded-lg border-2 border-slate-700 bg-white shadow-sm">
              <div className="border-b-2 border-slate-700 px-4 py-2.5 text-center text-base font-bold text-slate-800">
                {INSURER_INFO[insurer].name}　{FORM_TITLE[insurer]}
              </div>
              {/* 左に申請書の項目名、右に入れる欄（スマホは項目名を上に）。入れている項目は囲む */}
              {fields.map((f) => (
                <div
                  key={f}
                  data-field={f}
                  onFocus={() => setActive(f)}
                  className={`border-b border-slate-300 last:border-b-0 sm:grid sm:grid-cols-[9.5rem_1fr] ${active === f ? 'relative z-[1] outline outline-2 -outline-offset-2 outline-sky-500' : ''}`}
                >
                  <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">{label(f, insurer)}</div>
                  <div className={`flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 ${missing[f] ? 'bg-amber-50' : ''}`}>{row(f, insurer)}</div>
                </div>
              ))}
            </div>
            <input
              ref={photoInput}
              type="file"
              accept="image/*,application/pdf,.pdf"
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
            <PhotoBoard job={job} rates={s} sheetNos={sheetNos} dates={!!map?.sheets.some((x) => x.photoPlace?.dates)} actions={photoActions} onPick={pickPhoto} />
          </div>
          <div ref={previewBox} className="min-w-0 rounded-lg bg-slate-200/60 p-2 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto">
            {pages === null ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">申請書を開いています…</p>
            ) : pages.length > 0 ? (
              <ShinseiPages
                pages={pages}
                missing={missing}
                active={active}
                marks={marks}
                label={(f) => label(f, insurer)}
                onOpen={goField}
                onToggle={toggleMark}
                scrollBox={previewBox}
                photos={{
                  of: photoOf,
                  note: (no) => {
                    const x = photoList.find((p) => p.no === no);
                    return x ? photoNoteLines(x.place) : [];
                  },
                  onDrop: (no, slot, e) => {
                    const key = photoKey(no, slot);
                    if (key) photoActions.drop(e, key);
                  },
                  onPick: (no, slot) => {
                    const key = photoKey(no, slot);
                    if (key) pickPhoto(key);
                  },
                  onEdit: (no, slot, edit) => {
                    const key = photoKey(no, slot);
                    if (key) photoActions.setEdit(key, edit);
                  },
                }}
              />
            ) : null}
          </div>
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
 * フリガナの欄：ひらがな・半角カタカナで打っても全角カタカナにする（`toKatakana`）。日本語の変換中は変えず（変えると変換がこわれる）、
 * 確定したとき・貼り付けたとき・欄を離れたときに変える
 */
function KanaInput({value, onChange, ...rest}: {value: string; onChange: (v: string) => void} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const composing = useRef(false);
  const commit = (v: string) => {
    const k = toKatakana(v);
    if (k !== value || k !== v) onChange(k);
  };
  return (
    <TextInput
      value={value}
      onChange={(v) => (composing.current ? onChange(v) : commit(v))}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        commit(e.currentTarget.value);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      {...rest}
    />
  );
}

/** 寸法の欄（mm。打ったまま。全角でもよい）。長さは「600×850」のように2つ以上も（区切りは × のほか , 、 すき間） */
function Dim({label, value, placeholder, wide, onChange}: {label: string; value: string; placeholder: string; wide: boolean; onChange: (v: string) => void}) {
  return (
    <label className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      <TextInput value={value} onChange={onChange} inputMode={wide ? undefined : 'numeric'} placeholder={placeholder} className={`${wide ? 'w-28' : 'w-16'} text-right`} aria-label={`${label}（mm）`} data-nav data-dim />
      <span className="text-xs text-slate-500">mm</span>
    </label>
  );
}

/**
 * 改修の内容：箇所ごとに 写真番号・改修場所・改修の種類と寸法。見積書の箇所と同じもの（ここで足した箇所は見積書にも出る）。
 * 寸法（ユーザーの指示「入力項目に長さ、高さという項目をつくる」「段差の解消は幅・奥行・高さの入力欄」）：手すりは 長さ（L=600mm。入れなければ見積書の使う長さ＝薄い字）・
 * 高さ（H=800mm。任意）、段差の解消は 幅・奥行・高さ（W600mm D350mm H150mm）。「そのほか」はうしろに足す文。下に、申請書に書く行を1行ずつの欄で出す（手で直せる）
 */
function WorksEditor({job, setJob, s, insurer}: {job: Job; setJob: (fn: (j: Job) => Job) => void; s: Settings; insurer: Insurer}) {
  const photos = photoNumbers(job, s);
  const setPlace = (id: string, fn: (p: Place) => Place) => setJob((j) => ({...j, places: j.places.map((p) => (p.id === id ? fn(p) : p))}));
  // 手すりの長さを入れたら、見積書のその箇所の手すり・ベースプレートの使う長さにもする（ユーザーの指示「どちらか一方を入力した際に、自動的に 1.2 の部分が入力される」。`cutLink.ts`）
  const setDim = (id: string, key: keyof PlaceDims, v: string) =>
    setPlace(id, (x) => {
      const dims: PlaceDims = {...x.dims, [key]: v};
      if (!v.trim()) delete dims[key];
      const {dims: _old, ...rest} = x;
      const next: Place = Object.keys(dims).length ? {...rest, dims} : rest;
      return key === 'l' ? placeFromDims(next) : next;
    });
  // 見積書に箇所が出るように、空白の行を1つ入れておく（見積書で部材・施工費を入れていける）。
  // 足した箇所の寸法（手すりは長さ）にすぐ打ち込めるように、そこへ移る（ユーザーの指示「廊下、玄関など選択すると、長さの部分をすぐに入力できるようにする。とべるようにする」）。
  // 「＋ そのほか」は改修場所の名前から
  const list = useRef<HTMLDivElement>(null);
  const focusPlace = useRef<{id: string; field: 'dim' | 'name'} | null>(null);
  const add = (name: string) => {
    const place = newPlace(name, [manualRow('material')]);
    focusPlace.current = {id: place.id, field: name ? 'dim' : 'name'};
    setJob((j) => ({...j, places: [...j.places, place]}));
  };
  useEffect(() => {
    const want = focusPlace.current;
    const row = want && list.current?.querySelector<HTMLElement>(`[data-place="${want.id}"]`);
    if (!want || !row) return;
    focusPlace.current = null;
    row.querySelector<HTMLInputElement>(want.field === 'dim' ? 'input[data-dim]' : 'input[aria-label="改修場所"]')?.focus();
  });
  const remove = (id: string) => setJob((j) => ({...j, places: j.places.filter((p) => p.id !== id)}));
  // 申請書に書く内容を手で直す（ユーザーの指示「手入力でも編集できるようにする」）。自動の文と同じに戻したら、手で直していないことにする
  // （寸法・そのほかを変えると、また自動で変わる）。↺ で自動の文に戻す
  const items = workItems(job, s);
  const setLine = (w: WorkItem, text: string) =>
    setPlace(w.id, ({shinseiLine: _old, ...rest}) => (text === w.auto ? rest : {...rest, shinseiLine: text}));
  const resetLine = (id: string) => setPlace(id, ({shinseiLine: _old, ...rest}) => rest);
  const lineInput = (w: WorkItem) => (
    <div key={w.id} className="flex items-center gap-1">
      <span className="w-5 shrink-0 text-center">{circled(w.photo)}</span>
      <TextInput value={w.text} onChange={(t) => setLine(w, t)} className="min-w-0 flex-1" aria-label={`${circled(w.photo)}${w.name}の申請書に書く内容`} data-nav />
      {w.edited ? (
        <button type="button" onClick={() => resetLine(w.id)} className="w-7 shrink-0 rounded py-1 text-slate-500 hover:bg-slate-100" title="自動の文に戻す" aria-label={`${circled(w.photo)}${w.name}の申請書に書く内容を自動の文に戻す`}>
          ↺
        </button>
      ) : (
        <span className="w-7 shrink-0" />
      )}
    </div>
  );
  return (
    <div className="w-full space-y-2">
      {job.places.length > 0 && (
        <div ref={list} className="text-sm" role="list" aria-label="改修の箇所">
          {job.places.map((p) => {
            const n = photos.get(p.id);
            const used = p.rows.some((r) => !isBlankRow(r)); // 見積書に行のある箇所は、見積書で消す
            const dim = (key: keyof PlaceDims, text: string, wide = false, placeholder = '') => (
              <Dim label={text} value={p.dims?.[key] ?? ''} placeholder={placeholder} wide={wide} onChange={(v) => setDim(p.id, key, v)} />
            );
            return (
              <div key={p.id} data-place={p.id} role="listitem" aria-label={`${n ? circled(n) : ''}${p.name || '改修場所'}`} className="border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 text-center text-base">{n ? circled(n) : '—'}</span>
                  <TextInput value={p.name} onChange={(name) => setPlace(p.id, (x) => ({...x, name}))} placeholder="改修場所" className="w-28" aria-label="改修場所" data-nav />
                  <select value={p.kind} onChange={(e) => setPlace(p.id, (x) => ({...x, kind: Number(e.target.value)}))} className="h-9 w-40 rounded-md border border-slate-300 px-1 text-sm" aria-label="改修の種類" data-nav>
                    {KINDS.map((k, i) => (
                      <option key={k} value={i + 1}>
                        {circled(i + 1)} {k}
                      </option>
                    ))}
                  </select>
                  {used ? (
                    <span className="w-7" />
                  ) : (
                    <button type="button" onClick={() => remove(p.id)} className="w-7 rounded py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`${p.name || '箇所'}を消す`}>
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-9">
                  {p.kind === 1 && (
                    <>
                      {dim('l', '長さ', true, estimateLength(p))}
                      {dim('h', '高さ')}
                    </>
                  )}
                  {p.kind === 2 && (
                    <>
                      {dim('w', '幅')}
                      {dim('d', '奥行')}
                      {dim('h', '高さ')}
                    </>
                  )}
                  <label className="flex min-w-[9rem] flex-1 items-center gap-1 whitespace-nowrap">
                    そのほか
                    <TextInput value={p.shinseiText ?? ''} onChange={(t) => setPlace(p.id, (x) => ({...x, shinseiText: t}))} className="min-w-0 flex-1" aria-label="そのほか" data-nav />
                  </label>
                </div>
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
      {/* 申請書に書く内容（みやこ町・広域連合は内訳明細書の改修の種類の行）。1行ずつ手で直せる */}
      {items.length > 0 &&
        (twoForms(insurer) ? (
          <table className="w-full border border-slate-300 text-sm" aria-label="住宅改修内訳明細書に書く内容">
            <caption className="bg-slate-50 px-2 py-1 text-left text-xs font-bold text-slate-600">住宅改修内訳明細書（様式第2号別紙）に書く内容</caption>
            <tbody>
              {shinseiKinds(job, s).map((k, i) => {
                // 手で空にした行も、打ち直せるように欄は出す
                const mine = items.filter((w) => w.kind === i + 1);
                return mine.length === 0 ? null : (
                  <tr key={i} className="border-t border-slate-200 align-top">
                    <td className="w-36 border-r border-slate-200 px-2 py-1 font-bold">
                      {circled(i + 1)} {KINDS[i]}
                      <div className="text-xs font-normal text-slate-600">{k.places}</div>
                    </td>
                    <td className="space-y-1 px-2 py-1">{mine.map(lineInput)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rounded border border-slate-300 text-sm" aria-label="申請書に書く内容">
            <div className="bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">申請書に書く内容</div>
            <div className="space-y-1 px-2 py-1.5">{items.map(lineInput)}</div>
          </div>
        ))}
    </div>
  );
}
