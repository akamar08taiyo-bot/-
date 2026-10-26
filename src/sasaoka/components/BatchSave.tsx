// 様邸の画面の「📦 まとめて保存」：住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書の Excel を、チェックしたものだけまとめて保存する
// （ユーザーの指示「住宅改修申請書・特定福祉用具申請書・住宅改修見積もり・特定福祉用具販売見積もりを一括で保存できる機能をつける　チェック項目のみ一括で保存する」2026-10-26）。
// どのタブからでも同じ（上のタブのすぐ右）。ファイルは1つずつ、いつもの名前で保存する（ブラウザが「複数のファイルのダウンロード」を一度だけ聞くことがある）。
// 特定福祉用具の2つは特定福祉用具のアプリに作ってもらう（tokuteiLink.ts の tokuteiFiles）。作れない書類（見積書に行がない・特定福祉用具の商品がない）は選べない
import {useState} from 'react';
import {hasEstimateRows} from '../calc.ts';
import {isBlankShinsei, jobInsurer} from '../estimateForms.ts';
import {XLSX_TYPE, estimateXlsx} from '../estimateXlsx.ts';
import {canMakeShinsei, shinseiBook} from '../estimate/shinseiFiles.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {tokuteiFiles, tokuteiHasItems} from '../tokuteiLink.ts';
import type {TokuteiView} from '../tokuteiLink.ts';
import type {Job, Settings} from '../types.ts';
import {downloadBlob} from '../util.ts';
import {Btn, Modal, useToast} from './ui.tsx';

type Kind = 'shinsei' | 'estimate' | 'tokutei' | 'hanbai';
const KINDS: [Kind, string][] = [
  ['shinsei', '住宅改修申請書'],
  ['estimate', '工事見積書'],
  ['tokutei', '特定福祉用具申請書'],
  ['hanbai', '販売見積書'],
];
const KEY = 'taiyo-sasaoka-batch-save-v1'; // 前に選んだもの（この端末だけ）

function lastPicked(): Set<Kind> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    if (Array.isArray(v)) return new Set(v.filter((x): x is Kind => KINDS.some(([k]) => k === x)));
  } catch {
    /* 読めなければ全部 */
  }
  return new Set(KINDS.map(([k]) => k));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BatchSave({job, s, onBeforeSave}: {job: Job; s: Settings; onBeforeSave?: () => Promise<unknown>}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<Kind>>(lastPicked);
  const [busy, setBusy] = useState(false);
  const insurer = jobInsurer(job);
  const tokutei = tokuteiHasItems(job.id);
  const why: Record<Kind, string> = {
    shinsei: !canMakeShinsei(insurer) ? '保険者の申請書がありません' : isBlankShinsei(job) ? '何も入っていません' : '',
    estimate: hasEstimateRows(job) ? '' : '見積書に行がありません',
    tokutei: tokutei ? '' : '特定福祉用具の商品がありません',
    hanbai: tokutei ? '' : '特定福祉用具の商品がありません',
  };
  const chosen = KINDS.filter(([k]) => picked.has(k) && !why[k]).map(([k]) => k);
  const toggle = (k: Kind) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem(KEY, JSON.stringify([...next]));
      } catch {
        /* 覚えられなくても保存はできる */
      }
      return next;
    });
  const save = async () => {
    setBusy(true);
    const saved: string[] = [];
    const notes: string[] = [];
    const download = async (bytes: Uint8Array, name: string) => {
      if (saved.length) await wait(400); // 続けて保存するときは少しあける（ブラウザが落とさないように）
      downloadBlob(new Blob([bytes], {type: XLSX_TYPE}), name);
      saved.push(name);
    };
    try {
      await onBeforeSave?.();
      if (chosen.includes('shinsei') && insurer) {
        const r = await shinseiBook(job, insurer, s);
        await download(r.bytes, r.fileName);
        if (r.missingPhotos) notes.push(`写真${r.missingPhotos}枚はこの端末にないので貼っていません`);
        if (r.unreadablePhotos) notes.push(`写真${r.unreadablePhotos}枚は読めなかったので貼っていません`);
        if (r.planMissing) notes.push('平面図の図はこの端末にないので貼っていません');
      }
      if (chosen.includes('estimate')) {
        const r = estimateXlsx(job, s, estimateDateOf(job));
        await download(r.bytes, r.fileName);
      }
      const views: TokuteiView[] = [...(chosen.includes('tokutei') ? ['shinsei' as const] : []), ...(chosen.includes('hanbai') ? ['quote' as const] : [])];
      if (views.length) for (const b of await tokuteiFiles(job, views)) await download(b.bytes, b.name);
      toast(saved.length ? `${saved.length}つのファイルを保存しました` : '保存するものがありません', saved.length ? 'ok' : 'error');
      for (const n of notes) toast(n, 'error');
      if (saved.length) setOpen(false);
    } catch (e) {
      toast(`${saved.length ? `${saved.length}つ保存しましたが、` : ''}保存できませんでした：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Btn color="softGreen" onClick={() => setOpen(true)}>
        📦 まとめて保存
      </Btn>
      {open && (
        <Modal
          title="まとめて保存（Excel）"
          onClose={() => !busy && setOpen(false)}
          footer={
            <>
              <Btn color="white" onClick={() => setOpen(false)} disabled={busy}>
                やめる
              </Btn>
              <Btn color="softGreen" onClick={() => void save()} disabled={busy || chosen.length === 0}>
                {busy ? '保存しています…' : `📗 ${chosen.length}つ保存する`}
              </Btn>
            </>
          }
        >
          <div role="group" aria-label="保存する書類" className="grid gap-2 text-base">
            {KINDS.map(([k, label]) => (
              <label key={k} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${why[k] ? 'border-slate-200 text-slate-400' : 'border-slate-300 hover:bg-emerald-50'}`}>
                <input type="checkbox" checked={picked.has(k) && !why[k]} disabled={!!why[k] || busy} onChange={() => toggle(k)} className="h-5 w-5" />
                <span className="font-bold">{label}</span>
                {why[k] && <span className="text-xs">（{why[k]}）</span>}
              </label>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
