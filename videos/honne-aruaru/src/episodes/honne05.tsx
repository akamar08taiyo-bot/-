// しのぶの失言ノート #5 のランキング（音なし）。中身は episodes/honne05/script.json、作りは src/rankingEp.tsx
import script from '../../episodes/honne05/script.json';
import faces from '../../episodes/honne05/faces.json';
import {RScript, makeRanking} from '../rankingEp';

export const {Comp: Honne05, duration: durationHonne05} = makeRanking(script as unknown as RScript, faces as unknown as Record<string, unknown>);
