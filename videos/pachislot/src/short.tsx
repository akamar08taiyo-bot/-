// 縦型（9:16）のショート。番外編の創作実戦ログを、台本（script.json）・カット表（shots.json）・時刻（timeline.json）だけで組む。
// 画面の文字は script.json の screen に書く（title / captions / cards / labels / notices / end）。時刻はすべてアンカー（drama.tsx と同じ）。
import React from 'react';
import {AbsoluteFill, Easing, Img, staticFile, useCurrentFrame} from 'remotion';
import {F, useFonts} from './fonts';
import {DramaTimeline, SubEvent, clamp01, life, makeAnchors, ramp, subtitleEvents} from './drama';

export const SW = 1080;
export const SH = 1920;

type Row = {text: string; size?: number; color?: string; gap?: number; weight?: number};
type ShotJson = {id: string; at?: string; img?: string; cam?: number[]; blur?: number; steam?: number[][]; glow?: number; sweep?: boolean};
export type ShortData = {
  id: string;
  script: {
    fps: number;
    lines: {id: string; text: string; sub?: string; style: string; phone?: boolean; who?: string}[];
    inner_styles?: string[];
    screen?: {
      title?: {from: string; to: string; text: string; sub?: string; series?: string; note?: string};
      captions?: {from: string; to: string; text: string; sub?: string}[];
      cards?: {from: string; to: string; tone: 'official' | 'own' | 'ledger' | 'mixed' | 'media'; title?: string; rows: Row[]; note?: string; y?: number}[];
      labels?: {from: string; to: string; rows: Row[]; y?: number}[];
      notices?: {from: string; to: string; app: string; sender: string; lines: string[]; time?: string}[];
      hide_subs?: [string, string][];
      end?: {from: string; text: string; sub?: string};
      badge?: string;
    };
  };
  timeline: DramaTimeline;
  shots: {aspect?: string; imgfx?: Record<string, {steam?: number[][]; glow?: number}>; shots: ShotJson[]};
};

const smooth = Easing.inOut(Easing.sin);

/** 絵の置き方（縦型）。cam: [x, y, 拡大率の始め, 終わり]（x, y は絵の上の注目点 0〜1） */
const place = (cam: number[], p: number, iw: number, ih: number) => {
  const c = cam.length === 6 ? cam : [cam[0], cam[1], cam[2], cam[0], cam[1], cam[3]];
  const fx = c[0] + (c[3] - c[0]) * p;
  const fy = c[1] + (c[4] - c[1]) * p;
  const z = c[2] + (c[5] - c[2]) * p;
  const k = Math.max(SW / iw, SH / ih) * z;
  const w = iw * k;
  const h = ih * k;
  const left = Math.min(0, Math.max(SW - w, SW / 2 - fx * w));
  const top = Math.min(0, Math.max(SH - h, SH / 2 - fy * h));
  return {left, top, w, h};
};

const Steam: React.FC<{x: number; y: number; size: number; frame: number}> = ({x, y, size, frame}) => (
  <>
    {[0, 1, 2, 3, 4].map((i) => {
      const period = 70 + i * 9;
      const t = ((frame + i * 23) % period) / period;
      const op = Math.sin(Math.PI * t) * 0.22;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: x + Math.sin((frame + i * 40) / 17) * 18 * size + (i - 2) * 14 * size - 40 * size,
            top: y - t * 220 * size - 60 * size,
            width: 80 * size,
            height: 140 * size,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.25) 35%, rgba(255,255,255,0) 70%)',
            opacity: op,
          }}
        />
      );
    })}
  </>
);

const Shot: React.FC<{ep: string; s: ShotJson & {from: number; to: number; iw: number; ih: number; fx: {steam?: number[][]; glow?: number}}}> = ({ep, s}) => {
  const frame = useCurrentFrame();
  if (frame < s.from || frame >= s.to) return null;
  const p = smooth(clamp01((frame - s.from) / Math.max(1, s.to - s.from)));
  const pl = place(s.cam ?? [0.5, 0.45, 1.0, 1.05], p, s.iw, s.ih);
  const scale = pl.w / SW;
  const img = s.img ?? s.id;
  return (
    <AbsoluteFill>
      <Img src={staticFile(`${ep}/img/${img}${s.blur ? `_b${s.blur}` : ''}.jpg`)} style={{position: 'absolute', left: pl.left, top: pl.top, width: pl.w, height: pl.h}} />
      {!s.blur &&
        (s.steam ?? s.fx.steam)?.map(([x, y, size], i) => <Steam key={i} x={pl.left + x * pl.w} y={pl.top + y * pl.h} size={size * scale} frame={frame} />)}
      {(s.glow ?? s.fx.glow) ? (
        <AbsoluteFill
          style={{
            mixBlendMode: 'soft-light',
            opacity: (s.glow ?? s.fx.glow ?? 0) * (0.55 + 0.45 * Math.sin(frame / 5.3) * Math.sin(frame / 2.1 + 1)),
            background: `radial-gradient(ellipse at ${30 + 20 * Math.sin(frame / 9)}% 40%, hsla(${(frame * 7) % 360}, 90%, 60%, 0.9) 0%, rgba(0,0,0,0) 60%)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const Subs: React.FC<{events: SubEvent[]; hide: [number, number][]}> = ({events, hide}) => {
  const frame = useCurrentFrame();
  const e = events.find((x) => frame >= x.from && frame < x.to);
  if (!e || hide.some(([a, b]) => frame >= a && frame < b)) return null;
  const color = e.kind === 'inner' ? '#FFF3D6' : e.kind === 'phone' ? '#DDF1FF' : '#FFFFFF';
  return (
    <div style={{position: 'absolute', left: 48, right: 48, bottom: 330, textAlign: 'center', opacity: life(frame, e.from, e.to, 3, 3)}}>
      <span
        style={{
          display: 'inline-block',
          fontFamily: F.maru,
          fontWeight: 700,
          fontSize: 54,
          lineHeight: 1.4,
          color,
          WebkitTextStroke: '8px rgba(10,10,14,0.92)',
          paintOrder: 'stroke fill',
          textShadow: '0 2px 10px rgba(0,0,0,0.55)',
        }}
      >
        {e.kind === 'phone' ? (
          <span style={{display: 'inline-block', fontSize: 28, padding: '2px 12px', marginRight: 12, borderRadius: 8, background: 'rgba(120,180,230,0.9)', color: '#0d1b2a', WebkitTextStroke: '0px', verticalAlign: 8}}>
            電話
          </span>
        ) : null}
        {e.kind === 'inner' ? `（${e.text}）` : e.text}
      </span>
    </div>
  );
};

const TitleBand: React.FC<{from: number; to: number; text: string; sub?: string; series?: string; note?: string}> = ({from, to, text, sub, series, note}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 10, 14);
  const lift = 20 * (1 - ramp(frame, from, from + 16, Easing.out(Easing.cubic)));
  return (
    <AbsoluteFill style={{opacity: op}}>
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)'}} />
      <div style={{position: 'absolute', left: 60, right: 60, top: 150 + lift, color: '#fff', textShadow: '0 3px 18px rgba(0,0,0,0.8)'}}>
        {series ? <div style={{fontFamily: F.mincho, fontSize: 34, letterSpacing: 6, opacity: 0.9}}>{series}</div> : null}
        <div style={{fontFamily: F.maru, fontWeight: 900, fontSize: 84, lineHeight: 1.2, marginTop: 18, letterSpacing: 2}}>{text}</div>
        {sub ? <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 40, marginTop: 16, opacity: 0.92}}>{sub}</div> : null}
      </div>
      {note ? (
        <div style={{position: 'absolute', left: 48, right: 48, bottom: 150, textAlign: 'center', fontFamily: F.maru, fontWeight: 700, fontSize: 28, color: 'rgba(255,255,255,0.92)', textShadow: '0 2px 8px rgba(0,0,0,0.9)'}}>
          {note}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Caption: React.FC<{from: number; to: number; text: string; sub?: string}> = ({from, to, text, sub}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  return (
    <div style={{position: 'absolute', left: 54, top: 200, opacity: life(frame, from, to, 10, 12), color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.8)', display: 'flex', gap: 16, alignItems: 'center'}}>
      <div style={{width: 6, height: 56, background: 'rgba(255,255,255,0.9)', borderRadius: 3}} />
      <div>
        <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 46, letterSpacing: 3}}>{text}</div>
        {sub ? <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 28, opacity: 0.88, letterSpacing: 2}}>{sub}</div> : null}
      </div>
    </div>
  );
};

/** カード。official（公表値・青）／media（媒体解析・橙。一次資料は未確認）／own（本人の観測・白）／ledger（創作実戦ログ・紙） */
const Card: React.FC<{from: number; to: number; tone: string; title?: string; rows: Row[]; note?: string; y?: number}> = ({from, to, tone, title, rows, note, y = 760}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const paper = tone === 'ledger';
  const edge = {official: '#4FA3FF', mixed: '#4FA3FF', media: '#F2A33A', own: '#F4F4F4'}[tone];
  const titleColor = paper ? '#7A5B2E' : tone === 'media' ? '#FFC98A' : tone === 'own' ? '#D9D9D9' : '#8CC4FF';
  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        width: SW - 120,
        top: y + 16 * (1 - ramp(frame, from, from + 14, Easing.out(Easing.cubic))),
        transform: 'translateY(-50%)',
        opacity: life(frame, from, to, 10, 10),
        padding: '34px 44px 30px',
        borderRadius: paper ? 8 : 24,
        border: edge ? `5px solid ${edge}` : '0px',
        background: paper ? 'linear-gradient(180deg, #F6EEDC 0%, #EFE3C8 100%)' : 'rgba(10,18,32,0.88)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        color: paper ? '#2B2620' : '#FFFFFF',
      }}
    >
      {title ? <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 30, letterSpacing: 3, color: titleColor, marginBottom: 14}}>{title}</div> : null}
      {rows.map((r, i) => (
        <div key={i} style={{fontFamily: F.maru, fontWeight: r.weight ?? 700, fontSize: r.size ?? 46, lineHeight: 1.35, marginTop: r.gap ?? (i ? 10 : 0), color: r.color, letterSpacing: 1, fontVariantNumeric: 'tabular-nums'}}>
          {r.text}
        </div>
      ))}
      {note ? <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 26, marginTop: 20, opacity: 0.8, lineHeight: 1.4}}>{note}</div> : null}
    </div>
  );
};

const Label: React.FC<{from: number; to: number; rows: Row[]; y?: number}> = ({from, to, rows, y = 340}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  return (
    <div style={{position: 'absolute', left: 60, top: y, opacity: life(frame, from, to, 10, 10), padding: '18px 30px', borderLeft: '7px solid #F2B84B', background: 'rgba(12,12,16,0.8)', color: '#fff', borderRadius: '0 14px 14px 0', maxWidth: SW - 160}}>
      {rows.map((r, i) => (
        <div key={i} style={{fontFamily: F.maru, fontWeight: r.weight ?? 700, fontSize: r.size ?? 38, marginTop: i ? 6 : 0, color: r.color, letterSpacing: 1, lineHeight: 1.35}}>
          {r.text}
        </div>
      ))}
    </div>
  );
};

const Notice: React.FC<{from: number; to: number; app: string; sender: string; lines: string[]; time?: string}> = ({from, to, app, sender, lines, time}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const inP = ramp(frame, from, from + 12, Easing.out(Easing.cubic));
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: 300 - 40 * (1 - inP), opacity: Math.min(inP, 1 - ramp(frame, to - 8, to)), padding: '26px 30px', borderRadius: 30, background: 'rgba(245,245,247,0.95)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)', color: '#1c1c1e', fontFamily: F.maru}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
        <div style={{width: 48, height: 48, borderRadius: 12, background: '#4CAF7A', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{width: 26, height: 18, borderRadius: 9, background: '#fff'}} />
        </div>
        <div style={{fontWeight: 700, fontSize: 28, color: '#6b6b70', flex: 1}}>{app}</div>
        {time ? <div style={{fontWeight: 700, fontSize: 28, color: '#6b6b70'}}>{time}</div> : null}
      </div>
      <div style={{fontWeight: 900, fontSize: 40, marginTop: 14}}>{sender}</div>
      {lines.map((l, i) => (
        <div key={i} style={{fontWeight: 700, fontSize: 36, marginTop: 8, lineHeight: 1.35}}>
          {l}
        </div>
      ))}
    </div>
  );
};

const End: React.FC<{from: number; text: string; sub?: string}> = ({from, text, sub}) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const op = ramp(frame, from, from + 24, Easing.linear);
  return (
    <AbsoluteFill style={{background: `rgba(4,5,8,${op * 0.92})`, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{textAlign: 'center', opacity: ramp(frame, from + 12, from + 36, Easing.linear), padding: '0 80px'}}>
        <div style={{fontFamily: F.mincho, fontSize: 56, letterSpacing: 8, color: '#EDE6D6', lineHeight: 1.4}}>{text}</div>
        {sub ? <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 32, color: 'rgba(237,230,214,0.85)', marginTop: 28, lineHeight: 1.5}}>{sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const Short: React.FC<{data: ShortData}> = ({data}) => {
  useFonts();
  const frame = useCurrentFrame();
  const {script, timeline, shots} = data;
  const A = makeAnchors(timeline);
  const f = A.f;
  const sc = script.screen ?? {};
  const [iw, ih] = shots.aspect === '9:16' ? [1536, 2752] : [2752, 1536];
  const placed = shots.shots
    .filter((s) => s.at)
    .map((s) => ({...s, from: f(s.at!)}))
    .sort((a, b) => a.from - b.from)
    .map((s, i, arr) => ({...s, to: i + 1 < arr.length ? arr[i + 1].from : A.total, iw, ih, fx: shots.imgfx?.[s.img ?? s.id] ?? {}}));
  const inner = new Set(script.inner_styles ?? ['w_inner']);
  const events = subtitleEvents(script.lines, timeline, (l) => inner.has(l.style), 16);
  const hide = (sc.hide_subs ?? []).map(([a, b]) => [f(a), f(b)] as [number, number]);
  const endAt = sc.end ? f(sc.end.from) : Infinity;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {placed.map((s) => (
        <Shot key={s.id} ep={data.id} s={s} />
      ))}
      {sc.captions?.map((c, i) => <Caption key={i} from={f(c.from)} to={f(c.to)} text={c.text} sub={c.sub} />)}
      {sc.cards?.map((c, i) => <Card key={i} from={f(c.from)} to={f(c.to)} tone={c.tone} title={c.title} rows={c.rows} note={c.note} y={c.y} />)}
      {sc.labels?.map((c, i) => <Label key={i} from={f(c.from)} to={f(c.to)} rows={c.rows} y={c.y} />)}
      {sc.notices?.map((c, i) => <Notice key={i} from={f(c.from)} to={f(c.to)} app={c.app} sender={c.sender} lines={c.lines} time={c.time} />)}
      <Subs events={events} hide={hide} />
      {sc.title ? <TitleBand from={f(sc.title.from)} to={f(sc.title.to)} text={sc.title.text} sub={sc.title.sub} series={sc.title.series} note={sc.title.note} /> : null}
      {sc.end ? <End from={endAt} text={sc.end.text} sub={sc.end.sub} /> : null}
      {sc.badge && frame < endAt ? (
        <div style={{position: 'absolute', left: 0, right: 0, bottom: 120, textAlign: 'center', fontFamily: F.maru, fontWeight: 700, fontSize: 24, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textShadow: '0 1px 4px rgba(0,0,0,0.8)'}}>
          {sc.badge}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
