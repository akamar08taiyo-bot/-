import {priceNote, saleTotals} from '../calc.ts';
import {categoryLabel} from '../category.ts';
import {insurerLabel} from '../defaults.ts';
import type {Sale, Settings} from '../types.ts';
import {dateLabel, yen} from '../util.ts';

/**
 * 見積書（A4縦）。販売受注簿作成ツールの「御見積書」と同じ形（宛名・見積番号・発行日・会社と営業所・所長印／担当印・
 * 御見積金額・品目／数量／単価／金額／消費税・小計・備考）に、特定福祉用具なので介護保険の内訳を足したもの。
 * 金額はすべて calc.ts の saleTotals から取る（画面・申請書・受注簿と同じ金額になるように）。帳票の金額には税抜・税込を必ず書く。
 */
export function EstimateDoc({sale, settings: s}: {sale: Sale; settings: Settings}) {
  const t = saleTotals(sale, s);
  const insurer = insurerLabel(sale.insurer, sale.insurerName);
  const remarks = [s.remarks, sale.note].map((x) => x.trim()).filter(Boolean).join('\n');
  const repaid = sale.payMethod === '償還払い';
  return (
    <div className="est">
      <div className="est-top">
        <section>
          <h1 className="est-title">御　見　積　書</h1>
          <div className="est-client">
            <span>{sale.customer.trim() || '　'}</span>
            <span className="suffix">様</span>
          </div>
          <p className="est-lead">
            下記の通り、お見積り申し上げます。
            <br />
            ご検討のほど、よろしくお願い申し上げます。
          </p>
          <table className="est-cond">
            <tbody>
              <tr>
                <th>見積有効期限</th>
                <td>{s.validity}</td>
              </tr>
              <tr>
                <th>お支払条件</th>
                <td>{s.payment}</td>
              </tr>
              <tr>
                <th>納期</th>
                <td>{s.delivery}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <aside className="est-company">
          <div className="meta">
            <span>見積番号</span>
            <span>{sale.quoteNo || '—'}</span>
          </div>
          <div className="meta">
            <span>発行日</span>
            <span>{dateLabel(sale.estimateDate)}</span>
          </div>
          <div className="name">
            {s.company}
            <br />
            {s.officeName}
          </div>
          <div className="office">
            {s.postal && <>〒{s.postal.replace(/^〒/, '')}</>}
            <br />
            {s.address}
            <br />
            TEL {s.tel}
            <br />
            FAX {s.fax}
            <br />
            <span className="label">登録番号</span> {s.regNo}
            <br />
            <br />
            所長　{s.manager}
            <br />
            担当　{sale.staff}
          </div>
          <div className="stamps">
            <div className="stamp">
              所長印
              <div />
            </div>
            <div className="stamp">
              担当印
              <div />
            </div>
          </div>
        </aside>
      </div>

      <div className="est-total">
        <span className="label">御見積金額　合計（税込）</span>
        <span className="value">¥{yen(t.total)}&nbsp;—</span>
      </div>

      <div className="est-category">特定福祉用具（介護保険）</div>
      <table className="est-items">
        <colgroup>
          <col style={{width: '46%'}} />
          <col style={{width: '10%'}} />
          <col style={{width: '15%'}} />
          <col style={{width: '16%'}} />
          <col style={{width: '13%'}} />
        </colgroup>
        <thead>
          <tr>
            <th>品目</th>
            <th>数量</th>
            <th>単価（税抜）</th>
            <th>金額（税抜）</th>
            <th>消費税</th>
          </tr>
        </thead>
        <tbody>
          {t.lines.map((l) => {
            const i = l.item;
            const code = i.code && !i.name.includes(i.code) ? ` / ${i.code}` : '';
            const sub = [categoryLabel(i.category, i.sub), i.maker, priceNote(l)].filter(Boolean).join(' / ');
            return (
              <tr key={i.id}>
                <td className="name">
                  <div className="product">
                    {i.name}
                    {code}
                  </div>
                  {sub && <div className="subline">{sub}</div>}
                </td>
                <td>
                  {yen(i.qty)}
                  {i.unit}
                </td>
                <td>¥{yen(l.unitPrice)}</td>
                <td>¥{yen(l.amount)}</td>
                <td>{i.taxType === '非課税' ? '非課税' : `¥${yen(l.tax)}`}</td>
              </tr>
            );
          })}
          <tr className="spacer">
            <td colSpan={5} />
          </tr>
          <tr className="sum">
            <td className="blank" />
            <td colSpan={4}>小計（税抜）　¥{yen(t.amount)}</td>
          </tr>
          <tr className="sum">
            <td className="blank" />
            <td colSpan={4}>消費税　¥{yen(t.tax)}</td>
          </tr>
          <tr className="sum grand">
            <td className="blank" />
            <td colSpan={4}>合計（税込）　¥{yen(t.total)}</td>
          </tr>
        </tbody>
      </table>

      <section className="est-care">
        <div className="head">
          <span>介護保険の内訳</span>
          <span>
            {insurer && `保険者：${insurer}　`}
            {t.ratio}割負担　{sale.payMethod}
          </span>
        </div>
        <table>
          <tbody>
            <tr>
              <td>購入金額（10割・税込）</td>
              <td className="num">¥{yen(t.total)}</td>
            </tr>
            {t.excess > 0 && (
              <tr>
                <td>介護保険の対象（年間の限度額 {yen(t.limit)}円まで）</td>
                <td className="num">¥{yen(t.covered)}</td>
              </tr>
            )}
            <tr>
              <td>利用者負担額（{t.ratio}割・税込）</td>
              <td className="num">¥{yen(t.userBurden)}</td>
            </tr>
            {t.aid > 0 && (
              <tr>
                <td>介護扶助（{t.ratio}割）</td>
                <td className="num">¥{yen(t.aid)}</td>
              </tr>
            )}
            <tr>
              <td>保険者負担額（{10 - t.ratio}割・税込）</td>
              <td className="num">¥{yen(t.insurerBurden)}</td>
            </tr>
            {t.excess > 0 && (
              <tr>
                <td>限度額を超えた分（全額ご負担）</td>
                <td className="num">¥{yen(t.excess)}</td>
              </tr>
            )}
            <tr className="pay">
              <td>{repaid ? 'お支払いいただく金額（いったん全額）' : 'お支払いいただく金額'}</td>
              <td className="num">¥{yen(repaid ? t.total : t.userPay)}</td>
            </tr>
            {repaid && (
              <tr>
                <td>あとで保険者から払い戻される金額</td>
                <td className="num">¥{yen(t.insurerBurden)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="est-remarks">
        <div className="est-remarks-title">備考</div>
        <div className="est-remarks-body">{remarks}</div>
      </section>
    </div>
  );
}
