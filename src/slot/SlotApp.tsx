import {useEffect, useMemo, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {Card, CardTitle, SegmentedControl, StatTile} from '../mortgage/ui';
import {
  backtest,
  dayOfMonth,
  dayReport,
  DEFAULT_HOT_RULE,
  describeFilter,
  neighborAnalysis,
  periodReport,
  prevDayAnalysis,
  recommend,
  STRATEGY_LABELS,
  unitPayout,
  weekdayOf,
} from './analyze';
import type {DayFilter, GroupSummary, HotRule, PeriodReport, Pick, Strategy} from './analyze';
import {generateDemo} from './demo';
import {diffClass, int, pct, shortDate, signed} from './format';
import {parseInput, toCsv} from './parse';
import {makePrediction} from './publish';
import type {Prediction} from './publish';
import {PublishView} from './PublishView';
import {loadPredictions, loadRows, mergeRows, savePredictions, saveRows, upsertPrediction} from './storage';
import {DataTable} from './Table';
import type {Column} from './Table';
import type {SlotRow} from './types';

type Tab = 'import' | 'day' | 'period' | 'pick' | 'verify' | 'publish';

const TABS: {value: Tab; label: string}[] = [
  {value: 'import', label: '取り込み'},
  {value: 'day', label: '日別'},
  {value: 'period', label: '期間・月間'},
  {value: 'pick', label: '狙い目'},
  {value: 'verify', label: '検証'},
  {value: 'publish', label: '発信'},
];

export function SlotApp() {
  const [rows, setRows] = useState<SlotRow[]>(() => loadRows());
  const [tab, setTab] = useState<Tab>(() => (loadRows().length ? 'day' : 'import'));
  const [store, setStore] = useState<string>('');
  const [hotRule, setHotRule] = useState<HotRule>(DEFAULT_HOT_RULE);

  const [predictions, setPredictions] = useState<Prediction[]>(() => loadPredictions());

  useEffect(() => saveRows(rows), [rows]);
  useEffect(() => savePredictions(predictions), [predictions]);
  const recordPrediction = (p: Prediction) => setPredictions((list) => upsertPrediction(list, p));

  const stores = useMemo(() => [...new Set(rows.map((r) => r.store))].sort(), [rows]);
  const activeStore = stores.includes(store) ? store : (stores[0] ?? '');
  const storeRows = useMemo(() => rows.filter((r) => r.store === activeStore), [rows, activeStore]);
  const dates = useMemo(() => [...new Set(storeRows.map((r) => r.date))].sort(), [storeRows]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">スロット差枚アナライザー</h1>
          <p className="mt-1 text-sm text-slate-600">
            みんレポ等の差枚データを貼り付けるだけで、店トータル・機種別・末尾別・狙い目・検証までを一括で出す。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="-mx-4 max-w-[100vw] overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <SegmentedControl<Tab> options={TABS} value={tab} onChange={setTab} ariaLabel="表示する分析" />
            </div>
            {stores.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                店舗
                <select
                  value={activeStore}
                  onChange={(e) => setStore(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  {stores.map((s) => (
                    <option key={s} value={s}>
                      {s || '（店名なし）'}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {tab === 'import' && <ImportView rows={rows} setRows={setRows} onDone={() => setTab('day')} />}
        {tab !== 'import' && storeRows.length === 0 && (
          <Card>
            <p className="text-sm text-slate-600">
              まだデータがない。「取り込み」タブでみんレポのページを貼り付けるか、デモデータで試してほしい。
            </p>
          </Card>
        )}
        {tab === 'day' && storeRows.length > 0 && <DayView rows={storeRows} dates={dates} hotRule={hotRule} />}
        {tab === 'period' && storeRows.length > 0 && (
          <PeriodView rows={storeRows} dates={dates} hotRule={hotRule} setHotRule={setHotRule} />
        )}
        {tab === 'pick' && storeRows.length > 0 && (
          <PickView rows={storeRows} dates={dates} store={activeStore} predictions={predictions} onRecord={recordPrediction} />
        )}
        {tab === 'verify' && storeRows.length > 0 && <VerifyView rows={storeRows} dates={dates} />}
        {tab === 'publish' && storeRows.length > 0 && (
          <PublishView
            rows={storeRows}
            dates={dates}
            store={activeStore}
            predictions={predictions.filter((p) => p.store === activeStore)}
            onDelete={(id) => setPredictions((list) => list.filter((p) => p.id !== id))}
          />
        )}
      </main>
    </div>
  );
}

// ================================================================ 取り込み

function ImportView({
  rows,
  setRows,
  onDone,
}: {
  rows: SlotRow[];
  setRows: (f: (prev: SlotRow[]) => SlotRow[]) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [store, setStore] = useState('');
  const [message, setMessage] = useState<{ok: boolean; text: string} | null>(null);

  const add = (content: string, label: string) => {
    const res = parseInput(content, {date, store});
    if (!res.rows.length) {
      setMessage({ok: false, text: `${label}：台番と差枚の列が見つからなかった。表の見出し行（台番・差枚）ごと貼り付けてほしい。`});
      return 0;
    }
    const missingDate = res.rows.some((r) => !r.date);
    if (missingDate) {
      setMessage({ok: false, text: `${label}：日付が分からない。上の「日付」を入れてからもう一度取り込んでほしい。`});
      return 0;
    }
    setRows((prev) => mergeRows(prev, res.rows));
    const days = new Set(res.rows.map((r) => r.date)).size;
    const total = res.rows.reduce((s, r) => s + r.diff, 0);
    setMessage({
      ok: true,
      text: `${label}：${res.rows.length}台（${days}日分）を取り込んだ。${days === 1 ? `店トータル ${signed(total)}枚` : ''}`,
    });
    return res.rows.length;
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    let n = 0;
    for (const f of Array.from(files)) n += add(await f.text(), f.name);
    if (n && files.length > 1) setMessage({ok: true, text: `${files.length}ファイル・計${n}台を取り込んだ。`});
  };

  const exportCsv = () => {
    const blob = new Blob(['﻿' + toCsv(rows)], {type: 'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `slot-data-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const byDay = useMemo(() => {
    const m = new Map<string, {store: string; date: string; count: number; total: number}>();
    for (const r of rows) {
      const k = `${r.store}|${r.date}`;
      const e = m.get(k) ?? {store: r.store, date: r.date, count: 0, total: 0};
      e.count++;
      e.total += r.diff;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  return (
    <>
      <Card>
        <CardTitle
          note={
            <>
              みんレポの日別ページ（例: 「2026/9/22(火) スペース666 | スロット差枚データ詳細」）を開き、
              全選択してコピー → 下に貼り付け。PCならページのソース（HTML）をそのまま貼っても、保存したHTML/CSVファイルを選んでもよい。
              日付と店名はページのタイトルから自動で読む。読めない場合だけ入力する。
            </>
          }
        >
          データを取り込む
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            日付（自動で読めないとき）
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm text-slate-600">
            店名（自動で読めないとき）
            <input
              value={store}
              onChange={(e) => setStore(e.target.value)}
              placeholder="スペース666"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'ここにページの内容を貼り付け\n\n台番\tG数\t差枚\tBB\tRB\n…'}
          className="mt-3 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (add(text, '貼り付け')) setText('');
            }}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            取り込む
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ファイルを選ぶ（HTML / CSV・複数可）
            <input
              type="file"
              multiple
              accept=".html,.htm,.csv,.txt,.tsv"
              className="hidden"
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setRows((prev) => mergeRows(prev, generateDemo()));
              setMessage({ok: true, text: '架空のデモデータ（1か月分）を追加した。実在の店舗データではない。'});
            }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            架空のデモデータで試す
          </button>
        </div>
        {message && (
          <p className={`mt-3 text-sm ${message.ok ? 'text-sky-800' : 'text-rose-700'}`} role="status">
            {message.text}
          </p>
        )}
      </Card>

      <Card>
        <CardTitle note="データはこの端末のブラウザ内にだけ保存される。機種変更・履歴削除に備えてCSVで書き出しておける（書き出したCSVはそのまま再取り込みできる）。">
          取り込み済みのデータ（{byDay.length}日分）
        </CardTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
          >
            CSVで書き出す
          </button>
          {rows.length > 0 && (
            <button type="button" onClick={onDone} className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm text-white">
              分析を見る
            </button>
          )}
        </div>
        {byDay.length > 0 && (
          <DataTable
            rows={byDay}
            rowKey={(d) => `${d.store}|${d.date}`}
            limit={10}
            columns={[
              {key: 'date', label: '日付', align: 'left', render: (d) => shortDate(d.date)},
              {key: 'store', label: '店舗', align: 'left', render: (d) => d.store || '−'},
              {key: 'count', label: '台数', render: (d) => int(d.count)},
              {key: 'total', label: '店トータル', render: (d) => <span className={diffClass(d.total)}>{signed(d.total)}</span>},
              {
                key: 'del',
                label: '',
                render: (d) => (
                  <button
                    type="button"
                    className="text-xs text-rose-700 hover:underline"
                    onClick={() => {
                      if (confirm(`${shortDate(d.date)} ${d.store} のデータを削除する？`)) {
                        setRows((prev) => prev.filter((r) => !(r.date === d.date && r.store === d.store)));
                      }
                    }}
                  >
                    削除
                  </button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}

// ================================================================ 共通の列

function groupColumns(firstLabel: string, opts: {adjusted?: boolean} = {}): Column<GroupSummary>[] {
  const cols: Column<GroupSummary>[] = [
    {key: 'key', label: firstLabel, align: 'left', render: (g) => g.key, sort: (g) => g.key},
    {key: 'count', label: '台数', render: (g) => int(g.count), sort: (g) => g.count},
    {key: 'total', label: '総差枚', render: (g) => <span className={diffClass(g.totalDiff)}>{signed(g.totalDiff)}</span>, sort: (g) => g.totalDiff},
    {key: 'avg', label: '平均差枚', render: (g) => <span className={diffClass(g.avgDiff)}>{signed(g.avgDiff)}</span>, sort: (g) => g.avgDiff},
    {key: 'win', label: '勝率', render: (g) => `${pct(g.winRate, 0)} (${g.wins}/${g.count})`, sort: (g) => g.winRate},
    {key: 'games', label: '平均G数', render: (g) => int(g.avgGames), sort: (g) => g.avgGames ?? 0},
    {key: 'payout', label: '出率', render: (g) => pct(g.payout), sort: (g) => g.payout ?? 0},
    {key: 'hot', label: '高設定推測', render: (g) => int(g.hotCount), sort: (g) => g.hotCount},
  ];
  if (opts.adjusted) {
    cols.splice(
      1,
      0,
      {key: 'adjWin', label: '補正勝率', render: (g) => <strong>{pct(g.adjWinRate, 0)}</strong>, sort: (g) => g.adjWinRate},
      {key: 'adjAvg', label: '補正差枚', render: (g) => <span className={diffClass(g.adjAvgDiff)}>{signed(g.adjAvgDiff)}</span>, sort: (g) => g.adjAvgDiff},
    );
  }
  return cols;
}

const unitColumns: Column<SlotRow>[] = [
  {key: 'unit', label: '台番', align: 'left', render: (r) => r.unit, sort: (r) => r.unit},
  {key: 'machine', label: '機種', align: 'left', render: (r) => r.machine, sort: (r) => r.machine},
  {key: 'games', label: 'G数', render: (r) => int(r.games), sort: (r) => r.games ?? 0},
  {key: 'diff', label: '差枚', render: (r) => <span className={diffClass(r.diff)}>{signed(r.diff)}</span>, sort: (r) => r.diff},
  {key: 'payout', label: '出率', render: (r) => pct(unitPayout(r)), sort: (r) => unitPayout(r) ?? 0},
  {key: 'bb', label: 'BB', render: (r) => int(r.bb), sort: (r) => r.bb ?? 0},
  {key: 'rb', label: 'RB', render: (r) => int(r.rb), sort: (r) => r.rb ?? 0},
];

function DateSelect({dates, value, onChange}: {dates: string[]; value: string; onChange: (d: string) => void}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
      aria-label="日付"
    >
      {[...dates].reverse().map((d) => (
        <option key={d} value={d}>
          {shortDate(d)} {d.slice(0, 4)}
        </option>
      ))}
    </select>
  );
}

// ================================================================ 日別

function DayView({rows, dates, hotRule}: {rows: SlotRow[]; dates: string[]; hotRule: HotRule}) {
  const [date, setDate] = useState(dates[dates.length - 1]);
  const d = dates.includes(date) ? date : dates[dates.length - 1];
  const rep = useMemo(() => dayReport(rows, d, hotRule), [rows, d, hotRule]);
  const dayRows = useMemo(() => rows.filter((r) => r.date === d), [rows, d]);
  const s = rep.summary;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <DateSelect dates={dates} value={d} onChange={setDate} />
        <span className="text-sm text-slate-500">{rows[0]?.store}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="店トータル差枚" value={`${signed(s.totalDiff)}枚`} sub={`${s.count}台 / 1台平均 ${signed(s.avgDiff)}枚`} />
        <StatTile label="勝率（差枚プラスの台）" value={pct(s.winRate)} sub={`${s.wins}台 / ${s.count}台`} />
        <StatTile label="出率（機械割の推定）" value={pct(s.payout)} sub={`総${int(s.totalGames)}G / 平均${int(s.avgGames)}G`} />
        <StatTile
          label="高設定推測台"
          value={`${rep.hotUnits.length}台`}
          sub={`${int(hotRule.minGames)}G以上かつ出率${pct(hotRule.minPayout, 0)}以上`}
        />
      </div>

      <Card>
        <CardTitle note="総差枚の多い順。見出しをタップで並べ替え。全台系＝3台以上ある機種で全台プラス。">機種別</CardTitle>
        {rep.allWinMachines.length > 0 && (
          <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
            全台系の疑い：{rep.allWinMachines.map((m) => `${m.key}（${m.count}台すべてプラス）`).join('、')}
          </p>
        )}
        <DataTable rows={rep.machines} rowKey={(g) => g.key} columns={groupColumns('機種')} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardTitle note="台番の末尾（下1桁）ごと。特定の末尾だけ強ければ末尾イベントの可能性。">末尾別</CardTitle>
          <DataTable rows={rep.tails} rowKey={(g) => g.key} columns={groupColumns('末尾').filter((c) => c.key !== 'games')} />
        </Card>
        <Card>
          <CardTitle note="台番が連続して3台以上プラスの区間（並び・島単位の投入の疑い）。">並び</CardTitle>
          {rep.streaks.length === 0 ? (
            <p className="text-sm text-slate-500">3台以上連続でプラスの区間はなかった。</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {rep.streaks.slice(0, 10).map((st) => (
                <li key={st.from} className="flex justify-between gap-2">
                  <span>
                    {st.from}〜{st.to}番（{st.units.length}台・{[...new Set(st.units.map((u) => u.machine))].join('/')}）
                  </span>
                  <span className={`tabular-nums ${diffClass(st.total)}`}>{signed(st.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle note="その日の全台。見出しをタップで並べ替え。">全台データ</CardTitle>
        <DataTable rows={dayRows} rowKey={(r) => String(r.unit)} columns={unitColumns} initialSort={{key: 'diff', desc: true}} limit={30} />
      </Card>
    </>
  );
}

// ================================================================ 期間・月間

function PeriodView({
  rows,
  dates,
  hotRule,
  setHotRule,
}: {
  rows: SlotRow[];
  dates: string[];
  hotRule: HotRule;
  setHotRule: (r: HotRule) => void;
}) {
  const months = useMemo(() => [...new Set(dates.map((d) => d.slice(0, 7)))].sort(), [dates]);
  const [range, setRange] = useState<string>('all');
  const scoped = useMemo(() => (range === 'all' ? rows : rows.filter((r) => r.date.startsWith(range))), [rows, range]);
  const rep = useMemo(() => periodReport(scoped, hotRule), [scoped, hotRule]);
  const prev = useMemo(() => prevDayAnalysis(scoped), [scoped]);
  const nb = useMemo(() => neighborAnalysis(scoped), [scoped]);
  const s = rep.summary;
  const chartData = rep.byDate.map((g) => ({date: shortDate(g.key), total: Math.round(g.totalDiff)}));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          aria-label="期間"
        >
          <option value="all">全期間</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '年')}月
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-600">
          高設定推測：
          <input
            type="number"
            value={hotRule.minGames}
            step={500}
            min={0}
            onChange={(e) => setHotRule({...hotRule, minGames: Number(e.target.value) || 0})}
            className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right"
          />
          G以上・出率
          <input
            type="number"
            value={Math.round(hotRule.minPayout * 100)}
            step={1}
            min={90}
            onChange={(e) => setHotRule({...hotRule, minPayout: (Number(e.target.value) || 100) / 100})}
            className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right"
          />
          %以上
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="期間の店トータル" value={`${signed(s.totalDiff)}枚`} sub={`${rep.dates.length}日 / 延べ${int(s.count)}台`} />
        <StatTile label="1日あたり店トータル" value={`${signed(s.totalDiff / Math.max(1, rep.dates.length))}枚`} sub={`1台平均 ${signed(s.avgDiff)}枚`} />
        <StatTile label="期間の勝率" value={pct(s.winRate)} sub={`${int(s.wins)} / ${int(s.count)}台日`} />
        <StatTile label="期間の出率" value={pct(s.payout)} sub={`平均 ${int(s.avgGames)}G`} />
      </div>

      <Card>
        <CardTitle note="プラス（青）の日は店が出した日、マイナス（赤）は回収した日。">日別の店トータル差枚</CardTitle>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{top: 8, right: 8, bottom: 0, left: 8}}>
              <CartesianGrid stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="date" tick={{fontSize: 11, fill: '#52514e'}} interval="preserveStartEnd" />
              <YAxis tick={{fontSize: 11, fill: '#52514e'}} tickFormatter={(v: number) => int(v)} width={64} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Tooltip formatter={(v: number) => [`${signed(v)}枚`, '店トータル']} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.date} fill={d.total >= 0 ? '#2a78d6' : '#d6453d'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle
          note={
            <>
              「補正勝率」「補正差枚」は台数が少ない機種ほど店平均に寄せた値（1〜2台日だけの大勝ちを過大評価しない）。
              <strong>どの機種が一番出ているか・勝ちやすいかは補正勝率で比べるのが安全。</strong>
            </>
          }
        >
          機種ランキング（補正勝率順）
        </CardTitle>
        <DataTable rows={rep.machines} rowKey={(g) => g.key} columns={groupColumns('機種', {adjusted: true})} limit={20} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardTitle note="日付の下1桁ごと。6の付く日などの特定日が強いかを見る。">日付末尾別</CardTitle>
          <DataTable rows={rep.dateTails} rowKey={(g) => g.key} columns={groupColumns('日付', {adjusted: true}).filter((c) => !['games', 'hot', 'adjAvg'].includes(c.key))} />
        </Card>
        <Card>
          <CardTitle note="曜日ごとの傾向。">曜日別</CardTitle>
          <DataTable rows={rep.weekdays} rowKey={(g) => g.key} columns={groupColumns('曜日', {adjusted: true}).filter((c) => !['games', 'hot', 'adjAvg'].includes(c.key))} />
        </Card>
        <Card>
          <CardTitle note="台番の下1桁ごと（全期間）。">台番末尾別</CardTitle>
          <DataTable rows={rep.tails} rowKey={(g) => g.key} columns={groupColumns('末尾', {adjusted: true}).filter((c) => !['games', 'hot', 'adjAvg'].includes(c.key))} />
        </Card>
        <Card>
          <CardTitle note="その日の同機種の設置台数ごと。バラエティ（少台数）と主力機種のどちらに設定が入るか。">設置台数別</CardTitle>
          <DataTable rows={[...rep.machineSize, ...rep.zorome]} rowKey={(g) => g.key} columns={groupColumns('区分', {adjusted: true}).filter((c) => !['games', 'hot', 'adjAvg'].includes(c.key))} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardTitle
            note={`前日と翌日が続けてある台（同じ機種）${int(prev.pairs)}組で比較。相関係数 ${prev.correlation.toFixed(2)}（0に近いほど前日の結果は翌日に無関係）。`}
          >
            前日の差枚 → 翌日の成績
          </CardTitle>
          <DataTable
            rows={prev.buckets}
            rowKey={(b) => b.label}
            columns={[
              {key: 'label', label: '前日', align: 'left', render: (b) => b.label},
              {key: 'n', label: '件数', render: (b) => int(b.count)},
              {key: 'avg', label: '翌日平均', render: (b) => (b.count ? <span className={diffClass(b.nextAvgDiff)}>{signed(b.nextAvgDiff)}</span> : '−')},
              {key: 'win', label: '翌日勝率', render: (b) => (b.count ? pct(b.nextWinRate, 0) : '−')},
            ]}
          />
        </Card>
        <Card>
          <CardTitle note="同じ機種の隣り合う台で、隣が勝っているとき自分も勝ちやすいか（並び・島単位の投入があるか）。">並びの検証</CardTitle>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">隣がプラスのとき</dt>
              <dd className="text-lg font-bold tabular-nums">{pct(nb.whenNeighborWon.winRate)}</dd>
              <dd className="text-xs text-slate-500">{int(nb.whenNeighborWon.n)}件</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">隣がマイナスのとき</dt>
              <dd className="text-lg font-bold tabular-nums">{pct(nb.whenNeighborLost.winRate)}</dd>
              <dd className="text-xs text-slate-500">{int(nb.whenNeighborLost.n)}件</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            差が10ポイント以上あれば、並びで設定を入れている可能性がある。
          </p>
        </Card>
      </div>

      <Card>
        <CardTitle note="台番ごとの通算成績（補正差枚順）。同じ台番で機種が変わった場合も合算しているので、入替には注意。">台番別の通算成績</CardTitle>
        <DataTable<PeriodReport['units'][number]>
          rows={rep.units}
          rowKey={(g) => g.key}
          limit={20}
          columns={[
            {key: 'key', label: '台番', align: 'left', render: (g) => g.key, sort: (g) => Number(g.key)},
            {key: 'machine', label: '機種（最新）', align: 'left', render: (g) => g.machine, sort: (g) => g.machine},
            ...groupColumns('', {adjusted: true}).slice(1),
          ]}
        />
      </Card>
    </>
  );
}

// ================================================================ 狙い目

function PickView({
  rows,
  dates,
  store,
  predictions,
  onRecord,
}: {
  rows: SlotRow[];
  dates: string[];
  store: string;
  predictions: Prediction[];
  onRecord: (p: Prediction) => void;
}) {
  const last = dates[dates.length - 1];
  // 既定では「最終日の翌日」を予測する
  const nextDay = useMemo(() => {
    const [y, m, d] = last.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }, [last]);
  const [target, setTarget] = useState(nextDay);
  const [mode, setMode] = useState<'dateTail' | 'weekday' | 'all' | 'zorome'>('dateTail');
  const filter: DayFilter = useMemo(() => {
    if (mode === 'dateTail') return {kind: 'dateTail', value: dayOfMonth(target) % 10};
    if (mode === 'weekday') return {kind: 'weekday', value: weekdayOf(target)};
    if (mode === 'zorome') return {kind: 'zorome'};
    return {kind: 'all'};
  }, [mode, target]);
  const candidates = useMemo(() => rows.filter((r) => r.date === last), [rows, last]);
  const rec = useMemo(() => recommend(rows, candidates, {filter}), [rows, candidates, filter]);

  const machineRank = useMemo(() => {
    const m = new Map<string, Pick[]>();
    for (const p of rec.picks) {
      if (!m.has(p.machine)) m.set(p.machine, []);
      m.get(p.machine)!.push(p);
    }
    return [...m.entries()]
      .map(([machine, ps]) => ({
        machine,
        count: ps.length,
        pWin: ps.reduce((s, p) => s + p.pWin, 0) / ps.length,
        expDiff: ps.reduce((s, p) => s + p.expDiff, 0) / ps.length,
        best: ps[0],
      }))
      .sort((a, b) => b.pWin - a.pWin);
  }, [rec]);

  return (
    <>
      <Card>
        <CardTitle
          note={
            <>
              打つ日の条件に合う過去日で「機種の強さ × 末尾の強さ × 台そのものの強さ」を推定し、勝つ確率が高い順に並べる。
              データが少ない項目ほど店平均に寄せるので、1日だけ出た台に飛びつかない設計。
              候補は最終取り込み日（{shortDate(last)}）の台一覧。
            </>
          }
        >
          何を打てば勝ちやすいか
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">
            打つ日{' '}
            <input
              type="date"
              value={target}
              onChange={(e) => setTarget(e.target.value || nextDay)}
              className="rounded-lg border border-slate-300 px-2 py-1"
            />
          </label>
          <SegmentedControl<'dateTail' | 'weekday' | 'all' | 'zorome'>
            ariaLabel="参考にする過去日"
            value={mode}
            onChange={setMode}
            options={[
              {value: 'dateTail', label: `日付末尾${dayOfMonth(target) % 10}`},
              {value: 'weekday', label: `${'日月火水木金土'[weekdayOf(target)]}曜`},
              {value: 'zorome', label: 'ゾロ目'},
              {value: 'all', label: '全日'},
            ]}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          参考にした過去日：<strong>{rec.basis}</strong>（{rec.basisDays}日分）
          {filter.kind !== 'all' && rec.basis === '全日' && (
            <span className="text-rose-700">　※{describeFilter(filter)}の過去データが2日未満のため全日で推定</span>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onRecord(makePrediction(store, target, rec.basis, rec.picks, 5))}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            上位5台を{shortDate(target)}の予想として記録
          </button>
          <span className="text-xs text-slate-500">
            {predictions.some((p) => p.id === `${store}|${target}`)
              ? '記録済み（押すと上書き）。対象日のデータを取り込むと「発信」タブで自動で答え合わせされる。'
              : '記録した予想は、対象日のデータを取り込むと「発信」タブで自動で答え合わせされる。'}
          </span>
        </div>
      </Card>

      <Card>
        <CardTitle note="推定勝率＝差枚がプラスで終わる確率の推定。期待差枚＝その台の平均的な差枚の推定。">
          狙い台ランキング
        </CardTitle>
        <DataTable
          rows={rec.picks}
          rowKey={(p) => String(p.unit)}
          limit={20}
          columns={[
            {key: 'rank', label: '#', align: 'left', render: (p) => rec.picks.indexOf(p) + 1},
            {key: 'unit', label: '台番', align: 'left', render: (p) => p.unit, sort: (p) => p.unit},
            {key: 'machine', label: '機種', align: 'left', render: (p) => p.machine, sort: (p) => p.machine},
            {key: 'pWin', label: '推定勝率', render: (p) => <strong>{pct(p.pWin, 0)}</strong>, sort: (p) => p.pWin},
            {key: 'exp', label: '期待差枚', render: (p) => <span className={diffClass(p.expDiff)}>{signed(p.expDiff)}</span>, sort: (p) => p.expDiff},
            {key: 'n', label: '台の実績', render: (p) => `${p.unitN}日`, sort: (p) => p.unitN},
            {key: 'why', label: '根拠', align: 'left', render: (p) => <span className="text-xs text-slate-600">{p.reasons.join(' / ') || '−'}</span>},
          ]}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardTitle note="機種ごとの推定勝率の平均と、その機種で一番の台。">機種で選ぶなら</CardTitle>
          <DataTable
            rows={machineRank}
            rowKey={(m) => m.machine}
            limit={15}
            columns={[
              {key: 'm', label: '機種', align: 'left', render: (m) => m.machine},
              {key: 'n', label: '台数', render: (m) => m.count},
              {key: 'p', label: '推定勝率', render: (m) => pct(m.pWin, 0)},
              {key: 'e', label: '期待差枚', render: (m) => <span className={diffClass(m.expDiff)}>{signed(m.expDiff)}</span>},
              {key: 'b', label: 'おすすめ台', render: (m) => m.best.unit},
            ]}
          />
        </Card>
        <Card>
          <CardTitle note={`${rec.basis}の末尾別（補正勝率順）。`}>末尾で選ぶなら</CardTitle>
          <DataTable rows={rec.tails} rowKey={(g) => g.key} columns={groupColumns('末尾', {adjusted: true}).filter((c) => ['key', 'adjWin', 'avg', 'win'].includes(c.key))} />
        </Card>
      </div>
    </>
  );
}

// ================================================================ 検証

const STRATEGIES: Strategy[] = ['model', 'machine', 'tail', 'prevWinner', 'prevLoser'];

function VerifyView({rows, dates}: {rows: SlotRow[]; dates: string[]}) {
  const [picks, setPicks] = useState(5);
  const [filterBy, setFilterBy] = useState<'none' | 'dateTail' | 'weekday'>('dateTail');
  const results = useMemo(
    () => STRATEGIES.map((s) => ({s, r: backtest(rows, s, {picks, filterBy: s === 'prevLoser' || s === 'prevWinner' ? 'none' : filterBy})})),
    [rows, picks, filterBy],
  );
  const best = [...results].sort((a, b) => b.r.pickAvgDiff - a.r.pickAvgDiff)[0];
  const tested = results[0].r.days.length;

  return (
    <>
      <Card>
        <CardTitle
          note={
            <>
              各日について<strong>その日より前のデータだけ</strong>で台を選び、実際の結果と比べる（ウォークフォワード検証）。
              未来のデータを使わないので「毎日このやり方で打っていたらどうだったか」に近い。
              比較対象の「店平均」は、同じ日に無作為に台を選んだ場合の期待値。
            </>
          }
        >
          どの選び方が本当に勝てるか（検証）
        </CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1 text-slate-600">
            1日に選ぶ台数
            <select value={picks} onChange={(e) => setPicks(Number(e.target.value))} className="rounded border border-slate-300 px-1 py-0.5">
              {[1, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n}台
                </option>
              ))}
            </select>
          </label>
          <SegmentedControl<'none' | 'dateTail' | 'weekday'>
            ariaLabel="推定に使う過去日"
            value={filterBy}
            onChange={setFilterBy}
            options={[
              {value: 'dateTail', label: '同じ日付末尾で推定'},
              {value: 'weekday', label: '同じ曜日で推定'},
              {value: 'none', label: '全日で推定'},
            ]}
          />
        </div>
        {tested === 0 ? (
          <p className="mt-3 text-sm text-rose-700">検証には4日分以上のデータが必要（最初の3日は学習用）。現在 {dates.length}日分。</p>
        ) : (
          <p className="mt-3 text-sm text-slate-700">
            検証した日数：{tested}日。最も成績が良かったのは<strong>「{best.r.strategy}」</strong>
            （1台平均 {signed(best.r.pickAvgDiff)}枚、店平均との差 {signed(best.r.pickAvgDiff - best.r.baselineAvgDiff)}枚）。
            {tested < 20 && ' ※日数が少ないうちは偶然の差が大きい。1〜2か月分たまってから判断するのが安全。'}
          </p>
        )}
      </Card>

      {tested > 0 && (
        <Card>
          <CardTitle note="店平均超え＝狙い台の平均が、その日の店平均を上回った日の割合（50%を大きく超えれば再現性がある）。">
            戦略ごとの成績
          </CardTitle>
          <DataTable
            rows={results}
            rowKey={(x) => x.s}
            columns={[
              {key: 's', label: '選び方', align: 'left', render: (x) => STRATEGY_LABELS[x.s]},
              {key: 'avg', label: '狙い台 平均差枚', render: (x) => <span className={diffClass(x.r.pickAvgDiff)}>{signed(x.r.pickAvgDiff)}</span>, sort: (x) => x.r.pickAvgDiff},
              {key: 'win', label: '狙い台 勝率', render: (x) => pct(x.r.pickWinRate, 0), sort: (x) => x.r.pickWinRate},
              {key: 'base', label: '店平均', render: (x) => <span className={diffClass(x.r.baselineAvgDiff)}>{signed(x.r.baselineAvgDiff)}</span>},
              {key: 'bwin', label: '店の勝率', render: (x) => pct(x.r.baselineWinRate, 0)},
              {key: 'edge', label: '差', render: (x) => <strong className={diffClass(x.r.pickAvgDiff - x.r.baselineAvgDiff)}>{signed(x.r.pickAvgDiff - x.r.baselineAvgDiff)}</strong>, sort: (x) => x.r.pickAvgDiff - x.r.baselineAvgDiff},
              {key: 'beat', label: '店平均超え', render: (x) => pct(x.r.beatRate, 0), sort: (x) => x.r.beatRate},
            ]}
          />
        </Card>
      )}

      {tested > 0 && (
        <Card>
          <CardTitle note="総合モデルが各日に選んだ台と、その日の実際の結果。">日ごとの検証結果（総合モデル）</CardTitle>
          <DataTable
            rows={[...results[0].r.days].reverse()}
            rowKey={(d) => d.date}
            limit={15}
            columns={[
              {key: 'date', label: '日付', align: 'left', render: (d) => shortDate(d.date)},
              {key: 'picks', label: '選んだ台（結果）', align: 'left', render: (d) => (
                <span className="text-xs">
                  {d.picks.map((p) => (
                    <span key={p.unit} className={`mr-2 ${diffClass(p.diff)}`}>
                      {p.unit}({signed(p.diff)})
                    </span>
                  ))}
                </span>
              )},
              {key: 'pa', label: '狙い台平均', render: (d) => <span className={diffClass(d.pickAvgDiff)}>{signed(d.pickAvgDiff)}</span>},
              {key: 'da', label: '店平均', render: (d) => <span className={diffClass(d.dayAvgDiff)}>{signed(d.dayAvgDiff)}</span>},
            ]}
          />
        </Card>
      )}
    </>
  );
}
