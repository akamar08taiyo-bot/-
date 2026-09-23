import {useState} from 'react';
import {addItem, removeItem} from '../lib/localDb';
import {useCollection} from '../lib/useCollection';
import {todayStr} from '../lib/date';
import {Button, Card, NumberField, SectionTitle, TextField} from '../components/ui';
import type {Workout} from '../types';

const EMPTY: Omit<Workout, 'id' | 'date'> = {
  exercise: '',
  weight: null,
  reps: null,
  sets: null,
  rpe: null,
  body_part: '',
  duration: null,
};

export function WorkoutsPage() {
  const {data: workouts} = useCollection<Workout>('workouts');
  const [draft, setDraft] = useState(EMPTY);

  const today = todayStr();
  const todayWorkouts = workouts.filter((w) => w.date === today);
  const lastWorkout = [...workouts].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  function save() {
    if (!draft.exercise.trim()) return;
    const workout: Omit<Workout, 'id'> = {...draft, date: today};
    addItem('workouts', workout);
    setDraft(EMPTY);
  }

  function copyLast() {
    if (!lastWorkout) return;
    const {exercise, weight, reps, sets, rpe, body_part, duration} = lastWorkout;
    setDraft({exercise, weight, reps, sets, rpe, body_part, duration});
  }

  function remove(id: string) {
    removeItem('workouts', id);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>筋トレ記録</SectionTitle>
          {lastWorkout && (
            <Button variant="secondary" onClick={copyLast}>前回コピー</Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="種目" value={draft.exercise} onChange={(v) => setDraft({...draft, exercise: v})} />
          <TextField label="部位" value={draft.body_part} onChange={(v) => setDraft({...draft, body_part: v})} />
          <NumberField label="重量" value={draft.weight} onChange={(v) => setDraft({...draft, weight: v})} unit="kg" />
          <NumberField label="レップ数" value={draft.reps} onChange={(v) => setDraft({...draft, reps: v})} step={1} />
          <NumberField label="セット数" value={draft.sets} onChange={(v) => setDraft({...draft, sets: v})} step={1} />
          <NumberField label="RPE" value={draft.rpe} onChange={(v) => setDraft({...draft, rpe: v})} />
        </div>
        <div className="mt-3">
          <Button onClick={save} disabled={!draft.exercise.trim()}>記録</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>本日の記録</SectionTitle>
        {todayWorkouts.length === 0 ? (
          <p className="text-sm text-slate-500">本日の記録はまだありません。</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-slate-700">
            {todayWorkouts.map((w) => (
              <li key={w.id} className="flex justify-between border-b border-slate-100 pb-1">
                <span>
                  {w.exercise}（{w.body_part}）{w.weight ?? '—'}kg × {w.reps ?? '—'}回 × {w.sets ?? '—'}セット
                </span>
                <button onClick={() => remove(w.id)} className="text-xs text-rose-500">削除</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
