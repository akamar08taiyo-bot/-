// しのぶの失言ノート #7 のランキング（音なし）。中身は episodes/honne07/script.json、作りは src/rankingEp.tsx
import script from '../../episodes/honne07/script.json';
import faces from '../../episodes/honne07/faces.json';
import {RScript, makeRanking} from '../rankingEp';

export const {Comp: Honne07, duration: durationHonne07} = makeRanking(script as unknown as RScript, faces as unknown as Record<string, unknown>);
