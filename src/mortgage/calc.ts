/**
 * 変動金利（段階的な金利上昇シナリオ）の返済シミュレーション。
 *
 * 前提とする計算方式:
 * - 元利均等返済。月利 = 年利 / 12、残高に対して毎月利息を計算する。
 * - 「5年ルール」に近い方式として、見直し間隔ごとに「その時点の残債務 × 残期間 × 新金利」で
 *   月々返済額を再計算する（円未満は四捨五入）。
 * - 「125%ルール」を有効にすると、再計算後の返済額を直前の返済額の125%までに抑える。
 *   返済額が利息に満たない場合は未払利息として繰り越し、以後の返済で優先的に充当する。
 * - 最終回は残高・未払利息を一括精算する（実務の最終回調整に相当）。
 */

export interface ScenarioInput {
  /** 借入額（円） */
  principal: number;
  /** 返済期間（年） */
  years: number;
  /** 当初金利（年率 %） */
  initialRate: number;
  /** 見直しごとの金利上昇幅（%）。マイナスを入れれば下降シナリオになる */
  stepRate: number;
  /** 金利見直し間隔（年） */
  reviewYears: number;
  /** 上限金利（年率 %）。これ以上は上がらない */
  maxRate: number;
  /** 125%ルール（返済額の上昇を直前の1.25倍までに抑える）を適用するか */
  use125Rule: boolean;
}

/** 金利見直し区間ごとの結果 */
export interface SegmentResult {
  index: number;
  /** 区間の開始年（1始まり） */
  fromYear: number;
  /** 区間の終了年 */
  toYear: number;
  /** 適用金利（%） */
  rate: number;
  /** 実際に適用された月々返済額（円） */
  payment: number;
  /** 125%ルールを適用しなかった場合の月々返済額（円） */
  scheduledPayment: number;
  /** 125%ルールで返済額が抑えられた区間か */
  capped: boolean;
  /** 区間末の残高（円） */
  endingBalance: number;
  /** 区間中に支払った利息（円） */
  interest: number;
  /** 区間中に減った元金（円） */
  principalPaid: number;
  /** 区間末の未払利息残高（円） */
  deferredInterest: number;
}

/** 毎月の推移（グラフ用） */
export interface MonthPoint {
  /** 1始まりの返済回数 */
  month: number;
  /** 経過年（小数）。グラフのX軸に使う */
  year: number;
  rate: number;
  payment: number;
  balance: number;
  cumulativeInterest: number;
  cumulativePayment: number;
}

export interface SimulationResult {
  input: ScenarioInput;
  segments: SegmentResult[];
  monthly: MonthPoint[];
  /** 総返済額（円） */
  totalPayment: number;
  /** 総利息（円） */
  totalInterest: number;
  /** 最終回の支払額（円）。未払利息や端数の精算を含む */
  finalPayment: number;
  /** 最終回で一括精算した額（通常回との差額、円） */
  balloon: number;
  /** 月々返済額の最大値（円） */
  maxPayment: number;
  /** 適用金利の最終値（%） */
  finalRate: number;
  /** 残高加重の平均金利（%） */
  averageRate: number;
}

const round = (v: number) => Math.round(v);

/** 元利均等返済の毎月返済額（円、端数処理なし） */
export function annuityPayment(balance: number, annualRatePct: number, months: number): number {
  if (months <= 0) return balance;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return balance / months;
  const factor = Math.pow(1 + r, months);
  return (balance * r * factor) / (factor - 1);
}

/** 区間ごとの適用金利（上限でクリップ） */
export function rateForSegment(input: ScenarioInput, segmentIndex: number): number {
  const raw = input.initialRate + input.stepRate * segmentIndex;
  const capped = Math.min(raw, input.maxRate);
  // 浮動小数の誤差で 1.7500000000000002 のような値にならないよう丸める
  return Math.round(Math.max(capped, 0) * 1e6) / 1e6;
}

export function simulate(input: ScenarioInput): SimulationResult {
  const totalMonths = Math.max(1, Math.round(input.years * 12));
  const reviewMonths = Math.max(1, Math.round(input.reviewYears * 12));

  let balance = input.principal;
  let deferredInterest = 0;
  let previousPayment = 0;

  let totalPayment = 0;
  let totalInterest = 0;
  let maxPayment = 0;
  let weightedRate = 0;
  let weightedBase = 0;

  const segments: SegmentResult[] = [];
  const monthly: MonthPoint[] = [];

  let segmentIndex = 0;
  let payment = 0;
  let scheduledPayment = 0;
  let rate = input.initialRate;
  let segStartYear = 1;
  let segInterest = 0;
  let segPrincipal = 0;

  for (let month = 1; month <= totalMonths; month++) {
    const isReview = (month - 1) % reviewMonths === 0;
    if (isReview) {
      if (month > 1) {
        segments.push({
          index: segmentIndex,
          fromYear: segStartYear,
          toYear: (month - 1) / 12,
          rate,
          payment,
          scheduledPayment,
          capped: payment < scheduledPayment,
          endingBalance: round(balance),
          interest: round(segInterest),
          principalPaid: round(segPrincipal),
          deferredInterest: round(deferredInterest),
        });
        segmentIndex += 1;
        segStartYear = (month - 1) / 12 + 1;
        segInterest = 0;
        segPrincipal = 0;
      }
      rate = rateForSegment(input, segmentIndex);
      const remaining = totalMonths - month + 1;
      // 未払利息がある場合は、それも含めて残期間で返済する
      scheduledPayment = round(annuityPayment(balance + deferredInterest, rate, remaining));
      payment =
        input.use125Rule && previousPayment > 0
          ? Math.min(scheduledPayment, round(previousPayment * 1.25))
          : scheduledPayment;
      previousPayment = payment;
      maxPayment = Math.max(maxPayment, payment);
    }

    const monthlyRate = rate / 100 / 12;
    const interest = balance * monthlyRate;
    const isLast = month === totalMonths;
    // 最終回は残高・未払利息をまとめて精算する
    const paid = isLast ? balance + interest + deferredInterest : payment;

    let available = paid;
    // 未払利息 → 当月利息 → 元金 の順に充当する
    const toDeferred = Math.min(available, deferredInterest);
    deferredInterest -= toDeferred;
    available -= toDeferred;
    const toInterest = Math.min(available, interest);
    available -= toInterest;
    deferredInterest += interest - toInterest;
    const toPrincipal = Math.min(available, balance);
    balance -= toPrincipal;

    totalPayment += paid;
    totalInterest += interest;
    segInterest += interest;
    segPrincipal += toPrincipal;
    weightedRate += rate * (balance + toPrincipal);
    weightedBase += balance + toPrincipal;

    monthly.push({
      month,
      year: month / 12,
      rate,
      payment: round(paid),
      balance: round(balance),
      cumulativeInterest: round(totalInterest),
      cumulativePayment: round(totalPayment),
    });
  }

  const finalPayment = monthly[monthly.length - 1]?.payment ?? 0;
  segments.push({
    index: segmentIndex,
    fromYear: segStartYear,
    toYear: totalMonths / 12,
    rate,
    payment,
    scheduledPayment,
    capped: payment < scheduledPayment,
    endingBalance: round(balance),
    interest: round(segInterest),
    principalPaid: round(segPrincipal),
    deferredInterest: round(deferredInterest),
  });

  return {
    input,
    segments,
    monthly,
    totalPayment: round(totalPayment),
    totalInterest: round(totalInterest),
    finalPayment,
    balloon: round(finalPayment - payment),
    maxPayment: Math.max(maxPayment, 0),
    finalRate: rate,
    averageRate: weightedBase > 0 ? weightedRate / weightedBase : input.initialRate,
  };
}

/** 全期間固定金利で借りた場合（比較用） */
export function simulateFixed(input: ScenarioInput, rate = input.initialRate): SimulationResult {
  return simulate({...input, initialRate: rate, stepRate: 0, maxRate: Math.max(rate, input.maxRate), use125Rule: false});
}

export interface SensitivityPoint {
  /** X軸の値（上昇幅 % もしくは 固定金利 %） */
  x: number;
  totalPayment: number;
  totalInterest: number;
  /** 最大の月々返済額（円） */
  maxPayment: number;
  /** 残高加重の平均金利（%） */
  averageRate: number;
}

/** 5年ごとの上昇幅を振ったときの総返済額（金利上昇 × 総返済額の相関） */
export function stepSensitivity(input: ScenarioInput, steps: number[]): SensitivityPoint[] {
  return steps.map((step) => {
    const r = simulate({...input, stepRate: step});
    return {
      x: step,
      totalPayment: r.totalPayment,
      totalInterest: r.totalInterest,
      maxPayment: r.maxPayment,
      averageRate: r.averageRate,
    };
  });
}

/** 全期間固定金利を振ったときの総返済額（金利水準 × 総返済額の相関） */
export function fixedRateSensitivity(input: ScenarioInput, rates: number[]): SensitivityPoint[] {
  return rates.map((rate) => {
    const r = simulateFixed(input, rate);
    return {
      x: rate,
      totalPayment: r.totalPayment,
      totalInterest: r.totalInterest,
      maxPayment: r.maxPayment,
      averageRate: rate,
    };
  });
}

/** 等差の数列を作る（浮動小数の誤差を丸めた上で返す） */
export function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  const count = Math.round((to - from) / step);
  for (let i = 0; i <= count; i++) out.push(Math.round((from + step * i) * 1e6) / 1e6);
  return out;
}
