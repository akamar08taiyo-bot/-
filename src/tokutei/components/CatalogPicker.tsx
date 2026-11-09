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
import {createContext, useContext, useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import type {CatalogPagesFilter, OpenCatalog} from '../catalog.ts';
import {catalogFilter, catalogInCategory, catalogItemPatch, catalogMakers, catalogPagesOf, looseKey, sameMaker} from '../catalogItems.ts';
import type {CatalogProduct} from '../catalogItems.ts';
import {sortSubs, subShort} from '../category.ts';
import {loadCatalogProducts} from '../print/catalogPdf.ts';
import type {SaleItem} from '../types.ts';
import {MakerInput} from './MakerInput.tsx';
import {FeatureBadges} from './FeatureBadges.tsx';

const yen = (n: number) => n.toLocaleString('ja-JP');

/** カタログの窓が開いていれば、その窓で選んだ商品を入れる商品の欄（SaleEditor.tsx の catalogView.target）。品目・メーカーを変えたら窓も切り替える */
export const CatalogOpenFor = createContext<string | null>(null);
/** メーカーのプルダウンの「ほかのメーカー（打つ）」 */
const OTHER = '\u0000other';

export function CatalogPicker({
  item,
  onPick,
  onCatalog,
  onPicked,
  makerChoices,
  code,
  codeNote,
  discountRate,
}: {
  item: SaleItem;
  onPick: (patch: Partial<SaleItem>) => void;
  onCatalog?: OpenCatalog;
  onPicked?: (item: SaleItem) => void; // 一覧から商品を選んだ（カタログの窓を閉じる・お気に入りに入れる。SaleEditor）
  makerChoices: string[]; // メーカーを打つ欄の候補（カタログにないメーカー。sales.ts の makerChoices）
  code?: ReactNode; // 「📖 カタログから商品検索」の右に置くもの（「🔢 型番から検索」。CodeLookup）
  codeNote?: ReactNode; // 型番から検索の結果（入れた商品・見つからない・同じ型番の商品。CodeLookup）
  discountRate: number; // 設定の割引率（カタログの商品は 定価×(100−割引率)%）
}) {
  const [all, setAll] = useState<CatalogProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [open, setOpen] = useState(!item.name.trim());
  const [searched, setSearched] = useState(false);
  // openKey：色・種類を開いている商品（undefined のあいだは、入れた品番の商品を開く）。typingMaker：メーカーを「ほかのメーカー（打つ）」で打っている
  const [openKey, setOpenKey] = useState<string | null | undefined>(undefined);
  const [typingMaker, setTypingMaker] = useState(false);
  const [search, setSearch] = useState(0); // 「📖 カタログから商品検索」を押した回数
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
  // 入れたカタログの商品（ひじ掛けあり／なし などを、入れたあとも欄の下に出して確かめられるように。2026-11-09）
  const pickedProduct = picked ? all?.find((p) => p.variants.some((v) => v.code === item.code && [p.name, v.label].filter(Boolean).join(' ') === item.name.trim())) : undefined;
  const pickedVariant = pickedProduct?.variants.find((v) => v.code === item.code && [pickedProduct.name, v.label].filter(Boolean).join(' ') === item.name.trim());
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
    // カタログの窓は、種目・品目・メーカーで絞った商品の載っているページだけ（何も選んでいなければ全部のページ）
    if (!onCatalog) return;
    if (!item.category && !item.sub && !item.maker.trim() && !item.name.trim()) onCatalog('', undefined, item.id);
    else onCatalog('', filter.pages.length ? {pages: filter.pages, label: filter.label} : undefined, item.id);
  });
  // 品目・メーカー（・種目）を変えたら、横に開いているカタログの窓も、その品目・メーカーのページだけに切り替える
  // （ユーザーの指示「メーカー名や品目を変えたら、横に表示されているカタログも自動的に切り替わる」2026-11-03）。窓が開いていない・ほかの欄の窓なら何もしない
  const openFor = useContext(CatalogOpenFor);
  const condKey = `${item.category}|${item.sub}|${item.maker.trim()}`;
  const lastCond = useRef(condKey);
  useEffect(() => {
    if (condKey === lastCond.current || !found || !filter) return;
    lastCond.current = condKey;
    if (!onCatalog || openFor !== item.id) return;
    if (!item.category && !item.sub && !item.maker.trim()) onCatalog('', undefined, item.id);
    else onCatalog('', filter.pages.length ? {pages: filter.pages, label: filter.label} : undefined, item.id);
  });
  // 選んだ商品（一覧でもカタログの窓でも）になったら、品目・メーカー・商品の段を閉じる
  useEffect(() => {
    if (!picked) return;
    setOpen(false);
    setSearched(false);
    setOpenKey(undefined);
  }, [picked, item.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // 品目・メーカーはプルダウン（ユーザーの指示「品目はプルダウン形式。品目を選んだら、該当のメーカーをプルダウンから選ぶ。その真下に、カタログから商品検索を
  // もってくる。（絞られた該当のカタログを開く）右側に型番から検索をもってくる」2026-11-03。前は押して開くボタンの並び＝アコーディオンと、さがす言葉の欄）。
  // メーカーは、選んだ種目・品目の商品のあるメーカーだけ（0件の組み合わせを選べないように）。カタログにないメーカーは「ほかのメーカー（打つ）」で打てる
  const pickSub = (sb: string) => {
    onPick({sub: sb});
    setSearched(false);
  };
  const searchButton = (
    <button
      type="button"
      onClick={() => setSearch((n) => n + 1)}
      className="min-h-9 w-full rounded-md border border-sky-300 bg-sky-50 px-1.5 py-1 text-sm font-bold leading-tight text-sky-900 [word-break:keep-all] hover:bg-sky-100"
      title="種目・品目・メーカーで絞った商品の一覧と、その商品の載っているカタログのページを開く"
    >
      {/* 2行に折れるときは「カタログから／商品検索」で（keep-all と wbr。字の途中で折らない） */}
      📖 カタログから
      <wbr />
      商品検索
    </button>
  );
  const sel = 'h-9 min-w-0 rounded-md border border-slate-300 bg-white px-1.5 text-sm text-slate-800';
  const lab = 'flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-bold text-slate-500'; // 見出しの字（メーカー）はせまい幅でも折らない
  const freeMaker = (ariaLabel: string) => (
    <MakerInput value={item.maker} onChange={(maker) => onPick({maker})} choices={makerChoices} className="w-48 min-w-0 shrink" ariaLabel={ariaLabel} />
  );
  // 枠：上＝品目・メーカー、まん中＝カタログから商品検索と型番から検索（その結果）、下＝押したあとの商品の一覧
  const box = (top: ReactNode, bottom: ReactNode = null) => (
    <div ref={boxRef} role="group" aria-label="カタログの商品" className="grid scroll-mt-4 gap-1.5 rounded-md border border-sky-200 bg-sky-50/60 p-1.5 sm:ml-8">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">{top}</div>
      {/* 「📖 カタログから商品検索」「🔢 型番から検索」「★ お気に入りから入力」を同じ段に同じ幅で並べる（せまい幅では字を2行に。
          ユーザーの指示「お気に入りから入力は、型番検索の右にもってくる」2026-11-03。前は横に並べるだけで、パソコンでもお気に入りが下の段に落ちた） */}
      <div className={code ? 'grid min-w-0 auto-cols-fr grid-flow-col items-stretch gap-1.5' : 'flex min-w-0'}>
        {searchButton}
        {code}
      </div>
      {codeNote}
      {bottom}
    </div>
  );
  // 種目を選ぶ前・カタログにない種目は、メーカーを打つ欄だけ（品目はない）
  const plain = box(<label className={lab}>メーカー{freeMaker('メーカー')}</label>);
  if (!item.category && !searched) return plain;
  if (failed)
    return box(
      <>
        <label className={lab}>メーカー{freeMaker('メーカー')}</label>
        <span className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
          📖 カタログを読めませんでした
          <button type="button" onClick={() => setTries((n) => n + 1)} className="rounded border border-amber-300 bg-white px-2 py-0.5">
            ↻ もう一度
          </button>
        </span>
      </>,
    );
  if (!all || !found || !filter) return box(<span className="text-xs text-slate-500">📖 カタログを読んでいます…</span>);
  const inCategory = catalogInCategory(all, found.category, '');
  if (!inCategory.length && !searched) return plain;
  const subs = sortSubs([...new Set(inCategory.map((p) => p.sub).filter(Boolean))]);
  const subCount = (sb: string) => inCategory.filter((p) => p.sub === sb).length;
  // メーカーの候補：種目・品目に合う商品のメーカー（品目を選ぶ前は種目の全部）
  const makers = catalogMakers(catalogFilter(all, {...item, name: '', maker: ''}).items);
  const makerValue = !item.maker.trim() ? '' : (makers.find((m) => sameMaker(m, item.maker)) ?? OTHER);
  const other = makerValue === OTHER || typingMaker;
  const shown = searched ? found.items : [];
  const chip = 'rounded-md border px-2 py-1 text-xs';
  const what = subShort(found.sub, found.category) || 'カタログ';
  const pick = (p: CatalogProduct, v: CatalogProduct['variants'][number]) => {
    const patch = catalogItemPatch(p, v, item, discountRate);
    onPick(patch);
    onPicked?.({...item, ...patch});
    setOpen(false);
    setSearched(false);
    setOpenKey(undefined);
  };
  return box(
    <>
      {subs.length > 1 && (
        <label className={lab}>
          品目
          <select value={item.sub} onChange={(e) => pickSub(e.target.value)} className={`${sel} w-44`} aria-label="品目">
            <option value="">（選ぶ）</option>
            {subs.map((sb) => (
              <option key={sb} value={sb}>
                {subShort(sb)}（{subCount(sb)}）
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`${lab} min-w-52 flex-1`}>
        メーカー
        <select
          value={other ? OTHER : makerValue}
          onChange={(e) => {
            const v = e.target.value;
            setSearched(false);
            if (v === OTHER) {
              setTypingMaker(true);
              if (makers.some((m) => sameMaker(m, item.maker))) onPick({maker: ''});
              return;
            }
            setTypingMaker(false);
            onPick({maker: v});
          }}
          className={`${sel} w-full max-w-72`}
          aria-label="メーカー"
        >
          <option value="">（すべて）</option>
          {makers.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={OTHER}>ほかのメーカー（打つ）</option>
        </select>
      </label>
      {other && freeMaker('メーカー（打つ）')}
    </>,
    <>
      {pickedProduct && (pickedProduct.features || !searched) && (
        <p className="flex flex-wrap items-center gap-1 px-1 text-xs text-slate-700" aria-label="入れた商品のカタログの機能">
          <span className="text-slate-500">入れた商品（カタログ p.{pickedProduct.page}）：</span>
          {pickedProduct.features ? <FeatureBadges product={pickedProduct} variant={pickedVariant} /> : <span className="text-slate-500">機能のアイコンなし</span>}
        </p>
      )}
      {/* 「📖 カタログから商品検索」を押したら、種目・品目・メーカーで絞った商品の一覧（カタログの窓も同じ商品のページだけで開く） */}
      {searched && (
        <FoldHead
          label="商品："
          open={open}
          onToggle={() => setOpen((o) => !o)}
          value={
            <span>
              <b className="font-bold text-sky-900">{filter.label || 'すべて'}</b>　{shown.length}件
            </span>
          }
        />
      )}
      {/* 絞り込みに使えなかった語は必ず知らせる（2026-11-09 のユーザーの指摘：「肘付き」などの語が黙って捨てられ、肘なしの型番が見積もりに入った） */}
      {searched && found.unmatched.length > 0 && (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-1.5 py-1 text-xs text-red-800">
          「{found.unmatched.join('」「')}」は、カタログの商品名・品番・機能（ひじ掛けなど）にないので、絞り込みに使っていません。入れる前に、商品名・品番・ひじ掛けの有無を確かめてください。
        </p>
      )}
      {searched && open && by.name.trim() && !found.byName && (
        <p className="px-1 text-xs text-amber-800">（「{item.name.trim()}」に合う商品がないので、{[what, item.maker.trim()].filter(Boolean).join('・')}の商品）</p>
      )}
      {/* 商品も、色・大きさが2つ以上あるものは、商品名を押すと色などが開く（アコーディオン。ユーザーの指示「商品名も色が複数ある場合は、
          アコーディオン形式にして、商品名をおすと、色を選べるようにする」2026-11-02）。開くのは1つずつ。1つだけの商品は、商品名を押すとすぐ入る */}
      {searched && open && shown.length > 0 && (
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
                    {/* ひじ掛けあり／なし などカタログの機能アイコン（2026-11-09。肘付きと肘なしを取りちがえないように） */}
                    <FeatureBadges product={p} />
                    {!sameMaker(p.maker, item.maker) && p.maker && <span className="text-xs text-slate-500">{p.maker}</span>}
                    {prices.length === 1 && prices[0] > 0 && <span className="text-xs text-slate-600">定価 {yen(prices[0])}円（{p.taxFree ? '非課税' : '税抜'}）</span>}
                    {/* 非課税の商品（歩行器・多点杖など。カタログの金額の横の「非課税」）は一覧でも分かるように（ユーザーの指示「しっかりと全ての商品で認識する」2026-11-03） */}
                    {p.taxFree && (prices.length !== 1 || !(prices[0] > 0)) && <span className="text-xs text-amber-800">非課税</span>}
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
                        className={`${chip} py-1.5 text-left text-slate-800 hover:border-sky-400 hover:bg-sky-50 ${item.code === v.code && [p.name, v.label].filter(Boolean).join(' ') === item.name.trim() ? 'border-sky-500 bg-sky-100' : 'border-slate-300 bg-white'}`}
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
      {searched && open && !shown.length && <p className="text-xs text-slate-500">この条件の商品はカタログにありません</p>}
    </>,
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
