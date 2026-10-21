// 写真貼付用紙の写真（ユーザーの指示「撮ってきた画像を、ドラッグ＆ドロップで貼り付けたり、添付して貼り付けたり」
// 「写真番号の1番と2番の入れ替えなど、編集もしやすく」）。
// 写真番号（見積書の箇所の順番。申請書の改修の内容と同じ）ごとに 改修前・改修後 の枠を並べる。枠に写真のファイルをドロップするか、枠を押して選ぶ。
// 何枚かまとめて選ぶ（ドロップする）と、①から順に改修前の空いた枠に入る。
// 入れ替え：写真を別の枠へドラッグするか、写真を押して選んでから入れ替えたい枠を押す（空いた枠なら移す）。差し替え・削除もできる。
// 写真は縮めてこの端末に保存し（photos.ts）、申請書の Excel の写真貼付用紙（写真番号の用紙）に貼る

import {useState} from 'react';
import type {DragEvent} from 'react';
import type {EstimateRates} from '../calc.ts';
import {Btn, useToast} from '../components/ui.tsx';
import {circled, photoNumbers} from '../estimateForms.ts';
import {preparePhoto, putPhoto, rememberPhotoUrl, usePhotoUrls} from '../photos.ts';
import type {Job, Place} from '../types.ts';

export type PhotoSlot = 'before' | 'after';
export type PhotoKey = {placeId: string; slot: PhotoSlot};
export const SLOT_LABEL: Record<PhotoSlot, string> = {before: '改修前', after: '改修後'};
/** 写真を枠から枠へドラッグするときの印 */
export const PHOTO_DRAG = 'application/x-sasaoka-photo';

function withPhoto(p: Place, slot: PhotoSlot, id: string | undefined): Place {
  const photos = {...p.photos, [slot]: id};
  if (!id) delete photos[slot];
  const {photos: _old, ...rest} = p;
  return photos.before || photos.after ? {...rest, photos} : rest;
}

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
  const setPhoto = (key: PhotoKey, id: string | undefined) => setJob((j) => ({...j, places: j.places.map((p) => (p.id === key.placeId ? withPhoto(p, key.slot, id) : p))}));
  /** 写真のファイルを入れる：start の枠から（なければ①の改修前から）、改修前の空いた枠に順に */
  const put = async (files: File[], start?: PhotoKey) => {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name));
    if (images.length === 0) {
      if (files.length) toast('写真（画像）のファイルを選んでください', 'error');
      return;
    }
    // 入れる枠：選んだ枠と、そのあとの写真番号の同じ種類（改修前・改修後）の空いた枠
    const list = photoPlaces(job, rates);
    const slot = start?.slot ?? 'before';
    const from = start ? list.findIndex((x) => x.place.id === start.placeId) + 1 : 0;
    const empty = list
      .slice(from)
      .filter(({place}) => !place.photos?.[slot])
      .map(({place}) => ({placeId: place.id, slot}));
    const targets: PhotoKey[] = start ? [start, ...empty] : empty;
    if (targets.length === 0) {
      toast('写真を入れる空いた枠がありません（写真を押して差し替えます）', 'error');
      return;
    }
    const used = images.slice(0, targets.length);
    setBusy((n) => n + used.length);
    for (const [i, file] of used.entries()) {
      try {
        const {blob, w, h} = await preparePhoto(file);
        const id = await putPhoto({blob, w, h});
        rememberPhotoUrl(id, blob, w, h);
        setPhoto(targets[i], id);
      } catch {
        toast(`「${file.name}」を読めませんでした`, 'error');
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (images.length > used.length) toast(`写真番号の枠が足りないので、${images.length - used.length}枚は入れませんでした`, 'error');
  };
  /** 2つの枠の写真を入れ替える（片方が空なら移す） */
  const swap = (a: PhotoKey, b: PhotoKey) =>
    setJob((j) => {
      const get = (k: PhotoKey) => j.places.find((p) => p.id === k.placeId)?.photos?.[k.slot];
      const [ia, ib] = [get(a), get(b)];
      let places = j.places.map((p) => (p.id === a.placeId ? withPhoto(p, a.slot, ib) : p));
      places = places.map((p) => (p.id === b.placeId ? withPhoto(p, b.slot, ia) : p));
      return {...j, places};
    });
  const remove = (key: PhotoKey) => setPhoto(key, undefined);
  /** ドロップしたもの：写真のファイルならその枠から入れる。ほかの枠の写真なら入れ替える */
  const drop = (e: DragEvent, target: PhotoKey) => {
    e.preventDefault();
    e.stopPropagation();
    const moved = e.dataTransfer.getData(PHOTO_DRAG);
    if (moved) {
      try {
        const from = JSON.parse(moved) as PhotoKey;
        if (from.placeId !== target.placeId || from.slot !== target.slot) swap(from, target);
      } catch {
        /* ほかのものはしない */
      }
      return;
    }
    if (e.dataTransfer.files.length) void put([...e.dataTransfer.files], target);
  };
  return {put, swap, remove, drop, busy};
}

/** ドラッグしているものが写真のファイルか、枠の写真か */
const draggable = (e: DragEvent) => [...e.dataTransfer.types].some((t) => t === 'Files' || t === PHOTO_DRAG);

export type PhotoActions = ReturnType<typeof usePhotoActions>;

export function PhotoBoard({
  job,
  rates,
  sheetNos,
  actions,
  onPick,
}: {
  job: Job;
  rates: EstimateRates;
  sheetNos: Set<number> | null; // 原本に写真の用紙のある写真番号（読むまでは null）
  actions: PhotoActions;
  onPick: (key?: PhotoKey) => void; // 写真のファイルを選ぶ（枠を決めるときは key）
}) {
  const list = photoPlaces(job, rates);
  const urls = usePhotoUrls(list.flatMap(({place}) => [place.photos?.before ?? '', place.photos?.after ?? '']));
  const [selected, setSelected] = useState<PhotoKey | null>(null);
  const [over, setOver] = useState<string>(''); // ドラッグして重ねている枠
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

  return (
    <section
      aria-label="写真"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
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
        <Btn small color="white" onClick={() => pick()} disabled={list.length === 0}>
          📷 写真を選ぶ
        </Btn>
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
            {selPlace.place.name}の{SLOT_LABEL[selected.slot]}：入れ替える枠を押してください
          </span>
          <Btn small color="white" onClick={() => pick(selected)}>
            差し替え
          </Btn>
          <Btn
            small
            color="white"
            onClick={() => {
              actions.remove(selected);
              setSelected(null);
            }}
          >
            削除
          </Btn>
          <Btn small color="white" onClick={() => setSelected(null)}>
            やめる
          </Btn>
        </div>
      )}
      {list.length > 0 && (
        <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
          {list.map(({place, no}) => (
            <div key={place.id} role="group" aria-label={`${circled(no)}${place.name}の写真`} className="rounded-lg border border-slate-200 p-2">
              <div className="mb-1 flex items-baseline gap-1.5 text-sm">
                <b className="text-slate-800">
                  {circled(no)} {place.name || '（改修場所）'}
                </b>
                {sheetNos && !sheetNos.has(no) && <span className="text-[11px] text-amber-700">{lastSheet ? `Excel の写真の用紙は${circled(lastSheet)}まで` : 'Excel に写真の用紙なし'}</span>}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['before', 'after'] as const).map((slot) => {
                  const key = {placeId: place.id, slot};
                  const id = place.photos?.[slot];
                  const photo = id ? urls[id] : undefined;
                  const k = `${place.id}:${slot}`;
                  return (
                    <button
                      key={slot}
                      type="button"
                      aria-label={`${circled(no)}${place.name} ${SLOT_LABEL[slot]}`}
                      aria-pressed={same(selected, key)}
                      draggable={!!id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(PHOTO_DRAG, JSON.stringify(key));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
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
                      className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md text-xs transition ${
                        same(selected, key)
                          ? 'ring-4 ring-sky-500'
                          : over === k
                            ? 'ring-4 ring-emerald-500'
                            : id
                              ? 'ring-1 ring-slate-300 hover:ring-2 hover:ring-emerald-500'
                              : 'border-2 border-dashed border-slate-300 text-slate-500 hover:border-emerald-500 hover:bg-emerald-50'
                      } ${selected && !same(selected, key) ? 'cursor-copy' : ''}`}
                    >
                      {photo ? (
                        <img src={photo.url} alt="" className="h-full w-full bg-slate-100 object-contain" draggable={false} />
                      ) : photo === null ? (
                        <span className="px-2 text-amber-800">この端末にない写真</span>
                      ) : id ? (
                        '…'
                      ) : (
                        `＋ ${SLOT_LABEL[slot]}`
                      )}
                      {id && <span className="absolute left-1 top-1 rounded bg-white/85 px-1 text-[10px] font-bold text-slate-700">{SLOT_LABEL[slot]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
