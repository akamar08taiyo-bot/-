/**
 * 取り込んだデータをこのブラウザの localStorage に保存する（サーバーには送らない）。
 * 端末を変える・履歴を消すと消えるので、CSV書き出しでバックアップできるようにしている。
 */
import {dedupe} from './parse';
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
