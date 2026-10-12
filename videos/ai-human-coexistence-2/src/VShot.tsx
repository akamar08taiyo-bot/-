import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Caption, ChapterCard, TitleCard} from './fx/Text';
import {HoloBoard} from './fx/Holo';
import {InkPlane} from './fx/Ink';
import {VoiceTablet} from './fx/Voice';
import {CLIP_LEN, FPS, shotById} from './timeline';
import {clamp, easeInOut, smooth} from './lib/math';
import {applySim} from './lib/homography';
import tracks from './track.json';

type Mat = [number, number, number, number];
// <ID>：カメラ全体の動き（[a, b, tx, ty]／コマ）、<ID>@<名前>：平らな物の四隅（8個の数／コマ、px）
const TRACKS = tracks as unknown as Record<string, number[][]>;

// 画面に固定した位置 (x, y) を、カメラの動き m に合わせて動かす入れ物
const Tracked: React.FC<{m: Mat; x: number; y: number; children: React.ReactNode}> = ({m, x, y, children}) => {
  const x0 = x * 1920;
  const y0 = y * 1080;
  const [x1, y1] = applySim(m, x0, y0);
  const s = Math.sqrt(m[0] * m[0] + m[1] * m[1]);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `translate(${x1 - x0}px, ${y1 - y0}px)`}}>
      <div style={{position: 'absolute', inset: 0, transform: `scale(${s})`, transformOrigin: `${x0}px ${y0}px`}}>{children}</div>
    </div>
  );
};

// 動画カット：Veo のスロー映像＋カメラの寄り＋空中電子版＋テロップ
export const VShot: React.FC<{id: string}> = ({id}) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const def = shotById(id);
  const clipAt = def.clipAt ?? 0;
  const clipFrames = Math.round((def.clip ?? CLIP_LEN) * FPS);
  const at = Math.round(clipAt * FPS);
  const push = def.push ?? [1.0, 1.0];
  const z = push[0] + (push[1] - push[0]) * easeInOut(t / def.dur);
  // カメラ追跡：クリップ内のフレーム番号（逆再生中は折り返す）
  const tr = TRACKS[id];
  let ci = frame - at;
  if (ci >= clipFrames && def.hold === 'reverse') ci = clipFrames - 1 - (ci - clipFrames);
  ci = Math.max(0, Math.min(clipFrames - 1, ci));
  const m = (tr ? tr[Math.min(tr.length - 1, ci)] : [1, 0, 0, 0]) as Mat;
  // 紙・板の四隅：平面追跡があればそれ、なければカメラの動きで最初のコマの四隅を動かす
  const corners = (quad: number[], key?: string) => {
    const pt = key ? TRACKS[key] : undefined;
    if (pt) return pt[Math.min(pt.length - 1, ci)];
    const px = quad.map((v, i) => v * (i % 2 ? 1080 : 1920));
    return [0, 1, 2, 3].flatMap((k) => applySim(m, px[k * 2], px[k * 2 + 1]));
  };
  return (
    <AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `scale(${z})`, transformOrigin: '50% 50%'}}>
        {at > 0 ? <Img src={staticFile(`clips/${id}_first.jpg`)} style={{width: 1920, height: 1080}} /> : null}
        <Sequence from={at} durationInFrames={clipFrames} layout="none">
          <OffthreadVideo src={staticFile(`clips/${id}.mp4`)} muted style={{position: 'absolute', width: 1920, height: 1080}} />
        </Sequence>
        {def.hold === 'reverse' ? (
          <Sequence from={at + clipFrames} layout="none">
            <OffthreadVideo src={staticFile(`clips/${id}_rev.mp4`)} muted style={{position: 'absolute', width: 1920, height: 1080}} />
          </Sequence>
        ) : (
          <Sequence from={at + clipFrames} layout="none">
            <Img src={staticFile(`clips/${id}_last.jpg`)} style={{position: 'absolute', width: 1920, height: 1080}} />
          </Sequence>
        )}
        {(def.ink ?? []).map((k, i) => (
          <InkPlane key={`ink${i}`} def={k} t={t} corners={corners(k.quad, k.track)} />
        ))}
        {(def.holo ?? []).map((h, i) => (
          <Tracked key={i} m={m} x={h.x} y={h.y}>
            <HoloBoard t={t} t0={h.t0} t1={h.t1 ?? def.dur - 0.6} x={h.x} y={h.y} w={h.w} lines={h.lines} tilt={h.tilt} small={h.small} variant={h.variant} stamp={h.stamp} h={h.h} opaque={h.opaque} fixed={h.fixed} />
          </Tracked>
        ))}
        {(def.voice ?? []).map((v, i) => (
          <Tracked key={`v${i}`} m={m} x={v.x} y={v.y}>
            <VoiceTablet d={v} t={t} t1={v.t1 ?? def.dur - 0.6} />
          </Tracked>
        ))}
      </AbsoluteFill>
      {(def.veil ?? []).map((v, i) => (
        <AbsoluteFill key={`veil${i}`} style={{background: v.color, opacity: v.from + (v.to - v.from) * smooth((t - v.t0) / (v.t1 - v.t0))}} />
      ))}
      {def.chapterCard ? <ChapterCard t={t} {...def.chapterCard} /> : null}
      {(def.captions ?? []).map((c, i) => (
        <Caption key={i} t={t} t0={c.t0} t1={c.t1} text={c.text} />
      ))}
      {def.title ? <TitleCard t={t} t0={def.title.t0} t1={def.title.t1} text={def.title.text} sub={def.title.sub} top={def.title.top} size={def.title.size} subFirst={def.title.subFirst} /> : null}
      {def.endCard ? (
        <>
          <AbsoluteFill style={{background: '#05040a', opacity: 0.55 * clamp((t - def.endCard.t0) / 2.5)}} />
          <TitleCard t={t} t0={def.endCard.t0} t1={def.endCard.t1} text={def.endCard.text} sub={def.endCard.sub} small={def.endCard.note} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};
