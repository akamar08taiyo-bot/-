import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {ageAt, birthIso, cleanRiyu, NO_RIYU, RIYU_MAP, riyuCells, riyuFileName, riyuValues, warekiText} from '../../src/sasaoka/riyu.ts';
import {cellText, fillShinsei, sharedStrings} from '../../src/sasaoka/shinsei.ts';
import {shinseiPreview} from '../../src/sasaoka/shinseiPreview.ts';
import type {Job, Place, Row, RiyuInfo} from '../../src/sasaoka/types.ts';

const RATES = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateOverheadRate: 0.1, taxRate: 0.1};
const RIYU = new Uint8Array(readFileSync(new URL('../../src/sasaoka/shinsei/riyu.xltx', import.meta.url)));
const mat = (name: string, extra: Partial<Row> = {}): Row => ({
  id: name + Math.random(), kind: 'material', refId: null, name, code: '', maker: '', unit: '本', price: 1000, qty: 1, listPrice: 2000, lengthCm: 0, pieceLengthM: 0,
  estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null, ...extra,
});
const place = (name: string, rows: Row[], extra: Partial<Place> = {}): Place => ({id: 'p' + name, name, rows, kind: 1, photo: 0, ...extra});
// 架空の方（見本）
const job = (extra: Partial<Job> = {}): Job => ({
  id: 'j1', month: '2026-10', customer: '見本　花子', suffix: '様邸', staff: '', date: '', address: '福岡県行橋市中央1-1', note: '', insuredNo: '0000123456',
  insurer: 'yukuhashi', form: 'yukuhashi', overhead: null, overheadTarget: null, shikiri: true,
  places: [place('廊下', [mat('手すり 2m', {lengthCm: 240, pieceLengthM: 2})]), place('トイレ', [mat('L型手すり')]), place('玄関', [mat('踏み台')], {kind: 2})],
  shinsei: {...NO_SHINSEI, era: '昭和', birthY: '13', birthM: '4', birthD: '14', gender: '女', care: '要介護1', zip: '824-0001', reasonOffice: '見本居宅介護支援事業所', reasonName: '見本 一郎', careFrom: '2025-04-01', careTo: '2028-03-31'},
  createdAt: 1, updatedAt: 1, ...extra,
});
const RIYU_INFO: RiyuInfo = {
  ...NO_RIYU,
  checkDate: '2026-10-20',
  madeDate: '2026-10-22',
  tel: '0930-00-0000',
  housing: '持ち家',
  body: '膝が痛く、立ち座りがつらい',
  care: '長女が日中だけ見守り',
  wish: '一人でトイレに行けるようにしたい',
  equipment: {歩行器: {before: true, after: true}, 手すり: {after: true}},
  equipmentOther: [{name: 'シャワーチェア', before: false, after: true}],
  acts: {
    ...NO_RIYU.acts,
    toilet: {items: [0, 2], itemOther: '夜間の移動', trouble: '廊下に手すりがなく、ふらつく', purposes: [1, 2], purposeOther: '', policy: '手すりを付けて、安全に移動できるようにする'},
    home: {items: [0], itemOther: '居間から寝室への移動', trouble: '', purposes: [5], purposeOther: '見守りを減らす', policy: ''},
  },
};

/** 理由書の欄の文字（書いたあと） */
function sheetOf(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  const shared = sharedStrings(files);
  return {files, text: (ref: string) => cellText(xml, ref, shared), drawing: strFromU8(files['xl/drawings/drawing1.xml'])};
}

test('理由書：和暦・生年月日の西暦・満年齢（誕生日に1つ増える）', () => {
  assert.equal(warekiText('2026-10-22'), '令和8年10月22日');
  assert.equal(warekiText('2019-05-01'), '令和元年5月1日');
  assert.equal(warekiText('2019-04-30'), '平成31年4月30日');
  assert.equal(warekiText(''), '');
  assert.equal(birthIso({era: '昭和', birthY: '13', birthM: '4', birthD: '14'}), '1938-04-14');
  assert.equal(birthIso({era: '', birthY: '１３', birthM: '４', birthD: '１４'}), '1938-04-14'); // 元号は空なら昭和・全角でもよい
  assert.equal(birthIso({era: '大正', birthY: '元', birthM: '12', birthD: '1'}), '1912-12-01');
  assert.equal(birthIso({era: '昭和', birthY: '13', birthM: '', birthD: '14'}), '');
  assert.equal(ageAt('1938-04-14', '2026-04-13'), 87);
  assert.equal(ageAt('1938-04-14', '2026-04-14'), 88);
  assert.equal(ageAt('', '2026-04-14'), null);
});

test('理由書の原本：1枚のシートに2ページ・名残りなし', () => {
  const files = unzipSync(RIYU);
  const wb = strFromU8(files['xl/workbook.xml']);
  assert.deepEqual([...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ['住宅改修理由書']);
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(xml, /<rowBreaks count="1" manualBreakCount="1"><brk id="40" max="16383" man="1"\/><\/rowBreaks>/);
  assert.match(xml, /<pageSetup paperSize="9" scale="\d+" orientation="landscape"\/>/);
  assert.ok(!/fitToPage/.test(xml), '「1ページに合わせる」だと Excel は改ページを使わない');
  assert.ok(!/hidden="1"/.test(xml), '隠れた行がない');
  const all = Object.values(files).map((f) => strFromU8(f)).join('');
  for (const leftover of ['■', '楕円', 'externalLink', '#REF!', 'トイレまでの移動)', '時間転倒']) assert.ok(!all.includes(leftover), leftover);
  assert.equal(riyuFileName({customer: '見本　花子'}), '見本花子様住宅改修理由書.xlsx');
});

test('理由書に転記：基本情報・作成者・総合的状況・福祉用具・P2 の活動・④改修項目（見積書の箇所から）', () => {
  const j = job({riyu: RIYU_INFO});
  const {text, drawing} = sheetOf(fillShinsei(RIYU, RIYU_MAP, riyuValues(j, RATES, '2026-10-22')));
  // 被保険者番号の10マス・氏名・住所・郵便番号・生年月日・年齢（作成日の満年齢）
  assert.deepEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'H4', 'I4', 'J4', 'K4', 'L4'].map(text), [...'0000123456']);
  assert.deepEqual([text('C6'), text('C9'), text('E8'), text('V4'), text('P4')], ['見本　花子', '福岡県行橋市中央1-1', '824-0001', '13年4月14日', '88']);
  // 性別は□を■に。要介護認定は数字を丸で囲む（要介護１は「経過的」のうしろの１）・元号（昭和）も丸
  assert.deepEqual([text('Z4'), text('AA4')], ['□男', '■女']);
  assert.equal((drawing.match(/prst="ellipse"/g) ?? []).length, 2);
  // 認定有効期間・作成者・住宅状況
  assert.equal(text('S7'), '令和7年4月1日～令和10年3月31日');
  assert.deepEqual([text('AH4'), text('AN4'), text('AH6'), text('AH8'), text('AK9')], ['令和8年10月20日', '令和8年10月22日', '見本居宅介護支援事業所', '見本 一郎', '0930-00-0000']);
  assert.equal(text('W8'), '　■ 持ち家　　□ 借家　　□ 借間　');
  // 総合的状況
  assert.deepEqual([text('H18'), text('H24'), text('H29')], [RIYU_INFO.body, RIYU_INFO.care, RIYU_INFO.wish]);
  // 福祉用具：手すり（24行目）は改修後だけ、歩行器（26行目）は両方。その他の1行目
  assert.deepEqual([text('AN24'), text('AO24'), text('AN26'), text('AO26'), text('AN20')], ['□', '■', '■', '■', '□']);
  assert.deepEqual([text('AK36'), text('AN36'), text('AO36')], ['・シャワーチェア', '□', '■']);
  // P2：排泄の ①（トイレまでの移動・便器からの立ち座り）・その他（夜間の移動）・②・③（転倒等の防止・動作の容易性）・方針
  assert.deepEqual([text('B45'), text('B46'), text('B48')], ['■トイレまでの移動', '□トイレ出入口の出入', '■便器からの立ち座り(移乗を含む)']);
  assert.equal(text('B52'), '■その他(夜間の移動)');
  assert.deepEqual([text('M45'), text('AD45')], [RIYU_INFO.acts.toilet.trouble, RIYU_INFO.acts.toilet.policy]);
  assert.deepEqual([text('X45'), text('X47'), text('X48')], ['□できなかったことをできる', '■転倒等の防止、安全の確保', '■動作の容易性の確保']);
  // 自宅内の移動：① は空いた欄に先頭の□（■）と文。③ のその他（かっこの中）
  assert.equal(text('B72'), '■居間から寝室への移動');
  assert.equal(text('X79'), '■その他(見守りを減らす)');
  // ④：手すり（①廊下・②トイレ）と段差の解消（③玄関）
  assert.deepEqual([text('AJ47'), text('AL48'), text('AL50'), text('AJ56'), text('AL57'), text('AJ63')], ['■　手摺取付', '①廊下', '②トイレ', '■　段差の解消', '③玄関', '□　引き戸等への扉の取替え']);
});

test('理由書の現地確認日・④：申請書と同じく見積書に出る箇所だけ。日付は写真番号の順で最初のもの、申請書の行を空にした箇所は ④ に書かない', () => {
  const j = job({
    riyu: {...NO_RIYU},
    places: [
      place('浴室', [mat('手すり')], {photo: 2, photoDates: {before: '2026-09-01'}}), // 先に並んでいるが写真番号は②
      place('トイレ', [mat('手すり')], {photo: 1, photoDates: {before: '2026-10-05'}}),
      place('廊下', [], {photoDates: {before: '2026-08-15'}}), // 行がない＝見積書・申請書に出ない
      place('物置', [mat('手すり')], {photo: 3, shinseiLine: ''}), // 申請書の改修の内容の行を空にした
    ],
  });
  const v = riyuCells(j, RATES, '2026-10-22');
  assert.equal(v.cells.AH4, '令和8年10月5日'); // 申請書の改修前日付と同じ（トイレ①の日付）
  assert.deepEqual(['AL48', 'AL50', 'AL52'].map((r) => v.cells[r]), ['②浴室', '①トイレ', undefined]);
});

test('理由書の長い氏名・住所・④の箇所も欄の中に全部見せる（氏名・住所は1行のまま縮める。④は2行入るので折り返す）', () => {
  const longPlace = '勝手口（屋外・コンクリートスロープ新設）';
  const j = job({customer: '見本長谷川原　美千代子', address: '福岡県行橋市大字流末1234番地56　見本マンション行橋駅前東館1203号室', places: [place(longPlace, [mat('手すり')]), place('トイレ', [mat('L型手すり')])]});
  const {files} = sheetOf(fillShinsei(RIYU, RIYU_MAP, riyuValues(j, RATES, '2026-10-22')));
  const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
  const st = strFromU8(files['xl/styles.xml']);
  const xfs = [...(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)?.[1] ?? '').matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const xfOf = (ref: string) => xfs[Number(new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`).exec(xml)?.[1] ?? 0)];
  assert.match(xfOf('C6'), /shrinkToFit="1"/); // 氏名（C6:J7）は2行入る高さでも折り返さない
  assert.doesNotMatch(xfOf('C6'), /wrapText="1"/);
  assert.match(xfOf('C9'), /shrinkToFit="1"/); // 住所（C9:P9。1行の高さ）
  assert.match(xfOf('AL48'), /wrapText="1"/); // ④の①勝手口（AL48:AO49。2行の高さ）
  assert.doesNotMatch(xfOf('AL50'), /wrapText="1"|shrinkToFit="1"/); // 入る「②トイレ」は原本のまま
});

test('ほかのソフトから貼り付けた制御文字（Word の Shift+Enter＝U+000B・改ページ U+000C など）は、改行にするか消す（Excel が修復しないで開ける XML）', () => {
  const j = job({riyu: {...RIYU_INFO, body: '右片麻痺あり\u000B杖歩行', care: '妻が介護\u000Cしている', wish: 'トイレ\u0007に行きたい￾'}});
  const {files, text} = sheetOf(fillShinsei(RIYU, RIYU_MAP, riyuValues(j, RATES, '2026-10-22')));
  for (const [name, f] of Object.entries(files)) if (name.endsWith('.xml')) assert.doesNotMatch(strFromU8(f), /[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/, name);
  assert.deepEqual([text('H18'), text('H24'), text('H29')], ['右片麻痺あり\n杖歩行', '妻が介護\nしている', 'トイレに行きたい']);
});

test('理由書：何も入れていなければ原本のまま（□・空欄）。④ の行が足りなければ最後の行に「・」でつなぐ', () => {
  const blank = job({shinsei: {...NO_SHINSEI}, insuredNo: '', customer: '', address: '', places: []});
  const {text, drawing} = sheetOf(fillShinsei(RIYU, RIYU_MAP, riyuValues(blank, RATES, '2026-10-22')));
  assert.deepEqual([text('C6'), text('P4'), text('Z4'), text('AA4'), text('S7'), text('W8').includes('■'), text('AJ47')], ['', '', '□男', '□女', '', false, '□　手摺取付']);
  assert.equal(text('B72'), '□'); // 自宅内の移動の ① も、ほかの段と同じく空白の□
  assert.equal((drawing.match(/prst="ellipse"/g) ?? []).length, 1); // 元号は選んでいなければ昭和（申請書と同じ）
  const many = job({places: ['廊下', 'トイレ', '玄関', '浴室', '居間', '寝室'].map((n) => place(n, [mat('手すり')]))});
  const v = riyuCells(many, RATES, '2026-10-22');
  assert.deepEqual(['AL48', 'AL50', 'AL52', 'AL54'].map((r) => v.cells[r]), ['①廊下', '②トイレ', '③玄関', '④浴室・⑤居間・⑥寝室']);
});

test('理由書の項目を読み込むときにそろえる（前のデータ・こわれた値）', () => {
  assert.deepEqual(cleanRiyu(undefined), NO_RIYU);
  const r = cleanRiyu({housing: 'マンション', checkDate: '2026/10/22', equipment: {歩行器: {before: true}, ロボット: {before: true}}, acts: {toilet: {items: [0, 0, 99, -1, 'x'], purposes: [5, 1]}}});
  assert.equal(r.housing, '');
  assert.equal(r.checkDate, '');
  assert.deepEqual(r.equipment, {歩行器: {before: true}});
  assert.deepEqual([r.acts.toilet.items, r.acts.toilet.purposes], [[0], [1, 5]]);
  assert.deepEqual(cleanRiyu({acts: {home: {items: [0, 1], itemOther: '居間'}}}).acts.home.items, [0]); // 自宅内の移動は先頭の□だけ
});

test('理由書のプレビュー：2ページ（P1・P2）。欄を押すと一覧の項目へ', () => {
  const pages = shinseiPreview(unzipSync(RIYU), RIYU_MAP, riyuValues(job({riyu: RIYU_INFO}), RATES, '2026-10-22'));
  assert.equal(pages.length, 2);
  assert.ok(pages[0].texts.some((t) => t.runs.map((r) => r.text).join('') === '見本　花子'));
  assert.ok(pages[1].texts.some((t) => t.runs.map((r) => r.text).join('').includes('■トイレまでの移動')));
  const fields = new Set(pages.flatMap((p) => p.fields.map((f) => f.field)));
  for (const f of ['name', 'insuredNo', 'birth', 'gender', 'care', 'careTerm', 'housing', 'body', 'equipment', 'act:toilet', 'act:home', 'works', 'reason', 'tel']) assert.ok(fields.has(f as never), f);
});
