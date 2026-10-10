(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SavingsMath = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function validate(values) {
    var errors = [];
    function check(field, min, max, step, message) {
      var raw = values[field], n = Number(raw);
      if (raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(n) || n < min || n > max || Math.abs(n / step - Math.round(n / step)) > 1e-8) errors.push({ field: field, message: message });
    }
    check('monthly', 0, 1000000, 100, '毎月の積立額は、0〜1,000,000円の100円単位で入力してください。');
    check('years', 1, 50, 1, '期間は、1〜50年の整数で入力してください。');
    check('rate', -20, 20, 0.1, '仮定の年率は、−20〜20%の範囲で、小数第1位まで入力してください。');
    return errors;
  }
  function calculate(values) {
    var errors = validate(values);
    if (errors.length) throw new RangeError(errors.map(function (e) { return e.message; }).join(' '));
    var monthly = Number(values.monthly), years = Number(values.years), rate = Number(values.rate);
    var monthlyRate = Math.expm1(Math.log1p(rate / 100) / 12);
    var balance = 0, points = [{ year: 0, principal: 0, balance: 0 }];
    for (var month = 1; month <= years * 12; month++) {
      balance = balance * (1 + monthlyRate) + monthly;
      if (month % 12 === 0) points.push({ year: month / 12, principal: month * monthly, balance: balance });
    }
    var principal = monthly * years * 12;
    return { monthly: monthly, years: years, rate: rate, monthlyRate: monthlyRate, principal: principal, balance: balance, gain: balance - principal, points: points };
  }
  return { validate: validate, calculate: calculate };
}));
