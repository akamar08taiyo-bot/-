// 部材を選ぶ画面の中の「📖 カタログから選ぶ」（makerCatalogs.ts。矢崎化工・TOTO を上の段で切り替える）。ページの絵の上の品番の枠か、右の品番の一覧を押すと部材が入る。
// 部材リストに同じ品番があれば、その部材（商品名・定価・仕切）。色の記号のない品番（矢崎化工の施工イメージのページ）・色ちがいのある品番（TOTO の #NW1 など）は、色を選ぶ。
// 部材リストにない品番は、品番だけの行（金額は見積書で打つ）。
// 上の段に目次（押すとその見出しのページへ）、下にページのスライダー（ユーザーの指示「カタログは目次みたいな感じで飛べるようにする」
// 「ページを一気にとばせるように、下の方にスライダーを設置する」2026-11-05）。入れた品番は − ＋ で数量を変える（「数量をちょうせいできるようにする」）
import {type CSSProperties, useEffect, useMemo, useRef, useState} from 'react';
import {BOOKS, type BookId, bookOf, catalogMaterials, catalogSearch, codeKey, tocOf} from '../makerCatalogs.ts';
import type {Material} from '../types.ts';
import {num, yen} from '../util.ts';
import {Btn, TextInput} from './ui.tsx';

const pct = (v: number) => `${Math.max(0, v * 100).toFixed(2)}%`;

type Props = {
  materials: Material[];
  start: {book: BookId; page: number; code?: string};
  onAdd: (m: Material, code: string) => void; // 部材リストの部材を入れる（code は押したカタログの品番）
  onAddCode: (code: string, maker: string) => void; // 部材リストにない品番を入れる
  // この画面で入れたその品番の行の数量と − ＋（入れていなければ null。Pickers.tsx）
  qtyOf?: (code: string) => {n: number; plus: () => void; minus: () => void} | null;
  onBack: () => void;
  onBook?: (id: BookId) => void; // 切り替えたカタログ（次に開くときもこのカタログ）
};

/** カタログを切り替えると、ページ・探す・光らせる品番は初めから（key で作り直す） */
export function MakerCatalogView(props: Props) {
  const [start, setStart] = useState(props.start);
  useEffect(() => setStart(props.start), [props.start]);
  const switchTo = (id: BookId) => {
    setStart({book: id, page: 0});
    props.onBook?.(id);
  };
  return <BookView key={`${start.book}:${start.page}:${start.code ?? ''}`} {...props} start={start} onSwitch={switchTo} />;
}

function BookView({materials, start, onAdd, onAddCode, qtyOf, onBack, onSwitch}: Props & {onSwitch: (id: BookId) => void}) {
  const book = bookOf(start.book);
  const pages = book.pages;
  const first = pages.find((p) => p.page === start.page) ?? pages.find((p) => p.page === book.startPage) ?? pages[0];
  const [page, setPage] = useState(first.page);
  const [query, setQuery] = useState('');
  const [mark, setMark] = useState<string | null>(start?.code ?? null); // 光らせる品番（部材の「📖 p.13」から開いたとき・押した品番）
  const [choose, setChoose] = useState<{
    code: string;
    list: Material[];
  } | null>(null);
  const current = pages.find((p) => p.page === page) ?? first;
  const idx = pages.indexOf(current);
  const section = tocOf(book, page);
  // ページの選ぶ欄は目次の見出しごとにまとめる（最初の見出しより前のページは見出しなし）
  const groups = useMemo(() => {
    const out: {title: string; pages: number[]}[] = [];
    for (const p of pages) {
      const title = tocOf(book, p.page)?.title ?? '';
      if (out.at(-1)?.title === title) out.at(-1)!.pages.push(p.page);
      else out.push({title, pages: [p.page]});
    }
    return out;
  }, [book, pages]);
  const hits = useMemo(() => (query.trim() ? catalogSearch(book, query, materials) : []), [book, query, materials]);
  useEffect(() => setChoose(null), [page]);
  // 探した品番がこのページになければ、見つかった最初のページへ
  useEffect(() => {
    if (hits.length && !hits.includes(page)) setPage(hits[0]);
  }, [hits]);

  // 光らせる品番を見える所へ（部材の「📖 p.12」から開いたとき。ページの絵は縦に長いので、下の方の品番が見えなかった）
  const imgRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    if (!start.code || page !== start.page) return;
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
  // 並びはページを読む順（左の段の上から、次に右の段。PDF の文字の順はばらばら）
  const listed = useMemo(
    () => [...new Map(current.codes.map((c) => [c.code, c])).values()].sort((a, b) => Number(a.x >= 0.5) - Number(b.x >= 0.5) || a.y - b.y || a.x - b.x),
    [current],
  );
  const matches = (code: string) => catalogMaterials(materials, code, book);
  const pick = (code: string) => {
    setMark(code);
    const list = matches(code);
    // もう入れた品番（色を選ぶものはのぞく）をページの絵で押したら、数量を1つ増やす（別の行にしない）
    const step = list.length <= 1 ? qtyOf?.(code) : null;
    if (step && step.n > 0) step.plus();
    else if (list.length === 1) onAdd(list[0], code);
    else if (list.length > 1) setChoose({code, list});
    else onAddCode(code, book.maker);
  };
  const q = codeKey(query);
  const hit = (code: string) => !!q && codeKey(code).includes(q);

  return (
    <div aria-label={`${book.maker}カタログ`} role="region">
      <div ref={barRef} className="sticky -top-4 z-10 -mx-1 -mt-4 bg-white px-1 pt-4 pb-1">
        <div className="flex flex-wrap items-center gap-2">
          <Btn small color="white" onClick={onBack}>
            ← 部材リストに戻る
          </Btn>
          {/* カタログの切り替え（2026-11-04 に TOTO を足した） */}
          <span className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="カタログ">
            {BOOKS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => b.id !== book.id && onSwitch(b.id)}
                aria-pressed={b.id === book.id}
                className={`h-8 px-3 text-sm ${b.id === book.id ? 'bg-emerald-50 font-bold text-emerald-900' : 'bg-white text-slate-600 hover:bg-slate-50'} [&+&]:border-l [&+&]:border-slate-300`}
              >
                {b.maker}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-2">
            <Btn small color="white" onClick={() => idx > 0 && setPage(pages[idx - 1].page)} disabled={idx <= 0} aria-label="前のページ">
              ◀
            </Btn>
            <select value={page} onChange={(e) => setPage(Number(e.target.value))} className="h-8 rounded-md border border-slate-300 px-2 text-sm" aria-label="ページ">
              {groups.map((g) =>
                g.title ? (
                  <optgroup key={g.pages[0]} label={g.title}>
                    {g.pages.map((n) => (
                      <option key={n} value={n}>
                        p.{n}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  g.pages.map((n) => (
                    <option key={n} value={n}>
                      p.{n}
                    </option>
                  ))
                ),
              )}
            </select>
            <Btn small color="white" onClick={() => idx < pages.length - 1 && setPage(pages[idx + 1].page)} disabled={idx >= pages.length - 1} aria-label="次のページ">
              ▶
            </Btn>
          </span>
          <TextInput value={query} onChange={setQuery} placeholder="品番・商品名でページを探す" className="min-w-[8rem] flex-1 sm:min-w-[12rem]" aria-label="カタログから探す" />
        </div>
        {/* 目次：押すとその見出しのページへ。いまのページの見出しは緑。スマホは横に動かして見る（上の段を高くしない） */}
        {book.toc.length > 0 && (
          <div className="-mx-1 mt-1.5 flex items-center gap-1 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible" role="group" aria-label="目次">
            <span className="shrink-0 text-xs font-bold text-slate-500">目次</span>
            {book.toc.map((t) => (
              <button
                key={t.page}
                type="button"
                onClick={() => setPage(t.page)}
                aria-pressed={section === t}
                title={`p.${t.page}`}
                className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${section === t ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-emerald-50'}`}
              >
                {t.title}
              </button>
            ))}
          </div>
        )}
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
          <img src={book.image(page)} alt={`${book.maker}カタログ p.${page}`} className="absolute inset-0 h-full w-full select-none" draggable={false} onLoad={() => setLoaded((n) => n + 1)} />
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
        <div className="min-w-0 lg:sticky lg:top-[var(--bar)] lg:max-h-[calc(100vh-var(--bar)-12.5rem)] lg:self-start lg:overflow-y-auto lg:overflow-x-hidden" style={{'--bar': `${barH - 16}px`} as CSSProperties}>
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
                  <button key={m.id} type="button" onClick={() => onAdd(m, choose.code)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm hover:bg-emerald-100">
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
            // 1列を欄の幅に固定する（grid-cols-1＝minmax(0, 1fr)。前は列が長い商品名の幅まで広がり、右の「＋ 追加」が切れて横に動いた。
            // ユーザーの指摘「横がきれていてみえません」2026-11-05。マツ六の p.43）。ボタンは縮めない
            <ul className="grid grid-cols-1 gap-1" aria-label="このページの品番">
              {listed.map((c, i) => {
                const list = matches(c.code);
                const one = list.length === 1 ? list[0] : null;
                const step = qtyOf?.(c.code);
                return (
                  <li key={i} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${mark === c.code ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-slate-800">{c.code}</div>
                      <div className="truncate text-xs text-slate-500">{one ? one.name : list.length > 1 ? `${list.length}つの色・種類` : '部材リストにない品番'}</div>
                    </div>
                    {step && step.n > 0 ? (
                      // 入れた品番は − ＋ で数量を変える（0 にすると行を消す。部材リストの「＋ 追加」と同じ）
                      <span className="inline-flex shrink-0 items-center gap-1" role="group" aria-label={`${c.code}の数量を変える`}>
                        <Btn small color="white" className="!px-2.5 !text-sm" onClick={step.minus} aria-label={`${c.code}を1つ減らす`}>
                          −
                        </Btn>
                        <span className="min-w-[2rem] text-center text-base font-bold tabular-nums text-emerald-800" aria-label={`${c.code}の数量`}>
                          {num(step.n)}
                        </span>
                        <Btn small color="emerald" className="!px-2.5 !text-sm" onClick={step.plus} aria-label={`${c.code}を1つ増やす`}>
                          ＋
                        </Btn>
                      </span>
                    ) : (
                      <Btn small color={list.length ? 'emerald' : 'white'} className="shrink-0" onClick={() => pick(c.code)} aria-label={`${c.code}を追加`}>
                        {list.length > 1 ? '選ぶ' : '＋ 追加'}
                      </Btn>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {/* ページのスライダー：つまんで動かすと、そのページへ一気に飛ぶ（下に残す。窓の中の余白 16px の分も白く覆う） */}
      {pages.length > 1 && (
        <div className="sticky -bottom-4 z-10 -mx-1 -mb-4 mt-2 border-t border-slate-200 bg-white px-1 pt-2 pb-4">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs tabular-nums text-slate-500">p.{pages[0].page}</span>
            <input
              type="range"
              min={0}
              max={pages.length - 1}
              step={1}
              value={idx}
              onChange={(e) => setPage(pages[Number(e.target.value)].page)}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-emerald-600"
              aria-label="ページを一気に動かす"
              aria-valuetext={`p.${page}${section ? ` ${section.title}` : ''}`}
            />
            <span className="shrink-0 text-xs tabular-nums text-slate-500">p.{pages[pages.length - 1].page}</span>
          </div>
          <div className="mt-1 text-center text-sm font-bold text-emerald-900" aria-live="polite">
            p.{page}
            {section && <span className="ml-2 font-normal text-slate-600">{section.title}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
