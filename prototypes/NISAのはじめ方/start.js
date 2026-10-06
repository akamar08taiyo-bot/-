(function () {
  'use strict';
  // 開いたときは、いつもページのいちばん上から（読み込み直したときや戻ったときも、前に見ていた位置を戻さない）。#の付いたリンクで来たときは、その場所へ
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', function () { if (!location.hash) window.scrollTo(0, 0); });
  var cfg = window.OKANE_CHOOSER;
  if (!cfg) return;
  var active = cfg.brokers.filter(function (b) { return b.active; });

  // ---- よく使うカードで選ぶ：押すと、その証券会社の申し込みページが開く（会社は broker-config.js の並び順で、そのカードでクレカ積立ができる最初の会社） ----
  var picks = document.getElementById('picks');
  if (picks) {
    var last = picks.lastElementChild;  // 「持っていない・迷う」は、いちばん最後のまま
    cfg.cards.forEach(function (c) {
      if (c.id === 'none') return;
      var b = active.filter(function (x) { return x.cards.indexOf(c.id) >= 0; })[0];
      if (!b) return;
      var a = document.createElement('a');
      a.className = 'pick';
      a.href = b.applyUrl || b.officialUrl;
      a.target = '_blank';
      a.rel = b.applyUrl ? 'sponsored noopener' : 'noopener noreferrer';
      var card = document.createElement('span');
      card.className = 'pick-card';
      card.textContent = c.label.replace(/（.*）/, '');
      var name = document.createElement('b');
      name.className = 'pick-name';
      name.textContent = b.name;
      if (b.applyUrl) {
        var pr = document.createElement('span');
        pr.className = 'pr-tag';
        pr.textContent = 'PR';
        name.appendChild(pr);
      }
      a.appendChild(card);
      a.appendChild(name);
      a.addEventListener('click', function () {
        try { localStorage.setItem('okane-map:apply:pick', b.id); } catch (_) { /* 保存できなくても申し込みページは開く */ }
      });
      var li = document.createElement('li');
      li.appendChild(a);
      picks.insertBefore(li, last);
    });
  }

  // ---- 申し込みの途中なら、続きから ----
  var banner = document.getElementById('resume');
  if (!banner) return;
  try {
    var id = localStorage.getItem('okane-map:apply:last');
    var broker = active.filter(function (b) { return b.id === id; })[0];
    if (!broker) return;
    var done = JSON.parse(localStorage.getItem('okane-map:apply:' + id) || '{}') || {};
    var n = Object.keys(done).length;
    if (!n || n >= 12) return;
    document.getElementById('resume-text').textContent = broker.name + 'の申し込み、' + n + ' / 12 まで進んでいます。';
    document.getElementById('resume-link').setAttribute('href', 'support.html?b=' + encodeURIComponent(id));
    banner.hidden = false;
  } catch (_) { /* 保存がなければ何も出さない */ }
}());
