import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Caption, ChapterCard, TitleCard} from './fx/Text';
import {FPS, shotById} from './timeline';

export type ShotProps = {t: number; dur: number};

// 1 カット分の舞台：SVG の絵＋台本どおりのテロップ
export const Stage: React.FC<{id: string; Comp: React.FC<ShotProps>; bg?: string}> = ({id, Comp, bg = '#000'}) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const def = shotById(id);
  return (
    <AbsoluteFill style={{background: bg}}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{position: 'absolute', inset: 0}}>
        <Comp t={t} dur={def.dur} />
      </svg>
      {def.chapterCard ? <ChapterCard t={t} {...def.chapterCard} /> : null}
      {(def.captions ?? []).map((c, i) => (
        <Caption key={i} t={t} t0={c.t0} t1={c.t1} text={c.text} />
      ))}
      {def.title ? <TitleCard t={t} t0={def.title.t0} t1={def.title.t1} text={def.title.text} sub={def.title.sub} /> : null}
      {def.endCard ? <TitleCard t={t} t0={def.endCard.t0} t1={def.endCard.t1} text={def.endCard.text} sub={def.endCard.sub} small={def.endCard.note} /> : null}
    </AbsoluteFill>
  );
};

// カメラ：時間 t に応じた平行移動・拡大（中心基準）
export const Camera: React.FC<{x?: number; y?: number; zoom?: number; cx?: number; cy?: number; children: React.ReactNode}> = ({
  x = 0,
  y = 0,
  zoom = 1,
  cx = 960,
  cy = 540,
  children,
}) => <g transform={`translate(${cx + x},${cy + y}) scale(${zoom}) translate(${-cx},${-cy})`}>{children}</g>;
