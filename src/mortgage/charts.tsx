import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {TooltipProps} from 'recharts';
import {viz} from './theme';
import {formatMan, formatRate, formatYen} from './format';
import type {MonthPoint, SensitivityPoint} from './calc';

const axisProps = {
  stroke: viz.axis,
  tickLine: false,
  axisLine: false,
  tick: {fill: viz.textSecondary, fontSize: 11},
} as const;

const gridProps = {
  stroke: viz.grid,
  strokeDasharray: '3 3',
  vertical: false,
} as const;

/** 軸の目盛りを「切りのいい数」に丸めて生成する */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

const extent = (values: number[], padRatio = 0): [number, number] => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * padRatio;
  return [min - pad, max + pad];
};

function TooltipBox({title, rows}: {title: string; rows: {color?: string; label: string; value: string}[]}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="mb-1 text-xs font-semibold text-slate-700">{title}</div>
      <dl className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            {r.color ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor: r.color}} />
            ) : (
              <span className="w-2 shrink-0" />
            )}
            <dt className="text-slate-500">{r.label}</dt>
            <dd className="ml-auto font-semibold text-slate-900 tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 年ごとに間引いた残高・返済額の推移（グラフ用） */
export interface YearPoint {
  year: number;
  variableBalance: number;
  fixedBalance: number;
  variablePayment: number;
  fixedPayment: number;
  variableInterest: number;
  fixedInterest: number;
  variableRate: number;
  fixedRate: number;
}

export function toYearPoints(
  principal: number,
  variable: MonthPoint[],
  fixed: MonthPoint[],
  fixedRate: number,
): YearPoint[] {
  const points: YearPoint[] = [
    {
      year: 0,
      variableBalance: principal,
      fixedBalance: principal,
      variablePayment: variable[0]?.payment ?? 0,
      fixedPayment: fixed[0]?.payment ?? 0,
      variableInterest: 0,
      fixedInterest: 0,
      variableRate: variable[0]?.rate ?? 0,
      fixedRate,
    },
  ];
  for (let i = 11; i < variable.length; i += 12) {
    const v = variable[i];
    const f = fixed[Math.min(i, fixed.length - 1)];
    const nextV = variable[i + 1] ?? v;
    const nextF = fixed[i + 1] ?? f;
    points.push({
      year: Math.round(v.year),
      variableBalance: v.balance,
      fixedBalance: f.balance,
      // 返済額は「その年末時点で次の月に支払う額」＝見直し後の額を見せる
      variablePayment: i + 1 < variable.length ? nextV.payment : v.payment,
      fixedPayment: i + 1 < fixed.length ? nextF.payment : f.payment,
      variableInterest: v.cumulativeInterest,
      fixedInterest: f.cumulativeInterest,
      variableRate: i + 1 < variable.length ? nextV.rate : v.rate,
      fixedRate,
    });
  }
  return points;
}

export type TrendMetric = 'balance' | 'interest';

/** 残高 / 累計利息の推移：変動シナリオ vs 全期間固定 */
export function TrendChart({
  data,
  fixedLabel,
  metric,
}: {
  data: YearPoint[];
  fixedLabel: string;
  metric: TrendMetric;
}) {
  const variableKey = metric === 'balance' ? 'variableBalance' : 'variableInterest';
  const fixedKey = metric === 'balance' ? 'fixedBalance' : 'fixedInterest';
  const yTicks = niceTicks(0, Math.max(...data.map((d) => Math.max(d[variableKey], d[fixedKey]))));
  const renderTooltip = ({active, payload, label}: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as YearPoint;
    return (
      <TooltipBox
        title={`${label}年目の終わり`}
        rows={[
          {color: viz.variable, label: `変動（${formatRate(p.variableRate)}）`, value: formatMan(p[variableKey], 1)},
          {color: viz.fixed, label: fixedLabel, value: formatMan(p[fixedKey], 1)},
          {label: '差', value: formatMan(p[variableKey] - p[fixedKey], 1)},
        ]}
      />
    );
  };
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{top: 8, right: 16, left: 0, bottom: 0}}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="year"
          {...axisProps}
          tickFormatter={(v: number) => (v % 5 === 0 ? `${v}年` : '')}
          interval={0}
          minTickGap={0}
        />
        <YAxis
          {...axisProps}
          width={56}
          domain={[yTicks[0], yTicks[yTicks.length - 1]]}
          ticks={yTicks}
          tickFormatter={(v: number) => `${Math.round(v / 10000).toLocaleString('ja-JP')}万`}
        />
        <Tooltip content={renderTooltip} cursor={{stroke: viz.axis, strokeDasharray: '3 3'}} />
        <Line
          type="monotone"
          dataKey={fixedKey}
          name={fixedLabel}
          stroke={viz.fixed}
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={false}
          isAnimationActive={false}
          activeDot={{r: 5, strokeWidth: 2, stroke: viz.surface}}
        />
        <Line
          type="monotone"
          dataKey={variableKey}
          name="変動シナリオ"
          stroke={viz.variable}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          activeDot={{r: 5, strokeWidth: 2, stroke: viz.surface}}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 月々返済額の推移：見直しのたびに階段状に変わる */
export function PaymentChart({data, fixedLabel}: {data: YearPoint[]; fixedLabel: string}) {
  const [lo, hi] = extent(data.flatMap((d) => [d.variablePayment, d.fixedPayment]), 0.12);
  const yTicks = niceTicks(lo, hi);
  const renderTooltip = ({active, payload, label}: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as YearPoint;
    return (
      <TooltipBox
        title={`${label}年目`}
        rows={[
          {color: viz.variable, label: `変動（${formatRate(p.variableRate)}）`, value: formatYen(p.variablePayment)},
          {color: viz.fixed, label: fixedLabel, value: formatYen(p.fixedPayment)},
          {label: '差', value: formatYen(p.variablePayment - p.fixedPayment)},
        ]}
      />
    );
  };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{top: 8, right: 16, left: 0, bottom: 0}}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="year"
          {...axisProps}
          tickFormatter={(v: number) => (v % 5 === 0 ? `${v}年` : '')}
          interval={0}
          minTickGap={0}
        />
        <YAxis
          {...axisProps}
          width={64}
          domain={[yTicks[0], yTicks[yTicks.length - 1]]}
          ticks={yTicks}
          tickFormatter={(v: number) => `${(v / 10000).toFixed(1)}万円`}
        />
        <Tooltip content={renderTooltip} cursor={{stroke: viz.axis, strokeDasharray: '3 3'}} />
        <Line
          type="stepAfter"
          dataKey="fixedPayment"
          name={fixedLabel}
          stroke={viz.fixed}
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={false}
          isAnimationActive={false}
          activeDot={{r: 5, strokeWidth: 2, stroke: viz.surface}}
        />
        <Line
          type="stepAfter"
          dataKey="variablePayment"
          name="変動シナリオ"
          stroke={viz.variable}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          activeDot={{r: 5, strokeWidth: 2, stroke: viz.surface}}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** 金利と総返済額の相関。X軸は「上昇幅」か「全期間固定金利」を切り替えて見る */
export function CorrelationChart({
  data,
  xLabel,
  xUnit,
  current,
}: {
  data: SensitivityPoint[];
  xLabel: string;
  xUnit: string;
  current: {x: number; totalPayment: number; label: string} | null;
}) {
  const xMin = data[0]?.x ?? 0;
  const xMax = data[data.length - 1]?.x ?? 1;
  const markerRatio = current && xMax > xMin ? (current.x - xMin) / (xMax - xMin) : 0.5;
  const markerPosition = markerRatio > 0.75 ? 'left' : markerRatio < 0.12 ? 'right' : 'top';
  const xTicks = niceTicks(Math.min(...data.map((d) => d.x)), Math.max(...data.map((d) => d.x)), 6);
  const [lo, hi] = extent(data.map((d) => d.totalPayment), 0.08);
  const yTicks = niceTicks(lo, hi);
  const renderTooltip = ({active, payload}: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as SensitivityPoint;
    return (
      <TooltipBox
        title={`${xLabel} ${p.x.toFixed(2)}${xUnit}`}
        rows={[
          {color: viz.variable, label: '総返済額', value: formatMan(p.totalPayment, 0)},
          {label: 'うち利息', value: formatMan(p.totalInterest, 0)},
          {label: '平均金利', value: formatRate(p.averageRate)},
          {label: '最大の月々返済額', value: formatYen(p.maxPayment)},
        ]}
      />
    );
  };
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{top: 16, right: 16, left: 0, bottom: 4}}>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="x"
          type="number"
          domain={[data[0]?.x ?? 0, data[data.length - 1]?.x ?? 1]}
          ticks={xTicks.filter((t) => t >= (data[0]?.x ?? 0) && t <= (data[data.length - 1]?.x ?? 1))}
          {...axisProps}
          tickFormatter={(v: number) => `${v.toFixed(2)}${xUnit}`}
        />
        <YAxis
          {...axisProps}
          width={56}
          domain={[yTicks[0], yTicks[yTicks.length - 1]]}
          ticks={yTicks}
          tickFormatter={(v: number) => `${Math.round(v / 10000).toLocaleString('ja-JP')}万`}
        />
        <Tooltip content={renderTooltip} cursor={{stroke: viz.axis, strokeDasharray: '3 3'}} />
        <Line
          type="monotone"
          dataKey="totalPayment"
          name="総返済額"
          stroke={viz.variable}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          activeDot={{r: 5, strokeWidth: 2, stroke: viz.surface}}
        />
        {current && (
          <ReferenceDot
            x={current.x}
            y={current.totalPayment}
            r={6}
            fill={viz.marker}
            stroke={viz.surface}
            strokeWidth={2}
            isFront
            label={{
              value: `${current.label} ${formatMan(current.totalPayment, 0)}`,
              // 端に近いときはラベルがはみ出さないよう内側に寄せる
              position: markerPosition,
              fill: viz.textPrimary,
              fontSize: 11,
              fontWeight: 600,
            }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
