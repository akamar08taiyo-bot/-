(function () {
  'use strict';
  var data = window.MARKET_DATA, container = document.getElementById('interactive-chart');
  if (!data || !container) return;
  var colors = ['#ca743a', '#143e35', '#527ba0', '#a56a9b', '#7d8f40', '#368778', '#777f86'];
  var controls = Array.from(document.querySelectorAll('input[name="series"]'));
  var slider = document.getElementById('chart-month');
  var ns = 'http://www.w3.org/2000/svg';
  var format = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function node(tag, attrs, text) {
    var element = document.createElementNS(ns, tag);
    Object.keys(attrs).forEach(function (key) { element.setAttribute(key, attrs[key]); });
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function render() {
    var selected = data.series.filter(function (series) { return controls.some(function (c) { return c.checked && c.value === series.ticker; }); });
    var index = Number(slider.value), count = data.series[0].monthly.length - 1;
    var date = data.series[0].monthly[index].date;
    var dateLabel = date.slice(0, 4) + '年' + Number(date.slice(5, 7)) + '月';
    document.getElementById('month-label').textContent = dateLabel;
    slider.setAttribute('aria-valuetext', dateLabel);
    document.getElementById('chart-empty').hidden = !!selected.length;
    container.hidden = !selected.length;
    var values = document.getElementById('month-values'); values.replaceChildren();
    selected.forEach(function (series) {
      var row = document.createElement('span'); row.className = 'month-value';
      var title = document.createElement('span'); title.textContent = series.ticker;
      var amount = document.createElement('b'); amount.textContent = format.format(series.monthly[index].value);
      row.append(title, amount); values.appendChild(row);
    });
    if (!selected.length) return;
    // Keep the same 0–2,000 scale when toggling to avoid exaggerating small changes.
    var compact = window.matchMedia('(max-width: 600px)').matches, width = compact ? 500 : 960, right = width - 27, span = right - 66;
    var svg = node('svg', { viewBox: '0 0 ' + width + ' 420', class: 'market-chart' + (compact ? ' compact' : ''), role: 'img', 'aria-labelledby': 'market-title market-desc' });
    svg.appendChild(node('title', { id: 'market-title' }, '2005年末〜2025年末の選定ETF比較。開始時点100。'));
    svg.appendChild(node('desc', { id: 'market-desc' }, '表示中：' + selected.map(function (s) { return s.ticker; }).join('、') + '。確認する月の数値を下に表示しています。'));
    for (var value = 0; value <= 2000; value += 500) {
      var y = 364 - value / 2000 * 320;
      svg.appendChild(node('line', { x1: 66, y1: y, x2: right, y2: y, stroke: '#d6dcd5' }));
      svg.appendChild(node('text', { x: 55, y: y + 5, 'text-anchor': 'end' }, value.toLocaleString('ja-JP')));
    }
    (compact ? [2005, 2015, 2025] : [2005, 2010, 2015, 2020, 2025]).forEach(function (year) { svg.appendChild(node('text', { x: 66 + (year - 2005) / 20 * span, y: 397, 'text-anchor': 'middle' }, year)); });
    var cursorX = 66 + index * span / count;
    svg.appendChild(node('line', { x1: cursorX, y1: 35, x2: cursorX, y2: 364, stroke: '#7a887e', 'stroke-width': 1, 'stroke-dasharray': '4 5' }));
    selected.forEach(function (series) {
      var color = colors[data.series.indexOf(series)];
      var points = series.monthly.map(function (point, i) { return (66 + i * span / count).toFixed(2) + ',' + (364 - point.value / 2000 * 320).toFixed(2); }).join(' ');
      var line = node('polyline', { points: points, fill: 'none', stroke: color, 'stroke-width': 2.6 });
      line.appendChild(node('title', {}, series.ticker)); svg.appendChild(line);
      svg.appendChild(node('circle', { cx: cursorX, cy: 364 - series.monthly[index].value / 2000 * 320, r: 4, fill: color, stroke: '#f7f5ef', 'stroke-width': 1.5 }));
    });
    container.replaceChildren(svg);
  }
  controls.forEach(function (control) { control.addEventListener('change', render); });
  slider.addEventListener('input', render);
  render();
  window.addEventListener('resize', render);
}());
