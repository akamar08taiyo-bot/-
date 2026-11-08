// 本音あるある「高速TOP10」日本の魅力（実写の写真と地図。1位は固定コメントへ、番外編は「人」）。中身は episodes/japan01/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/japan01/script.json';
import faces from '../../episodes/japan01/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: Japan01, duration: durationJapan01} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
