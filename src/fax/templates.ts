/**
 * FAX送付状の種類と、選んだときに自動で入る文面。
 * 文面は「FAX送付状テンプレート（5種）」の各Word文書の件名・本文・記入欄をそのまま使っている。
 */

/** 種類をまたいで値を引き継ぐ差し込み項目（照会用紙→計画書と切り替えても、ご利用者様名は残る） */
export type DetailKey = 'riyousha' | 'product' | 'quantity' | 'deadline' | 'note' | 'documents';

export interface DetailField {
  key: DetailKey;
  /** 用紙には【】付きで印字する */
  label: string;
  placeholder: string;
  /** 値の後ろに付ける敬称（例: 様） */
  suffix?: string;
  multiline?: boolean;
}

export type FaxKindId = 'shokai' | 'tanisu' | 'keikaku' | 'mitsumori' | 'mitsumoriIrai' | 'other';

export interface FaxKind {
  id: FaxKindId;
  /** 選択カードの見出し */
  label: string;
  /** 選択カードの補足（ほかに何を入れればよいか） */
  hint: string;
  subject: string;
  body: string;
  fields: DetailField[];
  /** 送付枚数（本状を含む）の初期値。実際に送った枚数の例に合わせている */
  pages: number;
}

const GREETING = 'いつも大変お世話になっております。';
const PLEASE_CHECK = 'お忙しいところ恐れ入りますが、ご確認くださいますようお願いいたします。';

const RIYOUSHA: DetailField = {
  key: 'riyousha',
  label: 'ご利用者様名',
  placeholder: '例）山田　花子',
  suffix: '様',
};

export const FAX_KINDS: FaxKind[] = [
  {
    id: 'shokai',
    label: '照会用紙の送付',
    hint: 'ご利用者様名を入れて送る',
    subject: '照会用紙の送付',
    body: [GREETING, '下記ご利用者様の照会用紙を送付いたします。', PLEASE_CHECK].join('\n'),
    fields: [RIYOUSHA],
    pages: 2,
  },
  {
    id: 'tanisu',
    label: '単位数・TAISコードの送付',
    hint: 'ご利用者様名を入れて送る',
    subject: '単位数・TAISコードの送付',
    body: [
      GREETING,
      '下記ご利用者様に関する福祉用具の単位数およびTAISコードを送付いたします。',
      PLEASE_CHECK,
    ].join('\n'),
    fields: [RIYOUSHA],
    pages: 2,
  },
  {
    id: 'keikaku',
    label: '計画書・モニタリング報告書の送付',
    hint: 'ご利用者様名を入れて送る',
    subject: '福祉用具サービス計画書・モニタリング実施報告書の送付',
    body: [
      GREETING,
      '下記ご利用者様の福祉用具サービス計画書およびモニタリング実施報告書を送付いたします。',
      PLEASE_CHECK,
    ].join('\n'),
    fields: [RIYOUSHA],
    pages: 4,
  },
  {
    id: 'mitsumori',
    label: '御見積書の送付',
    hint: '製品名を入れて送る',
    subject: '御見積書の送付',
    body: [
      GREETING,
      '下記製品の御見積書を送付いたします。',
      '内容をご確認いただき、ご発注いただける場合はお電話またはFAXにてご連絡くださいますようお願いいたします。',
    ].join('\n'),
    fields: [
      {key: 'product', label: '製品名・内容', placeholder: '例）プラッツ　電源コードプラグ'},
      {key: 'note', label: '備考', placeholder: '空欄なら印字しません', multiline: true},
    ],
    pages: 2,
  },
  {
    id: 'mitsumoriIrai',
    label: 'メーカーへ御見積りのお願い',
    hint: '商品名・数量を入れて依頼する',
    subject: '御見積りのお願い',
    body: [
      GREETING,
      '下記製品について、御見積りをお願いいたします。',
      'お忙しいところ恐れ入りますが、価格・納期をご確認のうえ、ご回答くださいますようお願いいたします。',
    ].join('\n'),
    fields: [
      {key: 'product', label: '商品名・品番', placeholder: '例）NEO-1W'},
      {key: 'quantity', label: '数量', placeholder: '例）1台'},
      {key: 'deadline', label: '希望納期・その他', placeholder: '空欄なら印字しません', multiline: true},
    ],
    pages: 1,
  },
  {
    id: 'other',
    label: 'その他',
    hint: '件名と文章を自由に書く',
    subject: '書類の送付',
    body: [GREETING, '下記の書類を送付いたします。', PLEASE_CHECK].join('\n'),
    fields: [{key: 'documents', label: '送付書類', placeholder: '例）契約書（写し）', multiline: true}],
    pages: 2,
  },
];

export function findKind(id: FaxKindId): FaxKind {
  return FAX_KINDS.find((k) => k.id === id) ?? FAX_KINDS[0];
}

export function isFaxKindId(value: unknown): value is FaxKindId {
  return FAX_KINDS.some((k) => k.id === value);
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
