import {useMemo, useState} from 'react';
import {
  alignToHeader,
  columnCount,
  decodeText,
  detectListNth,
  detectMapping,
  gridCandidates,
  guessMaker,
  lineCandidates,
  mergeMaterials,
  normalize,
  textToGrid,
  textToLines,
} from '../priceImport.ts';
import type {Candidate, Grid, Mapping, PositionedWord} from '../priceImport.ts';
import type {Material} from '../types.ts';
import {matchesAll, num} from '../util.ts';
import {isXlsx, readXlsx} from '../xlsx.ts';
import type {Sheet} from '../xlsx.ts';
import {Btn, Modal, NumberInput, Star, TextInput, useToast} from './ui.tsx';

type Source =
  | {kind: 'xlsx'; sheets: Sheet[]}
  | {kind: 'csv'; grid: Grid}
  | {kind: 'paste'; text: string}
  | {kind: 'pdf'; lines: string[]; words: PositionedWord[][]; pages: number};

type Override = Partial<Pick<Candidate, 'include' | 'favorite' | 'name' | 'price' | 'listPrice'>>;

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

/** ファイル名から「マツ六」などのメーカー名を推測（「_仕切」「価格表」などを除く） */
function makerFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  const cleaned = normalize(base)
    .replace(/(20\d{2}|令和\d+|R\d+)[年.\-_/]?\d{0,2}月?/g, '')
    .replace(/(仕切り?表?|仕切価格表?|価格表|単価表|プライスリスト|price ?list|改定|一覧|版|最新)/gi, '')
    .replace(/[_\-()（）[\]【】\s]+/g, ' ')
    .trim();
  // 日本語の入った短い名前だけをメーカー名とみなす（「maker list」のような英語のファイル名は使わない）
  return cleaned.length <= 12 && /[^\x00-\x7f]/.test(cleaned) ? cleaned : '';
}

/** 取り込める行がいちばん多いシート */
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

export function ImportDialog({materials, onDone, onClose}: {materials: Material[]; onDone: (list: Material[]) => void; onClose: () => void}) {
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
    // Excel は、取り込める行がいちばん多いシートから始める（表紙のシートなどを飛ばす）
    const firstSheet = next.kind === 'xlsx' ? bestSheet(next.sheets) : 0;
    setSource(next);
    setFileName(name);
    setSheetIndex(firstSheet);
    setOverrides({});
    setQuery('');
    setError('');
    const aligned = next.kind === 'pdf' ? alignToHeader(next.words) : null;
    const g =
      next.kind === 'xlsx'
        ? next.sheets[firstSheet]?.rows ?? []
        : next.kind === 'csv'
          ? next.grid
          : next.kind === 'paste'
            ? textToGrid(next.text)
            : aligned ?? [];
    // PDFは見出しの行が見つかれば「表の列で読む」、なければ「1行ずつ読む」から始める
    const tabular = next.kind === 'xlsx' || next.kind === 'csv' || (next.kind === 'paste' && /\t/.test(next.text)) || aligned !== null;
    setMode(tabular ? 'table' : 'lines');
    setMapping(tabular ? detectMapping(g) : null);
    setNth(1);
    setListNth(detectListNth(next.kind === 'pdf' ? next.lines : next.kind === 'paste' ? textToLines(next.text) : g.map((r) => r.join('  '))));
    if (!maker) setMaker(guessMaker([name, ...g.slice(0, 8).map((r) => r.join(' '))]) || makerFromFileName(name));
  };

  const readFile = async (f: File) => {
    setError('');
    setBusy('読み取っています…');
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const head = String.fromCharCode(...bytes.slice(0, 5));
      if (head === '%PDF-') {
        setBusy('PDFを読み取っています…（ページ数が多いと少し時間がかかります）');
        const {pdfToLines, NoTextError} = await import('../pdfText.ts');
        try {
          const r = await pdfToLines(bytes);
          start({kind: 'pdf', lines: r.lines, words: r.words, pages: r.pages}, f.name);
        } catch (e) {
          if (e instanceof NoTextError) {
            setError(
              'このPDFには文字の情報がありません（紙をスキャンしたPDFのようです）。メーカーにExcel・CSVの仕切り表をもらうか、文字を読み取れるPDFを使ってください。',
            );
          } else throw e;
        }
      } else if (isXlsx(bytes)) {
        const sheets = readXlsx(bytes).filter((s) => s.rows.length > 0);
        if (sheets.length === 0) setError('Excelの中に表が見つかりませんでした。');
        else start({kind: 'xlsx', sheets}, f.name);
      } else if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
        setError('古い形式のExcel（.xls）は読めません。Excelで開いて「名前を付けて保存」→「Excel ブック（.xlsx）」で保存し直してから選んでください。');
      } else {
        const text = decodeText(bytes);
        start({kind: 'csv', grid: textToGrid(text, 'csv')}, f.name);
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
  const filtered = useMemo(() => candidates.filter((c) => matchesAll(`${c.name} ${c.code} ${c.maker}`, query)), [candidates, query]);
  const included = candidates.filter((c) => c.include && (c.name || c.code) && (c.price !== null || c.listPrice !== null));
  const favCount = included.filter((c) => c.favorite).length;
  const noShikiri = included.filter((c) => c.price === null).length;

  const setOv = (key: string, patch: Override) => setOverrides((o) => ({...o, [key]: {...o[key], ...patch}}));
  const setMany = (list: Candidate[], patch: Override) =>
    setOverrides((o) => {
      const next = {...o};
      for (const c of list) next[c.key] = {...next[c.key], ...patch};
      return next;
    });

  const doImport = () => {
    const r = mergeMaterials(materials, included);
    onDone(r.list);
    toast(
      `部材リストに取り込みました：新しく ${r.added}件・価格を更新 ${r.updated}件・変わらず ${r.unchanged}件` +
        (noShikiri > 0 ? `（仕切価格が空欄の ${noShikiri}件は、あとで仕切価格の入った表を取り込むと入ります）` : ''),
    );
    onClose();
  };

  const cols = columnCount(grid);
  const sample = (c: number) => {
    const from = mapping && mapping.header >= 0 ? mapping.header + 1 : 0;
    for (let r = from; r < Math.min(grid.length, from + 30); r++) {
      const v = normalize(grid[r]?.[c]);
      if (v) return v.length > 14 ? v.slice(0, 14) + '…' : v;
    }
    return '';
  };
  const colSelect = (label: string, field: keyof Mapping, optional: boolean) =>
    mapping && (
      <label className="grid gap-1 text-xs font-bold text-slate-600">
        {label}
        <select
          value={mapping[field]}
          onChange={(e) => setMapping({...mapping, [field]: Number(e.target.value)})}
          className="h-9 min-w-[11rem] rounded-md border border-slate-300 px-2 text-sm font-normal"
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
      title="メーカーの仕切り表を取り込む"
      onClose={onClose}
      footer={
        source ? (
          <>
            <span className="mr-auto text-sm text-slate-600">
              取り込む <b className="text-slate-900">{included.length}</b>件（うち★ {favCount}件{noShikiri > 0 ? `・仕切価格が空欄 ${noShikiri}件` : ''}）／ 読み取った {candidates.length}件
            </span>
            <Btn color="white" onClick={() => setSource(null)}>
              別のファイルにする
            </Btn>
            <Btn color="purple" disabled={included.length === 0} onClick={doImport}>
              部材リストに取り込む（{included.length}件）
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
              if (f) readFile(f);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.csv,.txt,.tsv,.pdf,application/pdf,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
                e.target.value = '';
              }}
            />
            <div className="text-base font-bold text-purple-800">📄 仕切り表のファイルを選ぶ（ここにドラッグ＆ドロップでも可）</div>
            <div className="mt-1 text-xs text-slate-600">Excel（.xlsx）・CSV・PDF（文字の入ったもの）に対応しています。</div>
          </label>
          {busy && <p className="text-sm font-bold text-purple-700">{busy}</p>}
          {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 text-sm font-bold text-slate-700">または、表をコピーして貼り付ける</div>
            <p className="mb-2 text-xs text-slate-500">ExcelやPDFの表を選んでコピー（Ctrl+C）し、下に貼り付け（Ctrl+V）てください。</p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
              placeholder={'例）\n品番\t商品名\t定価\t仕切\nBP-600\t手すり I型 600mm\t4,800\t3,360'}
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
              {source.kind === 'pdf' && <div>PDF {source.pages}ページ・{source.lines.length}行</div>}
              {source.kind !== 'pdf' && <div>{grid.length}行</div>}
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
              <TextInput value={maker} onChange={setMaker} placeholder="例：マツ六" className="w-48 font-normal" />
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
                    className={`rounded-md px-3 py-1.5 text-sm font-bold ${mode === id ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-purple-50'}`}
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
                  onChange={(e) => setMapping({...mapping, header: Number(e.target.value)})}
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
              {colSelect('仕切価格の列（空欄なら「なし」）', 'price', true)}
              {colSelect('定価の列（見積に使う）', 'list', true)}
              {colSelect('品番の列', 'code', true)}
              {colSelect('メーカーの列', 'maker', true)}
              {colSelect('単位の列', 'unit', true)}
              {colSelect('1本の長さの列（切って使う部材）', 'len', true)}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              仕切価格にするのは、1行の中の
              <select value={nth} onChange={(e) => setNth(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 px-2">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    右から{n}番目
                  </option>
                ))}
              </select>
              の金額。定価（見積に使う）は
              <select value={listNth} onChange={(e) => setListNth(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 px-2" aria-label="定価にする金額">
                <option value={0}>読まない</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    右から{n}番目
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">（「定価 4,800　仕切 3,360」のように並んでいれば、仕切は右から1番目・定価は2番目）</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <TextInput value={query} onChange={setQuery} placeholder="読み取った中から検索" className="w-64" />
            <Btn small color="white" onClick={() => setMany(filtered, {include: true})}>
              {query ? '表示中を' : 'すべて'}チェック
            </Btn>
            <Btn small color="white" onClick={() => setMany(filtered, {include: false})}>
              {query ? '表示中の' : 'すべての'}チェックを外す
            </Btn>
            <Btn small color="amber" onClick={() => setMany(filtered.filter((c) => c.include), {favorite: true})}>
              チェックした行を★（お気に入り）に
            </Btn>
            <span className="text-xs text-slate-500">よく使う部材だけチェックして取り込むこともできます。</span>
          </div>

          {candidates.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              商品名と金額の組み合わせが見つかりませんでした。上の「読み取り方」や列の選び方を変えてみてください。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-14 px-2 py-1.5">取込</th>
                    <th className="w-10 px-1 py-1.5">★</th>
                    <th className="w-12 px-2 py-1.5 text-right">行</th>
                    <th className="px-2 py-1.5 text-left">品番</th>
                    <th className="px-2 py-1.5 text-left">商品名</th>
                    <th className="px-2 py-1.5 text-left">メーカー</th>
                    <th className="w-32 px-2 py-1.5 pr-4 text-right">定価</th>
                    <th className="w-32 px-2 py-1.5 pr-4 text-right">仕切価格</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, PREVIEW_LIMIT).map((c) => (
                    <tr key={c.key} className={`border-t border-slate-100 ${c.include ? '' : 'bg-slate-50 text-slate-400'}`}>
                      <td className="px-2 text-center">
                        <input type="checkbox" checked={c.include} onChange={(e) => setOv(c.key, {include: e.target.checked})} aria-label={`${c.name}を取り込む`} />
                      </td>
                      <td className="px-1 text-center">
                        <Star on={c.favorite} onClick={() => setOv(c.key, {favorite: !c.favorite, include: true})} label={`${c.name}を★に`} />
                      </td>
                      <td className="px-2 text-right text-xs tabular-nums">{c.row}</td>
                      <td className="px-2 text-xs">{c.code}</td>
                      <td className="px-2 py-1">
                        <TextInput value={c.name} onChange={(name) => setOv(c.key, {name})} className="w-full min-w-[16rem]" />
                        {c.pieceLengthM > 0 && <div className="px-1 text-[11px] text-slate-500">1本の長さ {num(c.pieceLengthM)}m</div>}
                      </td>
                      <td className="px-2 text-xs">{c.maker}</td>
                      <td className="px-2 py-1 text-right">
                        {c.listPrice === null ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <NumberInput value={c.listPrice} onChange={(listPrice) => setOv(c.key, {listPrice})} className="w-28" ariaLabel="定価" />
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {c.price === null ? (
                          <span className="text-xs text-slate-400" title="仕切価格の入った表をあとで取り込むと入ります">
                            空欄（あとで）
                          </span>
                        ) : (
                          <NumberInput value={c.price} onChange={(price) => setOv(c.key, {price})} className="w-28" ariaLabel="仕切価格" />
                        )}
                      </td>
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
            すでに部材リストにある商品（同じメーカーで品番が同じもの。品番がなければ商品名が同じもの）は、新しい仕切価格・定価に書き換えます。★はそのまま残ります。
            表の仕切価格が空欄のときは、今の仕切価格のままにします。あとで仕切価格を入れた表（品番と仕切価格の列だけでもよい）を取り込むと、仕切価格だけが入ります。
            定価は見積書の単価（定価×掛率。設定で決めます）に使います。
          </p>
        </div>
      )}
    </Modal>
  );
}
