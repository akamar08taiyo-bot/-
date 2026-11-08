// 高速TOP10 に足す「数字の画面」：印象の推移の折れ線、前の年との比べ、ほかの設問の答えの棒、地図の印。
// どれも調査の数字そのまま。グラフの目盛りは 0〜100% で、差を大きく見せるために縦軸を切らない。
import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {C, Outlined} from './parts';
import {W, clamp01, life, pop, ramp} from './lib';

// ───────── 型 ─────────
export type FTrend = {
  beats: number;
  title: string; // 大きな見出し。| で改行
  years: number[]; // 横軸（例 2005〜2024）
  main: {label: string; values: number[]}; // この動画の主役の線（赤）
  other?: {label: string; values: number[]}; // 比べる線（白い点線）
  marks: {year: number; text: string; place?: 'up' | 'down'; anchor?: number}[]; // 主役の線の上に札を付ける年（anchor：札の幅のうち点より左に出す割合。既定は真ん中、端は自動）
  caption?: string; // グラフの下のひと言（数字は調査のまま）。| で改行
  source: string; // この画面のあいだ、上の出典の行をこれに替える
  img?: string; // 背景（無ければ冒頭の絵をぼかして使う）
};
export type FListRow = {text: string; value: number; decimals?: number};
export type FList = {
  beats: number;
  head: string; // 大きな見出し。| で改行
  label: string; // カードの札（だれの答えか）
  rows: FListRow[];
  unit?: string; // 既定 %
  sub?: string; // カードの下の注（数字は調査のまま）。| で改行
  source?: string; // この画面のあいだの出典の行
};
export type FPrev = {year: number; value: number}; // 前の年の同じ選択肢の数字
export type FFact = {label: string; text: string}; // 背景の事実（札＋| で改行）
export type FPin = {x: number; y: number; label: string; sub?: string}; // 地図の上の印（絵の上の位置 0〜1）

const fit = (lines: string[], width: number, max: number) => Math.min(max, Math.floor(width / Math.max(...lines.map((l) => [...l].length), 1)));
const BLUE = '#2F6FD6';
const GREY = '#8a7f78';
const LINE_RED = '#FF5A5F';

// ───────── 印象の推移（折れ線）。線は左から右へ引かれ、札は線が届いたときに出る ─────────
export const TrendChart: React.FC<{t: FTrend; from: number; to: number; b: (n: number) => number}> = ({t, from, to, b}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const CARD = {x: 40, y: 590, w: 1000, h: 720};
  const P = {l: 104, r: 56, t: 150, b: 74};
  const pw = CARD.w - P.l - P.r;
  const ph = CARD.h - P.t - P.b;
  const n = t.years.length;
  const X = (i: number) => P.l + (i / (n - 1)) * pw;
  const Y = (v: number) => P.t + (1 - v / 100) * ph;
  const dp = ramp(frame, b(0.5), b(4), Easing.inOut(Easing.quad));
  const clipW = P.l + dp * pw + 2;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  // 線の先の点（いま引いているところ）
  const fi = dp * (n - 1);
  const i0 = Math.min(n - 2, Math.floor(fi));
  const headV = t.main.values[i0] + (t.main.values[i0 + 1] - t.main.values[i0]) * (fi - i0);
  const titleLines = t.title.split('|');
  const ts = fit(titleLines, 960, 86);
  const tp = pop(frame, from, 12, 220);
  const cardIn = ramp(frame, from, from + 8);
  const capAt = b(5);
  const cp = pop(frame, capAt, 12, 220);
  const capLines = (t.caption ?? '').split('|');
  const tickYears = t.years.filter((y, i) => i === 0 || i === n - 1 || y % 5 === 0);
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(6,12,26,0.5)'}} />
      <div style={{position: 'absolute', left: 0, top: 360, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${0.7 + 0.3 * tp})`, opacity: clamp01(tp * 2)}}>
        {titleLines.map((l, i) => (
          <div key={i} style={{marginTop: i ? -8 : 0}}>
            <Outlined size={ts} color={i === titleLines.length - 1 ? '#F0A91B' : '#fff'} stroke={Math.round(ts * 0.17)} strokeColor="#141020" font={F.dela} weight={400} shadow="drop-shadow(0 6px 0 rgba(0,0,0,0.35))">
              {l}
            </Outlined>
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: CARD.x,
          top: CARD.y,
          width: CARD.w,
          height: CARD.h,
          background: 'rgba(12,18,34,0.86)',
          borderRadius: 30,
          border: '3px solid rgba(255,255,255,0.16)',
          boxShadow: '0 16px 36px rgba(0,0,0,0.35)',
          opacity: cardIn,
          transform: `translateY(${(1 - cardIn) * 30}px)`,
        }}
      >
        {/* 凡例 */}
        <div style={{position: 'absolute', left: 36, top: 26, display: 'flex', gap: 36, alignItems: 'center', fontFamily: F.maru, fontWeight: 900, fontSize: 28, color: '#fff', whiteSpace: 'nowrap'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
            <div style={{width: 54, height: 9, borderRadius: 9, background: LINE_RED}} />
            {t.main.label}
          </div>
          {t.other && (
            <div style={{display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.75)'}}>
              <div style={{width: 54, height: 0, borderTop: '6px dashed rgba(255,255,255,0.6)'}} />
              {t.other.label}
            </div>
          )}
        </div>
        {/* 目盛り */}
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <React.Fragment key={v}>
            <div style={{position: 'absolute', left: P.l, top: Y(v), width: pw, height: 0, borderTop: `2px solid rgba(255,255,255,${v === 0 ? 0.35 : 0.12})`}} />
            <div style={{position: 'absolute', left: 0, width: P.l - 16, top: Y(v) - 17, textAlign: 'right', fontFamily: F.maru, fontWeight: 700, fontSize: 24, color: 'rgba(255,255,255,0.65)'}}>{v}%</div>
          </React.Fragment>
        ))}
        {tickYears.map((y) => {
          const i = t.years.indexOf(y);
          return (
            <div key={y} style={{position: 'absolute', left: X(i) - 60, width: 120, top: P.t + ph + 16, textAlign: 'center', fontFamily: F.maru, fontWeight: 900, fontSize: 27, color: 'rgba(255,255,255,0.8)'}}>
              {y}
            </div>
          );
        })}
        <svg width={CARD.w} height={CARD.h} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
          <defs>
            <clipPath id="trendClip">
              <rect x={0} y={0} width={clipW} height={CARD.h} />
            </clipPath>
          </defs>
          <g clipPath="url(#trendClip)">
            {t.other && <path d={path(t.other.values)} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={6} strokeDasharray="14 11" strokeLinejoin="round" strokeLinecap="round" />}
            <path d={path(t.main.values)} fill="none" stroke="rgba(255,90,95,0.28)" strokeWidth={26} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path(t.main.values)} fill="none" stroke={LINE_RED} strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" />
          </g>
          {dp > 0 && dp < 1 && <circle cx={X(fi)} cy={Y(headV)} r={13} fill="#fff" stroke={LINE_RED} strokeWidth={6} />}
          {t.marks.map((m) => {
            const i = t.years.indexOf(m.year);
            const at = b(0.5) + Math.round(((i / (n - 1)) * (b(4) - b(0.5))) * 0.98);
            if (frame < at) return null;
            const p = pop(frame, at, 10, 240);
            return <circle key={m.year} cx={X(i)} cy={Y(t.main.values[i])} r={15 * Math.min(1.3, p)} fill="#fff" stroke={LINE_RED} strokeWidth={7} />;
          })}
        </svg>
        {/* 札（年と数字） */}
        {t.marks.map((m) => {
          const i = t.years.indexOf(m.year);
          const at = b(0.5) + Math.round(((i / (n - 1)) * (b(4) - b(0.5))) * 0.98);
          if (frame < at) return null;
          const p = pop(frame, at + 2, 11, 230);
          const x = X(i);
          const y = Y(t.main.values[i]);
          const up = (m.place ?? 'up') === 'up';
          const anchor = m.anchor ?? (x > CARD.w - 190 ? 0.88 : x < 190 ? 0.12 : 0.5);
          const tx = `${-anchor * 100}%`;
          return (
            <div
              key={m.year}
              style={{
                position: 'absolute',
                left: x,
                top: up ? y - 24 : y + 24,
                transform: `translate(${tx}, ${up ? '-100%' : '0'}) scale(${0.5 + 0.5 * p})`,
                transformOrigin: `${anchor * 100}% ${up ? '100%' : '0%'}`,
                opacity: clamp01(p * 2),
                background: '#fff',
                borderRadius: 16,
                padding: '6px 16px 8px',
                textAlign: 'center',
                boxShadow: '0 6px 0 rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{fontFamily: F.dela, fontSize: 32, color: C.red, lineHeight: 1.15}}>
                {m.year}年 {t.main.values[i].toFixed(1)}%
              </div>
              <div style={{fontFamily: F.maru, fontWeight: 900, fontSize: 24, color: C.navy, lineHeight: 1.2}}>{m.text}</div>
            </div>
          );
        })}
      </div>
      {t.caption && frame >= capAt && (
        <div style={{position: 'absolute', left: 0, top: CARD.y + CARD.h + 34, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(cp * 2)}}>
          <div style={{transform: `scale(${0.6 + 0.4 * cp})`, background: '#fff', borderRadius: 22, padding: '14px 34px 18px', maxWidth: 980, textAlign: 'center', boxShadow: '0 8px 0 rgba(0,0,0,0.3)'}}>
            {capLines.map((l, i) => (
              <div key={i} style={{fontFamily: F.maru, fontWeight: 900, fontSize: fit(capLines, 900, 46), lineHeight: 1.32, color: C.ink, whiteSpace: 'pre'}}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ───────── 前の年との比べ（16.6% → 11.8%、4.8ポイント減） ─────────
export const compareText = (prev: number, cur: number) => {
  const d = Math.round((cur - prev) * 10) / 10;
  const a = Math.abs(d).toFixed(1);
  if (Math.abs(d) < 0.5) return {text: `ほぼ同じ（${a}ポイント${d > 0 ? '増' : d < 0 ? '減' : ''}）`, color: GREY};
  return d > 0 ? {text: `${a}ポイント増`, color: C.red} : {text: `${a}ポイント減`, color: BLUE};
};
export const COMPARE_H = 262; // カードの高さのめやす（並べるときの間隔に使う）

export const CompareCard: React.FC<{prev: FPrev; curYear: number; cur: number; unit: string; decimals: number; top: number; from: number; to: number; pillAt: number}> = ({
  prev,
  curYear,
  cur,
  unit,
  decimals,
  top,
  from,
  to,
  pillAt,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 220);
  const pp = pop(frame, pillAt, 10, 240);
  const ch = compareText(prev.value, cur);
  const num = (v: number) => v.toFixed(decimals);
  return (
    <div style={{position: 'absolute', left: 0, top, width: W, display: 'flex', justifyContent: 'center', opacity: life(frame, from, to, 2, 2)}}>
      <div
        style={{
          position: 'relative',
          transform: `scale(${0.6 + 0.4 * p})`,
          transformOrigin: '50% 0%',
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 28,
          padding: '34px 54px 24px',
          minWidth: 700,
          boxShadow: '0 10px 0 rgba(30,40,80,0.22), 0 18px 30px rgba(20,20,40,0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{position: 'absolute', top: -24, left: 30, background: C.navy, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 30, padding: '3px 20px 5px', borderRadius: 999, whiteSpace: 'nowrap'}}>
          前の年（{prev.year}年）と比べると
        </div>
        <div style={{display: 'flex', alignItems: 'flex-end', gap: 30}}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <div style={{fontFamily: F.maru, fontWeight: 900, fontSize: 30, color: GREY}}>{prev.year}年</div>
            <div style={{fontFamily: F.dela, fontSize: 66, color: GREY, lineHeight: 1.1}}>
              {num(prev.value)}
              <span style={{fontSize: 36}}>{unit}</span>
            </div>
          </div>
          <div style={{fontFamily: F.dela, fontSize: 60, color: '#c9c0ba', paddingBottom: 14}}>→</div>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            <div style={{fontFamily: F.maru, fontWeight: 900, fontSize: 30, color: C.navy}}>{curYear}年</div>
            <div style={{fontFamily: F.dela, fontSize: 84, color: C.navy, lineHeight: 1.05}}>
              {num(cur)}
              <span style={{fontSize: 44}}>{unit}</span>
            </div>
          </div>
        </div>
        <div style={{marginTop: 10, height: 62, display: 'flex', alignItems: 'center'}}>
          {frame >= pillAt && (
            <div
              style={{
                transform: `scale(${0.4 + 0.6 * pp}) rotate(${(1 - pp) * -6}deg)`,
                opacity: clamp01(pp * 2),
                background: ch.color,
                color: '#fff',
                fontFamily: F.maru,
                fontWeight: 900,
                fontSize: 38,
                padding: '6px 30px 9px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
                boxShadow: '0 5px 0 rgba(0,0,0,0.18)',
              }}
            >
              {ch.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ───────── ほかの設問の答え（横の棒。0〜100%） ─────────
export const ListCard: React.FC<{x: FList; from: number; to: number; b: (n: number) => number}> = ({x, from, to, b}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const headLines = x.head.split('|');
  const hs = fit(headLines, 960, 84);
  const hp = pop(frame, from, 12, 220);
  const cp = pop(frame, b(0.5), 12, 220);
  const unit = x.unit ?? '%';
  const TRACK = 560;
  const subLines = (x.sub ?? '').split('|');
  const subAt = b(1 + x.rows.length * 1.2 + 0.5);
  const sp = pop(frame, subAt, 12, 220);
  const CARD_TOP = 640;
  const rowH = (r: FListRow) => {
    const l = r.text.split('|');
    return l.length * fit(l, 860, 46) * 1.25 + 64;
  };
  const cardH = 76 + x.rows.reduce((v, r) => v + rowH(r), 0) + 26 * (x.rows.length - 1);
  return (
    <>
      <AbsoluteFill style={{background: 'rgba(6,12,26,0.45)'}} />
      <div style={{position: 'absolute', left: 0, top: 380, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${0.7 + 0.3 * hp})`, opacity: clamp01(hp * 2)}}>
        {headLines.map((l, i) => (
          <div key={i} style={{marginTop: i ? -8 : 0}}>
            <Outlined size={hs} color={i === headLines.length - 1 ? '#F0A91B' : '#fff'} stroke={Math.round(hs * 0.17)} strokeColor="#141020" font={F.dela} weight={400} shadow="drop-shadow(0 6px 0 rgba(0,0,0,0.35))">
              {l}
            </Outlined>
          </div>
        ))}
      </div>
      {frame >= b(0.5) && (
        <div style={{position: 'absolute', left: 0, top: CARD_TOP, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(cp * 2)}}>
          <div
            style={{
              position: 'relative',
              transform: `scale(${0.7 + 0.3 * cp})`,
              transformOrigin: '50% 0%',
              background: 'rgba(255,255,255,0.97)',
              borderRadius: 30,
              padding: '46px 44px 30px',
              width: 960,
              boxSizing: 'border-box',
              boxShadow: '0 10px 0 rgba(30,40,80,0.22), 0 18px 30px rgba(20,20,40,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 26,
            }}
          >
            <div style={{position: 'absolute', top: -26, left: 30, maxWidth: 900, background: C.coral, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: Math.min(32, Math.floor(880 / [...x.label].length)), padding: '3px 20px 5px', borderRadius: 999, whiteSpace: 'nowrap'}}>
              {x.label}
            </div>
            {x.rows.map((r, i) => {
              const at = b(1 + i * 1.2);
              const rp = ramp(frame, at, at + 14, Easing.out(Easing.cubic));
              const lines = r.text.split('|');
              const fs = fit(lines, 860, 46);
              return (
                <div key={i} style={{opacity: clamp01(rp * 3)}}>
                  {lines.map((l, k) => (
                    <div key={k} style={{fontFamily: F.maru, fontWeight: 900, fontSize: fs, lineHeight: 1.25, color: C.navy, whiteSpace: 'pre'}}>
                      {l}
                    </div>
                  ))}
                  <div style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 6}}>
                    <div style={{width: TRACK, height: 30, borderRadius: 15, background: '#efe7e1', overflow: 'hidden'}}>
                      <div style={{width: (TRACK * r.value * rp) / 100, height: 30, borderRadius: 15, background: `linear-gradient(90deg, ${C.coral}, #F0A91B)`}} />
                    </div>
                    <div style={{fontFamily: F.dela, fontSize: 58, color: C.red, lineHeight: 1, whiteSpace: 'nowrap'}}>
                      {(r.value * rp).toFixed(r.decimals ?? 1)}
                      <span style={{fontSize: 32}}>{unit}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {x.sub && frame >= subAt && (
        <div style={{position: 'absolute', left: 0, top: CARD_TOP + cardH + 60, width: W, display: 'flex', justifyContent: 'center', opacity: clamp01(sp * 2)}}>
          <div style={{transform: `scale(${0.6 + 0.4 * sp})`, background: 'rgba(34,32,31,0.85)', borderRadius: 18, padding: '10px 30px 14px', maxWidth: 980, textAlign: 'center'}}>
            {subLines.map((l, i) => (
              <div key={i} style={{fontFamily: F.maru, fontWeight: 900, fontSize: fit(subLines, 920, 40), lineHeight: 1.35, color: '#fff', whiteSpace: 'pre'}}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ───────── 地図の印（脈打つ輪と、名前の札）。SceneView の overlay から呼ぶ ─────────
export const MapPin: React.FC<{x: number; y: number; frame: number; at: number; label: string; sub?: string}> = ({x, y, frame, at, label, sub}) => {
  if (frame < at) return null;
  const p = pop(frame, at, 10, 220);
  const t = (frame - at) / 30;
  const ring = (k: number) => {
    const ph = (t * 0.8 + k * 0.5) % 1;
    return <div key={k} style={{position: 'absolute', left: x - 30 - ph * 60, top: y - 30 - ph * 60, width: 60 + ph * 120, height: 60 + ph * 120, borderRadius: '50%', border: `6px solid rgba(255,214,90,${0.9 * (1 - ph)})`}} />;
  };
  return (
    <>
      {[0, 1].map(ring)}
      <div style={{position: 'absolute', left: x - 17, top: y - 17, width: 34, height: 34, borderRadius: '50%', background: '#FFD65A', border: '6px solid #fff', boxShadow: '0 0 18px rgba(255,214,90,0.9)', transform: `scale(${p})`}} />
      <div style={{position: 'absolute', left: x + 44, top: y, transform: `translateY(-50%) scale(${0.5 + 0.5 * p})`, transformOrigin: '0% 50%', opacity: clamp01(p * 2), display: 'flex', flexDirection: 'column', alignItems: 'flex-start', whiteSpace: 'nowrap'}}>
        <div style={{background: '#FFD65A', color: '#2a1c08', fontFamily: F.maru, fontWeight: 900, fontSize: 36, padding: '4px 22px 7px', borderRadius: 999, boxShadow: '0 5px 0 rgba(0,0,0,0.3)'}}>{label}</div>
        {sub && <div style={{marginTop: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: F.maru, fontWeight: 700, fontSize: 26, padding: '3px 16px 5px', borderRadius: 10}}>{sub}</div>}
      </div>
    </>
  );
};
