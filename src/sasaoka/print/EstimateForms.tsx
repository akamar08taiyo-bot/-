// 見積書の2つの書式を、いただいた Excel と同じ形で A4横に印刷する。
// 列の幅・行の高さは元の Excel の比のまま（mm）。長い品名は Excel の「縮小して全体を表示」のように小さく・2行にする。
// sheet のとき（見積書に直接入力）は、手で直せる欄に data-edit（何を直す欄か）を付ける：
//   job:customer など様邸の項目／date 作成日／place:箇所ID:name|work|photo|kind／line:行ID:text|qty|unit|price|note／
//   excl:行ID（介護保険の対象外）／overhead:all|target（諸経費）。明細の行には data-rows（もとになった入力の行）を付ける。
//   金額のない施工費の行も出し、明細のあとに打ち込める空いた行（new:…、data-new）を1行足す。
//   ほかの空いた行には data-blank を付ける（押すと、打ち込める行の同じ列を選ぶ）。
//   明細の行の左（余白）には「＋」（data-ins：この行の下に空白の行を入れる）と「✕」（data-del：この行を消す。部材は同上施工費ごと）を出す。
// 何も入っていない部材の行（line.blank）は、印刷でも空白の行（数量・単価・金額も出さない）

import type {ReactNode} from 'react';
import {estimateTotals} from '../calc.ts';
import {circled, FORM_INFO, formLines, KINDS, lineNote, paginate, reiwa, sheetNewLine, TOTAL_ROWS} from '../estimateForms.ts';
import type {FormLine} from '../estimateForms.ts';
import type {Job, Settings} from '../types.ts';
import {num, yen} from '../util.ts';
import {fitLinesStyle, fitStyle} from './fit.ts';
import {issuerLines, KK, KK_FOOT, KK_LEFT, KK_NOTE_1, KK_NOTE_2, KK_RIGHT, KK_ROWS, NOTE_KIND, NOTE_MARK, NOTE_PHOTO, totalRows, YK, YK_ROW} from './formLayout.ts';

const qtyText = (n: number) => num(n, 3);
const pct = (rate: number) => num(Math.round(rate * 1000) / 10);

/** 手で直せる欄の印（見積書に直接入力するときだけ） */
const ed = (editable: boolean, key: string | null) => (editable && key ? {'data-edit': key} : {});

/** 見積書に直接入力するとき：広域連合用の「材／手」（いちばん下の行に施工費を入れるか） */
export type SheetOpts = {mark: '材' | '手'};

/**
 * 見積書に直接入力するときの、明細の行の左のボタン：「＋」この行の下に1行入れる（空白の行）／「✕」この行を消す（部材は同上施工費ごと）。
 * 印刷には出ない。文字は CSS で出す（欄の文字 innerText に混ざらないように）
 */
function RowTools({line: l}: {line: FormLine}) {
  const name = l.text || (l.isWork ? '施工費' : l.blank ? '空白' : '部材');
  return (
    <span className="sheet-rowtools no-print">
      <button type="button" className="sheet-ins" data-ins={l.rowId} title="この行の下に1行入れる" aria-label={`${name}の行の下に1行入れる`} />
      <button
        type="button"
        className="sheet-del"
        data-del={l.rowId}
        title={l.isWork || l.blank ? 'この行を消す' : 'この部材（と同上施工費）を消す'}
        aria-label={`${name}の行を消す`}
      />
    </span>
  );
}

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
  const pages = paginate(sheetLines(job, s, 'yukuhashi', sheet), per);
  const totals = totalRows(estimateTotals(job, s));
  const d = reiwa(date);
  const issuer = issuerLines(job, s);
  const issuerW = YK.H + YK.I + YK.J + YK.K + YK.L + YK.M;
  const name = job.customer.trim();
  return (
    <>
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
                      issuer.map((l) => (
                        <div key={l} style={fitStyle(l, issuerW, 5, 11)}>
                          {l}
                        </div>
                      ))}
                  </td>
                </tr>
                <tr style={{height: '7.67mm'}}>
                  <td colSpan={2} className="c bb" style={fitStyle(name, YK.A + YK.B, 7.67, 18)} {...ed(editable, 'job:customer')}>
                    {name}
                  </td>
                  <td style={{fontSize: '12pt'}}>様邸　住宅改修</td>
                  <td colSpan={4} />
                </tr>
                <tr style={{height: '7.67mm'}}>
                  <td colSpan={3} className="bb" style={{fontSize: '12pt'}} {...ed(editable && pi === 0, 'job:insuredNo')}>
                    {pi === 0 && `介護保険被保険者番号（${job.insuredNo.trim() || '　　　　　　　　　　'}）`}
                  </td>
                  <td colSpan={4} />
                </tr>
                <tr style={{height: '7.67mm'}}>
                  <td className="bt bb" style={fitStyle('工事場所（住所）', YK.A, 7.67, 12)}>
                    工事場所（住所）
                  </td>
                  <td colSpan={2} className="bt bb" style={fitStyle(job.address, YK.B + YK.C, 7.67, 11)} {...ed(editable, 'job:address')}>
                    {job.address}
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
                        <td className={`r mr${bottom}`} {...ed(editable && label === '諸経費', 'overhead:all')}>
                          {yen(all)}
                        </td>
                        <td className={`nr${bottom}`} />
                        <td className={`nl${bottom}`} />
                        <td className={bottom} />
                        <td className={`r mr${bottom}`} {...ed(editable && label === '諸経費', 'overhead:target')}>
                          {yen(target)}
                        </td>
                        <td className={`mr${bottom}`} />
                        <td className={`mr${bottom}`} />
                      </tr>
                    );
                  }
                  return <YkLine key={i} line={page[i]} bottom={bottom} editable={editable} sheet={sheet !== null} />;
                })}
              </tbody>
            </table>
            <div className="fm-foot">
              ページ　{pi + 1}　／　{pages.length}
            </div>
          </div>
        );
      })}
    </>
  );
}

function YkLine({line: l, bottom, editable, sheet}: {line: FormLine | undefined; bottom: string; editable: boolean; sheet: boolean}) {
  const cell = (text: string, w: number, pt: number, cls = '', edit: string | null = null, lines = 1, extra: ReactNode = null): ReactNode => (
    <td className={cls + bottom} style={text ? fitStyle(text, w, YK_ROW, pt, lines) : undefined} {...ed(editable, edit)}>
      {text}
      {extra}
    </td>
  );
  if (!l) {
    return (
      <tr className="g" style={{height: `${YK_ROW}mm`}} {...(sheet ? {'data-blank': ''} : {})}>
        {['ml', '', '', 'nr', 'nl', '', 'mr', 'nr', 'nl', '', 'mr', 'mr', 'mr'].map((c, i) => (
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
        {cell(l.first ? l.work : '', YK.A, 11, 'ml', nk('work'))}
        {cell(l.first && l.placeName ? `${circled(l.photo)}${l.placeName}` : '', YK.B, 11, '', nk('name'))}
        {cell('', YK.C, 9, '', nk('text'))}
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
  // 空白の行（何も入っていない部材の行）は数量・単価・金額も出さない（打ち込めばふつうの行になる）
  const qty = l.blank ? '' : qtyText(l.qty);
  const price = l.blank ? '' : yen(l.unitPrice);
  const amount = l.blank ? '' : yen(l.amount);
  const k = (field: string) => `line:${l.rowId}:${field}`;
  const excl = `excl:${l.excludeId}`;
  // 備考（定価等）：「定価8,000円（税抜）×0.8」。切って使う部材は「定価20,000円（4m）×0.8」と「600÷4000＝0.15」の2行
  const note = lineNote(l, 'yukuhashi', 0);
  return (
    <tr className="g" style={{height: `${YK_ROW}mm`}} {...(editable ? {'data-rows': l.rowIds.join(' ')} : {})}>
      {cell(l.first ? l.work : '', YK.A, 11, editable ? 'ml tools-cell' : 'ml', l.first ? `place:${l.placeId}:work` : null, 1, editable ? <RowTools line={l} /> : null)}
      {/* 改修場所（写真No.）：「①勝手口」。写真番号のあとに箇所名を打ち込める */}
      {cell(l.first ? `${circled(l.photo)}${l.placeName}` : '', YK.B, 11, '', l.first ? `place:${l.placeId}:name` : null)}
      {cell(l.text, YK.C, 9, '', k('text'), 2)}
      {cell(qty, YK.D, 9, 'r nr', l.isWork ? null : k('qty'))}
      {cell(l.unit, YK.E, 11, 'nl', l.isWork || l.cut ? null : k('unit'))}
      {cell(price, YK.F, 11, 'r', k('price'))}
      {cell(amount, YK.G, 11, 'r mr')}
      {cell(target ? qty : '', YK.H, 9, 'r nr', excl)}
      {cell(target ? l.unit : '', YK.I, 11, 'nl', excl)}
      {cell(target ? price : '', YK.J, 11, 'r', excl)}
      {cell(target ? amount : '', YK.K, 11, 'r mr', excl)}
      {cell(target || l.blank ? '' : amount, YK.L, 11, 'r mr', excl)}
      {note.length > 1 ? (
        <td className={`mr${bottom}`} style={fitLinesStyle(note, YK.M, YK_ROW, 11)} {...ed(editable, k('note'))}>
          {note.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
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
  const pages = paginate(sheetLines(job, s, 'kouiki', sheet), per);
  const totals = totalRows(estimateTotals(job, s));
  const tax = pct(s.taxRate);
  return (
    <>
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
                  <td colSpan={7} style={fitStyle(NOTE_PHOTO, KK_RIGHT, 4.35, 8)}>
                    {NOTE_PHOTO}
                  </td>
                </tr>
                <tr style={{height: '4.6mm'}}>
                  <td colSpan={11} style={fitStyle(NOTE_MARK, KK_LEFT, 4.6, 8)}>
                    {NOTE_MARK}
                  </td>
                  <td colSpan={7} style={fitStyle(NOTE_KIND, KK_RIGHT, 4.6, 8)}>
                    {NOTE_KIND}
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
                  <th className="mb mr" style={{...fitStyle('部材・仕様・・・・（材料）', KK.D, 10, 9), textAlign: 'left'}}>
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
                  <th className="mb" style={{...fitStyle('①手すりの取付', KK.L, 4, 9), textAlign: 'left', fontWeight: 700}}>
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
                        <td className={`r mr${bottom}`} {...ed(editable && label === '諸経費', 'overhead:all')}>
                          {yen(all)}
                        </td>
                        <td className={`gap${bottom}`} />
                        <td className={`ml${bottom}`} />
                        <td className={bottom} />
                        <td className={`r ml${bottom}`}>{isTax ? tax : ''}</td>
                        <td className={bottom}>{isTax ? '％' : ''}</td>
                        <td className={bottom} />
                        <td className={`r mr${bottom}`} {...ed(editable && label === '諸経費', 'overhead:target')}>
                          {yen(target)}
                        </td>
                        <td colSpan={2} className={`ml mr${bottom}`} />
                      </tr>
                    );
                  }
                  return <KkLine key={i} line={page[i]} height={h} bottom={bottom} hourRate={s.estimateHourRate} editable={editable} sheet={sheet !== null} />;
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
    </>
  );
}

function KkLine({
  line: l,
  height,
  bottom,
  hourRate,
  editable,
  sheet,
}: {
  line: FormLine | undefined;
  height: number;
  bottom: string;
  hourRate: number;
  editable: boolean;
  sheet: boolean;
}) {
  const cell = (text: string, w: number, pt: number, cls = '', edit: string | null = null, lines = 1, extra: ReactNode = null): ReactNode => (
    <td className={cls + bottom} style={text ? fitStyle(text, w, height, pt, lines) : undefined} {...ed(editable, edit)}>
      {text}
      {extra}
    </td>
  );
  if (!l) {
    return (
      <tr className="g" style={{height: `${height}mm`}} {...(sheet ? {'data-blank': ''} : {})}>
        {['ml', '', '', 'mr', 'gap', 'ml', '', '', 'mr', 'gap', 'ml', '', 'ml', '', '', 'mr', 'ml', 'mr'].map((c, i) => (
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
        {cell('', KK.D, 9, 'mr gothic', nk('text'))}
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
  // 空白の行（何も入っていない部材の行）は材／手・数量・単価・金額も出さない
  const qty = l.blank ? '' : qtyText(l.qty);
  const price = l.blank ? '' : yen(l.unitPrice);
  const amount = l.blank ? '' : yen(l.amount);
  const k = (field: string) => `line:${l.rowId}:${field}`;
  const excl = `excl:${l.excludeId}`;
  // 算出根拠：「定価8,000円（税抜）×0.8」。施工費は「1時間2,500円」、切って使う部材は「定価20,000円（4m）×0.8」と「600÷4000＝0.15」の2行
  const note = lineNote(l, 'kouiki', hourRate);
  let basis: ReactNode;
  if (note.length === 1 && l.hourly && l.note === null) {
    basis = (
      <td colSpan={2} className={`c ml mr${bottom}`} style={fitStyle(note[0], KK.Q + KK.R, height, 11)} {...ed(editable, k('note'))}>
        {note[0]}
      </td>
    );
  } else if (note.length > 0) {
    basis = (
      <td colSpan={2} className={`ml mr gothic${bottom}`} style={fitLinesStyle(note, KK.Q + KK.R, height, 10)} {...ed(editable, k('note'))}>
        {note.map((t, i) => (
          <div key={i}>{t}</div>
        ))}
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
    <tr className="g" style={{height: `${height}mm`}} {...(editable ? {'data-rows': l.rowIds.join(' ')} : {})}>
      {cell(l.first ? l.placeName : '', KK.A, 11, editable ? 'c ml tools-cell' : 'c ml', l.first ? `place:${l.placeId}:name` : null, 2, editable ? <RowTools line={l} /> : null)}
      {cell(l.first ? l.work : '', KK.B, 11, 'c', l.first ? `place:${l.placeId}:work` : null, 2)}
      <td className={`mark${bottom}`}>{l.blank ? '' : l.mark}</td>
      {cell(l.text, KK.D, 9, 'mr gothic', k('text'), 3)}
      <td className={`gap${bottom}`} />
      {cell(qty, KK.F, 9, 'r ml gothic', !l.isWork || l.hourly ? k('qty') : null)}
      {cell(l.unit, KK.G, 11, 'gothic', l.isWork || l.cut ? null : k('unit'))}
      {cell(price, KK.H, 11, 'r gothic', l.hourly ? null : k('price'))}
      {cell(amount, KK.I, 11, 'r mr gothic')}
      <td className={`gap${bottom}`} />
      {cell(l.first ? circled(l.photo) : '', KK.K, 11, 'c ml', l.first ? `place:${l.placeId}:photo` : null)}
      {cell(l.first ? circled(l.kind) : '', KK.L, 11, 'c', l.first ? `place:${l.placeId}:kind` : null)}
      {cell(target ? qty : '', KK.M, 9, 'r ml gothic', excl)}
      {cell(target ? l.unit : '', KK.N, 11, 'gothic', excl)}
      {cell(target ? price : '', KK.O, 11, 'r gothic', excl)}
      {cell(target ? amount : '', KK.P, 11, 'r mr gothic', excl)}
      {basis}
    </tr>
  );
}
