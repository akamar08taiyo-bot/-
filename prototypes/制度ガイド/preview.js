(function () {
  'use strict';
  // プレビュー専用のファイルです。実際のサイトには入れません。
  var IN_PREVIEW = ['kaisei.html', 'shindan.html', 'kyufu.html'];
  var home = 'index.html';
  try { home = localStorage.getItem('seido-guide:home') || home; } catch (e) { /* 保存が使えなくても動く */ }
  var homePath = new URL(home, location.href).pathname;

  var back = document.createElement('a');
  back.className = 'preview-back';
  back.href = home;
  back.textContent = '← 一覧へ';
  back.setAttribute('aria-label', '3つのプレゼントの一覧へもどる');
  document.body.appendChild(back);

  var toast = document.createElement('p');
  toast.className = 'preview-toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  var timer;
  function say(msg) {
    toast.textContent = msg;
    clearTimeout(timer);
    timer = setTimeout(function () { toast.textContent = ''; }, 3500);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return; // 公式サイトなど、外のページはそのまま開く
    if (url.pathname === location.pathname && url.hash) return; // 同じページの中の移動
    var file = url.pathname.split('/').pop();
    if (url.pathname === homePath) return; // 「一覧へ」はそのまま開く
    if (file === '' || file === 'index.html') { e.preventDefault(); location.href = home; return; }
    if (IN_PREVIEW.indexOf(file) >= 0) return;
    e.preventDefault();
    say('このページはプレビューに入っていません。実際のサイトでは開きます。');
  });
}());
