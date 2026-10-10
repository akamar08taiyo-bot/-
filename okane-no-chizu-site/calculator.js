(function () {
  'use strict';
  var form = document.getElementById('calculator-form');
  if (!form || !window.SavingsMath) return;
  var result = document.getElementById('calculator-result');
  var errorBox = document.getElementById('calculator-errors');
  var inputs = ['monthly', 'years', 'rate'].map(function (id) { return document.getElementById(id); });
  var yen = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
  var ns = 'http://www.w3.org/2000/svg';
  var lastData;
  function svgNode(tag, attrs, content) {
    var node = document.createElementNS(ns, tag);
    Object.keys(attrs).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function drawChart(data) {
    var compact = window.matchMedia('(max-width: 600px)').matches, width = compact ? 400 : 640, right = width - 20, span = right - 64;
    var svg = svgNode('svg', { viewBox: '0 0 ' + width + ' 280', role: 'img', 'aria-labelledby': 'savings-title', class: 'market-chart savings-chart' + (compact ? ' compact' : '') });
    svg.appendChild(svgNode('title', { id: 'savings-title' }, '積立元本と仮定の残高の推移。' + data.years + '年後、元本' + yen.format(data.principal) + '円、残高' + yen.format(data.balance) + '円。'));
    var max = Math.max(data.balance, data.principal, 10000) * 1.08;
    var unit = max >= 1e8 ? 1e8 : 1e4;
    for (var i = 0; i <= 4; i++) {
      var y = 242 - 205 * i / 4;
      svg.appendChild(svgNode('line', { x1: 64, y1: y, x2: right, y2: y, stroke: '#d6dcd5' }));
      svg.appendChild(svgNode('text', { x: 56, y: y + 5, 'text-anchor': 'end' }, (max * i / 4 / unit).toLocaleString('ja-JP', { maximumFractionDigits: 1 })));
    }
    svg.appendChild(svgNode('text', { x: 13, y: 20 }, unit === 1e8 ? '億円' : '万円'));
    [0, data.years / 2, data.years].forEach(function (year) { svg.appendChild(svgNode('text', { x: 64 + year / data.years * span, y: 266, 'text-anchor': 'middle' }, year + '年')); });
    [['principal', '#91a99a'], ['balance', '#143e35']].forEach(function (series) {
      var points = data.points.map(function (p) { return (64 + p.year / data.years * span).toFixed(2) + ',' + (242 - p[series[0]] / max * 205).toFixed(2); }).join(' ');
      var attrs = { points: points, fill: 'none', stroke: series[1], 'stroke-width': 3 };
      if (series[0] === 'principal') attrs['stroke-dasharray'] = '6 4';
      svg.appendChild(svgNode('polyline', attrs));
    });
    var legend = document.createElement('p'); legend.className = 'chart-legend'; legend.textContent = '実線：仮定の残高　／　点線：積立元本';
    document.getElementById('savings-chart').replaceChildren(svg, legend);
  }
  function render(focusError) {
    var values = {};
    inputs.forEach(function (input) { values[input.id] = input.value; input.removeAttribute('aria-invalid'); });
    var errors = window.SavingsMath.validate(values);
    errorBox.replaceChildren(); errorBox.hidden = !errors.length;
    result.hidden = !!errors.length;
    if (errors.length) {
      var ul = document.createElement('ul');
      errors.forEach(function (error) { var li = document.createElement('li'); li.textContent = error.message; ul.appendChild(li); document.getElementById(error.field).setAttribute('aria-invalid', 'true'); });
      errorBox.appendChild(ul);
      if (focusError) document.getElementById(errors[0].field).focus();
      return;
    }
    var data = window.SavingsMath.calculate(values);
    lastData = data;
    document.getElementById('result-heading').textContent = data.years + '年後の試算';
    var future = document.getElementById('future-value');
    future.textContent = yen.format(data.balance) + '円';
    future.classList.toggle('result-long', future.textContent.length > 13);
    document.getElementById('principal-value').textContent = yen.format(data.principal) + '円';
    document.getElementById('gain-value').textContent = (data.gain > 0 ? '+' : data.gain < 0 ? '−' : '') + yen.format(Math.abs(data.gain)) + '円';
    document.querySelector('.result-breakdown').classList.toggle('is-long', yen.format(Math.abs(data.gain)).length > 11);
    document.getElementById('result-summary').textContent = '毎月末' + yen.format(data.monthly) + '円 × ' + data.years + '年、仮定年率' + data.rate + '%。金額は1円単位に四捨五入しています。';
    var notes = [];
    if (data.monthly * 12 > 1200000) notes.push('年間の積立額が、成人NISAのつみたて投資枠120万円を超えています。');
    if (data.monthly * 12 > 3600000) notes.push('成人NISAの年間合計投資枠360万円も超えています。');
    if (data.principal > 18000000) notes.push('売却せず積み立てた元本が、成人NISAの非課税保有限度額1,800万円を超えています。');
    if (notes.length) notes.push('試算は枠外も含む一般的な計算です。成長投資枠の商品条件や1,200万円の内枠、制度上の枠再利用は計算に反映していません。');
    var note = document.getElementById('nisa-limit-note'); note.textContent = notes.join(' '); note.hidden = !notes.length;
    drawChart(data);
  }
  form.addEventListener('submit', function (event) { event.preventDefault(); render(true); });
  inputs.forEach(function (input) { input.addEventListener('input', function () { result.hidden = true; errorBox.hidden = true; input.removeAttribute('aria-invalid'); }); });
  document.querySelectorAll('[data-rate]').forEach(function (button) {
    button.addEventListener('click', function () { document.getElementById('rate').value = button.dataset.rate; render(true); });
  });
  render(false);
  window.addEventListener('resize', function () { if (lastData) drawChart(lastData); });
}());
