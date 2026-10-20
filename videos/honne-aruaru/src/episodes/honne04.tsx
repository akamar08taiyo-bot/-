// しのぶの失言ノート #4 のランキング（音なし）。中身は episodes/honne04/script.json、作りは src/rankingEp.tsx
import script from '../../episodes/honne04/script.json';
import faces from '../../episodes/honne04/faces.json';
import {RScript, makeRanking} from '../rankingEp';

export const {Comp: Honne04, duration: durationHonne04} = makeRanking(script as unknown as RScript, faces as unknown as Record<string, unknown>);
