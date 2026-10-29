// 写真貼付用紙の写真（ユーザーの指示「撮ってきた画像を、ドラッグ＆ドロップで貼り付けたり、添付して貼り付けたり」
// 「写真番号の1番と2番の入れ替えなど、編集もしやすく」）。
// 写真番号（見積書の箇所の順番。申請書の改修の内容と同じ）ごとに 改修前・改修後 の枠を並べる。枠に写真のファイルをドロップするか、枠を押して選ぶ。
// 何枚かまとめて選ぶ（ドロップする）と、①から順に改修前の空いた枠に入る。2枚より多いときは、写真を押した順に 1枚目・2枚目… の枠に貼る
// （PhotoOrderDialog。ユーザーの指示「5つセットしたら、その5つのチェックした順番に、1枚目…5枚目に一度にいっぺんに写真が貼り付けられる」2026-10-29。
// ファイルを選ぶ画面で選んだ順は、パソコンによって守られない）。
// 写真の入れ替え：写真を押して選んでから入れ替えたい枠を押す（空いた枠なら移す）。差し替え・削除もできる。
// 写真は縮めてこの端末に保存し（photos.ts）、申請書の Excel の写真貼付用紙（写真番号の用紙）に貼る。
// 撮影日（申請書の一覧の「改修前日付・改修後日付」。苅田町・みやこ町の写真の用紙の「撮影日」）：写真を入れると、写真の撮影日時（Exif）、
// なければ写真に写っている日付（日付入り写真。stampDate.ts）にする（ユーザーの指示「日付入り写真を添付した場合は、その日付に合わせて自動入力」2026-10-22）。
// その日付は、同じ改修前・改修後で写真のまだない枠にも入る。日付のない写真の枠・写真のない枠は、写真番号の順で最初の日付、それもなければ
// 改修前は当日・改修後は空（shinsei.ts の photoDay）。枠の下の「改修前撮影日」「改修後撮影日」・一覧の欄で直すと、すべての写真の同じ撮影日が同じ日になる
// （ユーザーの指示「撮影前、一つ入力したら全ての写真で全部入力。撮影後も同様」）。入れ替えると写真と一緒に動く
// PDF（スキャンした写真など）を入れると、ページごとに写真にする（ユーザーの指示「PDFファイルをドラッグ＆ドロップでそのまま添付できるようにする」）
// 写真番号の入れ替え（ユーザーの指示「①勝手口・②浴室を、押したりドラッグで横にずらしたりして、①浴室・②勝手口に簡単に入れ替える」）：
// 箇所をつかんで（見出しでも写真の上でも）ほかの箇所に重ねて離すか（ユーザーの指示「クリックしてそのままドロップしたら入れ替え」）、◀ ▶ で隣と入れ替える
// （写真・撮影日・向きは箇所と一緒に動く）。指（iPad）でも動くようにポインターで動かす
// 向き（ユーザーの指示「写真の方向転換」「iPad でもくるっとすぐに回転」）：写真の右上の ↻ で右に 90°。大きさと細かい向きはプレビューの写真で直す
// 書き込み（ユーザーの指示「申請書の写真に書き込んで、手すりの位置や踏み台の位置など…徹底的にExcelに似せて」2026-10-27）：写真の右上の ✏️ で、
// Excel と同じ操作の書き込みの画面（PhotoMarkEditor.tsx）。書き込みは写真と一緒に動き（入れ替え・90°回す）、写真を差し替える・消すと消える
// ドロップ・貼り付けが分かるように（ユーザーの指示「完了写真もドラッグ＆ドロップや貼付けしやすいようにする…認識しやすいように、見やすいように」2026-10-23）：
// 空いた枠に「ドロップ・Ctrl+V」、ファイルを画面に持ってくると枠がみな薄い緑、重ねた枠は「ここに離す」。Ctrl+V は選んでいる枠（押した・Tab で移った枠、
// 箇所の中のボタンにいるときはその箇所の空いた枠）に貼る。枠を選んでいないときの Ctrl+V は、介護保険証の読み取り（CardReader.tsx）のまま

import {useEffect, useRef, useState} from 'react';
import type {DragEvent, PointerEvent as ReactPointerEvent} from 'react';
import type {EstimateRates} from '../calc.ts';
import {Btn, DropArea, DropOverlay, Modal, pastedFiles, useFileDragging, useToast} from '../components/ui.tsx';
import {circled, photoNumbers, swapPhotoNumbers} from '../estimateForms.ts';
import {cleanEdit, turn} from '../photoEdit.ts';
import {photoBounds, turnMarks} from '../photoMarks.ts';
import {photoTakenDate, preparePhoto, putPhoto, rememberPhotoUrl, usePhotoUrls} from '../photos.ts';
import {kindNamesOf, photoDay, photoPlacement, workText} from '../shinsei.ts';
import {readStampDate} from '../stampDate.ts';
import type {Job, PhotoEdit, PhotoMark, Place, PlacePhotoEdits, PlacePhotoMarks, PlacePhotos} from '../types.ts';
import {MarkLayer} from './MarkLayer.tsx';

export type PhotoSlot = 'before' | 'after';
export type PhotoKey = {placeId: string; slot: PhotoSlot};
export const SLOT_LABEL: Record<PhotoSlot, string> = {before: '改修前', after: '改修後'};
/** 指で写真の上を押したまま、この時間（ミリ秒）たってから動かすと箇所をつかむ（すぐに動かしたときは画面のスクロール） */
const HOLD_MS = 280;

type SlotFields = {photos: PlacePhotos; photoDates: PlacePhotos; photoEdits: PlacePhotoEdits; photoMarks: PlacePhotoMarks};

/** 改修前・改修後の1つを替える（空なら外す。どちらもなければ持たない。書き込みは1つもなければ空） */
function withSlot<F extends keyof SlotFields>(p: Place, field: F, slot: PhotoSlot, v: SlotFields[F][PhotoSlot] | undefined): Place {
  const next = {...p[field], [slot]: v} as SlotFields[F];
  if (!v || (Array.isArray(v) && v.length === 0)) delete next[slot];
  const out: Record<string, unknown> = {...p};
  if (next.before || next.after) out[field] = next;
  else delete out[field];
  return out as Place;
}

/** 枠の写真・撮影日・向きと大きさ・書き込みを替える */
const withPhoto = (p: Place, slot: PhotoSlot, id: string | undefined, date: string | undefined, edit: PhotoEdit | undefined, marks?: PhotoMark[]): Place =>
  withSlot(withSlot(withSlot(withSlot(p, 'photos', slot, id), 'photoDates', slot, date), 'photoEdits', slot, edit), 'photoMarks', slot, marks);

/** 写真の番号の箇所（写真番号の順）。写真番号のない箇所（見積書に出ない箇所）は入らない */
export function photoPlaces(job: Pick<Job, 'places'>, rates: EstimateRates): {place: Place; no: number}[] {
  const nos = photoNumbers(job, rates);
  return job.places
    .filter((p) => nos.has(p.id))
    .map((place) => ({place, no: nos.get(place.id) ?? 0}))
    .sort((a, b) => a.no - b.no);
}

/** 写真を入れる・入れ替える・消す（様邸の箇所の写真の番号を書きかえる） */
export function usePhotoActions(job: Job, setJob: (fn: (j: Job) => Job) => void, rates: EstimateRates) {
  const toast = useToast();
  const [busy, setBusy] = useState(0);
  // 何枚かまとめて入れるときの、貼る順番を選ぶ画面（PhotoOrderDialog）。選んだ順（写真の番号の並び）か、やめたら null を返す
  const [ordering, setOrdering] = useState<PhotoOrdering | null>(null);
  const chooseOrder = (images: {file: Blob; name: string}[], dests: string[]) =>
    new Promise<number[] | null>((resolve) => {
      const items = images.map((x) => ({url: URL.createObjectURL(x.file), name: x.name}));
      setOrdering({
        items,
        dests,
        done: (order) => {
          for (const x of items) URL.revokeObjectURL(x.url);
          setOrdering(null);
          resolve(order);
        },
      });
    });
  // 新しい写真は、向き・大きさをそのまま（0°・枠いっぱい）にする
  const setPhoto = (key: PhotoKey, id: string | undefined, date: string | undefined) =>
    setJob((j) => ({...j, places: j.places.map((p) => (p.id === key.placeId ? withPhoto(p, key.slot, id, date, undefined) : p))}));
  /** 撮影日を直す（空にもできる）：写真番号のある箇所すべての、同じ改修前・改修後の撮影日にする（1つ入れれば全部の写真に入る） */
  const setDate = (slot: PhotoSlot, date: string) =>
    setJob((j) => {
      const nos = photoNumbers(j, rates);
      return {...j, places: j.places.map((p) => (nos.has(p.id) ? withSlot(p, 'photoDates', slot, date || undefined) : p))};
    });
  /** 改修前の写真の横（上）に書く内容の追加を直す（空なら持たない） */
  const setNote = (placeId: string, note: string) =>
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => {
        if (p.id !== placeId) return p;
        const {photoNote: _old, ...rest} = p;
        return note ? {...rest, photoNote: note} : rest;
      }),
    }));
  /**
   * 写真の向き・大きさを直す（そのままに戻したら持たない）。size＝写真の画素の大きさ：90°の倍数で回したときは、書き込みも写真と一緒に回す（turnMarks）
   */
  const setEdit = (key: PhotoKey, edit: PhotoEdit | undefined, size?: {w: number; h: number}) =>
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => {
        if (p.id !== key.placeId) return p;
        const marks = p.photoMarks?.[key.slot];
        const out = withSlot(p, 'photoEdits', key.slot, cleanEdit(edit));
        return marks?.length && size ? withSlot(out, 'photoMarks', key.slot, turnMarks(marks, size, p.photoEdits?.[key.slot]?.rot ?? 0, edit?.rot ?? 0)) : out;
      }),
    }));
  /** 写真への書き込みを入れる（なければ持たない） */
  const setMarks = (key: PhotoKey, marks: PhotoMark[]) =>
    setJob((j) => ({...j, places: j.places.map((p) => (p.id === key.placeId ? withSlot(p, 'photoMarks', key.slot, marks.length ? marks : undefined) : p))}));
  /** 2つの箇所の写真番号を入れ替える（写真・撮影日・向きは箇所と一緒に動く） */
  const swapPlaces = (a: string, b: string) => setJob((j) => ({...j, places: swapPhotoNumbers(j.places, a, b)}));
  /**
   * 写真の日付（撮影日時・写っている日付）を入れる：その写真の枠と、同じ改修前・改修後で写真のまだない枠に。
   * 日付を読んでいる間に写真を差し替えた・消したとき、撮影日を手で入れたとき（写真を入れたときに、その枠の撮影日は空にしている）は入れない
   */
  const setPhotoDate = (id: string, slot: PhotoSlot, date: string) =>
    setJob((j) => {
      const target = j.places.find((p) => p.photos?.[slot] === id);
      if (!target || target.photoDates?.[slot]) return j;
      const nos = photoNumbers(j, rates);
      return {...j, places: j.places.map((p) => (p.id === target.id || (nos.has(p.id) && !p.photos?.[slot]) ? withSlot(p, 'photoDates', slot, date) : p))};
    });
  /**
   * 入れた写真を枠に置く：first は選んだ枠（start。写真があれば差し替え）、そのほかは start のあとの写真番号の空いた枠。
   * 枠はそのときの様邸で決める（前は写真を読み始めたときの様邸で決めていて、読んでいる間に別の写真を入れると同じ枠に重ねていた）
   */
  const placePhoto = (id: string, slot: PhotoSlot, start: PhotoKey | undefined, first: boolean) =>
    setJob((j) => {
      const list = photoPlaces(j, rates);
      const at = start ? list.findIndex((x) => x.place.id === start.placeId) : -1;
      const free = list.slice(at + 1).find(({place}) => !place.photos?.[slot]);
      const key = first && start && at >= 0 ? start : free ? {placeId: free.place.id, slot} : null;
      if (!key) return j;
      return {...j, places: j.places.map((p) => (p.id === key.placeId ? withPhoto(p, key.slot, id, undefined, undefined) : p))};
    });
  /** 写真のファイル（PDF はページごとに写真にする）を入れる：start の枠から（なければ①の改修前から）、改修前の空いた枠に順に */
  const put = async (files: File[], start?: PhotoKey) => {
    const chosen = files.filter(isPhotoFile);
    if (chosen.length === 0) {
      if (files.length) toast('写真（画像）か PDF のファイルを選んでください', 'error');
      return;
    }
    const images: {file: Blob; name: string}[] = [];
    setBusy((n) => n + 1);
    try {
      for (const f of chosen) {
        if (!isPdf(f)) {
          images.push({file: f, name: f.name});
          continue;
        }
        try {
          const {pdfToImages} = await import('../pdfText.ts');
          const pages = await pdfToImages(new Uint8Array(await f.arrayBuffer()));
          pages.forEach((file, i) => images.push({file, name: pages.length > 1 ? `${f.name}（${i + 1}ページ）` : f.name}));
        } catch {
          toast(`「${f.name}」を読めませんでした`, 'error');
        }
      }
    } finally {
      setBusy((n) => n - 1);
    }
    if (images.length === 0) return;
    // 入れる枠：選んだ枠と、そのあとの写真番号の同じ種類（改修前・改修後）の空いた枠（ここでは足りるかを見るだけ。置く枠は placePhoto で決める）
    const list = photoPlaces(job, rates);
    const slot = start?.slot ?? 'before';
    const from = start ? list.findIndex((x) => x.place.id === start.placeId) + 1 : 0;
    const room = (start ? 1 : 0) + list.slice(from).filter(({place}) => !place.photos?.[slot]).length;
    if (room === 0) {
      toast('写真を入れる空いた枠がありません（写真を押して差し替えます）', 'error');
      return;
    }
    // 2枚より多いときは、押した順に貼る（その順に、選んだ枠・そのあとの空いた枠へ）
    let ordered = images;
    if (images.length >= 2) {
      const targets = [...(start ? list.filter((x) => x.place.id === start.placeId) : []), ...list.slice(from).filter(({place}) => !place.photos?.[slot])];
      const order = await chooseOrder(
        images,
        targets.slice(0, room).map((x) => `${circled(x.no)}${x.place.name || '改修場所'} ${SLOT_LABEL[slot]}`),
      );
      if (!order?.length) return;
      ordered = order.map((i) => images[i]);
    }
    const used = ordered.slice(0, room);
    setBusy((n) => n + used.length);
    for (const [i, {file, name}] of used.entries()) {
      try {
        const [taken, {blob, w, h}] = await Promise.all([photoTakenDate(file), preparePhoto(file)]);
        const id = await putPhoto({blob, w, h});
        rememberPhotoUrl(id, blob, w, h);
        placePhoto(id, slot, start, i === 0);
        // 撮影日：写真の撮影日時、なければ写真に写っている日付（読むのに少しかかるので、写真を入れてから）。どちらもなければ入れない
        if (taken) setPhotoDate(id, slot, taken);
        else void readStampDate(blob).then((day) => day && setPhotoDate(id, slot, day));
      } catch {
        toast(`「${name}」を読めませんでした`, 'error');
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (ordered.length > used.length) toast(`写真番号の枠が足りないので、${ordered.length - used.length}枚は入れませんでした`, 'error');
  };
  /** 2つの枠の写真を入れ替える（片方が空なら移す）。撮影日・向きと大きさ・書き込みも一緒に */
  const swap = (a: PhotoKey, b: PhotoKey) =>
    setJob((j) => {
      // どちらかの箇所がもうない（選んだあとで箇所を消した）ときは何もしない（前は押した写真が消えていた）
      if (!j.places.some((x) => x.id === a.placeId) || !j.places.some((x) => x.id === b.placeId)) return j;
      const get = (k: PhotoKey) => {
        const p = j.places.find((x) => x.id === k.placeId);
        return [p?.photos?.[k.slot], p?.photoDates?.[k.slot], p?.photoEdits?.[k.slot], p?.photoMarks?.[k.slot]] as const;
      };
      const [[ia, da, ea, ma], [ib, db, eb, mb]] = [get(a), get(b)];
      let places = j.places.map((p) => (p.id === a.placeId ? withPhoto(p, a.slot, ib, db, eb, mb) : p));
      places = places.map((p) => (p.id === b.placeId ? withPhoto(p, b.slot, ia, da, ea, ma) : p));
      return {...j, places};
    });
  const remove = (key: PhotoKey) => setPhoto(key, undefined, undefined);
  /** 写真のファイルをドロップした：その枠から入れる */
  const drop = (e: DragEvent, target: PhotoKey) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length) void put([...e.dataTransfer.files], target);
  };
  return {put, swap, remove, drop, setDate, setNote, setEdit, setMarks, swapPlaces, busy, ordering};
}

/** 貼る順番を選ぶ画面に出すもの：写真（画面の URL・ファイルの名前）・入る枠の名前（1枚目から）・選び終わったとき */
export type PhotoOrdering = {items: {url: string; name: string}[]; dests: string[]; done: (order: number[] | null) => void};

/**
 * 何枚かまとめて入れた写真を、押した順に 1枚目・2枚目… の枠に貼る画面。押すと番号と入る枠が付き、もう一度押すと外す（うしろの番号はつめる）。
 * 「残りを今の順で」で、まだ押していない写真を並びの順に足す。貼るのは番号の付いた写真だけ
 */
export function PhotoOrderDialog({ordering}: {ordering: PhotoOrdering | null}) {
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [ordering]);
  if (!ordering) return null;
  const {items, dests, done} = ordering;
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const paste = () => picked.length && done(picked);
  return (
    <Modal
      title="📷 押した順に貼ります"
      wide
      onClose={() => done(null)}
      footer={
        <>
          <Btn color="white" onClick={() => done(null)}>
            キャンセル
          </Btn>
          <Btn color="white" disabled={picked.length === 0} onClick={() => setPicked([])}>
            選び直す
          </Btn>
          <Btn color="white" disabled={picked.length === items.length} onClick={() => setPicked((p) => [...p, ...items.map((_, i) => i).filter((i) => !p.includes(i))])}>
            残りを今の順で
          </Btn>
          <Btn color="softBlue" disabled={picked.length === 0} onClick={paste}>
            この順番で貼る（{picked.length}枚）
          </Btn>
        </>
      }
    >
      <div
        role="group"
        aria-label="貼る写真"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && picked.length && !(e.target instanceof HTMLButtonElement)) paste();
        }}
      >
        {items.map((x, i) => {
          const n = picked.indexOf(i);
          return (
            <button
              key={i}
              type="button"
              aria-pressed={n >= 0}
              aria-label={x.name}
              onClick={() => toggle(i)}
              className={`relative flex flex-col overflow-hidden rounded-lg border-2 bg-white text-left ${n >= 0 ? 'border-sky-600 ring-2 ring-sky-200' : 'border-slate-200 hover:border-sky-400'}`}
            >
              <span className="block aspect-[4/3] overflow-hidden bg-slate-100">
                <img src={x.url} alt="" className="block h-full w-full object-contain" />
              </span>
              {n >= 0 && (
                <span className="absolute left-1.5 top-1.5 flex h-9 min-w-9 items-center justify-center rounded-full bg-sky-600 px-2 text-lg text-white shadow" data-order={n + 1}>
                  {n + 1}
                </span>
              )}
              <span className="truncate px-2 pt-1 text-xs text-slate-500">{x.name}</span>
              <span className={`px-2 pb-1.5 text-sm ${n >= 0 ? (n < dests.length ? 'text-sky-800' : 'text-amber-700') : 'text-slate-400'}`}>
                {n < 0 ? '　' : n < dests.length ? `→ ${dests[n]}` : '→ 入る枠がありません'}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/** 写真（画像）か PDF のファイルか（写真の枠・平面図の枠に入れられるもの） */
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isPhotoFile = (f: File) => isPdf(f) || f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name);

/**
 * 平面図の図を入れる・消す（ユーザーの指示「平面図に画像をドロップ・貼り付け」2026-10-25）。写真と同じく縮めた JPEG をこの端末に入れ（photos.ts）、
 * 様邸には番号だけ（Job.planPhoto）。PDF は1ページ目を図にする。入れると前の図と差し替え（前の図は、使われなくなった写真と同じく prunePhotos があとで消す）
 */
export function usePlanActions(setJob: (fn: (j: Job) => Job) => void) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const put = async (files: File[]) => {
    const file = files.find(isPhotoFile);
    if (!file) {
      if (files.length) toast('写真（画像）か PDF のファイルを選んでください', 'error');
      return;
    }
    setBusy(true);
    try {
      let src: Blob = file;
      if (isPdf(file)) {
        const {pdfToImages} = await import('../pdfText.ts');
        const [first] = await pdfToImages(new Uint8Array(await file.arrayBuffer()), 1600, 1);
        if (!first) throw new Error('PDF のページがありません');
        src = first;
      }
      const {blob, w, h} = await preparePhoto(src);
      const id = await putPhoto({blob, w, h});
      rememberPhotoUrl(id, blob, w, h);
      setJob(({planMarks: _marks, ...j}) => ({...j, planPhoto: id})); // 差し替えたら前の図への書き込みは消す（写真と同じ）
    } catch {
      toast(`「${file.name}」を読めませんでした`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = () => setJob(({planPhoto: _old, planMarks: _marks, ...j}) => j);
  // 図への書き込み（PhotoMarkEditor.tsx）。書き込みがなくなったら持たない
  const setMarks = (marks: PhotoMark[]) => setJob(({planMarks: _old, ...j}) => (marks.length ? {...j, planMarks: marks} : j));
  return {put, remove, setMarks, busy};
}

/** ドラッグしているものが写真のファイルか */
const draggable = (e: DragEvent) => [...e.dataTransfer.types].includes('Files');

export type PhotoActions = ReturnType<typeof usePhotoActions>;

/**
 * 写真の欄の枠の中の写真：写真貼付用紙と同じく、向き・大きさを直した形で（枠は 4:3。％で置く）。書き込みも重ねる
 * （paper＝写真貼付用紙の上の写真の大きさ（画素）。線の太さ・文字の大きさを、申請書と同じ割合に縮めて描く）
 */
function Thumb({url, w, h, edit, marks, paper}: {url: string; w: number; h: number; edit?: PhotoEdit; marks?: PhotoMark[]; paper?: {w: number; h: number} | null}) {
  const b = photoPlacement({x: 0, y: 0, w: 400, h: 300}, w, h, edit, 0);
  const vb = photoBounds(b);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !marks?.length) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [marks?.length]);
  // 写真貼付用紙の大きさが分からないとき（原本にその写真番号の用紙がない）は、幅 500 画素ほどの写真として描く
  const real = paper ?? {w: 500, h: (500 * vb.h) / (vb.w || 1)};
  const k = (vb.w * (width / 400)) / (real.w || 1);
  return (
    <>
      <img
        src={url}
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{left: `${b.x / 4}%`, top: `${b.y / 3}%`, width: `${b.w / 4}%`, height: `${b.h / 3}%`, transform: b.rot ? `rotate(${b.rot}deg)` : undefined, WebkitTouchCallout: 'none'}}
      />
      {marks?.length ? (
        <div ref={ref} className="pointer-events-none absolute inset-0">
          {width > 0 && <MarkLayer marks={marks} w={real.w} h={real.h} k={k} style={{left: (vb.x / 400) * width, top: (vb.y / 400) * width}} />}
        </div>
      ) : null}
    </>
  );
}

export function PhotoBoard({
  job,
  rates,
  sheetNos,
  dates,
  actions,
  onPick,
  onMark,
  paperSize,
}: {
  job: Job;
  rates: EstimateRates;
  sheetNos: Set<number> | null; // 原本に写真の用紙のある写真番号（読むまでは null）
  dates: boolean; // 写真の用紙に撮影日の欄がある（苅田町）：枠の下に撮影日の欄を出す
  actions: PhotoActions;
  onPick: (key?: PhotoKey) => void; // 写真のファイルを選ぶ（枠を決めるときは key）
  onMark?: (key: PhotoKey) => void; // 写真に書き込む（PhotoMarkEditor.tsx）
  paperSize?: (key: PhotoKey) => {w: number; h: number} | null; // 写真貼付用紙の上の写真の大きさ（書き込みを同じ割合で描く）
}) {
  const list = photoPlaces(job, rates);
  const urls = usePhotoUrls(list.flatMap(({place}) => [place.photos?.before ?? '', place.photos?.after ?? '']));
  const [selectedKey, setSelected] = useState<PhotoKey | null>(null);
  // 選んだ写真の箇所がなくなった（申請書の一覧で消した）ら、選んでいないことにする（そのまま別の写真を押すと、入れ替えで押した写真が消えていた）
  const selected = selectedKey && list.some((x) => x.place.id === selectedKey.placeId) ? selectedKey : null;
  const [over, setOver] = useState<string>(''); // 写真のファイルをドラッグして重ねている枠
  // 箇所をつかんでいるとき：動かしている箇所・ずらした量・重ねている箇所
  const [cardDrag, setCardDrag] = useState<{id: string; dx: number; dy: number; over: string | null} | null>(null);
  const holding = useRef(false); // 箇所をつかんでいる（指で動かしても画面をスクロールしない）
  const swallowClick = useRef(false); // 動かし終わったときの click（離した所の写真を選ぶ）を捨てる
  const sectionRef = useRef<HTMLElement>(null);
  const fileDrag = useFileDragging(); // ファイルを画面の上でドラッグしている：枠をみな薄い緑に
  useEffect(() => {
    if (!fileDrag) setOver(''); // 枠の外で離した・やめたとき
  }, [fileDrag]);
  const lastSheet = sheetNos && sheetNos.size ? Math.max(...sheetNos) : 0;
  const same = (a: PhotoKey | null, b: PhotoKey) => !!a && a.placeId === b.placeId && a.slot === b.slot;
  const pick = onPick;
  const press = (key: PhotoKey, filled: boolean) => {
    if (selected && !same(selected, key)) {
      actions.swap(selected, key);
      setSelected(null);
    } else if (same(selected, key)) setSelected(null);
    else if (filled) setSelected(key);
    else pick(key);
  };
  const selPlace = selected ? list.find((x) => x.place.id === selected.placeId) : undefined;
  const swapPlaces = (a: string, b: string) => {
    actions.swapPlaces(a, b);
    setSelected(null);
  };

  // Ctrl+V：選んでいる枠に写真を貼る（字を打つ欄・ほかの画面が開いているときは、ふつうの貼り付け）。
  // 写真の欄の中で枠を選んでいないときは何もしない（介護保険証の読み取りへ）。ほかの貼り付けより先に受ける（capture）
  const pasteTo = useRef<() => {start?: PhotoKey} | null>(() => null);
  pasteTo.current = () => {
    const active = document.activeElement instanceof HTMLElement && sectionRef.current?.contains(document.activeElement) ? document.activeElement : null;
    const slotKey = active?.closest<HTMLElement>('[data-photo-slot]')?.dataset.photoSlot;
    if (slotKey) {
      const at = slotKey.lastIndexOf(':');
      return {start: {placeId: slotKey.slice(0, at), slot: slotKey.slice(at + 1) as PhotoSlot}};
    }
    if (selected) return {start: selected};
    if (active?.closest('[data-photo-pick]')) return {}; // 「📷 写真を選ぶ」：①から改修前の空いた枠に
    const cardId = active?.closest<HTMLElement>('[data-photo-card]')?.dataset.photoCard;
    const place = cardId ? list.find((x) => x.place.id === cardId)?.place : undefined;
    const slot = place ? (['before', 'after'] as const).find((x) => !place.photos?.[x]) : undefined;
    return place && slot ? {start: {placeId: place.id, slot}} : null;
  };
  // 写真を選んでいるときの Backspace・Delete：その写真を削除（確かめてから。ユーザーの指示「キーボードのbackボタンで写真を削除できるようにする」2026-10-29）
  const removeSelected = useRef<() => void>(() => {});
  removeSelected.current = () => {
    if (!selected || !window.confirm('選んでいる写真を削除しますか？')) return;
    actions.remove(selected);
    setSelected(null);
  };
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'Backspace' && e.key !== 'Delete') || e.defaultPrevented) return; // プレビューの写真を消したとき（ShinseiPreview.tsx）は消さない
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      removeSelected.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);
  const putLatest = useRef(actions.put);
  putLatest.current = actions.put;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (document.querySelector('[role="dialog"]')) return;
      // 平面図の枠を選んでいるときは平面図へ（ShinseiPreview.tsx の PlanSlotView。写真の欄で写真を選んだままでも）
      if (document.activeElement?.closest('[data-plan-slot]')) return;
      const to = pasteTo.current();
      if (!to) return;
      const files = pastedFiles(e.clipboardData, (f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.(jpe?g|png|gif|webp|heic|heif|pdf)$/i.test(f.name));
      if (files.length === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setSelected(null);
      void putLatest.current(files, to.start);
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, []);

  // 指で箇所をつかんでいるあいだは画面をスクロールさせない（touchmove を止める。iPad の Safari でも効くように、はじめから passive でない形で付けておく）
  useEffect(() => {
    const el = sectionRef.current;
    const still = (e: TouchEvent) => {
      if (holding.current && e.cancelable) e.preventDefault();
    };
    el?.addEventListener('touchmove', still, {passive: false});
    return () => el?.removeEventListener('touchmove', still);
  }, []);

  /**
   * 箇所をつかんで（見出しでも写真の上でも）ほかの箇所に重ねて離すと、写真番号を入れ替える（ユーザーの指示「クリックしてそのままドロップしたら入れ替え」）。
   * マウスは押したまま動かすとすぐ。指は見出しならすぐ、写真の上は少し押したままにしてから（すぐに動かしたときは画面のスクロール）。
   * ↻ ◀ ▶・撮影日の欄（data-no-drag）からはつかまない。画面の上下の端に近づけると、ゆっくりスクロールする（遠くの箇所にも届くように）。
   * 動かさずに離したときは、ふつうに押したのと同じ（写真を選ぶ）
   */
  const startCardDrag = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary || holding.current) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-no-drag]')) return;
    const pid = e.pointerId;
    const [x0, y0, sy0] = [e.clientX, e.clientY, window.scrollY];
    let last = {x: x0, y: y0};
    // wait＝指で写真の上を押したところ（押したままになるのを待つ）、ready＝つかんだ（動かすとドラッグ）、drag＝動かしている
    let phase: 'wait' | 'ready' | 'drag' = e.pointerType !== 'mouse' && !t.closest('[data-drag-handle]') ? 'wait' : 'ready';
    let timer = 0;
    let frame = 0;
    const targetAt = (x: number, y: number) => {
      for (const node of document.elementsFromPoint(x, y)) {
        const card = node instanceof HTMLElement ? node.closest<HTMLElement>('[data-photo-card]') : null;
        if (card && card.dataset.photoCard !== id) return card.dataset.photoCard ?? null;
      }
      return null;
    };
    const show = () => setCardDrag({id, dx: last.x - x0, dy: last.y - y0 + window.scrollY - sy0, over: phase === 'drag' ? targetAt(last.x, last.y) : null});
    // 画面の上下の端から 48px 以内に入れると、端に近いほど速く（1こまで最大 10px）
    const edgeScroll = () => {
      const edge = 48;
      const v = last.y < edge ? -((edge - last.y) / edge) * 10 : last.y > window.innerHeight - edge ? ((last.y - (window.innerHeight - edge)) / edge) * 10 : 0;
      if (v) {
        window.scrollBy(0, v);
        show();
      }
      frame = requestAnimationFrame(edgeScroll);
    };
    const end = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      holding.current = false;
      setCardDrag(null);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      last = {x: ev.clientX, y: ev.clientY};
      const far = Math.hypot(last.x - x0, last.y - y0);
      if (phase === 'wait') {
        if (far > 8) end(); // すぐに動かした：画面のスクロール
        return;
      }
      if (phase === 'ready') {
        if (far < 6) return;
        phase = 'drag';
        frame = requestAnimationFrame(edgeScroll);
      }
      show();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      const target = phase === 'drag' && ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
      if (phase === 'drag') {
        // マウスを離したときの click は、このすぐあとに続けて来る
        swallowClick.current = true;
        window.setTimeout(() => (swallowClick.current = false), 0);
      }
      end();
      if (target) swapPlaces(id, target);
    };
    holding.current = phase !== 'wait';
    if (phase === 'wait')
      timer = window.setTimeout(() => {
        phase = 'ready';
        holding.current = true;
        show(); // つかんだ（少し浮かせて見せる）
      }, HOLD_MS);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <section
      ref={sectionRef}
      aria-label="写真"
      data-photo-board
      className="scroll-mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      onClickCapture={(e) => {
        if (swallowClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onContextMenu={(e) => {
        if (holding.current) e.preventDefault(); // 指で押したままのとき、写真の保存などのメニューを出さない
      }}
      onDragOver={(e) => {
        if (draggable(e)) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void actions.put([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-700">📷 写真</h2>
        <DropArea name="📷 写真を選ぶ" label="📷 写真を選ぶ" data-photo-pick onPick={() => pick()} onFiles={(files) => void actions.put(files)} disabled={list.length === 0} className="disabled:opacity-50" />
        {actions.busy > 0 && (
          <span role="status" className="text-xs text-slate-500">
            写真を入れています…
          </span>
        )}
        {list.length === 0 && <span className="text-xs text-slate-500">改修の箇所を入れると、写真を貼れます</span>}
      </div>
      {selected && selPlace && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-sky-50 px-3 py-1.5 text-sm text-sky-900" role="status" aria-label="選んでいる写真">
          <span>
            {circled(selPlace.no)}
            {selPlace.place.name}の{SLOT_LABEL[selected.slot]}
            ：入れ替える枠を押してください
          </span>
          <Btn small color="white" className="touch:min-h-11 touch:px-4 touch:text-sm" onClick={() => pick(selected)}>
            差し替え
          </Btn>
          <Btn
            small
            color="white"
            className="touch:min-h-11 touch:px-4 touch:text-sm"
            onClick={() => {
              actions.remove(selected);
              setSelected(null);
            }}
          >
            削除
          </Btn>
          <Btn small color="white" className="touch:min-h-11 touch:px-4 touch:text-sm" onClick={() => setSelected(null)}>
            やめる
          </Btn>
        </div>
      )}
      {list.length > 0 && (
        // 枠はユーザーの指示「気持ちだけ大きく」で少し大きく：パソコンの一覧の幅では、前は1段に箇所を2つ（枠の幅 約7.4rem）、
        // いまは1段に1つで見出しを左に（枠の幅 約11rem）。箇所の幅（@container）が 28rem より狭いときは見出しを上に
        <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(22rem,100%),1fr))]">
          {list.map(({place, no}, i) => {
            const dragging = cardDrag?.id === place.id;
            const target = cardDrag?.over === place.id;
            const prev = list[i - 1];
            const next = list[i + 1];
            return (
              <div
                key={place.id}
                role="group"
                aria-label={`${circled(no)}${place.name}の写真`}
                data-photo-card={place.id}
                onPointerDown={(e) => startCardDrag(e, place.id)}
                className={`@container relative select-none rounded-lg border p-2 ${target ? 'border-emerald-500 ring-4 ring-emerald-500/60' : 'border-slate-200'} ${dragging ? 'z-30 bg-white opacity-90 shadow-xl' : ''}`}
                style={dragging && cardDrag ? {transform: `translate(${cardDrag.dx}px, ${cardDrag.dy}px)`, pointerEvents: 'none', WebkitTouchCallout: 'none'} : {WebkitTouchCallout: 'none'}}
              >
                <div className="flex flex-col gap-1 @md:flex-row @md:items-start @md:gap-2">
                  <div className="flex items-center gap-1 @md:w-28 @md:shrink-0 @md:flex-col @md:items-start @md:gap-1.5">
                    {/* 見出し：指でもすぐにつかめる（指で動かしてもページが動かないように touch-none） */}
                    <div
                      data-drag-handle
                      className="flex min-w-0 flex-1 cursor-grab touch-none flex-wrap items-baseline gap-x-1.5 text-sm active:cursor-grabbing @md:w-full @md:flex-none @md:py-1"
                      title="ドラッグしてほかの写真番号と入れ替え"
                    >
                      <span aria-hidden className="text-slate-400">
                        ⠿
                      </span>
                      <b className="min-w-0 flex-1 truncate text-slate-800">
                        {circled(no)} {place.name || '（改修場所）'}
                      </b>
                      {sheetNos && !sheetNos.has(no) && (
                        <span className="text-[11px] text-amber-700 @md:basis-full">{lastSheet ? `Excel の写真の用紙は${circled(lastSheet)}まで` : 'Excel に写真の用紙なし'}</span>
                      )}
                    </div>
                    <div data-no-drag className="flex shrink-0 gap-1">
                      {/* 隣の写真番号と入れ替える（押すだけ。iPad でも） */}
                      <button
                        type="button"
                        disabled={!prev}
                        onClick={() => prev && swapPlaces(place.id, prev.place.id)}
                        className="h-8 w-8 shrink-0 touch-manipulation rounded-md border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 touch:h-10 touch:w-10 touch:text-base"
                        title="前の写真番号と入れ替え"
                        aria-label={prev ? `${circled(no)}${place.name}と${circled(prev.no)}${prev.place.name}を入れ替える` : '前の写真番号なし'}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        disabled={!next}
                        onClick={() => next && swapPlaces(place.id, next.place.id)}
                        className="h-8 w-8 shrink-0 touch-manipulation rounded-md border border-slate-300 bg-white text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-30 touch:h-10 touch:w-10 touch:text-base"
                        title="次の写真番号と入れ替え"
                        aria-label={next ? `${circled(no)}${place.name}と${circled(next.no)}${next.place.name}を入れ替える` : '次の写真番号なし'}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="grid min-w-0 grid-cols-2 gap-1.5">
                      {(['before', 'after'] as const).map((slot) => {
                        const key = {placeId: place.id, slot};
                        const id = place.photos?.[slot];
                        const photo = id ? urls[id] : undefined;
                        const edit = place.photoEdits?.[slot];
                        const k = `${place.id}:${slot}`;
                        return (
                          <div key={slot} className="min-w-0">
                            <div className="relative">
                              <button
                                type="button"
                                aria-label={`${circled(no)}${place.name} ${SLOT_LABEL[slot]}`}
                                aria-pressed={same(selected, key)}
                                data-photo-slot={k}
                                data-drop={over === k ? 'over' : fileDrag ? 'ready' : undefined}
                                onDragOver={(e) => {
                                  if (!draggable(e)) return;
                                  e.preventDefault();
                                  setOver(k);
                                }}
                                onDragLeave={() => setOver((o) => (o === k ? '' : o))}
                                onDrop={(e) => {
                                  setOver('');
                                  actions.drop(e, key);
                                  setSelected(null);
                                }}
                                onClick={() => press(key, !!id)}
                                className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                                  same(selected, key)
                                    ? 'ring-4 ring-sky-500'
                                    : over === k
                                      ? 'ring-4 ring-emerald-500'
                                      : id
                                        ? `bg-slate-100 hover:ring-2 hover:ring-emerald-500 ${fileDrag ? 'ring-2 ring-emerald-400' : 'ring-1 ring-slate-300'}`
                                        : `border-2 border-dashed hover:border-emerald-500 hover:bg-emerald-50 ${fileDrag ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-400 text-slate-600'}`
                                } ${selected && !same(selected, key) ? 'cursor-copy' : ''}`}
                              >
                                {photo ? (
                                  <Thumb url={photo.url} w={photo.w} h={photo.h} edit={edit} marks={place.photoMarks?.[slot]} paper={paperSize?.(key)} />
                                ) : photo === null ? (
                                  <span className="px-2 text-amber-800">この端末にない写真</span>
                                ) : id ? (
                                  '…'
                                ) : (
                                  // 空いた枠：ドロップ・貼り付けができることが分かるように（狭い画面＝スマホは押して選ぶだけなので出さない）
                                  <span className="flex flex-col items-center gap-0.5">
                                    <span className="text-sm font-bold">＋ {SLOT_LABEL[slot]}</span>
                                    <span className="text-[11px] max-sm:hidden">📷 ドロップ・Ctrl+V</span>
                                  </span>
                                )}
                                {id && <span className="absolute left-1 top-1 rounded bg-white/85 px-1 text-[10px] font-bold text-slate-700">{SLOT_LABEL[slot]}</span>}
                                {over === k && <DropOverlay text={id ? 'ここに離す（差し替え）' : 'ここに離す'} />}
                              </button>
                              {/* 右に 90°回す（押すたびに。iPad でもすぐに。続けて押しても画面が拡大しないように touch-manipulation） */}
                              {id && (
                                <button
                                  type="button"
                                  data-no-drag
                                  onClick={() => actions.setEdit(key, turn(edit, 1), photo ?? undefined)}
                                  className="absolute right-1 top-1 flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/90 text-lg touch:h-10 touch:w-10 touch:text-xl leading-none text-slate-700 shadow ring-1 ring-slate-300 hover:bg-white hover:text-emerald-700"
                                  title="右に回す"
                                  aria-label={`${circled(no)}${place.name} ${SLOT_LABEL[slot]}を右に回す`}
                                >
                                  ↻
                                </button>
                              )}
                              {/* 書き込み（直線・矢印・四角形・楕円・テキストボックス。Excel と同じ操作） */}
                              {id && photo && onMark && (
                                <button
                                  type="button"
                                  data-no-drag
                                  onClick={() => onMark(key)}
                                  className="absolute right-10 top-1 flex h-8 w-8 touch-manipulation items-center justify-center rounded-full bg-white/90 text-base touch:right-12 touch:h-10 touch:w-10 touch:text-lg leading-none text-slate-700 shadow ring-1 ring-slate-300 hover:bg-white hover:text-emerald-700"
                                  title="写真に書き込む"
                                  aria-label={`${circled(no)}${place.name} ${SLOT_LABEL[slot]}に書き込む`}
                                >
                                  ✏️
                                </button>
                              )}
                            </div>
                            {dates && (
                              // 日付が切れないように、「改修前撮影日」「改修後撮影日」は欄の上・日付の欄は枠の幅いっぱい。直すと全部の写真の同じ撮影日が同じ日に
                              <label data-no-drag className="mt-1 block text-[11px] text-slate-600">
                                {SLOT_LABEL[slot]}撮影日
                                <input
                                  type="date"
                                  value={place.photoDates?.[slot] || photoDay(job, rates, slot)}
                                  onChange={(e) => actions.setDate(slot, e.target.value)}
                                  className="mt-0.5 block h-7 w-full min-w-0 rounded border border-slate-300 px-1 text-xs text-slate-800 touch:h-9 touch:text-sm"
                                  aria-label={`${circled(no)}${place.name} ${SLOT_LABEL[slot]}撮影日`}
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* 写真貼付用紙の改修前の写真の横（上）に書く内容：自動の文（改修の種類・寸法）と、手で足す行（ユーザーの指示「自動入力 手すり L=800mm H=600mm、
                        追加 手入力 ベースプレート L=800mm」。改修前だけ＝工務店さんに見積もり依頼・内容を伝えるためのもの） */}
                    <div data-no-drag className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs" role="group" aria-label={`${circled(no)}${place.name} 改修前の写真に書く内容`}>
                      <div className="text-[11px] font-bold text-slate-600">改修前の写真に書く内容</div>
                      {workText(place, kindNamesOf(job)) && (
                        <div className="mt-0.5 text-slate-700">
                          <span className="mr-1.5 text-[11px] text-slate-500">自動</span>
                          {workText(place, kindNamesOf(job))}
                        </div>
                      )}
                      <label className="mt-1 block text-[11px] text-slate-600">
                        追加
                        <textarea
                          rows={2}
                          value={place.photoNote ?? ''}
                          onChange={(e) => actions.setNote(place.id, e.target.value)}
                          placeholder="ベースプレート　L=800mm"
                          className="mt-0.5 block w-full min-w-0 resize-y rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
                          aria-label={`${circled(no)}${place.name} 改修前の写真に書く内容の追加`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
