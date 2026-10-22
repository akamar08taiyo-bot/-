// テスト用の架空の介護保険被保険者証・介護保険負担割合証（国の様式の並び：（一）被保険者・（二）要介護状態区分等・（三）居宅介護支援事業者など）。
// 値はすべて架空（見本）。ブラウザで描いて画像にし、スキャンのように白黒・ざらつき・90°回転にして、読み取りを確かめる（e2e-card.mjs・cardOcr）
// 本物の保険証の画像・値はテストに入れない（ユーザーの指示「個人情報の部分に関しては絶対に記憶しないでください」2026-10-22）

/** 架空の方 */
export const CARD_PERSON = {
  insuredNo: '0000123456',
  zip: '824-0001',
  address: '行橋市中央一丁目1番1号',
  kana: 'ﾐﾎﾝ ﾊﾅｺ',
  name: '見本　花子',
  birth: '昭和13年 4月14日',
  gender: '女',
  issued: '令和 6年 3月 1日',
  insurerNo: '409999',
  insurer: '行 橋 市',
  insurerAddress: '福岡県行橋市中央一丁目1番1号',
  care: '要介護２',
  careDate: '令和 6年 3月 1日',
  careTerm: '令和 6年 4月 1日 ～ 令和 9年 3月31日',
  office: '見本ケアプランセンター',
  officeDate: '令和 6年 4月 1日',
  burden: '１割',
  burdenTerm: ['令和 6年 8月 1日', '令和 7年 7月31日'],
};

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; font-family: 'BIZ UDMincho', 'BIZ UD明朝', serif; color: #000; }
  .sheet { padding: 28px; display: inline-flex; gap: 26px; align-items: flex-start; transform-origin: top left; }
  .panel { border: 2px solid #000; width: 380px; font-size: 15px; position: relative; padding-top: 22px; }
  .no { position: absolute; right: 6px; top: 2px; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #000; padding: 4px 6px; vertical-align: middle; height: 34px; }
  .lbl { width: 86px; text-align: center; letter-spacing: 2px; font-size: 14px; }
  .side { width: 26px; text-align: center; font-size: 14px; line-height: 1.6; }
  .title { margin: 4px 10px 10px; border: 2px solid #000; text-align: center; font-size: 21px; font-weight: bold; letter-spacing: 3px; padding: 4px; }
  .num { font-size: 21px; letter-spacing: 3px; font-family: 'BIZ UDMincho', 'BIZ UD明朝', serif; }
  .boxes span { display: inline-block; width: 24px; height: 28px; border: 1px solid #000; text-align: center; font-size: 19px; margin-right: -1px; font-family: 'BIZ UDMincho', 'BIZ UD明朝', serif; }
  .small { font-size: 11px; }
  .big { font-size: 22px; letter-spacing: 12px; text-align: center; }
  .stamp { display: inline-block; width: 46px; height: 46px; border: 2px solid #c00; color: #c00; font-size: 10px; text-align: center; line-height: 1.1; padding-top: 6px; transform: rotate(-8deg); }
`;

function panel1(p) {
  return `<div class="panel"><span class="no">（一）</span>
    <div class="title">介護保険被保険者証</div>
    <table>
      <tr><td class="side" rowspan="6">被<br>保<br>険<br>者</td><td class="lbl">番　号</td><td colspan="2" class="num">${p.insuredNo}</td></tr>
      <tr><td class="lbl" style="height:58px">住　所</td><td colspan="2">〒 ${p.zip}<br>${p.address}</td></tr>
      <tr><td class="lbl small">フリガナ</td><td colspan="2">${p.kana}</td></tr>
      <tr><td class="lbl">氏　名</td><td colspan="2" style="font-size:20px">${p.name}</td></tr>
      <tr><td class="lbl">生年月日</td><td>${p.birth}</td><td style="width:44px;text-align:center">${p.gender}</td></tr>
      <tr><td class="lbl small">交付年月日</td><td colspan="2">${p.issued}</td></tr>
      <tr><td colspan="2" class="lbl small" style="height:120px">保険者番号<br>並びに<br>保険者の名称<br>及び印</td>
        <td colspan="2"><div class="boxes">${[...p.insurerNo].map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="small">${p.insurerAddress}</div><div class="big">${p.insurer} <span class="stamp">${p.insurer.replace(/\s/g, '')}<br>之印</span></div></td></tr>
    </table></div>`;
}

function panel2(p) {
  return `<div class="panel"><span class="no">（二）</span>
    <table>
      <tr><td class="lbl small">要介護状態区分等</td><td>${p.care}</td></tr>
      <tr><td class="lbl small" style="font-size:10px">認定年月日<br>（事業対象者の場合は、基本チェックリスト実施日）</td><td>${p.careDate}</td></tr>
      <tr><td class="lbl small">認定の有効期間</td><td>${p.careTerm}</td></tr>
      <tr><td class="lbl small" rowspan="2" style="height:90px">居宅サービス等</td><td style="text-align:center">区分支給限度基準額</td></tr>
      <tr><td>${p.careTerm}<br>1月当たり　　19,705 単位</td></tr>
      <tr><td class="lbl small" style="height:60px">うち種類支給限度基準額</td><td>サービスの種類　　種類支給限度基準額</td></tr>
      <tr><td class="lbl small" style="height:80px">認定審査会の意見及びサービスの種類の指定</td><td></td></tr>
    </table></div>`;
}

function panel3(p) {
  return `<div class="panel"><span class="no">（三）</span>
    <table>
      <tr><td class="lbl small" rowspan="2">給付制限</td><td>内容</td><td class="small">開始年月日<br>終了年月日</td></tr>
      <tr><td></td><td class="small">開始年月日<br>終了年月日</td></tr>
      <tr><td class="lbl small" rowspan="2" style="font-size:11px">居宅介護支援事業者又は介護予防支援事業者及びその事業所の名称</td><td colspan="2">${p.office}<br><span class="small">届出年月日 ${p.officeDate}</span></td></tr>
      <tr><td colspan="2"><span class="small">届出年月日</span></td></tr>
      <tr><td class="lbl small" rowspan="2">介護保険施設等</td><td class="small">種類　名称</td><td class="small">入所等年月日<br>退所等年月日</td></tr>
      <tr><td class="small">種類　名称</td><td class="small">入所等年月日<br>退所等年月日</td></tr>
      <tr><td class="lbl small">備考</td><td colspan="2"></td></tr>
    </table></div>`;
}

function futan(p) {
  return `<div class="panel" style="width:420px"><div class="title">介護保険負担割合証</div>
    <table>
      <tr><td class="lbl small" colspan="2">交付年月日</td><td colspan="2">${p.issued}</td></tr>
      <tr><td class="side" rowspan="4">被<br>保<br>険<br>者</td><td class="lbl">番　号</td><td colspan="2" class="num">${p.insuredNo}</td></tr>
      <tr><td class="lbl">住　所</td><td colspan="2">${p.address}</td></tr>
      <tr><td class="lbl small">フリガナ<br>氏　名</td><td colspan="2"><span class="small">${p.kana}</span><br>${p.name}</td></tr>
      <tr><td class="lbl">生年月日</td><td>${p.birth}</td><td style="width:44px">${p.gender}</td></tr>
      <tr><td class="lbl small" colspan="2">利用者負担の割合</td><td class="lbl small">適用期間</td><td></td></tr>
      <tr><td colspan="2" style="font-size:22px;text-align:center;height:60px">${p.burden}</td><td class="small">開始年月日<br>終了年月日</td><td>${p.burdenTerm[0]}<br>${p.burdenTerm[1]}</td></tr>
      <tr><td colspan="2" class="lbl small" style="height:90px">保険者番号<br>並びに<br>保険者の名称<br>及び印</td>
        <td colspan="2"><div class="boxes">${[...p.insurerNo].map((d) => `<span>${d}</span>`).join('')}</div><div class="big">${p.insurer}</div></td></tr>
    </table></div>`;
}

/**
 * 架空の保険証の HTML。kind：'card'（被保険者証の3つの面を横に並べた、開いた形）・'futan'（負担割合証）。
 * rotate：90 なら右に90°回して、縦長の紙に横向きに置いた形（スキャンでよくある）
 */
export function cardHtml(p = CARD_PERSON, {kind = 'card', rotate = 0} = {}) {
  const body = kind === 'futan' ? futan(p) : panel1(p) + panel2(p) + panel3(p);
  const rot = rotate ? `<script>
    const s = document.querySelector('.sheet'); const w = s.offsetWidth, h = s.offsetHeight;
    s.style.transform = 'translate(' + h + 'px, 0) rotate(90deg)'; document.body.style.width = h + 'px'; document.body.style.height = w + 'px';
  </script>` : '';
  return `<!doctype html><meta charset="utf-8"><style>${css}</style><body><div class="sheet">${body}</div>${rot}</body>`;
}

/** スキャンのように：白黒（しきい値）・小さな黒い点のざらつき・少しの傾き。ブラウザの canvas で（page.evaluate の中で動かす） */
export const SCAN_JS = `async (dataUrl) => {
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(0.006); ctx.translate(-c.width / 2, -c.height / 2);
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height); let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
    const v = (g < 150) !== (rnd() < 0.004) ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}`;
