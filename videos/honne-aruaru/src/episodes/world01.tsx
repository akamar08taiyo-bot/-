// 本音あるある「高速TOP10」世界中の人が日本に憧れる理由（DBJ・JTBF の調査の順位、実写の写真。1位は固定コメントへ）。中身は episodes/world01/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/world01/script.json';
import faces from '../../episodes/world01/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: World01, duration: durationWorld01} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
