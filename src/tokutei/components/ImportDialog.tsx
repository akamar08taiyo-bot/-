import {useMemo, useState} from 'react';
import {
  alignToHeader,
  columnCount,
  decodeText,
  detectListNth,
  detectMapping,
  gridCandidates,
  guessMaker,
  guessSupplier,
  lineCandidates,
  mergeProducts,
  normalize,
  parsePrice,
  textToGrid,
  textToLines,
} from '../import/priceImport.ts';
import type {Candidate, Grid, Mapping, PositionedWord} from '../import/priceImport.ts';
import {isXlsx, readXlsx} from '../import/xlsx.ts';
import type {Sheet} from '../import/xlsx.ts';
import type {Product, Settings} from '../types.ts';
import {matchesAll, yen} from '../util.ts';
import {CategorySelect} from './CategorySelect.tsx';
import {Btn, Modal, NumberInput, Star, TextInput, useToast} from './ui.tsx';

// 仕切り一覧表の取り込み。住宅改修 見積書アプリの「メーカーの仕切り表を取り込む」と同じ流れ
// （ファイルを選ぶ → 読み取った候補の一覧で、取り込む行・★・種目を選ぶ → 商品マスタに入れる）

type Source =
  | {kind: 'xlsx'; sheets: Sheet[]}
  | {kind: 'csv'; grid: Grid}
  | {kind: 'paste'; text: string}
  | {kind: 'pdf'; lines: string[]; words: PositionedWord[][]; pages: number};

type Override = Partial<Pick<Candidate, 'include' | 'favorite' | 'name' | 'price' | 'listPrice' | 'category' | 'sub' | 'categoryByHand'>>;

const PREVIEW_LIMIT = 300;
const colName = (c: number) => {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** 取り込める行がいちばん多いシート（表紙のシートなどを飛ばす） */
function bestSheet(sheets: Sheet[]): number {
  let best = 0;
  let bestCount = -1;
  sheets.forEach((sh, i) => {
    const n = gridCandidates(sh.rows, detectMapping(sh.rows), '').filter((c) => c.include).length;
    if (n > bestCount) {
      best = i;
      bestCount = n;
    }
  });
  return best;
}

export function ImportDialog({
  products,
  settings,
  onDone,
  onClose,
}: {
  products: Product[];
  settings: Settings;
  onDone: (list: Product[]) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [source, setSource] = useState<Source | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mode, setMode] = useState<'table' | 'lines'>('table');
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [nth, setNth] = useState(1);
  const [listNth, setListNth] = useState(0);
  const [maker, setMaker] = useState('');
  const [supplier, setSupplier] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [query, setQuery] = useState('');

  const grid: Grid = useMemo(() => {
    if (!source) return [];
    if (source.kind === 'xlsx') return source.sheets[sheetIndex]?.rows ?? [];
    if (source.kind === 'csv') return source.grid;
    if (source.kind === 'paste') return textToGrid(source.text);
    // PDFは見出しの位置に合わせて列をそろえる（見出しが見つからなければタブで区切る）
    return alignToHeader(source.words) ?? source.lines.map((l) => l.split('\t'));
  }, [source, sheetIndex]);

  const lines: string[] = useMemo(() => {
    if (!source) return [];
    if (source.kind === 'pdf') return source.lines;
    if (source.kind === 'paste') return textToLines(source.text);
    return grid.map((r) => r.join('  '));
  }, [source, grid]);

  const start = (next: Source, name: string) => {
    const firstSheet = next.kind === 'xlsx' ? bestSheet(next.sheets) : 0;
    setSource(next);
    setFileName(name);
    setSheetIndex(firstSheet);
    setOverrides({});
    setQuery('');
    setError('');
    const aligned = next.kind === 'pdf' ? alignToHeader(next.words) : null;
    const g =
      next.kind === 'xlsx' ? (next.sheets[firstSheet]?.rows ?? []) : next.kind === 'csv' ? next.grid : next.kind === 'paste' ? textToGrid(next.text) : (aligned ?? []);
    // PDFは見出しの行が見つかれば「表の列で読む」、なければ「1行ずつ読む」から始める
    const tabular = next.kind === 'xlsx' || next.kind === 'csv' || (next.kind === 'paste' && /\t/.test(next.text)) || aligned !== null;
    setMode(tabular ? 'table' : 'lines');
    setMapping(tabular ? detectMapping(g) : null);
    setNth(1);
    setListNth(detectListNth(next.kind === 'pdf' ? next.lines : next.kind === 'paste' ? textToLines(next.text) : g.map((r) => r.join('  '))));
    const top = [name, ...g.slice(0, 8).map((r) => r.join(' '))];
    if (!maker) setMaker(guessMaker(top));
    if (!supplier) setSupplier(guessSupplier(top, settings.suppliers));
  };

  const readFile = async (f: File) => {
    setError('');
    setBusy('読み取っています…');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const head = String.fromCharCode(...bytes.slice(0, 5));
      if (head === '%PDF-') {
        setBusy('PDFを読み取っています…（ページ数が多いと少し時間がかかります）');
        const {pdfToLines, NoTextError} = await import('../import/pdfText.ts');
        try {
          const r = await pdfToLines(bytes);
          start({kind: 'pdf', lines: r.lines, words: r.words, pages: r.pages}, f.name);
        } catch (e) {
          if (e instanceof NoTextError) {
            setError('このPDFは紙をスキャンした画像だけのPDFで、文字の情報がありません。Excel・CSVの仕切り一覧表を取り込んでください。');
          } else throw e;
        }
      } else if (isXlsx(bytes)) {
        const sheets = readXlsx(bytes).filter((s) => s.rows.length > 0);
        if (sheets.length === 0) setError('Excelの中に表が見つかりませんでした。');
        else start({kind: 'xlsx', sheets}, f.name);
      } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
        setError('古い形式のExcel（.xls）は読めません。Excelで開いて「名前を付けて保存」→「Excel ブック（.xlsx）」で保存し直してから選んでください。');
      } else {
        start({kind: 'csv', grid: textToGrid(decodeText(bytes), 'csv')}, f.name);
      }
    } catch (e) {
      setError(`読み取れませんでした：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  const base: Candidate[] = useMemo(() => {
    if (!source) return [];
    if (mode === 'table' && mapping) return gridCandidates(grid, mapping, maker.trim());
    return lineCandidates(lines, nth, maker.trim(), listNth);
  }, [source, mode, mapping, grid, lines, nth, listNth, maker]);

  const candidates = useMemo(() => base.map((c) => ({...c, ...overrides[c.key]})), [base, overrides]);
  const filtered = useMemo(() => candidates.filter((c) => matchesAll(`${c.name} ${c.code} ${c.maker} ${c.category} ${c.sub}`, query)), [candidates, query]);
  const included = candidates.filter((c) => c.include && (c.name || c.code) && (c.price !== null || c.listPrice !== null));
  const favCount = included.filter((c) => c.favorite).length;
  const noCategory = included.filter((c) => c.name && !c.category).length;

  const setOv = (key: string, patch: Override) => setOverrides((o) => ({...o, [key]: {...o[key], ...patch}}));
  const setMany = (list: Candidate[], patch: (c: Candidate) => Override) =>
    setOverrides((o) => {
      const next = {...o};
      for (const c of list) next[c.key] = {...next[c.key], ...patch(c)};
      return next;
    });

  const doImport = () => {
    const r = mergeProducts(products, included, fileName, supplier.trim());
    onDone(r.list);
    toast(`商品マスタに取り込みました：新しく ${r.added}件・更新 ${r.updated}件・変わらず ${r.unchanged}件`);
    onClose();
  };

  const cols = columnCount(grid);
  const sample = (c: number) => {
    const from = mapping && mapping.header >= 0 ? mapping.header + 1 : 0;
    const values = grid
      .slice(from, from + 30)
      .map((r) => normalize(r?.[c]))
      .filter(Boolean);
    const prices = values.filter((v) => parsePrice(v) !== null);
    const v = (prices.length >= values.length / 4 ? prices[0] : values[0]) ?? '';
    return v.length > 14 ? v.slice(0, 14) + '…' : v;
  };
  const colSelect = (label: string, field: Exclude<keyof Mapping, 'priceTaxIn' | 'listTaxIn'>, optional: boolean) =>
    mapping && (
      <label className="grid gap-1 text-xs font-bold text-slate-600">
        {label}
        <select
          value={mapping[field]}
          onChange={(e) => setMapping({...mapping, [field]: Number(e.target.value)})}
          className="h-9 min-w-[10rem] rounded-md border border-slate-300 px-2 text-sm font-normal"
        >
          {optional && <option value={-1}>（なし）</option>}
          {Array.from({length: cols}, (_, c) => (
            <option key={c} value={c}>
              {colName(c)}列：{sample(c)}
            </option>
          ))}
        </select>
      </label>
    );

  return (
    <Modal
      wide
      title="仕切り一覧表を取り込む"
      onClose={onClose}
      footer={
        source ? (
          <>
            <span className="mr-auto text-sm text-slate-600">
              取り込む <b className="text-slate-900">{included.length}</b>件（うち★ {favCount}件{noCategory > 0 ? `・種目なし ${noCategory}件` : ''}）／ 読み取った {candidates.length}件
            </span>
            <Btn color="white" onClick={() => setSource(null)}>
              別のファイルにする
            </Btn>
            <Btn color="purple" disabled={included.length === 0} onClick={doImport}>
              商品マスタに取り込む（{included.length}件）
            </Btn>
          </>
        ) : undefined
      }
    >
      {!source ? (
        <div className="space-y-4">
          <label
            className="block cursor-pointer rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 p-6 text-center hover:bg-purple-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void readFile(f);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.csv,.txt,.tsv,.pdf,application/pdf,text/csv"
              className="hidden"
              aria-label="仕切り一覧表のファイル"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
                e.target.value = '';
              }}
            />
            <div className="text-base font-bold text-purple-800">📄 仕切り一覧表のファイルを選ぶ（ここにドラッグ＆ドロップでも可）</div>
            <div className="mt-1 text-xs text-slate-600">Excel（.xlsx）・CSV・PDF（文字の入ったもの）</div>
          </label>
          {busy && <p className="text-sm font-bold text-purple-700">{busy}</p>}
          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 text-sm font-bold text-slate-700">または、表をコピーして貼り付ける</div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              aria-label="貼り付けた表"
              className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
              placeholder={'例）\n品番\t商品名\t定価\t仕切\n536-057\tシャワーベンチ\t35,000\t21,000'}
            />
            <div className="mt-2 text-right">
              <Btn color="purple" disabled={!pasteText.trim()} onClick={() => start({kind: 'paste', text: pasteText}, '')}>
                貼り付けた表を読み取る
              </Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-600">
              <div className="font-bold text-slate-800">{fileName || '貼り付けた表'}</div>
              {source.kind === 'pdf' ? (
                <div>
                  PDF {source.pages}ページ・{source.lines.length}行
                </div>
              ) : (
                <div>{grid.length}行</div>
              )}
            </div>
            {source.kind === 'xlsx' && source.sheets.length > 1 && (
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                シート
                <select
                  value={sheetIndex}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setSheetIndex(i);
                    setOverrides({});
                    setMapping(detectMapping(source.sheets[i]?.rows ?? []));
                  }}
                  className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
                >
                  {source.sheets.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name}（{s.rows.length}行）
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              メーカー名（表にメーカーの列がないとき）
              <TextInput value={maker} onChange={setMaker} placeholder="例：アロン化成" className="w-44 font-normal" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              仕入先（発注先）
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-9 w-40 rounded-md border border-slate-300 px-2 text-sm font-normal">
                <option value="">（なし）</option>
                {[...new Set([...settings.suppliers, supplier].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-xs font-bold text-slate-600">
              読み取り方
              <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
                {(
                  [
                    ['table', '表の列で読む'],
                    ['lines', '1行ずつ読む'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setMode(id);
                      setOverrides({});
                      if (id === 'table' && !mapping) setMapping(detectMapping(grid));
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-bold ${mode === id ? 'bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-300' : 'text-slate-600 hover:bg-violet-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {mode === 'table' && mapping ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-bold text-slate-600">
                見出しの行
                <select
                  value={mapping.header}
                  onChange={(e) => setMapping(detectHeaderAt(grid, Number(e.target.value), mapping))}
                  className="h-9 rounded-md border border-slate-300 px-2 text-sm font-normal"
                >
                  <option value={-1}>（見出しなし）</option>
                  {grid.slice(0, 30).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1}行目：{normalize(r.filter(Boolean).join(' / ')).slice(0, 30)}
                    </option>
                  ))}
                </select>
              </label>
              {colSelect('商品名の列', 'name', false)}
              {colSelect('定価の列', 'list', true)}
              {colSelect('仕切の列', 'price', true)}
              {colSelect('品番の列', 'code', true)}
              {colSelect('メーカーの列', 'maker', true)}
              {colSelect('TAISコードの列', 'tais', true)}
              {colSelect('税区分の列', 'tax', true)}
              {colSelect('種目・分類の列', 'cat', true)}
              <label className="flex h-9 items-center gap-1.5 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={mapping.listTaxIn} onChange={(e) => setMapping({...mapping, listTaxIn: e.target.checked})} />
                定価は税込
              </label>
              <label className="flex h-9 items-center gap-1.5 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={mapping.priceTaxIn} onChange={(e) => setMapping({...mapping, priceTaxIn: e.target.checked})} />
                仕切は税込
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              仕切にするのは、1行の中の
              <select value={nth} onChange={(e) => setNth(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 px-2" aria-label="仕切にする金額">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    右から{n}番目
                  </option>
                ))}
              </select>
              の金額。定価は
              <select value={listNth} onChange={(e) => setListNth(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 px-2" aria-label="定価にする金額">
                <option value={0}>読まない</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    右から{n}番目
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <TextInput value={query} onChange={setQuery} placeholder="読み取った中から検索" className="w-56" aria-label="読み取った中から検索" />
            <Btn small color="white" onClick={() => setMany(filtered, () => ({include: true}))}>
              {query ? '表示中を' : 'すべて'}チェック
            </Btn>
            <Btn small color="white" onClick={() => setMany(filtered, () => ({include: false}))}>
              {query ? '表示中の' : 'すべての'}チェックを外す
            </Btn>
            <Btn small color="white" onClick={() => setMany(filtered, (c) => ({include: c.category !== '' && (c.price !== null || c.listPrice !== null)}))}>
              種目が決まったものだけチェック
            </Btn>
            <Btn small color="amber" onClick={() => setMany(filtered.filter((c) => c.include), () => ({favorite: true}))}>
              チェックした行を★に
            </Btn>
          </div>

          {candidates.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">商品名と金額の組み合わせが見つかりませんでした。上の「読み取り方」や列の選び方を変えてみてください。</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-12 px-2 py-1.5">取込</th>
                    <th className="w-10 px-1 py-1.5">★</th>
                    <th className="w-10 px-1 py-1.5 text-right">行</th>
                    <th className="w-64 px-2 py-1.5 text-left">種目</th>
                    <th className="px-2 py-1.5 text-left">品番・商品名・メーカー</th>
                    <th className="w-28 px-2 py-1.5 pr-4 text-right">定価（税抜）</th>
                    <th className="w-28 px-2 py-1.5 pr-4 text-right">仕切（税抜）</th>
                    <th className="w-16 px-2 py-1.5">税</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, PREVIEW_LIMIT).map((c) => (
                    <tr key={c.key} className={`border-t border-slate-100 align-top ${c.include ? '' : 'bg-slate-50 text-slate-400'}`}>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={c.include} onChange={(e) => setOv(c.key, {include: e.target.checked})} aria-label={`${c.name}を取り込む`} />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <Star on={c.favorite} onClick={() => setOv(c.key, {favorite: !c.favorite, include: true})} label={`${c.name}を★に`} />
                      </td>
                      <td className="px-1 py-2 text-right text-xs tabular-nums">{c.row}</td>
                      <td className="px-2 py-1">
                        <CategorySelect
                          category={c.category}
                          sub={c.sub}
                          onChange={(category, sub) => setOv(c.key, {category, sub, categoryByHand: true, include: true})}
                          className="w-full"
                          ariaLabel={`${c.name}の種目`}
                        />
                        {c.warn && !c.category && <div className="mt-0.5 text-[11px] text-rose-600">{c.warn}</div>}
                      </td>
                      <td className="px-2 py-1">
                        <TextInput value={c.name} onChange={(name) => setOv(c.key, {name})} className="w-full min-w-[16rem]" aria-label="商品名" />
                        <div className="mt-0.5 px-1 text-[11px] text-slate-500">
                          {[c.code, c.maker, c.tais && `TAIS ${c.tais}`, c.unit].filter(Boolean).join('　')}
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {c.listPrice === null ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <NumberInput value={c.listPrice} onChange={(listPrice) => setOv(c.key, {listPrice})} className="w-24" ariaLabel="定価" />
                        )}
                        {c.listPrice !== null && (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            販売 {yen(Math.floor((c.listPrice * (100 - settings.discountRate)) / 100))}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {c.price === null ? (
                          <span className="text-xs text-slate-400">空欄</span>
                        ) : (
                          <NumberInput value={c.price} onChange={(price) => setOv(c.key, {price})} className="w-24" ariaLabel="仕切" />
                        )}
                      </td>
                      <td className="px-2 py-2 text-center text-xs">{c.taxType === '10%' ? '課税' : c.taxType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > PREVIEW_LIMIT && (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  {filtered.length}件のうち最初の{PREVIEW_LIMIT}件を表示しています（チェック・★のボタンは表示していない分にも効きます）。
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            すでに商品マスタにある商品（同じメーカーで品番が同じもの。品番がなければ商品名が同じもの）は、新しい定価・仕切に書き換えます。★・手で選んだ種目はそのまま残ります。
            {included.length > 0 && noCategory > 0 && ` 種目が決まっていない ${noCategory}件は、あとで商品マスタで選べます。`}
          </p>
        </div>
      )}
    </Modal>
  );
}

/** 見出しの行を変えたら、その行で列を読み直す（見つからなければ今の列のまま） */
function detectHeaderAt(grid: Grid, header: number, current: Mapping): Mapping {
  if (header < 0) return {...current, header};
  const m = detectMapping(grid.slice(header));
  return m.header === 0 ? {...m, header} : {...current, header};
}
