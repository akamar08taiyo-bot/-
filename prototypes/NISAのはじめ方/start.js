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
    var href = b.applyUrl || b.officialUrl;
    var rel = b.applyUrl ? 'sponsored noopener' : 'noopener noreferrer';
    var nameLink = el('a', 'broker-name');  // 会社名を押しても、その会社のページが開く
    nameLink.href = href;
    nameLink.target = '_blank';
    nameLink.rel = rel;
    nameLink.appendChild(el('b', null, b.name));
    info.appendChild(nameLink);
    var point = [b.cardText ? b.cardText + 'でクレカ積立' : '', b.pointText].filter(Boolean).join('・');
    if (point) info.appendChild(el('span', null, point));
    if (b.video) {
      // 口座の作り方の動画（ショート動画作成で作ったもの）。動画ファイルなら、このページの中で再生する（video.js）
      var v = el('a', 'broker-video');
      v.href = b.video;
      var icon = el('span', 'video-icon', '▶ ');
      icon.setAttribute('aria-hidden', 'true');
      v.appendChild(icon);
      v.appendChild(document.createTextNode('口座の作り方を動画で見る'));
      if (b.videoLength) v.appendChild(el('span', 'video-len', '（' + b.videoLength + '）'));  // 長さは途中で改行しない
      if (window.OKANE_VIDEO) window.OKANE_VIDEO.bind(v, b.name + 'の口座の作り方', b.videoPoster);
      else { v.target = '_blank'; v.rel = 'noopener'; }
      info.appendChild(v);
    }
    var a = el('a', 'broker-apply', '申し込む');
    a.href = href;
    a.target = '_blank';
    a.rel = rel;
    a.setAttribute('aria-label', b.name + 'の申し込みページを開く（新しいタブ）' + (b.applyUrl ? '・PR' : ''));
    if (b.applyUrl) a.appendChild(el('span', 'pr-tag', 'PR'));
    [a, nameLink].forEach(function (link) {
      link.addEventListener('click', function () {
        // 「手順を見ながら申し込む」を開いたとき、この会社のチェックリストにする
        try { localStorage.setItem('okane-map:apply:pick', b.id); } catch (_) { /* 保存できなくても申し込みページは開く */ }
      });
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

  // ---- 特典2「動画で見る」：章を切り替えられる再生画面（動画の一覧は gift-videos.js、画面は video.js） ----
  var guide = window.OKANE_GUIDE_VIDEOS;
  Array.prototype.forEach.call(document.querySelectorAll('[data-guide-video]'), function (b) {
    if (!guide || !guide.chapters.length || !window.OKANE_VIDEO) { b.hidden = true; return; }
    b.addEventListener('click', function () { window.OKANE_VIDEO.openList(guide.chapters, 0, guide.title, b); });
  });

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
