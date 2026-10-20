// 家庭内別班 #2（音なし）。中身は episodes/bekkan02/script.json、作りは src/bekkan.tsx
import script from '../../episodes/bekkan02/script.json';
import faces from '../../episodes/bekkan02/faces.json';
import {BScript, makeBekkan} from '../bekkan';

export const {Comp: Bekkan02, duration: durationBekkan02} = makeBekkan(script as unknown as BScript, faces as unknown as Record<string, unknown>);
