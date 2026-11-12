// 担当の初めの値（ユーザーの指示「担当名は一度入力したら、次から同じ名前がデフォルトにする」2026-11-12）。
// 様邸の画面（工事見積書・請求書の様邸）で担当を選ぶと設定の lastStaff に覚え、新規作成の様邸の担当に入れる。

import type {Settings} from './types.ts';
import type {Update} from './useStore.ts';

/** 新規作成の担当の初めの値：最後に選んだ担当（担当者の候補から外した名前なら空） */
export const defaultStaff = (s: Pick<Settings, 'lastStaff' | 'staffList'>) => (s.lastStaff && s.staffList.includes(s.lastStaff) ? s.lastStaff : '');

/** 担当を選んだら覚える（空にしたときは覚え直さない） */
export function rememberStaff(update: Update, staff: string) {
  if (staff) update('settings', (prev) => (prev.lastStaff === staff ? prev : {...prev, lastStaff: staff}));
}
