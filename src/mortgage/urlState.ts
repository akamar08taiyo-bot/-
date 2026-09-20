import type {ScenarioInput} from './calc';

/** URLのクエリパラメータとシナリオ条件の相互変換（条件をそのまま共有できるようにする） */

const KEYS = {
  principal: 'p', // 万円
  years: 'y',
  initialRate: 'r',
  stepRate: 's',
  reviewYears: 'rv',
  maxRate: 'max',
  use125Rule: 'cap',
} as const;

const num = (params: URLSearchParams, key: string, fallback: number, min: number, max: number): number => {
  const raw = params.get(key);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

export function readScenarioFromUrl(defaults: ScenarioInput, search?: string): ScenarioInput {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? window.location.search);
  } catch {
    return defaults;
  }
  return {
    principal: num(params, KEYS.principal, defaults.principal / 10000, 100, 20000) * 10000,
    years: Math.round(num(params, KEYS.years, defaults.years, 5, 50)),
    initialRate: num(params, KEYS.initialRate, defaults.initialRate, 0, 5),
    stepRate: num(params, KEYS.stepRate, defaults.stepRate, -0.5, 2),
    reviewYears: Math.round(num(params, KEYS.reviewYears, defaults.reviewYears, 1, 10)),
    maxRate: num(params, KEYS.maxRate, defaults.maxRate, 0.5, 10),
    use125Rule: params.get(KEYS.use125Rule) === '1' ? true : params.get(KEYS.use125Rule) === '0' ? false : defaults.use125Rule,
  };
}

export function scenarioToQuery(input: ScenarioInput): string {
  const params = new URLSearchParams({
    [KEYS.principal]: String(input.principal / 10000),
    [KEYS.years]: String(input.years),
    [KEYS.initialRate]: String(input.initialRate),
    [KEYS.stepRate]: String(input.stepRate),
    [KEYS.reviewYears]: String(input.reviewYears),
    [KEYS.maxRate]: String(input.maxRate),
    [KEYS.use125Rule]: input.use125Rule ? '1' : '0',
  });
  return `?${params.toString()}`;
}
