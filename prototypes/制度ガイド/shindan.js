(function () {
  'use strict';
  var SG = window.SG, D = SG.D, el = SG.el;
  var app = document.getElementById('dx');
  if (!app) return;

  var Q = [
    { id: 'age', title: '年齢は？', hint: '年金やiDeCo、60歳からの給付で変わります。',
      opts: [['u60', '59歳まで'], ['a60', '60〜64歳'], ['a65', '65歳以上']] },
    { id: 'life', multi: true, title: 'いまのくらしに当てはまるものは？', hint: '当てはまるものを全部えらんでください。',
      opts: [['kaishain', '会社員・公務員'], ['part', 'パート・アルバイト'], ['jieigyo', '自営業・フリーランス'], ['nenkin', '年金を受け取っている'], ['shitsugyo', '仕事を探している']] },
    { id: 'family', multi: true, exclusive: 'none', title: '家族のことで当てはまるものは？', hint: 'なければ「当てはまらない」をえらんでください。',
      opts: [['ninshin', '妊娠中・出産の予定がある'], ['kosodate', '0〜17歳の子がいる'], ['gakusei_ko', '19〜22歳の学生の子がいる'], ['kaigo', '親などの介護をしている・しそう'], ['none', '当てはまらない']] },
    { id: 'health', title: '通院や薬は、どのくらい？', hint: '家族の分も合わせて考えてください。',
      opts: [['often', 'よく通院する・薬をよく使う'], ['some', 'ときどき'], ['rare', 'ほとんどない']] },
    { id: 'pension', title: '会社に企業年金（DB・企業型DC）はありますか？', hint: 'iDeCoの上限が変わります。給与明細や入社時の資料にのっています。',
      show: function (a) { return (a.life || []).indexOf('kaishain') >= 0; },
      opts: [['yes', 'ある'], ['no', 'ない'], ['unknown', 'わからない']] },
    { id: 'job', title: '今年、仕事を辞めた・変えたことはありますか？', hint: '年末調整があるかどうかが変わります。',
      opts: [['quit', '辞めて、いまは勤めていない'], ['change', '転職した（いまは勤めている）'], ['no', 'ない']] },
    { id: 'koukin', title: '公金受取口座は登録していますか？', hint: '給付金を受け取るための口座です。マイナポータルで登録できます。',
      opts: [['yes', '登録している'], ['no', 'していない'], ['unknown', 'わからない']] },
    { id: 'house', title: '住まいのことで近いものは？',
      opts: [['reform', '持ち家で、リフォームを考えている'], ['buy', 'これから家を買う・建てる'], ['other', 'どちらでもない']] }
  ];

  var answers = SG.store('seido-guide:dx-answers') || {};
  var checks = SG.store('seido-guide:dx-checks') || {};
  var step = 0;
  var first = true; // 開いた直後はフォーカスやスクロールを動かさない

  function visible() { return Q.filter(function (q) { return !q.show || q.show(answers); }); }
  function answered(q) { var v = answers[q.id]; return q.multi ? (v && v.length) : !!v; }
  function allAnswered() { return visible().every(answered); }

  var toast = el('p', 'dx-toast');
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  var tt;
  function say(msg) { toast.textContent = msg; clearTimeout(tt); tt = setTimeout(function () { toast.textContent = ''; }, 3000); }

  function arrow() {
    var s = '<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>';
    var span = el('span'); span.innerHTML = s; return span.firstChild;
  }

  function renderQuestion() {
    var qs = visible();
    if (step >= qs.length) { renderResult(); return; }
    var q = qs[step];
    app.innerHTML = '';
    var prog = el('div', 'dx-progress');
    prog.appendChild(el('span', null, '質問 ' + (step + 1) + ' / ' + qs.length));
    var bar = document.createElement('progress');
    bar.max = qs.length; bar.value = step + 1;
    bar.setAttribute('aria-label', '進み具合');
    prog.appendChild(bar);
    app.appendChild(prog);

    var cardEl = el('section', 'dx-card');
    var h = el('h2', null, q.title);
    h.tabIndex = -1;
    cardEl.appendChild(h);
    if (q.hint) cardEl.appendChild(el('p', 'dx-hint', q.hint));
    var grid = el('div', 'opt-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', q.title);
    var cur = answers[q.id] || (q.multi ? [] : '');
    q.opts.forEach(function (o) {
      var b = el('button', 'opt' + (q.multi ? '' : ' is-radio'));
      b.type = 'button';
      b.appendChild(el('span', 'box'));
      b.appendChild(el('span', null, o[1]));
      var on = q.multi ? cur.indexOf(o[0]) >= 0 : cur === o[0];
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', function () {
        if (q.multi) {
          var list = (answers[q.id] || []).slice();
          var i = list.indexOf(o[0]);
          if (i >= 0) list.splice(i, 1);
          else {
            if (o[0] === q.exclusive) list = [];
            else if (q.exclusive) list = list.filter(function (x) { return x !== q.exclusive; });
            list.push(o[0]);
          }
          answers[q.id] = list;
          SG.store('seido-guide:dx-answers', answers);
          renderQuestion();
          var again = app.querySelectorAll('.opt')[q.opts.indexOf(o)];
          if (again) again.focus();
        } else {
          answers[q.id] = o[0];
          SG.store('seido-guide:dx-answers', answers);
          step++;
          renderQuestion();
        }
      });
      grid.appendChild(b);
    });
    cardEl.appendChild(grid);

    var nav = el('div', 'dx-nav');
    var back = el('button', 'dx-link', step === 0 ? '' : '← ひとつ前へ');
    back.type = 'button';
    back.hidden = step === 0;
    back.addEventListener('click', function () { step = Math.max(0, step - 1); renderQuestion(); });
    nav.appendChild(back);
    if (q.multi) {
      var next = el('button', 'button');
      next.type = 'button';
      next.appendChild(document.createTextNode(step === qs.length - 1 ? '結果を見る' : '次へ'));
      next.appendChild(arrow());
      next.disabled = !answered(q);
      next.addEventListener('click', function () { if (!answered(q)) return; step++; renderQuestion(); });
      nav.appendChild(next);
    }
    cardEl.appendChild(nav);
    app.appendChild(cardEl);
    if (!first) h.focus({ preventScroll: true });
    first = false;
  }

  function tagsFromAnswers() {
    var t = ['all'];
    if (answers.age === 'a60') t.push('age60');
    if (answers.age === 'a65') t.push('age65');
    (answers.life || []).forEach(function (x) { t.push(x); });
    (answers.family || []).forEach(function (x) { if (x !== 'none') t.push(x); });
    if (answers.health === 'often' || answers.health === 'some') t.push('iryo');
    if (answers.job === 'quit' && t.indexOf('shitsugyo') < 0) t.push('shitsugyo');
    if (answers.house === 'reform') t.push('jutaku_reform');
    if (answers.house === 'buy') t.push('jutaku_buy');
    return t;
  }

  // 同じ制度が「改正」と「給付金」の両方にあるときは、給付金の説明を使う
  var DUP = { kougaku_nenkan: 1, shugyosha_shien: 1, nenkin_shienkyufu: 1, kaigo_jutaku: 1, selfmed: 1, kokunen_ikuji: 1, shussan_mushou: 1 };

  function noteFor(id) {
    var life = answers.life || [];
    if (id === 'ideco_limit') {
      if (life.indexOf('kaishain') >= 0) {
        if (answers.pension === 'yes') return '企業年金があるので、上限は「月6.2万円−会社の掛金」です。';
        if (answers.pension === 'no') return '企業年金がないので、12月分から上限は月6.2万円です。';
        return '企業年金があるかで上限が変わります。給与明細や会社の資料で確かめてください。';
      }
      if (life.indexOf('jieigyo') >= 0) return '自営業・フリーランスは、国民年金基金などと合わせて月7.5万円までです。';
    }
    if (id === 'nencho2026') {
      if (answers.job === 'quit') return 'いま勤めていないので、年末調整はありません。来年の確定申告で戻せます（5年さかのぼれます）。';
      if (answers.job === 'change') return '転職した人は、前の会社の源泉徴収票を今の会社に出すと、年末調整でまとめて計算されます。';
    }
    if ((id === 'shugyosha' || id === 'shugyosha_shien') && answers.koukin !== 'yes') {
      return '公金受取口座がまだなら、マイナポータルで登録しておくと、申請なしで受け取れる仕組みです。';
    }
    return '';
  }

  function collect() {
    var tags = tagsFromAnswers();
    var out = { todo: [], know: [], wait: [] };
    D.items.forEach(function (i) {
      if (DUP[i.id] || !SG.matches(i, tags)) return;
      var r = { id: i.id, name: i.name, when: SG.whenText(i), text: i.amount, action: i.action, loss: i.loss, status: i.status, sources: i.sources };
      if (i.status !== '決定') out.wait.push(r);
      else if (i.todo) out.todo.push(r);
      else out.know.push(r);
    });
    D.benefits.forEach(function (b) {
      if (!SG.matches(b, tags)) return;
      var r = { id: b.id, name: b.name, when: '窓口：' + b.where, text: b.amount, action: b.action, loss: b.loss, status: b.status || '決定', sources: b.sources };
      if (r.status !== '決定') out.wait.push(r); else out.todo.push(r);
    });
    return out;
  }

  function itemEl(r, withTodo) {
    var li = el('li', 'dx-item' + (withTodo && checks[r.id] ? ' is-done' : ''));
    var head = el('div', 'dx-item-head');
    head.appendChild(el('h4', null, r.name));
    head.appendChild(SG.statusEl(r.status));
    li.appendChild(head);
    if (r.when) li.appendChild(el('p', 'sg-when', r.when));
    li.appendChild(el('p', null, r.text));
    var note = noteFor(r.id);
    if (note) li.appendChild(el('p', 'dx-note', note));
    if (withTodo && r.action) {
      var row = el('div', 'todo');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'chk-' + r.id;
      cb.checked = !!checks[r.id];
      var lab = el('label', null, 'やること：' + r.action);
      lab.htmlFor = cb.id;
      cb.addEventListener('change', function () {
        if (cb.checked) checks[r.id] = true; else delete checks[r.id];
        li.classList.toggle('is-done', cb.checked);
        SG.store('seido-guide:dx-checks', checks);
        updateCounts();
      });
      row.appendChild(cb); row.appendChild(lab);
      li.appendChild(row);
    } else if (r.action) {
      li.appendChild(el('p', null, 'やること：' + r.action));
    }
    if (r.loss) li.appendChild(el('p', 'dx-note', '損する点：' + r.loss));
    li.appendChild(SG.sourcesEl(r.sources));
    return li;
  }

  var countLine;
  var lastResult;
  function updateCounts() {
    if (!countLine || !lastResult) return;
    var done = lastResult.todo.filter(function (r) { return checks[r.id]; }).length;
    countLine.textContent = 'やること ' + lastResult.todo.length + '件のうち ' + done + '件 済み';
  }

  function resultText(res) {
    var lines = ['【あなたに関係しそうな制度】（2026年10月5日時点・おかねの地図）'];
    function block(title, list, withAction) {
      if (!list.length) return;
      lines.push('', '■' + title);
      list.forEach(function (r) {
        lines.push('・' + r.name + (withAction && r.action ? '：' + r.action : ''));
        var n = noteFor(r.id); if (n) lines.push('　' + n);
      });
    }
    block('やること', res.todo, true);
    block('知っておくこと', res.know, false);
    block('決まったら確かめること（法案・検討中）', res.wait, false);
    lines.push('', '※目安です。手続きの前に、市区町村・勤め先・年金事務所などの窓口で確かめてください。');
    return lines.join('\n');
  }

  function renderResult() {
    var res = collect();
    lastResult = res;
    app.innerHTML = '';
    var sum = el('section', 'dx-summary');
    sum.setAttribute('aria-labelledby', 'dx-result-title');
    var h = el('h2', null, 'あなたに関係しそうな制度は ' + (res.todo.length + res.know.length + res.wait.length) + '件');
    h.id = 'dx-result-title';
    h.tabIndex = -1;
    sum.appendChild(h);
    var counts = el('div', 'counts');
    counts.appendChild(el('span', null, 'やること ' + res.todo.length));
    counts.appendChild(el('span', null, '知っておくこと ' + res.know.length));
    counts.appendChild(el('span', null, '決まったら ' + res.wait.length));
    sum.appendChild(counts);
    countLine = el('p', null, '');
    sum.appendChild(countLine);
    var tools = el('div', 'dx-tools');
    var copyBtn = el('button', 'is-primary', '結果をコピー');
    copyBtn.type = 'button';
    var sheet = el('div', 'copy-sheet');
    sheet.hidden = true;
    var ta = document.createElement('textarea');
    ta.id = 'dx-copy-text';
    ta.readOnly = true;
    ta.setAttribute('aria-label', 'コピーする文章');
    sheet.appendChild(el('p', null, '自動でコピーできませんでした。下の文字を長押しして「コピー」を選んでください。'));
    sheet.appendChild(ta);
    copyBtn.addEventListener('click', function () {
      var text = resultText(res);
      function fallback() { ta.value = text; sheet.hidden = false; ta.focus(); ta.select(); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { say('結果をコピーしました。メモやLINEに貼れます。'); }, fallback);
      } else fallback();
    });
    var edit = el('button', null, '答えを直す');
    edit.type = 'button';
    edit.addEventListener('click', function () { step = 0; renderQuestion(); });
    var reset = el('button', null, '最初から');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      answers = {}; checks = {};
      SG.store('seido-guide:dx-answers', answers); SG.store('seido-guide:dx-checks', checks);
      step = 0; renderQuestion();
    });
    tools.appendChild(copyBtn); tools.appendChild(edit); tools.appendChild(reset);
    sum.appendChild(tools);
    sum.appendChild(sheet);
    app.appendChild(sum);

    function section(title, lead, list, withTodo) {
      if (!list.length) return;
      var s = el('section', 'dx-section');
      s.appendChild(el('h3', null, title));
      if (lead) s.appendChild(el('p', null, lead));
      var ul = el('ul', 'dx-list');
      list.forEach(function (r) { ul.appendChild(itemEl(r, withTodo)); });
      s.appendChild(ul);
      app.appendChild(s);
    }
    section('やること（手続きが要るもの）', '済んだらチェック。チェックはこの端末の中だけに残ります。', res.todo, true);
    section('知っておくこと（手続きはいらない）', '', res.know, false);
    section('決まったら確かめること', '法律がまだ通っていない・検討中のものです。決まったら内容が変わることがあります。', res.wait, false);
    if (!res.todo.length && !res.know.length && !res.wait.length) {
      app.appendChild(el('p', 'sg-empty', '当てはまる制度が見つかりませんでした。「答えを直す」から選び直してみてください。'));
    }
    updateCounts();
    if (!first) { h.focus({ preventScroll: true }); app.scrollIntoView({ block: 'start' }); }
    first = false;
  }

  if (allAnswered() && Object.keys(answers).length) renderResult();
  else renderQuestion();
}());
