/**
 * 取り込んだデータをこのブラウザの localStorage に保存する（サーバーには送らない）。
 * 端末を変える・履歴を消すと消えるので、CSV書き出しでバックアップできるようにしている。
 */
import {dedupe} from './parse';
import type {Prediction} from './publish';
import type {SlotRow} from './types';

const KEY = 'slot-analyzer:rows:v1';

export function loadRows(): SlotRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRows(rows: SlotRow[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* 保存できない環境（プライベートブラウズ等）でも画面は動かす */
  }
}

/** 既存データに追加する。同じ日・店・台番は新しいもので上書き */
export function mergeRows(current: SlotRow[], incoming: SlotRow[]): SlotRow[] {
  return dedupe([...current, ...incoming]);
}

// ---------------------------------------------------------------- 予想の記録・発信設定

const PRED_KEY = 'slot-analyzer:predictions:v1';
const SETTINGS_KEY = 'slot-analyzer:publish-settings:v1';

export function loadPredictions(): Prediction[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePredictions(list: Prediction[]): void {
  try {
    localStorage.setItem(PRED_KEY, JSON.stringify(list));
  } catch {
    /* 保存できない環境でも画面は動かす */
  }
}

/** 同じ店・同じ対象日の予想は1つだけ（上書き） */
export function upsertPrediction(list: Prediction[], p: Prediction): Prediction[] {
  return [...list.filter((x) => x.id !== p.id), p].sort((a, b) => b.targetDate.localeCompare(a.targetDate));
}

export interface PublishSettings {
  source: string;
  hashtags: string;
}

export const DEFAULT_PUBLISH_SETTINGS: PublishSettings = {source: 'みんレポ', hashtags: 'スロット データ'};

export function loadPublishSettings(): PublishSettings {
  try {
    return {...DEFAULT_PUBLISH_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')};
  } catch {
    return DEFAULT_PUBLISH_SETTINGS;
  }
}

export function savePublishSettings(s: PublishSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}
