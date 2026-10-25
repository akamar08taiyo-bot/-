// 販売見積書のページの中の販売受注簿（販売受注簿作成ツール /taiyo-hacchu-scan/?embed=tokutei を iframe で出す。components/HacchuFrame.tsx）。
// ユーザーの指示「商品名や型番などを入力したら、自動的に販売見積書のページ内にある、販売受注簿に飛べるようにする（住所や名前、読みなど、全て）。
// 販売受注簿の中で、カタログから商品を自動認識するというボタンを設置」（2026-10-23）。
// 同じサイトなので postMessage でやりとりする（受注簿ツールの src/main.jsx の tokutei-live-begin〜end）：
// - 見積書 → 受注簿 taiyo-tokutei-live：hacchuImport（handoff.ts）の内容を、案件を直すたびに。はじめの1回は保存した受注簿（Sale.hacchu）も
// - 受注簿 → 見積書：taiyo-hacchu-state（受注簿の中身。Sale.hacchu にそのまま保存）・taiyo-hacchu-item（受注簿で直した商品名・型番・定価・仕切りなど）・
//   taiyo-hacchu-add（カタログから読み取って「商品を追加」した商品）・taiyo-hacchu-remove（受注簿で消したページの商品）
// ここは受注簿から届いたものを案件に入れるところ（どれも、知らない形のものは無視する）。

import {guessCategory} from './category.ts';
import {blankItem} from './sales.ts';
import type {Sale, SaleItem, Settings, TaxType} from './types.ts';

export const HACCHU_LIVE = 'taiyo-tokutei-live';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** 受注簿の金額の欄（"35000"・"" など）。空・数でないものは 0 */
const yenOf = (v: unknown) => {
  const n = Number(text(v).replace(/[,，円¥]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const TAX: TaxType[] = ['10%', '8%', '非課税'];

/** 受注簿で直した欄を、見積書の商品の1行に入れる（入っている欄だけ） */
export function itemPatch(item: SaleItem, fields: Record<string, unknown>): SaleItem {
  const next = {...item};
  if ('productName' in fields) {
    next.name = text(fields.productName);
    // 種目がまだなければ、商品名から推測する（商品マスタから選んだ商品と同じ）
    if (!next.category && next.name) {
      const g = guessCategory(next.name);
      next.category = g.category;
      next.sub = g.sub;
    }
  }
  if ('maker' in fields) next.maker = text(fields.maker);
  if ('modelNumber' in fields) next.code = text(fields.modelNumber);
  if ('quantity' in fields) next.qty = Math.max(1, Math.round(Number(text(fields.quantity)) || 1));
  if ('unit' in fields) next.unit = text(fields.unit);
  if ('listPrice' in fields) next.listPrice = yenOf(fields.listPrice);
  if ('cost' in fields) next.cost = yenOf(fields.cost);
  if ('taxType' in fields && TAX.includes(fields.taxType as TaxType)) next.taxType = fields.taxType as TaxType;
  return next;
}

/** 受注簿でカタログから読み取って「商品を追加」した商品を、見積書の商品の1行にする（id は受注簿が付けたもの） */
export function itemFromHacchu(raw: Record<string, unknown>, s: Pick<Settings, 'discountRate'>): SaleItem | null {
  const id = text(raw.id);
  if (!/^h[0-9a-z]{4,40}$/.test(id)) return null;
  const item = itemPatch({...blankItem(s), id}, raw);
  item.unit = item.unit || '台';
  item.supplier = text(raw.supplier);
  return item;
}

/** 受注簿から届いたものを案件に入れる。入れるものがなければ null */
export function applyHacchu(sale: Sale, msg: unknown, s: Pick<Settings, 'discountRate'>): Sale | null {
  if (!isObj(msg) || msg.saleId !== sale.id) return null;
  const now = Date.now();
  switch (msg.type) {
    case 'taiyo-hacchu-state':
      return isObj(msg.state) ? {...sale, hacchu: msg.state} : null;
    case 'taiyo-hacchu-item': {
      const id = text(msg.id);
      if (!isObj(msg.fields) || !sale.items.some((i) => i.id === id)) return null;
      const fields = msg.fields;
      return {...sale, items: sale.items.map((i) => (i.id === id ? itemPatch(i, fields) : i)), updatedAt: now};
    }
    case 'taiyo-hacchu-add': {
      const item = isObj(msg.item) ? itemFromHacchu(msg.item, s) : null;
      if (!item || sale.items.some((i) => i.id === item.id)) return null;
      return {...sale, items: [...sale.items, item], updatedAt: now};
    }
    case 'taiyo-hacchu-remove': {
      const id = text(msg.id);
      if (!sale.items.some((i) => i.id === id)) return null;
      return {...sale, items: sale.items.filter((i) => i.id !== id), updatedAt: now};
    }
    default:
      return null;
  }
}
