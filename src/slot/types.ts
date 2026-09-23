/** 1台・1日分のデータ（分析の最小単位） */
export interface SlotRow {
  /** YYYY-MM-DD */
  date: string;
  store: string;
  machine: string;
  /** 台番 */
  unit: number;
  /** 総ゲーム数（不明なら null） */
  games: number | null;
  /** 差枚（プラスが客の勝ち） */
  diff: number;
  bb: number | null;
  rb: number | null;
}

/** 1日分のデータセット */
export interface DayData {
  date: string;
  store: string;
  rows: SlotRow[];
}
