import {useState} from 'react';
import {addDoc, collection, deleteDoc, doc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useCollection} from '../lib/useCollection';
import {Button, Card, SectionTitle, TextField} from '../components/ui';
import type {Meal, MealPreset, MealType} from '../types';

const MEAL_TYPES: MealType[] = ['朝', '昼', '夕'];

export function PresetsPage({uid}: {uid: string}) {
  const {data: presets} = useCollection<MealPreset>(uid, 'meal_presets');
  const [name, setName] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [mealType, setMealType] = useState<MealType>('朝');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function createPreset() {
    if (!name.trim() || !itemsText.trim()) return;
    const items = itemsText
      .split(/[、,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((food_name) => ({
        food_name,
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
      }));
    const preset: Omit<MealPreset, 'id'> = {name, meal_type: mealType, items};
    await addDoc(collection(db, 'users', uid, 'meal_presets'), preset);
    setName('');
    setItemsText('');
  }

  async function usePreset(preset: MealPreset) {
    const now = new Date().toISOString();
    for (const item of preset.items) {
      const meal: Omit<Meal, 'id'> = {
        ...item,
        datetime: now,
        meal_type: preset.meal_type,
        source: 'preset',
        notes: '',
      };
      await addDoc(collection(db, 'users', uid, 'meals'), meal);
    }
    setSavedMsg(`「${preset.name}」を本日の食事記録に追加しました`);
    setTimeout(() => setSavedMsg(null), 3000);
  }

  async function removePreset(id: string) {
    await deleteDoc(doc(db, 'users', uid, 'meal_presets', id));
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <SectionTitle>よく食べるメニュー</SectionTitle>
        <p className="mb-3 text-xs text-slate-400">ワンタップで今日の食事記録に追加できます。</p>
        {savedMsg && <p className="mb-2 text-sm text-emerald-600">{savedMsg}</p>}
        {presets.length === 0 ? (
          <p className="text-sm text-slate-500">まだ登録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {presets.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <p className="font-medium text-slate-800">{p.name}（{p.meal_type}）</p>
                  <p className="text-xs text-slate-500">{p.items.map((i) => i.food_name).join('、')}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => usePreset(p)}>今日に追加</Button>
                  <Button variant="danger" onClick={() => removePreset(p.id)}>削除</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>新規プリセット</SectionTitle>
        <div className="flex flex-col gap-3">
          <TextField label="メニュー名" value={name} onChange={setName} placeholder="例：いつもの朝食" />
          <div className="flex gap-2">
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
          <TextField
            label="食品（読点区切り）"
            value={itemsText}
            onChange={setItemsText}
            placeholder="ご飯、鶏胸肉、卵"
          />
          <Button onClick={createPreset}>登録</Button>
        </div>
      </Card>
    </div>
  );
}
