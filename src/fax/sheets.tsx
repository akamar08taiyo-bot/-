import {useLayoutEffect, useRef} from 'react';
import {sheetFontStyle} from './fonts';
import type {SheetFont} from './fonts';
import type {RecipientDisplay} from './recipient';
import type {SenderInfo, SheetLayout} from './storage';
import type {TextPart} from './templates';

/** A4用紙に印字する内容（入力欄から組み立て済みのもの） */
export interface SheetData {
  /** 例: 令和8年10月14日 */
  dateText: string;
  to: RecipientDisplay;
  pages: number;
  /** 件名・文章は「〇〇」の部分（ご利用者様名など）を filled として区切ってある */
  subject: TextPart[];
  body: TextPart[];
  /** 【商品名・品番】など。空欄の項目は含めない */
  details: {label: string; value: string}[];
  sender: SenderInfo;
}

interface SheetProps {
  data: SheetData;
  layout: SheetLayout;
  /** 印刷の書体（元の書体のままか、用紙全体を1つの書体にそろえるか） */
  font: SheetFont;
  /** 画面のプレビューでだけ、未入力の箇所に薄い見本を出す（印刷には出さない） */
  preview?: boolean;
  /** 文章が枠からはみ出したかどうかを知らせる */
  onOverflowChange?: (overflowing: boolean) => void;
}

export function FaxSheet(props: SheetProps) {
  if (props.layout === 'table') return <TableSheet {...props} />;
  if (props.layout === 'letter') return <LetterSheet {...props} />;
  return <ClassicSheet {...props} />;
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

/**
 * 件名・文章を印字する。「〇〇」に差し込む値が未入力のとき、
 * プレビューでは薄い「〇〇」を、印刷では手書きできるよう空白を出す。
 */
function FilledText({parts, preview}: {parts: TextPart[]; preview?: boolean}) {
  return parts.map((part, i) => {
    if (!part.filled) return part.text;
    if (part.text) return <span key={i}>{part.text}</span>;
    return preview ? (
      <span key={i} className="fx-ghost">
        〇〇
      </span>
    ) : (
      '\u3000\u3000\u3000\u3000'
    );
  });
}

function Body({parts, preview}: {parts: TextPart[]; preview?: boolean}) {
  if (parts.length === 0) {
    return preview ? <p className="fx-body fx-ghost">送るFAXを選ぶと、ここに文章が自動で入ります。</p> : null;
  }
  return (
    <p className="fx-body">
      <FilledText parts={parts} preview={preview} />
    </p>
  );
}

const hasText = (parts: TextPart[]) => parts.some((p) => p.text || p.filled);

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
// 元のWordは文字や枠を位置指定で置いているので、各部品の位置（mm）も元の送信票に合わせて固定している。
// 書体も元と同じ使い分け：見出し・宛名・社名・住所はHG丸ゴシックM-PRO、日付・枠の中の文章はＭＳ 明朝。

const KATAKANA_FULL = 'ァアィイゥウェエォオカキクケコサシスセソタチッツテトナニヌネノハヒフヘホマミムメモャヤュユョヨラリルレロワヲンー';
const KATAKANA_HALF = 'ｧｱｨｲｩｳｪｴｫｵｶｷｸｹｺｻｼｽｾｿﾀﾁｯﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓｬﾔｭﾕｮﾖﾗﾘﾙﾚﾛﾜｦﾝｰ';

/** 社名のカタカナを半角にする（元の送信票の社名は「太陽ｼﾙﾊﾞｰｻｰﾋﾞｽ株式会社」と半角カナで組んである） */
function toHalfWidthKatakana(text: string): string {
  return text.replace(/[\u30A1-\u30F4\u30FC]+/g, (run) =>
    Array.from(run.normalize('NFD'))
      .map((ch) => {
        if (ch === '\u3099') return 'ﾞ';
        if (ch === '\u309A') return 'ﾟ';
        const i = KATAKANA_FULL.indexOf(ch);
        return i >= 0 ? KATAKANA_HALF[i] : ch;
      })
      .join(''),
  );
}

/**
 * 半角カナの濁点・半濁点（ﾞﾟ）を前の文字と分けて描く。ブラウザは「ﾊﾞ」を1文字として扱うが、
 * 同梱の代わりの書体は文字の範囲ごとにファイルが分かれていて「ﾊ」と「ﾞ」が別のファイルにあるため、
 * まとめて描くと別の書体に切り替わってしまう。濁点だけを小さな箱に入れて別々に描かせる
 */
function KanaText({text}: {text: string}) {
  return text.split(/([ﾞﾟ])/).map((part, i) =>
    part === 'ﾞ' || part === 'ﾟ' ? (
      <span key={i} className="fx-kana-mark">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** 日付は元の送信票と同じく「令 和 8 年 10 月 14 日」と1文字（数字はひとまとまり）ずつ間をあける */
const dateTokens = (text: string) => text.match(/\d+|./gu) ?? [];

/** 枚数は1桁なら全角（元の送信票と同じ「４枚」）、2桁以上は半角 */
const pagesText = (n: number) => (n < 10 ? String.fromCharCode(0xff10 + n) : String(n));

function ClassicSheet({data, font, preview, onOverflowChange}: SheetProps) {
  const boxRef = useOverflowReport(onOverflowChange);
  const {sender} = data;
  return (
    <div className="fx-sheet fx-classic" style={sheetFontStyle(font)}>
      <StripeTop />
      <h1 className="fx-c-title">FAX送信票</h1>
      <p className="fx-c-date">
        {dateTokens(data.dateText).map((token, i) => (
          <span key={i}>{token}</span>
        ))}
      </p>
      <p className="fx-c-to">
        {data.to.line ? (
          <span className="fx-u">{data.to.line}</span>
        ) : (
          preview && <span className="fx-u fx-ghost">〇〇〇〇　様</span>
        )}
      </p>
      {/* 元のWordは「本状を含み」「ご清祥の段、」だったが、FAXでよく使う「本状を含め」と、
          事業所あてに合う「ご清栄のことと」にしている */}
      <p className="fx-c-pages">
        <span className="fx-u">本状を含め　{pagesText(data.pages)}枚</span>
      </p>
      <p className="fx-c-salutation">
        <span className="fx-u">拝啓　時下ますますご清栄のこととお喜び申し上げます。</span>
      </p>
      {/* 元のWordには、この下に「平素は格別のご高配を賜り…」の行と2つ目の「敬具」もあったが、
          「申し上げます」が続き、枠の中の「いつも大変お世話になっております。」ともお礼が重なるので外し、
          拝啓とペアの「敬具」1つだけにしている */}
      <p className="fx-c-closing">
        <span className="fx-u">敬具</span>
      </p>
      <div className="fx-c-box" ref={boxRef}>
        <Body parts={data.body} preview={preview} />
        <Details details={data.details} />
      </div>
      <div className="fx-c-company">
        <p>
          <KanaText text={toHalfWidthKatakana(sender.company)} />
        </p>
        {sender.office && <p>{sender.office}</p>}
      </div>
      {sender.person && (
        <p className="fx-c-person">
          <span className="fx-u">
            <span className="fx-maru">担当</span>：　{sender.person}
          </span>
        </p>
      )}
      {sender.postal && <p className="fx-c-postal">〒{sender.postal}</p>}
      {sender.tel && <p className="fx-c-tel">TEL ：{sender.tel}</p>}
      {sender.address && (
        <p className="fx-c-address">
          <span className="fx-u">{sender.address}</span>
        </p>
      )}
      {sender.fax && <p className="fx-c-fax">FAX ：{sender.fax}</p>}
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
    <svg className="fx-c-stripe fx-c-stripe-top" viewBox="0 0 170 8" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="0,0.5 123,0.5 119,7.5 0,7.5" />
      <polygon points="127,0.5 141,0.5 137,7.5 123,7.5" />
      <polygon points="145,0.5 159,0.5 155,7.5 141,7.5" />
      <polygon points={starPoints(165.6, 4.3, 4.3, 1.75)} />
    </svg>
  );
}

function StripeBottom() {
  return (
    <svg className="fx-c-stripe fx-c-stripe-bottom" viewBox="0 0 176 8" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="4,0.5 18,0.5 14,7.5 0,7.5" />
      <polygon points="22,0.5 36,0.5 32,7.5 18,7.5" />
      <polygon points="40,0.5 54,0.5 50,7.5 36,7.5" />
      <polygon points="58,0.5 176,0.5 176,7.5 54,7.5" />
    </svg>
  );
}

// ---- 表形式の「FAX 送付状」：テンプレート（5種）のWord文書のレイアウト ----

function TableSheet({data, font, preview, onOverflowChange}: SheetProps) {
  const mainRef = useOverflowReport(onOverflowChange);
  const {sender} = data;
  // 下の差出人：会社名・営業所名、住所、TEL・FAX の3行
  const address = [sender.postal && `〒${sender.postal}`, sender.address].filter(Boolean).join('　');
  const phones = [sender.tel && `TEL ${sender.tel}`, sender.fax && `FAX ${sender.fax}`].filter(Boolean).join('　　');
  return (
    <div className="fx-sheet fx-table" style={sheetFontStyle(font)}>
      <header className="fx-t-header">
        <h1 className="fx-t-title">FAX 送付状</h1>
        {hasText(data.subject) && (
          <p className="fx-t-subtitle">
            <FilledText parts={data.subject} preview={preview} />
          </p>
        )}
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
              <span className="fx-t-key">ご担当：</span>
              {data.to.person}
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <span className="fx-t-key">送信者：</span>
              {sender.person}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="fx-t-main" ref={mainRef}>
        {hasText(data.subject) && (
          <p className="fx-t-subject">
            件名　<FilledText parts={data.subject} preview={preview} />
          </p>
        )}
        <Body parts={data.body} preview={preview} />
        <Details details={data.details} />
        <p className="fx-t-end">以上</p>
      </div>
      <footer className="fx-t-footer">
        <p className="fx-t-footer-name">{[sender.company, sender.office].filter(Boolean).join('　')}</p>
        {address && <p>{address}</p>}
        {phones && <p>{phones}</p>}
      </footer>
    </div>
  );
}

// ---- 文書形式の「FAX送付のご案内」：一般的なビジネス文書の形 ----
// 日付（右上）・宛先（左）・差出人（右）・表題（中央）・拝啓〜敬具・記〜以上の順に並べる。

function LetterSheet({data, font, preview, onOverflowChange}: SheetProps) {
  const mainRef = useOverflowReport(onOverflowChange);
  const {sender, to} = data;
  const senderLines = [
    sender.company,
    sender.office,
    [sender.postal && `〒${sender.postal}`, sender.address].filter(Boolean).join('　'),
    [sender.tel && `TEL ${sender.tel}`, sender.fax && `FAX ${sender.fax}`].filter(Boolean).join('　'),
    sender.person && `担当：${sender.person}`,
  ].filter(Boolean);
  // 「記」の下に並べる項目。数量などの項目のあとに送付枚数
  const items = [...data.details, {label: '送付枚数', value: `本状を含め　${pagesText(data.pages)}枚`}];
  return (
    <div className="fx-sheet fx-letter" style={sheetFontStyle(font)}>
      <p className="fx-l-date">{data.dateText}</p>
      <div className="fx-l-to">
        {to.org || to.person ? (
          <>
            {to.org && <p>{to.org}</p>}
            {/* 事業所名の下の担当者名は1字下げる */}
            {to.person && <p className={to.org ? 'fx-l-to-person' : undefined}>{to.person}</p>}
          </>
        ) : (
          preview && <p className="fx-ghost">〇〇〇〇　様</p>
        )}
      </div>
      <div className="fx-l-from">
        {senderLines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      <div className="fx-l-main" ref={mainRef}>
        <h1 className="fx-l-title">FAX送付のご案内</h1>
        <p>拝啓　時下ますますご清栄のこととお喜び申し上げます。</p>
        <Body parts={data.body} preview={preview} />
        <p className="fx-l-right">敬具</p>
        <p className="fx-l-ki">記</p>
        <dl className="fx-l-items">
          {items.map((d) => (
            <div key={d.label} className="fx-l-item">
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
        <p className="fx-l-right">以上</p>
      </div>
    </div>
  );
}
