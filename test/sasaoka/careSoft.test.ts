// 介護ソフトの画面のスクリーンショットを読んだ文字から項目を取り出す（careSoft.ts）。
// 文字は読み取り（tesseract.js）の出力のまね。値はどれも架空（見本・0000。ユーザーにいただいた画面の値は使わない）
import assert from 'node:assert/strict';
import test from 'node:test';
import {blankSplit, cleanKana, findLabel, inkLines, kanaOfWords, kanaRect, mergeSoft, NO_SOFT, parseSoft, parseSoftPage, phoneText, pickKana, rereadInfo, screenLike, softRows, softScore} from '../../src/sasaoka/careSoft.ts';
import type {OcrPage, OcrWord} from '../../src/sasaoka/hokensho.ts';

const TODAY = '2026-10-23';

/**
 * 読み取りの1ページを作る：1行ずつ。語は空白（小さなすき間）、「 | 」は大きなすき間（欄の切れ目）、「·」はすき間なし（読み取りが語を分けただけ）。
 * 語のうしろの「^8」はその語の字の高さ（小さなラベル。字の下はそろえる）、「@30」は読み取りの自信
 */
function page(text: string, h = 14): OcrPage {
  const lines = text
    .trim()
    .split('\n')
    .map((line, i) => {
      const y0 = 10 + i * h * 2.2;
      let x = 10;
      const words: OcrWord[] = [];
      for (const [j, cell] of line.trim().split(' | ').entries()) {
        if (j) x += h * 1.6;
        for (const [k, word] of cell.split(' ').filter(Boolean).entries()) {
          if (k) x += h * 0.6;
          for (const [m, raw] of word.split('·').entries()) {
            if (m) x += h * 0.05;
            const mark = /^(.*?)(?:\^(\d+))?(?:@(\d+))?$/.exec(raw)!;
            const part = mark[1];
            const wh = mark[2] ? Number(mark[2]) : h;
            const w = [...part].length * wh;
            words.push({text: part, x0: x, y0: y0 + h - wh, x1: x + w, y1: y0 + h, ...(mark[3] ? {conf: Number(mark[3])} : {})});
            x += w;
          }
        }
      }
      return {words};
    });
  return {lines};
}

// 見本の画面をきれいに読めたとき
const CLEAN = `
見本 春子 | 様 | 昭和17年5月6日生 84歳 女
部署 行橋営業所 行橋営業所 | 営業 見本 太郎
ﾐﾎﾝ ﾊﾙｺ
見本 春子 様
〒 824-0000 福岡県行橋市見本町1丁目2-3 | 9
Tel 電話番号 0930000000 | 携帯電話
メモ
タスク 0件
レンタル受注情報 | 受注残 0件
販売受注情報 | 受注残 0件
入金情報 | 長期滞納 無し
支払情報 | レンタル 口座振替 販売 現金
モニタリング | 済 次回予定 令和07年11月 周期 6ヶ月
居宅情報 | 委託先居宅 | 見本ケアプランセンター | 見本 一郎 Tel 0930-00-1111
認定情報 | 要介護2 認定期間 | 令和07年10月22日 〜 令和08年10月31日
保険者情報 | 行橋市 被保険者番号 0000987654
給付情報 | 高額２割 保険給付率 80%
`;

// 同じ画面を 100% の画面のまま読んだとき（小さな灰色のラベルの読み違い・字の間の空白。実際の読み取りの出力から）
const NOISY = `
見·本 春子 | 様 | 昭和·17·年·5·月·6 日·生·84·歳·女
部·坪 行橋 営業·所 行橋 営業·所 | =s 見·本·太郎
ミッ ルコ
見·本 春子 様
ェ 824-0000 福岡 県 行橋 市 見 本 町·1 丁目·2-3 | 9
Tel 電話·和希·呈·0930000000 | 携帯·電話
メモ
41 7/1 ぃ
レン·タル·受注·情報 | 受注·残 0·件
販売 受注·情報 | 受注·残 0·件
入金·情報 | 長期·滞·納 無し
支払·情報 | レン·タル 口座 振替 下·売 現金
モニ·タリ·ング | 済 次·回·予定 令·和·07·年·1·1·月 周期 6·ヶ月
居宅·情報 | 託·先·居宅 | 見·本·ケア·ブラン·セン·ター | 見·本 一·郎·rs 0930-00-1111
認定·情報 | 要 介 護·2 を 回·向 | 信和·07 年·10·月·22·日 一 令 和·08·年·10·月·31 日
保険 者 情報 | 行橋·市 福生·論者·埋·昌·0000987654
給·和·付 情報 | 高額·2 割 保険·給付·寺·80%
`;

const EXPECT = {
  name: '見本　春子',
  era: '昭和',
  birthY: '17',
  birthM: '5',
  birthD: '6',
  age: '84',
  gender: '女',
  zip: '824-0000',
  address: '福岡県行橋市見本町1丁目2-3',
  phone: '0930-00-0000',
  office: '見本ケアプランセンター',
  manager: '見本　一郎',
  officeTel: '0930-00-1111',
  care: '要介護2',
  careFrom: '2025-10-22',
  careTo: '2026-10-31',
  insurer: 'yukuhashi',
  insurerName: '行橋市',
  insuredNo: '0000987654',
  kind: '高額２割',
  rate: '80',
  burden: '2',
  welfare: 'no',
};

test('きれいに読めた画面：氏名・生年月日・性別・担当・〒・住所・電話・居宅・認定・保険者・番号・給付（負担割合）', () => {
  const r = parseSoftPage(page(CLEAN), TODAY);
  assert.deepEqual(r.info, {...NO_SOFT, ...EXPECT, kana: 'ミホン　ハルコ', staff: '見本　太郎'});
  // 全体を読んだときのフリガナは小さな字なので、いつも確かめてもらう。ほかはたしか
  assert.deepEqual(r.unsure, ['kana']);
  assert.ok(r.score >= 8, `画面らしさ ${r.score}`);
});

test('100% の画面の読み違い（ラベルの字・字の間の空白・令和の読み違い・ケアブラン）でも値は取り出せる', () => {
  const r = parseSoftPage(page(NOISY), TODAY);
  assert.deepEqual(r.info, {...NO_SOFT, ...EXPECT, kana: 'ミッ　ルコ', staff: '見本太郎'});
  assert.deepEqual(r.unsure, ['kana']);
  assert.ok(r.score >= 5);
});

test('介護保険証の文字は介護ソフトの画面ではない（画面らしさが低い）', () => {
  const card = page(`
介護保険被保険者証
番号 0000123456
住所 行橋市中央一丁目1番1号
フリガナ ミホン ハナコ
氏名 見本 花子
生年月日 昭和13年4月14日 性別 女
交付年月日 令和6年4月1日
保険者番号並びに保険者の名称及び印 409999 行橋市
要介護状態区分等 要介護2
認定の有効期間 令和6年4月1日 〜 令和9年3月31日
居宅介護支援事業者又は介護予防支援事業者及びその事業所の名称 見本ケアプランセンター 届出年月日 令和6年4月1日
`);
  assert.ok(softScore(softRows(card)) < 2, `画面らしさ ${softScore(softRows(card))}`);
});

test('給付情報：保険単独＝1割、高額２割、高額３割、生保＝1割と生活保護。保険給付率と合わなければ確かめる', () => {
  const kyufu = (line: string) => parseSoftPage(page(`保険者情報 | 行橋市 被保険者番号 0000987654\n${line}`), TODAY);
  const single = kyufu('給付情報 | 保険単独 保険給付率 90%');
  assert.deepEqual([single.info.kind, single.info.burden, single.info.welfare, single.unsure], ['保険単独', '1', 'no', []]);
  const welfare = kyufu('給付情報 | 生保 保険給付率 90%');
  assert.deepEqual([welfare.info.kind, welfare.info.burden, welfare.info.welfare, welfare.unsure], ['生保', '1', 'yes', []]);
  const three = kyufu('給付情報 | 高額3割 保険給付率 70%');
  assert.deepEqual([three.info.kind, three.info.burden, three.unsure], ['高額３割', '3', []]);
  // 種類（３割）と給付率（80%＝２割）が合わない → 種類のまま、確かめる
  const differ = kyufu('給付情報 | 高額３割 保険給付率 80%');
  assert.deepEqual([differ.info.burden, differ.unsure.includes('burden')], ['3', true]);
  // 種類が読めなくても給付率から（生活保護かは分からない）
  const rateOnly = kyufu('給付情報 | ■■ 保険給付率 70%');
  assert.deepEqual([rateOnly.info.kind, rateOnly.info.burden, rateOnly.info.welfare], ['', '3', '']);
  // 種類の字の読み違い（単独→単猫）：給付率が合えばたしか
  const fuzzy = kyufu('給付情報 | 保険単猫 保険給付率 90%');
  assert.deepEqual([fuzzy.info.kind, fuzzy.info.burden, fuzzy.info.welfare, fuzzy.unsure], ['保険単独', '1', 'no', []]);
  // 「80%」が「809%」に読めたとき
  assert.equal(kyufu('給付情報 | 高額2割 保険給付率 809%').info.rate, '80');
});

test('電話番号：なければ携帯電話。形の分かるものはハイフン（携帯・0930/0979・093/092）、ほかは読んだまま', () => {
  const mobile = parseSoftPage(page('Tel 電話番号 | 携帯電話 09012345678'), TODAY);
  assert.equal(mobile.info.phone, '090-1234-5678');
  assert.equal(phoneText('0930123456'), '0930-12-3456');
  assert.equal(phoneText('0979000000'), '0979-00-0000');
  assert.equal(phoneText('0931234567'), '093-123-4567');
  assert.equal(phoneText('0920000000'), '092-000-0000');
  assert.equal(phoneText('05012345678'), '050-1234-5678');
  assert.equal(phoneText('0947123456'), '0947123456'); // 形の分からない市外局番はそのまま
  assert.equal(phoneText('０９３０ー００ー１１１１'), '0930-00-1111'); // ハイフン付きはそのまま（全角はそろえる）
});

test('ラベルは少しの読み違いを許して探す（ちがう字・ぬけた字・よけいな字）。似たラベルは取りちがえない', () => {
  assert.ok(findLabel('給和付情報高額2割', '給付情報'));
  assert.ok(findLabel('託先居宅見本', '委託先居宅'));
  assert.ok(findLabel('保険者情報行橋市', '保険者情報'));
  assert.equal(findLabel('被保険者番号0000', '保険者情報'), null);
  assert.equal(findLabel('認定期間令和', '認定情報'), null);
  assert.equal(findLabel('居宅介護支援事業者', '居宅情報'), null);
});

test('生年月日は年齢と合うときだけたしか（読み違えた年を入れない）・認定期間はありうる期間だけたしか', () => {
  const wrongAge = parseSoftPage(page('見本 春子 | 様 | 昭和11年5月6日生 84歳 女'), TODAY);
  assert.equal(wrongAge.info.birthY, '11');
  assert.ok(['era', 'birthY', 'birthM', 'birthD'].every((k) => wrongAge.unsure.includes(k as never)));
  const term = parseSoftPage(page('認定情報 | 要介護1 認定期間 | 令和07年10月22日 〜 令和08年10月30日'), TODAY);
  assert.deepEqual([term.info.care, term.info.careFrom, term.info.careTo], ['要介護1', '2025-10-22', '2026-10-30']);
  assert.ok(term.unsure.includes('careTo')); // おわりが月の末日でない
  // 「令和」が「針和」に読めても
  assert.equal(parseSoftPage(page('認定情報 | 要支援2 | 針和06年04月01日 〜 令和09年03月31日'), TODAY).info.careFrom, '2024-04-01');
  // 要支援は1・2だけ
  assert.equal(parseSoftPage(page('認定情報 | 要支援5 認定期間 | 令和06年04月01日 〜 令和09年03月31日'), TODAY).info.care, '');
});

test('住所：地図のボタン（字に読めたもの）は除き、番地は残す。市町の読み違いは保険者の名前で直して確かめる', () => {
  const addr = (line: string) => parseSoftPage(page(line), TODAY).info.address;
  assert.equal(addr('〒 824-0000 福岡県行橋市見本町1丁目 | 2-3 | 9'), '福岡県行橋市見本町1丁目2-3');
  assert.equal(addr('〒 824-0000 福岡県行橋市見本町1丁目2-3_」9%'), '福岡県行橋市見本町1丁目2-3');
  assert.equal(addr('〒 824-0000 福岡県行橋市見本町1丁目2.3'), '福岡県行橋市見本町1丁目2-3');
  const kanda = parseSoftPage(page('〒 800-0300 福岡県京都郡滴田町見本1丁目4番5号 | 9\n保険者情報 | 滴田町 被保険者番号 0000111222'), TODAY);
  assert.equal(kanda.info.address, '福岡県京都郡苅田町見本1丁目4番5号');
  assert.equal(kanda.info.insurer, 'kanda');
  assert.ok(kanda.unsure.includes('address') && kanda.unsure.includes('insurer'));
});

test('居宅情報：ラベルの読み違い（放先局・計旗先居宅）を事業所に入れない。ケアマネジャーは姓と名の間に全角の空白', () => {
  const kyo = (line: string) => parseSoftPage(page(line), TODAY).info;
  assert.deepEqual(
    (({office, manager, officeTel}) => ({office, manager, officeTel}))(kyo('居宅·情報 | 計旗先居宅見本居宅介護支援事業所 | 試験 花子 Tel 0979-00-2222')),
    {office: '見本居宅介護支援事業所', manager: '試験　花子', officeTel: '0979-00-2222'},
  );
  assert.equal(kyo('居宅情報 | 放先局 | 見本ケアプランセンター | 見本 一郎 | 0930-00-1111').office, '見本ケアプランセンター');
  // 欄の切れ目がなくても、事業所の名前の終わりの言葉のうしろが名前
  assert.deepEqual((({office, manager}) => ({office, manager}))(kyo('居宅情報 委託先居宅 見本ケアプランセンター 見本 一郎 Tel 0930-00-1111')), {office: '見本ケアプランセンター', manager: '見本　一郎'});
});

test('担当：「営業」のラベルのうしろ（読めなければ最後の欄）。ラベルの残りやひらがなのごみは除く', () => {
  const staff = (line: string) => parseSoftPage(page(`見本 春子 | 様 | 昭和17年5月6日生 84歳 女\n${line}`), TODAY).info.staff;
  assert.equal(staff('部署 行橋営業所 行橋営業所 | 営業 見本 太郎'), '見本　太郎');
  assert.equal(staff('部署 行橋営業所 行橋営業所 | まぁ 見本太郎'), '見本太郎');
  assert.equal(staff('部署 行橋営業所 行橋営業所 | 業 見本 太郎'), '見本　太郎');
  assert.equal(staff('部署 行橋営業所 行橋営業所'), '');
});

test('フリガナ：全角カタカナ（半角・ひらがな・離れた濁点・似た漢字も）。切り出して読んだ語のすき間で姓と名を分ける', () => {
  assert.equal(cleanKana('ﾐﾎﾝ ｹﾞﾝｿﾞｳ'), 'ミホン　ゲンゾウ');
  assert.equal(cleanKana('みほん はるこ'), 'ミホン　ハルコ');
  assert.equal(cleanKana('ミホン ケ゛ンソ゛ウ'), 'ミホン　ゲンゾウ');
  assert.equal(cleanKana('ミホン 八ル口'), 'ミホン　ハルロ');
  assert.equal(cleanKana('ミホン アキラ ーー'), 'ミホン　アキラ');
  const w = (text: string, x0: number, x1: number): OcrWord => ({text, x0, x1, y0: 0, y1: 20});
  // 字ごとに分かれて読めても、一番大きなすき間で分ける
  assert.equal(kanaOfWords([w('ミホ', 0, 40), w('ン', 42, 60), w('ハル', 80, 120), w('コ', 122, 140)]), 'ミホン　ハルコ');
  assert.equal(kanaOfWords([w('ミホンハルコ', 0, 120)]), 'ミホンハルコ');
  // 2回同じで自信も高ければたしか、ちがえば自信の高い方（確かめる）
  assert.deepEqual(pickKana([{text: 'ミホン　アキラ', conf: 90}, {text: 'ミホン　アキラ', conf: 91}]), {kana: 'ミホン　アキラ', sure: true});
  assert.deepEqual(pickKana([{text: 'ミン　コ', conf: 5}, {text: 'ミン　コ', conf: 0}]), {kana: 'ミン　コ', sure: false});
  assert.deepEqual(pickKana([{text: 'ミホン　ハルキコ', conf: 69}, {text: 'ミホン　ハルコ', conf: 75}]), {kana: 'ミホン　ハルコ', sure: false});
});

test('何回か読んだ結果をまとめる：同じならたしか、たしかな読みが分かれたら確かめる。字をしぼって読み直した数字は重い', () => {
  const a = parseSoftPage(page(CLEAN), TODAY);
  const b = parseSoftPage(page(CLEAN.replace('824-0000', '824-6960').replace('0000987654', '0000987654')), TODAY);
  const m = mergeSoft([a, b]);
  assert.ok(m.unsure.includes('zip'));
  assert.equal(m.info.insuredNo, '0000987654');
  assert.ok(!m.unsure.includes('insuredNo'));
  // 読み直した郵便番号（重み2）があれば、それを選ぶ
  const p = parseSoft([page(CLEAN.replace('824-0000', '824-6960'))], TODAY, {rereads: [{spot: 'zip', text: '824-0000'}]});
  assert.equal(p.info.zip, '824-0000');
  // 前にラベルの読み違いの字がついた事業所は、うしろが同じ短い読みの味方
  const c = parseSoftPage(page(CLEAN.replace('委託先居宅 | 見本ケアプランセンター', '馬滞 見本ケアプランセンター')), TODAY);
  assert.equal(mergeSoft([c, a]).info.office, '見本ケアプランセンター');
  assert.equal(mergeSoft([a, c]).info.office, '見本ケアプランセンター');
  // 切り出して読み直したフリガナ（2回同じ・自信が高い）はたしか
  const k = parseSoft([page(NOISY)], TODAY, {kana: [{text: 'ミホン　ハルコ', conf: 88}, {text: 'ミホン　ハルコ', conf: 80}]});
  assert.deepEqual([k.info.kana, k.unsure.includes('kana')], ['ミホン　ハルコ', false]);
  // 読み直しが無ければ、全体を読んだときのフリガナは確かめる（2回同じに読めても）
  assert.ok(parseSoft([page(NOISY), page(NOISY)], TODAY).unsure.includes('kana'));
});

test('読み直した数字の欄：形に合うものだけ（生年月日は年齢と合うとき・期間はありうるとき）', () => {
  assert.deepEqual(rereadInfo('birth', '昭和 17 年 5 月 6 日 生 84', TODAY), {era: '昭和', birthY: '17', birthM: '5', birthD: '6', age: '84'});
  assert.equal(rereadInfo('birth', '昭和 11 年 5 月 6 日 生 84 歳', TODAY), null);
  assert.deepEqual(rereadInfo('zip', '824-0000', TODAY), {zip: '824-0000'});
  assert.deepEqual(rereadInfo('officeTel', '0930-00-1111', TODAY), {officeTel: '0930-00-1111'});
  assert.deepEqual(rereadInfo('phone', '0930000000', TODAY), {phone: '0930-00-0000'});
  assert.equal(rereadInfo('insuredNo', '000098765', TODAY), null);
  assert.deepEqual(rereadInfo('careTerm', '令 和 07 年 10 月 22 日 令 和 08 年 10 月 31 日', TODAY), {careFrom: '2025-10-22', careTo: '2026-10-31'});
  assert.equal(rereadInfo('careTerm', '令 和 08 年 19 月 31 日', TODAY), null);
});

test('数字の欄の位置（読み直す所）とフリガナの行の切り出し：2つめの氏名のすぐ上、部署の行との間', () => {
  const p = page(CLEAN);
  const r = parseSoftPage(p, TODAY);
  assert.deepEqual(Object.keys(r.spots ?? {}).sort(), ['birth', 'careTerm', 'insuredNo', 'officeTel', 'phone', 'zip']);
  const rows = softRows(p);
  const busho = rows.find((x) => x.sq.startsWith('部署'))!;
  const name2 = rows.find((x) => x.sq === '見本春子様')!;
  const rect = kanaRect(p)!;
  assert.ok(rect.y0 >= busho.y1 && rect.y1 <= name2.y0, JSON.stringify({rect, busho: busho.y1, name2: name2.y0}));
  assert.ok(rect.x1 > rect.x0 + 100);
});

test('画面のスクリーンショットらしいか：地の色が平らな画像だけ（写真のような色の散らばった画像は介護保険証として読む）', () => {
  const px = (n: number, f: (i: number) => [number, number, number]) => {
    const a = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const [r, g, b] = f(i);
      a.set([r, g, b, 255], i * 4);
    }
    return a;
  };
  // 白い地に字（灰色）が少し
  assert.equal(screenLike(px(10000, (i) => (i % 9 === 0 ? [90, 90, 90] : [255, 255, 255]))), true);
  // JPEG のざらつき（白の ±3）も平ら
  assert.equal(screenLike(px(10000, (i) => [252 + (i % 4), 253, 251 + (i % 5)])), true);
  // 光のむら（明るさがなだらかに変わる写真）
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 255;
  assert.equal(screenLike(px(10000, (i) => [((i / 10000) * 200 + rnd() * 0.2) | 0, ((i / 10000) * 180 + 30) | 0, rnd() | 0])), false);
});

// ---------------------------------------------------------------- もう1つの形の画面（2026-10-23。値はどれも架空）

// 2つめの画面の形をきれいに読めたとき：「様」は小さな灰色、居宅のラベルは「居宅」だけ、事業所の名前のうしろに支店の名前、給付情報は「高額所得対象２割」
const GRAY = `
見本 春子 | 様^7 | 昭和17年05月06日生 84歳 女
部署^7 行橋営業所 行橋営業所 | 営業^7 見本 太郎
ﾐﾎﾝ ﾊﾙｺ
見本 春子 様^7 | レンタル納品 販売納品 請求書 領収書 | ご本人
〒^7 800-0000 福岡県京都郡苅田町見本1丁目2-3
Tel^7 電話番号^7 090-0000-1111 携帯電話^7
メモ
モニタリング | 前回実施^7 26/09 次回予定^7 無し 周期^7 12ヶ月ごと
居宅情報 | 居宅^7 | 見本介護サービス みほん | 試験 一郎 Tel^7 0930-00-1111
認定情報 | 要介護1 認定期間^7 | 令和07年11月01日 〜 令和08年10月31日
保険者情報 | 苅田町 被保険者番号^7 0000001234
給付情報 | 高額所得対象２割 保険給付率^7 80%
`;

test('もう1つの形の画面：小さな「様」・名前の右のボタン・居宅のラベル・事業所の支店の名前・高額所得対象２割', () => {
  const r = parseSoftPage(page(GRAY), TODAY);
  const i = r.info;
  assert.deepEqual(
    [i.name, i.kana, i.staff, i.zip, i.address, i.phone, i.office, i.manager, i.officeTel, i.care, i.careFrom, i.careTo, i.insurer, i.insuredNo, i.kind, i.burden, i.welfare],
    ['見本　春子', 'ミホン　ハルコ', '見本　太郎', '800-0000', '福岡県京都郡苅田町見本1丁目2-3', '090-0000-1111', '見本介護サービス　みほん', '試験　一郎', '0930-00-1111', '要介護1', '2025-11-01', '2026-10-31', 'kanda', '0000001234', '高額２割', '2', 'no'],
  );
  assert.deepEqual(r.unsure, ['kana']);
  // フリガナの切り出し：名前の右のボタン・ご本人の欄は入れない
  const rect = kanaRect(page(GRAY))!;
  assert.ok(rect && rect.x1 < 14 * 30, JSON.stringify(rect));
});

test('高額所得対象３割は3割負担、２割は2割負担。「割」が読めなくても「対象」のうしろの数字、「%」が「96」に読めても', () => {
  const kyufu = (line: string) => parseSoftPage(page(`保険者情報 | 苅田町 被保険者番号 0000001234\n${line}`), TODAY).info;
  assert.deepEqual((({kind, burden, rate}) => [kind, burden, rate])(kyufu('給付情報 | 高額所得対象３割 保険給付率 70%')), ['高額３割', '3', '70']);
  assert.deepEqual((({kind, burden, rate}) => [kind, burden, rate])(kyufu('給付情報 | 高額所得対象2割 保険給付率 80%')), ['高額２割', '2', '80']);
  assert.deepEqual((({kind, burden, rate}) => [kind, burden, rate])(kyufu('給付情報 | 高額所答対象2天 タめそ粗 8096')), ['高額２割', '2', '80']);
  const unsure = parseSoftPage(page('給付情報 | 高額所答対象2天 保険給付率 80%'), TODAY);
  assert.equal(unsure.unsure.includes('burden'), false); // 割合は給付率と合う
});

test('「様」の読み違い（栓・疹）は名前に入れない。名前の右のボタンがあっても2つめの氏名とフリガナの行が分かる', () => {
  const r = parseSoftPage(page('見本 春子 | 栓 | 昭和17年05月06日生 84歳 女\n部署 行橋営業所 | 営業 見本 太郎\nﾐﾎﾝ ﾊﾙｺ\n見本 春子 疹 | レンタル納品 販売納品 | ご本人\n〒 800-0000 福岡県京都郡苅田町見本1丁目2-3'), TODAY);
  assert.deepEqual([r.info.name, r.info.kana], ['見本　春子', 'ミホン　ハルコ']);
  assert.ok(!r.unsure.includes('name'));
  // 「様」がなくても、1行目と同じ名前の行が2つめの氏名（フリガナが別の字に読めても切り出せる）
  const p = page('見本 春子 | 様 | 昭和17年05月06日生 84歳 女\n部署 行橋営業所 | 営業 見本 太郎\nYYtト 名9\n見本 春子\n〒 800-0000 福岡県京都郡苅田町見本1丁目2-3');
  assert.ok(kanaRect(p));
});

test('居宅情報：「居宅」のラベル（小さな字・自信の低い読み違い・くっついた「居才」）は事業所に入れない。ケアマネジャーは最後の2つの語', () => {
  const kyo = (line: string) => (({office, manager}) => ({office, manager}))(parseSoftPage(page(line), TODAY).info);
  assert.deepEqual(kyo('居宅情報 | 提^7 も@30 | 見本介護サービス みほん | 試験 一郎 Tel^7 0930-00-1111'), {office: '見本介護サービス　みほん', manager: '試験　一郎'});
  assert.deepEqual(kyo('居宅情報 | 居才見本介護サービスみほん 試験 一郎 | 0930-00-1111'), {office: '見本介護サービス　みほん', manager: '試験　一郎'});
  assert.deepEqual(kyo('居宅情報 | 品5見本介護サービス | みほん 試験 一郎 | 0930-00-1111'), {office: '見本介護サービス　みほん', manager: '試験　一郎'});
  // 支店の名前と姓がくっついて読めても
  assert.deepEqual(kyo('居宅情報 | 居宅 | 見本介護サービス みほん試験 一郎 | 0930-00-1111'), {office: '見本介護サービス　みほん', manager: '試験　一郎'});
  // 「居宅介護支援…」は事業所の名前（ラベルではない）
  assert.deepEqual(kyo('居宅情報 | 居宅介護支援事業所見本 | 試験 花子 | 0930-00-1111'), {office: '居宅介護支援事業所見本', manager: '試験　花子'});
  // ケアプランセンターは1つの名前（空白を入れない）
  assert.deepEqual(kyo('居宅情報 | 委託先居宅 | 見本ケアプラン センター | 見本 一郎 | 0930-00-1111'), {office: '見本ケアプランセンター', manager: '見本　一郎'});
});

test('ラベルが読めない行：電話番号の行（〒の下）・保険者情報と給付情報（認定情報のとなりの順番）。郵便番号は電話番号の一部を取らない', () => {
  const r = parseSoftPage(
    page(`
〒 800-0000 福岡県京都郡苅田町見本1丁目2-3
rm | sss | 090-0000-1111 | xsss
居宅情報 | 委託先居宅 | 見本ケアプランセンター | 見本 一郎 Tel 0930-00-1111
認定情報 | 要介護1 認定期間 | 令和07年11月01日 〜 令和08年10月31日
全壮痢憶経 刻田町 はな角き 0000001234
給付信内 高額所答対象2天 タめそ粗 8096
`),
    TODAY,
  );
  assert.deepEqual([r.info.phone, r.info.insurer, r.info.insuredNo, r.info.burden], ['090-0000-1111', 'kanda', '0000001234', '2']);
  assert.equal(parseSoftPage(page('ェ 090-0000-1111 下川きち'), TODAY).info.zip, '');
});

test('上の欄だけのスクリーンショットも介護ソフトの画面（「…日生84歳」）', () => {
  assert.ok(softScore(softRows(page('見本 春子 | 様 | 昭和17年05月06日生 84歳 女\n部署 行橋営業所 | 営業 見本 太郎'))) >= 2);
});

test('フリガナ：何回か読んだ中で一番多い読み。姓と名の間は画素で見た字のない所', () => {
  const r = (text: string, conf: number) => ({text, conf});
  assert.deepEqual(pickKana([r('ミホン　ハルコ', 83), r('ミホン　ハルコ', 85), r('ミン　ハルコ', 68), r('ミホンハルコ', 56)]), {kana: 'ミホン　ハルコ', sure: true});
  assert.deepEqual(pickKana([r('ミキンカコ', 27), r('ミキンカコ', 27), r('ミホンカキコ', 72)]), {kana: 'ミキンカコ', sure: false});
  const w = (text: string, x0: number, x1: number): OcrWord => ({text, x0, x1, y0: 0, y1: 20});
  // 字の間のすき間（ロとウの間）が広くても、画素で見た間（トとタの間）で分ける
  assert.equal(kanaOfWords([w('ヤ', 0, 10), w('マ', 11, 21), w('モ', 22, 32), w('ト', 33, 43), w('タ', 50, 60), w('ロ', 61, 71), w('ウ', 80, 86)], 46), 'ヤマモト　タロウ');
  // 明るさの画像：字の列（濃い）のあいだの、一番長い字のない列
  const W = 40;
  const lum = new Uint8Array(W * 10).fill(255);
  for (const x of [2, 3, 5, 6, 8, 9, 20, 21, 23, 24]) for (let y = 2; y < 8; y++) lum[y * W + x] = 0;
  assert.equal(blankSplit(lum, W, {x0: 0, y0: 0, x1: W, y1: 10}), 15);
});

test('字の行を画素の濃さから探す：縦の線・横の線は数えない、つながった2つの行は中ほどのうすい所で分ける', () => {
  const W = 100;
  const H = 60;
  const lum = new Uint8Array(W * H).fill(255);
  const ink = (y0: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = 10; x < 60; x += 2) lum[y * W + x] = 0;
  };
  ink(5, 15);
  ink(30, 40);
  ink(41, 51); // すぐ下の行（すき間1画素）
  for (let y = 0; y < H; y++) lum[y * W] = 0; // 縦の線
  for (let x = 0; x < W; x++) lum[22 * W + x] = 0; // 横の線
  const lines = inkLines(lum, W, H);
  assert.deepEqual(lines.map((l) => [l.y0, l.y1]), [[5, 15], [30, 40], [41, 51]]);
});
