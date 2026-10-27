import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {strFromU8, unzipSync} from 'fflate';
import {hasEstimateRows, startEstimate} from '../../src/sasaoka/calc.ts';
import {NO_SHINSEI} from '../../src/sasaoka/estimateForms.ts';
import {rangeBox, SHINSEI, sheetLayout, sheetPaths, shinseiValues} from '../../src/sasaoka/shinsei.ts';
import {formatNumber, shinseiPreview} from '../../src/sasaoka/shinseiPreview.ts';
import type {PvPage} from '../../src/sasaoka/shinseiPreview.ts';
import type {Insurer, Job, Place, Row} from '../../src/sasaoka/types.ts';

const RATES = {estimateRate: 0.8, estimateLaborRate: 1.5, estimateOverheadRate: 0.1, taxRate: 0.1};
const blank = {code: '', maker: '', unit: '', price: 0, listPrice: 0, lengthCm: 0, pieceLengthM: 0, estPrice: null, excluded: false, estText: null, estNote: null, estAmount: null};
const mat = (id: string, name: string, extra: Partial<Row> = {}): Row => ({...blank, id, kind: 'material', refId: null, name, qty: 1, listPrice: 10000, ...extra});
const place = (id: string, name: string, rows: Row[], extra: Partial<Place> = {}): Place => ({id, name, rows, kind: 1, photo: 0, ...extra});
const job = (insurer: Insurer, extra: Partial<Job> = {}): Job => ({
  id: 'j1',
  month: '2026-10',
  customer: '山田 太郎',
  suffix: '様邸',
  staff: '',
  date: '',
  address: '福岡県京都郡苅田町富久町1-1',
  note: '',
  insuredNo: '0000366989',
  insurer,
  form: insurer === 'kouiki' ? 'kouiki' : 'yukuhashi',
  overhead: null,
  overheadTarget: null,
  shikiri: true,
  places: [place('p1', '玄関', [mat('r1', '木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4})]), place('p2', 'トイレ', [mat('r2', 'L型手すり')])],
  shinsei: {...NO_SHINSEI, kana: 'ヤマダ　タロウ', era: '昭和', birthY: '23', birthM: '5', birthD: '6', gender: '女', care: '要介護2', renovated: '無', phone: '0930-00-0000', start: '2026-11-05', end: '2026-11-20'},
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const files = (insurer: Insurer) => unzipSync(new Uint8Array(readFileSync(new URL(`../../src/sasaoka/shinsei/${insurer}.xltx`, import.meta.url))));
const TEMPLATES = {kanda: files('kanda'), yukuhashi: files('yukuhashi'), miyako: files('miyako'), kouiki: files('kouiki')};
const preview = (insurer: Insurer, j = job(insurer)) => shinseiPreview(TEMPLATES[insurer], SHINSEI[insurer]!, shinseiValues(j, RATES));
/** ページに出る文字（欄ごと） */
const textsOf = (p: PvPage) => p.texts.map((t) => t.runs.map((r) => r.text).join(''));
const textAt = (p: PvPage, ref: string) => {
  const t = p.texts.find((x) => x.ref === ref);
  return t ? t.runs.map((r) => r.text).join('') : undefined;
};

test('表示形式：3けた区切り・円・日付・元号（申請書の原本で使っている形）', () => {
  assert.equal(formatNumber(26958, 'General'), '26958');
  assert.equal(formatNumber(26958, '#,##0'), '26,958');
  assert.equal(formatNumber(1234, '#,##0 ;[Red](#,##0)'), '1,234 ');
  assert.equal(formatNumber(-1234, '#,##0 ;[Red](#,##0)'), '(1,234)');
  assert.equal(formatNumber(80000, '#,##0"円"'), '80,000円');
  assert.equal(formatNumber(46331, 'yyyy"年"m"月"d"日";@'), '2026年11月5日');
  assert.equal(formatNumber(46331, '[$-411]ggge"年"m"月"d"日"'), '令和8年11月5日');
  assert.equal(formatNumber(0.5, '0%'), '50%');
  assert.equal(formatNumber(0, '0;-0;;@'), ''); // 0 を出さない書き方
});

test('プレビュー：保険者ごとに申請書の様式のシートを1枚ずつ（事後申請書は出さない）。表題がヘッダーの行橋市はヘッダーも', () => {
  const forms = (insurer: Insurer) => preview(insurer).filter((p) => p.kind === 'form').map((p) => p.sheet);
  // 苅田町・行橋市は委任状も（特定福祉用具と同じ委任状。委任者の住所だけ書く。2026-10-27）
  assert.deepEqual(forms('kanda'), ['事前申請書', '委任状']);
  assert.deepEqual(forms('yukuhashi'), ['住改・受領委任払', '委任状']);
  assert.deepEqual(forms('miyako'), ['住宅改修承認届出書', '住宅改修費支給申請書(受領委任払用)', '住宅改修内訳明細書']);
  assert.deepEqual(forms('kouiki'), ['様式第2号（住宅改修承認申請書）', '様式第7号（住宅改修費支給申請書（受領委任払用）', '様式第2号別紙（住宅改修内訳明細書）']);
  const [yk] = preview('yukuhashi');
  const title = yk.header?.center.map((r) => r.text).join('');
  assert.equal(title, '介護保険居宅（ 介護・介護予防 ）住宅改修費受領委任払い申請書');
  assert.equal(yk.header?.center[0].font.bold, true);
  assert.ok(yk.header!.center[0].font.size > 20); // 16pt
  for (const p of [...preview('kanda'), ...preview('kouiki')].filter((x) => x.kind === 'form')) {
    assert.ok(p.width > 600 && p.width < 800 && p.height > 700 && p.height < 1200, `${p.sheet} ${p.width}x${p.height}`); // A4 の様式（画素）
    assert.ok(p.lines.length > (p.sheet === '委任状' ? 5 : 20), p.sheet); // 委任状は大きな枠だけ
  }
});

test('プレビュー：様式のうしろに平面図（空いた所に工事内容）と、写真番号の箇所の写真貼付用紙（改修前・改修後の枠）', () => {
  const kinds = (insurer: Insurer, j?: Job) => preview(insurer, j).map((p) => `${p.kind}:${p.sheet}${p.photo ? `:${p.photo}` : ''}`);
  assert.deepEqual(kinds('kanda'), ['form:事前申請書', 'form:委任状', 'plan:平面図  (2)', 'photo:1 :1', 'photo:1  (3):2']);
  assert.deepEqual(kinds('yukuhashi'), ['form:住改・受領委任払', 'form:委任状', 'plan:平面図  (2)', 'photo:住改・写真 ①:1', 'photo:住改・写真②:2']);
  assert.deepEqual(kinds('miyako').slice(3), ['plan:平面図', 'photo:写真 (1):1', 'photo:写真 (2):2']);
  // 広域連合は同じ写真番号の用紙が2枚ずつ。写真を貼る最初の用紙だけ
  assert.deepEqual(kinds('kouiki').slice(3), ['plan:平面図 (2)', 'photo:写真貼付用紙:1', 'photo:写真貼付用紙 (2):2']);
  // 工事内容は申請書の改修の内容と同じ行（苅田町・行橋市・広域連合は空いた所いっぱいの文字の枠、みやこ町は平面図の下の欄 M48）
  const lines = '①玄関　手すりの取り付け　L=600mm\n②トイレ　手すりの取り付け';
  for (const insurer of ['kanda', 'yukuhashi', 'kouiki'] as const) {
    const plan = preview(insurer).find((p) => p.kind === 'plan')!;
    const box = plan.shapes.find((s) => s.text === lines);
    assert.ok(box, insurer);
    assert.deepEqual([box.align, box.valign, box.wrap, box.font?.size], ['left', 'top', true, 16], insurer); // 12pt
    assert.ok(box.x >= 0 && box.x + box.w <= plan.width + 1 && box.y > plan.height / 2 && box.y + box.h <= plan.height + 1, `${insurer} ${JSON.stringify(box)}`);
  }
  const mp = preview('miyako').find((p) => p.kind === 'plan')!;
  assert.equal(textAt(mp, 'M48'), lines);
  // 写真の枠：改修前が上、改修後が下で、ページの中
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    for (const p of preview(insurer).filter((x) => x.kind === 'photo')) {
      assert.deepEqual(p.photoSlots.map((s) => s.slot), ['before', 'after'], p.sheet);
      const [b, a] = p.photoSlots;
      assert.ok(b.y + b.h <= a.y + 1, p.sheet);
      for (const s of p.photoSlots) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= p.width + 1 && s.y + s.h <= p.height + 1 && s.w > 500 && s.h > 300, `${insurer} ${p.sheet} ${JSON.stringify(s)}`);
    }
  }
  // 箇所がなければ、平面図までで写真貼付用紙は出さない。様式・平面図のページに写真の枠はない
  assert.deepEqual(kinds('kanda', job('kanda', {places: []})), ['form:事前申請書', 'form:委任状', 'plan:平面図  (2)']);
  assert.ok(preview('kanda').filter((p) => p.kind !== 'photo').every((p) => p.photoSlots.length === 0));
});

test('プレビュー：平面図の図を入れる枠は、Excel で図を貼る範囲（ShinseiSheet.plan）と同じ所。表題の下・工事内容の上で、ページの中（4つの保険者）。ほかのページにはない', () => {
  for (const insurer of ['kanda', 'yukuhashi', 'miyako', 'kouiki'] as const) {
    const pages = preview(insurer, job(insurer, {planPhoto: 'ph-plan'}));
    const plan = pages.find((p) => p.kind === 'plan')!;
    const s = plan.planSlot!;
    const sheet = SHINSEI[insurer]!.sheets.find((x) => x.plan)!;
    // 平面図のページは原本の A1 から（印刷の範囲・1ページ目）なので、範囲の画素がそのままページの位置
    const lay = sheetLayout(strFromU8(TEMPLATES[insurer][sheetPaths(TEMPLATES[insurer]).get(sheet.sheet)!]));
    assert.deepEqual(s, rangeBox(lay, sheet.plan!), insurer);
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= plan.width + 1 && s.y + s.h <= plan.height + 1 && s.w > 500 && s.h > 450, `${insurer} ${JSON.stringify(s)}`);
    // 表題（氏名の入った欄）の下、工事内容（文字の枠・みやこ町は下の欄）の上
    const title = plan.texts.find((t) => t.runs.some((r) => r.text.includes('山田 太郎')))!;
    const legend = plan.shapes.find((x) => x.text.startsWith('①')) ?? plan.texts.find((t) => t.ref === 'M48')!;
    assert.ok(s.y >= title.y + title.h - 0.5 && s.y + s.h <= legend.y + 0.5, `${insurer} ${JSON.stringify([title, s, legend])}`);
    assert.ok(pages.filter((p) => p.kind !== 'plan').every((p) => p.planSlot === null), insurer);
  }
});

test('プレビュー：転記した内容（Excel に保存するときと同じ書き込み）と、式で同じ値を出す欄・丸（楕円）が出る', () => {
  const [pre] = preview('kanda');
  assert.equal(textAt(pre, 'J6'), 'ヤマダ　タロウ');
  assert.equal(textAt(pre, 'J7'), '山田 太郎');
  assert.equal(textAt(pre, 'J9'), '明　・　大　・　昭　23年5月6日生');
  assert.equal(textAt(pre, 'J14'), '①玄関　手すりの取り付け　L=600mm\n②トイレ　手すりの取り付け');
  assert.equal(textAt(pre, 'M28'), '山田 太郎'); // 申請者の氏名（=J7 の式）
  assert.equal(textAt(pre, 'Y15'), '　　年　　　月　　　日'); // 着工予定日は空白（原本のまま。ユーザーの指示）
  assert.equal(textAt(pre, 'Y16'), '令和8年11月20日');
  assert.deepEqual(
    pre.texts.filter((t) => ['X6', 'Y6', 'AG6'].includes(t.ref)).map((t) => t.runs[0].text),
    ['0', '0', '9'],
  );
  assert.equal(pre.shapes.filter((s) => s.kind === 'ellipse').length, 3); // 昭・女・要介護２
  // みやこ町：支給申請書の改修費用は承認届出書を参照する式の答え（数）を表示形式で。着工日・完成日は日付の表示形式
  const [, pay, detail] = preview('miyako');
  const cost = Number((textAt(preview('miyako')[0], 'I23') ?? '').replace(/[^\d]/g, ''));
  assert.ok(cost > 0);
  assert.equal(textAt(pay, 'J18')?.trim(), cost.toLocaleString('en-US'));
  assert.equal(textAt(pay, 'J16'), '2026年11月5日');
  assert.equal(textAt(pay, 'J5'), 'ヤマダ　タロウ'); // =IF(承認届出書!I4="","",承認届出書!I4)
  assert.ok(textsOf(detail).includes('玄関・トイレ'));
  // 原本にある図形（みやこ町の「受領委任払い」の丸）も出る。様式の外の図形は出さない
  const [top] = preview('miyako');
  assert.equal(top.shapes.filter((s) => s.kind === 'ellipse').length, 1 + 2); // 受領委任払い＋女・無
  for (const s of top.shapes) assert.ok(s.x >= 0 && s.x + s.w <= top.width + 1, JSON.stringify(s));
});

test('プレビュー：原本で縦書きの欄は縦書き（写真貼付用紙の改修の種別①〜⑥・内訳明細書の「写真番号」・理由書の「利用者」など）。横へはみ出さない', () => {
  const photo = preview('kouiki').find((p) => p.kind === 'photo')!;
  const kinds = ['D6', 'F6', 'H6', 'J6', 'L6', 'N6'].map((ref) => photo.texts.find((t) => t.ref === ref)!);
  assert.deepEqual(
    kinds.map((t) => [t.runs.map((r) => r.text).join(''), t.vertical, t.valign]),
    ['手すりの取り付け', '段差の解消', '床材の変更', '扉の取替', '便器の取替', '付帯工事'].map((k) => [k, true, 'top']),
  );
  assert.equal(kinds[0].shrink, true); // ①は縮小して全体を表示（原本のまま。縦の長さで縮める）
  // 結合した2列の幅のまま（横書きのように右の欄へ広げない）
  for (const t of kinds) assert.ok(t.w < 40 && t.h > 80, JSON.stringify([t.ref, t.w, t.h]));
  // みやこ町の写真の用紙も同じ。横書きの欄は横書きのまま
  const my = preview('miyako').find((p) => p.kind === 'photo')!;
  assert.equal(my.texts.find((t) => t.ref === 'D6')?.vertical, true);
  assert.equal(my.texts.find((t) => t.ref === 'C5')?.vertical, false);
  assert.ok(preview('kanda').every((p) => p.texts.every((t) => !t.vertical))); // 苅田町の原本に縦書きはない
});

test('プレビュー：みやこ町・広域連合の写真貼付用紙は、その写真番号の箇所の改修の種類（①〜⑥）に丸（原本に残っていた丸は出さない）', () => {
  const j = (insurer: Insurer) => job(insurer, {places: [place('p1', '玄関', [mat('r1', 'L型手すり')]), place('p2', 'トイレ', [mat('r2', '段差解消スロープ')], {kind: 2})]});
  for (const insurer of ['miyako', 'kouiki'] as const) {
    const photos = preview(insurer, j(insurer)).filter((p) => p.kind === 'photo');
    const circled = photos.map((p) => {
      const cols = ['D6', 'F6', 'H6', 'J6', 'L6', 'N6'].map((ref) => p.texts.find((t) => t.ref === ref)!);
      return p.shapes.filter((s) => s.kind === 'ellipse').map((s) => cols.findIndex((c) => s.x + s.w / 2 >= c.x && s.x + s.w / 2 <= c.x + c.w) + 1);
    });
    assert.deepEqual(circled, [[1], [2]], insurer); // ①玄関＝手すり、②トイレ＝段差の解消（プレビューは箇所のある写真番号だけ。箇所のない用紙は Excel のテスト）
  }
});

test('プレビュー：押すと入れられる欄（申請書の画面の項目）と、押すと丸がつく値。式で同じ値を出す欄（支給申請書の氏名など）も押せる', () => {
  const fieldsOf = (p: PvPage) => [...new Set(p.fields.map((f) => f.field))].sort();
  const [pre] = preview('kanda');
  assert.deepEqual(fieldsOf(pre), ['address', 'birth', 'care', 'cost', 'dates', 'gender', 'insuredNo', 'kana', 'name', 'owner', 'phone', 'works', 'zip'].sort());
  // 被保険者番号の10マスは1つの欄
  const no = pre.fields.filter((f) => f.field === 'insuredNo');
  assert.equal(no.length, 1);
  assert.ok(no[0].w > 150);
  // 申請者の住所・氏名・電話番号（=J11 などの式）も押せる
  assert.equal(pre.fields.filter((f) => f.field === 'name').length, 2);
  assert.deepEqual(
    pre.options.map((o) => o.option),
    ['明治', '大正', '昭和', '男', '女', '要支援1', '要支援2', '要介護1', '要介護2', '要介護3', '要介護4', '要介護5'],
  );
  // となりの値と重ならない
  const care = pre.options.filter((o) => o.key === 'care');
  for (let i = 1; i < care.length; i++) assert.ok(care[i].x >= care[i - 1].x + care[i - 1].w - 0.01, `${care[i - 1].option}・${care[i].option}`);
  // みやこ町：支給申請書は氏名・フリガナ・生年月日などを承認届出書の式で出している
  const [, pay, detail] = preview('miyako');
  for (const f of ['kana', 'name', 'insuredNo', 'birth', 'zip', 'address', 'owner', 'cost', 'phone', 'dates', 'gender', 'renovated']) assert.ok(fieldsOf(pay).includes(f as never), `支給申請書に ${f} の欄がない`);
  assert.deepEqual(fieldsOf(detail), ['insuredNo', 'kana', 'name', 'works']);
  // 広域連合：承認申請書・支給申請書の住所の欄の1行目が郵便番号（ユーザーの指示で足した）、2行目が住所
  for (const p of preview('kouiki').slice(0, 2)) {
    const zip = p.fields.find((f) => f.field === 'zip');
    const address = p.fields.find((f) => f.field === 'address');
    assert.deepEqual([zip?.ref, address?.ref], ['J9', 'J10'], p.sheet);
  }
  // 丸で囲む欄の文字は、丸と同じ計算の位置（1文字ずつ）
  const gender = pre.texts.find((t) => t.ref === 'W9')!;
  assert.equal(gender.marked?.chars.map((c) => c.ch).join(''), '男　　・　　女');
  const [, female] = pre.options.filter((o) => o.key === 'gender');
  const ch = gender.marked!.chars.find((c) => c.ch === '女')!;
  assert.ok(Math.abs(ch.x + ch.w / 2 - (female.x + female.w / 2)) < 0.01);
});

test('改修予定費用は見積書の金額：苅田町・行橋市は合計（税込）、みやこ町・広域連合は介護保険対象分。手で入れた金額が先', () => {
  // トイレの L型手すりを介護保険の対象外にする
  const out = (insurer: Insurer, extra: Partial<Job> = {}) =>
    job(insurer, {places: [place('p1', '玄関', [mat('r1', '木の手すり 35φ 4m', {lengthCm: 60, pieceLengthM: 4})]), place('p2', 'トイレ', [mat('r2', 'L型手すり', {excluded: true})])], ...extra});
  const all = shinseiValues(out('kanda'), RATES).cost!;
  const target = shinseiValues(out('miyako'), RATES).cost!;
  assert.ok(all > target && target > 0, `${all} ${target}`);
  assert.equal(shinseiValues(out('yukuhashi'), RATES).cost, all);
  assert.equal(shinseiValues(out('kouiki'), RATES).cost, target);
  assert.equal(textAt(shinseiPreview(TEMPLATES.kanda, SHINSEI.kanda!, shinseiValues(out('kanda'), RATES))[0], 'J17'), `${all.toLocaleString('en-US')}円`);
  assert.equal(shinseiValues(out('kanda', {shinsei: {...NO_SHINSEI, cost: 99000}}), RATES).cost, 99000);
});

test('見積書をはじめて書きはじめたとき：見積もり作成日を今日にし、今月の笹岡工務店の請求書に入れる（申請書だけの様邸は入れない）', () => {
  const blankRow: Row = {...blank, id: 'b1', kind: 'material', refId: null, name: '', qty: 0};
  const fresh = job('kanda', {estDate: '', shikiri: false, month: '2026-09', places: [place('p1', '玄関', [blankRow])]});
  assert.equal(hasEstimateRows(fresh), false);
  // 申請書で箇所を足しただけ（空白の行）は変えない
  const more = {...fresh, places: [...fresh.places, place('p2', 'トイレ', [{...blankRow, id: 'b2'}])]};
  assert.deepEqual(startEstimate(fresh, more, '2026-10-21'), more);
  // 見積書に行が入った
  const started = startEstimate(fresh, {...fresh, places: [place('p1', '玄関', [mat('r1', 'L型手すり')])]}, '2026-10-21');
  assert.deepEqual([started.estDate, started.shikiri, started.month], ['2026-10-21', true, '2026-10']);
  // 一覧で次の月に回してあった様邸は、その月のまま
  const moved = startEstimate({...fresh, month: '2026-11'}, {...fresh, month: '2026-11', places: [place('p1', '玄関', [mat('r1', 'L型手すり')])]}, '2026-10-21');
  assert.equal(moved.month, '2026-11');
  // 前から行のある見積書・見積もり作成日のある見積書は変えない（前の版で作った見積書を直しても、請求する月は変わらない）
  const old = job('kanda', {estDate: '', shikiri: false, month: '2026-08'});
  const edited = {...old, customer: '山田 次郎'};
  assert.deepEqual(startEstimate(old, edited, '2026-10-21'), edited);
  const dated = {...fresh, estDate: '2026-10-01'};
  const filled = {...dated, places: [place('p1', '玄関', [mat('r1', 'L型手すり')])]};
  assert.deepEqual(startEstimate(dated, filled, '2026-10-21'), filled);
});
