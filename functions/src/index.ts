import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';

// 10-2: クライアント → Cloud Function（APIキーはサーバー側env変数）→ LLM API
// LLM APIキーはクライアントに一切埋め込まない。
const llmApiKey = defineSecret('LLM_API_KEY');

interface MealItem {
  food_name: string;
  amount: number | null;
  unit: string | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber: number | null;
  saturated_fat: number | null;
  sugar: number | null;
  sodium: number | null;
}

const SYSTEM_PROMPT = `あなたは食事内容をJSONに構造化するアシスタントです。
入力された日本語の食事テキストから、食品ごとに以下のスキーマの配列を返してください。

{"items": [{
  "food_name": string,
  "amount": number | null,
  "unit": string | null,
  "calories": number | null,
  "protein": number | null,
  "fat": number | null,
  "carbs": number | null,
  "fiber": number | null,
  "saturated_fat": number | null,
  "sugar": number | null,
  "sodium": number | null
}]}

重要な制約:
- 量や栄養素が不明・不確実な場合は、絶対に推測値を作らず null を返すこと。
- 診断や健康評価は行わず、食品の構造化のみを行うこと。
- JSON以外のテキストは一切出力しないこと。`;

export const parseMeal = onCall(
  {secrets: [llmApiKey], region: 'asia-northeast1', timeoutSeconds: 20},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const text = request.data?.text;
    if (typeof text !== 'string' || !text.trim()) {
      throw new HttpsError('invalid-argument', 'text は必須です');
    }

    const apiKey = llmApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'LLM_API_KEY が未設定です');
    }

    const baseUrl = process.env.LLM_API_BASE_URL || 'https://api.openai.com/v1';
    const model = process.env.LLM_MODEL || 'gpt-4o-mini';

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: {type: 'json_object'},
          messages: [
            {role: 'system', content: SYSTEM_PROMPT},
            {role: 'user', content: text},
          ],
        }),
      });
    } catch (err) {
      throw new HttpsError('unavailable', `LLM APIへの接続に失敗しました: ${err}`);
    }

    if (!response.ok) {
      throw new HttpsError('internal', `LLM呼び出しに失敗しました (${response.status})`);
    }

    const json = (await response.json()) as {
      choices?: {message?: {content?: string}}[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new HttpsError('internal', 'LLMからの応答が不正です');
    }

    let parsed: {items?: unknown};
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new HttpsError('internal', 'LLM応答のJSON解析に失敗しました');
    }

    return {items: normalizeItems(parsed.items)};
  },
);

function normalizeItems(raw: unknown): MealItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): MealItem => {
      const rec = (item ?? {}) as Record<string, unknown>;
      return {
        food_name: typeof rec.food_name === 'string' ? rec.food_name : '',
        amount: toNullableNumber(rec.amount),
        unit: typeof rec.unit === 'string' ? rec.unit : null,
        calories: toNullableNumber(rec.calories),
        protein: toNullableNumber(rec.protein),
        fat: toNullableNumber(rec.fat),
        carbs: toNullableNumber(rec.carbs),
        fiber: toNullableNumber(rec.fiber),
        saturated_fat: toNullableNumber(rec.saturated_fat),
        sugar: toNullableNumber(rec.sugar),
        sodium: toNullableNumber(rec.sodium),
      };
    })
    .filter((item) => item.food_name.trim().length > 0);
}

function toNullableNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
