import {useState} from 'react';
import {addDoc, collection} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {parseMealText} from '../lib/parseMeal';
import {useCollection} from '../lib/useCollection';
import {Button, Card, NumberField, SectionTitle, TextField} from '../components/ui';
import type {Meal, MealItem, MealType} from '../types';

const MEAL_TYPES: MealType[] = ['朝', '昼', '夕'];

const EMPTY_ITEM: MealItem = {
  food_name: '',
  amount: null,
  unit: null,
  calories: null,
  protein: null,
  fat: null,
  carbs: null,
  fiber: null,
  saturated_fat: null,
  sugar: null,
  sodium: null,
};

export function MealsPage({uid}: {uid: string}) {
  const {data: meals} = useCollection<Meal>(uid, 'meals');
  const [mealType, setMealType] = useState<MealType>('朝');
  const [text, setText] = useState('');
  const [items, setItems] = useState<MealItem[] | null>(null);
  const [source, setSource] = useState<'ai' | 'manual'>('ai');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleAiParse() {
    if (!text.trim()) return;
    setStatus('loading');
    try {
      const parsed = await parseMealText(text);
      setItems(parsed);
      setSource('ai');
      setStatus('idle');
    } catch (err) {
      console.error('AI分解に失敗しました', err);
      // 10-7: AI分解失敗／タイムアウト → 手動入力フォームへフォールバック
      setItems([{...EMPTY_ITEM, food_name: text}]);
      setSource('manual');
      setStatus('error');
    }
  }

  function startManualEntry() {
    setItems([{...EMPTY_ITEM}]);
    setSource('manual');
    setStatus('idle');
  }

  function updateItem(index: number, patch: Partial<MealItem>) {
    if (!items) return;
    setItems(items.map((it, i) => (i === index ? {...it, ...patch} : it)));
  }

  function addRow() {
    setItems([...(items ?? []), {...EMPTY_ITEM}]);
  }

  async function confirmSave() {
    if (!items) return;
    const now = new Date().toISOString();
    for (const item of items) {
      if (!item.food_name.trim()) continue;
      const meal: Omit<Meal, 'id'> = {
        ...item,
        datetime: now,
        meal_type: mealType,
        source,
        notes: '',
      };
      await addDoc(collection(db, 'users', uid, 'meals'), meal);
    }
    setItems(null);
    setText('');
  }

  const todayMeals = meals
    .filter((m) => m.datetime.startsWith(new Date().toISOString().slice(0, 10)))
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <SectionTitle>食事記録</SectionTitle>
        <div className="mb-3 flex gap-2">
          {MEAL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setMealType(t)}
              className={`rounded-full px-3 py-1 text-sm ${
                mealType === t ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {items == null && (
          <div className="flex flex-col gap-3">
            <TextField
              label="食べたものを入力（例：ご飯200g、鶏胸150g、卵2個）"
              value={text}
              onChange={setText}
            />
            <div className="flex gap-2">
              <Button onClick={handleAiParse} disabled={status === 'loading' || !text.trim()}>
                {status === 'loading' ? 'AI分解中…' : 'AIで分解'}
              </Button>
              <Button variant="secondary" onClick={startManualEntry}>
                手動で入力
              </Button>
            </div>
          </div>
        )}

        {items != null && (
          <div className="flex flex-col gap-3">
            {status === 'error' && (
              <p className="text-sm text-rose-600">
                AI分解に失敗しました（タイムアウトまたはエラー）。手動で入力してください。
              </p>
            )}
            <p className="text-xs text-slate-400">量が不明な項目は空欄のままで構いません（自動で埋めません）。</p>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3">
                <TextField
                  label="食品名"
                  value={item.food_name}
                  onChange={(v) => updateItem(i, {food_name: v})}
                />
                <NumberField
                  label="量"
                  value={item.amount}
                  onChange={(v) => updateItem(i, {amount: v})}
                  unit={item.unit ?? 'g'}
                />
                <NumberField
                  label="カロリー"
                  value={item.calories}
                  onChange={(v) => updateItem(i, {calories: v})}
                  unit="kcal"
                  step={1}
                />
                <NumberField
                  label="タンパク質"
                  value={item.protein}
                  onChange={(v) => updateItem(i, {protein: v})}
                  unit="g"
                />
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={addRow}>項目を追加</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setItems(null)}>やり直す</Button>
                <Button onClick={confirmSave}>この内容で登録</Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>本日の記録</SectionTitle>
        {todayMeals.length === 0 ? (
          <p className="text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-slate-700">
            {todayMeals.map((m) => (
              <li key={m.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span>
                  [{m.meal_type}] {m.food_name}
                  {m.amount != null ? ` ${m.amount}${m.unit ?? ''}` : ''}
                </span>
                <span className="text-slate-400">{m.calories != null ? `${m.calories}kcal` : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
