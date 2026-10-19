// 見積作成のとき、様邸の画面の右に見積書（市町村の書式）を縮めて映す。左で入力すると、すぐに右の見積書に入る。
// 見積書の欄をクリックすると、その欄の値を打ち直せる。内容・備考・施工費の金額は見積書だけの値で、仕切り計算表・請求書は変わらない。
// 金額・小計・消費税・合計は計算の欄（数量・単価・諸経費を直すと変わる）。

import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent} from 'react';
import {estimatePlaceLines, estimateTotals, estimateUnitPrice, overheadAuto, rounddown} from '../calc.ts';
import {autoNote, circled, FORM_INFO, formLines, KINDS, lineNote, noteText, photoNumbers, placeWork} from '../estimateForms.ts';
import {useDocMeta} from '../print/docMeta.ts';
import {KouikiForm, YukuhashiForm} from '../print/EstimateForms.tsx';
import type {EstimateForm, Job, Place, Row, Settings} from '../types.ts';
import {num, todayIso, yen} from '../util.ts';

/** A4横の幅（297mm）を画面の px に */
const PAGE_W = (297 / 25.4) * 96;
/** 見積書のまわりの余白（px） */
const PAD = 8;
const ZOOM_KEY = 'sasaoka-app:estimate-preview-zoom';

/** 見積書を大きく映すか（この端末で覚えておく） */
function loadZoom(): boolean {
  try {
    return localStorage.getItem(ZOOM_KEY) === 'large';
  } catch {
    return false;
  }
}

type Value = string | number | boolean;
type Field = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'check';
  value: Value;
  placeholder?: string;
  options?: [string, string][];
  suffix?: string;
};
/** 欄を直す入力欄の中身。commit には変えた項目だけが渡る */
type Spec = {
  title: string;
  fields: Field[];
  note?: string;
  reset?: {label: string; run: () => void};
  commit: (changed: Record<string, Value>) => void;
};

const toNumber = (v: Value) => {
  const n = Number(String(v).normalize('NFKC').replace(/[,，\s¥￥円]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** 縦に動かせる一番近い枠 */
function scrollBox(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export function EstimatePreview({
  job,
  settings: s,
  form,
  setJob,
  activeRowId,
  onActiveRow,
  onPrint,
  onHide,
  side,
}: {
  job: Job;
  settings: Settings;
  form: EstimateForm;
  setJob: (fn: (j: Job) => Job) => void;
  activeRowId: string | null;
  onActiveRow: (rowId: string | null) => void;
  onPrint: () => void;
  onHide?: () => void;
  side: boolean; // 入力の横に並べているとき（左で入力している行を、右の見積書の中で見えるところに出す）
}) {
  const [meta, setMeta] = useDocMeta(`est:${job.id}`, todayIso);
  const lines = useMemo(() => formLines(job, s, form), [job, s, form]);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const [innerH, setInnerH] = useState(0);
  const [editing, setEditing] = useState<{key: string; el: HTMLElement} | null>(null);
  // 大きく：印刷と同じ大きさ（横に動かして見る）。ふだんは幅に合わせて全体を映す
  const [large, setLarge] = useState(loadZoom);
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, large ? 'large' : 'fit');
    } catch {
      /* 覚えられなくても困らない */
    }
  }, [large]);
  const scale = large ? Math.max(1, fit) : Math.min(1, fit);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;
    const measure = () => {
      setFit(Math.max(0.2, (root.clientWidth - PAD * 2) / PAGE_W));
      setInnerH(inner.offsetHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // 左で入力している行を、見積書の中の見えるところに出す（横に並べているときだけ。動かすのは見積書の入った枠だけで、ページ全体は動かさない）
  useEffect(() => {
    if (!side || !activeRowId) return;
    const tr = rootRef.current?.querySelector(`tr[data-rows~="${activeRowId}"]`);
    const box = tr && scrollBox(tr);
    if (!tr || !box) return;
    const r = tr.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const top = Math.max(b.top, 0);
    const bottom = Math.min(b.bottom, window.innerHeight);
    if (r.top < top) box.scrollTop -= top - r.top + 8;
    else if (r.bottom > bottom) box.scrollTop += r.bottom - bottom + 8;
  }, [activeRowId, side]);

  // ---------------------------------------------------------------- 欄ごとの直し方
  const findRow = (rowId: string): {place: Place; row: Row; index: number} | null => {
    for (const place of job.places) {
      const index = place.rows.findIndex((r) => r.id === rowId);
      if (index >= 0) return {place, row: place.rows[index], index};
    }
    return null;
  };
  const updateRows = (ids: string[], patch: Partial<Row>) =>
    setJob((j) => ({...j, places: j.places.map((p) => ({...p, rows: p.rows.map((r) => (ids.includes(r.id) ? {...r, ...patch} : r))}))}));
  const updatePlace = (placeId: string, patch: Partial<Place>) => setJob((j) => ({...j, places: j.places.map((p) => (p.id === placeId ? {...p, ...patch} : p))}));
  const rate = s.estimateRate;
  const hourRate = s.estimateHourRate;

  const spec = (key: string): Spec | null => {
    const [kind, id, field] = key.split(':');
    if (kind === 'job') {
      const label = {customer: 'お客様名', insuredNo: '介護保険被保険者番号', address: '工事場所（住所）'}[id] ?? id;
      const name = id as 'customer' | 'insuredNo' | 'address';
      return {
        title: label,
        fields: [{name, label: name === 'customer' ? 'お客様名（「様邸」は付けません）' : label, type: 'text', value: job[name]}],
        note: name === 'address' ? '住所の市町村で書式が決まります（行橋市・苅田町／みやこ町・築上町・豊前市など）' : undefined,
        commit: (v) => setJob((j) => ({...j, [name]: String(v[name])})),
      };
    }
    if (kind === 'date') {
      return {
        title: '作成日',
        fields: [{name: 'date', label: '作成日', type: 'date', value: meta.date}],
        note: '空にすると「令和　年　月　日」のまま印刷します',
        commit: (v) => setMeta({...meta, date: String(v.date)}),
      };
    }
    if (kind === 'overhead') {
      const target = id === 'target';
      const t = estimateTotals(job, s);
      const current = target ? job.overheadTarget : job.overhead;
      const auto = overheadAuto(target ? t.target.subtotal : t.all.subtotal, s);
      return {
        title: target ? '諸経費（介護保険対象部分）' : '諸経費',
        fields: [{name: 'v', label: '諸経費', type: 'number', value: target ? t.target.overhead : t.all.overhead, suffix: '円'}],
        note: `小計×${num(s.estimateOverheadRate * 100)}%（切り捨て）は ${yen(auto)}円。端数の調整などで直せます`,
        reset: current !== null ? {label: `小計×${num(s.estimateOverheadRate * 100)}%（${yen(auto)}円）に戻す`, run: () => setJob((j) => ({...j, [target ? 'overheadTarget' : 'overhead']: null}))} : undefined,
        commit: (v) => setJob((j) => ({...j, [target ? 'overheadTarget' : 'overhead']: Math.round(toNumber(v.v))})),
      };
    }
    if (kind === 'place') {
      const place = job.places.find((p) => p.id === id);
      if (!place) return null;
      const autoPhoto = photoNumbers({places: job.places.map((p) => (p.id === id ? {...p, photo: 0} : p))}, rate).get(id) ?? 0;
      const photoField: Field = {name: 'photo', label: '写真番号（空なら見積書に出る順番）', type: 'number', value: place.photo || '', placeholder: autoPhoto ? String(autoPhoto) : ''};
      const kindField: Field = {name: 'kind', label: '改修の種類', type: 'select', value: String(place.kind), options: KINDS.map((k, i) => [String(i + 1), `${circled(i + 1)}${k}`])};
      const commit = (v: Record<string, Value>) =>
        updatePlace(id, {
          ...('name' in v ? {name: String(v.name)} : {}),
          ...('photo' in v ? {photo: Math.max(0, Math.round(toNumber(v.photo)))} : {}),
          ...('kind' in v ? {kind: Number(v.kind)} : {}),
        });
      if (field === 'name') {
        return {
          title: form === 'kouiki' ? '改修箇所（室名）' : '改修場所（写真No.）',
          fields: [{name: 'name', label: '箇所名', type: 'text', value: place.name}, ...(form === 'yukuhashi' ? [photoField] : [])],
          commit,
        };
      }
      if (field === 'work') {
        // 改修内容・工事名称は改修の種類から決まる（種類を選び直す）
        return {
          title: form === 'kouiki' ? '改修箇所毎工事名称（改修の種類から）' : '改修内容（改修の種類から）',
          fields: [kindField],
          note: `いまは「${placeWork(place, form)}」と書きます`,
          commit,
        };
      }
      if (field === 'photo') return {title: '写真番号', fields: [photoField], commit};
      if (field === 'kind') return {title: '改修の種類', fields: [kindField], commit};
      return null;
    }
    if (kind === 'excl') {
      const found = findRow(id);
      if (!found) return null;
      // 箇所の最初の施工費のまとまりは、まとまりの行すべてに付ける
      const ids = [id];
      if (found.row.kind === 'labor') for (let k = found.index + 1; k < found.place.rows.length && found.place.rows[k].kind === 'labor'; k++) ids.push(found.place.rows[k].id);
      return {
        title: '介護保険の対象',
        fields: [{name: 'excluded', label: '介護保険の対象外にする', type: 'check', value: found.row.excluded}],
        note:
          form === 'kouiki'
            ? '対象外にすると「全改修工事部分」だけに入り、「対象工事部分」は空になります（部材のすぐ下の施工費も同じ）'
            : '対象外にすると「介護保険対象外金額」に入り、「介護保険対象部分」は空になります（部材のすぐ下の施工費も同じ）',
        commit: (v) => updateRows(ids, {excluded: v.excluded === true}),
      };
    }
    if (kind === 'line') {
      const line = lines.find((l) => l.rowId === id);
      const found = findRow(id);
      if (!line || !found) return null;
      const row = found.row;
      const where = `${line.placeName || '箇所'}・${line.text}`;
      if (field === 'text') {
        return {
          title: line.isWork ? '施工費の名前' : '内容（規格・範囲）',
          fields: [{name: 'text', label: line.isWork ? '名前' : '内容', type: 'text', value: line.text, placeholder: line.autoText}],
          note: line.isWork ? '見積書だけの名前です（仕切り計算表は変わりません）' : '見積書だけに出ます（部材リスト・仕切り計算表の品名は変わりません）',
          reset: row.estText !== null ? {label: `元に戻す（${line.autoText}）`, run: () => updateRows([id], {estText: null})} : undefined,
          commit: (v) => {
            const t = String(v.text).trim();
            updateRows([id], {estText: t === '' || t === line.autoText ? null : t});
          },
        };
      }
      if (field === 'unit') {
        return {title: `単位：${where}`, fields: [{name: 'unit', label: '単位', type: 'text', value: row.unit, placeholder: '例：本・個・枚'}], commit: (v) => updateRows([id], {unit: String(v.unit).trim()})};
      }
      if (field === 'note') {
        const auto = noteText(autoNote(line, form, hourRate));
        return {
          title: `${form === 'kouiki' ? '算出根拠' : '備考（定価等）'}：${where}`,
          fields: [{name: 'note', label: '改行で2行にできます', type: 'textarea', value: noteText(lineNote(line, form, hourRate)), placeholder: auto}],
          note: '見積書だけに出ます',
          reset: line.note !== null ? {label: `元に戻す${auto ? `（${auto.replace('\n', '・')}）` : ''}`, run: () => updateRows([id], {estNote: null})} : undefined,
          commit: (v) => {
            const t = String(v.note).replace(/\s+$/, '');
            updateRows([id], {estNote: t === auto ? null : t});
          },
        };
      }
      if (line.isWork) {
        // 施工費のまとまり：金額を手で直す（最初の手間の行に持つ）。時間で書く書式は 時間×1時間の単価
        const work = estimatePlaceLines(found.place, rate).find((l) => l.kind === 'work' && l.rows[0].id === id);
        const sum = work?.kind === 'work' ? work.sum : line.amount;
        const reset = row.estAmount !== null ? {label: `取付手間の合計（${yen(sum)}円）に戻す`, run: () => updateRows([id], {estAmount: null})} : undefined;
        const setAmount = (amount: number) => updateRows([id], {estAmount: amount === sum ? null : amount});
        if (field === 'qty' && line.hourly) {
          return {
            title: `時間：${where}`,
            fields: [{name: 'hours', label: '時間', type: 'number', value: line.qty, suffix: `時間 × ${yen(hourRate)}円`}],
            note: `金額＝時間×${yen(hourRate)}円（見積書だけの金額。取付手間の合計は ${yen(sum)}円）`,
            reset,
            commit: (v) => setAmount(rounddown(toNumber(v.hours) * hourRate)),
          };
        }
        return {
          title: `施工費の金額：${where}`,
          fields: [{name: 'amount', label: '金額（1式）', type: 'number', value: line.amount, suffix: '円'}],
          note: `見積書だけの金額です（取付手間の合計は ${yen(sum)}円。仕切り計算表は変わりません）`,
          reset,
          commit: (v) => setAmount(Math.round(toNumber(v.amount))),
        };
      }
      if (field === 'qty') {
        if (line.cut) {
          return {
            title: `数量：${where}`,
            fields: [
              {name: 'lengthCm', label: '使う長さ（cm）', type: 'number', value: row.lengthCm, suffix: 'cm'},
              {name: 'pieceLengthM', label: '1本の長さ（m）', type: 'number', value: row.pieceLengthM, suffix: 'm'},
              {name: 'qty', label: '同じ長さの本数', type: 'number', value: row.qty},
            ],
            note: '数量＝使う長さ÷1本の長さ（例：60cm÷4m＝0.15本）。使う長さを空にすると規格品そのまま（1本）',
            commit: (v) =>
              updateRows([id], {
                ...('lengthCm' in v ? {lengthCm: Math.max(0, toNumber(v.lengthCm))} : {}),
                ...('pieceLengthM' in v ? {pieceLengthM: Math.max(0, toNumber(v.pieceLengthM))} : {}),
                ...('qty' in v ? {qty: Math.max(0, toNumber(v.qty))} : {}),
              }),
          };
        }
        return {
          title: `数量：${where}`,
          fields: [{name: 'qty', label: `数量${row.unit ? `（${row.unit}）` : ''}`, type: 'number', value: row.qty}],
          note: '仕切り計算表の数量も同じになります',
          commit: (v) => updateRows([id], {qty: Math.max(0, toNumber(v.qty))}),
        };
      }
      if (field === 'price') {
        const auto = estimateUnitPrice({...row, estPrice: null}, rate);
        return {
          title: `単価：${where}`,
          fields: [
            {name: 'price', label: '見積の単価', type: 'number', value: line.unitPrice, suffix: '円'},
            {name: 'listPrice', label: '定価（税抜）', type: 'number', value: row.listPrice || '', suffix: '円'},
          ],
          note: row.listPrice > 0 ? `何も直さなければ 定価×${rate}（${yen(auto)}円）` : '定価が入っていません',
          reset: row.estPrice !== null ? {label: `定価×${rate}（${yen(auto)}円）に戻す`, run: () => updateRows([id], {estPrice: null})} : undefined,
          commit: (v) =>
            updateRows([id], {
              ...('listPrice' in v ? {listPrice: Math.max(0, toNumber(v.listPrice))} : {}),
              ...('price' in v ? {estPrice: toNumber(v.price)} : {}),
            }),
        };
      }
    }
    return null;
  };

  // ---------------------------------------------------------------- クリックで開く・Tab で次の欄へ
  const editableCells = () => {
    const all = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-edit]') ?? []);
    // 同じ欄が続くもの（介護保険対象部分の4つの欄など）は1つにする
    return all.filter((el, i) => i === 0 || el.dataset.edit !== all[i - 1].dataset.edit);
  };
  const open = (el: HTMLElement) => {
    const key = el.dataset.edit;
    if (!key || !spec(key)) return;
    setEditing({key, el});
    const rowId = key.startsWith('line:') || key.startsWith('excl:') ? key.split(':')[1] : null;
    if (rowId) onActiveRow(rowId);
  };
  const onClick = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-edit]');
    if (el && rootRef.current?.contains(el)) {
      open(el);
      return;
    }
    const tr = target.closest<HTMLElement>('tr[data-rows]');
    if (tr?.dataset.rows) onActiveRow(tr.dataset.rows.split(' ')[0]);
  };
  const move = (from: HTMLElement, delta: number) => {
    const cells = editableCells();
    const at = cells.findIndex((c) => c === from || (c.dataset.edit === from.dataset.edit && c.contains(from)));
    const next = cells[(at < 0 ? 0 : at + delta + cells.length) % cells.length];
    if (next) open(next);
  };

  const css = [
    activeRowId && `.est-preview tr[data-rows~="${activeRowId}"] > td { background-color: #fef3c7; }`,
    editing && `.est-preview [data-edit="${editing.key}"] { box-shadow: inset 0 0 0 2px #2563eb; background-color: #dbeafe !important; }`,
  ]
    .filter(Boolean)
    .join('\n');
  const current = editing ? spec(editing.key) : null;

  return (
    <section className="rounded-xl border-2 border-indigo-900 bg-white shadow-sm" aria-label="見積書のでき上がり">
      <div className="flex flex-wrap items-center gap-2 border-b border-indigo-200 bg-indigo-900 px-3 py-1.5 text-white">
        <div className="text-sm font-bold">
          見積書のでき上がり
          <span className="ml-1 text-xs font-normal text-indigo-100" title={FORM_INFO[form].title}>
            （{FORM_INFO[form].name}）
          </span>
        </div>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            aria-pressed={large}
            onClick={() => setLarge((v) => !v)}
            className={`rounded border px-2 py-1 text-xs font-bold ${large ? 'border-white bg-white text-indigo-900' : 'border-white/40 hover:bg-white/10'}`}
            title={large ? '幅に合わせて全体を映す' : '印刷と同じ大きさで映す（横に動かして見る）'}
          >
            {large ? '全体を見る' : '🔍 拡大'}
          </button>
          <button type="button" onClick={onPrint} className="rounded bg-sky-500 px-2 py-1 text-xs font-bold hover:bg-sky-400">
            🖨 印刷
          </button>
          {onHide && (
            <button type="button" onClick={onHide} className="rounded border border-white/40 px-2 py-1 text-xs font-bold hover:bg-white/10" title="見積書を隠して、入力を広く使う">
              隠す
            </button>
          )}
        </div>
      </div>
      <p className="px-3 py-1.5 text-[11px] leading-4 text-slate-600">
        左で入力すると、ここに入ります。<b>欄をクリックすると直せます</b>（Tab で次の欄）。字が小さくて見にくいときは「🔍 拡大」。金額・小計・消費税・合計は、数量・単価・諸経費から計算します。
      </p>
      <div ref={rootRef} className={`est-preview bg-slate-500 ${large ? 'overflow-x-auto' : 'overflow-hidden'}`} onClick={onClick}>
        <div style={{boxSizing: 'content-box', width: PAGE_W * scale, height: innerH * scale, padding: PAD}}>
          <div ref={innerRef} style={{width: PAGE_W, transform: `scale(${scale})`, transformOrigin: 'top left'}}>
            {form === 'kouiki' ? <KouikiForm job={job} settings={s} editable /> : <YukuhashiForm job={job} settings={s} date={meta.date} editable />}
          </div>
        </div>
        {css && <style>{css}</style>}
      </div>
      {editing && current && editing.el.isConnected && (
        <CellEditor
          key={editing.key}
          anchor={editing.el}
          spec={current}
          onClose={() => setEditing(null)}
          onTab={(delta) => {
            const from = editing.el;
            // 直した値が入ってから次の欄を開く
            window.setTimeout(() => move(from, delta), 0);
          }}
        />
      )}
    </section>
  );
}

/** 欄の下に出す入力欄。Enter で決定、Esc でやめる、Tab で決定して次の欄。外をクリックしても決定 */
function CellEditor({anchor, spec, onClose, onTab}: {anchor: HTMLElement; spec: Spec; onClose: () => void; onTab: (delta: number) => void}) {
  const [values, setValues] = useState<Record<string, Value>>(() => Object.fromEntries(spec.fields.map((f) => [f.name, f.value])));
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [pos, setPos] = useState({left: 0, top: 0, below: true});
  const boxRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const latest = useRef({values, dirty});
  latest.current = {values, dirty};

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const {values: v, dirty: d} = latest.current;
    const changed = Object.fromEntries([...d].map((k) => [k, v[k]]));
    if (Object.keys(changed).length > 0) spec.commit(changed);
  };

  // 欄の位置に合わせる（見積書の中を動かしたり、画面の大きさが変わったりしても付いていく）
  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = boxRef.current?.offsetHeight ?? 200;
      const w = boxRef.current?.offsetWidth ?? 300;
      const below = r.bottom + 6 + h <= window.innerHeight || r.top - 6 - h < 0;
      setPos({left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), top: below ? r.bottom + 6 : r.top - 6 - h, below});
    };
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [anchor]);

  // 外をクリックしたら決定して閉じる（別の欄をクリックしたときは、そのあとでその欄が開く）
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      commit();
      onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  });

  const set = (name: string, v: Value) => {
    setValues((x) => ({...x, [name]: v}));
    setDirty((d) => new Set(d).add(name));
  };
  const onKey = (e: ReactKeyboardEvent, f: Field) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      done.current = true;
      onClose();
    } else if (e.key === 'Enter' && (f.type !== 'textarea' || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
      onClose();
    } else if (e.key === 'Tab') {
      const inputs = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('input, select, textarea') ?? []);
      const at = inputs.indexOf(e.target as HTMLElement);
      const leaving = e.shiftKey ? at === 0 : at === inputs.length - 1;
      if (leaving) {
        e.preventDefault();
        commit();
        onClose();
        onTab(e.shiftKey ? -1 : 1);
      }
    }
  };

  const input = (f: Field, first: boolean) => {
    const common = {
      'aria-label': f.label,
      autoFocus: first,
      onKeyDown: (e: ReactKeyboardEvent) => onKey(e, f),
      onFocus: (e: {currentTarget: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement}) => {
        const el = e.currentTarget;
        if ('select' in el && el.tagName !== 'SELECT') requestAnimationFrame(() => (el as HTMLInputElement).select());
      },
    };
    const box = 'w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
    if (f.type === 'check') {
      return (
        <label className="flex items-center gap-2 py-1 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={values[f.name] === true} onChange={(e) => set(f.name, e.target.checked)} {...common} className="h-4 w-4" />
          {f.label}
        </label>
      );
    }
    if (f.type === 'select') {
      return (
        <select value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)} {...common} className={`${box} h-9`}>
          {f.options?.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      );
    }
    if (f.type === 'textarea') {
      return <textarea value={String(values[f.name])} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} rows={2} {...common} className={`${box} py-1.5`} />;
    }
    return (
      <div className="flex items-center gap-1">
        <input
          type={f.type === 'date' ? 'date' : 'text'}
          inputMode={f.type === 'number' ? 'decimal' : undefined}
          value={String(values[f.name])}
          onChange={(e) => set(f.name, e.target.value)}
          placeholder={f.placeholder}
          {...common}
          className={`${box} h-9 ${f.type === 'number' ? 'text-right tabular-nums' : ''}`}
        />
        {f.suffix && <span className="whitespace-nowrap text-xs text-slate-500">{f.suffix}</span>}
      </div>
    );
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={spec.title}
      className="fixed z-50 w-[300px] max-w-[calc(100vw-16px)] rounded-lg border border-blue-300 bg-white p-3 shadow-2xl"
      style={{left: pos.left, top: pos.top}}
    >
      <div className="mb-2 truncate text-xs font-bold text-blue-900" title={spec.title}>
        {spec.title}
      </div>
      <div className="space-y-2">
        {spec.fields.map((f, i) => (
          <label key={f.name} className="grid gap-1 text-[11px] font-bold text-slate-600">
            {f.type !== 'check' && f.label}
            {input(f, i === 0)}
          </label>
        ))}
      </div>
      {spec.note && <p className="mt-2 text-[11px] leading-4 text-slate-500">{spec.note}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
        {spec.reset && (
          <button
            type="button"
            onClick={() => {
              done.current = true;
              spec.reset?.run();
              onClose();
            }}
            className="mr-auto rounded px-1.5 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50"
          >
            ↺ {spec.reset.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            done.current = true;
            onClose();
          }}
          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          やめる
        </button>
        <button
          type="button"
          onClick={() => {
            commit();
            onClose();
          }}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
        >
          決定（Enter）
        </button>
      </div>
    </div>
  );
}
