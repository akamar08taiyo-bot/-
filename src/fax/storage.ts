// 設定・宛先帳・保存した文面は、この端末のブラウザ（localStorage）にだけ保存する。
// サーバーへは何も送らない。ご利用者様名などの記入内容は保存しない（画面を閉じれば消える）。

import {useCallback, useEffect, useState} from 'react';
import {FAX_KINDS} from './templates';
import type {CustomTemplates} from './templates';

const PREFIX = 'fax-app:';

/**
 * localStorage に保存される useState。
 * 保存値が壊れていても sanitize で既定値に戻すので、画面が真っ白にはならない。
 * 書き込みは値を変えたときだけ行う（未変更の既定値は保存しない）。
 */
export function usePersistentState<T>(key: string, fallback: T, sanitize: (raw: unknown) => T) {
  const storageKey = PREFIX + key;
  const [value, setValue] = useState<T>(() => readStored(storageKey, fallback, sanitize));

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          /* 容量超過・プライベートモードなどで保存できなくても、画面上の操作は続けられる */
        }
        return resolved;
      });
    },
    [storageKey],
  );

  // 別のタブで変更されたら、このタブにも反映する
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) setValue(readStored(storageKey, fallback, sanitize));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // fallback / sanitize はモジュール定数を渡す前提なので、依存に含めない
  }, [storageKey]);

  return [value, update] as const;
}

function readStored<T>(storageKey: string, fallback: T, sanitize: (raw: unknown) => T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? fallback : sanitize(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

// ---- 差出人（自社）の情報 ----

export interface SenderInfo {
  /** グループ名（会社名の上に小さく入れる） */
  group: string;
  company: string;
  /** 営業部などの部署名（営業所名の前に入れる） */
  department: string;
  office: string;
  person: string;
  postal: string;
  address: string;
  tel: string;
  fax: string;
}

/** 既存のFAX送信票に印字されている内容（グループ名・営業部名は、あとから加えたもの） */
export const DEFAULT_SENDER: SenderInfo = {
  group: '太陽セランドグループ',
  company: '太陽シルバーサービス株式会社',
  department: '東九州営業部',
  office: '行橋営業所',
  person: '久保　匠史',
  postal: '824-0043',
  address: '福岡県行橋市大字流末1327番地',
  tel: '0930-26-9640',
  fax: '0930-26-9641',
};

export function sanitizeSender(raw: unknown): SenderInfo {
  if (!isRecord(raw)) return DEFAULT_SENDER;
  const out = {...DEFAULT_SENDER};
  for (const k of Object.keys(DEFAULT_SENDER) as (keyof SenderInfo)[]) {
    out[k] = str(raw[k], DEFAULT_SENDER[k]);
  }
  return out;
}

// ---- 印刷デザイン ----

/**
 * classic: これまで使っていた「FAX送信票」 / table: 表形式の「FAX 送付状」 /
 * letter: 文書形式の「FAX送付のご案内」（日付・宛先・差出人・拝啓〜敬具・記〜以上と並べるビジネス文書の形）
 */
export type SheetLayout = 'classic' | 'table' | 'letter';

export const sanitizeLayout = (raw: unknown): SheetLayout => (raw === 'table' || raw === 'letter' ? raw : 'classic');

// ---- 宛先 ----

export interface Recipient {
  /** 居宅名・会社名など */
  org: string;
  /** ケアマネ名・ご担当者名 */
  person: string;
}

export interface SavedRecipient extends Recipient {
  id: string;
  lastUsed: number;
}

export const EMPTY_RECIPIENT: Recipient = {org: '', person: ''};

export function sanitizeRecipients(raw: unknown): SavedRecipient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((r) => ({
      id: str(r.id) || newId(),
      org: str(r.org),
      person: str(r.person),
      lastUsed: typeof r.lastUsed === 'number' ? r.lastUsed : 0,
    }))
    .filter((r) => r.org.trim() !== '' || r.person.trim() !== '');
}

// ---- 保存した文面 ----

export function sanitizeTemplates(raw: unknown): CustomTemplates {
  if (!isRecord(raw)) return {};
  const out: CustomTemplates = {};
  for (const kind of FAX_KINDS) {
    const t = raw[kind.id];
    if (isRecord(t) && typeof t.subject === 'string' && typeof t.body === 'string') {
      out[kind.id] = {subject: t.subject, body: t.body};
    }
  }
  return out;
}

export function newId(): string {
  // crypto.randomUUID は https / localhost でしか使えないため、念のため代替を用意する
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
