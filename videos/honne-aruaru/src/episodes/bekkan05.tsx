// 家庭内別班 #5（音なし）。中身は episodes/bekkan05/script.json、作りは src/bekkan.tsx
import script from '../../episodes/bekkan05/script.json';
import faces from '../../episodes/bekkan05/faces.json';
import {BScript, makeBekkan} from '../bekkan';

export const {Comp: Bekkan05, duration: durationBekkan05} = makeBekkan(script as unknown as BScript, faces as unknown as Record<string, unknown>);
