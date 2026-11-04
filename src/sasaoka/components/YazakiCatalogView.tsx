// 部材を選ぶ画面の中の「📖 矢崎化工カタログから選ぶ」（yazakiCatalog.ts）。ページの絵の上の品番の枠か、右の品番の一覧を押すと部材が入る。
// 部材リストに同じ品番があれば、その部材（商品名・定価・仕切）。色の記号のない品番（施工イメージのページ）は、色を選ぶ。
// 部材リストにない品番は、品番だけの行（金額は見積書で打つ）
import {type CSSProperties, useEffect, useMemo, useRef, useState} from 'react';
import {catalogMaterials, codeKey, yazakiImage, yazakiPages, yazakiSearch} from '../yazakiCatalog.ts';
import type {Material} from '../types.ts';
import {yen} from '../util.ts';
import {Btn, TextInput} from './ui.tsx';

const pct = (v: number) => `${Math.max(0, v * 100).toFixed(2)}%`;

export function YazakiCatalogView({
  materials,
  start,
  onAdd,
  onAddCode,
  onBack,
}: {
  materials: Material[];
  start?: {page: number; code?: string} | null;
  onAdd: (m: Material) => void; // 部材リストの部材を入れる
  onAddCode: (code: string) => void; // 部材リストにない品番を入れる
  onBack: () => void;
}) {
  const first = yazakiPages.find((p) => p.page === start?.page) ?? yazakiPages[0];
  const [page, setPage] = useState(first.page);
  const [query, setQuery] = useState('');
  const [mark, setMark] = useState<string | null>(start?.code ?? null); // 光らせる品番（部材の「📖 p.13」から開いたとき・押した品番）
  const [choose, setChoose] = useState<{
    code: string;
    list: Material[];
  } | null>(null);
  const current = yazakiPages.find((p) => p.page === page) ?? first;
  const idx = yazakiPages.indexOf(current);
  const hits = useMemo(() => (query.trim() ? yazakiSearch(query, materials) : []), [query, materials]);
  useEffect(() => setChoose(null), [page]);
  // 探した品番がこのページになければ、見つかった最初のページへ
  useEffect(() => {
    if (hits.length && !hits.includes(page)) setPage(hits[0]);
  }, [hits]);

  // 光らせる品番を見える所へ（部材の「📖 p.12」から開いたとき。ページの絵は縦に長いので、下の方の品番が見えなかった）
  const imgRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (!start?.code || page !== start.page) return;
    imgRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(start.code)}"]`)?.scrollIntoView({block: 'center'});
  }, [loaded]);
  // 上の段（ページ送り・探す）はスクロールしても上に残す（窓の中の余白 16px の分も白く覆う）。右の一覧はその下に残す（ページの下の方の品番を押したときも、色を選ぶ欄が見えるように）
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(48);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 色を選ぶ欄を開いたら見える所へ（スマホは一覧がページの絵の下）
  const chooseRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (choose) chooseRef.current?.scrollIntoView({block: 'nearest'});
  }, [choose]);
  // 右の一覧は同じ品番を1つに（施工イメージのページには同じ品番が何度も出る）
  const listed = useMemo(() => [...new Map(current.codes.map((c) => [c.code, c])).values()], [current]);
  const matches = (code: string) => catalogMaterials(materials, code);
  const pick = (code: string) => {
    setMark(code);
    const list = matches(code);
    if (list.length === 1) onAdd(list[0]);
    else if (list.length > 1) setChoose({code, list});
    else onAddCode(code);
  };
  const q = codeKey(query);
  const hit = (code: string) => !!q && codeKey(code).includes(q);

  return (
    <div aria-label="矢崎化工カタログ" role="region">
      <div ref={barRef} className="sticky -top-4 z-10 -mx-1 -mt-4 bg-white px-1 pt-4 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <Btn small color="white" onClick={onBack}>
            ← 部材リストに戻る
          </Btn>
          <span className="text-sm font-bold text-slate-700">📖 矢崎化工カタログ</span>
          <span className="flex items-center gap-2">
            <Btn small color="white" onClick={() => idx > 0 && setPage(yazakiPages[idx - 1].page)} disabled={idx <= 0} aria-label="前のページ">
              ◀
            </Btn>
            <select value={page} onChange={(e) => setPage(Number(e.target.value))} className="h-8 rounded-md border border-slate-300 px-2 text-sm" aria-label="ページ">
              {yazakiPages.map((p) => (
                <option key={p.page} value={p.page}>
                  p.{p.page}
                </option>
              ))}
            </select>
            <Btn small color="white" onClick={() => idx < yazakiPages.length - 1 && setPage(yazakiPages[idx + 1].page)} disabled={idx >= yazakiPages.length - 1} aria-label="次のページ">
              ▶
            </Btn>
          </span>
          <TextInput value={query} onChange={setQuery} placeholder="品番・商品名でページを探す" className="min-w-[8rem] flex-1 sm:min-w-[12rem]" aria-label="カタログから探す" />
        </div>
        {query.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs" role="group" aria-label="見つかったページ">
            {hits.length === 0 ? (
              <span className="text-slate-500">見つかりませんでした</span>
            ) : (
              hits.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-pressed={p === page}
                  className={`rounded border px-2 py-0.5 ${p === page ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  p.{p}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div ref={imgRef} className="relative w-full overflow-hidden rounded-md border border-slate-300 bg-slate-100" style={{aspectRatio: '1240 / 1754'}}>
          <img src={yazakiImage(page)} alt={`矢崎化工カタログ p.${page}`} className="absolute inset-0 h-full w-full select-none" draggable={false} onLoad={() => setLoaded((n) => n + 1)} />
          {current.codes.map((c, i) => {
            const n = matches(c.code).length;
            const on = mark === c.code || hit(c.code);
            return (
              <button
                key={i}
                type="button"
                data-code={c.code}
                onClick={() => pick(c.code)}
                title={n ? `${c.code}を入れる` : `${c.code}（部材リストにない品番）`}
                aria-label={`${c.code}を入れる`}
                className={`absolute rounded-sm border-2 transition ${n ? 'border-emerald-500 bg-emerald-400/10 hover:bg-emerald-400/30' : 'border-dashed border-slate-400 hover:bg-slate-400/20'} ${on ? 'ring-4 ring-amber-400' : ''}`}
                style={{
                  left: pct(c.x - 0.006),
                  top: pct(c.y - 0.004),
                  width: pct(c.w + 0.012),
                  height: pct(c.h + 0.008),
                }}
              />
            );
          })}
        </div>
        <div className="lg:sticky lg:top-[var(--bar)] lg:max-h-[calc(100vh-var(--bar)-12.5rem)] lg:self-start lg:overflow-y-auto" style={{'--bar': `${barH - 16}px`} as CSSProperties}>
          {choose && (
            <div ref={chooseRef} className="mb-3 rounded-md border-2 border-emerald-400 bg-emerald-50 p-2" role="group" aria-label={`${choose.code}の色・種類を選ぶ`}>
              <div className="mb-1 flex items-center gap-2 text-sm font-bold text-emerald-900">
                {choose.code} の色・種類
                <button type="button" onClick={() => setChoose(null)} className="ml-auto rounded px-1.5 text-slate-500 hover:bg-white" aria-label="選ぶのをやめる">
                  ✕
                </button>
              </div>
              <div className="grid gap-1">
                {choose.list.map((m) => (
                  <button key={m.id} type="button" onClick={() => onAdd(m)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm hover:bg-emerald-100">
                    <span className="font-bold text-slate-800">{m.code}</span>
                    <span className="ml-2 text-xs text-slate-500">{m.name}</span>
                    {m.listPrice > 0 && <span className="float-right tabular-nums text-slate-600">{yen(m.listPrice)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-1 text-xs font-bold text-slate-500">p.{page} の品番</div>
          {listed.length === 0 ? (
            <p className="text-sm text-slate-500">このページには品番がありません。</p>
          ) : (
            <ul className="grid gap-1" aria-label="このページの品番">
              {listed.map((c, i) => {
                const list = matches(c.code);
                const one = list.length === 1 ? list[0] : null;
                return (
                  <li key={i} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${mark === c.code ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-slate-800">{c.code}</div>
                      <div className="truncate text-xs text-slate-500">{one ? one.name : list.length > 1 ? `${list.length}つの色・種類` : '部材リストにない品番'}</div>
                    </div>
                    <Btn small color={list.length ? 'emerald' : 'white'} onClick={() => pick(c.code)} aria-label={`${c.code}を追加`}>
                      {list.length > 1 ? '選ぶ' : '＋ 追加'}
                    </Btn>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
