(function () {
  'use strict';
  // 資産推移アプリ：目標の金額 → 毎月の積立額 → 期間のつまみ で、元本と増えた分の推移をその場でグラフにする
  var root = document.getElementById('sim');
  if (!root) return;

  var MAX_END_AGE = 80;  // つまみの右の端は80歳（期間にすると10〜60年の間）
  var THUMB = 28;        // 期間のつまみの幅（start.css の .sim-period と同じ）
  var EDGE = 8;          // グラフの左の余白
  var COLOR = { principal: '#2a7aa8', gain: '#ca743a', ink: '#143e35', grid: '#e2e5de', surface: '#fcfbf8', compare: '#5f6f69' };
  var TAX = 0.20315;     // ふつうの口座で、売って利益が出たときの税金（所得税・復興特別所得税・住民税）
  var LIVING = 20;       // 「生活費の何年分」に置きかえるときの、ひと月の生活費（万円）
  var MILESTONES = [100, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000];
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
  function yen(x) { // 円の金額をざっくり（500円以上は100円単位、それより下は10円単位）
    var v = x >= 500 ? Math.round(x / 100) * 100 : Math.round(x / 10) * 10;
    return v.toLocaleString('ja-JP') + '円';
  }
  function span(months) {
    months = Math.round(months);
    var y = Math.floor(months / 12), m = months % 12;
    return (y ? y + '年' : '') + (m ? m + 'か月' : '') || '0か月';
  }
  function ageLabel(age, months) { // 今の年齢から数えた、そのときの年齢（年の途中なら「ごろ」）
    months = Math.round(months);
    return Math.floor(age + months / 12 + 1e-9) + '歳' + (months % 12 ? 'ごろ' : '');
  }
  function when(age, months) { // 「61歳ごろ（26年8か月後）」
    return Math.round(months) === 0 ? '今（' + age + '歳）' : ageLabel(age, months) + '（' + span(months) + '後）';
  }

  function $(id) { return document.getElementById(id); }
  // 全角の数字やカンマ・「万円」が入っても読めるようにする
  function readNum(input) {
    var t = String(input.value).replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[,，\s]|万円|万|円|歳|%|％|か月/g, '');
    if (t === '') return NaN;
    return Number(t);
  }
  function check(input, ok) { input.setAttribute('aria-invalid', String(!ok)); return ok; }
  function setText(id, text) { var e = $(id); if (e) e.textContent = text; }
  function el(tag, attrs, text) {
    var e = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function reducedMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

  // ---- 入力 ----
  var inputs = { target: $('s-target'), monthly: $('s-monthly'), now: $('s-now'), age: $('s-age'), rate: $('s-rate') };
  var slider = $('s-years'), out = $('s-years-out');
  var state = null;      // いま正しく入っている数字（期間はつまみの値）
  var maxYears = 45;     // つまみの右の端（今の年齢から80歳まで）
  var endAge = null;     // 「何歳まで積み立てる？」。年齢を変えても、この年齢までの期間に合わせる
  var compare = null;    // くらべる線：null・'plus'（毎月あと1万円）・'range'（年3%〜7%）

  function read() {
    var target = readNum(inputs.target), pmt = readNum(inputs.monthly), now = readNum(inputs.now), rate = readNum(inputs.rate);
    var age = readNum(inputs.age);
    var errors = [];
    if (!check(inputs.target, target > 0 && target <= 100000)) errors.push('目標の金額は、1〜100,000万円の間で入れてください。');
    if (!check(inputs.monthly, pmt >= 0 && pmt <= 1000)) errors.push('毎月の積立額は、0〜1,000万円の間で入れてください。');
    if (!check(inputs.now, now >= 0 && now <= 100000)) errors.push('今ある資産は、0〜100,000万円の間で入れてください。');
    if (!check(inputs.rate, rate >= 0 && rate <= 15)) errors.push('増える割合は、0〜15%の間で入れてください。');
    if (!check(inputs.age, age >= 0 && age <= 99 && age % 1 === 0)) errors.push('今の年齢は、0〜99の数字で入れてください。');
    var err = $('s-error');
    err.textContent = errors.join(' ');
    err.hidden = !errors.length;
    if (errors.length) return null;
    // 今の年齢から、つまみの右の端と、「何歳まで」にあたる期間を決める
    maxYears = Math.max(10, Math.min(60, MAX_END_AGE - age));
    slider.max = String(maxYears);
    if (endAge === null) endAge = age + Number(slider.value);
    var years = endAge - age >= 1 ? endAge - age : Math.min(10, maxYears);
    years = Math.max(1, Math.min(maxYears, years));
    slider.value = String(years);
    return { target: target, pmt: pmt, now: now, rate: rate, age: age, years: years };
  }

  // チェックポイント（100万・500万・1,000万円…）に届く時期。期間の中で届くものだけ。目標は別に出す
  function milestones(s, months) {
    var list = [];
    MILESTONES.forEach(function (v) {
      if (v === s.target || v <= s.now) return;
      var m = monthsToReach(v, s.now, s.pmt, s.rate);
      if (m !== null && m > 0 && m <= months + 1e-9) list.push({ v: v, m: m });
    });
    return list;
  }
  function pickMarks(s, months) {
    var picked = [], lastM = -999;
    milestones(s, months).forEach(function (q) { if (q.m - lastM >= 30) { picked.push(q); lastM = q.m; } });
    return picked.length > 4 ? picked.slice(picked.length - 4) : picked;
  }

  // ---- グラフの形（つまみの中心と、グラフの年の位置をぴったりそろえる） ----
  var box = $('s-chart-box'), svg = $('s-chart'), tip = $('s-tip');
  var geo = null;
  function layout() {
    var W = Math.max(240, Math.round(box.clientWidth));
    var right = THUMB / 2;
    var step = (W - EDGE - right) / maxYears;           // 1年ぶんの横の長さ
    var left = EDGE;
    if (left + step < THUMB / 2) { step = (W - THUMB) / (maxYears - 1); left = THUMB / 2 - step; }
    var sliderLeft = left + step - THUMB / 2;
    slider.style.marginLeft = sliderLeft.toFixed(2) + 'px';
    slider.style.width = ((maxYears - 1) * step + THUMB).toFixed(2) + 'px';
    var H = W < 520 ? 236 : 300;
    geo = { W: W, H: H, left: left, step: step, top: 26, bottom: H - 36 };
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  }
  function xOf(t) { return geo.left + t * geo.step; }
  function niceStep(raw) {
    var e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  // 1年ごとの点。期間が年の途中（再生中）なら、最後にその時点の点を足す
  function series(now, pmt, rate, months) {
    var pts = [], full = Math.floor(months / 12 + 1e-9);
    function point(t) { return { t: t, p: now + pmt * 12 * t, v: grow(now, pmt, t * 12, rate) }; }
    for (var t = 0; t <= full; t++) pts.push(point(t));
    if (months / 12 - full > 1e-6) pts.push(point(months / 12));
    return pts;
  }

  var hover = null;
  function draw(s, months) {
    while (svg.lastChild && svg.lastChild.nodeName !== 'title' && svg.lastChild.nodeName !== 'desc') svg.removeChild(svg.lastChild);
    var years = months / 12;
    var total = grow(s.now, s.pmt, months, s.rate);
    var cmp = compare === 'plus' ? { plus: series(s.now, s.pmt + 1, s.rate, months) }
      : compare === 'range' ? { lo: series(s.now, s.pmt, 3, months), hi: series(s.now, s.pmt, 7, months) } : null;
    var cmpTop = !cmp ? 0 : cmp.plus ? cmp.plus[cmp.plus.length - 1].v : Math.max(cmp.hi[cmp.hi.length - 1].v, cmp.lo[cmp.lo.length - 1].v);
    var top = Math.max(s.target, total, cmpTop) * 1.1;
    var tick = niceStep(top / 5);
    var ymax = Math.ceil(top / tick) * tick;
    var y0 = geo.bottom, yTop = geo.top;
    function yOf(v) { return y0 - (v / ymax) * (y0 - yTop); }
    function line(pts, key) { return pts.map(function (q, k) { return (k ? 'L' : 'M') + xOf(q.t).toFixed(1) + ' ' + yOf(q[key]).toFixed(1); }).join(''); }
    var yGoal = yOf(s.target);
    var reach = monthsToReach(s.target, s.now, s.pmt, s.rate);
    var reached = reach !== null && reach > 0 && reach <= months + 1e-9;
    var xr = reached ? xOf(reach / 12) : 0;

    // 目盛りの線
    var tickVals = [];
    for (var v = tick; v <= ymax + 1e-6; v += tick) {
      svg.appendChild(el('line', { x1: 0, x2: geo.W, y1: yOf(v), y2: yOf(v), stroke: COLOR.grid, 'stroke-width': 1 }));
      tickVals.push(v);
    }
    svg.appendChild(el('line', { x1: 0, x2: geo.W, y1: y0, y2: y0, stroke: '#c9cec6', 'stroke-width': 1 }));

    // 横の目盛り（年齢。その下に、今から何年後か）
    var tickStep = maxYears <= 20 ? 5 : 10;
    for (var tk = 0; tk <= maxYears; tk += tickStep) {
      var xt = xOf(tk), anchor = tk === 0 ? 'start' : tk === maxYears ? 'end' : 'middle';
      var dx = tk === 0 ? -geo.left + 2 : tk === maxYears ? 2 : 0;
      svg.appendChild(el('text', { x: xt + dx, y: y0 + 16, 'text-anchor': anchor, class: 't-tick t-age-main' }, (s.age + tk) + '歳'));
      svg.appendChild(el('text', { x: xt + dx, y: y0 + 30, 'text-anchor': anchor, class: 't-age' }, tk === 0 ? '今' : tk + '年後'));
    }

    // 年3%〜7%の幅（いちばん下に、うすく）
    var pts = series(s.now, s.pmt, s.rate, months);
    var last = pts[pts.length - 1];
    if (cmp && cmp.hi) {
      var band = line(cmp.hi, 'v') + cmp.lo.slice().reverse().map(function (q) { return 'L' + xOf(q.t).toFixed(1) + ' ' + yOf(q.v).toFixed(1); }).join('') + 'Z';
      svg.appendChild(el('path', { d: band, fill: COLOR.ink, 'fill-opacity': 0.07 }));
    }

    // 増えた分（元本の線と資産の線のあいだ）と、元本（元本の線から下）
    var gainArea = line(pts, 'v') + pts.slice().reverse().map(function (q) { return 'L' + xOf(q.t).toFixed(1) + ' ' + yOf(q.p).toFixed(1); }).join('') + 'Z';
    var principalArea = line(pts, 'p') + 'L' + xOf(last.t).toFixed(1) + ' ' + y0 + 'L' + xOf(0).toFixed(1) + ' ' + y0 + 'Z';
    svg.appendChild(el('path', { d: principalArea, fill: COLOR.principal, 'fill-opacity': 0.16 }));
    svg.appendChild(el('path', { d: gainArea, fill: COLOR.gain, 'fill-opacity': 0.26 }));
    svg.appendChild(el('path', { d: line(pts, 'p'), fill: 'none', stroke: COLOR.principal, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    svg.appendChild(el('path', { d: line(pts, 'v'), fill: 'none', stroke: COLOR.gain, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    // くらべる線（仮の話なので、点の線）
    if (cmp && cmp.hi) {
      [cmp.hi, cmp.lo].forEach(function (c) { svg.appendChild(el('path', { d: line(c, 'v'), fill: 'none', stroke: COLOR.compare, 'stroke-width': 1.5, 'stroke-dasharray': '2 3', 'stroke-linecap': 'round' })); });
    }
    if (cmp && cmp.plus) svg.appendChild(el('path', { d: line(cmp.plus, 'v'), fill: 'none', stroke: COLOR.compare, 'stroke-width': 2, 'stroke-dasharray': '2 4', 'stroke-linecap': 'round' }));

    // 目標の線（しきい値なので破線）と、いまの期間（つまみの位置）の縦線
    var xEnd = xOf(last.t), yEndV = yOf(last.v), yEndP = yOf(last.p);
    svg.appendChild(el('line', { x1: 0, x2: geo.W, y1: yGoal, y2: yGoal, stroke: COLOR.ink, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    svg.appendChild(el('line', { x1: xEnd, x2: xEnd, y1: yTop - 8, y2: y0, stroke: COLOR.ink, 'stroke-opacity': 0.35, 'stroke-width': 1 }));

    // ---- 文字（重ならない所に置く。置けないものは出さない。値は上の数字・チェックポイント・表でいつでも見られる） ----
    var shown = pickMarks(s, months).filter(function (q) { // 下のチェックポイントと同じもの。ほかの点に重なるものは出さない
      var x = xOf(q.m / 12);
      return !(reached && Math.abs(x - xr) < 12) && Math.abs(x - xEnd) >= 10;
    });
    var boxes = [{ x: xEnd - 8, y: yEndV - 8, w: 16, h: 16 }, { x: xEnd - 7, y: yEndP - 7, w: 14, h: 14 }, { x: 0, y: y0 + 1, w: geo.W, h: geo.H - y0 }];
    if (reached) boxes.push({ x: xr - 6, y: yGoal - 6, w: 12, h: 12 });
    shown.forEach(function (q) { boxes.push({ x: xOf(q.m / 12) - 6, y: yOf(q.v) - 6, w: 12, h: 12 }); });
    function bbox(t) {
      try { var b = t.getBBox(); return { x: b.x - 2, y: b.y - 1, w: b.width + 4, h: b.height + 2 }; }
      catch (e) { return { x: +t.getAttribute('x'), y: +t.getAttribute('y') - 13, w: t.textContent.length * 13, h: 16 }; }
    }
    function free(b) {
      if (b.x < 0 || b.x + b.w > geo.W || b.y < 0) return false;
      return !boxes.some(function (o) { return b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y; });
    }
    function width(t) { try { return t.getComputedTextLength(); } catch (e) { return t.textContent.length * 13; } }
    function tryAt(t, spots) { // spots: [x, y]（文字の左端と、文字の下の線）
      for (var k = 0; k < spots.length; k++) {
        t.setAttribute('x', spots[k][0]); t.setAttribute('y', spots[k][1]);
        var b = bbox(t);
        if (free(b)) { boxes.push(b); return true; }
      }
      return false;
    }
    function label(text, cls, spots) {
      var t = el('text', { class: cls }, text);
      svg.appendChild(t);
      if (!tryAt(t, spots(width(t)))) { svg.removeChild(t); return null; }
      return t;
    }
    // 目標に届いたところ：線の上・点の左が空いている（そこでは資産の線は目標より下）
    if (reached) {
      var rl = el('text', { class: 't-reach' }, ageLabel(s.age, reach) + 'に到達');
      svg.appendChild(rl);
      var ok = tryAt(rl, [[xr - 12 - width(rl), yGoal - 9]]);
      if (!ok) { rl.textContent = ageLabel(s.age, reach); ok = tryAt(rl, [[xr - 12 - width(rl), yGoal - 9]]); }
      if (!ok) { rl.textContent = ageLabel(s.age, reach) + 'に到達'; ok = tryAt(rl, [[xr + 10, yGoal + 19], [xr + 10, yGoal - 8]]); }
      if (!ok) svg.removeChild(rl);
    }
    // 目標の名前：右の端（つまみより右は空いている）→ 左の端 → 線の下
    var gl = el('text', { class: 't-goal' }, '目標 ' + man(s.target));
    svg.appendChild(gl);
    var wG = width(gl), spots = [];
    if (!reached || geo.W - 2 - wG > xEnd + 6) spots.push([geo.W - 2 - wG, yGoal - 7]);
    if (!reached || geo.left + 2 + wG + 6 < xr) spots.push([geo.left + 2, yGoal - 7]);
    spots.push([geo.left + 2, yGoal + 17], [geo.W - 2 - wG, yGoal + 17], [geo.W - 2 - wG, yGoal - 7]);
    if (!tryAt(gl, spots)) { gl.setAttribute('x', geo.W - 2 - wG); gl.setAttribute('y', yGoal - 7); }
    // くらべる線の名前（線の終わりの右、なければ左）
    function endLabel(text, yv) {
      label(text, 't-cmp', function (w) { return [[xEnd + 8, yv + 4], [xEnd - 8 - w, yv - 6], [xEnd - 8 - w, yv + 14]]; });
    }
    if (cmp && cmp.plus) endLabel('毎月' + monthly(s.pmt + 1), yOf(cmp.plus[cmp.plus.length - 1].v));
    if (cmp && cmp.hi) { endLabel('年7%', yOf(cmp.hi[cmp.hi.length - 1].v)); endLabel('年3%', yOf(cmp.lo[cmp.lo.length - 1].v)); }
    // 帯の中の名前（帯が十分に太く、空いているときだけ）
    if (years >= 12) {
      [['増えた分', yEndV, yEndP], ['元本', yEndP, y0]].forEach(function (bnd) {
        var h = bnd[2] - bnd[1];
        if (h < 24) return;
        label(bnd[0], 't-band', function (w) { return [0.5, 0.68, 0.32].map(function (f) { return [xEnd - 8 - w, bnd[1] + h * f + 4]; }); });
      });
    }
    // チェックポイントの名前（点の左上・右下など、空いている所）
    shown.forEach(function (q) {
      var x = xOf(q.m / 12), y = yOf(q.v);
      label(manShort(q.v), 't-mile', function (w) { return [[x - 8 - w, y - 6], [x + 8, y + 14], [x - 8 - w, y + 14], [x + 8, y - 6]]; });
    });
    // 縦の目盛りの数字
    tickVals.forEach(function (tv) {
      var tt = el('text', { class: 't-tick' }, manShort(tv));
      svg.appendChild(tt);
      if (Math.abs(yOf(tv) - yGoal) <= 12 || !tryAt(tt, [[geo.left, yOf(tv) - 5]])) svg.removeChild(tt);
    });

    // 点（いちばん上に描く）
    shown.forEach(function (q) {
      svg.appendChild(el('circle', { cx: xOf(q.m / 12), cy: yOf(q.v), r: 4, fill: COLOR.surface, stroke: COLOR.gain, 'stroke-width': 2 }));
    });
    if (reached) svg.appendChild(el('circle', { cx: xr, cy: yGoal, r: 6, fill: COLOR.ink, stroke: COLOR.surface, 'stroke-width': 2 }));
    svg.appendChild(el('circle', { cx: xEnd, cy: yEndP, r: 4.5, fill: COLOR.principal, stroke: COLOR.surface, 'stroke-width': 2 }));
    svg.appendChild(el('circle', { cx: xEnd, cy: yEndV, r: 5.5, fill: COLOR.gain, stroke: COLOR.surface, 'stroke-width': 2 }));

    // なぞったときの線（マウスのとき）
    hover = el('line', { x1: 0, x2: 0, y1: yTop - 8, y2: y0, stroke: COLOR.ink, 'stroke-opacity': 0.5, 'stroke-width': 1, visibility: 'hidden' });
    svg.appendChild(hover);
    geo.pts = pts;
    geo.reach = reached ? { x: xr, y: yGoal } : null;
    $('s-chart-desc').textContent = when(s.age, months) + 'の資産は' + man(total) + '。元本' + man(last.p) + '、増えた分' + man(Math.max(0, total - last.p)) + '。目標は' + man(s.target) + '。';
  }

  // ---- 数字・チェックポイント・積み木（final が false のとき＝再生中は、表などは変えない） ----
  function paint(s, months, final) {
    var years = months / 12;
    var total = grow(s.now, s.pmt, months, s.rate), principal = s.now + s.pmt * months, gain = Math.max(0, total - principal);
    setText('s-when', when(s.age, months) + 'の資産');
    setText('s-total', man(total));
    setText('s-gain', man(gain));
    setText('s-principal', man(principal));
    out.textContent = ageLabel(s.age, months) + 'まで（' + span(months) + '）';

    // 目標まで
    setText('s-goal', man(s.target));
    var reachedNow = total >= s.target - 1e-9;
    $('s-goal-box').classList.toggle('is-reached', reachedNow);
    setText('s-goal-pct', reachedNow ? '達成' : Math.floor(total / s.target * 100) + '%');
    $('s-meter').style.width = Math.min(100, Math.max(0, total / s.target * 100)).toFixed(1) + '%';
    var reach = monthsToReach(s.target, s.now, s.pmt, s.rate);
    var fix = $('s-goal-fix');
    fix.hidden = true;
    if (reach === 0) {
      setText('s-goal-msg', '今ある資産で、もう目標に届いています。');
    } else if (reachedNow) {
      setText('s-goal-msg', when(s.age, reach) + 'に、目標の' + man(s.target) + 'に届きます。');
    } else {
      var msg = '目標まで、あと' + man(s.target - total) + '。';
      msg += reach === null ? 'このままでは届きません。' : 'このペースなら' + when(s.age, reach) + 'に届きます。';
      setText('s-goal-msg', msg);
      var need = monthlyFor(s.target, s.now, months, s.rate);
      if (final && need > 0 && need <= 1000) {
        var rounded = need >= 10 ? Math.ceil(need) : Math.ceil(need * 10) / 10;  // 表示（10万円以上は1万円単位）と入れる値をそろえる
        setText('s-goal-fix-text', ageLabel(s.age, months) + 'までに届かせるなら、毎月' + monthly(rounded) + '。');
        var btn = $('s-goal-fix-btn');
        btn.textContent = '毎月' + monthly(rounded) + 'にしてみる';
        btn.dataset.value = String(rounded);
        fix.hidden = false;
      }
    }

    // 毎月の積立額を、1日あたりに置きかえる
    setText('s-perday', s.pmt > 0 ? '＝ 1日あたり 約' + yen(s.pmt * 10000 * 12 / 365) : '');

    // くらべる線の説明（グラフを見なくても値がわかるように）
    var ct = $('s-compare-text');
    if (compare === 'plus') {
      var plus = grow(s.now, s.pmt + 1, months, s.rate);
      ct.textContent = '毎月あと1万円（毎月' + monthly(s.pmt + 1) + '）なら、' + ageLabel(s.age, months) + 'のときに' + man(plus) + '。いまより＋' + man(plus - total) + 'です。';
      ct.hidden = false;
    } else if (compare === 'range') {
      ct.textContent = '年3%なら' + man(grow(s.now, s.pmt, months, 3)) + '、年7%なら' + man(grow(s.now, s.pmt, months, 7)) + '。いまの年' + s.rate + '%では' + man(total) + 'です。利回りは毎年ちがい、約束されたものではありません。';
      ct.hidden = false;
    } else {
      ct.hidden = true;
    }

    // チェックポイント（届いた順）と、あとになるほど早く増えること
    var list = $('s-checks');
    list.textContent = '';
    var rows = pickMarks(s, months).map(function (q) { return { v: q.v, m: q.m, cls: 'is-done', pre: '' }; });
    var goalDone = reach !== null && reach <= months + 1e-9;
    rows.push({ v: s.target, m: reach, cls: goalDone ? 'is-goal' : 'is-pending', pre: '目標 ' });
    rows.sort(function (a, b) { return (a.m === null ? 1e9 : a.m) - (b.m === null ? 1e9 : b.m); });  // 目標もふくめて、届く順に
    rows.forEach(function (r) { list.appendChild(checkRow(r.v, r.m, s, r.cls, r.pre)); });
    var speed = $('s-speed');
    speed.hidden = true;
    if (s.rate > 0 && s.pmt > 0) {
      for (var k = MILESTONES.length - 1; k >= 0; k--) {
        var u = MILESTONES[k];
        if (u <= s.now) continue;
        var m1 = monthsToReach(u, s.now, s.pmt, s.rate), m2 = monthsToReach(u * 2, s.now, s.pmt, s.rate);
        if (m1 && m2 && m2 <= months + 1e-9 && m2 - m1 < m1) {
          speed.textContent = '最初の' + man(u) + 'までは' + span(m1) + '、次の' + man(u) + 'は' + span(m2 - m1) + '。あとになるほど早く増えます。';
          speed.hidden = false;
          break;
        }
      }
    }

    // 積み木（1個の金額は、全部で30個までにおさまる、きりのいい金額）
    var units = [10, 50, 100, 500, 1000, 5000, 10000, 50000];
    var unit = units[units.length - 1];
    for (var u2 = 0; u2 < units.length; u2++) { if (total / units[u2] <= 30) { unit = units[u2]; break; } }
    var nTotal = Math.round(total / unit), nP = Math.min(nTotal, Math.round(principal / unit)), nG = nTotal - nP;
    var bx = $('s-blocks');
    bx.textContent = '';
    for (var b = 0; b < nTotal; b++) {
      var sq = document.createElement('span');
      sq.className = b < nP ? 'b-p' : 'b-g';
      bx.appendChild(sq);
    }
    bx.setAttribute('aria-label', '1個' + man(unit) + 'の積み木で、元本が' + nP + '個、増えた分が' + nG + '個');
    setText('s-blocks-p', nP + '個');
    setText('s-blocks-g', nG + '個');
    setText('s-blocks-unit', '1個＝' + man(unit));
    var note = '';
    if (nTotal === 0) note = 'まだ積み木1個（' + man(unit) + '）に届きません。';
    else if (gain > principal) note = '増えた分のほうが、自分で積み立てた元本より多くなっています。';
    else if (gain >= 1) note = '続けるほど、橙の積み木（増えた分）がふえていきます。';
    if (gain >= LIVING) note += '増えた分の' + man(gain) + 'は、生活費（月' + LIVING + '万円）の約' + span(gain / LIVING) + '分です。';
    setText('s-blocks-note', note);

    if (!final) return;

    // NISAで増えた分に税金がかからないこと・はじめる時期
    var inNisa = s.pmt <= 30 && principal <= 1800;
    var tax = $('s-tax');
    if (gain >= 1 && inNisa) {
      tax.textContent = '';
      tax.appendChild(document.createTextNode('NISAなら、増えた分の'));
      var tb = document.createElement('b'); tb.textContent = man(gain); tax.appendChild(tb);
      tax.appendChild(document.createTextNode('に税金がかかりません。ふつうの口座で売ると、約20%（約' + man(gain * TAX) + '）が税金になります。'));
      tax.hidden = false;
    } else {
      tax.hidden = true;
    }
    var late = $('s-late');
    if (years > 5 && (s.pmt > 0 || s.now > 0)) {
      var later = grow(s.now, s.pmt, months - 60, s.rate);
      late.textContent = '';
      late.appendChild(document.createTextNode('同じ' + ageLabel(s.age, months) + 'まで続けても、はじめるのが5年おそい（' + (s.age + 5) + '歳から）と約' + man(later) + '。今はじめるより'));
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
    var tableYears = [];
    for (var y = 5; y < years; y += 5) tableYears.push(y);
    tableYears.push(years);
    tableYears.forEach(function (yy) {
      var vv = grow(s.now, s.pmt, yy * 12, s.rate), pp = s.now + s.pmt * 12 * yy;
      var tr = document.createElement('tr');
      [ageLabel(s.age, yy * 12) + '（' + yy + '年後）', man(pp), man(Math.max(0, vv - pp)), man(vv)].forEach(function (t, k2) {
        var cell = document.createElement(k2 === 0 ? 'th' : 'td');
        if (k2 === 0) cell.setAttribute('scope', 'row');
        cell.textContent = t;
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
  }
  function checkRow(v, m, s, cls, prefix) {
    var li = document.createElement('li');
    li.className = cls;
    var dot = document.createElement('span'); dot.className = 'sim-dot'; dot.setAttribute('aria-hidden', 'true');
    var amount = document.createElement('b'); amount.textContent = prefix + man(v);
    var when = document.createElement('span'); when.className = 'sim-when-at';
    // 「2年8か月」と「（37歳ごろ）」は、それぞれの途中では折り返さない
    var parts = m === 0 ? ['届いています'] : m === null ? ['このままでは届きません']
      : [(cls === 'is-pending' ? 'このペースなら ' : '') + ageLabel(s.age, m), '（' + span(m) + '）'];
    parts.forEach(function (t) { if (!t) return; var w = document.createElement('span'); w.textContent = t; when.appendChild(w); });
    li.appendChild(dot); li.appendChild(amount); li.appendChild(when);
    return li;
  }

  function render() {
    stopPlay();
    var s = read();
    out.textContent = slider.value + '年';
    if (!s) { setFill(); return; }
    state = s;
    layout();
    setFill();
    draw(s, s.years * 12);
    paint(s, s.years * 12, true);
    slider.setAttribute('aria-valuetext', (s.age + s.years) + '歳まで（' + s.years + '年）、資産 ' + $('s-total').textContent);
  }
  function announce() {
    if (!state) return;
    setText('s-live', $('s-when').textContent + 'は' + $('s-total').textContent + '。' + $('s-goal-msg').textContent);
  }
  // つまみの左側を色でぬる
  function setFill(value) {
    var w = slider.getBoundingClientRect().width || 1;
    var f = ((value == null ? Number(slider.value) : value) - 1) / (maxYears - 1);
    f = Math.max(0, Math.min(1, f));
    slider.style.setProperty('--fill', ((THUMB / 2 + f * (w - THUMB)) / w * 100).toFixed(2) + '%');
  }

  // ---- 育つ様子を再生（0年から、いまの期間まで） ----
  var playBtn = $('s-play'), playLabel = $('s-play-label');
  var anim = null;
  function stopPlay() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    if (!anim.keep) slider.value = String(anim.years);  // つまみを自分で動かしたとき以外は、元の期間にもどす
    anim = null;
    root.classList.remove('is-playing');
    playBtn.setAttribute('aria-pressed', 'false');
    playLabel.textContent = '今から育つ様子を再生';
  }
  function burst() { // 目標に届いた瞬間の「到達！」
    if (!geo || !geo.reach) return;
    var b = document.createElement('span');
    b.className = 'sim-burst';
    b.textContent = '到達！';
    b.style.left = geo.reach.x + 'px';
    b.style.top = geo.reach.y + 'px';
    box.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 1700);
  }
  function play() {
    if (anim) { render(); return; }  // 再生中に押したら、とめて元の期間にもどす（render が stopPlay を呼ぶ）
    var s = read();
    if (!s) return;
    state = s;
    hideTip();
    var target = s.years * 12;
    var dur = Math.min(6000, Math.max(2500, s.years * 170));
    var reduce = reducedMotion();
    var reach = monthsToReach(s.target, s.now, s.pmt, s.rate);
    var t0 = null, prev = 0;
    root.classList.add('is-playing');
    playBtn.setAttribute('aria-pressed', 'true');
    playLabel.textContent = 'とめる';
    function frame(now) {
      if (t0 === null) t0 = now;
      var f = Math.min(1, (now - t0) / dur);
      // 動きを減らす設定のときは、5年ずつ進める
      var m = reduce ? Math.min(target, Math.max(12, Math.ceil(f * target / 60) * 60)) : Math.max(1, f * target);
      if (f >= 1) m = target;
      slider.value = String(Math.max(1, Math.round(m / 12)));
      setFill(Math.max(1, m / 12));
      draw(s, m);
      paint(s, m, false);
      if (reach && prev < reach && m >= reach) burst();
      prev = m;
      if (f < 1) { anim.raf = requestAnimationFrame(frame); return; }
      anim = null;
      root.classList.remove('is-playing');
      playBtn.setAttribute('aria-pressed', 'false');
      playLabel.textContent = 'もう一度再生';
      slider.value = String(s.years);
      layout(); setFill(); draw(s, target); paint(s, target, true);
      announce();
    }
    anim = { raf: requestAnimationFrame(frame), years: s.years, keep: false };
  }
  playBtn.addEventListener('click', play);

  // ---- くらべる ----
  var cmpBtns = Array.prototype.slice.call(root.querySelectorAll('[data-compare]'));
  cmpBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-compare');
      compare = compare === key ? null : key;
      cmpBtns.forEach(function (o) { o.setAttribute('aria-pressed', String(o.getAttribute('data-compare') === compare)); });
      render();
    });
  });

  // ---- つまみ・グラフをなぞる ----
  slider.addEventListener('input', function () {
    if (anim) anim.keep = true;
    if (state) endAge = state.age + Number(slider.value);  // 「何歳まで」を覚えておく
    render();
    playLabel.textContent = '今から育つ様子を再生';
  });
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
    if (!geo || anim) return;
    if (dragging === e.pointerId) { setYears(yearAt(e.clientX)); hideTip(); return; }
    if (e.pointerType === 'mouse') showTip(yearAt(e.clientX));
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
    var y = Math.max(1, Math.min(maxYears, Math.round(t)));
    if (String(y) === slider.value && !anim) return;
    if (anim) anim.keep = true;
    slider.value = String(y);
    if (state) endAge = state.age + y;
    render();
  }

  // マウスでなぞったときの吹き出し（値はいつも上の数字と表でも見られる）
  function showTip(t) {
    if (!state || !geo.pts) return;
    var k = Math.round(t);
    var q = geo.pts[k];
    if (k < 0 || !q || q.t !== k) { hideTip(); return; }
    var x = xOf(k);
    hover.setAttribute('x1', x); hover.setAttribute('x2', x); hover.setAttribute('visibility', 'visible');
    tip.textContent = '';
    var head = document.createElement('p'); head.className = 'sim-tip-head'; head.textContent = when(state.age, k * 12);
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
    var left = x + 12;
    if (left + tw > bw) left = x - 12 - tw;
    tip.style.left = Math.max(0, left) + 'px';
    tip.style.top = '10px';
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
      $(b.getAttribute('data-set')).value = b.getAttribute('data-value');
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
    root.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
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
    root.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });

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
  var resizeTimer, lastWidth = box.clientWidth;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (box.clientWidth !== lastWidth) { lastWidth = box.clientWidth; render(); } }, 80);
  });

  syncRate();
  render();
  fire();
  budget();
  openFromHash();
}());
