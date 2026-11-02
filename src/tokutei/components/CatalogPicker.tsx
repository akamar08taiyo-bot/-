// カタログから商品を選ぶ（ユーザーの指示「項目名とメーカー名を入力・選択した際に、例えば、シャワーチェアで、パナソニックを選んだ場合に、
// お渡ししたカタログの中の、パナソニックのシャワーチェアの一覧を表示する…まず項目名を入力した後に、その後にメーカー名を選択する。
// そこで選択したら、パナソニックのシャワーチェアの商品一覧」2026-10-30）。
// 商品の欄の種目を選ぶと、その種目のカタログの品目（シャワーチェア・浴槽台など＝細目）とメーカーが出る（押すと細目・メーカーの欄に入る）。
// 品目を選ぶと、その品目の商品と色・大きさ（品番）が出る（シャワーキャリーもシャワーチェアの中。2026-11-01）。メーカー・さがす言葉でさらに絞れる。
// 押すと商品名・メーカー・品番・TAIS・定価が入る。カタログの商品は PDF から読む（print/catalogPdf.ts の loadCatalogProducts。catalogItems.ts）。
// メーカーの欄の横の「🔍 商品検索」（search が増える）で、種目・項目名（商品名の欄に打った字）・メーカーで絞った商品だけを出し、
// 広い画面ではカタログの窓も、その商品の載っているページだけにする（ユーザーの指示「メーカー名の横に、商品検索ボタン。メーカー名、項目名を入力すると、
// フィルターをかけられた商品のみ表示されるようにする。カタログも同様です」2026-11-01。絞り方は catalogItems.ts の catalogFilter）
import {useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import type {CatalogPagesFilter, OpenCatalog} from '../catalog.ts';
import {catalogFilter, catalogInCategory, catalogItemPatch, catalogMakers, catalogPagesOf, looseKey, sameMaker} from '../catalogItems.ts';
import type {CatalogProduct} from '../catalogItems.ts';
import {sortSubs, subShort} from '../category.ts';
import {loadCatalogProducts} from '../print/catalogPdf.ts';
import type {SaleItem} from '../types.ts';
import {matchesAll} from '../util.ts';

const yen = (n: number) => n.toLocaleString('ja-JP');
/** カタログの窓を一緒に開く広さ（狭い画面では窓が画面いっぱいになるので、ボタンで開く） */
const WIDE = 1024;

/**
 * 種目の横の「📖 カタログから選ぶ」（ユーザーの指示「入浴補助用具の横に、カタログから選ぶ。設置。項目名とメーカー名を選択すると（選択したものだけの
 * カタログを表示）クリックするとカタログが開き、カタログと商品をリンクさせて、自動的に商品名や金額などが全てはいるようにする」2026-11-02）：
 * 種目・品目・メーカーで絞ったページだけのカタログの窓を開く（何も選んでいなければ全部のページ）。窓のページの商品を押すと、この商品の欄に入る（SaleEditor の pickFromCatalog）
 */
export function CatalogChooseButton({item, onCatalog}: {item: SaleItem; onCatalog: OpenCatalog}) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const filter = await itemCatalogFilter(item);
    setBusy(false);
    onCatalog('', filter, item.id);
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="h-9 shrink-0 rounded-md border border-sky-300 bg-sky-50 px-2.5 text-sm font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
      title="種目・品目・メーカーのカタログのページを開いて、ページの商品を押して入れる"
    >
      {/* スマホの幅では「📖 カタログ」だけ見せる（種目の欄が「入浴」まで縮んでいた。読み上げの名前は「📖 カタログから選ぶ」のまま） */}
      📖 カタログ<span className="max-sm:sr-only">から選ぶ</span>
    </button>
  );
}

/** 商品の欄の種目・品目・メーカーで絞ったカタログのページ（何も選んでいない・読めない・載っていなければ undefined＝全部のページ） */
export async function itemCatalogFilter(item: SaleItem): Promise<CatalogPagesFilter | undefined> {
  if (!item.category && !item.sub && !item.maker.trim()) return undefined;
  try {
    const found = catalogFilter(await loadCatalogProducts(), {...item, name: ''});
    const pages = catalogPagesOf(found.items);
    return pages.length ? {pages, label: [subShort(found.sub, found.category), item.maker.trim()].filter(Boolean).join('・')} : undefined;
  } catch {
    // 読めなければ全部のページで開く（ページの絵は窓が読む）
    return undefined;
  }
}

/** メーカーの欄の横の「🔍 商品検索」（押すたびに onSearch。CatalogPicker の search を1つ増やす） */
export function CatalogSearchButton({onSearch}: {onSearch: () => void}) {
  return (
    <button
      type="button"
      onClick={onSearch}
      className="h-9 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
      title="種目・商品名・メーカーで、カタログの商品をさがす"
    >
      🔍 商品検索
    </button>
  );
}

export function CatalogPicker({item, onPick, onCatalog, search = 0}: {item: SaleItem; onPick: (patch: Partial<SaleItem>) => void; onCatalog?: OpenCatalog; search?: number}) {
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
  // 種目を替えたら（品目が空になったら）品目の段を開き直す
  useEffect(() => {
    if (!item.sub) setSubOpen(true);
  }, [item.category]); // eslint-disable-line react-hooks/exhaustive-deps
  const boxRef = useRef<HTMLDivElement>(null);
  // 種目を選んだら・商品検索を押したら読む（はじめの1回だけ。2回目からは覚えたもの）。読めなければ知らせる（前は何も出ず、一覧がないように見えた）
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
    setQuery('');
  }, [search]);
  const shownFor = useRef(0);
  useEffect(() => {
    if (!search || !found || shownFor.current === search) return;
    shownFor.current = search;
    requestAnimationFrame(() => boxRef.current?.scrollIntoView({block: 'nearest', behavior: 'smooth'}));
    if (onCatalog && filter && filter.pages.length && window.innerWidth >= WIDE) onCatalog('', filter, item.id);
  });

  if (!item.category && !searched) return null;
  if (failed)
    return (
      <p className="ml-8 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        📖 カタログを読めませんでした
        <button type="button" onClick={() => setTries((n) => n + 1)} className="rounded border border-amber-300 bg-white px-2 py-0.5">
          ↻ もう一度
        </button>
      </p>
    );
  if (!all || !found || !filter) return <p className="pl-8 text-xs text-slate-500">📖 カタログを読んでいます…</p>;
  const inCategory = catalogInCategory(all, found.category, '');
  if (!inCategory.length && !searched) return null; // カタログにない種目（杖など）は出さない（商品検索を押したら「ありません」と知らせる）
  const subs = sortSubs([...new Set(inCategory.map((p) => p.sub).filter(Boolean))]);
  // メーカーのボタンは、種目・品目・項目名に合う商品のメーカー（メーカーの欄で絞る前）
  const makers = catalogMakers(catalogFilter(all, {...by, maker: ''}).items);
  // 品目（シャワーチェアなど）を選ぶと、その品目の商品だけを一覧に出す（ユーザーの指示「シャワーチェアを選んだら、シャワーチェアの一覧のみが
  // 商品一覧からさがせるようにする」2026-11-01）。メーカー・検索の言葉で、さらに絞れる。品目が1つの種目（杖など）は初めから出す
  const ready = searched || !!item.sub || subs.length <= 1 || !!item.maker.trim() || !!query.trim();
  const shown = ready ? found.items.filter((p) => matchesAll(`${p.name} ${p.maker} ${p.variants.map((v) => `${v.code} ${v.label}`).join(' ')}`, query)) : [];
  const chip = 'rounded-md border px-2 py-1 text-xs';
  const what = subShort(found.sub, found.category) || 'カタログ';
  const pick = (p: CatalogProduct, v: CatalogProduct['variants'][number]) => {
    onPick(catalogItemPatch(p, v, item));
    setOpen(false);
    setSearched(false);
    setOpenKey(undefined);
  };
  const subCount = (sb: string) => inCategory.filter((p) => p.sub === sb).length;
  return (
    <div ref={boxRef} role="group" aria-label="カタログの商品" className="ml-8 grid scroll-mt-4 gap-1 rounded-md border border-sky-200 bg-sky-50/60 p-1.5">
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
      {ready && <FoldHead label="商品：" open={open} onToggle={() => setOpen((o) => !o)} value={`${shown.length}件`} />}
      {/* 商品検索の条件と件数。「📖 カタログで見る」で、カタログの窓をこの商品の載っているページだけで開く */}
      {searched && open && (
        <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-white/70 px-1.5 py-1 text-xs text-slate-700">
          <span>
            🔍 <b className="font-bold text-sky-900">{filter.label || 'すべて'}</b>：{shown.length}件
          </span>
          {by.name.trim() && !found.byName && <span className="text-amber-800">（「{item.name.trim()}」に合う商品がないので、{[what, item.maker.trim()].filter(Boolean).join('・')}の商品）</span>}
          {onCatalog && filter.pages.length > 0 && (
            <button type="button" onClick={() => onCatalog('', filter, item.id)} className="ml-auto rounded border border-sky-300 bg-white px-2 py-0.5 font-bold text-sky-900 hover:bg-sky-50">
              📖 カタログで見る（{filter.pages.map((n) => `p.${n}`).join('・')}）
            </button>
          )}
        </div>
      )}
      {open && (ready || subs.length > 1) && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${what}の中から 商品名・品番でさがす`}
          aria-label="カタログの商品をさがす"
          className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-sky-500"
        />
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
    </div>
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
