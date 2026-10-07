(function () {
  'use strict';
  // 開いたときは、いつもページのいちばん上から（読み込み直したときや戻ったときも、前に見ていた位置を戻さない）。#の付いたリンクで来たときは、その場所へ
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', function () { if (!location.hash) window.scrollTo(0, 0); });
  var cfg = window.OKANE_CHOOSER;
  var root = document.getElementById('chooser');
  var table = document.getElementById('broker-table');
  if (!cfg || !root) return;

  var brokers = cfg.brokers.filter(function (b) { return b.active; });
  var H = root.getAttribute('data-heading') || 'h2';  // 入口のタブの中では h3（そのページの見出しの下に入るため）
  var questions = [
    { key: 'card', title: 'いちばんよく使うクレジットカードは？', hint: '持っていなくても大丈夫です。', options: cfg.cards },
    { key: 'point', title: 'ふだんの買い物で、よく使うのは？', hint: 'ポイントがたまる場所を思い出してみてください。', options: cfg.points },
    { key: 'style', title: 'いちばん大事にしたいことは？', hint: '迷ったら、いちばん近いものでOKです。', options: cfg.styles }
  ];
  var styleReason = {
    lineup: '買える投資信託の本数が多く、あとから比べて選びやすい',
    simple: '商品やアプリがシンプルで、はじめてでも迷いにくい'
  };
  var answers = {};
  var step = 0;
  var started = false;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }
  function labelOf(list, id) {
    var hit = list.filter(function (o) { return o.id === id; })[0];
    return hit ? hit.label : '';
  }
  function linkFor(b) { return b.applyUrl || b.officialUrl; }
  function arrow() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 12h16m-6-6 6 6-6 6');
    svg.appendChild(path);
    return svg;
  }
  function remember(b, a) {
    a.addEventListener('click', function () { try { localStorage.setItem('okane-map:apply:pick', b.id); } catch (_) { /* なくても開ける */ } });
    return a;
  }
  function applyLink(b, cls, text) {
    var a = el('a', { class: cls, href: linkFor(b), target: '_blank', rel: b.applyUrl ? 'sponsored noopener' : 'noopener noreferrer' });
    a.appendChild(document.createTextNode(text));
    if (b.applyUrl) a.appendChild(el('span', { class: 'pr-tag' }, 'PR'));
    a.appendChild(arrow());
    return a;
  }

  // その会社の口座の作り方の動画（ショート動画作成で作ったもの）。動画を見ながらなら、かんたんに申し込めることを見せる
  function videoBlock(b) {
    if (!b.video && !b.videoSoon) return null;
    var box = el('div', { class: 'result-howto' + (b.video ? '' : ' is-soon') });
    box.appendChild(el('strong', { class: 'howto-title' }, '動画のとおりに進めるだけ'));
    box.appendChild(el('p', { class: 'howto-lead' }, b.name + 'の口座の作り方（登録方法）を、申し込み画面の順に動画で見せます' + (b.videoLength ? '（' + b.videoLength + '）' : '') + '。'));
    if (!b.video) {
      var soon = el('p', { class: 'howto-soon' });
      var icon = el('span', { class: 'howto-play', 'aria-hidden': 'true' }, '▶');
      soon.appendChild(icon);
      soon.appendChild(document.createTextNode('動画は準備中です'));
      box.appendChild(soon);
      return box;
    }
    if (/\.(mp4|webm|m4v)(\?|#|$)/i.test(b.video)) {
      // サイトに置いた動画ファイル：この場でそのまま再生
      var player = el('video', { class: 'howto-player', src: b.video, controls: '', playsinline: '', preload: 'metadata' });
      if (b.videoPoster) player.setAttribute('poster', b.videoPoster);
      player.setAttribute('aria-label', b.name + 'の口座の作り方の動画');
      box.appendChild(player);
    } else {
      // YouTube など：新しいタブで開く
      var link = el('a', { class: 'button howto-open', href: b.video, target: '_blank', rel: 'noopener' });
      link.appendChild(el('span', { class: 'howto-play', 'aria-hidden': 'true' }, '▶'));
      link.appendChild(document.createTextNode('動画を見る' + (b.videoLength ? '（' + b.videoLength + '）' : '')));
      box.appendChild(link);
    }
    return box;
  }

  function score(b) {
    var s = 0, reasons = [];
    var weight = answers.style === 'points' ? 2 : 1;
    if (answers.card !== 'none' && b.cards.indexOf(answers.card) >= 0) {
      s += 3 * weight;
      reasons.push(labelOf(cfg.cards, answers.card) + 'で、クレカ積立ができる（ポイントの付き方はカードの種類で変わります）');
    }
    if (answers.point !== 'none' && b.points.indexOf(answers.point) >= 0) {
      s += 2 * weight;
      reasons.push('ふだん使う「' + labelOf(cfg.points, answers.point) + '」とつながる');
    }
    if (b.styles.indexOf(answers.style) >= 0 && styleReason[answers.style]) {
      s += 1;
      reasons.push(styleReason[answers.style]);
    }
    return { broker: b, score: s, reasons: reasons };
  }

  function rank() {
    var list = brokers.map(score);
    // 点数が同じなら設定ファイルの並び順を優先する
    list.sort(function (a, b) { return b.score - a.score || brokers.indexOf(a.broker) - brokers.indexOf(b.broker); });
    if (list[0].score === 0) {
      var lineup = list.filter(function (r) { return r.broker.styles.indexOf('lineup') >= 0; })[0] || list[0];
      lineup.reasons = [lineup.broker.styles.indexOf('lineup') >= 0 ? styleReason.lineup : 'NISAで投資信託の積立ができる'];
      list = [lineup].concat(list.filter(function (r) { return r !== lineup; }));
    }
    return list;
  }

  function progress(current, total, label) {
    var wrap = el('div', { class: 'quiz-progress' });
    wrap.appendChild(el('span', null, label));
    var bar = el('progress', { max: String(total), value: String(current), 'aria-hidden': 'true' });
    wrap.appendChild(bar);
    return wrap;
  }

  function renderQuestion() {
    var q = questions[step];
    root.textContent = '';
    root.appendChild(progress(step + 1, questions.length + 1, '質問 ' + (step + 1) + ' / ' + questions.length));
    var card = el('div', { class: 'quiz-card' });
    var h = el(H, { tabindex: '-1', id: 'quiz-heading' }, q.title);
    card.appendChild(h);
    card.appendChild(el('p', { class: 'quiz-hint' }, q.hint));
    var grid = el('div', { class: 'option-grid', role: 'group', 'aria-labelledby': 'quiz-heading' });
    q.options.forEach(function (o) {
      var btn = el('button', { type: 'button', class: 'option-button', 'aria-pressed': String(answers[q.key] === o.id) }, o.label);
      btn.addEventListener('click', function () {
        answers[q.key] = o.id;
        step += 1;
        if (step < questions.length) renderQuestion(); else renderResult();
      });
      grid.appendChild(btn);
    });
    card.appendChild(grid);
    root.appendChild(card);
    var nav = el('div', { class: 'quiz-nav' });
    if (step > 0) {
      var back = el('button', { type: 'button', class: 'link-button' }, 'ひとつ前の質問に戻る');
      back.addEventListener('click', function () { step -= 1; renderQuestion(); });
      nav.appendChild(back);
    }
    root.appendChild(nav);
    if (started) h.focus({ preventScroll: true });
    started = true;
  }

  function renderResult() {
    var list = rank();
    var top = list[0];
    var b = top.broker;
    root.textContent = '';
    root.appendChild(progress(questions.length + 1, questions.length + 1, '診断の結果'));
    var card = el('div', { class: 'result-card' });
    card.appendChild(el('p', { class: 'result-eyebrow' }, 'あなたに合いそうなのは'));
    var h = el(H, { class: 'result-name', tabindex: '-1' });
    h.appendChild(el('a', { href: linkFor(b), target: '_blank', rel: b.applyUrl ? 'sponsored noopener' : 'noopener noreferrer' }, b.name));
    card.appendChild(h);
    var ul = el('ul', { class: 'reason-list' });
    top.reasons.forEach(function (r) { ul.appendChild(el('li', null, r)); });
    card.appendChild(ul);
    var actions = el('div', { class: 'result-actions' });
    actions.appendChild(applyLink(b, 'button', b.name + 'の申し込みページを開く'));
    try { localStorage.setItem('okane-map:apply:pick', b.id); } catch (_) { /* なくても ?b= で渡せる */ }
    card.appendChild(actions);
    var howto = videoBlock(b);
    if (howto) card.appendChild(howto);
    var cardMatched = answers.card !== 'none' && b.cards.indexOf(answers.card) >= 0;
    var note = (cardMatched ? '' : 'カードを持っていなくても口座は作れます。クレカ積立は、あとからカードを作って設定することもできます。') +
      '診断は、このサイトで紹介している証券会社の中から、回答に合う会社を表示しています。';
    card.appendChild(el('p', { class: 'result-note' }, note));
    if (b.cards.length) {
      var ex = el('div', { class: 'point-example' });
      ex.appendChild(el('strong', null, 'クレカ積立でたまるポイントの例'));
      ex.appendChild(el('p', null, '毎月3万円をカードで積み立てた場合：還元率が0.5%なら月150ポイント（年1,800ポイント）、1%なら月300ポイント（年3,600ポイント）。'));
      ex.appendChild(el('p', null, '還元率は、カードの種類や使った金額などの条件で変わります。クレカ積立は毎月10万円までです。'));
      card.appendChild(ex);
    }
    var next = el('div', { class: 'point-example' });
    next.appendChild(el('strong', null, 'このあとの流れ'));
    var ol = el('ol', { class: 'next-list' });
    ['今日：公式サイトで口座を申し込む（約10分・マイナンバーカードとスマホ）', '数日後：ログインの案内が届いたら、パスワードと二段階認証の設定', 'そのあと：毎月の積立額を決めて設定（特典1の資産シミュレーターで決められます）'].forEach(function (t) { ol.appendChild(el('li', null, t)); });
    next.appendChild(ol);
    card.appendChild(next);
    root.appendChild(card);

    var second = list[1];
    if (second) {
      var more = el('p', { class: 'result-more' });
      more.appendChild(document.createTextNode('ほかの候補：'));
      more.appendChild(remember(second.broker, applyLink(second.broker, 'text-link', second.broker.name + 'の申し込みページ')));
      root.appendChild(more);
    }
    var nav = el('div', { class: 'quiz-nav' });
    var again = el('button', { type: 'button', class: 'link-button' }, 'もう一度答える');
    again.addEventListener('click', function () { answers = {}; step = 0; renderQuestion(); });
    nav.appendChild(again);
    root.appendChild(nav);
    h.focus({ preventScroll: true });
    root.scrollIntoView({ block: 'start' });
  }

  function renderTable() {
    if (!table) return;
    var tbody = table.querySelector('tbody');
    brokers.forEach(function (b) {
      var tr = el('tr');
      var th = el('th', { scope: 'row' });
      th.appendChild(remember(b, applyLink(b, 'table-link', b.name)));  // 会社名を押すと、その会社のページが開く
      tr.appendChild(th);
      tr.appendChild(el('td', null, b.cardText || '―'));
      tr.appendChild(el('td', null, b.pointText || '―'));
      tbody.appendChild(tr);
    });
    var date = document.getElementById('checked-at');
    if (date) date.textContent = cfg.checkedAt;
  }

  if (!brokers.length) {
    root.textContent = '紹介する証券会社が設定されていません（broker-config.js の active を確認してください）。';
    return;
  }
  renderTable();
  renderQuestion();
}());
