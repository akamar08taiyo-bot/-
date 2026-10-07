/*
  口座の作り方の動画を、このページの中で再生する（入口の会社の欄・申し込みサポートで使う）。
  サイトに置いた動画ファイル（.mp4 など）のときは、押すとページの上に再生画面が開く。
  YouTube などの URL のときは、今までどおり新しいタブで開く。
*/
window.OKANE_VIDEO = (function () {
  'use strict';
  var FILE = /\.(mp4|webm|m4v)(\?|#|$)/i;
  var dlg = null, player = null, heading = null, opener = null;

  function isFile(src) { return FILE.test(src || ''); }

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
    dlg.appendChild(bar);
    dlg.appendChild(player);
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

  function open(src, title, poster, from) {
    if (!dlg) build();
    opener = from || null;
    heading.textContent = title;
    if (poster) player.setAttribute('poster', poster); else player.removeAttribute('poster');
    player.src = src;
    dlg.showModal();
    var started = player.play();
    if (started && started.catch) started.catch(function () { /* 自動で始まらないときは、再生ボタンを押してもらう */ });
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

  return { isFile: isFile, open: open, bind: bind };
}());
