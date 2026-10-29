// 申請書・見積書・理由書（Excel）の取り込み（importDocs.ts）：このアプリで書いた書類を読み戻すと同じ名前・箇所・金額になること、
// 名字が同じ書類を1つの様邸にまとめること（合算）、売上見込み・受注残に金額が入ること。どれも架空の方（見本 花子 など）
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {zipSync, strToU8} from 'fflate';
import {estimateTotals} from '../../src/sasaoka/calc.ts';
import {DEFAULT_LABOR, defaultSettings} from '../../src/sasaoka/defaults.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {estimateXlsx} from '../../src/sasaoka/estimateXlsx.ts';
import {applyImport, cleanName, dateOf, placeFromShinsei, planImport, readDoc, surnameOf} from '../../src/sasaoka/importDocs.ts';
import {NO_RIYU, RIYU_MAP, riyuValues} from '../../src/sasaoka/riyu.ts';
import {laborRow, manualRow, newPlace} from '../../src/sasaoka/rows.ts';
import {jutakuSales, jutakuSalesSummary, planRows} from '../../src/sasaoka/salesPlan.ts';
import {fillShinsei, SHINSEI, shinseiValues, shinseiWorks} from '../../src/sasaoka/shinsei.ts';
import {cleanJobs} from '../../src/sasaoka/storage.ts';
import type {Insurer, Job, Place} from '../../src/sasaoka/types.ts';

const S = defaultSettings();
const tmpl = (name: string) => new Uint8Array(readFileSync(new URL(`../../src/sasaoka/shinsei/${name}.xltx`, import.meta.url)));
const labor = (name: string, qty: number) => laborRow(DEFAULT_LABOR.find((l) => l.name === name) ?? DEFAULT_LABOR[0], qty);

/** 架空の様邸：玄関（切って使う手すり 600mm・ブラケット・同上施工費）、トイレ（L型手すり・施工費・エンドキャップ） */
function sample(extra: Partial<Job> = {}): Job {
  const handrail = manualRow('material', {name: '木の手すり 35φ 4m', maker: '見本', code: 'M-TS35', unit: '本', price: 10000, listPrice: 20000, qty: 1, lengthCm: 60, pieceLengthM: 4});
  const bracket = manualRow('material', {name: 'ブラケット', maker: '見本', code: 'M-BK01', unit: '個', price: 1500, listPrice: 2100, qty: 2});
  const lbar = manualRow('material', {name: 'L型手すり', maker: '見本', code: 'M-TL01', unit: '本', price: 7800, listPrice: 11000, qty: 1});
  const cap = manualRow('material', {name: 'エンドキャップ', unit: '個', price: 300, listPrice: 450, qty: 2});
  return {
    id: 'j-sample',
    month: '2026-10',
    customer: '見本 花子',
    suffix: '様邸',
    staff: '',
    date: '',
    estDate: '2026-10-21',
    address: '福岡県行橋市中央1-1',
    note: '',
    insuredNo: '0000366989',
    insurer: 'yukuhashi',
    form: '',
    overhead: null,
    overheadTarget: null,
    shikiri: true,
    places: [
      {...newPlace('玄関', [handrail, labor(DEFAULT_LABOR[0].name, 2), bracket]), photo: 1, dims: {h: '800'}},
      {...newPlace('トイレ', [lbar, labor(DEFAULT_LABOR[0].name, 1), cap]), photo: 2},
    ],
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

const read = (bytes: Uint8Array, file: string) => {
  const d = readDoc(bytes, file, S, Date.UTC(2026, 9, 25));
  assert.ok(d, `${file} が読めない`);
  return d;
};
const lines = (places: Place[]) => places.map((p) => [p.name, p.photo, p.kind, p.rows.map((r) => [r.kind, r.qty, r.lengthCm, r.estPrice])]);

test('このアプリの見積書（苅田町・行橋市・みやこ町用）を読み戻すと、同じお客様・箇所・行・金額になる', () => {
  const j = sample();
  const want = estimateTotals(j, S);
  const d = read(estimateXlsx(j, S, '2026-10-21').bytes, '見本花子様住宅改修見積書.xlsx');
  assert.equal(d.kind, 'estimate');
  assert.equal(d.name, '見本 花子');
  assert.equal(d.address, '福岡県行橋市中央1-1');
  assert.equal(d.insuredNo, '0000366989');
  assert.equal(d.date, '2026-10-21'); // 右上の作成日（ヘッダー）
  assert.equal(d.total, want.all.total);
  assert.equal(d.tax, want.all.tax);
  assert.equal(d.rows, true);
  assert.deepEqual(
    d.places.map((p) => [p.name, p.photo, p.kind]),
    [
      ['玄関', 1, 1],
      ['トイレ', 2, 1],
    ],
  );
  // 切って使う手すりは 600mm÷4000mm（数量1・使う長さ 60cm・1本 4m）、施工費は見積の金額を1つの行に
  const [hr] = d.places[0].rows;
  assert.deepEqual([hr.kind, hr.qty, hr.lengthCm, hr.pieceLengthM, hr.listPrice, hr.estPrice], ['material', 1, 60, 4, 20000, 16000]);
  assert.equal(d.places[0].rows[1].kind, 'labor');
  const job = applyImport(null, [d], d.name, '2026-10', S, 5);
  assert.deepEqual(estimateTotals(job, S).all, want.all);
  assert.equal(job.shikiri, false); // 工務店の請求書には入れない
  assert.equal(job.estDate, '2026-10-21');
  assert.equal(job.insurer, 'yukuhashi'); // 住所の市町村から
});

test('広域連合用の見積書（名前はシートの名前。対象外の行・時間の施工費）も読み戻せる', () => {
  const j = sample({insurer: 'kouiki', address: '福岡県築上郡築上町椎田1-1'});
  j.places[1].rows[2].excluded = true;
  const want = estimateTotals(j, S);
  assert.ok(want.excluded > 0);
  const d = read(estimateXlsx(j, S, '2026-10-21').bytes, 'a.xlsx');
  assert.equal(d.name, '見本 花子');
  assert.equal(d.insurer, 'kouiki');
  assert.equal(d.rows, true);
  assert.equal(d.date, '2026-10-25'); // 広域連合用には作成日の欄がないので、ファイルの日付
  const job = applyImport(null, [d], d.name, '2026-10', S);
  const got = estimateTotals(job, S);
  assert.deepEqual([got.all, got.target, got.excluded], [want.all, want.target, want.excluded]);
  assert.deepEqual(lines(job.places).map((p) => p.slice(0, 3)), [
    ['玄関', 1, 1],
    ['トイレ', 2, 1],
  ]);
});

test('手で直した諸経費・2ページにわたる見積書も、合計が同じになる', () => {
  const many = Array.from({length: 14}, (_, i) => newPlace(`箇所${i + 1}`, [manualRow('material', {name: `部材${i + 1}`, unit: '個', qty: i + 1, listPrice: 1000 + i * 37})]));
  const j = sample({places: many, overhead: 1234});
  const d = read(estimateXlsx(j, S, '2026-10-21').bytes, 'b.xlsx');
  assert.equal(d.rows, true);
  const job = applyImport(null, [d], d.name, '2026-10', S);
  assert.equal(job.places.length, 14);
  assert.equal(job.overhead, 1234);
  assert.deepEqual(estimateTotals(job, S).all, estimateTotals(j, S).all);
});

test('ほかの形の見積書は、お客様名・住所・合計・消費税だけを読む（行にしない）', () => {
  const xml = (rows: string[][]) =>
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((r, i) => `<row r="${i + 1}">${r.map((v, c) => (v === '' ? '' : `<c r="${String.fromCharCode(65 + c)}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)).join('')}</row>`)
      .join('')}</sheetData></worksheet>`;
  const book = (rows: string[][]) =>
    zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
      'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="見積" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(xml(rows)),
    });
  const d = read(
    book([
      ['御見積書', '', '', '見本工務店株式会社'],
      ['見本 一郎 様', '', '', '見積日', '令和8年11月2日'],
      ['工事場所', '福岡県京都郡みやこ町勝山1-1'],
      ['品名', '数量', '単価', '金額'],
      ['手すり取付工事', '1', '50,000', '50,000'],
      ['小計', '', '', '50,000'],
      ['消費税（10％）', '', '', '5,000'],
      ['合計', '', '', '￥55,000'],
    ]),
    '見本様見積.xlsx',
  );
  assert.deepEqual([d.kind, d.name, d.address, d.date, d.total, d.tax, d.rows, d.places.length], ['estimate', '見本 一郎', '福岡県京都郡みやこ町勝山1-1', '2026-11-02', 55000, 5000, false, 0]);
  // 合計のない表は見積書ではない
  assert.equal(readDoc(book([['部材リスト'], ['品番', '定価'], ['A-1', '1000']]), 'x.xlsx', S), null);
  assert.equal(readDoc(new Uint8Array([1, 2, 3]), 'x.xls', S), null); // .xls（古い形式）・表でないファイル
});

test('申請書（4つの保険者）を読むと、お客様・箇所（寸法・そのほか）・申請書の項目・改修費用', () => {
  const j = sample({
    shinsei: {...NO_SHINSEI, kana: 'ミホン　ハナコ', phone: '0930-00-0000', zip: '824-0001', end: '2026-11-20', cost: 54321},
    places: [
      {...newPlace('玄関', [manualRow('material')]), photo: 1, dims: {l: '600', h: '800'}, shinseiText: 'ベースプレート　L=600mm'},
      {...newPlace('屋外', [manualRow('material')]), kind: 2, photo: 2, dims: {w: '600', d: '350', h: '150'}},
    ],
  });
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as Insurer[]) {
    const jj = {...j, insurer};
    const d = read(fillShinsei(tmpl(insurer), SHINSEI[insurer]!, shinseiValues(jj, S)), `${insurer}.xlsx`);
    assert.equal(d.kind, 'shinsei', insurer);
    assert.equal(d.insurer, insurer);
    assert.equal(d.name, '見本 花子', insurer);
    assert.equal(d.insuredNo, '0000366989', insurer);
    assert.equal(d.total, 54321, insurer);
    assert.equal(d.info.phone, '0930-00-0000', insurer);
    assert.deepEqual(
      d.places.map((p) => [p.name, p.photo, p.kind, p.dims, p.shinseiText ?? '']),
      [
        ['玄関', 1, 1, {l: '600', h: '800'}, 'ベースプレート　L=600mm'],
        ['屋外', 2, 2, {w: '600', d: '350', h: '150'}, ''],
      ],
      insurer,
    );
    const job = applyImport(null, [d], d.name, '2026-11', S);
    assert.equal(job.shinsei?.cost, 54321);
    assert.deepEqual(jutakuSales(job, S), {amount: 49383, tax: 4938, total: 54321}); // 改修費用（税込）＝税抜 四捨五入(54,321÷1.1)＋消費税
  }
});

test('理由書を読むと、お客様・作成者・身体状況などの文', () => {
  const j = sample({
    shinsei: {...NO_SHINSEI, reasonOffice: '見本居宅介護支援事業所', reasonName: '見本 次郎'},
    riyu: {...NO_RIYU, body: '右片麻痺がある。', wish: '一人でトイレに行けるように。', madeDate: '2026-10-20', tel: '0930-11-1111', acts: {...NO_RIYU.acts, toilet: {...NO_RIYU.acts.toilet, trouble: '便器からの立ち上がりが難しい。'}}},
  });
  const d = read(fillShinsei(tmpl('riyu'), RIYU_MAP, riyuValues(j, S, '2026-10-22')), 'r.xlsx');
  assert.equal(d.kind, 'riyu');
  assert.equal(d.name, '見本 花子');
  assert.deepEqual([d.info.reasonOffice, d.info.reasonName], ['見本居宅介護支援事業所', '見本 次郎']);
  assert.deepEqual([d.riyu?.body, d.riyu?.wish, d.riyu?.madeDate, d.riyu?.tel, d.riyu?.acts?.toilet.trouble], ['右片麻痺がある。', '一人でトイレに行けるように。', '2026-10-20', '0930-11-1111', '便器からの立ち上がりが難しい。']);
  assert.equal(d.total, null);
  // 何も書いていない理由書は、原本の文字を読まない
  const empty = read(fillShinsei(tmpl('riyu'), RIYU_MAP, riyuValues(sample({customer: '見本 三郎', insuredNo: '', address: ''}), S, '2026-10-22')), 'e.xlsx');
  assert.deepEqual(empty.riyu, {});
});

test('名字でまとめる：同じ名字は1つの様邸（名前がちがえば名字だけ）、同じ名字の様邸があればそこへ、同じファイルは2回入れない', () => {
  assert.equal(surnameOf('見本 花子'), '見本');
  assert.equal(surnameOf('見本花子', ['見本']), '見本');
  assert.equal(surnameOf('見本花子'), '見本');
  assert.equal(surnameOf('林'), '林');
  assert.equal(cleanName(' 見本 花子 様 '), '見本 花子');
  const est = read(estimateXlsx(sample(), S, '2026-10-21').bytes, '見本花子様住宅改修見積書.xlsx');
  const app = read(fillShinsei(tmpl('yukuhashi'), SHINSEI.yukuhashi!, shinseiValues(sample({customer: '見本 太郎', shinsei: {...NO_SHINSEI, cost: 30000}}), S)), '見本太郎様住宅改修申請書.xlsx');
  const other = read(fillShinsei(tmpl('kanda'), SHINSEI.kanda!, shinseiValues(sample({customer: '試作 一郎', insurer: 'kanda', address: '福岡県京都郡苅田町富久町1-1'}), S)), '試作.xlsx');
  // 様邸がまだないとき：見本の2つは「見本」様（名前がちがう）、試作はそのまま
  const g1 = planImport([est, app, other], []);
  assert.deepEqual(
    g1.map((g) => [g.surname, g.name, g.docs.map((d) => d.kind), g.target, g.month]),
    [
      ['見本', '見本', ['estimate', 'shinsei'], '', '2026-10'],
      ['試作', '試作 一郎', ['shinsei'], '', g1[1].month],
    ],
  );
  const merged = applyImport(null, g1[0].docs, g1[0].name, g1[0].month, S, 10);
  assert.equal(merged.customer, '見本');
  // 見積書の行があるので、売上は見積書の金額（申請書の改修費用は足さない＝同じ工事を2回数えない）
  assert.deepEqual(jutakuSales(merged, S)?.total, estimateTotals(sample(), S).all.total);
  assert.equal(merged.shinsei?.cost ?? null, null);
  assert.equal(merged.imported?.length, 2);
  // 同じ名字の様邸があれば、そこに足す。同じファイルは2回入れない（done）
  const existing: Job = {...sample({id: 'j-old', places: [], customer: '見本 花子', updatedAt: 100}), estDate: ''};
  const again = planImport([est, app], [merged, existing]);
  assert.equal(again.length, 1);
  assert.deepEqual(again[0].docs, []);
  assert.deepEqual(
    again[0].done.map((x) => x.jobId),
    [merged.id, merged.id],
  );
  const g2 = planImport([app], [existing]);
  assert.equal(g2[0].target, 'j-old');
  // ゴミ箱の様邸には足さない
  assert.equal(planImport([app], [{...existing, trashedAt: 5}])[0].target, '');
});

test('合算：同じ方の見積書が2つ（ほかの形の見積書も）なら売上は足した金額、受注残・売上見込みにも入る', () => {
  const a = read(estimateXlsx(sample(), S, '2026-10-21').bytes, 'a.xlsx');
  const b = read(estimateXlsx(sample({places: [newPlace('浴室', [manualRow('material', {name: '浴室手すり', unit: '本', qty: 1, listPrice: 30000})])]}), S, '2026-10-22').bytes, 'b.xlsx');
  const job = applyImport(null, [a, b], '見本 花子', '2026-10', S);
  assert.equal(job.places.length, 3);
  assert.equal(jutakuSales(job, S)!.total, (a.total ?? 0) + (b.total ?? 0));
  // ほかの形の見積書（合計だけ）を足す
  const outside = {...a, hash: 'other', rows: false, places: [], total: 110000, tax: 10000};
  const job2 = applyImport(job, [outside], '見本 花子', '2026-10', S);
  assert.equal(jutakuSales(job2, S)!.total, (a.total ?? 0) + (b.total ?? 0) + 110000);
  // 申請書だけの様邸（改修費用）も売上見込み・受注残に入る。金額のない様邸は入らない
  const onlyApp = {...sample({id: 'j-app', places: [], shinsei: {...NO_SHINSEI, cost: 22000}})};
  const none = {...sample({id: 'j-none', places: []})};
  const rows = planRows([job2, onlyApp, none], {...S}, []);
  assert.deepEqual(
    rows.map((r) => [r.id, r.total]),
    [
      [job2.id, jutakuSales(job2, S)!.total],
      ['j-app', 22000],
    ],
  );
  assert.deepEqual(
    jutakuSalesSummary([job2, onlyApp, none], S, 1).rows.map((r) => [r.id, r.amount, r.tax, r.total]),
    [
      [job2.id, jutakuSales(job2, S)!.amount, jutakuSales(job2, S)!.tax, jutakuSales(job2, S)!.total],
      ['j-app', 20000, 2000, 22000],
    ],
  );
});

test('取り込んだ書類は保存して読み直しても残る（目印・金額）', () => {
  const a = read(estimateXlsx(sample(), S, '2026-10-21').bytes, 'a.xlsx');
  const job = applyImport(null, [a], a.name, '2026-10', S, 9);
  const [back] = cleanJobs(JSON.parse(JSON.stringify([job])));
  assert.deepEqual(back.imported, job.imported);
  assert.deepEqual(back.imported?.[0], {kind: 'estimate', file: 'a.xlsx', hash: a.hash, total: a.total, tax: a.tax, rows: true, at: 9});
});

test('日付・申請書の改修の内容の1行', () => {
  assert.equal(dateOf('令和8年10月21日'), '2026-10-21');
  assert.equal(dateOf('R8.1.5'), '2026-01-05');
  assert.equal(dateOf('2026/11/02'), '2026-11-02');
  assert.equal(dateOf('46316'), '2026-10-21');
  assert.equal(dateOf('なし'), '');
  const p = placeFromShinsei({photo: 3, name: '廊下', kind: 1, text: '手すりの取り付け　L=2400mm H=750mm　ベースプレート'});
  assert.deepEqual([p.name, p.photo, p.kind, p.dims, p.shinseiText], ['廊下', 3, 1, {l: '2400', h: '750'}, 'ベースプレート']);

  // 長さが2本以上（「L=700mm×1100mm×2000mm」「L=600×850mm」）も全部長さに。前は「×1100mm×2000mm」をそのほかにして、改修の内容が2段になった（2026-10-28）
  for (const [text, l] of [
    ['手すりの取り付け　L=700mm×1100mm×2000mm', '700×1100×2000'],
    ['手すりの取り付け　L=600mm ×600mm', '600×600'],
    ['手すりの取り付け　L=600×850mm H=750mm', '600×850'],
    ['手すりの取り付け　Ｌ＝６００ｍｍ×８５０ｍｍ', '600×850'],
  ]) {
    const q = placeFromShinsei({photo: 1, name: '屋外', kind: 1, text});
    assert.equal(q.dims?.l, l, text);
    assert.equal(q.shinseiText, undefined, text);
    assert.deepEqual(shinseiWorks({places: [q]}, defaultSettings()), [`①屋外　手すりの取り付け　L=${l}mm${q.dims?.h ? ` H=${q.dims.h}mm` : ''}`]); // 1行（横一列）
  }
});

// ---------------------------------------------------------------- 特定福祉用具の申請書（ユーザーの報告「申請書を読み込めないことがある」2026-10-29）

/** 表の欄を列の番号で置いた Excel（シートの名前と、行ごとの {列: 値}）。特定福祉用具の様式の並びをまねる（値はどれも架空） */
function gridBook(sheets: [string, Record<number, string>[]][]): Uint8Array {
  const colName = (c: number): string => (c < 26 ? String.fromCharCode(65 + c) : colName(Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26)));
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sheetXml = (rows: Record<number, string>[]) =>
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map((r, i) => `<row r="${i + 1}">${Object.entries(r).map(([c, v]) => `<c r="${colName(Number(c))}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`).join('')}</row>`)
      .join('')}</sheetData></worksheet>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([n], i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach(([, rows], i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(rows))));
  return zipSync(files);
}

test('特定福祉用具の申請書（行橋市の受領委任払の様式の並び）：お客様・保険者・福祉用具（種目・商品名・製造事業者・税込の金額）を読む', () => {
  const book = gridBook([
    [
      '用具・受領委任払',
      [
        {0: 'フ  リ  ガ  ナ', 5: 'ミホン ハナコ', 19: '事業者番号', 25: '4', 26: '0'},
        {0: '被保険者氏名', 5: '見本 花子', 19: '保険者番号', 29: '4', 30: '0'},
        {19: '被保険者番号', 25: '0', 26: '0', 27: '0', 28: '0', 29: '0', 30: '1', 31: '2', 32: '3', 33: '4', 34: '5'},
        {0: '生　年　月　日', 5: '明・大・昭　15年3月15日生', 19: '性　　別', 24: '男　　・　　女'},
        {0: '住　　　　所', 5: '〒', 6: '824-0005', 22: '電話\r\n番号', 24: '0930-00-0000'},
        {5: '行橋市中央1丁目2-3'},
        {0: '福　祉　用　具　名', 11: '製造事業者名及び', 21: '購入予定金額', 27: '購　入　予　定　日'},
        {0: '（種目及び商品名）', 11: '販 売 事 業 者 名'},
        {0: '入浴補助用具\nシャワーチェア 見本A', 11: '見本工業\n見本福祉㈱', 21: '28160', 26: '円'},
        {0: '腰掛便座\nポータブルトイレ 見本C\nPT-02', 11: '見本製作所\n見本福祉㈱', 21: '33,000', 26: '円'},
        {26: '円'},
        {0: '福祉用具が\r\n\r\n必要な理由', 4: '立ち座りが困難なため。'},
        {0: '　行橋市長　様'},
        {0: '　上記のとおり関係書類を添えて居宅介護（介護予防）福祉用具購入費受領委任払いの申請をします。'},
        {0: '申請者', 2: '住　　所', 6: '行橋市大字見本1番地'},
        {2: '氏　　名', 6: '見本福祉株式会社'},
      ],
    ],
    ['委任状', [{0: '委任状'}, {0: '（介護保険福祉用具購入費及び住宅改修費に係る受領委任払い用）'}]],
  ]);
  const d = read(book, '見本花子　行橋市福祉購入受領委任.xlsx');
  assert.deepEqual([d.kind, d.name, d.address, d.insuredNo, d.insurer, d.total], ['tokutei', '見本 花子', '行橋市中央1丁目2-3', '0000012345', 'yukuhashi', 61160]);
  assert.deepEqual(d.info, {kana: 'ミホン ハナコ', zip: '824-0005', phone: '0930-00-0000'}); // 元号は丸（図形）なので読まない
  assert.deepEqual(d.tokutei, [
    {category: '入浴補助用具', name: 'シャワーチェア 見本A', code: '', maker: '見本工業', amount: 28160, taxIn: true},
    {category: '腰掛便座', name: 'ポータブルトイレ 見本C', code: 'PT-02', maker: '見本製作所', amount: 33000, taxIn: true},
  ]);
  // 様邸に入れる：お客様の情報と、特定福祉用具に渡す福祉用具。住宅改修の売上（見積書・改修費用）には入れない
  const job = applyImport(null, [d], '見本 花子', '2026-10', S, 5);
  assert.deepEqual([job.customer, job.address, job.insuredNo, job.insurer, job.shinsei?.kana, job.shinsei?.cost], ['見本 花子', '行橋市中央1丁目2-3', '0000012345', 'yukuhashi', 'ミホン ハナコ', null]);
  assert.deepEqual(job.tokuteiImport, {items: d.tokutei, key: d.hash});
  assert.deepEqual(jutakuSales(job, S), null);
  assert.deepEqual(job.imported?.map((x) => [x.kind, x.total]), [['tokutei', 61160]]);
  // 保存して読み直しても残る（複製には入れない）
  const back = cleanJobs(JSON.parse(JSON.stringify([job])))[0];
  assert.deepEqual(back.tokuteiImport, job.tokuteiImport);
  assert.deepEqual(back.imported?.map((x) => x.kind), ['tokutei']);
});

test('特定福祉用具の申請書（北九州市・福岡市の様式の並び）：値がラベルの上の行・1字ずつのラベル・概要書の税抜の金額・種目の番号・あて先の保険者', () => {
  // 北九州市：支給申請書は種目ごとの金額だけ。商品は概要書（税抜）。氏名・住所はラベルの上の行、「住」「所」は別の欄
  const kk = gridBook([
    [
      '支給申請書',
      [
        {0: '介護保険居宅介護（予防）福祉用具購入費支給申請書（受領委任払用）'},
        {3: 'ﾌ　ﾘ　ｶﾞ　 ﾅ'},
        {23: 'ミホン タロウ', 55: '福祉用具購入月'},
        {23: '見本 太郎', 79: '年'},
        {55: '領収書記載日'},
        {1: '被保険者氏名'},
        {55: '被保険者番号', 68: '0', 72: '0', 76: '0', 78: '0', 80: '0', 84: '5', 88: '4', 91: '3', 94: '2', 99: '1'},
        {23: '北九州市小倉北区見本町1-1'},
        {5: '住', 15: '所'},
        {64: '電話番号', 75: '093-000-0000'},
        {12: '歩行器', 36: '20000', 51: '円'},
        {2: '北九州市長　様'},
        {0: '※特定福祉用具概要書を添付してください。'},
      ],
    ],
    [
      '概要書',
      [
        {15: '特 定 福 祉 用 具 概 要 書'},
        {2: '被保険者氏名'},
        {3: '見本 太郎'},
        {4: '種', 9: '目', 16: '品目、形式等', 33: '概', 37: '要（特長等）', 50: '金', 53: '額'},
        {1: '歩行器', 14: '歩行器 見本D\nWK-03', 47: '20000'},
        {0: '※パンフレット（品名、概要等がわかるもの）を添付してください。'},
      ],
    ],
  ]);
  const k = read(kk, 'kk.xlsx');
  assert.deepEqual([k.kind, k.name, k.address, k.insuredNo, k.insurer, k.total, k.info.kana, k.info.phone], ['tokutei', '見本 太郎', '北九州市小倉北区見本町1-1', '0000054321', 'kitakyushu', 22000, 'ミホン タロウ', '093-000-0000']);
  assert.deepEqual(k.tokutei, [{category: '歩行器', name: '歩行器 見本D', code: 'WK-03', maker: '', amount: 20000, taxIn: false}]);
  // 福岡市：種目は番号、生年月日は分かれた欄（元号が1つなら読む）。注意書きの「北九州市」ではなく、あて先の区長で福岡市
  const fk = gridBook([
    [
      '申請書',
      [
        {2: '介護保険福祉用具購入費支給申請書', 13: '【受領委任払用】'},
        {37: '※受任者は福岡県又は福岡市・北九州市・久留米市のいずれかによる指定を受けた特定福祉用具販売事業者であること。'},
        {2: '被保険者', 3: 'フリガナ', 4: 'ミホン ジロウ'},
        {3: '氏名', 4: '見本 次郎'},
        {13: '被保険者番号', 16: '0', 18: '0', 20: '0', 22: '0', 24: '0', 26: '0', 28: '7', 30: '7', 32: '7', 34: '7'},
        {3: '生年月日', 4: '昭', 7: '20', 8: '年', 9: '1', 10: '月', 11: '2', 12: '日　'},
        {2: '種目※', 3: '商品名', 9: '製造事業者名', 16: '購入金額', 25: '購入日'},
        {2: '9', 3: '多点杖 見本E', 9: '見本工業', 16: '11000', 23: '円'},
        {9: '購入金額合計', 16: '11000', 23: '円'},
        {3: '福岡市　　　　区長', 7: '申請者　', 9: '住　所', 11: '福岡市中央区見本1-1'},
      ],
    ],
  ]);
  const f = read(fk, 'fk.xlsx');
  assert.deepEqual([f.name, f.insuredNo, f.insurer, f.total, f.info.era, f.info.birthY, f.info.birthM, f.info.birthD], ['見本 次郎', '0000007777', 'fukuoka', 11000, '昭和', '20', '1', '2']);
  assert.deepEqual(f.tokutei, [{category: '歩行補助つえ', name: '多点杖 見本E', code: '', maker: '見本工業', amount: 11000, taxIn: true}]);
  // 住宅改修の申請書（委任状に「福祉用具購入費及び住宅改修費」とある）・ほかの表は特定福祉用具の申請書としない
  assert.notEqual(readDoc(gridBook([['委任状', [{0: '委任状'}, {0: '（介護保険福祉用具購入費及び住宅改修費に係る受領委任払い用）'}, {0: '被保険者氏名', 5: '見本 花子'}]]]), 'x.xlsx', S)?.kind, 'tokutei');
});
