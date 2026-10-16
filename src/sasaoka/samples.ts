// 「サンプルで試す」で入れる例（玄関：木の手すり1万円・ブラケット1,500円×2個・取付手間 木×2箇所）
import type {AppData, Job, Material} from './types.ts';
import {uid} from './util.ts';

export const SAMPLE_MAKER = 'サンプル';
export const SAMPLE_PREFIX = '（サンプル）';

export function addSamples(data: AppData, month: string): {materials: Material[]; jobs: Job[]} {
  const now = Date.now();
  const mk = (name: string, price: number, code: string): Material => ({
    id: uid('m'),
    name,
    price,
    maker: SAMPLE_MAKER,
    code,
    unit: '',
    favorite: true,
    updatedAt: now,
  });
  const handrail = mk('木の手すり 35φ 2m', 10000, 'S-TS35');
  const bracket = mk('ブラケット', 1500, 'S-BK01');
  const lHandrail = mk('L型手すり', 7800, 'S-TL01');
  const cap = mk('エンドキャップ', 300, 'S-EC01');
  const board = mk('補強板', 2000, 'S-HB01');
  const labor = (name: string) => data.labor.find((l) => l.name === name);
  const laborRow = (name: string, qty: number) => {
    const l = labor(name);
    return {id: uid('r'), kind: 'labor' as const, refId: l?.id ?? null, name, code: '', maker: '', price: l?.price ?? 0, qty};
  };
  const matRow = (m: Material, qty: number) => ({
    id: uid('r'),
    kind: 'material' as const,
    refId: m.id,
    name: m.name,
    code: m.code,
    maker: m.maker,
    price: m.price,
    qty,
  });
  const job: Job = {
    id: uid('j'),
    month,
    customer: SAMPLE_PREFIX + '山田',
    suffix: '様邸',
    date: `${month}-05`,
    address: '',
    note: '玄関・トイレの手すり取付（サンプル）',
    places: [
      {id: uid('p'), name: '玄関', rows: [matRow(handrail, 1), matRow(bracket, 2), laborRow('木', 2)]},
      {id: uid('p'), name: 'トイレ', rows: [matRow(lHandrail, 1), matRow(cap, 2), laborRow('タイル', 2)]},
    ],
    createdAt: now,
    updatedAt: now,
  };
  return {materials: [...data.materials, handrail, bracket, lHandrail, cap, board], jobs: [...data.jobs, job]};
}

export function hasSamples(data: AppData): boolean {
  return data.materials.some((m) => m.maker === SAMPLE_MAKER) || data.jobs.some((j) => j.customer.startsWith(SAMPLE_PREFIX));
}

export function withoutSamples(data: AppData): {materials: Material[]; jobs: Job[]} {
  return {
    materials: data.materials.filter((m) => m.maker !== SAMPLE_MAKER),
    jobs: data.jobs.filter((j) => !j.customer.startsWith(SAMPLE_PREFIX)),
  };
}
