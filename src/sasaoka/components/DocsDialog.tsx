// 様邸の画面の「📗 Excelで保存」と「✉ メールで送付」：住宅改修申請書・工事見積書・特定福祉用具申請書・販売見積書・理由書の Excel を、チェックしたものだけ
// まとめて保存する・メールに付ける（ユーザーの指示「Excel で保存っていうので、一つに…今までのまとめて保存の機能、要はチェックして、必要な分だけ保存していく。
// デフォルトはその開いているページ…のみチェック。…メールで送付機能についても、基本的には一括で全てメールできるような形に…デフォルトは一つだけチェック」2026-10-30。
// 前はタブごとの「📗 〇〇をExcelで保存」と、別の「📦 まとめて保存」（前に選んだものを覚えていた。2026-10-26）があった）。
// ファイルは1つずつ、いつもの名前で保存する（ブラウザが「複数のファイルのダウンロード」を一度だけ聞くことがある）。メールは mailDraft.ts。
// 特定福祉用具の2つは特定福祉用具のアプリに作ってもらう（tokuteiLink.ts の tokuteiFiles）。作れない書類（見積書に行がない・特定福祉用具の商品がない）は選べない
import {useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {hasEstimateRows} from '../calc.ts';
import {isBlankShinsei, jobInsurer} from '../estimateForms.ts';
import {XLSX_TYPE, estimateXlsx} from '../estimateXlsx.ts';
import {canMakeShinsei, riyuBook, shinseiBook} from '../estimate/shinseiFiles.ts';
import {docsMail, isAppleMobile, isMobileDevice, openMailto, share, shareData, stillActive} from '../mailDraft.ts';
import type {Attachment, Mail} from '../mailDraft.ts';
import {estimateDateOf} from '../print/docMeta.ts';
import {tokuteiFiles, tokuteiHasItems} from '../tokuteiLink.ts';
import type {TokuteiView} from '../tokuteiLink.ts';
import type {Job, Settings} from '../types.ts';
import {downloadBlob} from '../util.ts';
import {Btn, Modal, useToast} from './ui.tsx';

/** 書類（様邸の画面のタブと同じ並び・同じ名前） */
export type DocKind = 'shinsei' | 'estimate' | 'tokutei' | 'hanbai' | 'riyu';
const KINDS: [DocKind, string][] = [
  ['shinsei', '住宅改修申請書'],
  ['estimate', '工事見積書'],
  ['tokutei', '特定福祉用具申請書'],
  ['hanbai', '販売見積書'],
  ['riyu', '理由書'],
];
type Mode = 'excel' | 'mail';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 作れない書類と、そのわけ（作れるものは ''） */
function whyNot(job: Job): Record<DocKind, string> {
  const insurer = jobInsurer(job);
  const tokutei = tokuteiHasItems(job.id);
  return {
    shinsei: !canMakeShinsei(insurer) ? '保険者の申請書がありません' : isBlankShinsei(job) ? '何も入っていません' : '',
    estimate: hasEstimateRows(job) ? '' : '見積書に行がありません',
    tokutei: tokutei ? '' : '特定福祉用具の商品がありません',
    hanbai: tokutei ? '' : '特定福祉用具の商品がありません',
    riyu: '',
  };
}

/**
 * 「📗 Excelで保存」（mode 'excel'）・「✉ メールで送付」（mode 'mail'）のボタンと、書類を選ぶ画面。初めは開いているタブ（view）の書類だけにチェック。
 * onBeforeSave：作る前に、開いている特定福祉用具のタブの変更と、この様邸の変更を保存させる（App.tsx）
 */
export function DocsButton({mode, job, s, view, onBeforeSave}: {mode: Mode; job: Job; s: Settings; view: DocKind; onBeforeSave?: () => Promise<unknown>}) {
  const toast = useToast();
  const [picked, setPicked] = useState<Set<DocKind> | null>(null); // null は閉じている
  const [busy, setBusy] = useState(false);
  // 作ったあと、押した操作の続きと見なされなくなって、メールを開けなかった・共有メニューを出せなかったとき：もう一度押してもらう（mail が null は Excelで保存）
  const [retry, setRetry] = useState<{mail: Mail | null; files: Attachment[]; data: ShareData | null} | null>(null);
  // iPhone・iPad で共有メニューを使えないとき：1つずつ押して保存してもらう（続けて保存すると初めの1つしか保存されない）。mail があればそのあとメールを開く
  const [taps, setTaps] = useState<{files: Attachment[]; done: string[]; mail?: Mail} | null>(null);
  const why = whyNot(job);
  const chosen = KINDS.filter(([k]) => picked?.has(k) && !why[k]).map(([k]) => k);
  const open = () => {
    setRetry(null);
    setTaps(null);
    setPicked(new Set([view]));
  };
  const close = () => !busy && setPicked(null);
  const toggle = (k: DocKind) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  /** チェックした書類の Excel を作る（並びはタブの順） */
  const makeFiles = async (): Promise<{files: Attachment[]; notes: string[]}> => {
    const files: Attachment[] = [];
    const notes: string[] = [];
    const add = (bytes: Uint8Array, name: string) => files.push({name, type: XLSX_TYPE, bytes});
    const insurer = jobInsurer(job);
    if (chosen.includes('shinsei') && insurer) {
      const r = await shinseiBook(job, insurer, s);
      add(r.bytes, r.fileName);
      if (r.missingPhotos) notes.push(`写真${r.missingPhotos}枚はこの端末にないので貼っていません`);
      if (r.unreadablePhotos) notes.push(`写真${r.unreadablePhotos}枚は読めなかったので貼っていません`);
      if (r.planMissing) notes.push('平面図の図はこの端末にないので貼っていません');
    }
    if (chosen.includes('estimate')) {
      const r = estimateXlsx(job, s, estimateDateOf(job));
      add(r.bytes, r.fileName);
    }
    const views: TokuteiView[] = [...(chosen.includes('tokutei') ? ['shinsei' as const] : []), ...(chosen.includes('hanbai') ? ['quote' as const] : [])];
    if (views.length) for (const b of await tokuteiFiles(job, views)) add(b.bytes, b.name);
    if (chosen.includes('riyu')) {
      const r = await riyuBook(job, s);
      add(r.bytes, r.fileName);
    }
    return {files, notes};
  };
  const download = async (files: Attachment[]) => {
    for (const [i, f] of files.entries()) {
      if (i) await wait(400); // 続けて保存するときは少しあける（ブラウザが落とさないように）
      downloadBlob(new Blob([f.bytes as BlobPart], {type: f.type}), f.name);
    }
  };
  /**
   * 保存する：パソコン・Android は続けて保存。iPhone・iPad で2つ以上は共有メニュー（「ファイルに保存」でまとめて保存できる。メールのアプリにも渡せる）。
   * 共有メニューを使えなければ、1つずつ押して保存
   */
  const save = async (files: Attachment[], data: ShareData | null = files.length > 1 && isAppleMobile() ? shareData({subject: 'Excelで保存', body: ''}, files) : null) => {
    if (files.length > 1 && isAppleMobile()) {
      const how = data ? await share(data) : 'failed';
      if (how === 'shared') {
        toast(`${files.length}つのファイルを渡しました`);
        setPicked(null);
      } else if (how === 'tap') setRetry({mail: null, files, data});
      else if (how === 'failed') setTaps({files, done: []});
      return;
    }
    await download(files);
    toast(files.length === 1 ? `「${files[0].name}」を保存しました` : `${files.length}つのファイルを保存しました`);
    setPicked(null);
  };
  /** パソコン：添付を保存して、メールのソフトを開く（iPhone・iPad で共有メニューを使えず2つ以上なら、1つずつ押して保存してから） */
  const mailto = async (mail: Mail, files: Attachment[], saved: boolean) => {
    if (!saved && files.length > 1 && isAppleMobile()) {
      setTaps({files, done: [], mail});
      return;
    }
    if (!saved) await download(files);
    if (!stillActive()) {
      setRetry({mail, files, data: null});
      return;
    }
    openMailto(mail);
    toast(`メールを開きました。保存した${files.length ? `${files.length}つの` : ''}ファイルを添付してください`);
    setPicked(null);
  };
  /** スマホ・タブレット：共有メニュー（できなければパソコンと同じ） */
  const send = async (mail: Mail, files: Attachment[], data: ShareData | null) => {
    if (data) {
      const how = await share(data);
      if (how === 'shared') {
        toast('メールのアプリに渡しました');
        setPicked(null);
        return;
      }
      if (how === 'cancelled') return;
      if (how === 'tap') {
        setRetry({mail, files, data});
        return;
      }
    }
    await mailto(mail, files, false);
  };
  const run = async () => {
    setBusy(true);
    setRetry(null);
    try {
      await onBeforeSave?.();
      const {files, notes} = await makeFiles();
      if (!files.length) {
        toast(mode === 'mail' ? '付けるものがありません' : '保存するものがありません', 'error');
        return;
      }
      if (mode === 'excel') await save(files);
      else {
        const labels = KINDS.filter(([k]) => chosen.includes(k)).map(([, l]) => l);
        const mail = docsMail(
          job,
          s,
          labels,
          files.map((f) => f.name),
        );
        await send(mail, files, isMobileDevice() ? shareData(mail, files) : null);
      }
      for (const n of notes) toast(n, 'error');
    } catch (e) {
      toast(`${mode === 'mail' ? 'メールを作れませんでした' : '保存できませんでした'}：${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  const title = mode === 'excel' ? 'Excelで保存' : 'メールで送付（Excel）';
  const go = mode === 'excel' ? `📗 ${chosen.length}つ保存する` : `✉ ${chosen.length}つ付けてメールを作る`;
  return (
    <>
      {mode === 'excel' ? (
        <Btn color="softGreen" onClick={open}>
          📗 Excelで保存
        </Btn>
      ) : (
        <Btn color="white" onClick={open}>
          ✉ メールで送付
        </Btn>
      )}
      {/* 書類を選ぶ画面は body の直下に出す（上の段のボタンの並びの中に置くと、スマホの2列の並びの指定（幅・余白など）がこの画面にもかかって細くなった） */}
      {picked &&
        createPortal(
          <Modal
            title={title}
            onClose={close}
            footer={
              taps ? (
                <>
                  <Btn color="white" onClick={() => setPicked(null)}>
                    閉じる
                  </Btn>
                  {taps.mail && (
                    <Btn color="softBlue" onClick={() => taps.mail && void mailto(taps.mail, taps.files, true)}>
                      ✉ メールを開く
                    </Btn>
                  )}
                </>
              ) : retry ? (
                <>
                  <Btn color="white" onClick={() => setPicked(null)}>
                    やめる
                  </Btn>
                  {/* 押したその場で開く（作っているあいだに、押した操作の続きと見なされなくなったので） */}
                  <Btn
                    color="softBlue"
                    onClick={() => void (!retry.mail ? save(retry.files, retry.data) : retry.data ? send(retry.mail, retry.files, retry.data) : mailto(retry.mail, retry.files, true))}
                  >
                    {!retry.mail ? `📤 ${retry.files.length}つのファイルを渡す` : retry.data ? '📤 メールのアプリに渡す' : '✉ メールを開く'}
                  </Btn>
                </>
              ) : (
                <>
                  <Btn color="white" onClick={close} disabled={busy}>
                    やめる
                  </Btn>
                  <Btn color={mode === 'excel' ? 'softGreen' : 'softBlue'} onClick={() => void run()} disabled={busy || chosen.length === 0}>
                    {busy ? '作っています…' : go}
                  </Btn>
                </>
              )
            }
          >
            {taps ? (
              // 1つずつ押して保存（押したその場で保存するので、iPhone・iPad でも全部保存できる）
              <div role="group" aria-label="1つずつ保存" className="grid gap-2 text-base">
                <p className="text-sm text-slate-600">1つずつ押して保存してください</p>
                {taps.files.map((f) => {
                  const done = taps.done.includes(f.name);
                  return (
                    <Btn
                      key={f.name}
                      color={done ? 'white' : 'softGreen'}
                      className="justify-start text-left"
                      onClick={() => {
                        downloadBlob(new Blob([f.bytes as BlobPart], {type: f.type}), f.name);
                        setTaps((t) => t && {...t, done: [...new Set([...t.done, f.name])]});
                      }}
                    >
                      {done ? '✓' : '📗'} {f.name}
                    </Btn>
                  );
                })}
              </div>
            ) : (
              <div role="group" aria-label={mode === 'excel' ? '保存する書類' : 'メールに付ける書類'} className="grid gap-2 text-base">
                {KINDS.map(([k, label]) => (
                  <label key={k} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 ${why[k] ? 'border-slate-200 text-slate-400' : 'border-slate-300 hover:bg-emerald-50'}`}>
                    <input type="checkbox" checked={!!picked.has(k) && !why[k]} disabled={!!why[k] || busy || !!retry} onChange={() => toggle(k)} className="h-5 w-5" />
                    {/* 書類の名前は1行のまま（スマホでは選べないわけが次の行へ） */}
                    <span className="min-w-0">
                      <span className="whitespace-nowrap font-bold">{label}</span>
                      {why[k] && <span className="ml-1 inline-block text-xs">（{why[k]}）</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Modal>,
          document.body,
        )}
    </>
  );
}

/** 様邸の画面の上の段に置く2つのボタン（App.tsx で作って、5つのタブの画面に渡す） */
export type JobDocs = {excel: ReactNode; mail: ReactNode};
