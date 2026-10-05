(function () {
  'use strict';
  var SG = window.SG, D = SG.D, el = SG.el;
  var root = document.getElementById('kaisei-list');
  var filterEl = document.getElementById('who-filter');
  var countEl = document.getElementById('kaisei-count');
  if (!root || !filterEl) return;

  var FILTERS = [['all', 'すべて'], ['kaishain', '会社員'], ['part', 'パート'], ['jieigyo', '自営業'], ['nenkin', '年金'],
    ['kosodate', '子育て'], ['iryo', '通院・薬'], ['kaigo', '介護']];
  var GROUPS = [
    { key: 'g2026', label: '2026年中に始まったもの', sub: '年末の手続きで効いてくるものも' },
    { key: 'g202612', label: '2026年12月', sub: '年末調整と、iDeCoの掛金' },
    { key: 'g2027q1', label: '2027年1月〜3月', sub: '新しい税・こどもNISA・薬の負担' },
    { key: 'gfy2027', label: '2027年4月〜（2027年度）', sub: '消費税・医療費・社会保険' },
    { key: 'glater', label: 'その先（決まっていること）', sub: '' }
  ];
  function groupOf(item) {
    var m = /^(\d{4})-(\d{2})/.exec(item.start || '');
    if (!m) return 'gfy2027'; // 「2027年度（予定）」など
    var ym = (+m[1]) * 100 + (+m[2]);
    if (ym < 202612) return 'g2026';
    if (ym === 202612) return 'g202612';
    if (ym <= 202703) return 'g2027q1';
    if (ym <= 202803) return 'gfy2027';
    return 'glater';
  }
  function sortKey(item) {
    var m = /^(\d{4})-(\d{2})/.exec(item.start || '');
    return m ? (+m[1]) * 100 + (+m[2]) : 202799;
  }

  var items = D.items.filter(function (i) { return i.type === 'kaisei'; })
    .sort(function (a, b) { return sortKey(a) - sortKey(b); });

  function card(item) {
    var li = el('li', 'sg-card');
    li.dataset.tags = SG.tagsOf(item).join(' ');
    var head = el('div', 'sg-card-head');
    head.appendChild(el('h3', null, item.name));
    head.appendChild(SG.statusEl(item.status));
    li.appendChild(head);
    li.appendChild(el('p', 'sg-when', SG.whenText(item)));
    var tags = el('ul', 'who-tags');
    tags.setAttribute('aria-label', '関係する人');
    SG.tagsOf(item).forEach(function (t) { tags.appendChild(el('li', null, SG.SHORT[t] || t)); });
    li.appendChild(tags);
    var dl = el('dl', 'sg-facts');
    SG.factRow(dl, 'なにが', item.amount);
    SG.factRow(dl, 'やること', item.action);
    SG.factRow(dl, '損する点', item.loss, 'is-loss');
    li.appendChild(dl);
    if (item.video) li.appendChild(el('span', 'sg-video', '動画：' + item.video));
    li.appendChild(SG.sourcesEl(item.sources));
    return li;
  }

  var lists = {};
  GROUPS.forEach(function (g) {
    var band = el('div', 'month-band');
    band.id = g.key;
    band.appendChild(el('h2', null, g.label));
    if (g.sub) band.appendChild(el('p', null, g.sub));
    var ul = el('ul', 'sg-grid');
    lists[g.key] = { band: band, ul: ul };
    root.appendChild(band);
    root.appendChild(ul);
  });
  items.forEach(function (item) { lists[groupOf(item)].ul.appendChild(card(item)); });
  var empty = el('p', 'sg-empty', 'この条件に当てはまる改正は、いまのところ見つかりませんでした。「すべて」に戻して見てください。');
  empty.hidden = true;
  root.appendChild(empty);

  var current = 'all';
  function apply() {
    var shown = 0;
    GROUPS.forEach(function (g) {
      var n = 0;
      Array.prototype.forEach.call(lists[g.key].ul.children, function (li) {
        var tags = li.dataset.tags.split(' ');
        var ok = current === 'all' || tags.indexOf(current) >= 0 || tags.indexOf('all') >= 0;
        li.hidden = !ok;
        if (ok) n++;
      });
      lists[g.key].band.hidden = n === 0;
      lists[g.key].ul.hidden = n === 0;
      shown += n;
    });
    empty.hidden = shown > 0;
    countEl.textContent = (current === 'all' ? '全' : '当てはまる改正 ') + shown + '件';
    Array.prototype.forEach.call(filterEl.children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.tag === current)); });
    SG.store('seido-guide:kaisei-filter', current);
  }
  FILTERS.forEach(function (f) {
    var b = el('button', null, f[1]);
    b.type = 'button';
    b.dataset.tag = f[0];
    b.addEventListener('click', function () { current = f[0]; apply(); });
    filterEl.appendChild(b);
  });
  var saved = (location.hash || '').replace('#', '') || SG.store('seido-guide:kaisei-filter');
  if (FILTERS.some(function (f) { return f[0] === saved; })) current = saved;
  apply();
}());
