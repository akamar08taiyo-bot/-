// 家庭内別班（#2 以降）の共通の作り：script.json の区切りを上から順に並べ、区切りごとに絵・カメラ・テロップ・小道具を出す。
// 声も音もなし（曲は投稿のときに足す）。区切りの長さは拍（BPM60 なら 1拍 = 1秒）。絵は P = spy01、B = bekkan01、N = その回。
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {Header, Outlined} from './parts';
import {BigWords, CineSub, Dossier, Receipt, SPY, Stamp, VoicePhone} from './spy';
import {FPS, W, clamp01, life, pop, ramp} from './lib';
import {Box, Scene, SceneView, cam, center, faceOf} from './scene';

export type CamSpec = {on?: [string, string]; obj?: string; x?: number; y?: number; z?: number; tx?: number; ty?: number; at?: number};
export type BSeg = {
  id: string;
  beats: number;
  img: string;
  cam?: CamSpec;
  cam2?: CamSpec;
  filter?: string;
  drift?: number;
  shake?: number;
  cctv?: string; // 暗視カメラ風にして、左上にこの文字（例「冷蔵庫カメラ AM 2:13」）
  title?: string[];
  chip?: string;
  tab?: string;
  name?: string;
  cap?: string;
  cap2?: string;
  cap2At?: number;
  inner?: string;
  phone?: string;
  phoneAt?: number;
  phonePos?: [number, number]; // スマホの中心（既定は右の 790, 830）
  receipt?: {time: string; item: string; price: string};
  stamp?: string;
  stampAt?: number;
  stampPos?: [number, number]; // ハンコの中心（既定は 560, 800）
  say?: string;
  who?: string;
  sayAt?: number;
  big?: string[];
  ask?: string;
  timer?: {from: number; label: string; y?: number; until?: number}; // 残り時間（秒）を until 拍目（既定は区切りの終わり）までに 0 まで減らす
  chart?: {title: string; rows: [string, number][]};
  route?: {stops: string[]; last: string};
};
export type BScript = {id: string; bpm: number; header: {series: string; episode: string}; segments: BSeg[]};

// 話し手の札の色（「妻・玲子（心の声）」のような書き足しも頭の名前で決める）
const WHO_COLOR: [string, string][] = [['夫', SPY.steel], ['妻', SPY.red], ['義母', '#B8860B'], ['長男', SPY.teal]];
const whoColor = (who = '') => WHO_COLOR.find(([k]) => who.startsWith(k))?.[1] ?? SPY.steel;
const CAP_Y = 1300;

// ───────── 暗視カメラ（緑がかった画面に走査線、REC と時刻） ─────────
const Cctv: React.FC<{label: string; from: number; to: number}> = ({label, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const blink = Math.floor((frame - from) / 15) % 2 === 0;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 3px, rgba(0,0,0,0.22) 3px, rgba(0,0,0,0.22) 5px)'}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)'}} />
      <div style={{position: 'absolute', left: 50, top: 270, fontFamily: F.dela, fontSize: 40, color: '#C8FFC8', textShadow: '0 0 10px rgba(120,255,120,0.7)', display: 'flex', alignItems: 'center', gap: 14}}>
        <span style={{width: 24, height: 24, borderRadius: 12, background: '#ff3b3b', opacity: blink ? 1 : 0.2}} />
        REC
      </div>
      <div style={{position: 'absolute', left: 50, top: 330, fontFamily: F.maru, fontWeight: 900, fontSize: 38, color: '#C8FFC8', textShadow: '0 0 10px rgba(120,255,120,0.7)'}}>{label}</div>
    </AbsoluteFill>
  );
};

// ───────── 残り時間（大きな数字が区切りの間に 0:00 まで減る） ─────────
const Timer: React.FC<{fromSec: number; label: string; from: number; to: number; y?: number}> = ({fromSec, label, from, to, y = 760}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = ramp(frame, from + 6, to - 10, (t) => t);
  const left = Math.round(fromSec * (1 - p));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const pp = pop(frame, from, 12, 220);
  return (
    <div style={{position: 'absolute', left: W / 2, top: y, transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * pp})`, opacity: life(frame, from, to, 2, 3)}}>
      <div style={{background: 'rgba(10,10,14,0.9)', border: `4px solid ${SPY.red}`, borderRadius: 18, padding: '10px 40px 14px', textAlign: 'center', boxShadow: '0 0 30px rgba(215,38,61,0.45)'}}>
        <div style={{fontFamily: F.mincho, fontWeight: 700, fontSize: 40, color: '#fff', letterSpacing: 6}}>{label}</div>
        <div style={{fontFamily: F.dela, fontSize: 130, lineHeight: 1.05, color: '#FF3B4E', textShadow: '0 0 18px rgba(255,59,78,0.8)', fontVariantNumeric: 'tabular-nums'}}>
          {mm}:{ss}
        </div>
      </div>
    </div>
  );
};

// ───────── 棒グラフ（妻のデータで反撃） ─────────
const Chart: React.FC<{title: string; rows: [string, number][]; from: number; to: number}> = ({title, rows, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const max = Math.max(...rows.map((r) => r[1]));
  const pp = pop(frame, from, 13, 200);
  return (
    <div style={{position: 'absolute', left: 60, top: 500, width: 960, transform: `scale(${0.85 + 0.15 * pp})`, opacity: life(frame, from, to, 3, 3)}}>
      <div style={{background: 'rgba(12,14,20,0.92)', border: '3px solid rgba(255,255,255,0.18)', borderRadius: 26, padding: '34px 40px 18px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}}>
        <div style={{fontFamily: F.mincho, fontWeight: 700, fontSize: 60, color: '#fff', marginBottom: 30}}>{title}</div>
        {rows.map(([label, v], i) => {
          const at = from + 10 + i * 8;
          const g = ramp(frame, at, at + 14);
          return (
            <div key={label} style={{display: 'flex', alignItems: 'center', gap: 20, marginBottom: 26}}>
              <div style={{width: 270, fontFamily: F.maru, fontWeight: 900, fontSize: 46, color: '#fff', whiteSpace: 'nowrap'}}>{label}</div>
              <div style={{flex: 1, height: 60, background: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden'}}>
                <div style={{width: `${(v / max) * 100 * g}%`, height: '100%', background: SPY.red, borderRadius: 10}} />
              </div>
              <div style={{width: 200, textAlign: 'right', fontFamily: F.dela, fontSize: 48, color: '#FFE3A3', opacity: g, fontVariantNumeric: 'tabular-nums'}}>¥{v.toLocaleString('en-US')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ───────── 尾行ルート（店を素通りしていく）：丸を左右に振りながら下へ、店名は丸の右 ─────────
const Route: React.FC<{stops: string[]; last: string; from: number; to: number}> = ({stops, last, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const n = stops.length + 1;
  const pts = Array.from({length: n}, (_, i) => ({x: i % 2 === 0 ? 160 : 480, y: 600 + (i * 540) / Math.max(n - 1, 1)}));
  const step = (to - from - 20) / n;
  const pp = pop(frame, from, 13, 200);
  return (
    <div style={{position: 'absolute', inset: 0, opacity: life(frame, from, to, 3, 3)}}>
      <div style={{position: 'absolute', left: 60, top: 430, width: 960, height: 800, borderRadius: 26, background: 'rgba(14,24,30,0.9)', border: '3px solid rgba(160,220,210,0.25)', transform: `scale(${0.9 + 0.1 * pp})`}}>
        <div style={{position: 'absolute', left: 36, top: 26, fontFamily: F.mincho, fontWeight: 700, fontSize: 46, color: '#BFF3EE', letterSpacing: 4}}>尾行ルート</div>
      </div>
      <svg width={W} height={1920} style={{position: 'absolute', inset: 0}}>
        {pts.slice(1).map((p, i) => {
          const a = pts[i];
          const g = ramp(frame, from + 10 + i * step, from + 10 + i * step + step * 0.6);
          if (g <= 0) return null; // 長さ0の線は丸い端だけが点になって残る
          return <line key={i} x1={a.x} y1={a.y} x2={a.x + (p.x - a.x) * g} y2={a.y + (p.y - a.y) * g} stroke={SPY.teal} strokeWidth={10} strokeDasharray="22 16" strokeLinecap="round" />;
        })}
      </svg>
      {pts.map((p, i) => {
        const at = from + 10 + i * step;
        if (frame < at) return null;
        const sp = pop(frame, at, 12, 220);
        const isLast = i === n - 1;
        return (
          <React.Fragment key={i}>
            <div style={{position: 'absolute', left: p.x - 40, top: p.y - 40, width: 80, height: 80, borderRadius: 40, background: isLast ? SPY.gold : '#fff', color: '#121419', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.dela, fontSize: 42, transform: `scale(${0.5 + 0.5 * sp})`}}>
              {i + 1}
            </div>
            <div style={{position: 'absolute', left: p.x + 56, top: p.y, transform: `translateY(-50%) scale(${0.6 + 0.4 * sp})`, transformOrigin: 'left center', fontFamily: F.maru, fontWeight: 900, fontSize: 46, color: '#fff', whiteSpace: 'nowrap', background: isLast ? SPY.red : 'rgba(0,0,0,0.55)', padding: '4px 18px 8px', borderRadius: 12}}>
              {isLast ? last : stops[i]}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ───────── 冒頭の題字（最初から見えている。1コマ目がサムネ） ─────────
const HookTitle: React.FC<{title: string[]; chip?: string; to: number; stampAt?: [number, number]}> = ({title, chip, to, stampAt = [905, 800]}) => {
  const frame = useCurrentFrame();
  if (frame >= to) return null;
  const big = title[1] ?? '';
  const size = Math.min(136, Math.floor(980 / Math.max([...big].length, 1)));
  return (
    <>
      <div style={{position: 'absolute', left: 0, top: 930, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2}}>
        <Outlined size={88} color="#fff" stroke={18} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          {title[0]}
        </Outlined>
        <Outlined size={size} color="#fff" stroke={Math.round(size * 0.18)} strokeColor={SPY.red} font={F.dela} weight={400} shadow="drop-shadow(0 10px 16px rgba(0,0,0,0.55))">
          {big}
        </Outlined>
        {chip && (
          <div style={{marginTop: 18, background: '#121419', color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 42, padding: '10px 32px 14px', borderRadius: 999, border: `3px solid ${SPY.red}`}}>{chip}</div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          left: stampAt[0],
          top: stampAt[1],
          transform: 'translate(-50%, -50%) rotate(14deg)',
          border: `8px solid ${SPY.red}`,
          borderRadius: 14,
          color: SPY.red,
          background: 'rgba(255,255,255,0.9)',
          fontFamily: F.dela,
          fontSize: 64,
          padding: '0 18px 6px',
          boxShadow: '0 8px 18px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}
      >
        極秘
      </div>
    </>
  );
};

// 締め：問いかけとコメントへの誘い
const Ask: React.FC<{text: string; from: number; to: number}> = ({text, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 220);
  const cta = pop(frame, from + 15, 11, 210);
  const size = Math.min(76, Math.floor(980 / Math.max([...text].length, 1)));
  return (
    <div style={{position: 'absolute', left: 0, top: 1190, width: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20}}>
      <div style={{transform: `scale(${1.4 - 0.4 * p})`, opacity: clamp01(p * 3)}}>
        <Outlined size={size} color="#fff" stroke={16} strokeColor="#0d0f14" font={F.mincho} weight={700} shadow="drop-shadow(0 6px 14px rgba(0,0,0,0.6))">
          {text}
        </Outlined>
      </div>
      {frame >= from + 15 && (
        <div style={{transform: `scale(${0.6 + 0.4 * cta})`, background: SPY.red, color: '#fff', fontFamily: F.maru, fontWeight: 900, fontSize: 46, padding: '10px 36px 14px', borderRadius: 999, boxShadow: '0 6px 0 rgba(0,0,0,0.25)'}}>
          コメントで教えて ↓
        </div>
      )}
    </div>
  );
};

// 切り替わりで一瞬だけ暗くする
const Dip: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  if (frame < at || frame >= at + 6) return null;
  return <AbsoluteFill style={{background: '#000', opacity: 0.8 * (1 - ramp(frame, at, at + 6))}} />;
};

export const makeBekkan = (S: BScript, FC: Record<string, unknown>) => {
  const BEAT = (FPS * 60) / S.bpm;
  type Span = {seg: BSeg; from: number; to: number; b: (n: number) => number};
  const spans: Span[] = [];
  let cursor = 0;
  for (const seg of S.segments) {
    const from = cursor;
    cursor += Math.round(seg.beats * BEAT);
    spans.push({seg, from, to: cursor, b: (n) => from + Math.round(n * BEAT)});
  }
  const img = (id: string) => (id.startsWith('P') ? `spy01/img/${id}.jpg` : id.startsWith('B') ? `bekkan01/img/${id}.jpg` : `${S.id}/img/${id}.jpg`);
  const point = (seg: BSeg, c: CamSpec) => {
    if (c.on) return faceOf(FC, c.on[0], c.on[1]);
    if (c.obj) return center((FC[`${seg.img}_extra`] as Record<string, Box>)[c.obj]);
    return {x: c.x ?? 0.5, y: c.y ?? 0.45};
  };
  const camOf = (seg: BSeg, c: CamSpec) => {
    const p = point(seg, c);
    return cam(p.x, p.y, c.z ?? 1.3, c.tx ?? 540, c.ty ?? 700);
  };
  const scenes: Scene[] = spans.map(({seg, from, to, b}) => ({
    img: img(seg.img),
    from,
    to,
    keys: [{at: from, cam: camOf(seg, seg.cam ?? {})}, ...(seg.cam2 ? [{at: b(seg.cam2.at ?? 2), cam: camOf(seg, seg.cam2), dur: 10}] : [])],
    drift: seg.drift ?? 0.06,
    shake: seg.shake,
    punch: seg.id !== 'hook',
    filter: seg.cctv ? 'grayscale(0.7) sepia(0.7) hue-rotate(55deg) saturate(2.4) brightness(0.9) contrast(1.2)' : seg.filter,
  }));

  const Comp: React.FC = () => {
    return (
      <AbsoluteFill style={{backgroundColor: SPY.ink}}>
        {scenes.map((sc) => (
          <SceneView key={sc.img + sc.from} sc={sc} />
        ))}
        <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(8,10,16,0.55) 0%, rgba(8,10,16,0) 24%, rgba(8,10,16,0) 56%, rgba(8,10,16,0.6) 100%)'}} />
        {spans.map(({seg, from, to, b}) => {
          const sayFrom = seg.sayAt !== undefined ? b(seg.sayAt) : seg.cap ? b(2.2) : b(0.8);
          const capTo = seg.cap2 ? b(seg.cap2At ?? 2.3) : seg.say && seg.cap ? sayFrom : to;
          return (
            <React.Fragment key={seg.id}>
              {seg.cctv && <Cctv label={seg.cctv} from={from} to={to} />}
              {seg.timer && <Timer fromSec={seg.timer.from} label={seg.timer.label} from={from} to={seg.timer.until !== undefined ? b(seg.timer.until) : to} y={seg.timer.y} />}
              {seg.chart && <Chart title={seg.chart.title} rows={seg.chart.rows} from={from + 3} to={to} />}
              {seg.route && <Route stops={seg.route.stops} last={seg.route.last} from={from + 3} to={to} />}
              {seg.phone && <VoicePhone text={seg.phone} from={b(seg.phoneAt ?? 0.6)} to={to} cx={seg.phonePos?.[0] ?? 790} cy={seg.phonePos?.[1] ?? 830} scale={0.72} />}
              {seg.receipt && <Receipt x={310} y={1000} from={b(0.4)} to={to} time={seg.receipt.time} item={seg.receipt.item} price={seg.receipt.price} markAt={b(1.4)} />}
              {seg.stamp && <Stamp text={seg.stamp} x={seg.stampPos?.[0] ?? 560} y={seg.stampPos?.[1] ?? 800} at={b(seg.stampAt ?? 1.2)} to={to} size={[...seg.stamp].length > 3 ? 96 : 120} rot={-10} />}
              {seg.tab && seg.name && <Dossier tab={seg.tab} name={seg.name} from={from + 2} to={to} />}
              {seg.big && (
                <BigWords
                  words={[
                    {text: seg.big[0], at: from + 4},
                    {text: seg.big[1], at: b(0.9), color: '#FFE3A3'},
                  ]}
                  to={b(2.6)}
                  cy={760}
                  size={150}
                />
              )}
              {seg.id !== 'hook' && seg.cap && !seg.big && <CineSub text={seg.cap} from={from + 3} to={capTo} cy={CAP_Y} />}
              {seg.cap2 && <CineSub text={seg.cap2} from={b(seg.cap2At ?? 2.3)} to={to} cy={CAP_Y} />}
              {seg.inner && <CineSub text={`『${seg.inner}』`} label="もう一人の自分" color={SPY.teal} inner from={from + 4} to={to} cy={CAP_Y} />}
              {seg.say && <CineSub text={seg.say} label={seg.who} color={whoColor(seg.who)} from={sayFrom} to={to} cy={CAP_Y} />}
              {seg.big && seg.cap && <CineSub text={seg.cap} from={b(2.6)} to={to} cy={960} />}
              {seg.ask && <Ask text={seg.ask} from={b(3.2)} to={to} />}
              {seg.id !== 'hook' && <Dip at={from} />}
            </React.Fragment>
          );
        })}
        {spans[0].seg.title && <HookTitle title={spans[0].seg.title} chip={spans[0].seg.chip} to={spans[0].to} stampAt={spans[0].seg.stampPos} />}
        <Header series={S.header.series} episode={S.header.episode} item={0} since={0} dots={false} accent={SPY.red} />
      </AbsoluteFill>
    );
  };
  return {Comp, duration: cursor};
};
