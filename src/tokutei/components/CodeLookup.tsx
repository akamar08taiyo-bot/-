// 「🔢 型番から入力」（ユーザーの指示「カタログから商品検索と、お気に入りから入力、型番から入力の三つに絞る（カタログ商品検索と、型番から商品をひっぱってくるのは、
// 絶対に検索をまちがってもらっては困るので、確実に該当商品に当たるかを照らし合わせる）」2026-11-03）：
// 品番の欄に打った型番と、カタログの品番・介援隊の注文番号・商品マスタの品番が「ぴったり同じ」商品だけを入れる（全角・半角、大文字・小文字、空白とハイフンの違いだけは同じとみなす。
// 前方一致・あいまいな一致はしない）。見つかった商品の名前・メーカー・品番を欄の下に出して、照らし合わせられるようにする。
// 同じ型番で別の商品が2つ以上あれば、選んでもらう。1つもなければ何も入れずに知らせる
import {useState} from 'react';
import type {ReactNode} from 'react';
import type {CatalogProduct} from '../catalogItems.ts';
import type {CodeHit} from '../codeLookup.ts';
import {codeMatchKey, findByCode} from '../codeLookup.ts';
import {loadCatalogProducts} from '../print/catalogPdf.ts';
import type {Product, SaleItem, Settings} from '../types.ts';
import {TextInput} from './ui.tsx';

/**
 * 品番の欄と「🔢 型番から検索」。ボタンはカタログの商品の枠の「📖 カタログから商品検索」の右（ユーザーの指示「その真下に、カタログから商品検索をもってくる。
 * 右側に型番から検索をもってくる」2026-11-03）。入れる所の幅（400px ほど）にボタン2つと品番の欄は並ばないので、品番の欄は商品名の右に置く
 * （前は商品名の右に品番の欄とボタン＝lead で、ボタンの名前は「型番から入力」）。置く所が3つに分かれるので、部品を渡して置いてもらう（children）
 */
export function CodeLookup({
  item,
  products,
  onPick,
  onPicked,
  children,
  settings,
}: {
  item: SaleItem;
  products: Product[];
  settings: Pick<Settings, 'discountRate'>; // 割引率（商品マスタの商品は商品の割引率、なければこれ。カタログの商品はこれ）
  onPick: (patch: Partial<SaleItem>) => void;
  onPicked?: (item: SaleItem) => void;
  children: (parts: {input: ReactNode; button: ReactNode; note: ReactNode}) => ReactNode;
}) {
  const [msg, setMsg] = useState<{ok: boolean; text: string} | null>(null);
  const [many, setMany] = useState<CodeHit[]>([]);
  const [busy, setBusy] = useState(false);
  const put = (h: CodeHit) => {
    onPick(h.patch);
    onPicked?.({...item, ...h.patch});
    setMany([]);
    setMsg({ok: true, text: `✓ 型番 ${h.patch.code}：${h.label} を入れました`});
  };
  const look = async () => {
    const code = item.code.trim();
    setMany([]);
    if (codeMatchKey(code).length < 3) {
      setMsg({ok: false, text: '品番の欄に型番を打ってから押してください'});
      return;
    }
    setBusy(true);
    let catalog: CatalogProduct[] = [];
    try {
      catalog = await loadCatalogProducts();
    } catch {
      // カタログが読めなくても、商品マスタはさがす
    }
    setBusy(false);
    const hits = findByCode(code, catalog, products, item, settings);
    if (hits.length === 1) put(hits[0]);
    else if (hits.length > 1) {
      setMany(hits);
      setMsg({ok: false, text: `型番 ${code} の商品が ${hits.length} つあります。入れる商品を選んでください`});
    } else setMsg({ok: false, text: `型番 ${code} とぴったり同じ商品は、カタログ・商品マスタにありません（何も入れていません）`});
  };
  const input = (
    <TextInput
      value={item.code}
      onChange={(code) => {
        onPick({code});
        setMsg(null);
        setMany([]);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        void look();
      }}
      placeholder="品番（型番）"
      className="w-36 min-w-0 shrink text-sm"
      aria-label="品番"
    />
  );
  const button = (
    <button
      type="button"
      onClick={() => void look()}
      disabled={busy}
      className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm font-bold leading-tight text-slate-700 [word-break:keep-all] hover:bg-slate-50 disabled:opacity-60"
      title="商品名の右の品番の欄の型番とぴったり同じ商品を、カタログ・商品マスタから入れる"
    >
      🔢 型番から
      <wbr />
      検索
    </button>
  );
  const note =
    msg || many.length > 1 ? (
      <div className="grid min-w-0 gap-1">
        {msg && (
          <p role="status" className={`rounded px-2 py-1 text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
            {msg.text}
          </p>
        )}
        {many.length > 1 && (
          <div role="group" aria-label="同じ型番の商品" className="flex flex-wrap gap-1.5">
            {many.map((h) => (
              <button key={h.key} type="button" onClick={() => put(h)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs text-slate-800 hover:border-sky-400 hover:bg-sky-50">
                {h.label}
              </button>
            ))}
          </div>
        )}
      </div>
    ) : null;
  return <>{children({input, button, note})}</>;
}
