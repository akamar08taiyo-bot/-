import {useEffect, useMemo, useState} from 'react';
import {fixedRateSensitivity, range, simulate, simulateFixed, stepSensitivity} from './calc';
import type {ScenarioInput} from './calc';
import {CorrelationChart, PaymentChart, TrendChart, toYearPoints} from './charts';
import type {TrendMetric} from './charts';
import {formatMan, formatPeriod, formatRate, formatSignedMan, formatSignedRate, formatYen} from './format';
import {viz} from './theme';
import {Card, CardTitle, Legend, SegmentedControl, SliderField, StatTile, Toggle} from './ui';
import {readScenarioFromUrl, scenarioToQuery} from './urlState';

type CorrelationMode = 'step' | 'fixed';

interface Preset {
  label: string;
  note: string;
  values: Partial<ScenarioInput> & {principal: number};
}

const PRESETS: Preset[] = [
  {
    label: '基本シナリオ',
    note: '3,300万円 / 35年 / 1.25%、5年ごとに+0.25%',
    values: {principal: 33000000, years: 35, initialRate: 1.25, stepRate: 0.25, reviewYears: 5, maxRate: 10},
  },
  {
    label: '金利据え置き',
    note: '当初金利のまま完済（実質的に全期間固定）',
    values: {principal: 33000000, years: 35, initialRate: 1.25, stepRate: 0, reviewYears: 5, maxRate: 10},
  },
  {
    label: '急上昇',
    note: '5年ごとに+0.75%、上限4.0%',
    values: {principal: 33000000, years: 35, initialRate: 1.25, stepRate: 0.75, reviewYears: 5, maxRate: 4},
  },
];

const DEFAULT_SCENARIO: ScenarioInput = {
  principal: 33000000,
  years: 35,
  initialRate: 1.25,
  stepRate: 0.25,
  reviewYears: 5,
  maxRate: 10,
  use125Rule: false,
};

export function MortgageApp() {
  // URLに条件が入っていればそれを初期値にする（条件をそのまま共有できる）
  const initial = useMemo(() => readScenarioFromUrl(DEFAULT_SCENARIO), []);
  const [principal, setPrincipal] = useState(initial.principal);
  const [years, setYears] = useState(initial.years);
  const [initialRate, setInitialRate] = useState(initial.initialRate);
  const [stepRate, setStepRate] = useState(initial.stepRate);
  const [reviewYears, setReviewYears] = useState(initial.reviewYears);
  const [maxRate, setMaxRate] = useState(initial.maxRate);
  const [use125Rule, setUse125Rule] = useState(initial.use125Rule);
  const [mode, setMode] = useState<CorrelationMode>('step');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('interest');

  const input: ScenarioInput = useMemo(
    () => ({principal, years, initialRate, stepRate, reviewYears, maxRate, use125Rule}),
    [principal, years, initialRate, stepRate, reviewYears, maxRate, use125Rule],
  );

  // 条件を変えるたびにURLへ反映する（履歴は汚さない）
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${scenarioToQuery(input)}`);
  }, [input]);

  const result = useMemo(() => simulate(input), [input]);
  const fixed = useMemo(() => simulateFixed(input), [input]);
  const yearPoints = useMemo(
    () => toYearPoints(principal, result.monthly, fixed.monthly, initialRate),
    [principal, result, fixed, initialRate],
  );

  const stepPoints = useMemo(
    () => stepSensitivity(input, range(-0.25, 2, 0.05)),
    [input],
  );
  const fixedPoints = useMemo(
    () => fixedRateSensitivity(input, range(0.25, 5, 0.25)),
    [input],
  );

  const diff = result.totalPayment - fixed.totalPayment;
  const fixedLabel = `全期間固定 ${formatRate(initialRate)}`;
  const firstPayment = result.segments[0]?.payment ?? 0;
  const maxDeferred = Math.max(0, ...result.segments.map((s) => s.deferredInterest));
  const deferred = maxDeferred > 0;
  const hasBalloon = result.balloon > 10000;
  const showDeferredColumn = deferred || result.segments.some((s) => s.capped);

  const applyPreset = (p: Preset) => {
    setPrincipal(p.values.principal);
    if (p.values.years != null) setYears(p.values.years);
    if (p.values.initialRate != null) setInitialRate(p.values.initialRate);
    if (p.values.stepRate != null) setStepRate(p.values.stepRate);
    if (p.values.reviewYears != null) setReviewYears(p.values.reviewYears);
    if (p.values.maxRate != null) setMaxRate(p.values.maxRate);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">住宅ローン 金利シナリオ・シミュレーター</h1>
          <p className="mt-1 text-sm text-slate-600">
            変動金利が段階的に上がっていったとき、総返済額がどれだけ変わるかを試算する。
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* 入力 */}
          <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardTitle note="数値を動かすと、右のグラフと表がその場で再計算される。">借入条件</CardTitle>
              <div className="flex flex-col gap-5">
                <SliderField
                  label="借入額"
                  value={principal / 10000}
                  onChange={(v) => setPrincipal(Math.round(v) * 10000)}
                  min={100}
                  max={20000}
                  step={50}
                  unit="万円"
                  format={(v) => `${v.toLocaleString('ja-JP')}万`}
                />
                <SliderField label="返済期間" value={years} onChange={setYears} min={5} max={50} step={1} unit="年" />
                <SliderField
                  label="当初金利"
                  value={initialRate}
                  onChange={setInitialRate}
                  min={0}
                  max={5}
                  step={0.05}
                  unit="%"
                  format={(v) => `${v.toFixed(2)}%`}
                />
                <SliderField
                  label="見直しごとの上昇幅"
                  value={stepRate}
                  onChange={setStepRate}
                  min={-0.5}
                  max={2}
                  step={0.05}
                  unit="%"
                  format={(v) => formatSignedRate(v)}
                  hint="マイナスなら金利低下"
                />
                <SliderField
                  label="金利見直し間隔"
                  value={reviewYears}
                  onChange={setReviewYears}
                  min={1}
                  max={10}
                  step={1}
                  unit="年"
                />
                <SliderField
                  label="上限金利"
                  value={maxRate}
                  onChange={setMaxRate}
                  min={0.5}
                  max={10}
                  step={0.25}
                  unit="%"
                  format={(v) => `${v.toFixed(2)}%`}
                />
                <div>
                  <Toggle
                    label="125%ルールを適用する"
                    description="返済額の上昇を直前の1.25倍までに抑える。抑えた分は未払利息として繰り越し、最終回に精算する。"
                    checked={use125Rule}
                    onChange={setUse125Rule}
                  />
                  {use125Rule && !result.segments.some((s) => s.capped) && (
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                      このシナリオでは返済額の上昇が1.25倍に届かないため、ルールによる抑制は発生していない。
                    </p>
                  )}
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-500">プリセット</div>
                  <div className="flex flex-col gap-1.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-sky-400 hover:bg-sky-50"
                      >
                        <span className="block text-sm font-medium text-slate-700">{p.label}</span>
                        <span className="block text-xs text-slate-500">{p.note}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* 結果 */}
          <div className="flex min-w-0 flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="総返済額"
                value={formatMan(result.totalPayment)}
                sub={`利息 ${formatMan(result.totalInterest)}`}
                accent={viz.variable}
              />
              <StatTile
                label={fixedLabel}
                value={formatMan(fixed.totalPayment)}
                sub={`利息 ${formatMan(fixed.totalInterest)}`}
                accent={viz.fixed}
              />
              <StatTile
                label="固定との差"
                value={formatSignedMan(diff)}
                sub={`平均金利 ${formatRate(result.averageRate)}`}
              />
              <StatTile
                label="月々返済額"
                value={formatYen(firstPayment)}
                sub={`最大 ${formatYen(result.maxPayment)}（${formatRate(result.finalRate)}時）`}
              />
            </div>

            {(deferred || hasBalloon) && (
              <div
                className="rounded-xl border-l-4 bg-amber-50 p-4 text-sm text-amber-900"
                style={{borderLeftColor: viz.warning}}
                role="status"
              >
                <p className="font-semibold">未払利息が発生するシナリオ</p>
                <p className="mt-1 leading-relaxed">
                  {deferred && (
                    <>
                      125%ルールで返済額が抑えられた結果、利息が毎月の返済額を上回る期間がある。
                      不足分は未払利息として繰り越され、ピーク時で{formatMan(maxDeferred, 1)}に達する。
                    </>
                  )}
                  {hasBalloon && (
                    <>
                      {deferred ? 'さらに、' : ''}
                      期限までに返しきれない分が残るため、最終回に{formatYen(result.finalPayment)}
                      （通常回より{formatMan(result.balloon, 1)}多い）を一括で精算する計算になる。
                    </>
                  )}
                </p>
              </div>
            )}

            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">金利と総返済額の相関</h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {mode === 'step'
                      ? `${reviewYears}年ごとの上昇幅を振ったときの総返済額。紫の点が現在の設定。`
                      : '全期間固定で借りた場合の金利水準ごとの総返済額。紫の点が当初金利の水準。'}
                  </p>
                </div>
                <SegmentedControl<CorrelationMode>
                  ariaLabel="相関グラフのX軸"
                  value={mode}
                  onChange={setMode}
                  options={[
                    {value: 'step', label: '上昇幅で見る'},
                    {value: 'fixed', label: '固定金利で見る'},
                  ]}
                />
              </div>
              <CorrelationChart
                data={mode === 'step' ? stepPoints : fixedPoints}
                xLabel={mode === 'step' ? '上昇幅' : '固定金利'}
                xUnit="%"
                current={
                  mode === 'step'
                    ? {x: stepRate, totalPayment: result.totalPayment, label: '現在の設定'}
                    : {x: initialRate, totalPayment: fixed.totalPayment, label: `固定${formatRate(initialRate)}`}
                }
              />
              <p className="mt-2 text-xs text-slate-500">
                {mode === 'step'
                  ? `上昇幅が0.05%増えるごとに総返済額は約${formatMan(
                      (stepPoints[stepPoints.length - 1].totalPayment - stepPoints[0].totalPayment) /
                        (stepPoints.length - 1),
                      1,
                    )}増える計算。`
                  : `金利が0.25%上がるごとに総返済額は約${formatMan(
                      (fixedPoints[fixedPoints.length - 1].totalPayment - fixedPoints[0].totalPayment) /
                        (fixedPoints.length - 1),
                      1,
                    )}増える計算。`}
              </p>
            </Card>

            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {trendMetric === 'interest' ? '累計利息の推移' : '残高の推移'}
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {trendMetric === 'interest'
                      ? '固定との差がどこで開いていくか。金利が上がるほど、返済額のうち利息に回る分が増える。'
                      : '残高が減るペースの違い。上昇シナリオでは元金が減りにくくなる。'}
                  </p>
                </div>
                <SegmentedControl<TrendMetric>
                  ariaLabel="推移グラフの指標"
                  value={trendMetric}
                  onChange={setTrendMetric}
                  options={[
                    {value: 'interest', label: '累計利息'},
                    {value: 'balance', label: '残高'},
                  ]}
                />
              </div>
              <div className="mb-2">
                <Legend
                  items={[
                    {color: viz.variable, label: '変動シナリオ'},
                    {color: viz.fixed, label: fixedLabel, dashed: true},
                  ]}
                />
              </div>
              <TrendChart data={yearPoints} fixedLabel={fixedLabel} metric={trendMetric} />
            </Card>

            <Card>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                <CardTitle note="見直しのたびに階段状に変わる。125%ルールを有効にすると上がり方が緩やかになる。">
                  月々返済額の推移
                </CardTitle>
                <Legend
                  items={[
                    {color: viz.variable, label: '変動シナリオ'},
                    {color: viz.fixed, label: fixedLabel, dashed: true},
                  ]}
                />
              </div>
              <PaymentChart data={yearPoints} fixedLabel={fixedLabel} />
            </Card>

            <Card>
              <CardTitle note="グラフと同じ内容を数値で確認できる。">区間ごとの内訳</CardTitle>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th scope="col" className="px-4 py-2 text-left font-medium">期間</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">適用金利</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">月々返済額</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">支払利息</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">期末残高</th>
                      {showDeferredColumn && (
                        <th scope="col" className="px-4 py-2 text-right font-medium">未払利息</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {result.segments.map((s) => (
                      <tr key={s.index} className="border-b border-slate-100 last:border-0">
                        <th scope="row" className="px-4 py-2 text-left font-medium text-slate-700">
                          {formatPeriod(s.fromYear, s.toYear)}
                        </th>
                        <td className="px-4 py-2 text-right tabular-nums">{formatRate(s.rate)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatYen(s.payment)}
                          {s.capped && (
                            <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                              上限
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600">{formatMan(s.interest, 1)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMan(s.endingBalance, 1)}</td>
                        {showDeferredColumn && (
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                            {s.deferredInterest > 0 ? formatMan(s.deferredInterest, 1) : '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <th scope="row" className="px-4 py-2 text-left">合計</th>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        平均 {formatRate(result.averageRate)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        最大 {formatYen(result.maxPayment)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMan(result.totalInterest, 1)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMan(result.totalPayment, 1)}</td>
                      {showDeferredColumn && <td className="px-4 py-2" />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <Card className="bg-slate-50">
              <CardTitle>計算の前提</CardTitle>
              <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-600">
                <li>元利均等返済。月利は「年利 ÷ 12」、利息は毎月の残高に対して計算する。</li>
                <li>
                  見直し間隔ごとに、その時点の残債務・残期間・新金利で月々返済額を再計算する（円未満は四捨五入）。
                  一般的な変動金利の「5年ルール」に近い方式。
                </li>
                <li>
                  125%ルールを有効にすると、返済額の上昇は直前の1.25倍までに抑えられる。
                  返済額が利息に満たない場合は未払利息が発生し、最終回に一括精算する前提で計算している。
                </li>
                <li>最終回は残高と未払利息をまとめて精算するため、他の回と金額が異なる。</li>
                <li>
                  金利の上昇幅・タイミングはあくまで想定の一例。実際の適用金利・ルール・手数料・団信・保証料は
                  金融機関によって異なるため、契約内容は必ず個別に確認すること。
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
