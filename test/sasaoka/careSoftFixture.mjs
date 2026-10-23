// 介護ソフト（パソコンの業務ソフト）のお客様の欄の見本（ブラウザのテスト e2e-caresoft.mjs で描いてスクリーンショットにする）。
// 形だけをまねたもの：白い地・小さな灰色のラベルのうしろに太い大きな値。お客様・担当・事業所・番号はどれも架空（見本・0000）。
// ユーザーにいただいた画面の個人情報はダミーで「絶対に参考にしない」の指示（2026-10-23）なので、値はここで作ったものだけを使う

/** 見本の値（変えたいものだけ渡す） */
export const SOFT_SAMPLE = {
  name: '見本　春子',
  kana: 'ﾐﾎﾝ ﾊﾙｺ',
  birth: '昭和17年5月6日生',
  age: '84歳',
  gender: '女',
  office: '行橋営業所',
  staff: '見本 太郎',
  zip: '824-0000',
  address: '福岡県行橋市見本町1丁目2-3',
  tel: '0930000000',
  mobile: '',
  careOffice: '見本ケアプランセンター',
  careManager: '見本 一郎',
  careTel: '0930-00-1111',
  care: '要介護2',
  term: '令和07年10月22日 〜 令和08年10月31日',
  insurer: '行橋市',
  insuredNo: '0000987654',
  kind: '高額２割',
  rate: '80%',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * 介護ソフトのお客様の欄の HTML。opt.label・opt.value：ラベル・値の字の大きさ（px）、opt.font：字体、opt.width：欄の幅（px）
 */
export function softHtml(values = {}, opt = {}) {
  const v = {...SOFT_SAMPLE, ...values};
  const lp = opt.label ?? 10;
  const vp = opt.value ?? 14;
  const font = opt.font ?? "'IPAPGothic', 'IPAGothic', sans-serif";
  const L = (t) => `<span class="l">${esc(t)}</span>`;
  const V = (t, cls = '') => `<span class="v ${cls}">${esc(t)}</span>`;
  const pin = `<span class="pin" aria-hidden="true"><svg width="${vp}" height="${vp}" viewBox="0 0 16 16"><path d="M8 1a5 5 0 0 0-5 5c0 4 5 9 5 9s5-5 5-9a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="#d33"/></svg></span>`;
  const info = (label, body) => `<div class="info">${L(label)}<span class="body">${body}</span></div>`;
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #e9edf2; }
    .panel { width: ${opt.width ?? 600}px; background: #fff; padding: 8px 12px 10px; font-family: ${font}; color: #1f2937; border: 1px solid #c8ced6; }
    .row { display: flex; align-items: baseline; gap: ${Math.round(vp * 0.55)}px; margin: 3px 0; white-space: nowrap; }
    .l { font-size: ${lp}px; color: #7b8494; font-weight: normal; }
    .v { font-size: ${vp}px; font-weight: bold; }
    .big { font-size: ${Math.round(vp * 1.15)}px; }
    .kana { font-size: ${lp}px; color: #4b5563; margin-top: 6px; }
    .pin { display: inline-flex; border: 1px solid #b8c0cc; border-radius: 3px; padding: 1px 3px; background: #f7f8fa; align-self: center; margin-left: ${vp}px; }
    .memo { font-size: ${lp}px; color: #7b8494; margin: 6px 0 4px; }
    .task { background: #3f9b52; color: #fff; font-size: ${lp + 1}px; padding: 3px 8px; margin: 6px 0 2px; }
    .pager { font-size: ${lp}px; color: #6b7280; text-align: right; margin-bottom: 6px; }
    .info { display: flex; align-items: baseline; gap: ${Math.round(vp * 0.7)}px; border-top: 1px solid #dfe3e8; padding: 5px 0; white-space: nowrap; }
    .info > .l { width: ${Math.round(lp * 8)}px; flex: none; }
    .body { display: flex; align-items: baseline; gap: ${Math.round(vp * 0.55)}px; }
  </style>
  <div class="panel">
    <div class="row">${V(v.name)}${V('様')}${V(v.birth)}${V(v.age)}${V(v.gender)}</div>
    <div class="row">${L('部署')}${V(v.office)}${V(v.office)}<span style="width:${vp}px"></span>${L('営業')}${V(v.staff)}</div>
    <div class="kana">${esc(v.kana)}</div>
    <div class="row">${V(v.name, 'big')}${V('様', 'big')}</div>
    <div class="row">${L('〒')}${V(v.zip)}${V(v.address)}${pin}</div>
    <div class="row">${L('Tel')}${L('電話番号')}${V(v.tel)}<span style="width:${vp}px"></span>${L('携帯電話')}${V(v.mobile)}</div>
    <div class="memo">メモ</div>
    <div class="task">タスク 0件</div>
    <div class="pager">◀ 1 / 1 ▶</div>
    ${info('レンタル受注情報', `${L('受注残')}${V('0件')}`)}
    ${info('販売受注情報', `${L('受注残')}${V('0件')}`)}
    ${info('入金情報', `${L('長期滞納')}${V('無し')}`)}
    ${info('支払情報', `${L('レンタル')}${V('口座振替')}${L('販売')}${V('現金')}`)}
    ${info('モニタリング', `${V('済')}${L('次回予定')}${V('令和07年11月')}${L('周期')}${V('6ヶ月')}`)}
    ${info('居宅情報', `${L('委託先居宅')}${V(v.careOffice)}${V(v.careManager)}${L('Tel')}${V(v.careTel)}`)}
    ${info('認定情報', `${V(v.care)}${L('認定期間')}${V(v.term)}`)}
    ${info('保険者情報', `${V(v.insurer)}${L('被保険者番号')}${V(v.insuredNo)}`)}
    ${info('給付情報', `${V(v.kind)}${L('保険給付率')}${V(v.rate)}`)}
  </div>`;
}
