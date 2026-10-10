(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlannerMath = factory();
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var VERSION = '1.1.1';
  var MONEY_LIMIT = 1000000000000;
  var MONEY_EPSILON = 1e-7;
  var CASH_EPSILON_FACTOR = 4;
  var NUMBER_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  var NUMERIC_FIELDS = {
    profile: ['currentAge', 'endAge', 'monthlyIncome', 'annualIncome', 'cash', 'investments'],
    reserve: ['months', 'extraCash', 'lookaheadYears', 'monthlyBase'],
    plan: ['monthlyInvestment', 'initialInvestment', 'annualReturn', 'inflation', 'shockAge', 'shockPercent']
  };
  var ARRAY_FIELDS = {
    expenses: ['monthly'],
    annualExpenses: ['annual'],
    periods: ['startAge', 'endAge', 'monthlyIncome', 'expenseDelta', 'investmentCap', 'reserveBase'],
    oneOffs: ['age', 'amount']
  };

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // Blank is unknown/unset, never zero. Invalid values survive normalization
  // so validation can reject them instead of silently repairing the input.
  function normalizeNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    var trimmed = value.trim();
    if (!trimmed) return null;
    return NUMBER_TEXT.test(trimmed) ? Number(trimmed) : value;
  }

  function normalizeRecord(value, numericFields) {
    if (!isObject(value)) return value === undefined ? null : value;
    var result = Object.assign({}, value);
    numericFields.forEach(function (field) { result[field] = normalizeNumber(value[field]); });
    return result;
  }

  function normalizeInput(input) {
    if (!isObject(input)) return input;
    var result = Object.assign({}, input);
    Object.keys(NUMERIC_FIELDS).forEach(function (key) {
      result[key] = normalizeRecord(input[key], NUMERIC_FIELDS[key]);
    });
    Object.keys(ARRAY_FIELDS).forEach(function (key) {
      result[key] = Array.isArray(input[key]) ? input[key].map(function (item) {
        return normalizeRecord(item, ARRAY_FIELDS[key]);
      }) : (input[key] === undefined ? null : input[key]);
    });
    return result;
  }

  function sum(values) {
    return values.reduce(function (total, value) { return total + value; }, 0);
  }

  // Use an absolute tolerance for budgets and a scale-aware tolerance for
  // cash arithmetic, so repeated monthly fractions cannot cause dust sales.
  function financialZero(value, cashOperationScale) {
    var tolerance = cashOperationScale === undefined ? MONEY_EPSILON :
      Math.max(MONEY_EPSILON, CASH_EPSILON_FACTOR * Number.EPSILON * cashOperationScale);
    return Math.abs(value) <= tolerance ? 0 : value;
  }

  function validNumber(value, min, max, integer) {
    return typeof value === 'number' && Number.isFinite(value) &&
      value >= min && value <= max && (!integer || Number.isInteger(value));
  }

  function validateNormalized(input) {
    var errors = [];
    function error(field, code, message, extra) {
      errors.push(Object.assign({ field: field, code: code, message: message }, extra || {}));
    }
    function check(value, field, label, min, max, options) {
      options = options || {};
      if (value === null && options.nullable) return true;
      if (value === null || value === undefined) {
        error(field, 'required', label + 'を入力してください。');
        return false;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        error(field, 'number', label + 'は有限の数値で入力してください。');
        return false;
      }
      if (value < min || value > max) {
        error(field, 'range', label + 'は' + min.toLocaleString('ja-JP') + '〜' + max.toLocaleString('ja-JP') + 'の範囲で入力してください。');
        return false;
      }
      if (options.integer && !Number.isInteger(value)) {
        error(field, 'integer', label + 'は整数で入力してください。');
        return false;
      }
      if (options.step && Math.abs(value / options.step - Math.round(value / options.step)) > 1e-8) {
        error(field, 'step', label + 'は' + options.step + '刻みで入力してください。');
        return false;
      }
      return true;
    }
    function money(value, field, label, signed, nullable) {
      return check(value, field, label + '（円）', signed ? -MONEY_LIMIT : 0, MONEY_LIMIT, { nullable: nullable });
    }
    if (!isObject(input)) {
      error('input', 'type', '入力全体はオブジェクトで指定してください。');
      return errors;
    }
    Object.keys(NUMERIC_FIELDS).forEach(function (key) {
      if (!isObject(input[key])) error(key, 'type', key + 'の入力が必要です。');
    });
    Object.keys(ARRAY_FIELDS).forEach(function (key) {
      if (!Array.isArray(input[key])) error(key, 'type', key + 'は配列で指定してください（項目がなければ空の配列）。');
      else input[key].forEach(function (item, index) {
        if (!isObject(item)) error(key + '[' + index + ']', 'type', '各項目はオブジェクトで指定してください。');
      });
    });

    var profile = isObject(input.profile) ? input.profile : {};
    var agesValid = false;
    if (isObject(input.profile)) {
      var startValid = check(profile.currentAge, 'profile.currentAge', '開始年齢', 18, 99, { integer: true });
      var endValid = check(profile.endAge, 'profile.endAge', '終了年齢', 19, 100, { integer: true });
      agesValid = startValid && endValid && profile.endAge > profile.currentAge;
      if (startValid && endValid && profile.endAge <= profile.currentAge) {
        error('profile.endAge', 'age_order', '終了年齢は開始年齢より大きくしてください。');
      }
      money(profile.monthlyIncome, 'profile.monthlyIncome', '月の手取り収入');
      money(profile.annualIncome, 'profile.annualIncome', '賞与等の年の手取り収入');
      money(profile.cash, 'profile.cash', '現預金');
      money(profile.investments, 'profile.investments', '現在の投資時価');
    }

    var validExpenses = Array.isArray(input.expenses) && Array.isArray(input.annualExpenses);
    ['expenses', 'annualExpenses'].forEach(function (key) {
      if (!Array.isArray(input[key])) return;
      if (input[key].length > 100) error(key, 'max_items', '支出項目はそれぞれ100件以内にしてください。');
      input[key].forEach(function (item, index) {
        if (!isObject(item)) { validExpenses = false; return; }
        var amountField = key === 'expenses' ? 'monthly' : 'annual';
        if (!money(item[amountField], key + '[' + index + '].' + amountField, '支出額')) validExpenses = false;
      });
    });
    if (isObject(input.reserve)) {
      check(input.reserve.months, 'reserve.months', '生活費を残す月数', 0, 24);
      money(input.reserve.extraCash, 'reserve.extraCash', '追加で残す現金');
      check(input.reserve.lookaheadYears, 'reserve.lookaheadYears', '臨時支出を確保する年数', 0, 10);
      money(input.reserve.monthlyBase, 'reserve.monthlyBase', '防衛資金の基準月額', false, true);
    }
    if (isObject(input.plan)) {
      money(input.plan.monthlyInvestment, 'plan.monthlyInvestment', '希望する月の積立額');
      money(input.plan.initialInvestment, 'plan.initialInvestment', '初回振替の希望額');
      check(input.plan.annualReturn, 'plan.annualReturn', '仮定の年率', -20, 20, { step: 0.1 });
      check(input.plan.inflation, 'plan.inflation', '現在価値表示のためのインフレ率', 0, 10);
      var shockAgeValid = check(input.plan.shockAge, 'plan.shockAge', '一度の下落を置く年齢', 18, 99, { integer: true });
      if (shockAgeValid && agesValid && (input.plan.shockAge < profile.currentAge || input.plan.shockAge >= profile.endAge)) {
        error('plan.shockAge', 'age_bounds', '下落を置く年齢は開始年齢以上、終了年齢未満にしてください。');
      }
      check(input.plan.shockPercent, 'plan.shockPercent', '一度の下落率', 0, 80);
    }

    var checkedPeriods = [];
    var checkedReservePeriods = [];
    var validPeriodExpenses = Array.isArray(input.periods);
    if (Array.isArray(input.periods)) {
      if (input.periods.length > 12) error('periods', 'max_items', '期間は12件以内にしてください。');
      input.periods.forEach(function (period, index) {
        var prefix = 'periods[' + index + ']';
        if (!isObject(period)) { validPeriodExpenses = false; return; }
        var startOk = check(period.startAge, prefix + '.startAge', '期間の開始年齢', 18, 99, { integer: true });
        var endOk = check(period.endAge, prefix + '.endAge', '期間の終了年齢', 19, 100, { integer: true });
        var periodValid = startOk && endOk && period.endAge > period.startAge;
        if (startOk && endOk && period.endAge <= period.startAge) {
          error(prefix + '.endAge', 'age_order', '期間の終了年齢は開始年齢より大きくしてください。');
        }
        if (periodValid && agesValid && (period.startAge < profile.currentAge || period.endAge > profile.endAge)) {
          periodValid = false;
          error(prefix, 'age_bounds', '期間は試算の開始年齢から終了年齢の間に収めてください。');
        }
        var incomeOk = money(period.monthlyIncome, prefix + '.monthlyIncome', '期間中の賞与込み月平均手取り', false, true);
        var expenseOk = money(period.expenseDelta, prefix + '.expenseDelta', '月の支出増減', true);
        money(period.investmentCap, prefix + '.investmentCap', '期間中の月の積立上限', false, true);
        var reserveOk = money(period.reserveBase, prefix + '.reserveBase', '期間中の防衛資金の基準月額', false, true);
        if (!periodValid || !expenseOk) validPeriodExpenses = false;
        if (periodValid && incomeOk && period.monthlyIncome !== null) checkedPeriods.push({ value: period, index: index });
        if (periodValid && reserveOk && period.reserveBase !== null) checkedReservePeriods.push({ value: period, index: index });
      });
    }
    checkedPeriods.forEach(function (left, index) {
      checkedPeriods.slice(index + 1).forEach(function (right) {
        var start = Math.max(left.value.startAge, right.value.startAge);
        var end = Math.min(left.value.endAge, right.value.endAge);
        if (start < end) error('periods[' + right.index + '].monthlyIncome', 'income_overlap',
          '同じ期間に2つの収入上書きを設定できません。', {
            relatedField: 'periods[' + left.index + '].monthlyIncome', startAge: start, endAge: end
          });
      });
    });
    checkedReservePeriods.forEach(function (left, index) {
      checkedReservePeriods.slice(index + 1).forEach(function (right) {
        var start = Math.max(left.value.startAge, right.value.startAge);
        var end = Math.min(left.value.endAge, right.value.endAge);
        if (start < end) error('periods[' + right.index + '].reserveBase', 'reserve_overlap',
          '同じ期間に2つの防衛資金基準額の上書きを設定できません。', {
            relatedField: 'periods[' + left.index + '].reserveBase', startAge: start, endAge: end
          });
      });
    });
    if (validExpenses) {
      var baseExpense = sum(input.expenses.map(function (item) { return item.monthly; })) +
        sum(input.annualExpenses.map(function (item) { return item.annual; })) / 12;
      if (!validNumber(baseExpense, 0, Number.MAX_SAFE_INTEGER)) error('expenses', 'aggregate_range', '月平均支出の合計が計算可能な範囲を超えています。');
      else if (agesValid && validPeriodExpenses) {
        var previousNegative = false;
        for (var age = profile.currentAge; age < profile.endAge; age++) {
          var atAge = financialZero(baseExpense + sum(input.periods.filter(function (period) {
            return period.startAge <= age && age < period.endAge;
          }).map(function (period) { return period.expenseDelta; })));
          if (atAge < 0 && !previousNegative) error('periods', 'negative_expenses',
            age + '歳の月支出が、支出増減の合算により負になります。', { age: age });
          if (!Number.isFinite(atAge) || atAge > Number.MAX_SAFE_INTEGER) error('periods', 'aggregate_range',
            age + '歳の月支出が計算可能な範囲を超えています。', { age: age });
          previousNegative = atAge < 0;
        }
      }
    }
    if (Array.isArray(input.oneOffs)) {
      if (input.oneOffs.length > 12) error('oneOffs', 'max_items', '臨時支出は12件以内にしてください。');
      input.oneOffs.forEach(function (item, index) {
        if (!isObject(item)) return;
        var prefix = 'oneOffs[' + index + ']';
        var ageOk = check(item.age, prefix + '.age', '臨時支出の年齢', 18, 99, { integer: true });
        if (ageOk && agesValid && (item.age < profile.currentAge || item.age >= profile.endAge)) {
          error(prefix + '.age', 'age_bounds', '臨時支出の年齢は開始年齢以上、終了年齢未満にしてください。');
        }
        money(item.amount, prefix + '.amount', '臨時支出額');
      });
    }
    return errors;
  }

  function validateInput(input) {
    return validateNormalized(normalizeInput(input));
  }

  function inputError(errors) {
    var error = new RangeError(errors.map(function (item) { return item.message; }).join(' '));
    error.name = 'PlannerInputError';
    error.errors = errors;
    return error;
  }

  function validatedInput(input) {
    var normalized = normalizeInput(input);
    var errors = validateNormalized(normalized);
    if (errors.length) throw inputError(errors);
    return normalized;
  }

  function simulateNormalized(input, withShock) {
    var profile = input.profile;
    var plan = input.plan;
    var months = (profile.endAge - profile.currentAge) * 12;
    var monthlyRate = Math.expm1(Math.log1p(plan.annualReturn / 100) / 12);
    var monthlyExpenses = sum(input.expenses.map(function (item) { return item.monthly; }));
    var annualExpenses = sum(input.annualExpenses.map(function (item) { return item.annual; }));
    var annualExpenseMonthly = annualExpenses / 12;
    var annualizedIncome = profile.monthlyIncome * 12 + profile.annualIncome;
    var annualizedExpenses = monthlyExpenses * 12 + annualExpenses;
    var baseline = {
      unit: 'JPY',
      income: profile.monthlyIncome + profile.annualIncome / 12,
      expenses: monthlyExpenses + annualExpenseMonthly,
      annualIncomeMonthly: profile.annualIncome / 12,
      annualExpenseMonthly: annualExpenseMonthly
    };
    // Subtract annual amounts before dividing: independently rounded monthly
    // averages can otherwise manufacture a deficit even for integer-yen inputs.
    baseline.surplus = financialZero((annualizedIncome - annualizedExpenses) / 12);
    var events = input.oneOffs.map(function (item) {
      return { month: (item.age - profile.currentAge) * 12, amount: item.amount };
    });
    function budgetAt(month) {
      var age = profile.currentAge + month / 12;
      var income = baseline.income;
      var annualizedPeriodIncome = annualizedIncome;
      var expenseDelta = 0;
      var reserveBase = input.reserve.monthlyBase;
      var cap = null;
      input.periods.forEach(function (period) {
        if (period.startAge <= age && age < period.endAge) {
          if (period.monthlyIncome !== null) {
            income = period.monthlyIncome;
            annualizedPeriodIncome = period.monthlyIncome * 12;
          }
          expenseDelta += period.expenseDelta;
          if (period.reserveBase !== null) reserveBase = period.reserveBase;
          if (period.investmentCap !== null) cap = cap === null ? period.investmentCap : Math.min(cap, period.investmentCap);
        }
      });
      var expenses = financialZero(baseline.expenses + expenseDelta);
      var annualizedPeriodExpenses = annualizedExpenses + expenseDelta * 12;
      return {
        income: income, expenses: expenses,
        surplus: financialZero((annualizedPeriodIncome - annualizedPeriodExpenses) / 12),
        investmentCap: cap, reserveBase: reserveBase === null ? expenses : reserveBase
      };
    }
    function protectedAt(month, budget) {
      var horizon = month + input.reserve.lookaheadYears * 12;
      var futureOneOffs = sum(events.filter(function (event) {
        return event.month >= month && event.month <= horizon;
      }).map(function (event) { return event.amount; }));
      return budget.reserveBase * input.reserve.months + input.reserve.extraCash + futureOneOffs;
    }
    function presentValue(total, elapsedMonths) {
      return total / Math.pow(1 + plan.inflation / 100, elapsedMonths / 12);
    }
    var startingBudget = budgetAt(0);
    var startingProtected = protectedAt(0, startingBudget);
    var actualInitial = Math.min(plan.initialInvestment, Math.max(0, financialZero(
      profile.cash - startingProtected, Math.max(profile.cash, startingProtected)
    )));
    var cash = profile.cash - actualInitial;
    var cashCompensation = 0;
    var investments = profile.investments + actualInitial;
    function changeCash(amount) {
      // Kahan summation carries forward the rounding lost by each cash update.
      // The zero tolerance remains unchanged; zeroing also clears its carry.
      var correctedAmount = amount - cashCompensation;
      var nextCash = cash + correctedAmount;
      var nextCompensation = (nextCash - cash) - correctedAmount;
      cash = financialZero(nextCash, Math.max(profile.cash, Math.abs(cash), Math.abs(amount)));
      cashCompensation = cash === 0 ? 0 : nextCompensation;
    }
    var totals = {
      unit: 'JPY', income: 0, expenses: 0, oneOffs: 0,
      initialInvestment: actualInitial, monthlyContributions: 0, contributions: actualInitial,
      withdrawals: 0, investmentGain: 0, regularReturnGain: 0, shockLoss: 0
    };
    var initial = {
      kind: 'start', unit: 'JPY', age: profile.currentAge, elapsedMonths: 0,
      income: 0, expenses: 0, oneOff: 0, contribution: 0, withdrawal: 0,
      openingWithdrawal: 0, closingWithdrawal: 0,
      initialInvestment: actualInitial, totalContribution: actualInitial,
      investmentGain: 0, regularReturnGain: 0, shockLoss: 0,
      openingShortfall: 0, shortfall: 0, maxShortfall: 0,
      cash: cash, investments: investments, total: cash + investments,
      protectedCash: startingProtected, reserveBase: startingBudget.reserveBase, presentValue: cash + investments,
      cumulativeContributions: actualInitial, cumulativeWithdrawals: 0, cumulativeInvestmentGain: 0
    };
    var monthlyRows = [];
    var annualRows = [initial];
    var maxShortfall = 0;
    var firstShortfall = null;
    var shockMonth = (plan.shockAge - profile.currentAge) * 12;
    function recordShortfall(amount, month, timing) {
      maxShortfall = Math.max(maxShortfall, amount);
      if (amount > 0 && firstShortfall === null) {
        firstShortfall = {
          unit: 'JPY', month: month, age: profile.currentAge + Math.floor(month / 12),
          monthInYear: month % 12, elapsedMonths: month + (timing === 'closing' ? 1 : 0),
          timing: timing, amount: amount
        };
      }
    }
    for (var month = 0; month < months; month++) {
      var budget = budgetAt(month);
      var oneOff = sum(events.filter(function (event) { return event.month === month; }).map(function (event) { return event.amount; }));
      var shockApplied = withShock && month === shockMonth;
      // A shock and the year's opening payment precede that month's return.
      // This prevents paying an opening bill using a return earned later.
      var shockLoss = shockApplied ? investments * plan.shockPercent / 100 : 0;
      investments -= shockLoss;
      changeCash(-oneOff);
      var openingWithdrawal = cash < 0 ? Math.min(-cash, investments) : 0;
      changeCash(openingWithdrawal);
      investments -= openingWithdrawal;
      var openingShortfall = Math.max(0, -cash);
      recordShortfall(openingShortfall, month, 'opening');
      var regularReturnGain = investments * monthlyRate;
      investments += regularReturnGain;
      var investmentGain = regularReturnGain - shockLoss;
      changeCash(budget.surplus);
      var closingWithdrawal = cash < 0 ? Math.min(-cash, investments) : 0;
      changeCash(closingWithdrawal);
      investments -= closingWithdrawal;
      var withdrawal = openingWithdrawal + closingWithdrawal;
      var nextBudget = budgetAt(month + 1);
      var protectedCash = protectedAt(month + 1, nextBudget);
      var contribution = withdrawal > 0 ? 0 : Math.min(
        plan.monthlyInvestment,
        budget.investmentCap === null ? Infinity : budget.investmentCap,
        Math.max(0, budget.surplus),
        Math.max(0, financialZero(cash - protectedCash, Math.max(profile.cash, Math.abs(cash), protectedCash)))
      );
      changeCash(-contribution);
      investments += contribution;
      var shortfall = Math.max(0, -cash);
      recordShortfall(shortfall, month, 'closing');
      totals.income += budget.income;
      totals.expenses += budget.expenses;
      totals.oneOffs += oneOff;
      totals.monthlyContributions += contribution;
      totals.contributions += contribution;
      totals.withdrawals += withdrawal;
      totals.regularReturnGain += regularReturnGain;
      totals.shockLoss += shockLoss;
      totals.investmentGain += investmentGain;
      var row = {
        kind: 'month', unit: 'JPY', month: month, elapsedMonths: month + 1,
        age: profile.currentAge + Math.floor(month / 12), monthInYear: month % 12,
        ageAtEnd: profile.currentAge + (month + 1) / 12,
        income: budget.income, expenses: budget.expenses, oneOff: oneOff,
        surplus: budget.surplus, investmentCap: budget.investmentCap,
        contribution: contribution, withdrawal: withdrawal,
        openingWithdrawal: openingWithdrawal, closingWithdrawal: closingWithdrawal,
        initialInvestment: 0, totalContribution: contribution,
        investmentGain: investmentGain, regularReturnGain: regularReturnGain,
        shockApplied: shockApplied, shockLoss: shockLoss,
        cash: cash, investments: investments, total: cash + investments,
        protectedCash: protectedCash, reserveBase: nextBudget.reserveBase,
        openingShortfall: openingShortfall, shortfall: shortfall,
        maxShortfall: Math.max(openingShortfall, shortfall),
        presentValue: presentValue(cash + investments, month + 1),
        cumulativeContributions: totals.contributions,
        cumulativeWithdrawals: totals.withdrawals,
        cumulativeInvestmentGain: totals.investmentGain,
        contributionPaused: budget.investmentCap === 0
      };
      monthlyRows.push(row);
      if ((month + 1) % 12 === 0) {
        var yearRows = monthlyRows.slice(month - 11, month + 1);
        var annual = {
          kind: 'year', unit: 'JPY', age: row.ageAtEnd,
          startAge: row.age, endAge: row.ageAtEnd, elapsedMonths: month + 1,
          cash: cash, investments: investments, total: cash + investments,
          protectedCash: protectedCash, reserveBase: row.reserveBase,
          shortfall: shortfall, presentValue: row.presentValue,
          initialInvestment: month === 11 ? actualInitial : 0,
          cumulativeContributions: totals.contributions,
          cumulativeWithdrawals: totals.withdrawals,
          cumulativeInvestmentGain: totals.investmentGain,
          maxShortfall: Math.max.apply(null, yearRows.map(function (item) { return item.maxShortfall; })),
          openingShortfall: Math.max.apply(null, yearRows.map(function (item) { return item.openingShortfall; }))
        };
        ['income', 'expenses', 'oneOff', 'contribution', 'withdrawal', 'openingWithdrawal', 'closingWithdrawal',
          'investmentGain', 'regularReturnGain', 'shockLoss'].forEach(function (field) {
          annual[field] = sum(yearRows.map(function (item) { return item[field]; }));
        });
        annual.totalContribution = annual.contribution + annual.initialInvestment;
        annualRows.push(annual);
      }
    }
    var pauseIntervals = [];
    for (var periodAge = profile.currentAge; periodAge < profile.endAge; periodAge++) {
      var activePauses = input.periods.filter(function (period) {
        return period.investmentCap === 0 && period.startAge <= periodAge && periodAge < period.endAge;
      });
      if (activePauses.length) {
        var interval = pauseIntervals[pauseIntervals.length - 1];
        if (!interval || interval.endAge !== periodAge) {
          interval = { startAge: periodAge, endAge: periodAge + 1, periodIds: [], labels: [] };
          pauseIntervals.push(interval);
        } else interval.endAge = periodAge + 1;
        activePauses.forEach(function (period) {
          if (period.id !== undefined && interval.periodIds.indexOf(period.id) < 0) interval.periodIds.push(period.id);
          if (period.label && interval.labels.indexOf(period.label) < 0) interval.labels.push(period.label);
        });
      }
    }
    var last = monthlyRows[monthlyRows.length - 1];
    return {
      version: VERSION, unit: 'JPY', input: input,
      assumptions: {
        annualReturnPercent: plan.annualReturn, monthlyReturnRate: monthlyRate,
        inflationPercent: plan.inflation, inflationOnlyAffectsPresentValue: true,
        monetaryZeroTolerance: MONEY_EPSILON,
        cashZeroRelativeFactor: CASH_EPSILON_FACTOR,
        shockEnabled: withShock, shockAge: plan.shockAge, shockPercent: plan.shockPercent,
        lookaheadBoundary: 'inclusive', monthlyContributionTiming: 'end',
        monthOrder: ['shock', 'oneOffAndOpeningWithdrawal', 'return', 'incomeAndExpenses', 'closingWithdrawal', 'contribution'],
        exclusions: ['investmentTaxes', 'investmentFees', 'nisaLimits', 'realEstateValue', 'outstandingDebt']
      },
      baseline: baseline, initial: initial, months: months,
      actualInitial: actualInitial, monthlyRows: monthlyRows, annualRows: annualRows,
      final: {
        unit: 'JPY', age: profile.endAge, cash: cash, investments: investments, total: cash + investments,
        protectedCash: last.protectedCash, reserveBase: last.reserveBase,
        shortfall: last.shortfall, presentValue: last.presentValue
      },
      totals: totals, maxShortfall: maxShortfall, firstShortfall: firstShortfall, pauseIntervals: pauseIntervals
    };
  }

  function simulate(input, options) {
    if (options !== undefined && (!isObject(options) || (options.shock !== undefined && typeof options.shock !== 'boolean'))) {
      throw inputError([{ field: 'options.shock', code: 'type', message: 'shockはtrueまたはfalseで指定してください。' }]);
    }
    return simulateNormalized(validatedInput(input), !!(options && options.shock));
  }

  function compare(input) {
    var normalized = validatedInput(input);
    var zeroInput = normalizeInput(normalized);
    zeroInput.plan.annualReturn = 0;
    return {
      unit: 'JPY',
      assumed: simulateNormalized(normalized, false),
      zeroReturn: simulateNormalized(zeroInput, false),
      shock: simulateNormalized(normalized, true)
    };
  }

  // Fictional numbers for an explicit "load example" action only. These are
  // neither the user's finances nor recommended reserves or expected returns.
  function exampleInput() {
    return {
      example: { fictional: true, label: '架空の入力例（本人の家計・推奨値ではありません）' },
      profile: { currentAge: 35, endAge: 65, monthlyIncome: 320000, annualIncome: 600000, cash: 2000000, investments: 0 },
      expenses: [
        { id: 'housing', label: '住居', monthly: 80000 },
        { id: 'utilities', label: '水道・光熱・通信', monthly: 25000 },
        { id: 'food', label: '食費', monthly: 55000 },
        { id: 'daily', label: '日用品', monthly: 15000 },
        { id: 'transport', label: '交通', monthly: 12000 },
        { id: 'insurance', label: '保険', monthly: 8000 },
        { id: 'leisure', label: '娯楽', monthly: 20000 },
        { id: 'other', label: 'その他', monthly: 15000 }
      ],
      annualExpenses: [{ id: 'travel', label: '旅行', annual: 80000 }, { id: 'annual-other', label: '年払い費用', annual: 40000 }],
      reserve: { months: 6, extraCash: 0, lookaheadYears: 3 },
      plan: { monthlyInvestment: 50000, initialInvestment: 0, annualReturn: 3, inflation: 2, shockAge: 50, shockPercent: 30 },
      periods: [
        { id: 'pause', label: '支出が増えて積立を休む例', startAge: 40, endAge: 43, monthlyIncome: null, expenseDelta: 50000, investmentCap: 0 },
        { id: 'later-income', label: '収入が変わる例', startAge: 60, endAge: 65, monthlyIncome: 180000, expenseDelta: -30000, investmentCap: null }
      ],
      oneOffs: [
        { id: 'repair', label: '修繕費の例', age: 45, amount: 1000000 }
      ]
    };
  }

  return {
    version: VERSION, normalizeInput: normalizeInput, validateInput: validateInput,
    simulate: simulate, compare: compare, exampleInput: exampleInput
  };
}));
