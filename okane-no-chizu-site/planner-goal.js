(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./planner-math.js'));
  else root.PlannerGoal = factory(root.PlannerMath);
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (PlannerMath) {
  'use strict';

  if (!PlannerMath || typeof PlannerMath.compare !== 'function' || typeof PlannerMath.validateInput !== 'function') {
    throw new Error('PlannerGoalにはPlannerMathが必要です。planner-math.jsを先に読み込んでください。');
  }

  var VERSION = '1.0.1';
  var AMOUNT_LIMIT = 1000000000000;
  var SCENARIOS = ['assumed', 'zeroReturn', 'shock'];
  var NUMBER_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeGoal(goal) {
    if (goal === undefined || goal === null) return { kind: 'value', amount: null };
    if (!isObject(goal)) return goal;
    var amount = goal.amount;
    if (amount === undefined || amount === null || (typeof amount === 'string' && !amount.trim())) amount = null;
    else if (typeof amount === 'string' && NUMBER_TEXT.test(amount.trim())) amount = Number(amount.trim());
    return { kind: goal.kind === undefined ? 'value' : goal.kind, amount: amount };
  }

  function validateGoal(goal) {
    var normalized = normalizeGoal(goal);
    var errors = [];
    if (!isObject(normalized)) return [{ field: 'goal', code: 'type', message: '目標はオブジェクトで指定してください。' }];
    if (normalized.kind !== 'value' && normalized.kind !== 'contributions') {
      errors.push({ field: 'goal.kind', code: 'enum', message: '目標の種類は運用時価または今回の計画の入金累計を選んでください。' });
    }
    if (normalized.amount !== null) {
      if (typeof normalized.amount !== 'number' || !Number.isFinite(normalized.amount)) {
        errors.push({ field: 'goal.amount', code: 'number', message: '目標金額は有限の数値で入力してください。' });
      } else if (normalized.amount < 1 || normalized.amount > AMOUNT_LIMIT) {
        errors.push({ field: 'goal.amount', code: 'range', message: '目標金額は1〜1,000,000,000,000円で入力してください。空欄は目標なしです。' });
      } else if (!Number.isInteger(normalized.amount)) {
        errors.push({ field: 'goal.amount', code: 'integer', message: '目標金額は整数円で入力してください。' });
      }
    }
    return errors;
  }

  function validateInput(input, goal) {
    return PlannerMath.validateInput(input).concat(validateGoal(goal));
  }

  function inputError(errors) {
    var error = new RangeError(errors.map(function (item) { return item.message; }).join(' '));
    error.name = 'PlannerGoalInputError';
    error.errors = errors;
    return error;
  }

  function monetaryDifference(amount, target) {
    var difference = amount - target;
    var tolerance = Math.max(1e-7, 4 * Number.EPSILON * Math.max(Math.abs(amount), Math.abs(target)));
    return Math.abs(difference) <= tolerance ? 0 : difference;
  }

  function warning(code, scope, message, details, level) {
    return Object.assign({ code: code, scope: scope, level: level || 'warning', message: message }, details || {});
  }

  function summarizeScenario(simulation, goal, key) {
    var hasGoal = goal.amount !== null;
    var amount = goal.kind === 'contributions' ? simulation.totals.contributions : simulation.final.investments;
    var gap = hasGoal ? monetaryDifference(amount, goal.amount) : null;
    var maxProtectedCashGap = 0;
    [simulation.initial].concat(simulation.monthlyRows).forEach(function (row) {
      // Negative cash records unpaid expenses. Keep that shortfall separate
      // from the gap between available cash and the protection target.
      maxProtectedCashGap = Math.max(maxProtectedCashGap, -monetaryDifference(Math.max(0, row.cash), row.protectedCash));
    });
    var warnings = [];
    if (simulation.maxShortfall > 0) warnings.push(warning('cash_shortfall', key,
      '支払資金が不足する時期があります。目標金額との比較とは別に確認してください。', { amount: simulation.maxShortfall }));
    if (maxProtectedCashGap > 0) warnings.push(warning('cash_protection_gap', key,
      '確保したい現金を下回る時期があります。防衛資金と予定支出の内訳を確認してください。', { amount: maxProtectedCashGap }));
    return {
      unit: 'JPY', amount: amount, gap: gap,
      ratio: hasGoal ? (gap === 0 ? 1 : amount / goal.amount) : null,
      met: hasGoal ? gap >= 0 : null,
      investments: simulation.final.investments,
      contributions: simulation.totals.contributions,
      withdrawals: simulation.totals.withdrawals,
      cash: simulation.final.cash,
      total: simulation.final.total,
      maxShortfall: simulation.maxShortfall,
      firstShortfall: simulation.firstShortfall,
      maxProtectedCashGap: maxProtectedCashGap,
      warnings: warnings
    };
  }

  function referenceCalculation(simulation, goal) {
    var input = simulation.input;
    var rows = simulation.monthlyRows;
    var activeRows = rows.filter(function (row) { return row.investmentCap !== 0; });
    var activeMonths = activeRows.length;
    var isValue = goal.kind === 'value';
    var startingInvestments = input.profile.investments + simulation.actualInitial;
    var monthlyRate = isValue ? Math.expm1(Math.log1p(input.plan.annualReturn / 100) / 12) : null;
    var growthFactor = isValue ? Math.exp(rows.length * Math.log1p(monthlyRate)) : 1;
    var futureInitialAmount = isValue ? startingInvestments * growthFactor : simulation.actualInitial;
    var coefficient = isValue ? 0 : activeMonths;
    if (isValue && activeMonths > 0) {
      // Explicit zero caps define the active set. Actual household-constrained
      // contributions and positive caps must not silently change this reference.
      var compensation = 0;
      activeRows.forEach(function (row) {
        var weight = Math.exp((rows.length - 1 - row.month) * Math.log1p(monthlyRate));
        var corrected = weight - compensation;
        var next = coefficient + corrected;
        compensation = (next - coefficient) - corrected;
        coefficient = next;
      });
    }
    var result = {
      unit: 'JPY', status: 'none', message: '目標金額は未入力です。',
      goalKind: goal.kind, targetAmount: goal.amount,
      monthlyRequired: null, monthlyRequiredUnrounded: null,
      projectedAmount: null, projectedGap: null, canApply: false,
      months: rows.length, activeMonths: activeMonths, pausedMonths: rows.length - activeMonths,
      startingInvestments: startingInvestments, actualInitial: simulation.actualInitial,
      initialAmountUsed: isValue ? startingInvestments : simulation.actualInitial,
      futureInitialAmount: futureInitialAmount, coefficient: coefficient,
      annualReturnPercent: isValue ? input.plan.annualReturn : null,
      monthlyReturnRate: monthlyRate, growthFactor: growthFactor,
      includesShock: false, includesHouseholdConstraints: false,
      includesPositiveCaps: false, includesWithdrawals: false,
      monthlyInputLimit: AMOUNT_LIMIT
    };
    if (goal.amount === null) return result;

    var remaining = monetaryDifference(goal.amount, futureInitialAmount);
    // Test the zero-active-month case before dividing by F or N.
    if (coefficient === 0 || activeMonths === 0) {
      if (remaining > 0) {
        result.status = 'unreachable';
        result.message = 'この条件では積立による到達額を計算できません。積立可能な月がありません。';
        result.projectedAmount = futureInitialAmount;
        result.projectedGap = monetaryDifference(futureInitialAmount, goal.amount);
        return result;
      }
      result.status = 'already_met';
      result.message = '単純計算では、追加の月末積立がなくても目標時点の金額を満たします。';
      result.monthlyRequired = 0;
      result.monthlyRequiredUnrounded = 0;
      result.projectedAmount = futureInitialAmount;
      result.projectedGap = monetaryDifference(futureInitialAmount, goal.amount);
      result.canApply = true;
      return result;
    }

    var exactMonthly = Math.max(0, remaining / coefficient);
    result.monthlyRequiredUnrounded = exactMonthly;
    if (exactMonthly > AMOUNT_LIMIT) {
      result.status = 'outside_input_range';
      result.message = '単純計算の必要月額が、入力できる上限の1兆円を超えています。';
      return result;
    }
    var roundedMonthly = Math.ceil(exactMonthly);
    result.status = roundedMonthly === 0 ? 'already_met' : 'calculated';
    result.message = roundedMonthly === 0 ?
      '単純計算では、追加の月末積立がなくても目標時点の金額を満たします。' :
      '家計の制約を含めない参考額です。この月額を使った実際の結果を別案で比較してください。';
    result.monthlyRequired = roundedMonthly;
    // Recalculate with the whole-yen amount; do not display the unrounded
    // amount's target value as though it were the rounded amount's result.
    result.projectedAmount = futureInitialAmount + roundedMonthly * coefficient;
    result.projectedGap = monetaryDifference(result.projectedAmount, goal.amount);
    result.canApply = true;
    return result;
  }

  function referenceWarnings(comparison, goal, reference) {
    if (goal.amount === null) return [];
    var assumed = comparison.assumed;
    var input = assumed.input;
    var warnings = [warning('simple_reference_only', 'reference',
      '必要月額は仮定を単純化した参考値です。家計余力・確保する現金・将来の売却を含まず、実行可能額や最適額を示しません。', null, 'info')];
    if (goal.kind === 'contributions') warnings.push(warning('contributions_not_value', 'reference',
      '入金累計は実行初回振替と今回の積立の合計です。開始時の既存投資時価を含めず、売却しても過去の入金額を減らしません。', null, 'info'));
    if (input.periods.some(function (period) { return period.investmentCap !== null && period.investmentCap > 0; })) {
      warnings.push(warning('positive_caps_ignored', 'reference',
        '期間の0円以外の積立上限は、単純な必要月額の逆算に含めていません。'));
    }
    var withdrawalScenarios = SCENARIOS.filter(function (key) { return comparison[key].totals.withdrawals > 0; });
    if (withdrawalScenarios.length) warnings.push(warning('withdrawals_ignored', 'reference',
      '試算には投資を取り崩す時期があります。単純な必要月額は将来の売却を差し引いていません。', { scenarios: withdrawalScenarios }));
    var limitedScenarios = SCENARIOS.filter(function (key) {
      return comparison[key].monthlyRows.some(function (row) {
        return row.investmentCap !== 0 && monetaryDifference(input.plan.monthlyInvestment, row.contribution) > 0;
      });
    });
    if (limitedScenarios.length) warnings.push(warning('execution_below_requested', 'reference',
      '家計の収支・現金確保・上限・売却により、希望月額どおりに積み立てられない月があります。', { scenarios: limitedScenarios }));
    if (monetaryDifference(input.plan.initialInvestment, assumed.actualInitial) > 0) {
      warnings.push(warning('initial_transfer_limited', 'reference',
        '確保する現金を残すため、初回振替は希望額より少なくなっています。逆算には実行額を使います。', {
          requested: input.plan.initialInvestment, executed: assumed.actualInitial
        }));
    }
    if (input.plan.shockPercent > 0) warnings.push(warning('shock_excluded', 'reference',
      goal.kind === 'value' ?
        '参考の必要月額は入力年率が続く仮定で計算し、一度の下落を含めません。下落ケースの実結果も比較してください。' :
        '入金累計の単純逆算は運用率を使いません。下落によって売却や実行積立が変わる影響は、下落ケースの実結果で確認してください。', null, 'info'));
    if (reference.status === 'unreachable') warnings.push(warning('no_active_months', 'reference', reference.message));
    if (reference.status === 'outside_input_range') warnings.push(warning('reference_exceeds_input_limit', 'reference', reference.message));
    return warnings;
  }

  function analyze(input, goal) {
    var errors = validateInput(input, goal);
    if (errors.length) throw inputError(errors);
    var normalizedGoal = normalizeGoal(goal);
    var comparison = PlannerMath.compare(input);
    var scenarios = {};
    var warnings = [];
    SCENARIOS.forEach(function (key) {
      scenarios[key] = summarizeScenario(comparison[key], normalizedGoal, key);
      warnings = warnings.concat(scenarios[key].warnings);
    });
    var reference = referenceCalculation(comparison.assumed, normalizedGoal);
    warnings = warnings.concat(referenceWarnings(comparison, normalizedGoal, reference));
    return {
      version: VERSION, unit: 'JPY', goal: normalizedGoal, hasGoal: normalizedGoal.amount !== null,
      endAge: comparison.assumed.final.age,
      requestedMonthly: comparison.assumed.input.plan.monthlyInvestment,
      comparison: comparison, scenarios: scenarios, reference: reference, warnings: warnings
    };
  }

  return {
    version: VERSION, normalizeGoal: normalizeGoal, validateGoal: validateGoal,
    validateInput: validateInput, analyze: analyze
  };
}));
