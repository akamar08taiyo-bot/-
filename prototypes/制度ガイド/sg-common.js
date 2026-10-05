(function () {
  'use strict';
  // 3つのページで共通の部品（データは seido-data.js の window.SEIDO_DATA）
  var D = window.SEIDO_DATA || { items: [], benefits: [], who_tags: {} };

  var SRC = [
    [/nta\.go\.jp$/, '国税庁'], [/nenkin\.go\.jp$/, '日本年金機構'], [/mhlw\.go\.jp$/, '厚生労働省'],
    [/mof\.go\.jp$/, '財務省'], [/fsa\.go\.jp$/, '金融庁'], [/cfa\.go\.jp$/, 'こども家庭庁'],
    [/kyoukaikenpo\.or\.jp$/, '協会けんぽ'], [/nikkei\.com$/, '日本経済新聞'], [/jiji\.com$/, '時事通信'],
    [/tokyo-np\.co\.jp$/, '東京新聞'], [/news\.yahoo\.co\.jp$/, 'Yahoo!ニュース'], [/j-reform\.com$/, '住宅リフォーム推進協議会'],
    [/(^|\.)city\.|(^|\.)pref\.|(^|\.)town\./, '自治体のページ'], [/monex\.co\.jp$/, '証券会社の案内'], [/rakuten-sec\.co\.jp$/, '証券会社の案内'],
    [/resonabank\.co\.jp$/, '銀行の案内'], [/mixonline\.jp$/, 'ミクスOnline']
  ];
  function srcLabel(url) {
    var host = '';
    try { host = new URL(url).hostname; } catch (e) { return '出典'; }
    for (var i = 0; i < SRC.length; i++) if (SRC[i][0].test(host)) return SRC[i][1];
    return host.replace(/^www\./, '');
  }

  var STATUS = {
    '決定': ['is-kettei', '決定'],
    '法案': ['is-houan', '法案（まだ決まっていない）'],
    '検討中': ['is-kentou', '検討中']
  };
  function statusEl(status) {
    var s = STATUS[status] || STATUS['決定'];
    var el = document.createElement('span');
    el.className = 'status ' + s[0];
    el.textContent = s[1];
    return el;
  }

  function whenText(item) {
    var m = /^(\d{4})-(\d{2})$/.exec(item.start || '');
    if (!m) return item.start || '';
    var y = +m[1], mo = +m[2];
    var e = /^(\d{4})-(\d{2})$/.exec(item.end || '');
    if (e) return y + '年' + mo + '月〜' + (+e[1]) + '年' + (+e[2]) + '月';
    if (mo === 1 && /年分|2026年分/.test(item.amount || '') && y === 2026) return '2026年分から';
    if (item.id === 'shussan_mushou') return '遅くとも' + y + '年' + mo + '月まで';
    return y + '年' + mo + '月から';
  }

  // 「a+b」は両方、それ以外はどれか1つ
  function tagsOf(item) {
    var out = [];
    (item.who || []).forEach(function (alt) {
      alt.split('+').forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
    });
    return out;
  }
  function matches(item, set) {
    return (item.who || []).some(function (alt) {
      if (alt === 'all') return true;
      return alt.split('+').every(function (t) { return set.indexOf(t) >= 0; });
    });
  }
  var SHORT = { all: 'ほとんどの人', kaishain: '会社員', part: 'パート', jieigyo: '自営業', nenkin: '年金', kosodate: '子育て',
    gakusei_ko: '大学生などの子', kaigo: '介護', iryo: '通院・薬', ninshin: '妊娠・出産', shitsugyo: '仕事さがし', jutaku_reform: 'リフォーム', jutaku_buy: '家を買う', age60: '60〜64歳', age65: '65歳以上', koshotoku: '月収が高い人' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function factRow(dl, label, text, cls) {
    if (!text) return;
    var dt = el('dt', null, label), dd = el('dd', cls || null, text);
    dl.appendChild(dt); dl.appendChild(dd);
  }
  function sourcesEl(list) {
    var p = el('p', 'sg-src');
    p.appendChild(document.createTextNode('出典：'));
    (list || []).forEach(function (u) {
      var a = el('a', null, srcLabel(u));
      a.href = u; a.target = '_blank'; a.rel = 'noopener';
      p.appendChild(a);
    });
    return p;
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
    return null;
  }

  window.SG = { D: D, srcLabel: srcLabel, statusEl: statusEl, whenText: whenText, tagsOf: tagsOf, matches: matches,
    SHORT: SHORT, el: el, factRow: factRow, sourcesEl: sourcesEl, store: store };
}());
