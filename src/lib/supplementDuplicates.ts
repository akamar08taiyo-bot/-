import type {Supplement, SupplementLog} from '../types';

export interface DuplicateWarning {
  ingredient: string;
  total: number;
  note: string;
}

// Ports the 10-3 pseudocode: sums today's intake per ingredient and warns only
// when a supplement's registered caution threshold is met or exceeded.
export function checkDuplicates(
  todayLogs: SupplementLog[],
  supplements: Supplement[],
): DuplicateWarning[] {
  const bySupplementId = new Map(supplements.map((s) => [s.id, s]));
  const totals = new Map<string, number>();

  for (const log of todayLogs) {
    const supplement = bySupplementId.get(log.supplement_id);
    if (!supplement) continue;
    const amount = supplement.amount_per_unit * log.quantity;
    totals.set(
      supplement.ingredient,
      (totals.get(supplement.ingredient) ?? 0) + amount,
    );
  }

  const warnings: DuplicateWarning[] = [];
  for (const [ingredient, total] of totals) {
    const caution = supplements.find((s) => s.ingredient === ingredient)?.caution;
    if (caution && total >= caution.threshold) {
      warnings.push({ingredient, total, note: caution.text});
    }
  }
  return warnings;
}
