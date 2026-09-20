import {useMemo, useState} from 'react';
import {doc, setDoc} from 'firebase/firestore';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {db} from '../lib/firebase';
import {useCollection} from '../lib/useCollection';
import {useProfile} from '../lib/useProfile';
import {formatDateJa} from '../lib/date';
import {Button, Card, NumberField, SectionTitle} from '../components/ui';
import type {BodyLog, HealthCheck} from '../types';

export function WeightPage({uid}: {uid: string}) {
  const {data: bodyLogs} = useCollection<BodyLog>(uid, 'body_logs');
  const {data: healthChecks} = useCollection<HealthCheck>(uid, 'health_checks');
  const {profile, updateProfile} = useProfile(uid);

  const [targetWeight, setTargetWeight] = useState<number | null>(profile.goals.target_weight);
  const [targetBodyFat, setTargetBodyFat] = useState<number | null>(profile.goals.target_body_fat);
  const [waist, setWaist] = useState<number | null>(null);

  const chartData = useMemo(() => {
    const points = new Map<string, {date: string; body_log_weight?: number; health_check_weight?: number}>();
    for (const b of bodyLogs) {
      if (b.weight == null) continue;
      points.set(b.date, {...points.get(b.date), date: b.date, body_log_weight: b.weight});
    }
    for (const h of healthChecks) {
      if (h.weight == null) continue;
      points.set(h.date, {...points.get(h.date), date: h.date, health_check_weight: h.weight});
    }
    return Array.from(points.values())
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((p) => ({...p, label: formatDateJa(p.date)}));
  }, [bodyLogs, healthChecks]);

  const latestWaist = [...bodyLogs].sort((a, b) => (a.date < b.date ? 1 : -1)).find((b) => b.waist != null)?.waist;

  async function saveGoals() {
    await updateProfile({goals: {target_weight: targetWeight, target_body_fat: targetBodyFat}});
  }

  async function saveWaist() {
    if (waist == null) return;
    const today = new Date().toISOString().slice(0, 10);
    await setDoc(doc(db, 'users', uid, 'body_logs', today), {date: today, waist}, {merge: true});
    setWaist(null);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <SectionTitle>体重推移</SectionTitle>
        <p className="mb-2 text-xs text-slate-400">
          健診データ（health_checks）の体重と、日次body_logsの体重を同一グラフ上に重ねて表示しています。
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{fontSize: 12}} />
              <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="body_log_weight"
                name="日次体重"
                stroke="#059669"
                dot={{r: 3}}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="health_check_weight"
                name="健診体重"
                stroke="#6366f1"
                dot={{r: 4}}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <SectionTitle>腹囲</SectionTitle>
        <p className="mb-2 text-sm text-slate-600">直近の記録：{latestWaist ?? '未入力'}{latestWaist != null ? 'cm' : ''}</p>
        <div className="flex items-end gap-2">
          <NumberField label="今日の腹囲" value={waist} onChange={setWaist} unit="cm" />
          <Button onClick={saveWaist} disabled={waist == null}>記録</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>目標値（未確定事項として空欄スタート）</SectionTitle>
        <div className="flex flex-col gap-3">
          <NumberField label="目標体重" value={targetWeight} onChange={setTargetWeight} unit="kg" />
          <NumberField label="目標体脂肪率" value={targetBodyFat} onChange={setTargetBodyFat} unit="%" />
          <Button onClick={saveGoals}>保存</Button>
        </div>
      </Card>
    </div>
  );
}
