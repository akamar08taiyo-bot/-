// 「サンプルで試す」で入れる例
//   仕切り：玄関 木の手すり1万円・ブラケット1,500円×2個・取付手間 木×2箇所
//   見積：木の手すり 定価2万円（1本4m）を60cm → 0.15本×単価16,000円＝2,400円、そのすぐ下に同上施工費（木 2箇所＝2,000円）
import {guessPieceLengthM} from './priceImport.ts';
import {kitFromRows, laborRow, manualRow, materialRow, newPlace} from './rows.ts';
import type {AppData, Job, Kit, Material} from './types.ts';
import {uid} from './util.ts';

export const SAMPLE_MAKER = 'サンプル';
export const SAMPLE_PREFIX = '（サンプル）';

export function addSamples(data: AppData, month: string): {materials: Material[]; jobs: Job[]; kits: Kit[]} {
  const now = Date.now();
  const mk = (name: string, price: number, listPrice: number, code: string, unit: string): Material => ({
    id: uid('m'),
    name,
    price,
    listPrice,
    pieceLengthM: guessPieceLengthM(name),
    maker: SAMPLE_MAKER,
    code,
    unit,
    favorite: true,
    updatedAt: now,
  });
  const handrail = mk('木の手すり 35φ 4m', 10000, 20000, 'S-TS35', '本');
  const bracket = mk('ブラケット', 1500, 2100, 'S-BK01', '個');
  const lHandrail = mk('L型手すり', 7800, 11000, 'S-TL01', '本');
  const cap = mk('エンドキャップ', 300, 450, 'S-EC01', '個');
  const board = mk('補強板', 2000, 2800, 'S-HB01', '枚');
  const labor = (name: string, qty: number) => {
    const l = data.labor.find((x) => x.name === name);
    return l ? laborRow(l, qty) : manualRow('labor', {name, qty});
  };
  const job: Job = {
    id: uid('j'),
    month,
    customer: SAMPLE_PREFIX + '山田',
    suffix: '様邸',
    staff: data.settings.staffList[0] ?? '',
    date: `${month}-05`,
    address: '',
    note: '玄関・トイレの手すり取付（サンプル）',
    insuredNo: '',
    form: '',
    places: [
      newPlace('玄関', [{...materialRow(handrail, 1), lengthCm: 60}, labor('木', 2), materialRow(bracket, 2)]),
      newPlace('トイレ', [materialRow(lHandrail, 1), labor('タイル', 2), materialRow(cap, 2)]),
    ],
    createdAt: now,
    updatedAt: now,
  };
  const kit = kitFromRows(SAMPLE_PREFIX + 'I型手すり一式（木の下地）', [materialRow(handrail, 1), labor('木', 2), materialRow(bracket, 2), materialRow(cap, 2)]);
  return {
    materials: [...data.materials, handrail, bracket, lHandrail, cap, board],
    jobs: [...data.jobs, job],
    kits: [...data.kits, kit],
  };
}

export function hasSamples(data: AppData): boolean {
  return (
    data.materials.some((m) => m.maker === SAMPLE_MAKER) ||
    data.jobs.some((j) => j.customer.startsWith(SAMPLE_PREFIX)) ||
    data.kits.some((k) => k.name.startsWith(SAMPLE_PREFIX))
  );
}

export function withoutSamples(data: AppData): {materials: Material[]; jobs: Job[]; kits: Kit[]} {
  return {
    materials: data.materials.filter((m) => m.maker !== SAMPLE_MAKER),
    jobs: data.jobs.filter((j) => !j.customer.startsWith(SAMPLE_PREFIX)),
    kits: data.kits.filter((k) => !k.name.startsWith(SAMPLE_PREFIX)),
  };
}
