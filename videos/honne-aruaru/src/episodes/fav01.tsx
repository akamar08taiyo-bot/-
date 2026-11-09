// 本音あるある「高速TOP10」日本に好意的な印象を持つ国・地域（アウンコンサルティング「世界14カ国・地域の親日度調査」2026年）。中身は episodes/fav01/script.json、作りは src/rankingFast.tsx
import script from '../../episodes/fav01/script.json';
import faces from '../../episodes/fav01/faces.json';
import {FScript, makeFastRanking} from '../rankingFast';

export const {Comp: Fav01, duration: durationFav01} = makeFastRanking(script as unknown as FScript, faces as unknown as Record<string, unknown>);
