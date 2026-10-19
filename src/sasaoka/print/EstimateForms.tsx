// 見積書の2つの書式を、いただいた Excel と同じ形で A4横に印刷する。
// 列の幅・行の高さは元の Excel の比のまま（mm）。長い品名は Excel の「縮小して全体を表示」のように小さく・2行にする。
// editable のとき（様邸の画面の右のプレビュー）は、手で直せる欄に data-edit（何を直す欄か）を付ける：
//   job:customer など様邸の項目／date 作成日／place:箇所ID:name|work|photo|kind／line:行ID:text|qty|unit|price|note／
//   excl:行ID（介護保険の対象外）／overhead:all|target（諸経費）。明細の行には data-rows（もとになった入力の行）を付ける

import type {ReactNode} from 'react';
import {estimateTotals} from '../calc.ts';
import type {EstimateTotals} from '../calc.ts';
import {circled, FORM_INFO, formLines, KINDS, lineNote, paginate, reiwa, TOTAL_ROWS} from '../estimateForms.ts';
import type {FormLine} from '../estimateForms.ts';
import type {Job, Settings} from '../types.ts';
import {num, staffFull, yen} from '../util.ts';
import {fitLinesStyle, fitStyle} from './fit.ts';

const qtyText = (n: number) => num(n, 3);
const pct = (rate: number) => num(Math.round(rate * 1000) / 10);

/** 手で直せる欄の印（editable のときだけ） */
const ed = (editable: boolean, key: string | null) => (editable && key ? {'data-edit': key} : {});

/** 合計の欄の4行（小計・諸経費・消費税・合計）。[名前, 全体, 介護保険の対象] */
function totalRows(t: EstimateTotals): [string, number, number][] {
  return [
    ['小計', t.all.subtotal, t.target.subtotal],
    ['諸経費', t.all.overhead, t.target.overhead],
    ['消費税', t.all.tax, t.target.tax],
    ['合計', t.all.total, t.target.total],
  ];
}

// ================================================================ 苅田町・行橋用「工事費見積書兼工事費内訳書」
// 列 A〜M の幅（mm）。A 改修内容／B 改修場所（写真No.）／C 内容（規格・範囲）／D・E 数量と単位／F 単価／G 金額／
// H〜K 介護保険対象部分（数量・単位・単価・金額）／L 介護保険対象外金額／M 備考（定価等）
const YK = {A: 31.1, B: 24.9, C: 48.1, D: 7.1, E: 7.1, F: 15.5, G: 22.3, H: 7.1, I: 7.1, J: 15.5, K: 25.2, L: 22.9, M: 32.2};
const YK_ROW = 5.77; // 明細の1行（元の 16.35pt）

export function YukuhashiForm({job, settings: s, date, editable = false}: {job: Job; settings: Settings; date: string; editable?: boolean}) {
  const per = FORM_INFO.yukuhashi.perPage;
  const pages = paginate(formLines(job, s, 'yukuhashi'), per);
  const totals = totalRows(estimateTotals(job, s));
  const d = reiwa(date);
  const issuer = [
    `住　　　所　${s.address}`,
    `施工業者名　${s.company.replace('株式会社', '(株)')}${s.officeName}`,
    `代表者名　${s.officeName}所長　${s.manager}`,
    `担当者・電話番号　担当： ${staffFull(job.staff, s.staffList) || s.person}　${s.tel}`,
  ];
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
                  return <YkLine key={i} line={page[i]} bottom={bottom} editable={editable} />;
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

function YkLine({line: l, bottom, editable}: {line: FormLine | undefined; bottom: string; editable: boolean}) {
  const cell = (text: string, w: number, pt: number, cls = '', edit: string | null = null, lines = 1): ReactNode => (
    <td className={cls + bottom} style={text ? fitStyle(text, w, YK_ROW, pt, lines) : undefined} {...ed(editable, edit)}>
      {text}
    </td>
  );
  if (!l) {
    return (
      <tr className="g" style={{height: `${YK_ROW}mm`}}>
        {['ml', '', '', 'nr', 'nl', '', 'mr', 'nr', 'nl', '', 'mr', 'mr', 'mr'].map((c, i) => (
          <td key={i} className={c + bottom} />
        ))}
      </tr>
    );
  }
  const target = !l.excluded;
  const qty = qtyText(l.qty);
  const k = (field: string) => `line:${l.rowId}:${field}`;
  const excl = `excl:${l.excludeId}`;
  // 備考（定価等）：定価。切って使う部材は「定価：￥20,000×0.8」と「0.6m÷4m＝0.15本」の2行
  const v = lineNote(l, 'yukuhashi', 0);
  const note = 'split' in v ? [v.split.join('')] : v.lines;
  return (
    <tr className="g" style={{height: `${YK_ROW}mm`}} {...(editable ? {'data-rows': l.rowIds.join(' ')} : {})}>
      {cell(l.first ? l.work : '', YK.A, 11, 'ml', l.first ? `place:${l.placeId}:work` : null)}
      {cell(l.first ? `${l.placeName}${circled(l.photo)}` : '', YK.B, 11, '', l.first ? `place:${l.placeId}:name` : null)}
      {cell(l.text, YK.C, 9, '', k('text'), 2)}
      {cell(qty, YK.D, 9, 'r nr', l.isWork ? null : k('qty'))}
      {cell(l.unit, YK.E, 11, 'nl', l.isWork || l.cut ? null : k('unit'))}
      {cell(yen(l.unitPrice), YK.F, 11, 'r', k('price'))}
      {cell(yen(l.amount), YK.G, 11, 'r mr')}
      {cell(target ? qty : '', YK.H, 9, 'r nr', excl)}
      {cell(target ? l.unit : '', YK.I, 11, 'nl', excl)}
      {cell(target ? yen(l.unitPrice) : '', YK.J, 11, 'r', excl)}
      {cell(target ? yen(l.amount) : '', YK.K, 11, 'r mr', excl)}
      {cell(target ? '' : yen(l.amount), YK.L, 11, 'r mr', excl)}
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

// ================================================================ みやこ町・広域連合用「住宅改修内訳明細書」（福岡県介護保険広域連合の様式）
// 列 A〜R の幅（mm）。E・J は区切りの二重線のすき間。
// A 改修箇所（室名）／B 改修箇所毎工事名称／C 材・手／D 部材・仕様／F〜I 全改修工事部分（数量・単位・単価・金額）／
// K 写真番号／L 改修の種類／M〜P 対象工事部分（数量・単位・単価・金額）／Q・R 算出根拠
const KK = {
  A: 14.76,
  B: 38.58,
  C: 5.44,
  D: 38.58,
  E: 1.2,
  F: 11.39,
  G: 7.77,
  H: 15.02,
  I: 20.46,
  J: 1.2,
  K: 7.77,
  L: 22.79,
  M: 11.39,
  N: 7.77,
  O: 15.02,
  P: 18.9,
  Q: 13.72,
  R: 14.24,
};
// 明細の14行の高さ（mm）。元の 30pt×10行と、合計の入る下の4行（27.75・24.75・26.25・24.75pt）を、A4横に入るよう縮めたもの
const KK_ROWS = [...Array(10).fill(9.67), 8.95, 7.98, 8.46, 7.98];
const KK_LEFT = KK.A + KK.B + KK.C + KK.D + KK.E + KK.F + KK.G + KK.H + KK.I + KK.J + KK.K; // A〜K
const KK_RIGHT = KK.L + KK.M + KK.N + KK.O + KK.P + KK.Q + KK.R; // L〜R
const NOTE_PHOTO = '※写真番号は、写真貼り付け用紙の写真番号と同じに';
const NOTE_MARK = '※材料費と施工費を工事項目毎に明記。　※「改修箇所毎工事名称」欄記入の時は、材料費は（材）、施工費は（手）を名称の前に明記。';
const NOTE_KIND = '※改修の種類は、該当する番号だけを記入';

export function KouikiForm({job, settings: s, editable = false}: {job: Job; settings: Settings; editable?: boolean}) {
  const per = FORM_INFO.kouiki.perPage;
  const pages = paginate(formLines(job, s, 'kouiki'), per);
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
                  return <KkLine key={i} line={page[i]} height={h} bottom={bottom} hourRate={s.estimateHourRate} editable={editable} />;
                })}
                <tr style={{height: '4.35mm'}}>
                  <td />
                  <td colSpan={14} style={{fontSize: '10pt'}}>
                    ※介護保険対象にならない部分は、全改修工事部分の欄に記入。
                  </td>
                  <td colSpan={3} style={{fontSize: '11pt'}}>
                    Ｐ－{pi + 1}
                  </td>
                </tr>
                <tr style={{height: '4.84mm'}}>
                  <td />
                  <td colSpan={17} style={{fontSize: '10pt'}}>
                    ※介護保険対象にならない部分を含む時は、全改修工事部分に記入、対象部分を抽出し対象工事部分に記入（算出根拠を）
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="fm-foot kk-foot">
              <span>福岡県介護保険広域連合</span>
              <span>2021.4</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function KkLine({line: l, height, bottom, hourRate, editable}: {line: FormLine | undefined; height: number; bottom: string; hourRate: number; editable: boolean}) {
  const cell = (text: string, w: number, pt: number, cls = '', edit: string | null = null, lines = 1): ReactNode => (
    <td className={cls + bottom} style={text ? fitStyle(text, w, height, pt, lines) : undefined} {...ed(editable, edit)}>
      {text}
    </td>
  );
  if (!l) {
    return (
      <tr className="g" style={{height: `${height}mm`}}>
        {['ml', '', '', 'mr', 'gap', 'ml', '', '', 'mr', 'gap', 'ml', '', 'ml', '', '', 'mr', 'ml', 'mr'].map((c, i) => (
          <td key={i} className={c + bottom} />
        ))}
      </tr>
    );
  }
  const target = !l.excluded;
  const qty = qtyText(l.qty);
  const k = (field: string) => `line:${l.rowId}:${field}`;
  const excl = `excl:${l.excludeId}`;
  // 算出根拠：定価「4,600｜円/本」。施工費は「1時間2,500円」、切って使う部材は「14,400円/本×0.8」と「2.8m÷4m＝0.7本」の2行
  const v = lineNote(l, 'kouiki', hourRate);
  let basis: ReactNode;
  if ('split' in v) {
    basis = (
      <>
        {cell(v.split[0], KK.Q, 11, 'r ml gothic', k('note'))}
        {cell(v.split[1], KK.R, 11, 'c mr', k('note'))}
      </>
    );
  } else if (v.lines.length === 1 && l.hourly && l.note === null) {
    basis = (
      <td colSpan={2} className={`c ml mr${bottom}`} style={fitStyle(v.lines[0], KK.Q + KK.R, height, 11)} {...ed(editable, k('note'))}>
        {v.lines[0]}
      </td>
    );
  } else if (v.lines.length > 0) {
    basis = (
      <td colSpan={2} className={`ml mr gothic${bottom}`} style={fitLinesStyle(v.lines, KK.Q + KK.R, height, 10)} {...ed(editable, k('note'))}>
        {v.lines.map((t, i) => (
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
      {cell(l.first ? l.placeName : '', KK.A, 11, 'c ml', l.first ? `place:${l.placeId}:name` : null, 2)}
      {cell(l.first ? l.work : '', KK.B, 11, 'c', l.first ? `place:${l.placeId}:work` : null, 2)}
      <td className={`mark${bottom}`}>{l.mark}</td>
      {cell(l.text, KK.D, 9, 'mr gothic', k('text'), 3)}
      <td className={`gap${bottom}`} />
      {cell(qty, KK.F, 9, 'r ml gothic', !l.isWork || l.hourly ? k('qty') : null)}
      {cell(l.unit, KK.G, 11, 'gothic', l.isWork || l.cut ? null : k('unit'))}
      {cell(yen(l.unitPrice), KK.H, 11, 'r gothic', l.hourly ? null : k('price'))}
      {cell(yen(l.amount), KK.I, 11, 'r mr gothic')}
      <td className={`gap${bottom}`} />
      {cell(l.first ? circled(l.photo) : '', KK.K, 11, 'c ml', l.first ? `place:${l.placeId}:photo` : null)}
      {cell(l.first ? circled(l.kind) : '', KK.L, 11, 'c', l.first ? `place:${l.placeId}:kind` : null)}
      {cell(target ? qty : '', KK.M, 9, 'r ml gothic', excl)}
      {cell(target ? l.unit : '', KK.N, 11, 'gothic', excl)}
      {cell(target ? yen(l.unitPrice) : '', KK.O, 11, 'r gothic', excl)}
      {cell(target ? yen(l.amount) : '', KK.P, 11, 'r mr gothic', excl)}
      {basis}
    </tr>
  );
}
