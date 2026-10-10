(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./planner-math.js'), require('./planner-fp.js'));
  else root.PlannerBridge = factory(root.PlannerMath, root.PlannerFP);
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (PlannerMath, PlannerFP) {
  'use strict';

  if (!PlannerMath || typeof PlannerMath.normalizeInput !== 'function' ||
      !PlannerFP || typeof PlannerFP.validate !== 'function' || typeof PlannerFP.calculate !== 'function') {
    throw new Error('PlannerBridgeにはPlannerMathとPlannerFPが必要です。両方を先に読み込んでください。');
  }

  var VERSION = '1.0.0';
  var MONEY_LIMIT = 1000000000000;
  var MONEY_EPSILON = 1e-7;

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function inspect(coreInput, fpInput) {
    // Validate essential expenses against the original household budget,
    // before any period override changes the reserve or stress basis.
    var errors = PlannerFP.validate(fpInput).map(function (error) { return Object.assign({}, error); });
    var input = PlannerMath.normalizeInput(coreInput);
    var activePeriods = [];
    var currentAge = null;
    function issue(field, code, message, extra) {
      errors.push(Object.assign({ field: field, code: code, message: message }, extra || {}));
    }
    function number(value, field, label, min, max, integer, nullable) {
      if (nullable && value === null) return true;
      if (value === null || value === undefined) {
        issue(field, 'required', label + 'を入力してください。');
      } else if (typeof value !== 'number' || !Number.isFinite(value)) {
        issue(field, 'number', label + 'は有限の数値で入力してください。');
      } else if (value < min || value > max) {
        issue(field, 'range', label + 'は' + min.toLocaleString('ja-JP') + '〜' + max.toLocaleString('ja-JP') + 'の範囲で入力してください。');
      } else if (integer && !Number.isInteger(value)) {
        issue(field, 'integer', label + 'は整数で入力してください。');
      } else return true;
      return false;
    }

    if (!isObject(input)) {
      issue('coreInput', 'type', '開始年齢と期間の入力が必要です。');
      return { errors: errors };
    }
    if (!isObject(input.profile)) issue('profile.currentAge', 'required', '開始年齢を入力してください。');
    else if (number(input.profile.currentAge, 'profile.currentAge', '開始年齢', 18, 99, true, false)) currentAge = input.profile.currentAge;

    if (!Array.isArray(input.periods)) issue('periods', 'type', '期間は配列で指定してください（項目がなければ空の配列）。');
    else {
      if (input.periods.length > 12) issue('periods', 'max_items', '期間は12件以内にしてください。');
      input.periods.forEach(function (period, index) {
        var prefix = 'periods[' + index + ']';
        if (!isObject(period)) {
          issue(prefix, 'type', '各期間はオブジェクトで指定してください。');
          return;
        }
        var startValid = number(period.startAge, prefix + '.startAge', '期間の開始年齢', 18, 99, true, false);
        var endValid = number(period.endAge, prefix + '.endAge', '期間の終了年齢', 19, 100, true, false);
        var deltaValid = number(period.expenseDelta, prefix + '.expenseDelta', '期間の月支出増減（円）', -MONEY_LIMIT, MONEY_LIMIT, false, false);
        var reserveValid = number(period.reserveBase, prefix + '.reserveBase', '期間の現金確保基準月額（円）', 0, MONEY_LIMIT, false, true);
        var ordered = startValid && endValid && period.startAge < period.endAge;
        if (startValid && endValid && !ordered) issue(prefix + '.endAge', 'age_order', '期間の終了年齢は開始年齢より大きくしてください。');
        if (ordered && deltaValid && reserveValid && currentAge !== null && period.startAge <= currentAge && currentAge < period.endAge) {
          activePeriods.push({
            index: index, id: typeof period.id === 'string' ? period.id : null,
            label: typeof period.label === 'string' ? period.label : null,
            startAge: period.startAge, endAge: period.endAge,
            expenseDelta: period.expenseDelta, reserveBase: period.reserveBase
          });
        }
      });
    }
    var reservePeriods = activePeriods.filter(function (period) { return period.reserveBase !== null; });
    if (reservePeriods.length > 1) {
      reservePeriods.slice(1).forEach(function (period) {
        issue('periods[' + period.index + '].reserveBase', 'reserve_overlap', '開始年齢で有効な現金確保基準額を2つ以上上書きできません。', {
          relatedField: 'periods[' + reservePeriods[0].index + '].reserveBase'
        });
      });
    }
    if (errors.length) return { errors: errors };

    // Use the same input order and small residual threshold as the core's
    // starting budget. Reserve overrides never enter this expense sum.
    var expenseDelta = activePeriods.reduce(function (total, period) { return total + period.expenseDelta; }, 0);
    var actualExpenses = fpInput.monthlyExpenses + expenseDelta;
    if (Math.abs(actualExpenses) <= MONEY_EPSILON) actualExpenses = 0;
    if (!Number.isFinite(actualExpenses) || actualExpenses < 0 || actualExpenses > MONEY_LIMIT) {
      issue('periods', 'active_expenses_range', '開始年齢の支出増減を反映した月平均支出は0〜1,000,000,000,000円の範囲にしてください。');
      return { errors: errors };
    }

    var reservePeriod = reservePeriods.length ? reservePeriods[0] : null;
    var configuredBase = fpInput.basis === 'essential' ? fpInput.essentialMonthly : fpInput.monthlyExpenses;
    var reserveBase = reservePeriod ? reservePeriod.reserveBase : (fpInput.basis === 'essential' ? fpInput.essentialMonthly : actualExpenses);
    var stressExpenses = fpInput.essentialConfirmed ? fpInput.essentialMonthly : actualExpenses;
    var explanations = [];
    if (expenseDelta !== 0) explanations.push({ code: 'active_expense_delta', message: '開始年齢に有効な期間の支出増減を、生活費全体へ反映しています。' });
    if (reservePeriod) explanations.push({ code: 'active_reserve_override', message: '開始年齢に有効な期間の指定額を、現金確保の基準に優先しています。この指定額を通常の生活費や収入停止時の支出へ加算しません。' });
    if (fpInput.essentialConfirmed && fpInput.essentialMonthly > actualExpenses) {
      explanations.push({ code: 'essential_above_active_expenses', message: '期間反映後の生活費全体が、確認済み最低生活費を下回っています。最低生活費は自動調整していません。内訳を確認してください。' });
    }
    return {
      errors: errors, reserveBase: reserveBase, stressExpenses: stressExpenses,
      meta: {
        version: VERSION, currentAge: currentAge,
        baselineMonthlyExpenses: fpInput.monthlyExpenses, expenseDelta: expenseDelta, actualMonthlyExpenses: actualExpenses,
        configuredBasis: fpInput.basis, configuredMonthlyBase: configuredBase,
        reserveSource: reservePeriod ? 'period' : fpInput.basis,
        reservePeriodIndex: reservePeriod ? reservePeriod.index : null,
        reserveOverridden: reservePeriod !== null, activePeriods: activePeriods,
        stressSource: fpInput.essentialConfirmed ? 'essential' : 'total', stressMonthlyExpenses: stressExpenses,
        explanations: explanations
      }
    };
  }

  function validateFP(coreInput, fpInput) {
    return inspect(coreInput, fpInput).errors;
  }

  function calculateFP(coreInput, fpInput) {
    var checked = inspect(coreInput, fpInput);
    if (checked.errors.length) {
      var error = new RangeError(checked.errors.map(function (item) { return item.message; }).join(' '));
      error.name = 'PlannerBridgeInputError';
      error.errors = checked.errors;
      throw error;
    }
    // The existing FP calculator uses one expense field for both tasks. Call
    // it for each independent basis, then retain its own monetary results.
    // No reserve arithmetic or stress recurrence is reimplemented here.
    function forBasis(monthlyExpenses) {
      return PlannerFP.calculate(Object.assign({}, fpInput, {
        monthlyExpenses: monthlyExpenses, essentialMonthly: null,
        essentialConfirmed: false, basis: 'total'
      }));
    }
    var result = forBasis(checked.reserveBase);
    var stressResult = forBasis(checked.stressExpenses);
    result.basis = fpInput.basis;
    result.coverageMonthsWithoutIncome = stressResult.coverageMonthsWithoutIncome;
    result.zeroLivingExpense = stressResult.zeroLivingExpense;
    result.stress = stressResult.stress;
    result.stress.basis = checked.meta.stressSource;
    result.meta = checked.meta;
    return result;
  }

  return { version: VERSION, validateFP: validateFP, calculateFP: calculateFP };
}));
