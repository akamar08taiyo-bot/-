(function () {
  'use strict';
  // 開いたときは、いつもページのいちばん上から（読み込み直したときや戻ったときも、前に見ていた位置を戻さない）。#の付いたリンクで来たときは、その場所へ
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', function () { if (!location.hash) window.scrollTo(0, 0); });
  var cfg = window.OKANE_CHOOSER;
  if (!cfg) return;
  var active = cfg.brokers.filter(function (b) { return b.active; });
  var TOP = 3;  // はじめから見せるのは上から3社。残りは「ほかの◯社も見る」の中

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- おすすめの証券会社（broker-config.js の並び順）。「申し込む」で、その会社の申し込みページが開く ----
  function row(b) {
    var li = el('li', 'broker-row');
    var info = el('div', 'broker-info');
    info.appendChild(el('b', null, b.name));
    var point = [b.cardText ? b.cardText + 'でクレカ積立' : '', b.pointText].filter(Boolean).join('・');
    if (point) info.appendChild(el('span', null, point));
    if (b.video) {
      // 口座の作り方の動画（ショート動画作成で作ったもの）
      var v = el('a', 'broker-video');
      v.href = b.video;
      v.target = '_blank';
      v.rel = 'noopener';
      var icon = el('span', null, '▶ ');
      icon.setAttribute('aria-hidden', 'true');
      v.appendChild(icon);
      v.appendChild(document.createTextNode('口座の作り方を動画で見る' + (b.videoLength ? '（' + b.videoLength + '）' : '')));
      info.appendChild(v);
    }
    var a = el('a', 'broker-apply', '申し込む');
    a.href = b.applyUrl || b.officialUrl;
    a.target = '_blank';
    a.rel = b.applyUrl ? 'sponsored noopener' : 'noopener noreferrer';
    a.setAttribute('aria-label', b.name + 'の申し込みページを開く（新しいタブ）' + (b.applyUrl ? '・PR' : ''));
    if (b.applyUrl) a.appendChild(el('span', 'pr-tag', 'PR'));
    a.addEventListener('click', function () {
      // 「手順を見ながら申し込む」を開いたとき、この会社のチェックリストにする
      try { localStorage.setItem('okane-map:apply:pick', b.id); } catch (_) { /* 保存できなくても申し込みページは開く */ }
    });
    li.appendChild(info);
    li.appendChild(a);
    return li;
  }
  var list = document.getElementById('brokers');
  if (list) {
    active.slice(0, TOP).forEach(function (b) { list.appendChild(row(b)); });
    var rest = active.slice(TOP);
    var more = document.getElementById('more-brokers');
    if (more && rest.length) {
      var moreList = document.getElementById('brokers-more');
      rest.forEach(function (b) { moreList.appendChild(row(b)); });
      document.getElementById('more-count').textContent = String(rest.length);
      more.hidden = false;
    }
  }

  // 動画のある会社があれば、特典3の下に「口座の作り方の動画」（会社の一覧へ）
  var giftBroker = document.getElementById('gift-broker');
  if (giftBroker && active.some(function (b) { return b.video; })) {
    var alts = el('p', 'gift-alts');
    var go = el('a', 'gift-alt', '口座の作り方の動画（会社ごと）');
    go.href = '#open';
    alts.appendChild(go);
    giftBroker.appendChild(alts);
  }

  // ---- 「どの証券口座がおすすめかわからない場合」のタブ（中身の3つの質問は choose.js） ----
  var tab = document.getElementById('quiz-tab');
  function openTab(scroll) {
    if (!tab) return;
    tab.open = true;
    if (scroll) tab.scrollIntoView({ block: 'start', behavior: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#quiz-tab"]');
    if (!a) return;
    e.preventDefault();
    openTab(true);
  });
  if (location.hash === '#quiz-tab') openTab(false);

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
