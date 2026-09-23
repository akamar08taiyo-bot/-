import {useState} from 'react';
import {useProfile} from '../lib/useProfile';
import {useCollection} from '../lib/useCollection';
import {exportAsJson, exportCollectionAsCsv} from '../lib/exportData';
import {Button, Card, NumberField, SectionTitle, TextField} from '../components/ui';
import type {
  AlcoholLog,
  BodyLog,
  HealthCheck,
  Meal,
  MealPreset,
  SnackLog,
  Supplement,
  SupplementLog,
  Workout,
} from '../types';

export function SettingsPage() {
  const {profile, updateProfile} = useProfile();
  const [height, setHeight] = useState<number | null>(profile.height);
  const [targetWeight, setTargetWeight] = useState<number | null>(profile.goals.target_weight);
  const [targetBodyFat, setTargetBodyFat] = useState<number | null>(profile.goals.target_body_fat);
  const [notes, setNotes] = useState(profile.notes);
  const [savedMsg, setSavedMsg] = useState(false);

  const {data: healthChecks} = useCollection<HealthCheck>('health_checks');
  const {data: bodyLogs} = useCollection<BodyLog>('body_logs');
  const {data: meals} = useCollection<Meal>('meals');
  const {data: presets} = useCollection<MealPreset>('meal_presets');
  const {data: snacks} = useCollection<SnackLog>('snacks_log');
  const {data: alcoholLogs} = useCollection<AlcoholLog>('alcohol_log');
  const {data: supplements} = useCollection<Supplement>('supplements');
  const {data: supplementLogs} = useCollection<SupplementLog>('supplement_logs');
  const {data: workouts} = useCollection<Workout>('workouts');

  function save() {
    updateProfile({
      height,
      goals: {target_weight: targetWeight, target_body_fat: targetBodyFat},
      notes,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  function exportJson() {
    exportAsJson({
      profile: [{...profile, height, goals: {target_weight: targetWeight, target_body_fat: targetBodyFat}}],
      health_checks: healthChecks,
      body_logs: bodyLogs,
      meals,
      meal_presets: presets,
      snacks_log: snacks,
      alcohol_log: alcoholLogs,
      supplements,
      supplement_logs: supplementLogs,
      workouts,
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <SectionTitle>目標・基本情報</SectionTitle>
        <div className="flex flex-col gap-3">
          <NumberField label="身長" value={height} onChange={setHeight} unit="cm" />
          <NumberField label="目標体重（未確定事項として空欄可）" value={targetWeight} onChange={setTargetWeight} unit="kg" />
          <NumberField label="目標体脂肪率（未確定事項として空欄可）" value={targetBodyFat} onChange={setTargetBodyFat} unit="%" />
          <TextField label="メモ" value={notes} onChange={setNotes} />
          <Button onClick={save}>保存</Button>
          {savedMsg && <p className="text-sm text-emerald-600">保存しました</p>}
        </div>
      </Card>

      <Card>
        <SectionTitle>データのエクスポート</SectionTitle>
        <p className="mb-3 text-xs text-slate-400">
          データはこの端末のブラウザにのみ保存されています。ブラウザのデータを消去したり別の端末で開いたりすると復元できないため、週1回程度の手動バックアップを推奨します。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson}>すべてJSONでエクスポート</Button>
          <Button variant="secondary" onClick={() => exportCollectionAsCsv('health_checks', healthChecks)}>
            健診データCSV
          </Button>
          <Button variant="secondary" onClick={() => exportCollectionAsCsv('body_logs', bodyLogs)}>
            体重ログCSV
          </Button>
          <Button variant="secondary" onClick={() => exportCollectionAsCsv('meals', meals)}>
            食事記録CSV
          </Button>
        </div>
      </Card>
    </div>
  );
}
