// 販売見積書の「📷 スクショから自動認識」（ユーザーの指示「販売見積書は、見積もり書を作成する為のみに作成。スクショから切り取って作成にすると、
// 自動認識を使えるようにする。ケアマックスとウェルファンのカタログにも飛べるように、リンクも準備」2026-10-25）。
// 読み取りは販売受注簿作成ツールのもの（介援隊のカタログで確かめてある）をそのまま使う：同じサイトの /taiyo-hacchu-scan/?embed=scan を窓の中に出し
// （画像の欄だけ。受注簿ツールの src/main.jsx の tokutei-scan-begin〜end）、読み取った商品を postMessage（taiyo-hacchu-scanned）で受け取る。
// ここは受け取った値を見積書の商品の1行にするところ。

import {guessCategory} from './category.ts';
import {HACCHU_PATH} from './handoff.ts';
import {blankItem} from './sales.ts';
import type {SaleItem, Settings, TaxType} from './types.ts';

/** 窓の中に出す受注簿ツールの読み取り（画像の欄だけ） */
export const SCAN_PATH = `${HACCHU_PATH}?embed=scan`;

/** 開くカタログ（新しいタブ）。ケアマックス＝介援隊のカタログ（受注簿ツールの発注先の初めの値も「ケアマックス」） */
export const CATALOG_SITES = [
  {name: 'ケアマックス（介援隊）', url: 'https://www.kaientai.cc/Default.aspx'},
  {name: 'ウェルファン', url: 'https://www.welfan.shop/'},
] as const;

/** 読み取った商品（窓の右の欄。直してから見積書に入れる） */
export type ScanDraft = {
  name: string;
  maker: string;
  code: string; // 型番
  listPrice: number; // 定価（税抜）
  cost: number; // 仕切り（税抜）
  taxType: TaxType;
  unit: string;
  supplier: string; // 発注先（受注簿ツールの初めの値「ケアマックス」、カタログの見本で「ウェルファン版」を選ぶと「ウェルファン」）
  category: string;
  sub: string;
};

export const EMPTY_SCAN: ScanDraft = {name: '', maker: '', code: '', listPrice: 0, cost: 0, taxType: '10%', unit: '台', supplier: '', category: '', sub: ''};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** 受注簿の金額の欄（"35000"・"35,000" など）。空・数でないものは 0 */
const yenOf = (v: unknown) => {
  const n = Number(text(v).normalize('NFKC').replace(/[,円¥\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const TAX: TaxType[] = ['10%', '8%', '非課税'];
const TAX_RATE: Record<TaxType, number> = {'10%': 0.1, '8%': 0.08, 非課税: 0};

/**
 * 受注簿ツールから届いた読み取りの値を、窓の右の欄にする。商品名・型番・定価・仕切りのどれもなければ null（まだ読んでいない・読めなかった）。
 * 定価（税抜）がなく税込だけ読めたときは、税込から戻す
 */
export function scanDraft(raw: unknown): ScanDraft | null {
  if (!isObj(raw)) return null;
  const taxType = TAX.includes(raw.taxType as TaxType) ? (raw.taxType as TaxType) : '10%';
  const taxIn = yenOf(raw.listPriceTaxIn);
  const listPrice = yenOf(raw.listPrice) || (taxIn ? Math.round(taxIn / (1 + TAX_RATE[taxType])) : 0);
  const name = text(raw.productName);
  const code = text(raw.modelNumber);
  const cost = yenOf(raw.cost);
  if (!name && !code && !listPrice && !cost) return null;
  const g = guessCategory(name);
  return {name, maker: text(raw.maker), code, listPrice, cost, taxType, unit: text(raw.unit) || '台', supplier: text(raw.supplier), category: g.category, sub: g.sub};
}

/** 窓の右の欄の商品を、見積書の商品の1行にする（商品マスタの商品ではない。割引率は設定の初めの値） */
export function itemFromScan(d: ScanDraft, s: Pick<Settings, 'discountRate'>): SaleItem {
  return {
    ...blankItem(s),
    name: d.name.trim(),
    maker: d.maker.trim(),
    code: d.code.trim(),
    category: d.category,
    sub: d.sub,
    unit: d.unit.trim() || '台',
    supplier: d.supplier.trim(),
    taxType: d.taxType,
    listPrice: Math.max(0, Math.round(d.listPrice)),
    cost: Math.max(0, Math.round(d.cost)),
  };
}
