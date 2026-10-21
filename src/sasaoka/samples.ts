// 「サンプルで試す」で入れる例
//   仕切り：玄関 木の手すり1万円・ブラケット1,500円×2個・取付手間 木×2箇所
//   見積：木の手すり 定価2万円（1本4m）を60cm → 0.15本×単価16,000円＝2,400円、そのすぐ下に同上施工費（木 2箇所＝2,000円）
import {guessPieceLengthM} from './priceImport.ts';
import {codeKey, kitFromRows, laborRow, manualRow, materialRow, newPlace} from './rows.ts';
import type {AppData, Job, Kit, LaborItem, Material} from './types.ts';
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
    insurer: 'yukuhashi',
    form: 'yukuhashi',
    overhead: null,
    overheadTarget: null,
    shikiri: true,
    places: [
      newPlace('玄関', [{...materialRow(handrail, 1), lengthCm: 60}, labor('木', 2), materialRow(bracket, 2)]),
      newPlace('トイレ', [materialRow(lHandrail, 1), labor('タイル', 2), materialRow(cap, 2)]),
    ],
    createdAt: now,
    updatedAt: now,
  };
  const kit = kitFromRows(SAMPLE_PREFIX + 'I型手すり（木の下地）', [materialRow(handrail, 1), labor('木', 2), materialRow(bracket, 2), materialRow(cap, 2)]);
  return {
    materials: [...data.materials, handrail, bracket, lHandrail, cap, board],
    jobs: [...data.jobs, job],
    kits: [...data.kits, kit],
  };
}

/** 部材＋施工費（常用）の例。IDを決めておく（2つのアプリで同時に入れても1つになる） */
export const EXAMPLE_KIT_ID = 'kit-example';

/**
 * 部材＋施工費（常用）の例（ユーザーの指示）：マツ六の手すり BD-134（何本かは見積ごとに違うので空けておく）・金具 BD-08G・
 * 施工費（笹岡工務店の木 2箇所＝2,000円。見積では1.5倍の 3,000円）。部材リストに同じ品番があれば、その部材（単価・定価）にする
 */
export function exampleKit(materials: Material[], labor: LaborItem[]): Kit {
  const find = (code: string) => materials.find((m) => codeKey(m.code) === codeKey(code));
  const bar = find('BD-134');
  const bracket = find('BD-08G');
  const wood = labor.find((l) => l.name === '木');
  const rows = [
    bar ? materialRow(bar, 0) : manualRow('material', {name: '手すり（丸棒 4000mm）', code: 'BD-134', maker: 'マツ六', unit: '本', qty: 0, pieceLengthM: 4}),
    bracket ? materialRow(bracket, 0) : manualRow('material', {name: '金具', code: 'BD-08G', maker: 'マツ六', unit: '個', qty: 0}),
    wood ? laborRow(wood, 2) : manualRow('labor', {name: '取付手間', price: 2000, qty: 1}),
  ];
  return {...kitFromRows('（例）手すり BD-134＋金具 BD-08G＋施工費', rows), id: EXAMPLE_KIT_ID};
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
