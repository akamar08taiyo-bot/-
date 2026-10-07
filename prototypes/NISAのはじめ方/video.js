/*
  動画を、このページの中で再生する（入口・申し込みサポート・特典の一覧で使う。見た目は video.css）。
  ・open(動画, 題, 表紙, 押したボタン) … 1本だけ（口座の作り方の動画など）
  ・openList(章の一覧, 何番目から, 題, 押したボタン) … 章ごとの動画（特典2のガイドなど）。下の章ボタンで切り替え、
    1章が終わると次の章へ進む。章の src を配列にすると、分けて置いたファイルを順に続けて再生する（プレビュー用）
  ・bind(リンク, 題, 表紙) … 動画ファイルへのリンクを、押したらこの画面で開くようにする。YouTube などは新しいタブで開く
*/
window.OKANE_VIDEO = (function () {
  'use strict';
  var FILE = /\.(mp4|webm|m4v)(\?|#|$)/i;
  var dlg = null, player = null, heading = null, nav = null, opener = null;
  var list = [], cur = 0, part = 0;

  function isFile(src) { return FILE.test(src || ''); }
  function partsOf(item) { return [].concat(item.src); }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'video-dialog';
    dlg.setAttribute('aria-labelledby', 'video-dialog-title');
    var bar = document.createElement('div');
    bar.className = 'video-dialog-bar';
    heading = document.createElement('strong');
    heading.id = 'video-dialog-title';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'video-dialog-close';
    close.textContent = '閉じる';
    close.addEventListener('click', function () { dlg.close(); });
    bar.appendChild(heading);
    bar.appendChild(close);
    player = document.createElement('video');
    player.className = 'video-dialog-player';
    player.controls = true;
    player.setAttribute('playsinline', '');
    player.preload = 'metadata';
    nav = document.createElement('div');
    nav.className = 'video-dialog-chapters';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', '章をえらぶ');
    dlg.appendChild(bar);
    dlg.appendChild(player);
    dlg.appendChild(nav);
    // 終わったら、分けて置いた続きのファイル → 次の章 の順に進む
    player.addEventListener('ended', function () {
      if (part + 1 < partsOf(list[cur]).length) load(cur, part + 1);
      else if (cur + 1 < list.length) load(cur + 1, 0);
    });
    // 閉じたら止めて、読み込みもやめる（裏で音が鳴り続けないように）
    dlg.addEventListener('close', function () {
      player.pause();
      player.removeAttribute('src');
      player.load();
      if (opener) opener.focus();
    });
    // 再生画面の外（暗いところ）を押しても閉じる
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }

  function load(i, p) {
    cur = i;
    part = p;
    var item = list[i];
    if (item.poster && p === 0) player.setAttribute('poster', item.poster); else player.removeAttribute('poster');
    player.src = partsOf(item)[p];
    Array.prototype.forEach.call(nav.children, function (b, k) {
      if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var started = player.play();
    if (started && started.catch) started.catch(function () { /* 自動で始まらないときは、再生ボタンを押してもらう */ });
  }

  function openList(items, start, title, from) {
    if (!dlg) build();
    list = items;
    opener = from || null;
    heading.textContent = title;
    nav.textContent = '';
    nav.hidden = items.length < 2;
    dlg.classList.toggle('has-chapters', items.length > 1);
    items.forEach(function (item, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'video-dialog-chapter';
      var label = document.createElement('b');
      label.textContent = item.label || '';
      var name = document.createElement('span');
      name.textContent = item.name || '';
      b.appendChild(label);
      b.appendChild(name);
      b.addEventListener('click', function () { load(k, 0); });
      nav.appendChild(b);
    });
    dlg.showModal();
    load(start || 0, 0);
  }

  function open(src, title, poster, from) {
    openList([{ src: src, poster: poster }], 0, title, from);
  }

  // a は <a href="動画の場所">。動画ファイルなら、押したときにこのページの中で開く
  function bind(a, title, poster) {
    if (!isFile(a.getAttribute('href')) || typeof HTMLDialogElement !== 'function') {
      a.target = '_blank';
      a.rel = 'noopener';
      return a;
    }
    a.addEventListener('click', function (e) {
      e.preventDefault();
      open(a.getAttribute('href'), title, poster, a);
    });
    return a;
  }

  return { isFile: isFile, open: open, openList: openList, bind: bind };
}());
