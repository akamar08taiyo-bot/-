// 申請書を作る前に、丸で囲む項目（性別・要介護状態区分など）を選ぶ画面（ユーザーの指示：選んだものを申請書で丸で囲む）。
// 選んだものは見積書に残す（作り直すときもそのまま）。項目は保険者の申請書にあるものだけ（shinseiMarkKeys）

import {Btn, Modal} from '../components/ui.tsx';
import {INSURER_INFO, MARK_INFO, NO_MARKS} from '../estimateForms.ts';
import {shinseiMarkKeys} from '../shinsei.ts';
import type {Insurer, ShinseiMarks} from '../types.ts';

export function ShinseiDialog({
  insurer,
  marks: saved,
  onChange,
  onMake,
  onClose,
}: {
  insurer: Insurer;
  marks: ShinseiMarks | undefined;
  onChange: (marks: ShinseiMarks) => void;
  onMake: () => void;
  onClose: () => void;
}) {
  const marks = {...NO_MARKS, ...saved};
  // もう一度押すと選ばない（丸をつけない）
  const pick = (key: keyof ShinseiMarks, value: string) => onChange({...marks, [key]: marks[key] === value ? '' : value});
  return (
    <Modal
      title={`📝 申請書を作成（${INSURER_INFO[insurer].name}）`}
      onClose={onClose}
      footer={
        <>
          <Btn color="white" onClick={onClose}>
            やめる
          </Btn>
          <Btn color="softGreen" onClick={onMake}>
            📝 申請書を作成（Excel）
          </Btn>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">丸で囲むものを選んでください（選ばないものは丸をつけません）。</p>
      <div className="space-y-3">
        {shinseiMarkKeys(insurer).map((key) => (
          <div key={key} role="group" aria-label={MARK_INFO[key].label}>
            <div className="mb-1.5 text-xs font-bold text-slate-600">{MARK_INFO[key].label}</div>
            <div className="flex flex-wrap gap-2">
              {MARK_INFO[key].options.map((o) => {
                const on = marks[key] === o;
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pick(key, o)}
                    className={`min-w-[3.25rem] rounded-full px-3.5 py-1.5 text-sm font-bold transition ${
                      on ? 'border-2 border-slate-800 bg-amber-50 text-slate-900' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
