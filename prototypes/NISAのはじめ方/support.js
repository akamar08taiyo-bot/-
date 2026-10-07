(function () {
  'use strict';
  // 開いたときは、いつもページのいちばん上から（読み込み直したときや戻ったときも、前に見ていた位置を戻さない）。#の付いたリンクで来たときは、その場所へ
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('pageshow', function () { if (!location.hash) window.scrollTo(0, 0); });
  var cfg = window.OKANE_CHOOSER;
  var root = document.getElementById('apply');
  if (!cfg || !root) return;

  var params = new URLSearchParams(location.search);
  var picked = params.get('b');
  if (!picked) { try { picked = localStorage.getItem('okane-map:apply:pick'); } catch (_) { picked = null; } }
  var broker = cfg.brokers.filter(function (b) { return b.active && b.id === picked; })[0] || null;
  var storeKey = 'okane-map:apply:' + (broker ? broker.id : 'any');

  function read() {
    try { return JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch (_) { return {}; }
  }
  function write(done) {
    try {
      localStorage.setItem(storeKey, JSON.stringify(done));
      if (broker) localStorage.setItem('okane-map:apply:last', broker.id);
    } catch (_) { /* 保存できなくても、チェックリストはこのまま使える */ }
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }
  function p(text) { return el('p', null, text); }
  function list(items) { var ul = el('ul'); items.forEach(function (t) { ul.appendChild(el('li', null, t)); }); return ul; }
  function link(href, text) { var a = el('a', { class: 'text-link', href: href }, text); return el('p', null).appendChild(a).parentNode; }
  function applyButton() {
    var a;
    if (broker) {
      a = el('a', { class: 'button', href: broker.applyUrl || broker.officialUrl, target: '_blank', rel: broker.applyUrl ? 'sponsored noopener' : 'noopener noreferrer' });
      a.appendChild(document.createTextNode(broker.name + 'の申し込みページを開く'));
      if (broker.applyUrl) a.appendChild(el('span', { class: 'pr-tag' }, 'PR'));
    } else {
      a = el('a', { class: 'button', href: 'choose.html' }, 'まず3つの質問で証券会社を決める');
    }
    return a;
  }

  var steps = [
    { phase: 'today', id: 'prep', title: '用意するものをそろえる', time: '約2分',
      body: [p('この4つを手元に置いておくと、途中で止まらずに進めます。'),
        list(['マイナンバーカード（暗証番号を使うことがあります）', 'スマホ（本人確認で使います）', 'すぐ見られるメールアドレス（Gmailなど）', '入金に使う銀行口座（キャッシュカードか通帳があると入力が早い）'])],
      tip: ['マイナンバーカードがないときは？', 'マイナンバーがわかる書類（通知カードや住民票など）と、運転免許証などの本人確認書類を組み合わせて申し込める場合があります。使える書類は会社ごとに違うので、公式サイトの案内を見てください。'] },
    { phase: 'today', id: 'start', title: '公式サイトで申し込みを始める', time: '約1分',
      body: [p('下のボタンから申し込みページを開き、「口座開設」「無料で口座を作る」などのボタンを押します。このページは開いたままにしておくと、あとで戻りやすいです。'), applyButton()] },
    { phase: 'today', id: 'email', title: 'メールアドレスを登録して、届いたメールを開く', time: '約2分',
      body: [p('登録したアドレスに確認のメールが届きます。メールの中のリンクを開くか、書かれている数字（認証コード）を入れて、続きに進みます。'), p('リンクや数字には使える時間が決まっていることがあるので、届いたらすぐに開きましょう。')],
      tip: ['メールが届かないときは？', '迷惑メールのフォルダを見てください。携帯会社のメール（キャリアメール）は届きにくいことがあるので、Gmailなどを使うと安心です。'] },
    { phase: 'today', id: 'info', title: '名前・住所・勤務先などを入力する', time: '約3分',
      body: [p('よく聞かれるのは、次のような項目です。法律で決まっているので、どの会社でも聞かれます。わかる範囲で、正しく入れましょう。'),
        list(['名前・住所・生年月日・電話番号', '職業（会社員・公務員・自営業・パート・学生・主婦／主夫・年金生活 など）', '勤務先の名前と電話番号（会社員の場合）', '年収や金融資産（だいたいの範囲から選ぶ形が多い）', '投資の経験（はじめてなら「なし」でOK）と、投資の目的（「資産形成」「老後の資金」など）'])] },
    { phase: 'today', id: 'account', title: '口座の種類を選ぶ', time: '約1分',
      body: [p('迷ったら、次のとおりに選べば大丈夫です。'),
        list(['「特定口座（源泉徴収あり）」を選ぶ（NISAの外で利益が出たときも、税金の計算と支払いを証券会社がしてくれます）', '「NISA口座を開設する」にチェック（これでNISAが使えます）', '配当金の受け取り方は「株式数比例配分方式」（NISAで買った日本の株の配当を、非課税で受け取るために必要です）'])],
      tip: ['ほかの会社でNISA口座を持っているときは？', 'NISA口座は1人1つです。ほかの会社にある場合は、ここではNISAを申し込めないことがあります。NISAの会社を変える手続きは年単位なので、今の会社にも確認してください。'] },
    { phase: 'today', id: 'identity', title: '本人確認をする', time: '約3分',
      body: [p('選べる方法の例です（会社によって違います）。'),
        list(['スマホでマイナンバーカードを読み取る（早く終わりやすい）', '書類と自分の顔をスマホで撮影する', '書類を郵送する（届くまで1〜2週間かかることがあります）'])],
      tip: ['読み取りがうまくいかないときは？', 'カードをスマホの背面にぴったり当てて、終わるまで動かさないようにします。マイナンバーカードを作ったときに決めた暗証番号が必要になることがあります。'] },
    { phase: 'today', id: 'submitted', title: '申し込み完了の画面やメールを確かめる', time: '約1分',
      body: [p('「申し込みを受け付けました」という画面やメールが出たら完了です。念のため、スクリーンショットを撮っておくと安心です。'), p('ここまでで、今日はおしまい。おつかれさまでした！審査が終わると、ログインの案内が届きます（数日かかることがあります）。')] },
    { phase: 'later', id: 'arrive', title: 'ログインの案内が届いたら、このページに戻る', time: '数日後',
      body: [p('ログインIDや最初のパスワードは、メールや郵送で届きます（会社によって違います）。進み具合はこの端末に保存されているので、届いたらこのページを開いて続きからどうぞ。')] },
    { phase: 'later', id: 'security', title: 'ログインして、守りの設定をする', time: '約5分',
      body: [p('はじめてのログインで、次の2つをしておきます。'), list(['パスワードを、ほかで使っていないものに変える', '二段階認証（多要素認証）をオンにする（ログインのたびに、スマホに届く数字などで本人か確かめる仕組みです）']), link('guide.html#chapter-12', 'お金を守るログイン習慣を読む')],
      tip: ['「ログインしてください」というメールやSMSが届いたら？', 'メールやSMSのリンクからはログインしないのが安全です。公式アプリか、自分でブックマークした公式サイトから開きます。'] },
    { phase: 'later', id: 'funding', title: 'お金の入れ方を決める', time: '約5分',
      body: [p('次のどちらかを選びます。'), list(['クレカ積立：カードを登録して、毎月の金額を決める（クレカ積立は毎月10万円まで）', '銀行から入金：ネットバンキングの「即時入金」を使うと、すぐに反映されることが多い']), p('カードはあとから届いても大丈夫です。届いてから設定しましょう。')] },
    { phase: 'later', id: 'plan', title: '毎月の金額を決めて、積立を設定する', time: '約5分',
      body: [p('設定の例：「つみたて投資枠」で、毎月1万円、毎月1日に買う。ボーナス月の設定はしなくてもOKです。'), p('毎月いくらにするかは、特典1の資産推移アプリで決めた金額を入れます。'), link('goal.html', '特典1で毎月の金額を決める'),
        p('何を買うかは、ガイドで商品の種類と費用の見方を読んで、自分で決めます。このサイトでは、特定の商品はすすめていません。'), link('guide.html#chapter-13', '株式・投資信託・ETFの違いを読む')] },
    { phase: 'later', id: 'done', title: 'はじめての積立を設定できたら完了！', time: '約1分',
      body: [p('あとは、毎日の値動きを見なくても大丈夫。見直しは年に1回、誕生日の月など覚えやすい月に決めておきましょう。'), link('library.html#bonus-10', '年1回のNISA点検シートを見る')] }
  ];
  var phases = {
    today: ['今日やること', 'だいたい10分。7つ終われば、今日はおしまいです。'],
    later: ['届いてからやること', 'ログインの案内が届いたら（数日後）、続きをやります。']
  };

  var done = read();
  var countEl = document.getElementById('apply-count');
  var bar = document.getElementById('apply-bar');
  var nextEl = document.getElementById('apply-next');
  var doneCard = document.getElementById('apply-done');

  var title = document.getElementById('apply-title');
  if (title && broker) title.textContent = broker.name + 'の申し込みを、最後まで一緒に。';
  var videoBox = document.getElementById('broker-video');
  if (videoBox && broker && broker.video) {
    videoBox.appendChild(el('strong', null, '動画を見ながら進められます'));
    var va = el('a', { class: 'text-link', href: broker.video, target: '_blank', rel: 'noopener' },
      broker.name + 'の口座の作り方を動画で見る' + (broker.videoLength ? '（' + broker.videoLength + '）' : ''));
    videoBox.appendChild(el('p', null).appendChild(va).parentNode);
    videoBox.hidden = false;
  }
  var notesBox = document.getElementById('broker-notes');
  if (notesBox && broker && broker.notes && broker.notes.length) {
    notesBox.appendChild(el('strong', null, broker.name + 'のポイント'));
    notesBox.appendChild(list(broker.notes));
    notesBox.hidden = false;
  }
  var pick = document.getElementById('pick-first');
  if (pick && !broker) pick.hidden = false;

  var currentPhase = '';
  var ol = null;
  steps.forEach(function (s, i) {
    if (s.phase !== currentPhase) {
      currentPhase = s.phase;
      var head = el('div', { class: 'phase' });
      head.appendChild(el('h2', null, phases[s.phase][0]));
      head.appendChild(el('p', null, phases[s.phase][1]));
      root.appendChild(head);
      ol = el('ol', { class: 'checklist' });
      root.appendChild(ol);
    }
    var li = el('li', { class: 'check-step', id: 'step-' + s.id });
    var row = el('div', { class: 'check-row' });
    var box = el('input', { type: 'checkbox', id: 'chk-' + s.id });
    box.checked = !!done[s.id];
    var label = el('label', { for: 'chk-' + s.id }, (i + 1) + '. ' + s.title);
    if (s.time) label.appendChild(el('span', { class: 'step-time' }, s.time));
    row.appendChild(box); row.appendChild(label);
    li.appendChild(row);
    var body = el('div', { class: 'check-body' });
    s.body.forEach(function (node) { body.appendChild(node); });
    if (s.tip) {
      var d = el('details');
      d.appendChild(el('summary', null, 'つまずいたら：' + s.tip[0]));
      d.appendChild(el('p', null, s.tip[1]));
      body.appendChild(d);
    }
    li.appendChild(body);
    if (box.checked) li.classList.add('is-done');
    box.addEventListener('change', function () {
      if (box.checked) done[s.id] = true; else delete done[s.id];
      li.classList.toggle('is-done', box.checked);
      write(done);
      update();
    });
    ol.appendChild(li);
  });

  function update() {
    var n = steps.filter(function (s) { return done[s.id]; }).length;
    if (countEl) countEl.textContent = n + ' / ' + steps.length + ' できた';
    if (bar) { bar.max = steps.length; bar.value = n; }
    var next = steps.filter(function (s) { return !done[s.id]; })[0];
    if (nextEl) {
      nextEl.textContent = '';
      if (next) {
        nextEl.appendChild(document.createTextNode('次にやること：'));
        nextEl.appendChild(el('a', { href: '#step-' + next.id }, next.title));
      } else {
        nextEl.textContent = 'ぜんぶできました！';
      }
    }
    if (doneCard) doneCard.hidden = !!next;
  }
  update();

  var resetBtn = document.getElementById('reset-open');
  var resetBox = document.getElementById('reset-confirm');
  if (resetBtn && resetBox) {
    resetBtn.addEventListener('click', function () { resetBox.hidden = false; resetBtn.hidden = true; });
    document.getElementById('reset-yes').addEventListener('click', function () {
      done = {}; write(done);
      root.querySelectorAll('input[type=checkbox]').forEach(function (b) { b.checked = false; });
      root.querySelectorAll('.check-step').forEach(function (li) { li.classList.remove('is-done'); });
      resetBox.hidden = true; resetBtn.hidden = false; update();
    });
    document.getElementById('reset-no').addEventListener('click', function () { resetBox.hidden = true; resetBtn.hidden = false; });
  }
}());
