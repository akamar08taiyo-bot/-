import {useMemo, useState} from 'react';
import {addDoc, collection, deleteDoc, doc} from 'firebase/firestore';
import {db} from '../lib/firebase';
import {useCollection} from '../lib/useCollection';
import {todayStr} from '../lib/date';
import {checkDuplicates, type DuplicateWarning} from '../lib/supplementDuplicates';
import {Button, Card, ConfirmDialog, NumberField, SectionTitle, TextField} from '../components/ui';
import type {Supplement, SupplementLog} from '../types';

const EMPTY: Omit<Supplement, 'id'> = {
  product_name: '',
  ingredient: '',
  amount_per_unit: 0,
  unit: 'mg',
  default_frequency: '1日1回',
  active: true,
  caution: null,
};

export function SupplementsPage({uid}: {uid: string}) {
  const {data: supplements} = useCollection<Supplement>(uid, 'supplements');
  const {data: logs} = useCollection<SupplementLog>(uid, 'supplement_logs');
  const [draft, setDraft] = useState(EMPTY);
  const [cautionThreshold, setCautionThreshold] = useState<number | null>(null);
  const [cautionText, setCautionText] = useState('');
  const [pendingWarnings, setPendingWarnings] = useState<DuplicateWarning[] | null>(null);

  const today = todayStr();
  const todayLogs = logs.filter((l) => l.datetime.startsWith(today));
  const activeSupplements = supplements.filter((s) => s.active);

  const alreadyTakenIds = new Set(todayLogs.map((l) => l.supplement_id));

  async function addSupplement() {
    if (!draft.product_name.trim() || !draft.ingredient.trim()) return;
    const supplement: Omit<Supplement, 'id'> = {
      ...draft,
      caution: cautionThreshold != null ? {threshold: cautionThreshold, text: cautionText} : null,
    };
    await addDoc(collection(db, 'users', uid, 'supplements'), supplement);
    setDraft(EMPTY);
    setCautionThreshold(null);
    setCautionText('');
  }

  async function removeSupplement(id: string) {
    await deleteDoc(doc(db, 'users', uid, 'supplements', id));
  }

  const pendingTodayIntake = useMemo(
    () =>
      activeSupplements
        .filter((s) => !alreadyTakenIds.has(s.id))
        .map((s) => ({supplement_id: s.id, quantity: 1, datetime: new Date().toISOString(), id: 'draft'})),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSupplements, todayLogs],
  );

  async function commitTodayIntake(logsToWrite: {supplement_id: string; quantity: number; datetime: string}[]) {
    for (const log of logsToWrite) {
      await addDoc(collection(db, 'users', uid, 'supplement_logs'), log);
    }
  }

  function takeAllToday() {
    if (pendingTodayIntake.length === 0) return;
    const combinedLogs = [...todayLogs, ...pendingTodayIntake];
    const warnings = checkDuplicates(combinedLogs, supplements);
    if (warnings.length > 0) {
      setPendingWarnings(warnings);
    } else {
      commitTodayIntake(pendingTodayIntake);
    }
  }

  function confirmDespiteWarning() {
    commitTodayIntake(pendingTodayIntake);
    setPendingWarnings(null);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>本日のサプリ</SectionTitle>
          <Button onClick={takeAllToday} disabled={pendingTodayIntake.length === 0}>
            今日全部飲む
          </Button>
        </div>
        <ul className="flex flex-col gap-1 text-sm text-slate-700">
          {activeSupplements.map((s) => (
            <li key={s.id} className="flex justify-between border-b border-slate-100 pb-1">
              <span>{s.product_name}（{s.ingredient}）</span>
              <span className={alreadyTakenIds.has(s.id) ? 'text-emerald-600' : 'text-slate-400'}>
                {alreadyTakenIds.has(s.id) ? '摂取済み' : '未摂取'}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle>サプリ台帳</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="製品名" value={draft.product_name} onChange={(v) => setDraft({...draft, product_name: v})} />
          <TextField label="成分名" value={draft.ingredient} onChange={(v) => setDraft({...draft, ingredient: v})} />
          <NumberField
            label="1回あたりの量"
            value={draft.amount_per_unit}
            onChange={(v) => setDraft({...draft, amount_per_unit: v ?? 0})}
          />
          <TextField label="単位" value={draft.unit} onChange={(v) => setDraft({...draft, unit: v})} />
          <NumberField label="注意閾値（任意）" value={cautionThreshold} onChange={setCautionThreshold} />
          <TextField label="注意文言（任意）" value={cautionText} onChange={setCautionText} />
        </div>
        <div className="mt-3">
          <Button onClick={addSupplement} disabled={!draft.product_name.trim() || !draft.ingredient.trim()}>
            登録
          </Button>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {supplements.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
              <span>
                {s.product_name}（{s.ingredient} {s.amount_per_unit}{s.unit}／{s.default_frequency}）
              </span>
              <button onClick={() => removeSupplement(s.id)} className="text-xs text-rose-500">削除</button>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={pendingWarnings != null}
        title="サプリ成分の重複警告"
        message={
          <ul className="list-disc space-y-1 pl-4">
            {pendingWarnings?.map((w) => (
              <li key={w.ingredient}>
                「{w.ingredient}」の本日合計摂取量が {w.total} に達しています。{w.note}
              </li>
            ))}
          </ul>
        }
        onCancel={() => setPendingWarnings(null)}
        onConfirm={confirmDespiteWarning}
      />
    </div>
  );
}
