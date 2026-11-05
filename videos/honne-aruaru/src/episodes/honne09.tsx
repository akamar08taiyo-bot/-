// 本音あるある「高速TOP10」（実際の調査をもとに、1位は固定コメントへ）。中身は episodes/honne09/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/honne09/script.json';
import faces from '../../episodes/honne09/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: Honne09, duration: durationHonne09} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
