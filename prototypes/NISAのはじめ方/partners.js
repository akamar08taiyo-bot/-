/*
  証券会社とあわせて作ると便利なカード・銀行（broker-config.js の各社の card・bank）。
  診断の結果と、申し込みサポートの「お金の入れ方を決める」で使う。
  applyUrl（ASPの広告リンク）が入っているものだけ出す。どれも空なら、何も出さない。リンクには PR の印をつける。
*/
window.OKANE_PARTNERS = (function () {
  'use strict';
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  // b：証券会社。hasCard：そのカードをもう持っている（診断で答えた）ときは true にして、カードは出さない
  function block(b, hasCard) {
    var items = [];
    if (b && b.card && b.card.applyUrl && !hasCard) items.push({ why: b.card.why || 'クレカ積立に使うカード', item: b.card, verb: 'を申し込む' });
    if (b && b.bank && b.bank.applyUrl) items.push({ why: b.bank.why, item: b.bank, verb: 'の口座を開く' });
    if (!items.length) return null;
    var box = el('div', 'partner-offers');
    box.appendChild(el('strong', null, 'あわせて作ると便利'));
    var ul = el('ul', 'partner-list');
    items.forEach(function (x) {
      var li = el('li');
      if (x.why) li.appendChild(el('span', 'partner-why', x.why));
      var a = el('a', 'text-link partner-link');
      a.href = x.item.applyUrl;
      a.target = '_blank';
      a.rel = 'sponsored noopener';
      a.appendChild(document.createTextNode(x.item.name + x.verb));
      a.appendChild(el('span', 'pr-tag', 'PR'));
      a.setAttribute('aria-label', x.item.name + x.verb + '（新しいタブ・PR）');
      li.appendChild(a);
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }
  return { block: block };
}());
