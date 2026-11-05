// 本音あるある「高速TOP10」（実際の調査をもとに、1位は固定コメントへ）。中身は episodes/honne11/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/honne11/script.json';
import faces from '../../episodes/honne11/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: Honne11, duration: durationHonne11} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
