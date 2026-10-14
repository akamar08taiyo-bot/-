import {useLayoutEffect, useRef} from 'react';
import type {RecipientDisplay} from './recipient';
import type {SenderInfo, SheetLayout} from './storage';

/** A4用紙に印字する内容（入力欄から組み立て済みのもの） */
export interface SheetData {
  /** 例: 令和8年10月14日 */
  dateText: string;
  to: RecipientDisplay;
  toFax: string;
  pages: number;
  subject: string;
  body: string;
  /** 【ご利用者様名】など。空欄の項目は含めない */
  details: {label: string; value: string}[];
  sender: SenderInfo;
}

interface SheetProps {
  data: SheetData;
  layout: SheetLayout;
  /** 画面のプレビューでだけ、未入力の箇所に薄い見本を出す（印刷には出さない） */
  preview?: boolean;
  /** 文章が枠からはみ出したかどうかを知らせる */
  onOverflowChange?: (overflowing: boolean) => void;
}

export function FaxSheet(props: SheetProps) {
  return props.layout === 'table' ? <TableSheet {...props} /> : <ClassicSheet {...props} />;
}

/** 本文の入る枠が、文章の量に対して足りているかを測る */
function useOverflowReport(onChange?: (overflowing: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (!onChange) return;
    const check = () => {
      const el = ref.current;
      if (!el) return;
      const overflowing = el.scrollHeight > el.clientHeight + 1;
      if (overflowing !== last.current) {
        last.current = overflowing;
        onChange(overflowing);
      }
    };
    check();
    // フォントの読み込みで行の高さが変わることがあるので、読み込み後にも測り直す
    document.fonts?.ready.then(check).catch(() => {});
  });
  return ref;
}

function Body({text, preview}: {text: string; preview?: boolean}) {
  if (!text && preview) {
    return <p className="fx-body fx-ghost">送るFAXを選ぶと、ここに文章が自動で入ります。</p>;
  }
  return <p className="fx-body">{text}</p>;
}

function Details({details}: {details: SheetData['details']}) {
  if (details.length === 0) return null;
  return (
    <div className="fx-details">
      {details.map((d) => (
        <div key={d.label} className="fx-detail">
          <span className="fx-detail-label">【{d.label}】</span>
          <span className="fx-detail-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---- 従来の「FAX送信票」：これまで使っていたWordの様式を再現したもの ----

function ClassicSheet({data, preview, onOverflowChange}: SheetProps) {
  const boxRef = useOverflowReport(onOverflowChange);
  const {sender} = data;
  return (
    <div className="fx-sheet fx-classic">
      <StripeTop />
      <h1 className="fx-c-title">FAX送信票</h1>
      <p className="fx-c-date">{data.dateText}</p>
      <div className="fx-c-to">
        {data.to.line ? (
          <span className="fx-c-to-line">{data.to.line}</span>
        ) : (
          preview && <span className="fx-c-to-line fx-ghost">〇〇〇〇　様</span>
        )}
        {data.toFax && <span className="fx-c-to-fax">（FAX　{data.toFax}）</span>}
      </div>
      <p className="fx-c-pages">
        <span>本状を含み　{data.pages}枚</span>
      </p>
      <div className="fx-c-greeting">
        <p>拝啓　時下ますますご清祥の段、お喜び申し上げます。</p>
        <p>平素は格別のご高配を賜り、厚くお礼申し上げます。</p>
      </div>
      <div className="fx-c-box" ref={boxRef}>
        {data.subject && <p className="fx-c-subject">件名　{data.subject}</p>}
        <Body text={data.body} preview={preview} />
        <Details details={data.details} />
      </div>
      <p className="fx-c-closing">敬具</p>
      <div className="fx-c-sender">
        <p className="fx-c-company">{sender.company}</p>
        <p className="fx-c-office">{sender.office}</p>
        <p className="fx-c-person">{sender.person && <span>担当：{sender.person}</span>}</p>
        <div className="fx-c-tel">
          {sender.tel && <p>TEL：{sender.tel}</p>}
          {sender.fax && <p>FAX：{sender.fax}</p>}
        </div>
        <div className="fx-c-address">
          {sender.postal && <p>〒{sender.postal}</p>}
          {sender.address && <p className="fx-c-address-line">{sender.address}</p>}
        </div>
      </div>
      <StripeBottom />
    </div>
  );
}

/** 5つの頂点を持つ星の座標（中心・外径・内径） */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({length: 10}, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

// 上下の黒い帯。背景色ではなくSVGで描くので、ブラウザの「背景のグラフィック」設定に関係なく印刷される
function StripeTop() {
  return (
    <svg className="fx-c-stripe" viewBox="0 0 170 8" aria-hidden="true">
      <polygon points="0,0.5 123,0.5 119,7.5 0,7.5" />
      <polygon points="127,0.5 141,0.5 137,7.5 123,7.5" />
      <polygon points="145,0.5 159,0.5 155,7.5 141,7.5" />
      <polygon points={starPoints(165.6, 4.3, 4.3, 1.75)} />
    </svg>
  );
}

function StripeBottom() {
  return (
    <svg className="fx-c-stripe fx-c-stripe-bottom" viewBox="0 0 170 8" aria-hidden="true">
      <polygon points="4,0.5 18,0.5 14,7.5 0,7.5" />
      <polygon points="22,0.5 36,0.5 32,7.5 18,7.5" />
      <polygon points="40,0.5 54,0.5 50,7.5 36,7.5" />
      <polygon points="58,0.5 170,0.5 170,7.5 54,7.5" />
    </svg>
  );
}

// ---- 表形式の「FAX 送付状」：テンプレート（5種）のWord文書のレイアウト ----

function TableSheet({data, preview, onOverflowChange}: SheetProps) {
  const mainRef = useOverflowReport(onOverflowChange);
  const {sender} = data;
  const contact = [
    [sender.postal && `〒${sender.postal}`, sender.address].filter(Boolean).join('　'),
    [sender.tel && `TEL ${sender.tel}`, sender.fax && `FAX ${sender.fax}`].filter(Boolean).join('　'),
  ]
    .filter(Boolean)
    .join('　｜　');
  return (
    <div className="fx-sheet fx-table">
      <header className="fx-t-header">
        <h1 className="fx-t-title">FAX 送付状</h1>
        {data.subject && <p className="fx-t-subtitle">{data.subject}</p>}
      </header>
      <table className="fx-t-info">
        <tbody>
          <tr>
            <td>
              <span className="fx-t-key">送信日：</span>
              {data.dateText}
            </td>
            <td>
              <span className="fx-t-key">送付枚数：</span>本状含め　{data.pages}　枚
            </td>
          </tr>
          <tr>
            <td>
              <span className="fx-t-key">送信先：</span>
              {data.to.org || (preview && <span className="fx-ghost">〇〇〇〇</span>)}
            </td>
            <td>
              <span className="fx-t-key">FAX：</span>
              {data.toFax}
            </td>
          </tr>
          <tr>
            <td>
              <span className="fx-t-key">ご担当：</span>
              {data.to.person}
            </td>
            <td>
              <span className="fx-t-key">送信者：</span>
              {sender.person}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="fx-t-main" ref={mainRef}>
        {data.subject && <p className="fx-t-subject">件名　{data.subject}</p>}
        <Body text={data.body} preview={preview} />
        <Details details={data.details} />
        <p className="fx-t-end">以上</p>
      </div>
      <footer className="fx-t-footer">
        <p className="fx-t-footer-name">{[sender.company, sender.office].filter(Boolean).join('　')}</p>
        {contact && <p>{contact}</p>}
      </footer>
    </div>
  );
}
