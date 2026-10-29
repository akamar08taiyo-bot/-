// 見積書作成アプリと仕切り計算・請求書アプリの両方で使う、様邸の部品（複製・取付手間を数える・仕切価格を入れる）。

import {useState} from 'react';
import {isBlankRow, shikiriPrice} from '../calc.ts';
import {NO_SHINSEI} from '../estimateForms.ts';
import {copyRows, laborRange, laborSpot, replaceRange} from '../rows.ts';
import type {AppData, Job, Material, Place, Row} from '../types.ts';
import type {Update} from '../useStore.ts';
import {num, uid, yen} from '../util.ts';
import {LaborCounter} from './Pickers.tsx';
import {Btn, Modal, NumberInput} from './ui.tsx';

export function copyJob(job: Job): Job {
  const now = Date.now();
  // 複製はゴミ箱に入れない（ゴミ箱の様邸は複製できないが、念のため）。平面図の図もそのお宅のもの（写真と同じ）なので、複製には入れない
  // 売上見込みの月も、複製した見積書は請求する月から。取り込んだ書類の金額は元の様邸のもの（複製に入れると売上見込み・受注残に2回入る）
  const {trashedAt: _trashedAt, planPhoto: _plan, planMarks: _planMarks, salesMonth: _salesMonth, uriage: _uriage, imported: _imported, tokuteiImport: _tokutei, ...rest} = job;
  return {
    ...rest,
    id: uid('j'),
    customer: job.customer + '（コピー）',
    // 写真（写真貼付用紙）とその撮影日・向き・大きさ・書き込みはそのお宅の写真なので、複製には入れない
    places: job.places.map(({photos: _photos, photoDates: _dates, photoEdits: _edits, photoMarks: _marks, photoTiles: _tiles, ...p}) => ({
      ...p,
      id: uid('p'),
      rows: copyRows(p.rows),
    })),
    insuredNo: '',
    shinsei: {...NO_SHINSEI}, // 申請書の項目（フリガナ・生年月日・性別など）はお客様のことなので、番号と同じく消す
    riyu: undefined, // 理由書（身体状況・介護状況など）もお客様のことなので消す
    estDate: '', // 見積もり作成日は複製した日（空なら作った日）
    overhead: null,
    overheadTarget: null,
    order: null, // 発注書はコピーした見積書から作り直す
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 取付手間を数える画面を、箇所全体（rowId なし）か、選んでいる行の所に向けて開く（`laborSpot`。部材ならそのすぐ下の手間＝同上施工費、
 * 同上施工費ならそのまとまり、空白の行ならその行に入れる）
 */
export function LaborPickerFor({
  place,
  rowId,
  data,
  onRows,
  onClose,
}: {
  place: Place;
  rowId: string | null;
  data: AppData;
  onRows: (rows: Row[]) => void;
  onClose: () => void;
}) {
  const rows = place.rows;
  // 入れる所は開いたときに決める（空白の行は、施工費を入れるとなくなるため）
  const [spot] = useState(() => laborSpot(rows, rowId));
  const range = laborRange(rows, spot);
  const owner = spot.owner ? rows.find((r) => r.id === spot.owner) : null;
  return (
    <LaborCounter
      title={owner ? `「${owner.name || '部材'}」の施工費（見積書の「同上施工費」）` : `「${place.name || '箇所'}」の取付手間`}
      rows={rows.slice(range[0], range[1]).filter((r) => r.id !== spot.drop)}
      labor={data.labor}
      laborRate={data.settings.estimateLaborRate}
      onChange={(next) => onRows(replaceRange(rows, range, next))}
      onClose={onClose}
    />
  );
}

/** 仕切価格が空欄の部材の行（請求書では、その部材代が0円になる。定価からは計算しない）。空白の行はのぞく */
export const missingShikiri = (job: Job) => job.places.flatMap((p) => p.rows).filter((r) => r.kind === 'material' && shikiriPrice(r) === 0 && !isBlankRow(r));

/** 仕切価格の入っていない部材に、仕切価格を入れる（部材リストにある部材は、部材リストの仕切価格も同じにできる） */
export function ShikiriPriceDialog({
  job,
  materials,
  setJob,
  update,
  onClose,
}: {
  job: Job;
  materials: Material[];
  setJob: (fn: (j: Job) => Job) => void;
  update: Update;
  onClose: () => void;
}) {
  // 開いたときの行を覚えておく（仕切価格を入れても一覧から消えないように）
  const [ids] = useState(() => new Set(missingShikiri(job).map((r) => r.id)));
  const [toMaster, setToMaster] = useState(true);
  const list = job.places.flatMap((p) => p.rows.filter((r) => ids.has(r.id)).map((r) => ({place: p, row: r})));
  const setPrice = (row: Row, price: number) => {
    setJob((j) => ({
      ...j,
      places: j.places.map((p) => ({
        ...p,
        rows: p.rows.map((r) => (r.id === row.id ? {...r, price} : r)),
      })),
    }));
    if (toMaster && row.refId && materials.some((m) => m.id === row.refId)) {
      update('materials', (all) => all.map((m) => (m.id === row.refId ? {...m, price, updatedAt: Date.now()} : m)));
    }
  };
  return (
    <Modal
      wide
      title="仕切価格を入れる（請求書の部材代）"
      onClose={onClose}
      footer={
        <Btn color="white" onClick={onClose}>
          閉じる
        </Btn>
      }
    >
      <p className="mb-2 text-xs text-slate-600">
        見積書に入れた部材のうち、仕切価格（工務店への請求に使う価格）がまだ入っていないものです。入れるとすぐ請求書に入ります。
      </p>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">箇所</th>
            <th className="px-2 py-1 text-left">部材</th>
            <th className="px-2 py-1 text-right">数量</th>
            <th className="px-2 py-1 text-right">定価</th>
            <th className="px-2 py-1 text-right">仕切価格</th>
          </tr>
        </thead>
        <tbody>
          {list.map(({place, row}) => (
            <tr key={row.id} className="border-t border-slate-100">
              <td className="px-2 py-1">{place.name || '（箇所）'}</td>
              <td className="px-2 py-1">{[row.maker, row.code, row.name].filter(Boolean).join(' ') || '（品名なし）'}</td>
              <td className="px-2 py-1 text-right tabular-nums">{num(row.qty)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{row.listPrice > 0 ? yen(row.listPrice) : '—'}</td>
              <td className="px-2 py-1 text-right">
                <NumberInput
                  value={row.price}
                  onChange={(n) => setPrice(row, Math.max(0, n))}
                  className="w-28"
                  ariaLabel={`${row.name || '部材'}の仕切価格`}
                  blankZero
                  placeholder="仕切価格"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={toMaster} onChange={(e) => setToMaster(e.target.checked)} className="h-4 w-4" />
        部材リストにある部材は、部材リストの仕切価格も同じにする（次から自動で入ります）
      </label>
    </Modal>
  );
}
