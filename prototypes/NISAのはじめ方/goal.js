(function () {
  'use strict';
  // 資産推移アプリ：目標の金額 → 毎月の積立額 → 期間のつまみ で、元本と増えた分の推移をその場でグラフにする
  var root = document.getElementById('sim');
  if (!root) return;

  var MAX_YEARS = 40;
  var THUMB = 28;        // 期間のつまみの幅（start.css の .sim-period と同じ）
  var EDGE = 8;          // グラフの左の余白
  var COLOR = { principal: '#2a7aa8', gain: '#ca743a', ink: '#143e35', grid: '#e2e5de', surface: '#fcfbf8' };
  var TAX = 0.20315;     // ふつうの口座で、売って利益が出たときの税金（所得税・復興特別所得税・住民税）
  var SVG = 'http://www.w3.org/2000/svg';

  // ---- 計算（単位はすべて「万円」） ----
  function grow(p0, pmt, months, rate) {
    var i = rate / 100 / 12;
    if (i === 0) return p0 + pmt * months;
    var g = Math.pow(1 + i, months);
    return p0 * g + pmt * (g - 1) / i;
  }
  function monthlyFor(target, p0, months, rate) {
    var i = rate / 100 / 12;
    var g = i === 0 ? 1 : Math.pow(1 + i, months);
    var rest = target - p0 * g;
    if (rest <= 0) return 0;
    return i === 0 ? rest / months : rest * i / (g - 1);
  }
  function monthsToReach(target, p0, pmt, rate) {
    if (p0 >= target) return 0;
    var i = rate / 100 / 12, v = p0;
    for (var m = 1; m <= 1200; m++) { v = v * (1 + i) + pmt; if (v >= target - 1e-9) return m; }
    return null;
  }

  // ---- 表示のための書き方 ----
  function man(x) {
    var v = Math.round(x);
    if (v === 0) return '0円';
    if (v >= 10000) {
      var oku = Math.floor(v / 10000), rest = v % 10000;
      return oku + '億' + (rest ? rest.toLocaleString('ja-JP') + '万' : '') + '円';
    }
    return v.toLocaleString('ja-JP') + '万円';
  }
  function manShort(x) { // 目盛り用（「万円」の「円」を省く）
    if (x >= 10000) return (x / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '億';
    return Math.round(x).toLocaleString('ja-JP') + '万';
  }
  function monthly(x) {
    if (x <= 0) return '0円';
    if (x < 1) return (Math.round(x * 100) * 100).toLocaleString('ja-JP') + '円';
    var v = x < 10 ? Math.round(x * 10) / 10 : Math.round(x);
    return v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '万円';
  }
  function span(months) {
    var y = Math.floor(months / 12), m = months % 12;
    return (y ? y + '年' : '') + (m ? m + 'か月' : '') || '0か月';
  }
  function ageAt(age, years) { return age === null ? '' : '（' + Math.floor(age + years) + '歳' + (years % 1 ? 'ごろ' : '') + '）'; }

  function $(id) { return document.getElementById(id); }
  // 全角の数字やカンマ・「万円」が入っても読めるようにする
  function readNum(el) {
    var t = String(el.value).replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,，\s]|万円|万|円|歳|%|％|か月/g, '');
    if (t === '') return NaN;
    return Number(t);
  }
  function check(el, ok) { el.setAttribute('aria-invalid', String(!ok)); return ok; }
  function setText(id, text) { var el = $(id); if (el) el.textContent = text; }
  function el(tag, attrs, text) {
    var e = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  // ---- 入力 ----
  var inputs = { target: $('s-target'), monthly: $('s-monthly'), now: $('s-now'), age: $('s-age'), rate: $('s-rate') };
  var slider = $('s-years'), out = $('s-years-out');
  var state = null;

  function read() {
    var target = readNum(inputs.target), pmt = readNum(inputs.monthly), now = readNum(inputs.now), rate = readNum(inputs.rate);
    var ageRaw = String(inputs.age.value).trim(), age = ageRaw === '' ? null : readNum(inputs.age);
    var errors = [];
    if (!check(inputs.target, target > 0 && target <= 100000)) errors.push('目標の金額は、1〜100,000万円の間で入れてください。');
    if (!check(inputs.monthly, pmt >= 0 && pmt <= 1000)) errors.push('毎月の積立額は、0〜1,000万円の間で入れてください。');
    if (!check(inputs.now, now >= 0 && now <= 100000)) errors.push('今ある資産は、0〜100,000万円の間で入れてください。');
    if (!check(inputs.rate, rate >= 0 && rate <= 15)) errors.push('増える割合は、0〜15%の間で入れてください。');
    if (!check(inputs.age, age === null || (age >= 0 && age <= 100 && age % 1 === 0))) errors.push('年齢は、0〜100の数字で入れてください（空でもかまいません）。');
    var err = $('s-error');
    err.textContent = errors.join(' ');
    err.hidden = !errors.length;
    if (errors.length) return null;
    return { target: target, pmt: pmt, now: now, rate: rate, age: age, years: Number(slider.value) };
  }

  // ---- グラフの形（つまみの中心と、グラフの年の位置をぴったりそろえる） ----
  var box = $('s-chart-box'), svg = $('s-chart'), tip = $('s-tip');
  var geo = null;
  function layout() {
    var W = Math.max(240, Math.round(box.clientWidth));
    var right = THUMB / 2;
    var step = (W - EDGE - right) / MAX_YEARS;          // 1年ぶんの横の長さ
    var left = EDGE;
    if (left + step < THUMB / 2) { step = (W - THUMB) / (MAX_YEARS - 1); left = THUMB / 2 - step; }
    var sliderLeft = left + step - THUMB / 2;
    slider.style.marginLeft = sliderLeft.toFixed(2) + 'px';
    slider.style.width = ((MAX_YEARS - 1) * step + THUMB).toFixed(2) + 'px';
    var H = W < 520 ? 236 : 300;
    var withAge = state && state.age !== null;
    geo = { W: W, H: H, left: left, step: step, top: 26, bottom: H - (withAge ? 36 : 22) };
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  }
  function xOf(t) { return geo.left + t * geo.step; }
  function niceStep(raw) {
    var e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }

  function draw(s) {
    while (svg.lastChild && svg.lastChild.nodeName !== 'title' && svg.lastChild.nodeName !== 'desc') svg.removeChild(svg.lastChild);
    var years = s.years, months = years * 12;
    var total = grow(s.now, s.pmt, months, s.rate);
    var top = Math.max(s.target, total) * 1.1;
    var tick = niceStep(top / 5);
    var ymax = Math.ceil(top / tick) * tick;
    var y0 = geo.bottom, yTop = geo.top;
    function yOf(v) { return y0 - (v / ymax) * (y0 - yTop); }
    var yGoal = yOf(s.target);
    var reach = monthsToReach(s.target, s.now, s.pmt, s.rate);
    var reached = reach !== null && reach > 0 && reach <= months;
    var xr = reached ? xOf(reach / 12) : 0;

    // 目盛りの線
    var tickVals = [];
    for (var v = tick; v <= ymax + 1e-6; v += tick) {
      svg.appendChild(el('line', { x1: 0, x2: geo.W, y1: yOf(v), y2: yOf(v), stroke: COLOR.grid, 'stroke-width': 1 }));
      tickVals.push(v);
    }
    svg.appendChild(el('line', { x1: 0, x2: geo.W, y1: y0, y2: y0, stroke: '#c9cec6', 'stroke-width': 1 }));

    // 横の目盛り（年。年齢を入れていれば、その下に年齢）
    [0, 10, 20, 30, 40].forEach(function (t) {
      var x = xOf(t), anchor = t === 0 ? 'start' : t === MAX_YEARS ? 'end' : 'middle';
      var dx = t === 0 ? -geo.left + 2 : t === MAX_YEARS ? 2 : 0;
      svg.appendChild(el('text', { x: x + dx, y: y0 + 16, 'text-anchor': anchor, class: 't-tick' }, t === 0 ? '今' : t + '年'));
      if (s.age !== null) svg.appendChild(el('text', { x: x + dx, y: y0 + 30, 'text-anchor': anchor, class: 't-age' }, (s.age + t) + '歳'));
    });

    // 1年ごとの点（元本と資産）
    var pts = [];
    for (var t = 0; t <= years; t++) {
      var p = s.now + s.pmt * 12 * t, tv = grow(s.now, s.pmt, t * 12, s.rate);
      pts.push({ t: t, p: p, v: tv, x: xOf(t), yp: yOf(p), yv: yOf(tv) });
    }
    function line(key) { return pts.map(function (q, k) { return (k ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q[key].toFixed(1); }).join(''); }
    var last = pts[pts.length - 1];
    // 増えた分（元本の線と資産の線のあいだ）と、元本（元本の線から下）
    var gainArea = line('yv') + pts.slice().reverse().map(function (q) { return 'L' + q.x.toFixed(1) + ' ' + q.yp.toFixed(1); }).join('') + 'Z';
    var principalArea = line('yp') + 'L' + last.x.toFixed(1) + ' ' + y0 + 'L' + pts[0].x.toFixed(1) + ' ' + y0 + 'Z';
    svg.appendChild(el('path', { d: principalArea, fill: COLOR.principal, 'fill-opacity': 0.16 }));
    svg.appendChild(el('path', { d: gainArea, fill: COLOR.gain, 'fill-opacity': 0.26 }));
    svg.appendChild(el('path', { d: line('yp'), fill: 'none', stroke: COLOR.principal, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    svg.appendChild(el('path', { d: line('yv'), fill: 'none', stroke: COLOR.gain, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    // 目標の線（しきい値なので点線）と、いまの期間（つまみの位置）の縦線
    svg.appendChild(el('line', { x1: 0, x2: geo.W, y1: yGoal, y2: yGoal, stroke: COLOR.ink, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    svg.appendChild(el('line', { x1: last.x, x2: last.x, y1: yTop - 8, y2: y0, stroke: COLOR.ink, 'stroke-opacity': 0.35, 'stroke-width': 1 }));

    // ---- 文字（重ならない所に置く。置けないものは出さない。値は上の数字と表でいつでも見られる） ----
    var boxes = [{ x: last.x - 8, y: last.yv - 8, w: 16, h: 16 }, { x: last.x - 7, y: last.yp - 7, w: 14, h: 14 }];
    if (reached) boxes.push({ x: xr - 6, y: yGoal - 6, w: 12, h: 12 });
    function box(t) {
      try { var b = t.getBBox(); return { x: b.x - 2, y: b.y - 1, w: b.width + 4, h: b.height + 2 }; }
      catch (e) { return { x: +t.getAttribute('x'), y: +t.getAttribute('y') - 13, w: t.textContent.length * 13, h: 16 }; }
    }
    function free(b) {
      if (b.x < 0 || b.x + b.w > geo.W) return false;
      return !boxes.some(function (o) { return b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y; });
    }
    function width(t) { try { return t.getComputedTextLength(); } catch (e) { return t.textContent.length * 13; } }
    function tryAt(t, spots) { // spots: [x, y]（文字の左端と、文字の下の線）
      for (var k = 0; k < spots.length; k++) {
        t.setAttribute('x', spots[k][0]); t.setAttribute('y', spots[k][1]);
        var b = box(t);
        if (free(b)) { boxes.push(b); return true; }
      }
      return false;
    }
    // 目標に届いたところ：線の上・点の左が空いている（そこでは資産の線は目標より下）
    if (reached) {
      var rl = el('text', { class: 't-reach' }, span(reach) + 'で到達');
      svg.appendChild(rl);
      var ok = tryAt(rl, [[xr - 12 - width(rl), yGoal - 9]]);
      if (!ok) { rl.textContent = span(reach); ok = tryAt(rl, [[xr - 12 - width(rl), yGoal - 9]]); }
      if (!ok) { rl.textContent = span(reach) + 'で到達'; ok = tryAt(rl, [[xr + 10, yGoal + 19], [xr + 10, yGoal - 8]]); }
      if (!ok) svg.removeChild(rl);
    }
    // 目標の名前：右の端（つまみより右は空いている）→ 左の端 → 線の下
    var gl = el('text', { class: 't-goal' }, '目標 ' + man(s.target));
    svg.appendChild(gl);
    var wG = width(gl), spots = [];
    if (!reached || geo.W - 2 - wG > last.x + 6) spots.push([geo.W - 2 - wG, yGoal - 7]);
    if (!reached || geo.left + 2 + wG + 6 < xr) spots.push([geo.left + 2, yGoal - 7]);
    spots.push([geo.left + 2, yGoal + 17], [geo.W - 2 - wG, yGoal + 17], [geo.W - 2 - wG, yGoal - 7]);
    if (!tryAt(gl, spots)) { gl.setAttribute('x', geo.W - 2 - wG); gl.setAttribute('y', yGoal - 7); }
    // 帯の中の名前（帯が十分に太く、空いているときだけ）
    if (years >= 12) {
      [['増えた分', last.yv, last.yp], ['元本', last.yp, y0]].forEach(function (band) {
        if (band[2] - band[1] < 24) return;
        var bt = el('text', { class: 't-band' }, band[0]);
        svg.appendChild(bt);
        var wb = width(bt), h = band[2] - band[1];
        if (!tryAt(bt, [0.5, 0.68, 0.32].map(function (f) { return [last.x - 8 - wb, band[1] + h * f + 4]; }))) svg.removeChild(bt);
      });
    }
    // 縦の目盛りの数字
    tickVals.forEach(function (v) {
      var tt = el('text', { class: 't-tick' }, manShort(v));
      svg.appendChild(tt);
      if (Math.abs(yOf(v) - yGoal) <= 12 || !tryAt(tt, [[geo.left, yOf(v) - 5]])) svg.removeChild(tt);
    });

    // 点（いちばん上に描く）
    if (reached) svg.appendChild(el('circle', { cx: xr, cy: yGoal, r: 6, fill: COLOR.ink, stroke: COLOR.surface, 'stroke-width': 2 }));
    svg.appendChild(el('circle', { cx: last.x, cy: last.yp, r: 4.5, fill: COLOR.principal, stroke: COLOR.surface, 'stroke-width': 2 }));
    svg.appendChild(el('circle', { cx: last.x, cy: last.yv, r: 5.5, fill: COLOR.gain, stroke: COLOR.surface, 'stroke-width': 2 }));

    // なぞったときの線（マウスのとき）
    hover = el('line', { x1: 0, x2: 0, y1: yTop - 8, y2: y0, stroke: COLOR.ink, 'stroke-opacity': 0.5, 'stroke-width': 1, visibility: 'hidden' });
    svg.appendChild(hover);
    geo.pts = pts;
    $('s-chart-desc').textContent = years + '年後の資産は' + man(total) + '。元本' + man(last.p) + '、増えた分' + man(Math.max(0, total - last.p)) + '。目標は' + man(s.target) + '。';
  }
  var hover = null;

  // ---- 数字の表示 ----
  function render() {
    var s = read();
    out.textContent = slider.value + '年';
    if (!s) { setFill(); return; }
    state = s;
    layout();
    setFill();
    draw(s);
    var months = s.years * 12;
    var total = grow(s.now, s.pmt, months, s.rate), principal = s.now + s.pmt * months, gain = Math.max(0, total - principal);
    slider.setAttribute('aria-valuetext', s.years + '年' + (s.age !== null ? '（' + (s.age + s.years) + '歳まで）' : '') + '、資産 ' + man(total));
    out.textContent = s.years + '年' + (s.age !== null ? '（' + s.age + '→' + (s.age + s.years) + '歳）' : '');
    setText('s-when', s.years + '年後' + ageAt(s.age, s.years) + 'の資産');
    setText('s-total', man(total));
    setText('s-gain', man(gain));
    setText('s-principal', man(principal));

    // 目標まで
    setText('s-goal', man(s.target));
    var pct = Math.floor(total / s.target * 100);
    var reached = total >= s.target;
    $('s-goal-box').classList.toggle('is-reached', reached);
    setText('s-goal-pct', reached ? '達成' : pct + '%');
    $('s-meter').style.width = Math.min(100, Math.max(0, total / s.target * 100)).toFixed(1) + '%';
    var reach = monthsToReach(s.target, s.now, s.pmt, s.rate);
    var fix = $('s-goal-fix');
    fix.hidden = true;
    if (reach === 0) {
      setText('s-goal-msg', '今ある資産で、もう目標に届いています。');
    } else if (reached) {
      setText('s-goal-msg', span(reach) + '後' + ageAt(s.age, reach / 12) + 'に、目標の' + man(s.target) + 'に届きます。');
    } else {
      var msg = '目標まで、あと' + man(s.target - total) + '。';
      msg += reach === null ? 'このままでは届きません。' : 'このペースなら' + span(reach) + '後' + ageAt(s.age, reach / 12) + 'に届きます。';
      setText('s-goal-msg', msg);
      var need = monthlyFor(s.target, s.now, months, s.rate);
      if (need > 0 && need <= 1000) {
        var rounded = need >= 10 ? Math.ceil(need) : Math.ceil(need * 10) / 10;  // 表示（10万円以上は1万円単位）と入れる値をそろえる
        setText('s-goal-fix-text', s.years + '年で届かせるなら、毎月' + monthly(rounded) + '。');
        var btn = $('s-goal-fix-btn');
        btn.textContent = '毎月' + monthly(rounded) + 'にしてみる';
        btn.dataset.value = String(rounded);
        fix.hidden = false;
      }
    }

    // NISAで増えた分に税金がかからないこと・はじめる時期
    var inNisa = s.pmt <= 30 && principal <= 1800;
    var tax = $('s-tax');
    if (gain >= 1 && inNisa) {
      tax.textContent = '';
      tax.appendChild(document.createTextNode('NISAなら、増えた分の'));
      var b = document.createElement('b'); b.textContent = man(gain); tax.appendChild(b);
      tax.appendChild(document.createTextNode('に税金がかかりません。ふつうの口座で売ると、約20%（約' + man(gain * TAX) + '）が税金になります。'));
      tax.hidden = false;
    } else {
      tax.hidden = true;
    }
    var late = $('s-late');
    if (s.years > 5 && (s.pmt > 0 || s.now > 0)) {
      var later = grow(s.now, s.pmt, (s.years - 5) * 12, s.rate);
      late.textContent = '';
      late.appendChild(document.createTextNode('同じ' + (s.age !== null ? (s.age + s.years) + '歳' : '時期') + 'まで続けても、はじめるのが5年おそいと約' + man(later) + '。今はじめるより'));
      var lb = document.createElement('b'); lb.textContent = '約' + man(total - later) + '少なく'; late.appendChild(lb);
      late.appendChild(document.createTextNode('なります。'));
      late.hidden = false;
    } else {
      late.hidden = true;
    }
    var notes = [];
    if (s.pmt > 10 && s.pmt <= 30) notes.push('つみたて投資枠は年120万円（毎月10万円）まで。それをこえる分は、成長投資枠もあわせて年360万円まで使えます。');
    if (s.pmt > 30) notes.push('毎月30万円（年360万円）をこえる分は、NISAの年間の枠の外（ふつうの口座）になります。');
    if (principal > 1800) notes.push('元本の合計が1,800万円をこえます。NISAで非課税にできるのは、元本で1,800万円までです。');
    if (s.rate === 0) notes.push('増える割合が0%なので、増えた分はありません。');
    var ul = $('s-notes');
    ul.textContent = '';
    notes.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });

    // 表（5年ごと）
    var tbody = $('s-rows');
    tbody.textContent = '';
    var marks = [];
    for (var y = 5; y < s.years; y += 5) marks.push(y);
    marks.push(s.years);
    marks.forEach(function (y) {
      var v = grow(s.now, s.pmt, y * 12, s.rate), p = s.now + s.pmt * 12 * y;
      var tr = document.createElement('tr');
      [y + '年後' + ageAt(s.age, y), man(p), man(Math.max(0, v - p)), man(v)].forEach(function (t, k) {
        var cell = document.createElement(k === 0 ? 'th' : 'td');
        if (k === 0) cell.setAttribute('scope', 'row');
        cell.textContent = t;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
  }
  function announce() {
    if (!state) return;
    setText('s-live', $('s-when').textContent + 'は' + $('s-total').textContent + '。' + $('s-goal-msg').textContent);
  }
  // つまみの左側を色でぬる
  function setFill() {
    var w = slider.getBoundingClientRect().width || 1;
    var f = (Number(slider.value) - 1) / (MAX_YEARS - 1);
    slider.style.setProperty('--fill', ((THUMB / 2 + f * (w - THUMB)) / w * 100).toFixed(2) + '%');
  }

  // ---- つまみ・グラフをなぞる ----
  slider.addEventListener('input', render);
  slider.addEventListener('change', announce);
  function yearAt(clientX) {
    var r = svg.getBoundingClientRect();
    return (clientX - r.left - geo.left) / geo.step;
  }
  var dragging = null;
  svg.addEventListener('pointerdown', function (e) {
    if (!geo || (e.pointerType === 'mouse' && e.button !== 0)) return;
    dragging = e.pointerId;
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* できなくても動く */ }
    setYears(yearAt(e.clientX));
  });
  svg.addEventListener('pointermove', function (e) {
    if (!geo) return;
    if (dragging === e.pointerId) { setYears(yearAt(e.clientX)); hideTip(); return; }
    if (e.pointerType === 'mouse') showTip(yearAt(e.clientX), e);
  });
  function endDrag(e) {
    if (dragging !== e.pointerId) return;
    dragging = null;
    announce();
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('pointerleave', hideTip);
  function setYears(t) {
    var y = Math.max(1, Math.min(MAX_YEARS, Math.round(t)));
    if (String(y) === slider.value) return;
    slider.value = String(y);
    render();
  }

  // マウスでなぞったときの吹き出し（値はいつも上の数字と表でも見られる）
  function showTip(t, e) {
    if (!state || !geo.pts) return;
    var k = Math.round(t);
    if (k < 0 || k > state.years) { hideTip(); return; }
    var q = geo.pts[k];
    hover.setAttribute('x1', q.x); hover.setAttribute('x2', q.x); hover.setAttribute('visibility', 'visible');
    tip.textContent = '';
    var head = document.createElement('p'); head.className = 'sim-tip-head'; head.textContent = (k ? k + '年後' : '今') + ageAt(state.age, k);
    tip.appendChild(head);
    [['資産', q.v, COLOR.gain, true], ['増えた分', Math.max(0, q.v - q.p), COLOR.gain, false], ['元本', q.p, COLOR.principal, false]].forEach(function (row) {
      var p = document.createElement('p'); p.className = row[3] ? 'sim-tip-main' : 'sim-tip-row';
      var key = document.createElement('span'); key.className = 'sim-tip-key'; key.style.background = row[2];
      if (row[3]) key.style.visibility = 'hidden';
      var name = document.createElement('span'); name.textContent = row[0];
      var val = document.createElement('b'); val.textContent = man(row[1]);
      p.appendChild(key); p.appendChild(name); p.appendChild(val);
      tip.appendChild(p);
    });
    tip.hidden = false;
    var bw = box.clientWidth, tw = tip.offsetWidth;
    var x = q.x + 12;
    if (x + tw > bw) x = q.x - 12 - tw;
    tip.style.left = Math.max(0, x) + 'px';
    tip.style.top = Math.max(0, Math.min(q.yv - 20, geo.bottom - tip.offsetHeight)) + 'px';
  }
  function hideTip() {
    tip.hidden = true;
    if (hover) hover.setAttribute('visibility', 'hidden');
  }

  // ---- 入力欄・ボタン ----
  var form = $('sim-form');
  form.addEventListener('input', function () { syncRate(); render(); });
  form.addEventListener('change', announce);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  root.querySelectorAll('[data-set]').forEach(function (b) {
    b.addEventListener('click', function () {
      var input = $(b.getAttribute('data-set'));
      input.value = b.getAttribute('data-value');
      render(); announce();
    });
  });
  var rateBtns = Array.prototype.slice.call(root.querySelectorAll('[data-rate-main]'));
  rateBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      inputs.rate.value = b.getAttribute('data-rate-main');
      syncRate(); render(); announce();
    });
  });
  function syncRate() {
    var r = readNum(inputs.rate);
    rateBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-rate-main')) === r)); });
  }
  $('s-goal-fix-btn').addEventListener('click', function () {
    inputs.monthly.value = this.dataset.value;
    render(); announce();
  });

  // ---- 手がかり：FIREに必要な金額 ----
  document.querySelectorAll('[data-rate-for]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = $(btn.getAttribute('data-rate-for'));
      input.value = btn.getAttribute('data-rate');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  function fire() {
    var cost = readNum($('f-cost')), wd = readNum($('f-wd'));
    var ok = check($('f-cost'), cost > 0) & check($('f-wd'), wd > 0 && wd <= 10);
    var use = $('f-use');
    if (!ok) { setText('f-need', '―'); setText('f-caption', '生活費と割合（0より大きく10%まで）を入れてください。'); use.hidden = true; return; }
    var need = cost * 12 / (wd / 100);
    setText('f-need', man(need));
    setText('f-caption', '毎月の生活費' + monthly(cost) + '×12か月÷' + wd + '%（年間の生活費の約' + Math.round(100 / wd) + '倍）');
    use.hidden = false;
    use.dataset.value = String(Math.round(need));
  }
  $('fire').addEventListener('input', fire);
  $('f-use').addEventListener('click', function () {
    inputs.target.value = this.dataset.value;
    render(); announce();
    root.scrollIntoView({ behavior: smooth(), block: 'start' });
  });

  // ---- 手がかり：いまの家計から ----
  function budget() {
    var income = readNum($('b-income')), cost = readNum($('b-cost')), saved = readNum($('b-saved')), guardM = readNum($('b-guard'));
    var ok = check($('b-income'), income >= 0) & check($('b-cost'), cost >= 0) & check($('b-saved'), saved >= 0) & check($('b-guard'), guardM >= 0 && guardM <= 36);
    var use = $('b-use'), tips = [];
    use.hidden = true;
    if (!ok) { setText('b-can', '―'); setText('b-plan', '数字を入れてください（マイナスは入れられません）。'); list(tips); return; }
    var surplus = income - cost, guard = cost * guardM, gap = Math.max(0, guard - saved);
    if (surplus <= 0) {
      setText('b-can', '0円');
      setText('b-plan', 'いまは、支出が手取りと同じか、上回っています。');
      tips.push('まずは毎月の固定費（スマホ代・保険・サブスク・電気代のプラン）から見直すと、効果が続きます。');
      tips.push('投資は、毎月の黒字ができてから。少額（月1,000円など）から始めても大丈夫です。');
    } else {
      setText('b-can', '毎月 最大' + monthly(surplus));
      var invest = gap > 0 ? surplus / 2 : surplus;
      if (gap > 0) {
        setText('b-plan', '生活防衛資金（' + man(guard) + '）まで、あと' + man(gap) + '。たまるまでは、投資' + monthly(invest) + '＋貯金' + monthly(surplus / 2) + 'にすると、約' + Math.ceil(gap / (surplus / 2)) + 'か月でたまります。');
        tips.push('たまったら、回せる額の全部を積立に回せます。');
      } else {
        setText('b-plan', '生活防衛資金（' + man(guard) + '）は、たまっています。');
        tips.push('全額を積立に回す必要はありません。急な出費に備えて、無理のない額から始めましょう。');
      }
      var v = Math.round(invest * 10) / 10;
      if (v > 0) { use.textContent = '毎月' + monthly(v) + 'で試す'; use.dataset.value = String(v); use.hidden = false; }
    }
    list(tips);
  }
  function list(items) {
    var ul = $('b-tips');
    ul.textContent = '';
    items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  }
  $('budget').addEventListener('input', budget);
  $('b-use').addEventListener('click', function () {
    inputs.monthly.value = this.dataset.value;
    render(); announce();
    root.scrollIntoView({ behavior: smooth(), block: 'start' });
  });
  function smooth() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }

  // ---- 入口のリンクから、手がかりを開く（例：goal.html#fire） ----
  function openFromHash() {
    var id = location.hash.replace('#', '');
    var d = id === 'fire' || id === 'budget' ? $(id) : null;
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', openFromHash);
  root.parentNode.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#fire"],a[href="#budget"]');
    if (!a) return;
    var d = $(a.getAttribute('href').slice(1));
    if (d) d.open = true;
  });

  // 画面の幅が変わったら、グラフとつまみの位置を合わせ直す
  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 80); });

  syncRate();
  render();
  fire();
  budget();
  openFromHash();
}());
