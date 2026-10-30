// カタログから商品を選ぶ（ユーザーの指示「項目名とメーカー名を入力・選択した際に、例えば、シャワーチェアで、パナソニックを選んだ場合に、
// お渡ししたカタログの中の、パナソニックのシャワーチェアの一覧を表示する…まず項目名を入力した後に、その後にメーカー名を選択する。
// そこで選択したら、パナソニックのシャワーチェアの商品一覧」2026-10-30）。
// 商品の欄の種目を選ぶと、その種目のカタログの品目（シャワーチェア・浴槽台など＝細目）とメーカーが出る（押すと細目・メーカーの欄に入る）。
// メーカーを選ぶと、そのメーカーの商品と色・大きさ（品番）が出て、
// 押すと商品名・メーカー・品番・TAIS・定価が入る。カタログの商品は PDF から読む（print/catalogPdf.ts の loadCatalogProducts。catalogItems.ts）
import {useEffect, useState} from 'react';
import {catalogInCategory, catalogItemPatch, catalogMakers, sameMaker} from '../catalogItems.ts';
import type {CatalogProduct} from '../catalogItems.ts';
import {loadCatalogProducts} from '../print/catalogPdf.ts';
import type {SaleItem} from '../types.ts';

const yen = (n: number) => n.toLocaleString('ja-JP');
/** 細目のふだんの呼び方（ユーザーの言い方「シャワーチェア」。種目の欄は種目だけなので、ここで品目を選ぶ） */
const SUB_LABEL: Record<string, string> = {
  入浴用いす: 'シャワーチェア・ベンチ',
  浴槽内いす: '浴槽台',
  浴槽用手すり: '浴槽手すり',
  入浴台: 'バスボード',
  '移動できる便器（ポータブルトイレ）': 'ポータブルトイレ',
  和式便器を腰掛式にするもの: '据置式便座',
  洋式便器の高さを補うもの: '補高便座',
  立ち上がりを補助するもの: '昇降便座',
};

export function CatalogPicker({item, onPick, onCatalog}: {item: SaleItem; onPick: (patch: Partial<SaleItem>) => void; onCatalog?: (query: string) => void}) {
  const [all, setAll] = useState<CatalogProduct[] | null>(null);
  const [open, setOpen] = useState(!item.name.trim());
  // 種目を選んだら読む（はじめの1回だけ。2回目からは覚えたもの）
  useEffect(() => {
    if (!item.category || all) return;
    let alive = true;
    void loadCatalogProducts().then((list) => alive && setAll(list));
    return () => {
      alive = false;
    };
  }, [item.category, all]);
  if (!item.category) return null;
  if (!all) return <p className="pl-8 text-xs text-slate-500">📖 カタログを読んでいます…</p>;
  const inCategory = catalogInCategory(all, item.category, '');
  if (!inCategory.length) return null;
  const subs = [...new Set(inCategory.map((p) => p.sub).filter(Boolean))];
  const inSub = item.sub ? inCategory.filter((p) => p.sub === item.sub) : inCategory;
  const makers = catalogMakers(inSub);
  const shown = item.maker.trim() ? inSub.filter((p) => sameMaker(p.maker, item.maker)) : [];
  const chip = 'rounded-md border px-2 py-1 text-xs';
  return (
    <div role="group" aria-label="カタログの商品" className="ml-8 grid gap-1.5 rounded-md border border-sky-200 bg-sky-50/60 p-2">
      {subs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-sky-900">
          <span>📖 品目：</span>
          {subs.map((sb) => (
            <button
              key={sb}
              type="button"
              aria-pressed={item.sub === sb}
              onClick={() => onPick({sub: item.sub === sb ? '' : sb})}
              className={`${chip} ${item.sub === sb ? 'border-sky-500 bg-sky-100 text-sky-900' : 'border-slate-300 bg-white font-normal text-slate-700 hover:bg-slate-50'}`}
              title={sb}
            >
              {SUB_LABEL[sb] ?? sb}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-sky-900">
        <span>{subs.length > 1 ? 'メーカー：' : '📖 カタログ：'}</span>
        {makers.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={sameMaker(m, item.maker)}
            onClick={() => {
              onPick({maker: m});
              setOpen(true);
            }}
            className={`${chip} ${sameMaker(m, item.maker) ? 'border-sky-500 bg-sky-100 text-sky-900' : 'border-slate-300 bg-white font-normal text-slate-700 hover:bg-slate-50'}`}
          >
            {m}
          </button>
        ))}
        {shown.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto rounded px-1.5 py-0.5 font-normal text-sky-800 hover:bg-sky-100" aria-expanded={open}>
            {open ? '▲ 閉じる' : `▼ 商品 ${shown.length}件`}
          </button>
        )}
      </div>
      {open && shown.length > 0 && (
        <ul className="grid max-h-80 gap-1 overflow-y-auto" aria-label={`${item.maker}の商品`}>
          {shown.map((p) => {
            const prices = [...new Set(p.variants.map((v) => v.listPrice))];
            return (
              <li key={p.key} className="rounded border border-slate-200 bg-white p-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-800">
                  <span className="font-bold">{p.name}</span>
                  {prices.length === 1 && prices[0] > 0 && <span className="text-xs text-slate-600">定価 {yen(prices[0])}円（税抜）</span>}
                  {onCatalog && (
                    <button type="button" onClick={() => onCatalog(p.variants[0]?.orderCode || p.name)} className="ml-auto text-xs text-sky-700 underline" title="カタログのこのページを開く">
                      p.{p.page}
                    </button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.variants.map((v) => (
                    <button
                      key={`${v.code}-${v.label}`}
                      type="button"
                      onClick={() => {
                        onPick(catalogItemPatch(p, v, item));
                        setOpen(false);
                      }}
                      className={`${chip} border-slate-300 bg-white text-left text-slate-800 hover:border-sky-400 hover:bg-sky-50 ${item.code === v.code ? 'border-sky-500 bg-sky-100' : ''}`}
                      aria-label={`${p.name} ${v.label} ${v.code}を入れる`}
                    >
                      {v.label || v.code}
                      <span className="ml-1 whitespace-nowrap text-slate-500">
                        {v.label ? v.code : ''}
                        {prices.length > 1 && v.listPrice > 0 ? ` ${yen(v.listPrice)}円` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {item.maker.trim() && !shown.length && <p className="text-xs text-slate-500">このメーカーの商品はカタログにありません</p>}
    </div>
  );
}
