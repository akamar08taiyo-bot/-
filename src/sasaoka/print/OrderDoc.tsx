// 発注書（A4縦）。見積書に入っている部材を、何を何個（何本・何枚）発注するか（発注書の画面で直した数）。
// 計算の説明（使う長さ・余り・足す分）は出さない（ユーザーの指示）。品名・品番と数量・単位だけ。

import {jobName} from '../calc.ts';
import {applyOrderEdits, orderBaseLines, orderedLines, unitTotals} from '../order.ts';
import type {AppData, Job} from '../types.ts';
import {dateLabel, num, staffShort, todayIso} from '../util.ts';

export function OrderDoc({job, data}: {job: Job; data: AppData}) {
  const s = data.settings;
  const edits = job.order ?? null;
  const lines = orderedLines(applyOrderEdits(orderBaseLines(job, data.materials), edits));
  const telFax = [s.tel && `TEL ${s.tel}`, s.fax && `FAX ${s.fax}`].filter(Boolean).join('　');
  return (
    <div className="sheet order-doc">
      <div className="doc-title">発注書</div>
      <div className="doc-head">
        <div className="left">
          <div className="to">
            {edits?.supplier.trim() || '　　　　　　'}
            <small>御中</small>
          </div>
          <p className="greeting">下記のとおり発注いたします。</p>
          <p className="subject">件名：{jobName(job)}　住宅改修の部材</p>
          {job.address.trim() && <p className="subject">現場：{job.address.trim()}</p>}
          <p className="order-count">
            {lines.length}品目{lines.length > 0 && `（${unitTotals(lines)}）`}
          </p>
        </div>
        <div className="right">
          <div className="meta">
            <div>発注日　{dateLabel(edits?.date || todayIso())}</div>
          </div>
          <div className="issuer">
            {s.company && <div className="company">{s.company}</div>}
            {s.officeName && <div className="office">{s.officeName}</div>}
            {(s.postal || s.address) && (
              <div>
                {s.postal && `〒${s.postal.replace(/^〒/, '')}　`}
                {s.address}
              </div>
            )}
            {telFax && <div>{telFax}</div>}
            {job.staff && (
              <div className="person">
                担当　<b>{staffShort(job.staff)}</b>
              </div>
            )}
          </div>
        </div>
      </div>

      <table className="items order">
        <colgroup>
          <col style={{width: '6%'}} />
          <col style={{width: '13%'}} />
          <col style={{width: '16%'}} />
          <col style={{width: '47%'}} />
          <col style={{width: '9%'}} />
          <col style={{width: '9%'}} />
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>メーカー</th>
            <th>品番</th>
            <th>品名</th>
            <th>数量</th>
            <th>単位</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key}>
              <td className="c">{i + 1}</td>
              <td className="name">{l.maker}</td>
              <td className="code">{l.code}</td>
              <td className="name">{l.name}</td>
              <td className="num qty">{num(l.qty, 3)}</td>
              <td className="c unit">{l.unit}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={6} className="c muted">
                （発注する部材がありません）
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {edits?.note.trim() && <div className="remarks">{edits.note.trim()}</div>}
    </div>
  );
}
