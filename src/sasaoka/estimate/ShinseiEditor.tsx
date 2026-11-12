// 申請書のタブ（様邸の画面の左のタブ。右は見積書）：保険者の申請書の項目を、申請書の上からの順番に並べた一覧で入れ、横のプレビュー（原本の様式のまま）で確かめる
// （ユーザーの指示「一覧から入力をメインとする。プレビューをみながら入力」）。Enter で次の欄。入れている項目はプレビューで囲み、プレビューの欄を押すと一覧のその項目へ。
// 丸で囲む項目（性別・要介護状態区分など）は一覧のボタンか、プレビューの申請書の文字を押す。まだ入っていない欄は薄い黄色（上の「まだ入っていない欄：」の一覧は、
// ユーザーの指示「全体的にシンプルにしたいので、今回はなくしてください。すべて」2026-10-26 で外した）。
// 見積書と同じ様邸（Job）：氏名・住所・被保険者番号・改修の箇所は見積書と同じ欄、改修予定費用は見積書の金額なので、どちらで直してもすぐ両方に出る。
// 申請書だけ・見積書だけでもよい（見積書がないときは、改修の箇所と寸法を入れ、改修費用を手で入れる）。
// 写真（PhotoBoard）：写真番号の箇所ごとに改修前・改修後の写真を入れ、入れ替える。プレビューの写真貼付用紙にも出し、Excel の写真貼付用紙に貼る。
// 写真への書き込み（✏️。PhotoMarkEditor.tsx）は、写真貼付用紙の上の写真の大きさ（paperSize）で開く（線の太さ・文字の大きさが紙の上と同じ割合になるように）

import {Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode, RefObject} from 'react';
import {isBlankRow, jobName} from '../calc.ts';
import {Btn, KanaInput, TextInput, useToast} from '../components/ui.tsx';
import {circled, eraOf, INSURER_IDS, INSURER_INFO, insurerForAddress, jobInsurer, KINDS, MARK_INFO, NO_SHINSEI, offEstimate, photoNumbers} from '../estimateForms.ts';
import {placeFromDims, plateFromText, withBrackets} from '../cutLink.ts';
import {newPlace} from '../rows.ts';
import {withSlots} from '../railSlots.ts';
import {usePhotoUrls} from '../photos.ts';
import {turn} from '../photoEdit.ts';
import {AREA_LABEL, INSURER_AREAS, insurerNoOf} from '../insurerNumbers.ts';
import {photoBounds} from '../photoMarks.ts';
import {autoLength, costIsTotal, lengthsShown, estimatePlateLength, insuredBoxes, padInsuredNo, photoDay, photoNoteLayout, photoNoteLines, photoPlacement, photoSheets, planPlacement, SHINSEI, shinseiAutoOffice, shinseiCost, shinseiFileName, shinseiWorks} from '../shinsei.ts';
import {riyuOf, shinseiBookValues} from '../riyu.ts';
import {shinseiPreview} from '../shinseiPreview.ts';
import type {PvPage, ShinseiField as Field} from '../shinseiPreview.ts';
import type {AppData, BuilderOffice, Insurer, Job, Material, PhotoEdit, Place, PlaceDims, Settings, ShinseiInfo, ShinseiMarks} from '../types.ts';
import {builderChoices, builderOffice} from '../shinseiOffice.ts';
import type {Update} from '../useStore.ts';
import {yen} from '../util.ts';
import {zipCandidates} from '../zip.ts';
import {PhotoBoard, PhotoOrderDialog, photoPlaces, SLOT_LABEL, usePhotoActions, usePlanActions} from './PhotoBoard.tsx';
import {MadoriEditor} from '../madori/MadoriEditor.tsx';
import {hasMadori} from '../madori/model.ts';
import {useMadoriPlan} from '../madori/planImage.ts';
import {linkPlan, planLinked} from '../madori/sheet.ts';
import {PhotoMarkEditor} from './PhotoMarkEditor.tsx';
import type {PhotoKey, PhotoSlot} from './PhotoBoard.tsx';
import {canMakeShinsei, useTemplate} from './shinseiFiles.ts';
import {ShinseiPages} from './ShinseiPreview.tsx';
import type {PreviewPhotos, PreviewPlan} from './ShinseiPreview.tsx';
import {ShinseiPrint} from './ShinseiPrint.tsx';
import {estimateDateOf} from '../print/docMeta.ts';
import {CardFill} from '../components/CardReader.tsx';
import {JobHeader, JobTitle, RemoveJobButton} from './JobHeader.tsx';
import type {JobDocs} from '../components/DocsDialog.tsx';
import {telWithHyphens} from '../tel.ts';
import {DEMO} from '../demo/flag.ts';

/** 欄の順番：保険者ごとの申請書の上からの順番（原本を見て決めた。みやこ町・広域連合は承認の申請書の順番で、支給申請書だけの着工日・完成日は最後）。
 *  ただし被保険者氏名はどの保険者もフリガナのすぐ下（ユーザーの指示「ふりがなの下に、名前をもってくる」、2026-10-21。苅田町・みやこ町は原本では番号が先）。
 *  保険者番号（区・市町村）は一覧ではなく、上の保険者のすぐ右で選ぶ（InsurerAreaPick） */
const FIELDS: Record<Insurer, Field[]> = {
  kanda: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'burden', 'owner', 'photoDates', 'works', 'dates', 'cost', 'builder'],
  yukuhashi: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'care', 'burden', 'owner', 'photoDates', 'works', 'dates', 'cost', 'builder'],
  miyako: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'burden', 'owner', 'reason', 'photoDates', 'works', 'cost', 'renovated', 'dates', 'builder'],
  kouiki: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'burden', 'owner', 'reason', 'photoDates', 'works', 'cost', 'renovated', 'dates', 'builder'], // 郵便番号はユーザーの指示で足した（2026-10-21）
  // 福岡市：性別・郵便番号・要介護状態区分の欄はない。着工日・完成日は完了届出書（工事のあと）
  fukuoka: ['kana', 'name', 'insuredNo', 'birth', 'address', 'phone', 'burden', 'owner', 'photoDates', 'works', 'cost', 'dates', 'builder'],
  // 北九州市：生年月日・性別・要介護状態区分の欄はない。フリガナ・着工日・完成日は支給申請書（工事のあと）。工事費見積金額は介護保険の対象分（市の記入例）
  kitakyushu: ['kana', 'name', 'insuredNo', 'zip', 'address', 'phone', 'burden', 'owner', 'photoDates', 'works', 'builder', 'cost', 'dates'],
  // 久留米市（2026-11-02）：性別・要介護状態区分の欄はない。介護支援専門員等＝理由書作成者（「同左」）。着工（予定）日・完成（予定）日は両方の申請書。負担割合の□も申請書にある
  kurume: ['kana', 'name', 'insuredNo', 'birth', 'zip', 'address', 'phone', 'owner', 'reason', 'photoDates', 'works', 'dates', 'cost', 'burden', 'builder'],
  // 飯塚市（2026-11-02）：事前承認願書の上からの順。住宅改修の利用（無・有）・今回の改修費用・理由書作成者・着工予定日・完成予定日。負担割合は請求書の保険給付分・本人負担分
  iizuka: ['kana', 'name', 'insuredNo', 'birth', 'gender', 'zip', 'address', 'phone', 'owner', 'photoDates', 'works', 'renovated', 'cost', 'reason', 'dates', 'burden', 'builder'],
  // 大分市（2026-11-04）：支給申請兼施工承認申請書の上からの順（郵便番号・性別の欄はない）。要支援・要介護の（　）・認定有効期間、改修の内容の行の着工予定・完成予定、
  // 改修費用見積額、居宅介護支援事業所（理由書作成者と連絡先）。過去の住宅改修費支給申請の有無は理由書（表）
  oita: ['kana', 'name', 'insuredNo', 'birth', 'care', 'burden', 'careTerm', 'address', 'phone', 'owner', 'photoDates', 'works', 'dates', 'cost', 'reason', 'renovated', 'builder'],
};
// 負担割合は要介護状態区分のすぐ下（みやこ町・広域連合は電話番号の下）。申請書の原本に欄はないが、委任状の保険給付額・見積書の介護保険の内訳に使い、
// 特定福祉用具の負担割合と同じ値（どちらで選んでも両方に入る。tokuteiLink.ts）。ユーザーの指示「住宅改修の申請書にも負担割合を設置。住宅改修⇔特定福祉用具などで連動して数字に繋げる」2026-10-28
// 施工業者（施工者・受任者・事業者の欄に書く営業所と事業者番号）は一番下（北九州市は事前届出書の施工予定業者の位置＝改修の内容のすぐ下）。
// ユーザーの指示「施工業者名は、太陽シルバーサービス株　行橋、小倉南、小倉、八幡東、八幡西にする。それぞれリストから選択、追加もできる。事業者番号もわかっていると思うので入力」2026-11-11
// 改修前日付・改修後日付（写真の日付）は、改修の内容のすぐ上（ユーザーの指示「この部分に改修前日付・改修後日付を入力欄となるようにする」2026-10-22）

/** みやこ町・広域連合：改修の内容は内訳明細書（別紙）、着工日・完成日は支給申請書（工事のあと）に書く */
const twoForms = (i: Insurer) => i === 'miyako' || i === 'kouiki';
/** 着工日・完成日を入れる保険者（工事のあとの支給申請書・完了届出書に書く。福岡市は改修の内容は申請書のまま） */
const workDates = (i: Insurer) => twoForms(i) || i === 'fukuoka' || i === 'kitakyushu' || i === 'kurume' || i === 'iizuka' || i === 'oita';

/** 欄の名前（申請書の言葉） */
function label(f: Field, i: Insurer): string {
  if (f === 'cost') return twoForms(i) ? '改修費用（介護保険対象分）' : i === 'kitakyushu' ? '工事費見積金額（介護保険対象分）' : i === 'iizuka' ? '今回の改修費用（介護保険対象分）' : i === 'oita' ? '改修費用見積額' : '改修予定費用';
  if (f === 'renovated' && i === 'iizuka') return '住宅改修の利用';
  if (f === 'renovated' && i === 'oita') return '過去の住宅改修費支給申請';
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
    careTerm: '認定有効期間',
    builder: '施工業者',
  }[f as string] ?? '理由書のタブで入れます'; // 理由書だけの欄（大分市の理由書（表））
}

/** 申請書の名前（画面の上に出す） */
const FORM_TITLE: Record<Insurer, string> = {
  kanda: '住宅改修費支給事前申請書（受領委任払用）',
  yukuhashi: '住宅改修費受領委任払申請書',
  miyako: '住宅改修承認届出書・住宅改修費支給申請書（受領委任払用）',
  kouiki: '住宅改修承認申請書（様式第2号）・住宅改修費支給申請書（様式第7号）',
  fukuoka: '住宅改修費支給申請書（様式第21号）・住宅改修完了届出書（様式第22号の2）',
  kitakyushu: '介護保険住宅改修事前届出書・住宅改修費支給申請書（受領委任払用）',
  kurume: '住宅改修事前承認申請書・住宅改修費支給申請書（第2号様式）',
  iizuka: '住宅改修費事前承認願書・住宅改修費支給申請書・請求書（受領委任払用）',
  oita: '住宅改修費支給申請兼施工承認申請書・委任状・住宅改修が必要な理由書',
};

/** 箇所を足すのプルダウンの「そのほか」（名前を打つ箇所） */
const OTHER_PLACE = '__other';

export function ShinseiEditor({
  job,
  data,
  update,
  onBack,
  docs,
  onRiyu,
}: {
  job: Job;
  data: AppData;
  update: Update;
  onBack: () => void;
  docs?: JobDocs | null; // 「📗 Excelで保存」「✉ メールで送付」（どのタブも同じ。App.tsx の DocsDialog.tsx）
  // 理由書だけの項目（大分市の理由書（表）の現地確認日・身体状況など）をプレビューで押したとき：理由書のタブのその項目へ（App.tsx）
  onRiyu?: (field: Field) => void;
}) {
  const toast = useToast();
  const s = data.settings;
  const insurer = jobInsurer(job);
  const info: ShinseiInfo = {...NO_SHINSEI, ...job.shinsei};
  const setJob = (fn: (j: Job) => Job) => update('jobs', (list) => list.map((j) => (j.id === job.id ? {...fn(j), updatedAt: Date.now()} : j)));
  const setInfo = (patch: Partial<ShinseiInfo>) => setJob((j) => ({...j, shinsei: {...NO_SHINSEI, ...j.shinsei, ...patch}}));
  const setInsurer = (i: Insurer) => setJob((j) => ({...j, insurer: i, form: INSURER_INFO[i].form}));
  // 保険者を選んだら、続けて区・市町村（保険者番号）を選ぶ所へ（ユーザーの指示「保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる」2026-10-29）
  const areaRef = useRef<HTMLSelectElement>(null);
  const [focusArea, setFocusArea] = useState(false);
  useEffect(() => {
    if (!focusArea) return;
    areaRef.current?.focus();
    setFocusArea(false);
  }, [focusArea, insurer]);
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
    works: lines.length === 0 || job.places.some((p) => p.kind === 1 && !p.dims?.l?.trim() && !autoLength(p)),
    cost: cost === null,
    renovated: !info.renovated,
    careTerm: !info.careFrom || !info.careTo,
    dates: false,
    photoDates: false, // 改修前は当日、改修後は空でよい
    builder: false, // 選んでいなければ保険者・区から決まる営業所
  };
  const fields = insurer ? FIELDS[insurer] : [];

  // 申請書のプレビュー：原本に今の内容を転記して描く（打つたびに作り直す。打つのを待たせないように少し遅れてよい）
  const template = useTemplate(insurer);
  const map = insurer ? SHINSEI[insurer] : undefined;
  const shown = useDeferredValue(job);
  const pages = useMemo((): PvPage[] | null => {
    if (!template || !map) return null;
    try {
      return shinseiPreview(template, map, shinseiBookValues(shown, s));
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
    const lines = x && key.slot === 'before' ? photoNoteLines(x.place) : [];
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
  // ここで平面図を描く（平面図のタブと同じ編集画面を、この画面の上に重ねて開く。描いたら「申請書の平面図に入れる」で枠に入る。
  // ユーザーの指示「平面図はここで作成できるようにする」2026-11-10。描いたものは平面図のタブにも残る＝同じ Job.madori）
  const [planDrawing, setPlanDrawing] = useState(false);
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
  // 申請書の平面図の枠は、平面図のタブと同じ図（前の版で入れた図＝planPhoto がなければ。ユーザーの指示「平面図は、申請書でもつくれるし、
  // 平面図専用からもつくれる。相互転記させる」2026-11-10）。押すと平面図の編集画面を重ねて開く（前の版の図は今までどおり書き込みの画面）
  const linked = planLinked(job);
  const madoriPlan = useMadoriPlan(job, s);
  const previewPlan: PreviewPlan = {
    image: job.planPhoto ? (planUrl ?? null) : linked ? madoriPlan : undefined,
    missing: !!job.planPhoto && planUrl === null,
    busy: planActions.busy,
    onFiles: (files) => void planActions.put(files),
    onPick: pickPlan,
    onRemove: planActions.remove,
    marks: job.planPhoto ? job.planMarks : undefined,
    onMark: () => (linked ? setPlanDrawing(true) : setPlanMarking(true)),
    onDraw: () => {
      if (job.planOff) setJob(linkPlan);
      setPlanDrawing(true);
    },
  };
  // 申請書の印刷（ShinseiPrint.tsx。プレビューと同じページを A4 に）
  const [printing, setPrinting] = useState(false);
  // 白紙に戻すは外した（ユーザーの指示「削除（白紙に戻すは不要）」2026-10-28。前は 2026-10-26 から上の段の右にあった）

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
          <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            〒<TextInput value={info.zip} onChange={(zip) => setInfo({zip})} inputMode="numeric" placeholder="8240000" className="w-32" aria-label="郵便番号" data-nav />
            {/* ユーザーの指示「郵便番号の記入欄は、ハイフンなしで記入することを注意書き」「住所を入れたら自動的に郵便番号が入ることもわかるように、簡潔に」2026-10-30（7けた打つと 824-0043 の形になる。zip.ts の withZipAddress） */}
            <span className="w-full text-[13px] leading-tight text-slate-500">ハイフンなしで入力（住所を入れると自動で入ります）</span>
          </span>
        );
      case 'address':
        return <TextInput value={job.address} onChange={(address) => setJob((j) => ({...j, address}))} placeholder="福岡県…" className="w-full" aria-label="住所" data-nav />;
      case 'phone':
        return (
          <>
            <TextInput type="tel" value={telWithHyphens(info.phone)} onChange={(phone) => setInfo({phone: telWithHyphens(phone)})} placeholder="0930-00-0000" className="w-48" aria-label="電話番号" data-nav />
            {i === 'kouiki' && <Note>支給申請書（様式第7号）に書きます</Note>}
          </>
        );
      case 'care':
        return <Circles label="要介護状態区分" options={MARK_INFO.care.options} value={info.care} onPick={(care) => setInfo({care} as Partial<ShinseiInfo>)} />;
      case 'careTerm':
        // 認定有効期間（大分市の申請書・理由書（表））。介護保険証から読んだ日付も入る。理由書のタブの認定有効期間と同じ値
        return (
          <span className="inline-flex flex-wrap items-center gap-1">
            <input type="date" value={info.careFrom} onChange={(e) => setInfo({careFrom: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label="認定有効期間のはじめ" data-nav />～
            <input type="date" value={info.careTo} onChange={(e) => setInfo({careTo: e.target.value})} className="h-9 rounded-md border border-slate-300 px-2" aria-label="認定有効期間のおわり" data-nav />
          </span>
        );
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
            {/* 大分市の申請書の居宅介護支援事業所の「連絡先」：理由書のタブの作成者の連絡先と同じ値 */}
            {i === 'oita' && (
              <span className="inline-flex items-center gap-1">
                連絡先
                <TextInput type="tel" value={telWithHyphens(riyuOf(job).tel)} onChange={(tel) => setJob((j) => ({...j, riyu: {...riyuOf(j), tel: telWithHyphens(tel)}}))} className="w-40" aria-label="理由書作成者の連絡先" data-nav />
              </span>
            )}
          </>
        );
      case 'works':
        return <WorksEditor job={job} setJob={setJob} s={s} insurer={i} materials={data.materials} />;
      case 'builder':
        return <BuilderPick job={job} info={info} setInfo={setInfo} s={s} update={update} />;
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
            {/* （株）イヤーズ デモアプリは見積書がないので、金額は手で入れるだけ（見積書の言葉を出さない。2026-11-12） */}
            {!DEMO && <Note>{info.cost !== null ? '手で入れた金額' : cost !== null ? (costIsTotal(i) ? '見積書の合計（税込）' : '見積書の介護保険対象分の合計（税込）') : '見積書がないときは手で入れます'}</Note>}
            {!DEMO && info.cost !== null && (
              <Btn small color="white" onClick={() => setInfo({cost: null})}>
                見積書の金額にもどす
              </Btn>
            )}
          </>
        );
      case 'renovated':
        return <Circles label={label('renovated', i)} options={MARK_INFO.renovated.options} value={info.renovated} onPick={(renovated) => setInfo({renovated} as Partial<ShinseiInfo>)} />;
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
            {workDates(i) && <Note>{i === 'oita' ? '申請書の改修の内容の行（着工予定・完成予定）に書きます' : i === 'kurume' || i === 'iizuka' ? `${i === 'kurume' ? '事前承認申請書' : '事前承認願書'}（予定日）と支給申請書に書きます` : `${i === 'fukuoka' ? '完了届出書' : '支給申請書'}に書きます（工事のあと）`}</Note>}
          </>
        );
      }
    }
  };

  const marks: ShinseiMarks = {gender: info.gender, era: eraOf(info), care: info.care, renovated: info.renovated};
  // プレビューの欄を押したとき：一覧のその項目の最初の欄へ
  const goField = (f: Field) => {
    // この一覧にない項目（大分市の理由書（表）の理由書だけの欄）は、理由書のタブで入れる（前は押しても何も起きなかった）
    if (insurer && !FIELDS[insurer].includes(f) && onRiyu) return onRiyu(f);
    setActive(f);
    document.querySelector<HTMLElement>(`[data-field="${f}"] input, [data-field="${f}"] select, [data-field="${f}"] button`)?.focus();
  };

  return (
    <div className="space-y-3">
      {/* 上の段（一覧へ戻る・名前・Excelで保存・印刷・その他 ▼・保険者・介護保険証から入れる）はどのタブでも同じ形（JobHeader.tsx） */}
      <JobHeader
        onBack={onBack}
        extra={<CardFill job={job} setJob={setJob} />}
        title={<JobTitle name={job.customer.trim() ? jobName(job) : '新しい申請書'} badge={insurer ? INSURER_INFO[insurer].name : undefined} />}
        // 2段目は Excelで保存・印刷、3段目はメールで送付（どのタブも同じ並び。JobHeader.tsx）。保険者を選ぶまで（原本がないので）印刷は押せない
        // （Excelで保存・メールで送付は、ほかの書類も選べるので押せる。申請書は選べないだけ。DocsDialog.tsx）
        primary={
          <>
            {docs?.excel}
            <Btn color="softSky" onClick={() => setPrinting(true)} disabled={!canMakeShinsei(insurer) || !pages?.length}>
              🖨 申請書を印刷
            </Btn>
          </>
        }
        remove={(className) => <RemoveJobButton job={job} settings={s} update={update} onBack={onBack} className={className} />}
        secondary={docs?.mail}
        // 保険者・保険者番号は上の段の空いた所（ユーザーの指示「この部分も空いた部分に記載して、その分上にずらす」2026-11-03。前は上の段の下の1段）
        fields={
          <>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-slate-600">
              保険者
              <select
                value={insurer}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const next = e.target.value as Insurer;
                  setInsurer(next);
                  // 区・市町村を選ぶ保険者なら、続けてその選ぶ所へ
                  if (AREA_LABEL[next]) setFocusArea(true);
                }}
                className={`h-9 min-w-[8rem] rounded-md border px-2 text-sm ${insurer ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
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
            {insurer && <InsurerAreaPick insurer={insurer} address={job.address} picked={info.insurerNo} onPick={(insurerNo) => setInfo({insurerNo})} selectRef={areaRef} />}
          </>
        }
      />
      {printing && pages && map && (
        <ShinseiPrint pages={pages} title={shinseiFileName(map, job, estimateDateOf(job)).replace(/\.xlsx$/, '')} photos={previewPhotos} plan={previewPlan} onClose={() => setPrinting(false)} />
      )}

      {/* 工事場所の市町村が保険者と違うときは知らせる（見積書のタブと同じ。違う保険者を選んだまま、その申請書を作らないように。変えるのはボタンで） */}
      {byAddress && byAddress !== insurer && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-900">
          工事場所の住所は「{INSURER_INFO[byAddress].name}」です。
          <Btn small color="white" onClick={() => setInsurer(byAddress)}>
            保険者を{INSURER_INFO[byAddress].name}にする
          </Btn>
        </div>
      )}

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
            {planDrawing && (
              // ここで平面図を描く：平面図のタブと同じ編集画面を、この画面の上いっぱいに重ねる（role="dialog" にしない＝編集画面のキー操作を止めないため）
              <div className="fixed inset-0 z-40 overflow-y-auto bg-[#f2f6f4] p-3 sm:p-4" aria-label="申請書の平面図を描く" data-plan-draw>
                <div className="mx-auto max-w-[1600px]">
                  <MadoriEditor job={job} data={data} update={update} onBack={() => setPlanDrawing(false)} embed={{onDone: () => setPlanDrawing(false)}} />
                </div>
              </div>
            )}
            {planMarking && planUrl && (
              <PhotoMarkEditor
                key={`plan:${job.planPhoto}`}
                title="平面図"
                what="図"
                startTool="num"
                planTools
                photo={{url: planUrl.url, w: planUrl.w, h: planUrl.h, rot: 0}}
                size={planSize()}
                marks={job.planMarks ?? []}
                onChange={planActions.setMarks}
                onClose={() => setPlanMarking(false)}
                onReplace={() => {
                  setPlanMarking(false);
                  pickPlan();
                }}
                onRedraw={
                  hasMadori(job.madori)
                    ? () => {
                        setPlanMarking(false);
                        setPlanDrawing(true);
                      }
                    : undefined
                }
                onRemove={() => {
                  if (!window.confirm('平面図の図を削除しますか？')) return;
                  setPlanMarking(false);
                  planActions.remove();
                }}
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
  auto,
  onClear,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  wide: boolean;
  optional?: boolean;
  missing?: boolean;
  autoFocus?: boolean;
  /** 空けてあるときに入れて見せる値（手すりの長さ＝見積書の使う長さ。`autoLength`）。ふつうの字で出す */
  auto?: string;
  /** auto のある欄を消して空にしたとき。打ち始めたときの長さ（start）と、それが手で入れた長さだったか（manual）を渡す（見積書をその長さに戻す） */
  onClear?: (start: string, manual: boolean) => void;
  onChange: (v: string) => void;
}) {
  // auto のある欄は、打っているあいだは打った字のまま（消して空にしても見積書の長さに戻らない）。
  // 1字ずつ消すと「120」「12」「1」が見積書に入るので、空にしたら打ち始めたときの長さに見積書を戻す（onClear）
  const [edit, setEdit] = useState<string | null>(null);
  const start = useRef({text: '', manual: false});
  const raw = value.trim() || auto === undefined ? value : auto;
  // 長さの欄（wide）は 2本以上なら「400mm×600mm」と見せる（申請書の L= と同じ書き方。`lengthsShown`。押したときもその字のまま打ち直す）。
  // 欄の字に mm があるときは、欄の右の「mm」は出さない
  const shown = edit ?? (wide ? lengthsShown(raw) : raw);
  const withUnit = /mm/i.test(shown);
  // mm を付けて見せる長い長さ（「600mm×1800mm」）は、欄の字の幅を測って欄を広げる（8rem より広いときだけ）
  const box = useRef<HTMLInputElement>(null);
  const [fitW, setFitW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!wide || !el || !withUnit) return setFitW(0);
    const cs = getComputedStyle(el);
    const ctx = (dimCanvas ??= document.createElement('canvas')).getContext('2d');
    if (!ctx) return;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const pad = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce((a, k) => a + (parseFloat(cs.getPropertyValue(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))) || 0), 0);
    setFitW(Math.ceil(ctx.measureText(shown).width + pad + 6));
  }, [shown, wide, withUnit]);
  // 長さの欄（wide）は 2本の「600×1800」まで入る 8rem（前の 7rem は最後の字が欄に隠れた。2026-11-03 の全体のデバッグ）。
  // mm を付けて見せる長い長さ（「600mm×1800mm×900mm」）は字の数に合わせて広げる
  return (
    <label className="inline-flex items-center gap-1 whitespace-nowrap">
      {label}
      {optional && <span className="-ml-0.5 text-[11px] text-slate-400">（任意）</span>}
      <TextInput
        value={shown}
        onFocus={() => {
          // 押したときも見えていた字のまま打ち直す（「400mm×600mm」。mm 付きでも長さは読める）
          if (auto === undefined) {
            if (wide) setEdit(lengthsShown(value));
            return;
          }
          start.current = {text: value.trim() ? value : auto, manual: !!value.trim()};
          setEdit(wide ? lengthsShown(start.current.text) : start.current.text);
        }}
        onBlur={() => setEdit(null)}
        onChange={(v) => {
          if (auto === undefined) {
            if (wide) setEdit(v);
            return onChange(v);
          }
          setEdit(v);
          if (v.trim() || !onClear) onChange(v);
          else onClear(start.current.text, start.current.manual);
        }}
        inputMode={wide ? undefined : 'numeric'}
        placeholder={placeholder}
        className={`${wide ? 'w-32' : 'w-16'} text-right ${missing ? 'bg-amber-50' : ''}`}
        ref={box}
        style={fitW > 128 ? {width: fitW} : undefined}
        aria-label={`${label}（mm）`}
        autoFocus={autoFocus}
        data-nav
        data-dim
      />
      {!withUnit && <span className="text-xs text-slate-500">mm</span>}
    </label>
  );
}

let dimCanvas: HTMLCanvasElement | undefined; // 長さの欄の字の幅を測る

/**
 * 改修の内容：箇所ごとに 写真番号・改修場所・改修の種類と寸法。見積書の箇所と同じもの（ここで足した箇所は見積書にも出る。「見積書へ連動」を外すと出ない。
 * 見積書で最後の行を消した箇所・連動しないで足した箇所は申請書だけに出て、「見積書に入れる」で見積書にも出る）。
 * 寸法（ユーザーの指示「入力項目に長さ、高さという項目をつくる」「段差の解消は幅・奥行・高さの入力欄」）：手すりは 長さ（L=600mm。入れなければ見積書の使う長さ＝薄い字）・
 * 高さ（H=800mm。任意）、段差の解消は 幅・奥行・高さ（W600mm D350mm H150mm）。「そのほか」はうしろに足す文。下に、申請書に書く行を1行ずつの欄で出す（手で直せる）
 */
/**
 * 保険者番号：保険者のすぐ右で、北九州市・福岡市は区、広域連合は構成市町村（築上町・豊前市・上毛町・吉富町）を選んで決める
 * （ユーザーの指示「北九州市や福岡市では、保険者を選んだ後に、〇〇区を選んで、保険者番号を確定させる、住宅改修、特定福祉用具申請書どちらも。
 * 広域連合の場合は、広域連合を選択したら、その後に、同様に保険者を選択する（築上町、豊前市など）」2026-10-29。前は一覧の被保険者番号の下）。
 * 初めは住所の区・市町村から（insurerNumbers.ts の insurerNoOf）。区・市町村が1つの保険者は番号を出すだけ。介護保険証から読んだ一覧にない番号もそのまま出す。
 * プレビューの保険者番号のマスを押すとここへ（data-field="insurerNo"）
 */
function InsurerAreaPick({insurer, address, picked, onPick, selectRef}: {insurer: Insurer; address: string; picked: string; onPick: (no: string) => void; selectRef: RefObject<HTMLSelectElement | null>}) {
  const areas = INSURER_AREAS[insurer];
  const cur = insurerNoOf(insurer, address, picked);
  const odd = !!cur && !areas.some((a) => a.no === cur);
  const unit = AREA_LABEL[insurer];
  if (!unit && !odd) {
    return (
      <div data-field="insurerNo" className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-slate-600">
        保険者番号
        <span className="flex h-9 items-center font-mono text-sm font-normal text-slate-800">{cur}</span>
      </div>
    );
  }
  return (
    <label data-field="insurerNo" className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-slate-600">
      {unit || '保険者番号'}
      <select
        ref={selectRef}
        value={cur}
        onChange={(e) => onPick(e.target.value)}
        className={`h-9 min-w-[10rem] rounded-md border px-2 text-sm ${cur ? 'border-slate-300 text-slate-800' : 'border-amber-400 bg-amber-50 text-amber-800'}`}
        aria-label="保険者番号"
      >
        {!cur && <option value="">（選ぶ）</option>}
        {odd && <option value={cur}>{cur}（介護保険証の番号）</option>}
        {areas.map((a) => (
          <option key={a.no} value={a.no}>
            {a.name}　{a.no}
          </option>
        ))}
      </select>
    </label>
  );
}

const NO_BUILDER: BuilderOffice = {name: '', company: '', jigyoshoNo: '', postal: '', address: '', tel: '', manager: ''};

/**
 * 施工業者：申請書の施工者・受任者・事業者の欄に書く営業所（会社名・営業所・所在地・電話・所長）と事業者番号（介護保険の事業所番号）。
 * 一覧（行橋・小倉南・小倉・八幡東・八幡西と、保険者・区から決まる営業所）から選ぶ。「＋ 追加」でほかの営業所を足す（設定の builders に残る。
 * 足した営業所は「一覧から外す」で外せる）。選んでいなければ保険者・区から決まる営業所（shinseiOffice.ts）。
 * ユーザーの指示「施工業者名は、太陽シルバーサービス株　行橋、小倉南、小倉、八幡東、八幡西にする。それぞれリストから選択、追加もできる。
 * 事業者番号もわかっていると思うので入力」2026-11-11。プレビューの施工業者・事業者番号の欄を押すとここへ（data-field="builder"）
 */
function BuilderPick({job, info, setInfo, s, update}: {job: Job; info: ShinseiInfo; setInfo: (patch: Partial<ShinseiInfo>) => void; s: Settings; update: Update}) {
  const added = s.builders ?? [];
  const current = s.officeName.trim();
  const auto = shinseiAutoOffice(job, current) || current;
  const cur = (info.builderOffice ?? '').trim() || auto;
  const base = builderChoices(auto, added);
  const allChoices = base.includes(cur) ? base : [...base, cur]; // 選んでいる営業所は、一覧から外したあとも出す
  const office = builderOffice(cur, added);
  const company = (office && 'company' in office && office.company) || s.company;
  const [draft, setDraft] = useState<BuilderOffice | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (draft && !draft.name) nameRef.current?.focus();
  }, [draft]);
  const isAdded = added.some((b) => b.name === cur);
  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return nameRef.current?.focus();
    const b: BuilderOffice = {
      name,
      ...(draft.company?.trim() && draft.company.trim() !== s.company.trim() ? {company: draft.company.trim()} : {}),
      jigyoshoNo: draft.jigyoshoNo.normalize('NFKC').replace(/\D/g, ''),
      postal: draft.postal.trim(),
      address: draft.address.trim(),
      tel: telWithHyphens(draft.tel.trim()),
      manager: draft.manager.trim(),
    };
    update('settings', (prev) => ({...prev, builders: [...(prev.builders ?? []).filter((x) => x.name !== name), b]}));
    setInfo({builderOffice: name});
    setDraft(null);
  };
  const field = (key: keyof BuilderOffice, label: string, cls: string, extra: Record<string, unknown> = {}) => (
    <label className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-600">
      {label}
      <TextInput value={draft?.[key] ?? ''} onChange={(v) => setDraft((d) => (d ? {...d, [key]: v} : d))} className={cls} aria-label={`足す施工業者の${label}`} {...extra} />
    </label>
  );
  return (
    <>
      <span className="text-sm text-slate-700">{company}</span>
      {allChoices.length > 0 ? (
        <select
          value={cur}
          onChange={(e) => setInfo({builderOffice: e.target.value})}
          className="h-9 min-w-[9rem] rounded-md border border-slate-300 px-2 text-sm text-slate-800"
          aria-label="施工業者"
          data-nav
        >
          {allChoices.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-slate-400">（営業所なし）</span> // 設定に営業所がなく、足してもいないとき（デモの初め）
      )}
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-600" data-builder-no>
        事業者番号
        <span className={`font-mono text-sm ${office?.jigyoshoNo ? 'text-slate-800' : 'text-slate-400'}`}>{office?.jigyoshoNo || '（なし）'}</span>
      </span>
      <Btn small color="white" onClick={() => setDraft(draft ? null : {...NO_BUILDER, company: s.company})}>
        ＋ 追加
      </Btn>
      {isAdded && (
        <Btn
          small
          color="white"
          onClick={() => {
            if (!confirm(`「${cur}」を施工業者の一覧から外しますか？`)) return;
            update('settings', (prev) => ({...prev, builders: (prev.builders ?? []).filter((x) => x.name !== cur)}));
            setInfo({builderOffice: ''});
          }}
        >
          一覧から外す
        </Btn>
      )}
      {draft && (
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 p-2" data-builder-add>
          <label className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-600">
            営業所名
            <TextInput ref={nameRef} value={draft.name} onChange={(name) => setDraft({...draft, name})} className="w-40" placeholder="○○営業所" aria-label="足す施工業者の営業所名" />
          </label>
          {field('jigyoshoNo', '事業者番号', 'w-40 font-mono', {inputMode: 'numeric', placeholder: '10けた'})}
          {field('company', '会社名', 'w-56')}
          {field('postal', '郵便番号', 'w-24', {placeholder: '800-0000'})}
          {field('address', '所在地', 'w-72')}
          {field('tel', '電話番号', 'w-36', {type: 'tel'})}
          {field('manager', '所長', 'w-32')}
          <Btn small color="softBlue" onClick={save}>
            追加する
          </Btn>
          <Btn small color="white" onClick={() => setDraft(null)}>
            やめる
          </Btn>
        </div>
      )}
    </>
  );
}

function WorksEditor({job, setJob, s, insurer, materials}: {job: Job; setJob: (fn: (j: Job) => Job) => void; s: Settings; insurer: Insurer; materials: Material[]}) {
  const photos = photoNumbers(job, s);
  // 申請書から見積書への連動（下の「見積書へ連動」。空なら連動する）。連動しないときは、申請書で入れたことを見積書の行に入れない（ユーザーの指示
  // 「申請書を入力したら、見積もりへ連動する機能もオン、オフ切り替えできるようにする」2026-11-11）。見積書から外した箇所（`offEstimate`）も入れない
  const linked = job.shinseiLink !== false;
  // 見積書にまだ何も入れていない箇所は、改修の種類・手すりの種類・高さ・ベースプレートに合わせて見積書の空きの行（手すり・ブラケット・施工費など）を作り直す（`withSlots`）。
  // flow＝見積書に入れる箇所か（連動していて、見積書から外していない）
  const setPlace = (id: string, fn: (p: Place, flow: boolean) => Place) =>
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => {
        if (p.id !== id) return p;
        const flow = j.shinseiLink !== false && !offEstimate(p);
        const next = fn(p, flow);
        return flow ? withSlots(next) : next;
      }),
    }));
  // 手すりの長さを入れたら、見積書のその箇所の手すり・ベースプレートの使う長さにもする（ユーザーの指示「どちらか一方を入力した際に、自動的に 1.2 の部分が入力される」。`cutLink.ts`）。
  // 中間のブラケット（BD-01G）の数も入れ直す（`withBrackets`）
  const setDim = (id: string, key: keyof PlaceDims, v: string) =>
    setPlace(id, (x, flow) => {
      const dims: PlaceDims = {...x.dims, [key]: v};
      if (!v.trim()) delete dims[key];
      const {dims: _old, ...rest} = x;
      const next: Place = Object.keys(dims).length ? {...rest, dims} : rest;
      // 手すり・ベースプレートの長さは、見積書の手すり・ベースプレートの使う長さにする（`placeFromDims`）
      return key === 'l' && flow ? withBrackets(x, placeFromDims(next), materials) : next;
    });
  // 長さの欄を消して空にした：見積書の手すりは打ち始めたときの長さ（start）に戻して、申請書の長さは空ける（＝見積書の長さを入れて見せる）。
  // 手で入れた長さ（「600×1800」）を消したときは、その長さに戻す（見積書の手すりは1行の 2400mm なので、空けると「2400」になって2本の区切りが消える）
  const clearLength = (id: string, start: string) =>
    setPlace(id, (x, flow) => {
      const back = flow && start.trim() ? placeFromDims({...x, dims: {...x.dims, l: start}}) : x;
      const {l: _l, ...dims} = back.dims ?? {};
      const {dims: _d, ...rest} = back;
      const next: Place = Object.keys(dims).length ? {...rest, dims} : rest;
      return flow ? withBrackets(x, next, materials) : next;
    });
  // ベースプレートの長さ（「＋ ベースプレート」）。見積書のベースプレートの使う長さにする（空にしても見積書のベースプレートは変えない。
  // 手すりの長さが変わってもベースプレートは変えない＝2026-11-04。`placeFromDims`）
  const setPlate = (id: string, v: string) =>
    setPlace(id, (x, flow) => {
      const {plateLength: _old, ...rest} = x;
      const next: Place = v.trim() ? {...rest, plateLength: v} : rest;
      return flow ? withBrackets(x, placeFromDims(next), materials) : next;
    });
  /**
   * 「＋ ベースプレート」：ベースプレートの長さの欄を開く（ユーザーの指示「ベースプレートをいれる場合は、追加ボタンを押して、長さの欄にベースプレートの正確な長さをいれる、
   * 入れたら、自動的に見積もりの方でも長さを汲み取り、見積金額に反映する」2026-11-02）。そのほかに「ベースプレート　1300mm」と打ってあれば、その長さを移す
   */
  const openPlate = (p: Place) => {
    const moved = plateFromText(p.shinseiText);
    if (moved)
      setPlace(p.id, (x, flow) => {
        const {shinseiText: _t, ...rest} = x;
        const next: Place = {...rest, ...(moved.rest ? {shinseiText: moved.rest} : {}), plateLength: moved.bp};
        return flow ? withBrackets(x, placeFromDims(next), materials) : next;
      });
    // そのほかが空になったら、そのほかの欄は閉じる
    if (moved && !moved.rest)
      setOpenKeys((o) => {
        const next = new Set(o);
        next.delete(`${p.id}:other`);
        return next;
      });
    // 見積書にベースプレートの長さが入っていれば、それを入れて開く（薄い字ではなく。ユーザーの指示「…手すりやベースプレートの長さから逆算して…入力する」2026-11-03）
    if (!moved && !p.plateLength?.trim() && estimatePlateLength(p)) setPlate(p.id, estimatePlateLength(p));
    openField(`${p.id}:bp`);
  };
  // 見積書に箇所が出るように、空きの行を入れておく（木手すりなら 手すり・ブラケット・施工費。見積書でその行を選んで部材・施工費を入れていける。`withSlots`）。
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
  // 連動しないときは、見積書から外した箇所として足す（申請書だけ。箇所の「見積書に入れる」で見積書にも出る）
  const add = (name: string) => {
    const place = linked ? withSlots(newPlace(name)) : {...newPlace(name), estimateOff: true};
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
  // 写真・撮影日・寸法・手で直した文などの入った箇所は、消す前に聞く（一度押しただけで写真ごと消えて、元に戻せなかった）。
  // 見積書に行のある箇所も、ここから消せる（見積書のその箇所の行も消える。前は見積書で消すしかなく、長さを入れると ✕ が消えた。
  // ユーザーの指摘「一度箇所を入力したら、削除ボタンがない」2026-11-05）
  // 見積書から外した箇所（見積書で最後の行を消した・連動しないで足した）を見積書に戻す：空きの行を作る（見積書でその行に部材・施工費を入れる）
  const toEstimate = (id: string) =>
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => {
        if (p.id !== id) return p;
        const {estimateOff: _off, ...rest} = p;
        return withSlots(rest);
      }),
    }));
  const remove = (p: Place) => {
    const has = [
      p.rows.some((r) => !isBlankRow(r)) ? '見積書の行' : '',
      p.photos?.before || p.photos?.after ? '写真' : '',
      p.photoDates?.before || p.photoDates?.after ? '撮影日' : '',
      Object.values(p.dims ?? {}).some((v) => v?.trim()) || p.plateLength?.trim() ? '寸法' : '',
      p.shinseiText?.trim() ? 'そのほか' : '',
      p.photoNote?.trim() ? '写真に書く内容' : '',
    ].filter(Boolean);
    if (has.length && !confirm(`「${p.name.trim() || '箇所'}」と、その${has.join('・')}を消します。元に戻せません。よろしいですか？`)) return;
    setJob((j) => ({...j, places: j.places.filter((x) => x.id !== p.id)}));
  };
  return (
    <div className="w-full space-y-2">
      {job.places.length > 0 && (
        <div ref={list} className="@container text-sm" role="list" aria-label="改修の箇所">
          {job.places.map((p) => {
            const n = photos.get(p.id);
            const used = p.rows.some((r) => !isBlankRow(r)); // 見積書に行のある箇所は、見積書で消す
            const dim = (key: keyof PlaceDims, text: string, o: {wide?: boolean; placeholder?: string; optional?: boolean; missing?: boolean; autoFocus?: boolean} = {}) => (
              <Dim label={text} value={p.dims?.[key] ?? ''} placeholder={o.placeholder ?? ''} wide={o.wide ?? false} optional={o.optional} missing={o.missing} autoFocus={o.autoFocus} onChange={(v) => setDim(p.id, key, v)} />
            );
            const showOther = openKeys.has(`${p.id}:other`) || !!p.shinseiText?.trim();
            const showHeight = openKeys.has(`${p.id}:h`) || !!p.dims?.h?.trim();
            const showPlate = openKeys.has(`${p.id}:bp`) || !!p.plateLength?.trim();
            return (
              <div key={p.id} data-place={p.id} role="listitem" aria-label={`${n ? circled(n) : ''}${p.name || '改修場所'}`} className="border-t border-slate-100 py-2 first:border-t-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-7 text-center text-base">{n ? circled(n) : '—'}</span>
                  {/* 改修場所は行の残りいっぱい（前は w-28 で「玄関から廊下に…」「洗面所兼脱衣所」が切れていた。2026-10-26 のデバッグ）。
                      右の ▼ で「＋ 箇所を足す」と同じ一覧から選び直せる（ユーザーの指摘「一度 例 寝室など入力したら、再度選択し直すことができない」2026-11-05）。打って直すこともできる */}
                  <span className="flex min-w-[7rem] flex-1 items-center">
                    <TextInput value={p.name} onChange={(name) => setPlace(p.id, (x) => ({...x, name}))} placeholder="改修場所" className="min-w-0 flex-1 rounded-r-none" aria-label="改修場所" data-nav />
                    <select
                      value=""
                      onChange={(e) => {
                        const name = e.target.value;
                        if (name) setPlace(p.id, (x) => ({...x, name}));
                      }}
                      className="h-9 w-9 shrink-0 cursor-pointer appearance-none rounded-r-md border border-l-0 border-slate-300 bg-slate-50 text-center text-sm text-slate-600 hover:bg-emerald-50"
                      aria-label={`${p.name.trim() || '改修場所'}を一覧から選び直す`}
                      title="一覧から選び直す"
                    >
                      <option value="" disabled>
                        ▼
                      </option>
                      {s.placePresets.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </span>
                  {/* 欄がせまいとき（スマホ・パソコンの申請書の左の欄。欄の幅で決める＝@container）は、改修の種類は2段目（改修場所と削除を1段目に。
                      前は ✕ が次の行の左はしに落ちて見えなかった） */}
                  <select value={p.kind} onChange={(e) => setPlace(p.id, (x) => ({...x, kind: Number(e.target.value)}))} className="h-9 w-40 rounded-md border border-slate-300 px-1 text-sm @max-md:order-last @max-md:ml-9 @max-md:w-auto @max-md:flex-1" aria-label="改修の種類" data-nav>
                    {KINDS.map((k, i) => (
                      <option key={k} value={i + 1}>
                        {circled(i + 1)} {k}
                      </option>
                    ))}
                  </select>
                  {!DEMO && offEstimate(p) && (
                    <button
                      type="button"
                      onClick={() => toEstimate(p.id)}
                      className="h-9 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
                      aria-label={`${p.name || '箇所'}を見積書に入れる`}
                    >
                      見積書に入れる
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    className="h-9 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`${p.name || '箇所'}を消す`}
                    title={used && !DEMO ? '箇所を消す（見積書のその箇所の行も消えます）' : '箇所を消す'}
                  >
                    削除
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-9">
                  {p.kind === 1 && (
                    <>
                      {/* 手すりの種類の選ぶ欄は外した（ユーザーの指示「ここの木手すりの選択は不要」2026-11-03）。見積書の空きの行は、屋外で高さを入れたら支柱・手すり・ブラケット・施工費、
                          ほかは手すり・ブラケット・施工費（`railType`。既製品（TOTO など）は見積書で行を直す） */}
                      {/* 手すりの長さは必須（入っていなければ薄い黄色）、高さは任意で ＋ を押すと開いて入れる
                          （ユーザーの指示「手すりの取り付けの高さが任意、長さは必須。手すりの取り付けの高さも、プラスで開いてから入力できるようにする。（任意）」2026-10-26）。
                          長さを空けてあるときは、見積書の手すり（なければベースプレート）の使う長さを、薄い字ではなくふつうの字で入れて見せる（`autoLength`。
                          ユーザーの指示「何も入力していなくてもうっすら表示される。（入力したら手すりやベースプレートの長さから逆算して、申請書の長さを入力する）」2026-11-03）。
                          見積書の長さが変われば、ここも変わる。手で別の長さを打てば、その長さ（見積書の手すりもその長さになる。`placeFromDims`） */}
                      <Dim
                        label="長さ"
                        value={p.dims?.l ?? ''}
                        auto={autoLength(p)}
                        placeholder=""
                        wide
                        missing={!p.dims?.l?.trim() && !autoLength(p)}
                        onClear={(start, manual) => (manual ? setDim(p.id, 'l', start) : clearLength(p.id, start))}
                        onChange={(v) => setDim(p.id, 'l', v)}
                      />
                      {/* ベースプレートの長さ（入れると見積書のベースプレートの長さ・金額に。空なら手すりと同じ長さ）。薄い字は見積書のいまの長さ。
                          長さのすぐ横（ユーザーの指示「長さの横はベースプレートを持ってくる」2026-11-03。前は高さのうしろ） */}
                      {showPlate ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Dim
                            label="ベースプレート"
                            value={p.plateLength ?? ''}
                            placeholder=""
                            wide
                            autoFocus={opened === `${p.id}:bp`}
                            onChange={(v) => setPlate(p.id, v)}
                          />
                          <button
                            type="button"
                            onClick={() => closeField(`${p.id}:bp`, 'ベースプレート', p.plateLength ?? '', () => setPlate(p.id, ''))}
                            className={closeBtn}
                            aria-label="ベースプレートを閉じる"
                            title="ベースプレートを閉じる（入れた長さは消えます）"
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => openPlate(p)} className={plusBtn}>
                          ＋ ベースプレート
                        </button>
                      )}
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
          プルダウン形式にしてください」2026-10-26）。選ぶと足して、その箇所の長さの欄へ（「そのほか」は改修場所の名前の欄へ）。
          箇所がないと見積書・申請書ができないので目立たせる（ユーザーの指示「箇所を足すっていう部分…少し目立たせるようにしてください」2026-11-05）：
          薄い緑の地・緑の太い枠・大きめの字。まだ箇所がないときは、まわりに薄い緑の輪も付ける */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) add(v === OTHER_PLACE ? '' : v);
          }}
          aria-label="箇所を足す"
          data-empty={job.places.length === 0 ? '' : undefined}
          className={`h-12 w-full max-w-sm rounded-lg border-2 border-emerald-600 bg-emerald-50 px-4 text-base font-bold text-emerald-800 shadow-sm hover:bg-emerald-100 focus:outline-none focus:ring-4 focus:ring-emerald-200 ${job.places.length === 0 ? 'ring-4 ring-emerald-200' : ''}`}
        >
          <option value="">＋ 箇所を足す</option>
          {s.placePresets.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={OTHER_PLACE}>そのほか（名前を打つ）</option>
        </select>
        {/* 申請書から見積書への連動のオン・オフ（ユーザーの指示 2026-11-11。初めはオン。様邸ごと。複製では引き継ぐ）。（株）イヤーズ デモアプリは見積書がないので出さない */}
        {!DEMO && (
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={linked} onChange={(e) => setJob((j) => ({...j, shinseiLink: e.target.checked ? undefined : false}))} />
            見積書へ連動
          </label>
        )}
      </div>
    </div>
  );
}
