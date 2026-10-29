// 北九州市は改修前と改修後に同じ写真を入れ、改修後の写真に線を書き込んで「改修後のイメージ図」にする
// （ユーザーの指示「北九州では、改修前と改修後には、同じ写真を入れ、改修後の写真に線を書き込むため、写真を選択した場合は前後に同じ写真を組み込む」2026-10-29）。
// 改修後の写真（書き込みつき）は、内容報告書（写真）の「改修後のイメージ図」の欄と、完了報告書（写真）に出る（shinsei.ts の KITAKYUSHU_PHOTO_SHEETS）。
// 改修後が改修前をそのまま写したもの（書き込みがない）の間は、改修前を差し替える・回す・消す・入れ替えると改修後も同じにする。
// 改修後に書き込んだら、もう改修前には合わせない（書き込んだイメージ図を消さない）。工事のあとに本当の改修後の写真を入れても、改修前は変えない
// （改修後に入れた写真は、改修前が空のときだけ改修前にも入れる）

import {jobInsurer} from './estimateForms.ts';
import type {Insurer, Job, Place} from './types.ts';

type Slot = 'before' | 'after';

/** 改修前と改修後に同じ写真を入れる保険者 */
const PAIR_INSURERS = new Set<Insurer>(['kitakyushu']);

/** この様邸は改修前と改修後に同じ写真を入れるか（北九州市） */
export const pairsPhotos = (job: Pick<Job, 'insurer' | 'form' | 'address'>): boolean => {
  const insurer = jobInsurer(job);
  return insurer !== '' && PAIR_INSURERS.has(insurer);
};

/** 写真の枠ごとに持つもの（写真・撮影日・向きと大きさ・書き込み・並べたもとの写真） */
const FIELDS = ['photos', 'photoDates', 'photoEdits', 'photoMarks', 'photoTiles'] as const;
/** もう一方の枠に写すもの（撮影日・書き込みは写さない） */
const COPIED = new Set<(typeof FIELDS)[number]>(['photos', 'photoEdits', 'photoTiles']);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const slotOf = (p: Place, slot: Slot) => FIELDS.map((f) => p[f]?.[slot]);

/** 改修後が改修前をそのまま写したものか（同じ写真・同じ向きと大きさ・同じ並べ方で、書き込みがない） */
export const afterMirrors = (p: Place): boolean =>
  !!p.photos?.before &&
  p.photos.after === p.photos.before &&
  !p.photoMarks?.after?.length &&
  same(p.photoEdits?.before, p.photoEdits?.after) &&
  same(p.photoTiles?.before, p.photoTiles?.after);

/** from の枠の写真・向きと大きさ・並べたもとの写真を to の枠に写す（to の書き込み・撮影日は外す。from が空なら to も空） */
function copySlot(p: Place, from: Slot, to: Slot): Place {
  const out: Record<string, unknown> = {...p};
  for (const f of FIELDS) {
    const {[to]: _old, ...rest} = (p[f] ?? {}) as Record<string, unknown>;
    const v = COPIED.has(f) ? rest[from] : undefined;
    const next = v === undefined ? rest : {...rest, [to]: v};
    if (Object.keys(next).length) out[f] = next;
    else delete out[f];
  }
  return out as Place;
}

/**
 * 改修前の写真を改修後に複製する（北九州市の「改修前を複製」。ユーザーの指示「北九州のみ、改修前の写真を改修後の写真に複製する機能をつける」2026-10-29）。
 * 写真・向きと大きさ・並べたもとの写真を写し、改修後の書き込みは外す（改修前の書き込みは写さない＝写真を入れたときの自動の複製と同じ）。改修前が空なら何もしない
 */
export const copyBeforeToAfter = (p: Place): Place => (p.photos?.before ? copySlot(p, 'before', 'after') : p);

/**
 * 写真の枠を直したあと（next）の箇所を、改修前と改修後で合わせる（old は直す前）：
 * 改修前を直した（改修後はそのまま）とき、改修後が改修前をそのまま写したものだったか、空の改修後で改修前に新しい写真を入れたなら、改修後も改修前と同じにする
 * （改修前を消したら改修後も消す）。改修後に新しい写真を入れた（改修前はそのまま）とき、改修前が空なら改修前にも入れる
 */
export function pairPlace(old: Place, next: Place): Place {
  const beforeKept = same(slotOf(old, 'before'), slotOf(next, 'before'));
  const afterKept = same(slotOf(old, 'after'), slotOf(next, 'after'));
  if (!beforeKept && afterKept) {
    const newPhoto = !!next.photos?.before && next.photos.before !== old.photos?.before;
    return afterMirrors(old) || (newPhoto && !old.photos?.after) ? copySlot(next, 'before', 'after') : next;
  }
  if (beforeKept && !afterKept && !old.photos?.before && next.photos?.after && next.photos.after !== old.photos?.after) return copySlot(next, 'after', 'before');
  return next;
}

/** 様邸を直したあと（next）の箇所ごとに pairPlace（北九州市だけ。箇所は id で直す前と比べる） */
export function pairJob(old: Job, next: Job): Job {
  if (old === next || !pairsPhotos(next)) return next;
  const before = new Map(old.places.map((p) => [p.id, p]));
  const places = next.places.map((p) => (before.has(p.id) ? pairPlace(before.get(p.id)!, p) : p));
  return places.every((p, i) => p === next.places[i]) ? next : {...next, places};
}
