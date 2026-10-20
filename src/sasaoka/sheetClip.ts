// 見積書の行のコピー・切り取り（貼り付けるまで覚えておく）。見積書の画面を移っても残るので、別の見積書にも貼り付けられる。
// Ctrl+C／Ctrl+X でコピーしたときは、そのとき OS の貼り付けに入れた文字（text）も覚えておき、Ctrl+V のときに同じ文字なら行を貼り付ける
// （ほかの所で文字をコピーしたあとなら、ふつうに欄に文字を貼り付ける）。

import {useSyncExternalStore} from 'react';
import type {Row} from './types.ts';

export type SheetClip = {
  rows: Row[]; // コピーした行（部材と同上施工費、または施工費のまとまり）
  label: string; // 何をコピーしたか（お知らせに出す）
  sourceIds: string[]; // もとの行（見積書で印を付ける。切り取りなら貼り付けたあとに消す）
  jobId: string; // もとの見積書
  cut: boolean; // 切り取り（貼り付けると、もとの行は消える。同じ見積書の中だけ）
  text: string | null; // OS の貼り付けに入れた文字（入れられなかったときは null）
};

let clip: SheetClip | null = null;
const subs = new Set<() => void>();

export const getClip = () => clip;

export function setClip(next: SheetClip | null) {
  clip = next;
  subs.forEach((f) => f());
}

export function useClip(): SheetClip | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => clip,
  );
}
