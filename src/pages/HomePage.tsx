import {useMemo, useState} from 'react';
import {collection, doc, setDoc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useCollection} from '../lib/useCollection';
import {useProfile} from '../lib/useProfile';
import {todayStr} from '../lib/date';
import {weeklyWeightTrend} from '../lib/weightTrend';
import {checkDuplicates} from '../lib/supplementDuplicates';
import {Button, Card, NumberField, SectionTitle} from '../components/ui';
import type {
  AlcoholLog,
  BodyLog,
  Meal,
  MealType,
  SnackLog,
  Supplement,
  SupplementLog,
  Workout,
} from '../types';
import type {ScreenKey} from '../App';

const SNACK_SUGAR_CAUTION_G = 25;

export function HomePage({uid, onNavigate}: {uid: string; onNavigate: (key: ScreenKey) => void}) {
  const {profile} = useProfile(uid);
  const {data: bodyLogs} = useCollection<BodyLog>(uid, 'body_logs');
  const {data: meals} = useCollection<Meal>(uid, 'meals');
  const {data: workouts} = useCollection<Workout>(uid, 'workouts');
  const {data: snacks} = useCollection<SnackLog>(uid, 'snacks_log');
  const {data: alcoholLogs} = useCollection<AlcoholLog>(uid, 'alcohol_log');
  const {data: supplements} = useCollection<Supplement>(uid, 'supplements');
  const {data: supplementLogs} = useCollection<SupplementLog>(uid, 'supplement_logs');

  const [weightInput, setWeightInput] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const today = todayStr();

  const todayMeals = useMemo(() => meals.filter((m) => m.datetime.startsWith(today)), [meals, today]);
  const todayWorkouts = useMemo(() => workouts.filter((w) => w.date === today), [workouts, today]);
  const todaySnacks = useMemo(() => snacks.filter((s) => s.datetime.startsWith(today)), [snacks, today]);
  const todayAlcohol = alcoholLogs.find((a) => a.date === today);
  const todaySupplementLogs = useMemo(
    () => supplementLogs.filter((s) => s.datetime.startsWith(today)),
    [supplementLogs, today],
  );
  const latestBodyLog = [...bodyLogs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  const mealStatus = (type: MealType) =>
    todayMeals.some((m) => m.meal_type === type) ? '済' : '未';

  const trend = useMemo(() => {
    const sorted = [...bodyLogs].sort((a, b) => (a.date < b.date ? -1 : 1));
    return weeklyWeightTrend(sorted);
  }, [bodyLogs]);

  const todaySugar = todaySnacks.reduce((sum, s) => sum + (s.estimated_sugar ?? 0), 0);

  const duplicateWarnings = useMemo(
    () => checkDuplicates(todaySupplementLogs, supplements),
    [todaySupplementLogs, supplements],
  );

  const improvements: string[] = [];
  if (todaySugar >= SNACK_SUGAR_CAUTION_G) {
    improvements.push(`間食の糖質がやや多めです（本日約${todaySugar}g）`);
  }
  if (trend.diff != null) {
    const sign = trend.diff >= 0 ? '+' : '';
    improvements.push(`体重は先週比${sign}${trend.diff.toFixed(1)}kgです`);
  }
  for (const w of duplicateWarnings) {
    improvements.push(`サプリ成分「${w.ingredient}」が本日${w.total}${''}摂取されています。${w.note}`);
  }

  async function saveWeight() {
    if (weightInput == null) return;
    setSaving(true);
    try {
      await setDoc(
        doc(collection(db, 'users', uid, 'body_logs'), today),
        {date: today, weight: weightInput, waist: null, body_fat: null, sleep: null, fatigue: null},
        {merge: true},
      );
      await setDoc(
        doc(db, 'users', uid, 'profile', 'main'),
        {current_weight: weightInput},
        {merge: true},
      );
      setWeightInput(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">体重</p>
            <p className="text-3xl font-bold text-slate-800">
              {latestBodyLog?.weight ?? profile.current_weight ?? '—'}
              <span className="ml-1 text-base font-normal text-slate-400">kg</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              身長 {profile.height ?? '未設定'}
              {profile.height ? 'cm' : ''}（設定で変更可）
            </p>
          </div>
          <div className="flex items-end gap-2">
            <NumberField label="" value={weightInput} onChange={setWeightInput} unit="kg" />
            <Button onClick={saveWeight} disabled={saving || weightInput == null}>
              ワンタップ更新
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>今日の状況</SectionTitle>
        <ul className="grid grid-cols-2 gap-y-2 text-sm text-slate-700">
          <li>食事：朝{mealStatus('朝')} / 昼{mealStatus('昼')} / 夕{mealStatus('夕')}</li>
          <li>筋トレ：{todayWorkouts.length > 0 ? '実施済み' : '未実施'}</li>
          <li>間食：{todaySnacks.length}回</li>
          <li>飲酒：{todayAlcohol ? (todayAlcohol.drank ? 'あり' : 'なし') : '未記録'}</li>
          <li>サプリ：{todaySupplementLogs.length}/{supplements.filter((s) => s.active).length}</li>
          <li>睡眠：{latestBodyLog?.sleep ?? '未入力'}{latestBodyLog?.sleep != null ? 'h' : ''}</li>
        </ul>
      </Card>

      <Card>
        <SectionTitle>今日の改善ポイント（最大3つ）</SectionTitle>
        {improvements.length === 0 ? (
          <p className="text-sm text-slate-500">現時点で特筆すべき事実はありません。</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {improvements.slice(0, 3).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => onNavigate('meals')}>食事を記録</Button>
        <Button variant="secondary" onClick={() => onNavigate('snacks')}>間食を記録</Button>
        <Button variant="secondary" onClick={() => onNavigate('workouts')}>筋トレを記録</Button>
        <Button variant="secondary" onClick={() => onNavigate('supplements')}>サプリ</Button>
      </div>
    </div>
  );
}
