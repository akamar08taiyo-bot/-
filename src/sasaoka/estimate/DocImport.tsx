// 見積書の一覧・見積もりの入口の「📥 取り込む」：申請書・見積書・理由書の Excel を選ぶ／ドロップすると、名字ごとにまとめた確かめの画面を出し、
// 「取り込む」で様邸を作る（同じ名字の様邸があれば、そこに足す＝合算）。読み取り・まとめ方は importDocs.ts
import {useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {jobName} from '../calc.ts';
import {Btn, DropArea, Modal, TextInput, useToast} from '../components/ui.tsx';
import {applyImport, DOC_LABEL, planImport, readDoc} from '../importDocs.ts';
import type {ImportGroup, ReadDoc} from '../importDocs.ts';
import type {AppData, Job} from '../types.ts';
import type {Update} from '../useStore.ts';
import {monthLabel, todayIso, yen} from '../util.ts';

/** 確かめの画面の1まとまり（name・target・month・separate は画面で直せる） */
type Draft = ImportGroup & {separate: boolean};

const KIND_STYLE: Record<ReadDoc['kind'], string> = {
  shinsei: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  estimate: 'border-sky-300 bg-sky-50 text-sky-800',
  riyu: 'border-amber-300 bg-amber-50 text-amber-800',
};

function amountText(d: ReadDoc): string {
  if (d.kind === 'estimate' && d.total) return `合計 ${yen(d.total)}円`;
  if (d.kind === 'shinsei' && d.total) return `改修費用 ${yen(d.total)}円`;
  return '';
}

/**
 * 取り込みの部品：start（ファイルを読んで確かめの画面を出す）・pick（ファイルを選ぶ）と、画面に置くもの（ファイルを選ぶ欄・確かめの画面）。
 * onImported は取り込んだあと（一覧をその月にする）
 */
export function useDocImport(data: AppData, update: Update, onImported: (month: string) => void): {start: (files: File[]) => void; pick: () => void; element: ReactNode} {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const s = data.settings;

  const start = async (files: File[]) => {
    const docs: ReadDoc[] = [];
    const unread: string[] = [];
    for (const f of files) {
      const d = readDoc(new Uint8Array(await f.arrayBuffer()), f.name, s, f.lastModified);
      if (d) docs.push(d);
      else unread.push(f.name);
    }
    if (docs.length === 0) {
      toast(unread.length ? `読めませんでした：${unread.join('、')}` : 'ファイルがありません');
      return;
    }
    setBad(unread);
    setDrafts(planImport(docs, data.jobs, todayIso()).map((g) => ({...g, separate: false})));
  };
  const close = () => {
    setDrafts(null);
    setBad([]);
  };
  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds && ds.map((d) => (d.key === key ? {...d, ...p} : d)));
  const live = new Map(data.jobs.filter((j) => !j.trashedAt).map((j) => [j.id, j]));
  const count = (drafts ?? []).reduce((n, d) => n + d.docs.length, 0);

  const run = () => {
    if (!drafts) return;
    const now = Date.now();
    const made: Job[] = [];
    const changed = new Map<string, Job>();
    for (const g of drafts) {
      if (g.docs.length === 0) continue;
      const name = g.name.trim();
      if (g.separate) {
        // 1つずつ（まとめない）：書類ごとに新しい様邸
        for (const d of g.docs) made.push(applyImport(null, [d], d.name || name, g.month, s, now));
        continue;
      }
      const target = g.target ? (changed.get(g.target) ?? live.get(g.target) ?? null) : null;
      const job = applyImport(target, g.docs, name, g.month, s, now);
      if (target) changed.set(target.id, job);
      else made.push(job);
    }
    update('jobs', (jobs) => [...jobs.map((j) => changed.get(j.id) ?? j), ...made]);
    toast(`${count}件を取り込みました`);
    const first = drafts.find((g) => g.docs.length > 0);
    close();
    if (first) onImported(first.target && !first.separate ? (live.get(first.target)?.month ?? first.month) : first.month);
  };

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple
        className="hidden"
        aria-label="取り込むファイル"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void start(files);
        }}
      />
      {drafts && (
        <Modal
          title="📥 申請書・見積書・理由書の取り込み"
          onClose={close}
          wide
          footer={
            <>
              <Btn color="white" onClick={close}>
                やめる
              </Btn>
              <Btn color="softBlue" disabled={count === 0} onClick={run}>
                取り込む（{count}件）
              </Btn>
            </>
          }
        >
          <div className="space-y-3" aria-label="取り込む書類">
            {drafts.map((g) => {
              const target = g.target ? live.get(g.target) : undefined;
              return (
                <section key={g.key} className="rounded-lg border border-slate-200 bg-white p-3" aria-label={`${g.name || 'お客様名なし'}の書類`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <TextInput value={g.name} onChange={(v) => patch(g.key, {name: v})} className="w-48 text-base font-bold" aria-label="お客様名" placeholder="お客様名" disabled={g.docs.length === 0 || (!!target && !g.separate)} />
                    <span className="text-base text-slate-600">様邸</span>
                    {g.docs.length > 0 && (
                      <select
                        value={g.separate ? '' : g.target}
                        disabled={g.separate}
                        onChange={(e) => patch(g.key, {target: e.target.value})}
                        className="h-9 rounded border border-slate-300 bg-white px-2 text-sm"
                        aria-label="入れる様邸"
                      >
                        <option value="">新しく作る</option>
                        {g.candidates.map((id) => {
                          const j = live.get(id);
                          return j ? (
                            <option key={id} value={id}>
                              {jobName(j)}に足す（合算）
                            </option>
                          ) : null;
                        })}
                      </select>
                    )}
                    {g.docs.length > 0 && (
                      <label className="flex items-center gap-1 text-sm text-slate-600">
                        売上月
                        <input type="month" value={g.month} onChange={(e) => e.target.value && patch(g.key, {month: e.target.value})} disabled={!!target && !g.separate} className="h-9 rounded border border-slate-300 px-1 text-sm" aria-label="売上月" />
                      </label>
                    )}
                    {g.docs.length > 1 && (
                      <label className="flex items-center gap-1 text-sm text-slate-600">
                        <input type="checkbox" checked={g.separate} onChange={(e) => patch(g.key, {separate: e.target.checked})} className="h-4 w-4" />
                        まとめない（1つずつ）
                      </label>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {g.docs.map((d) => (
                      <li key={d.hash} className="flex flex-wrap items-center gap-2">
                        <span className={`rounded border px-1.5 py-0.5 ${KIND_STYLE[d.kind]}`}>{DOC_LABEL[d.kind]}</span>
                        <span className="text-slate-800">{d.file}</span>
                        {d.name && d.name !== g.name && <span className="text-slate-500">（{d.name}）</span>}
                        <span className="tabular-nums text-slate-700">{amountText(d)}</span>
                      </li>
                    ))}
                    {g.done.map(({doc, jobId}) => (
                      <li key={doc.hash} className="flex flex-wrap items-center gap-2 text-slate-400">
                        <span className="rounded border border-slate-200 px-1.5 py-0.5">{DOC_LABEL[doc.kind]}</span>
                        <span>{doc.file}</span>
                        <span>取り込み済み（{live.get(jobId) ? jobName(live.get(jobId)!) : ''}）</span>
                      </li>
                    ))}
                  </ul>
                  {target && !g.separate && g.docs.length > 0 && <p className="mt-1 text-xs text-slate-500">{monthLabel(target.month)}の{jobName(target)}に足します</p>}
                </section>
              );
            })}
            {bad.length > 0 && (
              <p className="text-sm text-rose-700">
                読めないファイル：{bad.join('、')}
                {bad.some((f) => /\.xls$/i.test(f)) && '（.xls は Excel で .xlsx に保存し直すと読めます）'}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
  return {start: (files) => void start(files), pick: () => input.current?.click(), element};
}

/** 見積もりの入口の取り込みの欄（ファイルをドロップ・押して選ぶ） */
export function DocImportDrop({onFiles, onPick}: {onFiles: (files: File[]) => void; onPick: () => void}) {
  return <DropArea name="申請書・見積書・理由書を取り込む" label="📥 申請書・見積書・理由書を取り込む" hint="ここにドロップ・押して選ぶ（.xlsx）" onFiles={onFiles} onPick={onPick} big className="w-full" />;
}
