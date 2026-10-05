(function () {
  'use strict';
  // 動画で見る：いつの制度か・だれ向けかで短い動画を絞りこみ、ページの中で再生する
  var dataEl = document.getElementById('video-data');
  var grid = document.getElementById('v-grid');
  if (!dataEl || !grid) return;
  var V = JSON.parse(dataEl.textContent);
  var byId = {};
  V.clips.forEach(function (c) { byId[c.id] = c; });
  V.full.forEach(function (f) { byId[f.id] = f; });

  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* 保存が使えなくても動く */ }
    return null;
  }
  function clock(sec) {
    sec = Math.round(sec);
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  function total(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m ? m + '分' + (s ? s + '秒' : '') : s + '秒';
  }

  var groupBtns = all('#v-groups [data-group]');
  var whoBtns = all('#v-who [data-who]');
  var gridGeneral = $('v-grid-general');
  var headDirect = $('v-head-direct');
  var headGeneral = $('v-head-general');
  var countEl = $('v-count');
  var emptyEl = $('v-empty');
  var playAll = $('v-play-all');
  var cards = all('.vcard', grid);

  var PICK = 'seido-guide:video-pick';
  var state = { group: 'fy2026', who: 'any' };
  var saved = store(PICK);
  if (saved && V.groupLabel[saved.group] && (saved.who === 'any' || V.tagLabel[saved.who])) state = saved;

  var shown = [];
  function apply(save) {
    var direct = [], general = [];
    cards.forEach(function (li) {
      var c = byId[li.dataset.id];
      var inGroup = state.group === 'all' || c.group === state.group;
      var isDirect = state.who === 'any' || c.who.indexOf(state.who) >= 0;
      var isGeneral = !isDirect && c.who.indexOf('all') >= 0;
      var show = inGroup && (isDirect || isGeneral);
      li.hidden = !show;
      all('.vtag', li).forEach(function (t) {
        var hit = state.who !== 'any' && (t.dataset.tag === state.who || (isGeneral && t.dataset.tag === 'all'));
        t.classList.toggle('is-hit', hit);
      });
      if (show) (isDirect ? direct : general).push(li);
    });
    // 選んだ人向けを先に、ほとんどの人向けをあとに並べる（元の順番はくずさない）
    direct.forEach(function (li) { grid.appendChild(li); });
    general.forEach(function (li) { gridGeneral.appendChild(li); });
    cards.forEach(function (li) { if (li.hidden) grid.appendChild(li); });
    shown = direct.concat(general).map(function (li) { return byId[li.dataset.id]; });

    var whoName = state.who === 'any' ? '' : V.tagLabel[state.who];
    headDirect.hidden = !whoName || !direct.length;
    headDirect.textContent = whoName + '向けの動画';
    headGeneral.hidden = !general.length;
    gridGeneral.hidden = !general.length;
    grid.hidden = !direct.length;

    var sec = shown.reduce(function (s, c) { return s + c.dur; }, 0);
    var where = V.groupLabel[state.group];
    countEl.textContent = where + (whoName ? '・' + whoName + '向け' : '') + '：';
    countEl.appendChild(el('span', 'nb', shown.length + '本' + (shown.length ? '（合計' + total(sec) + '）' : '')));
    playAll.disabled = !shown.length;

    emptyEl.hidden = shown.length > 0;
    if (!shown.length) renderEmpty(whoName);

    groupBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.group === state.group)); });
    whoBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.who === state.who)); });
    if (save) store(PICK, state);
  }

  // 当てはまる動画がないときは、ほかの時期の本数を出して切りかえられるようにする
  function renderEmpty(whoName) {
    var msg = $('v-empty-msg'), acts = $('v-empty-actions');
    acts.textContent = '';
    msg.textContent = '「' + V.groupLabel[state.group] + '」に、' + whoName + '向けの動画はまだありません。';
    V.groups.forEach(function (g) {
      if (g.key === state.group) return;
      var n = V.clips.filter(function (c) {
        return c.group === g.key && (c.who.indexOf(state.who) >= 0 || c.who.indexOf('all') >= 0);
      }).length;
      if (!n) return;
      var b = el('button', null, '「' + g.label + '」で見る（' + n + '本）');
      b.type = 'button';
      b.addEventListener('click', function () { state.group = g.key; apply(true); });
      acts.appendChild(b);
    });
  }

  groupBtns.forEach(function (b) {
    b.addEventListener('click', function () { state.group = b.dataset.group; apply(true); });
  });
  whoBtns.forEach(function (b) {
    b.addEventListener('click', function () { state.who = b.dataset.who; apply(true); });
  });

  // ---- 再生する画面 ----
  var dlg = $('v-player'), video = $('vp-video');
  var list = [], cur = 0, opener = null;
  var autoBox = $('vp-auto');
  var autoSaved = store('seido-guide:video-auto');
  autoBox.checked = autoSaved !== false;
  autoBox.addEventListener('change', function () { store('seido-guide:video-auto', autoBox.checked); });

  function tagsEl(c, into) {
    into.textContent = '';
    c.who.forEach(function (t) {
      var s = el('span', 'vtag', V.tagLabel[t] || t);
      into.appendChild(s);
    });
    into.appendChild(document.createTextNode('向け'));
  }
  function fact(dl, label, text) {
    if (!text) return;
    dl.appendChild(el('dt', null, label));
    var dd = el('dd', null, text);
    dl.appendChild(dd);
    return dd;
  }

  function render() {
    var c = list[cur], full = !!c.chapters;
    $('vp-kicker').textContent = full ? c.no + '・通し（' + total(c.dur) + '）' : c.no + '・' + c.rankLabel + ' ／ ' + V.groupLabel[c.group];
    $('vp-title').textContent = c.title;
    var forEl = $('vp-for');
    forEl.hidden = full;
    if (!full) tagsEl(c, forEl);
    var dl = $('vp-facts');
    dl.textContent = '';
    if (!full) {
      var when = fact(dl, 'いつ', c.when);
      if (c.status === '法案') when.appendChild(el('span', 'vstatus', '法案（まだ決まっていない）'));
      fact(dl, 'ポイント', c.point);
      fact(dl, 'やること', c.todo);
    }
    dl.hidden = full;
    var ch = $('vp-chapters');
    ch.textContent = '';
    ch.hidden = !full;
    if (full) {
      c.chapters.forEach(function (p) {
        var li = el('li'), b = el('button');
        b.type = 'button';
        b.appendChild(el('time', null, clock(p.at)));
        b.appendChild(el('span', null, p.label));
        b.addEventListener('click', function () {
          video.currentTime = p.at;
          var pr = video.play(); if (pr && pr.catch) pr.catch(function () {});
        });
        li.appendChild(b);
        ch.appendChild(li);
      });
    }
    var link = $('vp-link');
    link.href = c.link[1];
    link.textContent = c.link[0];
    $('vp-pos').textContent = (cur + 1) + ' / ' + list.length + (full ? '本' : '本目');
    $('vp-prev').disabled = cur === 0;
    $('vp-next').disabled = cur === list.length - 1;
    $('vp-msg').textContent = '';
    dlg.querySelector('.vp-side').scrollTop = 0;
  }

  function load(i, play) {
    cur = i;
    var c = list[cur];
    video.poster = c.poster;
    video.src = c.video;
    render();
    if (play) {
      var pr = video.play();
      if (pr && pr.catch) pr.catch(function () { /* 自動で始まらないときは、再生ボタンを押してもらう */ });
    }
  }

  function openPlayer(items, i, from) {
    list = items;
    opener = from || null;
    document.documentElement.classList.add('v-open');
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    }
    load(i, true);
  }
  function closePlayer() {
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); onClose(); }
  }
  function onClose() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    document.documentElement.classList.remove('v-open');
    if (opener && document.contains(opener)) opener.focus();
  }
  dlg.addEventListener('close', onClose);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closePlayer(); });
  $('vp-close').addEventListener('click', closePlayer);
  $('vp-prev').addEventListener('click', function () { if (cur > 0) load(cur - 1, true); });
  $('vp-next').addEventListener('click', function () { if (cur < list.length - 1) load(cur + 1, true); });
  video.addEventListener('ended', function () {
    if (autoBox.checked && cur < list.length - 1) load(cur + 1, true);
  });
  video.addEventListener('error', function () {
    if (!video.getAttribute('src')) return;
    $('vp-msg').textContent = '動画を読みこめませんでした。通信のよい所で、もう一度お試しください。';
  });
  video.addEventListener('timeupdate', function () {
    var c = list[cur];
    if (!c || !c.chapters) return;
    var t = video.currentTime, at = 0;
    c.chapters.forEach(function (p, k) { if (t >= p.at - 0.05) at = k; });
    all('#vp-chapters button').forEach(function (b, k) { b.setAttribute('aria-current', String(k === at)); });
  });

  grid.parentNode.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-play]');
    if (!b) return;
    var i = shown.indexOf(byId[b.dataset.play]);
    if (i >= 0) openPlayer(shown, i, b);
  });
  playAll.addEventListener('click', function () {
    if (!shown.length) return;
    autoBox.checked = true;
    store('seido-guide:video-auto', true);
    openPlayer(shown, 0, playAll);
  });
  all('[data-full]').forEach(function (b) {
    b.addEventListener('click', function () {
      openPlayer(V.full, V.full.indexOf(byId[b.dataset.full]), b);
    });
  });

  apply(false);
}());
