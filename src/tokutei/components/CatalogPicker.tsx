// カタログから商品を選ぶ（ユーザーの指示「項目名とメーカー名を入力・選択した際に、例えば、シャワーチェアで、パナソニックを選んだ場合に、
// お渡ししたカタログの中の、パナソニックのシャワーチェアの一覧を表示する…まず項目名を入力した後に、その後にメーカー名を選択する。
// そこで選択したら、パナソニックのシャワーチェアの商品一覧」2026-10-30）。
// 商品の欄の種目を選ぶと、その種目のカタログの品目（シャワーチェア・浴槽台など＝細目）とメーカーが出る（押すと細目・メーカーの欄に入る）。
// 品目を選ぶと、その品目の商品と色・大きさ（品番）が出る（シャワーキャリーもシャワーチェアの中。2026-11-01）。メーカー・さがす言葉でさらに絞れる。
// 押すと商品名・メーカー・品番・TAIS・定価が入る。カタログの商品は PDF から読む（print/catalogPdf.ts の loadCatalogProducts。catalogItems.ts）。
// メーカーの欄の横の「🔍 商品検索」（search が増える）で、種目・項目名（商品名の欄に打った字）・メーカーで絞った商品だけを出し、
// 広い画面ではカタログの窓も、その商品の載っているページだけにする（ユーザーの指示「メーカー名の横に、商品検索ボタン。メーカー名、項目名を入力すると、
// フィルターをかけられた商品のみ表示されるようにする。カタログも同様です」2026-11-01。絞り方は catalogItems.ts の catalogFilter）
// 2026-11-03：ボタンは「📖 カタログから商品検索」1つに（ユーザーの指示「カタログから選ぶ、カタログ、商品検索の３つの機能がかぶっている。カタログから商品検索という
// 一つのボタンのみにする」「項目名、メーカー名を入力したその下に、カタログから検索をおく」）。品目・メーカーの段の下に、さがす言葉の欄とこのボタン。
// 押すと、種目・品目・メーカー・言葉で絞った商品の一覧を出し、カタログの窓もその商品の載っているページだけで開く。
// 商品を選んだら（一覧でも窓でも）、カタログの窓と一覧（品目・メーカーの段も）を閉じる（ユーザーの指示「商品検索から商品を選んだら、カタログは閉じる。下の一覧表も閉じる」）
import {useEffect, useRef, useState} from 'react';
import {codeMatchKey} from '../codeLookup.ts';
import type {ReactNode} from 'react';
import type {CatalogPagesFilter, OpenCatalog} from '../catalog.ts';
import {catalogFilter, catalogInCategory, catalogItemPatch, catalogMakers, catalogPagesOf, looseKey, sameMaker} from '../catalogItems.ts';
import type {CatalogProduct} from '../catalogItems.ts';
import {sortSubs, subShort} from '../category.ts';
import {loadCatalogProducts} from '../print/catalogPdf.ts';
import type {SaleItem} from '../types.ts';
import {matchesAll} from '../util.ts';

const yen = (n: number) => n.toLocaleString('ja-JP');
/** さがす言葉で絞るときの、商品の文字（商品名・メーカー・品番・色） */
// さがす言葉で見る字：商品名・メーカー・品番・色・介援隊の注文番号（261-S1063。前の「カタログから検索」の欄も注文番号で探せた）
// 品番・注文番号はハイフン・空白を除いた形も入れる（「261s1063」「pnl41431d」でも当たる。型番から入力と同じ codeMatchKey）
const productText = (p: CatalogProduct) =>
  `${p.name} ${p.maker} ${p.variants.map((v) => `${v.code} ${codeMatchKey(v.code)} ${v.label} ${v.orderCode} ${codeMatchKey(v.orderCode)}`).join(' ')}`;

export function CatalogPicker({
  item,
  onPick,
  onCatalog,
  onPicked,
}: {
  item: SaleItem;
  onPick: (patch: Partial<SaleItem>) => void;
  onCatalog?: OpenCatalog;
  onPicked?: (item: SaleItem) => void; // 一覧から商品を選んだ（カタログの窓を閉じる・お気に入りに入れる。SaleEditor）
}) {
  const [all, setAll] = useState<CatalogProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [open, setOpen] = useState(!item.name.trim());
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  // 品目・メーカーの段を開いているか（品目は選ぶまで開いておく）。openKey：色・種類を開いている商品（undefined のあいだは、入れた品番の商品を開く）
  const [subOpen, setSubOpen] = useState(!item.sub);
  const [makerOpen, setMakerOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState(0); // 「📖 カタログから商品検索」を押した回数
  // 種目を替えたら（品目が空になったら）品目の段を開き直す
  useEffect(() => {
    if (!item.sub) setSubOpen(true);
  }, [item.category]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxRef = useRef<HTMLDivElement>(null);
  // 種目を選んだら・カタログから商品検索を押したら読む（はじめの1回だけ。2回目からは覚えたもの）。読めなければ知らせる（前は何も出ず、一覧がないように見えた）
  const want = !!item.category || search > 0;
  useEffect(() => {
    if (!want || all) return;
    let alive = true;
    setFailed(false);
    loadCatalogProducts().then(
      (list) => {
        if (!alive) return;
        if (list.length) setAll(list);
        else setFailed(true);
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [want, all, tries]);
  // 種目・項目名・メーカーで絞る（商品検索を押していないときも、一覧に出す商品はこの条件）。カタログから選んだ商品の名前のままなら、
  // 名前では絞らない（「商品：11件」の見出しで開き直して、同じ品目・メーカーのほかの商品に選び直せるように）
  const picked = !!item.code && !!all?.some((p) => p.variants.some((v) => v.code === item.code && [p.name, v.label].filter(Boolean).join(' ') === item.name.trim()));
  const by = picked ? {...item, name: ''} : item;
  const found = all ? catalogFilter(all, by) : null;
  // 条件の名前（「シャワーチェア・パナソニックエイジフリー（株）」）。項目名が品目と同じ（シャワーチェアー）なら重ねて書かない
  const kind = found ? subShort(found.sub, found.category) : '';
  const word = found?.byName && looseKey(by.name) !== looseKey(kind) ? by.name.trim() : '';
  const filter: CatalogPagesFilter | null = found ? {pages: catalogPagesOf(found.items), label: [kind, word, item.maker.trim()].filter(Boolean).join('・')} : null;
  // 商品検索を押した：一覧を開いて、そこまで動かす。広い画面ではカタログの窓も同じ商品のページだけで開く（読み終わってから1回）
  useEffect(() => {
    if (!search) return;
    setOpen(true);
    setSearched(true);
  }, [search]);
  const shownFor = useRef(0);
  useEffect(() => {
    if (!search || !found || !filter || shownFor.current === search) return;
    shownFor.current = search;
    requestAnimationFrame(() => boxRef.current?.scrollIntoView({block: 'nearest', behavior: 'smooth'}));
    // カタログの窓は、さがす言葉にも合う商品の載っているページだけ（なければ種目・品目・メーカーのページ、それもなければ全部のページ）
    const hits = query.trim() ? catalogPagesOf(found.items.filter((p) => matchesAll(productText(p), query))) : [];
    if (!onCatalog) return;
    // 何も選んでいない・打っていなければ、全部のページ（絞らない窓）
    if (!query.trim() && !item.category && !item.sub && !item.maker.trim() && !item.name.trim()) onCatalog('', undefined, item.id);
    // 絞った商品に合うものがなければ、さがす言葉をカタログの窓に渡して、カタログの全部の文字から探す（前の「カタログから検索」と同じ）
    else if (query.trim() && !hits.length) onCatalog(query.trim(), undefined, item.id);
    else onCatalog('', (hits.length ? hits : filter.pages).length ? {pages: hits.length ? hits : filter.pages, label: [filter.label, query.trim()].filter(Boolean).join('・')} : undefined, item.id);
  });
  // 選んだ商品（一覧でもカタログの窓でも）になったら、品目・メーカー・商品の段を閉じる
  useEffect(() => {
    if (!picked) return;
    setOpen(false);
    setSubOpen(false);
    setMakerOpen(false);
    setSearched(false);
    setOpenKey(undefined);
  }, [picked, item.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // 種目を選ぶ前・カタログを読む前は、さがす言葉の欄とボタンだけ
  const searchRow = (placeholder: string) => (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // 申請書の入れる所の Enter（次の欄へ）にしない
          if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          e.stopPropagation();
          setSearch((n) => n + 1);
        }}
        placeholder={placeholder}
        aria-label="カタログから検索"
        className="h-9 min-w-[10rem] flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-sky-500"
      />
      <button
        type="button"
        onClick={() => setSearch((n) => n + 1)}
        className="h-9 shrink-0 rounded-md border border-sky-300 bg-sky-50 px-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100"
        title="種目・品目・メーカー・さがす言葉で絞った商品の一覧と、その商品の載っているカタログのページを開く"
      >
        📖 カタログから商品検索
      </button>
    </div>
  );
  // 枠はいつも同じ形（上＝品目・メーカーの段・まん中＝さがす言葉の欄・下＝商品の一覧）。さがす言葉で Enter を押して一覧を読み込んでも、
  // 欄が作り直されて打っていた欄から外れないように、欄はいつも同じ所（2つ目の子）に置く
  const box = (top: ReactNode, bottom: ReactNode, placeholder = '商品名・品番（空のままでも）') => (
    <div ref={boxRef} role="group" aria-label="カタログの商品" className="grid scroll-mt-4 gap-1 rounded-md border border-sky-200 bg-sky-50/60 p-1.5 sm:ml-8">
      {top}
      {searchRow(placeholder)}
      {bottom}
    </div>
  );
  const plain = box(null, null);
  if (!item.category && !searched) return plain;
  if (failed)
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 sm:ml-8 bg-amber-50 p-2 text-xs text-amber-900">
        📖 カタログを読めませんでした
        <button type="button" onClick={() => setTries((n) => n + 1)} className="rounded border border-amber-300 bg-white px-2 py-0.5">
          ↻ もう一度
        </button>
      </p>
    );
  if (!all || !found || !filter) return box(null, <p className="text-xs text-slate-500">📖 カタログを読んでいます…</p>);
  const inCategory = catalogInCategory(all, found.category, '');
  if (!inCategory.length && !searched) return plain; // カタログにない種目（杖など）は欄とボタンだけ（押したら「ありません」と知らせる）
  const subs = sortSubs([...new Set(inCategory.map((p) => p.sub).filter(Boolean))]);
  // メーカーのボタンは、種目・品目・項目名に合う商品のメーカー（メーカーの欄で絞る前）
  const makers = catalogMakers(catalogFilter(all, {...by, maker: ''}).items);
  // 品目（シャワーチェアなど）を選ぶと、その品目の商品だけを一覧に出す（ユーザーの指示「シャワーチェアを選んだら、シャワーチェアの一覧のみが
  // 商品一覧からさがせるようにする」2026-11-01）。メーカー・検索の言葉で、さらに絞れる。品目が1つの種目（杖など）は初めから出す
  const ready = searched || !!item.sub || subs.length <= 1 || !!item.maker.trim() || !!query.trim();
  const shown = ready ? found.items.filter((p) => matchesAll(productText(p), query)) : [];
  const chip = 'rounded-md border px-2 py-1 text-xs';
  const what = subShort(found.sub, found.category) || 'カタログ';
  const pick = (p: CatalogProduct, v: CatalogProduct['variants'][number]) => {
    const patch = catalogItemPatch(p, v, item);
    onPick(patch);
    onPicked?.({...item, ...patch});
    setOpen(false);
    setSubOpen(false);
    setMakerOpen(false);
    setSearched(false);
    setOpenKey(undefined);
  };
  const subCount = (sb: string) => inCategory.filter((p) => p.sub === sb).length;
  return box(
    <>
      {/* 品目・メーカー・商品は、押すと開く・閉じる（アコーディオン。ユーザーの指示「品目とメーカーはアコーディオン形式」2026-11-02）。
          閉じているときは選んでいるものを出す。品目は選ぶまで開いておき、選んだら閉じる。メーカーは初めは閉じておく */}
      {subs.length > 1 && (
        <>
          <FoldHead
            label="📖 品目："
            open={subOpen}
            onToggle={() => setSubOpen((o) => !o)}
            value={item.sub ? <Picked text={subShort(item.sub)} count={subCount(item.sub)} /> : <span className="text-slate-500">選ぶ</span>}
          />
          {subOpen && (
            <div role="group" aria-label="品目" className="flex flex-wrap gap-1.5 pb-1 pl-1">
              {subs.map((sb) => (
                <button
                  key={sb}
                  type="button"
                  aria-pressed={item.sub === sb}
                  onClick={() => {
                    const on = item.sub !== sb;
                    onPick({sub: on ? sb : ''});
                    setOpen(true);
                    if (on) setSubOpen(false);
                  }}
                  className={`${chip} ${item.sub === sb ? 'border-sky-500 bg-sky-100 font-bold text-sky-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  title={sb}
                >
                  {subShort(sb)}
                  <span className="ml-1 font-normal text-slate-500">{subCount(sb)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {makers.length > 0 && (
        <>
          <FoldHead
            label={subs.length > 1 ? 'メーカー：' : '📖 メーカー：'}
            open={makerOpen}
            onToggle={() => setMakerOpen((o) => !o)}
            value={item.maker.trim() ? <Picked text={item.maker.trim()} /> : <span className="text-slate-500">すべて</span>}
          />
          {makerOpen && (
            <div role="group" aria-label="メーカー" className="flex flex-wrap gap-1.5 pb-1 pl-1">
              {makers.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={sameMaker(m, item.maker)}
                  onClick={() => {
                    const on = !sameMaker(m, item.maker);
                    onPick({maker: on ? m : ''});
                    setOpen(true);
                    if (on) setMakerOpen(false);
                  }}
                  className={`${chip} ${sameMaker(m, item.maker) ? 'border-sky-500 bg-sky-100 font-bold text-sky-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>,
    <>
      {/* 品目・メーカーの下（box のまん中）に、さがす言葉の欄と「📖 カタログから商品検索」（2026-11-03） */}
      {ready && <FoldHead label="商品：" open={open} onToggle={() => setOpen((o) => !o)} value={`${shown.length}件`} />}
      {/* 商品検索の条件と件数。「📖 カタログで見る」で、カタログの窓をこの商品の載っているページだけで開く */}
      {searched && open && (
        <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-white/70 px-1.5 py-1 text-xs text-slate-700">
          <span>
            🔍 <b className="font-bold text-sky-900">{filter.label || 'すべて'}</b>：{shown.length}件
          </span>
          {by.name.trim() && !found.byName && <span className="text-amber-800">（「{item.name.trim()}」に合う商品がないので、{[what, item.maker.trim()].filter(Boolean).join('・')}の商品）</span>}
        </div>
      )}
      {/* 商品も、色・大きさが2つ以上あるものは、商品名を押すと色などが開く（アコーディオン。ユーザーの指示「商品名も色が複数ある場合は、
          アコーディオン形式にして、商品名をおすと、色を選べるようにする」2026-11-02）。開くのは1つずつ。1つだけの商品は、商品名を押すとすぐ入る */}
      {open && shown.length > 0 && (
        <ul className="grid max-h-96 gap-1 overflow-y-auto" aria-label={`${what}の商品`}>
          {shown.map((p) => {
            const prices = [...new Set(p.variants.map((v) => v.listPrice))];
            const many = p.variants.length > 1;
            const has = p.variants.some((v) => v.code === item.code);
            const expanded = many && (openKey === undefined ? has : openKey === p.key);
            const only = p.variants[0];
            return (
              <li key={p.key} className={`rounded border bg-white ${has ? 'border-sky-400' : 'border-slate-200'}`}>
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => (many ? setOpenKey(expanded ? null : p.key) : only && pick(p, only))}
                    aria-expanded={many ? expanded : undefined}
                    aria-label={many ? `${p.name}（${p.variants.length}種類）` : `${[p.name, only?.label, only?.code].filter(Boolean).join(' ')}を入れる`}
                    className={`flex min-h-10 min-w-0 flex-1 flex-wrap items-baseline gap-x-2 rounded px-1.5 py-1.5 text-left text-sm text-slate-800 hover:bg-sky-50 ${expanded ? 'bg-sky-50' : ''}`}
                  >
                    <span className="rounded bg-teal-100 px-1 text-[10px] text-teal-800">{subShort(p.sub, p.category)}</span>
                    <span className="font-bold">{p.name}</span>
                    {!sameMaker(p.maker, item.maker) && p.maker && <span className="text-xs text-slate-500">{p.maker}</span>}
                    {prices.length === 1 && prices[0] > 0 && <span className="text-xs text-slate-600">定価 {yen(prices[0])}円（税抜）</span>}
                    {!many && only && (only.label || only.code) && <span className="text-xs text-slate-500">{[only.label, only.code].filter(Boolean).join(' ')}</span>}
                    {many && (
                      <span className="ml-auto whitespace-nowrap text-xs text-sky-800">
                        <span aria-hidden="true">{expanded ? '▲' : '▼'} </span>
                        {p.variants.length}種類
                      </span>
                    )}
                  </button>
                  {onCatalog && (
                    <button type="button" onClick={() => onCatalog(p.variants[0]?.orderCode || p.name, undefined, item.id)} className="shrink-0 px-1.5 py-2 text-xs text-sky-700 underline" title="カタログのこのページを開く">
                      p.{p.page}
                    </button>
                  )}
                </div>
                {expanded && (
                  <div role="group" aria-label={`${p.name}の色・種類`} className="flex flex-wrap gap-1.5 border-t border-slate-100 px-1.5 pt-1.5 pb-1.5">
                    {p.variants.map((v) => (
                      <button
                        key={`${v.code}-${v.label}`}
                        type="button"
                        onClick={() => pick(p, v)}
                        className={`${chip} py-1.5 text-left text-slate-800 hover:border-sky-400 hover:bg-sky-50 ${item.code === v.code ? 'border-sky-500 bg-sky-100' : 'border-slate-300 bg-white'}`}
                        aria-label={`${[p.name, v.label, v.code].filter(Boolean).join(' ')}を入れる`}
                      >
                        {v.label || v.code}
                        <span className="ml-1 whitespace-nowrap text-slate-500">
                          {v.label ? v.code : ''}
                          {prices.length > 1 && v.listPrice > 0 ? ` ${yen(v.listPrice)}円` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ready && open && !shown.length && <p className="text-xs text-slate-500">{query.trim() ? '見つかりませんでした' : 'この条件の商品はカタログにありません'}</p>}
    </>,
    `${what}の中から 商品名・品番（空のままでも）`,
  );
}

/** 品目・メーカー・商品の段の見出し（押すと開く・閉じる）。閉じていても選んでいるものが見える */
function FoldHead({label, value, open, onToggle}: {label: string; value: ReactNode; open: boolean; onToggle: () => void}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex min-h-9 w-full items-center gap-1.5 rounded-md px-1 text-left text-xs font-bold text-sky-900 hover:bg-sky-100/70"
    >
      <span className="shrink-0">{label}</span>
      <span className="flex min-w-0 font-normal text-slate-800">{value}</span>
      <span aria-hidden="true" className="ml-auto shrink-0 text-sky-700">
        {open ? '▲' : '▼'}
      </span>
    </button>
  );
}

/** 見出しに出す、選んでいる品目・メーカー（押したボタンと同じ色） */
function Picked({text, count}: {text: string; count?: number}) {
  return (
    <span className="min-w-0 truncate rounded-md border border-sky-500 bg-sky-100 px-2 py-0.5 font-bold text-sky-900">
      {text}
      {count !== undefined && <span className="ml-1 font-normal text-slate-500">{count}</span>}
    </span>
  );
}
