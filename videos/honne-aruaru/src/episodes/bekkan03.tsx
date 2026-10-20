// 家庭内別班 #3（音なし）。中身は episodes/bekkan03/script.json、作りは src/bekkan.tsx
import script from '../../episodes/bekkan03/script.json';
import faces from '../../episodes/bekkan03/faces.json';
import {BScript, makeBekkan} from '../bekkan';

export const {Comp: Bekkan03, duration: durationBekkan03} = makeBekkan(script as unknown as BScript, faces as unknown as Record<string, unknown>);
