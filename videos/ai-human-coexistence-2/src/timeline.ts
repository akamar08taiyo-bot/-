import data from './timeline.json';
import type {InkDef} from './fx/Ink';
import type {VoiceDef} from './fx/Voice';

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
  ink?: InkDef[]; // 画面の中の紙・板に書いてある文字（fx/Ink.tsx）
  voice?: VoiceDef[]; // 話すだけで書ける空中のタブレット（fx/Voice.tsx）
  memory?: boolean; // 昭和の回想（色あせ・粒子は ffmpeg でクリップにかけ済み。メモ用）
  clip?: number; // クリップの長さ（秒）。半速の 15.9 秒と違うとき（頭や後ろを切った・倍率を変えた）。scripts/sync_cliplen.py が書く
  veil?: {t0: number; t1: number; from: number; to: number; color: string}[]; // 画面全体を色でおおう（砂が舞って次の場面へ、など）
  shade?: {x: number; y: number; rx: number; ry: number; k?: number; soft?: number}[]; // 顔を暗がりに沈める（scripts/bake_ink.py が焼き込む）
  events?: {t: number; t_end?: number; type: string; gain?: number; n?: number; kind?: string; far?: boolean; soft?: boolean; seed?: number; file?: string}[];
  audio?: {veo: number; veo_lp?: number; bed_gain?: number; beds: (string | {name: string; t0?: number; t1?: number; gain?: number})[]};
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
