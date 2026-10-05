(function () {
  'use strict';
  var SG = window.SG, D = SG.D, el = SG.el;
  var tabsEl = document.getElementById('kyufu-tabs');
  var panelEl = document.getElementById('kyufu-panel');
  if (!tabsEl || !panelEl) return;

  var LEAD = {
    kosodate: '妊娠・出産から高校生まで。申請しないともらえないものが多いので、生まれたら・引っ越したら早めに。',
    iryo: '入院・通院・薬代の負担を軽くするしくみ。会社員かどうかで使えるものが変わります。',
    kaigo: '親の介護が始まったら。工事や購入の前に申請が要るものがあります。',
    work: '仕事を辞めた・60歳をこえた・働いている中低所得の人向け。',
    nenkin: '年金を受け取っている人向け。届いた書類を出すだけのものもあります。',
    jutaku: '家を買う・直すとき。市区町村ごとに違う補助は、探し方をのせています。'
  };
  var tabs = D.benefit_tabs || [];
  var current = (location.hash || '').replace('#', '');
  if (!tabs.some(function (t) { return t[0] === current; })) current = SG.store('seido-guide:kyufu-tab') || (tabs[0] && tabs[0][0]);

  function card(b) {
    var li = el('li', 'sg-card');
    var head = el('div', 'sg-card-head');
    head.appendChild(el('h3', null, b.name));
    head.appendChild(SG.statusEl(b.status || '決定'));
    li.appendChild(head);
    var tags = el('ul', 'who-tags');
    tags.setAttribute('aria-label', '関係する人');
    SG.tagsOf(b).forEach(function (t) { tags.appendChild(el('li', null, SG.SHORT[t] || t)); });
    li.appendChild(tags);
    var dl = el('dl', 'sg-facts');
    SG.factRow(dl, 'いくら', b.amount);
    SG.factRow(dl, 'やること', b.action);
    SG.factRow(dl, '窓口', b.where);
    SG.factRow(dl, '損する点', b.loss, 'is-loss');
    li.appendChild(dl);
    li.appendChild(SG.sourcesEl(b.sources));
    return li;
  }

  var buttons = [];
  tabs.forEach(function (t, i) {
    var n = D.benefits.filter(function (b) { return b.tab === t[0]; }).length;
    var b = el('button');
    b.type = 'button';
    b.id = 'tab-' + t[0];
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'kyufu-panel');
    b.appendChild(document.createTextNode(t[1]));
    b.appendChild(el('small', null, n + '件'));
    b.addEventListener('click', function () { show(t[0], true); });
    b.addEventListener('keydown', function (e) {
      var k = e.key, j = i;
      if (k === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') j = 0;
      else if (k === 'End') j = tabs.length - 1;
      else return;
      e.preventDefault();
      show(tabs[j][0], true);
      buttons[j].focus();
    });
    buttons.push(b);
    tabsEl.appendChild(b);
  });

  function show(key, user) {
    current = key;
    buttons.forEach(function (b) {
      var on = b.id === 'tab-' + key;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panelEl.setAttribute('aria-labelledby', 'tab-' + key);
    panelEl.innerHTML = '';
    if (LEAD[key]) panelEl.appendChild(el('p', 'panel-lead', LEAD[key]));
    var ul = el('ul', 'sg-grid');
    D.benefits.filter(function (b) { return b.tab === key; }).forEach(function (b) { ul.appendChild(card(b)); });
    panelEl.appendChild(ul);
    SG.store('seido-guide:kyufu-tab', key);
    if (user && history.replaceState) history.replaceState(null, '', '#' + key);
  }
  if (current) show(current, false);
}());
