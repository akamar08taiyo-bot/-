import {useEffect, useRef, useState} from 'react';
import type {DragEvent} from 'react';
import {CATALOG_SITES, EMPTY_SCAN, itemFromScan, SCAN_PATH, scanDraft} from '../scanItem.ts';
import type {ScanDraft} from '../scanItem.ts';
import type {SaleItem, Settings, TaxType} from '../types.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {MakerInput} from './MakerInput.tsx';
import {Btn, btnClass, Modal, NumberInput, TextInput, useToast} from './ui.tsx';

/** 画像（スクリーンショット）のファイル。貼り付け・落としたものの中の最初の1枚 */
const imageOf = (items: Iterable<{kind?: string; type: string; getAsFile?: () => File | null}> | null) => {
  for (const it of items ?? []) if (it.type.startsWith('image/')) return it.getAsFile?.() ?? (it as unknown as File);
  return null;
};

/**
 * 販売見積書の「📷 スクショから自動認識」（scanItem.ts）。左に受注簿ツールの読み取り（画像の欄だけ）、右に読み取った商品。
 * カタログの商品の画面を切り取って貼り付けると、商品名・型番・定価・仕切りが右に入る。直して「見積書に入れる」（閉じるまで続けて入れられる）
 */
export function ScanDialog({settings, makers, onAdd, onClose}: {settings: Settings; makers: string[]; onAdd: (item: SaleItem) => void; onClose: () => void}) {
  const toast = useToast();
  const frame = useRef<HTMLIFrameElement>(null);
  const [draft, setDraft] = useState<ScanDraft>(EMPTY_SCAN);
  const last = useRef('');

  useEffect(() => {
    // 読み取った商品（受注簿ツールが受注簿の欄に入れた値）。同じ値が何度か届くので、変わったときだけ右の欄を入れ替える
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== location.origin || !frame.current || ev.source !== frame.current.contentWindow) return;
      const msg: unknown = ev.data;
      if (typeof msg !== 'object' || msg === null || (msg as {type?: unknown}).type !== 'taiyo-hacchu-scanned') return;
      const d = scanDraft((msg as {item?: unknown}).item);
      const key = JSON.stringify(d);
      if (!d || key === last.current) return;
      last.current = key;
      setDraft(d);
    };
    // 窓のどこで貼り付けても読む（受注簿ツールの画像の欄で貼り付けたときは、受注簿ツールが読む）
    const onPaste = (ev: ClipboardEvent) => {
      const file = imageOf(ev.clipboardData ? [...ev.clipboardData.items] : null);
      if (!file) return;
      ev.preventDefault();
      frame.current?.contentWindow?.postMessage({type: 'taiyo-scan-image', file}, location.origin);
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const onDrop = (ev: DragEvent<HTMLDivElement>) => {
    const file = imageOf([...ev.dataTransfer.files]);
    if (!file) return;
    ev.preventDefault();
    frame.current?.contentWindow?.postMessage({type: 'taiyo-scan-image', file}, location.origin);
  };
  const set = (patch: Partial<ScanDraft>) => setDraft((d) => ({...d, ...patch}));
  const add = () => {
    onAdd(itemFromScan(draft, settings));
    toast(`見積書に入れました：${draft.name.trim()}`);
    setDraft(EMPTY_SCAN);
  };
  const label = 'grid gap-1 text-xs font-bold text-slate-600';

  return (
    <Modal
      wide
      title="📷 スクショから自動認識"
      onClose={onClose}
      footer={
        <Btn color="white" onClick={onClose}>
          閉じる
        </Btn>
      }
    >
      <div className="space-y-3" onDragOver={(ev) => ev.preventDefault()} onDrop={onDrop}>
        <div className="flex flex-wrap gap-2" aria-label="カタログを開く">
          {CATALOG_SITES.map((c) => (
            <a key={c.url} href={c.url} target="_blank" rel="noreferrer" className={btnClass('white')}>
              🔗 {c.name}のカタログを開く
            </a>
          ))}
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <iframe
            ref={frame}
            data-scan
            title="スクリーンショットの読み取り"
            src={SCAN_PATH}
            className="block h-[60vh] min-h-[28rem] w-full rounded-xl border border-slate-200 bg-white"
          />
          <section className="space-y-3 rounded-xl border border-teal-200 bg-white p-4 shadow-sm" aria-label="読み取った商品">
            <h3 className="text-sm font-bold text-slate-800">読み取った商品</h3>
            <label className={label}>
              商品名
              <TextInput value={draft.name} onChange={(name) => set({name})} className="w-full min-w-0" aria-label="読み取った商品名" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>
                メーカー
                <MakerInput value={draft.maker} onChange={(maker) => set({maker})} choices={makers} className="w-full" ariaLabel="読み取ったメーカー" placeholder="" />
              </label>
              <label className={label}>
                型番
                <TextInput value={draft.code} onChange={(code) => set({code})} className="w-full min-w-0" aria-label="読み取った型番" />
              </label>
              <label className={label}>
                定価（税抜）
                <NumberInput value={draft.listPrice} onChange={(listPrice) => set({listPrice})} ariaLabel="読み取った定価" blankZero className="w-full min-w-0" />
              </label>
              <label className={label}>
                仕切り（税抜・任意）
                <NumberInput value={draft.cost} onChange={(cost) => set({cost})} ariaLabel="読み取った仕切り" blankZero className="w-full min-w-0" />
              </label>
              <label className={label}>
                税
                <select
                  value={draft.taxType}
                  onChange={(e) => set({taxType: e.target.value as TaxType})}
                  aria-label="読み取った税"
                  className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm font-normal"
                >
                  <option value="10%">課税（10%）</option>
                  <option value="8%">軽減（8%）</option>
                  <option value="非課税">非課税</option>
                </select>
              </label>
              <label className={label}>
                単位
                <TextInput value={draft.unit} onChange={(unit) => set({unit})} className="w-full min-w-0" aria-label="読み取った単位" />
              </label>
            </div>
            <div className={label}>
              種目
              <CategorySelect category={draft.category} sub={draft.sub} onChange={(category, sub) => set({category, sub})} ariaLabel="読み取った種目" className="w-full min-w-0" />
            </div>
            <label className={label}>
              発注先
              <TextInput value={draft.supplier} onChange={(supplier) => set({supplier})} className="w-full min-w-0" aria-label="読み取った発注先" />
            </label>
            <Btn color="blue" className="w-full" disabled={!draft.name.trim()} onClick={add}>
              見積書に入れる
            </Btn>
          </section>
        </div>
      </div>
    </Modal>
  );
}
