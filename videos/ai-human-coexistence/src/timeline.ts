import data from './timeline.json';

export type Caption = {t0: number; t1: number; text: string};
export type Holo = {x: number; y: number; w: number; lines: string[]; t0: number; t1?: number; tilt?: number; small?: boolean; variant?: 'holo' | 'chalk'; stamp?: {t: number; text: string; pos?: 'tr' | 'br'}; h?: number; opaque?: number; fixed?: boolean};
export type ShotDef = {
  id: string;
  chapter: string;
  name: string;
  dur: number;
  clipAt?: number;
  hold?: 'reverse' | 'freeze';
  push?: [number, number];
  captions?: Caption[];
  chapterCard?: {t0: number; t1: number; num: string; title: string; time: string; right?: number};
  title?: {t0: number; t1: number; text: string; sub: string; top?: number; size?: number; subFirst?: boolean};
  endCard?: {t0: number; t1: number; text: string; sub: string; note: string};
  holo?: Holo[];
  events?: {t: number; t_end?: number; type: string; gain?: number; n?: number; kind?: string; far?: boolean; soft?: boolean; seed?: number}[];
  audio?: {veo: number; veo_lp?: number; bed_gain?: number; beds: (string | {name: string; t0?: number; t1?: number; gain?: number})[]};
  clip?: number; // クリップの長さ（秒）。15.9 秒と違うとき（冒頭のつかみなど）
  // 冒頭のつかみ：本編のクリップから数秒ずつ切り出してつなぐ（scripts/make_hook.py が映像、audio/src/build_mix.py が音を作る）
  hook?: {xf: number; fadeOut?: number; segs: {src: string; ss: number; len: number; veo?: number; beds?: string[]; events?: {t: number; type: string}[]}[]};
};

export const FPS: number = data.fps;
export const W: number = data.width;
export const H: number = data.height;
export const XFADE: number = data.crossfade;
export const CLIP_LEN: number = data.clipLen;

export const SHOTS: (ShotDef & {start: number; startFrame: number; durFrames: number})[] = (() => {
  let s = 0;
  return (data.shots as unknown as ShotDef[]).map((shot) => {
    const out = {...shot, start: s, startFrame: Math.round(s * data.fps), durFrames: Math.round(shot.dur * data.fps)};
    s += shot.dur - data.crossfade;
    return out;
  });
})();

export const TOTAL_SEC = SHOTS[SHOTS.length - 1].start + SHOTS[SHOTS.length - 1].dur;
export const TOTAL_FRAMES = Math.round(TOTAL_SEC * FPS);

export const shotById = (id: string) => {
  const s = SHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown shot ${id}`);
  return s;
};
