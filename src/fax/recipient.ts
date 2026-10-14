import {newId} from './storage';
import type {Recipient, SavedRecipient} from './storage';

/** 宛先帳に残す件数の上限（古いものから消える） */
const MAX_SAVED = 60;

const TRAILING_HONORIFIC = /[\s　]*(様|さま|殿|御中|各位)$/;

/** 自分で「様」「御中」まで入力していれば、二重に付けない */
const hasHonorific = (s: string) => TRAILING_HONORIFIC.test(s);

export interface RecipientDisplay {
  /** 従来の送信票の宛名行（例: 〇〇居宅介護支援事業所　佐藤　様） */
  line: string;
  /** 表形式の「送信先」欄 */
  org: string;
  /** 表形式の「ご担当」欄。担当者名がなければ空 */
  person: string;
}

export function describeRecipient(r: Recipient): RecipientDisplay {
  const org = r.org.trim();
  const person = r.person.trim();
  if (person) {
    const p = hasHonorific(person) ? person : `${person}　様`;
    return {line: org ? `${org}　${p}` : p, org, person: p};
  }
  if (!org) return {line: '', org: '', person: ''};
  // 担当者名がなければ事業所名に「様」を付ける（「御中」にしたいときは自分で入力すれば二重にならない）
  const withHonorific = hasHonorific(org) ? org : `${org}　様`;
  return {line: withHonorific, org: withHonorific, person: ''};
}

/** 全角・半角や空白の違いを無視して同じ宛先とみなすためのキー */
const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const recipientKey = (r: Pick<Recipient, 'org' | 'person'>) => `${normalize(r.org)}|${normalize(r.person)}`;

/**
 * 印刷した宛先を宛先帳の先頭に入れる（同じ宛先は上書きして1件にまとめる）。
 * 印刷ボタンと Ctrl+P の両方から呼ばれても結果が同じになるよう、何度呼んでも1件のまま。
 */
export function rememberRecipient(list: SavedRecipient[], r: Recipient, now: number): SavedRecipient[] {
  const clean: Recipient = {org: r.org.trim(), person: r.person.trim()};
  if (!clean.org && !clean.person) return list;
  const existing = list.find((x) => recipientKey(x) === recipientKey(clean));
  const entry: SavedRecipient = {...clean, id: existing?.id ?? newId(), lastUsed: now};
  return [entry, ...list.filter((x) => x !== existing)].slice(0, MAX_SAVED);
}

/** 宛先帳を、入力中の文字で絞り込む（読み仮名ではなく表記の部分一致） */
export function filterRecipients(list: SavedRecipient[], query: string): SavedRecipient[] {
  const q = normalize(query);
  if (!q) return list;
  return list.filter((r) => normalize(`${r.org}${r.person}`).includes(q));
}
