// しのぶの失言ノート #8 のランキング（音なし）。中身は episodes/honne08/script.json、作りは src/rankingEp.tsx
import script from '../../episodes/honne08/script.json';
import faces from '../../episodes/honne08/faces.json';
import {RScript, makeRanking} from '../rankingEp';

export const {Comp: Honne08, duration: durationHonne08} = makeRanking(script as unknown as RScript, faces as unknown as Record<string, unknown>);
