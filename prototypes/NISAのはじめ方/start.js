(function () {
  'use strict';
  var cfg = window.OKANE_CHOOSER;
  var banner = document.getElementById('resume');
  if (!cfg || !banner) return;
  try {
    var id = localStorage.getItem('okane-map:apply:last');
    var broker = cfg.brokers.filter(function (b) { return b.active && b.id === id; })[0];
    if (!broker) return;
    var done = JSON.parse(localStorage.getItem('okane-map:apply:' + id) || '{}') || {};
    var n = Object.keys(done).length;
    if (!n || n >= 12) return;
    document.getElementById('resume-text').textContent = broker.name + 'の申し込み、' + n + ' / 12 まで進んでいます。';
    document.getElementById('resume-link').setAttribute('href', 'support.html?b=' + encodeURIComponent(id));
    banner.hidden = false;
  } catch (_) { /* 保存がなければ何も出さない */ }
}());
