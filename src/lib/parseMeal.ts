import {httpsCallable} from 'firebase/functions';
import {functions} from './firebase';
import type {MealItem} from '../types';

const TIMEOUT_MS = 12_000;
const functionName = import.meta.env.VITE_PARSE_MEAL_FUNCTION_NAME || 'parseMeal';

// クライアント → Cloud Function（10-2）。量不明な項目はnullのまま返す。
// 失敗・タイムアウト時は呼び出し側で手動入力フォームへフォールバックする（10-7）。
export async function parseMealText(text: string): Promise<MealItem[]> {
  const call = httpsCallable<{text: string}, {items: MealItem[]}>(functions, functionName);
  const result = await Promise.race([
    call({text}),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('parseMeal timeout')), TIMEOUT_MS),
    ),
  ]);
  return result.data.items;
}
