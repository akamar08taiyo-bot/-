/**
 * FAX送付状の種類と、選んだときに自動で入る文面。
 * 文面は「FAX送付状テンプレート（5種）」のWord文書をもとに、ご利用者様名などを文中に差し込む形にしたもの。
 * 文章の中の「〇〇」の部分に、入力欄の値（ご利用者様名・製品名など）が自動で入る。
 */

/** 種類をまたいで値を引き継ぐ入力項目（照会用紙→計画書と切り替えても、ご利用者様名は残る） */
export type DetailKey = 'riyousha' | 'product' | 'quantity' | 'documents';

export interface DetailField {
  key: DetailKey;
  label: string;
  placeholder: string;
  /** 入力欄の後ろに添える敬称（例: 様）。文面の「〇〇様」の「様」にあたる */
  suffix?: string;
}

export type FaxKindId =
  | 'shokai'
  | 'tanisu'
  | 'keikaku'
  | 'keikakuOnly'
  | 'monitoringOnly'
  | 'mitsumori'
  | 'mitsumoriIrai'
  | 'other';

/** 宛名欄の見出しの出し分け。ケアマネ宛ては「居宅名・ケアマネ名」、それ以外は「会社・施設名・ご担当者名」 */
export type Audience = 'caremanager' | 'business';

export interface FaxKind {
  id: FaxKindId;
  /** 選択欄の見出し */
  label: string;
  subject: string;
  body: string;
  /** 文章中の「〇〇」に入れる項目 */
  fill?: DetailField;
  /** 文章の後に【】付きで1行ずつ印字する項目（空欄なら印字しない） */
  lines: DetailField[];
  audience: Audience;
  /** 送付枚数（本状を含む）の初期値。実際に送った枚数の例に合わせている */
  pages: number;
}

const GREETING = 'いつも大変お世話になっております。';
const PLEASE_CHECK = 'お忙しいところ恐れ入りますが、ご確認くださいますようお願いいたします。';

export const RIYOUSHA: DetailField = {key: 'riyousha', label: 'ご利用者名', placeholder: '例）山田　花子', suffix: '様'};

export const FAX_KINDS: FaxKind[] = [
  {
    id: 'shokai',
    label: '照会用紙',
    subject: '照会用紙の送付',
    body: [GREETING, '〇〇様の照会用紙を送付いたします。', PLEASE_CHECK].join('\n'),
    fill: RIYOUSHA,
    lines: [],
    audience: 'caremanager',
    pages: 2,
  },
  {
    id: 'tanisu',
    label: '単位数・TAISコード',
    subject: '単位数・TAISコードの送付',
    body: [GREETING, '〇〇様の単位数及びTAISコードを送付いたします。', PLEASE_CHECK].join('\n'),
    fill: RIYOUSHA,
    lines: [],
    audience: 'caremanager',
    pages: 2,
  },
  {
    id: 'keikaku',
    label: '計画書・モニタリング',
    subject: '計画書及び定期モニタリング報告書の送付',
    body: [GREETING, '〇〇様の計画書及び定期モニタリング報告書を送付いたします。', PLEASE_CHECK].join('\n'),
    fill: RIYOUSHA,
    lines: [],
    audience: 'caremanager',
    pages: 4,
  },
  {
    id: 'keikakuOnly',
    label: '計画書のみ',
    subject: '計画書の送付',
    body: [GREETING, '〇〇様の計画書を送付いたします。', PLEASE_CHECK].join('\n'),
    fill: RIYOUSHA,
    lines: [],
    audience: 'caremanager',
    pages: 3,
  },
  {
    id: 'monitoringOnly',
    label: 'モニタリングのみ',
    subject: '定期モニタリング報告書の送付',
    body: [GREETING, '〇〇様の定期モニタリング報告書を送付いたします。', PLEASE_CHECK].join('\n'),
    fill: RIYOUSHA,
    lines: [],
    audience: 'caremanager',
    pages: 2,
  },
  {
    id: 'mitsumori',
    label: '御見積書の送付',
    subject: '御見積書の送付',
    body: [
      GREETING,
      '〇〇の御見積書を送付いたします。',
      '内容をご確認いただき、ご発注いただける場合はお電話またはFAXにてご連絡くださいますようお願いいたします。',
    ].join('\n'),
    fill: {key: 'product', label: '製品名', placeholder: '例）プラッツ　電源コードプラグ'},
    lines: [],
    audience: 'business',
    pages: 2,
  },
  {
    id: 'mitsumoriIrai',
    label: 'メーカーへ見積依頼',
    subject: '御見積りのお願い',
    body: [
      GREETING,
      '下記製品について、御見積りをお願いいたします。',
      'お忙しいところ恐れ入りますが、価格・納期をご確認のうえ、ご回答くださいますようお願いいたします。',
    ].join('\n'),
    lines: [
      {key: 'product', label: '商品名・品番', placeholder: '例）NEO-1W'},
      {key: 'quantity', label: '数量', placeholder: '例）1台'},
    ],
    audience: 'business',
    pages: 1,
  },
  {
    id: 'other',
    label: 'その他',
    subject: '書類の送付',
    body: [GREETING, '〇〇を送付いたします。', PLEASE_CHECK].join('\n'),
    fill: {key: 'documents', label: '送る書類', placeholder: '例）契約書の写し'},
    lines: [],
    audience: 'business',
    pages: 2,
  },
];

export function findKind(id: FaxKindId): FaxKind {
  return FAX_KINDS.find((k) => k.id === id) ?? FAX_KINDS[0];
}

export interface TextTemplate {
  subject: string;
  body: string;
}

/** 「この文面を次回も使う」で保存した文面。種類ごとに、組み込みの文面より優先する */
export type CustomTemplates = Partial<Record<FaxKindId, TextTemplate>>;

export function effectiveTemplate(kind: FaxKind, custom: CustomTemplates): TextTemplate {
  return custom[kind.id] ?? {subject: kind.subject, body: kind.body};
}

// ---- 「〇〇」への差し込み ----

/** 差し込み位置の目印。打ち直したときに見た目の似た「○」「◯」になっても同じように扱う */
const FILL_MARK = /[〇○◯]{2}/g;

export const hasFillMark = (text: string) => new RegExp(FILL_MARK.source).test(text);

/** 文章の一部分。filled なら入力欄から差し込んだ値（空なら未入力） */
export interface TextPart {
  text: string;
  filled: boolean;
}

/** 文章を「〇〇」の前後で区切り、〇〇 に value を入れる */
export function fillParts(text: string, value: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(FILL_MARK)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({text: text.slice(last, at), filled: false});
    // 文面が「〇〇様」なのに「山田様」と入力されたときは「様」を重ねない
    let v = value.trim();
    if (text.startsWith('様', at + match[0].length)) v = v.replace(/[\s　]*(様|さま)$/, '');
    parts.push({text: v, filled: true});
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({text: text.slice(last), filled: false});
  return parts;
}
