// 申請書のタブ（様邸の画面の左のタブ。右は見積書）：保険者の申請書の項目を、申請書の上からの順番に並べた一覧で入れ、横のプレビュー（原本の様式のまま）で確かめる
// （ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。Enter で次の欄。入れている項目はプレビューで囲み、プレビューの欄を押すと一覧のその項目へ。
// 丸で囲む項目（性別・要介護状態区分など）は一覧のボタンか、プレビューの申請書の文字を押す。まだ入っていない欄は薄い黄色（上の「まだ入っていない欄：」の一覧は、
// ユーザーの指示「全体的にシンプルにしたいので、今回はなくしてください。すべて」2026-10-26 で外した）。
// 見積書と同じ様邸（Job）：氏名・住所・被保険者番号・改修の箇所は見積書と同じ欄、改修予定費用は見積書の金額なので、どちらで直してもすぐ両方に出る。
// 申請書だけ・見積書だけでもよい（見積書がないときは、改修の箇所と寸法を入れ、改修費用を手で入れる）。
// 写真（PhotoBoard）：写真番号の箇所ごとに改修前・改修後の写真を入れ、入れ替える。プレビューの写真貼付用紙にも出し、Excel の写真貼付用紙に貼る。
// 写真への書き込み（✏️。PhotoMarkEditor.tsx）は、写真貼付用紙の上の写真の大きさ（paperSize）で開く（線の太さ・文字の大きさが紙の上と同じ割合になるように）

import {Fragment, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type {InputHTMLAttributes, KeyboardEvent, ReactNode} from 'react';
import {isBlankRow, jobName} from '../calc.ts';
import {Btn, TextInput, useToast} from '../components/ui.tsx';
import {circled, eraOf, INSURER_IDS, INSURER_INFO, insurerForAddress, jobInsurer, KINDS, MARK_INFO, NO_SHINSEI, photoNumbers} from '../estimateForms.ts';
import {placeFromDims, withBrackets} from '../cutLink.ts';
import {manualRow, newPlace} from '../rows.ts';
import {usePhotoUrls} from '../photos.ts';
import {turn} from '../photoEdit.ts';
import {INSURER_AREAS, INSURER_GROUP, insurerNoOf} from '../insurerNumbers.ts';
import {photoBounds} from '../photoMarks.ts';
import {costIsTotal, estimateLength, insuredBoxes, kindNamesOf, padInsuredNo, photoDay, photoNoteLayout, photoNoteLines, photoPlacement, photoSheets, planPlacement, SHINSEI, shinseiCost, shinseiFileName, shinseiValues, shinseiWorks} from '../shinsei.ts';
import {shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField as Field} from '../shinseiPreview.ts';
import type {AppData, Insurer, Job, Material, PhotoEdit, Place, PlaceDims, Settings, ShinseiInfo, ShinseiMarks} from '../types.ts';
import type {Update} from '../useStore.ts';
import {toKatakana, yen} from '../util.ts';
import {zipCandidates} from '../zip.ts';
import {PhotoBoard, PhotoOrderDialog, photoPlaces, SLOT_LABEL, usePhotoActions, usePlanActions} from './PhotoBoard.tsx';
import {PhotoMarkEditor} from './PhotoMarkEditor.tsx';
import type {PhotoKey, PhotoSlot} from './PhotoBoard.tsx';
import {canMakeShinsei, saveShinsei, useTemplate} from './shinseiFiles.ts';
import {ShinseiPages} from './ShinseiPreview.tsx';
import type {PreviewPhotos, PreviewPlan} from './ShinseiPreview.tsx';
import {ShinseiPrint} from './ShinseiPrint.tsx';
import {estimateDateOf} from '../print/docMeta.ts';
import {CardFill} from '../components/CardReader.tsx';
import {JobHeader, JobTitle, RemoveJobButton} from './JobHeader.tsx';

/** 欄の順番：保険者ごとの申請書の上からの順番（原本を見て決めた。みやこ町・広域連合は承認の申請書の順番で、支給申請書だけの着工日・完成日は最後）。
 *  ただし被保険者氏名はどの保険者もフリガナのすぐ下（ユーザーの指示「ふりがなの下に、名前をもってくる」、2026-10-21。苅田町・みやこ町は原本では番号が先） */
const FIELDS: Record<Insurer, Field[]> = {
  kanda: ['kana', 'name', 'insuredNo', 'insurerNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'burden', 'owner', 'photoDates', 'works', 'dates', 'cost'],
  yukuhashi: ['kana', 'name', 'insuredNo', 'insurerNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'burden', 'owner', 'photoDates', 'works', 'dates', 'cost'],
  miyako: ['kana', 'name', 'insuredNo', 'insurerNo', 'birth', 'gender', 'zip', 'address', 'phone', 'burden', 'owner', 'reason', 'photoDates', 'works', 'cost', 'renovated', 'dates'],
  kouiki: ['kana', 'name', 'insuredNo', 'insurerNo', 'birth', 'gender', 'zip', 'address', 'phone', 'burden', 'owner', 'reason', 'photoDates', 'works', 'cost', 'renovated', 'dates'], // 郵便番号はユーザーの指示で足した（2026-10-21）
  // 福岡市：性別・郵便番号・要介護状態区分の欄はない。着工日・完成日は完了届出書（工事のあと）
  fukuoka: ['kana', 'name', 'insuredNo', 'insurerNo', 'birth', 'address', 'phone', 'burden', 'owner', 'photoDates', 'works', 'cost', 'dates'],
  // 北九州市：生年月日・性別・要介護状態区分の欄はない。フリガナ・着工日・完成日は支給申請書（工事のあと）。工事費見積金額は介護保険の対象分（市の記入例）
  kitakyushu: ['kana', 'name', 'insuredNo', 'insurerNo', 'zip', 'address', 'phone', 'burden', 'owner', 'photoDates', 'works', 'cost', 'dates'],
};
// 負担割合は要介護状態区分のすぐ下（みやこ町・広域連合は電話番号の下）。申請書の原本に欄はないが、委任状の保険給付額・見積書の介護保険の内訳に使い、
// 特定福祉用具の負担割合と同じ値（どちらで選んでも両方に入る。tokuteiLink.ts）。ユーザーの指示「住宅改修の申請書にも負担割合を設置。住宅改修⇔特定福祉用具などで連動して数字に繋げる」2026-10-28
// 改修前日付・改修後日付（写真の日付）は、改修の内容のすぐ上（ユーザーの指示「この部分に改修前日付・改修後日付を入力欄となるようにする」2026-10-22）

/** みやこ町・広域連合：改修の内容は内訳明細書（別紙）、着工日・完成日は支給申請書（工事のあと）に書く */
const twoForms = (i: Insurer) => i === 'miyako' || i === 'kouiki';
/** 着工日・完成日を入れる保険者（工事のあとの支給申請書・完了届出書に書く。福岡市は改修の内容は申請書のまま） */
const workDates = (i: Insurer) => twoForms(i) || i === 'fukuoka' || i === 'kitakyushu';

/** 欄の名前（申請書の言葉） */
function label(f: Field, i: Insurer): string {
  if (f === 'cost') return twoForms(i) ? '改修費用（介護保険対象分）' : i === 'kitakyushu' ? '工事費見積金額（介護保険対象分）' : '改修予定費用';
  // 苅田町・行橋市の着工予定日は書かない（ユーザーの指示「申請書の着工予定日は空白にする」）ので、完了（完成）予定日だけ
  if (f === 'dates') return workDates(i) ? '着工日・完成日' : i === 'kanda' ? '完了予定日' : '完成予定日';
  return {
    kana: 'フリガナ',
    name: '被保険者氏名',
    insuredNo: '被保険者番号',
    insurerNo: '保険者番号',
    birth: '生年月日',
    gender: '性別',
    zip: '郵便番号',
    address: '住所',
    phone: '電話番号',
    care: '要介護状態区分',
    burden: '負担割合',
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
  fukuoka: '住宅改修費支給申請書（様式第21号）・住宅改修完了届出書（様式第22号の2）',
  kitakyushu: '介護保険住宅改修事前届出書・住宅改修費支給申請書（受領委任払用）',
};

/** 箇所を足すのプルダウンの「そのほか」（名前を打つ箇所） */
const OTHER_PLACE = '__other';

export function ShinseiEditor({
  job,
  data,
  update,
  onBack,
  tabs,
  batch,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  tabs: ReactNode; // 申請書・見積書のタブ
  batch?: ReactNode; // 「📦 まとめて保存」（Excel で保存・印刷と並べる。App.tsx の BatchSave）
}) {
  const toast = useToast();
  const s = data.settings;
  const insurer = jobInsurer(job);
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const setInsurer = (i: Insurer) => setJob((j) => ({...j, insurer: i, form: INSURER_INFO[i].form}));
  const byAddress = insurerForAddress(job.address);
  // 前から住所だけ入っている様邸：開いたときに、郵便番号が空なら住所から1つに決まる番号を入れる（住所を入れ直したときは useStore の withAddressZip。
  // ユーザーの指示「住所のみ入力した場合、逆に郵便番号を自動で入力される」2026-10-28）
  useEffect(() => {
    if (info.zip.trim() || !job.address.trim()) return;
    const hits = zipCandidates(job.address);
    if (hits.length === 1) setInfo({zip: hits[0].zip});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);
  const cost = shinseiCost(job, s);
  const lines = shinseiWorks(job, s);

  // まだ入っていない欄（一覧とプレビューの欄を薄い黄色に）。着工・完了の日は数えない（苅田町・行橋市の着工予定日は空白のまま。みやこ町・広域連合の着工日・完成日は工事のあと）
  const missing: Partial<Record<Field, boolean>> = {
    kana: !info.kana.trim(),
    name: !job.customer.trim(),
    insuredNo: !insuredBoxes(job.insuredNo).join(''),
    birth: !info.birthY.trim() || !info.birthM.trim() || !info.birthD.trim(), // 元号は選んでいなければ昭和
    gender: !info.gender,
    zip: !info.zip.trim(),
    address: !job.address.trim(),
    phone: !info.phone.trim(),
    care: !info.care,
    burden: !info.burden,
    owner: !info.owner.trim() || !info.relation.trim(),
    reason: !info.reasonOffice.trim() || !info.reasonName.trim(),
    // 手すりの長さは必須（入れていなくて見積書にも使う長さがなければ、まだ入っていない。2026-10-26）
    works: lines.length === 0 || job.places.some((p) => p.kind === 1 && !p.dims?.l?.trim() && !estimateLength(p)),
    cost: cost === null,
    renovated: !info.renovated,
    dates: false,
    photoDates: false, // 改修前は当日、改修後は空でよい
  };
  const fields = insurer ? FIELDS[insurer] : [];

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
  const pickAdd = useRef(false); // 選んだ写真を、その枠の写真に足して並べる（「＋ 追加」）
  const pickPhoto = (key?: PhotoKey, add = false) => {
    pickFor.current = key;
    pickAdd.current = add;
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
    return url ? {...url, edit: place?.photoEdits?.[slot], marks: place?.photoMarks?.[slot]} : null;
  };
  /**
   * 写真貼付用紙の上の写真の見えている四角の大きさ（画素）：プレビューと同じ計算（写真に書く内容の分け方・向き・大きさ）。
   * 原本にその写真番号の用紙がないときは、横 560・縦 420 画素の枠に置いた大きさ
   */
  const paperSize = (key: PhotoKey): {w: number; h: number} | null => {
    const x = photoList.find((p) => p.place.id === key.placeId);
    const ph = x ? photoOf(x.no, key.slot) : null;
    return ph ? shownSize(key, ph.w, ph.h, ph.edit) : null;
  };
  /** その枠に w×h の写真（edit の向き・大きさ）を置いたときの、見えている四角の大きさ（画素。写真を足して並べるときにも、並べ方を決めるのに使う） */
  const shownSize = (key: PhotoKey, w: number, h: number, edit?: PhotoEdit): {w: number; h: number} => {
    const x = photoList.find((p) => p.place.id === key.placeId);
    const frame = (x && pages?.flatMap((pg) => pg.photoSlots).find((f) => f.photo === x.no && f.slot === key.slot)) || {w: 560, h: 420};
    const lines = x && key.slot === 'before' ? photoNoteLines(x.place, kindNamesOf(job)) : [];
    const parts = photoNoteLayout({x: 0, y: 0, w: frame.w, h: frame.h}, {w, h, rot: edit?.rot ?? 0}, lines);
    const vb = photoBounds(photoPlacement(parts.photo, w, h, edit));
    return {w: vb.w, h: vb.h};
  };
  const addPhotos = (key: PhotoKey) => pickPhoto(key, true);
  // 書き込みの画面（写真の欄・プレビューの ✏️）
  const [marking, setMarking] = useState<PhotoKey | null>(null);
  const markPlace = marking ? photoList.find((p) => p.place.id === marking.placeId) : undefined;
  const markPhoto = marking && markPlace ? photoOf(markPlace.no, marking.slot) : null;
  // 平面図の図（プレビューの平面図の枠に、ドロップ・Ctrl+V・押して選ぶ。Excel の平面図に貼る）
  const planActions = usePlanActions(setJob);
  const planUrls = usePhotoUrls([job.planPhoto ?? '']);
  const planInput = useRef<HTMLInputElement>(null);
  // 図の URL：読み込むまでは undefined、この端末にない図は null
  const planUrl = job.planPhoto ? planUrls[job.planPhoto] : undefined;
  const pickPlan = () => planInput.current?.click();
  // 平面図の図への書き込み（①②の番号・線など。写真と同じ書き込みの画面を、紙の上の図の大きさで開く）
  const [planMarking, setPlanMarking] = useState(false);
  const planSize = (): {w: number; h: number} => {
    const slot = pages?.find((pg) => pg.planSlot)?.planSlot;
    if (!slot || !planUrl) return {w: 560, h: 420};
    const box = planPlacement({x: 0, y: 0, w: slot.w, h: slot.h}, planUrl.w, planUrl.h);
    return {w: box.w, h: box.h};
  };

  // プレビューの写真貼付用紙の写真と平面図の図（印刷の画面にも同じものを出す）
  const previewPhotos: PreviewPhotos = {
    of: photoOf,
    note: (no) => {
      const x = photoList.find((p) => p.no === no);
      return x ? photoNoteLines(x.place, kindNamesOf(job)) : [];
    },
    onDrop: (no, slot, e) => {
      const key = photoKey(no, slot);
      if (key) photoActions.drop(e, key);
    },
    onPick: (no, slot) => {
      const key = photoKey(no, slot);
      if (key) pickPhoto(key);
    },
    onAdd: (no, slot) => {
      const key = photoKey(no, slot);
      if (key) addPhotos(key);
    },
    onEdit: (no, slot, edit) => {
      const key = photoKey(no, slot);
      if (key) photoActions.setEdit(key, edit, photoOf(no, slot) ?? undefined);
    },
    onMark: (no, slot) => setMarking(photoKey(no, slot)),
    onRemove: (no, slot) => {
      const key = photoKey(no, slot);
      if (key) photoActions.remove(key);
    },
  };
  const previewPlan: PreviewPlan = {
    image: job.planPhoto ? (planUrl ?? null) : undefined,
    missing: planUrl === null,
    busy: planActions.busy,
    onFiles: (files) => void planActions.put(files),
    onPick: pickPlan,
    onRemove: planActions.remove,
    marks: job.planMarks,
    onMark: () => setPlanMarking(true),
  };
  // 申請書の印刷（ShinseiPrint.tsx。プレビューと同じページを A4 に）
  const [printing, setPrinting] = useState(false);
  // 白紙に戻すは外した（ユーザーの指示「削除（白紙に戻すは不要）」2026-10-28。前は 2026-10-26 から上の段の右にあった）

  const save = () => {
    if (!insurer) return;
    void saveShinsei(job, insurer, s).then(
      ({fileName, missingPhotos, unreadablePhotos, planMissing}) => {
        toast(`「${fileName}」を保存しました`);
        if (missingPhotos) toast(`写真${missingPhotos}枚はこの端末にないので貼っていません`, 'error');
        if (unreadablePhotos) toast(`写真${unreadablePhotos}枚は読めなかったので貼っていません`, 'error');
        if (planMissing) toast('平面図の図はこの端末にないので貼っていません', 'error');
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
      case 'insurerNo': {
        // 保険者番号：保険者の市町村・区から選ぶ（広域連合は構成市町村、福岡市・北九州市は区。ユーザーの指示「保険者を選択できる項目を入力欄に入れる」
        // 「他の保険者も同様の仕様にする」2026-10-29）。初めは住所から。介護保険証から読んだ一覧にない番号もそのまま出す
        const ins = jobInsurer(job);
        const areas = ins ? INSURER_AREAS[ins] : [];
        const cur = insurerNoOf(ins, job.address, info.insurerNo);
        const odd = cur && !areas.some((a) => a.no === cur);
        return (
          <select
            value={cur}
            onChange={(e) => setInfo({insurerNo: e.target.value})}
            disabled={areas.length < 2 && !odd}
            className="h-10 w-full max-w-md rounded-md border border-slate-300 bg-white px-2 text-base disabled:bg-slate-50 disabled:text-slate-700"
            aria-label="保険者番号"
            // Enter では飛ばす（住所から選ぶので、打ち込む流れ（被保険者番号 → 生年月日）を止めない）
          >
            {!cur && <option value="">選んでください</option>}
            {odd && <option value={cur}>{cur}（介護保険証の番号）</option>}
            {areas.map((a) => (
              <option key={a.no} value={a.no}>
                {a.no}　{ins === 'kouiki' ? `${a.name}（${INSURER_GROUP.kouiki}）` : ins === 'fukuoka' || ins === 'kitakyushu' ? `${INSURER_GROUP[ins]} ${a.name}` : a.name}
              </option>
            ))}
          </select>
        );
      }
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
      case 'burden':
        return <BurdenPicker info={info} setInfo={setInfo} />;
      case 'owner':
        return (
          <>
            <TextInput value={info.owner} onChange={(owner) => setInfo({owner})} className="w-48" aria-label="住宅の所有者" data-nav />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              本人との関係（
              <TextInput value={info.relation} onChange={(relation) => setInfo({relation})} className="w-36" aria-label="本人との関係" data-nav />）
            </span>
            <Btn small color="white" onClick={() => setInfo({owner: job.customer.trim(), relation: '本人'})}>
              本人の家
            </Btn>
          </>
        );
      case 'reason':
        return (
          <>
            {/* 事業所名は行いっぱい、氏名はその下（理由書のタブと同じ。2026-10-26 のデバッグ） */}
            <span className="flex w-full min-w-0 items-center gap-1">
              事業所名
              <TextInput value={info.reasonOffice} onChange={(reasonOffice) => setInfo({reasonOffice})} className="min-w-0 flex-1" aria-label="理由書作成者の事業所名" data-nav />
            </span>
            <span className="inline-flex items-center gap-1">
              氏名
              <TextInput value={info.reasonName} onChange={(reasonName) => setInfo({reasonName})} className="w-48" aria-label="理由書作成者の氏名" data-nav />
            </span>
          </>
        );
      case 'works':
        return <WorksEditor job={job} setJob={setJob} s={s} insurer={i} materials={data.materials} />;
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
        const end = workDates(i) ? '完成日' : i === 'kanda' ? '完了予定日' : '完成予定日';
        return (
          <>
            {workDates(i) && (
              <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
                着工日
                <input type="date" value={info.start} onChange={(e) => setInfo({start: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label="着工日" data-nav />
              </label>
            )}
            <label className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
              {end}
              <input type="date" value={info.end} onChange={(e) => setInfo({end: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label={end} data-nav />
            </label>
            {workDates(i) && <Note>{i === 'fukuoka' ? '完了届出書' : '支給申請書'}に書きます（工事のあと）</Note>}
          </>
        );
      }
    }
  };

  const marks: ShinseiMarks = {gender: info.gender, era: eraOf(info), care: info.care, renovated: info.renovated};
  // プレビューの欄を押したとき：一覧のその項目の最初の欄へ
  const goField = (f: Field) => {
    setActive(f);
    document.querySelector<HTMLElement>(`[data-field="${f}"] input, [data-field="${f}"] select, [data-field="${f}"] button`)?.focus();
  };

  return (
    <div className="space-y-3">
      {/* 上の段（一覧へ戻る・タブ・介護保険証から入れる／名前・Excelで保存・印刷・削除／まとめて保存）はどのタブでも同じ形（JobHeader.tsx） */}
      <JobHeader
        onBack={onBack}
        tabs={tabs}
        extra={<CardFill job={job} setJob={setJob} />}
        title={<JobTitle name={job.customer.trim() ? jobName(job) : '新しい申請書'} badge={insurer ? INSURER_INFO[insurer].name : undefined} />}
        // 2段目は Excelで保存・印刷・削除、3段目はまとめて保存（どのタブも同じ並び。JobHeader.tsx）。保険者を選ぶまで（原本がないので）Excel・印刷は押せない
        primary={
          <>
            <Btn color="softGreen" onClick={save} disabled={!canMakeShinsei(insurer)}>
              <span>📗 申請書を<span className="whitespace-nowrap">Excelで保存</span></span>
            </Btn>
            <Btn color="softSky" onClick={() => setPrinting(true)} disabled={!canMakeShinsei(insurer) || !pages?.length}>
              🖨 申請書を印刷
            </Btn>
            <RemoveJobButton job={job} settings={s} update={update} onBack={onBack} />
          </>
        }
        secondary={batch}
      />
      {printing && pages && map && (
        <ShinseiPrint pages={pages} title={shinseiFileName(map, job, estimateDateOf(job)).replace(/\.xlsx$/, '')} photos={previewPhotos} plan={previewPlan} onClose={() => setPrinting(false)} />
      )}

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
        {/* 工事場所の市町村が保険者と違うときは知らせる（見積書のタブと同じ。違う保険者を選んだまま、その申請書を作らないように。変えるのはボタンで） */}
        {byAddress && byAddress !== insurer && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">
            工事場所の住所は「{INSURER_INFO[byAddress].name}」です。
            <Btn small color="white" onClick={() => setInsurer(byAddress)}>
              保険者を{INSURER_INFO[byAddress].name}にする
            </Btn>
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
                  <div className="flex flex-wrap items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700 sm:border-b-0 sm:border-r sm:border-slate-300 sm:py-2">
                    {label(f, insurer)}
                    {/* ユーザーの指示「振り仮名の横に括弧で、ひらがな入力でも自動的にカタカナに変換…を記載する」 */}
                    {f === 'kana' && <span className="text-xs font-normal text-slate-500">（ひらがなで入力してもカタカナになります）</span>}
                  </div>
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
                const add = pickAdd.current;
                pickFor.current = undefined;
                pickAdd.current = false;
                if (!files.length) return;
                if (add && key) void photoActions.add(files, key, (w, h, edit) => shownSize(key, w, h, edit));
                else void photoActions.put(files, key);
              }}
            />
            <input
              ref={planInput}
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              aria-label="平面図のファイル"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                if (files.length) void planActions.put(files);
              }}
            />
            <PhotoBoard job={job} rates={s} sheetNos={sheetNos} dates={!!map?.sheets.some((x) => x.photoPlace?.dates)} actions={photoActions} onPick={pickPhoto} onAdd={addPhotos} onMark={setMarking} paperSize={paperSize} />
            <PhotoOrderDialog ordering={photoActions.ordering} />
            {marking && markPlace && markPhoto && (
              <PhotoMarkEditor
                key={`${marking.placeId}:${marking.slot}`}
                title={`${circled(markPlace.no)}${markPlace.place.name || '改修場所'}の${SLOT_LABEL[marking.slot]}`}
                photo={{url: markPhoto.url, w: markPhoto.w, h: markPhoto.h, rot: markPhoto.edit?.rot ?? 0}}
                size={paperSize(marking) ?? {w: 560, h: 420}}
                marks={markPhoto.marks ?? []}
                onChange={(marks) => photoActions.setMarks(marking, marks)}
                onClose={() => setMarking(null)}
                onRotate={(dir) => photoActions.setEdit(marking, turn(markPhoto.edit, dir), {w: markPhoto.w, h: markPhoto.h})}
              />
            )}
            {planMarking && planUrl && (
              <PhotoMarkEditor
                key={`plan:${job.planPhoto}`}
                title="平面図"
                what="図"
                photo={{url: planUrl.url, w: planUrl.w, h: planUrl.h, rot: 0}}
                size={planSize()}
                marks={job.planMarks ?? []}
                onChange={planActions.setMarks}
                onClose={() => setPlanMarking(false)}
              />
            )}
          </div>
          {/* スクロールバーの場所はいつも空けておく（scrollbar-gutter）。空けないと、中身の高さが箱とほぼ同じ窓の大きさで、スクロールバーが出る → 幅が狭くなり
              プレビューが縮む → スクロールバーが消える → 幅が戻って大きくなる…をくり返して、プレビューがふるえた（ユーザーの報告「右側の部分がふるえる」） */}
          <div ref={previewBox} className="min-w-0 rounded-lg bg-slate-200/60 p-2 lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto" style={{scrollbarGutter: 'stable'}}>
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
                photos={previewPhotos}
                plan={previewPlan}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function Note({children}: {children: ReactNode}) {
  return <span className="text-xs text-slate-500">{children}</span>;
}

/**
 * 負担割合（1割・2割・3割）と生活保護。住宅改修申請書のタブと工事見積書のタブで同じもの（どちらも job.shinsei の burden・welfare。特定福祉用具とも同じ値）。
 * 生活保護なら見積書の内訳は「生活保護（1割）」と書く（利用者負担の赤字の行は出さない。careLines.ts）
 */
export function BurdenPicker({info, setInfo}: {info: ShinseiInfo; setInfo: (patch: Partial<ShinseiInfo>) => void}) {
  return (
    <>
      <Circles label="負担割合" options={['1割', '2割', '3割']} value={info.burden ? `${info.burden}割` : ''} onPick={(v) => setInfo({burden: (v ? v[0] : '') as ShinseiInfo['burden']})} />
      <label className="flex items-center gap-1.5 text-sm text-slate-700">
        <input type="checkbox" checked={info.welfare === true} onChange={(e) => setInfo({welfare: e.target.checked || undefined})} />
        生活保護
      </label>
    </>
  );
}

/** 丸で囲む項目（申請書と同じ「男　・　女」の形。押すと丸がつき、もう一度押すと外れる） */
export function Circles({label, options, value, onPick}: {label: string; options: readonly string[]; value: string; onPick: (v: string) => void}) {
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
export function KanaInput({value, onChange, ...rest}: {value: string; onChange: (v: string) => void} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
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

/**
 * 寸法の欄（mm。打ったまま。全角でもよい）。長さは「600×850」のように2つ以上も（区切りは × のほか , 、 すき間）。
 * optional：見出しに小さく「（任意）」。missing：まだ入っていない（薄い黄色。ほかの入れる所と同じ）
 */
function Dim({
  label,
  value,
  placeholder,
  wide,
  optional = false,
  missing = false,
  autoFocus = false,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  wide: boolean;
  optional?: boolean;
  missing?: boolean;
  autoFocus?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      {optional && <span className="-ml-0.5 text-[11px] text-slate-400">（任意）</span>}
      <TextInput
        value={value}
        onChange={onChange}
        inputMode={wide ? undefined : 'numeric'}
        placeholder={placeholder}
        className={`${wide ? 'w-28' : 'w-16'} text-right ${missing ? 'bg-amber-50' : ''}`}
        aria-label={`${label}（mm）`}
        autoFocus={autoFocus}
        data-nav
        data-dim
      />
      <span className="text-xs text-slate-500">mm</span>
    </label>
  );
}

/**
 * 改修の内容：箇所ごとに 写真番号・改修場所・改修の種類と寸法。見積書の箇所と同じもの（ここで足した箇所は見積書にも出る）。
 * 寸法（ユーザーの指示「入力項目に長さ、高さという項目をつくる」「段差の解消は幅・奥行・高さの入力欄」）：手すりは 長さ（L=600mm。入れなければ見積書の使う長さ＝薄い字）・
 * 高さ（H=800mm。任意）、段差の解消は 幅・奥行・高さ（W600mm D350mm H150mm）。「そのほか」はうしろに足す文。下に、申請書に書く行を1行ずつの欄で出す（手で直せる）
 */
function WorksEditor({job, setJob, s, insurer, materials}: {job: Job; setJob: (fn: (j: Job) => Job) => void; s: Settings; insurer: Insurer; materials: Material[]}) {
  const photos = photoNumbers(job, s);
  const setPlace = (id: string, fn: (p: Place) => Place) => setJob((j) => ({...j, places: j.places.map((p) => (p.id === id ? fn(p) : p))}));
  // 手すりの長さを入れたら、見積書のその箇所の手すり・ベースプレートの使う長さにもする（ユーザーの指示「どちらか一方を入力した際に、自動的に 1.2 の部分が入力される」。`cutLink.ts`）。
  // 中間のブラケット（BD-01G）の数も入れ直す（`withBrackets`）
  const setDim = (id: string, key: keyof PlaceDims, v: string) =>
    setPlace(id, (x) => {
      const dims: PlaceDims = {...x.dims, [key]: v};
      if (!v.trim()) delete dims[key];
      const {dims: _old, ...rest} = x;
      const next: Place = Object.keys(dims).length ? {...rest, dims} : rest;
      return key === 'l' ? withBrackets(x, placeFromDims(next), materials) : next;
    });
  // 見積書に箇所が出るように、空白の行を1つ入れておく（見積書で部材・施工費を入れていける）。
  // 足した箇所の寸法（手すりは長さ）にすぐ打ち込めるように、そこへ移る（ユーザーの指示「廊下、玄関など選択すると、長さの部分をすぐに入力できるようにする。とべるようにする」）。
  // 「＋ そのほか」は改修場所の名前から
  const list = useRef<HTMLDivElement>(null);
  const focusPlace = useRef<{id: string; field: 'dim' | 'name'} | null>(null);
  // ＋ で開く欄（手すりの高さ・そのほか）を開いた所（「箇所のid:h」「箇所のid:other」）と、開いてすぐ打てるようにする所
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const [opened, setOpened] = useState<string | null>(null);
  const openField = (key: string) => {
    setOpenKeys((o) => new Set(o).add(key));
    setOpened(key);
  };
  // 開いた欄は ✕ で閉じる（入れた値は消す。値が入っていれば消す前に確かめる）。ユーザーの指示「任意の高さは、一度開いても閉じることができるようにする」2026-10-28。
  // 「そのほか」も同じ作り
  const closeField = (key: string, label: string, value: string, clear: () => void) => {
    if (value.trim() && !confirm(`${label}（${value.trim()}）を消して閉じますか？`)) return;
    clear();
    setOpenKeys((o) => {
      const next = new Set(o);
      next.delete(key);
      return next;
    });
    setOpened(null);
  };
  const closeBtn = 'rounded px-1.5 py-0.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700';
  const plusBtn = 'rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700';
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
  // 写真・撮影日・寸法・手で直した文などの入った箇所は、消す前に聞く（一度押しただけで写真ごと消えて、元に戻せなかった）
  const remove = (p: Place) => {
    const has = [
      p.photos?.before || p.photos?.after ? '写真' : '',
      p.photoDates?.before || p.photoDates?.after ? '撮影日' : '',
      Object.values(p.dims ?? {}).some((v) => v?.trim()) ? '寸法' : '',
      p.shinseiText?.trim() ? 'そのほか' : '',
      p.photoNote?.trim() ? '写真に書く内容' : '',
    ].filter(Boolean);
    if (has.length && !confirm(`「${p.name.trim() || '箇所'}」と、その${has.join('・')}を消します。元に戻せません。よろしいですか？`)) return;
    setJob((j) => ({...j, places: j.places.filter((x) => x.id !== p.id)}));
  };
  return (
    <div className="w-full space-y-2">
      {job.places.length > 0 && (
        <div ref={list} className="text-sm" role="list" aria-label="改修の箇所">
          {job.places.map((p) => {
            const n = photos.get(p.id);
            const used = p.rows.some((r) => !isBlankRow(r)); // 見積書に行のある箇所は、見積書で消す
            const dim = (key: keyof PlaceDims, text: string, o: {wide?: boolean; placeholder?: string; optional?: boolean; missing?: boolean; autoFocus?: boolean} = {}) => (
              <Dim label={text} value={p.dims?.[key] ?? ''} placeholder={o.placeholder ?? ''} wide={o.wide ?? false} optional={o.optional} missing={o.missing} autoFocus={o.autoFocus} onChange={(v) => setDim(p.id, key, v)} />
            );
            const showOther = openKeys.has(`${p.id}:other`) || !!p.shinseiText?.trim();
            const showHeight = openKeys.has(`${p.id}:h`) || !!p.dims?.h?.trim();
            return (
              <div key={p.id} data-place={p.id} role="listitem" aria-label={`${n ? circled(n) : ''}${p.name || '改修場所'}`} className="border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 text-center text-base">{n ? circled(n) : '—'}</span>
                  {/* 改修場所は行の残りいっぱい（前は w-28 で「玄関から廊下に…」「洗面所兼脱衣所」が切れていた。2026-10-26 のデバッグ） */}
                  <TextInput value={p.name} onChange={(name) => setPlace(p.id, (x) => ({...x, name}))} placeholder="改修場所" className="min-w-[7rem] flex-1" aria-label="改修場所" data-nav />
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
                    <button type="button" onClick={() => remove(p)} className="w-7 rounded py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`${p.name || '箇所'}を消す`}>
                      ✕
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-9">
                  {p.kind === 1 && (
                    <>
                      {/* 手すりの長さは必須（入っていなければ薄い黄色。入れなければ見積書の使う長さ＝薄い字を書く）、高さは任意で ＋ を押すと開いて入れる
                          （ユーザーの指示「手すりの取り付けの高さが任意、長さは必須。手すりの取り付けの高さも、プラスで開いてから入力できるようにする。（任意）」2026-10-26） */}
                      {dim('l', '長さ', {wide: true, placeholder: estimateLength(p), missing: !p.dims?.l?.trim() && !estimateLength(p)})}
                      {showHeight ? (
                        <span className="inline-flex items-center gap-0.5">
                          {dim('h', '高さ', {optional: true, autoFocus: opened === `${p.id}:h`})}
                          <button type="button" onClick={() => closeField(`${p.id}:h`, '高さ', p.dims?.h ?? '', () => setDim(p.id, 'h', ''))} className={closeBtn} aria-label="高さを閉じる" title="高さを閉じる（入れた高さは消えます）">
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => openField(`${p.id}:h`)} className={plusBtn}>
                          ＋ 高さ（任意）
                        </button>
                      )}
                    </>
                  )}
                  {p.kind === 2 && (
                    <>
                      {dim('w', '幅')}
                      {dim('d', '奥行')}
                      {dim('h', '高さ')}
                    </>
                  )}
                  {/* 「そのほか」は ＋ を押すと開いて入れる（ユーザーの指示「そのほかの部分は、プラスかで、開くと入力できるようにする」2026-10-26）。文字が入っていれば開いたまま */}
                  {showOther ? (
                    <label className="flex min-w-[9rem] flex-1 items-center gap-1 whitespace-nowrap">
                      そのほか
                      <TextInput value={p.shinseiText ?? ''} onChange={(t) => setPlace(p.id, (x) => ({...x, shinseiText: t}))} className="min-w-0 flex-1" aria-label="そのほか" autoFocus={opened === `${p.id}:other`} data-nav />
                      <button
                        type="button"
                        onClick={() => closeField(`${p.id}:other`, 'そのほか', p.shinseiText ?? '', () => setPlace(p.id, ({shinseiText: _t, ...x}) => x))}
                        className={closeBtn}
                        aria-label="そのほかを閉じる"
                        title="そのほかを閉じる（入れた文は消えます）"
                      >
                        ✕
                      </button>
                    </label>
                  ) : (
                    <button type="button" onClick={() => openField(`${p.id}:other`)} className={plusBtn}>
                      ＋ そのほか
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* 箇所を足す：プルダウンで選ぶ（前はボタンを全部並べていた。ユーザーの指示「一覧形式で全て出す形にしてますが、少し全体すっきりさせたいので、
          プルダウン形式にしてください」2026-10-26）。選ぶと足して、その箇所の長さの欄へ（「そのほか」は改修場所の名前の欄へ） */}
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) add(v === OTHER_PLACE ? '' : v);
        }}
        aria-label="箇所を足す"
        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        <option value="">＋ 箇所を足す</option>
        {s.placePresets.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={OTHER_PLACE}>そのほか（名前を打つ）</option>
      </select>
    </div>
  );
}
