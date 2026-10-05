(function () {
  'use strict';
  var menu = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (menu && nav) {
    function closeMenu() { nav.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'メニューを開く'); }
    menu.addEventListener('click', function () {
      var open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      nav.classList.toggle('is-open', open);
    });
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
  }
  var search = document.getElementById('chapter-search');
  if (search) {
    var rows = Array.from(document.querySelectorAll('#chapter-toc li'));
    rows.forEach(function (row) {
      var chapter = document.querySelector(row.querySelector('a').getAttribute('href'));
      row.dataset.search += ' ' + (chapter ? chapter.textContent : '');
      if (chapter && chapter.id === 'chapter-08') row.dataset.search += ' 子ども こども 子供 教育費';
    });
    search.addEventListener('input', function () {
      var query = search.value.trim().toLocaleLowerCase('ja'); var count = 0;
      rows.forEach(function (row) { var match = row.dataset.search.toLocaleLowerCase('ja').includes(query); row.hidden = !match; if (match) count++; });
      document.getElementById('toc-status').textContent = count ? (query ? count + '章が見つかりました' : '全38章') : '該当する章がありません。別の言葉で検索してください。';
    });
    var details = document.querySelector('.toc-details');
    if (window.matchMedia('(max-width: 900px)').matches && details) details.open = false;
    document.querySelectorAll('.chapter-top').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        details.open = true;
        search.value = '';
        search.dispatchEvent(new Event('input'));
        history.pushState(null, '', '#book-contents');
        details.scrollIntoView({ block: 'start' });
        details.querySelector('summary').focus({ preventScroll: true });
      });
    });
    var resume = document.getElementById('resume-reading');
    try {
      var saved = localStorage.getItem('okane-map:last-chapter');
      if (/^chapter-(0[1-9]|[12][0-9]|3[0-8])$/.test(saved || '') && document.getElementById(saved)) { resume.href = '#' + saved; resume.hidden = false; }
    } catch (_) { /* Reading remains available when browser storage is disabled. */ }
    var links = Array.from(document.querySelectorAll('#chapter-toc a'));
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            links.forEach(function (a) { if (a.hash === '#' + entry.target.id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
            try { localStorage.setItem('okane-map:last-chapter', entry.target.id); } catch (_) {}
          }
        });
      }, { rootMargin: '-10% 0px -65% 0px' });
      document.querySelectorAll('.chapter').forEach(function (chapter) { observer.observe(chapter); });
    }
  }
}());
