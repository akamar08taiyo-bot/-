// 本音あるある「高速TOP5」日中共同世論調査（2021年）の、相手の国に良くない印象を持つ理由。中身は episodes/jc01/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/jc01/script.json';
import faces from '../../episodes/jc01/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: Jc01, duration: durationJc01} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
