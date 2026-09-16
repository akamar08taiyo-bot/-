import {useState} from 'react';
import {addDoc, collection, doc, setDoc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useCollection} from '../lib/useCollection';
import {todayStr} from '../lib/date';
import {Button, Card, NumberField, SectionTitle, TextField} from '../components/ui';
import type {AlcoholLog, SnackLog} from '../types';

export function SnacksPage({uid}: {uid: string}) {
  const {data: snacks} = useCollection<SnackLog>(uid, 'snacks_log');
  const {data: alcoholLogs} = useCollection<AlcoholLog>(uid, 'alcohol_log');

  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [sugar, setSugar] = useState<number | null>(null);

  const today = todayStr();
  const todayAlcohol = alcoholLogs.find((a) => a.date === today);
  const todaySnacks = snacks
    .filter((s) => s.datetime.startsWith(today))
    .sort((a, b) => (a.datetime < b.datetime ? 1 : -1));

  async function addSnack() {
    if (!itemName.trim()) return;
    const snack: Omit<SnackLog, 'id'> = {
      datetime: new Date().toISOString(),
      item_name: itemName,
      amount: amount || null,
      estimated_sugar: sugar,
      estimated_sat_fat: null,
      notes: '',
    };
    await addDoc(collection(db, 'users', uid, 'snacks_log'), snack);
    setItemName('');
    setAmount('');
    setSugar(null);
  }

  async function setAlcohol(drank: boolean) {
    await setDoc(
      doc(db, 'users', uid, 'alcohol_log', today),
      {date: today, drank, beer_amount: null, non_alcohol_items: null, notes: ''},
      {merge: true},
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <SectionTitle>間食</SectionTitle>
        <div className="mb-3 flex flex-col gap-3">
          <TextField label="間食の内容" value={itemName} onChange={setItemName} placeholder="例：チョコレート" />
          <TextField label="量（任意）" value={amount} onChange={setAmount} placeholder="例：1枚" />
          <NumberField label="推定糖質" value={sugar} onChange={setSugar} unit="g" />
          <Button onClick={addSnack} disabled={!itemName.trim()}>記録</Button>
        </div>
        {todaySnacks.length === 0 ? (
          <p className="text-sm text-slate-500">本日の間食記録はまだありません。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-slate-700">
            {todaySnacks.map((s) => (
              <li key={s.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span>{s.item_name}{s.amount ? `（${s.amount}）` : ''}</span>
                <span className="text-slate-400">{s.estimated_sugar != null ? `糖質約${s.estimated_sugar}g` : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle>飲酒</SectionTitle>
        <p className="mb-3 text-sm text-slate-600">本日：{todayAlcohol ? (todayAlcohol.drank ? 'あり' : 'なし') : '未記録'}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAlcohol(false)}>飲まなかった</Button>
          <Button variant="secondary" onClick={() => setAlcohol(true)}>飲んだ</Button>
        </div>
      </Card>
    </div>
  );
}
