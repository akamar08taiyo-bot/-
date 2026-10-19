// 時刻・動き・カメラの共通部品。演出の時刻は台本の行基準（T.s / T.e）で書き、秒を直書きしない。
import {Easing, interpolate, spring} from 'remotion';

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export type Timeline = {fps: number; total: number; lines: {id: string; start: number; end: number}[]};
export type Times = {s: (id: string, off?: number) => number; e: (id: string, off?: number) => number; total: number};

/** 回の timeline.json から、行基準の時刻（フレーム）を返す T を作る */
export const makeT = (timeline: Timeline): Times => {
  const lines: Record<string, {start: number; end: number}> = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const get = (id: string) => {
    const l = lines[id];
    if (!l) throw new Error(`timeline に行 ${id} がありません`);
    return l;
  };
  return {
    /** 行 id の話し始め（+off 秒）のフレーム */
    s: (id, off = 0) => Math.round((get(id).start + off) * FPS),
    /** 行 id の話し終わり（+off 秒）のフレーム */
    e: (id, off = 0) => Math.round((get(id).end + off) * FPS),
    total: Math.ceil(timeline.total * FPS),
  };
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** a〜b フレームで 0→1（イーズ付き） */
export const ramp = (frame: number, a: number, b: number, ease = Easing.inOut(Easing.cubic)) =>
  b <= a ? (frame >= a ? 1 : 0) : interpolate(frame, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

/** at フレームから弾んで 0→1（はみ出しあり） */
export const pop = (frame: number, at: number, damping = 11, stiffness = 190) =>
  frame < at ? 0 : spring({frame: frame - at, fps: FPS, config: {damping, stiffness, mass: 0.6}});

/** 現れて消える不透明度（in/out はフレーム数） */
export const life = (frame: number, from: number, to: number, fin = 4, fout = 4) =>
  Math.min(ramp(frame, from, from + fin), 1 - ramp(frame, to - fout, to));

/** 決まった値の揺れ（乱数を使わない） */
export const wobble = (frame: number, seed: number, amp = 1) =>
  amp * (Math.sin(frame * 0.9 + seed * 1.7) * 0.6 + Math.sin(frame * 2.3 + seed * 3.1) * 0.4);

// 画像のカメラ。fx, fy は画像上の注目点（0〜1）、z は画面いっぱい（cover）を 1 とした拡大率、
// tx, ty は注目点を置く画面上の位置（px）。画面の外に余白が出ないように寄せる。
export const IW = 1536;
export const IH = 2752;
export type Cam = {fx: number; fy: number; z: number; tx: number; ty: number};
const COVER = Math.max(W / IW, H / IH);

export const placeCam = (c: Cam) => {
  const s = COVER * c.z;
  const w = IW * s;
  const h = IH * s;
  const left = Math.min(0, Math.max(W - w, c.tx - c.fx * w));
  const top = Math.min(0, Math.max(H - h, c.ty - c.fy * h));
  return {left, top, w, h};
};

export type CamKey = {at: number; cam: Cam; dur?: number};

/** キーの間をイーズでつなぐ。drift はシーン全体でゆっくり寄る割合 */
export const camAt = (frame: number, keys: CamKey[], from: number, to: number, drift = 0.05): Cam => {
  let cam = keys[0].cam;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    const p = ramp(frame, k.at, k.at + (k.dur ?? 10));
    if (p <= 0) break;
    const prev = cam;
    cam = {
      fx: prev.fx + (k.cam.fx - prev.fx) * p,
      fy: prev.fy + (k.cam.fy - prev.fy) * p,
      z: prev.z + (k.cam.z - prev.z) * p,
      tx: prev.tx + (k.cam.tx - prev.tx) * p,
      ty: prev.ty + (k.cam.ty - prev.ty) * p,
    };
  }
  const d = 1 + drift * clamp01((frame - from) / Math.max(1, to - from));
  return {...cam, z: cam.z * d};
};
