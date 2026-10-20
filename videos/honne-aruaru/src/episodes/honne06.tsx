// しのぶの失言ノート #6 のランキング（音なし）。中身は episodes/honne06/script.json、作りは src/rankingEp.tsx
import script from '../../episodes/honne06/script.json';
import faces from '../../episodes/honne06/faces.json';
import {RScript, makeRanking} from '../rankingEp';

export const {Comp: Honne06, duration: durationHonne06} = makeRanking(script as unknown as RScript, faces as unknown as Record<string, unknown>);
