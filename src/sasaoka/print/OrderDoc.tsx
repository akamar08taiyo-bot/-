// 発注書（A4縦）。見積書に入っている部材を、何を何個（何本・何枚）発注するか（発注書の画面で直した数）。
// 計算の説明（使う長さ・余り・足す分）・品目数・現場の住所・備考（○月○日までに納品など）は出さない（ユーザーの指示）。
// 発注先・発注日・発注元と、品名・品番・数量・単位、どこで使うか（見積書の写真番号）だけ。

import {jobName} from '../calc.ts';
import {applyOrderEdits, orderBaseLines, orderedLines, photoLabel} from '../order.ts';
import type {AppData, Job} from '../types.ts';
import {dateLabel, num, staffShort, todayIso} from '../util.ts';

export function OrderDoc({job, data}: {job: Job; data: AppData}) {
  const s = data.settings;
  const edits = job.order ?? null;
  const lines = orderedLines(applyOrderEdits(orderBaseLines(job, data.materials, s.estimateRate), edits));
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
          <col style={{width: '5%'}} />
          <col style={{width: '12%'}} />
          <col style={{width: '15%'}} />
          <col style={{width: '40%'}} />
          <col style={{width: '8%'}} />
          <col style={{width: '8%'}} />
          <col style={{width: '12%'}} />
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>メーカー</th>
            <th>品番</th>
            <th>品名</th>
            <th>数量</th>
            <th>単位</th>
            <th>写真番号</th>
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
              <td className="c photo">{photoLabel(l.photos)}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={7} className="c muted">
                （発注する部材がありません）
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
