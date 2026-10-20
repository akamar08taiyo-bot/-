import {estimatePlaceLines, placeTotals} from '../calc.ts';
import {kitRows} from '../rows.ts';
import type {AppMode, Kit, LaborItem, Material, Row} from '../types.ts';
import {num, yen} from '../util.ts';
import {Btn, Modal, TextInput} from './ui.tsx';

const rowLabel = (r: Row) => `${r.name || (r.kind === 'labor' ? '工事' : '部材')}×${num(r.qty)}`;

/** 部材＋施工費（常用）（よく使う部材と取付手間の組み合わせ）を選んで箇所に入れる画面。名前の変更・削除もここでする */
export function KitPicker({
  kits,
  materials,
  labor,
  mode,
  rate,
  placeName,
  onInsert,
  onRename,
  onRemove,
  onClose,
}: {
  kits: Kit[];
  materials: Material[];
  labor: LaborItem[];
  mode: AppMode;
  rate: number;
  placeName: string;
  onInsert: (rows: Row[]) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (kit: Kit) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      wide
      title={
        <>
          「{placeName || '箇所'}」に部材＋施工費（常用）を入れる
          <span className="ml-2 text-xs font-normal text-slate-500">部材と取付手間がまとめて入ります（入れたあとで数量などを直せます）</span>
        </>
      }
      onClose={onClose}
      footer={
        <Btn color="blue" onClick={onClose}>
          閉じる
        </Btn>
      }
    >
      {kits.length === 0 ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          部材＋施工費（常用）はまだありません。部材と取付手間を入れた箇所で「この箇所を部材＋施工費（常用）に登録」を押すと、同じ組み合わせを次から1回で入れられます。
        </p>
      ) : (
        <ul className="space-y-2">
          {kits.map((kit) => {
            const rows = kitRows(kit, materials, labor);
            const shikiri = placeTotals({rows}).total;
            const est = estimatePlaceLines({rows}, rate).reduce((n, l) => n + l.amount, 0);
            return (
              <li key={kit.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput value={kit.name} onChange={(name) => onRename(kit.id, name)} className="min-w-[12rem] flex-1 font-bold" aria-label="部材＋施工費（常用）の名前" />
                  <span className="text-sm tabular-nums text-slate-600">
                    {mode === 'estimate' ? `見積 ${yen(est)}円（税抜）` : `仕切り ${yen(shikiri)}円`}
                  </span>
                  <Btn small color="emerald" onClick={() => onInsert(rows)}>
                    ＋ 入れる
                  </Btn>
                  <button
                    type="button"
                    onClick={() => onRemove(kit)}
                    className="rounded px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50"
                    aria-label={`部材＋施工費（常用）「${kit.name}」を削除`}
                  >
                    削除
                  </button>
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{rows.map(rowLabel).join('・') || '（中身なし）'}</div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
