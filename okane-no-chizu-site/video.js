/*
  動画を、このページの中で再生する（入口・申し込みサポート・特典の一覧で使う。見た目は video.css）。
  ・open(動画, 題, 表紙, 押したボタン) … 1本だけ（口座の作り方の動画など）
  ・openList(章の一覧, 何番目から, 題, 押したボタン) … 章ごとの動画（特典2のガイドなど）。下の章ボタンで切り替え、
    1章が終わると次の章へ進む。章の src を配列にすると、分けて置いたファイルを順に続けて再生する（プレビュー用）
  ・bind(リンク, 題, 表紙) … 動画ファイルへのリンクを、押したらこの画面で開くようにする。YouTube などは新しいタブで開く
  再生画面の下には、いつも「© おかねの地図・無断転載禁止」を出す。「利用規約」を押すと、下の TERMS（著作権・禁止していること）が画面いっぱいに開く。
*/
window.OKANE_VIDEO = (function () {
  'use strict';
  var FILE = /\.(mp4|webm|m4v)(\?|#|$)/i;
  var dlg = null, player = null, heading = null, nav = null, opener = null;
  var terms = null, termsBtn = null;
  var list = [], cur = 0, part = 0;

  // 動画の利用規約。運営者の名前と連絡先は、about.html の「運営者とお問い合わせ」と同じにする（変えるときは両方）
  var TERMS = {
    title: '動画の利用規約（著作権について）',
    lead: 'この動画を見る前にお読みください。動画を見た方は、この内容に同意したものとして扱います。',
    sections: [
      { h: '権利について', p: [
        'この動画（映像・音声・台本・イラスト・図・字幕をふくみます）の著作権は、「おかねの地図」の運営者（久保）または正当な権利を持つ方にあります。',
        'このサイトで見られるようにしていることは、権利をゆずることや、ほかの使い方を許すことではありません。'] },
      { h: 'できること', ul: [
        'このサイトで、ご自身で見て学ぶこと',
        'このページのURLを、家族や友人に伝えること（リンクでの紹介は歓迎です）',
        '法律で認められた範囲での引用（出典として「おかねの地図」とこのページのURLを書いてください）'] },
      { h: '禁止していること', p: ['許可なく、次のことをしないでください。'], ol: [
        '動画をダウンロード・録画・録音して、SNS・動画サイト（YouTube・Instagram・X など）・ブログ・まとめサイトなどに載せること（転載・再アップロード）',
        '切り抜き、字幕や音声の差し替え、AIなどを使った作り替えなど、動画を変えて使うこと',
        '自分（自社）が作った動画のように見せること、「おかねの地図」や運営者を名乗ること（なりすまし）',
        '動画のファイルを人に送ったり配ったりすること、ほかのサイトに直接埋め込むこと',
        '動画を売ること、有料の講座・会員サイト・特典などに使うこと',
        'そのほか、法律で認められた範囲をこえて使うこと'] },
      { h: '違反を見つけたとき', p: [
        '動画サイト・SNSへの削除の申し立て、発信者情報の開示請求、差止めや損害賠償の請求、刑事告訴など、法的な手続きをとります。',
        '著作権の侵害は、10年以下の拘禁刑または1000万円以下の罰金（またはその両方）の対象になることがあります（著作権法119条）。'] },
      { h: '見かけたら教えてください', p: [
        'この動画を公開しているのは、このサイトと「おかねの地図」の公式アカウントだけです。ほかの所で見かけたら、お知らせください。',
        'お問い合わせ：aka.mar08.taiyo＠gmail.com（「＠」を半角の「@」に変えて送ってください）'] },
      { h: '使いたいときは', p: [
        '上の「禁止していること」にあたる使い方をしたいときは、先にお問い合わせください。メールなどの書面で許可したときだけ使えます。'] }
    ],
    date: '2026年10月8日 制定　おかねの地図（運営者：久保）'
  };

  function isFile(src) { return FILE.test(src || ''); }
  function partsOf(item) { return [].concat(item.src); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // 利用規約の画面（はじめは隠しておき、「利用規約」で開く）
  function buildTerms() {
    terms = el('div', 'video-dialog-terms');
    terms.id = 'video-dialog-terms';
    terms.hidden = true;
    terms.tabIndex = -1;
    terms.setAttribute('role', 'region');
    terms.setAttribute('aria-labelledby', 'video-dialog-terms-title');
    var inner = el('div', 'video-dialog-terms-inner');
    var head = el('div', 'video-dialog-terms-head');
    var title = el('h2', null, TERMS.title);
    title.id = 'video-dialog-terms-title';
    var close = el('button', 'video-dialog-close', '閉じる');
    close.type = 'button';
    close.addEventListener('click', function () { hideTerms(true); });
    head.appendChild(title);
    head.appendChild(close);
    inner.appendChild(head);
    inner.appendChild(el('p', 'video-dialog-terms-lead', TERMS.lead));
    TERMS.sections.forEach(function (s) {
      inner.appendChild(el('h3', null, s.h));
      (s.p || []).forEach(function (t) { inner.appendChild(el('p', null, t)); });
      ['ul', 'ol'].forEach(function (tag) {
        if (!s[tag]) return;
        var listEl = el(tag);
        s[tag].forEach(function (t) { listEl.appendChild(el('li', null, t)); });
        inner.appendChild(listEl);
      });
    });
    inner.appendChild(el('p', 'video-dialog-terms-date', TERMS.date));
    var back = el('button', 'video-dialog-terms-back', '閉じて動画にもどる');
    back.type = 'button';
    back.addEventListener('click', function () { hideTerms(true); });
    inner.appendChild(back);
    terms.appendChild(inner);
    return terms;
  }

  // 開いている間は、動画を止めて、うしろの再生画面を押せないようにする
  function showTerms() {
    player.pause();
    Array.prototype.forEach.call(dlg.children, function (c) { if (c !== terms) c.inert = true; });
    terms.hidden = false;
    terms.scrollTop = 0;
    termsBtn.setAttribute('aria-expanded', 'true');
    terms.focus();
  }

  function hideTerms(refocus) {
    if (!terms || terms.hidden) return;
    terms.hidden = true;
    Array.prototype.forEach.call(dlg.children, function (c) { c.inert = false; });
    termsBtn.setAttribute('aria-expanded', 'false');
    if (refocus) termsBtn.focus();
  }

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'video-dialog';
    dlg.setAttribute('aria-labelledby', 'video-dialog-title');
    var bar = document.createElement('div');
    bar.className = 'video-dialog-bar';
    heading = document.createElement('strong');
    heading.id = 'video-dialog-title';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'video-dialog-close';
    close.textContent = '閉じる';
    close.addEventListener('click', function () { dlg.close(); });
    bar.appendChild(heading);
    bar.appendChild(close);
    player = document.createElement('video');
    player.className = 'video-dialog-player';
    player.controls = true;
    player.setAttribute('playsinline', '');
    player.preload = 'metadata';
    // 転載をしにくくする：再生画面の「ダウンロード」（Chrome など）と、右クリックの「動画を保存」を出さない
    player.setAttribute('controlslist', 'nodownload');
    player.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    nav = document.createElement('div');
    nav.className = 'video-dialog-chapters';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', '章をえらぶ');
    // 著作権の表示と、利用規約を開くボタン
    var legal = el('div', 'video-dialog-legal');
    legal.appendChild(el('small', null, '© おかねの地図・無断転載禁止'));
    termsBtn = el('button', 'video-dialog-terms-open', '利用規約');
    termsBtn.type = 'button';
    termsBtn.setAttribute('aria-expanded', 'false');
    termsBtn.setAttribute('aria-controls', 'video-dialog-terms');
    termsBtn.addEventListener('click', showTerms);
    legal.appendChild(termsBtn);
    dlg.appendChild(bar);
    dlg.appendChild(player);
    dlg.appendChild(nav);
    dlg.appendChild(legal);
    dlg.appendChild(buildTerms());
    // 利用規約を開いているときの Esc は、利用規約だけを閉じる
    dlg.addEventListener('cancel', function (e) {
      if (terms.hidden) return;
      e.preventDefault();
      hideTerms(true);
    });
    // 終わったら、分けて置いた続きのファイル → 次の章 の順に進む
    player.addEventListener('ended', function () {
      if (part + 1 < partsOf(list[cur]).length) load(cur, part + 1);
      else if (cur + 1 < list.length) load(cur + 1, 0);
    });
    // 閉じたら止めて、読み込みもやめる（裏で音が鳴り続けないように）
    dlg.addEventListener('close', function () {
      hideTerms(false);
      player.pause();
      player.removeAttribute('src');
      player.load();
      if (opener) opener.focus();
    });
    // 再生画面の外（暗いところ）を押しても閉じる
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }

  function load(i, p) {
    cur = i;
    part = p;
    var item = list[i];
    if (item.poster && p === 0) player.setAttribute('poster', item.poster); else player.removeAttribute('poster');
    player.src = partsOf(item)[p];
    Array.prototype.forEach.call(nav.children, function (b, k) {
      if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var started = player.play();
    if (started && started.catch) started.catch(function () { /* 自動で始まらないときは、再生ボタンを押してもらう */ });
  }

  function openList(items, start, title, from) {
    if (!dlg) build();
    list = items;
    opener = from || null;
    heading.textContent = title;
    nav.textContent = '';
    nav.hidden = items.length < 2;
    dlg.classList.toggle('has-chapters', items.length > 1);
    items.forEach(function (item, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'video-dialog-chapter';
      var label = document.createElement('b');
      label.textContent = item.label || '';
      var name = document.createElement('span');
      name.textContent = item.name || '';
      b.appendChild(label);
      b.appendChild(name);
      b.addEventListener('click', function () { load(k, 0); });
      nav.appendChild(b);
    });
    dlg.showModal();
    load(start || 0, 0);
  }

  function open(src, title, poster, from) {
    openList([{ src: src, poster: poster }], 0, title, from);
  }

  // a は <a href="動画の場所">。動画ファイルなら、押したときにこのページの中で開く
  function bind(a, title, poster) {
    if (!isFile(a.getAttribute('href')) || typeof HTMLDialogElement !== 'function') {
      a.target = '_blank';
      a.rel = 'noopener';
      return a;
    }
    a.addEventListener('click', function (e) {
      e.preventDefault();
      open(a.getAttribute('href'), title, poster, a);
    });
    return a;
  }

  return { isFile: isFile, open: open, openList: openList, bind: bind };
}());
