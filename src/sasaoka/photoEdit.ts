// 写真貼付用紙の写真の向き・大きさ（ユーザーの指示「写真の方向転換をできるように」「画像の角っこを持ち上げて縮小したり拡大したり」
// 「申請書などの大きさは絶対に大きくしない」）。
// rot＝右回りの角度（度。0〜360）、scale＝枠いっぱい（1）に対する大きさ。1 より大きくはしない（写真は写真の枠の中だけ。申請書の大きさは変わらない）。
// 縮めたときの枠の中の余白はそのまま（ユーザーの指示「余白が多少できてもしょうがない」）。

import type {PhotoEdit} from './types.ts';

/** これより小さくはしない（見えなくなるので） */
export const PHOTO_MIN_SCALE = 0.2;
/** 回しているとき、90°の倍数からこの角度（度）以内なら 90°の倍数にそろえる（まっすぐに戻しやすいように） */
export const ROT_SNAP = 7;

/** 角度を 0〜360 未満に（0.1°まで）。snap があれば 90°の倍数の近くはそろえる */
export function normRot(deg: number, snap = 0): number {
  if (!Number.isFinite(deg)) return 0;
  let d = ((deg % 360) + 360) % 360;
  if (snap > 0) {
    const q = Math.round(d / 90) * 90;
    if (Math.abs(d - q) <= snap) d = q;
  }
  d = Math.round(d * 10) / 10;
  return d >= 360 ? 0 : d;
}

/** 大きさを 0.2〜1 に */
export const clampScale = (s: number): number => (Number.isFinite(s) ? Math.min(1, Math.max(PHOTO_MIN_SCALE, s)) : 1);

/** 向き・大きさをそろえる。そのまま（0°・枠いっぱい）なら undefined（持たない） */
export function cleanEdit(e: Partial<PhotoEdit> | null | undefined): PhotoEdit | undefined {
  if (!e) return undefined;
  const rot = normRot(Number(e.rot ?? 0));
  const scale = Math.round(clampScale(Number(e.scale ?? 1)) * 1000) / 1000;
  return rot === 0 && scale === 1 ? undefined : {rot, scale};
}

/** 90°ずつ回す（dir＝1 右へ・−1 左へ）。斜めにしていたら、近い 90°の倍数にそろえてから回す */
export function turn(e: PhotoEdit | undefined, dir: 1 | -1): PhotoEdit {
  return {scale: e?.scale ?? 1, rot: normRot(Math.round((e?.rot ?? 0) / 90) * 90 + 90 * dir)};
}
