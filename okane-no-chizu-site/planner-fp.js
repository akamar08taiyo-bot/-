(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlannerFP = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var LIMIT = 1e12;
  var EPSILON = 1e-7;
  function zeroResidual(value) {
    var scale = 1;
    for (var i = 1; i < arguments.length; i++) scale = Math.max(scale, Math.abs(arguments[i]));
    var tolerance = Math.max(EPSILON, 4 * Number.EPSILON * scale);
    return Math.abs(value) <= tolerance ? 0 : value;
  }
  function validate(input) {
    var errors = [];
    function issue(field, message) { errors.push({ field: field, message: message }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return [{ field: 'input', message: '家計の入力が必要です。' }];
    function number(field, min, max, integer) {
      var value = input[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        issue(field, field + 'は' + min + '〜' + max + (integer ? 'の整数' : 'の数値') + 'で入力してください。');
      }
    }
    ['cash', 'monthlyExpenses', 'plannedCash', 'otherReservedCash', 'remainingIncome'].forEach(function (field) { number(field, 0, LIMIT); });
    number('months', 0, 24, true);
    number('stressMonths', 1, 24, true);
    if (input.basis !== 'total' && input.basis !== 'essential') issue('basis', '生活費全体か最低生活費を選んでください。');
    if (typeof input.essentialConfirmed !== 'boolean') issue('essentialConfirmed', '最低生活費の確認状態を指定してください。');
    if (input.essentialMonthly !== null && input.essentialMonthly !== undefined) {
      number('essentialMonthly', 0, LIMIT);
      if (Number.isFinite(input.monthlyExpenses) && input.essentialMonthly > input.monthlyExpenses) issue('essentialMonthly', '最低生活費は現在の月平均支出以下で入力してください。');
    }
    if ((input.basis === 'essential' || input.essentialConfirmed) && (input.essentialConfirmed !== true || typeof input.essentialMonthly !== 'number' || !Number.isFinite(input.essentialMonthly))) {
      issue('essentialMonthly', '最低生活費の金額と内訳を確認してください。未確認の額を0円とは扱いません。');
    }
    return errors;
  }
  function calculate(input) {
    var errors = validate(input);
    if (errors.length) {
      var err = new RangeError(errors.map(function (item) { return item.message; }).join(' '));
      err.name = 'PlannerFPInputError'; err.errors = errors; throw err;
    }
    var base = input.basis === 'essential' ? input.essentialMonthly : input.monthlyExpenses;
    var target = base * input.months;
    var earmarked = input.plannedCash + input.otherReservedCash;
    var available = Math.max(0, zeroResidual(input.cash - earmarked, input.cash, earmarked));
    var emergencyGap = Math.max(0, zeroResidual(target - available, target, available));
    var stressExpense = input.essentialConfirmed ? input.essentialMonthly : input.monthlyExpenses;
    var stressCash = available;
    var firstShortfallMonth = null;
    var maxShortfall = 0;
    var stressRows = [];
    var monthlyNet = zeroResidual(input.remainingIncome - stressExpense, input.remainingIncome, stressExpense);
    for (var month = 1; month <= input.stressMonths; month++) {
      // Constant monthly conditions permit a direct cumulative calculation,
      // avoiding accumulated subtraction error in large cash balances.
      stressCash = zeroResidual(available + month * monthlyNet, available, month * input.remainingIncome, month * stressExpense);
      var shortfall = Math.max(0, -stressCash);
      if (shortfall > 0 && firstShortfallMonth === null) firstShortfallMonth = month;
      maxShortfall = Math.max(maxShortfall, shortfall);
      stressRows.push({ month: month, income: input.remainingIncome, expenses: stressExpense, cash: stressCash, shortfall: shortfall });
    }
    return {
      version: '1.0.0', unit: 'JPY', basis: input.basis, monthlyBase: base,
      comparisons: [3, 6, 12].map(function (months) { return { months: months, target: base * months }; }),
      months: input.months, emergencyTarget: target,
      plannedCash: input.plannedCash, otherReservedCash: input.otherReservedCash,
      totalProtected: target + earmarked,
      availableForEmergency: available,
      earmarkedShortfall: Math.max(0, zeroResidual(earmarked - input.cash, earmarked, input.cash)),
      emergencyShortfall: emergencyGap,
      unallocatedCash: Math.max(0, zeroResidual(input.cash - earmarked - target, input.cash, earmarked, target)),
      coverageMonthsWithoutIncome: stressExpense > 0 ? available / stressExpense : null,
      zeroLivingExpense: stressExpense === 0,
      stress: {
        basis: input.essentialConfirmed ? 'essential' : 'total',
        monthlyExpenses: stressExpense, remainingIncome: input.remainingIncome,
        openingCash: available, months: input.stressMonths,
        rows: stressRows, closingCash: stressCash, firstShortfallMonth: firstShortfallMonth, maxShortfall: maxShortfall,
        assumptions: ['constantMonthlyIncomeAndExpenses', 'earmarkedCashExcluded', 'noInvestmentSaleOrReturn', 'noAutomaticBenefits']
      }
    };
  }
  return { validate: validate, calculate: calculate };
}));
