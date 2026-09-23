import {useMemo, useState} from 'react';
import {addItem, removeItem, updateItem} from '../lib/localDb';
import {useCollection} from '../lib/useCollection';
import {todayStr} from '../lib/date';
import {Button, Card, ConfirmDialog, NumberField, SectionTitle, TextField} from '../components/ui';
import type {HealthCheck} from '../types';

const NUMERIC_FIELDS: {key: keyof HealthCheck; label: string; unit?: string}[] = [
  {key: 'weight', label: '体重', unit: 'kg'},
  {key: 'bmi', label: 'BMI'},
  {key: 'waist', label: '腹囲', unit: 'cm'},
  {key: 'systolic_bp', label: '収縮期血圧', unit: 'mmHg'},
  {key: 'diastolic_bp', label: '拡張期血圧', unit: 'mmHg'},
  {key: 'total_cholesterol', label: '総コレステロール', unit: 'mg/dL'},
  {key: 'triglycerides', label: '中性脂肪', unit: 'mg/dL'},
  {key: 'hdl', label: 'HDL', unit: 'mg/dL'},
  {key: 'ldl', label: 'LDL', unit: 'mg/dL'},
  {key: 'fasting_glucose', label: '空腹時血糖', unit: 'mg/dL'},
  {key: 'hba1c', label: 'HbA1c', unit: '%'},
  {key: 'uric_acid', label: '尿酸', unit: 'mg/dL'},
  {key: 'creatinine', label: 'クレアチニン', unit: 'mg/dL'},
  {key: 'egfr', label: 'eGFR', unit: 'mL/min/1.73㎡'},
  {key: 'cystatin_c', label: 'シスタチンC', unit: 'mg/L'},
  {key: 'egfr_cys', label: 'eGFRcys', unit: 'mL/min/1.73㎡'},
  {key: 'ast', label: 'AST', unit: 'U/L'},
  {key: 'alt', label: 'ALT', unit: 'U/L'},
  {key: 'ggt', label: 'γ-GT', unit: 'U/L'},
  {key: 'alp', label: 'ALP', unit: 'U/L'},
  {key: 'ctr', label: 'CTR（心胸郭比）', unit: '%'},
  {key: 'uacr', label: 'UACR', unit: 'mg/g'},
];

const SYMPTOMS = ['胸痛', '息切れ', '動悸', '失神', '浮腫'];

const emptyCheck = (date: string): Omit<HealthCheck, 'id'> => ({
  date,
  weight: null,
  bmi: null,
  waist: null,
  systolic_bp: null,
  diastolic_bp: null,
  total_cholesterol: null,
  triglycerides: null,
  hdl: null,
  ldl: null,
  fasting_glucose: null,
  hba1c: null,
  uric_acid: null,
  creatinine: null,
  egfr: null,
  cystatin_c: null,
  egfr_cys: null,
  ast: null,
  alt: null,
  ggt: null,
  alp: null,
  ctr: null,
  urine_protein: null,
  uacr: null,
  chest_xray_note: '',
  notes: '',
});

export function HealthChecksPage() {
  const {data: checks} = useCollection<HealthCheck>('health_checks');
  const [draft, setDraft] = useState(emptyCheck(todayStr()));
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const visible = checks.filter((c) => !c.archived).sort((a, b) => (a.date < b.date ? 1 : -1));
  const priorYear = useMemo(() => {
    if (visible.length < 2) return null;
    return visible[1];
  }, [visible]);
  const latest = visible[0];

  function save() {
    addItem('health_checks', draft);
    setDraft(emptyCheck(todayStr()));
  }

  function archive(id: string) {
    updateItem<HealthCheck>('health_checks', id, {archived: true});
  }

  function permanentlyDelete() {
    if (!confirmDeleteId) return;
    removeItem('health_checks', confirmDeleteId);
    setConfirmDeleteId(null);
  }

  function toggleSymptom(s: string) {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <SectionTitle>体調チェック</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {SYMPTOMS.map((s) => (
            <button
              key={s}
              onClick={() => toggleSymptom(s)}
              className={`rounded-full px-3 py-1 text-sm ${
                symptoms.includes(s) ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {symptoms.length > 0 && (
          <p className="mt-3 text-sm font-medium text-rose-600">
            該当する症状がある場合は、自己判断せず医療機関への受診をご検討ください。
          </p>
        )}
      </Card>

      {latest && (
        <Card>
          <SectionTitle>直近の健診（前回比較）</SectionTitle>
          <p className="mb-2 text-xs text-slate-400">
            数値の提示のみで、診断的な断定（「CKD確定」等）は行いません。判断は医師にご相談ください。
          </p>
          <ul className="grid grid-cols-2 gap-y-1 text-sm text-slate-700">
            {NUMERIC_FIELDS.filter((f) => latest[f.key] != null).map((f) => {
              const prevValue = priorYear?.[f.key];
              return (
                <li key={String(f.key)}>
                  {f.label}: {String(latest[f.key])}{f.unit ?? ''}
                  {typeof prevValue === 'number' && (
                    <span className="text-slate-400"> （前回 {prevValue}{f.unit ?? ''}）</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>健診データ入力</SectionTitle>
        <div className="mb-3">
          <TextField label="健診日" value={draft.date} onChange={(v) => setDraft({...draft, date: v})} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {NUMERIC_FIELDS.map((f) => (
            <NumberField
              key={String(f.key)}
              label={f.label}
              unit={f.unit}
              value={draft[f.key] as number | null}
              onChange={(v) => setDraft({...draft, [f.key]: v})}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <TextField label="尿蛋白" value={draft.urine_protein ?? ''} onChange={(v) => setDraft({...draft, urine_protein: v})} />
          <TextField label="胸部/胃部X線所見" value={draft.chest_xray_note} onChange={(v) => setDraft({...draft, chest_xray_note: v})} />
          <TextField label="メモ" value={draft.notes} onChange={(v) => setDraft({...draft, notes: v})} />
        </div>
        <div className="mt-3">
          <Button onClick={save}>登録</Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>健診履歴</SectionTitle>
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">まだ記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
                <span>{c.date}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => archive(c.id)}>アーカイブ</Button>
                  <Button variant="danger" onClick={() => setConfirmDeleteId(c.id)}>完全削除</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDeleteId != null}
        title="健診データを完全削除しますか？"
        message="この操作は取り消せません。通常はアーカイブ（非表示）をご利用ください。"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={permanentlyDelete}
      />
    </div>
  );
}
