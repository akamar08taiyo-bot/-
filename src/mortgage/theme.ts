/**
 * グラフ用のカラートークン。
 * カテゴリカル配色は検証済みパレットのスロット1（青）・スロット2（橙）を使う。
 * 隣接ペアの色覚多様性ΔE・通常視ΔE・コントラストの各基準を満たす組み合わせ。
 */
export const viz = {
  /** 変動金利シナリオ */
  variable: '#2a78d6',
  /** 全期間固定金利（比較用） */
  fixed: '#eb6834',
  /** 現在の設定を指すアノテーション */
  marker: '#4a3aa7',
  /** 警告（未払利息の発生など） */
  warning: '#eda100',
  grid: '#e2e8f0',
  axis: '#94a3b8',
  textPrimary: '#0f172a',
  textSecondary: '#52514e',
  surface: '#ffffff',
} as const;
