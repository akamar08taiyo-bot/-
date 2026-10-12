import React from 'react';
import {boxToQuad, cssMatrix} from '../lib/homography';
import {clamp, easeOut, fadeWindow, hash} from '../lib/math';

// 画面の中の紙・カード・ページ・柱・板に、書いてある文字を重ねる（手書き・印刷・チョーク・墨）
// 文字は「内容の箱」（幅 1000px、高さは aspect から）に置き、箱を四隅（quad）に射影変換で貼りつける

export type InkFont = 'maru' | 'pencil' | 'pen' | 'robot' | 'mincho' | 'print' | 'chalk' | 'scratch';
export type InkItem = {
  text: string;
  x: number; // 位置（箱に対する割合）。align の基準点
  y: number; // 文字の上端（箱に対する割合）
  size: number; // 文字の高さ（箱の高さに対する割合）
  font?: InkFont;
  color?: string;
  opacity?: number;
  rot?: number; // 回転（度）
  align?: 'left' | 'center' | 'right';
  vertical?: boolean;
  shaky?: number; // 字のふるえ（0..1）。年をとった手の字
  spacing?: number; // 字間（em）
  t0?: number;
  t1?: number;
  write?: number; // 一文字ずつ書く速さ（秒／字）。省略時は最初から書いてある
  seed?: number;
};
export type InkPage = {t0: number; t1: number; items: InkItem[]};
export type InkDef = {
  quad: number[]; // 最初のコマでの四隅（割合）：左上 x,y・右上 x,y・右下 x,y・左下 x,y
  track?: string; // track.json の平面追跡のキー（"<ID>@<名前>"）。省略時はカメラ全体の追跡
  aspect?: number; // 箱の縦横比（幅/高さ）
  blend?: 'multiply' | 'screen' | 'normal';
  items?: InkItem[];
  pages?: InkPage[]; // 時間で入れ替わる文字（めくった先のページ）
  fade?: number; // ページの入れ替えの長さ（秒）
  stamp?: {t: number; x: number; y: number; size: number; text: string; color?: string; rot?: number; sub?: string};
  patch?: {color: string; feather?: number; opacity?: number; inset?: number}; // 下の模様を隠す紙の色
  glare?: {opacity: number; angle?: number}; // ガラスの映り込み（額の写真の顔をやわらげる）
  t0?: number;
  t1?: number;
  blur?: number; // にじみ（px）
};

const BOX_W = 1000;

const FONT: Record<InkFont, {family: string; weight: number; color: string; opacity: number}> = {
  maru: {family: "'Hachi Maru Pop'", weight: 400, color: '#3d3a46', opacity: 0.82}, // 子どもの丸い字（あの子）
  pencil: {family: "'Yomogi'", weight: 400, color: '#3b3b42', opacity: 0.8}, // 鉛筆の子どもの字（少年）
  pen: {family: "'Klee One'", weight: 400, color: '#1e2a48', opacity: 0.84}, // ペン字（大人のあの子）
  robot: {family: "'Zen Maru Gothic'", weight: 700, color: '#30363f', opacity: 0.8}, // ロボットの四角くていねいな字
  mincho: {family: "'Zen Old Mincho'", weight: 700, color: '#2a1e16', opacity: 0.86}, // 墨（額の札）
  print: {family: "'Zen Maru Gothic'", weight: 700, color: '#4a3d86', opacity: 0.85}, // 印刷（カード）
  chalk: {family: "'Klee One'", weight: 400, color: '#f3f0e6', opacity: 0.86}, // 黒板のチョーク
  scratch: {family: "'Yomogi'", weight: 400, color: '#e6dccb', opacity: 0.72}, // 柱に刻んだ字
};

const InkText: React.FC<{it: InkItem; t: number; boxH: number}> = ({it, t, boxH}) => {
  const f = FONT[it.font ?? 'pen'];
  const vis = it.t0 === undefined && it.t1 === undefined ? 1 : fadeWindow(t, it.t0 ?? -99, it.t1 ?? 999, 0.5, 0.5);
  if (vis <= 0) return null;
  const fs = it.size * boxH;
  const chars = Array.from(it.text);
  const sh = it.shaky ?? 0;
  const seed = it.seed ?? it.text.length * 3.1 + it.x * 17 + it.y * 29;
  const tx = it.align === 'center' ? '-50%' : it.align === 'right' ? '-100%' : '0';
  return (
    <div
      style={{
        position: 'absolute',
        left: it.x * BOX_W,
        top: it.y * boxH,
        transform: `translateX(${tx}) rotate(${it.rot ?? 0}deg)`,
        transformOrigin: '0 0',
        whiteSpace: 'nowrap',
        writingMode: it.vertical ? 'vertical-rl' : undefined,
        fontFamily: f.family,
        fontWeight: f.weight,
        fontSize: fs,
        lineHeight: 1,
        letterSpacing: `${it.spacing ?? 0.04}em`,
        color: it.color ?? f.color,
        opacity: (it.opacity ?? f.opacity) * vis,
      }}
    >
      {chars.map((ch, i) => {
        const k = it.write ? clamp((t - (it.t0 ?? 0) - i * it.write) / 0.14) : 1;
        const r = (hash(seed + i * 7.13) - 0.5) * 2;
        const r2 = (hash(seed + i * 3.71 + 1.3) - 0.5) * 2;
        const r3 = (hash(seed + i * 5.29 + 2.7) - 0.5) * 2;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: k,
              transform: sh ? `translate(${r2 * 0.05 * sh}em, ${r3 * 0.09 * sh}em) rotate(${r * 9 * sh}deg) scale(${1 + r3 * 0.08 * sh})` : undefined,
            }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        );
      })}
    </div>
  );
};

export const InkPlane: React.FC<{def: InkDef; t: number; corners: number[]}> = ({def, t, corners}) => {
  const vis = fadeWindow(t, def.t0 ?? -99, def.t1 ?? 999, 0.6, 0.6);
  if (vis <= 0) return null;
  const aspect = def.aspect ?? 1.6;
  const boxH = BOX_W / aspect;
  const m = boxToQuad(BOX_W, boxH, corners);
  const fade = def.fade ?? 0.8;
  const st = def.stamp;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: BOX_W,
        height: boxH,
        transformOrigin: '0 0',
        transform: cssMatrix(m),
        mixBlendMode: def.blend ?? 'multiply',
        opacity: vis,
        filter: def.blur ? `blur(${def.blur}px)` : undefined,
        pointerEvents: 'none',
      }}
    >
      {def.patch ? (
        <div
          style={{
            position: 'absolute',
            inset: def.patch.inset ?? 0,
            background: def.patch.color,
            opacity: def.patch.opacity ?? 1,
            filter: `blur(${def.patch.feather ?? 6}px)`,
          }}
        />
      ) : null}
      {(def.items ?? []).map((it, i) => (
        <InkText key={`i${i}`} it={it} t={t} boxH={boxH} />
      ))}
      {(def.pages ?? []).map((p, j) => {
        const a = fadeWindow(t, p.t0, p.t1, fade, fade);
        if (a <= 0) return null;
        return (
          <div key={`p${j}`} style={{position: 'absolute', inset: 0, opacity: a}}>
            {p.items.map((it, i) => (
              <InkText key={i} it={it} t={t} boxH={boxH} />
            ))}
          </div>
        );
      })}
      {st && t >= st.t
        ? (() => {
            // はんこ：押した瞬間に少し大きく → 縮んで紙に定着。インクは少しかすれる
            const k = easeOut(clamp((t - st.t) / 0.16));
            const d = st.size * boxH;
            const col = st.color ?? '#c62f2a';
            return (
              <div
                style={{
                  position: 'absolute',
                  left: st.x * BOX_W - d / 2,
                  top: st.y * boxH - d / 2,
                  width: d,
                  height: d,
                  borderRadius: '50%',
                  border: `${Math.max(2, d * 0.07)}px solid ${col}`,
                  color: col,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Zen Old Mincho', serif",
                  fontWeight: 700,
                  fontSize: d * 0.36,
                  lineHeight: 1.05,
                  transform: `rotate(${st.rot ?? -8}deg) scale(${1.35 - 0.35 * k})`,
                  opacity: 0.88 * k,
                  WebkitMaskImage: 'radial-gradient(circle at 38% 42%, #000 55%, rgba(0,0,0,0.72) 80%)',
                }}
              >
                <span>{st.text}</span>
                {st.sub ? <span style={{fontSize: d * 0.2, marginTop: d * 0.03}}>{st.sub}</span> : null}
              </div>
            );
          })()
        : null}
      {def.glare ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            mixBlendMode: 'screen',
            opacity: def.glare.opacity,
            background: `linear-gradient(${def.glare.angle ?? 118}deg, rgba(255,236,205,0) 18%, rgba(255,236,205,0.9) 40%, rgba(255,230,200,0.55) 52%, rgba(255,236,205,0) 70%)`,
          }}
        />
      ) : null}
    </div>
  );
};
