// 場面（1枚の絵＋カメラ＋上に重ねる演出）と、全部の回で同じ字幕・テロップの並べ方。
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame} from 'remotion';
import {Cam, CamKey, Times, camAt, placeCam, ramp, wobble} from './lib';

export type Box = [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0〜1000
export const center = (b: Box) => ({x: (b[1] + b[3]) / 2000, y: (b[0] + b[2]) / 2000});

/** faces.json から、場面 scene の人物 who の顔の中心（0〜1） */
export const faceOf = (faces: Record<string, unknown>, scene: string, who: string) => {
  const list = faces[scene] as {who: string; box: Box}[] | undefined;
  const f = list?.find((v) => v.who === who);
  if (!f) throw new Error(`faces.json に ${scene} の ${who} がありません`);
  return center(f.box);
};

export const cam = (fx: number, fy: number, z: number, tx = 540, ty = 820): Cam => ({fx, fy, z, tx, ty});

export type Overlay = (p: {frame: number; at: (nx: number, ny: number) => {x: number; y: number}; s: number}) => React.ReactNode;
export type Scene = {
  img: string; // public/ からの場所（例 'honne01/img/S1.jpg'）
  from: number;
  to: number;
  keys: CamKey[];
  drift?: number;
  punch?: boolean;
  shake?: number; // 入りの揺れの大きさ（px）
  filter?: string; // 絵にかける CSS filter（例：差し込みの背景をぼかす）
  overlay?: Overlay;
};

export const SceneView: React.FC<{sc: Scene}> = ({sc}) => {
  const frame = useCurrentFrame();
  if (frame < sc.from || frame >= sc.to) return null;
  const c = camAt(frame, sc.keys, sc.from, sc.to, sc.drift ?? 0.04);
  const pl = placeCam(c);
  // 切り替わりの瞬間に少しだけ寄って戻る（テンポ感）
  const punch = sc.punch === false ? 1 : 1 + 0.035 * (1 - ramp(frame, sc.from, sc.from + 6));
  const shake = (sc.shake ?? 0) * (1 - ramp(frame, sc.from, sc.from + 8));
  const s = pl.w / 1536;
  const at = (nx: number, ny: number) => ({x: pl.left + nx * pl.w, y: pl.top + ny * pl.h});
  return (
    <AbsoluteFill style={{transform: `scale(${punch}) translate(${wobble(frame, 1, shake)}px, ${wobble(frame, 2, shake)}px)`}}>
      <Img src={staticFile(sc.img)} style={{position: 'absolute', left: pl.left, top: pl.top, width: pl.w, height: pl.h, filter: sc.filter}} />
      {sc.overlay?.({frame, at, s})}
    </AbsoluteFill>
  );
};

export type Line = {id: string; text: string; sub?: string; aside?: boolean; item?: number; telop?: string};

/** 字幕の出る区間：行の話し始めから次の行の直前まで。話し終わったあとに場面が切り替わるときは、切り替わりで消す
 *（行の途中の切り替わりでは消さない） */
export const subtitleSpans = (lines: Line[], scenes: Scene[], T: Times) => {
  const cuts = scenes.map((sc) => sc.from).filter((f) => f > 0);
  return lines.map((l, i) => {
    const next = lines[i + 1];
    const from = T.s(l.id, -0.04);
    const cut = Math.min(...cuts.filter((f) => f > T.e(l.id, -0.05)), T.total);
    const to = Math.min(cut, next ? Math.min(T.s(next.id, -0.04), T.e(l.id, 0.6)) : T.e(l.id, 0.15));
    return {l, from, to};
  });
};

/** いま何番目のあるあるか（ヘッダーの①〜⑤）。afterAll 以降は全部済み（6） */
export const currentItem = (frame: number, lines: Line[], T: Times, lead: number, afterAll: number) => {
  let item = 0;
  let since = 0;
  for (const l of lines) {
    const at = T.s(l.id, lead);
    if (l.item && frame >= at) {
      item = l.item;
      since = at;
    }
  }
  if (frame >= afterAll) {
    item = 6;
    since = afterAll;
  }
  return {item, since};
};
