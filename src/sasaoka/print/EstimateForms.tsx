// 見積書の2つの書式を、いただいた Excel と同じ形で A4横に印刷する。
// 列の幅・行の高さは元の Excel の比のまま（mm）。長い品名は Excel の「縮小して全体を表示」のように小さく・2行にする。
// sheet のとき（見積書に直接入力）は、手で直せる欄に data-edit（何を直す欄か）を付ける：
//   job:customer など様邸の項目／date 作成日／place:箇所ID:name|work|photo|kind／line:行ID:text|qty|unit|price|note／
//   excl:行ID（介護保険の対象外）／overhead:all|target（諸経費）。明細の行には data-rows（もとになった入力の行）を付ける。
//   金額のない施工費の行も出し、明細のあとに打ち込める空いた行（new:…、data-new）を1行足す。
//   ほかの空いた行には data-blank を付ける（押すと、打ち込める行の同じ列を選ぶ）。
//   行の挿入・削除・コピー・貼付は、見積書の表の見出し（改修内容）の左の小さなボタン（EstimateSheet.tsx。選んでいる行に効く）。前は明細の行の左（余白）に1行ずつ出していたが、
//   ユーザーの指示「削除ボタン、挿入、コピーボタンについては、各行に作成するのではなく、見積もりの左手に設置する」（2026-11-03）で外した。
//   空いた行（空白の部材の行・いちばん下の空いた行）の内容の欄には、薄く「部材｜施工費｜常用」（PICK。押すと部材を選ぶ画面・施工費のリスト・部材＋施工費（常用）。
//   ユーザーの指示「枠内に薄っすら、部材、施工費どちらか選べるよう、押せるようにする」2026-11-03。EstimateSheet.tsx が受ける）。
//   コピーした行には data-copied を付ける。
// 何も入っていない部材の行（line.blank）は、印刷でも空白の行（数量・単価・金額も出さない）
// 明細の下の介護保険の内訳（line.memo。careLines.ts）は左の欄をまとめた1行の文字（data-care）。利用者負担は赤字

import {useEffect, useLayoutEffect, useRef} from 'react';
import type {CSSProperties, ReactNode} from 'react';
import {estimateTotals} from '../calc.ts';
import {CARE_RED, withCareLines} from '../careLines.ts';
import {circled, FORM_INFO, formLines, KINDS, lineNote, paginate, reiwa, sheetNewLine, TOTAL_ROWS} from '../estimateForms.ts';
import type {FormLine} from '../estimateForms.ts';
import type {Job, Settings} from '../types.ts';
import {num, yen} from '../util.ts';
import {fitCss, fitLines, fitName, fitText} from './fit.ts';
import type {Fit} from './fit.ts';
import {shrinkCells} from './shrinkCells.ts';
import {issuerLines, KK, KK_FOOT, KK_LEFT, KK_NOTE_1, KK_NOTE_2, KK_RIGHT, KK_ROWS, NOTE_KIND, NOTE_MARK, NOTE_PHOTO, totalRows, YK, YK_ROW} from './formLayout.ts';

/**
 * fit.ts で決めた欄の文字：1行ならその文字、折り返すときは1行ずつ（Excel と同じ改行。ブラウザに折り返させない）。
 * .fitbox に入れて、ブラウザに出た大きさで欄に入るか測り、入らなければ縮める（shrinkCells.ts。最小フォントサイズの設定などで大きく出たとき）
 */
function fitBody(f: Fit): ReactNode {
  return <span className="fitbox">{f.lines.length > 1 ? f.lines.map((t, i) => <div key={i}>{t}</div>) : f.lines[0]}</span>;
}

/** 書式のページをまとめる要素の ref：描くたびに、欄の文字を欄に収める（shrinkCells）。字体が読み込まれたあとにも */
function useShrinkCells() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => shrinkCells(ref.current));
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && shrinkCells(ref.current));
    return () => {
      alive = false;
    };
  }, []);
  return ref;
}

/**
 * 内容（品名）の欄：長い商品名は言葉の切れ目で行を分けて書く（`fitName`・`wordLines`。「マツ六 BD-132 35アッシュ丸棒」／「ディンプル付 Mオーク 2m」）。
 * 1行に入る商品名は前と同じ（入らなければ欄の幅で折り返す）
 */
function nameCell(text: string, w: number, h: number, pt: number, cls: string, edit: string, lines: number, editable: boolean, slot = '', blank = false): ReactNode {
  const f = text ? fitName(text, w, h, pt, lines) : null;
  // 空きの行（申請書で箇所を入れたときの手すり・ブラケット・施工費などの行。railSlots.ts）は空白の行のまま。名前（「（手すり）」）は出さない
  // （ユーザーの指示「うっすら手すり、ブラケットなど、記載してあるが、誤解をまねくため、不要」2026-11-03。前は見積書の画面に薄い字で出していた）。
  // 印は data-slot だけ（見えない。ブラウザのテスト用）
  const open = editable && !text && slot;
  // 空白の行は、入力の画面だけ「部材｜施工費｜常用」を薄く（PICK）
  const pick = editable && !text && blank;
  return (
    <td className={cls} style={f ? fitCss(f) : undefined} {...ed(editable, edit)} {...(open ? {'data-slot': slot} : {})} {...(pick ? {'data-empty': ''} : {})}>
      {f ? fitBody(f) : text}
      {pick && PICK}
    </td>
  );
}

/**
 * 空いた行の内容の欄に薄く出す「部材｜施工費｜常用」（入力の画面だけ。印刷・Excel には出ない）。押すと、部材＝部材を選ぶ画面（検索）、
 * 施工費＝施工費のリスト（プルダウン）、常用＝部材＋施工費（常用）の画面（EstimateSheet.tsx の `runPick`）。欄を選んで品番・品名を打っても部材リストから探す
 */
const PICK = (
  <span className="sheet-pick" role="group" aria-label="入れるもの">
    <button type="button" tabIndex={-1} data-pick="material" className="pick-material" aria-label="📋 部材リストから入れる" title="部材リスト（品番・品名で検索）から入れる">
      部材
    </button>
    <button type="button" tabIndex={-1} data-pick="labor" className="pick-labor" aria-label="🔧 施工費から入れる" title="施工費のリストから入れる">
      施工費
    </button>
    <button type="button" tabIndex={-1} data-pick="kit" className="pick-kit" aria-label="＋ 部材＋施工費（常用）から入れる" title="部材＋施工費（常用）から入れる">
      常用
    </button>
    {/* 右の薄い矢印と「項目から選ぶ か 品番を入力」は、表の外の重ね（EstimateSheet.tsx の guides）。表の中に置くと、右の欄の罫線が字の上に描かれた */}
  </span>
);

/** 欄の大きさに合わせた文字（`fitText`）の style と中身 */
function fitted(text: string, w: number, h: number, pt: number, lines = 1): {style: CSSProperties | undefined; body: ReactNode} {
  if (!text) return {style: undefined, body: text};
  const f = fitText(text, w, h, pt, lines);
  return {style: fitCss(f), body: fitBody(f)};
}

const qtyText = (n: number) => num(n, 3);
const pct = (rate: number) => num(Math.round(rate * 1000) / 10);

/** 手で直せる欄の印（見積書に直接入力するときだけ） */
const ed = (editable: boolean, key: string | null) => (editable && key ? {'data-edit': key} : {});

/** 空いた行の欄（左から）と、打ち込める行の同じ列の欄の名前（金額・介護保険の欄は打たない。広域連合の材／手は押すと材⇔手） */
const YK_GAP = ['work', 'name', 'text', 'qty', 'unit', 'price', '', '', '', '', '', '', 'note'];
const KK_GAP = ['name', 'work', 'mark', 'text', '', 'qty', 'unit', 'price', '', '', 'photo', 'kind', '', '', '', '', 'note', 'note'];

/**
 * 打ち込める行（isNew）より下の空いた行が、その何行下か（1＝すぐ下）。打ち込める行がこのページにないときは 0（打てない。押すと打ち込める行へ）。
 * その行に打つと、あいだを空白の行でうめてから入る（sheetEdit.ts の gap:）
 */
const gapNo = (page: (FormLine | undefined)[], i: number): number => {
  const ni = page.findIndex((l) => l?.isNew);
  if (!(ni >= 0 && i > ni && !page[i])) return 0;
  // あいだの介護保険の内訳の行（memo。見積書の行ではない）は数えない（前は数えたので、内訳の下の空いた行に打つと、内訳の行の数だけ空白の行が入った。2026-11-08 のデバッグ）
  const memo = page.slice(ni + 1, i).filter((l) => l?.memo).length;
  return i - ni - memo;
};

/**
 * 見積書に直接入力するとき：mark 広域連合用の「材／手」（いちばん下の行に施工費を入れるか）。
 * copied：コピーした行（印を付ける）、pasting：コピーした行がある
 */
export type SheetOpts = {mark: '材' | '手'; copied?: string[]; pasting?: boolean};

/** コピーした行の印（見積書に直接入力するときだけ） */
/**
 * 箇所の欄（改修内容・改修場所・写真番号・改修の種類）の欄のキー：箇所の1行目は place:箇所ID:欄、2行目からは split:行ID:欄（打つとその行から別の箇所。
 * sheetEdit.ts の `splitPlaceAt`。ユーザーの指示「他のセルの上に乗せた場合でも、直接変更や入力ができるようにする」2026-11-04）。
 * 部材のすぐ下の同上施工費の行は、部材と分けられないので打てない（excludeId が上の部材の行）
 */
const placeKey = (l: FormLine, field: string): string | null =>
  l.first ? `place:${l.placeId}:${field}` : l.excludeId === l.rowId ? `split:${l.rowId}:${field}` : null;

const copiedAttr = (sheet: SheetOpts | null | undefined, l: FormLine) => (sheet?.copied?.length && l.rowIds.some((id) => sheet.copied?.includes(id)) ? {'data-copied': ''} : {});

/** 書式の明細の行（sheet なら金額のない施工費の行と、打ち込める空いた行も） */
function sheetLines(job: Job, s: Settings, form: 'yukuhashi' | 'kouiki', sheet: SheetOpts | null | undefined) {
  if (!sheet) return formLines(job, s, form);
  const lines = formLines(job, s, form, {all: true});
  return [...lines, sheetNewLine(job, lines, form, sheet.mark)];
}

// ================================================================ 苅田町・行橋市・みやこ町用「工事費見積書兼工事費内訳書」（列の幅などは formLayout.ts）

export function YukuhashiForm({
  job,
  settings: s,
  date,
  sheet = null,
}: {
  job: Job;
  settings: Settings;
  date: string;
  sheet?: SheetOpts | null;
}) {
  const editable = sheet !== null;
  const per = FORM_INFO.yukuhashi.perPage;
  const pages = paginate(withCareLines(sheetLines(job, s, 'yukuhashi', sheet), job, s, per), per);
  const totals = totalRows(estimateTotals(job, s));
  const d = reiwa(date);
  const issuer = issuerLines(job, s);
  const issuerW = YK.H + YK.I + YK.J + YK.K + YK.L + YK.M;
  const name = job.customer.trim();
  const fitRef = useShrinkCells();
  return (
    <div ref={fitRef} style={{display: 'contents'}}>
      {pages.map((page, pi) => {
        const last = pi === pages.length - 1;
        return (
          <div key={pi} className="form-page yk">
            <div className="fm-head-right" {...ed(editable, 'date')}>
              作成日　令和{d ? d.y : '　'}年{d ? d.m : '　　'}月{d ? d.d : '　　'}日
            </div>
            <table className="fm" style={{width: `${Object.values(YK).reduce((a, b) => a + b, 0)}mm`}}>
              <colgroup>
                {Object.values(YK).map((w, i) => (
                  <col key={i} style={{width: `${w}mm`}} />
                ))}
              </colgroup>
              <tbody>
                <tr style={{height: '10.05mm'}}>
                  <td colSpan={13} className="c" style={{fontSize: '24pt'}}>
                    ①　{FORM_INFO.yukuhashi.title}
                  </td>
                </tr>
                <tr style={{height: '5.82mm'}}>
                  <td colSpan={7} />
                  <td colSpan={6} rowSpan={4} className="yk-issuer">
                    {pi === 0 &&
                      issuer.map((l) => {
                        const f = fitText(l, issuerW, 5, 11);
                        return (
                          <div key={l} style={fitCss(f)}>
                            {fitBody(f)}
                          </div>
                        );
                      })}
                  </td>
                </tr>
                <tr style={{height: '7.67mm'}}>
                  <td colSpan={2} className="c bb" style={fitted(name, YK.A + YK.B, 7.67, 18).style} {...ed(editable, 'job:customer')}>
                    {fitted(name, YK.A + YK.B, 7.67, 18).body}
                  </td>
                  <td style={{fontSize: '12pt'}}>様邸　住宅改修</td>
                  <td colSpan={4} />
                </tr>
                <tr style={{height: '7.67mm'}}>
                  <td colSpan={3} className="bb" style={{fontSize: '12pt'}}>
                    {/* 番号は打った長さのまま入るので、欄に入るか測る（.fitbox。はみ出しを出さない決まり 2026-11-03）。
                        打つ所は（　）の中だけ（ユーザーの報告「介護保険番号の（）内が入力できない」2026-11-04。前は欄全体が打つ所で、押すと「介護保険…」の
                        頭にカーソルが出て、打つと見出しが消え、かっこの中に打てないように見えた）。画面では、空でも押しやすい幅（7字分）にしてまん中に。
                        画面で空のときは印刷用の空白（全角10字）を入れない（押しやすい幅と重なって欄からはみ出した）。幅のない字（\u200b）で高さだけ持たせる */}
                    {pi === 0 && (
                      <span className="fitbox">
                        介護保険被保険者番号（
                        <span {...ed(editable, 'job:insuredNo')} className={editable ? 'inline-block min-w-[7em] text-center' : undefined}>
                          {job.insuredNo.trim() || (editable ? '\u200b' : '　　　　　　　　　　')}
                        </span>
                        ）
                      </span>
                    )}
                  </td>
                  <td colSpan={4} />
                </tr>
                <tr style={{height: '7.67mm'}}>
                  <td className="bt bb" style={fitted('工事場所（住所）', YK.A, 7.67, 12).style}>
                    {fitted('工事場所（住所）', YK.A, 7.67, 12).body}
                  </td>
                  <td colSpan={2} className="bt bb" style={fitted(job.address, YK.B + YK.C, 7.67, 11).style} {...ed(editable, 'job:address')}>
                    {fitted(job.address, YK.B + YK.C, 7.67, 11).body}
                  </td>
                  <td colSpan={10} />
                </tr>
                <tr style={{height: '5.03mm'}}>
                  <td colSpan={13} />
                </tr>
                <tr className="g head" style={{height: '10.53mm'}}>
                  <th rowSpan={2} className="ml mt mb">
                    改修内容
                    <br />
                    （付帯工事含む）
                  </th>
                  <th rowSpan={2} className="mt mb">
                    改修場所
                    <br />
                    （写真No．）
                  </th>
                  <th rowSpan={2} className="mt mb">
                    内容（　規格・範囲　）
                  </th>
                  <th rowSpan={2} colSpan={2} className="mt mb">
                    数量
                  </th>
                  <th rowSpan={2} className="mt mb">
                    単価
                  </th>
                  <th rowSpan={2} className="mt mb mr">
                    金額
                  </th>
                  <th colSpan={4} className="mt mr">
                    介護保険対象部分
                  </th>
                  <th rowSpan={2} className="mt mb mr">
                    介護保険
                    <br />
                    対象外金額
                  </th>
                  <th rowSpan={2} className="mt mb mr">
                    備考（定価等）
                  </th>
                </tr>
                <tr className="g head" style={{height: '5.03mm'}}>
                  <th colSpan={2} className="mb">
                    数量
                  </th>
                  <th className="mb">単価</th>
                  <th className="mb mr">金額</th>
                </tr>
                {Array.from({length: per}, (_, i) => {
                  const bottom = i === per - 1 ? ' mb' : '';
                  const ti = i - (per - TOTAL_ROWS);
                  if (last && ti >= 0) {
                    const [label, all, target] = totals[ti];
                    return (
                      <tr key={i} className="g" style={{height: `${YK_ROW}mm`}}>
                        <td className={`ml${bottom}`} />
                        <td className={bottom} />
                        <td className={`c${bottom}`} style={{fontSize: '9pt', fontWeight: 700}}>
                          {label}
                        </td>
                        <td className={`nr${bottom}`} />
                        <td className={`nl${bottom}`} />
                        <td className={bottom} />
                        <td className={`r mr${bottom}`} style={fitted(yen(all), YK.G, YK_ROW, 11).style} {...ed(editable && label === '諸経費', 'overhead:all')}>
                          {fitted(yen(all), YK.G, YK_ROW, 11).body}
                        </td>
                        <td className={`nr${bottom}`} />
                        <td className={`nl${bottom}`} />
                        <td className={bottom} />
                        <td className={`r mr${bottom}`} style={fitted(yen(target), YK.K, YK_ROW, 11).style} {...ed(editable && label === '諸経費', 'overhead:target')}>
                          {fitted(yen(target), YK.K, YK_ROW, 11).body}
                        </td>
                        <td className={`mr${bottom}`} />
                        <td className={`mr${bottom}`} />
                      </tr>
                    );
                  }
                  return <YkLine key={i} line={page[i]} gap={gapNo(page, i)} bottom={bottom} editable={editable} sheet={sheet} />;
                })}
              </tbody>
            </table>
            <div className="fm-foot">
              ページ　{pi + 1}　／　{pages.length}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YkLine({line: l, gap, bottom, editable, sheet}: {line: FormLine | undefined; gap: number; bottom: string; editable: boolean; sheet: SheetOpts | null}) {
  const cell = (text: string, w: number, pt: number, cls = '', edit: string | null = null, lines = 1, extra: ReactNode = null): ReactNode => {
    const f = fitted(text, w, YK_ROW, pt, lines);
    return (
      <td className={cls + bottom} style={f.style} {...ed(editable, edit)}>
        {f.body}
        {extra}
      </td>
    );
  };
  if (!l) {
    return (
      <tr className="g" style={{height: `${YK_ROW}mm`}} {...(sheet ? {'data-blank': ''} : {})}>
        {['ml', '', '', 'nr', 'nl', '', 'mr', 'nr', 'nl', '', 'mr', 'mr', 'mr'].map((c, i) => (
          // 打ち込める行の下の空いた行も、打ち込める行と同じ欄に打てる（gap:何行下:欄）
          <td key={i} className={c + bottom} {...ed(editable && sheet !== null && gap > 0, YK_GAP[i] ? `gap:${gap}:${YK_GAP[i]}` : null)} />
        ))}
      </tr>
    );
  }
  if (l.memo) {
    // 明細の下の介護保険の内訳（careLines.ts）：改修内容〜内容の3つの欄をまとめて1行の文字。利用者負担は赤字
    const f = fitted(l.memo.text, YK.A + YK.B + YK.C, YK_ROW, 10);
    return (
      <tr className="g" style={{height: `${YK_ROW}mm`}} data-care="">
        <td colSpan={3} className={`ml${bottom}`} style={{...f.style, ...(l.memo.red ? {color: CARE_RED} : {})}}>
          {f.body}
        </td>
        {['nr', 'nl', '', 'mr', 'nr', 'nl', '', 'mr', 'mr', 'mr'].map((c, i) => (
          <td key={i} className={c + bottom} />
        ))}
      </tr>
    );
  }
  if (l.isNew) {
    // 打ち込める空いた行。最後の箇所に行がまだなければ、その箇所の改修内容・改修場所を出す
    const nk = (field: string) => `new:${field}`;
    return (
      <tr className="g sheet-new" style={{height: `${YK_ROW}mm`}} data-new="">
        {cell(l.first ? l.work : '', YK.A, 11, 'ml', nk('work'), 1)}
        {cell(l.first && l.placeName ? `${circled(l.photo)}${l.placeName}` : '', YK.B, 11, '', nk('name'))}
        {cell('', YK.C, 9, '', nk('text'), 1, editable ? PICK : null)}
        {cell('', YK.D, 9, 'r nr', nk('qty'))}
        {cell('', YK.E, 11, 'nl', nk('unit'))}
        {cell('', YK.F, 11, 'r', nk('price'))}
        {['r mr', 'r nr', 'nl', 'r', 'r mr', 'r mr'].map((c, i) => (
          <td key={i} className={c + bottom} />
        ))}
        {cell('', YK.M, 11, 'mr', nk('note'))}
      </tr>
    );
  }
  const target = !l.excluded && !l.blank;
  // 空白の行（何も入っていない部材の行）は数量・単価・金額も出さない（打ち込めばふつうの行になる）。
  // 数を入れていない部材（部材＋施工費（常用）で本数を空けたもの）は数量・金額を空に
  const open = !l.isWork && l.qty === 0;
  const qty = l.blank || open ? '' : qtyText(l.qty);
  const price = l.blank ? '' : yen(l.unitPrice);
  const amount = l.blank || open ? '' : yen(l.amount);
  const k = (field: string) => `line:${l.rowId}:${field}`;
  const excl = `excl:${l.excludeId}`;
  // 備考（定価等）：「定価8,000円（税抜）×0.8」。切って使う部材は「定価20,000円（4m）×0.8」と「600mm÷4000mm＝0.15」の2行
  const note = lineNote(l, 'yukuhashi', 0);
  return (
    <tr className="g" style={{height: `${YK_ROW}mm`}} {...(editable ? {'data-rows': l.rowIds.join(' '), ...copiedAttr(sheet, l)} : {})}>
      {cell(l.first ? l.work : '', YK.A, 11, 'ml', placeKey(l, 'work'), 1)}
      {/* 改修場所（写真No.）：「①勝手口」。写真番号のあとに箇所名を打ち込める */}
      {cell(l.first ? `${circled(l.photo)}${l.placeName}` : '', YK.B, 11, '', placeKey(l, 'name'))}
      {nameCell(l.text, YK.C, YK_ROW, 9, `${bottom}`, k('text'), 2, editable, l.slot, l.blank)}
      {cell(qty, YK.D, 9, 'r nr', l.isWork ? null : k('qty'))}
      {cell(l.unit, YK.E, 11, 'nl', l.isWork || l.cut ? null : k('unit'))}
      {cell(price, YK.F, 11, 'r', k('price'))}
      {/* 金額も打ち込める（施工費はその金額に、部材は 金額÷数量 を単価に。ユーザーの指示「一度入った金額のところを、もう修正できるように」2026-11-02） */}
      {cell(amount, YK.G, 11, 'r mr', l.blank || open ? null : k('amount'))}
      {cell(target ? qty : '', YK.H, 9, 'r nr', excl)}
      {cell(target ? l.unit : '', YK.I, 11, 'nl', excl)}
      {cell(target ? price : '', YK.J, 11, 'r', excl)}
      {cell(target ? amount : '', YK.K, 11, 'r mr', excl)}
      {cell(target || l.blank ? '' : amount, YK.L, 11, 'r mr', excl)}
      {note.length > 1 ? (
        <td className={`mr${bottom}`} style={fitCss(fitLines(note, YK.M, YK_ROW, 11))} {...ed(editable, k('note'))}>
          {fitBody(fitLines(note, YK.M, YK_ROW, 11))}
        </td>
      ) : (
        cell(note[0] ?? '', YK.M, 11, 'mr', k('note'))
      )}
    </tr>
  );
}

// ================================================================ 広域連合用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式。列の幅などは formLayout.ts）

export function KouikiForm({job, settings: s, sheet = null}: {job: Job; settings: Settings; sheet?: SheetOpts | null}) {
  const editable = sheet !== null;
  const per = FORM_INFO.kouiki.perPage;
  const pages = paginate(withCareLines(sheetLines(job, s, 'kouiki', sheet), job, s, per), per);
  const totals = totalRows(estimateTotals(job, s));
  const tax = pct(s.taxRate);
  const fitRef = useShrinkCells();
  return (
    <div ref={fitRef} style={{display: 'contents'}}>
      {pages.map((page, pi) => {
        const last = pi === pages.length - 1;
        return (
          <div key={pi} className="form-page kk">
            <table className="fm" style={{width: `${Object.values(KK).reduce((a, b) => a + b, 0)}mm`}}>
              <colgroup>
                {Object.values(KK).map((w, i) => (
                  <col key={i} style={{width: `${w}mm`}} />
                ))}
              </colgroup>
              <tbody className="mincho">
                <tr style={{height: '4.35mm'}}>
                  <td colSpan={2} className="c kk-label" style={{fontSize: '9pt'}}>
                    内訳書　様式
                  </td>
                  <td colSpan={9} />
                  <td colSpan={7} style={fitted(NOTE_PHOTO, KK_RIGHT, 4.35, 8).style}>
                    {fitted(NOTE_PHOTO, KK_RIGHT, 4.35, 8).body}
                  </td>
                </tr>
                <tr style={{height: '4.6mm'}}>
                  <td colSpan={11} style={fitted(NOTE_MARK, KK_LEFT, 4.6, 8).style}>
                    {fitted(NOTE_MARK, KK_LEFT, 4.6, 8).body}
                  </td>
                  <td colSpan={7} style={fitted(NOTE_KIND, KK_RIGHT, 4.6, 8).style}>
                    {fitted(NOTE_KIND, KK_RIGHT, 4.6, 8).body}
                  </td>
                </tr>
                <tr className="g" style={{height: '7.74mm'}}>
                  <th colSpan={4} className="ml mt mb mr" style={{fontSize: '11pt'}}>
                    改修箇所：箇所毎工事名称：部材・仕様記入欄
                  </th>
                  <th className="gap mt mb" />
                  <th colSpan={4} className="ml mt mb mr" style={{fontSize: '11pt'}}>
                    全改修工事部分
                  </th>
                  <th className="gap mt mb" />
                  <th colSpan={8} className="ml mt mb mr" style={{fontSize: '11pt'}}>
                    対象工事部分
                  </th>
                </tr>
                <tr className="g head" style={{height: '28.05mm'}}>
                  <th className="ml mb">
                    改修箇所
                    <br />
                    （室名）
                  </th>
                  <th className="mb">改修箇所毎工事名称</th>
                  <th className="mb" />
                  <th className="mb mr" style={{...fitCss(fitText('部材・仕様・・・・（材料）', KK.D, 10, 9)), textAlign: 'left'}}>
                    部材・仕様・・・・（材料）
                    <br />
                    付属品を含めた単価を記入。
                    <br />
                    手間・・・・・・（手間）
                  </th>
                  <th className="gap mb" />
                  <th className="ml mb">数量</th>
                  <th className="mb">単位</th>
                  <th className="mb">単価</th>
                  <th className="mb mr">金額</th>
                  <th className="gap mb" />
                  <th className="ml mb" style={{lineHeight: 1.15}}>
                    写<br />真<br />番<br />号
                  </th>
                  <th className="mb" style={{...fitCss(fitText(`${circled(1)}${KINDS[0]}`, KK.L, 4, 9)), textAlign: 'left', fontWeight: 700}}>
                    改修の種類
                    {KINDS.map((k, i) => (
                      <div key={k}>
                        {circled(i + 1)}
                        {k}
                      </div>
                    ))}
                  </th>
                  <th className="ml mb">数量</th>
                  <th className="mb">単位</th>
                  <th className="mb">単価</th>
                  <th className="mb mr">金額</th>
                  <th colSpan={2} className="ml mb mr">
                    算出根拠
                  </th>
                </tr>
                {KK_ROWS.map((h, i) => {
                  const bottom = i === per - 1 ? ' mb' : '';
                  const ti = i - (per - TOTAL_ROWS);
                  if (last && ti >= 0) {
                    const [label, all, target] = totals[ti];
                    const isTax = label === '消費税';
                    return (
                      <tr key={i} className="g" style={{height: `${h}mm`}}>
                        <td className={`ml${bottom}`} />
                        <td className={bottom} />
                        <td className={bottom} />
                        <td className={`c mr${bottom}`} style={{fontSize: '11pt'}}>
                          {label}
                        </td>
                        <td className={`gap${bottom}`} />
                        <td className={`r ml${bottom}`}>{isTax ? tax : ''}</td>
                        <td className={bottom}>{isTax ? '％' : ''}</td>
                        <td className={bottom} />
                        <td className={`r mr${bottom}`} style={fitted(yen(all), KK.I, h, 11).style} {...ed(editable && label === '諸経費', 'overhead:all')}>
                          {fitted(yen(all), KK.I, h, 11).body}
                        </td>
                        <td className={`gap${bottom}`} />
                        <td className={`ml${bottom}`} />
                        <td className={bottom} />
                        <td className={`r ml${bottom}`}>{isTax ? tax : ''}</td>
                        <td className={bottom}>{isTax ? '％' : ''}</td>
                        <td className={bottom} />
                        <td className={`r mr${bottom}`} style={fitted(yen(target), KK.P, h, 11).style} {...ed(editable && label === '諸経費', 'overhead:target')}>
                          {fitted(yen(target), KK.P, h, 11).body}
                        </td>
                        <td colSpan={2} className={`ml mr${bottom}`} />
                      </tr>
                    );
                  }
                  return <KkLine key={i} line={page[i]} gap={gapNo(page, i)} height={h} bottom={bottom} hourRate={s.estimateHourRate} editable={editable} sheet={sheet} />;
                })}
                <tr style={{height: '4.35mm'}}>
                  <td />
                  <td colSpan={14} style={{fontSize: '10pt'}}>
                    {KK_NOTE_1}
                  </td>
                  <td colSpan={3} style={{fontSize: '11pt'}}>
                    Ｐ－{pi + 1}
                  </td>
                </tr>
                <tr style={{height: '4.84mm'}}>
                  <td />
                  <td colSpan={17} style={{fontSize: '10pt'}}>
                    {KK_NOTE_2}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="fm-foot kk-foot">
              <span>{KK_FOOT[0]}</span>
              <span>{KK_FOOT[1]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KkLine({
  line: l,
  gap,
  height,
  bottom,
  hourRate,
  editable,
  sheet,
}: {
  line: FormLine | undefined;
  gap: number;
  height: number;
  bottom: string;
  hourRate: number;
  editable: boolean;
  sheet: SheetOpts | null;
}) {
  const cell = (text: string, w: number, pt: number, cls = '', edit: string | null = null, lines = 1, extra: ReactNode = null): ReactNode => {
    const f = fitted(text, w, height, pt, lines);
    return (
      <td className={cls + bottom} style={f.style} {...ed(editable, edit)}>
        {f.body}
        {extra}
      </td>
    );
  };
  if (!l) {
    return (
      <tr className="g" style={{height: `${height}mm`}} {...(sheet ? {'data-blank': ''} : {})}>
        {['ml', '', '', 'mr', 'gap', 'ml', '', '', 'mr', 'gap', 'ml', '', 'ml', '', '', 'mr', 'ml', 'mr'].map((c, i) => (
          <td key={i} className={c + bottom} {...ed(editable && sheet !== null && gap > 0, KK_GAP[i] ? `gap:${gap}:${KK_GAP[i]}` : null)} />
        ))}
      </tr>
    );
  }
  if (l.memo) {
    // 明細の下の介護保険の内訳（careLines.ts）：改修箇所〜部材・仕様の4つの欄をまとめて1行の文字。利用者負担は赤字
    const f = fitted(l.memo.text, KK.A + KK.B + KK.C + KK.D, height, 11);
    return (
      <tr className="g" style={{height: `${height}mm`}} data-care="">
        <td colSpan={4} className={`ml mr${bottom}`} style={{...f.style, ...(l.memo.red ? {color: CARE_RED} : {})}}>
          {f.body}
        </td>
        {['gap', 'ml', '', '', 'mr', 'gap', 'ml', '', 'ml', '', '', 'mr', 'ml', 'mr'].map((c, i) => (
          <td key={i} className={c + bottom} />
        ))}
      </tr>
    );
  }
  if (l.isNew) {
    // 打ち込める空いた行。材／手で、部材と施工費のどちらを入れるかを選ぶ
    const nk = (field: string) => `new:${field}`;
    return (
      <tr className="g sheet-new" style={{height: `${height}mm`}} data-new="">
        {cell(l.first ? l.placeName : '', KK.A, 11, 'c ml', nk('name'), 2)}
        {cell(l.first ? l.work : '', KK.B, 11, 'c', nk('work'), 2)}
        <td className={`mark${bottom}`} {...ed(editable, nk('mark'))}>
          {l.mark}
        </td>
        {cell('', KK.D, 9, 'mr gothic', nk('text'), 1, editable ? PICK : null)}
        <td className={`gap${bottom}`} />
        {cell('', KK.F, 9, 'r ml gothic', nk('qty'))}
        {cell('', KK.G, 11, 'gothic', nk('unit'))}
        {cell('', KK.H, 11, 'r gothic', nk('price'))}
        <td className={`r mr gothic${bottom}`} />
        <td className={`gap${bottom}`} />
        {cell(l.first ? circled(l.photo) : '', KK.K, 11, 'c ml', nk('photo'))}
        {cell(l.first ? circled(l.kind) : '', KK.L, 11, 'c', nk('kind'))}
        {['r ml gothic', 'gothic', 'r gothic', 'r mr gothic'].map((c, i) => (
          <td key={i} className={c + bottom} />
        ))}
        <td className={`ml${bottom}`} {...ed(editable, nk('note'))} />
        <td className={`mr${bottom}`} {...ed(editable, nk('note'))} />
      </tr>
    );
  }
  const target = !l.excluded && !l.blank;
  // 空白の行（何も入っていない部材の行）は材／手・数量・単価・金額も出さない。数を入れていない部材は数量・金額を空に
  const open = !l.isWork && l.qty === 0;
  const qty = l.blank || open ? '' : qtyText(l.qty);
  const price = l.blank ? '' : yen(l.unitPrice);
  const amount = l.blank || open ? '' : yen(l.amount);
  const k = (field: string) => `line:${l.rowId}:${field}`;
  const excl = `excl:${l.excludeId}`;
  // 算出根拠：「定価8,000円（税抜）×0.8」。施工費は「1時間2,500円×1.2時間」、切って使う部材は「定価20,000円（4m）×0.8」と「600mm÷4000mm＝0.15」の2行。
  // どれも同じ字（ゴシック・欄に入る大きさ。「時間の備考も、他の定価2330（税抜）×0.8などと同様の文字の大きさにする」2026-10-27）
  const note = lineNote(l, 'kouiki', hourRate);
  let basis: ReactNode;
  if (note.length > 0) {
    basis = (
      <td colSpan={2} className={`ml mr gothic${bottom}`} style={fitCss(fitLines(note, KK.Q + KK.R, height, 10))} {...ed(editable, k('note'))}>
        {fitBody(fitLines(note, KK.Q + KK.R, height, 10))}
      </td>
    );
  } else {
    basis = (
      <>
        <td className={`ml${bottom}`} {...ed(editable, k('note'))} />
        <td className={`mr${bottom}`} {...ed(editable, k('note'))} />
      </>
    );
  }
  return (
    <tr className="g" style={{height: `${height}mm`}} {...(editable ? {'data-rows': l.rowIds.join(' '), ...copiedAttr(sheet, l)} : {})}>
      {cell(l.first ? l.placeName : '', KK.A, 11, 'c ml', placeKey(l, 'name'), 2)}
      {cell(l.first ? l.work : '', KK.B, 11, 'c', placeKey(l, 'work'), 2)}
      {/* 材／手：どの行も選んで直せる（押すと材⇔手。ユーザーの指摘「材の部分が選択できない」2026-11-05。前はいちばん下の行だけ） */}
      <td className={`mark${bottom}`} {...ed(editable, k('mark'))}>
        {l.mark}
      </td>
      {nameCell(l.text, KK.D, height, 9, `mr gothic${bottom}`, k('text'), 3, editable, l.slot, l.blank)}
      <td className={`gap${bottom}`} />
      {cell(qty, KK.F, 9, 'r ml gothic', !l.isWork || l.hourly ? k('qty') : null)}
      {cell(l.unit, KK.G, 11, 'gothic', l.isWork || l.cut ? null : k('unit'))}
      {cell(price, KK.H, 11, 'r gothic', l.hourly ? null : k('price'))}
      {cell(amount, KK.I, 11, 'r mr gothic', l.blank || open ? null : k('amount'))}
      <td className={`gap${bottom}`} />
      {cell(l.first ? circled(l.photo) : '', KK.K, 11, 'c ml', placeKey(l, 'photo'))}
      {cell(l.first ? circled(l.kind) : '', KK.L, 11, 'c', placeKey(l, 'kind'))}
      {cell(target ? qty : '', KK.M, 9, 'r ml gothic', excl)}
      {cell(target ? l.unit : '', KK.N, 11, 'gothic', excl)}
      {cell(target ? price : '', KK.O, 11, 'r gothic', excl)}
      {cell(target ? amount : '', KK.P, 11, 'r mr gothic', excl)}
      {basis}
    </tr>
  );
}
