// 本音あるある「高速TOP10」（しのぶの出ない回。絵の代わりに絵文字の画面、1位は固定コメントへ）。中身は episodes/rank01/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/rank01/script.json';
import faces from '../../episodes/rank01/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: Rank01, duration: durationRank01} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
