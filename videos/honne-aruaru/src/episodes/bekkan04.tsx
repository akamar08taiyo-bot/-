// 家庭内別班 #4（音なし）。中身は episodes/bekkan04/script.json、作りは src/bekkan.tsx
import script from '../../episodes/bekkan04/script.json';
import faces from '../../episodes/bekkan04/faces.json';
import {BScript, makeBekkan} from '../bekkan';

export const {Comp: Bekkan04, duration: durationBekkan04} = makeBekkan(script as unknown as BScript, faces as unknown as Record<string, unknown>);
