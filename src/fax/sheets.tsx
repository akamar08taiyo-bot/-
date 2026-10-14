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
  if (props.layout === 'classic') return <ClassicSheet {...props} />;
  if (props.layout === 'table') return <TableSheet {...props} />;
  return <ModernSheet {...props} />;
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
    if (part.text)
      return (
        <span key={i} className="fx-fill">
          {part.text}
        </span>
      );
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
          <span className="fx-detail-label">
            <span className="fx-bracket">【</span>
            {d.label}
            <span className="fx-bracket">】</span>
          </span>
          <span className="fx-detail-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---- オリジナル：見やすさ重視のデザイン（標準） ----
// 白黒のFAXでもくっきり読めるよう、黒い帯の見出し・太い文字・はっきりした罫線だけで組んでいる。
// 見出しは「宛先 TO」「差出人 FROM」のように同じ形にそろえ、どこに何があるか一目でわかるようにしている。

const HONORIFIC_AT_END = /^(.*?)[\s\u3000]*(様|さま|殿|御中|各位)$/;

/** 「佐藤　様」を名前と敬称に分ける（敬称だけ少し小さく組むため） */
function splitHonorific(text: string): {name: string; honorific: string} {
  const match = HONORIFIC_AT_END.exec(text.trim());
  return match ? {name: match[1], honorific: match[2]} : {name: text.trim(), honorific: ''};
}

function ModernLabel({ja, en}: {ja: string; en: string}) {
  return (
    <p className="fx-m-label">
      {ja}
      <span>{en}</span>
    </p>
  );
}

function ModernSheet({data, font, preview, onOverflowChange}: SheetProps) {
  const mainRef = useOverflowReport(onOverflowChange);
  const {sender, to} = data;
  // 担当者名があれば「事業所名」を上に小さく、担当者名を大きく。なければ事業所名を大きく出す
  const main = splitHonorific(to.person || to.org);
  return (
    <div className="fx-sheet fx-modern" style={sheetFontStyle(font)}>
      <header className="fx-m-band">
        {/* 背景の黒はSVGで描く（ブラウザの「背景のグラフィック」の設定に関係なく印刷される） */}
        <svg className="fx-m-band-bg" viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true">
          <rect width="10" height="10" />
        </svg>
        <h1 className="fx-m-fax">FAX</h1>
        <p className="fx-m-title">送付状</p>
        <p className="fx-m-en">FACSIMILE COVER SHEET</p>
      </header>

      <div className="fx-m-parties">
        <section className="fx-m-to">
          <ModernLabel ja="宛先" en="TO" />
          {to.person && to.org && <p className="fx-m-org">{to.org}</p>}
          <p className="fx-m-name">
            {main.name ? (
              <>
                {main.name}
                {main.honorific && <span className="fx-m-hon">{main.honorific}</span>}
              </>
            ) : (
              preview && (
                <span className="fx-ghost">
                  〇〇〇〇<span className="fx-m-hon">様</span>
                </span>
              )
            )}
          </p>
        </section>
        <section className="fx-m-from">
          <ModernLabel ja="差出人" en="FROM" />
          {sender.company && <p className="fx-m-company">{sender.company}</p>}
          {sender.office && <p className="fx-m-office">{sender.office}</p>}
          {sender.person && <p className="fx-m-person">担当　{sender.person}</p>}
          {(sender.tel || sender.fax) && (
            <div className="fx-m-contact">
              {sender.tel && (
                <p>
                  <span>TEL</span>
                  {sender.tel}
                </p>
              )}
              {sender.fax && (
                <p>
                  <span>FAX</span>
                  {sender.fax}
                </p>
              )}
            </div>
          )}
          {(sender.postal || sender.address) && (
            <p className="fx-m-address">
              {sender.postal && <span>〒{sender.postal}</span>}
              {sender.address && <span>{sender.address}</span>}
            </p>
          )}
        </section>
      </div>

      <div className="fx-m-meta">
        <div>
          <ModernLabel ja="送信日" en="DATE" />
          <p className="fx-m-value">{data.dateText}</p>
        </div>
        <div>
          <ModernLabel ja="送付枚数" en="PAGES" />
          <p className="fx-m-value">
            {data.pages}枚<small>（この送付状を含む）</small>
          </p>
        </div>
      </div>

      <div className="fx-m-main" ref={mainRef}>
        {hasText(data.subject) && (
          <>
            <ModernLabel ja="件名" en="SUBJECT" />
            <p className="fx-m-subject">
              <FilledText parts={data.subject} preview={preview} />
            </p>
          </>
        )}
        <Body parts={data.body} preview={preview} />
        <Details details={data.details} />
        {data.body.length > 0 && <p className="fx-m-end">以上</p>}
        {/* 手書きのメモにも使える欄。本文の下の余白を引き締める */}
        <section className="fx-m-memo">
          <ModernLabel ja="通信欄" en="MEMO" />
          <div className="fx-m-memo-box" />
        </section>
      </div>

      <footer className="fx-m-footer">
        送付枚数に不足がある場合や、読み取りにくい箇所がある場合は、お手数ですが差出人までご連絡ください。
      </footer>
    </div>
  );
}

// ---- 従来の「FAX送信票」：これまで使っていたWordの様式を再現したもの ----
// 元のWordは文字や枠を位置指定で置いているので、各部品の位置（mm）も元の送信票に合わせて固定している。
// 書体も元と同じ使い分け：見出し・宛名・社名・住所はHG丸ゴシックM-PRO、日付・「平素は…」・枠の中の文章はＭＳ 明朝。

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
      <p className="fx-c-pages">
        <span className="fx-u">本状を含み　{pagesText(data.pages)}枚</span>
      </p>
      <p className="fx-c-salutation">
        <span className="fx-u">拝啓　時下ますますご清祥の段、お喜び申し上げます。</span>
      </p>
      <p className="fx-c-closing1">
        <span className="fx-u">敬具</span>
      </p>
      <p className="fx-c-courtesy">平素は格別のご高配を賜り、厚くお礼申し上げます</p>
      <p className="fx-c-closing2">敬具</p>
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
          <span className="fx-u">　{sender.address}</span>
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
  const contact = [
    [sender.postal && `〒${sender.postal}`, sender.address].filter(Boolean).join('　'),
    [sender.tel && `TEL ${sender.tel}`, sender.fax && `FAX ${sender.fax}`].filter(Boolean).join('　'),
  ]
    .filter(Boolean)
    .join('　｜　');
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
        {contact && <p>{contact}</p>}
      </footer>
    </div>
  );
}
